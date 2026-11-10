/**
 * ballTrajectoryGeometryPipeline.ts
 * Pure coordinate conversion, O(1) incremental tail shift, impulse/deviation trigger detection,
 * 3D surface bounce normal extraction, and dashed segment/range builders for BallTrajectoryPredictor.
 */

import { BALL_PRED_STRIDE, GRAVITY_Z, FIXED_TIMESTEP } from '../../physics/RocketSimConstants.ts';

export interface LiveBallPositionLike {
  x: number;
  y: number;
  z: number;
}

export interface TrajectoryDashRange {
  startTick: number;
  endTick: number;
}

export const RAW_STRIDE = BALL_PRED_STRIDE;
export const POINT_STRIDE = 3;
export const MAX_STEPS = 600;
export const BOUNCE_MARKER_STRIDE = 8; // [threeX, threeY, threeZ, normX, normY, normZ, progress01, speedMag]
export const MAX_BOUNCE_MARKERS = 12;

export function copyWasmPredictionToTrajectoryBuffers(
  rawData: Float32Array,
  actualCount: number,
  predictedPoints: Float32Array,
  rawPredictedPoints: Float32Array,
  rawSlicesBuffer?: Float32Array
): void {
  if (rawSlicesBuffer && rawData.length >= actualCount * BALL_PRED_STRIDE) {
    rawSlicesBuffer.set(rawData.subarray(0, actualCount * BALL_PRED_STRIDE), 0);
  }
  for (let i = 0; i < actualCount; i++) {
    const srcOffset = i * BALL_PRED_STRIDE; // posX, posY, posZ, velX, velY, velZ, angVelX, angVelY, angVelZ
    const dstOffset = i * 3;
    const x = rawData[srcOffset + 0];
    const y = rawData[srcOffset + 1];
    const z = rawData[srcOffset + 2];

    // Three.js coordinates for rendering (X=x, Y=z, Z=y)
    predictedPoints[dstOffset + 0] = x;
    predictedPoints[dstOffset + 1] = z;
    predictedPoints[dstOffset + 2] = y;

    // Raw RocketSim native coordinates (UU)
    rawPredictedPoints[dstOffset + 0] = x;
    rawPredictedPoints[dstOffset + 1] = y;
    rawPredictedPoints[dstOffset + 2] = z;
  }
}

/**
 * Attempts an O(deltaTicks) shift + tail-append when WASM BallPredTracker stepped incrementally.
 * Returns true if the buffer was shifted incrementally, or false if a full copy was performed
 * (because WASM detected a car-ball hit or state deviation and recomputed all slices).
 */
export function tryIncrementalShiftTrajectoryBuffers(
  rawData: Float32Array,
  actualCount: number,
  prevCount: number,
  deltaTicks: number,
  predictedPoints: Float32Array,
  rawPredictedPoints: Float32Array,
  rawSlicesBuffer?: Float32Array
): boolean {
  if (
    deltaTicks <= 0 ||
    deltaTicks >= actualCount ||
    prevCount !== actualCount ||
    actualCount <= 1
  ) {
    copyWasmPredictionToTrajectoryBuffers(
      rawData,
      actualCount,
      predictedPoints,
      rawPredictedPoints,
      rawSlicesBuffer
    );
    return false;
  }

  const shiftedPrevOffset = deltaTicks * 3;
  const dx = rawData[0] - rawPredictedPoints[shiftedPrevOffset + 0];
  const dy = rawData[1] - rawPredictedPoints[shiftedPrevOffset + 1];
  const dz = rawData[2] - rawPredictedPoints[shiftedPrevOffset + 2];

  const tailStart = actualCount - deltaTicks;
  const preTailIdx = tailStart - 1;
  const prevTailOffset = (actualCount - 1) * 3;
  const ptdx = rawData[preTailIdx * BALL_PRED_STRIDE + 0] - rawPredictedPoints[prevTailOffset + 0];
  const ptdy = rawData[preTailIdx * BALL_PRED_STRIDE + 1] - rawPredictedPoints[prevTailOffset + 1];
  const ptdz = rawData[preTailIdx * BALL_PRED_STRIDE + 2] - rawPredictedPoints[prevTailOffset + 2];

  const midIdx = tailStart >> 1;
  const prevMidOffset = (midIdx + deltaTicks) * 3;
  const mdx = rawData[midIdx * BALL_PRED_STRIDE + 0] - rawPredictedPoints[prevMidOffset + 0];
  const mdy = rawData[midIdx * BALL_PRED_STRIDE + 1] - rawPredictedPoints[prevMidOffset + 1];
  const mdz = rawData[midIdx * BALL_PRED_STRIDE + 2] - rawPredictedPoints[prevMidOffset + 2];

  let headVelAndSpinMatch = true;
  if (rawSlicesBuffer && rawSlicesBuffer.length >= actualCount * BALL_PRED_STRIDE) {
    const shiftedSliceOffset = deltaTicks * BALL_PRED_STRIDE;
    const dvx = rawData[3] - rawSlicesBuffer[shiftedSliceOffset + 3];
    const dvy = rawData[4] - rawSlicesBuffer[shiftedSliceOffset + 4];
    const dvz = rawData[5] - rawSlicesBuffer[shiftedSliceOffset + 5];
    const dax = rawData[6] - rawSlicesBuffer[shiftedSliceOffset + 6];
    const day = rawData[7] - rawSlicesBuffer[shiftedSliceOffset + 7];
    const daz = rawData[8] - rawSlicesBuffer[shiftedSliceOffset + 8];
    headVelAndSpinMatch =
      dvx * dvx + dvy * dvy + dvz * dvz < 0.16 && dax * dax + day * day + daz * daz < 0.0004;
  }

  // WASM performed a pure incremental tail shift only if slice 0 (pos, vel, angVel) AND
  // mid/pre-tail shifted slices match the previous prediction buffer.
  if (
    dx * dx + dy * dy + dz * dz <= 0.25 &&
    headVelAndSpinMatch &&
    ptdx * ptdx + ptdy * ptdy + ptdz * ptdz <= 1e-3 &&
    mdx * mdx + mdy * mdy + mdz * mdz <= 1e-3
  ) {
    const totalFloats = actualCount * 3;
    predictedPoints.copyWithin(0, shiftedPrevOffset, totalFloats);
    rawPredictedPoints.copyWithin(0, shiftedPrevOffset, totalFloats);

    if (rawSlicesBuffer && rawData.length >= actualCount * BALL_PRED_STRIDE) {
      rawSlicesBuffer.copyWithin(0, deltaTicks * BALL_PRED_STRIDE, actualCount * BALL_PRED_STRIDE);
      rawSlicesBuffer.set(
        rawData.subarray(tailStart * BALL_PRED_STRIDE, actualCount * BALL_PRED_STRIDE),
        tailStart * BALL_PRED_STRIDE
      );
    }

    for (let i = tailStart; i < actualCount; i++) {
      const srcOffset = i * BALL_PRED_STRIDE;
      const dstOffset = i * 3;
      const x = rawData[srcOffset + 0];
      const y = rawData[srcOffset + 1];
      const z = rawData[srcOffset + 2];

      predictedPoints[dstOffset + 0] = x;
      predictedPoints[dstOffset + 1] = z;
      predictedPoints[dstOffset + 2] = y;

      rawPredictedPoints[dstOffset + 0] = x;
      rawPredictedPoints[dstOffset + 1] = y;
      rawPredictedPoints[dstOffset + 2] = z;
    }
    return true;
  }

  copyWasmPredictionToTrajectoryBuffers(
    rawData,
    actualCount,
    predictedPoints,
    rawPredictedPoints,
    rawSlicesBuffer
  );
  return false;
}

/**
 * Detects when the newly appended incremental tail slice (`actualCount - 1`)
 * experiences a surface/seam contact impulse after accumulating multiple 1-tick
 * `shadowBall->SetState(predData.back())` extensions (which lose 1 ULP per tick
 * and clear Bullet's persistent contact manifold), or when incremental steps
 * exceed 120 ticks. Refreshing with a continuous batch pass eliminates tail drift
 * on floor-sidewall, ceiling-sidewall, and corner curves.
 */
export function shouldRefreshTailSeamContact(
  rawData: Float32Array,
  actualCount: number,
  incStepsSinceFullBatch: number
): boolean {
  if (actualCount < 2 || incStepsSinceFullBatch < 16) {
    return false;
  }
  if (incStepsSinceFullBatch >= 120) {
    return true;
  }
  const bLast = (actualCount - 1) * BALL_PRED_STRIDE;
  const bPrev = (actualCount - 2) * BALL_PRED_STRIDE;
  const dvx = (rawData[bLast + 3] ?? 0) - (rawData[bPrev + 3] ?? 0);
  const dvy = (rawData[bLast + 4] ?? 0) - (rawData[bPrev + 4] ?? 0);
  const dvz = (rawData[bLast + 5] ?? 0) - (rawData[bPrev + 5] ?? 0) - GRAVITY_Z * FIXED_TIMESTEP;
  const dwx = (rawData[bLast + 6] ?? 0) - (rawData[bPrev + 6] ?? 0);
  const dwy = (rawData[bLast + 7] ?? 0) - (rawData[bPrev + 7] ?? 0);
  const dwz = (rawData[bLast + 8] ?? 0) - (rawData[bPrev + 8] ?? 0);
  const nonGravDvSq = dvx * dvx + dvy * dvy + dvz * dvz;
  const dwSq = dwx * dwx + dwy * dwy + dwz * dwz;
  return nonGravDvSq > 144.0 || dwSq > 0.0025;
}

export function hasTrajectoryVelocityImpulse(
  rawVelX: number,
  rawVelY: number,
  rawVelZ: number,
  lastVelX: number,
  lastVelY: number,
  lastVelZ: number,
  impulseThreshold: number = 100
): boolean {
  const dvX = rawVelX - lastVelX;
  const dvY = rawVelY - lastVelY;
  const dvZ = rawVelZ - lastVelZ;
  return (
    dvX > impulseThreshold ||
    dvX < -impulseThreshold ||
    dvY > impulseThreshold ||
    dvY < -impulseThreshold ||
    dvZ > impulseThreshold ||
    dvZ < -impulseThreshold
  );
}

export function isBallMovingAboveTrajectoryThreshold(
  rawVelX: number,
  rawVelY: number,
  rawVelZ: number,
  rawPosZ: number,
  forcePredictAnyMovement: boolean,
  customVelocityThreshold: number = 15
): boolean {
  const velThreshold = forcePredictAnyMovement
    ? 15
    : Math.max(5, Number.isFinite(customVelocityThreshold) ? customVelocityThreshold : 15);
  return (
    rawVelX >= velThreshold ||
    rawVelX <= -velThreshold ||
    rawVelY >= velThreshold ||
    rawVelY <= -velThreshold ||
    rawVelZ >= velThreshold ||
    rawVelZ <= -velThreshold ||
    rawPosZ > 98.0 ||
    (forcePredictAnyMovement && rawPosZ > 95.0)
  );
}

export function hasTrajectoryCoordinateDeviation(
  rawLiveX: number,
  rawLiveY: number,
  rawLiveZ: number,
  rawPredictedPoints: Float32Array,
  elapsedTicks: number,
  deviationThresholdUu: number = 5
): boolean {
  const predOffset = elapsedTicks * 3;
  const diffX = rawLiveX - rawPredictedPoints[predOffset + 0];
  const diffY = rawLiveY - rawPredictedPoints[predOffset + 1];
  const diffZ = rawLiveZ - rawPredictedPoints[predOffset + 2];
  return (
    diffX > deviationThresholdUu ||
    diffX < -deviationThresholdUu ||
    diffY > deviationThresholdUu ||
    diffY < -deviationThresholdUu ||
    diffZ > deviationThresholdUu ||
    diffZ < -deviationThresholdUu
  );
}

/**
 * Extracts continuous [startTick, endTick] dash intervals for 3D volumetric tube generation.
 */
export function buildTrajectoryDashRanges(
  predictionCount: number,
  startIndex: number,
  solidTicksRaw: number,
  transparentTicksRaw: number,
  phaseOffsetTicks: number,
  outRanges: TrajectoryDashRange[]
): number {
  const solidTicks = Math.max(5, Math.min(240, solidTicksRaw || 50));
  const transparentTicks = Math.max(5, Math.min(240, transparentTicksRaw || 20));
  const cycleLength = solidTicks + transparentTicks;
  const endIndex = predictionCount - 1;

  let rangeCount = 0;
  let activeStart = -1;

  for (let k = startIndex; k < endIndex; k++) {
    const relK = k - startIndex;
    const phase = (((relK + phaseOffsetTicks) % cycleLength) + cycleLength) % cycleLength;
    const isSolid = phase < solidTicks;

    if (isSolid) {
      if (activeStart < 0) {
        activeStart = k;
      }
    } else if (activeStart >= 0) {
      if (rangeCount < outRanges.length) {
        outRanges[rangeCount].startTick = activeStart;
        outRanges[rangeCount].endTick = k;
      } else {
        outRanges.push({ startTick: activeStart, endTick: k });
      }
      rangeCount++;
      activeStart = -1;
    }
  }

  if (activeStart >= 0 && activeStart < endIndex) {
    if (rangeCount < outRanges.length) {
      outRanges[rangeCount].startTick = activeStart;
      outRanges[rangeCount].endTick = endIndex;
    } else {
      outRanges.push({ startTick: activeStart, endTick: endIndex });
    }
    rangeCount++;
  }

  return rangeCount;
}

/**
 * Detects 3D surface bounce impacts (floor, walls, corners, backboard, ceiling)
 * along the predicted trajectory using velocity impulse vectors from WASM rawData
 * (or second-differences on predictedPoints as fallback).
 * Returns the number of detected bounces (up to maxMarkers).
 */
export function detectTrajectoryBounces(
  rawData: Float32Array | null,
  predictedPoints: Float32Array,
  predictionCount: number,
  startIndex: number,
  outBounceBuffer: Float32Array,
  maxMarkers: number = MAX_BOUNCE_MARKERS
): { bounceCount: number; maxHeightUu: number } {
  let bounceCount = 0;
  let maxHeightUu = 0;
  const endIndex = predictionCount - 1;
  const totalSpan = Math.max(1, endIndex - startIndex);
  const gravStepZ = GRAVITY_Z * FIXED_TIMESTEP; // -5.4167 UU/s per tick
  let lastBounceTick = -20;

  for (let k = startIndex; k <= endIndex; k++) {
    const h = predictedPoints[k * 3 + 1]; // Three.js Y = RocketSim Z (height)
    if (h > maxHeightUu) maxHeightUu = h;
  }

  if (rawData && rawData.length >= predictionCount * BALL_PRED_STRIDE) {
    for (let k = Math.max(startIndex, 1); k < endIndex && bounceCount < maxMarkers; k++) {
      if (k - lastBounceTick < 10) continue;
      const off0 = (k - 1) * BALL_PRED_STRIDE;
      const off1 = k * BALL_PRED_STRIDE;

      const dvx = rawData[off1 + 3] - rawData[off0 + 3];
      const dvy = rawData[off1 + 4] - rawData[off0 + 4];
      const dvz = rawData[off1 + 5] - rawData[off0 + 5] - gravStepZ;
      const impulseSq = dvx * dvx + dvy * dvy + dvz * dvz;

      // Ignore tiny rolling micro-contacts; capture distinct surface bounces (impulse >= 180 UU/s)
      if (impulseSq >= 180 * 180) {
        const impulseMag = Math.sqrt(impulseSq);
        const invMag = 1.0 / impulseMag;
        // Convert RocketSim normal (dvx, dvy, dvz) -> Three.js normal (X=dvx, Y=dvz, Z=dvy)
        const nx = dvx * invMag;
        const ny = dvz * invMag;
        const nz = dvy * invMag;

        const pOff = k * 3;
        const bOff = bounceCount * BOUNCE_MARKER_STRIDE;
        outBounceBuffer[bOff + 0] = predictedPoints[pOff + 0];
        outBounceBuffer[bOff + 1] = predictedPoints[pOff + 1];
        outBounceBuffer[bOff + 2] = predictedPoints[pOff + 2];
        outBounceBuffer[bOff + 3] = nx;
        outBounceBuffer[bOff + 4] = ny;
        outBounceBuffer[bOff + 5] = nz;
        outBounceBuffer[bOff + 6] = Math.min(1, Math.max(0, (k - startIndex) / totalSpan));
        outBounceBuffer[bOff + 7] = impulseMag;

        bounceCount++;
        lastBounceTick = k;
      }
    }
  }

  return { bounceCount, maxHeightUu };
}
