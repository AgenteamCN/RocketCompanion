import type {
  FreeplayGoalAndTouchRuntimePort,
  FreeplayGoalMetadataTargetPort,
} from './freeplayTouchAndGoalPipeline.ts';

export interface CleanFreeplayResetOptions {
  standaloneReplayViewer?: {
    hasLoadedReplay?: boolean;
    isActive?: boolean;
    clearReplay(): void;
  } | null;
  isGoalReplayActive: boolean;
  replayController?: { sessionState?: { isActive?: boolean } } | null;
  nameTagTunerController?: { isActive?: boolean; exitTunerArena(): void } | null;
  rewinderController?: {
    isBlockingLivePhysics?: boolean;
    rewinderFrames?: unknown[];
    clearBuffer(): void;
  } | null;
}

export interface StandaloneViewerKickoffResetPort {
  hasLoadedReplay?: boolean;
  isActive?: boolean;
  frames: unknown[];
  takeoverSubController: { targetFrame?: number; cursor?: number };
  _handoffToLiveFreeplay(idx: number): void;
  _applyFrameAtCursor(a: boolean, b: boolean): void;
}

export function resetFreeplayExtraCarsAndArenaToSingleCar(
  scenePort: FreeplayGoalAndTouchRuntimePort | null | undefined
): void {
  const sim = scenePort?.physics;
  if (sim) {
    while ((sim.numCars ?? 1) > 1 && typeof sim.removeCar === 'function') {
      sim.removeCar((sim.numCars ?? 1) - 1);
    }
  }
  const arena = scenePort?.arena;
  if (arena?.cars) {
    if (arena.cars[0]) arena.cars[0].visible = true;
    for (let i = 1; i < arena.cars.length; i++) {
      if (arena.cars[i]) arena.cars[i]!.visible = false;
      if (arena.resetCarBoosts) arena.resetCarBoosts(i);
      const demo = arena.carDemolitions?.[i];
      if (demo?.stop) demo.stop();
      if (arena.supersonicWheelTrailSystem?.resetCar) {
        arena.supersonicWheelTrailSystem.resetCar(i);
      }
    }
    if (arena.lighting?.updateSunIntensities) {
      arena.lighting.updateSunIntensities(1);
    }
  }
  if (scenePort?.audioSubsystem?.resetAudio) {
    scenePort.audioSubsystem.resetAudio();
  }
}

export function syncFreeplayAuthoritativeServerKickoffState(
  scenePort: FreeplayGoalAndTouchRuntimePort | null | undefined
): void {
  const server = scenePort?.authoritativeServer;
  const sim = scenePort?.physics;
  if (!server || !sim || !sim.saveCompactState) return;
  const snap = sim.saveCompactState();
  const curTick = Math.floor((sim.getHeaderView ? sim.getHeaderView()?.tickCount : undefined) ?? 0);
  if (server.startTrainingMode) {
    server.startTrainingMode({
      unlimitedBoost: Boolean(sim.isUnlimitedBoost),
      disableGoalReset: Boolean(scenePort?.trainingOptions?.disableGoalReset),
      goalReplayEnabled: true,
      fifoDurationSeconds: 60,
      initialState: Array.from(snap),
      resetKickoff: false,
    });
  }
  if (server.sim?.restoreState) {
    void server.sim.restoreState(snap);
  }
  if (server.clientInputBuffer?.clear) server.clientInputBuffer.clear();
  if (server.lastReceivedControls?.clear) server.lastReceivedControls.clear();
  if (scenePort?.networkReconciler?.syncTimeline) {
    scenePort.networkReconciler.syncTimeline(snap, curTick);
  }
}

export function applyCleanFreeplaySubsystemsReset(
  scenePort: FreeplayGoalAndTouchRuntimePort | null | undefined,
  directorPreview: FreeplayGoalMetadataTargetPort,
  options: CleanFreeplayResetOptions
): void {
  const {
    standaloneReplayViewer,
    isGoalReplayActive,
    replayController,
    nameTagTunerController,
    rewinderController,
  } = options;
  if (standaloneReplayViewer?.hasLoadedReplay || standaloneReplayViewer?.isActive) {
    standaloneReplayViewer.clearReplay();
  }
  if (isGoalReplayActive || replayController?.sessionState?.isActive) {
    directorPreview.exitPatternPreview();
  }
  if (nameTagTunerController?.isActive) nameTagTunerController.exitTunerArena();
  if (
    rewinderController &&
    (rewinderController.isBlockingLivePhysics ||
      (rewinderController.rewinderFrames?.length ?? 0) > 0)
  ) {
    rewinderController.clearBuffer();
  }
  resetFreeplayExtraCarsAndArenaToSingleCar(scenePort);
  directorPreview.previewSpawnedExtraCars = false;
}

export function applyStandaloneViewerKickoffReset(
  standaloneReplayViewer: StandaloneViewerKickoffResetPort | null | undefined,
  onResetPresentation: () => void
): boolean {
  if (!standaloneReplayViewer?.hasLoadedReplay) return false;
  const takeover = standaloneReplayViewer.takeoverSubController;
  const targetIdx = Math.max(
    0,
    Math.min(
      standaloneReplayViewer.frames.length - 1,
      Math.round(takeover.targetFrame || takeover.cursor || 0)
    )
  );
  if (!standaloneReplayViewer.isActive) {
    standaloneReplayViewer._handoffToLiveFreeplay(targetIdx);
  } else {
    standaloneReplayViewer._applyFrameAtCursor(false, false);
  }
  onResetPresentation();
  return true;
}
