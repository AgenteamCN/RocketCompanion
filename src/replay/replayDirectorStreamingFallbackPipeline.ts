/**
 * replayDirectorStreamingFallbackPipeline.ts
 * Pure narrow-input pipeline for planned pose interpolation and causal streaming fallback
 * sightline-aligned low-height forward-monotonic framing.
 */

import { SIM_OFFSETS, CAR_STATE_STRIDE, MAX_CARS } from '../physics/RocketSimConstants.ts';
import { REPLAY_DIRECTOR_CONFIG } from '../ui-core/config/replayDirectorConfig.ts';
import {
  clamp,
  smoothstep,
  computeAdaptiveDirectorEyeHeight,
  clampPositionInsideArena,
} from './replayDirectorElevationPipeline.ts';
import type { SuffixDirectorTrajectoryPlan } from './ReplayDirectorTrajectoryPlanner.ts';

export interface DirectorCameraPose {
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  rawEyeX?: number;
  rawEyeY?: number;
  rawEyeZ?: number;
  rawTargetX?: number;
  rawTargetY?: number;
  rawTargetZ?: number;
}

export interface DirectorCameraRuntimeState extends DirectorCameraPose {
  initialized?: boolean;
  smoothedCarX?: number;
  smoothedCarY?: number;
  smoothedCarZ?: number;
  initialSettledCarPos?: { x?: number; y?: number; z?: number } | null;
  activeTouchCarIndex?: number;
  nextTouchCarIndex?: number;
  nextTouchBlend?: number;
  nextTouchBallPos?: { x: number; y: number; z: number } | [number, number, number] | null;
  interceptorCarIndex?: number;
  interceptorBlend?: number;
  postGoalElapsedSec?: number;
  carSwitchBlend?: number;
  lateralBias?: number;
  hasResolvedInitialLateralBias?: boolean;
  scorerCarIndex?: number;
  currentFrameIndex?: number;
  suffixCameraPlan?: SuffixDirectorTrajectoryPlan | null;
  useRecordedCsvPose?: boolean;
  recordedPose?: (DirectorCameraPose & { y?: number }) | null;
  isPaused?: boolean;
  isScrubbing?: boolean;
}

export interface StreamingFallbackCameraPoseInput {
  stateBuffer: ArrayLike<number>;
  prevBuf: ArrayLike<number>;
  alpha: number;
  scoringTeam: number;
  scorerCarIndex?: number;
  progress?: number;
  dt?: number;
  exactDt?: boolean;
  skipDamping: boolean;
  directorState: DirectorCameraRuntimeState | null;
}

export type PlannedPoseLike = Partial<SuffixDirectorTrajectoryPlan['poses'][number]> &
  DirectorCameraPose;

export function interpolatePlannedPose(
  p0: PlannedPoseLike | null | undefined,
  p1: PlannedPoseLike | null | undefined,
  alpha: number,
  skipDamping = false
): DirectorCameraPose | null {
  if (!p0) return null;
  if (!p1 || alpha <= 1e-5) {
    const rawEyeX = p0.rawEyeX ?? p0.eyeX,
      rawEyeY = p0.rawEyeY ?? p0.eyeY,
      rawEyeZ = p0.rawEyeZ ?? p0.eyeZ;
    const rawTargetX = p0.rawTargetX ?? p0.targetX,
      rawTargetY = p0.rawTargetY ?? p0.targetY,
      rawTargetZ = p0.rawTargetZ ?? p0.targetZ;
    return {
      eyeX: skipDamping ? rawEyeX : p0.eyeX,
      eyeY: skipDamping ? rawEyeY : p0.eyeY,
      eyeZ: skipDamping ? rawEyeZ : p0.eyeZ,
      targetX: skipDamping ? rawTargetX : p0.targetX,
      targetY: skipDamping ? rawTargetY : p0.targetY,
      targetZ: skipDamping ? rawTargetZ : p0.targetZ,
      rawEyeX,
      rawEyeY,
      rawEyeZ,
      rawTargetX,
      rawTargetY,
      rawTargetZ,
    };
  }
  const t = clamp(alpha, 0, 1);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const rawEye = clampPositionInsideArena(
    lerp(p0.rawEyeX ?? p0.eyeX, p1.rawEyeX ?? p1.eyeX),
    lerp(p0.rawEyeY ?? p0.eyeY, p1.rawEyeY ?? p1.eyeY),
    lerp(p0.rawEyeZ ?? p0.eyeZ, p1.rawEyeZ ?? p1.eyeZ)
  );
  const rawTargetX = lerp(p0.rawTargetX ?? p0.targetX, p1.rawTargetX ?? p1.targetX);
  const rawTargetY = lerp(p0.rawTargetY ?? p0.targetY, p1.rawTargetY ?? p1.targetY);
  const rawTargetZ = lerp(p0.rawTargetZ ?? p0.targetZ, p1.rawTargetZ ?? p1.targetZ);

  const eye = skipDamping
    ? rawEye
    : clampPositionInsideArena(
        lerp(p0.eyeX, p1.eyeX),
        lerp(p0.eyeY, p1.eyeY),
        lerp(p0.eyeZ, p1.eyeZ)
      );

  return {
    eyeX: eye.x,
    eyeY: eye.y,
    eyeZ: eye.z,
    targetX: skipDamping ? rawTargetX : lerp(p0.targetX, p1.targetX),
    targetY: skipDamping ? rawTargetY : lerp(p0.targetY, p1.targetY),
    targetZ: skipDamping ? rawTargetZ : lerp(p0.targetZ, p1.targetZ),
    rawEyeX: rawEye.x,
    rawEyeY: rawEye.y,
    rawEyeZ: rawEye.z,
    rawTargetX,
    rawTargetY,
    rawTargetZ,
  };
}

export function computeStreamingFallbackCameraPose({
  stateBuffer,
  prevBuf,
  alpha,
  scoringTeam,
  scorerCarIndex,
  progress: rawProgress,
  dt: rawDt,
  exactDt,
  skipDamping,
  directorState,
}: StreamingFallbackCameraPoseInput): DirectorCameraPose {
  const lerpBuf = (offset: number) =>
    prevBuf[offset] + (stateBuffer[offset] - prevBuf[offset]) * alpha;
  const ballX = lerpBuf(SIM_OFFSETS.BALL);
  const ballY = lerpBuf(SIM_OFFSETS.BALL + 1);
  const ballZ = lerpBuf(SIM_OFFSETS.BALL + 2);
  const dt = exactDt ? Math.max(1e-4, Number(rawDt) || 1 / 120) : clamp(rawDt ?? 0.016, 0.001, 0.1);

  const headerCars = Math.min(
    MAX_CARS,
    Math.max(0, Math.round(stateBuffer[SIM_OFFSETS.NUM_CARS] || 0))
  );
  const preferredCarIdx =
    typeof directorState?.activeTouchCarIndex === 'number' &&
    directorState.activeTouchCarIndex >= 0 &&
    directorState.activeTouchCarIndex < headerCars
      ? directorState.activeTouchCarIndex
      : typeof scorerCarIndex === 'number' && scorerCarIndex >= 0 && scorerCarIndex < headerCars
        ? scorerCarIndex
        : 0;

  const carBase = SIM_OFFSETS.CARS + preferredCarIdx * CAR_STATE_STRIDE;
  const hasFocusCar = headerCars > 0 && stateBuffer.length >= carBase + 15;
  const rawCarX = hasFocusCar ? lerpBuf(carBase) : ballX;
  const rawCarY = hasFocusCar ? lerpBuf(carBase + 1) : ballY;
  const rawCarZ = hasFocusCar ? lerpBuf(carBase + 2) : ballZ;

  let carX = rawCarX,
    carY = rawCarY,
    carZ = rawCarZ;
  if (directorState) {
    if (!directorState.initialized || typeof directorState.smoothedCarX !== 'number') {
      const settled = directorState.initialSettledCarPos;
      carX = typeof settled?.x === 'number' ? settled.x : rawCarX;
      carY = typeof settled?.y === 'number' ? settled.y : rawCarY;
      carZ = typeof settled?.z === 'number' ? settled.z : rawCarZ;
    } else {
      const carAlpha = 1.0 - Math.exp(-dt * 8.0);
      carX = directorState.smoothedCarX + (rawCarX - directorState.smoothedCarX) * carAlpha;
      carY =
        (directorState.smoothedCarY ?? rawCarY) +
        (rawCarY - (directorState.smoothedCarY ?? rawCarY)) * carAlpha;
      carZ =
        (directorState.smoothedCarZ ?? rawCarZ) +
        (rawCarZ - (directorState.smoothedCarZ ?? rawCarZ)) * carAlpha;
    }
    if (!skipDamping) {
      Object.assign(directorState, { smoothedCarX: carX, smoothedCarY: carY, smoothedCarZ: carZ });
    }
  }

  const oppCarIdx =
    typeof directorState?.interceptorCarIndex === 'number' &&
    directorState.interceptorCarIndex >= 0 &&
    directorState.interceptorCarIndex < headerCars
      ? directorState.interceptorCarIndex
      : -1;
  const oppBlend = clamp(directorState?.interceptorBlend ?? 0, 0, 0.85);
  const oppBase = oppCarIdx >= 0 ? SIM_OFFSETS.CARS + oppCarIdx * CAR_STATE_STRIDE : -1;
  const hasOppCar = oppBase >= 0 && stateBuffer.length >= oppBase + 15 && oppBlend > 1e-3;
  const oppX = hasOppCar ? lerpBuf(oppBase) : ballX;
  const oppY = hasOppCar ? lerpBuf(oppBase + 1) : ballY;
  const oppZ = hasOppCar ? lerpBuf(oppBase + 2) : ballZ;

  const goalSignY = scoringTeam === 0 ? 1.0 : scoringTeam === 1 ? -1.0 : ballY >= 0 ? 1.0 : -1.0;
  const goalY = goalSignY * 5120.0;

  const postGoalSec = Math.max(0.0, Number(directorState?.postGoalElapsedSec) || 0.0);
  const followTransSec = Math.max(
    0.08,
    REPLAY_DIRECTOR_CONFIG.postGoalScorerFollowTransitionSec ?? 0.28
  );
  const postFollow = smoothstep(0.0, followTransSec * 1.4, postGoalSec);
  const distCarBall = Math.hypot(carX - ballX, carY - ballY, carZ - ballZ);
  const preGoalCarProximityW =
    postGoalSec > 0 ? 1.0 : Math.max(0.65, 1.0 - smoothstep(650.0, 2600.0, distCarBall));
  const preAnchorCarW = (0.45 - 0.15 * oppBlend) * preGoalCarProximityW;
  const preAnchorBallW = 1.0 - preAnchorCarW - 0.15 * oppBlend;

  const anchorX = ballX * preAnchorBallW + carX * preAnchorCarW + oppX * (0.15 * oppBlend);
  const anchorY = ballY * preAnchorBallW + carY * preAnchorCarW + oppY * (0.15 * oppBlend);
  const toGoalX = (0.0 - anchorX) * 0.55;
  const toGoalY = goalSignY * Math.max(950.0, (goalY - anchorY) * goalSignY);
  const dirNorm = Math.hypot(toGoalX, toGoalY) || 1.0;
  const ugX = toGoalX / dirNorm,
    ugY = toGoalY / dirNorm;
  const usX = -ugY,
    usY = ugX;

  const lateralBias = directorState?.lateralBias || 1.0;
  const progress = clamp(rawProgress ?? 0.5, 0, 1);

  const backStart = REPLAY_DIRECTOR_CONFIG.corridorBackDistStart ?? 500.0;
  const backEnd = REPLAY_DIRECTOR_CONFIG.corridorBackDistEnd ?? 400.0;
  const sideBase = REPLAY_DIRECTOR_CONFIG.corridorSideDistBase ?? 760.0;
  const baseHeightUu = REPLAY_DIRECTOR_CONFIG.cameraBaseHeightUu ?? 218.0;
  const aerialSlope = clamp(
    (REPLAY_DIRECTOR_CONFIG.cameraAerialHeightSlope ?? 0.36) * 2.15,
    0.55,
    0.9
  );

  const activeZ =
    Math.max(
      ballZ,
      carZ * preGoalCarProximityW + ballZ * (1.0 - preGoalCarProximityW),
      hasOppCar ? oppZ : 0
    ) *
      0.65 +
    (ballZ * 0.55 + carZ * 0.45) * 0.35;
  const aerialBlend = smoothstep(220.0, 680.0, activeZ);
  const vertSpread = Math.abs(ballZ - carZ) * preGoalCarProximityW;
  const aerialPullback = aerialBlend * 115.0 + Math.min(450.0, vertSpread) * 0.14;

  const carBehind =
    Math.max(0.0, (ballX - carX) * ugX + (ballY - carY) * ugY) * preGoalCarProximityW;
  const oppBehind = hasOppCar
    ? Math.max(0.0, (ballX - oppX) * ugX + (ballY - oppY) * ugY) * oppBlend
    : 0.0;
  const rearDelta = Math.max(carBehind, oppBehind);

  const trailBackDist =
    (backStart - progress * (backStart - backEnd)) * 0.72 +
    Math.min(500.0, rearDelta) +
    aerialPullback * 0.65;
  const wallProx = smoothstep(2200.0, 3800.0, Math.max(Math.abs(ballX), Math.abs(carX)));
  const wallClimbClearance = wallProx * (180.0 + 200.0 * smoothstep(140.0, 820.0, activeZ));
  const trailSideDist =
    (sideBase * (1.0 - 0.12 * progress) + wallClimbClearance + aerialPullback * 0.55) * lateralBias;

  const rawEyeX = anchorX - ugX * trailBackDist + usX * trailSideDist;
  const rawEyeY = anchorY - ugY * trailBackDist + usY * trailSideDist;
  const rawEyeZ = computeAdaptiveDirectorEyeHeight(carZ, baseHeightUu, aerialSlope, ballZ);
  const clampedEye = clampPositionInsideArena(rawEyeX, rawEyeY, rawEyeZ);

  const vbx = ballX - clampedEye.x,
    vby = ballY - clampedEye.y,
    dbHoriz = Math.hypot(vbx, vby) || 1.0;
  const vcx = carX - clampedEye.x,
    vcy = carY - clampedEye.y,
    dcHoriz = Math.hypot(vcx, vcy) || 1.0;
  const vgx = 0.0 - clampedEye.x,
    vgy = goalY - clampedEye.y,
    dgHoriz = Math.hypot(vgx, vgy) || 1.0;

  const closePlayW = 1.0 - smoothstep(250.0, 1450.0, distCarBall);
  const wCarPre = 0.14 + 0.16 * closePlayW;
  const wBallPre = Math.max(0.2, 1.0 - wCarPre);
  const carRayW = wCarPre * (1.0 - postFollow) + 0.65 * postFollow;
  const ballRayW = wBallPre * (1.0 - postFollow) + 0.35 * postFollow;

  let subDx = (vbx / dbHoriz) * ballRayW + (vcx / dcHoriz) * carRayW;
  let subDy = (vby / dbHoriz) * ballRayW + (vcy / dcHoriz) * carRayW;
  const subNorm = Math.hypot(subDx, subDy) || 1.0;
  subDx /= subNorm;
  subDy /= subNorm;

  const ugx = vgx / dgHoriz,
    ugy = vgy / dgHoriz;
  const angleToGoalRad = Math.atan2(subDx * ugy - subDy * ugx, subDx * ugx + subDy * ugy);
  const maxGoalPullRad =
    ((10.5 * Math.PI) / 180.0) * smoothstep(380.0, 950.0, dbHoriz) * (1.0 - postFollow);
  const pullRad = clamp(
    angleToGoalRad * (0.2 + 0.12 * closePlayW),
    -maxGoalPullRad,
    maxGoalPullRad
  );
  const cosPull = Math.cos(pullRad),
    sinPull = Math.sin(pullRad);
  const hdx = subDx * cosPull - subDy * sinPull;
  const hdy = subDx * sinPull + subDy * cosPull;

  const thetaBallDeg = (Math.atan2(ballZ - clampedEye.z, dbHoriz) * 180.0) / Math.PI;
  const thetaCarDeg = (Math.atan2(carZ + 24.0 - clampedEye.z, dcHoriz) * 180.0) / Math.PI;
  const highBallW = smoothstep(300.0, 1250.0, ballZ);
  const carGroundW = 1.0 - smoothstep(90.0, 420.0, carZ);
  const elevRefDeg =
    thetaBallDeg * (0.74 + 0.26 * carGroundW) + thetaCarDeg * (0.26 * (1.0 - carGroundW));
  const upperOffsetDeg =
    (7.5 + 3.5 * highBallW) * (1.0 - carGroundW) + (11.5 + 11.0 * highBallW) * carGroundW;
  const prePitchDeg = clamp(elevRefDeg - upperOffsetDeg, -15.5, -2.5);
  const postPitchDeg = clamp(thetaCarDeg - 6.0, -14.0, -3.0);
  const pitchRad =
    ((prePitchDeg * (1.0 - postFollow) + postPitchDeg * postFollow) * Math.PI) / 180.0;

  const targetDist = Math.pow(dbHoriz, 1.0 - carRayW) * Math.pow(dcHoriz, carRayW);
  const rawTargetX = clampedEye.x + hdx * Math.cos(pitchRad) * targetDist;
  const rawTargetY = clampedEye.y + hdy * Math.cos(pitchRad) * targetDist;
  const rawTargetZ = clamp(clampedEye.z + Math.sin(pitchRad) * targetDist, -450.0, 1980.0);

  if (directorState && !skipDamping) {
    if (!directorState.initialized) {
      Object.assign(directorState, {
        eyeX: clampedEye.x,
        eyeY: clampedEye.y,
        eyeZ: clampedEye.z,
        targetX: rawTargetX,
        targetY: rawTargetY,
        targetZ: rawTargetZ,
        initialized: true,
      });
    } else {
      const eyeAlpha = 1.0 - Math.exp(-dt * (REPLAY_DIRECTOR_CONFIG.eyeDampingRate ?? 5.2));
      const gazeAlpha = 1.0 - Math.exp(-dt * (REPLAY_DIRECTOR_CONFIG.gazeDampingRate ?? 8.5));
      Object.assign(directorState, {
        eyeX: directorState.eyeX + (clampedEye.x - directorState.eyeX) * eyeAlpha,
        eyeY: directorState.eyeY + (clampedEye.y - directorState.eyeY) * eyeAlpha,
        eyeZ: directorState.eyeZ + (clampedEye.z - directorState.eyeZ) * eyeAlpha,
        targetX: directorState.targetX + (rawTargetX - directorState.targetX) * gazeAlpha,
        targetY: directorState.targetY + (rawTargetY - directorState.targetY) * gazeAlpha,
        targetZ: directorState.targetZ + (rawTargetZ - directorState.targetZ) * gazeAlpha,
      });
    }
    const finalClamped = clampPositionInsideArena(
      directorState.eyeX,
      directorState.eyeY,
      directorState.eyeZ
    );
    return {
      eyeX: finalClamped.x,
      eyeY: finalClamped.y,
      eyeZ: finalClamped.z,
      targetX: directorState.targetX,
      targetY: directorState.targetY,
      targetZ: Math.min(directorState.targetZ, finalClamped.z),
      rawEyeX: clampedEye.x,
      rawEyeY: clampedEye.y,
      rawEyeZ: clampedEye.z,
      rawTargetX,
      rawTargetY,
      rawTargetZ,
    };
  }

  return {
    eyeX: clampedEye.x,
    eyeY: clampedEye.y,
    eyeZ: clampedEye.z,
    targetX: rawTargetX,
    targetY: rawTargetY,
    targetZ: rawTargetZ,
    rawEyeX: clampedEye.x,
    rawEyeY: clampedEye.y,
    rawEyeZ: clampedEye.z,
    rawTargetX,
    rawTargetY,
    rawTargetZ,
  };
}
