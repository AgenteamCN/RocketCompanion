//! Kickoff V1 (75d/56d) & V2 (42d/78d) observation builders, `CarJumpAirTimeTracker`,
//! 6-head MultiDiscrete `[3, 3, 3, 2, 2, 2]` Tanh MLP inference, and physical action masking.

use rc_physics_sim::{
    layout::{CarControlsPod, GameStateBufferPod},
    sim_instance::SimInstance,
};

use crate::{safetensors_store::ParsedPolicyWeights, simd_math::mat_vec_bias};

const TICK_TIME: f32 = 1.0 / 120.0;
const JUMP_MIN_TIME: f32 = 0.025;
const JUMP_RESET_TIME_PAD: f32 = 1.0 / 40.0;
const JUMP_MAX_TIME: f32 = 0.2;
const BIG_PAD_BLUE: [usize; 6] = [4, 5, 0, 1, 2, 3];
const BIG_PAD_ORANGE: [usize; 6] = [3, 2, 1, 0, 5, 4];

#[derive(Clone, Copy, Default)]
pub struct CarJumpAirTimeTracker {
    pub is_jumping: bool,
    pub has_jumped: bool,
    pub jump_time: f32,
    pub air_time: f32,
    pub last_jump_control: bool,
}

impl CarJumpAirTimeTracker {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn step_tick(&mut self, jump_control_bool: bool, is_on_ground_post_tick: bool) {
        let jump_pressed = jump_control_bool && !self.last_jump_control;
        let is_on_ground = is_on_ground_post_tick;
        if is_on_ground && !self.is_jumping
            && !(self.has_jumped && self.jump_time < JUMP_MIN_TIME + JUMP_RESET_TIME_PAD)
        {
            self.has_jumped = false;
            self.jump_time = 0.0;
        }
        if self.is_jumping {
            self.is_jumping = self.jump_time < JUMP_MIN_TIME
                || (jump_control_bool && self.jump_time < JUMP_MAX_TIME);
        } else if is_on_ground && jump_pressed {
            self.is_jumping = true;
            self.jump_time = 0.0;
        }
        if self.is_jumping {
            self.has_jumped = true;
        }
        if self.is_jumping || self.has_jumped {
            self.jump_time += TICK_TIME;
        }
        self.air_time = if is_on_ground { 0.0 } else { self.air_time + TICK_TIME };
        self.last_jump_control = jump_control_bool;
    }
}

#[derive(Clone, Copy)]
pub struct KickoffSlotState {
    pub tracker: CarJumpAirTimeTracker,
    pub prev_action_vec: [f32; 6],
    pub last_raw_controls: CarControlsPod,
    pub last_multi_discrete: [u8; 6],
    pub channel_mode_separated: bool,
}

impl Default for KickoffSlotState {
    fn default() -> Self {
        Self {
            tracker: CarJumpAirTimeTracker::default(),
            prev_action_vec: [0.0; 6],
            last_raw_controls: CarControlsPod::default(),
            last_multi_discrete: [1, 1, 1, 0, 0, 0],
            channel_mode_separated: false,
        }
    }
}

impl KickoffSlotState {
    pub fn reset(&mut self) {
        self.tracker.reset();
        self.prev_action_vec = [0.0; 6];
        self.last_raw_controls = CarControlsPod::default();
        self.last_multi_discrete = [1, 1, 1, 0, 0, 0];
    }
}

#[inline]
pub const fn pack_multi_discrete_6(act: &[u8; 6]) -> i32 {
    ((act[0] & 3) as i32)
        | (((act[1] & 3) as i32) << 2)
        | (((act[2] & 3) as i32) << 4)
        | (((act[3] & 1) as i32) << 6)
        | (((act[4] & 1) as i32) << 7)
        | (((act[5] & 1) as i32) << 8)
}

#[inline]
pub fn multi_discrete_to_controls(act: &[u8; 6]) -> CarControlsPod {
    let (thr_val, str_val, rol_val) = (
        (act[0] as i32 - 1) as f32,
        (act[1] as i32 - 1) as f32,
        (act[2] as i32 - 1) as f32,
    );
    CarControlsPod {
        throttle: thr_val, steer: str_val, pitch: -thr_val, yaw: str_val, roll: rol_val,
        jump: if act[3] == 1 { 1.0 } else { 0.0 },
        boost: if act[4] == 1 { 1.0 } else { 0.0 },
        handbrake: if act[5] == 1 { 1.0 } else { 0.0 },
    }
}

#[inline]
pub fn decode_6head_multi_discrete(logits: &[f32; 15]) -> [u8; 6] {
    let argmax3 = |b: usize| -> u8 {
        let best = usize::from(logits[b + 1] > logits[b]);
        if logits[b + 2] > logits[b + best] { 2 } else { best as u8 }
    };
    let argmax2 = |b: usize| -> u8 { u8::from(logits[b + 1] > logits[b]) };
    [argmax3(0), argmax3(3), argmax3(6), argmax2(9), argmax2(11), argmax2(13)]
}

#[inline]
pub fn apply_kickoff_v2_action_mask(obs: &[f32], logits: &mut [f32; 15]) {
    let on_ground = obs[20] > 0.5;
    let has_flip_or_jump = obs[21] > 0.5;
    let is_flipping = obs[22] > 0.5;
    let is_jumping = obs[23] > 0.5;
    let has_nitro = obs[25] > 1e-4;
    let prev_jump = obs[30] > 0.5;
    let cz = obs[4] * 5120.0;
    let b_up = obs[18] * 5000.0;
    let dir_fwd = obs[13];
    if !has_nitro || (is_flipping && dir_fwd < 0.25) {
        logits[12] = -1e9;
    }
    if on_ground {
        logits[6] = -1e9;
        logits[8] = -1e9;
        if is_jumping && prev_jump && cz > 34.0 && b_up < 95.0 {
            logits[10] = -1e9;
        }
    } else {
        logits[14] = -1e9;
        if (!has_flip_or_jump && !is_jumping)
            || (!is_jumping && prev_jump)
            || (is_jumping && prev_jump && cz > 34.0 && b_up < 95.0)
        {
            logits[10] = -1e9;
        }
    }
}

pub fn sanitize_and_record_tick_controls(
    state: &GameStateBufferPod,
    car_index: usize,
    raw: &CarControlsPod,
    channel_mode_separated: bool,
    prev_action_vec: &mut [f32; 6],
) -> CarControlsPod {
    let c = &state.cars[car_index];
    let b = &state.ball;
    let g = c.is_on_ground > 0.5;
    let mut ctrl = *raw;
    if !g {
        ctrl.handbrake = 0.0;
        if channel_mode_separated {
            ctrl.throttle = 0.0;
        }
    }
    if c.is_flipping > 0.5 && ctrl.boost >= 0.5 {
        let (dx, dy, dz) = (b.pos[0] - c.pos[0], b.pos[1] - c.pos[1], b.pos[2] - c.pos[2]);
        let dist = (dx * dx + dy * dy + dz * dz).sqrt() + 1e-6;
        let align = (dx * c.forward[0] + dy * c.forward[1] + dz * c.forward[2]) / dist;
        if align < 0.25 {
            ctrl.boost = 0.0;
        }
    }
    *prev_action_vec = [
        if g { raw.throttle } else { -raw.pitch },
        if g { raw.steer } else { raw.yaw },
        if g { 0.0 } else { ctrl.roll },
        if ctrl.jump >= 0.5 { 1.0 } else { 0.0 },
        if ctrl.boost >= 0.5 { 1.0 } else { 0.0 },
        if g && ctrl.handbrake >= 0.5 { 1.0 } else { 0.0 },
    ];
    ctrl
}

pub fn build_kickoff_v1_obs(
    sim: &SimInstance,
    car_index: usize,
    s: f32,
    tr: &CarJumpAirTimeTracker,
    out: &mut [f32; 75],
) {
    let state = &sim.state_buffer;
    let (b, c, ja) = (&state.ball, &state.cars[car_index], &state.car_jump_air[car_index]);
    let (cx, cy, cz) = (c.pos[0] * s, c.pos[1] * s, c.pos[2]);
    let (vx, vy, vz) = (c.vel[0] * s, c.vel[1] * s, c.vel[2]);
    let (ax, ay, az) = (c.ang_vel[0] * s, c.ang_vel[1] * s, c.ang_vel[2]);
    let (fx, fy, fz) = (c.forward[0] * s, c.forward[1] * s, c.forward[2]);
    let (rx, ry, rz) = (c.right[0] * s, c.right[1] * s, c.right[2]);
    let (ux, uy, uz) = (c.up[0] * s, c.up[1] * s, c.up[2]);
    let (bx, by, bz) = (b.pos[0] * s, b.pos[1] * s, b.pos[2]);
    let (bvx, bvy, bvz) = (b.vel[0] * s, b.vel[1] * s, b.vel[2]);
    let (bax, bay, baz) = (b.ang_vel[0] * s, b.ang_vel[1] * s, b.ang_vel[2]);

    let (relx, rely, relz) = (bx - cx, by - cy, bz - cz);
    let ball_dist = (relx * relx + rely * rely + relz * relz).sqrt();
    let (rvx, rvy, rvz) = (bvx - vx, bvy - vy, bvz - vz);
    let rv_mag = (rvx * rvx + rvy * rvy + rvz * rvz).sqrt();
    let is_jumping = ja.is_jumping > 0.5 || tr.is_jumping;
    let air_time = if ja.air_time > 0.0 { ja.air_time } else { tr.air_time };
    let closing = if ball_dist > 1e-6 { -(relx * rvx + rely * rvy + relz * rvz) / ball_dist } else { 0.0 };
    let (rogx, rogy, rogz) = (-cx, 5120.0 - cy, 320.0 - cz);
    let (rwgx, rwgy, rwgz) = (-cx, -5120.0 - cy, 320.0 - cz);

    out[0..46].copy_from_slice(&[
        (cx + 4096.0) / 5120.0, (4096.0 - cx) / 5120.0, (cy + 5120.0) / 5120.0,
        (5120.0 - cy) / 5120.0, cz / 5120.0, (2000.0 - cz) / 5120.0,
        (ax * rx + ay * ry + az * rz) / 5.5, (ax * ux + ay * uy + az * uz) / 5.5, (ax * fx + ay * fy + az * fz) / 5.5,
        (vx * fx + vy * fy + vz * fz) / 2300.0, (vx * rx + vy * ry + vz * rz) / 2300.0,
        (vx * ux + vy * uy + vz * uz) / 2300.0, (vx * vx + vy * vy + vz * vz).sqrt() / 2300.0,
        (relx * fx + rely * fy + relz * fz) / 5000.0, (relx * rx + rely * ry + relz * rz) / 5000.0,
        (relx * ux + rely * uy + relz * uz) / 5000.0, ball_dist / 5000.0,
        (rvx * fx + rvy * fy + rvz * fz) / 2500.0, (rvx * rx + rvy * ry + rvz * rz) / 2500.0,
        (rvx * ux + rvy * uy + rvz * uz) / 2500.0, rv_mag / 2500.0,
        (bax * rx + bay * ry + baz * rz) / 6.0, (bax * ux + bay * uy + baz * uz) / 6.0, (bax * fx + bay * fy + baz * fz) / 6.0,
        if c.is_on_ground > 0.5 { 1.0 } else { 0.0 }, if c.has_flip_or_jump > 0.5 { 1.0 } else { 0.0 },
        if c.is_flipping > 0.5 { 1.0 } else { 0.0 }, if is_jumping { 1.0 } else { 0.0 },
        air_time.min(2.0) / 2.0, c.boost / 100.0, closing / 5000.0, fz, rz, uz,
        (bx + 4096.0) / 5120.0, (4096.0 - bx) / 5120.0, (by + 5120.0) / 5120.0,
        (5120.0 - by) / 5120.0, bz / 5120.0, (2000.0 - bz) / 5120.0,
        (rogx * fx + rogy * fy + rogz * fz) / 5000.0, (rogx * rx + rogy * ry + rogz * rz) / 5000.0,
        (rogx * ux + rogy * uy + rogz * uz) / 5000.0, (rwgx * fx + rwgy * fy + rwgz * fz) / 5000.0,
        (rwgx * rx + rwgy * ry + rwgz * rz) / 5000.0, (rwgx * ux + rwgy * uy + rwgz * uz) / 5000.0,
    ]);

    let pad_indices = if s < 0.0 { &BIG_PAD_ORANGE } else { &BIG_PAD_BLUE };
    for (k, &pad_idx) in pad_indices.iter().enumerate() {
        let base = 46 + k * 4;
        let ps = &state.pads[pad_idx];
        let ppos = sim.pad_info_buffer[pad_idx].pos;
        let (rpx, rpy, rpz) = (ppos[0] * s - cx, ppos[1] * s - cy, ppos[2] - cz);
        out[base] = (rpx * fx + rpy * fy + rpz * fz) / 5120.0;
        out[base + 1] = (rpx * rx + rpy * ry + rpz * rz) / 5120.0;
        out[base + 2] = if ps.is_active > 0.5 { 1.0 } else { 0.0 };
        out[base + 3] = ps.cooldown / 10.0;
    }

    let (b2gx, b2gy, b2gz) = (-bx, 5120.0 - by, 320.0 - bz);
    let b2g_dist = (b2gx * b2gx + b2gy * b2gy + b2gz * b2gz).sqrt() + 1e-6;
    let (dx, dy, dz) = (b2gx / b2g_dist, b2gy / b2g_dist, b2gz / b2g_dist);
    let (rtx, rty, rtz) = (bx - dx * 95.0 - cx, by - dy * 95.0 - cy, bz - dz * 95.0 - cz);
    out[70..75].copy_from_slice(&[
        1.0,
        ((rtx * fx + rty * fy + rtz * fz) / 5000.0).clamp(-2.0, 2.0),
        ((rtx * rx + rty * ry + rtz * rz) / 5000.0).clamp(-2.0, 2.0),
        dx * fx + dy * fy + dz * fz,
        dx * rx + dy * ry + dz * rz,
    ]);
}

pub fn build_kickoff_v2_obs(
    state: &GameStateBufferPod,
    car_index: usize,
    is_orange: bool,
    prev_action_vec: &[f32; 6],
    out: &mut [f32; 78],
) {
    out.fill(0.0);
    let (c, ja, b) = (&state.cars[car_index], &state.car_jump_air[car_index], &state.ball);
    let (fx, fy, fz) = (c.forward[0], c.forward[1], c.forward[2]);
    let (rx, ry, rz) = (c.right[0], c.right[1], c.right[2]);
    let (ux, uy, uz) = (c.up[0], c.up[1], c.up[2]);
    let (px, py, pz) = (c.pos[0], c.pos[1], c.pos[2]);
    let (vx, vy, vz) = (c.vel[0], c.vel[1], c.vel[2]);
    let (wx, wy, wz) = (c.ang_vel[0], c.ang_vel[1], c.ang_vel[2]);
    let ts = if is_orange { -1.0 } else { 1.0 };
    let (tx, ty, tz) = (ts * px, ts * py, pz);
    let (relx, rely, relz) = (b.pos[0] - px, b.pos[1] - py, b.pos[2] - pz);
    let (b_fwd, b_right, b_up) = (
        relx * fx + rely * fy + relz * fz,
        relx * rx + rely * ry + relz * rz,
        relx * ux + rely * uy + relz * uz,
    );
    let ball_dist = (relx * relx + rely * rely + relz * relz).sqrt();
    let inv_dist = 1.0 / ball_dist.max(1e-6);
    let closing = if ball_dist > 1e-6 { (relx * vx + rely * vy + relz * vz) * inv_dist } else { 0.0 };

    out[0..27].copy_from_slice(&[
        (tx + 4096.0) / 5120.0, (4096.0 - tx) / 5120.0, (ty + 5120.0) / 5120.0,
        (5120.0 - ty) / 5120.0, tz / 5120.0, (2000.0 - tz) / 5120.0,
        (wx * rx + wy * ry + wz * rz) / 5.5, (wx * ux + wy * uy + wz * uz) / 5.5, (wx * fx + wy * fy + wz * fz) / 5.5,
        (vx * fx + vy * fy + vz * fz) / 2300.0, (vx * rx + vy * ry + vz * rz) / 2300.0,
        (vx * ux + vy * uy + vz * uz) / 2300.0, (vx * vx + vy * vy + vz * vz).sqrt() / 2300.0,
        b_fwd * inv_dist, b_right * inv_dist, b_up * inv_dist,
        b_fwd / 5000.0, b_right / 5000.0, b_up / 5000.0, ball_dist / 5000.0,
        if c.is_on_ground > 0.5 { 1.0 } else { 0.0 }, if c.has_flip_or_jump > 0.5 { 1.0 } else { 0.0 },
        if c.is_flipping > 0.5 { 1.0 } else { 0.0 }, if ja.is_jumping > 0.5 { 1.0 } else { 0.0 },
        ja.air_time.min(2.0) / 2.0, c.boost / 100.0, closing / 2300.0,
    ]);
    out[27..33].copy_from_slice(prev_action_vec);
    out[33..36].copy_from_slice(&[fz, rz, uz]);
}

pub fn forward_kickoff_tanh_mlp(
    obs: &[f32],
    model: &ParsedPolicyWeights,
    out_logits: &mut [f32; 15],
) -> bool {
    let get = |a: &str, b: &str| model.f32_slice(a).or_else(|| model.f32_slice(b));
    let (Some(w0), Some(b0), Some(w2), Some(b2), Some(w4), Some(b4)) = (
        get("actor_mlp.0.weight", "actor.0.weight"),
        get("actor_mlp.0.bias", "actor.0.bias"),
        get("actor_mlp.2.weight", "actor.2.weight"),
        get("actor_mlp.2.bias", "actor.2.bias"),
        get("actor_mlp.4.weight", "actor.4.weight"),
        get("actor_mlp.4.bias", "actor.4.bias"),
    ) else {
        return false;
    };
    let h_dim = b0.len();
    let in_dim = w0.len().checked_div(h_dim).unwrap_or(0);
    if h_dim == 0 || h_dim > 512 || in_dim == 0 || obs.len() < in_dim {
        return false;
    }
    let mut h1 = [0.0f32; 512];
    let mut h2 = [0.0f32; 512];
    mat_vec_bias(&obs[..in_dim], in_dim, h_dim, w0, Some(b0), &mut h1[..h_dim]);
    for v in &mut h1[..h_dim] {
        *v = v.tanh();
    }
    mat_vec_bias(&h1[..h_dim], h_dim, h_dim, w2, Some(b2), &mut h2[..h_dim]);
    for v in &mut h2[..h_dim] {
        *v = v.tanh();
    }
    mat_vec_bias(&h2[..h_dim], h_dim, 15, w4, Some(b4), out_logits);
    true
}
