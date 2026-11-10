/**
 * ReplayDirectorGazeSolver.ts
 * Math primitives, arena boundary clamping, goal explosion detection, and Rule-of-Thirds
 * Upper-Frame Ball + Goal-Corridor Gaze solver for ReplayDirectorTrajectoryPlanner.
 */

import { SIM_OFFSETS } from '../physics/RocketSimConstants.ts';
import { REPLAY_DIRECTOR_CONFIG } from '../ui-core/config/replayDirectorConfig.ts';
import {
  clamp,
  smoothstep,
  wrapAngleDeltaDeg,
  smooth1DZeroPhase,
  clampPositionInsideArena,
  clampNonUpwardDirectorRay,
} from './replayDirectorElevationPipeline.ts';

const TICK_RATE = 120;

export interface ReplayTouchEvent {
  frameIndex: number;
  tick: number;
  carIndex: number;
  team: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  isSaveAttempt?: boolean;
}

export interface PlannedDirectorCameraPose {
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  rawEyeX: number;
  rawEyeY: number;
  rawEyeZ: number;
  rawTargetX: number;
  rawTargetY: number;
  rawTargetZ: number;
  activeTouchCarIndex: number;
  nextTouchCarIndex: number;
  nextTouchBlend: number;
  nextTouchBallPos: { x: number; y: number; z: number } | null;
  interceptorCarIndex: number;
  interceptorBlend: number;
  postGoalElapsedSec: number;
  smoothedCarX: number;
  smoothedCarY: number;
  smoothedCarZ: number;
  carSwitchBlend: number;
  lateralBias: number;
}

export interface SolveDirectorTrajectoryGazeInput {
  N: number;
  goalIdx: number;
  goalY?: number;
  followTransSec: number;
  fullEyeX: Float64Array;
  fullEyeY: Float64Array;
  fullEyeZ: Float64Array;
  eyeXArr?: Float64Array;
  eyeYArr?: Float64Array;
  eyeZArr?: Float64Array;
  rawEyeXArr?: Float64Array;
  rawEyeYArr?: Float64Array;
  rawEyeZArr?: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  bz: Float64Array;
  gazeBallZ?: Float64Array;
  smScx: Float64Array;
  smScy: Float64Array;
  smScz: Float64Array;
  smOcx: Float64Array;
  smOcy: Float64Array;
  smOcz: Float64Array;
  smOppW: Float64Array;
  postShotBallFocus: Float64Array;
  activeScoreCar: Int32Array;
  nextScoreCar: Int32Array;
  nextTouchBlendArr: Float64Array;
  hasNextTouchBall: Uint8Array;
  nextTouchBallX: Float64Array;
  nextTouchBallY: Float64Array;
  nextTouchBallZ: Float64Array;
  activeOppCar: Int32Array;
  carSwitchBlendArr: Float64Array;
  resolvedLateralBias: number;
  scorerCarIdx: number;
  activeScoringTouches: ReplayTouchEvent[];
  oppTouches: ReplayTouchEvent[];
}

export interface SolveDirectorTrajectoryGazeResult {
  poses: PlannedDirectorCameraPose[];
  totalYawPathDeg: number;
  netYawSpanDeg: number;
  lateralBias: number;
  goalLineFrameIdx: number;
  scorerCarIndex: number;
  scoringTouches: ReplayTouchEvent[];
  oppTouches: ReplayTouchEvent[];
}

export interface GoalExplosionFrameSlotLike {
  snapshot?: ArrayLike<number> | null;
  incidents?: Array<{ type?: number }> | null;
  events?: Array<{ type?: number }> | null;
  signals?: Array<{ type?: number; signalType?: number }> | null;
}

export type GoalExplosionFrameInput =
  GoalExplosionFrameSlotLike | ArrayLike<number> | null | undefined;

export function resolveGoalExplosionFrameIndex(
  frames: ReadonlyArray<GoalExplosionFrameInput>,
  goalSignY: number = 1.0,
  candidateIdx: number = -1
): number {
  const N = Array.isArray(frames) ? frames.length : 0;
  if (N === 0) return -1;

  let incidentGoalIdx = -1,
    depth5210Idx = -1,
    depth5120Idx = -1,
    depth5100Idx = -1;
  const getSnap = (item: GoalExplosionFrameInput): ArrayLike<number> | null => {
    if (!item) return null;
    if ('snapshot' in item && item.snapshot) return item.snapshot;
    if ('length' in item && typeof item.length === 'number') return item;
    return null;
  };

  for (let i = 0; i < N; i++) {
    const entry = frames[i];
    if (!entry) continue;
    const snap = getSnap(entry);
    const ballY = snap && snap.length > SIM_OFFSETS.BALL + 1 ? snap[SIM_OFFSETS.BALL + 1] || 0 : 0;
    const signedY = ballY * goalSignY;

    const slotEntry =
      'snapshot' in entry || 'incidents' in entry || 'events' in entry || 'signals' in entry
        ? (entry as GoalExplosionFrameSlotLike)
        : null;
    const evList =
      slotEntry && Array.isArray(slotEntry.incidents) && slotEntry.incidents.length > 0
        ? slotEntry.incidents
        : slotEntry && Array.isArray(slotEntry.events)
          ? slotEntry.events
          : [];
    for (let j = 0; j < evList.length; j++) {
      const inc = evList[j];
      if (inc && (inc.type === 0x0e || inc.type === 14)) {
        incidentGoalIdx = i;
        break;
      }
    }
    if (incidentGoalIdx < 0 && slotEntry && Array.isArray(slotEntry.signals)) {
      for (let j = 0; j < slotEntry.signals.length; j++) {
        const sig = slotEntry.signals[j];
        if (sig && (sig.type === 0x91 || sig.type === 145)) {
          incidentGoalIdx = i;
          break;
        }
      }
    }

    if (depth5210Idx >= 0 && signedY < 5120.0) depth5210Idx = -1;
    if (depth5210Idx < 0 && signedY >= 5210.0) depth5210Idx = i;

    if (depth5120Idx >= 0 && signedY < 5040.0) depth5120Idx = -1;
    if (depth5120Idx < 0 && signedY >= 5120.0) depth5120Idx = i;

    if (depth5100Idx >= 0 && signedY < 5020.0) depth5100Idx = -1;
    if (depth5100Idx < 0 && signedY >= 5100.0) depth5100Idx = i;
  }

  const detectedIdx =
    incidentGoalIdx >= 0
      ? incidentGoalIdx
      : depth5210Idx >= 0
        ? depth5210Idx
        : depth5120Idx >= 0
          ? depth5120Idx
          : depth5100Idx;

  if (typeof candidateIdx === 'number' && candidateIdx >= 0 && candidateIdx < N) {
    if (detectedIdx >= 0 && candidateIdx < detectedIdx) {
      const candSnap = getSnap(frames[candidateIdx]);
      const candY =
        candSnap && candSnap.length > SIM_OFFSETS.BALL + 1
          ? (candSnap[SIM_OFFSETS.BALL + 1] || 0) * goalSignY
          : 0;
      if (candY < 5205.0) return detectedIdx;
    }
    return candidateIdx;
  }

  return detectedIdx;
}

export function solveDirectorTrajectoryGazeAndPoses(
  input: SolveDirectorTrajectoryGazeInput
): SolveDirectorTrajectoryGazeResult {
  const {
    N,
    goalIdx,
    goalY: inputGoalY,
    followTransSec,
    fullEyeX,
    fullEyeY,
    fullEyeZ,
    eyeXArr: preEyeXArr,
    eyeYArr: preEyeYArr,
    eyeZArr: preEyeZArr,
    rawEyeXArr: preRawEyeXArr,
    rawEyeYArr: preRawEyeYArr,
    rawEyeZArr: preRawEyeZArr,
    bx,
    by,
    bz,
    gazeBallZ,
    smScx,
    smScy,
    smScz,
    smOcx,
    smOcy,
    smOppW,
    postShotBallFocus,
    activeScoreCar,
    nextScoreCar,
    nextTouchBlendArr,
    hasNextTouchBall,
    nextTouchBallX,
    nextTouchBallY,
    nextTouchBallZ,
    activeOppCar,
    carSwitchBlendArr,
    resolvedLateralBias,
    scorerCarIdx,
    activeScoringTouches,
    oppTouches,
  } = input;

  const rawEyeXArr = preRawEyeXArr || fullEyeX;
  const rawEyeYArr = preRawEyeYArr || fullEyeY;
  const rawEyeZArr = preRawEyeZArr || fullEyeZ;

  const eyeRate = clamp(REPLAY_DIRECTOR_CONFIG.eyeDampingRate ?? 5.2, 0.8, 25.0);
  const eyeAlpha = 1.0 - Math.exp(-(1 / TICK_RATE) * (eyeRate * 4.5));

  let eyeXArr = preEyeXArr,
    eyeYArr = preEyeYArr,
    eyeZArr = preEyeZArr;
  if (!eyeXArr || !eyeYArr || !eyeZArr) {
    eyeXArr = new Float64Array(N);
    eyeYArr = new Float64Array(N);
    eyeZArr = new Float64Array(N);
    eyeXArr[0] = rawEyeXArr[0];
    eyeYArr[0] = rawEyeYArr[0];
    eyeZArr[0] = rawEyeZArr[0];
    for (let i = 1; i < N; i++) {
      const cl = clampPositionInsideArena(
        eyeXArr[i - 1] + (rawEyeXArr[i] - eyeXArr[i - 1]) * eyeAlpha,
        eyeYArr[i - 1] + (rawEyeYArr[i] - eyeYArr[i - 1]) * eyeAlpha,
        eyeZArr[i - 1] + (rawEyeZArr[i] - eyeZArr[i - 1]) * eyeAlpha
      );
      eyeXArr[i] = cl.x;
      eyeYArr[i] = cl.y;
      eyeZArr[i] = cl.z;
    }
  }

  const baseGazeBallZ = smooth1DZeroPhase(gazeBallZ || bz, 0.14, 2);
  const goalY =
    typeof inputGoalY === 'number' ? inputGoalY : (by[goalIdx] ?? 0) >= 0 ? 5120.0 : -5120.0;

  const rawHorizX = new Float64Array(N),
    rawHorizY = new Float64Array(N),
    rawPitchRad = new Float64Array(N);
  const rawDirX = new Float64Array(N),
    rawDirY = new Float64Array(N),
    rawDirZ = new Float64Array(N);
  const rawDistArr = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const ex = eyeXArr[i],
      ey = eyeYArr[i],
      ez = eyeZArr[i];
    const vbx = bx[i] - ex,
      vby = by[i] - ey;
    const dbHoriz = Math.hypot(vbx, vby) || 1.0;
    const ubx = vbx / dbHoriz,
      uby = vby / dbHoriz;

    const vgx = -ex,
      vgy = goalY - ey;
    const dgHoriz = Math.hypot(vgx, vgy) || 1.0;
    const ugx = vgx / dgHoriz,
      ugy = vgy / dgHoriz;

    const postSec = i > goalIdx ? (i - goalIdx) / TICK_RATE : 0.0;
    const postFollow = smoothstep(0.0, followTransSec * 1.6, postSec);
    const lookCarX = postFollow > 0 ? smScx[i] * (1.0 - 0.35 * postFollow) : smScx[i];
    const lookCarY = postFollow > 0 ? clamp(smScy[i], -4850.0, 4850.0) : smScy[i];

    const vsx = lookCarX - ex,
      vsy = lookCarY - ey;
    const dsHoriz = Math.hypot(vsx, vsy) || 1.0;
    const usx = vsx / dsHoriz,
      usy = vsy / dsHoriz;

    const ow = smOppW[i];
    const vox = smOcx[i] - ex,
      voy = smOcy[i] - ey;
    const doHoriz = Math.hypot(vox, voy) || 1.0;
    const uox = vox / doHoriz,
      uoy = voy / doHoriz;

    const cbDist = Math.hypot(bx[i] - smScx[i], by[i] - smScy[i]);
    const closePlayW = 1.0 - smoothstep(250.0, 1450.0, cbDist);

    const wCarPre = (0.14 + 0.16 * closePlayW) * (1.0 - postShotBallFocus[i]);
    const wOppPre = ow * 0.06 * (1.0 - closePlayW);
    const wBallPre = Math.max(0.2, 1.0 - wCarPre - wOppPre);

    const wCar = wCarPre * (1.0 - postFollow) + 0.65 * postFollow;
    const wOpp = wOppPre * (1.0 - postFollow);
    const wBall = wBallPre * (1.0 - postFollow) + 0.35 * postFollow;

    let subDx = ubx * wBall + usx * wCar + uox * wOpp;
    let subDy = uby * wBall + usy * wCar + uoy * wOpp;
    const subNorm = Math.hypot(subDx, subDy) || 1.0;
    subDx /= subNorm;
    subDy /= subNorm;

    const goalCross = subDx * ugy - subDy * ugx;
    const goalDot = subDx * ugx + subDy * ugy;
    const angleToGoalRad = Math.atan2(goalCross, goalDot);
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

    const thetaBallDeg = (Math.atan2(baseGazeBallZ[i] - ez, dbHoriz) * 180.0) / Math.PI;
    const thetaCarDeg = (Math.atan2(smScz[i] + 24.0 - ez, dsHoriz) * 180.0) / Math.PI;
    const highBallW = smoothstep(300.0, 1250.0, baseGazeBallZ[i]);
    const carGroundW = 1.0 - smoothstep(90.0, 420.0, smScz[i]);
    const elevRefDeg =
      thetaBallDeg * (0.74 + 0.26 * carGroundW) + thetaCarDeg * (0.26 * (1.0 - carGroundW));
    const upperOffsetDeg =
      (7.5 + 3.5 * highBallW) * (1.0 - carGroundW) + (11.5 + 11.0 * highBallW) * carGroundW;
    const prePitchDeg = clamp(elevRefDeg - upperOffsetDeg, -15.5, -2.5);
    const postPitchDeg = clamp(thetaCarDeg - 6.0, -14.0, -3.0);
    const pitchRad =
      ((prePitchDeg * (1.0 - postFollow) + postPitchDeg * postFollow) * Math.PI) / 180.0;

    const [clampedMx, clampedMy, clampedMz] = clampNonUpwardDirectorRay(
      hdx * Math.cos(pitchRad),
      hdy * Math.cos(pitchRad),
      Math.sin(pitchRad),
      0.0
    );

    rawHorizX[i] = hdx;
    rawHorizY[i] = hdy;
    rawPitchRad[i] = pitchRad;
    rawDirX[i] = clampedMx;
    rawDirY[i] = clampedMy;
    rawDirZ[i] = clampedMz;
    rawDistArr[i] = Math.pow(dbHoriz, 1.0 - wCar) * Math.pow(dsHoriz, wCar);
  }

  const gazeRate = clamp(REPLAY_DIRECTOR_CONFIG.gazeDampingRate ?? 8.5, 1.0, 30.0);
  const baseGazeAlpha = clamp(gazeRate / 75.0, 0.04, 0.24);
  const pitchGazeAlpha = clamp(baseGazeAlpha * 0.75, 0.04, 0.14);
  const maxYawBudget = clamp(REPLAY_DIRECTOR_CONFIG.maxTotalYawBudgetDeg ?? 320.0, 90.0, 355.0);

  let smHorizX = smooth1DZeroPhase(rawHorizX, baseGazeAlpha, 2);
  let smHorizY = smooth1DZeroPhase(rawHorizY, baseGazeAlpha, 2);
  let smPitchRad = smooth1DZeroPhase(rawPitchRad, pitchGazeAlpha, 2);
  const smDist = smooth1DZeroPhase(rawDistArr, 0.14, 2);

  const computeTotalYawPath = (dxArr: Float64Array, dyArr: Float64Array) => {
    let sumYaw = 0;
    let prevYaw = (Math.atan2(dxArr[0], dyArr[0]) * 180.0) / Math.PI;
    let minY = prevYaw,
      maxY = prevYaw,
      accYaw = prevYaw;
    for (let i = 1; i < N; i++) {
      const y = (Math.atan2(dxArr[i], dyArr[i]) * 180.0) / Math.PI;
      const d = wrapAngleDeltaDeg(y, prevYaw);
      sumYaw += Math.abs(d);
      accYaw += d;
      if (accYaw < minY) minY = accYaw;
      if (accYaw > maxY) maxY = accYaw;
      prevYaw = y;
    }
    return { totalYawPathDeg: sumYaw, netYawSpanDeg: maxY - minY };
  };

  let yawStats = computeTotalYawPath(smHorizX, smHorizY);
  let extraSmoothIter = 0;
  while (yawStats.totalYawPathDeg > maxYawBudget && extraSmoothIter < 6) {
    smHorizX = smooth1DZeroPhase(smHorizX, 0.08, 2);
    smHorizY = smooth1DZeroPhase(smHorizY, 0.08, 2);
    smPitchRad = smooth1DZeroPhase(smPitchRad, 0.06, 2);
    yawStats = computeTotalYawPath(smHorizX, smHorizY);
    extraSmoothIter++;
  }

  const poses: PlannedDirectorCameraPose[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const [rDx, rDy, rDz] = clampNonUpwardDirectorRay(rawDirX[i], rawDirY[i], rawDirZ[i], 0.0);
    const rDist = rawDistArr[i];
    const rtx = rawEyeXArr[i] + rDx * rDist;
    const rty = rawEyeYArr[i] + rDy * rDist;
    const rtz = clamp(rawEyeZArr[i] + rDz * rDist, -450.0, 1980.0);

    const hNorm = Math.hypot(smHorizX[i], smHorizY[i]) || 1.0;
    const uhx = smHorizX[i] / hNorm,
      uhy = smHorizY[i] / hNorm;
    const pRad = clamp(smPitchRad[i], (-15.5 * Math.PI) / 180.0, (-2.5 * Math.PI) / 180.0);
    const [sDx, sDy, sDz] = clampNonUpwardDirectorRay(
      uhx * Math.cos(pRad),
      uhy * Math.cos(pRad),
      Math.sin(pRad),
      0.0
    );
    const dist = smDist[i];
    const tx = eyeXArr[i] + sDx * dist;
    const ty = eyeYArr[i] + sDy * dist;
    const tz = clamp(eyeZArr[i] + sDz * dist, -450.0, 1980.0);

    poses[i] = {
      eyeX: eyeXArr[i],
      eyeY: eyeYArr[i],
      eyeZ: eyeZArr[i],
      targetX: tx,
      targetY: ty,
      targetZ: tz,
      rawEyeX: rawEyeXArr[i],
      rawEyeY: rawEyeYArr[i],
      rawEyeZ: rawEyeZArr[i],
      rawTargetX: rtx,
      rawTargetY: rty,
      rawTargetZ: rtz,
      activeTouchCarIndex: activeScoreCar[i],
      nextTouchCarIndex: nextScoreCar[i],
      nextTouchBlend: nextTouchBlendArr[i],
      nextTouchBallPos: hasNextTouchBall[i]
        ? { x: nextTouchBallX[i], y: nextTouchBallY[i], z: nextTouchBallZ[i] }
        : null,
      interceptorCarIndex: activeOppCar[i],
      interceptorBlend: smOppW[i],
      postGoalElapsedSec: i > goalIdx ? (i - goalIdx) / TICK_RATE : 0,
      smoothedCarX: smScx[i],
      smoothedCarY: smScy[i],
      smoothedCarZ: smScz[i],
      carSwitchBlend: carSwitchBlendArr[i],
      lateralBias: resolvedLateralBias,
    };
  }

  return {
    poses,
    totalYawPathDeg: yawStats.totalYawPathDeg,
    netYawSpanDeg: yawStats.netYawSpanDeg,
    lateralBias: resolvedLateralBias,
    goalLineFrameIdx: goalIdx,
    scorerCarIndex: scorerCarIdx,
    scoringTouches: activeScoringTouches,
    oppTouches,
  };
}
