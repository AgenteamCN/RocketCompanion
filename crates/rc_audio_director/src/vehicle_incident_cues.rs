//! Vehicle action one-shot cues (jump, double-jump, dodge, boost start/stop, supersonic enter,
//! flip reset) and airborne-to-ground wheel landing impact synthesis.

use rc_physics_sim::layout::{CarStatePod, PhysicsEvent, MAX_CARS};

use crate::{
    config_pod::AudioDirectorConfigPod,
    drivetrain_state::VehicleDrivetrainState,
    incident_modulation::{
        categories, cooldown_ticks, event_codes, listener_distance_and_atten,
        pack_priority_variant, push_one_shot_slot, select_non_repeating_variant, smoothstep01,
        IncidentModulationParams,
    },
    pod_types::{
        edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod, AudioOneShotSlotPod,
    },
};

/// Emits a spatialized world or vehicle one-shot into `AudioFrameCuePod::one_shots` if within audible distance.
#[allow(clippy::too_many_arguments)]
pub fn emit_spatial_one_shot(
    cue: &mut AudioFrameCuePod,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    pos_uu: [f32; 3],
    event_type: u32,
    sub_type: u32,
    car_index: u32,
    priority: u32,
    variant: u32,
    is_self: bool,
    base_gain: f32,
    playback_rate: f32,
    radius_scale: f32,
    pan_or_intensity: f32,
    category_index: u32,
) {
    let (dist_atten, culled) = if is_self {
        (1.0, false)
    } else {
        listener_distance_and_atten(pos_uu, listener, cfg, category_index, radius_scale)
    };
    if culled {
        return;
    }
    let final_gain = (base_gain * cfg.master_volume * dist_atten).clamp(0.0, 5.0);
    push_one_shot_slot(
        cue,
        AudioOneShotSlotPod {
            event_type,
            sub_type,
            car_index,
            priority_and_variant: pack_priority_variant(priority, variant, is_self),
            final_gain,
            playback_rate,
            distance_radius_scale: radius_scale,
            pan_or_intensity,
            audio_pos_meters: [pos_uu[0] * 0.01, pos_uu[2] * 0.01, pos_uu[1] * 0.01],
            category_index,
        },
    );
}

/// Emits a kinetic-modulated world or collision one-shot into `AudioFrameCuePod::one_shots`.
#[allow(clippy::too_many_arguments)]
pub fn emit_modulated_one_shot(
    cue: &mut AudioFrameCuePod,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    pos_uu: [f32; 3],
    event_type: u32,
    sub_type: u32,
    car_index: u32,
    variant: u32,
    category_gain: f32,
    m: &IncidentModulationParams,
) {
    emit_spatial_one_shot(
        cue,
        listener,
        cfg,
        pos_uu,
        event_type,
        sub_type,
        car_index,
        m.priority,
        variant,
        false,
        category_gain * m.vol_mult,
        m.playback_rate,
        m.radius_scale,
        m.intensity,
        m.category_idx,
    );
}

/// Calibrates and emits a vehicle wheel landing impact (`0x12`) when a car transitions from airborne to grounded.
#[allow(clippy::too_many_arguments)]
pub fn step_vehicle_landing_impacts(
    drivetrains: &mut [VehicleDrivetrainState; MAX_CARS],
    cars_state: &[CarStatePod; MAX_CARS],
    current_tick: u32,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    rng_state: &mut u32,
    cue: &mut AudioFrameCuePod,
) {
    let active_car = listener.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
    let num_cars = listener.effective_num_cars.clamp(0, MAX_CARS as i32) as usize;

    for i in 0..num_cars {
        let car = &cars_state[i];
        if car.is_demoed > 0.0 {
            continue;
        }
        let dt_st = &mut drivetrains[i];
        let any_wheel_contact = car.wheels.iter().any(|w| w.has_contact >= 0.5);
        let is_grounded_now = car.is_on_ground >= 0.5 || any_wheel_contact;

        if !is_grounded_now {
            dt_st.landing_was_grounded = false;
            dt_st.airborne_ticks = dt_st.airborne_ticks.saturating_add(1);
            let downward_vel = (-car.vel[2]).max(0.0);
            if downward_vel > dt_st.peak_downward_speed_uu {
                dt_st.peak_downward_speed_uu = downward_vel;
            }
            continue;
        }

        let triggered_speed = if !dt_st.landing_was_grounded
            && dt_st.airborne_ticks >= 6
            && dt_st.peak_downward_speed_uu >= 220.0
        {
            Some(dt_st.peak_downward_speed_uu)
        } else {
            None
        };

        dt_st.landing_was_grounded = true;
        dt_st.peak_downward_speed_uu = 0.0;
        dt_st.airborne_ticks = 0;

        let Some(downward_speed) = triggered_speed else {
            continue;
        };
        if dt_st.last_wheel_landing_tick > 0
            && current_tick.saturating_sub(dt_st.last_wheel_landing_tick)
                < cooldown_ticks::WHEEL_LANDING_PER_CAR
        {
            continue;
        }
        dt_st.last_wheel_landing_tick = current_tick;
        cue.one_shot_edge_mask_hi |= 1u32 << (edge_mask_bits::CAR_WHEEL_LANDING_BASE + i as u32);

        let is_self = i == active_car;
        let intensity = smoothstep01((downward_speed - 180.0) / 1350.0);
        let vol_mult =
            ((0.45 + 0.60 * intensity) * if is_self { 1.0 } else { 0.88 }).clamp(0.35, 1.15);
        let radius_scale = (0.70 + 0.45 * intensity).clamp(0.65, 1.20);
        let playback_rate = (0.94 + 0.12 * (1.0 - 0.5 * intensity)).clamp(0.92, 1.08);
        let self_vol = if is_self { cfg.vehicle_self_volume } else { 1.0 };
        let variant = select_non_repeating_variant(rng_state, 4, 0xFF);

        emit_spatial_one_shot(
            cue,
            listener,
            cfg,
            car.pos,
            event_codes::WHEEL_IMPACT,
            0,
            i as u32,
            if is_self { 4 } else { 2 },
            variant,
            is_self,
            cfg.wheel_impact_volume * self_vol * vol_mult,
            playback_rate,
            radius_scale,
            intensity,
            categories::WHEEL_LANDING,
        );
    }
}

/// Dispatches discrete car action events (jump, double jump, dodge, boost start/stop, supersonic, flip reset).
#[allow(clippy::too_many_arguments)]
pub fn dispatch_car_action_incident(
    raw_type: u32,
    ev: &PhysicsEvent,
    tick: u32,
    primary_id: u32,
    active_car: u32,
    pos_uu: [f32; 3],
    drivetrains: &mut [VehicleDrivetrainState; MAX_CARS],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    rng_state: &mut u32,
    cue: &mut AudioFrameCuePod,
) {
    let car_idx = (primary_id as usize).min(MAX_CARS - 1);
    let is_self = car_idx as u32 == active_car;
    let self_vol = if is_self { cfg.vehicle_self_volume } else { 1.0 };

    match raw_type {
        event_codes::CAR_JUMP
        | event_codes::CAR_DOUBLE_JUMP
        | event_codes::CAR_DODGE
        | event_codes::CAR_ACTION => {
            let resolved_type = if raw_type == event_codes::CAR_ACTION {
                match ev.sub_type {
                    1 => event_codes::CAR_JUMP,
                    2 => event_codes::CAR_DOUBLE_JUMP,
                    3 => event_codes::CAR_DODGE,
                    _ => return,
                }
            } else {
                raw_type
            };
            let dt_st = &mut drivetrains[car_idx];
            if dt_st.last_jump_tick > 0
                && tick.saturating_sub(dt_st.last_jump_tick) < cooldown_ticks::JUMP_ACTION_PER_CAR
            {
                return;
            }
            dt_st.last_jump_tick = tick;

            let (bit_base, action_vol) = match resolved_type {
                event_codes::CAR_JUMP => (edge_mask_bits::CAR_JUMP_BASE, cfg.jump_volume),
                event_codes::CAR_DOUBLE_JUMP => {
                    (edge_mask_bits::CAR_DOUBLE_JUMP_BASE, cfg.double_jump_volume)
                }
                _ => (edge_mask_bits::CAR_DODGE_BASE, cfg.dodge_volume),
            };
            cue.one_shot_edge_mask_lo |= 1u32 << (bit_base + car_idx as u32);
            let variant = select_non_repeating_variant(rng_state, 4, 0xFF);
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                resolved_type,
                ev.sub_type,
                car_idx as u32,
                if is_self { 5 } else { 3 },
                variant,
                is_self,
                action_vol * self_vol,
                1.0,
                1.0,
                0.0,
                categories::JUMP_DODGE_OTHER,
            );
        }

        event_codes::CAR_BOOST_START => {
            let dt_st = &mut drivetrains[car_idx];
            if dt_st.last_boost_tick > 0
                && tick.saturating_sub(dt_st.last_boost_tick) < cooldown_ticks::BOOST_EDGE_PER_CAR
            {
                return;
            }
            dt_st.last_boost_tick = tick;
            cue.one_shot_edge_mask_lo |=
                1u32 << (edge_mask_bits::CAR_BOOST_START_BASE + car_idx as u32);
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::CAR_BOOST_START,
                0,
                car_idx as u32,
                if is_self { 5 } else { 3 },
                0,
                is_self,
                cfg.boost_start_volume * cfg.boost_volume * self_vol,
                1.0,
                1.0,
                0.0,
                categories::BOOST_OTHER,
            );
        }

        event_codes::CAR_BOOST_STOP => {
            cue.one_shot_edge_mask_hi |=
                1u32 << (edge_mask_bits::CAR_BOOST_STOP_BASE + car_idx as u32);
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::CAR_BOOST_STOP,
                0,
                car_idx as u32,
                if is_self { 4 } else { 2 },
                0,
                is_self,
                cfg.boost_release_volume * cfg.boost_volume * self_vol * 0.8,
                1.0,
                0.85,
                0.0,
                categories::BOOST_OTHER,
            );
        }

        event_codes::CAR_SUPERSONIC_ENTER => {
            let dt_st = &mut drivetrains[car_idx];
            if dt_st.last_supersonic_tick > 0
                && tick.saturating_sub(dt_st.last_supersonic_tick)
                    < cooldown_ticks::SUPERSONIC_ENTER_PER_CAR
            {
                return;
            }
            dt_st.last_supersonic_tick = tick;
            cue.one_shot_edge_mask_hi |=
                1u32 << (edge_mask_bits::CAR_SUPERSONIC_ENTER_BASE + car_idx as u32);
            let variant = select_non_repeating_variant(rng_state, 3, 0xFF);
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::CAR_SUPERSONIC_ENTER,
                0,
                car_idx as u32,
                if is_self { 5 } else { 3 },
                variant,
                is_self,
                cfg.supersonic_enter_volume * self_vol,
                1.0,
                1.0,
                0.0,
                categories::SUPERSONIC_OTHER,
            );
        }

        event_codes::FLIP_RESET_GAINED => {
            let is_ball_reset = ev.sub_type == 1 || ((ev.flags >> 4) & 0xF) == 1;
            if !is_ball_reset {
                return;
            }
            let dt_st = &mut drivetrains[car_idx];
            if dt_st.last_flip_reset_tick > 0
                && tick.saturating_sub(dt_st.last_flip_reset_tick)
                    < cooldown_ticks::FLIP_RESET_PER_CAR
            {
                return;
            }
            dt_st.last_flip_reset_tick = tick;
            emit_spatial_one_shot(
                cue,
                listener,
                cfg,
                pos_uu,
                event_codes::FLIP_RESET_GAINED,
                ev.sub_type,
                car_idx as u32,
                if is_self { 6 } else { 4 },
                0,
                is_self,
                cfg.flip_reset_volume * self_vol,
                1.0,
                1.0,
                1.0,
                categories::FLIP_RESET_OTHER,
            );
        }

        _ => {}
    }
}
