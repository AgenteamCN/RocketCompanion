//! Ball surface distance attenuation helpers shared by the impact and loop stages
//! (`ball_rolling = 14`, `ball_flying = 15` profiles).

use crate::config_pod::AttenuationProfilePod;

pub const CAT_BALL_ROLLING: usize = 14;
pub const CAT_BALL_FLYING: usize = 15;


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
