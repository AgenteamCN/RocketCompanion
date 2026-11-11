//! Zero-copy C-ABI POD structures (`#[repr(C)]`) for `rc_audio_director`.
//!
//! All structs in this module are 4-byte (`f32`/`u32`) aligned with zero implicit padding,
//! allowing TypeScript `AudioStage` to bind `Float32Array` and `Uint32Array` views directly
//! over WebAssembly linear memory without per-frame allocations or serialization.

use rc_physics_sim::layout::MAX_CARS;

/// Maximum number of discrete spatial one-shot cues emitted in a single audio frame.
pub const MAX_AUDIO_ONE_SHOT_SLOTS: usize = 8;

/// Number of acoustic attenuation categories matching `AUDIO_ATTENUATION_CATEGORIES`.
pub const AUDIO_ATTENUATION_CATEGORY_COUNT: usize = 16;

/// Maximum number of audible remote vehicle engine synths active simultaneously (Top-K LOD).
pub const MAX_AUDIBLE_REMOTE_ENGINES: usize = 3;

/// Number of harmonic granular slices in the full-resolution engine audio pack (`turtle_modem`).
pub const MAX_ENGINE_GRANULAR_SLICES: usize = 40;

/// Bit positions for `AudioFrameCuePod::one_shot_edge_mask_lo` / `one_shot_edge_mask_hi`.
pub mod edge_mask_bits {
    pub const CAR_JUMP_BASE: u32 = 0; // bits 0..7 (per car 0..7)
    pub const CAR_DOUBLE_JUMP_BASE: u32 = 8; // bits 8..15
    pub const CAR_DODGE_BASE: u32 = 16; // bits 16..23
    pub const CAR_BOOST_START_BASE: u32 = 24; // bits 24..31

    // Upper 32 bits (`one_shot_edge_mask_hi`, bit index 0..31 within hi word):
    pub const CAR_BOOST_STOP_BASE: u32 = 0; // hi bits 0..7
    pub const CAR_SUPERSONIC_ENTER_BASE: u32 = 8; // hi bits 8..15
    pub const CAR_WHEEL_LANDING_BASE: u32 = 16; // hi bits 16..23
    pub const CAR_BACKFIRE_POP_BASE: u32 = 24; // hi bits 24..27 (or entity spawn / flip reset)
    pub const BALL_FLOOR_HIT_BIT: u32 = 28;
    pub const BALL_WALL_NET_HIT_BIT: u32 = 29;
    pub const BALL_GOALPOST_LARGE_BIT: u32 = 30;
    pub const GOAL_EXPLOSION_BIT: u32 = 31;
}

/// Per-vehicle continuous powertrain, granular synthesis, and loop telemetry (`20 * 4 = 80` bytes).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CarAcousticLoopPod {
    /// Current flywheel RPM (`idleRPM .. redlineRPM`, e.g. `900.0 .. 6000.0`).
    pub engine_rpm: f32,
    /// Normalized engine RPM in `[0.0, 1.0]`.
    pub engine_rpm_norm: f32,
    /// Smoothed throttle/strain load in `[0.0, 1.0]`.
    pub engine_load: f32,
    /// Final smoothed master gain for this vehicle's engine synth (`0.0` when dormant/culled).
    pub engine_gain: f32,
    /// Playback rate ratio for the idle loop (`current_rpm / idle_rpm`).
    pub engine_pitch: f32,
    /// Biquad lowpass filter cutoff frequency in Hz (`800.0 .. 20000.0`).
    pub filter_cutoff_hz: f32,
    /// Effective idle loop gain weight (`[0.0, 2.0]`).
    pub idle_gain: f32,
    /// Crossfade weight for the lower harmonic slice (`[0.0, 1.0]`, eq-compensated).
    pub lower_slice_gain: f32,
    /// Crossfade weight for the upper harmonic slice (`[0.0, 1.0]`, eq-compensated).
    pub upper_slice_gain: f32,
    /// Playback rate for the lower harmonic slice (`target_freq / lower_meta_freq`).
    pub lower_slice_rate: f32,
    /// Playback rate for the upper harmonic slice (`target_freq / upper_meta_freq`).
    pub upper_slice_rate: f32,
    /// Smoothed continuous boost loop gain (`[0.0, 5.0]`, distance-attenuated).
    pub boost_gain: f32,
    /// Boost loop playback pitch multiplier (`1.0` nominal, Doppler-shifted for remote cars).
    pub boost_pitch: f32,
    /// Smoothed continuous supersonic wind/trail loop gain (`[0.0, 5.0]`).
    pub supersonic_gain: f32,
    /// Tire skid / powerslide loop gain (`[0.0, 1.0]`).
    pub skid_gain: f32,
    /// Aerial roll / air-rush continuous gain (`[0.0, 1.0]`).
    pub air_roll_gain: f32,
    /// Stereo pan in `[-1.0, 1.0]` relative to listener camera right vector.
    pub spatial_pan: f32,
    /// Doppler pitch shift factor in `[0.75, 1.35]` relative to listener velocity.
    pub doppler_pitch: f32,
    /// Distance in Unreal Units (`UU`) from the active audio listener (`0.0` for primary car).
    pub distance_uu: f32,
    /// Packed state bitflags (`bit 0`: active, `bit 1`: dormant, `bit 2`: primary, `bit 3`: strain,
    /// `bit 4`: overdrive, `bit 5`: rev_limiting, `bits 8..15`: gear, `bits 16..23`: lower_slice_idx,
    /// `bits 24..31`: upper_slice_idx).
    pub packed_flags: u32,
}

/// Continuous ball rolling and aerial downward-fall loop telemetry (`8 * 4 = 32` bytes).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BallAcousticLoopPod {
    /// World position mapped to WebAudio coordinates (`x: width, y: up, z: length` in meters).
    pub audio_pos_meters: [f32; 3],
    /// Distance in Unreal Units from the active listener.
    pub distance_uu: f32,
    /// Smoothed surface rolling loop gain (`[0.0, 5.0]`).
    pub rolling_gain: f32,
    /// Smoothed surface rolling playback rate (`[0.85, 1.20]`).
    pub rolling_rate: f32,
    /// Smoothed downward aerial flying loop gain (`[0.0, 5.0]`).
    pub flying_gain: f32,
    /// Smoothed downward aerial flying playback rate (`[0.90, 1.20]`).
    pub flying_rate: f32,
}

/// Pre-calibrated discrete 3D/2D one-shot voice command (`12 * 4 = 48` bytes).
/// Ready for direct consumption by WebAudio `AudioSlotPool` or `VehicleAudioEmitter`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct AudioOneShotSlotPod {
    /// Incident or signal event code (`0x01` CarBallHit .. `0x12` WheelImpact, `0` = empty).
    pub event_type: u32,
    /// Sub-type / surface taxonomy tag / action sub-type (`SURFACE_SUBTYPES`, `CAR_ACTION_SUBTYPES`).
    pub sub_type: u32,
    /// Source vehicle slot (`0..7`) or `0xFFFF` for world/ball-only events.
    pub car_index: u32,
    /// Pre-selected non-repeating variation index + priority (`(priority & 0xFF) | ((variant_idx & 0xFF) << 8) | ((is_2d_stereo as u32) << 16)`).
    pub priority_and_variant: u32,
    /// Final pre-attenuated linear volume gain (`[0.0, 5.0]`, includes master/layer/distance gain).
    pub final_gain: f32,
    /// Calibrated playback rate / pitch contour (`[0.85, 1.70]`).
    pub playback_rate: f32,
    /// Dynamic propagation radius scale (`[0.65, 1.35]`).
    pub distance_radius_scale: f32,
    /// Stereo pan (`[-1.0, 1.0]`) when `is_2d_stereo` is set, or normalized intensity `[0.0, 1.0]`.
    pub pan_or_intensity: f32,
    /// Emission position in WebAudio meters (`x: width, y: up, z: length`).
    pub audio_pos_meters: [f32; 3],
    /// Attenuation category index (`0..15` into `AUDIO_ATTENUATION_CATEGORIES`).
    pub category_index: u32,
}

/// Stadium reverb & BGM/Anthem bus blend state (`4 * 4 = 16` bytes).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct StadiumBusBlendPod {
    /// Current non-linear Cubic-Bezier spatial blend `[0.0, 1.0]` (`0` = dry studio, `1` = stadium PA).
    pub spatial_blend: f32,
    /// High-pass filter frequency in Hz (`20.0 .. hpf_max_freq`).
    pub hpf_freq_hz: f32,
    /// Low-pass filter frequency in Hz (`lpf_min_freq .. 20000.0`).
    pub lpf_freq_hz: f32,
    /// Convolver wet path gain (`[0.0, 2.0]`).
    pub wet_gain: f32,
}

/// Fixed-layout per-frame WebAudio cue table read zero-copy by TypeScript `AudioStage`.
/// Total size: `40 + 32 + 16 + (8 * 80) + (8 * 48) = 1112` bytes (`278` words).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct AudioFrameCuePod {
    /// Lower 32 bits of the 64-bit edge trigger bitmask (per-car jump/double-jump/dodge/boost-start).
    pub one_shot_edge_mask_lo: u32,
    /// Upper 32 bits of the 64-bit edge trigger bitmask (boost-stop/supersonic/landing/impacts).
    pub one_shot_edge_mask_hi: u32,
    /// Number of valid entries in `one_shots` (`0 .. MAX_AUDIO_ONE_SHOT_SLOTS`).
    pub one_shot_count: u32,
    /// Bitmask of remote cars (`0..7`) currently awake in the Top-3 LOD budget.
    pub awake_remote_car_mask: u32,
    /// Highest-priority impact gain in this frame (fast-path telemetry / HUDreactive pulse).
    pub primary_impact_gain: f32,
    /// Highest-priority impact pitch in this frame.
    pub primary_impact_pitch: f32,
    /// Highest-priority impact world position (`[x, y, z]` in UU).
    pub primary_impact_pos: [f32; 3],
    /// Legacy alias for `ball.rolling_gain` preserved for zero-breakage telemetry readers.
    pub ball_roll_gain: f32,
    /// Continuous ball rolling and aerial flying loop state.
    pub ball: BallAcousticLoopPod,
    /// Stadium PA reverb & filter bus modulation state.
    pub stadium_bus: StadiumBusBlendPod,
    /// 8-car continuous engine, boost, supersonic, and skid synthesis state.
    pub cars: [CarAcousticLoopPod; MAX_CARS],
    /// Up to 8 discrete pre-modulated one-shot events emitted during this frame.
    pub one_shots: [AudioOneShotSlotPod; MAX_AUDIO_ONE_SHOT_SLOTS],
}

/// Listener camera transform and frame context passed or updated per render frame (`16 * 4 = 64` bytes).
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AudioListenerStatePod {
    /// Listener world position in RocketSim Unreal Units (`x: width, y: length, z: up`).
    pub pos_uu: [f32; 3],
    /// Listener velocity in Unreal Units/s (for Doppler shift calculation).
    pub vel_uu: [f32; 3],
    /// Listener forward unit vector in WebAudio coordinates (`x, y, z`).
    pub forward_audio: [f32; 3],
    /// Listener up unit vector in WebAudio coordinates (`x, y, z`).
    pub up_audio: [f32; 3],
    /// Index of the primary player vehicle (`0..7`).
    pub active_car_index: i32,
    /// Number of active vehicles to evaluate (`0..8`).
    pub effective_num_cars: i32,
    /// Bitflags (`bit 0`: is_audible_active, `bit 1`: has_listener, `bit 2`: spatial_enabled,
    /// `bit 3`: lobby_dual_world, `bit 4`: test_car_audio_enabled, `bit 5`: mute_signals_in_replay).
    pub flags: u32,
    /// Frame delta time in seconds (`1/120 .. 1/30`).
    pub dt_sec: f32,
}

impl Default for AudioListenerStatePod {
    fn default() -> Self {
        Self {
            pos_uu: [0.0, -2500.0, 300.0],
            vel_uu: [0.0; 3],
            forward_audio: [0.0, 0.0, -1.0],
            up_audio: [0.0, 1.0, 0.0],
            active_car_index: 0,
            effective_num_cars: 1,
            flags: 0x07, // audible + has_listener + spatial_enabled
            dt_sec: 1.0 / 120.0,
        }
    }
}

const _: () = {
    assert!(core::mem::size_of::<CarAcousticLoopPod>() == 80);
    assert!(core::mem::size_of::<BallAcousticLoopPod>() == 32);
    assert!(core::mem::size_of::<AudioOneShotSlotPod>() == 48);
    assert!(core::mem::size_of::<StadiumBusBlendPod>() == 16);
    assert!(core::mem::size_of::<AudioFrameCuePod>() == 1112);
    assert!(core::mem::size_of::<AudioListenerStatePod>() == 64);
};
