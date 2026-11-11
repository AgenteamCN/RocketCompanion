//! `rc_bot_ai`: Native WASM observation builders (Botpack / Ripple / Kickoff PPO),
//! SIMD MLP/Perceiver inference, and heuristic multi-car controllers operating directly on `SimInstance`.

use rc_physics_sim::layout::{CarControlsPod, MAX_CARS};

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BotBatchInferenceOutputPod {
    pub active_bot_mask: u32,
    pub controls: [CarControlsPod; MAX_CARS],
}
