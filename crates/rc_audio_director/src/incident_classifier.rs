//! Discrete physics incident classifier, cooldown filter, and `AudioOneShotSlotPod` emitter.
//!
//! Consolidates `WorldImpactAudioHandler.ts`, `IncidentAudioEngine.ts`,
//! `incidentEventAcousticPipeline.ts`, and `BallContactAudioClassifier` into WASM.

use rc_physics_sim::layout::{
    PhysicsEvent, PhysicsEventBuffer, MAX_CARS, MAX_EVENTS_PER_STEP, MAX_PADS,
};

use crate::{
    config_pod::AudioDirectorConfigPod,
    drivetrain_state::VehicleDrivetrainState,
    incident_modulation::{
        calibrate_car_ball_hit, calibrate_car_bump, calibrate_goalpost_ping,
        calibrate_world_surface, ms_to_ticks_120hz, select_non_repeating_variant,
    },
    pod_types::{edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod},
    vehicle_incident_cues::{
        dispatch_car_action_incident, emit_modulated_one_shot, emit_spatial_one_shot,
    },
};

pub use crate::{
    incident_modulation::{
        categories, classify_ball_hit_surface, cooldown_ticks, event_codes, slot_priority,
        surface_subtypes,
    },
    vehicle_incident_cues::step_vehicle_landing_impacts,
};

/// Drains unread `PhysicsEvent` entries from `PhysicsEventBuffer`, applies cooldowns and spatial modulation,
/// updates `one_shot_edge_mask_lo`/`hi`, and populates `AudioFrameCuePod::one_shots`.
#[allow(clippy::too_many_arguments)]
pub fn process_physics_incidents(
    event_buffer: &PhysicsEventBuffer,
    last_event_read_seq: &mut u32,
    last_ball_world_hit_tick: &mut u32,
    last_goalpost_hit_tick: &mut u32,
    last_car_ball_hit_tick: &mut u32,
    last_car_bump_global_tick: &mut u32,
    last_goal_scored_tick: &mut u32,
    last_pad_pickup_tick: &mut [u32; MAX_PADS],
    last_car_demo_tick: &mut [u32; MAX_CARS],
    drivetrains: &mut [VehicleDrivetrainState; MAX_CARS],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    rng_state: &mut u32,
    cue: &mut AudioFrameCuePod,
) {
    let write_seq = event_buffer.write_seq;
    let capacity = (event_buffer.capacity as usize)
        .clamp(16, MAX_EVENTS_PER_STEP)
        .min(MAX_EVENTS_PER_STEP) as u32;

    if *last_event_read_seq > write_seq {
        *last_event_read_seq = 0;
    }
    let available = write_seq.saturating_sub(*last_event_read_seq);
    if available == 0 {
        return;
    }
    if available > capacity {
        *last_event_read_seq = write_seq - capacity;
    }

    let active_car = listener.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as u32;

    while *last_event_read_seq < write_seq {
        let slot_idx = (*last_event_read_seq % capacity) as usize;
        *last_event_read_seq = last_event_read_seq.wrapping_add(1);
        let ev = &event_buffer.events[slot_idx];
        dispatch_single_physics_event(
            ev,
            active_car,
            last_ball_world_hit_tick,
            last_goalpost_hit_tick,
            last_car_ball_hit_tick,
            last_car_bump_global_tick,
            last_goal_scored_tick,
            last_pad_pickup_tick,
            last_car_demo_tick,
            drivetrains,
            listener,
            cfg,
            rng_state,
            cue,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn dispatch_single_physics_event(
    ev: &PhysicsEvent,
    active_car: u32,
    last_ball_world_hit_tick: &mut u32,
    last_goalpost_hit_tick: &mut u32,
    last_car_ball_hit_tick: &mut u32,
    last_car_bump_global_tick: &mut u32,
    last_goal_scored_tick: &mut u32,
    last_pad_pickup_tick: &mut [u32; MAX_PADS],
    last_car_demo_tick: &mut [u32; MAX_CARS],
    drivetrains: &mut [VehicleDrivetrainState; MAX_CARS],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    rng_state: &mut u32,
    cue: &mut AudioFrameCuePod,
) {
    let raw_type = ev.event_type;
    let tick = ev.tick.max(1);
    let pos_uu = [ev.pos_x, ev.pos_y, ev.pos_z];
    let primary_id = ev.packed_ids & 0xFFFF;
    let secondary_id = (ev.packed_ids >> 16) & 0xFFFF;

    match raw_type {
        event_codes::CAR_BALL_HIT => {
            let cooldown = ms_to_ticks_120hz(cfg.car_ball_hit_cooldown_ms);
            if *last_car_ball_hit_tick > 0 && tick.saturating_sub(*last_car_ball_hit_tick) < cooldown
            {
                return;
            }
            let threshold = cfg.car_ball_hit_impulse_threshold.max(0.0);
            let metric = ev.impulse.max(ev.speed.abs());
            if metric < threshold {
                return;
            }
            *last_car_ball_hit_tick = tick;

            let car_idx = if primary_id < MAX_CARS as u32 {
                primary_id
            } else {
                0xFFFF
            };
            let m = calibrate_car_ball_hit(
                metric,
                threshold,
                (ev.flags & (1 << 1)) != 0,
                car_idx == active_car,
            );
            let variant = select_non_repeating_variant(rng_state, 4, 0xFF);
            emit_modulated_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::CAR_BALL_HIT,
                ev.sub_type,
                car_idx,
                variant,
                cfg.car_ball_hit_volume * cfg.ball_collision_volume,
                &m,
            );
        }

        event_codes::CAR_CAR_BUMP => {
            if *last_car_bump_global_tick > 0
                && tick.saturating_sub(*last_car_bump_global_tick)
                    < cooldown_ticks::CAR_CAR_BUMP_GLOBAL
            {
                return;
            }
            *last_car_bump_global_tick = tick;

            let rel_speed = ev.speed.abs().max(ev.impulse.abs());
            let m = calibrate_car_bump(
                rel_speed,
                primary_id == active_car || secondary_id == active_car,
            );
            let variant = select_non_repeating_variant(rng_state, 6, 0xFF);
            let car_idx = if primary_id < MAX_CARS as u32 {
                primary_id
            } else {
                0xFFFF
            };
            emit_modulated_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::CAR_CAR_BUMP,
                secondary_id,
                car_idx,
                variant,
                cfg.car_car_collision_volume,
                &m,
            );
        }

        event_codes::CAR_CAR_DEMO => {
            let victim = if secondary_id < MAX_CARS as u32 {
                secondary_id as usize
            } else if primary_id < MAX_CARS as u32 {
                primary_id as usize
            } else {
                0
            };
            if last_car_demo_tick[victim] > 0
                && tick.saturating_sub(last_car_demo_tick[victim]) < cooldown_ticks::CAR_CAR_DEMO
            {
                return;
            }
            last_car_demo_tick[victim] = tick;
            let variant = select_non_repeating_variant(rng_state, 5, 0xFF);
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::CAR_CAR_DEMO,
                secondary_id,
                victim as u32,
                slot_priority::DEMOLISH,
                variant,
                false,
                cfg.car_demo_volume,
                1.0,
                1.0,
                1.0,
                categories::DEMOLISH,
            );
        }

        event_codes::BALL_WORLD_HIT | event_codes::BALL_GOALPOST_HIT => {
            let surface_tag = if ev.sub_type != 0 {
                ev.sub_type
            } else {
                classify_ball_hit_surface(
                    ev.pos_x,
                    ev.pos_y,
                    ev.pos_z,
                    ev.norm_x,
                    ev.norm_y,
                    ev.norm_z,
                    raw_type == event_codes::BALL_GOALPOST_HIT,
                )
            };

            let is_goalpost_or_crossbar = raw_type == event_codes::BALL_GOALPOST_HIT
                || surface_tag == surface_subtypes::GOALPOST
                || surface_tag == surface_subtypes::CROSSBAR;

            if is_goalpost_or_crossbar {
                let cooldown = ms_to_ticks_120hz(cfg.goalpost_hit_cooldown_ms);
                if *last_goalpost_hit_tick > 0
                    && tick.saturating_sub(*last_goalpost_hit_tick) < cooldown
                {
                    return;
                }
                let threshold = cfg.goalpost_hit_threshold.max(0.0);
                let impact_val = ev.normal_rel_vel.abs().max(ev.impulse.abs()).max(ev.speed.abs());
                if impact_val < threshold {
                    return;
                }
                *last_goalpost_hit_tick = tick;

                let (m, is_ping_large) =
                    calibrate_goalpost_ping(ev.speed.abs().max(impact_val), threshold);
                let post_vol = if is_ping_large {
                    cue.one_shot_edge_mask_hi |= 1u32 << edge_mask_bits::BALL_GOALPOST_LARGE_BIT;
                    cfg.goalpost_hit_volume
                } else {
                    cfg.goalpost_small_hit_volume
                };
                let variant = select_non_repeating_variant(rng_state, 6, 0xFF);
                emit_modulated_one_shot(
                    cue,
                    listener,
                    cfg,
                    pos_uu,
                    event_codes::BALL_GOALPOST_HIT,
                    surface_tag,
                    0xFFFF,
                    variant,
                    post_vol * cfg.ball_collision_volume,
                    &m,
                );
                return;
            }

            let cooldown = ms_to_ticks_120hz(cfg.incident_cooldown_ms);
            if *last_ball_world_hit_tick > 0
                && tick.saturating_sub(*last_ball_world_hit_tick) < cooldown
            {
                return;
            }

            let is_floor = surface_tag == surface_subtypes::FLOOR;
            let threshold = if is_floor {
                cfg.ball_ground_hit_threshold.max(0.0)
            } else {
                cfg.ball_wall_hit_threshold.max(0.0)
            };
            let normal_vel = if ev.normal_rel_vel.is_finite() && ev.normal_rel_vel > 0.0 {
                ev.normal_rel_vel.abs()
            } else {
                ev.speed.abs()
            };
            if normal_vel < threshold {
                return;
            }
            *last_ball_world_hit_tick = tick;

            let (m, pool_len) = calibrate_world_surface(normal_vel, threshold, surface_tag);
            let surface_vol = if is_floor {
                cue.one_shot_edge_mask_hi |= 1u32 << edge_mask_bits::BALL_FLOOR_HIT_BIT;
                cfg.ball_floor_hit_volume
            } else if pool_len == 5 {
                cue.one_shot_edge_mask_hi |= 1u32 << edge_mask_bits::BALL_WALL_NET_HIT_BIT;
                cfg.ball_net_hit_volume
            } else {
                cfg.ball_ramp_hit_volume
            };
            let variant = select_non_repeating_variant(rng_state, pool_len, 0xFF);
            emit_modulated_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::BALL_WORLD_HIT,
                surface_tag,
                0xFFFF,
                variant,
                surface_vol * cfg.ball_collision_volume,
                &m,
            );
        }

        event_codes::BOOST_PICKUP => {
            let pad_idx = (secondary_id as usize).min(MAX_PADS - 1);
            if last_pad_pickup_tick[pad_idx] > 0
                && tick.saturating_sub(last_pad_pickup_tick[pad_idx])
                    < cooldown_ticks::BOOST_PICKUP_PER_PAD
            {
                return;
            }
            last_pad_pickup_tick[pad_idx] = tick;

            let car_idx = if primary_id < MAX_CARS as u32 {
                primary_id
            } else {
                0xFFFF
            };
            let is_self = car_idx == active_car;
            let is_big = ev.sub_type == 1 || pad_idx < 6;
            let (vol_mult, radius_scale, playback_rate, priority, intensity) = if is_self {
                (
                    if is_big { 1.05 } else { 0.92 },
                    1.0,
                    if is_big { 0.98 } else { 1.04 },
                    if is_big {
                        slot_priority::BOOST_PICKUP_SELF_BIG
                    } else {
                        slot_priority::BOOST_PICKUP_SELF_SMALL
                    },
                    0.0,
                )
            } else {
                (
                    if is_big { 0.85 } else { 0.62 },
                    if is_big { 1.05 } else { 0.68 },
                    if is_big { 0.97 } else { 1.05 },
                    slot_priority::BOOST_PICKUP_OTHER,
                    if is_big { 0.85 } else { 0.45 },
                )
            };
            let self_vol = if is_self { cfg.vehicle_self_volume } else { 1.0 };
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::BOOST_PICKUP,
                u32::from(is_big),
                car_idx,
                priority,
                0,
                is_self,
                cfg.boost_collect_volume * cfg.boost_volume * self_vol * vol_mult,
                playback_rate,
                radius_scale,
                intensity,
                categories::BOOST_PICKUP,
            );
        }

        event_codes::GOAL_SCORED => {
            if *last_goal_scored_tick > 0
                && tick.saturating_sub(*last_goal_scored_tick) < cooldown_ticks::GOAL_SCORED
            {
                return;
            }
            *last_goal_scored_tick = tick;
            cue.one_shot_edge_mask_hi |= 1u32 << edge_mask_bits::GOAL_EXPLOSION_BIT;
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::GOAL_SCORED,
                ev.sub_type,
                0xFFFF,
                slot_priority::GOAL_EXPLOSION,
                0,
                false,
                cfg.goal_scored_volume,
                1.0,
                1.0,
                1.0,
                categories::GOAL_EXPLOSION,
            );
        }

        _ => dispatch_car_action_incident(
            raw_type,
            ev,
            tick,
            primary_id,
            active_car,
            pos_uu,
            drivetrains,
            listener,
            cfg,
            rng_state,
            cue,
        ),
    }
}
