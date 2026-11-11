//! Per-vehicle Turtle Modem powertrain state machine, 6-gear / overdrive shifting,
//! wall-deceleration strain dip, supersonic turn rev-bounce, exhaust backfire pop trigger,
//! remote engine Top-3 LOD controller, and action edge / wheel landing debounce state.

use rc_physics_sim::layout::{CarControlsPod, CarStatePod, MAX_CARS};

use crate::{
    config_pod::{AudioDirectorConfigPod, EngineTuningConfigPod},
    granular_lookup::{
        compute_active_ground_target_rpm, compute_deceleration_target_rpm,
        compute_velocity_coupled_gear_rpm, evaluate_granular_synthesis,
        evaluate_powertrain_kinetics, evaluate_remote_engine_lod_mask, resolve_touchdown_state,
    },
    pod_types::{edge_mask_bits, AudioListenerStatePod, CarAcousticLoopPod},
};

#[derive(Clone, Copy)]
pub struct VehicleDrivetrainState {
    pub current_rpm: f32, pub target_rpm: f32, pub current_gear: i32,
    pub is_neutral: bool, pub is_on_ground: bool, pub was_on_ground: bool,
    pub drive_direction: i8, pub smooth_throttle: f32, pub was_accelerating: bool,
    pub was_actively_driving_on_ground: bool, pub was_in_overdrive: bool, pub is_in_overdrive: bool,
    pub is_boosting: bool, pub was_braking_against_motion: bool, pub rev_limiter_timer: f32,
    pub backfire_cooldown_timer: f32, pub airborne_throttle_quota_sec: f32, pub prev_forward_speed_uu: f32,
    pub smooth_forward_accel_uu: f32, pub is_shift_locked: bool, pub is_under_strain: bool,
    pub landing_recovery_timer: f32, pub smoothed_output_gain: f32, pub smoothed_boost_gain: f32,
    pub smoothed_supersonic_gain: f32, pub was_demoed: bool, pub dormant: bool, pub awake_remote: bool,
    pub landing_was_grounded: bool, pub peak_downward_speed_uu: f32, pub airborne_ticks: u32,
    pub boost_latched: bool, pub boost_hysteresis_until_tick: u32, pub has_single_jumped: bool,
    pub jump_released_since_single_jump: bool, pub has_air_jumped: bool, pub last_boost_tick: u32,
    pub last_jump_tick: u32, pub last_air_jump_tick: u32, pub last_supersonic_tick: u32,
    pub last_wheel_landing_tick: u32, pub last_flip_reset_tick: u32,
}

impl Default for VehicleDrivetrainState {
    fn default() -> Self {
        Self::new(900.0)
    }
}

impl VehicleDrivetrainState {
    pub const fn new(idle_rpm: f32) -> Self {
        Self {
            current_rpm: idle_rpm, target_rpm: idle_rpm, current_gear: 0,
            is_neutral: true, is_on_ground: true, was_on_ground: true,
            drive_direction: 0, smooth_throttle: 0.0, was_accelerating: false,
            was_actively_driving_on_ground: false, was_in_overdrive: false, is_in_overdrive: false,
            is_boosting: false, was_braking_against_motion: false, rev_limiter_timer: 0.0,
            backfire_cooldown_timer: 0.0, airborne_throttle_quota_sec: 1.25, prev_forward_speed_uu: 0.0,
            smooth_forward_accel_uu: 0.0, is_shift_locked: false, is_under_strain: false,
            landing_recovery_timer: 0.0, smoothed_output_gain: 0.0, smoothed_boost_gain: 0.0,
            smoothed_supersonic_gain: 0.0, was_demoed: false, dormant: true, awake_remote: false,
            landing_was_grounded: true, peak_downward_speed_uu: 0.0, airborne_ticks: 0,
            boost_latched: false, boost_hysteresis_until_tick: 0, has_single_jumped: false,
            jump_released_since_single_jump: true, has_air_jumped: false, last_boost_tick: 0,
            last_jump_tick: 0, last_air_jump_tick: 0, last_supersonic_tick: 0,
            last_wheel_landing_tick: 0, last_flip_reset_tick: 0,
        }
    }

    pub fn reset(&mut self, idle_rpm: f32, is_primary: bool) {
        *self = Self::new(idle_rpm);
        self.dormant = !is_primary;
    }

    pub fn reset_to_zero_speed_state(&mut self, idle_rpm: f32) {
        let (demo, dorm, awk) = (self.was_demoed, self.dormant, self.awake_remote);
        *self = Self::new(idle_rpm);
        self.was_demoed = demo;
        self.dormant = dorm;
        self.awake_remote = awk;
    }

    fn apply_backfire_drop(&mut self, cfg: &EngineTuningConfigPod) -> bool {
        if self.backfire_cooldown_timer > 0.0 {
            return false;
        }
        let flr = (cfg.idle_rpm + 150.0).max(cfg.downshift_trigger_rpm - 200.0);
        self.current_rpm = (self.current_rpm - cfg.backfire_rpm_drop.max(400.0)).max(flr);
        self.target_rpm = self.target_rpm.min(self.current_rpm);
        self.backfire_cooldown_timer = cfg.backfire_cooldown_sec.max(0.15);
        true
    }

    #[allow(clippy::too_many_arguments)]
    pub fn step_powertrain(
        &mut self, cfg: &EngineTuningConfigPod, raw_spd: f32, fwd_spd: f32,
        raw_thr: f32, steer: f32, hb: bool, boost: bool, grounded: bool, up_z: f32, dt: f32,
    ) -> bool {
        let (idle, red, cut, z_spd) = (cfg.idle_rpm, cfg.redline_rpm, cfg.rev_limit_cutoff_rpm, cfg.zero_speed_threshold_uu);
        self.is_boosting = boost;
        let thr = if boost && raw_thr >= -0.05 { raw_thr.max(1.0) } else { raw_thr };
        self.backfire_cooldown_timer = (self.backfire_cooldown_timer - dt).max(0.0);
        let kin = evaluate_powertrain_kinetics(
            cfg, fwd_spd, self.prev_forward_speed_uu, self.smooth_forward_accel_uu,
            thr, steer, hb, boost, grounded, up_z, dt,
        );
        self.prev_forward_speed_uu = fwd_spd;
        self.smooth_forward_accel_uu = kin.smooth_acc;
        self.is_shift_locked = kin.shift_locked;
        self.is_under_strain = kin.under_strain;

        let (landed, left_gnd) = (!self.was_on_ground && grounded, self.was_on_ground && !grounded);
        self.was_on_ground = grounded;
        self.is_on_ground = grounded;
        if grounded || left_gnd {
            self.airborne_throttle_quota_sec = cfg.airborne_rev_quota_duration_sec.max(0.1);
        }

        let (mut backfire, stopped, abs_thr) = (false, raw_spd <= z_spd, thr.abs());
        let stat_gnd = grounded && stopped && abs_thr < 0.05;
        let next_dir = if !grounded { 1 } else if stat_gnd { 0 } else if fwd_spd < -z_spd || (stopped && thr < -0.05) { -1 } else if fwd_spd > z_spd || (stopped && thr > 0.05) { 1 } else { self.drive_direction };

        if (cfg.flags & 32) != 0 && grounded && (stat_gnd || (self.drive_direction * next_dir) == -1) {
            self.current_gear = if stat_gnd { 0 } else { 1 };
            self.target_rpm = idle;
            self.current_rpm = idle;
            self.rev_limiter_timer = 0.0;
            self.is_in_overdrive = false;
        }
        self.drive_direction = next_dir;
        if grounded && !stat_gnd && self.current_gear <= 0 {
            self.current_gear = 1;
        }

        let air_neut = (cfg.flags & 4) != 0 && !grounded;
        self.is_neutral = air_neut || stat_gnd;
        if landed && !stopped {
            self.rev_limiter_timer = 0.0;
            let (g, cr, tr, rt) = resolve_touchdown_state(cfg, kin.abs_fwd, self.current_gear.max(1), self.current_rpm, next_dir);
            self.current_gear = g;
            self.current_rpm = cr;
            self.target_rpm = tr;
            self.landing_recovery_timer = rt;
        }
        self.landing_recovery_timer = (self.landing_recovery_timer - dt).max(0.0);

        let drv_fwd = !air_neut && thr > 0.05 && fwd_spd >= -z_spd;
        let drv_rev = !air_neut && thr < -0.05 && fwd_spd <= z_spd;
        let act_gnd = drv_fwd || drv_rev;
        let air_rev = air_neut && abs_thr > 0.05 && self.airborne_throttle_quota_sec > 0.0;
        let under_thr = act_gnd || air_rev;

        if grounded && kin.braking && !self.was_braking_against_motion && self.current_rpm >= cfg.backfire_trigger_rpm.min(2800.0) {
            backfire |= self.apply_backfire_drop(cfg);
            self.rev_limiter_timer = 0.0;
        }
        self.was_braking_against_motion = kin.braking;

        if self.was_actively_driving_on_ground && !act_gnd && grounded {
            if self.was_in_overdrive && self.current_rpm >= cfg.backfire_trigger_rpm {
                backfire |= self.apply_backfire_drop(cfg);
            }
            self.rev_limiter_timer = 0.0;
        } else if !self.was_actively_driving_on_ground && act_gnd {
            self.target_rpm = self.current_rpm.max(idle);
        }
        self.was_actively_driving_on_ground = act_gnd;
        self.was_accelerating = under_thr;

        let (auto_up, auto_dn, vel_cpl) = ((cfg.flags & 1) != 0, (cfg.flags & 2) != 0, (cfg.flags & 8) != 0);
        let bnc_flr = (cut - cfg.rev_limiter_bounce_drop).max(idle);

        if air_neut {
            self.is_in_overdrive = false;
            if abs_thr > 0.05 && self.airborne_throttle_quota_sec > 0.0 {
                self.airborne_throttle_quota_sec = (self.airborne_throttle_quota_sec - dt).max(0.0);
                if self.rev_limiter_timer > 0.0 {
                    self.rev_limiter_timer -= dt;
                    self.target_rpm = bnc_flr;
                } else {
                    self.target_rpm = cut;
                    if self.current_rpm >= cut - 15.0 {
                        self.rev_limiter_timer = cfg.rev_limiter_bounce_duration;
                        self.target_rpm = bnc_flr;
                    }
                }
            } else {
                self.rev_limiter_timer = 0.0;
                self.target_rpm = (self.target_rpm - cfg.rpm_drop_rate * dt).max(idle);
            }
        } else if stat_gnd {
            self.is_in_overdrive = false;
            self.rev_limiter_timer = 0.0;
            self.target_rpm = idle;
            self.current_rpm = idle;
        } else if self.rev_limiter_timer > 0.0 {
            self.rev_limiter_timer -= dt;
            self.target_rpm = bnc_flr;
        } else if act_gnd {
            self.target_rpm = compute_active_ground_target_rpm(
                cfg, &kin, &mut self.current_gear, &mut self.is_in_overdrive,
                self.target_rpm, abs_thr, drv_rev, boost, self.drive_direction, dt,
            );
            if self.current_rpm >= cut || self.target_rpm >= cut {
                if auto_up && (cfg.max_gears <= 0 || self.current_gear < cfg.max_gears) && !kin.shift_locked {
                    if self.is_in_overdrive && self.current_rpm >= cfg.backfire_trigger_rpm {
                        backfire |= self.apply_backfire_drop(cfg);
                    }
                    self.current_gear += 1;
                    self.target_rpm = cfg.upshift_landing_rpm;
                    self.current_rpm = cfg.upshift_landing_rpm;
                    self.is_in_overdrive = true;
                } else if self.current_rpm >= cut {
                    self.rev_limiter_timer = cfg.rev_limiter_bounce_duration;
                    self.target_rpm = bnc_flr;
                }
            }
        } else {
            self.is_in_overdrive = false;
            self.target_rpm = compute_deceleration_target_rpm(cfg, &kin, self.current_gear.max(1), self.target_rpm, self.drive_direction, dt);
            if auto_dn && self.current_gear > 1 && self.current_rpm <= cfg.downshift_trigger_rpm {
                self.current_gear -= 1;
                let rev_m = if vel_cpl {
                    compute_velocity_coupled_gear_rpm(cfg, kin.abs_fwd, self.current_gear, self.drive_direction)
                        .clamp(cfg.upshift_landing_rpm, cfg.downshift_rev_match_peak_rpm)
                } else {
                    cfg.downshift_rev_match_peak_rpm
                };
                self.target_rpm = rev_m;
                self.current_rpm = rev_m;
            }
        }

        self.was_in_overdrive = self.is_in_overdrive;
        self.target_rpm = self.target_rpm.clamp(idle, red);
        let agi = if air_rev { 55.0 } else if under_thr || self.rev_limiter_timer > 0.0 || self.landing_recovery_timer > 0.0 {
            if self.landing_recovery_timer > 0.0 { (cfg.flywheel_agility * 1.5).max(24.0) } else { cfg.flywheel_agility }
        } else if kin.braking { 45.0 } else { (cfg.flywheel_agility * 1.4).max(24.0) };

        if stat_gnd {
            self.current_rpm = idle;
            self.smooth_throttle = 0.0;
        } else {
            self.current_rpm = (self.current_rpm + (self.target_rpm - self.current_rpm) * (1.0 - (-agi * dt).exp())).clamp(idle, red);
            let load = if under_thr { (abs_thr + if kin.under_strain { 0.15 } else { 0.0 }).min(1.0) } else { 0.0 };
            self.smooth_throttle += (load - self.smooth_throttle) * (15.0 * dt).min(1.0);
        }
        backfire
    }
}

pub fn step_all_vehicles_baseline(
    drivetrains: &mut [VehicleDrivetrainState; MAX_CARS],
    cars_state: &[CarStatePod; MAX_CARS],
    controls: &[CarControlsPod; MAX_CARS],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    out_cars: &mut [CarAcousticLoopPod; MAX_CARS],
) -> (u32, u32) {
    let active_car = listener.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
    let num_cars = listener.effective_num_cars.clamp(0, MAX_CARS as i32) as usize;
    let (dt, is_audible, tuning) = (listener.dt_sec.clamp(0.001, 0.05), (listener.flags & 1) != 0, &cfg.engine_tuning);
    let (idle, red) = (tuning.idle_rpm.max(100.0), tuning.redline_rpm.max(tuning.idle_rpm + 100.0));

    let mut prev_mask = 0u32;
    for (i, d) in drivetrains.iter().enumerate() {
        if d.awake_remote { prev_mask |= 1u32 << (i as u32); }
    }
    let mut dists = [0.0_f32; MAX_CARS];
    let awake_mask = evaluate_remote_engine_lod_mask(cars_state, prev_mask, listener, cfg, &mut dists);
    let (mut backfire_hi, eng_vol) = (0u32, (cfg.engine_volume * cfg.master_volume).clamp(0.0, 2.0));

    for i in 0..MAX_CARS {
        let (st, out, primary) = (&mut drivetrains[i], &mut out_cars[i], i == active_car);
        if i >= num_cars {
            st.awake_remote = false;
            st.dormant = !primary;
            *out = CarAcousticLoopPod::default();
            continue;
        }
        let (car, ctrl, demoed) = (&cars_state[i], &controls[i], cars_state[i].is_demoed > 0.0);
        let awk_rem = (awake_mask & (1u32 << (i as u32))) != 0;
        st.awake_remote = awk_rem;
        let dormant = !primary && (!is_audible || demoed || !awk_rem);
        st.dormant = dormant;

        let fwd = car.vel[0] * car.forward[0] + car.vel[1] * car.forward[1] + car.vel[2] * car.forward[2];
        let raw_spd = (car.vel[0] * car.vel[0] + car.vel[1] * car.vel[1] + car.vel[2] * car.vel[2]).sqrt();
        if st.was_demoed && !demoed { st.reset_to_zero_speed_state(idle); }
        st.was_demoed = demoed;

        if dormant || demoed {
            st.prev_forward_speed_uu = fwd;
            st.smoothed_output_gain = 0.0;
            *out = CarAcousticLoopPod {
                engine_rpm: idle, engine_pitch: 1.0, filter_cutoff_hz: 900.0,
                lower_slice_rate: 1.0, upper_slice_rate: 1.0, boost_pitch: 1.0, doppler_pitch: 1.0,
                distance_uu: dists[i],
                packed_flags: u32::from(!demoed) | (u32::from(dormant) << 1) | (u32::from(primary) << 2),
                ..CarAcousticLoopPod::default()
            };
            continue;
        }

        let grounded = car.is_on_ground >= 0.5
            || car.wheels[0].has_contact >= 0.5 || car.wheels[1].has_contact >= 0.5
            || car.wheels[2].has_contact >= 0.5 || car.wheels[3].has_contact >= 0.5;
        let boost = car.is_boosting >= 0.5 || (ctrl.boost >= 0.5 && car.boost > 0.001);
        let (thr_in, str_in, hb_in) = if primary || ctrl.throttle.abs() > 1e-3 || ctrl.steer.abs() > 1e-3 || ctrl.handbrake >= 0.5 {
            (ctrl.throttle, ctrl.steer, ctrl.handbrake >= 0.5)
        } else {
            let df = fwd - st.prev_forward_speed_uu;
            let thr = if boost { 1.0 } else if df.abs() > 1.5 { if df > 0.0 { 1.0 } else { -1.0 } } else { 0.0 };
            (thr, (car.wheels[0].steer_angle.abs() / 0.12).min(1.0), false)
        };
        let up_z = if car.up[2].is_finite() { car.up[2] } else { 1.0 };

        if st.step_powertrain(tuning, raw_spd, fwd, thr_in, str_in, hb_in, boost, grounded, up_z, dt) && i < 4 {
            backfire_hi |= 1u32 << (edge_mask_bits::CAR_BACKFIRE_POP_BASE + (i as u32));
        }

        let stat_neut = st.is_on_ground && st.drive_direction == 0 && st.smooth_throttle < 0.01 && st.current_rpm <= idle + 15.0;
        let g = evaluate_granular_synthesis(
            tuning, &cfg.slice_rpms, &cfg.slice_freqs_hz, &cfg.slice_auto_norm_db,
            st.current_rpm, st.smooth_throttle, st.is_under_strain, stat_neut, primary,
        );
        let st_mult = if st.is_under_strain { 1.08 } else { 1.0 };
        let self_mult = if primary { cfg.vehicle_self_volume.clamp(0.0, 2.0) } else { 1.0 };
        let tgt_gain = (eng_vol * self_mult * 0.42 * st_mult).min(1.2);
        st.smoothed_output_gain += (tgt_gain - st.smoothed_output_gain) * (1.0 - (-dt / 0.025).exp());

        let rpm_norm = ((st.current_rpm - idle) / (red - idle)).clamp(0.0, 1.0);
        let packed_flags = 1u32
            | (u32::from(dormant) << 1) | (u32::from(primary) << 2)
            | (u32::from(st.is_under_strain) << 3) | (u32::from(st.is_in_overdrive) << 4)
            | (u32::from(st.rev_limiter_timer > 0.0) << 5)
            | (((st.current_gear.clamp(0, 255) as u32) & 0xFF) << 8)
            | (((g.lower_idx as u32) & 0xFF) << 16) | (((g.upper_idx as u32) & 0xFF) << 24);

        *out = CarAcousticLoopPod {
            engine_rpm: st.current_rpm, engine_rpm_norm: rpm_norm, engine_load: st.smooth_throttle,
            engine_gain: st.smoothed_output_gain, engine_pitch: g.idle_pitch, filter_cutoff_hz: g.cutoff_hz,
            idle_gain: g.idle_gain, lower_slice_gain: g.lower_gain, upper_slice_gain: g.upper_gain,
            lower_slice_rate: g.lower_rate, upper_slice_rate: g.upper_rate,
            boost_gain: if boost { cfg.boost_loop_volume * cfg.boost_volume * cfg.master_volume } else { 0.0 },
            boost_pitch: 1.0,
            supersonic_gain: if car.is_supersonic >= 0.5 { cfg.supersonic_loop_volume * cfg.master_volume } else { 0.0 },
            skid_gain: if grounded && hb_in { (fwd.abs() / 1400.0).clamp(0.0, 1.0) } else { 0.0 },
            air_roll_gain: if !grounded { (ctrl.roll.abs() * 0.5).clamp(0.0, 1.0) } else { 0.0 },
            spatial_pan: 0.0, doppler_pitch: 1.0, distance_uu: dists[i], packed_flags,
        };
    }
    (awake_mask, backfire_hi)
}





