//! Core `AdvancedObs` builders for Chronos v2.1 (225d), Dice (167d), Kira (109d), and Rain 3v3 (231d).

use rc_physics_sim::layout::{CarControlsPod, CarStatePod, GameStateBufferPod};

use super::{
    botpack_actions::{encode_car_controls_8, mirror_action_controls_x},
    botpack_relative_features::{
        ANG_VEL_COEF, ActiveCarSlot, BLUE_GOAL_BACK, ORANGE_GOAL_BACK, POS_COEF, VEL_COEF,
        collect_teammates_and_opponents, get_ball_phys, get_car_phys, write_boost_pads_34,
        write_standard_player_29,
    },
};

pub const MAX_BOTPACK_OBS_DIM: usize = 320;

pub struct BuiltBotpackObs {
    pub obs: [f32; MAX_BOTPACK_OBS_DIM],
    pub len: usize,
    pub mirror_x: bool,
    pub self_car: CarStatePod,
}

impl Default for BuiltBotpackObs {
    fn default() -> Self {
        Self {
            obs: [0.0; MAX_BOTPACK_OBS_DIM],
            len: 0,
            mirror_x: false,
            self_car: CarStatePod::default(),
        }
    }
}

/// 1. Chronos v2.1 Observation Builder (225 floats, with X-mirroring when `inv_self_pos_x > 0`).
pub fn build_chronos_obs(
    state: &GameStateBufferPod,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let self_ja = state.car_jump_air[self_car_index];
    let inv_self_pos_x = if inv { -self_cv.pos[0] } else { self_cv.pos[0] };
    let mirror_x = inv_self_pos_x > 0.0;

    let ball = get_ball_phys(&state.ball, inv, mirror_x);
    let self_phys = get_car_phys(&self_cv, &self_ja, inv, mirror_x);
    let mut out = BuiltBotpackObs {
        len: 225,
        mirror_x,
        self_car: self_cv,
        ..BuiltBotpackObs::default()
    };
    let obs = &mut out.obs;
    let mut ptr = 0usize;

    obs[ptr] = ball.pos_x * POS_COEF;
    obs[ptr + 1] = ball.pos_y * POS_COEF;
    obs[ptr + 2] = ball.pos_z * POS_COEF;
    obs[ptr + 3] = ball.vel_x * VEL_COEF;
    obs[ptr + 4] = ball.vel_y * VEL_COEF;
    obs[ptr + 5] = ball.vel_z * VEL_COEF;
    obs[ptr + 6] = ball.ang_vel_x * ANG_VEL_COEF;
    obs[ptr + 7] = ball.ang_vel_y * ANG_VEL_COEF;
    obs[ptr + 8] = ball.ang_vel_z * ANG_VEL_COEF;
    ptr += 9;

    let act_ctrl = if mirror_x {
        mirror_action_controls_x(*prev_controls)
    } else {
        *prev_controls
    };
    let act_arr = encode_car_controls_8(&act_ctrl);
    obs[ptr..ptr + 8].copy_from_slice(&act_arr);
    ptr += 8;

    ptr = write_boost_pads_34(obs, ptr, state, inv, mirror_x, 1.0);
    ptr = write_standard_player_29(obs, ptr, &self_phys, &ball);

    let (teammates, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 2, 3);
    for i in 0..2 {
        if i < teammates.len() {
            let idx = teammates[i].car_index;
            let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, mirror_x);
            ptr = write_standard_player_29(obs, ptr, &p, &ball);
        } else {
            ptr += 29;
        }
    }
    for i in 0..3 {
        if i < opponents.len() {
            let idx = opponents[i].car_index;
            let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, mirror_x);
            ptr = write_standard_player_29(obs, ptr, &p, &ball);
        } else {
            ptr += 29;
        }
    }
    let _ = ptr;
    out
}

/// 2. Dice Observation Builder (167 floats: 1 teammate, 2 opponents, pad clamp 0.999).
pub fn build_dice_obs(
    state: &GameStateBufferPod,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let self_ja = state.car_jump_air[self_car_index];

    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(&self_cv, &self_ja, inv, false);
    let mut out = BuiltBotpackObs {
        len: 167,
        mirror_x: false,
        self_car: self_cv,
        ..BuiltBotpackObs::default()
    };
    let obs = &mut out.obs;
    let mut ptr = 0usize;

    obs[ptr] = ball.pos_x * POS_COEF;
    obs[ptr + 1] = ball.pos_y * POS_COEF;
    obs[ptr + 2] = ball.pos_z * POS_COEF;
    obs[ptr + 3] = ball.vel_x * VEL_COEF;
    obs[ptr + 4] = ball.vel_y * VEL_COEF;
    obs[ptr + 5] = ball.vel_z * VEL_COEF;
    obs[ptr + 6] = ball.ang_vel_x * ANG_VEL_COEF;
    obs[ptr + 7] = ball.ang_vel_y * ANG_VEL_COEF;
    obs[ptr + 8] = ball.ang_vel_z * ANG_VEL_COEF;
    ptr += 9;

    let act_arr = encode_car_controls_8(prev_controls);
    obs[ptr..ptr + 8].copy_from_slice(&act_arr);
    ptr += 8;

    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 0.999);
    ptr = write_standard_player_29(obs, ptr, &self_phys, &ball);

    let (teammates, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 1, 2);
    if !teammates.is_empty() {
        let idx = teammates[0].car_index;
        let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
        ptr = write_standard_player_29(obs, ptr, &p, &ball);
    } else {
        ptr += 29;
    }
    for i in 0..2 {
        if i < opponents.len() {
            let idx = opponents[i].car_index;
            let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
            ptr = write_standard_player_29(obs, ptr, &p, &ball);
        } else {
            ptr += 29;
        }
    }
    let _ = ptr;
    out
}

/// 6. Kira Observation Builder (109 floats: 0 teammates, 1 opponent).
pub fn build_kira_obs(
    state: &GameStateBufferPod,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let self_ja = state.car_jump_air[self_car_index];

    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(&self_cv, &self_ja, inv, false);
    let mut out = BuiltBotpackObs {
        len: 109,
        mirror_x: false,
        self_car: self_cv,
        ..BuiltBotpackObs::default()
    };
    let obs = &mut out.obs;
    let mut ptr = 0usize;

    obs[ptr] = ball.pos_x * POS_COEF;
    obs[ptr + 1] = ball.pos_y * POS_COEF;
    obs[ptr + 2] = ball.pos_z * POS_COEF;
    obs[ptr + 3] = ball.vel_x * VEL_COEF;
    obs[ptr + 4] = ball.vel_y * VEL_COEF;
    obs[ptr + 5] = ball.vel_z * VEL_COEF;
    obs[ptr + 6] = ball.ang_vel_x * ANG_VEL_COEF;
    obs[ptr + 7] = ball.ang_vel_y * ANG_VEL_COEF;
    obs[ptr + 8] = ball.ang_vel_z * ANG_VEL_COEF;
    ptr += 9;

    let act_arr = encode_car_controls_8(prev_controls);
    obs[ptr..ptr + 8].copy_from_slice(&act_arr);
    ptr += 8;

    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);
    ptr = write_standard_player_29(obs, ptr, &self_phys, &ball);

    let (_, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 0, 1);
    if !opponents.is_empty() {
        let idx = opponents[0].car_index;
        let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
        let _ = write_standard_player_29(obs, ptr, &p, &ball);
    }
    out
}

/// 7. Rain (3v3) Observation Builder (231 floats: `AdvancedObsPadded(3)` + 6 goal-relative ball floats).
pub fn build_rain_obs(
    state: &GameStateBufferPod,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
) -> BuiltBotpackObs {
    let norm_team = if self_team == 1 { 1 } else { 0 };
    let inv = norm_team == 1;
    let self_cv = state.cars[self_car_index];
    let self_ja = state.car_jump_air[self_car_index];

    let ball = get_ball_phys(&state.ball, inv, false);
    let self_phys = get_car_phys(&self_cv, &self_ja, inv, false);
    let mut out = BuiltBotpackObs {
        len: 231,
        mirror_x: false,
        self_car: self_cv,
        ..BuiltBotpackObs::default()
    };
    let obs = &mut out.obs;
    let mut ptr = 0usize;

    obs[ptr] = ball.pos_x * POS_COEF;
    obs[ptr + 1] = ball.pos_y * POS_COEF;
    obs[ptr + 2] = ball.pos_z * POS_COEF;
    obs[ptr + 3] = ball.vel_x * VEL_COEF;
    obs[ptr + 4] = ball.vel_y * VEL_COEF;
    obs[ptr + 5] = ball.vel_z * VEL_COEF;
    obs[ptr + 6] = ball.ang_vel_x * ANG_VEL_COEF;
    obs[ptr + 7] = ball.ang_vel_y * ANG_VEL_COEF;
    obs[ptr + 8] = ball.ang_vel_z * ANG_VEL_COEF;
    ptr += 9;

    let own_goal = if inv { ORANGE_GOAL_BACK } else { BLUE_GOAL_BACK };
    let enemy_goal = if inv { BLUE_GOAL_BACK } else { ORANGE_GOAL_BACK };
    obs[ptr] = (own_goal[0] - ball.pos_x) * POS_COEF;
    obs[ptr + 1] = (own_goal[1] - ball.pos_y) * POS_COEF;
    obs[ptr + 2] = (own_goal[2] - ball.pos_z) * POS_COEF;
    obs[ptr + 3] = (enemy_goal[0] - ball.pos_x) * POS_COEF;
    obs[ptr + 4] = (enemy_goal[1] - ball.pos_y) * POS_COEF;
    obs[ptr + 5] = (enemy_goal[2] - ball.pos_z) * POS_COEF;
    ptr += 6;

    let act_arr = encode_car_controls_8(prev_controls);
    obs[ptr..ptr + 8].copy_from_slice(&act_arr);
    ptr += 8;

    ptr = write_boost_pads_34(obs, ptr, state, inv, false, 1.0);
    ptr = write_standard_player_29(obs, ptr, &self_phys, &ball);

    let (teammates, opponents) =
        collect_teammates_and_opponents(state, roster, self_car_index, norm_team, 2, 3);
    for i in 0..2 {
        if i < teammates.len() {
            let idx = teammates[i].car_index;
            let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
            ptr = write_standard_player_29(obs, ptr, &p, &ball);
        } else {
            ptr += 29;
        }
    }
    for i in 0..3 {
        if i < opponents.len() {
            let idx = opponents[i].car_index;
            let p = get_car_phys(&state.cars[idx], &state.car_jump_air[idx], inv, false);
            ptr = write_standard_player_29(obs, ptr, &p, &ball);
        } else {
            ptr += 29;
        }
    }
    let _ = ptr;
    out
}
