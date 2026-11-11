//! Self-contained per-agent 5-modality observation builder (`main`, `others`, `ball`, `actions`, `boosts`)
//! for Ripple v1.1 (`rolv/ripple/1.1`).

use rc_physics_sim::layout::{
    BallPredSlicePod, GameStateBufferPod, MAX_CARS, MAX_PADS, MAX_PREDICTION_STEPS,
};

use crate::{
    layout_and_specs::{RIPPLE_ACTION_QUEUE_LEN, RIPPLE_BALL_SLICES, RIPPLE_OTHER_SLOTS},
    ripple_history_and_pad_encoder::{
        mat_mul_rot3, RippleHistoryAndPadTracker, INVERT_SIDE_ACTIONS_8, RIPPLE_ACTION_DIM,
        RIPPLE_BOOST_PAD_DIM,
    },
};

pub const RIPPLE_MAIN_DIM: usize = 32;
pub const RIPPLE_MAIN_PROC_IN_DIM: usize = 30;
pub const RIPPLE_OTHER_DIM: usize = 21;
pub const RIPPLE_BALL_SLICE_DIM: usize = 9;
pub const RIPPLE_BALL_TOTAL_DIM: usize = RIPPLE_BALL_SLICES * RIPPLE_BALL_SLICE_DIM; // 54

/// Normalization constants from `src/obs.py`:
/// `NORM = [2300]*6 + [6]*3 + [1]*6 + [1, 3, 1, 1, 1, 1, 12, 24, 150, 120, 1, 1, 1, 1, 1, 1, 1]`
pub const NORM_32: [f32; RIPPLE_MAIN_DIM] = [
    2300.0, 2300.0, 2300.0, 2300.0, 2300.0, 2300.0, 6.0, 6.0, 6.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
    1.0, 3.0, 1.0, 1.0, 1.0, 1.0, 12.0, 24.0, 150.0, 120.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

/// `INVERT_TEAM = [-1, -1, 1]*5 + [-1] + [1]*16`
pub const INVERT_TEAM_32: [f32; RIPPLE_MAIN_DIM] = [
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0,
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

/// `INVERT_SIDE = [-1, 1, 1]*2 + [1, -1, -1] + [-1, 1, 1]*2 + [1]*17`
pub const INVERT_SIDE_32: [f32; RIPPLE_MAIN_DIM] = [
    -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

/// `INVERT_SIDE_RELATIVE = [1, -1, 1]*2 + [-1, 1, -1] + [1, -1, 1]*2 + [1]*12 + [-1] + [1]*4`
pub const INVERT_SIDE_RELATIVE_32: [f32; RIPPLE_MAIN_DIM] = [
    1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0,
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0,
];

/// Per-car observation tensors and history tracker for Ripple v1.1.
#[derive(Clone)]
pub struct RippleAgentState {
    pub main: [f32; RIPPLE_MAIN_DIM],
    pub others: [f32; RIPPLE_OTHER_SLOTS * RIPPLE_OTHER_DIM],
    pub ball: [f32; RIPPLE_BALL_TOTAL_DIM],
    pub history_tracker: RippleHistoryAndPadTracker,
    pub last_ball_x: f32,
    pub last_ball_y: f32,
    pub is_kickoff: bool,
}

impl Default for RippleAgentState {
    fn default() -> Self {
        Self::new()
    }
}

impl RippleAgentState {
    pub fn new() -> Self {
        Self {
            main: [0.0; RIPPLE_MAIN_DIM],
            others: [0.0; RIPPLE_OTHER_SLOTS * RIPPLE_OTHER_DIM],
            ball: [0.0; RIPPLE_BALL_TOTAL_DIM],
            history_tracker: RippleHistoryAndPadTracker::new(),
            last_ball_x: 0.0,
            last_ball_y: 0.0,
            is_kickoff: true,
        }
    }

    pub fn reset(&mut self, is_kickoff: bool) {
        self.history_tracker.reset(is_kickoff);
        self.last_ball_x = 0.0;
        self.last_ball_y = 0.0;
        self.is_kickoff = is_kickoff;
    }

    /// Builds the 5 observation tensors (`main`, `others`, `ball`, `actions`, `boosts`) for `self_car_index`.
    pub fn build_obs(
        &mut self,
        state: &GameStateBufferPod,
        pred_buffer: &[BallPredSlicePod; MAX_PREDICTION_STEPS],
        pred_count: usize,
        self_car_index: usize,
        self_team: u32,
        active_car_mask: u32,
        slot_teams: &[u32; MAX_CARS],
    ) {
        let norm_self_team = if self_team == 1 {
            1
        } else if self_team == 0 {
            0
        } else {
            (self_car_index % 2) as u32
        };

        let bx = state.ball.pos[0];
        let by = state.ball.pos[1];
        let bvx = state.ball.vel[0];
        let bvy = state.ball.vel[1];

        let is_kickoff = bx.abs() < 1.0 && by.abs() < 1.0 && bvx.hypot(bvy) < 5.0;
        let was_kickoff = self.last_ball_x.abs() < 1.0 && self.last_ball_y.abs() < 1.0;
        if is_kickoff && !was_kickoff {
            self.history_tracker.reset(true);
        }
        self.last_ball_x = bx;
        self.last_ball_y = by;
        self.is_kickoff = is_kickoff;

        self.history_tracker
            .update_timers(state, self_car_index, active_car_mask);
        self.history_tracker.prev_prev_action = self.history_tracker.prev_executed_action;

        let c_idx = self_car_index.min(MAX_CARS - 1);
        let self_car = &state.cars[c_idx];

        // 1. Populate self player features [32]
        self.main.fill(0.0);
        self.main[0] = self_car.pos[0];
        self.main[1] = self_car.pos[1];
        self.main[2] = self_car.pos[2];
        self.main[3] = self_car.vel[0];
        self.main[4] = self_car.vel[1];
        self.main[5] = self_car.vel[2];
        self.main[6] = self_car.ang_vel[0];
        self.main[7] = self_car.ang_vel[1];
        self.main[8] = self_car.ang_vel[2];
        self.main[9] = self_car.forward[0];
        self.main[10] = self_car.forward[1];
        self.main[11] = self_car.forward[2];
        self.main[12] = self_car.up[0];
        self.main[13] = self_car.up[1];
        self.main[14] = self_car.up[2];
        self.main[15] = 2.0 * (norm_self_team as f32) - 1.0;
        self.main[16] = self.history_tracker.demo_timers[c_idx];
        self.main[17] = if self_car.is_on_ground > 0.5 { 1.0 } else { 0.0 };
        self.main[18] = if self_car.is_on_ground > 0.5 { 1.0 } else { 0.0 };
        self.main[19] = if self_car.has_flip_or_jump > 0.5 {
            1.0
        } else {
            0.0
        };
        self.main[20] = (self_car.boost / 100.0).min(2.0);
        self.main[21] = self.history_tracker.boost_times[c_idx];
        self.main[22] = self.history_tracker.jump_times[c_idx];
        self.main[23] = self.history_tracker.air_times[c_idx];
        self.main[24] = self.history_tracker.flip_times[c_idx];
        self.main[25] = self.history_tracker.handbrakes[c_idx];
        self.main[26] = self.history_tracker.flip_dirs[c_idx * 2];
        self.main[27] = self.history_tracker.flip_dirs[c_idx * 2 + 1];
        self.main[28] = if self.history_tracker.is_queue_reset {
            1.0
        } else {
            0.0
        };
        self.main[29] = if is_kickoff { 1.0 } else { 0.0 };
        self.main[30] = 0.0; // is_flipped (set below if main[0] < 0)
        self.main[31] = 0.0; // is_swapped

        // 2. Populate other players [5 * 21] in local self frame
        self.others.fill(0.0);

        let mut other_list = [(0usize, 0u32, 0.0f32); MAX_CARS];
        let mut other_count = 0usize;
        let num_cars = (state.header.num_cars as usize).min(MAX_CARS);
        for idx in 0..num_cars {
            if idx == c_idx || (active_car_mask & (1u32 << idx)) == 0 {
                continue;
            }
            let ocar = &state.cars[idx];
            let dx = ocar.pos[0] - bx;
            let dy = ocar.pos[1] - by;
            let dist_sq = dx * dx + dy * dy;
            let oteam = u32::from(slot_teams[idx] == 1);
            other_list[other_count] = (idx, oteam, dist_sq);
            other_count += 1;
        }

        if other_count > RIPPLE_OTHER_SLOTS {
            other_list[..other_count]
                .sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(core::cmp::Ordering::Equal));
            other_count = RIPPLE_OTHER_SLOTS;
        }

        for s in 0..other_count {
            let (oc_idx, o_team, _) = other_list[s];
            let ocar = &state.cars[oc_idx];
            let base = s * RIPPLE_OTHER_DIM;

            let rel_pos = mat_mul_rot3(
                ocar.pos[0] - self_car.pos[0],
                ocar.pos[1] - self_car.pos[1],
                ocar.pos[2] - self_car.pos[2],
                self_car,
            );
            let rel_vel = mat_mul_rot3(
                ocar.vel[0] - self_car.vel[0],
                ocar.vel[1] - self_car.vel[1],
                ocar.vel[2] - self_car.vel[2],
                self_car,
            );
            let rel_ang = mat_mul_rot3(ocar.ang_vel[0], ocar.ang_vel[1], ocar.ang_vel[2], self_car);
            let rel_fwd = mat_mul_rot3(ocar.forward[0], ocar.forward[1], ocar.forward[2], self_car);
            let rel_up = mat_mul_rot3(ocar.up[0], ocar.up[1], ocar.up[2], self_car);

            self.others[base] = rel_pos[0];
            self.others[base + 1] = rel_pos[1];
            self.others[base + 2] = rel_pos[2];
            self.others[base + 3] = rel_vel[0];
            self.others[base + 4] = rel_vel[1];
            self.others[base + 5] = rel_vel[2];
            self.others[base + 6] = rel_ang[0];
            self.others[base + 7] = rel_ang[1];
            self.others[base + 8] = rel_ang[2];
            self.others[base + 9] = rel_fwd[0];
            self.others[base + 10] = rel_fwd[1];
            self.others[base + 11] = rel_fwd[2];
            self.others[base + 12] = rel_up[0];
            self.others[base + 13] = rel_up[1];
            self.others[base + 14] = rel_up[2];
            self.others[base + 15] = 2.0 * (o_team as f32) - 1.0;
            self.others[base + 16] = self.history_tracker.demo_timers[oc_idx];
            self.others[base + 17] = if ocar.is_on_ground > 0.5 { 1.0 } else { 0.0 };
            self.others[base + 18] = if ocar.is_on_ground > 0.5 { 1.0 } else { 0.0 };
            self.others[base + 19] = if ocar.has_flip_or_jump > 0.5 { 1.0 } else { 0.0 };
            self.others[base + 20] = (ocar.boost / 100.0).min(2.0);
        }

        // 3. Populate 6 ball prediction slices (0s, 1s, 2s, 3s, 4s, 5s = ticks 0, 120, 240, 360, 480, 600)
        let raw_ang = state.ball.ang_vel;
        for step in 0..RIPPLE_BALL_SLICES {
            let (b_pos, b_vel) = if step == 0 || pred_count == 0 {
                (state.ball.pos, state.ball.vel)
            } else {
                let tick_idx = (step * 120).min(pred_count.saturating_sub(1));
                let slice = &pred_buffer[tick_idx];
                (slice.pos, slice.vel)
            };

            let rel_pos = mat_mul_rot3(
                b_pos[0] - self_car.pos[0],
                b_pos[1] - self_car.pos[1],
                b_pos[2] - self_car.pos[2],
                self_car,
            );
            let rel_vel = mat_mul_rot3(
                b_vel[0] - self_car.vel[0],
                b_vel[1] - self_car.vel[1],
                b_vel[2] - self_car.vel[2],
                self_car,
            );
            let rel_ang = mat_mul_rot3(raw_ang[0], raw_ang[1], raw_ang[2], self_car);

            let dst = step * RIPPLE_BALL_SLICE_DIM;
            self.ball[dst] = rel_pos[0];
            self.ball[dst + 1] = rel_pos[1];
            self.ball[dst + 2] = rel_pos[2];
            self.ball[dst + 3] = rel_vel[0];
            self.ball[dst + 4] = rel_vel[1];
            self.ball[dst + 5] = rel_vel[2];
            self.ball[dst + 6] = rel_ang[0];
            self.ball[dst + 7] = rel_ang[1];
            self.ball[dst + 8] = rel_ang[2];
        }

        // 4 & 5. Populate action queue [6 * 8] and boost pads [34 * 5]
        self.history_tracker.encode_actions_and_boost_pads(self_car);

        // 6. Orange team inversion
        if norm_self_team == 1 {
            for d in 0..RIPPLE_MAIN_DIM {
                self.main[d] *= INVERT_TEAM_32[d];
            }
            for s in 0..other_count {
                let base = s * RIPPLE_OTHER_DIM;
                for d in 15..RIPPLE_OTHER_DIM {
                    self.others[base + d] *= INVERT_TEAM_32[d];
                }
            }
            self.main[31] = 1.0; // is_swapped
        }

        // 7. Left-only X-side mirroring when `main[0] < 0`
        if self.main[0] < 0.0 {
            for step in 0..RIPPLE_BALL_SLICES {
                let dst = step * RIPPLE_BALL_SLICE_DIM;
                for d in 0..RIPPLE_BALL_SLICE_DIM {
                    self.ball[dst + d] *= INVERT_SIDE_RELATIVE_32[d];
                }
            }
            for d in 0..RIPPLE_MAIN_DIM {
                self.main[d] *= INVERT_SIDE_32[d];
            }
            for s in 0..other_count {
                let base = s * RIPPLE_OTHER_DIM;
                for d in 0..RIPPLE_OTHER_DIM {
                    self.others[base + d] *= INVERT_SIDE_RELATIVE_32[d];
                }
            }
            for p in 0..MAX_PADS {
                let dst = p * RIPPLE_BOOST_PAD_DIM;
                self.history_tracker.boosts[dst] *= INVERT_SIDE_RELATIVE_32[0];
                self.history_tracker.boosts[dst + 1] *= INVERT_SIDE_RELATIVE_32[1];
                self.history_tracker.boosts[dst + 2] *= INVERT_SIDE_RELATIVE_32[2];
            }
            for q in 0..RIPPLE_ACTION_QUEUE_LEN {
                let dst = q * RIPPLE_ACTION_DIM;
                for d in 0..RIPPLE_ACTION_DIM {
                    self.history_tracker.actions[dst + d] *= INVERT_SIDE_ACTIONS_8[d];
                }
            }
            self.main[29] *= -1.0;
            self.main[30] = 1.0; // is_flipped
        }

        // 8. Normalize all features by NORM_32
        for step in 0..RIPPLE_BALL_SLICES {
            let dst = step * RIPPLE_BALL_SLICE_DIM;
            for d in 0..RIPPLE_BALL_SLICE_DIM {
                self.ball[dst + d] /= NORM_32[d];
            }
        }
        for d in 0..RIPPLE_MAIN_DIM {
            self.main[d] /= NORM_32[d];
        }
        for s in 0..other_count {
            let base = s * RIPPLE_OTHER_DIM;
            for d in 0..RIPPLE_OTHER_DIM {
                self.others[base + d] /= NORM_32[d];
            }
        }
        for p in 0..MAX_PADS {
            let dst = p * RIPPLE_BOOST_PAD_DIM;
            self.history_tracker.boosts[dst] /= NORM_32[0];
            self.history_tracker.boosts[dst + 1] /= NORM_32[1];
            self.history_tracker.boosts[dst + 2] /= NORM_32[2];
        }
    }
}
