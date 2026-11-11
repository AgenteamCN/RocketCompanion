//! `AudioDirectorInstance`: Deterministic WASM acoustic state machine owning `AudioFrameCuePod`,
//! `AudioDirectorConfigPod`, `AudioListenerStatePod`, 8 vehicle drivetrains, and incident cooldowns.

#[path = "director_impact_events.rs"]
mod director_impact_events;
#[path = "director_spatial_loops.rs"]
mod director_spatial_loops;
#[path = "director_vehicle_events.rs"]
mod director_vehicle_events;

use rc_physics_sim::{
    layout::{MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

use crate::{
    config_pod::{AttenuationProfilePod, AudioDirectorConfigPod},
    drivetrain_state::{step_all_vehicles_baseline, VehicleDrivetrainState},
    pod_types::{
        edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod, AudioOneShotSlotPod,
        MAX_AUDIO_ONE_SHOT_SLOTS,
    },
};

use self::director_spatial_loops::solve_cubic_bezier;

/// Central WASM audio director state machine.
pub struct AudioDirectorInstance {
    pub cue_pod: AudioFrameCuePod,
    pub config_pod: AudioDirectorConfigPod,
    pub listener_pod: AudioListenerStatePod,
    pub drivetrains: [VehicleDrivetrainState; MAX_CARS],
    pub last_event_read_seq: u32,
    pub last_ball_world_hit_tick: u32,
    pub last_goalpost_hit_tick: u32,
    pub last_car_ball_hit_tick: u32,
    pub last_car_bump_global_tick: u32,
    pub last_goal_scored_tick: u32,
    pub last_pad_pickup_tick: [u32; MAX_PADS],
    pub last_car_demo_tick: [u32; MAX_CARS],
    pub smoothed_ball_rolling_gain: f32,
    pub smoothed_ball_flying_gain: f32,
    pub smoothed_ball_rolling_rate: f32,
    pub smoothed_ball_flying_rate: f32,
    pub rng_state: u32,
    pub last_sim_tick: u32,
    pub stadium_linear_phase: f32,
    pub last_variant_idx: [u8; 32],
    pub listener_initialized: bool,
}

impl Default for AudioDirectorInstance {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioDirectorInstance {
    pub fn new() -> Self {
        let cfg = AudioDirectorConfigPod::default();
        let idle = cfg.engine_tuning.idle_rpm;
        let mut drivetrains = [VehicleDrivetrainState::new(idle); MAX_CARS];
        drivetrains[0].dormant = false;
        Self {
            cue_pod: AudioFrameCuePod::default(),
            config_pod: cfg,
            listener_pod: AudioListenerStatePod::default(),
            drivetrains,
            last_event_read_seq: 0,
            last_ball_world_hit_tick: u32::MAX,
            last_goalpost_hit_tick: u32::MAX,
            last_car_ball_hit_tick: u32::MAX,
            last_car_bump_global_tick: u32::MAX,
            last_goal_scored_tick: u32::MAX,
            last_pad_pickup_tick: [u32::MAX; MAX_PADS],
            last_car_demo_tick: [u32::MAX; MAX_CARS],
            smoothed_ball_rolling_gain: 0.0,
            smoothed_ball_flying_gain: 0.0,
            smoothed_ball_rolling_rate: 1.0,
            smoothed_ball_flying_rate: 1.0,
            rng_state: 0x9E37_79B9,
            last_sim_tick: 0,
            stadium_linear_phase: 0.0,
            last_variant_idx: [0xFF; 32],
            listener_initialized: false,
        }
    }

    /// Resets all per-car drivetrains, continuous loop smoothers, and incident cooldown latches.
    pub fn reset(&mut self, active_car_index: i32) {
        let active_idx = active_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
        self.listener_pod.active_car_index = active_idx as i32;
        let idle = self.config_pod.engine_tuning.idle_rpm;
        for (i, dt) in self.drivetrains.iter_mut().enumerate() {
            dt.reset(idle, i == active_idx);
        }
        self.cue_pod = AudioFrameCuePod::default();
        self.last_ball_world_hit_tick = u32::MAX;
        self.last_goalpost_hit_tick = u32::MAX;
        self.last_car_ball_hit_tick = u32::MAX;
        self.last_car_bump_global_tick = u32::MAX;
        self.last_goal_scored_tick = u32::MAX;
        self.last_pad_pickup_tick = [u32::MAX; MAX_PADS];
        self.last_car_demo_tick = [u32::MAX; MAX_CARS];
        self.smoothed_ball_rolling_gain = 0.0;
        self.smoothed_ball_flying_gain = 0.0;
        self.smoothed_ball_rolling_rate = 1.0;
        self.smoothed_ball_flying_rate = 1.0;
        self.listener_initialized = false;
    }

    #[inline]
    pub fn next_rand_u32(&mut self) -> u32 {
        let mut x = self.rng_state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        if x == 0 {
            x = 0x9E37_79B9;
        }
        self.rng_state = x;
        x
    }

    #[inline]
    pub fn next_rand_f32(&mut self) -> f32 {
        (self.next_rand_u32() as f32) * (1.0 / 4294967296.0)
    }

    #[inline]
    pub fn select_variation(&mut self, slot_key: usize, count: u32) -> u32 {
        if count <= 1 {
            return 0;
        }
        let key = slot_key & 31;
        let last = self.last_variant_idx[key] as u32;
        let mut idx = self.next_rand_u32() % count;
        if idx == last {
            idx = (idx + 1) % count;
        }
        self.last_variant_idx[key] = idx as u8;
        idx
    }

    /// Manually latches a discrete car action bit in the 64-bit edge trigger mask.
    pub fn trigger_car_action(&mut self, car_index: i32, action_code: i32) {
        if !(0..MAX_CARS as i32).contains(&car_index) {
            return;
        }
        let c = car_index as u32;
        match action_code {
            1 => self.cue_pod.one_shot_edge_mask_lo |= 1u32 << (edge_mask_bits::CAR_JUMP_BASE + c),
            2 => {
                self.cue_pod.one_shot_edge_mask_lo |=
                    1u32 << (edge_mask_bits::CAR_DOUBLE_JUMP_BASE + c)
            }
            3 | 4 => {
                self.cue_pod.one_shot_edge_mask_lo |= 1u32 << (edge_mask_bits::CAR_DODGE_BASE + c)
            }
            5 => {
                self.cue_pod.one_shot_edge_mask_hi |=
                    1u32 << (edge_mask_bits::CAR_SUPERSONIC_ENTER_BASE + c)
            }
            7 => {
                self.cue_pod.one_shot_edge_mask_hi |=
                    1u32 << (edge_mask_bits::CAR_WHEEL_LANDING_BASE + c)
            }
            8 => {
                self.cue_pod.one_shot_edge_mask_lo |=
                    1u32 << (edge_mask_bits::CAR_BOOST_START_BASE + c)
            }
            9 => {
                self.cue_pod.one_shot_edge_mask_hi |=
                    1u32 << (edge_mask_bits::CAR_BOOST_STOP_BASE + c)
            }
            _ => {}
        }
    }

    /// Updates listener camera transform and frame context flags prior to `step_frame`.
    #[allow(clippy::too_many_arguments)]
    pub fn set_listener_state(
        &mut self,
        pos_x: f32,
        pos_y: f32,
        pos_z: f32,
        fwd_x: f32,
        fwd_y: f32,
        fwd_z: f32,
        up_x: f32,
        up_y: f32,
        up_z: f32,
        active_car_index: i32,
        effective_num_cars: i32,
        flags: u32,
    ) {
        let dt = self.listener_pod.dt_sec.clamp(1.0 / 240.0, 0.1);
        self.listener_pod.vel_uu = if self.listener_initialized {
            [
                ((pos_x - self.listener_pod.pos_uu[0]) / dt).clamp(-6000.0, 6000.0),
                ((pos_y - self.listener_pod.pos_uu[1]) / dt).clamp(-6000.0, 6000.0),
                ((pos_z - self.listener_pod.pos_uu[2]) / dt).clamp(-6000.0, 6000.0),
            ]
        } else {
            [0.0, 0.0, 0.0]
        };
        self.listener_pod.pos_uu = [pos_x, pos_y, pos_z];
        self.listener_pod.forward_audio = [fwd_x, fwd_y, fwd_z];
        self.listener_pod.up_audio = [up_x, up_y, up_z];
        self.listener_pod.active_car_index = active_car_index;
        self.listener_pod.effective_num_cars = effective_num_cars;
        self.listener_pod.flags = flags;
        self.listener_initialized = true;
    }

    #[inline]
    pub fn evaluate_attenuation(&self, cat_idx: usize, dist_uu: f32) -> (f32, bool) {
        let prof: &AttenuationProfilePod = &self.config_pod.attenuation_profiles[cat_idx.min(15)];
        let scale = self.config_pod.arena_acoustic_scale.clamp(0.25, 4.0);
        let min_d = (prof.min_distance_uu * scale).max(0.0);
        let max_d = (prof.max_distance_uu * scale).max(min_d + 1.0);
        let floor = prof.min_gain_floor.clamp(0.0, 1.0);
        let d = dist_uu.max(0.0);
        if d <= min_d {
            return (1.0, false);
        }
        if d >= max_d {
            if (prof.flags & 1) != 0 && floor <= 1e-4 {
                return (0.0, true);
            }
            return (floor, false);
        }
        let t = ((d - min_d) / (max_d - min_d)).clamp(0.0, 1.0);
        let shaped = match prof.curve_type {
            0 => 1.0 - t,
            1 => {
                let s = t * t * (3.0 - 2.0 * t);
                1.0 - s
            }
            2 => (1.0 - t).max(0.0).powf(prof.curve_exponent.clamp(0.2, 5.0)),
            3 => solve_cubic_bezier(
                t,
                prof.bezier_x1_y1_x2_y2[0],
                prof.bezier_x1_y1_x2_y2[1],
                prof.bezier_x1_y1_x2_y2[2],
                prof.bezier_x1_y1_x2_y2[3],
            ),
            4 => {
                let ref_d = min_d.max(50.0);
                let rolloff = prof.curve_exponent.clamp(0.2, 5.0);
                let raw_inv = ref_d / (ref_d + rolloff * (d - min_d));
                let max_inv = ref_d / (ref_d + rolloff * (max_d - min_d));
                ((raw_inv - max_inv) / (1.0 - max_inv).max(1e-5)).clamp(0.0, 1.0)
            }
            _ => 1.0 - t,
        };
        let gain = (floor + (1.0 - floor) * shaped).clamp(0.0, 1.0);
        (gain, false)
    }

    pub fn push_one_shot(&mut self, slot: AudioOneShotSlotPod) {
        if slot.final_gain <= 0.0005 {
            return;
        }
        let count = self.cue_pod.one_shot_count as usize;
        if count < MAX_AUDIO_ONE_SHOT_SLOTS {
            self.cue_pod.one_shots[count] = slot;
            self.cue_pod.one_shot_count = (count + 1) as u32;
            return;
        }
        let new_prio = slot.priority_and_variant & 0xFF;
        let mut min_prio = u32::MAX;
        let mut min_idx = 0usize;
        for i in 0..MAX_AUDIO_ONE_SHOT_SLOTS {
            let p = self.cue_pod.one_shots[i].priority_and_variant & 0xFF;
            if p < min_prio {
                min_prio = p;
                min_idx = i;
            }
        }
        if new_prio > min_prio {
            self.cue_pod.one_shots[min_idx] = slot;
        }
    }

    /// Steps one render/audio frame, reading `SimInstance::state_buffer`, `controls_buffer`,
    /// and `event_buffer`, and writing the zero-copy `AudioFrameCuePod`.
    pub fn step_frame(&mut self, sim: &SimInstance, dt_sec: f32) -> *const AudioFrameCuePod {
        let clamped_dt = dt_sec.clamp(0.0005, 0.1);
        self.listener_pod.dt_sec = clamped_dt;

        self.cue_pod.one_shot_edge_mask_lo = 0;
        self.cue_pod.one_shot_edge_mask_hi = 0;
        self.cue_pod.one_shot_count = 0;
        self.cue_pod.primary_impact_gain = 0.0;
        self.cue_pod.primary_impact_pitch = 1.0;

        let current_tick = sim.state_buffer.header.tick_count.max(0.0) as u32;
        if current_tick < self.last_sim_tick
            || sim.event_buffer.write_seq < self.last_event_read_seq
        {
            self.last_ball_world_hit_tick = u32::MAX;
            self.last_goalpost_hit_tick = u32::MAX;
            self.last_car_ball_hit_tick = u32::MAX;
            self.last_car_bump_global_tick = u32::MAX;
            self.last_goal_scored_tick = u32::MAX;
            self.last_pad_pickup_tick = [u32::MAX; MAX_PADS];
            self.last_car_demo_tick = [u32::MAX; MAX_CARS];
            for dt in &mut self.drivetrains {
                dt.last_boost_tick = 0;
                dt.last_jump_tick = 0;
                dt.last_air_jump_tick = 0;
                dt.last_supersonic_tick = 0;
                dt.last_wheel_landing_tick = 0;
                dt.last_flip_reset_tick = 0;
            }
            if sim.event_buffer.write_seq < self.last_event_read_seq {
                self.last_event_read_seq = 0;
            }
        }
        self.last_sim_tick = current_tick;

        let is_audible = (self.listener_pod.flags & 1) != 0;
        if !is_audible {
            self.cue_pod.ball_roll_gain = 0.0;
            self.cue_pod.ball.rolling_gain = 0.0;
            self.cue_pod.ball.flying_gain = 0.0;
            self.smoothed_ball_rolling_gain = 0.0;
            self.smoothed_ball_flying_gain = 0.0;
            for c in &mut self.cue_pod.cars {
                c.engine_gain = 0.0;
                c.boost_gain = 0.0;
                c.supersonic_gain = 0.0;
            }
            self.last_event_read_seq = sim.event_buffer.write_seq;
            return &self.cue_pod as *const AudioFrameCuePod;
        }

        // 1. Step 8-car drivetrains, spatial pan/Doppler, Top-3 remote LOD budget, and wheel landings
        let baseline_mask = step_all_vehicles_baseline(
            &mut self.drivetrains,
            &sim.state_buffer.cars,
            &sim.controls_buffer,
            &self.listener_pod,
            &self.config_pod,
            &mut self.cue_pod.cars,
        );
        self.cue_pod.awake_remote_car_mask =
            self.refine_vehicles_and_wheel_landings(sim, current_tick, baseline_mask);

        // 2. Step continuous ball rolling & downward flying loops
        self.step_ball_loops(sim, clamped_dt);

        // 3. Step stadium PA reverb & filter bus modulation
        self.step_stadium_bus(clamped_dt);

        // 4. Consume physics event ring buffer and synthesize discrete one-shot cues
        self.consume_event_buffer(sim, current_tick);

        &self.cue_pod as *const AudioFrameCuePod
    }
}
