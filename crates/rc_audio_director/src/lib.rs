//! `rc_audio_director`: Deterministic WASM acoustic cue bitmask, impact cooldown filter,
//! and 8-car continuous loop synthesizer (`AudioFrameCuePod`) for WebAudio playback.

use rc_physics_sim::layout::MAX_CARS;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CarAcousticLoopPod {
    pub engine_rpm_norm: f32,
    pub engine_load: f32,
    pub engine_gain: f32,
    pub engine_pitch: f32,
    pub boost_gain: f32,
    pub boost_pitch: f32,
    pub skid_gain: f32,
    pub air_roll_gain: f32,
}

/// Fixed-layout per-frame WebAudio cue table read zero-copy by TypeScript `AudioStage`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct AudioFrameCuePod {
    pub one_shot_edge_mask_lo: u32,
    pub one_shot_edge_mask_hi: u32,
    pub primary_impact_gain: f32,
    pub primary_impact_pitch: f32,
    pub primary_impact_pos: [f32; 3],
    pub ball_roll_gain: f32,
    pub cars: [CarAcousticLoopPod; MAX_CARS],
}
