//! Incremental tail-shift detection and Alpha/Bravo trajectory jump snapshot evaluation
//! operating directly on the WASM-resident `pred_buffer` (`[BallPredSlicePod]`) and
//! `TrajectoryMeshInstance` coordinate pools.

use rc_physics_sim::layout::{BallPredSlicePod, GameStateBufferPod};

use crate::{layout::MAX_PREDICTION_SLICES, state::TrajectoryMeshInstance};

/// Classification of how the WASM-resident `pred_buffer` transitioned between two consecutive frames.
#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrajectoryStepTransitionKind {
    ColdStart = 0,
    IncrementalShift = 1,
    SeamResync = 2,
    CarProximityHit = 3,
    NonCarRecompute = 4,
}

/// Zero-allocation Alpha/Bravo trajectory jump diagnostic snapshot comparing the
/// previous resident trajectory (`Alpha`) against the newly updated `pred_buffer` (`Bravo`).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct AlphaBravoJumpSnapshot {
    pub transition_kind: u32,
    pub triggered: u32,
    pub prediction_count: u32,
    pub closest_car_id: i32,
    pub alpha_head_pos: [f32; 3],
    pub bravo_head_pos: [f32; 3],
    pub alpha_expected_next_pos: [f32; 3],
    pub seam_pos_error_uu: f32,
    pub tail_shift_delta_uu: f32,
    pub max_mid_horizon_divergence_uu: f32,
    pub closest_car_surface_gap_uu: f32,
    pub direction_cosine: f32,
}

/// Compute the minimum 3D surface-to-surface gap (in Unreal Units) between the ball and any active car.
pub fn compute_closest_car_surface_gap_uu(
    state: &GameStateBufferPod,
    ball_radius_uu: f32,
) -> (f32, i32) {
    let bx = state.ball.pos[0];
    let by = state.ball.pos[1];
    let bz = state.ball.pos[2];
    let car_bound_radius_uu = 84.0f32;
    let combined_radius = ball_radius_uu + car_bound_radius_uu;

    let car_count = (state.header.num_cars as usize).min(state.cars.len());
    let mut min_gap = f32::INFINITY;
    let mut closest_car_id = -1i32;

    for i in 0..car_count {
        let car = &state.cars[i];
        if car.is_demoed > 0.0 {
            continue;
        }
        let dx = car.pos[0] - bx;
        let dy = car.pos[1] - by;
        let dz = car.pos[2] - bz;
        let center_dist = (dx * dx + dy * dy + dz * dz).sqrt();
        let gap = (center_dist - combined_radius).max(0.0);
        if gap < min_gap {
            min_gap = gap;
            closest_car_id = i as i32;
        }
    }

    (min_gap, closest_car_id)
}

impl TrajectoryMeshInstance {
    /// Synchronize WASM-resident `pred_buffer` into `predicted_three_points` and `raw_predicted_points`,
    /// using O(1) `copy_within` tail-shifting whenever the prediction window advances by 1 tick
    /// along the same unperturbed trajectory.
    ///
    /// Returns `(max_height_uu, did_incremental_shift)`.
    pub fn sync_prediction_points_incremental(
        &mut self,
        pred_slices: &[BallPredSlicePod],
        pred_count: usize,
        start_idx: usize,
    ) -> (f32, bool) {
        let count = pred_count.min(MAX_PREDICTION_SLICES).min(pred_slices.len());
        if count == 0 {
            return (0.0, false);
        }

        let prev_count = self.mesh_header.prediction_count as usize;
        let can_shift_1 = count > 2 && prev_count == count && {
            let s0 = &pred_slices[0];
            let dx0 = s0.pos[0] - self.raw_predicted_points[3];
            let dy0 = s0.pos[1] - self.raw_predicted_points[4];
            let dz0 = s0.pos[2] - self.raw_predicted_points[5];

            let pre_tail = count - 2;
            let prev_tail_off = (count - 1) * 3;
            let st = &pred_slices[pre_tail];
            let dxt = st.pos[0] - self.raw_predicted_points[prev_tail_off];
            let dyt = st.pos[1] - self.raw_predicted_points[prev_tail_off + 1];
            let dzt = st.pos[2] - self.raw_predicted_points[prev_tail_off + 2];

            dx0 * dx0 + dy0 * dy0 + dz0 * dz0 <= 0.25
                && dxt * dxt + dyt * dyt + dzt * dzt <= 1e-3
        };

        let mut max_height = 0.0f32;
        if can_shift_1 {
            let total_floats = count * 3;
            self.predicted_three_points.copy_within(3..total_floats, 0);
            self.raw_predicted_points.copy_within(3..total_floats, 0);

            let last_idx = count - 1;
            let [x, y, z] = pred_slices[last_idx].pos;
            let dst = last_idx * 3;
            self.predicted_three_points[dst] = x;
            self.predicted_three_points[dst + 1] = z;
            self.predicted_three_points[dst + 2] = y;
            self.raw_predicted_points[dst] = x;
            self.raw_predicted_points[dst + 1] = y;
            self.raw_predicted_points[dst + 2] = z;

            let clamped_start = start_idx.min(count);
            for i in clamped_start..count {
                let h = self.raw_predicted_points[i * 3 + 2];
                if h > max_height {
                    max_height = h;
                }
            }
            (max_height, true)
        } else {
            let clamped_start = start_idx.min(count);
            for (i, slice) in pred_slices.iter().take(count).enumerate() {
                let [x, y, z] = slice.pos;
                let dst = i * 3;
                self.predicted_three_points[dst] = x;
                self.predicted_three_points[dst + 1] = z;
                self.predicted_three_points[dst + 2] = y;

                self.raw_predicted_points[dst] = x;
                self.raw_predicted_points[dst + 1] = y;
                self.raw_predicted_points[dst + 2] = z;

                if i >= clamped_start && z > max_height {
                    max_height = z;
                }
            }
            (max_height, false)
        }
    }

    /// Evaluate Alpha (previous resident `raw_predicted_points`) vs Bravo (current WASM-resident
    /// `pred_buffer`) trajectory continuity and classify incremental tail-shifts vs non-car jumps.
    pub fn evaluate_alpha_bravo_jump(
        &self,
        pred_slices: &[BallPredSlicePod],
        pred_count: usize,
        state: &GameStateBufferPod,
        car_proximity_gate_uu: f32,
        jump_threshold_uu: f32,
    ) -> AlphaBravoJumpSnapshot {
        let count = pred_count.min(MAX_PREDICTION_SLICES).min(pred_slices.len());
        let prev_count = self.mesh_header.prediction_count as usize;
        let (closest_gap_uu, closest_car_id) = compute_closest_car_surface_gap_uu(state, 91.25);

        if count < 3 || prev_count < 3 {
            let bravo_head = if count > 0 {
                pred_slices[0].pos
            } else {
                [0.0; 3]
            };
            return AlphaBravoJumpSnapshot {
                transition_kind: TrajectoryStepTransitionKind::ColdStart as u32,
                triggered: 0,
                prediction_count: count as u32,
                closest_car_id,
                alpha_head_pos: [
                    self.raw_predicted_points[0],
                    self.raw_predicted_points[1],
                    self.raw_predicted_points[2],
                ],
                bravo_head_pos: bravo_head,
                alpha_expected_next_pos: [0.0; 3],
                seam_pos_error_uu: 0.0,
                tail_shift_delta_uu: 0.0,
                max_mid_horizon_divergence_uu: 0.0,
                closest_car_surface_gap_uu: closest_gap_uu,
                direction_cosine: 1.0,
            };
        }

        let alpha_head = [
            self.raw_predicted_points[0],
            self.raw_predicted_points[1],
            self.raw_predicted_points[2],
        ];
        let alpha_next = [
            self.raw_predicted_points[3],
            self.raw_predicted_points[4],
            self.raw_predicted_points[5],
        ];
        let bravo_head = pred_slices[0].pos;

        let dx0 = bravo_head[0] - alpha_next[0];
        let dy0 = bravo_head[1] - alpha_next[1];
        let dz0 = bravo_head[2] - alpha_next[2];
        let seam_pos_error_uu = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

        let shared_tail_idx = count.min(prev_count) - 2;
        let alpha_tail_off = (shared_tail_idx + 1) * 3;
        let bravo_pre_tail = pred_slices[shared_tail_idx].pos;
        let dxt = bravo_pre_tail[0] - self.raw_predicted_points[alpha_tail_off];
        let dyt = bravo_pre_tail[1] - self.raw_predicted_points[alpha_tail_off + 1];
        let dzt = bravo_pre_tail[2] - self.raw_predicted_points[alpha_tail_off + 2];
        let tail_shift_delta_uu = (dxt * dxt + dyt * dyt + dzt * dzt).sqrt();

        // Measure mid-horizon divergence between shifted Alpha[k+1] and Bravo[k]
        let compare_len = count.min(prev_count.saturating_sub(1)).min(120);
        let mut max_mid_div_sq = 0.0f32;
        for k in 0..compare_len {
            let a_off = (k + 1) * 3;
            let bp = pred_slices[k].pos;
            let mx = bp[0] - self.raw_predicted_points[a_off];
            let my = bp[1] - self.raw_predicted_points[a_off + 1];
            let mz = bp[2] - self.raw_predicted_points[a_off + 2];
            let d_sq = mx * mx + my * my + mz * mz;
            if d_sq > max_mid_div_sq {
                max_mid_div_sq = d_sq;
            }
        }
        let max_mid_horizon_divergence_uu = max_mid_div_sq.sqrt();

        // Directional cosine between Alpha step vector and Bravo initial velocity
        let avx = alpha_next[0] - alpha_head[0];
        let avy = alpha_next[1] - alpha_head[1];
        let avz = alpha_next[2] - alpha_head[2];
        let bvx = pred_slices[0].vel[0];
        let bvy = pred_slices[0].vel[1];
        let bvz = pred_slices[0].vel[2];
        let a_len = (avx * avx + avy * avy + avz * avz).sqrt();
        let b_len = (bvx * bvx + bvy * bvy + bvz * bvz).sqrt();
        let direction_cosine = if a_len > 1e-3 && b_len > 1.0 {
            ((avx * bvx + avy * bvy + avz * bvz) / (a_len * b_len)).clamp(-1.0, 1.0)
        } else {
            1.0
        };

        let (transition_kind, triggered) =
            if seam_pos_error_uu <= 0.5 && tail_shift_delta_uu <= 0.05 {
                (TrajectoryStepTransitionKind::IncrementalShift, 0)
            } else if closest_gap_uu <= car_proximity_gate_uu {
                (TrajectoryStepTransitionKind::CarProximityHit, 0)
            } else if seam_pos_error_uu <= 2.0 && max_mid_horizon_divergence_uu <= jump_threshold_uu
            {
                (TrajectoryStepTransitionKind::SeamResync, 0)
            } else {
                let is_anomaly = u32::from(
                    seam_pos_error_uu > jump_threshold_uu
                        || max_mid_horizon_divergence_uu > jump_threshold_uu * 2.0,
                );
                (TrajectoryStepTransitionKind::NonCarRecompute, is_anomaly)
            };

        AlphaBravoJumpSnapshot {
            transition_kind: transition_kind as u32,
            triggered,
            prediction_count: count as u32,
            closest_car_id,
            alpha_head_pos: alpha_head,
            bravo_head_pos: bravo_head,
            alpha_expected_next_pos: alpha_next,
            seam_pos_error_uu,
            tail_shift_delta_uu,
            max_mid_horizon_divergence_uu,
            closest_car_surface_gap_uu: closest_gap_uu,
            direction_cosine,
        }
    }
}
