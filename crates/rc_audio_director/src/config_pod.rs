//! Acoustic tuning configuration PODs (`#[repr(C)]`) synchronized from TypeScript UI stores.
//!
//! Consolidates `audioConfig.ts`, `engineAudioConfig.ts`, `spatialAttenuationProfiles.ts`,
//! and `spatialAudioConfig.ts` into flat C-ABI structs so Tier 2 worker branches can run
//! 100% of drivetrain kinematics, spatial attenuation, and incident modulation inside WASM.

use crate::pod_types::{AUDIO_ATTENUATION_CATEGORY_COUNT, MAX_ENGINE_GRANULAR_SLICES};

/// Per-category distance attenuation curve profile (`8 * 4 = 32` bytes).
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AttenuationProfilePod {
    pub min_distance_uu: f32,
    pub max_distance_uu: f32,
    pub min_gain_floor: f32,
    /// `0` = linear, `1` = smoothstep, `2` = power/exponential, `3` = bezier, `4` = inverse.
    pub curve_type: u32,
    pub curve_exponent: f32,
    pub bezier_x1_y1_x2_y2: [f32; 4],
    /// `bit 0`: `cull_beyond_max`.
    pub flags: u32,
}

impl Default for AttenuationProfilePod {
    fn default() -> Self {
        Self {
            min_distance_uu: 500.0,
            max_distance_uu: 10000.0,
            min_gain_floor: 0.0,
            curve_type: 1, // smoothstep
            curve_exponent: 1.0,
            bezier_x1_y1_x2_y2: [0.25, 0.1, 0.25, 1.0],
            flags: 1,
        }
    }
}

/// Turtle Modem powertrain & granular synthesizer tuning parameters (`32 * 4 = 128` bytes).
#[repr(C)]
#[derive(Clone, Copy)]
pub struct EngineTuningConfigPod {
    pub idle_rpm: f32,
    pub redline_rpm: f32,
    pub rpm_drop_rate: f32,
    pub base_accel_rise_rate: f32,
    pub boost_overdrive_multiplier: f32,
    pub reverse_accel_rise_rate: f32,
    pub rev_limit_cutoff_rpm: f32,
    pub rev_limiter_bounce_drop: f32,
    pub rev_limiter_bounce_duration: f32,
    pub upshift_landing_rpm: f32,
    pub downshift_trigger_rpm: f32,
    pub downshift_rev_match_peak_rpm: f32,
    pub gear_decay_factor_base: f32,
    pub reverse_gear_decay_factor_base: f32,
    pub flywheel_agility: f32,
    pub backfire_trigger_rpm: f32,
    pub backfire_rpm_drop: f32,
    pub backfire_cooldown_sec: f32,
    pub backfire_volume: f32,
    pub gain_smoothing_time_ms: f32,
    pub airborne_rev_quota_duration_sec: f32,
    pub max_throttle_speed_uu: f32,
    pub supersonic_speed_uu: f32,
    pub shift_lock_steer_threshold: f32,
    pub wall_decel_dip_threshold_uu: f32,
    pub zero_speed_threshold_uu: f32,
    pub idle_volume: f32,
    pub slice_rms_auto_norm_strength: f32,
    pub freq_tilt_db: f32,
    pub eq_band_gains_db: [f32; 5],
    pub max_gears: i32,
    /// Packed boolean flags (`bit 0`: auto_upshift, `bit 1`: auto_downshift, `bit 2`: airborne_auto_neutral,
    /// `bit 3`: velocity_coupled_gears, `bit 4`: supersonic_turn_rev_bounce, `bit 5`: zero_speed_reset,
    /// `bit 6`: engine_eq_enabled, `bit 7`: crossfade_equal_sine, `bit 8`: decel_reverse_filter,
    /// `bit 9`: instant_speed_match_landing).
    pub flags: u32,
}

impl Default for EngineTuningConfigPod {
    fn default() -> Self {
        Self {
            idle_rpm: 900.0,
            redline_rpm: 6000.0,
            rpm_drop_rate: 1400.0,
            base_accel_rise_rate: 1000.0,
            boost_overdrive_multiplier: 1.85,
            reverse_accel_rise_rate: 220.0,
            rev_limit_cutoff_rpm: 5980.0,
            rev_limiter_bounce_drop: 200.0,
            rev_limiter_bounce_duration: 0.02,
            upshift_landing_rpm: 3300.0,
            downshift_trigger_rpm: 2400.0,
            downshift_rev_match_peak_rpm: 4600.0,
            gear_decay_factor_base: 0.72,
            reverse_gear_decay_factor_base: 0.52,
            flywheel_agility: 18.0,
            backfire_trigger_rpm: 4500.0,
            backfire_rpm_drop: 1650.0,
            backfire_cooldown_sec: 0.65,
            backfire_volume: 0.55,
            gain_smoothing_time_ms: 15.0,
            airborne_rev_quota_duration_sec: 1.25,
            max_throttle_speed_uu: 1405.0,
            supersonic_speed_uu: 2200.0,
            shift_lock_steer_threshold: 0.18,
            wall_decel_dip_threshold_uu: -80.0,
            zero_speed_threshold_uu: 18.0,
            idle_volume: 1.0,
            slice_rms_auto_norm_strength: 0.85,
            freq_tilt_db: 1.5,
            eq_band_gains_db: [0.0, -1.0, 0.5, 2.0, 1.5],
            max_gears: 0,
            flags: 0x03FF,
        }
    }
}

/// Master & per-layer volume / threshold / cooldown configuration (`28 * 4 = 112` bytes).
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AudioDirectorConfigPod {
    pub master_volume: f32,
    pub engine_volume: f32,
    pub vehicle_self_volume: f32,
    pub boost_volume: f32,
    pub boost_start_volume: f32,
    pub boost_loop_volume: f32,
    pub boost_release_volume: f32,
    pub boost_collect_volume: f32,
    pub supersonic_enter_volume: f32,
    pub supersonic_loop_volume: f32,
    pub jump_volume: f32,
    pub double_jump_volume: f32,
    pub dodge_volume: f32,
    pub flip_reset_volume: f32,
    pub wheel_impact_volume: f32,
    pub ball_collision_volume: f32,
    pub car_ball_hit_volume: f32,
    pub car_car_collision_volume: f32,
    pub car_demo_volume: f32,
    pub ball_floor_hit_volume: f32,
    pub ball_net_hit_volume: f32,
    pub ball_ramp_hit_volume: f32,
    pub goalpost_hit_volume: f32,
    pub goalpost_small_hit_volume: f32,
    pub goal_scored_volume: f32,
    pub ball_rolling_volume: f32,
    pub ball_flying_volume: f32,
    pub arena_acoustic_scale: f32,
    pub car_ball_hit_impulse_threshold: f32,
    pub ball_ground_hit_threshold: f32,
    pub ball_wall_hit_threshold: f32,
    pub goalpost_hit_threshold: f32,
    pub car_ball_hit_cooldown_ms: f32,
    pub incident_cooldown_ms: f32,
    pub goalpost_hit_cooldown_ms: f32,
    pub doppler_scale: f32,
    pub engine_tuning: EngineTuningConfigPod,
    pub attenuation_profiles: [AttenuationProfilePod; AUDIO_ATTENUATION_CATEGORY_COUNT],
    pub slice_rpms: [f32; MAX_ENGINE_GRANULAR_SLICES],
    pub slice_freqs_hz: [f32; MAX_ENGINE_GRANULAR_SLICES],
    pub slice_auto_norm_db: [f32; MAX_ENGINE_GRANULAR_SLICES],
}

impl Default for AudioDirectorConfigPod {
    fn default() -> Self {
        let mut slice_rpms = [0.0; MAX_ENGINE_GRANULAR_SLICES];
        let mut slice_freqs_hz = [0.0; MAX_ENGINE_GRANULAR_SLICES];
        for i in 0..MAX_ENGINE_GRANULAR_SLICES {
            let t = (i as f32) / ((MAX_ENGINE_GRANULAR_SLICES - 1) as f32);
            slice_rpms[i] = 900.0 + t * 5100.0;
            slice_freqs_hz[i] = 37.65 + t * (74.65 - 37.65);
        }
        Self {
            master_volume: 1.0,
            engine_volume: 1.0,
            vehicle_self_volume: 1.0,
            boost_volume: 1.0,
            boost_start_volume: 1.0,
            boost_loop_volume: 1.0,
            boost_release_volume: 1.0,
            boost_collect_volume: 1.0,
            supersonic_enter_volume: 1.0,
            supersonic_loop_volume: 1.0,
            jump_volume: 1.0,
            double_jump_volume: 1.0,
            dodge_volume: 1.0,
            flip_reset_volume: 1.0,
            wheel_impact_volume: 1.0,
            ball_collision_volume: 1.0,
            car_ball_hit_volume: 1.0,
            car_car_collision_volume: 1.0,
            car_demo_volume: 1.0,
            ball_floor_hit_volume: 1.0,
            ball_net_hit_volume: 1.0,
            ball_ramp_hit_volume: 1.0,
            goalpost_hit_volume: 1.0,
            goalpost_small_hit_volume: 1.0,
            goal_scored_volume: 1.0,
            ball_rolling_volume: 1.0,
            ball_flying_volume: 1.0,
            arena_acoustic_scale: 1.0,
            car_ball_hit_impulse_threshold: 80.0,
            ball_ground_hit_threshold: 140.0,
            ball_wall_hit_threshold: 140.0,
            goalpost_hit_threshold: 160.0,
            car_ball_hit_cooldown_ms: 35.0,
            incident_cooldown_ms: 40.0,
            goalpost_hit_cooldown_ms: 60.0,
            doppler_scale: 1.0,
            engine_tuning: EngineTuningConfigPod::default(),
            attenuation_profiles: [AttenuationProfilePod::default();
                AUDIO_ATTENUATION_CATEGORY_COUNT],
            slice_rpms,
            slice_freqs_hz,
            slice_auto_norm_db: [0.0; MAX_ENGINE_GRANULAR_SLICES],
        }
    }
}

const _: () = {
    assert!(core::mem::size_of::<AttenuationProfilePod>() == 40);
    assert!(core::mem::size_of::<EngineTuningConfigPod>() == 144);
    assert!(core::mem::size_of::<AudioDirectorConfigPod>() == 1408);
};

