import { hudStore } from '../../runtimeUiPort.ts';
import type {
  ReplayFrameEnginePort,
  ReplayFrameInterpolatorStatePort,
} from '../../../replay/ReplayFrameInterpolator.ts';
import type {
  DirectorCameraRuntimeState,
  DirectorCameraTargetPort,
} from '../../../replay/ReplayDirectorCamera.ts';
import type {
  DispatchReplayEventsOptions,
  ReplayEventDispatcherRuntimePort,
} from '../../../replay/ReplayFrameEventDispatcher.ts';
import type { ReplayCarEntryRuntimePort } from '../../../replay/replayDirectorCarRosterPipeline.ts';
import type {
  ReplayInterpolatorPort,
  ReplayPhysicsEnginePort,
  ReplaySessionInitOptions,
  ReplaySessionState,
} from '../../../replay/ReplayDirectorStatePipeline.ts';
import type { ReplayPlaybackStepResult } from '../../../replay/ReplayTimelineController.ts';
import type {
  GoalReplayCameraMode,
  GoalReplayCarStateViewLike,
  GoalReplayHudControllerPort,
  GoalReplayHudRuntimePort,
  GoalReplayHudSessionOptions as BaseGoalReplayHudSessionOptions,
} from './goalReplayHudPipeline.ts';

export interface GoalReplayCameraPort extends DirectorCameraTargetPort {
  setFocusedCarIndex?: (carIndex: number) => void;
  resetView?: () => void;
  getDirectorFov?: () => number;
  getFreeCamFov?: () => number;
  setFreeCamFov?: (fov: number) => void;
  setFreeCamPose?: (eyeThreeJs: number[], targetThreeJs: number[]) => void;
  up?: { set?: (x: number, y: number, z: number) => void } | null;
}

export interface GoalReplayInterpolatorPort
  extends ReplayInterpolatorPort, ReplayFrameInterpolatorStatePort {
  alpha: number;
  prevState: Float32Array;
  currState: Float32Array;
  sync?: (timestamp?: number) => void;
  getCurrCarStateView?: (carIndex: number) => GoalReplayCarStateViewLike | null | undefined;
}

export interface GoalReplayRuntimePort
  extends GoalReplayHudRuntimePort, ReplayEventDispatcherRuntimePort, ReplayCarEntryRuntimePort {
  physics?:
    | (ReplayFrameEnginePort &
        ReplayPhysicsEnginePort &
        NonNullable<ReplayCarEntryRuntimePort['physics']> & {
          setCarHitbox?: (carIndex: number, hitboxId: string) => void;
        })
    | null;
  interpolator?: GoalReplayInterpolatorPort | null;
  camera?: GoalReplayCameraPort | null;
  arena?:
    | (NonNullable<ReplayCarEntryRuntimePort['arena']> & {
        playerCarIndex?: number;
        isGoalReplayActive?: boolean;
        cars?: Array<{ visible?: boolean } | null | undefined>;
        setCarLoadout?: (carIndex: number, loadout: Record<string, unknown>) => void;
        resetBallTrail?: () => void;
      })
    | null;
  ballTrajectoryPredictor?: {
    clear?: () => void;
    acquireTemporarySuppression?: (source?: string) => void;
    releaseTemporarySuppression?: (source?: string | null) => void;
    setSceneContext?: (ctx: { isGoalReplayActive?: boolean }) => void;
  } | null;
  match?: {
    state?: { phase?: string; scorer?: number | null; scorerCarIndex?: number | null } | null;
  } | null;
  networkReconciler?: {
    localCarIndex?: number;
    replayPlaybackMode?: boolean;
    lastParsedPacket?: { stateSnapshot?: Float32Array | null } | null;
  } | null;
  reconciler?: { localCarIndex?: number } | null;
  playerCarIndex?: number;
  replayPovCarIndex?: number | null;
  acquireGoalReplayCameraOverride?: (source?: string) => void;
  releaseGoalReplayCameraOverride: (source?: string | null) => void;
  isGoalReplayCameraOverrideActive?: () => boolean;
}

export interface GoalReplayTimelineControllerPort extends GoalReplayHudControllerPort {
  progress: number;
  currentFrameIndex: number;
  directorCameraState?: DirectorCameraRuntimeState | null;
  sessionState: Partial<ReplaySessionState> & {
    isActive?: boolean;
    scoringTeam?: number;
    scorerCarIndex?: number;
    isPaused?: boolean;
    isPersistent?: boolean;
    isScrubbing?: boolean;
    playbackSpeed?: number;
    _lastTrailWarmupCursor?: number;
  };
  beginReplaySession: (options?: ReplaySessionInitOptions) => number;
  endReplaySession?: () => void;
  stepPlayback: (
    dtSeconds: number,
    interpolator?: ReplayInterpolatorPort | null,
    applyToEngine?: boolean
  ) => ReplayPlaybackStepResult;
}

export type GoalReplayHudSessionOptions = BaseGoalReplayHudSessionOptions<
  GoalReplayRuntimePort,
  GoalReplayTimelineControllerPort
>;

export interface GoalReplayFrameContextPort {
  dt?: number;
  activeCar?: number;
  activeCarMesh?: unknown;
  playerCarView?: GoalReplayCarStateViewLike | null;
  isSupersonic?: boolean;
  curBoost?: number;
}

export interface GoalReplayFrameStepOptions {
  runtime?: GoalReplayRuntimePort | null;
  replayController?: GoalReplayTimelineControllerPort | null;
  context?: GoalReplayFrameContextPort | null;
  source?: string;
  dt?: number;
  applyToEngine?: boolean;
  dispatchEvents?: boolean;
  eventDispatchOptions?: DispatchReplayEventsOptions;
  cameraMode?: GoalReplayCameraMode;
  scoringTeam?: number;
  scorerCarIndex?: number;
  povCarIndex?: number | null;
  isUnlimitedBoost?: boolean;
  syncActiveCarContext?: boolean;
  syncPlayerThrottleFromCarView?: boolean;
  syncCarAudioControls?: boolean;
  syncBoostToHud?: boolean;
  emitWillEndChoreography?: boolean;
  emitWillEndSignal?: boolean;
  syncHudProgress?: boolean;
  networkStreamSnapshot?: Float32Array | null;
  overrideProgress?: number | null;
  resolveEffectiveProgress?: (stepRes: ReplayPlaybackStepResult) => number;
  onStepAfterEvents?: (stepRes: ReplayPlaybackStepResult, povCarIdx: number) => void;
  onComplete?: (stepRes: ReplayPlaybackStepResult) => void;
}

export interface EndGoalReplaySessionOptions {
  source?: string | null;
  clearHud?: boolean;
  resetHudFlags?: boolean;
  restoreLocalCarFocus?: boolean;
  fallbackLocalCarIndex?: number;
  syncAfterEnd?: boolean;
}

export interface GoalReplayCarViewEvaluation {
  activeCar: number;
  activeCarMesh: unknown;
  playerCarView: GoalReplayCarStateViewLike | null | undefined;
  isSupersonic: boolean;
  curBoost: number;
  playerThrottle: number;
  jump: boolean;
  boost: boolean;
}

export function evaluateGoalReplayCarContext(
  v: GoalReplayCarStateViewLike | null | undefined,
  activeCarMesh: unknown,
  povCarIdx: number
): GoalReplayCarViewEvaluation {
  const isSupersonic = Boolean(v?.isSupersonic && !v?.isDemoed);
  const curBoost = v?.boost ?? 0;
  let playerThrottle = 0;
  let jump = false;
  let boost = false;
  if (v) {
    const fwdSpeed =
      (v.velX ?? 0) * (v.fwdX ?? 0) + (v.velY ?? 0) * (v.fwdY ?? 0) + (v.velZ ?? 0) * (v.fwdZ ?? 0);
    playerThrottle = Math.abs(fwdSpeed) > 25 ? (fwdSpeed > 0 ? 1 : -1) : 0;
    jump = Boolean(v.isJumping);
    boost = Boolean(v.isBoosting);
  }
  return {
    activeCar: povCarIdx,
    activeCarMesh,
    playerCarView: v,
    isSupersonic,
    curBoost,
    playerThrottle,
    jump,
    boost,
  };
}

export function applyGoalReplayCarAudioControls(
  audioTarget: GoalReplayHudRuntimePort | null | undefined,
  ev: GoalReplayCarViewEvaluation
): void {
  if (!audioTarget || !ev.playerCarView) return;
  audioTarget.playerThrottle = ev.playerThrottle;
  audioTarget.playerControls = {
    ...(audioTarget.neutralControls || {}),
    throttle: ev.playerThrottle,
    jump: ev.jump,
    boost: ev.boost,
  };
}

export function shouldEmitGoalReplayWillEndSignal(
  stepRes: { totalFrames?: number; frameIndex?: number },
  isPaused: boolean,
  isPersistent: boolean
): boolean {
  const total = stepRes.totalFrames || 0;
  return (
    !isPaused && !isPersistent && total > 0 && Math.max(0, total - (stepRes.frameIndex || 0)) <= 78
  );
}

export function syncGoalReplayActiveCarAndHud(
  options: GoalReplayFrameStepOptions,
  stepRes: ReplayPlaybackStepResult,
  povCarIdx: number,
  effectiveProgress: number,
  cameraMode: GoalReplayCameraMode,
  postStepState: GoalReplayTimelineControllerPort['sessionState'] | null | undefined
): void {
  const { runtime: scenePort, context } = options;

  if (options.syncActiveCarContext !== false && context) {
    const activeReplayCarView = scenePort?.interpolator?.getCurrCarStateView?.(povCarIdx);
    const activeCarMesh = scenePort?.arena?.cars?.[povCarIdx];
    const evalCar = evaluateGoalReplayCarContext(activeReplayCarView, activeCarMesh, povCarIdx);
    context.activeCar = evalCar.activeCar;
    context.activeCarMesh = evalCar.activeCarMesh;
    context.playerCarView = evalCar.playerCarView ?? null;
    context.isSupersonic = evalCar.isSupersonic;
    context.curBoost = evalCar.curBoost;
    if (activeReplayCarView) {
      if (options.syncPlayerThrottleFromCarView ?? options.syncCarAudioControls ?? false) {
        applyGoalReplayCarAudioControls(scenePort, evalCar);
      }
      if (options.syncBoostToHud !== false) {
        hudStore
          .getState()
          .setBoost(
            activeReplayCarView.boost,
            Boolean(activeReplayCarView.isBoosting),
            Boolean(options.isUnlimitedBoost)
          );
      }
    }
  }

  const shouldEmitWillEnd = options.emitWillEndChoreography ?? options.emitWillEndSignal ?? true;
  if (
    shouldEmitWillEnd &&
    shouldEmitGoalReplayWillEndSignal(
      stepRes,
      Boolean(postStepState?.isPaused),
      Boolean(postStepState?.isPersistent)
    )
  ) {
    hudStore.getState().setChoreographySignal('goal-replay-will-end');
  }

  if (options.syncHudProgress !== false) {
    hudStore.getState().setReplayState({
      replayProgress: effectiveProgress,
      replayFrameIndex: stepRes.frameIndex,
      replayTotalFrames: stepRes.totalFrames,
      replayPaused: postStepState?.isPaused,
      replayPersistent: postStepState?.isPersistent,
      replayCameraMode: cameraMode,
      replaySpeed: postStepState?.playbackSpeed,
    });
  }
}

export function resetGoalReplayHudStateOnEnd(options: EndGoalReplaySessionOptions): void {
  const hud = hudStore.getState();
  if (options.clearHud === true) {
    if (typeof hud.clearReplayState === 'function') {
      hud.clearReplayState();
    } else {
      hud.setReplayState?.({
        replayProgress: 0,
        replayFrameIndex: 0,
        replayPaused: false,
        replayPersistent: false,
        replayCameraMode: 'director',
        replayScorerName: null,
        replayScorerTeam: null,
        replayScorerAnthemId: null,
        replayBallSpeedKph: null,
        replayAssistName: null,
        onReplaySeekNormalized: null,
        onReplayTogglePause: null,
        onReplayCycleSpeed: null,
        onReplayToggleCameraMode: null,
        onReplaySelectPovCar: null,
      });
    }
  } else if (options.resetHudFlags !== false) {
    hud.setReplayState?.({
      replayPaused: false,
      replayPersistent: false,
      replayCameraMode: 'director',
      onReplaySelectPovCar: null,
    });
  }
}
