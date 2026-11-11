//! Action lookup tables (`DefaultAction` 90, `AdvancedActionOld` 380, `RippleLookupAction` 276),
//! state-dependent action masks, X-mirroring, and Sequential MLP forward pass for Botpack #9700488.

use rc_physics_sim::layout::{CarControlsPod, CarStatePod};

use crate::{
    layout_and_specs::MlpPolicyArchSpec,
    safetensors_store::ParsedPolicyWeights,
    simd_math::{linear_layer_norm_leaky_relu, mat_vec_bias},
};

pub const NUM_DEFAULT_ACTIONS: usize = 90;
pub const NUM_GROUND_90: usize = 24;
pub const NUM_FURY_ACTIONS: usize = 380;
pub const NUM_RIPPLE_ACTIONS: usize = 276;
const MAX_HIDDEN_DIM: usize = 1536;

#[inline]
pub const fn decode_car_controls_pod(a: [f32; 8]) -> CarControlsPod {
    CarControlsPod {
        throttle: a[0],
        steer: a[1],
        pitch: a[2],
        yaw: a[3],
        roll: a[4],
        jump: if a[5] > 0.0 { 1.0 } else { 0.0 },
        boost: if a[6] > 0.0 { 1.0 } else { 0.0 },
        handbrake: if a[7] > 0.0 { 1.0 } else { 0.0 },
    }
}

#[inline]
pub fn encode_car_controls_8(c: &CarControlsPod) -> [f32; 8] {
    [
        c.throttle,
        c.steer,
        c.pitch,
        c.yaw,
        c.roll,
        if c.jump >= 0.5 { 1.0 } else { 0.0 },
        if c.boost >= 0.5 { 1.0 } else { 0.0 },
        if c.handbrake >= 0.5 { 1.0 } else { 0.0 },
    ]
}

#[inline]
pub fn mirror_action_controls_x(c: CarControlsPod) -> CarControlsPod {
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

const fn build_default_90_actions() -> [CarControlsPod; NUM_DEFAULT_ACTIONS] {
    let mut table = [decode_car_controls_pod([0.0; 8]); NUM_DEFAULT_ACTIONS];
    let vals3 = [-1.0f32, 0.0, 1.0];
    let vals2 = [0.0f32, 1.0];
    let mut idx = 0usize;

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
                        table[idx] = decode_car_controls_pod([
                            thr, steer, 0.0, steer, 0.0, 0.0, boost, handbrake,
                        ]);
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
                        let skip = (jump == 1.0 && yaw != 0.0)
                            || (pitch == 0.0 && roll == 0.0 && jump == 0.0);
                        if !skip {
                            let hb = if jump == 1.0 && (pitch != 0.0 || yaw != 0.0 || roll != 0.0) {
                                1.0
                            } else {
                                0.0
                            };
                            table[idx] = decode_car_controls_pod([
                                boost, yaw, pitch, yaw, roll, jump, boost, hb,
                            ]);
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

pub const DEFAULT_90_ACTIONS: [CarControlsPod; NUM_DEFAULT_ACTIONS] = build_default_90_actions();

pub fn compute_default_action_90_mask(car: &CarStatePod, out_mask: &mut [u8; NUM_DEFAULT_ACTIONS]) {
    if car.is_demoed > 0.0 {
        out_mask.fill(0);
        out_mask[0] = 1;
        return;
    }
    let on_ground = car.is_on_ground > 0.5;
    for i in 0..NUM_DEFAULT_ACTIONS {
        let a = &DEFAULT_90_ACTIONS[i];
        let is_ground_idx = i < NUM_GROUND_90;
        let jump_b = a.jump >= 0.5;
        let boost_b = a.boost >= 0.5;
        let hb_b = a.handbrake >= 0.5;
        out_mask[i] = if on_ground {
            u8::from(is_ground_idx)
        } else {
            let air_ok = (!is_ground_idx && !jump_b)
                || (is_ground_idx
                    && (a.throttle == if boost_b { 1.0 } else { 0.0 })
                    && ((a.yaw != 0.0) == hb_b));
            u8::from(air_ok)
        };
    }
    if car.boost <= 0.0 {
        for i in 0..NUM_DEFAULT_ACTIONS {
            if DEFAULT_90_ACTIONS[i].boost >= 0.5 {
                out_mask[i] = 0;
            }
        }
    }
    let is_turtled = car.ground_normal[2] > 0.9 || car.up[2] < -0.9;
    if car.has_flip_or_jump > 0.5 || is_turtled {
        for i in 0..NUM_DEFAULT_ACTIONS {
            if DEFAULT_90_ACTIONS[i].jump >= 0.5 {
                out_mask[i] = 1;
            }
        }
    }
}

fn parse_bin(count: usize, endpoint: bool) -> Vec<f32> {
    if count <= 1 {
        return vec![0.0; count];
    }
    let step = 2.0 / if endpoint { (count - 1) as f32 } else { count as f32 };
    (0..count).map(|i| -1.0 + step * (i as f32)).collect()
}

pub fn build_fury_380_actions() -> [CarControlsPod; NUM_FURY_ACTIONS] {
    let thr = parse_bin(4, true);
    let str_bins = parse_bin(5, true);
    let mut actions = Vec::with_capacity(NUM_FURY_ACTIONS);

    for &t in &thr {
        for &s in &str_bins {
            for b in [0.0f32, 1.0] {
                for h in [0.0f32, 1.0] {
                    if b == 1.0 && (t - 1.0).abs() > 1e-6 {
                        continue;
                    }
                    actions.push(decode_car_controls_pod([t, s, 0.0, s, 0.0, 0.0, b, h]));
                }
            }
        }
    }

    let bins = parse_bin(5, true);
    let delta = bins[1] - bins[0];
    let mut face = Vec::with_capacity(41);
    for &x in &bins {
        for &y in &bins {
            face.push((x, y));
        }
    }
    let db: Vec<f32> = (0..4).map(|i| bins[i] + delta * 0.5).collect();
    for &x in &db {
        for &y in &db {
            face.push((x, y));
        }
    }

    let mut unique_cube: Vec<[f32; 3]> = Vec::new();
    for (fst, snd) in face {
        for axis in 0..3 {
            for side in [-1.0f32, 1.0] {
                let mut arr = [0.0f32; 3];
                for (d, slot) in arr.iter_mut().enumerate() {
                    *slot = if d == axis { side } else if d == 0 { fst } else { snd };
                }
                let exists = unique_cube.iter().any(|u| {
                    (u[0] - arr[0]).abs() < 1e-4
                        && (u[1] - arr[1]).abs() < 1e-4
                        && (u[2] - arr[2]).abs() < 1e-4
                });
                if !exists {
                    unique_cube.push(arr);
                }
            }
        }
    }

    for [pitch, yaw, roll] in unique_cube {
        if pitch == 0.0 && roll == 0.0 && str_bins.iter().any(|&v| (v - yaw).abs() < 1e-6) {
            continue;
        }
        for b in [0.0f32, 1.0] {
            actions.push(decode_car_controls_pod([b, yaw, pitch, yaw, roll, 0.0, b, 0.0]));
        }
    }

    for ang_opt in core::iter::once(None).chain(parse_bin(7, false).into_iter().map(Some)) {
        let (mut pitch, mut roll) = (0.0f32, 0.0f32);
        if let Some(ang) = ang_opt {
            pitch = ang.sin();
            roll = ang.cos();
            let mag = pitch.abs().max(roll.abs());
            pitch /= mag;
            roll /= mag;
        }
        for b in [0.0f32, 1.0] {
            actions.push(decode_car_controls_pod([b, 0.0, pitch, 0.0, roll, 1.0, b, 1.0]));
        }
    }

    actions.push(decode_car_controls_pod([0.0, 0.0, 0.0, 1.0, -1.0, 1.0, 0.0, 1.0]));
    actions.push(decode_car_controls_pod([0.0, 0.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0]));

    let mut out = [CarControlsPod::default(); NUM_FURY_ACTIONS];
    for (i, a) in actions.into_iter().take(NUM_FURY_ACTIONS).enumerate() {
        out[i] = a;
    }
    out
}

pub fn forward_sequential_mlp(
    obs: &[f32],
    model: &ParsedPolicyWeights,
    spec: &MlpPolicyArchSpec,
    out_logits: &mut [f32],
) -> bool {
    if obs.len() < spec.obs_dim || out_logits.len() < spec.out_dim {
        return false;
    }
    let mut buf_a = [0.0f32; MAX_HIDDEN_DIM];
    let mut buf_b = [0.0f32; MAX_HIDDEN_DIM];
    buf_a[..spec.obs_dim].copy_from_slice(&obs[..spec.obs_dim]);
    let mut cur_dim = spec.obs_dim;
    let mut use_a_as_in = true;

    for (prefix, dims) in [("shared_head", spec.shared_dims), ("policy", spec.policy_dims)] {
        for (layer_idx, &next_dim) in dims.iter().enumerate() {
            let idx = layer_idx * 3;
            let (Some(w), Some(b), Some(ln_w), Some(ln_b)) = (
                model.f32_slice(&format!("{prefix}.{idx}.weight")),
                model.f32_slice(&format!("{prefix}.{idx}.bias")),
                model.f32_slice(&format!("{prefix}.{}.weight", idx + 1)),
                model.f32_slice(&format!("{prefix}.{}.bias", idx + 1)),
            ) else {
                return false;
            };
            if use_a_as_in {
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
            } else {
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
            }
            use_a_as_in = !use_a_as_in;
            cur_dim = next_dim;
        }
    }

    let out_idx = spec.policy_dims.len() * 3;
    let (Some(out_w), Some(out_b)) = (
        model.f32_slice(&format!("policy.{out_idx}.weight")),
        model.f32_slice(&format!("policy.{out_idx}.bias")),
    ) else {
        return false;
    };
    let final_in = if use_a_as_in { &buf_a[..cur_dim] } else { &buf_b[..cur_dim] };
    mat_vec_bias(
        final_in,
        cur_dim,
        spec.out_dim,
        out_w,
        Some(out_b),
        &mut out_logits[..spec.out_dim],
    );
    true
}
