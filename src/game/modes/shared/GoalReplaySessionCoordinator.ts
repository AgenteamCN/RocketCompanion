import { applyReplayFrameToEngine } from '../../../replay/ReplayFrameInterpolator.ts';
import {
  applyDirectorReplayCamera,
  type DirectorInterpolatorSnapshot,
} from '../../../replay/ReplayDirectorCamera.ts';
import {
  dispatchReplayFrameEvents,
  type ReplayStepEventsPayload,
} from '../../../replay/ReplayFrameEventDispatcher.ts';
import type { ReplayPlaybackStepResult } from '../../../replay/ReplayTimelineController.ts';
import {
  bindGoalReplayHudStateAndCallbacks,
  type GoalReplayCameraMode,
} from './goalReplayHudPipeline.ts';
import {
  resetGoalReplayHudStateOnEnd,
  syncGoalReplayActiveCarAndHud,
  type EndGoalReplaySessionOptions,
  type GoalReplayCameraPort,
  type GoalReplayFrameContextPort,
  type GoalReplayFrameStepOptions,
  type GoalReplayHudSessionOptions,
  type GoalReplayInterpolatorPort,
  type GoalReplayRuntimePort,
  type GoalReplayTimelineControllerPort,
} from './goalReplayCarAndHudSyncPipeline.ts';
import { warmupArenaTrailsFromReplayWindow } from '../../../entities/vehicle/supersonic-trail/SupersonicWheelTrailReplaySync.ts';

export type {
  EndGoalReplaySessionOptions,
  GoalReplayCameraMode,
  GoalReplayCameraPort,
  GoalReplayFrameContextPort,
  GoalReplayFrameStepOptions,
  GoalReplayHudSessionOptions,
  GoalReplayInterpolatorPort,
  GoalReplayRuntimePort,
  GoalReplayTimelineControllerPort,
};

export function applyGoalReplayCameraModeSelection(
  scenePort: GoalReplayRuntimePort | null | undefined,
  cameraMode: GoalReplayCameraMode = 'director',
  source = 'goal-replay'
): void {
  if (!scenePort) return;
  if (cameraMode === 'director') scenePort.acquireGoalReplayCameraOverride?.(source);
  else scenePort.releaseGoalReplayCameraOverride?.(source);
}

export function bindGoalReplayHudCallbacks(options: GoalReplayHudSessionOptions): void {
  const { runtime: scenePort, replayController } = options;
  if (!replayController) return;
  const source = options.source || 'goal-replay';
  const refreshDirectorCamera = (scoringTeam: number, scorerCarIndex: number): void => {
    applyDirectorReplayCamera(
      scenePort?.camera,
      scenePort?.interpolator as DirectorInterpolatorSnapshot | null | undefined,
      replayController.progress,
      scoringTeam,
      0.016,
      scorerCarIndex,
      replayController.directorCameraState
    );
  };
  const selectCameraMode = (
    nextMode: GoalReplayCameraMode,
    povCarIdx: number | null,
    scoringTeam: number,
    scorerCarIndex: number
  ): void => {
    applyGoalReplayCameraModeSelection(scenePort, nextMode, source);
    if (nextMode === 'director' || typeof povCarIdx !== 'number' || povCarIdx < 0) {
      if (scenePort) scenePort.replayPovCarIndex = null;
      if (replayController.directorCameraState)
        replayController.directorCameraState.initialized = false;
      refreshDirectorCamera(scoringTeam, scorerCarIndex);
    } else {
      if (scenePort) scenePort.replayPovCarIndex = povCarIdx;
      if (options.onApplyPovCarIndex) {
        options.onApplyPovCarIndex(povCarIdx);
      } else if (scenePort) {
        scenePort.playerCarIndex = povCarIdx;
        if (scenePort.arena) scenePort.arena.playerCarIndex = povCarIdx;
        scenePort.camera?.setFocusedCarIndex?.(povCarIdx);
      }
      scenePort?.camera?.resetView?.();
    }
  };
  bindGoalReplayHudStateAndCallbacks(options, {
    refreshDirectorCamera,
    selectCameraMode,
  });
}

export function beginGoalReplaySession(
  scenePort: GoalReplayRuntimePort | null | undefined,
  replayController: GoalReplayTimelineControllerPort | null | undefined,
  options: GoalReplayHudSessionOptions = {}
): void {
  const cameraMode = options.cameraMode || 'director';
  const source = options.source || 'goal-replay';
  const scoringTeam =
    options.scoringTeam ?? options.scorerTeam ?? replayController?.sessionState?.scoringTeam ?? 0;
  const scorerCarIndex =
    options.scorerCarIndex ?? replayController?.sessionState?.scorerCarIndex ?? 0;
  scenePort?.ballTrajectoryPredictor?.acquireTemporarySuppression?.(source);
  scenePort?.arena?.resetBallTrail?.();
  applyGoalReplayCameraModeSelection(scenePort, cameraMode, source);
  if (options.initialSnapshot && scenePort?.physics) {
    applyReplayFrameToEngine(
      scenePort.physics,
      options.initialSnapshot,
      scenePort.interpolator ?? null,
      options.initialSnapshot,
      1.0
    );
    if (cameraMode === 'director') {
      applyDirectorReplayCamera(
        scenePort.camera,
        scenePort.interpolator,
        replayController?.progress ?? 0,
        scoringTeam,
        0.016,
        scorerCarIndex,
        replayController?.directorCameraState
      );
    }
  }
  if (options.syncHud !== false)
    bindGoalReplayHudCallbacks({ ...options, runtime: scenePort, replayController });
}

export function stepGoalReplaySessionFrame(
  options: GoalReplayFrameStepOptions
): ReplayPlaybackStepResult {
  const { runtime: scenePort, replayController, context } = options;
  if (!replayController) {
    return {
      frame: null,
      progress: 0,
      frameIndex: 0,
      totalFrames: 0,
      isFinished: false,
      incidents: [],
      audioEvents: [],
    };
  }
  const dt = options.dt ?? context?.dt ?? 0.016;
  const source = options.source || 'goal-replay';
  const cameraMode: GoalReplayCameraMode = options.cameraMode || 'director';
  const s = replayController.sessionState;
  const scoringTeam = options.scoringTeam ?? s?.scoringTeam ?? 0;
  const scorerCarIndex = options.scorerCarIndex ?? s?.scorerCarIndex ?? 0;
  const povCarIdx =
    typeof options.povCarIndex === 'number' && options.povCarIndex >= 0
      ? options.povCarIndex
      : scorerCarIndex;
  scenePort?.ballTrajectoryPredictor?.acquireTemporarySuppression?.(source);
  const prevFrameIdx = replayController.currentFrameIndex;
  const stepRes = replayController.stepPlayback(
    dt,
    scenePort?.interpolator ?? null,
    options.applyToEngine ?? true
  );
  if (prevFrameIdx > 0 && replayController.currentFrameIndex === 0)
    scenePort?.arena?.resetBallTrail?.();
  const postState = replayController.sessionState ?? s;
  const curFloat = postState?.cursorFloat ?? stepRes.frameIndex;
  if (postState?.isPaused || postState?.isScrubbing) {
    if (
      typeof replayController.getFrameBufferByIndex === 'function' &&
      postState._lastTrailWarmupCursor !== curFloat
    ) {
      postState._lastTrailWarmupCursor = curFloat;
      warmupArenaTrailsFromReplayWindow(
        scenePort?.arena,
        (idx) => replayController.getFrameBufferByIndex?.(idx) ?? null,
        curFloat
      );
    }
  } else if (postState) {
    postState._lastTrailWarmupCursor = -1;
  }
  if (options.networkStreamSnapshot && scenePort?.physics) {
    applyReplayFrameToEngine(
      scenePort.physics,
      options.networkStreamSnapshot,
      scenePort.interpolator ?? null
    );
  }
  if (options.dispatchEvents !== false) {
    dispatchReplayFrameEvents(
      stepRes as unknown as ReplayStepEventsPayload,
      scenePort ?? null,
      options.eventDispatchOptions
    );
  }
  const effectiveProgress =
    typeof options.overrideProgress === 'number'
      ? options.overrideProgress
      : options.resolveEffectiveProgress
        ? options.resolveEffectiveProgress(stepRes)
        : stepRes.progress;
  applyGoalReplayCameraModeSelection(scenePort, cameraMode, source);
  if (cameraMode === 'director') {
    applyDirectorReplayCamera(
      scenePort?.camera,
      scenePort?.interpolator,
      effectiveProgress,
      scoringTeam,
      dt,
      scorerCarIndex,
      replayController.directorCameraState
    );
  } else if (scenePort && typeof options.povCarIndex === 'number' && options.povCarIndex >= 0) {
    scenePort.replayPovCarIndex = povCarIdx;
    scenePort.playerCarIndex = povCarIdx;
    if (scenePort.arena) scenePort.arena.playerCarIndex = povCarIdx;
  }
  options.onStepAfterEvents?.(stepRes, povCarIdx);
  const postStepState = replayController.sessionState ?? s;
  syncGoalReplayActiveCarAndHud(
    options,
    stepRes,
    povCarIdx,
    effectiveProgress,
    cameraMode,
    postStepState
  );
  if (stepRes.isFinished && !postStepState?.isPaused && !postStepState?.isPersistent) {
    options.onComplete?.(stepRes);
  }
  return stepRes;
}

export function endGoalReplaySession(
  scenePort: GoalReplayRuntimePort | null | undefined,
  replayController: GoalReplayTimelineControllerPort | null | undefined,
  options: EndGoalReplaySessionOptions = {}
): void {
  const source = options.source || null;
  replayController?.endReplaySession?.();
  if (scenePort) {
    scenePort.releaseGoalReplayCameraOverride?.(source);
    scenePort.ballTrajectoryPredictor?.releaseTemporarySuppression?.(source);
    scenePort.ballTrajectoryPredictor?.setSceneContext?.({ isGoalReplayActive: false });
    if (scenePort.arena) {
      scenePort.arena.isGoalReplayActive = false;
      scenePort.arena.resetBallTrail?.();
    }
    scenePort.replayPovCarIndex = null;
    scenePort.camera?.up?.set?.(0, 1, 0);
    if (options.restoreLocalCarFocus) {
      const localCarIdx =
        typeof scenePort.networkReconciler?.localCarIndex === 'number' &&
        scenePort.networkReconciler.localCarIndex >= 0
          ? scenePort.networkReconciler.localCarIndex
          : typeof scenePort.reconciler?.localCarIndex === 'number' &&
              scenePort.reconciler.localCarIndex >= 0
            ? scenePort.reconciler.localCarIndex
            : (options.fallbackLocalCarIndex ?? scenePort.playerCarIndex ?? 0);
      scenePort.playerCarIndex = localCarIdx;
      if (scenePort.arena) scenePort.arena.playerCarIndex = localCarIdx;
      scenePort.camera?.setFocusedCarIndex?.(localCarIdx);
      if (options.syncAfterEnd) {
        scenePort.camera?.resetView?.();
        scenePort.interpolator?.sync?.();
      }
    }
  }
  resetGoalReplayHudStateOnEnd(options);
}
