//! Standard `AdvancedObs` builders (`Chronos v2.1`, `Dice`, `Kira`, `Rain 3v3`),
//! player feature encoders (`Standard 29`, `Ducky 29/35`), and physics coordinate transforms.

use rc_physics_sim::layout::{
    BallStatePod, CarControlsPod, CarStatePod, GameStateBufferPod, MAX_CARS, MAX_PADS,
};

use crate::layout_and_specs::{
    ANG_VEL_COEF, BLUE_GOAL_BACK, CANONICAL_TO_WASM_PAD_INDEX, MAX_MLP_OBS_DIM, MIRROR_X_PAD_INDEX,
    ORANGE_GOAL_BACK, POS_COEF, VEL_COEF,
};

#[derive(Clone, Copy, Default)]
pub struct CarPhysSnapshot {
    pub pos_x: f32,
    pub pos_y: f32,
    pub pos_z: f32,
    pub vel_x: f32,
    pub vel_y: f32,
    pub vel_z: f32,
    pub ang_vel_x: f32,
    pub ang_vel_y: f32,
    pub ang_vel_z: f32,
    pub fwd_x: f32,
    pub fwd_y: f32,
    pub fwd_z: f32,
    pub right_x: f32,
    pub right_y: f32,
    pub right_z: f32,
    pub up_x: f32,
    pub up_y: f32,
    pub up_z: f32,
    pub boost: f32,
    pub is_on_ground: bool,
    pub has_flip_or_jump: bool,
    pub has_flip_reset: bool,
    pub is_demoed: bool,
    pub has_jumped: bool,
    pub is_supersonic: bool,
    pub demo_respawn_timer: f32,
    pub air_time_since_jump: f32,
}

#[derive(Clone, Copy, Default)]
pub struct BallPhysSnapshot {
    pub pos_x: f32,
    pub pos_y: f32,
    pub pos_z: f32,
    pub vel_x: f32,
    pub vel_y: f32,
    pub vel_z: f32,
    pub ang_vel_x: f32,
    pub ang_vel_y: f32,
    pub ang_vel_z: f32,
}

#[derive(Clone, Copy, Default)]
pub struct SortedCarCandidate {
    pub car_index: usize,
    pub team: u32,
    pub dist_sq: f32,
}

#[derive(Clone, Copy)]
pub struct BuiltMlpObs {
    pub obs: [f32; MAX_MLP_OBS_DIM],
    pub len: usize,
    pub mirror_x: bool,
}

impl Default for BuiltMlpObs {
    fn default() -> Self {
        Self { obs: [0.0; MAX_MLP_OBS_DIM], len: 0, mirror_x: false }
    }
}

#[inline]
pub fn push3(obs: &mut [f32], ptr: &mut usize, x: f32, y: f32, z: f32) {
    let i = *ptr;
    obs[i] = x;
    obs[i + 1] = y;
    obs[i + 2] = z;
    *ptr = i + 3;
}

#[inline]
pub fn get_car_phys(
    state: &GameStateBufferPod,
    car_index: usize,
    inv: bool,
    mirror_x: bool,
) -> CarPhysSnapshot {
    let cv: &CarStatePod = &state.cars[car_index];
    let ja = &state.car_jump_air[car_index];
    let s = if inv { -1.0f32 } else { 1.0f32 };
    let mx = if mirror_x { -1.0f32 } else { 1.0f32 };

    let is_on_ground = cv.is_on_ground >= 0.5;
    let has_flip_or_jump = cv.has_flip_or_jump.round() as i32 != 0;
    let is_demoed = cv.is_demoed > 0.0;
    let air_time_since_jump = ja.air_time_since_jump;
    let has_jumped = !is_on_ground
        && (ja.is_jumping > 0.5
            || cv.is_flipping >= 0.5
            || air_time_since_jump > 0.0001
            || !has_flip_or_jump);

    CarPhysSnapshot {
        pos_x: cv.pos[0] * s * mx,
        pos_y: cv.pos[1] * s,
        pos_z: cv.pos[2],
        vel_x: cv.vel[0] * s * mx,
        vel_y: cv.vel[1] * s,
        vel_z: cv.vel[2],
        ang_vel_x: cv.ang_vel[0] * s,
        ang_vel_y: cv.ang_vel[1] * s * mx,
        ang_vel_z: cv.ang_vel[2] * mx,
        fwd_x: cv.forward[0] * s * mx,
        fwd_y: cv.forward[1] * s,
        fwd_z: cv.forward[2],
        right_x: cv.right[0] * s,
        right_y: cv.right[1] * s * mx,
        right_z: cv.right[2] * mx,
        up_x: cv.up[0] * s * mx,
        up_y: cv.up[1] * s,
        up_z: cv.up[2],
        boost: cv.boost,
        is_on_ground,
        has_flip_or_jump,
        has_flip_reset: !is_on_ground && has_flip_or_jump && !has_jumped,
        is_demoed,
        has_jumped,
        is_supersonic: cv.is_supersonic >= 0.5,
        demo_respawn_timer: if is_demoed { cv.is_demoed } else { 0.0 },
        air_time_since_jump,
    }
}

#[inline]
pub fn get_ball_phys(bv: &BallStatePod, inv: bool, mirror_x: bool) -> BallPhysSnapshot {
    let s = if inv { -1.0f32 } else { 1.0f32 };
    let mx = if mirror_x { -1.0f32 } else { 1.0f32 };
    BallPhysSnapshot {
        pos_x: bv.pos[0] * s * mx,
        pos_y: bv.pos[1] * s,
        pos_z: bv.pos[2],
        vel_x: bv.vel[0] * s * mx,
        vel_y: bv.vel[1] * s,
        vel_z: bv.vel[2],
        ang_vel_x: bv.ang_vel[0] * s,
        ang_vel_y: bv.ang_vel[1] * s * mx,
        ang_vel_z: bv.ang_vel[2] * mx,
    }
}

#[inline]
pub fn rot_dot(phys: &CarPhysSnapshot, vx: f32, vy: f32, vz: f32) -> [f32; 3] {
    [
        phys.fwd_x * vx + phys.fwd_y * vy + phys.fwd_z * vz,
        phys.right_x * vx + phys.right_y * vy + phys.right_z * vz,
        phys.up_x * vx + phys.up_y * vy + phys.up_z * vz,
    ]
}

#[inline]
pub fn mirror_controls_x(c: CarControlsPod) -> CarControlsPod {
    CarControlsPod {
        throttle: c.throttle,
        steer: if c.steer == 0.0 { 0.0 } else { -c.steer },
        pitch: c.pitch,
        yaw: if c.yaw == 0.0 { 0.0 } else { -c.yaw },
        roll: if c.roll == 0.0 { 0.0 } else { -c.roll },
        jump: c.jump,
        boost: c.boost,
        handbrake: c.handbrake,
    }
}

#[inline]
pub fn encode_car_controls_8(c: CarControlsPod) -> [f32; 8] {
    [
        c.throttle,
        c.steer,
        c.pitch,
        c.yaw,
        c.roll,
        if c.jump > 0.0 { 1.0 } else { 0.0 },
        if c.boost > 0.0 { 1.0 } else { 0.0 },
        if c.handbrake > 0.0 { 1.0 } else { 0.0 },
    ]
}

pub fn collect_teammates_and_opponents(
    state: &GameStateBufferPod,
    self_car_index: usize,
    norm_self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
    max_teammates: usize,
    max_opponents: usize,
) -> ([SortedCarCandidate; MAX_CARS], usize, [SortedCarCandidate; MAX_CARS], usize) {
    let mut teammates = [SortedCarCandidate::default(); MAX_CARS];
    let mut tm_len = 0usize;
    let mut opponents = [SortedCarCandidate::default(); MAX_CARS];
    let mut opp_len = 0usize;

    let [bx, by, bz] = state.ball.pos;
    let mask = if active_car_mask != 0 {
        active_car_mask & 0xFF
    } else {
        let count = (state.header.num_cars as usize).clamp(1, MAX_CARS);
        (1u32 << count) - 1
    };

    for idx in 0..MAX_CARS {
        if idx == self_car_index || (mask & (1u32 << idx)) == 0 {
            continue;
        }
        let cv = &state.cars[idx];
        let (dx, dy, dz) = (cv.pos[0] - bx, cv.pos[1] - by, cv.pos[2] - bz);
        let team = if slot_teams[idx] == 1 { 1 } else { 0 };
        let cand = SortedCarCandidate { car_index: idx, team, dist_sq: dx * dx + dy * dy + dz * dz };
        if team == norm_self_team {
            teammates[tm_len] = cand;
            tm_len += 1;
        } else {
            opponents[opp_len] = cand;
            opp_len += 1;
        }
    }

    let cmp_cand = |a: &SortedCarCandidate, b: &SortedCarCandidate| {
        a.dist_sq
            .partial_cmp(&b.dist_sq)
            .unwrap_or(core::cmp::Ordering::Equal)
            .then_with(|| a.car_index.cmp(&b.car_index))
    };
    teammates[..tm_len].sort_by(cmp_cand);
    opponents[..opp_len].sort_by(cmp_cand);
    (teammates, tm_len.min(max_teammates), opponents, opp_len.min(max_opponents))
}

pub fn write_standard_player_29(
    out: &mut [f32],
    offset: usize,
    p: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
) -> usize {
    let mut ptr = offset;
    push3(out, &mut ptr, p.pos_x * POS_COEF, p.pos_y * POS_COEF, p.pos_z * POS_COEF);
    push3(out, &mut ptr, p.fwd_x, p.fwd_y, p.fwd_z);
    push3(out, &mut ptr, p.up_x, p.up_y, p.up_z);
    push3(out, &mut ptr, p.vel_x * VEL_COEF, p.vel_y * VEL_COEF, p.vel_z * VEL_COEF);
    push3(out, &mut ptr, p.ang_vel_x * ANG_VEL_COEF, p.ang_vel_y * ANG_VEL_COEF, p.ang_vel_z * ANG_VEL_COEF);

    let loc_ang = rot_dot(p, p.ang_vel_x, p.ang_vel_y, p.ang_vel_z);
    push3(out, &mut ptr, loc_ang[0] * ANG_VEL_COEF, loc_ang[1] * ANG_VEL_COEF, loc_ang[2] * ANG_VEL_COEF);

    let loc_bp = rot_dot(p, ball.pos_x - p.pos_x, ball.pos_y - p.pos_y, ball.pos_z - p.pos_z);
    push3(out, &mut ptr, loc_bp[0] * POS_COEF, loc_bp[1] * POS_COEF, loc_bp[2] * POS_COEF);

    let loc_bv = rot_dot(p, ball.vel_x - p.vel_x, ball.vel_y - p.vel_y, ball.vel_z - p.vel_z);
    push3(out, &mut ptr, loc_bv[0] * VEL_COEF, loc_bv[1] * VEL_COEF, loc_bv[2] * VEL_COEF);

    out[ptr] = (p.boost / 100.0).clamp(0.0, 1.0);
    out[ptr + 1] = if p.is_on_ground { 1.0 } else { 0.0 };
    out[ptr + 2] = if p.has_flip_or_jump { 1.0 } else { 0.0 };
    out[ptr + 3] = if p.is_demoed { 1.0 } else { 0.0 };
    out[ptr + 4] = if p.has_jumped { 1.0 } else { 0.0 };
    ptr + 5
}

pub fn write_ducky_player_features(
    obs: &mut [f32],
    mut ptr: usize,
    p: &CarPhysSnapshot,
    self_phys: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
    include_owner_rel: bool,
) -> usize {
    push3(obs, &mut ptr, p.pos_x * POS_COEF, p.pos_y * POS_COEF, p.pos_z * POS_COEF);
    push3(obs, &mut ptr, p.fwd_x, p.fwd_y, p.fwd_z);
    push3(obs, &mut ptr, p.up_x, p.up_y, p.up_z);
    push3(obs, &mut ptr, p.vel_x * VEL_COEF, p.vel_y * VEL_COEF, p.vel_z * VEL_COEF);

    let loc_ang = rot_dot(p, p.ang_vel_x, p.ang_vel_y, p.ang_vel_z);
    push3(obs, &mut ptr, loc_ang[0] * ANG_VEL_COEF, loc_ang[1] * ANG_VEL_COEF, loc_ang[2] * ANG_VEL_COEF);

    let loc_bp = rot_dot(p, ball.pos_x - p.pos_x, ball.pos_y - p.pos_y, ball.pos_z - p.pos_z);
    push3(obs, &mut ptr, loc_bp[0] * POS_COEF, loc_bp[1] * POS_COEF, loc_bp[2] * POS_COEF);

    let loc_bv = rot_dot(p, ball.vel_x - p.vel_x, ball.vel_y - p.vel_y, ball.vel_z - p.vel_z);
    push3(obs, &mut ptr, loc_bv[0] * VEL_COEF, loc_bv[1] * VEL_COEF, loc_bv[2] * VEL_COEF);

    if include_owner_rel {
        let rel_pos = rot_dot(self_phys, p.pos_x - self_phys.pos_x, p.pos_y - self_phys.pos_y, p.pos_z - self_phys.pos_z);
        push3(obs, &mut ptr, rel_pos[0] * POS_COEF, rel_pos[1] * POS_COEF, rel_pos[2] * POS_COEF);

        let rel_vel = rot_dot(self_phys, p.vel_x - self_phys.vel_x, p.vel_y - self_phys.vel_y, p.vel_z - self_phys.vel_z);
        push3(obs, &mut ptr, rel_vel[0] * VEL_COEF, rel_vel[1] * VEL_COEF, rel_vel[2] * VEL_COEF);
    }

    obs[ptr] = (p.boost / 100.0).clamp(0.0, 1.0);
    obs[ptr + 1] = if p.is_on_ground { 1.0 } else { 0.0 };
    obs[ptr + 2] = if p.has_flip_or_jump { 1.0 } else { 0.0 };
    obs[ptr + 3] = if p.is_demoed { 1.0 } else { 0.0 };
    obs[ptr + 4] = if p.has_jumped { 1.0 } else { 0.0 };
    obs[ptr + 5] = 1.0 / (1.0 + p.demo_respawn_timer.max(0.0));
    obs[ptr + 6] = if p.is_on_ground {
        1.0
    } else if !p.has_flip_or_jump {
        0.0
    } else {
        (1.0 - p.air_time_since_jump / 1.25).max(0.0)
    };
    obs[ptr + 7] = if p.is_supersonic { 1.0 } else { 0.0 };
    ptr + 8
}

pub fn write_boost_pads_34(
    out: &mut [f32],
    offset: usize,
    state: &GameStateBufferPod,
    inv: bool,
    mirror_x: bool,
    clamp_inactive_max: f32,
) -> usize {
    for i in 0..MAX_PADS {
        let mapped = if mirror_x { MIRROR_X_PAD_INDEX[i] } else { i };
        let canonical_pad_idx = if inv { 33 - mapped } else { mapped };
        let pad = &state.pads[CANONICAL_TO_WASM_PAD_INDEX[canonical_pad_idx]];
        out[offset + i] = if pad.is_active > 0.5 {
            1.0
        } else {
            (1.0 / (1.0 + pad.cooldown.max(0.0))).min(clamp_inactive_max)
        };
    }
    offset + MAX_PADS
}

#[inline]
pub fn write_ball_header_and_prev_act(
    obs: &mut [f32],
    ball: &BallPhysSnapshot,
    prev_controls: CarControlsPod,
    pos_coef_x: f32,
    pos_coef_y: f32,
    pos_coef_z: f32,
    vel_coef: f32,
    ang_coef: f32,
) -> usize {
    let mut ptr = 0usize;
    push3(obs, &mut ptr, ball.pos_x * pos_coef_x, ball.pos_y * pos_coef_y, ball.pos_z * pos_coef_z);
    push3(obs, &mut ptr, ball.vel_x * vel_coef, ball.vel_y * vel_coef, ball.vel_z * vel_coef);
    push3(obs, &mut ptr, ball.ang_vel_x * ang_coef, ball.ang_vel_y * ang_coef, ball.ang_vel_z * ang_coef);
    let act_arr = encode_car_controls_8(prev_controls);
    obs[ptr..ptr + 8].copy_from_slice(&act_arr);
    ptr + 8
}

#[allow(clippy::too_many_arguments)]
pub fn write_standard_roster_players(
    obs: &mut [f32],
    mut ptr: usize,
    state: &GameStateBufferPod,
    self_car_index: usize,
    norm_self_team: u32,
    inv: bool,
    mirror_x: bool,
    self_phys: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
    max_tm: usize,
    max_opp: usize,
) -> usize {
    ptr = write_standard_player_29(obs, ptr, self_phys, ball);
    let (teammates, tm_len, opponents, opp_len) = collect_teammates_and_opponents(
        state, self_car_index, norm_self_team, active_car_mask, slot_teams, max_tm, max_opp,
    );
    for i in 0..max_tm {
        if i < tm_len {
            let p = get_car_phys(state, teammates[i].car_index, inv, mirror_x);
            ptr = write_standard_player_29(obs, ptr, &p, ball);
        } else {
            ptr += 29;
        }
    }
    for i in 0..max_opp {
        if i < opp_len {
            let p = get_car_phys(state, opponents[i].car_index, inv, mirror_x);
            ptr = write_standard_player_29(obs, ptr, &p, ball);
        } else {
            ptr += 29;
        }
    }
    ptr
}

#[allow(clippy::too_many_arguments)]
fn build_standard_advanced_obs(
    state: &GameStateBufferPod,
    prev_controls: CarControlsPod,
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
    max_tm: usize,
    max_opp: usize,
    auto_mirror_x: bool,
    pad_clamp: f32,
    obs_len: usize,
) -> BuiltMlpObs {
    let norm_self_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_self_team == 1;
    let self_pos_x = state.cars[self_car_index].pos[0];
    let mirror_x = auto_mirror_x && (if inv { -self_pos_x } else { self_pos_x }) > 0.0;

    let ball = get_ball_phys(&state.ball, inv, mirror_x);
    let self_phys = get_car_phys(state, self_car_index, inv, mirror_x);
    let mut built = BuiltMlpObs { obs: [0.0; MAX_MLP_OBS_DIM], len: obs_len, mirror_x };

    let act_ctrl = if mirror_x { mirror_controls_x(prev_controls) } else { prev_controls };
    let mut ptr = write_ball_header_and_prev_act(
        &mut built.obs, &ball, act_ctrl, POS_COEF, POS_COEF, POS_COEF, VEL_COEF, ANG_VEL_COEF,
    );
    ptr = write_boost_pads_34(&mut built.obs, ptr, state, inv, mirror_x, pad_clamp);
    let _ = write_standard_roster_players(
        &mut built.obs, ptr, state, self_car_index, norm_self_team, inv, mirror_x, &self_phys, &ball, active_car_mask, slot_teams, max_tm, max_opp,
    );
    built
}

/// 1. Chronos v2.1 Observation Builder (225 floats, with X-mirroring when `inv_self_pos_x > 0`).
pub fn build_chronos_obs(
    state: &GameStateBufferPod,
    prev_controls: CarControlsPod,
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> BuiltMlpObs {
    build_standard_advanced_obs(state, prev_controls, self_car_index, self_team, active_car_mask, slot_teams, 2, 3, true, 1.0, 225)
}

/// 2. Dice Observation Builder (167 floats, 2v2: 1 teammate, 2 opponents, boost clamp 0.999).
pub fn build_dice_obs(
    state: &GameStateBufferPod,
    prev_controls: CarControlsPod,
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> BuiltMlpObs {
    build_standard_advanced_obs(state, prev_controls, self_car_index, self_team, active_car_mask, slot_teams, 1, 2, false, 0.999, 167)
}

/// 6. Kira Observation Builder (109 floats, 1v1: 0 teammates, 1 opponent).
pub fn build_kira_obs(
    state: &GameStateBufferPod,
    prev_controls: CarControlsPod,
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> BuiltMlpObs {
    build_standard_advanced_obs(state, prev_controls, self_car_index, self_team, active_car_mask, slot_teams, 0, 1, false, 1.0, 109)
}

/// 7. Rain (3v3) Observation Builder (231 floats: `AdvancedObsPadded(3)` + 6 goal-relative ball floats).
pub fn build_rain_obs(
    state: &GameStateBufferPod,
    prev_controls: CarControlsPod,
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> BuiltMlpObs {
    let norm_self_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_self_team == 1;
    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(state, self_car_index, inv, false);
    let mut built = BuiltMlpObs { obs: [0.0; MAX_MLP_OBS_DIM], len: 231, mirror_x: false };

    let obs = &mut built.obs;
    let mut ptr = 0usize;
    push3(obs, &mut ptr, ball.pos_x * POS_COEF, ball.pos_y * POS_COEF, ball.pos_z * POS_COEF);
    push3(obs, &mut ptr, ball.vel_x * VEL_COEF, ball.vel_y * VEL_COEF, ball.vel_z * VEL_COEF);
    push3(obs, &mut ptr, ball.ang_vel_x * ANG_VEL_COEF, ball.ang_vel_y * ANG_VEL_COEF, ball.ang_vel_z * ANG_VEL_COEF);

    let own_goal = if inv { ORANGE_GOAL_BACK } else { BLUE_GOAL_BACK };
    let enemy_goal = if inv { BLUE_GOAL_BACK } else { ORANGE_GOAL_BACK };
    push3(obs, &mut ptr, (own_goal[0] - ball.pos_x) * POS_COEF, (own_goal[1] - ball.pos_y) * POS_COEF, (own_goal[2] - ball.pos_z) * POS_COEF);
    push3(obs, &mut ptr, (enemy_goal[0] - ball.pos_x) * POS_COEF, (enemy_goal[1] - ball.pos_y) * POS_COEF, (enemy_goal[2] - ball.pos_z) * POS_COEF);

    let act_arr = encode_car_controls_8(prev_controls);
    obs[ptr..ptr + 8].copy_from_slice(&act_arr);
    ptr += 8;

    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);
    let _ = write_standard_roster_players(
        obs, ptr, state, self_car_index, norm_self_team, inv, false, &self_phys, &ball, active_car_mask, slot_teams, 2, 3,
    );
    built
}
