//! `rc_bot_ai`: Native WASM observation builders (Botpack / Ripple / Kickoff PPO),
//! SIMD MLP/Perceiver inference, and heuristic multi-car controllers operating directly on `SimInstance`.

pub mod action_tables;
pub mod bot_director;
pub mod earl_perceiver;
pub mod heuristic_and_kickoff;
pub mod layout_and_specs;
pub mod safetensors_store;
pub mod simd_math;

pub use bot_director::BotDirector;
pub use layout_and_specs::{
    BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId, KickoffTimelineBufferPod,
    KickoffTimelineStepPod, MlpPolicyArchSpec,
};


