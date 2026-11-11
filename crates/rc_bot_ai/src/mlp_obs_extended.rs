//! Extended observation builders (`Ducky`, `Fury`, `Galactus v2`) with ball trajectory
//! prediction sampling and relative car/kickoff/goal feature encoders for `rc_bot_ai`.

use rc_physics_sim::{
    layout::{
        BallPredSlicePod, CarControlsPod, GameStateBufferPod, MAX_CARS, MAX_PREDICTION_STEPS,
    },
    sim_instance::SimInstance,
};

use crate::{
    heuristic_and_kickoff::write_fury_kickoff_context_4,
    layout_and_specs::{
        ANG_VEL_COEF, BIG_BOOST_PAD_INDICES, BLUE_GOAL_BACK, CANONICAL_BOOST_LOCATIONS,
        CANONICAL_TO_WASM_PAD_INDEX, FURY_ANG_VEL_COEF, FURY_POS_COEF_X, FURY_POS_COEF_Y,
        FURY_POS_COEF_Z, FURY_VEL_COEF, MAX_MLP_OBS_DIM, ORANGE_GOAL_BACK, POS_COEF, VEL_COEF,
    },
    mlp_obs_standard::{
        collect_teammates_and_opponents, get_ball_phys, get_car_phys, push3, rot_dot,
        write_ball_header_and_prev_act, write_boost_pads_34, write_ducky_player_features,
        write_standard_roster_players, BallPhysSnapshot, BuiltMlpObs, CarPhysSnapshot,
    },
};

#[inline]
pub fn safe_unit_3(x: f32, y: f32, z: f32) -> [f32; 3] {
    let len_sq = x * x + y * y + z * z;
    if !len_sq.is_finite() || len_sq <= 1e-6 {
        return [0.0, 0.0, 0.0];
    }
    let inv_len = 1.0 / len_sq.sqrt();
    [x * inv_len, y * inv_len, z * inv_len]
}

/// Ensures `sim.pred_buffer` is populated up to `horizon_seconds` (capped at `MAX_PREDICTION_STEPS`).
pub fn ensure_sim_ball_prediction(sim: &mut SimInstance, horizon_seconds: f32) {
    let req_sec = horizon_seconds.clamp(1.0, 5.0);
    let req_steps = ((req_sec * 120.0).ceil() as usize).clamp(1, MAX_PREDICTION_STEPS);
    let bx = sim.state_buffer.ball.pos[0];
    if sim.pred_count >= req_steps && (sim.pred_buffer[0].pos[0] - bx).abs() < 0.01 {
        return;
    }
    sim.update_ball_prediction(req_sec);
}

#[inline]
pub fn sample_pred_slice(
    pred_buffer: &[BallPredSlicePod; MAX_PREDICTION_STEPS],
    pred_count: usize,
    fallback_ball: &[f32; 3],
    fallback_vel: &[f32; 3],
    tick_offset: usize,
) -> ([f32; 3], [f32; 3]) {
    if pred_count == 0 {
        return (*fallback_ball, *fallback_vel);
    }
    let idx = tick_offset.min(pred_count - 1);
    (pred_buffer[idx].pos, pred_buffer[idx].vel)
}

#[inline]
fn resolve_car_mask(state: &GameStateBufferPod, active_car_mask: u32) -> u32 {
    if active_car_mask != 0 {
        active_car_mask & 0xFF
    } else {
        let count = (state.header.num_cars as usize).clamp(1, MAX_CARS);
        (1u32 << count) - 1
    }
}

/// 3. Ducky Observation Builder (`DuckyObs_V2_01(3)`, 295 floats).
pub fn build_ducky_obs(
    state: &GameStateBufferPod,
    pred_buffer: &[BallPredSlicePod; MAX_PREDICTION_STEPS],
    pred_count: usize,
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
    let mut built = BuiltMlpObs { obs: [0.0; MAX_MLP_OBS_DIM], len: 295, mirror_x: false };

    let obs = &mut built.obs;
    let mut ptr = write_ball_header_and_prev_act(obs, &ball, prev_controls, POS_COEF, POS_COEF, POS_COEF, VEL_COEF, ANG_VEL_COEF);
    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);
    ptr = write_ducky_player_features(obs, ptr, &self_phys, &self_phys, &ball, false);

    let (teammates, tm_len, opponents, opp_len) = collect_teammates_and_opponents(
        state, self_car_index, norm_self_team, active_car_mask, slot_teams, 2, 3,
    );
    for i in 0..2 {
        if i < tm_len {
            let p = get_car_phys(state, teammates[i].car_index, inv, false);
            ptr = write_ducky_player_features(obs, ptr, &p, &self_phys, &ball, true);
        } else {
            ptr += 35;
        }
    }
    for i in 0..3 {
        if i < opp_len {
            let p = get_car_phys(state, opponents[i].car_index, inv, false);
            ptr = write_ducky_player_features(obs, ptr, &p, &self_phys, &ball, true);
        } else {
            ptr += 35;
        }
    }

    let s = if inv { -1.0f32 } else { 1.0f32 };
    for &t_off in &[36usize, 120, 360] {
        let (p_pos, p_vel) = sample_pred_slice(pred_buffer, pred_count, &state.ball.pos, &state.ball.vel, t_off);
        let (pbx, pby, pbz) = (p_pos[0] * s, p_pos[1] * s, p_pos[2]);
        let (pvx, pvy, pvz) = (p_vel[0] * s, p_vel[1] * s, p_vel[2]);

        push3(obs, &mut ptr, pbx * POS_COEF, pby * POS_COEF, pbz * POS_COEF);
        push3(obs, &mut ptr, pvx * VEL_COEF, pvy * VEL_COEF, pvz * VEL_COEF);

        let loc_pos = rot_dot(&self_phys, pbx - self_phys.pos_x, pby - self_phys.pos_y, pbz - self_phys.pos_z);
        push3(obs, &mut ptr, loc_pos[0] * POS_COEF, loc_pos[1] * POS_COEF, loc_pos[2] * POS_COEF);

        let loc_vel = rot_dot(&self_phys, pvx - self_phys.vel_x, pvy - self_phys.vel_y, pvz - self_phys.vel_z);
        push3(obs, &mut ptr, loc_vel[0] * VEL_COEF, loc_vel[1] * VEL_COEF, loc_vel[2] * VEL_COEF);
    }

    let flat_speed = self_phys.vel_x.hypot(self_phys.vel_y);
    let (vel_dir_x, vel_dir_y) = if flat_speed > 1.0 {
        (self_phys.vel_x / flat_speed, self_phys.vel_y / flat_speed)
    } else {
        (0.0, 0.0)
    };
    let speed_frac = (flat_speed / 2300.0).min(1.0);

    for want_big in [true, false] {
        let mut best_loc = [0.0f32; 3];
        let mut best_cost = f32::INFINITY;
        let mut closest_loc = [0.0f32; 3];
        let mut closest_dist = f32::INFINITY;

        for (i, loc) in CANONICAL_BOOST_LOCATIONS.iter().enumerate() {
            if (loc[2] > 71.0) != want_big {
                continue;
            }
            let (dx, dy) = (loc[0] - self_phys.pos_x, loc[1] - self_phys.pos_y);
            let dist = dx.hypot(dy);
            if dist < closest_dist {
                closest_dist = dist;
                closest_loc = *loc;
            }
            let raw_pad_idx = if inv { 33 - i } else { i };
            let pad = &state.pads[CANONICAL_TO_WASM_PAD_INDEX[raw_pad_idx]];
            if pad.is_active <= 0.5 && pad.cooldown > 3.0 {
                continue;
            }
            let align = if dist > 1.0 { (vel_dir_x * dx + vel_dir_y * dy) / dist } else { 1.0 };
            let cost = dist * (1.0 + speed_frac * (1.0 - align));
            if cost < best_cost {
                best_cost = cost;
                best_loc = *loc;
            }
        }

        let chosen = if best_cost.is_finite() { best_loc } else { closest_loc };
        let loc_pad = rot_dot(&self_phys, chosen[0] - self_phys.pos_x, chosen[1] - self_phys.pos_y, chosen[2] - self_phys.pos_z);
        obs[ptr] = loc_pad[0] * POS_COEF;
        obs[ptr + 1] = loc_pad[1] * POS_COEF;
        ptr += 2;
    }
    let _ = ptr;
    built
}

fn write_fury_goal_scalars_5(
    obs: &mut [f32],
    ptr: usize,
    self_phys: &CarPhysSnapshot,
    ball: &BallPhysSnapshot,
) -> usize {
    let dist_to_own = ((self_phys.pos_x - BLUE_GOAL_BACK[0]).powi(2)
        + (self_phys.pos_y - BLUE_GOAL_BACK[1]).powi(2)
        + (self_phys.pos_z - BLUE_GOAL_BACK[2]).powi(2))
    .sqrt();
    let dist_to_enemy = ((self_phys.pos_x - ORANGE_GOAL_BACK[0]).powi(2)
        + (self_phys.pos_y - ORANGE_GOAL_BACK[1]).powi(2)
        + (self_phys.pos_z - ORANGE_GOAL_BACK[2]).powi(2))
    .sqrt();
    let ball_dist_to_enemy = ((ball.pos_x - ORANGE_GOAL_BACK[0]).powi(2)
        + (ball.pos_y - ORANGE_GOAL_BACK[1]).powi(2)
        + (ball.pos_z - ORANGE_GOAL_BACK[2]).powi(2))
    .sqrt();

    let b_to_enemy = safe_unit_3(ORANGE_GOAL_BACK[0] - ball.pos_x, ORANGE_GOAL_BACK[1] - ball.pos_y, ORANGE_GOAL_BACK[2] - ball.pos_z);
    let b_to_own = safe_unit_3(BLUE_GOAL_BACK[0] - ball.pos_x, BLUE_GOAL_BACK[1] - ball.pos_y, BLUE_GOAL_BACK[2] - ball.pos_z);
    let ball_spd_enemy = ball.vel_x * b_to_enemy[0] + ball.vel_y * b_to_enemy[1] + ball.vel_z * b_to_enemy[2];
    let ball_spd_own = ball.vel_x * b_to_own[0] + ball.vel_y * b_to_own[1] + ball.vel_z * b_to_own[2];

    obs[ptr] = dist_to_own * FURY_POS_COEF_X;
    obs[ptr + 1] = dist_to_enemy * FURY_POS_COEF_X;
    obs[ptr + 2] = ball_dist_to_enemy * FURY_POS_COEF_X;
    obs[ptr + 3] = ball_spd_enemy * FURY_VEL_COEF;
    obs[ptr + 4] = ball_spd_own * FURY_VEL_COEF;
    ptr + 5
}

#[allow(clippy::too_many_arguments)]
fn write_fury_player_39(
    obs: &mut [f32],
    mut ptr: usize,
    state: &GameStateBufferPod,
    car_index: usize,
    car_team: u32,
    inv: bool,
    ball: &BallPhysSnapshot,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> usize {
    let s = if inv { -1.0f32 } else { 1.0f32 };
    let p = get_car_phys(state, car_index, inv, false);
    push3(obs, &mut ptr, p.pos_x * FURY_POS_COEF_X, p.pos_y * FURY_POS_COEF_Y, p.pos_z * FURY_POS_COEF_Z);
    push3(obs, &mut ptr, p.fwd_x, p.fwd_y, p.fwd_z);
    push3(obs, &mut ptr, p.up_x, p.up_y, p.up_z);
    push3(obs, &mut ptr, p.vel_x * FURY_VEL_COEF, p.vel_y * FURY_VEL_COEF, p.vel_z * FURY_VEL_COEF);
    push3(obs, &mut ptr, p.ang_vel_x * FURY_ANG_VEL_COEF, p.ang_vel_y * FURY_ANG_VEL_COEF, p.ang_vel_z * FURY_ANG_VEL_COEF);

    let loc_ang = rot_dot(&p, p.ang_vel_x, p.ang_vel_y, p.ang_vel_z);
    push3(obs, &mut ptr, loc_ang[0] * FURY_ANG_VEL_COEF, loc_ang[1] * FURY_ANG_VEL_COEF, loc_ang[2] * FURY_ANG_VEL_COEF);

    let loc_bp = rot_dot(&p, ball.pos_x - p.pos_x, ball.pos_y - p.pos_y, ball.pos_z - p.pos_z);
    push3(obs, &mut ptr, loc_bp[0] * FURY_POS_COEF_X, loc_bp[1] * FURY_POS_COEF_Y, loc_bp[2] * FURY_POS_COEF_Z);

    let loc_bv = rot_dot(&p, ball.vel_x - p.vel_x, ball.vel_y - p.vel_y, ball.vel_z - p.vel_z);
    push3(obs, &mut ptr, loc_bv[0] * FURY_VEL_COEF, loc_bv[1] * FURY_VEL_COEF, loc_bv[2] * FURY_VEL_COEF);

    obs[ptr] = (p.boost / 100.0).clamp(0.0, 1.0);
    obs[ptr + 1] = if p.is_on_ground { 1.0 } else { 0.0 };
    obs[ptr + 2] = if p.has_flip_or_jump { 1.0 } else { 0.0 };
    obs[ptr + 3] = if p.has_flip_reset { 1.0 } else { 0.0 };
    obs[ptr + 4] = if p.is_demoed { 1.0 } else { 0.0 };
    obs[ptr + 5] = if p.has_jumped { 1.0 } else { 0.0 };
    ptr += 6;

    let to_own_unit = safe_unit_3(BLUE_GOAL_BACK[0] - p.pos_x, BLUE_GOAL_BACK[1] - p.pos_y, BLUE_GOAL_BACK[2] - p.pos_z);
    let to_enemy_unit = safe_unit_3(ORANGE_GOAL_BACK[0] - p.pos_x, ORANGE_GOAL_BACK[1] - p.pos_y, ORANGE_GOAL_BACK[2] - p.pos_z);
    obs[ptr..ptr + 3].copy_from_slice(&to_own_unit);
    obs[ptr + 3..ptr + 6].copy_from_slice(&to_enemy_unit);
    ptr += 6;

    let mask = resolve_car_mask(state, active_car_mask);
    let cv = &state.cars[car_index];
    let mut min_mate_dist_sq = f32::INFINITY;
    let mut mate_rel = [0.0f32; 3];
    for other_idx in 0..MAX_CARS {
        if other_idx == car_index || (mask & (1u32 << other_idx)) == 0 {
            continue;
        }
        let other_team = if slot_teams[other_idx] == 1 { 1 } else { 0 };
        if other_team != car_team {
            continue;
        }
        let ocv = &state.cars[other_idx];
        let (dx, dy, dz) = (ocv.pos[0] - cv.pos[0], ocv.pos[1] - cv.pos[1], ocv.pos[2] - cv.pos[2]);
        let d_sq = dx * dx + dy * dy + dz * dz;
        if d_sq < min_mate_dist_sq {
            min_mate_dist_sq = d_sq;
            mate_rel = [dx, dy, dz];
        }
    }
    let mate_unit = safe_unit_3(mate_rel[0] * s, mate_rel[1] * s, mate_rel[2]);
    obs[ptr..ptr + 3].copy_from_slice(&mate_unit);
    ptr + 3
}

/// 4. Fury Observation Builder (`FuryOBSPadded200B(3)`, 318 floats).
pub fn build_fury_obs(
    state: &GameStateBufferPod,
    pred_buffer: &[BallPredSlicePod; MAX_PREDICTION_STEPS],
    pred_count: usize,
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
    let mut built = BuiltMlpObs { obs: [0.0; MAX_MLP_OBS_DIM], len: 318, mirror_x: false };

    let obs = &mut built.obs;
    let mut ptr = write_ball_header_and_prev_act(
        obs, &ball, prev_controls, FURY_POS_COEF_X, FURY_POS_COEF_Y, FURY_POS_COEF_Z, FURY_VEL_COEF, FURY_ANG_VEL_COEF,
    );
    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);

    let (teammates, tm_len, opponents, opp_len) = collect_teammates_and_opponents(
        state, self_car_index, norm_self_team, active_car_mask, slot_teams, 2, 3,
    );
    ptr = write_fury_kickoff_context_4(
        obs, ptr, state, self_car_index, norm_self_team, &self_phys, &teammates, tm_len, opp_len, active_car_mask,
    );

    let s = if inv { -1.0f32 } else { 1.0f32 };
    for &t_off in &[60usize, 120, 180, 240] {
        let (p_pos, p_vel) = sample_pred_slice(pred_buffer, pred_count, &state.ball.pos, &state.ball.vel, t_off);
        push3(obs, &mut ptr, p_pos[0] * s * FURY_POS_COEF_X, p_pos[1] * s * FURY_POS_COEF_Y, p_pos[2] * FURY_POS_COEF_Z);
        push3(obs, &mut ptr, p_vel[0] * s * FURY_VEL_COEF, p_vel[1] * s * FURY_VEL_COEF, p_vel[2] * FURY_VEL_COEF);
    }

    ptr = write_fury_goal_scalars_5(obs, ptr, &self_phys, &ball);
    ptr = write_fury_player_39(obs, ptr, state, self_car_index, norm_self_team, inv, &ball, active_car_mask, slot_teams);
    for i in 0..2 {
        if i < tm_len {
            ptr = write_fury_player_39(obs, ptr, state, teammates[i].car_index, teammates[i].team, inv, &ball, active_car_mask, slot_teams);
        } else {
            ptr += 39;
        }
    }
    for i in 0..3 {
        if i < opp_len {
            ptr = write_fury_player_39(obs, ptr, state, opponents[i].car_index, opponents[i].team, inv, &ball, active_car_mask, slot_teams);
        } else {
            ptr += 39;
        }
    }
    let _ = ptr;
    built
}

/// 5. Galactus v2 Observation Builder (`GalactusOBS(3)`, 258 floats).
pub fn build_galactus_obs(
    state: &GameStateBufferPod,
    pred_buffer: &[BallPredSlicePod; MAX_PREDICTION_STEPS],
    pred_count: usize,
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
    let mut built = BuiltMlpObs { obs: [0.0; MAX_MLP_OBS_DIM], len: 258, mirror_x: false };

    let obs = &mut built.obs;
    let mut ptr = write_ball_header_and_prev_act(obs, &ball, prev_controls, POS_COEF, POS_COEF, POS_COEF, VEL_COEF, ANG_VEL_COEF);
    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);

    let mut nearest_rel = [0.0f32; 3];
    let mut nearest_dist_sq = 1500.0f32 * 1500.0f32;
    for &pad_idx in &BIG_BOOST_PAD_INDICES {
        let canonical_pad_idx = if inv { 33 - pad_idx } else { pad_idx };
        let wasm_pad_idx = CANONICAL_TO_WASM_PAD_INDEX[canonical_pad_idx];
        if state.pads[wasm_pad_idx].is_active <= 0.5 {
            continue;
        }
        let loc = CANONICAL_BOOST_LOCATIONS[pad_idx];
        let (rx, ry, rz) = (loc[0] - self_phys.pos_x, loc[1] - self_phys.pos_y, loc[2] - self_phys.pos_z);
        let dist_sq_2d = rx * rx + ry * ry;
        if dist_sq_2d <= nearest_dist_sq {
            nearest_dist_sq = dist_sq_2d;
            nearest_rel = [rx, ry, rz];
        }
    }
    push3(obs, &mut ptr, nearest_rel[0] * POS_COEF, nearest_rel[1] * POS_COEF, nearest_rel[2] * POS_COEF);

    ptr = write_standard_roster_players(
        obs, ptr, state, self_car_index, norm_self_team, inv, false, &self_phys, &ball, active_car_mask, slot_teams, 2, 3,
    );

    let s = if inv { -1.0f32 } else { 1.0f32 };
    for &t_off in &[30usize, 60, 120, 180, 240] {
        let (p_pos, p_vel) = sample_pred_slice(pred_buffer, pred_count, &state.ball.pos, &state.ball.vel, t_off);
        push3(obs, &mut ptr, p_pos[0] * s * POS_COEF, p_pos[1] * s * POS_COEF, p_pos[2] * POS_COEF);
        push3(obs, &mut ptr, p_vel[0] * s * VEL_COEF, p_vel[1] * s * VEL_COEF, p_vel[2] * VEL_COEF);
    }
    let _ = ptr;
    built
}
