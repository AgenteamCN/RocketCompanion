/**
 * builtinBaselineScenarios.ts
 * Declarative Phase 1 baseline calibration scenarios:
 * 1. boot_and_freeplay_goal_replay:
 *    Freeplay kickoff -> boost & shot into Orange goal -> GoalExplosion celebration (150 ticks)
 *    -> automatic transition into Director Camera Goal Replay (measuring first-frame shader
 *    compilation delta & GPU render time) -> POV/Director camera switch -> replay completion.
 * 2. multiplayer_6car_loadout_stress:
 *    In-memory 3v3 authoritative server loopback with 6 cars (host + 5 virtual peers),
 *    6 distinct 3D models & hitboxes, paint finishes, boost visuals/audio -> prepare barrier
 *    -> kickoff -> 6-car 120Hz binary input & snapshot streaming -> goal scored -> 360-tick
 *    celebration -> multiplayer streamed Director Goal Replay.
 */

import { SYSTEM_CONTROL_SIGNALS, isSystemControlSignal } from '../../physics/RocketSimConstants.ts';
import { COUNTUP_REPLAY_CAPACITY_TICKS } from '../../replay/ReplayRingBuffer.ts';
import { ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO } from './autonomousOnline3v3LifecycleScenario.ts';
import {
  ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO,
  TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO,
} from './autonomousTrainingAndMatrixScenario.ts';
import { ISOLATION_LAB_AND_TUNER_SCENARIO } from './isolationLabAndTunerScenario.ts';
import {
  MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO,
  REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO,
} from './replayViewerBaselineScenario.ts';
import { REPLAY_DIRECTOR_AND_EXPORT_SCENARIO } from './replayDirectorAndExportScenario.ts';
import { RLRC_EXPORT_TO_VIEWER_BASELINE_SCENARIO } from './rlrcExportToViewerBaselineScenario.ts';
import { FREEPLAY_CHAOS_SOAK_SCENARIO } from './freeplayChaosSoakScenario.ts';
import { EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO } from './exhibitionMultiBotsLifecycleScenario.ts';
import { TRAINING_AND_KICKOFF_SCENARIO } from './trainingAndKickoffScenario.ts';
import type { ScenarioScript } from './ScenarioTypes.ts';

export const BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO: ScenarioScript = {
  id: 'boot_and_freeplay_goal_replay',
  title: 'Freeplay Goal -> Celebration -> Director Camera Replay + 60s FIFO & SYS_CTRL Baseline',
  description:
    'Validates single-engine Freeplay physics, 60s (7200 ticks) COUNTUP_FIFO ring buffer, goal explosion trigger, 150-tick celebration, transition to Director Camera Goal Replay, POV camera toggle, kickoff restoration without spontaneous jump when holding jump across replay skip, and Rewinder SYS_CTRL_STATE_ONLY -> SYS_CTRL_INTERVENE_WILL_RESUME -> SYS_CTRL_PHYSICS_RESUME transitions.',
  totalTicks: 960,
  renderStride: 15,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    const r = ctx.runtime;
    if (r?.authoritativeServer || r?.networkReconciler) {
      await r.networkManager?.sessionCoordinator?.stopOnlineServer?.({ rebindLoopback: false });
    }
    r?.modeManager?.setActiveMode?.('freeplay');
    r?.resetKickoff?.(0);
    ctx.setLocalCarControls({ throttle: 1.0, boost: true });
  },
  steps: [
    {
      tick: 1,
      description:
        'Verify Freeplay initial playing state, single local physics engine, active car 0, and 60s (7200-tick) FIFO RingBuffer',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_kickoff_initial_render',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const mode = r?.match?.state?.mode;
        const freeplayMode = r?.modeManager?.getActiveMode?.();
        const ringCap = freeplayMode?.replayRingBuffer?.capacityTicks ?? 0;
        const ringMode = freeplayMode?.replayRingBuffer?.mode ?? '';
        const isSingleEngine = !r?.authoritativeServer && !r?.networkReconciler;
        ctx.recordAssertion(
          'freeplay_initial_mode_and_phase',
          mode === 'freeplay' && phase === 'playing' && isSingleEngine,
          `mode=${mode}, phase=${phase}, isSingleEngine=${isSingleEngine}`
        );
        ctx.recordAssertion(
          'freeplay_fifo_ringbuffer_60s_capacity',
          ringCap === 7200 && COUNTUP_REPLAY_CAPACITY_TICKS === 7200 && ringMode === 'countup_fifo',
          `capacityTicks=${ringCap}, mode=${ringMode}`
        );
      },
    },
    {
      tick: 50,
      description: 'Position Car 0 and launch ball into Orange goal at high velocity',
      action: (ctx) => {
        ctx.setCarState(0, {
          pos: [0, 4350, 17.01],
          vel: [0, 2100, 0],
          angVel: [0, 0, 0],
          boost: 100,
        });
        ctx.setBallState({
          pos: [0, 4650, 95],
          vel: [0, 2800, 60],
          angVel: [0, 0, 0],
        });
      },
    },
    {
      tick: 95,
      description: 'Assert goal scored in Freeplay and GoalExplosion active',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_goal_explosion_keyframe',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const freeplayMode = r?.modeManager?.getActiveMode?.();
        const resetTicks =
          freeplayMode?.goalAndTouch?.getEffectiveGoalResetTicks?.() ??
          freeplayMode?.goalAndTouch?.goalResetTicks ??
          0;
        const goalScored = phase === 'goal' || resetTicks > 0;
        ctx.recordAssertion(
          'freeplay_goal_detected',
          goalScored,
          `phase=${phase}, goalResetTicks=${resetTicks}`
        );
        ctx.setLocalCarControls({ throttle: 0, boost: false });
      },
    },
    {
      tick: 245,
      description:
        'Assert automatic transition into Director Camera Goal Replay after 150-tick celebration',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_director_replay_entry_keyframe',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const freeplayMode = r?.modeManager?.getActiveMode?.();
        const isReplayActive = Boolean(
          freeplayMode?.isGoalReplayActive?.() || freeplayMode?.directorPreview?.isReplayActive
        );
        const isOverrideActive = Boolean(r?.isGoalReplayCameraOverrideActive?.());
        const replayCam = freeplayMode?.directorPreview?.replayCameraMode;
        ctx.recordAssertion(
          'freeplay_director_replay_active',
          phase === 'replay' && isReplayActive && isOverrideActive && replayCam === 'director',
          `phase=${phase}, isReplayActive=${isReplayActive}, override=${isOverrideActive}, camera=${replayCam}`
        );
      },
    },
    {
      tick: 320,
      description: 'Switch Goal Replay camera from Director to POV and render keyframe',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_replay_pov_camera_switch',
      action: (ctx) => {
        const freeplayMode = ctx.runtime?.modeManager?.getActiveMode?.();
        freeplayMode?.setReplayCameraMode?.('pov');
        const camMode = freeplayMode?.directorPreview?.replayCameraMode;
        ctx.recordAssertion(
          'freeplay_replay_pov_mode_set',
          camMode === 'pov',
          `replayCameraMode=${camMode}`
        );
      },
    },
    {
      tick: 380,
      description: 'Switch Goal Replay camera back to Director mode',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_replay_director_camera_restore',
      action: (ctx) => {
        const freeplayMode = ctx.runtime?.modeManager?.getActiveMode?.();
        freeplayMode?.setReplayCameraMode?.('director');
      },
    },
    {
      tick: 500,
      description: 'Hold Jump during active Goal Replay prior to skipping replay',
      action: (ctx) => {
        ctx.setLocalCarControls({ throttle: 1.0, boost: true, jump: true });
      },
    },
    {
      tick: 510,
      description:
        'Skip Goal Replay while Jump is held, verify return to Freeplay, and start Rewinder recording',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_post_replay_kickoff_restore',
      action: (ctx) => {
        const r = ctx.runtime;
        const freeplayMode = r?.modeManager?.getActiveMode?.();
        if (
          freeplayMode?.isGoalReplayActive?.() ||
          (freeplayMode?.goalAndTouch?.getEffectiveGoalResetTicks?.() ?? 0) > 0
        ) {
          freeplayMode.skipGoalReplay?.();
        }
        const phase = r?.match?.state?.phase;
        const isOverrideActive = Boolean(r?.isGoalReplayCameraOverrideActive?.());
        ctx.recordAssertion(
          'freeplay_post_replay_restored',
          phase === 'playing' && !isOverrideActive,
          `phase=${phase}, goalReplayCameraOverride=${isOverrideActive}`
        );
        freeplayMode?.rewinderController?.startNewRecording?.();
      },
    },
    {
      tick: 520,
      description:
        'Verify holding Jump across replay skip did not cause a spontaneous jump on spawn, then release Jump',
      action: (ctx) => {
        const cv = ctx.runtime?.physics?.getCarStateView?.(0);
        const didNotJump = Boolean(cv && !cv.isJumping && cv.posZ < 28);
        ctx.recordAssertion(
          'freeplay_no_spontaneous_jump_on_replay_skip_spawn',
          didNotJump,
          `isJumping=${cv?.isJumping}, posZ=${cv?.posZ?.toFixed?.(2)}`
        );
        ctx.setLocalCarControls({ throttle: 1.0, boost: true, jump: false });
      },
    },
    {
      tick: 920,
      description:
        'Exercise Rewinder SYS_CTRL_STATE_ONLY -> SYS_CTRL_INTERVENE_WILL_RESUME -> SYS_CTRL_PHYSICS_RESUME lifecycle',
      forceKeyframeRender: true,
      keyframeReason: 'freeplay_rewinder_sys_ctrl_transitions',
      action: (ctx) => {
        const r = ctx.runtime;
        const freeplayMode = r?.modeManager?.getActiveMode?.();
        const rewinder = freeplayMode?.rewinderController;
        rewinder?.stopRecording?.();
        rewinder?.seekFrame?.(60);
        const afterSeekSignal = r?.lastSystemControlSignal;
        rewinder?.resumeFromCursor?.();
        const afterInterveneSignal = r?.lastSystemControlSignal;
        rewinder?._returnToLivePlayFromScrub?.();
        const afterResumeSignal = r?.lastSystemControlSignal;

        const ringBuffer = freeplayMode?.replayRingBuffer;
        ringBuffer?.appendSignal?.(920, {
          signalType: SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY,
          frameId: 920,
          param1: 60,
          param2: 0,
        });
        const leakedSysSignals = (ringBuffer?.getFrames?.() || []).some((f: any) =>
          (f.signals || []).some((s: any) => isSystemControlSignal(s.signalType ?? s.type))
        );

        ctx.recordAssertion(
          'sys_ctrl_state_intervene_resume_verified',
          afterSeekSignal === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY &&
            afterInterveneSignal === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME &&
            afterResumeSignal === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME &&
            !leakedSysSignals,
          `seek=0x${(afterSeekSignal || 0).toString(16)}, intervene=0x${(afterInterveneSignal || 0).toString(16)}, resume=0x${(afterResumeSignal || 0).toString(16)}, leakedSysSignals=${leakedSysSignals}`
        );
      },
    },
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
  },
};

export const ALL_BASELINE_SCENARIO_LIST: readonly ScenarioScript[] = Object.freeze([
  BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO,
  EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO,
  MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO,
  REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO,
  RLRC_EXPORT_TO_VIEWER_BASELINE_SCENARIO,
  ISOLATION_LAB_AND_TUNER_SCENARIO,
  TRAINING_AND_KICKOFF_SCENARIO,
  REPLAY_DIRECTOR_AND_EXPORT_SCENARIO,
  ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO,
  TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO,
  ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO,
]);

export const BUILTIN_BASELINE_SCENARIOS: Readonly<Record<string, ScenarioScript>> = Object.freeze({
  [BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO.id]: BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO,
  [EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO.id]: EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO,
  [MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO.id]: MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO,
  [REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO.id]: REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO,
  [RLRC_EXPORT_TO_VIEWER_BASELINE_SCENARIO.id]: RLRC_EXPORT_TO_VIEWER_BASELINE_SCENARIO,
  [ISOLATION_LAB_AND_TUNER_SCENARIO.id]: ISOLATION_LAB_AND_TUNER_SCENARIO,
  [TRAINING_AND_KICKOFF_SCENARIO.id]: TRAINING_AND_KICKOFF_SCENARIO,
  [REPLAY_DIRECTOR_AND_EXPORT_SCENARIO.id]: REPLAY_DIRECTOR_AND_EXPORT_SCENARIO,
  [ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO.id]: ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO,
  [TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO.id]:
    TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO,
  [ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO.id]:
    ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO,
  [FREEPLAY_CHAOS_SOAK_SCENARIO.id]: FREEPLAY_CHAOS_SOAK_SCENARIO,
});

const SCENARIO_MODE_ALIASES: Readonly<Record<string, readonly ScenarioScript[]>> = Object.freeze({
  exhibition: [EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO],
  'exp-multi-bots': [EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO],
  'multi-bots': [EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO],
  freeplay: [BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO],
  online: [ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO, MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO],
  replay: [
    REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO,
    RLRC_EXPORT_TO_VIEWER_BASELINE_SCENARIO,
    REPLAY_DIRECTOR_AND_EXPORT_SCENARIO,
  ],
  lab: [ISOLATION_LAB_AND_TUNER_SCENARIO],
  training: [TRAINING_AND_KICKOFF_SCENARIO, TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO],
});

export function resolveRequestedScenarios(queryValue: string | null | undefined): ScenarioScript[] {
  const normalized = (queryValue || 'all').trim().toLowerCase();
  if (
    !normalized ||
    normalized === 'all' ||
    normalized === 'full_all' ||
    normalized === 'full_baseline_suite' ||
    normalized === '1' ||
    normalized === 'true'
  ) {
    return [...ALL_BASELINE_SCENARIO_LIST];
  }
  if (normalized === 'calibration' || normalized === 'golden') {
    return [
      BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO,
      EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO,
      MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO,
      REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO,
      ISOLATION_LAB_AND_TUNER_SCENARIO,
      TRAINING_AND_KICKOFF_SCENARIO,
      ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO,
      REPLAY_DIRECTOR_AND_EXPORT_SCENARIO,
    ];
  }
  if (normalized === 'e2e' || normalized === 'autonomous') {
    return [
      EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO,
      ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO,
      TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO,
      ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO,
    ];
  }
  if (normalized === 'basic') {
    return [
      BOOT_AND_FREEPLAY_GOAL_REPLAY_SCENARIO,
      TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO,
    ];
  }
  if (normalized === 'complex') {
    return [
      EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO,
      ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO,
      ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO,
      MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO,
    ];
  }
  const ids = normalized
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const matched: ScenarioScript[] = [];
  const pushUnique = (scenario: ScenarioScript): void => {
    if (!matched.some((s) => s.id === scenario.id)) {
      matched.push(scenario);
    }
  };
  for (const id of ids) {
    if (BUILTIN_BASELINE_SCENARIOS[id]) {
      pushUnique(BUILTIN_BASELINE_SCENARIOS[id]);
      continue;
    }
    if (SCENARIO_MODE_ALIASES[id]) {
      for (const s of SCENARIO_MODE_ALIASES[id]) pushUnique(s);
      continue;
    }
    for (const [key, scenario] of Object.entries(BUILTIN_BASELINE_SCENARIOS)) {
      if (key.startsWith(id) || key.includes(id)) {
        pushUnique(scenario);
      }
    }
  }
  return matched.length > 0 ? matched : [...ALL_BASELINE_SCENARIO_LIST];
}
