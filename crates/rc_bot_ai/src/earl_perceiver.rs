//! Dynamic 24-dim entity observation builders and 4-Head Cross-Attention Perceiver inference
//! for Necto (1-block Perceiver, 12-logit factorized output) and Nexto (2-block Pre-LN Perceiver,
//! 90-action dot-product output head).

use rc_physics_sim::layout::{BoostPadInfoPod, GameStateBufferPod, MAX_CARS, MAX_PADS};

use crate::{
    layout_and_specs::{
        MAX_PERCEIVER_ENTITIES as MAX_ENT, PERCEIVER_EMBED_DIM as EMB_DIM,
        PERCEIVER_ENTITY_DIM as ENT_DIM, PERCEIVER_QUERY_DIM as Q_DIM,
    },
    safetensors_store::ParsedPolicyWeights,
    simd_math::{layer_norm_1d, mat_vec_bias},
};

const NUM_HEADS: usize = 4;
const HEAD_DIM: usize = 32;
const ATTN_SCALE: f32 = 5.656_854_2; // sqrt(32.0)
const DEFAULT_TICK_SKIP_SEC: f64 = 8.0 / 120.0;
const BOOST_DECAY_PER_STEP: f64 = 8.0 / 1200.0;

#[inline]
fn dot128(a: &[f32], b: &[f32], mut sum: f32) -> f32 {
    let mut i = 0usize;
    while i < EMB_DIM {
        sum += a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3];
        i += 4;
    }
    sum
}

#[inline]
fn axpy128(dst: &mut [f32; EMB_DIM], scale: f32, src: &[f32]) {
    for i in 0..EMB_DIM {
        dst[i] += scale * src[i];
    }
}

#[inline]
fn linear_vec(x: &[f32], w: &[f32], b: &[f32], out: &mut [f32], relu: bool) {
    mat_vec_bias(x, x.len(), out.len(), w, Some(b), out);
    if relu {
        for v in out.iter_mut() {
            if *v < 0.0 {
                *v = 0.0;
            }
        }
    }
}

#[inline]
fn linear_wb(
    x: &[f32],
    w: &ParsedPolicyWeights,
    prefix: &str,
    out: &mut [f32],
    relu: bool,
) -> Option<()> {
    let weight = w.f32_slice(&format!("{prefix}.weight"))?;
    let bias = w.f32_slice(&format!("{prefix}.bias"))?;
    linear_vec(x, weight, bias, out, relu);
    Some(())
}

#[inline]
fn linear_batch_wb(
    x: &[f32],
    num_tokens: usize,
    in_dim: usize,
    out_dim: usize,
    weights: &ParsedPolicyWeights,
    prefix: &str,
    out: &mut [f32],
    relu: bool,
) -> Option<()> {
    let w = weights.f32_slice(&format!("{prefix}.weight"))?;
    let b = weights.f32_slice(&format!("{prefix}.bias"))?;
    for n in 0..num_tokens {
        let (in_b, out_b) = (n * in_dim, n * out_dim);
        linear_vec(&x[in_b..in_b + in_dim], w, b, &mut out[out_b..out_b + out_dim], relu);
    }
    Some(())
}

#[inline]
fn ln_batch_wb(
    x: &[f32],
    num_tokens: usize,
    weights: &ParsedPolicyWeights,
    prefix: &str,
    out: &mut [f32],
) -> Option<()> {
    let w = weights.f32_slice(&format!("{prefix}.weight"))?;
    let b = weights.f32_slice(&format!("{prefix}.bias"))?;
    for n in 0..num_tokens {
        let base = n * EMB_DIM;
        layer_norm_1d(&x[base..base + EMB_DIM], EMB_DIM, w, b, &mut out[base..base + EMB_DIM]);
    }
    Some(())
}

/// Preallocated scratch buffers for zero-GC EARLPerceiver execution (Nexto / Necto) and dynamic entity construction.
pub struct EarlPerceiverScratch {
    query: [f32; Q_DIM],
    entities_f64: [f64; MAX_ENT * ENT_DIM],
    entities_f32: [f32; MAX_ENT * ENT_DIM],
    num_entities: usize,
    q_h1: [f32; EMB_DIM],
    q_embed: [f32; EMB_DIM],
    kv_tmp: [f32; MAX_ENT * EMB_DIM],
    kv_embed: [f32; MAX_ENT * EMB_DIM],
    q_norm: [f32; EMB_DIM],
    q_proj: [f32; EMB_DIM],
    k_proj: [f32; EMB_DIM],
    v_proj: [f32; EMB_DIM],
    scores: [f32; MAX_ENT],
    head_concat: [f32; EMB_DIM],
    attn_out: [f32; EMB_DIM],
    res1: [f32; EMB_DIM],
    res1_norm: [f32; EMB_DIM],
    ffn_hidden: [f32; 512],
    ffn_out: [f32; EMB_DIM],
    block_out: [f32; EMB_DIM],
    post_relu: [f32; EMB_DIM],
    necto_logits: [f32; 12],
    nexto_emb32: [f32; 32],
    nexto_logits: [f32; 90],
}

impl Default for EarlPerceiverScratch {
    fn default() -> Self {
        Self::new()
    }
}

impl EarlPerceiverScratch {
    pub const fn new() -> Self {
        unsafe { core::mem::zeroed() }
    }

    fn cross_attention_single_query(
        &mut self,
        use_norm_inputs: bool,
        num_entities: usize,
        mask: Option<&[f32]>,
        weights: &ParsedPolicyWeights,
        attn_prefix: &str,
    ) -> Option<()> {
        let in_proj_w = weights.f32_slice(&format!("{attn_prefix}.in_proj_weight"))?;
        let in_proj_b = weights.f32_slice(&format!("{attn_prefix}.in_proj_bias"))?;
        let out_proj_w = weights.f32_slice(&format!("{attn_prefix}.out_proj.weight"))?;
        let out_proj_b = weights.f32_slice(&format!("{attn_prefix}.out_proj.bias"))?;

        let q_vec = if use_norm_inputs { &self.q_norm } else { &self.q_embed };
        let kv_mat = if use_norm_inputs { &self.kv_tmp } else { &self.kv_embed };

        for o in 0..EMB_DIM {
            let w_off = o * EMB_DIM;
            self.q_proj[o] =
                dot128(&in_proj_w[w_off..w_off + EMB_DIM], q_vec, in_proj_b[o]) / ATTN_SCALE;
        }

        let (k_w_off, v_w_off) = (EMB_DIM * EMB_DIM, 2 * EMB_DIM * EMB_DIM);
        let (k_b_off, v_b_off) = (EMB_DIM, 2 * EMB_DIM);

        for h in 0..NUM_HEADS {
            let h_off = h * HEAD_DIM;
            let mut bias_score = 0.0f32;
            self.k_proj.fill(0.0);

            for d in 0..HEAD_DIM {
                let q_val = self.q_proj[h_off + d];
                bias_score += q_val * in_proj_b[k_b_off + h_off + d];
                let wk_row = k_w_off + (h_off + d) * EMB_DIM;
                axpy128(&mut self.k_proj, q_val, &in_proj_w[wk_row..wk_row + EMB_DIM]);
            }

            let mut max_score = f32::NEG_INFINITY;
            for n in 0..num_entities {
                let kv_base = n * EMB_DIM;
                let dot = dot128(&self.k_proj, &kv_mat[kv_base..kv_base + EMB_DIM], bias_score);
                let m_val = mask.and_then(|m| m.get(n).copied()).unwrap_or(0.0);
                let s = if m_val != 0.0 {
                    dot + if m_val < 0.0 { m_val } else { -1e9 }
                } else {
                    dot
                };
                self.scores[n] = s;
                if s > max_score {
                    max_score = s;
                }
            }

            let mut exp_sum = 0.0f32;
            for s in &mut self.scores[..num_entities] {
                let e = (*s - max_score).exp();
                *s = e;
                exp_sum += e;
            }
            let inv_exp_sum = if exp_sum > 0.0 { 1.0 / exp_sum } else { 0.0 };

            self.v_proj.fill(0.0);
            for n in 0..num_entities {
                let kv_base = n * EMB_DIM;
                axpy128(
                    &mut self.v_proj,
                    self.scores[n] * inv_exp_sum,
                    &kv_mat[kv_base..kv_base + EMB_DIM],
                );
            }

            for d in 0..HEAD_DIM {
                let wv_row = v_w_off + (h_off + d) * EMB_DIM;
                self.head_concat[h_off + d] = dot128(
                    &in_proj_w[wv_row..wv_row + EMB_DIM],
                    &self.v_proj,
                    in_proj_b[v_b_off + h_off + d],
                );
            }
        }

        linear_vec(&self.head_concat, out_proj_w, out_proj_b, &mut self.attn_out, false);
        Some(())
    }

    fn preprocess_query_and_kv(
        &mut self,
        num_entities: usize,
        w: &ParsedPolicyWeights,
    ) -> Option<()> {
        if num_entities == 0 || num_entities > MAX_ENT {
            return None;
        }
        linear_wb(&self.query, w, "net.earl.query_preprocess.0", &mut self.q_h1, true)?;
        linear_wb(&self.q_h1, w, "net.earl.query_preprocess.2", &mut self.q_embed, true)?;
        linear_batch_wb(
            &self.entities_f32,
            num_entities,
            ENT_DIM,
            EMB_DIM,
            w,
            "net.earl.key_value_preprocess.0",
            &mut self.kv_tmp,
            true,
        )?;
        linear_batch_wb(
            &self.kv_tmp,
            num_entities,
            EMB_DIM,
            EMB_DIM,
            w,
            "net.earl.key_value_preprocess.2",
            &mut self.kv_embed,
            true,
        )
    }

    fn run_pre_ln_block(
        &mut self,
        block_idx: usize,
        num_entities: usize,
        w: &ParsedPolicyWeights,
        mask: Option<&[f32]>,
        apply_final_relu: bool,
    ) -> Option<()> {
        let p = if block_idx == 0 { "net.earl.blocks.0" } else { "net.earl.blocks.1" };
        let q_in = if block_idx == 0 { self.q_embed } else { self.block_out };

        ln_batch_wb(&q_in, 1, w, &format!("{p}.norm1"), &mut self.q_norm)?;
        ln_batch_wb(&self.kv_embed, num_entities, w, &format!("{p}.norm2"), &mut self.kv_tmp)?;
        self.cross_attention_single_query(true, num_entities, mask, w, &format!("{p}.attention"))?;

        for d in 0..EMB_DIM {
            self.res1[d] = q_in[d] + self.attn_out[d];
        }
        ln_batch_wb(&self.res1, 1, w, &format!("{p}.norm3"), &mut self.res1_norm)?;
        linear_wb(&self.res1_norm, w, &format!("{p}.linear1"), &mut self.ffn_hidden, true)?;
        linear_wb(&self.ffn_hidden, w, &format!("{p}.linear2"), &mut self.ffn_out, false)?;

        let target = if block_idx == 0 { &mut self.block_out } else { &mut self.post_relu };
        for d in 0..EMB_DIM {
            let v = self.res1[d] + self.ffn_out[d];
            target[d] = if apply_final_relu && v < 0.0 { 0.0 } else { v };
        }
        Some(())
    }

    /// Forward pass for Necto (1-block Perceiver, 12-logit factorized output head).
    pub fn forward_necto(
        &mut self,
        w: &ParsedPolicyWeights,
        mask: Option<&[f32]>,
    ) -> Option<&[f32; 12]> {
        let num_entities = self.num_entities;
        self.preprocess_query_and_kv(num_entities, w)?;
        self.cross_attention_single_query(
            false,
            num_entities,
            mask,
            w,
            "net.earl.blocks.0.attention",
        )?;

        for d in 0..EMB_DIM {
            self.res1[d] = self.q_embed[d] + self.attn_out[d];
        }
        linear_wb(&self.res1, w, "net.earl.blocks.0.linear1", &mut self.ffn_hidden[..256], true)?;
        linear_wb(
            &self.ffn_hidden[..256],
            w,
            "net.earl.blocks.0.linear2",
            &mut self.ffn_out,
            false,
        )?;

        for d in 0..EMB_DIM {
            let v = self.res1[d] + self.ffn_out[d];
            self.post_relu[d] = if v > 0.0 { v } else { 0.0 };
        }
        linear_wb(&self.post_relu, w, "net.output.linear", &mut self.necto_logits, false)?;
        Some(&self.necto_logits)
    }

    /// Forward pass for Nexto (2-block Pre-LN Perceiver, 90-action dot-product output head).
    pub fn forward_nexto(
        &mut self,
        w: &ParsedPolicyWeights,
        mask: Option<&[f32]>,
    ) -> Option<&[f32; 90]> {
        let num_entities = self.num_entities;
        self.preprocess_query_and_kv(num_entities, w)?;
        self.run_pre_ln_block(0, num_entities, w, mask, false)?;
        self.run_pre_ln_block(1, num_entities, w, mask, true)?;

        linear_wb(&self.post_relu, w, "net.output.emb_convertor", &mut self.nexto_emb32, false)?;
        let act_emb = w.f32_slice("precomputed.action_embeddings")?;
        for a in 0..90 {
            let a_off = a * 32;
            let mut dot = 0.0f32;
            for d in 0..32 {
                dot += act_emb[a_off + d] * self.nexto_emb32[d];
            }
            self.nexto_logits[a] = dot;
        }
        Some(&self.nexto_logits)
    }
}

/// Builds the dynamic N-car observation tensors for Nexto (`necto_timers = None`) or Necto (`necto_timers = Some(...)`) into `scratch`.
#[allow(clippy::too_many_arguments)]
pub fn build_earl_entities(
    state: &GameStateBufferPod,
    pad_info: &[BoostPadInfoPod; MAX_PADS],
    prev_action_8: &[f32; 8],
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
    mut necto_timers: Option<(&mut [f64; MAX_CARS], &mut [f64; MAX_PADS])>,
    scratch: &mut EarlPerceiverScratch,
) {
    let norm_self_team = if self_team == 1 { 1 } else { 0 };
    let mut ordered_cars = [(0usize, 0u32); MAX_CARS];
    ordered_cars[0] = (self_car_index, norm_self_team);
    let mut num_cars = 1usize;
    for idx in 0..MAX_CARS {
        if idx != self_car_index && (active_car_mask & (1u32 << idx)) != 0 {
            ordered_cars[num_cars] = (idx, if slot_teams[idx] == 1 { 1 } else { 0 });
            num_cars += 1;
        }
    }

    let num_pads = (state.header.num_pads.round().max(0.0) as usize).min(MAX_PADS);
    let num_entities = (num_cars + 1 + num_pads).min(MAX_ENT);
    scratch.num_entities = num_entities;

    let is_necto = necto_timers.is_some();
    let car_base = if is_necto { 1 } else { 0 };
    let ball_off = (if is_necto { 0 } else { num_cars }) * ENT_DIM;
    let entities = &mut scratch.entities_f64;

    entities[..num_entities * ENT_DIM].fill(0.0);
    entities[ball_off + 3] = 1.0;
    for k in 0..3 {
        entities[ball_off + 5 + k] = state.ball.pos[k] as f64;
        entities[ball_off + 8 + k] = state.ball.vel[k] as f64;
        entities[ball_off + 17 + k] = state.ball.ang_vel[k] as f64;
    }

    for (c, &(c_idx, c_team)) in ordered_cars.iter().enumerate().take(num_cars) {
        let d = (car_base + c) * ENT_DIM;
        let car = &state.cars[c_idx];
        let is_mate = c_team == norm_self_team;
        entities[d] = if c == 0 { 1.0 } else { 0.0 };
        entities[d + 1] = if is_mate { 1.0 } else { 0.0 };
        entities[d + 2] = if is_mate { 0.0 } else { 1.0 };
        for k in 0..3 {
            entities[d + 5 + k] = car.pos[k] as f64;
            entities[d + 8 + k] = car.vel[k] as f64;
            entities[d + 11 + k] = car.forward[k] as f64;
            entities[d + 14 + k] = car.up[k] as f64;
            entities[d + 17 + k] = car.ang_vel[k] as f64;
        }
        entities[d + 20] = (car.boost as f64) / 100.0;
        entities[d + 22] = if car.is_on_ground >= 0.5 { 1.0 } else { 0.0 };
        entities[d + 23] = if car.has_flip_or_jump.round() as i32 != 0 { 1.0 } else { 0.0 };

        if let Some((ref mut demo_timers, _)) = necto_timers {
            if car.is_demoed > 0.0 {
                let native = car.is_demoed as f64;
                demo_timers[c_idx] = if native > 0.0 {
                    native
                } else if demo_timers[c_idx] <= 0.0 {
                    3.0
                } else {
                    (demo_timers[c_idx] - DEFAULT_TICK_SKIP_SEC).max(0.0)
                };
                entities[d + 21] = demo_timers[c_idx] / 10.0;
            } else {
                demo_timers[c_idx] = 0.0;
            }
        } else if car.is_demoed > 0.0 {
            entities[d + 21] = 1.0;
        }
    }

    for p in 0..num_pads {
        let p_off = (num_cars + 1 + p) * ENT_DIM;
        if p_off + ENT_DIM > entities.len() {
            break;
        }
        let pad = &pad_info[p];
        let is_active = if state.pads[p].is_active > 0.5 { 1.0 } else { 0.0 };
        entities[p_off + 4] = 1.0;
        entities[p_off + 5] = pad.pos[0] as f64;
        entities[p_off + 6] = pad.pos[1] as f64;
        entities[p_off + 7] = pad.pos[2] as f64;
        entities[p_off + 20] = if pad.is_big >= 0.5 { 1.0 } else { 0.12 };
        entities[p_off + 21] = if let Some((_, ref mut boost_timers)) = necto_timers {
            if is_active == 1.0 && boost_timers[p] == 0.0 {
                boost_timers[p] = 0.4 + 0.6 * if pad.pos[2] > 72.0 { 1.0 } else { 0.0 };
            }
            boost_timers[p] *= is_active;
            let v = boost_timers[p];
            boost_timers[p] = (boost_timers[p] - BOOST_DECAY_PER_STEP).max(0.0);
            v
        } else {
            is_active
        };
    }

    for u in 0..num_entities {
        let p = u * ENT_DIM;
        for v in 5..20 {
            if norm_self_team == 1 && (v - 5) % 3 != 2 {
                entities[p + v] *= -1.0;
            }
            if v < 11 {
                entities[p + v] /= 2300.0;
            } else if v >= 17 {
                entities[p + v] /= 5.5;
            }
        }
    }

    let self_off = car_base * ENT_DIM;
    let mut self_entity = [0.0f64; ENT_DIM];
    self_entity.copy_from_slice(&entities[self_off..self_off + ENT_DIM]);
    for j in 0..ENT_DIM {
        scratch.query[j] = self_entity[j] as f32;
    }
    scratch.query[ENT_DIM..Q_DIM].copy_from_slice(prev_action_8);

    if is_necto {
        for l in 0..num_entities {
            let base = l * ENT_DIM;
            for c in 5..11 {
                entities[base + c] -= self_entity[c];
            }
        }
    } else {
        let yaw = self_entity[11].atan2(self_entity[12]);
        let (cos_y, sin_y) = (yaw.cos(), yaw.sin());
        let (ox, oy, oz) = (self_entity[5], self_entity[6], self_entity[7]);
        for u in 0..num_entities {
            let p = u * ENT_DIM;
            entities[p + 5] -= ox;
            entities[p + 6] -= oy;
            entities[p + 7] -= oz;
            let mut v = 5usize;
            while v < 20 {
                let (gx, gy) = (entities[p + v], entities[p + v + 1]);
                entities[p + v] = cos_y * gx - sin_y * gy;
                entities[p + v + 1] = sin_y * gx + cos_y * gy;
                v += 3;
            }
        }
    }

    for i in 0..(num_entities * ENT_DIM) {
        scratch.entities_f32[i] = entities[i] as f32;
    }
}
