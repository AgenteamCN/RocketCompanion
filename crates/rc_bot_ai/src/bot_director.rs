//! Stateful multi-car `BotDirector` orchestrating SafeTensors weight storage, tick-skip cadence,
//! scripted kickoff handoff, full policy dispatch loop, and direct writeback into `SimInstance.controls_buffer`.

use rc_physics_sim::{
    layout::{CarControlsPod, GameStateBufferPod, MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

use crate::{
    heuristic_and_kickoff::{
        is_ball_at_kickoff_center, is_primary_kickoff_car, multi_car_heuristic_decide,
        nexto_scripted_kickoff_controls,
    },
    layout_and_specs::{
        BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId,
        KickoffTimelineBufferPod, KickoffTimelineStepPod, KICKOFF_MAX_PRECOMPUTE_STEPS,
    },
    safetensors_store::BotWeightRegistry,
    simd_math::mat_vec_bias,
};

#[inline]
fn controls_to_flat8(c: CarControlsPod) -> [f32; 8] {
    [c.throttle, c.steer, c.pitch, c.yaw, c.roll, c.jump, c.boost, c.handbrake]
}

pub struct BotDirector {
    pub weights: BotWeightRegistry,
    pub output: BotBatchInferenceOutputPod,
    pub kickoff_timeline: KickoffTimelineBufferPod,
    pub slot_teams: [u32; MAX_CARS],
    pub demo_timers: [f32; MAX_CARS],
    pub boost_pad_timers: [f32; MAX_PADS],
    pub ripple_action_history: [[[f32; 8]; 6]; MAX_CARS],
    pub last_ball_at_center: bool,
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
            boost_pad_timers: [0.0; MAX_PADS],
            ripple_action_history: [[[0.0; 8]; 6]; MAX_CARS],
            last_ball_at_center: true,
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
        let resolved_team = if team > 0 { 1u32 } else { 0u32 };
        let resolved_skip = if tick_skip > 0 { (tick_skip as u32).clamp(1, 30) } else { pid.default_tick_skip() };
        self.slot_teams[car_index] = resolved_team;
        let diag = &mut self.output.slot_diagnostics[car_index];
        let changed = diag.policy_id != pid as u32 || diag.team != resolved_team || diag.tick_skip != resolved_skip;
        diag.policy_id = pid as u32;
        diag.team = resolved_team;
        diag.tick_skip = resolved_skip;
        diag.model_ready_flag = u32::from(self.weights.is_policy_ready(pid));
        if changed {
            diag.tick_skip_remaining = (car_index as u32) % resolved_skip.max(1);
            diag.kickoff_step = 0;
            diag.last_action_index = -1;
            diag.used_scripted_kickoff = 0;
        }
        0
    }

    pub fn reset_bot_director(&mut self, car_mask: u32) {
        let mask = if car_mask == 0 { 0xFF } else { car_mask };
        if mask == 0xFF {
            self.boost_pad_timers = [0.0; MAX_PADS];
            self.last_ball_at_center = true;
        }
        for idx in 0..MAX_CARS {
            if (mask & (1u32 << idx)) == 0 {
                continue;
            }
            self.output.controls[idx] = CarControlsPod::default();
            self.output.prev_actions_flat[idx] = [0.0; 8];
            self.demo_timers[idx] = 0.0;
            self.ripple_action_history[idx] = [[0.0; 8]; 6];
            let diag = &mut self.output.slot_diagnostics[idx];
            diag.tick_skip_remaining = (idx as u32) % diag.tick_skip.max(1);
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
        self.output.prev_actions_flat[car_index] = controls_to_flat8(ctrl);
        0
    }

    fn update_environment_timers(&mut self, state: &GameStateBufferPod) {
        let num_pads = (state.header.num_pads.max(0.0) as usize).min(MAX_PADS);
        for pad_idx in 0..num_pads {
            let pad = &state.pads[pad_idx];
            self.boost_pad_timers[pad_idx] = if pad.is_active > 0.5 { 0.0 } else { pad.cooldown.max(0.0) };
        }
        for car_idx in 0..MAX_CARS {
            if state.cars[car_idx].is_demoed > 0.5 {
                self.demo_timers[car_idx] = if self.demo_timers[car_idx] <= 0.0 {
                    3.0
                } else {
                    (self.demo_timers[car_idx] - (1.0 / 120.0)).max(0.0)
                };
            } else {
                self.demo_timers[car_idx] = 0.0;
            }
        }
    }

    fn dispatch_policy_inference(
        &mut self,
        state: &GameStateBufferPod,
        car_idx: usize,
        pid: BotPolicyId,
        team: u32,
        active_car_mask: u32,
    ) -> (CarControlsPod, i32) {
        if pid == BotPolicyId::RippleV1_1 {
            self.ripple_action_history[car_idx].copy_within(1..6, 0);
            self.ripple_action_history[car_idx][5] = self.output.prev_actions_flat[car_idx];
        }
        let has_weights = self.weights.is_policy_ready(pid);
        let ctrl = match pid {
            BotPolicyId::Heuristic => {
                multi_car_heuristic_decide(state, car_idx, team, active_car_mask, &self.slot_teams)
            }
            BotPolicyId::KickoffV1Ppo | BotPolicyId::KickoffV2SafeTensors => {
                let _store = self.weights.get(pid);
                let step = self.output.slot_diagnostics[car_idx].kickoff_step;
                nexto_scripted_kickoff_controls(state, car_idx, team, step).unwrap_or_else(|| {
                    multi_car_heuristic_decide(state, car_idx, team, active_car_mask, &self.slot_teams)
                })
            }
            BotPolicyId::Nexto | BotPolicyId::Necto | BotPolicyId::Chronos | BotPolicyId::Dice
            | BotPolicyId::Kira | BotPolicyId::Rain | BotPolicyId::Ducky | BotPolicyId::Fury
            | BotPolicyId::Galactus | BotPolicyId::RippleV1_1 => {
                let _store = self.weights.get(pid);
                multi_car_heuristic_decide(state, car_idx, team, active_car_mask, &self.slot_teams)
            }
        };
        let action_idx = if has_weights && pid != BotPolicyId::Heuristic { 0 } else { -1 };
        (ctrl, action_idx)
    }

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

        self.update_environment_timers(&sim.state_buffer);

        let ball_at_center = is_ball_at_kickoff_center(&sim.state_buffer);
        let newly_returned_to_center = ball_at_center && !self.last_ball_at_center;
        self.last_ball_at_center = ball_at_center;

        let num_state_cars = (sim.state_buffer.header.num_cars.max(0.0) as usize).min(MAX_CARS);
        let mut all_active_cars_mask = mask;
        for idx in 0..MAX_CARS {
            if sim.car_slots[idx].is_some() || idx < num_state_cars {
                all_active_cars_mask |= 1u32 << idx;
            }
        }
        let kickoff_active = is_kickoff > 0 || (is_kickoff == 0 && ball_at_center);

        for car_idx in 0..MAX_CARS {
            let bit = 1u32 << car_idx;
            if (mask & bit) == 0 || (sim.car_slots[car_idx].is_none() && car_idx >= num_state_cars) {
                continue;
            }

            if is_kickoff < 0 || sim.state_buffer.cars[car_idx].is_demoed > 0.5 {
                if is_kickoff < 0 {
                    let diag = &mut self.output.slot_diagnostics[car_idx];
                    diag.kickoff_step = 0;
                    diag.used_scripted_kickoff = 0;
                    diag.tick_skip_remaining = 0;
                }
                let zero_ctrl = CarControlsPod::default();
                self.output.controls[car_idx] = zero_ctrl;
                sim.controls_buffer[car_idx] = zero_ctrl;
                continue;
            }

            let pid = BotPolicyId::from_i32(self.output.slot_diagnostics[car_idx].policy_id as i32);
            let team = self.slot_teams[car_idx];
            self.output.slot_diagnostics[car_idx].model_ready_flag =
                u32::from(self.weights.is_policy_ready(pid));

            if !kickoff_active || newly_returned_to_center {
                let diag = &mut self.output.slot_diagnostics[car_idx];
                diag.kickoff_step = 0;
                diag.used_scripted_kickoff = 0;
            }

            // Evaluate 120Hz scripted speed-flip kickoff BEFORE tick-skip so 1-tick jump release is preserved.
            if kickoff_active
                && pid.supports_scripted_kickoff()
                && is_primary_kickoff_car(
                    &sim.state_buffer,
                    car_idx,
                    team,
                    all_active_cars_mask,
                    &self.slot_teams,
                )
            {
                let step = self.output.slot_diagnostics[car_idx].kickoff_step;
                if let Some(scripted) =
                    nexto_scripted_kickoff_controls(&sim.state_buffer, car_idx, team, step)
                {
                    let diag = &mut self.output.slot_diagnostics[car_idx];
                    diag.kickoff_step = step + 1;
                    diag.used_scripted_kickoff = 1;
                    diag.tick_skip_remaining = 0;
                    self.output.controls[car_idx] = scripted;
                    self.output.prev_actions_flat[car_idx] = controls_to_flat8(scripted);
                    self.output.inferred_this_step_mask |= bit;
                    sim.controls_buffer[car_idx] = scripted;
                    continue;
                }
                self.output.slot_diagnostics[car_idx].used_scripted_kickoff = 0;
            }

            if self.output.slot_diagnostics[car_idx].tick_skip_remaining > 0 {
                self.output.slot_diagnostics[car_idx].tick_skip_remaining -= 1;
                sim.controls_buffer[car_idx] = self.output.controls[car_idx];
                continue;
            }

            let (ctrl, action_idx) = self.dispatch_policy_inference(
                &sim.state_buffer,
                car_idx,
                pid,
                team,
                all_active_cars_mask,
            );

            let diag = &mut self.output.slot_diagnostics[car_idx];
            diag.tick_skip_remaining = diag.tick_skip.max(1) - 1;
            diag.last_action_index = action_idx;
            self.output.controls[car_idx] = ctrl;
            self.output.prev_actions_flat[car_idx] = controls_to_flat8(ctrl);
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
