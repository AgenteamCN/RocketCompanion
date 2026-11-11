//! Per-player feature and kickoff context encoders for Ducky (`DuckyObs_V2_01`) and Fury (`FuryOBSPadded200B`).

use rc_physics_sim::layout::{CarStatePod, GameStateBufferPod};

use super::botpack_relative_features::{
    ANG_VEL_COEF, ActiveCarSlot, BLUE_GOAL_BACK, BallPhysSnapshot, CarPhysSnapshot,
    FURY_ANG_VEL_COEF, FURY_POS_COEF_X, FURY_POS_COEF_Y, FURY_POS_COEF_Z, FURY_VEL_COEF,
    KICKOFF_SPAWN_PRESETS_TEAM0, ORANGE_GOAL_BACK, POS_COEF, SortedCarCandidate, VEL_COEF,
    get_car_phys, rot_dot, safe_unit3,
};

pub fn write_ducky_player_features(
    obs: &mut [f32],
    mut ptr: usize,
    p: &CarPhysSnapshot,
    self_phys: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
    include_owner_rel: bool,
) -> usize {
    obs[ptr] = p.pos_x * POS_COEF;
    obs[ptr + 1] = p.pos_y * POS_COEF;
    obs[ptr + 2] = p.pos_z * POS_COEF;
    obs[ptr + 3] = p.fwd_x;
    obs[ptr + 4] = p.fwd_y;
    obs[ptr + 5] = p.fwd_z;
    obs[ptr + 6] = p.up_x;
    obs[ptr + 7] = p.up_y;
    obs[ptr + 8] = p.up_z;
    obs[ptr + 9] = p.vel_x * VEL_COEF;
    obs[ptr + 10] = p.vel_y * VEL_COEF;
    obs[ptr + 11] = p.vel_z * VEL_COEF;
    ptr += 12;

    let loc_ang = rot_dot(p, p.ang_vel_x, p.ang_vel_y, p.ang_vel_z);
    obs[ptr] = loc_ang[0] * ANG_VEL_COEF;
    obs[ptr + 1] = loc_ang[1] * ANG_VEL_COEF;
    obs[ptr + 2] = loc_ang[2] * ANG_VEL_COEF;
    ptr += 3;

    let loc_bp = rot_dot(p, ball.pos_x - p.pos_x, ball.pos_y - p.pos_y, ball.pos_z - p.pos_z);
    obs[ptr] = loc_bp[0] * POS_COEF;
    obs[ptr + 1] = loc_bp[1] * POS_COEF;
    obs[ptr + 2] = loc_bp[2] * POS_COEF;
    ptr += 3;

    let loc_bv = rot_dot(p, ball.vel_x - p.vel_x, ball.vel_y - p.vel_y, ball.vel_z - p.vel_z);
    obs[ptr] = loc_bv[0] * VEL_COEF;
    obs[ptr + 1] = loc_bv[1] * VEL_COEF;
    obs[ptr + 2] = loc_bv[2] * VEL_COEF;
    ptr += 3;

    if include_owner_rel {
        let rel_pos = rot_dot(
            self_phys,
            p.pos_x - self_phys.pos_x,
            p.pos_y - self_phys.pos_y,
            p.pos_z - self_phys.pos_z,
        );
        obs[ptr] = rel_pos[0] * POS_COEF;
        obs[ptr + 1] = rel_pos[1] * POS_COEF;
        obs[ptr + 2] = rel_pos[2] * POS_COEF;
        ptr += 3;

        let rel_vel = rot_dot(
            self_phys,
            p.vel_x - self_phys.vel_x,
            p.vel_y - self_phys.vel_y,
            p.vel_z - self_phys.vel_z,
        );
        obs[ptr] = rel_vel[0] * VEL_COEF;
        obs[ptr + 1] = rel_vel[1] * VEL_COEF;
        obs[ptr + 2] = rel_vel[2] * VEL_COEF;
        ptr += 3;
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

#[allow(clippy::too_many_arguments)]
pub fn write_fury_kickoff_context_4(
    obs: &mut [f32],
    mut ptr: usize,
    state: &GameStateBufferPod,
    self_car_index: usize,
    norm_self_team: i32,
    self_cv: &CarStatePod,
    self_phys: &CarPhysSnapshot,
    teammates: &[SortedCarCandidate],
    opponents: &[SortedCarCandidate],
    roster: &[ActiveCarSlot],
) -> usize {
    let b = &state.ball;
    let ball_centered =
        b.pos[0].abs() <= 10.0 && b.pos[1].abs() <= 10.0 && (b.pos[2] - 93.15).abs() <= 25.0;
    let ball_stat = b.vel[0] * b.vel[0] + b.vel[1] * b.vel[1] + b.vel[2] * b.vel[2] <= 25.0;
    let ko_active = ball_centered && ball_stat;

    let any_moving = roster.iter().any(|r| {
        let v = state.cars[r.car_index].vel;
        v[0] * v[0] + v[1] * v[1] + v[2] * v[2] > 225.0
    });
    obs[ptr] = if ko_active {
        if any_moving { 2.0 / 3.0 } else { 1.0 / 3.0 }
    } else {
        0.0
    };
    ptr += 1;

    let dx = self_cv.pos[0] - b.pos[0];
    let dy = self_cv.pos[1] - b.pos[1];
    let dz = self_cv.pos[2] - b.pos[2];
    obs[ptr] = (dx * dx + dy * dy + dz * dz).sqrt() * FURY_POS_COEF_X;
    ptr += 1;

    let mut role_int = 0;
    if ko_active && !(teammates.is_empty() && opponents.len() >= 2) {
        let t_flip = if norm_self_team == 1 { -1.0 } else { 1.0 };
        let mut entries: Vec<(usize, f32, f32)> = Vec::with_capacity(1 + teammates.len());
        for c_idx in core::iter::once(self_car_index).chain(teammates.iter().map(|t| t.car_index)) {
            let cp = state.cars[c_idx].pos;
            let mut best_dist = f32::INFINITY;
            let mut best_y = 0.0f32;
            for &(sx0, sy0) in &KICKOFF_SPAWN_PRESETS_TEAM0 {
                let (sx, sy) = (sx0 * t_flip, sy0 * t_flip);
                let d = (cp[0] - sx) * (cp[0] - sx) + (cp[1] - sy) * (cp[1] - sy);
                if d < best_dist {
                    best_dist = d;
                    best_y = sy.abs();
                }
            }
            entries.push((c_idx, best_y, cp[0] * t_flip));
        }
        entries.sort_by(|a, b| {
            if (a.1 - b.1).abs() > 40.0 {
                a.1.partial_cmp(&b.1).unwrap_or(core::cmp::Ordering::Equal)
            } else {
                b.2.partial_cmp(&a.2).unwrap_or(core::cmp::Ordering::Equal)
            }
        });
        let rank = entries
            .iter()
            .position(|e| e.0 == self_car_index)
            .unwrap_or(0);
        role_int = if rank == 0 {
            1
        } else if rank == 1 {
            2
        } else {
            3
        };
    }
    obs[ptr] = (role_int as f32) / 3.0;
    ptr += 1;

    let mut min_spawn_dist = f32::INFINITY;
    for &(sx, sy) in &KICKOFF_SPAWN_PRESETS_TEAM0 {
        let d = ((self_phys.pos_x - sx).powi(2)
            + (self_phys.pos_y - sy).powi(2)
            + (self_phys.pos_z - 17.0).powi(2))
        .sqrt();
        if d < min_spawn_dist {
            min_spawn_dist = d;
        }
    }
    obs[ptr] = min_spawn_dist * FURY_POS_COEF_X;
    ptr + 1
}

pub fn write_fury_goal_scalars_5(
    obs: &mut [f32],
    ptr: usize,
    self_phys: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
) -> usize {
    let d_own = ((self_phys.pos_x - BLUE_GOAL_BACK[0]).powi(2)
        + (self_phys.pos_y - BLUE_GOAL_BACK[1]).powi(2)
        + (self_phys.pos_z - BLUE_GOAL_BACK[2]).powi(2))
    .sqrt();
    let d_enemy = ((self_phys.pos_x - ORANGE_GOAL_BACK[0]).powi(2)
        + (self_phys.pos_y - ORANGE_GOAL_BACK[1]).powi(2)
        + (self_phys.pos_z - ORANGE_GOAL_BACK[2]).powi(2))
    .sqrt();
    let b_enemy = ((ball.pos_x - ORANGE_GOAL_BACK[0]).powi(2)
        + (ball.pos_y - ORANGE_GOAL_BACK[1]).powi(2)
        + (ball.pos_z - ORANGE_GOAL_BACK[2]).powi(2))
    .sqrt();
    let u_enemy = safe_unit3(
        ORANGE_GOAL_BACK[0] - ball.pos_x,
        ORANGE_GOAL_BACK[1] - ball.pos_y,
        ORANGE_GOAL_BACK[2] - ball.pos_z,
    );
    let u_own = safe_unit3(
        BLUE_GOAL_BACK[0] - ball.pos_x,
        BLUE_GOAL_BACK[1] - ball.pos_y,
        BLUE_GOAL_BACK[2] - ball.pos_z,
    );
    let spd_enemy = ball.vel_x * u_enemy[0] + ball.vel_y * u_enemy[1] + ball.vel_z * u_enemy[2];
    let spd_own = ball.vel_x * u_own[0] + ball.vel_y * u_own[1] + ball.vel_z * u_own[2];
    obs[ptr] = d_own * FURY_POS_COEF_X;
    obs[ptr + 1] = d_enemy * FURY_POS_COEF_X;
    obs[ptr + 2] = b_enemy * FURY_POS_COEF_X;
    obs[ptr + 3] = spd_enemy * FURY_VEL_COEF;
    obs[ptr + 4] = spd_own * FURY_VEL_COEF;
    ptr + 5
}

pub fn write_fury_player_39(
    obs: &mut [f32],
    mut ptr: usize,
    state: &GameStateBufferPod,
    car_index: usize,
    car_team: i32,
    inv: bool,
    ball: &BallPhysSnapshot,
    roster: &[ActiveCarSlot],
) -> usize {
    let s = if inv { -1.0 } else { 1.0 };
    let cv = &state.cars[car_index];
    let p = get_car_phys(cv, &state.car_jump_air[car_index], inv, false);
    obs[ptr] = p.pos_x * FURY_POS_COEF_X;
    obs[ptr + 1] = p.pos_y * FURY_POS_COEF_Y;
    obs[ptr + 2] = p.pos_z * FURY_POS_COEF_Z;
    obs[ptr + 3] = p.fwd_x;
    obs[ptr + 4] = p.fwd_y;
    obs[ptr + 5] = p.fwd_z;
    obs[ptr + 6] = p.up_x;
    obs[ptr + 7] = p.up_y;
    obs[ptr + 8] = p.up_z;
    obs[ptr + 9] = p.vel_x * FURY_VEL_COEF;
    obs[ptr + 10] = p.vel_y * FURY_VEL_COEF;
    obs[ptr + 11] = p.vel_z * FURY_VEL_COEF;
    obs[ptr + 12] = p.ang_vel_x * FURY_ANG_VEL_COEF;
    obs[ptr + 13] = p.ang_vel_y * FURY_ANG_VEL_COEF;
    obs[ptr + 14] = p.ang_vel_z * FURY_ANG_VEL_COEF;
    ptr += 15;

    let loc_ang = rot_dot(&p, p.ang_vel_x, p.ang_vel_y, p.ang_vel_z);
    obs[ptr] = loc_ang[0] * FURY_ANG_VEL_COEF;
    obs[ptr + 1] = loc_ang[1] * FURY_ANG_VEL_COEF;
    obs[ptr + 2] = loc_ang[2] * FURY_ANG_VEL_COEF;
    ptr += 3;

    let loc_bp = rot_dot(&p, ball.pos_x - p.pos_x, ball.pos_y - p.pos_y, ball.pos_z - p.pos_z);
    obs[ptr] = loc_bp[0] * FURY_POS_COEF_X;
    obs[ptr + 1] = loc_bp[1] * FURY_POS_COEF_Y;
    obs[ptr + 2] = loc_bp[2] * FURY_POS_COEF_Z;
    ptr += 3;

    let loc_bv = rot_dot(&p, ball.vel_x - p.vel_x, ball.vel_y - p.vel_y, ball.vel_z - p.vel_z);
    obs[ptr] = loc_bv[0] * FURY_VEL_COEF;
    obs[ptr + 1] = loc_bv[1] * FURY_VEL_COEF;
    obs[ptr + 2] = loc_bv[2] * FURY_VEL_COEF;
    ptr += 3;

    obs[ptr] = (p.boost / 100.0).clamp(0.0, 1.0);
    obs[ptr + 1] = if p.is_on_ground { 1.0 } else { 0.0 };
    obs[ptr + 2] = if p.has_flip_or_jump { 1.0 } else { 0.0 };
    obs[ptr + 3] = if p.has_flip_reset { 1.0 } else { 0.0 };
    obs[ptr + 4] = if p.is_demoed { 1.0 } else { 0.0 };
    obs[ptr + 5] = if p.has_jumped { 1.0 } else { 0.0 };
    ptr += 6;

    let to_own = safe_unit3(
        BLUE_GOAL_BACK[0] - p.pos_x,
        BLUE_GOAL_BACK[1] - p.pos_y,
        BLUE_GOAL_BACK[2] - p.pos_z,
    );
    let to_enemy = safe_unit3(
        ORANGE_GOAL_BACK[0] - p.pos_x,
        ORANGE_GOAL_BACK[1] - p.pos_y,
        ORANGE_GOAL_BACK[2] - p.pos_z,
    );
    obs[ptr..ptr + 3].copy_from_slice(&to_own);
    obs[ptr + 3..ptr + 6].copy_from_slice(&to_enemy);
    ptr += 6;

    let (mut min_d_sq, mut mdx, mut mdy, mut mdz) = (f32::INFINITY, 0.0f32, 0.0f32, 0.0f32);
    for other in roster {
        if other.car_index == car_index || (if other.team == 1 { 1 } else { 0 }) != car_team {
            continue;
        }
        let op = state.cars[other.car_index].pos;
        let (dx, dy, dz) = (op[0] - cv.pos[0], op[1] - cv.pos[1], op[2] - cv.pos[2]);
        let d_sq = dx * dx + dy * dy + dz * dz;
        if d_sq < min_d_sq {
            min_d_sq = d_sq;
            (mdx, mdy, mdz) = (dx, dy, dz);
        }
    }
    let mate_u = safe_unit3(mdx * s, mdy * s, mdz);
    obs[ptr..ptr + 3].copy_from_slice(&mate_u);
    ptr + 3
}
