//! Stateful multi-car `BotDirector` orchestrating SafeTensors weight storage, tick-skip cadence,
//! scripted kickoff handoff, and direct writeback into `SimInstance.controls_buffer`.

use rc_physics_sim::{
    layout::{CarControlsPod, MAX_CARS},
    sim_instance::SimInstance,
};

use crate::{
    heuristic_and_kickoff::{multi_car_heuristic_decide, nexto_scripted_kickoff_controls},
    kickoff_ppo::{
        botpack_actions::{NUM_FURY_ACTIONS, build_fury_380_actions},
        build_active_roster_from_slots,
        kickoff_v1_v2_obs::KickoffSlotState,
        precompute_kickoff_timeline as run_kickoff_timeline_precompute, step_botpack_mlp_slot,
        step_kickoff_v1_slot, step_kickoff_v2_slot,
    },
    layout_and_specs::{
        BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId,
        KickoffTimelineBufferPod,
    },
    safetensors_store::BotWeightRegistry,
    simd_math::mat_vec_bias,
};

pub struct BotDirector {
    pub weights: BotWeightRegistry,
    pub output: BotBatchInferenceOutputPod,
    pub kickoff_timeline: KickoffTimelineBufferPod,
    pub slot_teams: [u32; MAX_CARS],
    pub demo_timers: [f32; MAX_CARS],
    pub kickoff_slots: [KickoffSlotState; MAX_CARS],
    pub fury_actions: [CarControlsPod; NUM_FURY_ACTIONS],
}

impl Default for BotDirector {
    fn default() -> Self {
        Self::new()
    }
}

impl BotDirector {
    pub fn new() -> Self {
        let mut output = BotBatchInferenceOutputPod::default();
        let mut slot_teams = [0u32; MAX_CARS];
        for (idx, diag) in output.slot_diagnostics.iter_mut().enumerate() {
            let team = (idx % 2) as u32;
            slot_teams[idx] = team;
            *diag = BotCarSlotDiagnosticsPod {
                policy_id: BotPolicyId::Heuristic as u32,
                team,
                tick_skip: BotPolicyId::Heuristic.default_tick_skip(),
                tick_skip_remaining: 0,
                kickoff_step: 0,
                last_action_index: -1,
                used_scripted_kickoff: 0,
                model_ready_flag: 1,
            };
        }
        Self {
            weights: BotWeightRegistry::new(),
            output,
            kickoff_timeline: KickoffTimelineBufferPod::default(),
            slot_teams,
            demo_timers: [0.0; MAX_CARS],
            kickoff_slots: [KickoffSlotState::default(); MAX_CARS],
            fury_actions: build_fury_380_actions(),
        }
    }

    pub fn load_bot_weights(&mut self, policy_id: i32, bytes_ptr: *const u8, byte_len: usize) -> i32 {
        if bytes_ptr.is_null() || byte_len < 16 {
            return -1;
        }
        let bytes = unsafe { core::slice::from_raw_parts(bytes_ptr, byte_len) };
        let pid = BotPolicyId::from_i32(policy_id);
        let tensor_count = self.weights.load_safetensors_bytes(pid, bytes);
        if tensor_count > 0 {
            self.output.loaded_policy_mask = self.weights.loaded_mask;
            for diag in &mut self.output.slot_diagnostics {
                if diag.policy_id == pid as u32 {
                    diag.model_ready_flag = 1;
                }
            }
        }
        tensor_count
    }

    #[inline]
    pub fn is_bot_policy_loaded(&self, policy_id: i32) -> i32 {
        i32::from(self.weights.is_policy_ready(BotPolicyId::from_i32(policy_id)))
    }

    pub fn configure_bot_slot(&mut self, car_index: usize, policy_id: i32, team: i32, tick_skip: i32) -> i32 {
        if car_index >= MAX_CARS {
            return -1;
        }
        let pid = BotPolicyId::from_i32(policy_id);
        let resolved_team = u32::from(team > 0);
        let resolved_skip = if tick_skip > 0 { (tick_skip as u32).clamp(1, 30) } else { pid.default_tick_skip() };
        self.slot_teams[car_index] = resolved_team;
        self.kickoff_slots[car_index].reset();
        self.output.slot_diagnostics[car_index] = BotCarSlotDiagnosticsPod {
            policy_id: pid as u32,
            team: resolved_team,
            tick_skip: resolved_skip,
            tick_skip_remaining: 0,
            kickoff_step: 0,
            last_action_index: -1,
            used_scripted_kickoff: 0,
            model_ready_flag: u32::from(self.weights.is_policy_ready(pid)),
        };
        0
    }

    pub fn reset_bot_director(&mut self, car_mask: u32) {
        let mask = if car_mask == 0 { 0xFF } else { car_mask };
        for idx in 0..MAX_CARS {
            if (mask & (1u32 << idx)) == 0 {
                continue;
            }
            self.output.controls[idx] = CarControlsPod::default();
            self.output.prev_actions_flat[idx] = [0.0; 8];
            self.demo_timers[idx] = 0.0;
            self.kickoff_slots[idx].reset();
            let diag = &mut self.output.slot_diagnostics[idx];
            diag.tick_skip_remaining = 0;
            diag.kickoff_step = 0;
            diag.last_action_index = -1;
            diag.used_scripted_kickoff = 0;
        }
    }

    pub fn override_bot_controls(&mut self, car_index: usize, controls_ptr: *const f32) -> i32 {
        if car_index >= MAX_CARS || controls_ptr.is_null() {
            return -1;
        }
        let s = unsafe { core::slice::from_raw_parts(controls_ptr, 8) };
        let ctrl = CarControlsPod {
            throttle: s[0], steer: s[1], pitch: s[2], yaw: s[3],
            roll: s[4], jump: s[5], boost: s[6], handbrake: s[7],
        };
        self.output.controls[car_index] = ctrl;
        self.output.prev_actions_flat[car_index].copy_from_slice(s);
        0
    }

    /// Multi-car observation + inference stepping entry point (`_physics_stepBotInferenceMask`).
    /// Directly writes computed `CarControlsPod` into `sim.controls_buffer` for all masked cars.
    pub fn step_bot_inference_mask(
        &mut self,
        sim: &mut SimInstance,
        active_bot_mask: u32,
        is_kickoff: i32,
    ) -> *const BotBatchInferenceOutputPod {
        let mask = active_bot_mask & 0xFF;
        self.output.active_bot_mask = mask;
        self.output.inferred_this_step_mask = 0;
        self.output.loaded_policy_mask = self.weights.loaded_mask;
        self.output.last_step_tick = sim.state_buffer.header.tick_count.max(0.0) as u32;

        let kickoff_active = is_kickoff != 0;
        let roster = build_active_roster_from_slots(sim, &self.slot_teams);

        for car_idx in 0..MAX_CARS {
            let bit = 1u32 << car_idx;
            if (mask & bit) == 0 || sim.car_slots[car_idx].is_none() {
                continue;
            }
            if sim.state_buffer.cars[car_idx].is_demoed > 0.5 {
                self.demo_timers[car_idx] = (self.demo_timers[car_idx] - (1.0 / 120.0)).max(0.0);
                self.output.controls[car_idx] = CarControlsPod::default();
                sim.controls_buffer[car_idx] = CarControlsPod::default();
                continue;
            }

            let pid = BotPolicyId::from_i32(self.output.slot_diagnostics[car_idx].policy_id as i32);
            let team = self.slot_teams[car_idx];
            if !kickoff_active {
                self.output.slot_diagnostics[car_idx].kickoff_step = 0;
                self.output.slot_diagnostics[car_idx].used_scripted_kickoff = 0;
            }

            if self.output.slot_diagnostics[car_idx].tick_skip_remaining > 0 {
                self.output.slot_diagnostics[car_idx].tick_skip_remaining -= 1;
                if matches!(pid, BotPolicyId::KickoffV1Ppo | BotPolicyId::KickoffV2SafeTensors)
                    && let Some(model) = self.weights.get(pid)
                {
                    let (ctrl, _) = if pid == BotPolicyId::KickoffV1Ppo {
                        step_kickoff_v1_slot(sim, car_idx, team, false, model, &mut self.kickoff_slots[car_idx])
                    } else {
                        step_kickoff_v2_slot(sim, car_idx, team, false, model, &mut self.kickoff_slots[car_idx])
                    };
                    self.output.controls[car_idx] = ctrl;
                }
                sim.controls_buffer[car_idx] = self.output.controls[car_idx];
                continue;
            }

            let mut chosen_ctrl = None;
            let mut action_idx = -1i32;

            if kickoff_active && pid.supports_scripted_kickoff() {
                let k_step = self.output.slot_diagnostics[car_idx].kickoff_step;
                if let Some(scripted) =
                    nexto_scripted_kickoff_controls(&sim.state_buffer, car_idx, team, k_step)
                {
                    self.output.slot_diagnostics[car_idx].kickoff_step += 1;
                    self.output.slot_diagnostics[car_idx].used_scripted_kickoff = 1;
                    chosen_ctrl = Some(scripted);
                } else {
                    self.output.slot_diagnostics[car_idx].used_scripted_kickoff = 0;
                }
            }

            if chosen_ctrl.is_none()
                && let Some(model) = self.weights.get(pid)
            {
                let prev_ctrl = self.output.controls[car_idx];
                let res = match pid {
                    BotPolicyId::KickoffV1Ppo => Some(step_kickoff_v1_slot(
                        sim, car_idx, team, true, model, &mut self.kickoff_slots[car_idx],
                    )),
                    BotPolicyId::KickoffV2SafeTensors => Some(step_kickoff_v2_slot(
                        sim, car_idx, team, true, model, &mut self.kickoff_slots[car_idx],
                    )),
                    _ => step_botpack_mlp_slot(
                        sim, pid, model, &prev_ctrl, car_idx, team as i32, &roster, &self.fury_actions,
                    ),
                };
                if let Some((c, act)) = res {
                    chosen_ctrl = Some(c);
                    action_idx = act;
                }
            }

            let ctrl = chosen_ctrl.unwrap_or_else(|| {
                multi_car_heuristic_decide(&sim.state_buffer, car_idx, team, mask, &self.slot_teams)
            });

            let diag = &mut self.output.slot_diagnostics[car_idx];
            diag.tick_skip_remaining = diag.tick_skip.max(1) - 1;
            diag.last_action_index = action_idx;
            self.output.controls[car_idx] = ctrl;
            self.output.prev_actions_flat[car_idx] = [
                ctrl.throttle, ctrl.steer, ctrl.pitch, ctrl.yaw, ctrl.roll, ctrl.jump, ctrl.boost, ctrl.handbrake,
            ];
            self.output.inferred_this_step_mask |= bit;
            sim.controls_buffer[car_idx] = ctrl;
        }

        &self.output as *const BotBatchInferenceOutputPod
    }

    #[inline]
    pub fn get_batch_output_ptr(&self) -> *const BotBatchInferenceOutputPod {
        &self.output as *const BotBatchInferenceOutputPod
    }

    pub fn precompute_kickoff_timeline(
        &mut self,
        sim: &mut SimInstance,
        policy_id: i32,
        spawn_index: i32,
        max_steps: i32,
    ) -> *const KickoffTimelineBufferPod {
        let pid = BotPolicyId::from_i32(policy_id);
        let model_opt = self.weights.get(pid);
        run_kickoff_timeline_precompute(
            sim, pid, model_opt, spawn_index, max_steps, &mut self.kickoff_timeline,
        );
        &self.kickoff_timeline as *const KickoffTimelineBufferPod
    }

    #[inline]
    pub fn get_kickoff_timeline_ptr(&self) -> *const KickoffTimelineBufferPod {
        &self.kickoff_timeline as *const KickoffTimelineBufferPod
    }

    /// Direct WASM SIMD128 matrix-vector multiply + bias replacement for legacy `simdMatVec.wasm`.
    pub fn simd_mat_vec_bias_raw(
        w_ptr: *const f32,
        x_ptr: *const f32,
        b_ptr: *const f32,
        out_ptr: *mut f32,
        in_dim: usize,
        out_dim: usize,
    ) {
        if w_ptr.is_null() || x_ptr.is_null() || b_ptr.is_null() || out_ptr.is_null() || in_dim == 0 || out_dim == 0 {
            return;
        }
        let w = unsafe { core::slice::from_raw_parts(w_ptr, in_dim * out_dim) };
        let x = unsafe { core::slice::from_raw_parts(x_ptr, in_dim) };
        let b = unsafe { core::slice::from_raw_parts(b_ptr, out_dim) };
        let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_dim) };
        mat_vec_bias(x, in_dim, out_dim, w, Some(b), out);
    }
}

