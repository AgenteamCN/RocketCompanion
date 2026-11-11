//! `rc_replay_codec`: High-speed WASM `.rlrc` / `.replay` binary container codec,
//! Hermite-Slerp trajectory resampler, inverse control synthesizer, and zero-copy timeline seeker.

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct ReplayStreamHeaderPod {
    pub frame_count: u32,
    pub tick_rate_hz: f32,
    pub duration_seconds: f32,
    pub active_car_mask: u32,
}
