//! Stateful multi-car `BotDirector` orchestrating SafeTensors weight storage, tick-skip cadence,
//! scripted kickoff handoff, and direct writeback into `SimInstance.controls_buffer`.

use rc_physics_sim::{
    layout::{CarControlsPod, MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

use crate::{
    action_tables::{decode_necto_logits, decode_nexto_logits},
    earl_perceiver::{build_earl_entities, EarlPerceiverScratch},
    heuristic_and_kickoff::{multi_car_heuristic_decide, nexto_scripted_kickoff_controls},
    layout_and_specs::{
        BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId,
        KickoffTimelineBufferPod, KickoffTimelineStepPod, KICKOFF_MAX_PRECOMPUTE_STEPS,
    },
    safetensors_store::BotWeightRegistry,
    simd_math::mat_vec_bias,
};

pub struct BotDirector {
    pub weights: BotWeightRegistry,
    pub output: BotBatchInferenceOutputPod,
    pub kickoff_timeline: KickoffTimelineBufferPod,
    pub slot_teams: [u32; MAX_CARS],
    pub demo_timers: [f64; MAX_CARS],
    pub boost_timers: [[f64; MAX_PADS]; MAX_CARS],
    pub earl_scratch: EarlPerceiverScratch,
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
            let default_team = if idx % 2 == 0 { 0u32 } else { 1u32 };
            slot_teams[idx] = default_team;
            *diag = BotCarSlotDiagnosticsPod {
                policy_id: BotPolicyId::Heuristic as u32,
                team: default_team,
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
            boost_timers: [[0.0; MAX_PADS]; MAX_CARS],
            earl_scratch: EarlPerceiverScratch::new(),
        }
    }

    pub fn load_bot_weights(
        &mut self,
        policy_id: i32,
        bytes_ptr: *const u8,
        byte_len: usize,
    ) -> i32 {
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
        let pid = BotPolicyId::from_i32(policy_id);
        if self.weights.is_policy_ready(pid) {
            1
        } else {
            0
        }
    }

    pub fn configure_bot_slot(
        &mut self,
        car_index: usize,
        policy_id: i32,
        team: i32,
        tick_skip: i32,
    ) -> i32 {
        if car_index >= MAX_CARS {
            return -1;
        }
        let pid = BotPolicyId::from_i32(policy_id);
        let resolved_team = if team > 0 { 1u32 } else { 0u32 };
        let resolved_skip = if tick_skip > 0 {
            (tick_skip as u32).clamp(1, 30)
        } else {
            pid.default_tick_skip()
        };
        self.slot_teams[car_index] = resolved_team;
        let diag = &mut self.output.slot_diagnostics[car_index];
        diag.policy_id = pid as u32;
        diag.team = resolved_team;
        diag.tick_skip = resolved_skip;
        diag.tick_skip_remaining = 0;
        diag.kickoff_step = 0;
        diag.last_action_index = -1;
        diag.used_scripted_kickoff = 0;
        diag.model_ready_flag = if self.weights.is_policy_ready(pid) { 1 } else { 0 };
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
            self.boost_timers[idx] = [0.0; MAX_PADS];
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
        let slice = unsafe { core::slice::from_raw_parts(controls_ptr, 8) };
        let ctrl = CarControlsPod {
            throttle: slice[0],
            steer: slice[1],
            pitch: slice[2],
            yaw: slice[3],
            roll: slice[4],
            jump: slice[5],
            boost: slice[6],
            handbrake: slice[7],
        };
        self.output.controls[car_index] = ctrl;
        self.output.prev_actions_flat[car_index] = [
            ctrl.throttle,
            ctrl.steer,
            ctrl.pitch,
            ctrl.yaw,
            ctrl.roll,
            ctrl.jump,
            ctrl.boost,
            ctrl.handbrake,
        ];
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
        let current_tick = sim.state_buffer.header.tick_count.max(0.0) as u32;
        self.output.active_bot_mask = mask;
        self.output.inferred_this_step_mask = 0;
        self.output.loaded_policy_mask = self.weights.loaded_mask;
        self.output.last_step_tick = current_tick;

        let active_car_mask = sim.active_car_mask() as u32;
        let kickoff_active = is_kickoff != 0;

        for car_idx in 0..MAX_CARS {
            let bit = 1u32 << car_idx;
            if (mask & bit) == 0 {
                continue;
            }
            if active_car_mask != 0 && sim.car_slots[car_idx].is_none() {
                continue;
            }

            if sim.state_buffer.cars[car_idx].is_demoed > 0.5 {
                self.demo_timers[car_idx] = (self.demo_timers[car_idx] - (1.0 / 120.0)).max(0.0);
                let zero_ctrl = CarControlsPod::default();
                self.output.controls[car_idx] = zero_ctrl;
                sim.controls_buffer[car_idx] = zero_ctrl;
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
                sim.controls_buffer[car_idx] = self.output.controls[car_idx];
                continue;
            }

            let mut chosen_ctrl = None;
            let mut chosen_act_idx: i32 = -1;
            if kickoff_active && pid.supports_scripted_kickoff() {
                let k_step = self.output.slot_diagnostics[car_idx].kickoff_step;
                if let Some(scripted) = nexto_scripted_kickoff_controls(
                    &sim.state_buffer,
                    car_idx,
                    team,
                    k_step,
                ) {
                    self.output.slot_diagnostics[car_idx].kickoff_step = k_step + 1;
                    self.output.slot_diagnostics[car_idx].used_scripted_kickoff = 1;
                    chosen_ctrl = Some(scripted);
                } else {
                    self.output.slot_diagnostics[car_idx].used_scripted_kickoff = 0;
                }
            }

            if chosen_ctrl.is_none() {
                let prev_act = self.output.prev_actions_flat[car_idx];
                let num_cars_in_state =
                    (sim.state_buffer.header.num_cars.round().max(0.0) as usize).min(MAX_CARS);
                let state_car_mask = if num_cars_in_state > 0 {
                    ((1u32 << num_cars_in_state) - 1) | mask
                } else {
                    mask
                };
                let roster_mask = if active_car_mask != 0 {
                    active_car_mask
                } else {
                    state_car_mask
                };
                match pid {
                    BotPolicyId::Nexto => {
                        if let Some(weights) = self.weights.get(BotPolicyId::Nexto) {
                            build_earl_entities(
                                &sim.state_buffer,
                                &sim.pad_info_buffer,
                                &prev_act,
                                car_idx,
                                team,
                                roster_mask,
                                &self.slot_teams,
                                None,
                                &mut self.earl_scratch,
                            );
                            if let Some(logits) = self.earl_scratch.forward_nexto(weights, None) {
                                let (act_idx, ctrl) = decode_nexto_logits(logits);
                                chosen_act_idx = act_idx as i32;
                                chosen_ctrl = Some(ctrl);
                            }
                        }
                    }
                    BotPolicyId::Necto => {
                        if let Some(weights) = self.weights.get(BotPolicyId::Necto) {
                            build_earl_entities(
                                &sim.state_buffer,
                                &sim.pad_info_buffer,
                                &prev_act,
                                car_idx,
                                team,
                                roster_mask,
                                &self.slot_teams,
                                Some((&mut self.demo_timers, &mut self.boost_timers[car_idx])),
                                &mut self.earl_scratch,
                            );
                            if let Some(logits12) = self.earl_scratch.forward_necto(weights, None) {
                                let (act_idx, ctrl) = decode_necto_logits(logits12);
                                chosen_act_idx = act_idx as i32;
                                chosen_ctrl = Some(ctrl);
                            }
                        }
                    }
                    _ => {}
                }
            }

            // Tier-1 foundation fallback: until Tier-2 sub-branches populate individual Perceiver/MLP forward passes,
            // fall back cleanly to the multi-car role-aware tactical heuristic so gameplay never stalls.
            let ctrl = chosen_ctrl.unwrap_or_else(|| {
                multi_car_heuristic_decide(
                    &sim.state_buffer,
                    car_idx,
                    team,
                    mask,
                    &self.slot_teams,
                )
            });

            let diag = &mut self.output.slot_diagnostics[car_idx];
            let skip = diag.tick_skip.max(1);
            diag.tick_skip_remaining = skip - 1;
            diag.last_action_index = chosen_act_idx;
            self.output.controls[car_idx] = ctrl;
            self.output.prev_actions_flat[car_idx] = [
                ctrl.throttle,
                ctrl.steer,
                ctrl.pitch,
                ctrl.yaw,
                ctrl.roll,
                ctrl.jump,
                ctrl.boost,
                ctrl.handbrake,
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
        _policy_id: i32,
        spawn_index: i32,
        max_steps: i32,
    ) -> *const KickoffTimelineBufferPod {
        let clamped_steps = (max_steps.max(0) as usize).min(KICKOFF_MAX_PRECOMPUTE_STEPS);
        self.kickoff_timeline.spawn_index = spawn_index.max(0) as u32;
        self.kickoff_timeline.step_count = clamped_steps as u32;
        self.kickoff_timeline.touch_tick = (clamped_steps as u32) * 4;
        self.kickoff_timeline.touch_step = clamped_steps as u32;

        for idx in 0..clamped_steps {
            let start_tick = (idx as u32) * 4;
            let ctrl = nexto_scripted_kickoff_controls(&sim.state_buffer, 0, 0, idx as u32)
                .unwrap_or_else(|| {
                    multi_car_heuristic_decide(&sim.state_buffer, 0, 0, 1, &self.slot_teams)
                });
            self.kickoff_timeline.steps[idx] = KickoffTimelineStepPod {
                step_index: idx as u32,
                start_tick,
                end_tick: start_tick + 4,
                multi_discrete_act: [2, 1, 1, 1, 1, 1],
                _pad: [0; 2],
                controls: ctrl,
            };
        }

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
        if w_ptr.is_null()
            || x_ptr.is_null()
            || b_ptr.is_null()
            || out_ptr.is_null()
            || in_dim == 0
            || out_dim == 0
        {
            return;
        }
        let w = unsafe { core::slice::from_raw_parts(w_ptr, in_dim * out_dim) };
        let x = unsafe { core::slice::from_raw_parts(x_ptr, in_dim) };
        let b = unsafe { core::slice::from_raw_parts(b_ptr, out_dim) };
        let out = unsafe { core::slice::from_raw_parts_mut(out_ptr, out_dim) };
        mat_vec_bias(x, in_dim, out_dim, w, Some(b), out);
    }
}

