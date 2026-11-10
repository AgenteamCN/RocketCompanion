/**
 * VisualErrorSmoother.ts
 * Pure mathematical operators and stateful wrapper for client-side visual error smoothing.
 * Computes post-resimulation spatial discrepancy and decays visual smoothing offsets.
 */

import type { ReconcilerMetrics, TelemetrySimPort } from './ReconcilerMetricsModel.ts';

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}
export interface PreResimPositions {
  cars: Array<Vector3Like | undefined>;
  ball: Vector3Like | null;
}
export interface PostResimDiscrepancyInput {
  numCars: number;
  localCarIndex: number;
  isLobbyDualWorld: boolean;
  hardSnapThreshold: number;
  isTier3HistoricalHardSnap: boolean;
}
export interface PostResimDiscrepancyResult {
  localDelta: number;
  ballDelta: number;
  remoteMaxDelta: number;
  probeMaxDelta: number;
  primaryDelta: number;
  effectiveDelta: number;
  isTier3HardSnap: boolean;
}

export function computeVector3Magnitude(vec: Vector3Like): number {
  return Math.hypot(vec.x, vec.y, vec.z);
}

export function accumulateSmoothingCorrectionOffset(
  currentOffset: Vector3Like,
  prePhysicsPos: Vector3Like | null | undefined,
  postPhysicsPos: Vector3Like | null | undefined,
  maxOffsetMagnitude = 300.0
): { offset: Vector3Like; magnitude: number } {
  if (!prePhysicsPos || !postPhysicsPos) {
    return { offset: { ...currentOffset }, magnitude: computeVector3Magnitude(currentOffset) };
  }
  let x = currentOffset.x + (prePhysicsPos.x - postPhysicsPos.x);
  let y = currentOffset.y + (prePhysicsPos.y - postPhysicsPos.y);
  let z = currentOffset.z + (prePhysicsPos.z - postPhysicsPos.z);
  let mag = Math.hypot(x, y, z);
  if (mag > maxOffsetMagnitude && mag > 0) {
    const scale = maxOffsetMagnitude / mag;
    x *= scale;
    y *= scale;
    z *= scale;
    mag = maxOffsetMagnitude;
  }
  return { offset: { x, y, z }, magnitude: mag };
}

export function stepVisualSmoothingDecay(
  currentOffset: Vector3Like,
  deltaSeconds: number,
  decayRate = 18.0,
  snapZeroEpsilon = 0.01
): { offset: Vector3Like; magnitude: number } {
  if (deltaSeconds <= 0) {
    return { offset: { ...currentOffset }, magnitude: computeVector3Magnitude(currentOffset) };
  }
  const decay = Math.exp(-decayRate * deltaSeconds);
  let x = currentOffset.x * decay;
  let y = currentOffset.y * decay;
  let z = currentOffset.z * decay;
  let mag = Math.hypot(x, y, z);
  if (mag < snapZeroEpsilon) {
    x = 0;
    y = 0;
    z = 0;
    mag = 0;
  }
  return { offset: { x, y, z }, magnitude: mag };
}

export function capturePreResimPositions(
  sim: TelemetrySimPort | null | undefined,
  maxCars = 8
): { prePositions: PreResimPositions; hasNaN: boolean; numCars: number } {
  const numCars = Math.min(sim?.numCars ?? 0, maxCars);
  const hasSlotCheck = typeof sim?.isCarSlotActive === 'function';
  const cars = new Array<Vector3Like | undefined>(numCars);
  let hasNaN = false;

  if (sim) {
    for (let c = 0; c < numCars; c++) {
      if (hasSlotCheck && !sim.isCarSlotActive!(c)) continue;
      const carView = sim.getCarStateView(c);
      if (!carView) continue;
      if (Number.isNaN(carView.posX) || Number.isNaN(carView.posY) || Number.isNaN(carView.posZ)) {
        hasNaN = true;
        break;
      }
      cars[c] = { x: carView.posX, y: carView.posY, z: carView.posZ };
    }
  }

  let ball: Vector3Like | null = null;
  if (!hasNaN && typeof sim?.getBallStateView === 'function') {
    const bv = sim.getBallStateView();
    if (bv && !Number.isNaN(bv.posX) && !Number.isNaN(bv.posY) && !Number.isNaN(bv.posZ)) {
      ball = { x: bv.posX, y: bv.posY, z: bv.posZ };
    }
  }
  return { prePositions: { cars, ball }, hasNaN, numCars };
}

export function evaluatePostResimDiscrepancy(
  sim: TelemetrySimPort,
  prePositions: PreResimPositions,
  input: PostResimDiscrepancyInput
): PostResimDiscrepancyResult {
  const { numCars, localCarIndex, isLobbyDualWorld, hardSnapThreshold, isTier3HistoricalHardSnap } =
    input;
  const hasSlotCheck = typeof sim?.isCarSlotActive === 'function';
  const postLocalCar = sim.getCarStateView(localCarIndex);
  const preLocalPos = prePositions.cars[localCarIndex];
  const localDelta =
    postLocalCar && preLocalPos
      ? Math.hypot(
          postLocalCar.posX - preLocalPos.x,
          postLocalCar.posY - preLocalPos.y,
          postLocalCar.posZ - preLocalPos.z
        )
      : 0;

  let ballDelta = 0;
  if (prePositions.ball && typeof sim?.getBallStateView === 'function') {
    const postBall = sim.getBallStateView();
    if (postBall && !Number.isNaN(postBall.posX)) {
      ballDelta = Math.hypot(
        postBall.posX - prePositions.ball.x,
        postBall.posY - prePositions.ball.y,
        postBall.posZ - prePositions.ball.z
      );
    }
  }

  let remoteMaxDelta = 0;
  let probeMaxDelta = 0;
  for (let c = 0; c < numCars; c++) {
    if (c === localCarIndex) continue;
    if (hasSlotCheck && !sim.isCarSlotActive!(c)) continue;
    const preRemote = prePositions.cars[c];
    const postRemote = sim.getCarStateView(c);
    if (!preRemote || !postRemote) continue;
    const rDelta = Math.hypot(
      postRemote.posX - preRemote.x,
      postRemote.posY - preRemote.y,
      postRemote.posZ - preRemote.z
    );
    if (c >= 6) {
      if (rDelta > probeMaxDelta) probeMaxDelta = rDelta;
    } else if (rDelta > remoteMaxDelta) {
      remoteMaxDelta = rDelta;
    }
  }

  const primaryDelta = isLobbyDualWorld ? probeMaxDelta : localDelta;
  const isTier3HardSnap = isLobbyDualWorld
    ? isTier3HistoricalHardSnap || probeMaxDelta >= hardSnapThreshold
    : isTier3HistoricalHardSnap ||
      localDelta >= hardSnapThreshold ||
      ballDelta >= hardSnapThreshold;
  const effectiveDelta = isLobbyDualWorld
    ? probeMaxDelta
    : Math.max(localDelta, ballDelta, remoteMaxDelta, probeMaxDelta);

  return {
    localDelta,
    ballDelta,
    remoteMaxDelta,
    probeMaxDelta,
    primaryDelta,
    effectiveDelta,
    isTier3HardSnap,
  };
}

export class VisualErrorSmoother {
  enabled: boolean;
  decayRate: number;
  maxOffsetMagnitude: number;
  readonly offset: Vector3Like = { x: 0, y: 0, z: 0 };

  constructor(enabled = false, decayRate = 18.0, maxOffsetMagnitude = 300.0) {
    this.enabled = Boolean(enabled);
    this.decayRate = decayRate;
    this.maxOffsetMagnitude = maxOffsetMagnitude;
  }

  reset(): void {
    this.offset.x = 0;
    this.offset.y = 0;
    this.offset.z = 0;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.reset();
  }

  getMagnitude(): number {
    return computeVector3Magnitude(this.offset);
  }

  applyCorrection(
    preLocalPos: Vector3Like | null | undefined,
    postLocalPos: Vector3Like | null | undefined,
    isTier3HardSnap = false,
    isLobbyDualWorld = false
  ): number {
    if (isTier3HardSnap) {
      this.reset();
      return 0;
    }
    if (!this.enabled || isLobbyDualWorld || !preLocalPos || !postLocalPos) {
      return this.getMagnitude();
    }
    const { offset, magnitude } = accumulateSmoothingCorrectionOffset(
      this.offset,
      preLocalPos,
      postLocalPos,
      this.maxOffsetMagnitude
    );
    this.offset.x = offset.x;
    this.offset.y = offset.y;
    this.offset.z = offset.z;
    return magnitude;
  }

  stepDecay(deltaSeconds: number): Vector3Like {
    if (!this.enabled) return this.offset;
    const { offset } = stepVisualSmoothingDecay(this.offset, deltaSeconds, this.decayRate);
    this.offset.x = offset.x;
    this.offset.y = offset.y;
    this.offset.z = offset.z;
    return this.offset;
  }

  applyPostResimDiscrepancy(
    sim: TelemetrySimPort,
    prePositions: PreResimPositions,
    input: PostResimDiscrepancyInput,
    metrics: ReconcilerMetrics
  ): PostResimDiscrepancyResult {
    const discrepancy = evaluatePostResimDiscrepancy(sim, prePositions, input);
    if (discrepancy.isTier3HardSnap) this.reset();

    let lastCorrectionDelta = discrepancy.primaryDelta;
    if (discrepancy.effectiveDelta > 0.05) {
      lastCorrectionDelta = discrepancy.effectiveDelta;
      if (this.enabled && !discrepancy.isTier3HardSnap && !input.isLobbyDualWorld) {
        const postLocalCar = sim.getCarStateView(input.localCarIndex);
        this.applyCorrection(
          prePositions.cars[input.localCarIndex],
          postLocalCar
            ? { x: postLocalCar.posX, y: postLocalCar.posY, z: postLocalCar.posZ }
            : undefined,
          discrepancy.isTier3HardSnap,
          input.isLobbyDualWorld
        );
      }
    }
    metrics.applySmootherDiscrepancy(discrepancy, lastCorrectionDelta, this.getMagnitude());
    return discrepancy;
  }
}
