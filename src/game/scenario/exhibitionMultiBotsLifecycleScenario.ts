/**
 * exhibitionMultiBotsLifecycleScenario.ts
 * Dedicated E2E scenario for Exhibition / ExperimentalMultiBotsMode (exp-multi-bots):
 * 1. Immediate Enter -> Exit race condition guard (entering 6-car Exhibition and exiting
 *    immediately to Freeplay before/during async opponent spawn).
 * 2. Full 6-car Exhibition 3v3 lifecycle (1 local player + 5 bots) -> camera target switch
 *    -> goal scored -> Goal Replay -> Podium celebration -> clean exit to Freeplay
 *    verifying Car 0 loadout restoration and extra cars cleanup.
 */

import { hudStore, useExperimentalMultiBotsStore } from '../runtimeUiPort.ts';
import type { ScenarioScript, ScenarioStepContext, ScenarioTickStep } from './ScenarioTypes.ts';

interface ScenarioExhibitionRuntimeHost {
  matchPort?: {
    startExpMultiBots?: () => void;
    returnToFreeplay?: (skipConfirm?: boolean) => void;
  };
  podiumController?: {
    isActive?: boolean;
  } | null;
}

interface ScenarioExhibitionModePort {
  applyRosterAndStartMatch?: () => Promise<void>;
  isGoalReplayActive?: () => boolean;
  skipGoalReplay?: () => void;
}

const kfStep = (
  tick: number,
  keyframeReason: string,
  description: string,
  action: (ctx: ScenarioStepContext) => void | Promise<void>
): ScenarioTickStep => ({
  tick,
  description,
  forceKeyframeRender: true,
  keyframeReason,
  action,
});

function configureSixCarExhibitionRoster(disableGoalReplay: boolean): void {
  const expStore = useExperimentalMultiBotsStore.getState();
  expStore.configureExhibitionMatch('heuristic', 300, 'standard');
  expStore.setDisableGoalReplay(disableGoalReplay);
}

export const EXHIBITION_6CAR_LIFECYCLE_AND_EXIT_SCENARIO: ScenarioScript = {
  id: 'exhibition_6car_lifecycle_and_exit',
  title: 'Exhibition 6-Car Full Lifecycle + Immediate Enter/Exit Guard',
  description:
    'Validates Exhibition (exp-multi-bots) immediate enter->exit race safety, 6-car (1 player + 5 bots) spawn & camera switching, goal -> Goal Replay -> Podium -> exit to Freeplay with Car 0 loadout restoration.',
  totalTicks: 740,
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
  },
  steps: [
    {
      tick: 5,
      description:
        'Phase 1: Enter 6-car Exhibition mode and trigger immediate returnToFreeplay(true) without awaiting setup',
      action: (ctx) => {
        configureSixCarExhibitionRoster(false);
        const host = ctx.runtime as unknown as ScenarioExhibitionRuntimeHost;
        host.matchPort?.startExpMultiBots?.();
        host.matchPort?.returnToFreeplay?.(true);
      },
    },
    kfStep(
      25,
      'exhibition_immediate_exit_clean_freeplay',
      'Verify immediate exit from Exhibition leaves Freeplay intact with 1 car and no leaked bots',
      (ctx) => {
        const r = ctx.runtime;
        const mode = r?.match?.state?.mode;
        const numCars = r?.physics?.numCars ?? 0;
        const expStore = useExperimentalMultiBotsStore.getState();
        const extraCarsVisible = (r?.arena?.cars || [])
          .slice(1)
          .some((c) => Boolean(c && c.visible));
        ctx.recordAssertion(
          'exhibition_immediate_enter_exit_clean',
          mode === 'freeplay' &&
            numCars === 1 &&
            expStore.spawnedCars.length === 0 &&
            !extraCarsVisible,
          `mode=${mode}, numCars=${numCars}, spawned=${expStore.spawnedCars.length}, extraVisible=${extraCarsVisible}`
        );
      }
    ),
    {
      tick: 40,
      description:
        'Phase 2: Enter 6-car Exhibition mode (3v3: 1 player + 5 bots) for full lifecycle',
      action: async (ctx) => {
        configureSixCarExhibitionRoster(false);
        const host = ctx.runtime as unknown as ScenarioExhibitionRuntimeHost;
        host.matchPort?.startExpMultiBots?.();
        const activeMode =
          ctx.runtime.modeManager.getActiveMode() as unknown as ScenarioExhibitionModePort | null;
        await activeMode?.applyRosterAndStartMatch?.();
      },
    },
    kfStep(
      80,
      'exhibition_6car_spawned_and_camera_switch',
      'Verify 6 cars spawned in Exhibition, test camera car selection, and finish kickoff countdown',
      (ctx) => {
        const expStore = useExperimentalMultiBotsStore.getState();
        const physCars = ctx.runtime.physics?.numCars ?? 0;
        const spawnedCount = expStore.spawnedCars.length;
        const secondCarIdx = expStore.spawnedCars[1]?.carIndex ?? 1;
        expStore.runtimeHandlers.onSelectCameraCar?.(secondCarIdx);
        const camAfterSwitch = useExperimentalMultiBotsStore.getState().activeCameraCarIndex;
        expStore.runtimeHandlers.onSelectCameraCar?.(0);
        if (ctx.runtime.match?.state) {
          ctx.runtime.match.state.phase = 'playing';
        }
        ctx.recordAssertion(
          'exhibition_6car_roster_and_camera_switch',
          expStore.matchActive &&
            expStore.isExhibitionMode &&
            spawnedCount === 6 &&
            physCars === 6 &&
            camAfterSwitch === secondCarIdx,
          `active=${expStore.matchActive}, exhibition=${expStore.isExhibitionMode}, spawned=${spawnedCount}, physCars=${physCars}, cam=${camAfterSwitch}`
        );
      }
    ),
    {
      tick: 100,
      description: 'Trigger Blue goal in 6-car Exhibition match',
      action: () => {
        useExperimentalMultiBotsStore.getState().triggerSandboxAction('score_blue');
      },
    },
    kfStep(
      145,
      'exhibition_6car_goal_scored',
      'Verify Blue goal recorded in Exhibition mode and celebration phase entered',
      (ctx) => {
        const expStore = useExperimentalMultiBotsStore.getState();
        const phase = ctx.runtime.match?.state?.phase;
        ctx.recordAssertion(
          'exhibition_6car_goal_detected',
          expStore.blueScore >= 1 && (phase === 'goal' || phase === 'replay'),
          `blueScore=${expStore.blueScore}, phase=${phase}`
        );
      }
    ),
    kfStep(
      305,
      'exhibition_6car_goal_replay_active',
      'Verify automatic transition into Goal Replay in 6-car Exhibition match, then skip replay',
      (ctx) => {
        const r = ctx.runtime;
        const activeMode =
          r?.modeManager?.getActiveMode?.() as unknown as ScenarioExhibitionModePort | null;
        const inReplay = Boolean(
          activeMode?.isGoalReplayActive?.() || r?.match?.state?.phase === 'replay'
        );
        ctx.recordAssertion(
          'exhibition_6car_goal_replay_entered',
          inReplay,
          `phase=${r?.match?.state?.phase}, isGoalReplayActive=${activeMode?.isGoalReplayActive?.()}`
        );
        activeMode?.skipGoalReplay?.();
      }
    ),
    {
      tick: 315,
      description:
        'Trigger end_match to transition Exhibition match into 360-tick post-match delay -> Podium',
      action: () => {
        useExperimentalMultiBotsStore.getState().triggerSandboxAction('end_match');
      },
    },
    kfStep(
      685,
      'exhibition_6car_podium_celebration',
      'Verify Exhibition match ended and Podium celebration is active after post-match delay',
      (ctx) => {
        const host = ctx.runtime as unknown as ScenarioExhibitionRuntimeHost;
        const phase = ctx.runtime.match?.state?.phase;
        const podiumActive = Boolean(host.podiumController?.isActive);
        const hudPhase = hudStore.getState().matchPhase;
        ctx.recordAssertion(
          'exhibition_6car_podium_entered',
          phase === 'podium' && podiumActive && hudPhase === 'podium',
          `phase=${phase}, podiumActive=${podiumActive}, hudPhase=${hudPhase}`
        );
      }
    ),
    kfStep(
      715,
      'exhibition_6car_exit_to_freeplay_verified',
      'Exit Exhibition match to Freeplay and verify Car 0 loadout restored and Cars 1..5 cleaned up',
      (ctx) => {
        const host = ctx.runtime as unknown as ScenarioExhibitionRuntimeHost;
        host.matchPort?.returnToFreeplay?.(true);
        const r = ctx.runtime;
        const mode = r?.match?.state?.mode;
        const phase = r?.match?.state?.phase;
        const numCars = r?.physics?.numCars ?? 0;
        const car0Visible = Boolean(r?.arena?.cars?.[0]?.visible);
        const extraCarsVisible = (r?.arena?.cars || [])
          .slice(1)
          .some((c) => Boolean(c && c.visible));
        const expStore = useExperimentalMultiBotsStore.getState();
        ctx.recordAssertion(
          'exhibition_6car_clean_exit_to_freeplay',
          mode === 'freeplay' &&
            phase === 'playing' &&
            numCars === 1 &&
            car0Visible &&
            !extraCarsVisible &&
            expStore.spawnedCars.length === 0 &&
            !host.podiumController?.isActive,
          `mode=${mode}, phase=${phase}, numCars=${numCars}, car0Visible=${car0Visible}, extraVisible=${extraCarsVisible}, spawned=${expStore.spawnedCars.length}`
        );
      }
    ),
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
  },
};
