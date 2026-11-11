//! Kickoff V1 / V2 PPO observation & 6-head action inference, timeline precomputation,
//! and Botpack #9700488 observation/action pipeline.

#[path = "botpack_actions.rs"]
pub mod botpack_actions;
#[path = "botpack_obs_core.rs"]
pub mod botpack_obs_core;
#[path = "botpack_obs_extended.rs"]
pub mod botpack_obs_extended;
#[path = "botpack_player_encoders.rs"]
pub mod botpack_player_encoders;
#[path = "botpack_relative_features.rs"]
pub mod botpack_relative_features;
#[path = "kickoff_v1_v2_obs.rs"]
pub mod kickoff_v1_v2_obs;

use rc_physics_sim::{
    layout::{CarControlsPod, MAX_CARS},
    sim_instance::SimInstance,
};

use crate::{
    heuristic_and_kickoff::nexto_scripted_kickoff_controls,
    layout_and_specs::{
        BotPolicyId, CHRONOS_SPEC, DICE_SPEC, DUCKY_SPEC, FURY_SPEC, GALACTUS_SPEC, KIRA_SPEC,
        KickoffTimelineBufferPod, KickoffTimelineStepPod, KICKOFF_MAX_PRECOMPUTE_STEPS, RAIN_SPEC,
    },
    safetensors_store::ParsedPolicyWeights,
    simd_math::select_masked_argmax,
};

use self::{
    botpack_actions::{
        DEFAULT_90_ACTIONS, NUM_DEFAULT_ACTIONS, NUM_FURY_ACTIONS, compute_default_action_90_mask,
        forward_sequential_mlp, mirror_action_controls_x,
    },
    botpack_obs_core::{build_chronos_obs, build_dice_obs, build_kira_obs, build_rain_obs},
    botpack_obs_extended::{build_ducky_obs, build_fury_obs, build_galactus_obs},
    botpack_relative_features::ActiveCarSlot,
    kickoff_v1_v2_obs::{
        KickoffSlotState, apply_kickoff_v2_action_mask, build_kickoff_v1_obs, build_kickoff_v2_obs,
        decode_6head_multi_discrete, forward_kickoff_tanh_mlp, multi_discrete_to_controls,
        pack_multi_discrete_6, sanitize_and_record_tick_controls,
    },
};

pub const TICKS_PER_KICKOFF_DECISION: usize = 4;
pub const KICKOFF_V1_SETTLE_TICKS: i32 = 30;
pub const KICKOFF_V2_SETTLE_TICKS: i32 = 60;

pub const KICKOFF_SPAWN_TABLE: [(f32, f32); 5] = [
    (-2048.0, -2560.0), // 0: left-front
    (-256.0, -3840.0),  // 1: left-back
    (0.0, -4608.0),     // 2: center-back
    (256.0, -3840.0),   // 3: right-back
    (2048.0, -2560.0),  // 4: right-front
];

pub fn step_kickoff_v1_slot(
    sim: &SimInstance,
    car_index: usize,
    team: u32,
    is_decision_tick: bool,
    model: &ParsedPolicyWeights,
    slot_state: &mut KickoffSlotState,
) -> (CarControlsPod, i32) {
    let team_sign = if team == 1 { -1.0 } else { 1.0 };
    if is_decision_tick {
        let mut obs = [0.0f32; 75];
        build_kickoff_v1_obs(sim, car_index, team_sign, &slot_state.tracker, &mut obs);
        let mut logits = [0.0f32; 15];
        if forward_kickoff_tanh_mlp(&obs, model, &mut logits) {
            let act = decode_6head_multi_discrete(&logits);
            slot_state.last_multi_discrete = act;
            slot_state.last_raw_controls = multi_discrete_to_controls(&act);
        }
    }
    let ctrl = slot_state.last_raw_controls;
    let on_ground = sim.state_buffer.cars[car_index].is_on_ground > 0.5;
    slot_state.tracker.step_tick(ctrl.jump >= 0.5, on_ground);
    (ctrl, pack_multi_discrete_6(&slot_state.last_multi_discrete))
}

pub fn step_kickoff_v2_slot(
    sim: &SimInstance,
    car_index: usize,
    team: u32,
    is_decision_tick: bool,
    model: &ParsedPolicyWeights,
    slot_state: &mut KickoffSlotState,
) -> (CarControlsPod, i32) {
    let is_orange = team == 1;
    if is_decision_tick {
        let mut obs = [0.0f32; 78];
        build_kickoff_v2_obs(
            &sim.state_buffer,
            car_index,
            is_orange,
            &slot_state.prev_action_vec,
            &mut obs,
        );
        let mut logits = [0.0f32; 15];
        if forward_kickoff_tanh_mlp(&obs, model, &mut logits) {
            apply_kickoff_v2_action_mask(&obs, &mut logits);
            let act = decode_6head_multi_discrete(&logits);
            slot_state.last_multi_discrete = act;
            slot_state.last_raw_controls = multi_discrete_to_controls(&act);
        }
    }
    let sanitized = sanitize_and_record_tick_controls(
        &sim.state_buffer,
        car_index,
        &slot_state.last_raw_controls,
        slot_state.channel_mode_separated,
        &mut slot_state.prev_action_vec,
    );
    (sanitized, pack_multi_discrete_6(&slot_state.last_multi_discrete))
}

pub fn reset_sim_to_kickoff_spawn_and_settle(
    sim: &mut SimInstance,
    spawn_index: usize,
    settle_ticks: i32,
) {
    let (sx, sy) = KICKOFF_SPAWN_TABLE[spawn_index.min(4)];
    let ball_arr: [f32; 18] = [
        0.0, 0.0, 93.15, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    ];
    sim.set_ball_state_from_slice(&ball_arr);

    let mut car_arr = [0.0f32; 40];
    car_arr[0] = sx;
    car_arr[1] = sy;
    car_arr[2] = 17.0;
    if sx.abs() < 500.0 {
        car_arr[3..12].copy_from_slice(&[0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
    } else {
        let s2 = core::f32::consts::FRAC_1_SQRT_2;
        let sgn = if sx > 0.0 { -1.0 } else { 1.0 };
        car_arr[3..12].copy_from_slice(&[sgn * s2, s2, 0.0, -s2, sgn * s2, 0.0, 0.0, 0.0, 1.0]);
    }
    car_arr[18] = 100.0 / 3.0;
    car_arr[19] = 1.0;
    car_arr[22] = 1.0;
    car_arr[39] = 1.0;
    sim.set_car_state_from_slice(0, &car_arr);
    sim.controls_buffer[0] = CarControlsPod::default();

    if settle_ticks > 0 {
        sim.step(settle_ticks, true);
        car_arr[2] = sim.state_buffer.cars[0].pos[2];
        sim.set_car_state_from_slice(0, &car_arr);
        sim.controls_buffer[0] = CarControlsPod::default();
    }
}

pub fn precompute_kickoff_timeline(
    sim: &mut SimInstance,
    policy_id: BotPolicyId,
    model_opt: Option<&ParsedPolicyWeights>,
    spawn_index: i32,
    max_steps: i32,
    out_timeline: &mut KickoffTimelineBufferPod,
) -> u32 {
    if sim.car_slots[0].is_none() {
        let _ = sim.add_car_at_slot(0, 0, 0);
    }
    let clamped_spawn = spawn_index.clamp(0, 4) as usize;
    let steps_limit = (max_steps.max(1) as usize).min(KICKOFF_MAX_PRECOMPUTE_STEPS);
    let is_v1 = policy_id == BotPolicyId::KickoffV1Ppo;
    let settle_ticks = if is_v1 { KICKOFF_V1_SETTLE_TICKS } else { KICKOFF_V2_SETTLE_TICKS };

    reset_sim_to_kickoff_spawn_and_settle(sim, clamped_spawn, settle_ticks);

    let mut slot_state = KickoffSlotState::default();
    let mut touch_tick = u32::MAX;
    let mut touch_step = u32::MAX;
    let mut total_steps = 0usize;

    for step in 0..steps_limit {
        let (raw_ctrl, act) = if let Some(model) = model_opt {
            let mut logits = [0.0f32; 15];
            let ok = if is_v1 {
                let mut obs = [0.0f32; 75];
                build_kickoff_v1_obs(sim, 0, 1.0, &slot_state.tracker, &mut obs);
                forward_kickoff_tanh_mlp(&obs, model, &mut logits)
            } else {
                let mut obs = [0.0f32; 78];
                build_kickoff_v2_obs(&sim.state_buffer, 0, false, &slot_state.prev_action_vec, &mut obs);
                let res = forward_kickoff_tanh_mlp(&obs, model, &mut logits);
                if res {
                    apply_kickoff_v2_action_mask(&obs, &mut logits);
                }
                res
            };
            if ok {
                let a = decode_6head_multi_discrete(&logits);
                (multi_discrete_to_controls(&a), a)
            } else {
                (CarControlsPod::default(), [1, 1, 1, 0, 0, 0])
            }
        } else {
            let ctrl = nexto_scripted_kickoff_controls(&sim.state_buffer, 0, 0, step as u32)
                .unwrap_or_default();
            (ctrl, [2, 1, 1, 0, 1, 0])
        };

        let start_t = (step * TICKS_PER_KICKOFF_DECISION) as u32;
        out_timeline.steps[step] = KickoffTimelineStepPod {
            step_index: step as u32,
            start_tick: start_t,
            end_tick: start_t + (TICKS_PER_KICKOFF_DECISION as u32),
            multi_discrete_act: act,
            _pad: [0; 2],
            controls: raw_ctrl,
        };
        total_steps = step + 1;

        for sub in 0..TICKS_PER_KICKOFF_DECISION {
            let t = step * TICKS_PER_KICKOFF_DECISION + sub;
            let applied = if is_v1 {
                raw_ctrl
            } else {
                sanitize_and_record_tick_controls(&sim.state_buffer, 0, &raw_ctrl, false, &mut slot_state.prev_action_vec)
            };
            sim.controls_buffer[0] = applied;
            sim.step(1, true);
            if is_v1 {
                slot_state.tracker.step_tick(raw_ctrl.jump >= 0.5, sim.state_buffer.cars[0].is_on_ground > 0.5);
            }

            let bv = sim.state_buffer.ball.vel;
            if touch_tick == u32::MAX && (bv[0] * bv[0] + bv[1] * bv[1] + bv[2] * bv[2]) > 1.0 {
                touch_tick = (t + 1) as u32;
                touch_step = (step + 1) as u32;
            }
        }

        if touch_step != u32::MAX && (step as u32) >= touch_step + 2 {
            break;
        }
    }

    out_timeline.spawn_index = clamped_spawn as u32;
    out_timeline.step_count = total_steps as u32;
    out_timeline.touch_tick = if touch_tick != u32::MAX { touch_tick } else { (total_steps * TICKS_PER_KICKOFF_DECISION) as u32 };
    out_timeline.touch_step = if touch_step != u32::MAX { touch_step } else { total_steps as u32 };

    reset_sim_to_kickoff_spawn_and_settle(sim, clamped_spawn, settle_ticks);
    total_steps as u32
}

#[allow(clippy::too_many_arguments)]
pub fn step_botpack_mlp_slot(
    sim: &mut SimInstance,
    policy_id: BotPolicyId,
    model: &ParsedPolicyWeights,
    prev_controls: &CarControlsPod,
    self_car_index: usize,
    self_team: i32,
    roster: &[ActiveCarSlot],
    fury_actions: &[CarControlsPod; NUM_FURY_ACTIONS],
) -> Option<(CarControlsPod, i32)> {
    let (spec, built) = match policy_id {
        BotPolicyId::Chronos => (&CHRONOS_SPEC, build_chronos_obs(&sim.state_buffer, prev_controls, self_car_index, self_team, roster)),
        BotPolicyId::Dice => (&DICE_SPEC, build_dice_obs(&sim.state_buffer, prev_controls, self_car_index, self_team, roster)),
        BotPolicyId::Ducky => (&DUCKY_SPEC, build_ducky_obs(sim, prev_controls, self_car_index, self_team, roster)),
        BotPolicyId::Fury => (&FURY_SPEC, build_fury_obs(sim, prev_controls, self_car_index, self_team, roster)),
        BotPolicyId::Galactus => (&GALACTUS_SPEC, build_galactus_obs(sim, prev_controls, self_car_index, self_team, roster)),
        BotPolicyId::Kira => (&KIRA_SPEC, build_kira_obs(&sim.state_buffer, prev_controls, self_car_index, self_team, roster)),
        BotPolicyId::Rain => (&RAIN_SPEC, build_rain_obs(&sim.state_buffer, prev_controls, self_car_index, self_team, roster)),
        _ => return None,
    };

    let mut logits = [0.0f32; NUM_FURY_ACTIONS];
    if !forward_sequential_mlp(&built.obs[..built.len], model, spec, &mut logits[..spec.out_dim]) {
        return None;
    }

    if policy_id == BotPolicyId::Fury {
        let act_idx = select_masked_argmax(&logits[..NUM_FURY_ACTIONS], None);
        let ctrl = fury_actions.get(act_idx).copied().unwrap_or_default();
        Some((ctrl, act_idx as i32))
    } else {
        let mut mask90 = [0u8; NUM_DEFAULT_ACTIONS];
        compute_default_action_90_mask(&built.self_car, &mut mask90);
        let act_idx = select_masked_argmax(&logits[..NUM_DEFAULT_ACTIONS], Some(&mask90));
        let raw_ctrl = DEFAULT_90_ACTIONS.get(act_idx).copied().unwrap_or_default();
        let ctrl = if built.mirror_x { mirror_action_controls_x(raw_ctrl) } else { raw_ctrl };
        Some((ctrl, act_idx as i32))
    }
}

pub fn build_active_roster_from_slots(
    sim: &SimInstance,
    slot_teams: &[u32; MAX_CARS],
) -> Vec<ActiveCarSlot> {
    let mut roster = Vec::with_capacity(MAX_CARS);
    for (slot, &team) in slot_teams.iter().enumerate() {
        if sim.car_slots[slot].is_some() {
            roster.push(ActiveCarSlot { car_index: slot, team: team as i32 });
        }
    }
    if roster.is_empty() {
        let count = (sim.state_buffer.header.num_cars as usize).clamp(1, MAX_CARS);
        for (i, &team) in slot_teams.iter().take(count).enumerate() {
            roster.push(ActiveCarSlot { car_index: i, team: team as i32 });
        }
    }
    roster
}
