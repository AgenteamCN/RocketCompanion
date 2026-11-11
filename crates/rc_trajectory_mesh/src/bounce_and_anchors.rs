//! 3D surface bounce contact ring detection and vertical ground altitude drop-line
//! + floor shadow trace generation for `rc_trajectory_mesh`.

use rc_physics_sim::layout::BallPredSlicePod;

use crate::layout::{
    BounceMarkerPod, MAX_BOUNCE_MARKERS, MAX_GROUND_DROP_FLOATS, MAX_PREDICTION_SLICES,
};

const GRAVITY_Z: f32 = -650.0;
const FIXED_TIMESTEP: f32 = 1.0 / 120.0;
const GRAV_STEP_Z: f32 = GRAVITY_Z * FIXED_TIMESTEP;
const MIN_BOUNCE_IMPULSE_SQ: f32 = 180.0 * 180.0;
const FLOOR_Y_THREE: f32 = 3.0;
const MIN_PILLAR_HEIGHT_Y_THREE: f32 = 105.0;
const FLOOR_SHADOW_STEP_TICKS: usize = 8;

pub const FLAG_SHOW_BOUNCE_MARKERS: u32 = 0x01;
pub const FLAG_SHOW_GROUND_PROJECTION: u32 = 0x02;

/// Detects 3D surface bounce impacts (floor, walls, corners, backboard, ceiling)
/// along the predicted trajectory using velocity impulse vectors from `pred_slices`.
pub fn detect_trajectory_bounces(
    pred_slices: &[BallPredSlicePod],
    predicted_three_points: &[f32; MAX_PREDICTION_SLICES * 3],
    prediction_count: usize,
    start_index: usize,
    out_bounces: &mut [BounceMarkerPod; MAX_BOUNCE_MARKERS],
) -> (u32, f32) {
    if prediction_count == 0 || start_index >= prediction_count {
        return (0, 0.0);
    }

    let end_index = prediction_count - 1;
    let total_span = (end_index.saturating_sub(start_index)).max(1) as f32;
    let mut max_height_uu = 0.0f32;

    for k in start_index..=end_index {
        let h = predicted_three_points[k * 3 + 1]; // Three.js Y = RocketSim Z (height)
        if h > max_height_uu {
            max_height_uu = h;
        }
    }

    let mut bounce_count = 0usize;
    let mut last_bounce_tick: i32 = -20;

    let first_k = start_index.max(1);
    for k in first_k..end_index {
        if bounce_count >= MAX_BOUNCE_MARKERS {
            break;
        }
        if (k as i32) - last_bounce_tick < 10 {
            continue;
        }

        let prev_vel = pred_slices[k - 1].vel;
        let curr_vel = pred_slices[k].vel;

        let dvx = curr_vel[0] - prev_vel[0];
        let dvy = curr_vel[1] - prev_vel[1];
        let dvz = curr_vel[2] - prev_vel[2] - GRAV_STEP_Z;
        let impulse_sq = dvx * dvx + dvy * dvy + dvz * dvz;

        if impulse_sq >= MIN_BOUNCE_IMPULSE_SQ {
            let impulse_mag = impulse_sq.sqrt();
            let inv_mag = 1.0 / impulse_mag;
            // Convert RocketSim normal (dvx, dvy, dvz) -> Three.js normal (X=dvx, Y=dvz, Z=dvy)
            let nx = dvx * inv_mag;
            let ny = dvz * inv_mag;
            let nz = dvy * inv_mag;

            let p_off = k * 3;
            let progress_01 = (((k - start_index) as f32) / total_span).clamp(0.0, 1.0);

            out_bounces[bounce_count] = BounceMarkerPod {
                three_pos: [
                    predicted_three_points[p_off],
                    predicted_three_points[p_off + 1],
                    predicted_three_points[p_off + 2],
                ],
                three_normal: [nx, ny, nz],
                progress_01,
                impulse_mag,
            };

            bounce_count += 1;
            last_bounce_tick = k as i32;
        }
    }

    (bounce_count as u32, max_height_uu)
}

/// Populates line segment vertices for vertical ground altitude drop pillars
/// and a subtle floor shadow trace along the trajectory.
/// Returns the number of floats written to `out_positions`.
pub fn build_ground_drop_line_segments(
    predicted_three_points: &[f32; MAX_PREDICTION_SLICES * 3],
    prediction_count: usize,
    start_index: usize,
    drop_line_interval_ticks: u32,
    out_positions: &mut [f32; MAX_GROUND_DROP_FLOATS],
) -> u32 {
    if prediction_count <= start_index + 2 {
        return 0;
    }

    let interval = drop_line_interval_ticks.clamp(15, 180) as usize;
    let end_index = prediction_count - 1;
    let mut float_idx = 0usize;

    // 1. Vertical altitude pillars every `interval` ticks
    let mut k = start_index + interval;
    while k <= end_index {
        if float_idx + 6 > MAX_GROUND_DROP_FLOATS {
            break;
        }
        let p_off = k * 3;
        let x = predicted_three_points[p_off];
        let y = predicted_three_points[p_off + 1];
        let z = predicted_three_points[p_off + 2];

        if y > MIN_PILLAR_HEIGHT_Y_THREE {
            out_positions[float_idx] = x;
            out_positions[float_idx + 1] = y;
            out_positions[float_idx + 2] = z;

            out_positions[float_idx + 3] = x;
            out_positions[float_idx + 4] = FLOOR_Y_THREE;
            out_positions[float_idx + 5] = z;
            float_idx += 6;
        }
        k += interval;
    }

    // 2. Subtle floor shadow trace every 8 ticks
    let mut s_k = start_index;
    while s_k < end_index {
        if float_idx + 6 > MAX_GROUND_DROP_FLOATS {
            break;
        }
        let k_next = (s_k + FLOOR_SHADOW_STEP_TICKS).min(end_index);
        let off0 = s_k * 3;
        let off1 = k_next * 3;

        out_positions[float_idx] = predicted_three_points[off0];
        out_positions[float_idx + 1] = FLOOR_Y_THREE;
        out_positions[float_idx + 2] = predicted_three_points[off0 + 2];

        out_positions[float_idx + 3] = predicted_three_points[off1];
        out_positions[float_idx + 4] = FLOOR_Y_THREE;
        out_positions[float_idx + 5] = predicted_three_points[off1 + 2];
        float_idx += 6;

        s_k += FLOOR_SHADOW_STEP_TICKS;
    }

    float_idx as u32
}

pub fn ensure_radial_trig_table(
    radial_segments: usize,
    last_radial_segments: &mut u32,
    cos_table: &mut [f32; crate::layout::MAX_RADIAL_SEGMENTS],
    sin_table: &mut [f32; crate::layout::MAX_RADIAL_SEGMENTS],
) {
    let segs_u32 = radial_segments as u32;
    if *last_radial_segments == segs_u32 {
        return;
    }
    *last_radial_segments = segs_u32;
    let denom = radial_segments as f32;
    for s in 0..radial_segments {
        let angle = (s as f32 / denom) * core::f32::consts::TAU;
        cos_table[s] = angle.cos();
        sin_table[s] = angle.sin();
    }
}

/// Extracts continuous `[start_tick, end_tick]` dash intervals for 3D volumetric tube generation.
pub fn build_trajectory_dash_ranges(
    prediction_count: usize,
    start_index: usize,
    solid_ticks_raw: u32,
    transparent_ticks_raw: u32,
    phase_offset_ticks: i32,
    out_ranges: &mut [crate::state::DashRangePod; crate::layout::MAX_DASH_RANGES],
) -> usize {
    if prediction_count <= 1 || start_index >= prediction_count - 1 {
        return 0;
    }

    let solid_ticks = solid_ticks_raw.clamp(5, 240) as i32;
    let transparent_ticks = transparent_ticks_raw.clamp(5, 240) as i32;
    let cycle_length = solid_ticks + transparent_ticks;
    let end_index = prediction_count - 1;

    let mut range_count = 0usize;
    let mut active_start: Option<usize> = None;

    for k in start_index..end_index {
        let rel_k = (k - start_index) as i32;
        let phase = (rel_k + phase_offset_ticks).rem_euclid(cycle_length);
        let is_solid = phase < solid_ticks;

        if is_solid {
            if active_start.is_none() {
                active_start = Some(k);
            }
        } else if let Some(s) = active_start {
            if range_count < crate::layout::MAX_DASH_RANGES {
                out_ranges[range_count] = crate::state::DashRangePod {
                    start_tick: s as u32,
                    end_tick: k as u32,
                };
                range_count += 1;
            }
            active_start = None;
        }
    }

    if let Some(s) = active_start
        && s < end_index
        && range_count < crate::layout::MAX_DASH_RANGES
    {
        out_ranges[range_count] = crate::state::DashRangePod {
            start_tick: s as u32,
            end_tick: end_index as u32,
        };
        range_count += 1;
    }

    range_count
}
