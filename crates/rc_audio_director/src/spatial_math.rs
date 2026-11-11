//! Non-linear spatial distance attenuation curves (Linear, Smoothstep, Power, Cubic-Bezier,
//! Inverse), Doppler pitch shift, stereo panning, and continuous vehicle loop smoothing.

use rc_physics_sim::layout::{CarControlsPod, CarStatePod, PhysicsEvent};

use crate::{
    config_pod::{AttenuationProfilePod, AudioDirectorConfigPod},
    drivetrain_state::VehicleDrivetrainState,
    pod_types::{
        edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod, AudioOneShotSlotPod,
        CarAcousticLoopPod, AUDIO_ATTENUATION_CATEGORY_COUNT, MAX_AUDIO_ONE_SHOT_SLOTS,
    },
};

pub mod attenuation_categories {
    pub const DEMOLISH: usize = 0;
    pub const GOAL_EXPLOSION: usize = 1;
    pub const GOALPOST_PING_LARGE: usize = 2;
    pub const CAR_BALL_HIT: usize = 3;
    pub const CAR_BUMP: usize = 4;
    pub const GOALPOST_PING_SMALL: usize = 5;
    pub const BOOST_OTHER: usize = 6;
    pub const JUMP_DODGE_OTHER: usize = 7;
    pub const SUPERSONIC_OTHER: usize = 8;
    pub const FLIP_RESET_OTHER: usize = 9;
    pub const ENGINE_OTHER: usize = 10;
    pub const WORLD_SURFACE: usize = 11;
    pub const BOOST_PICKUP: usize = 12;
    pub const WHEEL_LANDING: usize = 13;
    pub const BALL_ROLLING: usize = 14;
    pub const BALL_FLYING: usize = 15;
}

pub const SPEED_OF_SOUND_UU_PER_SEC: f32 = 34_300.0;

#[inline]
pub fn uu_to_audio_meters(pos_uu: [f32; 3]) -> [f32; 3] {
    [pos_uu[0] * 0.01, pos_uu[2] * 0.01, pos_uu[1] * 0.01]
}

/// Solves a 1D Cubic-Bezier curve `y(x)` for `x` in `[0.0, 1.0]` with `P1=(x1,y1)`, `P2=(x2,y2)`.
pub fn solve_cubic_bezier(x: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let cx = 3.0 * x1;
    let bx = 3.0 * (x2 - x1) - cx;
    let ax = 1.0 - cx - bx;
    let cy = 3.0 * y1;
    let by = 3.0 * (y2 - y1) - cy;
    let ay = 1.0 - cy - by;

    let sample_x = |t: f32| ((ax * t + bx) * t + cx) * t;
    let sample_y = |t: f32| ((ay * t + by) * t + cy) * t;
    let deriv_x = |t: f32| (3.0 * ax * t + 2.0 * bx) * t + cx;

    let mut t2 = x;
    for _ in 0..8 {
        let x_est = sample_x(t2) - x;
        let d2 = deriv_x(t2);
        if x_est.abs() < 1e-6 || d2.abs() < 1e-6 {
            break;
        }
        t2 -= x_est / d2;
    }

    if !(0.0..=1.0).contains(&t2) || t2.is_nan() {
        let (mut t0, mut t1) = (0.0f32, 1.0f32);
        t2 = x;
        for _ in 0..12 {
            let x_est = sample_x(t2);
            if (x_est - x).abs() < 1e-6 {
                break;
            }
            if x > x_est {
                t0 = t2;
            } else {
                t1 = t2;
            }
            t2 = 0.5 * (t1 - t0) + t0;
        }
    }
    sample_y(t2).clamp(0.0, 1.0)
}

pub fn evaluate_normalized_attenuation_curve(t: f32, profile: &AttenuationProfilePod) -> f32 {
    if t <= 0.0 {
        return 1.0;
    }
    if t >= 1.0 {
        return 0.0;
    }
    match profile.curve_type {
        0 => 1.0 - t,
        1 => 1.0 - t * t * (3.0 - 2.0 * t),
        2 => {
            let p = if profile.curve_exponent.is_finite() && profile.curve_exponent > 0.0 {
                profile.curve_exponent
            } else {
                1.0
            };
            (1.0 - t).max(0.0).powf(p)
        }
        3 => {
            let [x1, y1, x2, y2] = profile.bezier_x1_y1_x2_y2;
            (1.0 - solve_cubic_bezier(t, x1, y1, x2, y2)).clamp(0.0, 1.0)
        }
        4 => {
            let k = 3.0f32;
            let inv_max = 1.0 / (1.0 + k);
            ((1.0 / (1.0 + k * t) - inv_max) / (1.0 - inv_max)).max(0.0)
        }
        _ => 1.0 - t * t * (3.0 - 2.0 * t),
    }
}

pub fn is_profile_distance_culled(
    distance_uu: f32,
    profile: &AttenuationProfilePod,
    arena_scale: f32,
    distance_radius_scale: f32,
) -> bool {
    if !distance_uu.is_finite() {
        return false;
    }
    let scale = if distance_radius_scale.is_finite() && distance_radius_scale > 0.0 {
        distance_radius_scale.clamp(0.25, 3.0)
    } else {
        1.0
    };
    let max_dist = profile.max_distance_uu * arena_scale.clamp(0.25, 4.0);
    (profile.flags & 1) != 0 && profile.min_gain_floor <= 1e-5 && (distance_uu / scale) >= max_dist
}

pub fn evaluate_profile_distance_gain(
    distance_uu: f32,
    profile: &AttenuationProfilePod,
    arena_scale: f32,
    distance_radius_scale: f32,
) -> f32 {
    let acoustic_scale = arena_scale.clamp(0.25, 4.0);
    let min_dist = profile.min_distance_uu * acoustic_scale;
    let max_dist = profile.max_distance_uu * acoustic_scale;
    let scale = if distance_radius_scale.is_finite() && distance_radius_scale > 0.0 {
        distance_radius_scale.clamp(0.25, 3.0)
    } else {
        1.0
    };
    let effective_dist = distance_uu / scale;
    if !effective_dist.is_finite() || effective_dist <= min_dist {
        return 1.0;
    }
    let min_floor = profile.min_gain_floor.clamp(0.0, 1.0);
    if effective_dist >= max_dist {
        return if (profile.flags & 1) != 0 && min_floor <= 1e-5 {
            0.0
        } else {
            min_floor
        };
    }
    let t = ((effective_dist - min_dist) / (max_dist - min_dist).max(1e-3)).clamp(0.0, 1.0);
    min_floor + (1.0 - min_floor) * evaluate_normalized_attenuation_curve(t, profile)
}

#[inline]
pub fn evaluate_category_distance_gain(
    distance_uu: f32,
    category_index: usize,
    cfg: &AudioDirectorConfigPod,
    distance_radius_scale: f32,
) -> f32 {
    let idx = if category_index < AUDIO_ATTENUATION_CATEGORY_COUNT {
        category_index
    } else {
        attenuation_categories::CAR_BALL_HIT
    };
    evaluate_profile_distance_gain(
        distance_uu,
        &cfg.attenuation_profiles[idx],
        cfg.arena_acoustic_scale,
        distance_radius_scale,
    )
}

pub fn solve_iso_gain_radius_uu(
    profile: &AttenuationProfilePod,
    arena_scale: f32,
    target_gain: f32,
) -> f32 {
    let acoustic_scale = arena_scale.clamp(0.25, 4.0);
    let (mut low, mut high) = (
        profile.min_distance_uu * acoustic_scale,
        profile.max_distance_uu * acoustic_scale,
    );
    if target_gain >= 1.0 {
        return low;
    }
    if target_gain <= profile.min_gain_floor {
        return high;
    }
    for _ in 0..16 {
        let mid = 0.5 * (low + high);
        if evaluate_profile_distance_gain(mid, profile, acoustic_scale, 1.0) > target_gain {
            low = mid;
        } else {
            high = mid;
        }
    }
    0.5 * (low + high)
}

pub fn compute_spatial_stereo_pan(source_pos_uu: [f32; 3], listener: &AudioListenerStatePod) -> f32 {
    let dx = source_pos_uu[0] - listener.pos_uu[0];
    let dy = source_pos_uu[1] - listener.pos_uu[1];
    let dz = source_pos_uu[2] - listener.pos_uu[2];
    let dist_sq = dx * dx + dy * dy + dz * dz;
    if dist_sq < 1.0 {
        return 0.0;
    }
    let inv = dist_sq.sqrt().recip();
    let dir = [dx * inv, dz * inv, dy * inv];
    let (f, u) = (listener.forward_audio, listener.up_audio);
    let rx = f[1] * u[2] - f[2] * u[1];
    let ry = f[2] * u[0] - f[0] * u[2];
    let rz = f[0] * u[1] - f[1] * u[0];
    let r_len = (rx * rx + ry * ry + rz * rz).sqrt();
    if r_len < 1e-4 {
        return 0.0;
    }
    ((dir[0] * rx + dir[1] * ry + dir[2] * rz) / r_len).clamp(-1.0, 1.0)
}

pub fn compute_doppler_pitch_shift(
    source_pos_uu: [f32; 3],
    source_vel_uu: [f32; 3],
    listener: &AudioListenerStatePod,
    doppler_scale: f32,
) -> f32 {
    let scale = doppler_scale.clamp(0.0, 2.0);
    if scale <= 1e-4 {
        return 1.0;
    }
    let dx = source_pos_uu[0] - listener.pos_uu[0];
    let dy = source_pos_uu[1] - listener.pos_uu[1];
    let dz = source_pos_uu[2] - listener.pos_uu[2];
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if dist < 25.0 {
        return 1.0;
    }
    let rvx = source_vel_uu[0] - listener.vel_uu[0];
    let rvy = source_vel_uu[1] - listener.vel_uu[1];
    let rvz = source_vel_uu[2] - listener.vel_uu[2];
    let radial_vel = (rvx * dx + rvy * dy + rvz * dz) / dist;
    (1.0 - (radial_vel / SPEED_OF_SOUND_UU_PER_SEC) * scale * 4.5).clamp(0.75, 1.35)
}

#[inline]
pub fn exp_smooth(current: f32, target: f32, dt_sec: f32, tau_sec: f32) -> f32 {
    let next = current + (target - current) * (1.0 - (-dt_sec / tau_sec.max(0.005)).exp());
    if (target - next).abs() <= 1e-4 {
        target
    } else {
        next
    }
}

#[allow(clippy::too_many_arguments)]
pub fn step_vehicle_spatial_and_loops(
    car_idx: usize,
    is_primary: bool,
    dt_state: &mut VehicleDrivetrainState,
    car: &CarStatePod,
    ctrl: &CarControlsPod,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    current_tick: u32,
    out_car: &mut CarAcousticLoopPod,
    cue_pod: &mut AudioFrameCuePod,
) {
    let dt = listener.dt_sec.clamp(0.0005, 0.1);
    let is_demoed = car.is_demoed > 0.0;
    let is_audible = (listener.flags & 1) != 0;
    let has_listener = (listener.flags & 2) != 0;

    let dist_uu = if is_primary || !has_listener {
        0.0
    } else {
        let dx = car.pos[0] - listener.pos_uu[0];
        let dy = car.pos[1] - listener.pos_uu[1];
        let dz = car.pos[2] - listener.pos_uu[2];
        (dx * dx + dy * dy + dz * dz).sqrt()
    };
    out_car.distance_uu = dist_uu;
    if is_primary || !has_listener {
        out_car.spatial_pan = 0.0;
        out_car.doppler_pitch = 1.0;
    } else {
        out_car.spatial_pan = compute_spatial_stereo_pan(car.pos, listener);
        out_car.doppler_pitch =
            compute_doppler_pitch_shift(car.pos, car.vel, listener, cfg.doppler_scale);
    }

    let base_mult = cfg.master_volume * if is_primary { cfg.vehicle_self_volume } else { 1.0 };
    let atten_for = |cat: usize| -> (bool, f32) {
        let prof = &cfg.attenuation_profiles[cat];
        let culled = !is_primary
            && has_listener
            && is_profile_distance_culled(dist_uu, prof, cfg.arena_acoustic_scale, 1.0);
        let att = if is_primary || !has_listener {
            1.0
        } else if culled {
            0.0
        } else {
            evaluate_profile_distance_gain(dist_uu, prof, cfg.arena_acoustic_scale, 1.0)
        };
        (culled, att)
    };

    let (boost_culled, boost_atten) = atten_for(attenuation_categories::BOOST_OTHER);
    let target_boost = if car.is_boosting >= 0.5 && !is_demoed && is_audible && !boost_culled {
        cfg.boost_loop_volume * cfg.boost_volume * base_mult * boost_atten
    } else {
        0.0
    };
    dt_state.smoothed_boost_gain = exp_smooth(dt_state.smoothed_boost_gain, target_boost, dt, 0.035);
    out_car.boost_gain = dt_state.smoothed_boost_gain;
    out_car.boost_pitch = out_car.doppler_pitch;

    let (super_culled, super_atten) = atten_for(attenuation_categories::SUPERSONIC_OTHER);
    let target_super = if car.is_supersonic >= 0.5 && !is_demoed && is_audible && !super_culled {
        cfg.supersonic_loop_volume * base_mult * super_atten
    } else {
        0.0
    };
    dt_state.smoothed_supersonic_gain =
        exp_smooth(dt_state.smoothed_supersonic_gain, target_super, dt, 0.05);
    out_car.supersonic_gain = dt_state.smoothed_supersonic_gain;

    let is_grounded = car.is_on_ground >= 0.5
        || car.wheels[0].has_contact >= 0.5
        || car.wheels[1].has_contact >= 0.5
        || car.wheels[2].has_contact >= 0.5
        || car.wheels[3].has_contact >= 0.5;
    let speed_uu =
        (car.vel[0] * car.vel[0] + car.vel[1] * car.vel[1] + car.vel[2] * car.vel[2]).sqrt();
    let lat_speed =
        (car.vel[0] * car.right[0] + car.vel[1] * car.right[1] + car.vel[2] * car.right[2]).abs();

    out_car.skid_gain = if !is_demoed && is_audible && is_grounded && ctrl.handbrake >= 0.5 {
        ((speed_uu * 0.65 + lat_speed * 0.85) / 1400.0).clamp(0.0, 1.0) * boost_atten
    } else {
        0.0
    };
    out_car.air_roll_gain = if !is_demoed && is_audible && !is_grounded {
        (ctrl.roll.abs() * 0.5).clamp(0.0, 1.0) * boost_atten
    } else {
        0.0
    };

    if !is_demoed && is_audible {
        if !is_grounded {
            dt_state.landing_was_grounded = false;
            dt_state.airborne_ticks = dt_state.airborne_ticks.saturating_add(1);
            dt_state.peak_downward_speed_uu = dt_state.peak_downward_speed_uu.max(-car.vel[2]);
        } else {
            if !dt_state.landing_was_grounded
                && dt_state.airborne_ticks >= 6
                && dt_state.peak_downward_speed_uu >= 220.0
                && current_tick.saturating_sub(dt_state.last_wheel_landing_tick) >= 17
            {
                dt_state.last_wheel_landing_tick = current_tick;
                cue_pod.one_shot_edge_mask_hi |=
                    1u32 << (edge_mask_bits::CAR_WHEEL_LANDING_BASE + car_idx as u32);
                emit_wheel_landing_one_shot(
                    car_idx,
                    is_primary,
                    dt_state.peak_downward_speed_uu,
                    car.pos,
                    dist_uu,
                    has_listener,
                    cfg,
                    cue_pod,
                );
            }
            dt_state.landing_was_grounded = true;
            dt_state.peak_downward_speed_uu = 0.0;
            dt_state.airborne_ticks = 0;
        }
    } else {
        dt_state.landing_was_grounded = is_grounded;
        dt_state.peak_downward_speed_uu = 0.0;
        dt_state.airborne_ticks = 0;
    }
}

pub fn process_vehicle_action_incident(
    ev: &PhysicsEvent,
    drivetrains: &mut [VehicleDrivetrainState],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    cue_pod: &mut AudioFrameCuePod,
) {
    let raw_car = (ev.packed_ids & 0xFFFF) as usize;
    if raw_car >= drivetrains.len() {
        return;
    }
    let test_audio = (listener.flags & (1 << 4)) != 0;
    if (raw_car == 6 || raw_car == 7) && !test_audio {
        return;
    }
    let active_car = listener.active_car_index.clamp(0, 7) as usize;
    if (listener.flags & (1 << 3)) != 0 && raw_car != active_car && raw_car != 6 && raw_car != 7 {
        return;
    }

    let c_bit = raw_car as u32;
    let dt_state = &mut drivetrains[raw_car];
    let tick = ev.tick;
    let _ = cfg;

    match ev.event_type {
        0x06 if tick == 0 || tick.saturating_sub(dt_state.last_jump_tick) >= 5 => {
            dt_state.last_jump_tick = tick;
            cue_pod.one_shot_edge_mask_lo |= 1u32 << (edge_mask_bits::CAR_JUMP_BASE + c_bit);
        }
        0x07 if tick == 0 || tick.saturating_sub(dt_state.last_air_jump_tick) >= 5 => {
            dt_state.last_air_jump_tick = tick;
            cue_pod.one_shot_edge_mask_lo |= 1u32 << (edge_mask_bits::CAR_DOUBLE_JUMP_BASE + c_bit);
        }
        0x08 if tick == 0 || tick.saturating_sub(dt_state.last_air_jump_tick) >= 5 => {
            dt_state.last_air_jump_tick = tick;
            cue_pod.one_shot_edge_mask_lo |= 1u32 << (edge_mask_bits::CAR_DODGE_BASE + c_bit);
        }
        0x09 if tick == 0 || tick.saturating_sub(dt_state.last_supersonic_tick) >= 30 => {
            dt_state.last_supersonic_tick = tick;
            cue_pod.one_shot_edge_mask_hi |=
                1u32 << (edge_mask_bits::CAR_SUPERSONIC_ENTER_BASE + c_bit);
        }
        0x0C if tick == 0 || tick.saturating_sub(dt_state.last_boost_tick) >= 5 => {
            dt_state.last_boost_tick = tick;
            dt_state.boost_latched = true;
            cue_pod.one_shot_edge_mask_lo |= 1u32 << (edge_mask_bits::CAR_BOOST_START_BASE + c_bit);
        }
        0x0D => {
            dt_state.boost_latched = false;
            cue_pod.one_shot_edge_mask_hi |= 1u32 << (edge_mask_bits::CAR_BOOST_STOP_BASE + c_bit);
        }
        0x0F => {
            let is_ball_reset = ev.sub_type == 1 || ((ev.flags >> 4) & 0x0F) == 1;
            if is_ball_reset && (tick == 0 || tick.saturating_sub(dt_state.last_flip_reset_tick) >= 60)
            {
                dt_state.last_flip_reset_tick = tick;
            }
        }
        _ => {}
    }
}

#[allow(clippy::too_many_arguments)]
fn emit_wheel_landing_one_shot(
    car_idx: usize,
    is_self: bool,
    downward_speed_uu: f32,
    car_pos_uu: [f32; 3],
    dist_uu: f32,
    has_listener: bool,
    cfg: &AudioDirectorConfigPod,
    cue_pod: &mut AudioFrameCuePod,
) {
    let slot_idx = cue_pod.one_shot_count as usize;
    if slot_idx >= MAX_AUDIO_ONE_SHOT_SLOTS {
        return;
    }
    let x = ((downward_speed_uu.abs() - 180.0) / 1350.0).clamp(0.0, 1.0);
    let intensity = x * x * (3.0 - 2.0 * x);
    let vol_mult = ((0.45 + 0.6 * intensity) * if is_self { 1.0 } else { 0.88 }).clamp(0.35, 1.15);
    let radius_scale = (0.7 + 0.45 * intensity).clamp(0.65, 1.2);
    let playback_rate = (0.94 + 0.12 * (1.0 - 0.5 * intensity)).clamp(0.92, 1.08);

    let profile = &cfg.attenuation_profiles[attenuation_categories::WHEEL_LANDING];
    if !is_self
        && has_listener
        && is_profile_distance_culled(dist_uu, profile, cfg.arena_acoustic_scale, radius_scale)
    {
        return;
    }
    let dist_atten = if is_self || !has_listener {
        1.0
    } else {
        evaluate_profile_distance_gain(dist_uu, profile, cfg.arena_acoustic_scale, radius_scale)
    };
    let base_mult = cfg.master_volume * if is_self { cfg.vehicle_self_volume } else { 1.0 };
    let final_gain = (cfg.wheel_impact_volume * base_mult * vol_mult * dist_atten).clamp(0.0, 5.0);
    if final_gain <= 1e-5 {
        return;
    }

    cue_pod.one_shots[slot_idx] = AudioOneShotSlotPod {
        event_type: 0x12,
        sub_type: 0,
        car_index: car_idx as u32,
        priority_and_variant: if is_self { 4 } else { 2 },
        final_gain,
        playback_rate,
        distance_radius_scale: radius_scale,
        pan_or_intensity: intensity,
        audio_pos_meters: uu_to_audio_meters(car_pos_uu),
        category_index: attenuation_categories::WHEEL_LANDING as u32,
    };
    cue_pod.one_shot_count += 1;
}
