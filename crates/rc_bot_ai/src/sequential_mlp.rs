//! Multi-layer SIMD Linear + LayerNorm + ReLU/LeakyReLU inference engine (`SequentialMlp`),
//! discrete action lookup tables (`DefaultAction` 90, `AdvancedActionOld` 380), and state-dependent
//! action masks for `rc_bot_ai`.

use std::sync::OnceLock;

use rc_physics_sim::{
    layout::{CarControlsPod, CarStatePod, MAX_CARS},
    sim_instance::SimInstance,
};

use crate::{
    layout_and_specs::{
        BotPolicyId, MlpPolicyArchSpec, CHRONOS_SPEC, DICE_SPEC, DUCKY_SPEC, FURY_SPEC,
        GALACTUS_SPEC, KIRA_SPEC, MAX_BOT_ACTION_LOGITS, MAX_MLP_HIDDEN_DIM, RAIN_SPEC,
    },
    mlp_obs_extended::{build_ducky_obs, build_fury_obs, build_galactus_obs, ensure_sim_ball_prediction},
    mlp_obs_standard::{
        build_chronos_obs, build_dice_obs, build_kira_obs, build_rain_obs, mirror_controls_x,
    },
    safetensors_store::ParsedPolicyWeights,
    simd_math::{linear_layer_norm_leaky_relu, mat_vec_bias, select_masked_argmax},
};

const NUM_GROUND_90: usize = 24;

const fn build_default_90_actions() -> [[f32; 8]; 90] {
    let mut table = [[0.0f32; 8]; 90];
    let mut idx = 0usize;
    let vals3 = [-1.0f32, 0.0, 1.0];
    let vals2 = [0.0f32, 1.0];

    let mut ti = 0;
    while ti < 3 {
        let throttle = vals3[ti];
        let mut si = 0;
        while si < 3 {
            let steer = vals3[si];
            let mut bi = 0;
            while bi < 2 {
                let boost = vals2[bi];
                let mut hi = 0;
                while hi < 2 {
                    let handbrake = vals2[hi];
                    if !(boost == 1.0 && throttle != 1.0) {
                        let thr = if throttle != 0.0 { throttle } else { boost };
                        table[idx] = [thr, steer, 0.0, steer, 0.0, 0.0, boost, handbrake];
                        idx += 1;
                    }
                    hi += 1;
                }
                bi += 1;
            }
            si += 1;
        }
        ti += 1;
    }

    let mut pi = 0;
    while pi < 3 {
        let pitch = vals3[pi];
        let mut yi = 0;
        while yi < 3 {
            let yaw = vals3[yi];
            let mut ri = 0;
            while ri < 3 {
                let roll = vals3[ri];
                let mut ji = 0;
                while ji < 2 {
                    let jump = vals2[ji];
                    let mut bi = 0;
                    while bi < 2 {
                        let boost = vals2[bi];
                        if !((jump == 1.0 && yaw != 0.0)
                            || (pitch == 0.0 && roll == 0.0 && jump == 0.0))
                        {
                            let hb = if jump == 1.0 && (pitch != 0.0 || yaw != 0.0 || roll != 0.0)
                            {
                                1.0
                            } else {
                                0.0
                            };
                            table[idx] = [boost, yaw, pitch, yaw, roll, jump, boost, hb];
                            idx += 1;
                        }
                        bi += 1;
                    }
                    ji += 1;
                }
                ri += 1;
            }
            yi += 1;
        }
        pi += 1;
    }
    table
}

/// Precomputed 90-action lookup table (`DefaultAction` / `Nexto`).
pub const DEFAULT_90_ACTIONS: [[f32; 8]; 90] = build_default_90_actions();

/// Computes the 90-element action mask matching `DefaultAction::GetActionMask`.
pub fn compute_default_action_90_mask(car: &CarStatePod, out_mask: &mut [u8; 90]) {
    if car.is_demoed > 0.0 {
        out_mask.fill(0);
        out_mask[0] = 1;
        return;
    }

    let is_on_ground = car.is_on_ground >= 0.5;
    let has_boost = car.boost > 0.0;
    let has_flip_or_jump = car.has_flip_or_jump.round() as i32 != 0;
    let is_turtled = car.ground_normal[2] > 0.9 || car.up[2] < -0.9;
    let enable_jump = has_flip_or_jump || is_turtled;

    for (i, a) in DEFAULT_90_ACTIONS.iter().enumerate() {
        let is_ground_idx = i < NUM_GROUND_90;
        let a_jump = a[5] > 0.0;
        let a_boost = a[6] > 0.0;
        let a_hb = a[7] > 0.0;

        let mut valid = if is_on_ground {
            is_ground_idx
        } else {
            (!is_ground_idx && !a_jump)
                || (is_ground_idx
                    && a[0] == (if a_boost { 1.0 } else { 0.0 })
                    && (a[3] != 0.0) == a_hb)
        };

        if !has_boost && a_boost {
            valid = false;
        }
        if enable_jump && a_jump {
            valid = true;
        }
        out_mask[i] = if valid { 1 } else { 0 };
    }
}

fn build_fury_380_actions() -> [[f32; 8]; 380] {
    let mut actions = [[0.0f32; 8]; 380];
    let mut idx = 0usize;
    let thr = [-1.0f32, -1.0 / 3.0, 1.0 / 3.0, 1.0];
    let str_bins = [-1.0f32, -0.5, 0.0, 0.5, 1.0];

    for &t in &thr {
        for &s in &str_bins {
            for &b in &[0.0f32, 1.0] {
                for &h in &[0.0f32, 1.0] {
                    if b == 1.0 && (t - 1.0).abs() > 1e-6 {
                        continue;
                    }
                    actions[idx] = [t, s, 0.0, s, 0.0, 0.0, b, h];
                    idx += 1;
                }
            }
        }
    }

    let db = [-0.75f32, -0.25, 0.25, 0.75];
    let mut face = [[0.0f32; 2]; 41];
    let mut f_len = 0usize;
    for &x in &str_bins {
        for &y in &str_bins {
            face[f_len] = [x, y];
            f_len += 1;
        }
    }
    for &x in &db {
        for &y in &db {
            face[f_len] = [x, y];
            f_len += 1;
        }
    }

    let mut unique_cube = [[0.0f32; 3]; 162];
    let mut u_len = 0usize;
    for &[fst, snd] in &face[..f_len] {
        for axis in 0..3 {
            for &side in &[-1.0f32, 1.0] {
                let mut arr = [0.0f32; 3];
                for (d, val) in arr.iter_mut().enumerate() {
                    *val = if d == axis {
                        side
                    } else if d == 0 {
                        fst
                    } else {
                        snd
                    };
                }
                let exists = unique_cube[..u_len].iter().any(|c| {
                    (c[0] - arr[0]).abs() < 1e-5
                        && (c[1] - arr[1]).abs() < 1e-5
                        && (c[2] - arr[2]).abs() < 1e-5
                });
                if !exists {
                    unique_cube[u_len] = arr;
                    u_len += 1;
                }
            }
        }
    }

    for &[pitch, yaw, roll] in &unique_cube[..u_len] {
        if pitch == 0.0 && roll == 0.0 && str_bins.iter().any(|&v| (v - yaw).abs() < 1e-6) {
            continue;
        }
        for &b in &[0.0f32, 1.0] {
            actions[idx] = [b, yaw, pitch, yaw, roll, 0.0, b, 0.0];
            idx += 1;
        }
    }

    for flip_i in -1i32..7 {
        let (pitch, roll) = if flip_i < 0 {
            (0.0f32, 0.0f32)
        } else {
            let ang = -1.0f32 + (2.0f32 / 7.0f32) * (flip_i as f32);
            let p = ang.sin();
            let r = ang.cos();
            let mag = p.abs().max(r.abs());
            (p / mag, r / mag)
        };
        for &b in &[0.0f32, 1.0] {
            actions[idx] = [b, 0.0, pitch, 0.0, roll, 1.0, b, 1.0];
            idx += 1;
        }
    }

    actions[idx] = [0.0, 0.0, 0.0, 1.0, -1.0, 1.0, 0.0, 1.0];
    actions[idx + 1] = [0.0, 0.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0];
    actions
}

/// Returns Fury's 380-action lookup table (`AdvancedActionOld(4, 5, 5, 7, true)`).
pub fn fury_380_actions() -> &'static [[f32; 8]; 380] {
    static FURY_TABLE: OnceLock<[[f32; 8]; 380]> = OnceLock::new();
    FURY_TABLE.get_or_init(build_fury_380_actions)
}

#[inline]
pub fn controls_from_action_row(row: &[f32; 8]) -> CarControlsPod {
    CarControlsPod {
        throttle: row[0],
        steer: row[1],
        pitch: row[2],
        yaw: row[3],
        roll: row[4],
        jump: if row[5] > 0.0 { 1.0 } else { 0.0 },
        boost: if row[6] > 0.0 { 1.0 } else { 0.0 },
        handbrake: if row[7] > 0.0 { 1.0 } else { 0.0 },
    }
}

/// Returns the static architecture descriptor for any of the 7 MLP policies.
#[inline]
pub const fn mlp_spec_for_policy(policy_id: BotPolicyId) -> Option<&'static MlpPolicyArchSpec> {
    match policy_id {
        BotPolicyId::Chronos => Some(&CHRONOS_SPEC),
        BotPolicyId::Dice => Some(&DICE_SPEC),
        BotPolicyId::Ducky => Some(&DUCKY_SPEC),
        BotPolicyId::Fury => Some(&FURY_SPEC),
        BotPolicyId::Galactus => Some(&GALACTUS_SPEC),
        BotPolicyId::Kira => Some(&KIRA_SPEC),
        BotPolicyId::Rain => Some(&RAIN_SPEC),
        _ => None,
    }
}

fn fetch_layer_tensors<'a>(
    weights: &'a ParsedPolicyWeights,
    prefix: &str,
    idx: usize,
    in_dim: usize,
    out_dim: usize,
) -> Option<(&'a [f32], &'a [f32], &'a [f32], &'a [f32])> {
    let w_key = format!("{prefix}.layers.{idx}.linear.weight");
    let b_key = format!("{prefix}.layers.{idx}.linear.bias");
    let ln_w_key = format!("{prefix}.layers.{idx}.ln.weight");
    let ln_b_key = format!("{prefix}.layers.{idx}.ln.bias");

    let w = weights.f32_slice(&w_key)?;
    let b = weights.f32_slice(&b_key)?;
    let ln_w = weights.f32_slice(&ln_w_key)?;
    let ln_b = weights.f32_slice(&ln_b_key)?;

    if w.len() < in_dim * out_dim
        || b.len() < out_dim
        || ln_w.len() < out_dim
        || ln_b.len() < out_dim
    {
        return None;
    }
    Some((w, b, ln_w, ln_b))
}

/// Executes a full zero-heap-allocation forward pass for a GigaLearn / RocketForge Sequential MLP.
pub fn forward_sequential_mlp(
    obs: &[f32],
    weights: &ParsedPolicyWeights,
    spec: &MlpPolicyArchSpec,
    logits_out: &mut [f32],
) -> Option<usize> {
    if obs.len() < spec.obs_dim
        || spec.out_dim == 0
        || spec.out_dim > logits_out.len()
        || spec.out_dim > MAX_BOT_ACTION_LOGITS
    {
        return None;
    }

    let mut buf_a = [0.0f32; MAX_MLP_HIDDEN_DIM];
    let mut buf_b = [0.0f32; MAX_MLP_HIDDEN_DIM];
    let mut cur_dim = spec.obs_dim;
    let mut ping = true;
    let mut from_obs = true;

    for (i, &next_dim) in spec.shared_dims.iter().enumerate() {
        if next_dim == 0 || next_dim > MAX_MLP_HIDDEN_DIM {
            return None;
        }
        let (w, b, ln_w, ln_b) = fetch_layer_tensors(weights, "shared", i, cur_dim, next_dim)?;
        if from_obs {
            linear_layer_norm_leaky_relu(
                &obs[..cur_dim],
                cur_dim,
                next_dim,
                w,
                b,
                ln_w,
                ln_b,
                spec.leaky_alpha,
                &mut buf_a[..next_dim],
            );
            ping = false;
            from_obs = false;
        } else if ping {
            linear_layer_norm_leaky_relu(
                &buf_b[..cur_dim],
                cur_dim,
                next_dim,
                w,
                b,
                ln_w,
                ln_b,
                spec.leaky_alpha,
                &mut buf_a[..next_dim],
            );
            ping = false;
        } else {
            linear_layer_norm_leaky_relu(
                &buf_a[..cur_dim],
                cur_dim,
                next_dim,
                w,
                b,
                ln_w,
                ln_b,
                spec.leaky_alpha,
                &mut buf_b[..next_dim],
            );
            ping = true;
        }
        cur_dim = next_dim;
    }

    for (i, &next_dim) in spec.policy_dims.iter().enumerate() {
        if next_dim == 0 || next_dim > MAX_MLP_HIDDEN_DIM {
            return None;
        }
        let (w, b, ln_w, ln_b) = fetch_layer_tensors(weights, "policy", i, cur_dim, next_dim)?;
        if from_obs {
            linear_layer_norm_leaky_relu(
                &obs[..cur_dim],
                cur_dim,
                next_dim,
                w,
                b,
                ln_w,
                ln_b,
                spec.leaky_alpha,
                &mut buf_a[..next_dim],
            );
            ping = false;
            from_obs = false;
        } else if ping {
            linear_layer_norm_leaky_relu(
                &buf_b[..cur_dim],
                cur_dim,
                next_dim,
                w,
                b,
                ln_w,
                ln_b,
                spec.leaky_alpha,
                &mut buf_a[..next_dim],
            );
            ping = false;
        } else {
            linear_layer_norm_leaky_relu(
                &buf_a[..cur_dim],
                cur_dim,
                next_dim,
                w,
                b,
                ln_w,
                ln_b,
                spec.leaky_alpha,
                &mut buf_b[..next_dim],
            );
            ping = true;
        }
        cur_dim = next_dim;
    }

    let head_w = weights.f32_slice("policy.head.weight")?;
    let head_b = weights.f32_slice("policy.head.bias")?;
    if head_w.len() < cur_dim * spec.out_dim || head_b.len() < spec.out_dim {
        return None;
    }

    let last_hidden = if from_obs {
        &obs[..cur_dim]
    } else if ping {
        &buf_b[..cur_dim]
    } else {
        &buf_a[..cur_dim]
    };
    mat_vec_bias(
        last_hidden,
        cur_dim,
        spec.out_dim,
        head_w,
        Some(head_b),
        &mut logits_out[..spec.out_dim],
    );
    Some(spec.out_dim)
}

/// Builds the policy-specific observation vector, runs the Sequential MLP forward pass,
/// applies the discrete action mask, and decodes the resulting `CarControlsPod` + action index.
#[allow(clippy::too_many_arguments)]
pub fn step_mlp_policy_car(
    sim: &mut SimInstance,
    policy_id: BotPolicyId,
    weights: &ParsedPolicyWeights,
    car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
    prev_controls: CarControlsPod,
) -> Option<(CarControlsPod, i32)> {
    let spec = mlp_spec_for_policy(policy_id)?;
    let built = match policy_id {
        BotPolicyId::Chronos => build_chronos_obs(
            &sim.state_buffer,
            prev_controls,
            car_index,
            self_team,
            active_car_mask,
            slot_teams,
        ),
        BotPolicyId::Dice => build_dice_obs(
            &sim.state_buffer,
            prev_controls,
            car_index,
            self_team,
            active_car_mask,
            slot_teams,
        ),
        BotPolicyId::Ducky => {
            ensure_sim_ball_prediction(sim, 3.1);
            build_ducky_obs(
                &sim.state_buffer,
                &sim.pred_buffer,
                sim.pred_count,
                prev_controls,
                car_index,
                self_team,
                active_car_mask,
                slot_teams,
            )
        }
        BotPolicyId::Fury => {
            ensure_sim_ball_prediction(sim, 2.1);
            build_fury_obs(
                &sim.state_buffer,
                &sim.pred_buffer,
                sim.pred_count,
                prev_controls,
                car_index,
                self_team,
                active_car_mask,
                slot_teams,
            )
        }
        BotPolicyId::Galactus => {
            ensure_sim_ball_prediction(sim, 2.1);
            build_galactus_obs(
                &sim.state_buffer,
                &sim.pred_buffer,
                sim.pred_count,
                prev_controls,
                car_index,
                self_team,
                active_car_mask,
                slot_teams,
            )
        }
        BotPolicyId::Kira => build_kira_obs(
            &sim.state_buffer,
            prev_controls,
            car_index,
            self_team,
            active_car_mask,
            slot_teams,
        ),
        BotPolicyId::Rain => build_rain_obs(
            &sim.state_buffer,
            prev_controls,
            car_index,
            self_team,
            active_car_mask,
            slot_teams,
        ),
        _ => return None,
    };

    let mut logits = [0.0f32; MAX_BOT_ACTION_LOGITS];
    let out_dim = forward_sequential_mlp(&built.obs[..built.len], weights, spec, &mut logits)?;

    if policy_id == BotPolicyId::Fury {
        let best_idx = select_masked_argmax(&logits[..out_dim], None);
        let row = &fury_380_actions()[best_idx.min(379)];
        let ctrl = controls_from_action_row(row);
        Some((ctrl, best_idx as i32))
    } else {
        let mut mask90 = [0u8; 90];
        compute_default_action_90_mask(&sim.state_buffer.cars[car_index], &mut mask90);
        let best_idx = select_masked_argmax(&logits[..out_dim.min(90)], Some(&mask90));
        let mut ctrl = controls_from_action_row(&DEFAULT_90_ACTIONS[best_idx.min(89)]);
        if built.mirror_x {
            ctrl = mirror_controls_x(ctrl);
        }
        Some((ctrl, best_idx as i32))
    }
}
