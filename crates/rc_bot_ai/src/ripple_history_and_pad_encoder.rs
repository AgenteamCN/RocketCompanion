//! BoostPad state encoding, player/pad/demo timer tracking, 276-action lookup table,
//! and 6-step delayed action ring buffer for Ripple v1.1 (`rolv/ripple/1.1`).

use rc_physics_sim::layout::{
    CarControlsPod, CarStatePod, GameStateBufferPod, MAX_CARS, MAX_PADS,
};

use crate::layout_and_specs::{CANONICAL_TO_WASM_PAD_INDEX, RIPPLE_ACTION_QUEUE_LEN};

pub const RIPPLE_TICK_SKIP: f32 = 4.0;
pub const RIPPLE_TICKS_PER_SECOND: f32 = 120.0;
pub const RIPPLE_DT_SEC: f32 = RIPPLE_TICK_SKIP / RIPPLE_TICKS_PER_SECOND;

pub const RIPPLE_ACTION_DIM: usize = 8;
pub const RIPPLE_ACTIONS_TOTAL_DIM: usize = RIPPLE_ACTION_QUEUE_LEN * RIPPLE_ACTION_DIM; // 48
pub const RIPPLE_BOOST_PAD_DIM: usize = 5;
pub const RIPPLE_BOOSTS_TOTAL_DIM: usize = MAX_PADS * RIPPLE_BOOST_PAD_DIM; // 170
pub const RIPPLE_NUM_ACTIONS: usize = 276;

pub const INVERT_SIDE_ACTIONS_8: [f32; RIPPLE_ACTION_DIM] =
    [1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

/// Canonical Y-sorted 34 boost pad coordinates (`CommonValues::BOOST_LOCATIONS`).
pub const CANONICAL_BOOST_LOCATIONS: [[f32; 3]; MAX_PADS] = [
    [0.0, -4240.0, 70.0],
    [-1792.0, -4184.0, 70.0],
    [1792.0, -4184.0, 70.0],
    [-3072.0, -4096.0, 73.0],
    [3072.0, -4096.0, 73.0],
    [-940.0, -3308.0, 70.0],
    [940.0, -3308.0, 70.0],
    [0.0, -2816.0, 70.0],
    [-3584.0, -2484.0, 70.0],
    [3584.0, -2484.0, 70.0],
    [-1788.0, -2300.0, 70.0],
    [1788.0, -2300.0, 70.0],
    [-2048.0, -1036.0, 70.0],
    [0.0, -1024.0, 70.0],
    [2048.0, -1036.0, 70.0],
    [-3584.0, 0.0, 73.0],
    [-1024.0, 0.0, 70.0],
    [1024.0, 0.0, 70.0],
    [3584.0, 0.0, 73.0],
    [-2048.0, 1036.0, 70.0],
    [0.0, 1024.0, 70.0],
    [2048.0, 1036.0, 70.0],
    [-1788.0, 2300.0, 70.0],
    [1788.0, 2300.0, 70.0],
    [-3584.0, 2484.0, 70.0],
    [3584.0, 2484.0, 70.0],
    [0.0, 2816.0, 70.0],
    [-940.0, 3310.0, 70.0],
    [940.0, 3308.0, 70.0],
    [-3072.0, 4096.0, 73.0],
    [3072.0, 4096.0, 73.0],
    [-1792.0, 4184.0, 70.0],
    [1792.0, 4184.0, 70.0],
    [0.0, 4240.0, 70.0],
];

#[inline]
fn round3(v: f32) -> f32 {
    let r = (v * 1000.0).round() / 1000.0;
    if r == 0.0 { 0.0 } else { r }
}

/// Builds Ripple v1.1's 276-action lookup table (`RippleLookupAction([-1, 0, 0.5, 1], 5, 5, 16)`).
pub fn build_ripple_276_action_table() -> [[f32; RIPPLE_ACTION_DIM]; RIPPLE_NUM_ACTIONS] {
    let mut table = [[0.0f32; RIPPLE_ACTION_DIM]; RIPPLE_NUM_ACTIONS];
    let throttles = [-1.0f32, 0.0, 0.5, 1.0];
    let steers = [-1.0f32, -0.5, 0.0, 0.5, 1.0];
    let torque_bins = [-1.0f32, -0.5, 0.0, 0.5, 1.0];
    let flip_bins = 16i32;

    let mut idx = 0usize;

    // 1. Ground (60 actions)
    for &throttle in &throttles {
        for &steer in &steers {
            for &boost in &[0.0f32, 1.0] {
                for &handbrake in &[0.0f32, 1.0] {
                    if boost == 1.0 && throttle != 1.0 {
                        continue;
                    }
                    let yaw = steer;
                    table[idx] = [
                        round3(throttle),
                        round3(steer),
                        0.0,
                        round3(yaw),
                        0.0,
                        0.0,
                        boost,
                        handbrake,
                    ];
                    idx += 1;
                }
            }
        }
    }

    // 2. Aerial (182 actions)
    for &pitch in &torque_bins {
        for &yaw in &torque_bins {
            for &roll in &torque_bins {
                if pitch == 0.0 && roll == 0.0 {
                    continue;
                }
                let mag = pitch.abs().max(yaw.abs()).max(roll.abs());
                if mag < 1.0 {
                    continue;
                }
                for &boost in &[0.0f32, 1.0] {
                    let throttle = boost;
                    let steer = yaw;
                    table[idx] = [
                        round3(throttle),
                        round3(steer),
                        round3(pitch),
                        round3(yaw),
                        round3(roll),
                        0.0,
                        boost,
                        0.0,
                    ];
                    idx += 1;
                }
            }
        }
    }

    // 3. Flips & Jumps (34 actions: 1 empty jump + 16 angles x 2 boost, with jump=1, handbrake=1)
    for i in -1..flip_bins {
        let mut pitch = 0.0f32;
        let mut roll = 0.0f32;
        if i >= 0 {
            let angle = (2.0 * core::f32::consts::PI * (i as f32)) / (flip_bins as f32);
            pitch = angle.sin();
            roll = angle.cos();
            let mag = pitch.abs().max(roll.abs());
            pitch /= mag;
            roll /= mag;
        }
        for &boost in &[0.0f32, 1.0] {
            let throttle = boost;
            table[idx] = [
                round3(throttle),
                0.0,
                round3(pitch),
                0.0,
                round3(roll),
                1.0,
                boost,
                1.0,
            ];
            idx += 1;
        }
    }

    debug_assert_eq!(idx, RIPPLE_NUM_ACTIONS);
    table
}

#[inline]
pub fn controls_from_action_row(row: &[f32; RIPPLE_ACTION_DIM]) -> CarControlsPod {
    CarControlsPod {
        throttle: row[0],
        steer: row[1],
        pitch: row[2],
        yaw: row[3],
        roll: row[4],
        jump: if row[5] > 0.5 { 1.0 } else { 0.0 },
        boost: if row[6] > 0.5 { 1.0 } else { 0.0 },
        handbrake: if row[7] > 0.5 { 1.0 } else { 0.0 },
    }
}

/// Multiplies a 3D world vector `[vx, vy, vz]` by the car's rotation matrix `[fwd, right, up]`.
#[inline]
pub fn mat_mul_rot3(vx: f32, vy: f32, vz: f32, car: &CarStatePod) -> [f32; 3] {
    [
        vx * car.forward[0] + vy * car.forward[1] + vz * car.forward[2],
        vx * car.right[0] + vy * car.right[1] + vz * car.right[2],
        vx * car.up[0] + vy * car.up[1] + vz * car.up[2],
    ]
}

/// Encapsulates the 6-step delayed action ring buffer, BoostPad state encoder,
/// and per-car action/demo/boost/jump/flip timers for Ripple v1.1 (`rolv/ripple/1.1`).
#[derive(Clone)]
pub struct RippleHistoryAndPadTracker {
    pub actions: [f32; RIPPLE_ACTIONS_TOTAL_DIM],
    pub boosts: [f32; RIPPLE_BOOSTS_TOTAL_DIM],
    pub action_queue: [f32; RIPPLE_ACTIONS_TOTAL_DIM],
    pub is_queue_reset: bool,
    pub prev_executed_action: [f32; RIPPLE_ACTION_DIM],
    pub prev_prev_action: [f32; RIPPLE_ACTION_DIM],

    pub demo_timers: [f32; MAX_CARS],
    pub boost_timers: [f32; MAX_PADS],
    pub boost_times: [f32; MAX_CARS],
    pub prev_on_grounds: [u8; MAX_CARS],
    pub is_jumpings: [u8; MAX_CARS],
    pub has_jumpeds: [u8; MAX_CARS],
    pub jump_times: [f32; MAX_CARS],
    pub air_times: [f32; MAX_CARS],
    pub has_double_jumpeds: [u8; MAX_CARS],
    pub has_flippeds: [u8; MAX_CARS],
    pub flip_times: [f32; MAX_CARS],
    pub flip_dirs: [f32; MAX_CARS * 2],
    pub handbrakes: [f32; MAX_CARS],
}

impl Default for RippleHistoryAndPadTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl RippleHistoryAndPadTracker {
    pub fn new() -> Self {
        let mut tracker = Self {
            actions: [0.0; RIPPLE_ACTIONS_TOTAL_DIM],
            boosts: [0.0; RIPPLE_BOOSTS_TOTAL_DIM],
            action_queue: [0.0; RIPPLE_ACTIONS_TOTAL_DIM],
            is_queue_reset: false,
            prev_executed_action: [0.0; RIPPLE_ACTION_DIM],
            prev_prev_action: [0.0; RIPPLE_ACTION_DIM],
            demo_timers: [0.0; MAX_CARS],
            boost_timers: [0.0; MAX_PADS],
            boost_times: [0.0; MAX_CARS],
            prev_on_grounds: [1; MAX_CARS],
            is_jumpings: [0; MAX_CARS],
            has_jumpeds: [0; MAX_CARS],
            jump_times: [0.0; MAX_CARS],
            air_times: [0.0; MAX_CARS],
            has_double_jumpeds: [0; MAX_CARS],
            has_flippeds: [0; MAX_CARS],
            flip_times: [0.0; MAX_CARS],
            flip_dirs: [0.0; MAX_CARS * 2],
            handbrakes: [0.0; MAX_CARS],
        };
        tracker.reset(true);
        tracker
    }

    pub fn reset(&mut self, is_kickoff: bool) {
        self.action_queue.fill(0.0);
        self.is_queue_reset = !is_kickoff;
        self.prev_executed_action.fill(0.0);
        self.prev_prev_action.fill(0.0);

        self.demo_timers.fill(0.0);
        self.boost_timers.fill(0.0);
        self.boost_times.fill(0.0);
        self.prev_on_grounds.fill(1);
        self.is_jumpings.fill(0);
        self.has_jumpeds.fill(0);
        self.jump_times.fill(0.0);
        self.air_times.fill(0.0);
        self.has_double_jumpeds.fill(0);
        self.has_flippeds.fill(0);
        self.flip_times.fill(0.0);
        self.flip_dirs.fill(0.0);
        self.handbrakes.fill(0.0);
    }

    /// Updates boost pad timers, demo timers, and self player timers for one 4-tick step.
    pub fn update_timers(
        &mut self,
        state: &GameStateBufferPod,
        self_car_index: usize,
        active_car_mask: u32,
    ) {
        for p in 0..MAX_PADS {
            let wasm_pad_idx = CANONICAL_TO_WASM_PAD_INDEX[p];
            let pad = &state.pads[wasm_pad_idx];
            if pad.is_active > 0.5 {
                self.boost_timers[p] = 0.0;
            } else if pad.cooldown > 0.0 {
                self.boost_timers[p] = pad.cooldown.min(10.0);
            } else {
                let mut t = self.boost_timers[p] - RIPPLE_DT_SEC;
                if t <= 0.0 {
                    t = if CANONICAL_BOOST_LOCATIONS[p][2] > 72.0 {
                        10.0
                    } else {
                        4.0
                    };
                }
                self.boost_timers[p] = t.clamp(0.0, 10.0);
            }
        }

        let num_cars = (state.header.num_cars as usize).min(MAX_CARS);
        for c_idx in 0..num_cars {
            if (active_car_mask & (1u32 << c_idx)) == 0 {
                continue;
            }
            let car = &state.cars[c_idx];
            if car.is_demoed > 0.0 {
                if car.is_demoed > 0.002 {
                    self.demo_timers[c_idx] = car.is_demoed;
                } else if self.demo_timers[c_idx] <= 0.0 {
                    self.demo_timers[c_idx] = 3.0;
                } else {
                    self.demo_timers[c_idx] = (self.demo_timers[c_idx] - RIPPLE_DT_SEC).max(0.0);
                }
            } else {
                self.demo_timers[c_idx] = 0.0;
            }
        }

        let c_idx = self_car_index.min(MAX_CARS - 1);
        let car = &state.cars[c_idx];
        let on_ground = car.is_on_ground > 0.5;
        let last_act_off = (RIPPLE_ACTION_QUEUE_LEN - 1) * RIPPLE_ACTION_DIM;
        let (last_pitch, last_yaw, last_roll, last_jump, last_boost, last_handbrake) =
            if self.is_queue_reset {
                (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
            } else {
                (
                    self.action_queue[last_act_off + 2],
                    self.action_queue[last_act_off + 3],
                    self.action_queue[last_act_off + 4],
                    self.action_queue[last_act_off + 5],
                    self.action_queue[last_act_off + 6],
                    self.action_queue[last_act_off + 7],
                )
            };
        let prev_jump = self.prev_prev_action[5];

        if last_boost == 0.0 && self.boost_times[c_idx] == 12.0 {
            self.boost_times[c_idx] = 0.0;
        } else if self.boost_times[c_idx] != 0.0 || last_boost != 0.0 {
            self.boost_times[c_idx] = (self.boost_times[c_idx] + RIPPLE_TICK_SKIP).min(12.0);
        } else {
            self.boost_times[c_idx] = 0.0;
        }

        if self.prev_on_grounds[c_idx] != 0 && self.is_jumpings[c_idx] == 0 {
            self.has_jumpeds[c_idx] = 0;
        }
        if self.is_jumpings[c_idx] != 0 {
            self.is_jumpings[c_idx] = u8::from(
                self.jump_times[c_idx] < 3.0 || (last_jump > 0.0 && self.jump_times[c_idx] < 24.0),
            );
        } else if last_jump > 0.0 && !(prev_jump > 0.0) && self.prev_on_grounds[c_idx] != 0 {
            self.is_jumpings[c_idx] = 1;
            self.jump_times[c_idx] = 0.0;
        }

        if self.is_jumpings[c_idx] != 0 {
            self.has_jumpeds[c_idx] = 1;
            self.jump_times[c_idx] = (self.jump_times[c_idx] + RIPPLE_TICK_SKIP).min(24.0);
        } else {
            self.jump_times[c_idx] = 0.0;
        }

        if on_ground {
            self.has_double_jumpeds[c_idx] = 0;
            self.has_flippeds[c_idx] = 0;
            self.air_times[c_idx] = 0.0;
            self.flip_times[c_idx] = 0.0;
            self.flip_dirs[c_idx * 2] = 0.0;
            self.flip_dirs[c_idx * 2 + 1] = 0.0;
        } else {
            if self.has_jumpeds[c_idx] != 0 && self.is_jumpings[c_idx] == 0 {
                self.air_times[c_idx] = (self.air_times[c_idx] + RIPPLE_TICK_SKIP).min(150.0);
            } else {
                self.air_times[c_idx] = 0.0;
            }

            if self.has_jumpeds[c_idx] != 0
                && last_jump > 0.0
                && !(prev_jump > 0.0)
                && self.air_times[c_idx] < 150.0
                && self.has_double_jumpeds[c_idx] == 0
                && self.has_flippeds[c_idx] == 0
            {
                let mag = last_pitch.abs() + last_yaw.abs() + last_roll.abs();
                if mag >= 0.5 {
                    self.flip_times[c_idx] = 0.0;
                    self.has_flippeds[c_idx] = 1;
                    let mut fx = -last_pitch;
                    let mut fy = last_yaw + last_roll;
                    let flen = fx.hypot(fy);
                    if flen > 1e-6 {
                        fx /= flen;
                        fy /= flen;
                    }
                    self.flip_dirs[c_idx * 2] = fx;
                    self.flip_dirs[c_idx * 2 + 1] = fy;
                } else {
                    self.has_double_jumpeds[c_idx] = 1;
                }
            }
        }

        if self.has_flippeds[c_idx] != 0 {
            self.flip_times[c_idx] = (self.flip_times[c_idx] + RIPPLE_TICK_SKIP).min(120.0);
        }

        if last_handbrake > 0.0 {
            self.handbrakes[c_idx] = (self.handbrakes[c_idx] + 5.0 * RIPPLE_DT_SEC).min(1.0);
        } else {
            self.handbrakes[c_idx] = (self.handbrakes[c_idx] - 2.0 * RIPPLE_DT_SEC).max(0.0);
        }

        self.prev_on_grounds[c_idx] = u8::from(on_ground);
    }

    /// Encodes the 6-step action queue (`[6 * 8]`) and 34 boost pads (`[34 * 5]`) in local car frame.
    pub fn encode_actions_and_boost_pads(&mut self, self_car: &CarStatePod) {
        if self.is_queue_reset {
            self.actions.fill(0.0);
        } else {
            self.actions.copy_from_slice(&self.action_queue);
        }

        for p in 0..MAX_PADS {
            let loc = CANONICAL_BOOST_LOCATIONS[p];
            let rel_pos = mat_mul_rot3(
                loc[0] - self_car.pos[0],
                loc[1] - self_car.pos[1],
                loc[2] - self_car.pos[2],
                self_car,
            );
            let dst = p * RIPPLE_BOOST_PAD_DIM;
            self.boosts[dst] = rel_pos[0];
            self.boosts[dst + 1] = rel_pos[1];
            self.boosts[dst + 2] = rel_pos[2];
            self.boosts[dst + 3] = if loc[2] > 72.0 { 1.0 } else { 0.12 };
            self.boosts[dst + 4] = self.boost_timers[p] / 10.0;
        }
    }

    /// Pushes the newly selected action index (`0..275`) into the 6-step delayed queue
    /// and returns the action at the tail of the queue (`action_queue[5]`) as `CarControlsPod`.
    pub fn step_delayed_action_queue(
        &mut self,
        action_idx: usize,
        action_table: &[[f32; RIPPLE_ACTION_DIM]; RIPPLE_NUM_ACTIONS],
    ) -> CarControlsPod {
        let new_arr = action_table
            .get(action_idx)
            .copied()
            .unwrap_or([0.0; RIPPLE_ACTION_DIM]);

        if self.is_queue_reset {
            for q in 0..RIPPLE_ACTION_QUEUE_LEN {
                let off = q * RIPPLE_ACTION_DIM;
                self.action_queue[off..off + RIPPLE_ACTION_DIM].copy_from_slice(&new_arr);
            }
            self.is_queue_reset = false;
        }

        let tail_off = (RIPPLE_ACTION_QUEUE_LEN - 1) * RIPPLE_ACTION_DIM;
        self.prev_executed_action
            .copy_from_slice(&self.action_queue[tail_off..tail_off + RIPPLE_ACTION_DIM]);

        for q in (1..RIPPLE_ACTION_QUEUE_LEN).rev() {
            let dst = q * RIPPLE_ACTION_DIM;
            let src = (q - 1) * RIPPLE_ACTION_DIM;
            self.action_queue.copy_within(src..src + RIPPLE_ACTION_DIM, dst);
        }

        self.action_queue[0..RIPPLE_ACTION_DIM].copy_from_slice(&new_arr);

        controls_from_action_row(&self.prev_executed_action)
    }
}
