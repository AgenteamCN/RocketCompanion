//! Continuous ball rolling and downward aerial fall loop synthesizer (`BallAcousticLoopPod`).
//!
//! Evaluates arena surface contact (floor, ceiling, sidewalls, endwalls, or ground flag),
//! distance attenuation against `AudioDirectorConfigPod::attenuation_profiles` (`ball_rolling = 14`,
//! `ball_flying = 15`), and exponential gain/rate smoothing matching `BallAudioEmitter.ts`.

use rc_physics_sim::layout::BallStatePod;

use crate::{
    config_pod::{AttenuationProfilePod, AudioDirectorConfigPod},
    pod_types::{AudioListenerStatePod, BallAcousticLoopPod},
};

pub const CAT_BALL_ROLLING: usize = 14;
pub const CAT_BALL_FLYING: usize = 15;

pub const BALL_REST_Z: f32 = 93.15;
pub const ROLLING_SPEED_THRESHOLD_UU: f32 = 25.0;
pub const ROLLING_FADE_OUT_SEC: f32 = 0.05;
pub const FLYING_MIN_HEIGHT_UU: f32 = 25.0;
pub const FLYING_DOWNWARD_VZ_THRESHOLD_UU: f32 = -25.0;
pub const FLYING_FADE_OUT_SEC: f32 = 0.08;

/// Solves a 1D Cubic-Bezier curve `y(x)` for `x` in `[0.0, 1.0]` with control points `(x1, y1)` and `(x2, y2)`.
#[inline]
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
    let sample_dx = |t: f32| (3.0 * ax * t + 2.0 * bx) * t + cx;

    let mut t2 = x;
    for _ in 0..8 {
        let x_est = sample_x(t2) - x;
        if x_est.abs() < 1e-6 {
            break;
        }
        let d2 = sample_dx(t2);
        if d2.abs() < 1e-6 {
            break;
        }
        t2 -= x_est / d2;
    }

    if !(0.0..=1.0).contains(&t2) || t2.is_nan() {
        let mut t0 = 0.0f32;
        let mut t1 = 1.0f32;
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

/// Evaluates normalized rolloff factor in `[0.0, 1.0]` at normalized distance `t` in `[0.0, 1.0]`.
#[inline]
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
            let inv_end = 1.0 / (1.0 + k);
            ((1.0 / (1.0 + k * t) - inv_end) / (1.0 - inv_end)).max(0.0)
        }
        _ => 1.0 - t * t * (3.0 - 2.0 * t),
    }
}

/// Evaluates distance attenuation gain `[0.0, 1.0]` and whether the emitter is hard-culled beyond `max_distance_uu`.
#[inline]
pub fn evaluate_profile_distance_gain(
    distance_uu: f32,
    profile: &AttenuationProfilePod,
    arena_scale: f32,
    distance_radius_scale: f32,
) -> (f32, bool) {
    if !distance_uu.is_finite() {
        return (1.0, false);
    }
    let a_scale = if arena_scale.is_finite() && arena_scale > 0.0 {
        arena_scale.clamp(0.25, 4.0)
    } else {
        1.0
    };
    let r_scale = if distance_radius_scale.is_finite() && distance_radius_scale > 0.0 {
        distance_radius_scale.clamp(0.25, 3.0)
    } else {
        1.0
    };
    let min_dist = profile.min_distance_uu * a_scale;
    let max_dist = profile.max_distance_uu * a_scale;
    let effective_dist = distance_uu / r_scale;

    if effective_dist <= min_dist {
        return (1.0, false);
    }

    let min_floor = profile.min_gain_floor.clamp(0.0, 1.0);
    let cull_beyond_max = (profile.flags & 1) != 0;
    if effective_dist >= max_dist {
        let culled = cull_beyond_max && min_floor <= 1e-5;
        return (if culled { 0.0 } else { min_floor }, culled);
    }

    let span = (max_dist - min_dist).max(1e-3);
    let t = ((effective_dist - min_dist) / span).clamp(0.0, 1.0);
    let curve = evaluate_normalized_attenuation_curve(t, profile);
    (min_floor + (1.0 - min_floor) * curve, false)
}

/// Steps continuous ball rolling and downward aerial flying loop state for the current frame.
#[allow(clippy::too_many_arguments)]
pub fn step_ball_acoustic_loops(
    ball: &BallStatePod,
    ball_motion_state: i32,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    smoothed_rolling_gain: &mut f32,
    smoothed_flying_gain: &mut f32,
    smoothed_rolling_rate: &mut f32,
    smoothed_flying_rate: &mut f32,
    out_ball: &mut BallAcousticLoopPod,
) -> f32 {
    let px = ball.pos[0];
    let py = ball.pos[1];
    let pz = ball.pos[2];
    let vx = ball.vel[0];
    let vy = ball.vel[1];
    let vz = ball.vel[2];

    // Map RocketSim (x: width, y: length, z: up) -> WebAudio meters (x: width, y: up, z: length)
    out_ball.audio_pos_meters = [px * 0.01, pz * 0.01, py * 0.01];

    let has_listener = (listener.flags & 2) != 0;
    let dist_uu = if has_listener {
        let dx = px - listener.pos_uu[0];
        let dy = py - listener.pos_uu[1];
        let dz = pz - listener.pos_uu[2];
        (dx * dx + dy * dy + dz * dz).sqrt()
    } else {
        0.0
    };
    out_ball.distance_uu = dist_uu;

    let (rolling_atten, _) = if has_listener {
        evaluate_profile_distance_gain(
            dist_uu,
            &cfg.attenuation_profiles[CAT_BALL_ROLLING],
            cfg.arena_acoustic_scale,
            1.0,
        )
    } else {
        (1.0, false)
    };
    let (flying_atten, _) = if has_listener {
        evaluate_profile_distance_gain(
            dist_uu,
            &cfg.attenuation_profiles[CAT_BALL_FLYING],
            cfg.arena_acoustic_scale,
            1.0,
        )
    } else {
        (1.0, false)
    };

    let height_above_floor = pz - BALL_REST_Z;
    let is_on_ground = ball_motion_state == 1;
    let is_near_floor = height_above_floor <= 15.0;
    let is_near_ceiling = pz >= (2048.0 - BALL_REST_Z - 20.0);
    let is_near_side_wall = px.abs() >= (4096.0 - BALL_REST_Z - 20.0);
    let is_near_end_wall = py.abs() >= (5120.0 - BALL_REST_Z - 20.0);
    let is_contacting_surface = is_on_ground
        || is_near_floor
        || is_near_ceiling
        || is_near_side_wall
        || is_near_end_wall;

    let total_speed = (vx * vx + vy * vy + vz * vz).sqrt();
    let surface_speed = (vx * vx + vy * vy).sqrt();
    let dt = listener.dt_sec.clamp(0.0005, 0.25);
    let rate_alpha = 1.0 - (-dt / 0.03).exp();

    // 1. Surface rolling loop
    let target_rolling_gain = if is_contacting_surface
        && (total_speed > ROLLING_SPEED_THRESHOLD_UU || surface_speed > ROLLING_SPEED_THRESHOLD_UU)
    {
        let speed_factor = (total_speed / 1800.0).clamp(0.1, 1.0);
        let target_rate = 0.85 + 0.35 * (total_speed / 2000.0).clamp(0.0, 1.0);
        *smoothed_rolling_rate += (target_rate - *smoothed_rolling_rate) * rate_alpha;
        if (target_rate - *smoothed_rolling_rate).abs() <= 1e-4 {
            *smoothed_rolling_rate = target_rate;
        }
        cfg.ball_rolling_volume * cfg.master_volume * rolling_atten * speed_factor
    } else {
        0.0
    };

    let rolling_tau = if target_rolling_gain > 0.0 {
        0.04
    } else {
        (ROLLING_FADE_OUT_SEC * 0.5).max(0.015)
    };
    let rolling_alpha = 1.0 - (-dt / rolling_tau).exp();
    *smoothed_rolling_gain += (target_rolling_gain - *smoothed_rolling_gain) * rolling_alpha;
    if (target_rolling_gain - *smoothed_rolling_gain).abs() <= 1e-4 {
        *smoothed_rolling_gain = target_rolling_gain;
    }

    // 2. Downward aerial fall loop
    let is_airborne = !is_contacting_surface && height_above_floor > FLYING_MIN_HEIGHT_UU;
    let is_falling_downward = is_airborne && vz < FLYING_DOWNWARD_VZ_THRESHOLD_UU;

    let target_flying_gain = if is_falling_downward {
        let fall_speed_factor = (vz.abs() / 1400.0).clamp(0.15, 1.0);
        let target_rate = 0.90 + 0.30 * (vz.abs() / 2000.0).clamp(0.0, 1.0);
        *smoothed_flying_rate += (target_rate - *smoothed_flying_rate) * rate_alpha;
        if (target_rate - *smoothed_flying_rate).abs() <= 1e-4 {
            *smoothed_flying_rate = target_rate;
        }
        cfg.ball_flying_volume * cfg.master_volume * flying_atten * fall_speed_factor
    } else {
        0.0
    };

    let flying_tau = if target_flying_gain > 0.0 {
        0.04
    } else {
        (FLYING_FADE_OUT_SEC * 0.5).max(0.02)
    };
    let flying_alpha = 1.0 - (-dt / flying_tau).exp();
    *smoothed_flying_gain += (target_flying_gain - *smoothed_flying_gain) * flying_alpha;
    if (target_flying_gain - *smoothed_flying_gain).abs() <= 1e-4 {
        *smoothed_flying_gain = target_flying_gain;
    }

    out_ball.rolling_gain = smoothed_rolling_gain.clamp(0.0, 5.0);
    out_ball.rolling_rate = smoothed_rolling_rate.clamp(0.85, 1.20);
    out_ball.flying_gain = smoothed_flying_gain.clamp(0.0, 5.0);
    out_ball.flying_rate = smoothed_flying_rate.clamp(0.90, 1.20);

    out_ball.rolling_gain
}
