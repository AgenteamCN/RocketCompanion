//! Ripple v1.1 (`rolv/ripple/1.1`) 4-layer Pre-LN 4-Head Perceiver Cross-Attention inference engine.
//!
//! Self-contained within `ripple_perceiver.rs` (backed by `ripple_obs_builder` and
//! `ripple_history_and_pad_encoder`) so T2-13 (`bot_director.rs`) can wire it directly
//! into `BotDirector::step_bot_inference_mask` without cross-branch merge collisions.

use rc_physics_sim::{
    layout::{CarControlsPod, MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

use crate::{
    layout_and_specs::RIPPLE_OTHER_SLOTS,
    ripple_history_and_pad_encoder::{
        build_ripple_276_action_table, RIPPLE_ACTIONS_TOTAL_DIM, RIPPLE_ACTION_DIM,
        RIPPLE_BOOST_PAD_DIM, RIPPLE_NUM_ACTIONS,
    },
    ripple_obs_builder::{
        RippleAgentState, RIPPLE_BALL_TOTAL_DIM, RIPPLE_MAIN_PROC_IN_DIM, RIPPLE_OTHER_DIM,
    },
    safetensors_store::ParsedPolicyWeights,
    simd_math::{layer_norm_tokens, linear_batch_gelu, mat_vec_bias, select_masked_argmax},
};

pub const RIPPLE_MODEL_DIM: usize = 128;
pub const RIPPLE_BOOST_HIDDEN_DIM: usize = 32;
pub const RIPPLE_NUM_LAYERS: usize = 4;
pub const RIPPLE_NUM_HEADS: usize = 4;
pub const RIPPLE_HEAD_DIM: usize = RIPPLE_MODEL_DIM / RIPPLE_NUM_HEADS; // 32
pub const RIPPLE_FFN_DIM: usize = RIPPLE_MODEL_DIM * 4; // 512
pub const RIPPLE_NUM_KV_TOKENS: usize = 8; // 5 others + 1 ball + 1 action_queue + 1 max-pooled boost

fn run_four_layer_processor(
    x: &[f32],
    num_tokens: usize,
    in_dim: usize,
    hidden_dim: usize,
    out_dim: usize,
    weights: &ParsedPolicyWeights,
    prefix: &str,
    buf_a: &mut [f32],
    buf_b: &mut [f32],
    out_buf: &mut [f32],
    out_offset: usize,
) -> Option<()> {
    let w0 = weights.f32_slice(&format!("{prefix}.0.weight"))?;
    let b0 = weights.f32_slice(&format!("{prefix}.0.bias"))?;
    let w2 = weights.f32_slice(&format!("{prefix}.2.weight"))?;
    let b2 = weights.f32_slice(&format!("{prefix}.2.bias"))?;
    let w4 = weights.f32_slice(&format!("{prefix}.4.weight"))?;
    let b4 = weights.f32_slice(&format!("{prefix}.4.bias"))?;
    let w6 = weights.f32_slice(&format!("{prefix}.6.weight"))?;
    let b6 = weights.f32_slice(&format!("{prefix}.6.bias"))?;

    linear_batch_gelu(x, num_tokens, in_dim, hidden_dim, w0, Some(b0), buf_a, true);
    linear_batch_gelu(
        buf_a,
        num_tokens,
        hidden_dim,
        hidden_dim,
        w2,
        Some(b2),
        buf_b,
        true,
    );
    linear_batch_gelu(
        buf_b,
        num_tokens,
        hidden_dim,
        hidden_dim,
        w4,
        Some(b4),
        buf_a,
        true,
    );

    for n in 0..num_tokens {
        let in_base = n * hidden_dim;
        let out_base = out_offset + n * out_dim;
        mat_vec_bias(
            &buf_a[in_base..in_base + hidden_dim],
            hidden_dim,
            out_dim,
            w6,
            Some(b6),
            &mut out_buf[out_base..out_base + out_dim],
        );
    }

    Some(())
}

/// Zero-allocation scratch workspace and forward engine for Ripple v1.1 Perceiver Cross-Attention.
pub struct RipplePerceiverWorkspace {
    pub action_table: [[f32; RIPPLE_ACTION_DIM]; RIPPLE_NUM_ACTIONS],
    pub agent_states: [RippleAgentState; MAX_CARS],
    pub last_pred_tick: u32,

    proc_buf_a: [f32; MAX_PADS * RIPPLE_MODEL_DIM],
    proc_buf_b: [f32; MAX_PADS * RIPPLE_MODEL_DIM],
    boost_out: [f32; MAX_PADS * RIPPLE_MODEL_DIM],

    q_state: [f32; RIPPLE_MODEL_DIM],
    kv_tokens: [f32; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],
    kv_mask: [u8; RIPPLE_NUM_KV_TOKENS],

    q_norm: [f32; RIPPLE_MODEL_DIM],
    kv_norm: [f32; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],

    q_proj: [f32; RIPPLE_MODEL_DIM],
    k_proj: [f32; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],
    v_proj: [f32; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],
    scores: [f32; RIPPLE_NUM_KV_TOKENS],
    head_concat: [f32; RIPPLE_MODEL_DIM],
    attn_out: [f32; RIPPLE_MODEL_DIM],

    mlp_norm: [f32; RIPPLE_MODEL_DIM],
    mlp_hidden: [f32; RIPPLE_FFN_DIM],
    mlp_out: [f32; RIPPLE_MODEL_DIM],

    final_norm: [f32; RIPPLE_MODEL_DIM],
    raw_logits: [f32; RIPPLE_NUM_ACTIONS],
    logits: [f32; RIPPLE_NUM_ACTIONS],
}

impl Default for RipplePerceiverWorkspace {
    fn default() -> Self {
        Self::new()
    }
}

impl RipplePerceiverWorkspace {
    pub fn new() -> Self {
        Self {
            action_table: build_ripple_276_action_table(),
            agent_states: core::array::from_fn(|_| RippleAgentState::new()),
            last_pred_tick: u32::MAX,

            proc_buf_a: [0.0; MAX_PADS * RIPPLE_MODEL_DIM],
            proc_buf_b: [0.0; MAX_PADS * RIPPLE_MODEL_DIM],
            boost_out: [0.0; MAX_PADS * RIPPLE_MODEL_DIM],

            q_state: [0.0; RIPPLE_MODEL_DIM],
            kv_tokens: [0.0; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],
            kv_mask: [0; RIPPLE_NUM_KV_TOKENS],

            q_norm: [0.0; RIPPLE_MODEL_DIM],
            kv_norm: [0.0; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],

            q_proj: [0.0; RIPPLE_MODEL_DIM],
            k_proj: [0.0; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],
            v_proj: [0.0; RIPPLE_NUM_KV_TOKENS * RIPPLE_MODEL_DIM],
            scores: [0.0; RIPPLE_NUM_KV_TOKENS],
            head_concat: [0.0; RIPPLE_MODEL_DIM],
            attn_out: [0.0; RIPPLE_MODEL_DIM],

            mlp_norm: [0.0; RIPPLE_MODEL_DIM],
            mlp_hidden: [0.0; RIPPLE_FFN_DIM],
            mlp_out: [0.0; RIPPLE_MODEL_DIM],

            final_norm: [0.0; RIPPLE_MODEL_DIM],
            raw_logits: [0.0; RIPPLE_NUM_ACTIONS],
            logits: [0.0; RIPPLE_NUM_ACTIONS],
        }
    }

    pub fn reset_mask(&mut self, car_mask: u32, is_kickoff: bool) {
        let mask = if car_mask == 0 { 0xFF } else { car_mask };
        for idx in 0..MAX_CARS {
            if (mask & (1u32 << idx)) != 0 {
                self.agent_states[idx].reset(is_kickoff);
            }
        }
    }

    /// Executes the full Ripple v1.1 Perceiver Cross-Attention forward graph for `car_index`.
    pub fn forward_logits(
        &mut self,
        car_index: usize,
        weights: &ParsedPolicyWeights,
    ) -> Option<&[f32; RIPPLE_NUM_ACTIONS]> {
        let dim = RIPPLE_MODEL_DIM;
        let head_dim = RIPPLE_HEAD_DIM;
        let attn_scale = (head_dim as f32).sqrt();
        let ffn_dim = RIPPLE_FFN_DIM;
        let boost_dim = RIPPLE_BOOST_HIDDEN_DIM;

        let agent = &self.agent_states[car_index.min(MAX_CARS - 1)];

        // 1. Attention mask over the 8 KV tokens:
        // First 5 tokens are `others`; masked if `others[slot, 15] == 0`.
        // Last 3 tokens (ball, actions, boost) are never masked.
        for s in 0..RIPPLE_OTHER_SLOTS {
            self.kv_mask[s] = u8::from(agent.others[s * RIPPLE_OTHER_DIM + 15] == 0.0);
        }
        self.kv_mask[5] = 0;
        self.kv_mask[6] = 0;
        self.kv_mask[7] = 0;

        // 2. Encode main player [30] -> q_state [dim]
        run_four_layer_processor(
            &agent.main[..RIPPLE_MAIN_PROC_IN_DIM],
            1,
            RIPPLE_MAIN_PROC_IN_DIM,
            dim,
            dim,
            weights,
            "main_player_processor",
            &mut self.proc_buf_a,
            &mut self.proc_buf_b,
            &mut self.q_state,
            0,
        )?;

        // 3. Encode other players [5, 21] -> kv_tokens[0 .. 5*dim]
        run_four_layer_processor(
            &agent.others,
            RIPPLE_OTHER_SLOTS,
            RIPPLE_OTHER_DIM,
            dim,
            dim,
            weights,
            "other_players_processor",
            &mut self.proc_buf_a,
            &mut self.proc_buf_b,
            &mut self.kv_tokens,
            0,
        )?;

        // 4. Encode ball [1, 54] -> kv_tokens[5*dim .. 6*dim]
        run_four_layer_processor(
            &agent.ball,
            1,
            RIPPLE_BALL_TOTAL_DIM,
            dim,
            dim,
            weights,
            "ball_processor",
            &mut self.proc_buf_a,
            &mut self.proc_buf_b,
            &mut self.kv_tokens,
            5 * dim,
        )?;

        // 5. Encode action queue [1, 48] -> kv_tokens[6*dim .. 7*dim]
        run_four_layer_processor(
            &agent.history_tracker.actions,
            1,
            RIPPLE_ACTIONS_TOTAL_DIM,
            dim,
            dim,
            weights,
            "action_queue_processor",
            &mut self.proc_buf_a,
            &mut self.proc_buf_b,
            &mut self.kv_tokens,
            6 * dim,
        )?;

        // 6. Encode boost pads [34, 5] -> [34, dim] -> ReduceMax over 34 pads -> kv_tokens[7*dim .. 8*dim]
        run_four_layer_processor(
            &agent.history_tracker.boosts,
            MAX_PADS,
            RIPPLE_BOOST_PAD_DIM,
            boost_dim,
            dim,
            weights,
            "boost_processor",
            &mut self.proc_buf_a,
            &mut self.proc_buf_b,
            &mut self.boost_out,
            0,
        )?;
        let boost_token_offset = 7 * dim;
        for d in 0..dim {
            let mut max_val = self.boost_out[d];
            for p in 1..MAX_PADS {
                let v = self.boost_out[p * dim + d];
                if v > max_val {
                    max_val = v;
                }
            }
            self.kv_tokens[boost_token_offset + d] = max_val;
        }

        // 7. Run L Cross-Attention + MLP blocks
        for l in 0..RIPPLE_NUM_LAYERS {
            let nq_w = weights.f32_slice(&format!("layers.{l}.norm_q.weight"))?;
            let nq_b = weights.f32_slice(&format!("layers.{l}.norm_q.bias"))?;
            layer_norm_tokens(&self.q_state, 1, dim, nq_w, nq_b, &mut self.q_norm);

            let nkv_w = weights.f32_slice(&format!("layers.{l}.norm_kv.weight"))?;
            let nkv_b = weights.f32_slice(&format!("layers.{l}.norm_kv.bias"))?;
            layer_norm_tokens(
                &self.kv_tokens,
                RIPPLE_NUM_KV_TOKENS,
                dim,
                nkv_w,
                nkv_b,
                &mut self.kv_norm,
            );

            // Project Q [1, dim], K [8, dim], V [8, dim]
            let qp_w = weights.f32_slice(&format!("layers.{l}.attn.q_proj.weight"))?;
            let qp_b = weights.f32_slice(&format!("layers.{l}.attn.q_proj.bias"))?;
            linear_batch_gelu(
                &self.q_norm,
                1,
                dim,
                dim,
                qp_w,
                Some(qp_b),
                &mut self.q_proj,
                false,
            );

            let kp_w = weights.f32_slice(&format!("layers.{l}.attn.k_proj.weight"))?;
            let kp_b = weights.f32_slice(&format!("layers.{l}.attn.k_proj.bias"))?;
            linear_batch_gelu(
                &self.kv_norm,
                RIPPLE_NUM_KV_TOKENS,
                dim,
                dim,
                kp_w,
                Some(kp_b),
                &mut self.k_proj,
                false,
            );

            let vp_w = weights.f32_slice(&format!("layers.{l}.attn.v_proj.weight"))?;
            let vp_b = weights.f32_slice(&format!("layers.{l}.attn.v_proj.bias"))?;
            linear_batch_gelu(
                &self.kv_norm,
                RIPPLE_NUM_KV_TOKENS,
                dim,
                dim,
                vp_w,
                Some(vp_b),
                &mut self.v_proj,
                false,
            );

            // Multi-head attention across 4 heads
            for h in 0..RIPPLE_NUM_HEADS {
                let h_off = h * head_dim;
                let mut max_score = f32::NEG_INFINITY;

                for k in 0..RIPPLE_NUM_KV_TOKENS {
                    if self.kv_mask[k] != 0 {
                        self.scores[k] = f32::NEG_INFINITY;
                        continue;
                    }
                    let k_base = k * dim + h_off;
                    let mut dot = 0.0f32;
                    for d in 0..head_dim {
                        dot += (self.q_proj[h_off + d] / attn_scale) * self.k_proj[k_base + d];
                    }
                    self.scores[k] = dot;
                    if dot > max_score {
                        max_score = dot;
                    }
                }

                let mut exp_sum = 0.0f32;
                for k in 0..RIPPLE_NUM_KV_TOKENS {
                    if self.kv_mask[k] != 0 {
                        self.scores[k] = 0.0;
                    } else {
                        let e = (self.scores[k] - max_score).exp();
                        self.scores[k] = e;
                        exp_sum += e;
                    }
                }
                let inv_sum = if exp_sum > 0.0 { 1.0 / exp_sum } else { 0.0 };

                for d in 0..head_dim {
                    let mut acc = 0.0f32;
                    for k in 0..RIPPLE_NUM_KV_TOKENS {
                        let w = self.scores[k] * inv_sum;
                        if w == 0.0 {
                            continue;
                        }
                        acc += w * self.v_proj[k * dim + h_off + d];
                    }
                    self.head_concat[h_off + d] = acc;
                }
            }

            // Output projection + residual onto q_state
            let op_w = weights.f32_slice(&format!("layers.{l}.attn.out_proj.weight"))?;
            let op_b = weights.f32_slice(&format!("layers.{l}.attn.out_proj.bias"))?;
            linear_batch_gelu(
                &self.head_concat,
                1,
                dim,
                dim,
                op_w,
                Some(op_b),
                &mut self.attn_out,
                false,
            );
            for d in 0..dim {
                self.q_state[d] += self.attn_out[d];
            }

            // Pre-LN FFN + residual onto q_state
            let nqkv_w = weights.f32_slice(&format!("layers.{l}.norm_qkv.weight"))?;
            let nqkv_b = weights.f32_slice(&format!("layers.{l}.norm_qkv.bias"))?;
            layer_norm_tokens(&self.q_state, 1, dim, nqkv_w, nqkv_b, &mut self.mlp_norm);

            let m0_w = weights.f32_slice(&format!("layers.{l}.mlp.0.weight"))?;
            let m0_b = weights.f32_slice(&format!("layers.{l}.mlp.0.bias"))?;
            linear_batch_gelu(
                &self.mlp_norm,
                1,
                dim,
                ffn_dim,
                m0_w,
                Some(m0_b),
                &mut self.mlp_hidden,
                true,
            );

            let m2_w = weights.f32_slice(&format!("layers.{l}.mlp.2.weight"))?;
            let m2_b = weights.f32_slice(&format!("layers.{l}.mlp.2.bias"))?;
            linear_batch_gelu(
                &self.mlp_hidden,
                1,
                ffn_dim,
                dim,
                m2_w,
                Some(m2_b),
                &mut self.mlp_out,
                false,
            );
            for d in 0..dim {
                self.q_state[d] += self.mlp_out[d];
            }
        }

        // 8. Final LayerNorm + Linear head (no bias)
        let sn_w = weights.f32_slice("state_norm.weight")?;
        let sn_b = weights.f32_slice("state_norm.bias")?;
        layer_norm_tokens(&self.q_state, 1, dim, sn_w, sn_b, &mut self.final_norm);

        let head_w = weights.f32_slice("head.weight")?;
        linear_batch_gelu(
            &self.final_norm,
            1,
            dim,
            RIPPLE_NUM_ACTIONS,
            head_w,
            None,
            &mut self.raw_logits,
            false,
        );

        // 9. Apply X-mirror permutation when `obs.main[30] > 0.5`
        let is_flipped = self.agent_states[car_index.min(MAX_CARS - 1)].main[30] > 0.5;
        if is_flipped {
            if let Some(inv_map) = weights.i32_slice("invert_map") {
                for i in 0..RIPPLE_NUM_ACTIONS.min(inv_map.len()) {
                    let src_idx = (inv_map[i].max(0) as usize).min(RIPPLE_NUM_ACTIONS - 1);
                    self.logits[i] = self.raw_logits[src_idx];
                }
                return Some(&self.logits);
            } else if let Some(inv_map_f32) = weights.f32_slice("invert_map") {
                for i in 0..RIPPLE_NUM_ACTIONS.min(inv_map_f32.len()) {
                    let src_idx = (inv_map_f32[i].max(0.0) as usize).min(RIPPLE_NUM_ACTIONS - 1);
                    self.logits[i] = self.raw_logits[src_idx];
                }
                return Some(&self.logits);
            }
        }

        Some(&self.raw_logits)
    }

    /// High-level entry point for T2-13 `BotDirector`: ensures 5.0s ball prediction is fresh on `sim`,
    /// builds the 5 Ripple v1.1 observation modalities, runs Perceiver Cross-Attention inference,
    /// steps the 6-frame delayed action queue, and returns `(CarControlsPod, chosen_action_idx)`.
    pub fn decide_ripple_v1_1(
        &mut self,
        sim: &mut SimInstance,
        car_index: usize,
        team: u32,
        active_car_mask: u32,
        slot_teams: &[u32; MAX_CARS],
        weights: &ParsedPolicyWeights,
    ) -> Option<(CarControlsPod, i32)> {
        if car_index >= MAX_CARS {
            return None;
        }
        let current_tick = sim.state_buffer.header.tick_count.max(0.0) as u32;
        if self.last_pred_tick != current_tick || sim.pred_count < 600 {
            sim.update_ball_prediction(5.0);
            self.last_pred_tick = current_tick;
        }

        self.agent_states[car_index].build_obs(
            &sim.state_buffer,
            &sim.pred_buffer,
            sim.pred_count,
            car_index,
            team,
            active_car_mask,
            slot_teams,
        );

        let logits = self.forward_logits(car_index, weights)?;
        let act_idx = select_masked_argmax(logits, None);
        let ctrl = self.agent_states[car_index]
            .history_tracker
            .step_delayed_action_queue(act_idx, &self.action_table);
        Some((ctrl, act_idx as i32))
    }
}
