import { USER_PRESET_WINDOWS, type PresetConfig } from './floatingPresets';
import {
  ATMOSPHERE_FX_TABS,
  BOOST_PAD_TUNER_TABS,
  DEV_ENTRY_PATHS,
  DRIFTWOODS_TUNER_TABS,
  SUBSYSTEM_ISOLATION_LAB_TABS,
  VEHICLE_GLOBAL_FX_TABS,
  VEHICLE_OFFSET_TABS,
  makeDevPreset,
} from './devFloatingPresetFactory';

// ============================================================================
// DEVELOPER-ONLY FLOATING WINDOWS (26 Total — Strictly Developer-Only)
// ============================================================================

export const DIAGNOSTIC_DUMP_PRESET: PresetConfig = makeDevPreset({
  id: 'diagnostic-dump',
  title: 'Export Diagnostic Dump',
  category: 'DiagnosticDump',
  summary: 'Live Client Replay, Reconcile & Pacing Telemetry, and Server Replay buffer gauges + one-click .zip dump.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'DiagnosticDumpFloatingWindow',
});

export const STATIC_TRAINING_BALL_CAM_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'static-training-ball-cam-tuner',
  title: 'Static Training Ball Camera & Opacity Tuner',
  category: 'TrainingBallCam',
  width: 460,
  summary: 'Relative ball camera (Distance, Height, Angle, Lateral Offset) and Edit-Mode 70% Ball Opacity override.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'StaticTrainingBallCamTunerFloatingWindow',
});

export const NAME_TAG_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'name-tag-tuner',
  title: 'Multiplayer Name Tag Tuner',
  category: 'NameTagTuner',
  height: 620,
  minWidth: 460,
  autoFitHeight: true,
  summary: '208x54 horizontal pill name cards, 4 boost progress modes, ball occlusion, and 6-car kickoff arena.',
  menuEntryPath: DEV_ENTRY_PATHS.CALIBRATED_PRESETS,
  component: 'NameTagTunerFloatingWindow',
});

export const GOAL_VOLUME_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'goal-volume-tuner',
  title: 'Goal Volume Hitbox Active Tuner',
  category: 'GoalVolumeTuner',
  width: 470,
  summary: 'Goal Volume Hitbox 3D wireframe overlay, Standard & Throwback AABB calibration & JSON export.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'GoalVolumeTunerFloatingWindow',
});

export const REPLAY_DIRECTOR_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'replay-director-tuner',
  title: 'Replay Director Camera & Slow-Mo Tuner',
  category: 'ReplayDirector',
  width: 485,
  height: 640,
  summary: '.rcgr.gz Goal Replay container export/import, 3D Arena preview, anomaly peak seek chips & +-15f window.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'ReplayDirectorTunerFloatingWindow',
});

export const REACHABILITY_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'reachability-tuner',
  title: 'Reachability & Intercept Tuner',
  category: 'Reachability',
  width: 470,
  height: 600,
  summary: 'Ground 1s/2s/3s Isochrone LUT (Boost=0), Boost-Driven 3D Horn & Optimal Intercept 3D Cross.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'ReachabilityTunerFloatingWindow',
});

export const BALL_TRAJECTORY_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'ball-trajectory-tuner',
  title: 'Ball Trajectory Prediction Line Tuner',
  category: 'BallTrajectory',
  height: 640,
  minHeight: 220,
  summary: 'WASM Incremental Tail Prediction (600t), Car-Ball Hit / Deviation Triggers, 3D Volumetric Shaded Tube, Spatial Depth Cues & JSON Export.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'BallTrajectoryTunerFloatingWindow',
});

export const VEHICLE_MODEL_OFFSET_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'vehicle-model-offset-tuner',
  title: 'Vehicle Model & Offset Tuner',
  category: 'VehicleOffsetTuner',
  width: 540,
  minWidth: 340,
  height: 620,
  summary: 'Per-vehicle Hitbox & Align, Custom GLB Import, Wheel Hub Anchors & Dual Boost Exhaust Nozzle Offsets.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'VehicleModelOffsetTunerFloatingWindow',
  tabs: VEHICLE_OFFSET_TABS,
});

export const VEHICLE_GLOBAL_FX_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'vehicle-global-fx-tuner',
  title: 'Vehicle Global Surfaces & FX Tuner',
  category: 'VehicleGlobalFx',
  height: 620,
  summary: 'Universal Surfaces & Paint, Head/Brake Lamps, 3-Face Solid Cylinder Wheels & Boost FX.',
  menuEntryPath: DEV_ENTRY_PATHS.CALIBRATED_PRESETS,
  component: 'VehicleGlobalFxTunerFloatingWindow',
  tabs: VEHICLE_GLOBAL_FX_TABS,
});

export const EXPERIMENTAL_MULTI_BOTS_PRESET: PresetConfig = makeDevPreset({
  id: 'experimental-multi-bots',
  title: 'Experimental Multiple Bots Mode',
  category: 'ExperimentalBots',
  width: 490,
  height: 620,
  summary: 'Live floating controller for up to 3v3 Native SafeTensors Nexto/Necto POV switching & inference telemetry.',
  menuEntryPath: DEV_ENTRY_PATHS.SANDBOXES,
  component: 'ExperimentalMultiBotsFloatingWindow',
});

export const EXPERIMENTAL_BOT_PACK_PRESET: PresetConfig = makeDevPreset({
  id: 'experimental-bot-pack',
  title: 'Experimental Bot Pack #9700488',
  category: 'ExperimentalBots',
  width: 490,
  height: 620,
  summary: 'Live floating controller for Experimental Bot Pack #9700488 (8 native models: Chronos, Dice, Ducky, Fury, Galactus, Kira, Rain, Ripple v1.1).',
  menuEntryPath: DEV_ENTRY_PATHS.SANDBOXES,
  component: 'ExperimentalBotPackFloatingWindow',
});

export const ATMOSPHERE_FX_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'atmosphere-fx-tuner',
  title: 'Atmosphere & FX Tuner',
  category: 'AtmosphereFx',
  summary: 'Wall & Pulse (Cubic-Bezier Fade-Out Curve), Single-Sun Sharp Shadows, Full-Sphere Skybox & 70% Ball.',
  menuEntryPath: DEV_ENTRY_PATHS.CALIBRATED_PRESETS,
  component: 'AtmosphereFxTunerFloatingWindow',
  tabs: ATMOSPHERE_FX_TABS,
});

export const SUBSYSTEM_ISOLATION_LAB_PRESET: PresetConfig = makeDevPreset({
  id: 'subsystem-isolation-lab',
  title: 'Subsystem Isolation & MVP Lab',
  category: 'DeveloperLab',
  width: 470,
  height: 560,
  summary: '7 isolated test benches: Probes, Multi-World Ghost, State Replay, 90s Match, Goal Replay, Kickoff Duel & Demolish Respawn.',
  menuEntryPath: DEV_ENTRY_PATHS.SANDBOXES,
  component: 'SubsystemIsolationLabFloatingWindow',
  tabs: SUBSYSTEM_ISOLATION_LAB_TABS,
});

export const KICKOFF_TRAINING_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'kickoff-training-tuner',
  title: 'Kickoff Training Tuner (PPO)',
  category: 'Training',
  width: 460,
  height: 595,
  summary: 'Kickoff sub-modes, realistic wait (0.25s steps), N/120 speed & W/S rhythm overlay offset.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'KickoffTrainingTunerFloatingWindow',
});

export const EVENT_STREAM_OBSERVER_PRESET: PresetConfig = makeDevPreset({
  id: 'event-stream-observer',
  title: 'Event Stream Observer',
  category: 'Observer',
  width: 460,
  height: 420,
  summary: 'Real-time physics collision observer, impulse scatter chart & audio threshold visualizer.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'EventStreamObserverFloatingWindow',
});

export const DUAL_ARENA_DETERMINISM_HARNESS_PRESET: PresetConfig = makeDevPreset({
  id: 'dual-arena-determinism-harness',
  title: 'Dual-Arena Determinism Harness',
  category: 'Determinism',
  width: 440,
  height: 420,
  summary: 'Bit-exact parallel RocketSim physics rollback verification & desync delta monitoring.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'DualArenaDeterminismHarnessFloatingWindow',
});

export const CAMERA_DETERMINISM_PRESET: PresetConfig = makeDevPreset({
  id: 'camera-determinism',
  title: 'Camera Deterministic Harness',
  category: 'CameraDeterminism',
  width: 460,
  height: 460,
  summary: 'Side-by-side comparison between Legacy WASM & Clean JS camera with 600+600f CSV auto-capture.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'CameraDeterminismFloatingWindow',
});

export const NETWORK_STRESS_INJECTION_PRESET: PresetConfig = makeDevPreset({
  id: 'network-stress-injection',
  title: 'Network Stress Injection',
  category: 'NetworkLab',
  height: 520,
  summary: 'Asymmetric uplink/downlink delay, jitter, packet loss & burst drop injection + 2-Car 0G probes.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'NetworkStressInjectionFloatingWindow',
});

export const CLOCK_PACING_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'clock-pacing-tuner',
  title: 'Input Buffer & Clock Pacing Tuner',
  category: 'PacingTuner',
  width: 580,
  height: 640,
  summary: 'Low-level STS/CSTS hysteresis, PD gains, RTT bias compensation, trace import & What-If simulator.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'ClockPacingTunerFloatingWindow',
});

export const BOOST_PAD_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'boost-pad-tuner',
  title: 'Boost Pad Visual Tuner',
  category: 'Graphics',
  width: 460,
  height: 540,
  summary: 'Upward gradient opacity, midpoint falloff curve & Big Pad floating orb geometry.',
  menuEntryPath: DEV_ENTRY_PATHS.CALIBRATED_PRESETS,
  component: 'BoostPadTunerFloatingWindow',
  tabs: BOOST_PAD_TUNER_TABS,
});

export const DRIFTWOODS_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'driftwoods-tuner',
  title: 'Driftwoods Stadium Tuner',
  category: 'Graphics',
  height: 560,
  summary: 'Ground dynamic dual-color UV mask, 8-mesh PBR palette, 0.20 Hex Shield & Lite Lambert mode.',
  menuEntryPath: DEV_ENTRY_PATHS.CALIBRATED_PRESETS,
  component: 'DriftwoodsTunerFloatingWindow',
  tabs: DRIFTWOODS_TUNER_TABS,
});

export const SPATIAL_AUDIO_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'spatial-audio-tuner',
  title: 'Spatial Audio & Anthem Tuner',
  category: 'AudioTuner',
  height: 620,
  summary: 'Stadium spatial acoustics (HPF 425Hz, LPF 3500Hz, Wet 69%, 3.0s Decay) & 2.0s directional non-linear transition curve.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'SpatialAudioTunerFloatingWindow',
});

export const ENGINE_AUDIO_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'engine-audio-tuner',
  title: 'Engine Audio Tuner (Turtle Modem)',
  category: 'AudioTuner',
  width: 500,
  height: 640,
  minHeight: 220,
  summary: 'Turtle Modem 40-slice granular REV powertrain synthesizer, RPM/gear/reverse physics, backfire pops & Entity Spawn SFX.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'EngineAudioTunerFloatingWindow',
});

export const BOTS_LOADOUT_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'bots-loadout-tuner',
  title: 'Bots Loadout Tuner',
  category: 'BotsLoadout',
  minHeight: 220,
  summary: 'Multi-select randomizable Bot Loadout pool (3 GLB models default, Metallic paint, Cartoon boost, Standard boost audio, Random TrainStation anthem).',
  menuEntryPath: DEV_ENTRY_PATHS.BOTS_LOADOUT,
  component: 'BotsLoadoutTunerFloatingWindow',
});

export const SUPERSONIC_TRAIL_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'supersonic-trail-tuner',
  title: 'Supersonic Wheel Trail Tuner',
  category: 'SupersonicTrail',
  height: 620,
  minHeight: 220,
  summary: 'Dual rear-wheel contact trail ribbons (-1t to -30t window, 3-stop White->Pink->Purple Bezier gradient, ground-hinge upright tilt & Force Active toggle).',
  menuEntryPath: DEV_ENTRY_PATHS.CALIBRATED_PRESETS,
  component: 'SupersonicTrailTunerFloatingWindow',
});

export const DEMOLISH_SHOCKWAVE_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'demolish-shockwave-tuner',
  title: 'Demolish Shockwave Active Tuner',
  category: 'DemolishShockwave',
  width: 470,
  height: 640,
  minHeight: 220,
  summary: 'Camera-facing radial shockwave ring (Outer Radius + Inner Hole % + 6-stop thermal fade), 120 FPS scrubber & 3D XYZ coordinate simulation.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'DemolishShockwaveTunerFloatingWindow',
});

export const REPLAY_TO_RCS_IMPORTER_PRESET: PresetConfig = makeDevPreset({
  id: 'replay-to-rcs-importer',
  title: 'Replay to RCS Replay Importer',
  category: 'ReplayImporter',
  width: 495,
  height: 660,
  minHeight: 220,
  summary: 'Import raw Rocket League .replay files, upsample 30Hz -> 120Hz via SLERP/Hermite, intervene with Disappear/Trajectory/Nexto/Necto, and export .rcreplay.gz.',
  menuEntryPath: DEV_ENTRY_PATHS.SANDBOXES_AND_LABS,
  component: 'ReplayToRcsImporterFloatingWindow',
});

export const KEYBOARD_INPUT_OVERLAY_TUNER_PRESET: PresetConfig = makeDevPreset({
  id: 'keyboard-input-overlay-tuner',
  title: 'Keyboard Input Overlay Tuner',
  category: 'KeyboardInputOverlayTuner',
  width: 470,
  height: 640,
  minWidth: 340,
  minHeight: 240,
  summary: 'Developer tuner for the 3x3 Keyboard Input Overlay (opacity superposition, trapezoid bevels, 3D WASD attitude arrows) and 4-way 3D Car Nose Arrows.',
  menuEntryPath: DEV_ENTRY_PATHS.ACTIVE_TUNERS,
  component: 'KeyboardInputOverlayTunerFloatingWindow',
});

export const DEV_PRESET_WINDOWS: PresetConfig[] = [
  DIAGNOSTIC_DUMP_PRESET,
  KEYBOARD_INPUT_OVERLAY_TUNER_PRESET,
  STATIC_TRAINING_BALL_CAM_TUNER_PRESET,
  NAME_TAG_TUNER_PRESET,
  GOAL_VOLUME_TUNER_PRESET,
  DEMOLISH_SHOCKWAVE_TUNER_PRESET,
  REPLAY_DIRECTOR_TUNER_PRESET,
  REACHABILITY_TUNER_PRESET,
  BALL_TRAJECTORY_TUNER_PRESET,
  VEHICLE_MODEL_OFFSET_TUNER_PRESET,
  VEHICLE_GLOBAL_FX_TUNER_PRESET,
  SUPERSONIC_TRAIL_TUNER_PRESET,
  EXPERIMENTAL_MULTI_BOTS_PRESET,
  EXPERIMENTAL_BOT_PACK_PRESET,
  ATMOSPHERE_FX_TUNER_PRESET,
  SUBSYSTEM_ISOLATION_LAB_PRESET,
  KICKOFF_TRAINING_TUNER_PRESET,
  EVENT_STREAM_OBSERVER_PRESET,
  DUAL_ARENA_DETERMINISM_HARNESS_PRESET,
  CAMERA_DETERMINISM_PRESET,
  NETWORK_STRESS_INJECTION_PRESET,
  CLOCK_PACING_TUNER_PRESET,
  BOOST_PAD_TUNER_PRESET,
  DRIFTWOODS_TUNER_PRESET,
  SPATIAL_AUDIO_TUNER_PRESET,
  ENGINE_AUDIO_TUNER_PRESET,
  BOTS_LOADOUT_TUNER_PRESET,
  REPLAY_TO_RCS_IMPORTER_PRESET,
];

export const PRESET_WINDOWS: PresetConfig[] = [
  ...USER_PRESET_WINDOWS,
  ...DEV_PRESET_WINDOWS,
];
