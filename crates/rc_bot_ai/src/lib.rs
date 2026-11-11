//! `rc_bot_ai`: Native WASM observation builders (Botpack / Ripple / Kickoff PPO),
//! SIMD MLP/Perceiver inference, and heuristic multi-car controllers operating directly on `SimInstance`.

pub mod action_tables;
pub mod bot_director;
pub mod earl_perceiver;
pub mod heuristic_and_kickoff;
pub mod kickoff_ppo;
pub mod layout_and_specs;
pub mod mlp_obs_extended;
pub mod mlp_obs_standard;
pub mod ripple_history_and_pad_encoder;
pub mod ripple_obs_builder;
pub mod ripple_perceiver;
pub mod safetensors_store;
pub mod sequential_mlp;
pub mod simd_math;

pub use bot_director::BotDirector;
pub use layout_and_specs::{
    BotBatchInferenceOutputPod, BotCarSlotDiagnosticsPod, BotPolicyId, KickoffTimelineBufferPod,
    KickoffTimelineStepPod, MlpPolicyArchSpec,
};


