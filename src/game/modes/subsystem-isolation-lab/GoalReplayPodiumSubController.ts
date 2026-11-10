import { PodiumCelebrationController } from '../PodiumCelebrationController.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import { hudStore, useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type {
  LabArenaPort,
  LabFrameUpdateContext,
  LabPhysicsEnginePort,
  LabRuntimePort,
} from './LabTabTypes.ts';
import {
  type ReplayExportPayload,
  buildMatchReplayExportPayload,
} from './goalReplayScenariosPipeline.ts';

const DEFAULT_OPPONENT_STATE = {
  pos: [1400, 3200, 17.05] as [number, number, number],
  vel: [0, 0, 0] as [number, number, number],
  angVel: [0, 0, 0] as [number, number, number],
  rot: [0, -Math.PI / 2, 0] as [number, number, number],
  boost: 100,
};

function configureTwoCarBenchArena(
  physics: LabPhysicsEnginePort,
  arena: LabArenaPort | null,
  assignTeamsAndOpponentState: boolean
): void {
  if (assignTeamsAndOpponentState) {
    while (physics.numCars > 2 && typeof physics.removeCar === 'function') {
      physics.removeCar(physics.numCars - 1);
    }
  }
  while (physics.numCars < 2) {
    physics.addCar(physics.numCars % 2, 'octane');
  }
  void arena?.ensureOpponent?.();
  if (!arena?.cars) return;

  if (arena.cars[0]) {
    arena.cars[0].visible = true;
    if (assignTeamsAndOpponentState) {
      arena.setCarTeam?.(0, 0);
    }
  }
  if (arena.cars[1]) {
    arena.cars[1].visible = true;
    if (assignTeamsAndOpponentState) {
      arena.setCarTeam?.(1, 1);
      physics.setCarState(1, DEFAULT_OPPONENT_STATE);
    }
  }
  if (assignTeamsAndOpponentState) {
    for (let i = 2; i < arena.cars.length; i++) {
      if (arena.cars[i]) {
        arena.cars[i].visible = false;
      }
    }
  }
}

export class GoalReplayPodiumSubController {
  public podiumController: PodiumCelebrationController | null = null;

  get isActive(): boolean {
    return Boolean(this.podiumController?.isActive);
  }

  ensureController(runtime: LabRuntimePort | null | undefined): PodiumCelebrationController | null {
    if (!this.podiumController && runtime) {
      const existing = runtime.podiumController;
      this.podiumController = existing || new PodiumCelebrationController(runtime);
      runtime.podiumController = this.podiumController;
    }
    return this.podiumController;
  }

  exitIfActive(): void {
    if (this.podiumController?.isActive) {
      this.podiumController.exitPodium();
    }
  }

  update(context: LabFrameUpdateContext): boolean {
    if (!this.podiumController?.isActive) return false;
    this.podiumController.update(context);
    return true;
  }

  enterShowcase(
    runtime: LabRuntimePort | null | undefined,
    winningTeam = 0,
    timelineController?: ReplayTimelineController | null,
    isReplaying = false
  ): boolean {
    if (!runtime?.physics) return false;
    const { physics, arena } = runtime;
    const store = useSubsystemIsolationLabStore.getState();

    const controller = this.ensureController(runtime);
    if (isReplaying && timelineController) {
      timelineController.endReplaySession();
    }
    runtime.releaseGoalReplayCameraOverride();
    configureTwoCarBenchArena(physics, arena, false);

    runtime.isBotMatch = true;
    controller?.enterPodium(winningTeam, 'DEV_TEST_PODIUM');

    store.updateLiveTelemetry({
      goalReplayPhase: 'podium',
      podiumActive: true,
      podiumWinningTeam: winningTeam,
    });
    hudStore.getState().setMatchState({
      matchPhase: 'podium',
      winner: winningTeam === 1 ? 'ORANGE' : winningTeam === 2 ? 'DRAW' : 'BLUE',
    });
    return true;
  }

  exitShowcase(runtime: LabRuntimePort | null | undefined): boolean {
    if (!runtime?.physics) return false;
    const { physics, interpolator } = runtime;
    const store = useSubsystemIsolationLabStore.getState();

    this.exitIfActive();
    runtime.isBotMatch = false;

    physics.resetGoalLatch?.();
    physics.resetKickoff(0, false);
    interpolator?.sync();

    store.updateLiveTelemetry({
      goalReplayPhase: 'live',
      podiumActive: false,
    });
    hudStore.getState().setMatchState({
      matchPhase: 'playing',
    });
    return true;
  }

  exportReplayBufferAsJson(
    runtime: LabRuntimePort | null | undefined,
    fallbackRingBuffer: ReplayRingBuffer | null
  ): ReplayExportPayload {
    const serverAdmin = runtime?.authoritativeServer?.matchAdmin;
    const physics = runtime?.physics;
    const ringBuffer = serverAdmin?.replayBuffer || fallbackRingBuffer;
    const wasmFramesCount = physics?.getReplayFrameCount?.() || 0;
    const store = useSubsystemIsolationLabStore.getState();
    const payload = buildMatchReplayExportPayload(ringBuffer, wasmFramesCount, store);

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rlcleanwasm-replay-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    return payload;
  }
}

export function resetGoalReplayBenchArenaAndPhysics(
  runtime: LabRuntimePort | null | undefined
): number {
  if (!runtime?.physics) return 0;
  const { physics, arena, simulationStage } = runtime;
  runtime.releaseGoalReplayCameraOverride();
  configureTwoCarBenchArena(physics, arena, true);
  runtime.playerCarIndex = 0;
  if (arena) {
    arena.playerCarIndex = 0;
    arena.resetAllCarEffects?.();
  }
  runtime.isBotMatch = false;
  physics.setUnlimitedBoost(true);
  physics.resetGoalLatch?.();
  physics.resetKickoff(0, false);
  physics.setCarState(1, DEFAULT_OPPONENT_STATE);
  physics.clearEvents?.();
  simulationStage?.resetActionStates?.();
  runtime.audioSubsystem?.resetAudio?.();
  physics.clearReplayBuffer?.();
  return Math.floor(physics.getHeaderView?.()?.tickCount || 0);
}

export function resetGoalReplayLiveKickoff(runtime: LabRuntimePort | null | undefined): number {
  const physics = runtime?.physics;
  if (!physics) return 0;
  physics.resetGoalLatch?.();
  physics.resetKickoff(0, false);
  if (physics.numCars > 1) {
    physics.setCarState(1, DEFAULT_OPPONENT_STATE);
  }
  return Math.floor(physics.getHeaderView?.()?.tickCount || 0);
}
