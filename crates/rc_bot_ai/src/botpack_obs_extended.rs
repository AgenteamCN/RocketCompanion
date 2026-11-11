//! Extended observation builders for Ducky (295d), Fury (318d), and Galactus v2 (258d).

use rc_physics_sim::{
    layout::{BallPredSlicePod, CarControlsPod},
    sim_instance::SimInstance,
};

use crate::layout_and_specs::CANONICAL_TO_WASM_PAD_INDEX;

use super::{
    botpack_actions::encode_car_controls_8,
    botpack_obs_core::BuiltBotpackObs,
    botpack_player_encoders::{
        write_ducky_player_features, write_fury_goal_scalars_5, write_fury_kickoff_context_4,
        write_fury_player_39,
    },
    botpack_relative_features::{
        ANG_VEL_COEF, ActiveCarSlot, BIG_BOOST_PAD_INDICES, BallPhysSnapshot,
        CANONICAL_BOOST_LOCATIONS, FURY_ANG_VEL_COEF, FURY_POS_COEF_X, FURY_POS_COEF_Y,
        FURY_POS_COEF_Z, FURY_VEL_COEF, POS_COEF, VEL_COEF, collect_teammates_and_opponents,
        get_ball_phys, get_car_phys, rot_dot, write_boost_pads_34, write_standard_player_29,
    },
};

fn sample_ball_pred_slice(sim: &mut SimInstance, target_tick: usize) -> BallPredSlicePod {
    if sim.pred_count <= target_tick {
        let req_sec = ((target_tick + 6) as f32 / 120.0).clamp(1.0, 5.0);
        sim.update_ball_prediction(req_sec);
    }
    if sim.pred_count > 0 {
        let idx = target_tick.min(sim.pred_count - 1);
        return sim.pred_buffer[idx];
    }
    BallPredSlicePod {
        pos: sim.state_buffer.ball.pos,
        vel: sim.state_buffer.ball.vel,
        ang_vel: sim.state_buffer.ball.ang_vel,
    }
}

fn write_ball_header_and_prev_act(
    obs: &mut [f32],
    ball: &BallPhysSnapshot,
    prev_controls: &CarControlsPod,
    pos_coef: [f32; 3],
    vel_coef: f32,
    ang_coef: f32,
) -> usize {
    obs[0] = ball.pos_x * pos_coef[0];
    obs[1] = ball.pos_y * pos_coef[1];
    obs[2] = ball.pos_z * pos_coef[2];
    obs[3] = ball.vel_x * vel_coef;
    obs[4] = ball.vel_y * vel_coef;
    obs[5] = ball.vel_z * vel_coef;
    obs[6] = ball.ang_vel_x * ang_coef;
    obs[7] = ball.ang_vel_y * ang_coef;
    obs[8] = ball.ang_vel_z * ang_coef;
    let act = encode_car_controls_8(prev_controls);
    obs[9..17].copy_from_slice(&act);
    17
}

/// 3. Ducky Observation Builder (`DuckyObs_V2_01(3)`, 295 floats).
pub fn build_ducky_obs(
    sim: &mut SimInstance,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let _ = sample_ball_pred_slice(sim, 360);
    let state = &sim.state_buffer;
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(&self_cv, &state.car_jump_air[self_car_index], inv, false);
    let mut out = BuiltBotpackObs {
        len: 295,
        self_car: self_cv,
        ..BuiltBotpackObs::default()
    };
    let obs = &mut out.obs;

    let mut ptr = write_ball_header_and_prev_act(
        obs,
        &ball,
        prev_controls,
        [POS_COEF; 3],
        VEL_COEF,
        ANG_VEL_COEF,
    );
    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);
    ptr = write_ducky_player_features(obs, ptr, &self_phys, &self_phys, &ball, false);

    let (teammates, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 2, 3);
    for list in [&teammates[..], &opponents[..]] {
        let cap = if core::ptr::eq(list.as_ptr(), teammates.as_ptr()) { 2 } else { 3 };
        for i in 0..cap {
            if i < list.len() {
                let idx = list[i].car_index;
                let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
                ptr = write_ducky_player_features(obs, ptr, &p, &self_phys, &ball, true);
            } else {
                ptr += 35;
            }
        }
    }

    let s = if inv { -1.0 } else { 1.0 };
    for &t_tick in &[36usize, 120, 360] {
        let sl = sim.pred_buffer[t_tick.min(sim.pred_count.saturating_sub(1))];
        let (pbx, pby, pbz) = (sl.pos[0] * s, sl.pos[1] * s, sl.pos[2]);
        let (pvx, pvy, pvz) = (sl.vel[0] * s, sl.vel[1] * s, sl.vel[2]);
        let lp = rot_dot(&self_phys, pbx - self_phys.pos_x, pby - self_phys.pos_y, pbz - self_phys.pos_z);
        let lv = rot_dot(&self_phys, pvx - self_phys.vel_x, pvy - self_phys.vel_y, pvz - self_phys.vel_z);
        obs[ptr..ptr + 12].copy_from_slice(&[
            pbx * POS_COEF, pby * POS_COEF, pbz * POS_COEF,
            pvx * VEL_COEF, pvy * VEL_COEF, pvz * VEL_COEF,
            lp[0] * POS_COEF, lp[1] * POS_COEF, lp[2] * POS_COEF,
            lv[0] * VEL_COEF, lv[1] * VEL_COEF, lv[2] * VEL_COEF,
        ]);
        ptr += 12;
    }

    let flat_spd = self_phys.vel_x.hypot(self_phys.vel_y);
    let (vdx, vdy) = if flat_spd > 1.0 {
        (self_phys.vel_x / flat_spd, self_phys.vel_y / flat_spd)
    } else {
        (0.0, 0.0)
    };
    let spd_frac = (flat_spd / 2300.0).min(1.0);
    for want_big in [true, false] {
        let (mut best_loc, mut best_cost) = ([0.0f32; 3], f32::INFINITY);
        let (mut closest_loc, mut closest_dist) = ([0.0f32; 3], f32::INFINITY);
        for (i, &loc) in CANONICAL_BOOST_LOCATIONS.iter().enumerate() {
            if (loc[2] > 71.0) != want_big {
                continue;
            }
            let (dx, dy) = (loc[0] - self_phys.pos_x, loc[1] - self_phys.pos_y);
            let dist = dx.hypot(dy);
            if dist < closest_dist {
                closest_dist = dist;
                closest_loc = loc;
            }
            let raw_idx = if inv { 33 - i } else { i };
            let pad = &state.pads[CANONICAL_TO_WASM_PAD_INDEX[raw_idx]];
            if pad.is_active <= 0.5 && pad.cooldown > 3.0 {
                continue;
            }
            let align = if dist > 1.0 { (vdx * dx + vdy * dy) / dist } else { 1.0 };
            let cost = dist * (1.0 + spd_frac * (1.0 - align));
            if cost < best_cost {
                best_cost = cost;
                best_loc = loc;
            }
        }
        let chosen = if best_cost.is_finite() { best_loc } else { closest_loc };
        let lp = rot_dot(&self_phys, chosen[0] - self_phys.pos_x, chosen[1] - self_phys.pos_y, chosen[2] - self_phys.pos_z);
        obs[ptr] = lp[0] * POS_COEF;
        obs[ptr + 1] = lp[1] * POS_COEF;
        ptr += 2;
    }
    let _ = ptr;
    out
}

/// 4. Fury Observation Builder (`FuryOBSPadded200B(3)`, 318 floats).
pub fn build_fury_obs(
    sim: &mut SimInstance,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let _ = sample_ball_pred_slice(sim, 240);
    let state = &sim.state_buffer;
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(&self_cv, &state.car_jump_air[self_car_index], inv, false);
    let mut out = BuiltBotpackObs { len: 318, self_car: self_cv, ..BuiltBotpackObs::default() };
    let obs = &mut out.obs;

    let mut ptr = write_ball_header_and_prev_act(
        obs,
        &ball,
        prev_controls,
        [FURY_POS_COEF_X, FURY_POS_COEF_Y, FURY_POS_COEF_Z],
        FURY_VEL_COEF,
        FURY_ANG_VEL_COEF,
    );
    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);
    let (teammates, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 2, 3);
    ptr = write_fury_kickoff_context_4(
        obs, ptr, state, self_car_index, norm_team, &self_cv, &self_phys, &teammates, &opponents, roster,
    );

    let s = if inv { -1.0 } else { 1.0 };
    for &t_tick in &[60usize, 120, 180, 240] {
        let sl = sim.pred_buffer[t_tick.min(sim.pred_count.saturating_sub(1))];
        obs[ptr..ptr + 6].copy_from_slice(&[
            sl.pos[0] * s * FURY_POS_COEF_X, sl.pos[1] * s * FURY_POS_COEF_Y, sl.pos[2] * FURY_POS_COEF_Z,
            sl.vel[0] * s * FURY_VEL_COEF, sl.vel[1] * s * FURY_VEL_COEF, sl.vel[2] * FURY_VEL_COEF,
        ]);
        ptr += 6;
    }

    ptr = write_fury_goal_scalars_5(obs, ptr, &self_phys, &ball);
    ptr = write_fury_player_39(obs, ptr, state, self_car_index, norm_team, inv, &ball, roster);
    for (cap, list) in [(2usize, &teammates[..]), (3usize, &opponents[..])] {
        for i in 0..cap {
            if i < list.len() {
                ptr = write_fury_player_39(obs, ptr, state, list[i].car_index, list[i].team, inv, &ball, roster);
            } else {
                ptr += 39;
            }
        }
    }
    let _ = ptr;
    out
}

/// 5. Galactus v2 Observation Builder (`GalactusOBS(3)`, 258 floats).
pub fn build_galactus_obs(
    sim: &mut SimInstance,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let _ = sample_ball_pred_slice(sim, 240);
    let state = &sim.state_buffer;
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(&self_cv, &state.car_jump_air[self_car_index], inv, false);
    let mut out = BuiltBotpackObs { len: 258, self_car: self_cv, ..BuiltBotpackObs::default() };
    let obs = &mut out.obs;

    let mut ptr = write_ball_header_and_prev_act(obs, &ball, prev_controls, [POS_COEF; 3], VEL_COEF, ANG_VEL_COEF);
    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);

    let (mut near_rx, mut near_ry, mut near_rz, mut near_d_sq) = (0.0f32, 0.0f32, 0.0f32, 1500.0 * 1500.0);
    for &pad_idx in &BIG_BOOST_PAD_INDICES {
        let c_idx = if inv { 33 - pad_idx } else { pad_idx };
        if state.pads[CANONICAL_TO_WASM_PAD_INDEX[c_idx]].is_active <= 0.5 {
            continue;
        }
        let loc = CANONICAL_BOOST_LOCATIONS[pad_idx];
        let (rx, ry, rz) = (loc[0] - self_phys.pos_x, loc[1] - self_phys.pos_y, loc[2] - self_phys.pos_z);
        let d_sq = rx * rx + ry * ry;
        if d_sq <= near_d_sq {
            near_d_sq = d_sq;
            (near_rx, near_ry, near_rz) = (rx, ry, rz);
        }
    }
    obs[ptr..ptr + 3].copy_from_slice(&[near_rx * POS_COEF, near_ry * POS_COEF, near_rz * POS_COEF]);
    ptr += 3;

    ptr = write_standard_player_29(obs, ptr, &self_phys, &ball);
    let (teammates, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 2, 3);
    for (cap, list) in [(2usize, &teammates[..]), (3usize, &opponents[..])] {
        for i in 0..cap {
            if i < list.len() {
                let idx = list[i].car_index;
                let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
                ptr = write_standard_player_29(obs, ptr, &p, &ball);
            } else {
                ptr += 29;
            }
        }
    }

    let s = if inv { -1.0 } else { 1.0 };
    for &t_tick in &[30usize, 60, 120, 180, 240] {
        let sl = sim.pred_buffer[t_tick.min(sim.pred_count.saturating_sub(1))];
        obs[ptr..ptr + 6].copy_from_slice(&[
            sl.pos[0] * s * POS_COEF, sl.pos[1] * s * POS_COEF, sl.pos[2] * POS_COEF,
            sl.vel[0] * s * VEL_COEF, sl.vel[1] * s * VEL_COEF, sl.vel[2] * VEL_COEF,
        ]);
        ptr += 6;
    }
    let _ = ptr;
    out
}
