import {
  SIM_OFFSETS,
  CAR_STATE_STRIDE,
  CAR_STATE_OFFSETS,
} from '../../physics/RocketSimConstants.ts';
import { RAW_STRIDE, POINT_STRIDE, MAX_STEPS } from './ballTrajectoryGeometryPipeline.ts';

import type {
  AnomalyPhysicsCarTeamPort,
  AnomalyTickMetricsSummary,
  BallState18Snapshot,
  BallTrajectoryAnomalySummary,
  CarProximitySnapshot,
  LiveTrajectoryTickRecord,
  PredictionSpaceSnapshot,
  TrajectoryAnomalyBufferGroup,
  TrajectoryAnomalySample,
  TrajectoryAnomalyTriggerKind,
  TrajectoryArenaSeamRegion,
  TrajectoryPredictedSliceSample,
} from './ballTrajectoryAnomalyTypes.ts';

export type {
  AnomalyPhysicsCarTeamPort,
  AnomalyTickMetricsSummary,
  BallState18Snapshot,
  BallTrajectoryAnomalySummary,
  CarProximitySnapshot,
  LiveTrajectoryTickRecord,
  PredictionSpaceSnapshot,
  TrajectoryAnomalyBufferGroup,
  TrajectoryAnomalySample,
  TrajectoryAnomalyTriggerKind,
  TrajectoryArenaSeamRegion,
  TrajectoryPredictedSliceSample,
};

function round4(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

function roundVec3(x: number, y: number, z: number): [number, number, number] {
  return [round4(x), round4(y), round4(z)];
}

/**
 * Classify which arena surface or curved seam the ball is currently near.
 * Highlights ceiling-sidewall seam, floor-sidewall seam, corner curve, and backwall seams.
 */
export function classifyArenaSeamRegion(
  posX: number,
  posY: number,
  posZ: number
): TrajectoryArenaSeamRegion {
  const absX = Math.abs(posX);
  const absY = Math.abs(posY);

  const nearFloorCurve = posZ <= 285;
  const nearCeilingCurve = posZ >= 1760;
  const nearSidewallCurve = absX >= 3780;
  const nearBackwallCurve = absY >= 4800;
  const nearCornerBevel = absX + absY >= 7680;
  const nearGoalMouth = absY >= 4920 && absX <= 1050 && posZ <= 780;

  if (nearGoalMouth) {
    return 'goal-mouth-lip';
  }
  if (nearCornerBevel) {
    return 'corner-curve';
  }
  if (nearSidewallCurve && nearCeilingCurve) {
    return 'ceiling-sidewall-seam';
  }
  if (nearSidewallCurve && nearFloorCurve) {
    return 'floor-sidewall-seam';
  }
  if (nearBackwallCurve && nearCeilingCurve) {
    return 'backwall-ceiling-seam';
  }
  if (nearBackwallCurve && nearFloorCurve) {
    return 'backwall-floor-seam';
  }
  if (nearSidewallCurve) {
    return 'sidewall-flat';
  }
  if (nearBackwallCurve) {
    return 'backwall-flat';
  }
  if (posZ <= 140) {
    return 'floor-flat';
  }
  if (posZ >= 1900) {
    return 'ceiling-flat';
  }
  return 'mid-air';
}

export function createEmptyBallState18Snapshot(): BallState18Snapshot {
  return {
    pos: [0, 0, 0],
    rotMat: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    vel: [0, 0, 0],
    angVel: [0, 0, 0],
    speedUuPerSec: 0,
    angSpeedRadPerSec: 0,
  };
}

export function writeBallState18Snapshot(
  statePtr: Float32Array,
  out: BallState18Snapshot
): BallState18Snapshot {
  const b = SIM_OFFSETS.BALL;
  const px = statePtr[b] ?? 0;
  const py = statePtr[b + 1] ?? 0;
  const pz = statePtr[b + 2] ?? 0;
  const vx = statePtr[b + 12] ?? 0;
  const vy = statePtr[b + 13] ?? 0;
  const vz = statePtr[b + 14] ?? 0;
  const wx = statePtr[b + 15] ?? 0;
  const wy = statePtr[b + 16] ?? 0;
  const wz = statePtr[b + 17] ?? 0;

  out.pos[0] = round4(px);
  out.pos[1] = round4(py);
  out.pos[2] = round4(pz);

  out.rotMat[0] = round4(statePtr[b + 3] ?? 1);
  out.rotMat[1] = round4(statePtr[b + 4] ?? 0);
  out.rotMat[2] = round4(statePtr[b + 5] ?? 0);
  out.rotMat[3] = round4(statePtr[b + 6] ?? 0);
  out.rotMat[4] = round4(statePtr[b + 7] ?? 1);
  out.rotMat[5] = round4(statePtr[b + 8] ?? 0);
  out.rotMat[6] = round4(statePtr[b + 9] ?? 0);
  out.rotMat[7] = round4(statePtr[b + 10] ?? 0);
  out.rotMat[8] = round4(statePtr[b + 11] ?? 1);

  out.vel[0] = round4(vx);
  out.vel[1] = round4(vy);
  out.vel[2] = round4(vz);

  out.angVel[0] = round4(wx);
  out.angVel[1] = round4(wy);
  out.angVel[2] = round4(wz);

  out.speedUuPerSec = round4(Math.hypot(vx, vy, vz));
  out.angSpeedRadPerSec = round4(Math.hypot(wx, wy, wz));
  return out;
}

export function copyBallState18Snapshot(
  source: BallState18Snapshot,
  out: BallState18Snapshot = createEmptyBallState18Snapshot()
): BallState18Snapshot {
  out.pos[0] = source.pos[0];
  out.pos[1] = source.pos[1];
  out.pos[2] = source.pos[2];
  for (let i = 0; i < 9; i++) {
    out.rotMat[i] = source.rotMat[i]!;
  }
  out.vel[0] = source.vel[0];
  out.vel[1] = source.vel[1];
  out.vel[2] = source.vel[2];
  out.angVel[0] = source.angVel[0];
  out.angVel[1] = source.angVel[1];
  out.angVel[2] = source.angVel[2];
  out.speedUuPerSec = source.speedUuPerSec;
  out.angSpeedRadPerSec = source.angSpeedRadPerSec;
  return out;
}

export function extractBallState18Snapshot(
  statePtr: Float32Array,
  out?: BallState18Snapshot
): BallState18Snapshot {
  return writeBallState18Snapshot(statePtr, out ?? createEmptyBallState18Snapshot());
}

export function createEmptyLiveTrajectoryTickRecord(): LiveTrajectoryTickRecord {
  return {
    tick: -1,
    updateKind: 'idle',
    wasIncrementalShift: false,
    needFull: false,
    carBallHitEvent: false,
    worldBounceEvent: false,
    seamRegion: 'mid-air',
    closestCarGapUu: 99999,
    liveBallState18: createEmptyBallState18Snapshot(),
    expectedBeforeStepPos: [0, 0, 0],
    expectedBeforeStepVel: [0, 0, 0],
    expectedBeforeStepAngVel: [0, 0, 0],
    posErrorUu: 0,
    velErrorUuPerSec: 0,
    angVelErrorRadPerSec: 0,
    wasmSlice0PosErrorUu: 0,
    wasmSlice0VelErrorUuPerSec: 0,
    wasmSlice0AngVelErrorRadPerSec: 0,
    tailContinuityErrorUu: 0,
  };
}

export function cloneLiveTrajectoryTickRecord(
  source: LiveTrajectoryTickRecord
): LiveTrajectoryTickRecord {
  return {
    tick: source.tick,
    updateKind: source.updateKind,
    wasIncrementalShift: source.wasIncrementalShift,
    needFull: source.needFull,
    carBallHitEvent: source.carBallHitEvent,
    worldBounceEvent: source.worldBounceEvent,
    seamRegion: source.seamRegion,
    closestCarGapUu: source.closestCarGapUu,
    liveBallState18: copyBallState18Snapshot(source.liveBallState18),
    expectedBeforeStepPos: [
      source.expectedBeforeStepPos[0],
      source.expectedBeforeStepPos[1],
      source.expectedBeforeStepPos[2],
    ],
    expectedBeforeStepVel: [
      source.expectedBeforeStepVel[0],
      source.expectedBeforeStepVel[1],
      source.expectedBeforeStepVel[2],
    ],
    expectedBeforeStepAngVel: [
      source.expectedBeforeStepAngVel[0],
      source.expectedBeforeStepAngVel[1],
      source.expectedBeforeStepAngVel[2],
    ],
    posErrorUu: source.posErrorUu,
    velErrorUuPerSec: source.velErrorUuPerSec,
    angVelErrorRadPerSec: source.angVelErrorRadPerSec,
    wasmSlice0PosErrorUu: source.wasmSlice0PosErrorUu,
    wasmSlice0VelErrorUuPerSec: source.wasmSlice0VelErrorUuPerSec,
    wasmSlice0AngVelErrorRadPerSec: source.wasmSlice0AngVelErrorRadPerSec,
    tailContinuityErrorUu: source.tailContinuityErrorUu,
  };
}

export function computeClosestCarSurfaceGapUu(statePtr: Float32Array): number {
  const b = SIM_OFFSETS.BALL;
  const bx = statePtr[b] ?? 0;
  const by = statePtr[b + 1] ?? 0;
  const bz = statePtr[b + 2] ?? 0;

  const numCars = Math.max(0, Math.floor(statePtr[SIM_OFFSETS.NUM_CARS] ?? 0));
  let closestSurfaceGapUu = Number.POSITIVE_INFINITY;
  const combinedRadiusApprox = 178.0;

  for (let i = 0; i < numCars; i++) {
    const c = SIM_OFFSETS.CARS + i * CAR_STATE_STRIDE;
    const cx = statePtr[c + CAR_STATE_OFFSETS.POS] ?? 0;
    const cy = statePtr[c + CAR_STATE_OFFSETS.POS + 1] ?? 0;
    const cz = statePtr[c + CAR_STATE_OFFSETS.POS + 2] ?? 0;
    const centerDist = Math.hypot(bx - cx, by - cy, bz - cz);
    const gap = Math.max(0, centerDist - combinedRadiusApprox);
    if (gap < closestSurfaceGapUu) {
      closestSurfaceGapUu = gap;
    }
  }

  return Number.isFinite(closestSurfaceGapUu) ? round4(closestSurfaceGapUu) : 99999;
}

export function extractCarProximitySnapshots(
  phys: AnomalyPhysicsCarTeamPort | null | undefined,
  statePtr: Float32Array
): { cars: CarProximitySnapshot[]; closestSurfaceGapUu: number } {
  const b = SIM_OFFSETS.BALL;
  const bx = statePtr[b] ?? 0;
  const by = statePtr[b + 1] ?? 0;
  const bz = statePtr[b + 2] ?? 0;

  const numCars = Math.max(0, Math.floor(statePtr[SIM_OFFSETS.NUM_CARS] ?? 0));
  const cars: CarProximitySnapshot[] = [];
  let closestSurfaceGapUu = Number.POSITIVE_INFINITY;

  // Approximate ball radius (93.15 UU) + Octane half-diagonal (~85 UU) = ~178 UU
  const combinedRadiusApprox = 178.0;

  for (let i = 0; i < numCars; i++) {
    const c = SIM_OFFSETS.CARS + i * CAR_STATE_STRIDE;
    const cx = statePtr[c + CAR_STATE_OFFSETS.POS] ?? 0;
    const cy = statePtr[c + CAR_STATE_OFFSETS.POS + 1] ?? 0;
    const cz = statePtr[c + CAR_STATE_OFFSETS.POS + 2] ?? 0;
    const vx = statePtr[c + CAR_STATE_OFFSETS.VEL] ?? 0;
    const vy = statePtr[c + CAR_STATE_OFFSETS.VEL + 1] ?? 0;
    const vz = statePtr[c + CAR_STATE_OFFSETS.VEL + 2] ?? 0;
    const centerDist = Math.hypot(bx - cx, by - cy, bz - cz);
    const gap = Math.max(0, centerDist - combinedRadiusApprox);
    if (gap < closestSurfaceGapUu) {
      closestSurfaceGapUu = gap;
    }
    cars.push({
      carIndex: i,
      team: phys?._carSpecs?.[i]?.team ?? i % 2,
      pos: roundVec3(cx, cy, cz),
      vel: roundVec3(vx, vy, vz),
      centerDistanceUu: round4(centerDist),
      approxSurfaceGapUu: round4(gap),
    });
  }

  return {
    cars,
    closestSurfaceGapUu: Number.isFinite(closestSurfaceGapUu) ? round4(closestSurfaceGapUu) : 99999,
  };
}

export function readRawSliceSample(
  rawSlices: Float32Array,
  sliceIndex: number,
  tickOffset: number
): TrajectoryPredictedSliceSample {
  const base = sliceIndex * RAW_STRIDE;
  return {
    sliceIndex,
    tickOffset,
    pos: roundVec3(rawSlices[base] ?? 0, rawSlices[base + 1] ?? 0, rawSlices[base + 2] ?? 0),
    vel: roundVec3(rawSlices[base + 3] ?? 0, rawSlices[base + 4] ?? 0, rawSlices[base + 5] ?? 0),
    angVel: roundVec3(rawSlices[base + 6] ?? 0, rawSlices[base + 7] ?? 0, rawSlices[base + 8] ?? 0),
  };
}

export function buildPredictionSpaceSnapshot(
  spaceId: PredictionSpaceSnapshot['spaceId'],
  anchorTick: number,
  anchorUpdateKind: string,
  anchorBallState18: BallState18Snapshot,
  rawSlices: Float32Array,
  sliceCount: number,
  focusSliceIndex = 0
): PredictionSpaceSnapshot {
  const clampedCount = Math.max(0, Math.min(MAX_STEPS, sliceCount));
  const nearSlices: TrajectoryPredictedSliceSample[] = [];
  const horizonSlices: TrajectoryPredictedSliceSample[] = [];

  const windowStart = Math.max(0, Math.min(clampedCount - 1, focusSliceIndex - 8));
  const windowEnd = Math.min(clampedCount, windowStart + 40);

  for (let i = 0; i < Math.min(24, clampedCount); i++) {
    nearSlices.push(readRawSliceSample(rawSlices, i, i + 1));
  }
  for (let i = windowStart; i < windowEnd; i++) {
    if (i >= 24) {
      nearSlices.push(readRawSliceSample(rawSlices, i, i + 1));
    }
  }

  const stride = 12;
  for (let i = 0; i < clampedCount; i += stride) {
    horizonSlices.push(readRawSliceSample(rawSlices, i, i + 1));
  }
  if (clampedCount > 0 && (clampedCount - 1) % stride !== 0) {
    horizonSlices.push(readRawSliceSample(rawSlices, clampedCount - 1, clampedCount));
  }

  return {
    spaceId,
    anchorTick,
    anchorUpdateKind,
    anchorBallState18,
    sliceCount: clampedCount,
    nearSlices,
    horizonSlices,
  };
}

export function computeTailContinuityErrorUu(
  prevPoints: Float32Array,
  prevPredictionCount: number,
  rawSlices: Float32Array,
  actualCount: number,
  deltaTicks: number
): number {
  if (prevPredictionCount <= deltaTicks || actualCount <= prevPredictionCount - deltaTicks) {
    return 0;
  }
  const checkRawIdx = prevPredictionCount - 1 - deltaTicks;
  const checkPrevIdx = prevPredictionCount - 1;
  const rawBase = checkRawIdx * RAW_STRIDE;
  const prevBase = checkPrevIdx * POINT_STRIDE;

  // Note: prevPoints stores Three.js coords: [px, pz, py]
  const prevRawX = prevPoints[prevBase] ?? 0;
  const prevRawY = prevPoints[prevBase + 2] ?? 0;
  const prevRawZ = prevPoints[prevBase + 1] ?? 0;

  const dx = (rawSlices[rawBase] ?? 0) - prevRawX;
  const dy = (rawSlices[rawBase + 1] ?? 0) - prevRawY;
  const dz = (rawSlices[rawBase + 2] ?? 0) - prevRawZ;
  return round4(Math.hypot(dx, dy, dz));
}
