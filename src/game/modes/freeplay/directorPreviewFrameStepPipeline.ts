import type { NormalizedReplayDirectorCarEntry } from '../../../replay/replayDirectorCarRosterPipeline.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import {
  stepGoalReplaySessionFrame,
  type GoalReplayRuntimePort,
} from '../shared/GoalReplaySessionCoordinator.ts';
import { stepNetworkStreamedGoalReplayFrame } from '../shared/networkStreamedGoalReplayCoordinator.ts';
import type {
  GoalReplayCameraMode,
  GoalReplayCarStateViewLike,
} from '../shared/goalReplayHudPipeline.ts';

export type ReplayCameraMode = 'director' | 'pov';
export type DirectorPreviewCarEntry = NormalizedReplayDirectorCarEntry;

export interface DirectorPatternPreviewOptions {
  fileName?: string;
  autoStartPreview?: boolean;
  startPaused?: boolean;
  restart?: boolean;
}

export interface ReferenceFreeCamOptions {
  fov?: number;
}

export interface DirectorPreviewStepContext {
  dt?: number;
  activeCar?: number;
  activeCarMesh?: unknown;
  playerCarView?: GoalReplayCarStateViewLike | null;
  isSupersonic?: boolean;
  curBoost?: number;
}

export interface DirectorPreviewRuntimePort extends GoalReplayRuntimePort {
  physics?:
    | (NonNullable<GoalReplayRuntimePort['physics']> & {
        numCars: number;
        getBallStateView?: () => { posY: number } | null;
        getHeaderView?: () => { tickCount: number } | null;
        removeCar?: (carIndex: number) => void;
        addCar?: (team: number, preset: string) => number | void;
      })
    | null;
  arena?:
    | (NonNullable<GoalReplayRuntimePort['arena']> & {
        carTeams?: ArrayLike<number>;
        carVisual?: string;
        cars?: Array<{ visible: boolean } | null | undefined>;
        setCarTeam?: (carIndex: number, team: number) => void;
        ensureCar?: (carIndex: number, team: number, preset: string) => void;
      })
    | null;
  camera?:
    | (NonNullable<GoalReplayRuntimePort['camera']> & {
        getFreeCamStateSnapshot?: () => object | null;
      })
    | null;
  keyboard?: { ballControlEnabled?: boolean } | null;
  match?: {
    state?: { mode?: string; phase?: string; scorer?: number; scorerCarIndex?: number } | null;
  } | null;
  modeManager?: { setMode?: (modeId: string) => void } | null;
}

export function stepDirectorPreviewOrGoalReplayFrame(params: {
  scenePort: DirectorPreviewRuntimePort | null;
  replayController: ReplayTimelineController;
  context: DirectorPreviewStepContext;
  isUnlimitedBoost: boolean;
  isReplayActive: boolean;
  getCameraMode: () => GoalReplayCameraMode;
  setCameraMode: (mode: GoalReplayCameraMode) => void;
  getScoringTeam: () => number;
  setScoringTeam: (team: number) => void;
  getScorerCarIndex: () => number;
  setScorerCarIndex: (idx: number) => void;
  onCompleteReplaySession: () => void;
}): boolean {
  const {
    scenePort,
    replayController,
    context,
    isUnlimitedBoost,
    isReplayActive,
    getCameraMode,
    setCameraMode,
    getScoringTeam,
    setScoringTeam,
    getScorerCarIndex,
    setScorerCarIndex,
    onCompleteReplaySession,
  } = params;

  if (
    scenePort?.match?.state?.phase === 'replay' &&
    scenePort.networkReconciler &&
    !isReplayActive
  ) {
    stepNetworkStreamedGoalReplayFrame({
      runtime: scenePort,
      replayController,
      context,
      isUnlimitedBoost,
      getCameraMode,
      setCameraMode,
      getScoringTeam,
      setScoringTeam,
      getScorerCarIndex,
      setScorerCarIndex,
    });
    return true;
  }

  const sState = replayController.sessionState;
  if (isReplayActive && sState.isActive) {
    const scorerCarIndex = getScorerCarIndex();
    const stepRes = stepGoalReplaySessionFrame({
      runtime: scenePort,
      replayController,
      context,
      dt: context.dt ?? 0.016,
      source: 'freeplay-goal-replay',
      cameraMode: getCameraMode(),
      scoringTeam: getScoringTeam(),
      scorerCarIndex,
      povCarIndex: scorerCarIndex,
      isUnlimitedBoost,
      syncCarAudioControls: true,
      syncBoostToHud: true,
      emitWillEndSignal: true,
      syncHudProgress: true,
    });
    if (stepRes.isFinished && !sState.isPaused && !sState.isPersistent) {
      onCompleteReplaySession();
    }
    return true;
  }

  if (isReplayActive && !sState.isActive) {
    onCompleteReplaySession();
  } else if (
    scenePort?.isGoalReplayCameraOverrideActive &&
    scenePort.isGoalReplayCameraOverrideActive()
  ) {
    scenePort.releaseGoalReplayCameraOverride();
    if (scenePort.camera?.resetView) {
      scenePort.camera.resetView();
    }
  }
  return false;
}
