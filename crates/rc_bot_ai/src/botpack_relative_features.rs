//! Relative car rotation, local-frame velocity/position projections, boost pad feature writers,
//! and player feature encoders for Botpack #9700488 policies.

use rc_physics_sim::layout::{
    BallStatePod, CarJumpAirTelemetryPod, CarStatePod, GameStateBufferPod, MAX_PADS,
};

use crate::layout_and_specs::CANONICAL_TO_WASM_PAD_INDEX;

pub const POS_COEF: f32 = 1.0 / 5000.0;
pub const VEL_COEF: f32 = 1.0 / 2300.0;
pub const ANG_VEL_COEF: f32 = 1.0 / 3.0;

pub const FURY_POS_COEF_X: f32 = 1.0 / 4096.0;
pub const FURY_POS_COEF_Y: f32 = 1.0 / 6000.0;
pub const FURY_POS_COEF_Z: f32 = 1.0 / 2044.0;
pub const FURY_VEL_COEF: f32 = 1.0 / 2300.0;
pub const FURY_ANG_VEL_COEF: f32 = 1.0 / 5.5;

pub const BLUE_GOAL_BACK: [f32; 3] = [0.0, -6000.0, 321.3875];
pub const ORANGE_GOAL_BACK: [f32; 3] = [0.0, 6000.0, 321.3875];
pub const BIG_BOOST_PAD_INDICES: [usize; 6] = [3, 4, 15, 18, 29, 30];

pub const KICKOFF_SPAWN_PRESETS_TEAM0: [(f32, f32); 5] = [
    (2048.0, -2560.0),
    (-2048.0, -2560.0),
    (256.0, -3840.0),
    (-256.0, -3840.0),
    (0.0, -4608.0),
];

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

const fn build_mirror_x_pad_index() -> [usize; MAX_PADS] {
    let mut map = [0usize; MAX_PADS];
    let mut i = 0;
    while i < MAX_PADS {
        let loc = CANONICAL_BOOST_LOCATIONS[i];
        let mut found = i;
        let mut j = 0;
        while j < MAX_PADS {
            let other = CANONICAL_BOOST_LOCATIONS[j];
            let dx = (loc[0] + other[0]).abs();
            let dy = (loc[1] - other[1]).abs();
            if dx < 3.0 && dy < 3.0 {
                found = j;
                break;
            }
            j += 1;
        }
        map[i] = found;
        i += 1;
    }
    map
}

pub const MIRROR_X_PAD_INDEX: [usize; MAX_PADS] = build_mirror_x_pad_index();

#[derive(Clone, Copy)]
pub struct ActiveCarSlot {
    pub car_index: usize,
    pub team: i32,
}

#[derive(Clone, Copy)]
pub struct SortedCarCandidate {
    pub car_index: usize,
    pub team: i32,
    pub dist_sq: f32,
}

#[derive(Clone, Copy)]
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

#[derive(Clone, Copy)]
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

#[inline]
pub fn get_car_phys(
    cv: &CarStatePod,
    ja: &CarJumpAirTelemetryPod,
    inv: bool,
    mirror_x: bool,
) -> CarPhysSnapshot {
    let s = if inv { -1.0 } else { 1.0 };
    let mx = if mirror_x { -1.0 } else { 1.0 };
    let is_on_ground = cv.is_on_ground > 0.5;
    let has_flip_or_jump = cv.has_flip_or_jump > 0.5;
    let is_demoed = cv.is_demoed > 0.0;
    let is_jumping = ja.is_jumping > 0.5;
    let is_flipping = cv.is_flipping > 0.5;
    let air_time_since_jump = ja.air_time_since_jump;
    let has_jumped = !is_on_ground
        && (is_jumping || is_flipping || air_time_since_jump > 0.0001 || !has_flip_or_jump);
    let has_flip_reset = !is_on_ground && has_flip_or_jump && !has_jumped;

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
        has_flip_reset,
        is_demoed,
        has_jumped,
        is_supersonic: cv.is_supersonic > 0.5,
        demo_respawn_timer: if is_demoed { cv.is_demoed } else { 0.0 },
        air_time_since_jump,
    }
}

#[inline]
pub fn get_ball_phys(bv: &BallStatePod, inv: bool, mirror_x: bool) -> BallPhysSnapshot {
    let s = if inv { -1.0 } else { 1.0 };
    let mx = if mirror_x { -1.0 } else { 1.0 };
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
pub fn safe_unit3(x: f32, y: f32, z: f32) -> [f32; 3] {
    let len_sq = x * x + y * y + z * z;
    if !len_sq.is_finite() || len_sq <= 1e-6 {
        return [0.0, 0.0, 0.0];
    }
    let inv_len = 1.0 / len_sq.sqrt();
    [x * inv_len, y * inv_len, z * inv_len]
}

pub fn collect_teammates_and_opponents(
    state: &GameStateBufferPod,
    roster: &[ActiveCarSlot],
    self_car_index: usize,
    norm_self_team: i32,
    max_teammates: usize,
    max_opponents: usize,
) -> (Vec<SortedCarCandidate>, Vec<SortedCarCandidate>) {
    let [bx, by, bz] = state.ball.pos;
    let mut teammates = Vec::with_capacity(roster.len());
    let mut opponents = Vec::with_capacity(roster.len());

    for entry in roster {
        if entry.car_index == self_car_index {
            continue;
        }
        let cv = &state.cars[entry.car_index];
        let dx = cv.pos[0] - bx;
        let dy = cv.pos[1] - by;
        let dz = cv.pos[2] - bz;
        let item = SortedCarCandidate {
            car_index: entry.car_index,
            team: if entry.team == 1 { 1 } else { 0 },
            dist_sq: dx * dx + dy * dy + dz * dz,
        };
        if item.team == norm_self_team {
            teammates.push(item);
        } else {
            opponents.push(item);
        }
    }

    let cmp = |a: &SortedCarCandidate, b: &SortedCarCandidate| {
        a.dist_sq
            .partial_cmp(&b.dist_sq)
            .unwrap_or(core::cmp::Ordering::Equal)
            .then_with(|| a.car_index.cmp(&b.car_index))
    };
    teammates.sort_by(cmp);
    opponents.sort_by(cmp);
    teammates.truncate(max_teammates);
    opponents.truncate(max_opponents);
    (teammates, opponents)
}

pub fn write_standard_player_29(
    out: &mut [f32],
    offset: usize,
    p: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
) -> usize {
    out[offset] = p.pos_x * POS_COEF;
    out[offset + 1] = p.pos_y * POS_COEF;
    out[offset + 2] = p.pos_z * POS_COEF;
    out[offset + 3] = p.fwd_x;
    out[offset + 4] = p.fwd_y;
    out[offset + 5] = p.fwd_z;
    out[offset + 6] = p.up_x;
    out[offset + 7] = p.up_y;
    out[offset + 8] = p.up_z;
    out[offset + 9] = p.vel_x * VEL_COEF;
    out[offset + 10] = p.vel_y * VEL_COEF;
    out[offset + 11] = p.vel_z * VEL_COEF;
    out[offset + 12] = p.ang_vel_x * ANG_VEL_COEF;
    out[offset + 13] = p.ang_vel_y * ANG_VEL_COEF;
    out[offset + 14] = p.ang_vel_z * ANG_VEL_COEF;

    let loc_ang = rot_dot(p, p.ang_vel_x, p.ang_vel_y, p.ang_vel_z);
    out[offset + 15] = loc_ang[0] * ANG_VEL_COEF;
    out[offset + 16] = loc_ang[1] * ANG_VEL_COEF;
    out[offset + 17] = loc_ang[2] * ANG_VEL_COEF;

    let loc_bp = rot_dot(p, ball.pos_x - p.pos_x, ball.pos_y - p.pos_y, ball.pos_z - p.pos_z);
    out[offset + 18] = loc_bp[0] * POS_COEF;
    out[offset + 19] = loc_bp[1] * POS_COEF;
    out[offset + 20] = loc_bp[2] * POS_COEF;

    let loc_bv = rot_dot(p, ball.vel_x - p.vel_x, ball.vel_y - p.vel_y, ball.vel_z - p.vel_z);
    out[offset + 21] = loc_bv[0] * VEL_COEF;
    out[offset + 22] = loc_bv[1] * VEL_COEF;
    out[offset + 23] = loc_bv[2] * VEL_COEF;

    out[offset + 24] = (p.boost / 100.0).clamp(0.0, 1.0);
    out[offset + 25] = if p.is_on_ground { 1.0 } else { 0.0 };
    out[offset + 26] = if p.has_flip_or_jump { 1.0 } else { 0.0 };
    out[offset + 27] = if p.is_demoed { 1.0 } else { 0.0 };
    out[offset + 28] = if p.has_jumped { 1.0 } else { 0.0 };
    offset + 29
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
        let canonical_idx = if inv { 33 - mapped } else { mapped };
        let wasm_idx = CANONICAL_TO_WASM_PAD_INDEX[canonical_idx];
        let pad = &state.pads[wasm_idx];
        if pad.is_active > 0.5 {
            out[offset + i] = 1.0;
        } else {
            let t = pad.cooldown.max(0.0);
            out[offset + i] = (1.0 / (1.0 + t)).min(clamp_inactive_max);
        }
    }
    offset + MAX_PADS
}
