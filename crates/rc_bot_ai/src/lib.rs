//! `rc_bot_ai`: Native WASM observation builders (Botpack / Ripple / Kickoff PPO),
//! SIMD MLP/Perceiver inference, and heuristic multi-car controllers operating directly on `SimInstance`.

pub mod bot_director;
pub mod heuristic_and_kickoff;
pub mod layout_and_specs;
pub mod mlp_obs_extended;
pub mod mlp_obs_standard;
pub mod safetensors_store;
pub mod sequential_mlp;
pub mod simd_math;

pub use bot_director::BotDirector;
pub use layout_and_specs::{
    BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId, KickoffTimelineBufferPod,
    KickoffTimelineStepPod, MlpPolicyArchSpec,
};


