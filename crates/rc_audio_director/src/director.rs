//! `AudioDirectorInstance`: Deterministic WASM acoustic state machine owning `AudioFrameCuePod`,
//! `AudioDirectorConfigPod`, `AudioListenerStatePod`, 8 vehicle drivetrains, and incident cooldowns.

use rc_physics_sim::{
    layout::{MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

use crate::{
    ball_loops::step_ball_acoustic_loops,
    config_pod::AudioDirectorConfigPod,
    drivetrain_state::{step_all_vehicles_baseline, VehicleDrivetrainState},
    incident_classifier::{process_physics_incidents, step_vehicle_landing_impacts},
    pod_types::{edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod},
};

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
            last_ball_world_hit_tick: 0,
            last_goalpost_hit_tick: 0,
            last_car_ball_hit_tick: 0,
            last_car_bump_global_tick: 0,
            last_goal_scored_tick: 0,
            last_pad_pickup_tick: [0; MAX_PADS],
            last_car_demo_tick: [0; MAX_CARS],
            smoothed_ball_rolling_gain: 0.0,
            smoothed_ball_flying_gain: 0.0,
            smoothed_ball_rolling_rate: 1.0,
            smoothed_ball_flying_rate: 1.0,
            rng_state: 0x9E37_79B9,
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
        self.last_ball_world_hit_tick = 0;
        self.last_goalpost_hit_tick = 0;
        self.last_car_ball_hit_tick = 0;
        self.last_car_bump_global_tick = 0;
        self.last_goal_scored_tick = 0;
        self.last_pad_pickup_tick = [0; MAX_PADS];
        self.last_car_demo_tick = [0; MAX_CARS];
        self.smoothed_ball_rolling_gain = 0.0;
        self.smoothed_ball_flying_gain = 0.0;
        self.smoothed_ball_rolling_rate = 1.0;
        self.smoothed_ball_flying_rate = 1.0;
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
        let dt = self.listener_pod.dt_sec.max(1.0 / 240.0);
        self.listener_pod.vel_uu = [
            (pos_x - self.listener_pod.pos_uu[0]) / dt,
            (pos_y - self.listener_pod.pos_uu[1]) / dt,
            (pos_z - self.listener_pod.pos_uu[2]) / dt,
        ];
        self.listener_pod.pos_uu = [pos_x, pos_y, pos_z];
        self.listener_pod.forward_audio = [fwd_x, fwd_y, fwd_z];
        self.listener_pod.up_audio = [up_x, up_y, up_z];
        self.listener_pod.active_car_index = active_car_index;
        self.listener_pod.effective_num_cars = effective_num_cars;
        self.listener_pod.flags = flags;
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

        // 1. Step 8-car drivetrains and Top-3 remote LOD budget
        self.cue_pod.awake_remote_car_mask = step_all_vehicles_baseline(
            &mut self.drivetrains,
            &sim.state_buffer.cars,
            &sim.controls_buffer,
            &self.listener_pod,
            &self.config_pod,
            &mut self.cue_pod.cars,
        );

        // 2. Step continuous ball rolling & downward flying loops (`ball_loops.rs`)
        self.cue_pod.ball_roll_gain = step_ball_acoustic_loops(
            &sim.state_buffer.ball,
            sim.ball_motion_state,
            &self.listener_pod,
            &self.config_pod,
            &mut self.smoothed_ball_rolling_gain,
            &mut self.smoothed_ball_flying_gain,
            &mut self.smoothed_ball_rolling_rate,
            &mut self.smoothed_ball_flying_rate,
            &mut self.cue_pod.ball,
        );

        // 3. Step vehicle wheel landing impact detection & discrete physics incidents (`incident_classifier.rs`)
        let current_tick = (sim.state_buffer.header.tick_count as u32).max(1);
        step_vehicle_landing_impacts(
            &mut self.drivetrains,
            &sim.state_buffer.cars,
            current_tick,
            &self.listener_pod,
            &self.config_pod,
            &mut self.rng_state,
            &mut self.cue_pod,
        );

        process_physics_incidents(
            &sim.event_buffer,
            &mut self.last_event_read_seq,
            &mut self.last_ball_world_hit_tick,
            &mut self.last_goalpost_hit_tick,
            &mut self.last_car_ball_hit_tick,
            &mut self.last_car_bump_global_tick,
            &mut self.last_goal_scored_tick,
            &mut self.last_pad_pickup_tick,
            &mut self.last_car_demo_tick,
            &mut self.drivetrains,
            &self.listener_pod,
            &self.config_pod,
            &mut self.rng_state,
            &mut self.cue_pod,
        );

        &self.cue_pod as *const AudioFrameCuePod
    }
}

