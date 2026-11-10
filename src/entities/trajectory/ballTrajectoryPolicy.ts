/**
 * ballTrajectoryPolicy.ts
 * Pure scene-context, temporary override, and live sampling state-machine decision
 * policy for BallTrajectoryPredictor.
 *
 * Mirrors VehicleNameTagBoostBorderPolicy so subsystems and modes (such as Goal Replay,
 * Podium, or diagnostic tuners) can temporarily suppress or override Ball Trajectory
 * computation and rendering regardless of active camera mode (Cinematic Director or POV).
 */

import {
  hasTrajectoryCoordinateDeviation,
  hasTrajectoryVelocityImpulse,
  isBallMovingAboveTrajectoryThreshold,
} from './ballTrajectoryGeometryPipeline.ts';
import type {
  LiveSamplingStepInput,
  LiveTrajectorySamplingDecision,
  TrajectorySamplingConfig,
  TrajectoryUpdateKind,
} from './ballTrajectoryTelemetryPipeline.ts';

export type {
  LiveSamplingStepInput,
  LiveTrajectorySamplingDecision,
  TrajectorySamplingConfig,
  TrajectoryUpdateKind,
};

export type TrajectorySceneContext = 'matchPlaying' | 'goalReplay' | 'podium' | 'staticPreview';

export interface TrajectorySceneFlags {
  matchPlaying?: boolean;
  goalReplay?: boolean;
  podium?: boolean;
  staticPreview?: boolean;
}

export type BallTrajectoryOverride = boolean | TrajectorySceneFlags | null;

export interface ResolveBallTrajectoryActivationInput {
  enabled: boolean;
  forcePredictAnyMovement: boolean;
  staticPreviewActive: boolean;
  isGoalReplayActive: boolean;
  isPodiumActive?: boolean;
  suppressionSourcesCount: number;
  systemOverride?: BallTrajectoryOverride;
  runtimeOverride?: BallTrajectoryOverride;
}

export interface ResolvedBallTrajectoryActivation {
  allowed: boolean;
  sceneContext: TrajectorySceneContext;
  suppressedByOverride: boolean;
}

function isSceneFlagsObject(
  value: BallTrajectoryOverride | undefined
): value is TrajectorySceneFlags {
  return Boolean(value && typeof value === 'object');
}

export function resolveTrajectorySceneContext(
  isGoalReplayActive: boolean,
  isPodiumActive: boolean = false,
  staticPreviewActive: boolean = false
): TrajectorySceneContext {
  if (isGoalReplayActive) return 'goalReplay';
  if (isPodiumActive) return 'podium';
  if (staticPreviewActive) return 'staticPreview';
  return 'matchPlaying';
}

export function resolveBallTrajectoryActivation(
  input: ResolveBallTrajectoryActivationInput
): ResolvedBallTrajectoryActivation {
  const {
    enabled,
    forcePredictAnyMovement,
    staticPreviewActive,
    isGoalReplayActive,
    isPodiumActive = false,
    suppressionSourcesCount,
    systemOverride,
    runtimeOverride,
  } = input;

  const sceneContext = resolveTrajectorySceneContext(
    isGoalReplayActive,
    isPodiumActive,
    staticPreviewActive
  );

  // Explicit source-counted temporary suppression locks take highest priority
  if (suppressionSourcesCount > 0) {
    return { allowed: false, sceneContext, suppressedByOverride: true };
  }

  const activeOverride: BallTrajectoryOverride =
    systemOverride !== undefined && systemOverride !== null
      ? systemOverride
      : runtimeOverride !== undefined && runtimeOverride !== null
        ? runtimeOverride
        : null;

  if (activeOverride !== null) {
    if (typeof activeOverride === 'boolean') {
      return {
        allowed: activeOverride,
        sceneContext,
        suppressedByOverride: !activeOverride,
      };
    }
    if (isSceneFlagsObject(activeOverride)) {
      const sceneRule = activeOverride[sceneContext];
      if (typeof sceneRule === 'boolean') {
        return {
          allowed: sceneRule,
          sceneContext,
          suppressedByOverride: !sceneRule,
        };
      }
    }
  }

  // Goal Replay (both Cinematic Director Camera and POV) and Podium suppress
  // Ball Trajectory Prediction by default so no WASM trajectory simulation or
  // 3D dashed line rendering occurs during replay playback.
  if (sceneContext === 'goalReplay' || sceneContext === 'podium') {
    return { allowed: false, sceneContext, suppressedByOverride: true };
  }

  const allowed = Boolean(enabled || staticPreviewActive || forcePredictAnyMovement);
  return { allowed, sceneContext, suppressedByOverride: false };
}

function fullPredictDecision(
  reason: TrajectoryUpdateKind,
  carHitCountDelta = 0,
  deviationCountDelta = 0,
  markMovingFast = false
): LiveTrajectorySamplingDecision {
  return {
    action: 'predict',
    forceFull: true,
    deltaTicks: 0,
    reason,
    carHitCountDelta,
    deviationCountDelta,
    markMovingFast,
  };
}

/**
 * Pure decision function for the per-tick live ball trajectory sampling state machine.
 */
export function resolveLiveTrajectorySamplingDecision(
  input: LiveSamplingStepInput
): LiveTrajectorySamplingDecision {
  const {
    isActive,
    lastUpdatedTick,
    validCachedCount,
    currentTick,
    rawPosX,
    rawPosY,
    rawPosZ,
    rawVelX,
    rawVelY,
    rawVelZ,
    lastVelX,
    lastVelY,
    lastVelZ,
    pendingCarBallHit,
    pendingIntentionalReset = false,
    isMultiTickCarContact = false,
    forcePredictAnyMovement,
    rawPredictedPoints,
    cfg,
  } = input;

  const hasImpulse = hasTrajectoryVelocityImpulse(
    rawVelX,
    rawVelY,
    rawVelZ,
    lastVelX,
    lastVelY,
    lastVelZ
  );
  const isFastEnough = isBallMovingAboveTrajectoryThreshold(
    rawVelX,
    rawVelY,
    rawVelZ,
    rawPosZ,
    forcePredictAnyMovement,
    cfg.velocityThresholdUu
  );
  const carHitTriggered = pendingCarBallHit && cfg.recomputeOnCarHit !== false;
  const updateMode = cfg.updateMode || 'continuous-incremental';
  const deviationThreshold = Math.max(0.5, Number(cfg.deviationThresholdUu) || 5.0);

  if (!isActive || pendingIntentionalReset) {
    if (isFastEnough || carHitTriggered || hasImpulse) {
      return fullPredictDecision(
        carHitTriggered ? 'full-car-hit' : 'full-initial',
        carHitTriggered ? 1 : 0,
        0,
        true
      );
    }
    return pendingIntentionalReset ? { action: 'sleep' } : { action: 'noop' };
  }

  if (updateMode !== 'continuous-incremental' && updateMode !== 'full-every-tick') {
    if (carHitTriggered || (cfg.recomputeOnWorldBounce && hasImpulse)) {
      return fullPredictDecision(
        carHitTriggered ? 'full-car-hit' : 'full-world-bounce',
        carHitTriggered ? 1 : 0
      );
    }
    const elapsedSnapshotTicks = Math.floor(currentTick - lastUpdatedTick);
    if (
      elapsedSnapshotTicks >= 0 &&
      elapsedSnapshotTicks < validCachedCount &&
      hasTrajectoryCoordinateDeviation(
        rawPosX,
        rawPosY,
        rawPosZ,
        rawPredictedPoints,
        elapsedSnapshotTicks,
        deviationThreshold
      )
    ) {
      if (isMultiTickCarContact && cfg.recomputeOnCarHit !== false) {
        return fullPredictDecision('full-car-hit', 1, 0);
      }
      return fullPredictDecision('full-deviation', 0, 1);
    }
    return { action: 'noop' };
  }

  const deltaTicks = Math.floor(currentTick - lastUpdatedTick);
  if (deltaTicks < 0 || deltaTicks >= validCachedCount) {
    return fullPredictDecision('full-initial', 0, 0, true);
  }
  if (carHitTriggered) {
    return fullPredictDecision('full-car-hit', 1);
  }
  if (cfg.recomputeOnWorldBounce && hasImpulse) {
    return fullPredictDecision('full-world-bounce');
  }
  if (deltaTicks > 0) {
    if (
      hasTrajectoryCoordinateDeviation(
        rawPosX,
        rawPosY,
        rawPosZ,
        rawPredictedPoints,
        deltaTicks,
        deviationThreshold
      )
    ) {
      if (isMultiTickCarContact && cfg.recomputeOnCarHit !== false) {
        return fullPredictDecision('full-car-hit', 1, 0);
      }
      return fullPredictDecision('full-deviation', 0, 1);
    }
    if (!isFastEnough && !forcePredictAnyMovement) {
      return { action: 'sleep' };
    }
    const forceFull = updateMode === 'full-every-tick';
    return {
      action: 'predict',
      forceFull,
      deltaTicks,
      reason: forceFull ? 'full-forced' : 'incremental-tail',
      carHitCountDelta: 0,
      deviationCountDelta: 0,
      markMovingFast: false,
    };
  }

  return { action: 'cached-tick' };
}
