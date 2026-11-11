//! Frame-level anomaly comparator and Causal Hybrid Takeover perturbation evaluator.

use glam::Vec3;
use rc_physics_sim::{
    layout::{GameStateBufferPod, MAX_CARS},
    replay::ReplayFrameEntry,
};

use crate::types::ReplayAnomalyDiffPod;

const CAUSAL_HYBRID_RADIUS_UU: f32 = 240.0;

#[inline]
fn dist_vec3(a: [f32; 3], b: [f32; 3]) -> f32 {
    Vec3::from_array(a).distance(Vec3::from_array(b))
}

/// Computes position, velocity, and orientation divergence between a recorded replay frame
/// (`frame_index`) and the live simulation `state_buffer` (or an external comparison buffer),
/// populating `ReplayAnomalyDiffPod`.
pub fn diff_replay_frame_anomaly(
    state_track: &[ReplayFrameEntry],
    frame_index: usize,
    live_state: &GameStateBufferPod,
    pos_threshold_uu: f32,
    out_diff: &mut ReplayAnomalyDiffPod,
) -> i32 {
    if frame_index >= state_track.len() {
        *out_diff = ReplayAnomalyDiffPod::default();
        return -1;
    }

    let rec = &state_track[frame_index].state;
    let ball_pos_err = dist_vec3(rec.ball.pos, live_state.ball.pos);
    let ball_vel_err = dist_vec3(rec.ball.vel, live_state.ball.vel);
    let ball_ang_err = dist_vec3(rec.ball.ang_vel, live_state.ball.ang_vel);

    let num_cars = (rec.header.num_cars.max(live_state.header.num_cars).round() as usize)
        .clamp(0, MAX_CARS);
    let mut max_car_pos_err = 0.0f32;
    let mut max_car_vel_err = 0.0f32;
    let mut max_car_rot_err_deg = 0.0f32;
    let mut worst_slot = -1i32;
    let mut diverged_mask = 0u32;
    let mut car_pos_errors = [0.0f32; MAX_CARS];

    let threshold = if pos_threshold_uu > 0.0 {
        pos_threshold_uu
    } else {
        CAUSAL_HYBRID_RADIUS_UU
    };

    for c in 0..num_cars {
        let rc = &rec.cars[c];
        let lc = &live_state.cars[c];
        if rc.pos[0] <= -5000.0 && lc.pos[0] <= -5000.0 {
            continue;
        }
        let p_err = dist_vec3(rc.pos, lc.pos);
        let v_err = dist_vec3(rc.vel, lc.vel);
        let f_dot = Vec3::from_array(rc.forward)
            .normalize_or_zero()
            .dot(Vec3::from_array(lc.forward).normalize_or_zero())
            .clamp(-1.0, 1.0);
        let rot_deg = f_dot.acos().to_degrees();

        car_pos_errors[c] = p_err;
        if p_err >= threshold {
            diverged_mask |= 1 << c;
        }
        if p_err > max_car_pos_err {
            max_car_pos_err = p_err;
            worst_slot = c as i32;
        }
        if v_err > max_car_vel_err {
            max_car_vel_err = v_err;
        }
        if rot_deg > max_car_rot_err_deg {
            max_car_rot_err_deg = rot_deg;
        }
    }

    if ball_pos_err >= threshold {
        diverged_mask |= 1 << 8;
    }

    *out_diff = ReplayAnomalyDiffPod {
        frame_index: frame_index as u32,
        tick: live_state.header.tick_count.round() as u32,
        ball_pos_error_uu: ball_pos_err,
        ball_vel_error_uu_s: ball_vel_err,
        ball_ang_vel_error: ball_ang_err,
        max_car_pos_error_uu: max_car_pos_err,
        max_car_vel_error_uu_s: max_car_vel_err,
        max_car_rot_error_deg: max_car_rot_err_deg,
        worst_car_slot: worst_slot,
        diverged_car_mask: diverged_mask,
        car_pos_errors_uu: car_pos_errors,
    };

    diverged_mask as i32
}
