//! `rc_bot_ai`: Native WASM observation builders (Botpack / Ripple / Kickoff PPO),
//! SIMD MLP/Perceiver inference, and heuristic multi-car controllers operating directly on `SimInstance`.

pub mod bot_director;
pub mod heuristic_and_kickoff;
pub mod layout_and_specs;
pub mod ripple_history_and_pad_encoder;
pub mod ripple_obs_builder;
pub mod ripple_perceiver;
pub mod safetensors_store;
pub mod simd_math;

pub use bot_director::BotDirector;
pub use layout_and_specs::{
    BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId, KickoffTimelineBufferPod,
    KickoffTimelineStepPod, MlpPolicyArchSpec,
};

