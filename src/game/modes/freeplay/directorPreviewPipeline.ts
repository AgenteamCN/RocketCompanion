import {
  getActiveReplayTimelineController,
  getLatestRetainedReplayTimelineController,
  hudStore,
  setNameTagRuntimeState,
  useAppStore,
} from '../../runtimeUiPort.ts';
import { SIM_OFFSETS, MAX_CARS } from '../../../physics/RocketSimConstants.ts';
import {
  parseDirectorDiagnosticPatternText,
  parseDirectorDiagnosticInput,
} from '../../../replay/ReplayDirectorPatternParser.ts';
import type {
  ImportedDiagnosticPatternInput,
  ReplayInterpolatorPort,
  ReplayPhysicsEnginePort,
} from '../../../replay/ReplayDirectorStatePipeline.ts';
import {
  applyReplayCarEntriesToRuntime,
  captureRuntimeReplayCarEntries,
  type NormalizedReplayDirectorCarEntry,
} from '../../../replay/replayDirectorCarRosterPipeline.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import {
  warmupArenaTrailsFromReplayWindow,
  type ReplayTrailWarmupArenaPort,
} from '../../../entities/vehicle/supersonic-trail/SupersonicWheelTrailReplaySync.ts';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../../../ui-core/config/replayDirectorConfig.ts';
import {
  endGoalReplaySession,
  type GoalReplayRuntimePort,
} from '../shared/GoalReplaySessionCoordinator.ts';
import { applyReplayControllerFrameAndDirectorCamera } from '../shared/goalReplayHudPipeline.ts';
import type { DirectorPreviewRuntimePort } from './directorPreviewFrameStepPipeline.ts';

export function syncAndAttachReplayTimelineController(
  replayController: ReplayTimelineController,
  simEngine: ReplayPhysicsEnginePort | null | undefined,
  ringBuffer: ReplayRingBuffer | null = null,
  copyRetainedFromActive = true
): number {
  if (simEngine && replayController.engine !== simEngine) {
    replayController.attach(simEngine, ringBuffer);
  }
  if (copyRetainedFromActive) {
    const sourceCtrl =
      getLatestRetainedReplayTimelineController() || getActiveReplayTimelineController();
    const sourceSeq = sourceCtrl?.sessionState?.retainedReplaySeq || 0;
    const targetSeq = replayController.sessionState.retainedReplaySeq || 0;
    if (
      sourceCtrl &&
      sourceCtrl !== replayController &&
      sourceCtrl.ActiveWindowCount > 0 &&
      (sourceSeq > targetSeq || replayController.ActiveWindowCount <= 0)
    ) {
      replayController.copyRetainedReplayFrom(sourceCtrl as unknown as ReplayTimelineController);
    }
  }
  return replayController.ActiveWindowCount;
}

export function resolveDesiredReferenceFreeCamFov(
  explicitFov: number | undefined,
  cameraPort:
    | {
        getDirectorFov?: () => number;
        getFreeCamFov?: () => number;
      }
    | null
    | undefined,
  storeFreeCamFov: number | undefined
): number {
  const directorFov = cameraPort?.getDirectorFov ? Number(cameraPort.getDirectorFov()) : 0;
  const freeCamFov = cameraPort?.getFreeCamFov ? Number(cameraPort.getFreeCamFov()) : 0;
  return (
    Number(explicitFov) ||
    directorFov ||
    freeCamFov ||
    Number(storeFreeCamFov) ||
    DEFAULT_REPLAY_DIRECTOR_FOV_DEG
  );
}

export function pauseReplayAndEnterReferenceFreeCam(
  scenePort:
    | {
        interpolator?: ReplayInterpolatorPort | null;
        arena?: ReplayTrailWarmupArenaPort | null;
        camera?: {
          getDirectorFov?: () => number;
          getFreeCamFov?: () => number;
          setFreeCamFov?: (fov: number) => void;
          setFreeCamPose?: (eye: number[], target: number[]) => void;
        } | null;
      }
    | null
    | undefined,
  replayController: ReplayTimelineController,
  options: { seekCursorFloat?: number | null; fov?: number } = {}
): boolean {
  if (!scenePort) return false;
  if (typeof options.seekCursorFloat === 'number') {
    replayController.seekToIndex(options.seekCursorFloat, scenePort.interpolator ?? null);
  }
  replayController.setPaused(true);
  warmupArenaTrailsFromReplayWindow(
    scenePort.arena,
    (idx) => replayController.getFrameBufferByIndex(idx),
    replayController.sessionState.cursorFloat ?? replayController.currentFrameIndex
  );
  hudStore.getState().setReplayState({
    replayPaused: true,
    replayPersistent: true,
    replayProgress: replayController.progress,
    replayFrameIndex: replayController.currentFrameIndex,
  });
  const snap = replayController.getCurrentFrameDiagnosticSnapshot();
  const eyeThreeJs = snap?.cameraPose?.dampedEyeThreeJs || [0, 420, -3600];
  const targetThreeJs = snap?.cameraPose?.dampedTargetThreeJs || [0, 120, 0];
  const desiredFov = resolveDesiredReferenceFreeCamFov(
    options.fov,
    scenePort.camera,
    useAppStore.getState().freeCamFov
  );
  if (scenePort.camera?.setFreeCamFov) {
    scenePort.camera.setFreeCamFov(desiredFov);
  }
  if (scenePort.camera?.setFreeCamPose) {
    scenePort.camera.setFreeCamPose(eyeThreeJs, targetThreeJs);
  }
  useAppStore.setState({ isFreeCam: true, freeCamFov: desiredFov });
  return true;
}

export function releaseFreeplayGoalReplayOverridesOnExit(
  scenePort: DirectorPreviewRuntimePort | null,
  replayController: ReplayTimelineController
): void {
  replayController.endReplaySession();
  if (scenePort) {
    scenePort.releaseGoalReplayCameraOverride();
    if (scenePort.ballTrajectoryPredictor?.releaseTemporarySuppression) {
      scenePort.ballTrajectoryPredictor.releaseTemporarySuppression();
    }
  }
  hudStore.getState().setReplayState({ replayPaused: false, replayPersistent: false });
}

export function restoreDirectorCameraAfterReferenceFreeCam(
  scenePort: DirectorPreviewRuntimePort | null,
  replayController: ReplayTimelineController,
  isReplayActive: boolean,
  scoringTeam: number,
  scorerCarIndex: number
): boolean {
  useAppStore.getState().setFreeCam(false);
  if (isReplayActive && replayController.sessionState.isActive && scenePort) {
    if (scenePort.acquireGoalReplayCameraOverride) {
      scenePort.acquireGoalReplayCameraOverride('freeplay-goal-replay');
    }
    applyReplayControllerFrameAndDirectorCamera(
      scenePort,
      replayController,
      scoringTeam,
      scorerCarIndex,
      {
        snapshot: null,
        refreshDirectorPose: true,
      }
    );
  }
  return true;
}

export function prepareDirectorPatternPreviewRoster(
  scenePort: unknown,
  replayController: ReplayTimelineController,
  savedPrePreviewCar0: NormalizedReplayDirectorCarEntry | null,
  fallbackScorerName: string
) {
  const firstSnap = replayController.getFrameBufferByIndex(0);
  const numCars = Math.min(
    MAX_CARS,
    Math.max(1, Math.round(firstSnap?.[SIM_OFFSETS.NUM_CARS] || 1))
  );
  const sState = replayController.sessionState;
  const savedCar0 =
    savedPrePreviewCar0 ||
    captureRuntimeReplayCarEntries(scenePort as never, { numCars: 1 })[0] ||
    null;
  const imported =
    sState.importedCarEntries && sState.importedCarEntries.length > 0
      ? sState.importedCarEntries
      : sState.carEntries;
  const effectiveCarEntries = applyReplayCarEntriesToRuntime(
    scenePort as never,
    imported,
    numCars,
    firstSnap
  );
  sState.carEntries = effectiveCarEntries;
  const scoringTeam = sState.scoringTeam ?? 0;
  const scorerCarIndex = sState.scorerCarIndex ?? 0;
  const scorerEntry = effectiveCarEntries.find((e) => e.carIndex === scorerCarIndex);
  const scorerName = sState.isImportedPreview
    ? scorerEntry?.name || scorerEntry?.username || 'RCGR Preview'
    : fallbackScorerName || scorerEntry?.name || 'Player';
  return {
    numCars,
    savedPrePreviewCar0: savedCar0,
    effectiveCarEntries,
    scoringTeam,
    scorerCarIndex,
    scorerName,
  };
}

export function restoreSingleCarAfterPreview(
  scenePort:
    | {
        physics?: { numCars: number; removeCar?: (idx: number) => void } | null;
        arena?: { cars?: Array<{ visible?: boolean } | null | undefined> } | null;
      }
    | null
    | undefined,
  savedPrePreviewCar0: NormalizedReplayDirectorCarEntry | null
): void {
  if (savedPrePreviewCar0 && scenePort) {
    applyReplayCarEntriesToRuntime(scenePort as never, [savedPrePreviewCar0], 1);
    return;
  }
  const sim = scenePort?.physics;
  if (sim) {
    while (sim.numCars > 1 && typeof sim.removeCar === 'function') {
      sim.removeCar(sim.numCars - 1);
    }
  }
  const cars = scenePort?.arena?.cars;
  if (cars) {
    for (let i = 1; i < cars.length; i++) {
      if (cars[i]) cars[i]!.visible = false;
    }
  }
}

export function finalizeFreeplayReplaySessionCleanup(params: {
  scenePort:
    | (GoalReplayRuntimePort & {
        keyboard?: { ballControlEnabled?: boolean } | null;
        physics?: { numCars: number; removeCar?: (idx: number) => void } | null;
      })
    | null;
  replayController: ReplayTimelineController;
  shouldRestoreSingleCar: boolean;
  savedCar0: NormalizedReplayDirectorCarEntry | null;
  enableBallControl: boolean;
}): void {
  const { scenePort, replayController, shouldRestoreSingleCar, savedCar0, enableBallControl } =
    params;
  endGoalReplaySession(scenePort, replayController, {
    source: 'freeplay-goal-replay',
    clearHud: false,
  });
  if (shouldRestoreSingleCar) {
    restoreSingleCarAfterPreview(scenePort, savedCar0);
    setNameTagRuntimeState({ isMultiplayerOrMultiCarMode: false });
  }
  if (scenePort) {
    if (scenePort.keyboard) {
      scenePort.keyboard.ballControlEnabled = enableBallControl;
    }
    if (scenePort.match?.state) {
      scenePort.match.state.phase = 'playing';
    }
  }
  hudStore.getState().setReplayState({ replayPaused: false, replayPersistent: false });
  hudStore.getState().setMatchState({
    matchPhase: 'playing',
    replayScorerName: null,
    replayScorerTeam: null,
    replayBallSpeedKph: null,
    replayAssistName: null,
  });
}

export async function resolveImportedDiagnosticPatternInput(
  fileOrInput: unknown,
  fileName?: string
): Promise<ImportedDiagnosticPatternInput | null> {
  const candidate = fileOrInput as ImportedDiagnosticPatternInput | null;
  const parsed =
    candidate && typeof candidate === 'object' && Array.isArray(candidate.activeFrames)
      ? candidate
      : typeof fileOrInput === 'string'
        ? parseDirectorDiagnosticPatternText(fileOrInput, fileName)
        : await parseDirectorDiagnosticInput(
            fileOrInput as
              File | Blob | ArrayBuffer | Uint8Array | string | ImportedDiagnosticPatternInput,
            fileName
          );
  return parsed && Array.isArray(parsed.activeFrames) && parsed.activeFrames.length > 0
    ? parsed
    : null;
}
