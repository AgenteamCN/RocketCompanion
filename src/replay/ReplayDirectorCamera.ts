/**
 * ReplayDirectorCamera.ts
 * Real-time Goal Replay AutoCam pose evaluation, interpolation, and Three.js camera application.
 */

import { SIM_OFFSETS, BALL_STATE_STRIDE } from '../physics/RocketSimConstants.ts';
import {
  DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
  REPLAY_DIRECTOR_CONFIG,
} from '../ui-core/config/replayDirectorConfig.ts';
import { decodeReplayDirectorTelemetryFromState } from './ReplayFrameInterpolator.ts';
import { clamp } from './replayDirectorElevationPipeline.ts';
import type { SuffixDirectorTrajectoryPlan } from './ReplayDirectorTrajectoryPlanner.ts';
import {
  interpolatePlannedPose,
  computeStreamingFallbackCameraPose,
  type DirectorCameraPose,
  type DirectorCameraRuntimeState,
} from './replayDirectorStreamingFallbackPipeline.ts';

export type { DirectorCameraPose, DirectorCameraRuntimeState };

export interface ComputeGoalReplayCameraPoseOptions {
  prevStateBuffer?: ArrayLike<number> | null;
  alpha?: number;
  skipDamping?: boolean;
  directorState?: DirectorCameraRuntimeState | null;
  suffixCameraPlan?: SuffixDirectorTrajectoryPlan | null;
  frameIndex?: number;
  progress?: number;
  dt?: number;
  exactDt?: boolean;
  scorerCarIndex?: number;
}

export interface ApplyDirectorCameraOptions {
  scoringTeam?: number;
  scorerCarIndex?: number;
  progress?: number;
  frameIndex?: number;
  directorState?: DirectorCameraRuntimeState | null;
  fallbackBuffer?: ArrayLike<number> | null;
}

export interface DirectorCameraTargetPort {
  isFreeCam?: boolean;
  camera?: {
    fov?: number;
    aspect?: number;
    up?: { set: (x: number, y: number, z: number) => void };
    position: { set: (x: number, y: number, z: number) => void };
    lookAt: (x: number, y: number, z: number) => void;
    updateProjectionMatrix?: () => void;
  } | null;
  setDirectorCameraPoseThreeJs?: (
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    targetX: number,
    targetY: number,
    targetZ: number
  ) => void;
}

export interface DirectorInterpolatorSnapshot {
  currState?: ArrayLike<number> | null;
  prevState?: ArrayLike<number> | null;
  currFrame?: ArrayLike<number> | null;
  prevFrame?: ArrayLike<number> | null;
  frame?: ArrayLike<number> | null;
  sim?: { state?: ArrayLike<number> | null } | null;
  alpha?: number;
  frameIndex?: number;
  progress?: number;
  isPaused?: boolean;
  isScrubbing?: boolean;
}

/**
 * Computes pure-math 3D Rocket League AutoCam placement
 * (Unreal Units: X right, Y forward toward Orange goal, Z up).
 * Uses the preplanned Suffix Safe-Zone Backward Trajectory when available (or embedded in stateBuffer),
 * and falls back to sightline-aligned low-height forward-monotonic framing for streaming single frames.
 */
export function computeGoalReplayCameraPose(
  stateBuffer: ArrayLike<number> | null | undefined,
  scoringTeam: number = 0,
  options: ComputeGoalReplayCameraPoseOptions = {}
): DirectorCameraPose {
  if (!stateBuffer || stateBuffer.length < SIM_OFFSETS.BALL + BALL_STATE_STRIDE) {
    return { eyeX: 0, eyeY: -3600, eyeZ: 210, targetX: 0, targetY: 0, targetZ: 120 };
  }

  const prevBuf =
    options.prevStateBuffer &&
    options.prevStateBuffer.length >= SIM_OFFSETS.BALL + BALL_STATE_STRIDE
      ? options.prevStateBuffer
      : stateBuffer;
  const alpha =
    typeof options.alpha === 'number' && Number.isFinite(options.alpha)
      ? clamp(options.alpha, 0, 1)
      : 1.0;
  const skipDamping = Boolean(options.skipDamping);
  const directorState = options.directorState || null;

  // 1. Check for full-window Suffix Safe-Zone trajectory plan on directorState or options
  const suffixPlan = options.suffixCameraPlan || directorState?.suffixCameraPlan || null;
  if (suffixPlan && Array.isArray(suffixPlan.poses) && suffixPlan.poses.length > 0) {
    const poses = suffixPlan.poses;
    const total = poses.length;
    let exactIdx =
      typeof options.frameIndex === 'number' && Number.isFinite(options.frameIndex)
        ? options.frameIndex
        : typeof directorState?.currentFrameIndex === 'number'
          ? directorState.currentFrameIndex
          : clamp(options.progress ?? 0, 0, 1) * Math.max(0, total - 1);
    exactIdx = clamp(exactIdx, 0, Math.max(0, total - 1));
    const baseIdx = Math.floor(exactIdx);
    const nextIdx = Math.min(total - 1, baseIdx + 1);
    const frac = exactIdx > baseIdx ? exactIdx - baseIdx : alpha < 1.0 ? alpha : 0.0;
    const p0 = poses[baseIdx];
    const p1 = poses[nextIdx] || p0;
    const pose = interpolatePlannedPose(p0, p1, frac, skipDamping);

    if (directorState && !skipDamping && pose) {
      Object.assign(directorState, {
        eyeX: pose.eyeX,
        eyeY: pose.eyeY,
        eyeZ: pose.eyeZ,
        targetX: pose.targetX,
        targetY: pose.targetY,
        targetZ: pose.targetZ,
        activeTouchCarIndex: p0.activeTouchCarIndex,
        nextTouchCarIndex: p0.nextTouchCarIndex,
        nextTouchBlend: p0.nextTouchBlend,
        nextTouchBallPos: p0.nextTouchBallPos,
        interceptorCarIndex: p0.interceptorCarIndex,
        interceptorBlend: p0.interceptorBlend,
        postGoalElapsedSec: p0.postGoalElapsedSec,
        smoothedCarX: p0.smoothedCarX,
        smoothedCarY: p0.smoothedCarY,
        smoothedCarZ: p0.smoothedCarZ,
        carSwitchBlend: p0.carSwitchBlend,
        lateralBias: p0.lateralBias,
        initialized: true,
      });
    }
    return pose || { eyeX: 0, eyeY: -3600, eyeZ: 210, targetX: 0, targetY: 0, targetZ: 120 };
  }

  // 2. Check for server-embedded planned pose in stateBuffer (Car Slot 7 telemetry)
  const embeddedTelemetry = decodeReplayDirectorTelemetryFromState(stateBuffer);
  if (directorState && embeddedTelemetry) {
    Object.assign(directorState, {
      activeTouchCarIndex: embeddedTelemetry.activeTouchCarIndex,
      nextTouchCarIndex: embeddedTelemetry.nextTouchCarIndex,
      nextTouchBlend: embeddedTelemetry.nextTouchBlend,
      nextTouchBallPos: embeddedTelemetry.nextTouchBallPos,
      ...(typeof embeddedTelemetry.interceptorCarIndex === 'number'
        ? {
            interceptorCarIndex: embeddedTelemetry.interceptorCarIndex,
            interceptorBlend: embeddedTelemetry.interceptorBlend ?? 0,
          }
        : {}),
      ...(typeof embeddedTelemetry.postGoalElapsedSec === 'number'
        ? { postGoalElapsedSec: embeddedTelemetry.postGoalElapsedSec }
        : {}),
      ...(typeof embeddedTelemetry.lateralBias === 'number' && embeddedTelemetry.lateralBias !== 0
        ? {
            lateralBias: embeddedTelemetry.lateralBias,
            hasResolvedInitialLateralBias: true,
          }
        : {}),
      ...(typeof embeddedTelemetry.scorerCarIndex === 'number' &&
      embeddedTelemetry.scorerCarIndex >= 0
        ? { scorerCarIndex: embeddedTelemetry.scorerCarIndex }
        : {}),
    });
  }

  if (embeddedTelemetry?.plannedPose) {
    const prevEmbedded =
      prevBuf !== stateBuffer ? decodeReplayDirectorTelemetryFromState(prevBuf) : null;
    const p0 = prevEmbedded?.plannedPose || embeddedTelemetry.plannedPose;
    const p1 = embeddedTelemetry.plannedPose;
    const pose = interpolatePlannedPose(
      p0,
      p1,
      prevEmbedded?.plannedPose ? alpha : 0.0,
      skipDamping
    );
    if (directorState && !skipDamping && pose) {
      Object.assign(directorState, {
        eyeX: pose.eyeX,
        eyeY: pose.eyeY,
        eyeZ: pose.eyeZ,
        targetX: pose.targetX,
        targetY: pose.targetY,
        targetZ: pose.targetZ,
        initialized: true,
      });
    }
    return pose || { eyeX: 0, eyeY: -3600, eyeZ: 210, targetX: 0, targetY: 0, targetZ: 120 };
  }

  // 3. Causal streaming fallback (sightline-aligned low-height forward-monotonic framing)
  return computeStreamingFallbackCameraPose({
    stateBuffer,
    prevBuf,
    alpha,
    scoringTeam,
    scorerCarIndex: options.scorerCarIndex,
    progress: options.progress,
    dt: options.dt,
    exactDt: options.exactDt,
    skipDamping,
    directorState,
  });
}

/**
 * Applies the Rocket League AutoCam Director pose to the active Three.js camera.
 * Note: Unreal (X right, Y forward, Z up) maps to Three.js (X right, Y up, Z forward).
 */
export function applyDirectorReplayCamera(
  cameraManager: DirectorCameraTargetPort | null | undefined,
  stepOrInterpolator: DirectorInterpolatorSnapshot | null | undefined,
  optionsOrProgress: number | ApplyDirectorCameraOptions = {},
  dtOrScoringTeam: number = 0.016,
  maybeDt: number = 0.016,
  maybeScorerCarIndex: number = 0,
  maybeDirectorState: DirectorCameraRuntimeState | null = null
): void {
  const cam = cameraManager?.camera;
  if (!cam || cameraManager?.isFreeCam) return;

  let currFrame: ArrayLike<number> | null = null;
  let prevFrame: ArrayLike<number> | null = null;
  let alpha = 1.0;
  let scoringTeam = 0;
  let scorerCarIndex = 0;
  let progress = 0.5;
  let frameIndex: number | undefined = undefined;
  let directorState: DirectorCameraRuntimeState | null = null;
  let dt = 0.016;

  if (typeof optionsOrProgress === 'number') {
    progress = optionsOrProgress;
    scoringTeam = typeof dtOrScoringTeam === 'number' ? dtOrScoringTeam : 0;
    dt = typeof maybeDt === 'number' ? maybeDt : 0.016;
    scorerCarIndex = typeof maybeScorerCarIndex === 'number' ? maybeScorerCarIndex : 0;
    directorState = maybeDirectorState || null;

    currFrame =
      stepOrInterpolator?.currState ||
      stepOrInterpolator?.currFrame ||
      stepOrInterpolator?.frame ||
      stepOrInterpolator?.sim?.state ||
      null;
    prevFrame = stepOrInterpolator?.prevState || stepOrInterpolator?.prevFrame || currFrame;
    alpha = typeof stepOrInterpolator?.alpha === 'number' ? stepOrInterpolator.alpha : 1.0;
    if (typeof stepOrInterpolator?.frameIndex === 'number') {
      frameIndex = stepOrInterpolator.frameIndex + alpha;
    }
  } else {
    const options = optionsOrProgress || {};
    dt = typeof dtOrScoringTeam === 'number' ? dtOrScoringTeam : 0.016;
    scoringTeam = options.scoringTeam ?? 0;
    scorerCarIndex = options.scorerCarIndex ?? 0;
    progress = stepOrInterpolator?.progress ?? options.progress ?? 0.5;
    directorState = options.directorState || null;

    currFrame =
      stepOrInterpolator?.currFrame ||
      stepOrInterpolator?.frame ||
      stepOrInterpolator?.currState ||
      options.fallbackBuffer ||
      null;
    prevFrame = stepOrInterpolator?.prevFrame || stepOrInterpolator?.prevState || currFrame;
    alpha = typeof stepOrInterpolator?.alpha === 'number' ? stepOrInterpolator.alpha : 1.0;
    if (typeof stepOrInterpolator?.frameIndex === 'number') {
      frameIndex = stepOrInterpolator.frameIndex + alpha;
    } else if (typeof options.frameIndex === 'number') {
      frameIndex = options.frameIndex;
    }
  }

  if (!currFrame) return;

  const applyPoseToCameraManager = (
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    targetX: number,
    targetY: number,
    targetZ: number
  ) => {
    if (typeof cameraManager?.setDirectorCameraPoseThreeJs === 'function') {
      cameraManager.setDirectorCameraPoseThreeJs(eyeX, eyeZ, eyeY, targetX, targetZ, targetY);
      return;
    }
    const desiredHFov = Math.max(
      10,
      Math.min(150, Number(REPLAY_DIRECTOR_CONFIG.cameraFovDeg) || DEFAULT_REPLAY_DIRECTOR_FOV_DEG)
    );
    const aspect = Number(cam.aspect) > 0 ? Number(cam.aspect) : 16 / 9;
    const desiredVFov =
      2 * Math.atan(Math.tan((desiredHFov * Math.PI) / 360) / aspect) * (180 / Math.PI);
    if (typeof cam.fov === 'number' && Math.abs(cam.fov - desiredVFov) > 0.001) {
      cam.fov = desiredVFov;
      cam.updateProjectionMatrix?.();
    }
    if (cam.up) {
      cam.up.set(0, 1, 0);
    }
    cam.position.set(eyeX, eyeZ, eyeY);
    cam.lookAt(targetX, targetZ, targetY);
  };

  if (directorState?.useRecordedCsvPose && directorState?.recordedPose) {
    const rec = directorState.recordedPose;
    Object.assign(directorState, {
      eyeX: rec.eyeX,
      eyeY: rec.y ?? rec.eyeY,
      eyeZ: rec.eyeZ,
      targetX: rec.targetX,
      targetY: rec.targetY,
      targetZ: rec.targetZ,
      initialized: true,
    });
    applyPoseToCameraManager(rec.eyeX, rec.eyeY, rec.eyeZ, rec.targetX, rec.targetY, rec.targetZ);
    return;
  }

  const isReplayFrozen = Boolean(
    stepOrInterpolator?.isPaused ||
    stepOrInterpolator?.isScrubbing ||
    directorState?.isPaused ||
    directorState?.isScrubbing
  );

  if (isReplayFrozen && directorState?.initialized) {
    applyPoseToCameraManager(
      directorState.eyeX,
      directorState.eyeY,
      directorState.eyeZ,
      directorState.targetX,
      directorState.targetZ !== undefined ? directorState.targetY : 0,
      directorState.targetZ
    );
    return;
  }

  const pose = computeGoalReplayCameraPose(currFrame, scoringTeam, {
    prevStateBuffer: prevFrame || currFrame,
    alpha,
    scorerCarIndex,
    progress,
    frameIndex,
    directorState,
    dt: isReplayFrozen ? 0.0 : dt,
    exactDt: isReplayFrozen,
  });

  applyPoseToCameraManager(
    pose.eyeX,
    pose.eyeY,
    pose.eyeZ,
    pose.targetX,
    pose.targetY,
    pose.targetZ
  );
}
