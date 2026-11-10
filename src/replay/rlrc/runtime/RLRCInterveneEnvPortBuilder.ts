/**
 * RLRCInterveneEnvPortBuilder.ts
 * Builds the RLRCInterveneEnvironmentPort and delegates ExperimentalBotAgent (Nexto/Necto)
 * non-POV decision policy to RLRCInterveneBotPolicyPipeline for RLRCReplaySessionController.
 */

import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import { useReplayToRcsImporterStore } from '../../../game/runtimeUiPort.ts';
import type {
  ReplayScoreboardModePort,
  ReplayScoreboardRuntimePort,
} from '../../ReplayScoreboardSynchronizer.ts';
import type { RLRCConvertedReplaySession } from '../RLReplayToRLRCConverter.ts';
import type { RLRCSessionPhase, RLRCSynthesizedCarControls } from '../RLRCReplayTypes.ts';
import { createRLRCInterveneBotDecisionPort } from './RLRCInterveneBotPolicyPipeline.ts';
import type {
  RLRCGoalAndTouchTrackerPort,
  RLRCPrerollRingBufferPort,
} from './RLRCInterveneFrameStateBuilder.ts';
import type {
  RLRCInterveneArenaPort,
  RLRCInterveneBotDecisionPort,
  RLRCInterveneEnvironmentPort,
  RLRCIntervenePhysicsPort,
} from './RLRCInterveneNonPovSyncPipeline.ts';
import { syncRLRCNameTagRoster } from './RLRCReplaySessionBridgePipeline.ts';

export interface RLRCInterveneSessionAccessors {
  readonly getSession: () => RLRCConvertedReplaySession | null;
  readonly getRuntime: () => ReplayScoreboardRuntimePort | null;
  readonly getMode: () => ReplayScoreboardModePort | null;
}

function resolveIntervenePhysicsPort(simRaw: unknown): RLRCIntervenePhysicsPort | null {
  const sim = simRaw as
    | (RLRCIntervenePhysicsPort & {
        setControls?: (slot: number, ctrl: RLRCSynthesizedCarControls) => void;
      })
    | null
    | undefined;
  if (!sim) return null;
  if (!sim.setCarControls && typeof sim.setControls === 'function') {
    sim.setCarControls = (slot, ctrl) => sim.setControls?.(slot, ctrl);
  }
  return sim;
}

function buildInterveneArenaPort(
  accessors: RLRCInterveneSessionAccessors
): RLRCInterveneArenaPort | null {
  const rt = accessors.getRuntime();
  const arena = rt?.arena as Record<string, unknown> | undefined;
  if (!arena) return null;
  const physics = rt?.physics;
  const interpolator = rt?.interpolator;
  return {
    rebuildSlotVehicle: (slotIndex, team, hitboxId, visualId, colorHex) => {
      physics?.setCarTeam?.(slotIndex, team);
      physics?.setCarHitbox?.(slotIndex, hitboxId);
      (arena.ensureCar as ((s: number, t: number, v: string) => void) | undefined)?.(
        slotIndex,
        team,
        visualId
      );
      (arena.setCarTeam as ((s: number, t: number) => void) | undefined)?.(slotIndex, team);
      if (colorHex) {
        (arena.setCarColor as ((s: number, c: string) => void) | undefined)?.(slotIndex, colorHex);
      }
    },
    setSlotEntityVisible: (slotIndex, visible) => {
      const cars = arena.cars as Array<{ visible?: boolean } | null> | undefined;
      if (cars?.[slotIndex]) cars[slotIndex]!.visible = visible;
    },
    setBallVisible: (visible) => {
      const ball = arena.ball as { visible?: boolean; group?: { visible?: boolean } } | undefined;
      if (ball) {
        ball.visible = visible;
        if (ball.group) ball.group.visible = visible;
      }
    },
    syncInterpolatorToState: (state) => {
      if (interpolator) {
        interpolator.prevState.set(state);
        interpolator.currState.set(state);
        interpolator.alpha = 0;
      }
    },
    focusCameraOnSlot: (slotIndex) => {
      if (rt) rt.playerCarIndex = slotIndex;
      arena.playerCarIndex = slotIndex;
      const currentRoster = accessors.getSession()?.roster;
      if (currentRoster && currentRoster.length > 0) {
        syncRLRCNameTagRoster(currentRoster, slotIndex);
      }
    },
  };
}

function syncImporterPhaseTelemetry(phase: RLRCSessionPhase, countdownSec: number): void {
  const viewerState =
    phase === 'preroll-countdown'
      ? 'preroll-countdown'
      : phase === 'intervening'
        ? 'intervening'
        : 'paused';
  useReplayToRcsImporterStore.getState().updateLiveTelemetry({
    viewerState,
    prerollRemainingSec: countdownSec,
  });
}

export function createRLRCInterveneEnvPort(
  accessors: RLRCInterveneSessionAccessors
): RLRCInterveneEnvironmentPort {
  const botDecisionPort = createRLRCInterveneBotDecisionPort(accessors);

  return {
    getFrames120Hz: () => accessors.getSession()?.frames120Hz ?? [],
    getRoster: () => accessors.getSession()?.roster ?? [],
    getBookmarks: () => accessors.getSession()?.bookmarks ?? [],
    getPhysics: (): RLRCIntervenePhysicsPort | null =>
      resolveIntervenePhysicsPort(accessors.getRuntime()?.physics),
    getArena: (): RLRCInterveneArenaPort | null => buildInterveneArenaPort(accessors),
    getRingBuffer: (): RLRCPrerollRingBufferPort | null =>
      (accessors.getMode() as unknown as { replayRingBuffer?: RLRCPrerollRingBufferPort })
        ?.replayRingBuffer ?? null,
    getGoalAndTouch: (): RLRCGoalAndTouchTrackerPort | null =>
      (accessors.getMode() as unknown as { goalAndTouch?: RLRCGoalAndTouchTrackerPort })
        ?.goalAndTouch ?? null,
    getBotPort: (): RLRCInterveneBotDecisionPort | null => botDecisionPort,
    playSound: (soundId, volume = 1.0) => {
      const audio = (accessors.getRuntime()?.options?.gameAudio || gameAudio) as {
        play?: (cue: string, vol?: number) => void;
        playSound?: (cue: string, vol?: number) => void;
      };
      if (typeof audio?.play === 'function') audio.play(soundId, volume);
      else audio?.playSound?.(soundId, volume);
    },
    onPhaseChanged: syncImporterPhaseTelemetry,
  };
}
