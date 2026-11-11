//! Synchronized spacetime optimal intercept solver (earliest reachable ball intercept)
//! with sub-tick interpolation and 3D orthogonal cross axis generation.

use rc_physics_sim::layout::CarStatePod;

use crate::{
    aerial_reachability::{
        compute_aerial_turn_latency, compute_ballistic_center, compute_directional_boost_reach,
    },
    layout::{InterceptSolutionPod, INTERCEPT_CROSS_FLOATS},
    reachability_constants::{BALL_CAR_CONTACT_RADIUS, BOOST_ACCEL, BOOST_BURN_RATE},
};

/// Solves for the earliest synchronized spacetime intercept point between the ball's predicted
/// trajectory and the vehicle's 3D reachability envelope.
///
/// `raw_ball_pred_points` is a flat array `[x, y, z, ...]` in RocketSim coords (120Hz ticks).
pub fn solve_optimal_intercept(
    raw_ball_pred_points: &[f32],
    pred_count: usize,
    elapsed_ticks: i32,
    car: &CarStatePod,
    car_pos_override: [f32; 3],
    include_jump_impulse: bool,
    show_closest_when_unreachable: bool,
    cross_trajectory_orient: bool,
    cross_arm_length: f32,
) -> InterceptSolutionPod {
    let mut result = InterceptSolutionPod::default();
    if pred_count <= 1 || raw_ball_pred_points.len() < pred_count * 3 {
        return result;
    }

    let start_idx = elapsed_ticks.max(1) as usize;
    let max_lookahead_ticks = (pred_count - 1).min(start_idx + 360);
    if start_idx >= max_lookahead_ticks {
        return result;
    }

    let [pos_x, pos_y, pos_z] = car_pos_override;
    let is_on_ground = car.is_on_ground > 0.5;
    let boost = car.boost;
    let fwd = car.forward;
    let up = car.up;
    let ang_vel = car.ang_vel;

    let mut prev_margin = -1e9f32;
    let mut prev_t = 0.0f32;
    let mut prev_bx = 0.0f32;
    let mut prev_by = 0.0f32;
    let mut prev_bz = 0.0f32;

    let mut best_fallback_margin = -1e9f32;
    let mut best_fallback_tick: i32 = -1;
    let mut best_fallback_r_env = 1.0f32;

    let mut first_hit_tick: i32 = -1;
    let mut hit_tick: i32 = -1;
    let mut hit_alpha = 1.0f32;
    let mut best_hit_dist = 1e9f32;
    let mut best_hit_r_env = 1.0f32;
    let mut best_hit_margin = -1e9f32;

    const MAX_CONVERGENCE_TICKS: i32 = 30;

    for k in start_idx..=max_lookahead_ticks {
        let dt_ticks = (k - start_idx + 1) as f32;
        let t = dt_ticks / 120.0;

        let b_offset = k * 3;
        let bx = raw_ball_pred_points[b_offset];
        let by = raw_ball_pred_points[b_offset + 1];
        let bz = raw_ball_pred_points[b_offset + 2];

        let c = compute_ballistic_center(
            car_pos_override,
            car.vel,
            up,
            t,
            include_jump_impulse,
            is_on_ground,
        );

        let dx = bx - c.x;
        let dy = by - c.y;
        let dz = bz - c.z;
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();

        let (ux, uy, uz) = if dist > 1e-4 {
            (dx / dist, dy / dist, dz / dist)
        } else {
            (0.0, 0.0, 1.0)
        };

        let t_turn = compute_aerial_turn_latency(fwd, [ux, uy, uz], ang_vel);
        let vel_along_d = c.ivx * ux + c.ivy * uy + c.ivz * uz;
        let s_thrust = compute_directional_boost_reach(t, boost, t_turn, vel_along_d);

        // Base air throttle + hitbox reach envelope
        let r_envelope = s_thrust + BALL_CAR_CONTACT_RADIUS + 28.0 * t;
        let margin = r_envelope - dist;

        if margin > best_fallback_margin {
            best_fallback_margin = margin;
            best_fallback_tick = k as i32;
            best_fallback_r_env = r_envelope;
        }

        let k_i32 = k as i32;
        if margin >= 0.0 {
            if first_hit_tick < 0 {
                first_hit_tick = k_i32;
                hit_tick = k_i32;
                best_hit_dist = dist;
                best_hit_r_env = r_envelope;
                best_hit_margin = margin;
                if k > start_idx && prev_margin < 0.0 {
                    let denom = margin - prev_margin;
                    hit_alpha = if denom > 1e-5 {
                        (-prev_margin / denom).clamp(0.0, 1.0)
                    } else {
                        1.0
                    };
                } else {
                    hit_alpha = 1.0;
                }
                result.status = 1; // reachable
            } else if k_i32 - first_hit_tick <= MAX_CONVERGENCE_TICKS && dist < best_hit_dist - 0.5
            {
                hit_tick = k_i32;
                hit_alpha = 1.0;
                best_hit_dist = dist;
                best_hit_r_env = r_envelope;
                best_hit_margin = margin;
            } else {
                break;
            }
        } else if first_hit_tick >= 0 {
            break;
        }

        prev_margin = margin;
        prev_t = t;
        prev_bx = bx;
        prev_by = by;
        prev_bz = bz;
    }

    let mut target_tick = hit_tick;
    if result.status != 1 {
        result.pace_status = 4; // unreachable
        if !show_closest_when_unreachable || best_fallback_tick < 0 {
            return result;
        }
        result.status = 2; // closest-fallback
        result.margin_uu = best_fallback_margin;
        result.centrality = 0.0;
        target_tick = best_fallback_tick;
        hit_alpha = 1.0;
        best_hit_r_env = best_fallback_r_env;
    } else {
        result.margin_uu = best_hit_margin;
    }

    result.target_tick = target_tick;
    let b_off = (target_tick as usize) * 3;
    let cur_bx = raw_ball_pred_points[b_off];
    let cur_by = raw_ball_pred_points[b_off + 1];
    let cur_bz = raw_ball_pred_points[b_off + 2];

    let cur_t = ((target_tick as usize - start_idx + 1) as f32) / 120.0;
    let rx = if hit_alpha < 1.0 {
        prev_bx + (cur_bx - prev_bx) * hit_alpha
    } else {
        cur_bx
    };
    let ry = if hit_alpha < 1.0 {
        prev_by + (cur_by - prev_by) * hit_alpha
    } else {
        cur_by
    };
    let rz = if hit_alpha < 1.0 {
        prev_bz + (cur_bz - prev_bz) * hit_alpha
    } else {
        cur_bz
    };
    let t_final = if hit_alpha < 1.0 {
        prev_t + (cur_t - prev_t) * hit_alpha
    } else {
        cur_t
    };

    result.rocket_sim_pos = [rx, ry, rz];
    // Convert RocketSim (x, y, z) -> Three.js (x, z, y)
    let tx = rx;
    let ty = rz;
    let tz = ry;
    result.three_pos = [tx, ty, tz];
    result.time_sec = t_final;
    result.distance_uu = ((rx - pos_x).powi(2) + (ry - pos_y).powi(2) + (rz - pos_z).powi(2)).sqrt();

    let c_final = compute_ballistic_center(
        car_pos_override,
        car.vel,
        up,
        t_final,
        include_jump_impulse,
        is_on_ground,
    );
    let off_x = rx - c_final.x;
    let off_y = ry - c_final.y;
    let off_z = rz - c_final.z;
    let d_ballistic = (off_x * off_x + off_y * off_y + off_z * off_z).sqrt();

    if result.status == 1 {
        let core_radius = BALL_CAR_CONTACT_RADIUS;
        let req_reach = (d_ballistic - core_radius).max(0.0);
        let avail_reach = (best_hit_r_env - core_radius).max(1.0);
        let centrality = (1.0 - req_reach / avail_reach).clamp(0.0, 1.0);
        result.centrality = centrality;

        if centrality >= 0.72 {
            result.pace_status = 1; // sweet-spot
        } else {
            let iv_spd =
                (c_final.ivx * c_final.ivx + c_final.ivy * c_final.ivy + c_final.ivz * c_final.ivz)
                    .sqrt();
            let (dir_x, dir_y, dir_z) = if iv_spd > 50.0 {
                (c_final.ivx / iv_spd, c_final.ivy / iv_spd, c_final.ivz / iv_spd)
            } else {
                (fwd[0], fwd[1], fwd[2])
            };
            let longitudinal_offset = off_x * dir_x + off_y * dir_y + off_z * dir_z;
            if iv_spd > 250.0 && longitudinal_offset < 0.0 {
                result.pace_status = 3; // overshoot
            } else {
                result.pace_status = 2; // catching
            }
        }
    }

    let req_thrust_disp = (d_ballistic - BALL_CAR_CONTACT_RADIUS - 28.0 * t_final).max(0.0);
    if req_thrust_disp <= 1.0 {
        result.min_boost = 0.0;
    } else {
        let a_quad = 0.5 * BOOST_ACCEL;
        let b_quad = BOOST_ACCEL * t_final;
        let disc = b_quad * b_quad - 4.0 * a_quad * req_thrust_disp;
        if disc >= 0.0 {
            let tau_req = (b_quad - disc.sqrt()) / (2.0 * a_quad);
            result.min_boost = (tau_req * BOOST_BURN_RATE).clamp(0.0, 100.0);
        } else {
            result.min_boost = 100.0;
        }
    }

    // Compute 3 Orthogonal Axes in Three.js space
    if cross_trajectory_orient && (target_tick as usize) < max_lookahead_ticks {
        let next_off = (pred_count - 1).min(target_tick as usize + 1) * 3;
        let prev_off = (target_tick.max(1) as usize - 1) * 3;
        // Tangent in Three.js space (X=x, Y=z, Z=y)
        let mut tx1 = raw_ball_pred_points[next_off] - raw_ball_pred_points[prev_off];
        let mut ty1 = raw_ball_pred_points[next_off + 2] - raw_ball_pred_points[prev_off + 2];
        let mut tz1 = raw_ball_pred_points[next_off + 1] - raw_ball_pred_points[prev_off + 1];
        let t_len = (tx1 * tx1 + ty1 * ty1 + tz1 * tz1).sqrt();
        if t_len > 1e-4 {
            tx1 /= t_len;
            ty1 /= t_len;
            tz1 /= t_len;
            // Second orthogonal axis: cross(tangent, worldUp(0,1,0))
            let mut nx = -tz1;
            let mut ny = 0.0f32;
            let mut nz = tx1;
            let mut n_len = (nx * nx + ny * ny + nz * nz).sqrt();
            if n_len < 1e-4 {
                nx = 1.0;
                ny = 0.0;
                nz = 0.0;
                n_len = 1.0;
            }
            nx /= n_len;
            ny /= n_len;
            nz /= n_len;
            // Third orthogonal axis: cross(tangent, normal)
            let bx_axis = ty1 * nz - tz1 * ny;
            let by_axis = tz1 * nx - tx1 * nz;
            let bz_axis = tx1 * ny - ty1 * nx;
            result.axis1_three = [tx1, ty1, tz1];
            result.axis2_three = [nx, ny, nz];
            result.axis3_three = [bx_axis, by_axis, bz_axis];
        }
    }

    let arm_len = cross_arm_length.clamp(15.0, 500.0);
    let a1 = result.axis1_three;
    let a2 = result.axis2_three;
    let a3 = result.axis3_three;
    let mut segs = [0.0f32; INTERCEPT_CROSS_FLOATS];

    // Segment 1 (Axis 1)
    segs[0] = tx - a1[0] * arm_len;
    segs[1] = ty - a1[1] * arm_len;
    segs[2] = tz - a1[2] * arm_len;
    segs[3] = tx + a1[0] * arm_len;
    segs[4] = ty + a1[1] * arm_len;
    segs[5] = tz + a1[2] * arm_len;

    // Segment 2 (Axis 2)
    segs[6] = tx - a2[0] * arm_len;
    segs[7] = ty - a2[1] * arm_len;
    segs[8] = tz - a2[2] * arm_len;
    segs[9] = tx + a2[0] * arm_len;
    segs[10] = ty + a2[1] * arm_len;
    segs[11] = tz + a2[2] * arm_len;

    // Segment 3 (Axis 3)
    segs[12] = tx - a3[0] * arm_len;
    segs[13] = ty - a3[1] * arm_len;
    segs[14] = tz - a3[2] * arm_len;
    segs[15] = tx + a3[0] * arm_len;
    segs[16] = ty + a3[1] * arm_len;
    segs[17] = tz + a3[2] * arm_len;

    result.cross_segments_three = segs;
    result
}
