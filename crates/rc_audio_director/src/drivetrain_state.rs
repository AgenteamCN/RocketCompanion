//! Per-vehicle Turtle Modem powertrain state machine, remote engine Top-3 LOD controller,
//! and action edge / wheel landing debounce state.
//!
//! Tier 2 worker branch (`T2-A1`: Powertrain & Granular Synth) fills in the full
//! velocity-coupled gear curve and granular slice weight calculations inside `step_vehicle_powertrain`.

use rc_physics_sim::layout::{CarControlsPod, CarStatePod, MAX_CARS};

use crate::{
    config_pod::AudioDirectorConfigPod,
    pod_types::{AudioListenerStatePod, CarAcousticLoopPod},
};

/// Internal per-vehicle state for the Turtle Modem drivetrain and landing/action debouncer.
#[derive(Clone, Copy)]
pub struct VehicleDrivetrainState {
    pub current_rpm: f32,
    pub target_rpm: f32,
    pub current_gear: i32,
    pub is_neutral: bool,
    pub is_on_ground: bool,
    pub was_on_ground: bool,
    /// `0` = stopped, `1` = forward, `-1` = reverse.
    pub drive_direction: i8,
    pub smooth_throttle: f32,
    pub was_accelerating: bool,
    pub was_actively_driving_on_ground: bool,
    pub was_in_overdrive: bool,
    pub is_in_overdrive: bool,
    pub is_boosting: bool,
    pub was_braking_against_motion: bool,
    pub rev_limiter_timer: f32,
    pub backfire_cooldown_timer: f32,
    pub airborne_throttle_quota_sec: f32,
    pub prev_forward_speed_uu: f32,
    pub smooth_forward_accel_uu: f32,
    pub is_shift_locked: bool,
    pub is_under_strain: bool,
    pub landing_recovery_timer: f32,
    pub smoothed_output_gain: f32,
    pub smoothed_boost_gain: f32,
    pub smoothed_supersonic_gain: f32,
    pub was_demoed: bool,
    pub dormant: bool,
    pub awake_remote: bool,
    // Landing impact tracking (`stepVehicleLandingTracking`):
    pub landing_was_grounded: bool,
    pub peak_downward_speed_uu: f32,
    pub airborne_ticks: u32,
    // Action edge debounce ticks (`CarActionDebounceRegistry`):
    pub boost_latched: bool,
    pub boost_hysteresis_until_tick: u32,
    pub has_single_jumped: bool,
    pub jump_released_since_single_jump: bool,
    pub has_air_jumped: bool,
    pub last_boost_tick: u32,
    pub last_jump_tick: u32,
    pub last_air_jump_tick: u32,
    pub last_supersonic_tick: u32,
    pub last_wheel_landing_tick: u32,
    pub last_flip_reset_tick: u32,
}

impl Default for VehicleDrivetrainState {
    fn default() -> Self {
        Self::new(900.0)
    }
}

impl VehicleDrivetrainState {
    pub const fn new(idle_rpm: f32) -> Self {
        Self {
            current_rpm: idle_rpm,
            target_rpm: idle_rpm,
            current_gear: 0,
            is_neutral: true,
            is_on_ground: true,
            was_on_ground: true,
            drive_direction: 0,
            smooth_throttle: 0.0,
            was_accelerating: false,
            was_actively_driving_on_ground: false,
            was_in_overdrive: false,
            is_in_overdrive: false,
            is_boosting: false,
            was_braking_against_motion: false,
            rev_limiter_timer: 0.0,
            backfire_cooldown_timer: 0.0,
            airborne_throttle_quota_sec: 1.25,
            prev_forward_speed_uu: 0.0,
            smooth_forward_accel_uu: 0.0,
            is_shift_locked: false,
            is_under_strain: false,
            landing_recovery_timer: 0.0,
            smoothed_output_gain: 0.0,
            smoothed_boost_gain: 0.0,
            smoothed_supersonic_gain: 0.0,
            was_demoed: false,
            dormant: true,
            awake_remote: false,
            landing_was_grounded: true,
            peak_downward_speed_uu: 0.0,
            airborne_ticks: 0,
            boost_latched: false,
            boost_hysteresis_until_tick: 0,
            has_single_jumped: false,
            jump_released_since_single_jump: true,
            has_air_jumped: false,
            last_boost_tick: 0,
            last_jump_tick: 0,
            last_air_jump_tick: 0,
            last_supersonic_tick: 0,
            last_wheel_landing_tick: 0,
            last_flip_reset_tick: 0,
        }
    }

    pub fn reset(&mut self, idle_rpm: f32, is_primary: bool) {
        *self = Self::new(idle_rpm);
        self.dormant = !is_primary;
    }
}

/// Evaluates Top-3 remote vehicle LOD budget and steps baseline powertrain telemetry for all 8 cars.
pub fn step_all_vehicles_baseline(
    drivetrains: &mut [VehicleDrivetrainState; MAX_CARS],
    cars_state: &[CarStatePod; MAX_CARS],
    controls: &[CarControlsPod; MAX_CARS],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    out_cars: &mut [CarAcousticLoopPod; MAX_CARS],
) -> u32 {
    let active_car = listener.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
    let num_cars = listener.effective_num_cars.clamp(0, MAX_CARS as i32) as usize;
    let idle_rpm = cfg.engine_tuning.idle_rpm.max(100.0);
    let redline_rpm = cfg.engine_tuning.redline_rpm.max(idle_rpm + 100.0);
    let awake_mask = 0u32;

    for i in 0..MAX_CARS {
        let dt_state = &mut drivetrains[i];
        let out = &mut out_cars[i];
        if i >= num_cars {
            dt_state.dormant = i != active_car;
            *out = CarAcousticLoopPod::default();
            continue;
        }
        let car = &cars_state[i];
        let ctrl = &controls[i];
        let is_primary = i == active_car;
        let is_demoed = car.is_demoed > 0.0;
        let dx = car.pos[0] - listener.pos_uu[0];
        let dy = car.pos[1] - listener.pos_uu[1];
        let dz = car.pos[2] - listener.pos_uu[2];
        let dist_uu = if is_primary {
            0.0
        } else {
            (dx * dx + dy * dy + dz * dz).sqrt()
        };

        let fwd_speed =
            car.vel[0] * car.forward[0] + car.vel[1] * car.forward[1] + car.vel[2] * car.forward[2];
        let speed_norm = (fwd_speed.abs() / cfg.engine_tuning.max_throttle_speed_uu.max(200.0))
            .clamp(0.0, 1.0);
        let rpm = if is_demoed {
            idle_rpm
        } else {
            idle_rpm + speed_norm * (redline_rpm - idle_rpm)
        };
        dt_state.current_rpm = rpm;
        dt_state.prev_forward_speed_uu = fwd_speed;
        dt_state.was_demoed = is_demoed;

        let rpm_norm = ((rpm - idle_rpm) / (redline_rpm - idle_rpm)).clamp(0.0, 1.0);
        let load = ctrl.throttle.abs().max(ctrl.boost).clamp(0.0, 1.0);
        *out = CarAcousticLoopPod {
            engine_rpm: rpm,
            engine_rpm_norm: rpm_norm,
            engine_load: load,
            engine_gain: if is_demoed {
                0.0
            } else {
                cfg.engine_volume * cfg.master_volume * 0.42
            },
            engine_pitch: (rpm / idle_rpm).clamp(0.5, 2.0),
            filter_cutoff_hz: 900.0 + load * 17100.0,
            idle_gain: (1.0 - rpm_norm * 2.0).clamp(0.0, 1.0) * cfg.engine_tuning.idle_volume,
            lower_slice_gain: 1.0 - rpm_norm,
            upper_slice_gain: rpm_norm,
            lower_slice_rate: 1.0,
            upper_slice_rate: 1.0,
            boost_gain: if car.is_boosting >= 0.5 && !is_demoed {
                cfg.boost_loop_volume * cfg.boost_volume * cfg.master_volume
            } else {
                0.0
            },
            boost_pitch: 1.0,
            supersonic_gain: if car.is_supersonic >= 0.5 && !is_demoed {
                cfg.supersonic_loop_volume * cfg.master_volume
            } else {
                0.0
            },
            skid_gain: if car.is_on_ground >= 0.5 && ctrl.handbrake >= 0.5 {
                (fwd_speed.abs() / 1400.0).clamp(0.0, 1.0)
            } else {
                0.0
            },
            air_roll_gain: if car.is_on_ground < 0.5 {
                (ctrl.roll.abs() * 0.5).clamp(0.0, 1.0)
            } else {
                0.0
            },
            spatial_pan: 0.0,
            doppler_pitch: 1.0,
            distance_uu: dist_uu,
            packed_flags: u32::from(!is_demoed) | (u32::from(is_primary) << 2),
        };
    }

    awake_mask
}
