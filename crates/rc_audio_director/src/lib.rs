//! `rc_audio_director`: Deterministic WASM acoustic cue bitmask, impact cooldown filter,
//! and 8-car continuous loop synthesizer (`AudioFrameCuePod`) for WebAudio playback.

pub mod config_pod;
pub mod director;
pub mod drivetrain_state;
pub mod pod_types;

pub use config_pod::{AttenuationProfilePod, AudioDirectorConfigPod, EngineTuningConfigPod};
pub use director::AudioDirectorInstance;
pub use drivetrain_state::VehicleDrivetrainState;
pub use pod_types::{
    edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod, AudioOneShotSlotPod,
    BallAcousticLoopPod, CarAcousticLoopPod, StadiumBusBlendPod, AUDIO_ATTENUATION_CATEGORY_COUNT,
    MAX_AUDIBLE_REMOTE_ENGINES, MAX_AUDIO_ONE_SHOT_SLOTS, MAX_ENGINE_GRANULAR_SLICES,
};

