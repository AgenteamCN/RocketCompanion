import { hudStore, useAppStore } from '../runtimeUiPort.ts';
import {
  buildKeyframeScenarioStep,
  buildReplayExportAndViewerTakeoverSteps,
  getFreeplayModeProbe,
  type DirectorPoseProbe,
} from './replayExportAndViewerTakeoverSteps.ts';
import type { ScenarioScript } from './ScenarioTypes.ts';

function isPoseFinite(p: DirectorPoseProbe | null | undefined): boolean {
  return Boolean(
    p &&
    Number.isFinite(p.eyeX) &&
    Number.isFinite(p.eyeY) &&
    Number.isFinite(p.eyeZ) &&
    Number.isFinite(p.targetX) &&
    Number.isFinite(p.targetY) &&
    Number.isFinite(p.targetZ)
  );
}

export const REPLAY_DIRECTOR_AND_EXPORT_SCENARIO: ScenarioScript = {
  id: 'replay_director_and_export_lifecycle',
  title: 'Goal Replay Director -> .rcreplay.gz Export/Import -> Viewer Takeover -> Exit',
  description:
    'Goal Replay Director multi-view, .rcreplay.gz binary export/import, Viewer takeover countdown, causal hybrid physics intervention, and clean FreePlay exit.',
  totalTicks: 820,
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
      tick: 20,
      description: 'Launch Car 0 and ball into Orange goal',
      action: (ctx) => {
        ctx.setCarState(0, {
          pos: [0, 4350, 17.01],
          vel: [0, 2100, 0],
          angVel: [0, 0, 0],
          boost: 100,
        });
        ctx.setBallState({ pos: [0, 4650, 95], vel: [0, 2800, 60], angVel: [0, 0, 0] });
      },
    },
    buildKeyframeScenarioStep(
      65,
      'director_goal_celebration',
      'Verify Goal Scored celebration active',
      (ctx) => {
        const activeMode = getFreeplayModeProbe(ctx);
        const ticks =
          activeMode?.goalAndTouch?.getEffectiveGoalResetTicks?.() ??
          activeMode?.goalAndTouch?.goalResetTicks ??
          0;
        const phase = ctx.runtime?.match?.state?.phase;
        ctx.recordAssertion(
          'director_bench_goal_celebration_active',
          phase === 'goal' || ticks > 0,
          `phase=${phase}, ticks=${ticks}`
        );
        ctx.setLocalCarControls({ throttle: 0, boost: false });
      }
    ),
    buildKeyframeScenarioStep(
      220,
      'director_cinematic_replay',
      'Verify Director Camera Goal Replay with suffix plan and finite pose',
      (ctx) => {
        const r = ctx.runtime;
        const activeMode = getFreeplayModeProbe(ctx);
        const active = Boolean(
          activeMode?.isGoalReplayActive?.() || activeMode?.directorPreview?.isReplayActive
        );
        const ovr = Boolean(r?.isGoalReplayCameraOverrideActive?.());
        const cam = activeMode?.directorPreview?.replayCameraMode;
        const plan = Boolean(activeMode?.replayController?.ensureSuffixCameraPlan?.());
        const poseOk = isPoseFinite(activeMode?.replayController?.directorCameraState);
        ctx.recordAssertion(
          'director_bench_replay_and_pose_valid',
          r?.match?.state?.phase === 'replay' &&
            active &&
            ovr &&
            cam === 'director' &&
            plan &&
            poseOk,
          `phase=${r?.match?.state?.phase}, active=${active}, ovr=${ovr}, cam=${cam}, plan=${plan}, poseOk=${poseOk}`
        );
      }
    ),
    buildKeyframeScenarioStep(
      260,
      'director_pov_camera',
      'Switch Goal Replay camera to POV mode via HUD callback',
      (ctx) => {
        hudStore.getState().onReplayToggleCameraMode?.();
        const cam = getFreeplayModeProbe(ctx)?.directorPreview?.replayCameraMode;
        const ovr = Boolean(ctx.runtime?.isGoalReplayCameraOverrideActive?.());
        ctx.recordAssertion(
          'director_bench_pov_switch_verified',
          cam === 'pov' && !ovr,
          `cam=${cam}, ovr=${ovr}`
        );
      }
    ),
    buildKeyframeScenarioStep(
      290,
      'director_reference_freecam',
      'Enter Reference FreeCam and exit back to Director mode',
      (ctx) => {
        const activeMode = getFreeplayModeProbe(ctx);
        hudStore.getState().onReplayToggleCameraMode?.();
        const entered = Boolean(activeMode?.enterDirectorReferenceFreeCamFromHere?.());
        const freeDuring = Boolean(useAppStore.getState().isFreeCam);
        const paused = Boolean(activeMode?.replayController?.sessionState?.isPaused);
        const exited = Boolean(activeMode?.exitDirectorReferenceFreeCam?.());
        activeMode?.replayController?.setPaused?.(false);
        const freeAfter = Boolean(useAppStore.getState().isFreeCam);
        const ovrAfter = Boolean(ctx.runtime?.isGoalReplayCameraOverrideActive?.());
        ctx.recordAssertion(
          'director_bench_reference_freecam_roundtrip',
          entered && freeDuring && paused && exited && !freeAfter && ovrAfter,
          `entered=${entered}, freeDuring=${freeDuring}, paused=${paused}, exited=${exited}, freeAfter=${freeAfter}, ovrAfter=${ovrAfter}`
        );
      }
    ),
    {
      tick: 330,
      description: 'Hold Jump during active Goal Replay',
      action: (ctx) => {
        ctx.setLocalCarControls({ throttle: 1.0, boost: true, jump: true });
      },
    },
    buildKeyframeScenarioStep(
      340,
      'director_skip_replay',
      'Skip Goal Replay while holding Jump',
      (ctx) => {
        getFreeplayModeProbe(ctx)?.skipGoalReplay?.();
        const phase = ctx.runtime?.match?.state?.phase;
        const ovr = Boolean(ctx.runtime?.isGoalReplayCameraOverrideActive?.());
        ctx.recordAssertion(
          'director_bench_skip_replay_restored_playing',
          phase === 'playing' && !ovr,
          `phase=${phase}, ovr=${ovr}`
        );
      }
    ),
    {
      tick: 350,
      description: 'Verify no spontaneous jump after replay skip',
      action: (ctx) => {
        const cv = ctx.runtime?.physics?.getCarStateView?.(0);
        const ok = Boolean(cv && !cv.isJumping && cv.posZ < 28);
        ctx.recordAssertion(
          'director_bench_no_spontaneous_jump_after_skip',
          ok,
          `isJumping=${cv?.isJumping}, posZ=${cv?.posZ?.toFixed?.(2)}`
        );
        ctx.setLocalCarControls({ throttle: 0, boost: false, jump: false });
      },
    },
    ...buildReplayExportAndViewerTakeoverSteps(),
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
  },
};
