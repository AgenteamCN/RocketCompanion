//! `rc_audio_director`: Deterministic WASM acoustic cue bitmask, impact cooldown filter,
//! and 8-car continuous loop synthesizer (`AudioFrameCuePod`) for WebAudio playback.

pub mod ball_loops;
pub mod config_pod;
pub mod director;
pub mod drivetrain_state;
pub mod incident_classifier;
pub mod incident_modulation;
pub mod pod_types;
pub mod vehicle_incident_cues;

pub use ball_loops::step_ball_acoustic_loops;
pub use config_pod::{AttenuationProfilePod, AudioDirectorConfigPod, EngineTuningConfigPod};
pub use director::AudioDirectorInstance;
pub use drivetrain_state::VehicleDrivetrainState;
pub use incident_classifier::{
    classify_ball_hit_surface, process_physics_incidents, step_vehicle_landing_impacts,
};
pub use pod_types::{
    edge_mask_bits, AudioFrameCuePod, AudioListenerStatePod, AudioOneShotSlotPod,
    BallAcousticLoopPod, CarAcousticLoopPod, StadiumBusBlendPod, AUDIO_ATTENUATION_CATEGORY_COUNT,
    MAX_AUDIBLE_REMOTE_ENGINES, MAX_AUDIO_ONE_SHOT_SLOTS, MAX_ENGINE_GRANULAR_SLICES,
};

#[cfg(test)]
mod tests {
    use rc_physics_sim::{layout::PhysicsEvent, sim_instance::SimInstance};

    use super::*;
    use crate::incident_classifier::{categories, event_codes, surface_subtypes};

    #[test]
    fn test_ball_loops_and_incident_classifier_pipeline() {
        let mut sim = SimInstance::new();
        let mut dir = AudioDirectorInstance::new();

        // Set ball rolling on floor at speed 1200 UU/s near listener
        sim.state_buffer.ball.pos = [0.0, -2400.0, 93.15];
        sim.state_buffer.ball.vel = [0.0, 1200.0, 0.0];
        sim.ball_motion_state = 1;

        // Push a CarBallHit and a BallGoalpostHit event
        sim.push_event(PhysicsEvent {
            event_type: event_codes::CAR_BALL_HIT,
            tick: 120,
            pos_x: 0.0,
            pos_y: -2400.0,
            pos_z: 100.0,
            speed: 1800.0,
            impulse: 1800.0,
            packed_ids: PhysicsEvent::pack_ids(0, 0),
            flags: 1 << 1, // supersonic
            ..Default::default()
        });
        sim.push_event(PhysicsEvent {
            event_type: event_codes::BALL_WORLD_HIT,
            tick: 120,
            pos_x: 0.0,
            pos_y: 5120.0,
            pos_z: 642.0,
            norm_z: -0.9,
            normal_rel_vel: 1600.0,
            speed: 1600.0,
            impulse: 1600.0,
            ..Default::default()
        });

        let cue_ptr = dir.step_frame(&sim, 1.0 / 120.0);
        let cue = unsafe { &*cue_ptr };

        assert!(cue.ball.rolling_gain > 0.0);
        assert!(cue.ball.rolling_rate > 0.85);
        assert_eq!(cue.one_shot_count, 2);
        assert_eq!(cue.one_shots[0].event_type, event_codes::CAR_BALL_HIT);
        assert_eq!(cue.one_shots[0].category_index, categories::CAR_BALL_HIT);
        assert_eq!(cue.one_shots[1].event_type, event_codes::BALL_GOALPOST_HIT);
        assert_eq!(cue.one_shots[1].sub_type, surface_subtypes::CROSSBAR);
        assert!(
            (cue.one_shot_edge_mask_hi & (1 << edge_mask_bits::BALL_GOALPOST_LARGE_BIT)) != 0
        );
    }

    #[test]
    fn test_surface_classification_accuracy() {
        assert_eq!(
            classify_ball_hit_surface(0.0, 0.0, 93.0, 0.0, 0.0, 1.0, false),
            surface_subtypes::FLOOR
        );
        assert_eq!(
            classify_ball_hit_surface(0.0, 0.0, 2040.0, 0.0, 0.0, -1.0, false),
            surface_subtypes::CEILING
        );
        assert_eq!(
            classify_ball_hit_surface(1200.0, 5120.0, 900.0, 0.0, -1.0, 0.0, false),
            surface_subtypes::BACKBOARD
        );
        assert_eq!(
            classify_ball_hit_surface(3500.0, 4200.0, 500.0, -0.707, -0.707, 0.0, false),
            surface_subtypes::CORNER_45
        );
    }
}
