import type React from 'react';
import {
  Activity,
  Camera,
  Crosshair,
  Film,
  PencilRuler,
  Router,
  Sliders,
  Target,
} from 'lucide-react';
import {
  BALL_TRAJECTORY_TUNER_PRESET,
  CAMERA_DETERMINISM_PRESET,
  CLOCK_PACING_TUNER_PRESET,
  DUAL_ARENA_DETERMINISM_HARNESS_PRESET,
  EVENT_STREAM_OBSERVER_PRESET,
  KICKOFF_TRAINING_TUNER_PRESET,
  NETWORK_STRESS_INJECTION_PRESET,
  REACHABILITY_TUNER_PRESET,
  REPLAY_DIRECTOR_TUNER_PRESET,
} from '../../stores/devFloatingPresets';
import type { PresetConfig } from '../../stores/floatingPresets';

export type DevIconComponent = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

export interface DevFloatingLauncherSpec {
  id: string;
  preset: PresetConfig;
  icon: DevIconComponent;
  iconColor: string;
  badge?: string;
  badgeTone?: 'sky' | 'amber' | 'emerald' | 'purple' | 'rose';
  description: string;
  hoverTooltip: string;
  section?: 'primary' | 'diagnostics';
}

export const EXPERIMENTAL_AND_DIAGNOSTIC_TUNER_SPECS: DevFloatingLauncherSpec[] = [
  {
    id: REACHABILITY_TUNER_PRESET.id,
    preset: REACHABILITY_TUNER_PRESET,
    icon: Crosshair,
    iconColor: 'text-emerald-400',
    badge: 'LUT · 3D Horn · Cross',
    badgeTone: 'emerald',
    description:
      'Ground 1s/2s/3s Isochrone LUT (Boost=0), Boost-Driven 3D Horn & Optimal Intercept 3D Cross',
    hoverTooltip:
      'Reachability & Intercept Tuner: Real-time 1.4µs WASM LUT ground reachability, boost-driven 3D spacetime interception horn, and 3D orthogonal intercept cross.',
    section: 'primary',
  },
  {
    id: BALL_TRAJECTORY_TUNER_PRESET.id,
    preset: BALL_TRAJECTORY_TUNER_PRESET,
    icon: Target,
    iconColor: 'text-amber-400',
    badge: 'WASM Incr · 3D Tube · JSON',
    badgeTone: 'amber',
    description:
      'WASM Incremental Tail Prediction (600t), Car-Ball Hit / Deviation Triggers, 3D Volumetric Shaded Tube, Spatial Depth Cues & JSON Export',
    hoverTooltip:
      'Ball Trajectory Prediction Line Tuner: Configure continuous WASM incremental tail prediction (~20-50µs/tick), deviation triggers, 3D volumetric tube shading, bounce rings, ground drop lines, and one-click JSON export.',
    section: 'primary',
  },
  {
    id: REPLAY_DIRECTOR_TUNER_PRESET.id,
    preset: REPLAY_DIRECTOR_TUNER_PRESET,
    icon: Film,
    iconColor: 'text-amber-400',
    badge: '.rcgr.gz · Preview · AutoCam',
    badgeTone: 'amber',
    description:
      'Export & import .rcgr.gz Goal Replay containers, 3D Arena preview, anomaly peak seek chips & ±15f window diagnostics',
    hoverTooltip:
      'Replay Director Camera & Slow-Mo Tuner: Export and import compressed .rcgr.gz Goal Replay containers, jump to anomaly peaks, and copy ±15-frame diagnostic windows.',
    section: 'primary',
  },
  {
    id: KICKOFF_TRAINING_TUNER_PRESET.id,
    preset: KICKOFF_TRAINING_TUNER_PRESET,
    icon: PencilRuler,
    iconColor: 'text-sky-400',
    badge: 'PPO AI',
    badgeTone: 'sky',
    description:
      'Kickoff sub-modes, realistic wait (0.25s steps), N/120 speed & W/S offset',
    hoverTooltip:
      'Kickoff Training Tuner (PPO): Floating tuner for PPO AI kickoff training parameters.',
    section: 'primary',
  },
  {
    id: EVENT_STREAM_OBSERVER_PRESET.id,
    preset: EVENT_STREAM_OBSERVER_PRESET,
    icon: Activity,
    iconColor: 'text-sky-400',
    description:
      'Physics collision observer, impulse curves & threshold visualizer',
    hoverTooltip:
      'Event Stream Observer: Real-time collision dynamics observer, impulse curves & audio threshold calibration.',
    section: 'diagnostics',
  },
  {
    id: DUAL_ARENA_DETERMINISM_HARNESS_PRESET.id,
    preset: DUAL_ARENA_DETERMINISM_HARNESS_PRESET,
    icon: Target,
    iconColor: 'text-emerald-400',
    description:
      'Bit-exact physics rollback verification & desync delta monitoring',
    hoverTooltip:
      'Dual-Arena Determinism Harness: Parallel RocketSim physics verification with live rollback desync checking.',
    section: 'diagnostics',
  },
  {
    id: CAMERA_DETERMINISM_PRESET.id,
    preset: CAMERA_DETERMINISM_PRESET,
    icon: Camera,
    iconColor: 'text-sky-400',
    badge: 'WASM vs Clean JS · 600+600f',
    badgeTone: 'sky',
    description:
      'Live toggle between Legacy WASM & Clean JS camera with 600+600f CSV auto-capture',
    hoverTooltip:
      'Camera Deterministic Harness: Side-by-side comparison between legacy camera.wasm and clean-room Clean JS camera.',
    section: 'diagnostics',
  },
  {
    id: CLOCK_PACING_TUNER_PRESET.id,
    preset: CLOCK_PACING_TUNER_PRESET,
    icon: Sliders,
    iconColor: 'text-amber-400',
    badge: 'What-If Sim · Trace JSON',
    badgeTone: 'amber',
    description:
      'Low-level STS/CSTS hysteresis, PD gains, RTT bias compensation, trace import & counterfactual What-If simulator',
    hoverTooltip:
      'Input Buffer & Clock Pacing Tuner: Tune all low-level pacing parameters, import recorded telemetry traces (.json), and inspect simulated Starvations, Hard Snaps, Rate Switches/min, and 50/50 Lead Cost.',
    section: 'diagnostics',
  },
  {
    id: NETWORK_STRESS_INJECTION_PRESET.id,
    preset: NETWORK_STRESS_INJECTION_PRESET,
    icon: Router,
    iconColor: 'text-rose-400',
    badge: 'Asymmetric ↑/↓ · 2-Car Probes',
    badgeTone: 'rose',
    description:
      'Asymmetric uplink/downlink delay, jitter, packet loss & burst drop injection + In-Arena 2-Car prediction probe lab',
    hoverTooltip:
      'Network Stress Injection: Inject asymmetric uplink/downlink latency, jitter, packet loss, and burst drops, or spawn 2-car 0G prediction probes.',
    section: 'diagnostics',
  },
];
