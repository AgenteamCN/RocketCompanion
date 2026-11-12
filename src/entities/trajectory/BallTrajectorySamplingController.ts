/**
 * BallTrajectorySamplingController.ts
 * Stateful narrow-waist SubController for WASM ball trajectory prediction sampling,
 * O(1) incremental tail shifting, and progressive catch-up ramp after car-ball hits
 * or coordinate deviations.
 */

import {
  BOUNCE_MARKER_STRIDE,
  MAX_BOUNCE_MARKERS,
  copyWasmPredictionToTrajectoryBuffers,
  detectTrajectoryBounces,
  shouldRefreshTailSeamContact,
  tryIncrementalShiftTrajectoryBuffers,
} from './ballTrajectoryGeometryPipeline.ts';
import {
  resolveLiveTrajectorySamplingDecision,
  type TrajectorySamplingConfig,
  type TrajectoryUpdateKind,
} from './ballTrajectoryPolicy.ts';
import { computeClosestCarSurfaceGapUu } from './ballTrajectoryAnomalyPipeline.ts';
import { BallTrajectoryAnomalyDetector } from './BallTrajectoryAnomalyDetector.ts';
import { getActiveBotBallPredictionHorizonSeconds } from '../../ai/experimental/botpackSharedBallPredPipeline.ts';
import type { BallStateObjectInput } from '../../physics/RocketSimSnapshotSerializer.ts';

export type { TrajectorySamplingConfig, TrajectoryUpdateKind };

export interface TrajectoryBallLaunchState extends BallStateObjectInput {
  kickoffState?: boolean;
}

export interface TrajectoryPhysicsPort {
  readonly ballRadius?: number;
  readonly state?: Float32Array | null;
  ballStateWriteRevision?: number;
  readonly _carSpecs?: ReadonlyArray<{ readonly team?: number } | null>;
  getHeaderView?(): { readonly tickCount: number };
  getBallState(): Float32Array;
  setBallState(
    state: Float32Array | TrajectoryBallLaunchState | number | null | undefined
  ): boolean;
  isBallSleeping?(): boolean;
  updateBallPrediction(maxSeconds?: number): number;
  updateBallPredictionIncremental?(maxSeconds?: number): number;
  updateBallPredictionManual?(maxSeconds?: number, ticksSinceLastUpdate?: number): number;
  getBallPrediction(): Float32Array | null;
  getBallPredictionCount?(): number;
}

export class BallTrajectorySamplingController {
  public readonly maxTicks: number;
  public readonly predictedPoints: Float32Array;
  public readonly rawPredictedPoints: Float32Array;
  public readonly rawSlicesBuffer: Float32Array;
  public readonly bounceMarkersBuffer: Float32Array;
  public readonly anomalyRecorder = new BallTrajectoryAnomalyDetector();

  public predictionCount = 0;
  public validCachedCount = 0;
  public wasmWindowTicks = 0;
  public wasmFullHorizonActive = false;
  public bounceCount = 0;
  public maxHeightUu = 0;
  public impactTick = -1;
  public patternAnchorTick = -1;
  public lastUpdatedTick = -1;
  public isActive = false;
  public staticPreviewActive = false;
  public wasMovingFast = false;
  public lastVelX = 0;
  public lastVelY = 0;
  public lastVelZ = 0;
  public pendingCarBallHit = false;
  public pendingIntentionalReset = false;
  public lastCarBallHitTick = -1;
  private _lastBallStateWriteRevision = -1;
  private _incStepsSinceFullBatch = 0;

  public lastWasmUpdateUs = 0;
  public lastUpdateKind: TrajectoryUpdateKind = 'sleeping';
  public incrementalStepCount = 0;
  public fullRecomputeCount = 0;
  public carHitRecomputeCount = 0;
  public deviationRecomputeCount = 0;

  constructor(maxTicks = 600) {
    this.maxTicks = maxTicks;
    this.predictedPoints = new Float32Array(maxTicks * 3);
    this.rawPredictedPoints = new Float32Array(maxTicks * 3);
    this.rawSlicesBuffer = new Float32Array(maxTicks * 9);
    this.bounceMarkersBuffer = new Float32Array(MAX_BOUNCE_MARKERS * BOUNCE_MARKER_STRIDE);
  }

  public clear(): void {
    this.isActive = false;
    this.staticPreviewActive = false;
    this.predictionCount = 0;
    this.validCachedCount = 0;
    this.wasmWindowTicks = 0;
    this.wasmFullHorizonActive = false;
    this.bounceCount = 0;
    this.impactTick = -1;
    this.patternAnchorTick = -1;
    this.lastUpdatedTick = -1;
  }

  public notifyCarBallHit(tick?: number): void {
    this.pendingCarBallHit = true;
    if (typeof tick === 'number' && Number.isFinite(tick)) {
      this.lastCarBallHitTick = tick;
    }
  }

  public notifyBallStateReset(): void {
    this.pendingIntentionalReset = true;
  }

  public markStaticPreviewUpdate(): void {
    this.lastUpdateKind = 'static-preview';
  }

  public markSleeping(): void {
    this.wasMovingFast = false;
    this.pendingCarBallHit = false;
    this.lastUpdateKind = 'sleeping';
    this.lastWasmUpdateUs = 0;
  }

  private _updateBounceMetrics(rawSource: Float32Array | null, visibleSlices: number): void {
    const bounceRes = detectTrajectoryBounces(
      rawSource,
      this.predictedPoints,
      visibleSlices,
      0,
      this.bounceMarkersBuffer
    );
    this.bounceCount = bounceRes.bounceCount;
    this.maxHeightUu = bounceRes.maxHeightUu;
  }

  public setStaticPreviewTrajectory(
    phys: TrajectoryPhysicsPort,
    ballLaunchState: TrajectoryBallLaunchState | null,
    predictionTicks: number
  ): number {
    if (ballLaunchState?.kickoffState) {
      this.clear();
      return 0;
    }

    const savedBall = ballLaunchState ? new Float32Array(phys.getBallState()) : null;
    const savedWriteRev = phys.ballStateWriteRevision;
    try {
      if (ballLaunchState) {
        phys.setBallState({
          pos: ballLaunchState.pos,
          vel: ballLaunchState.vel,
          angVel: ballLaunchState.angVel || [0, 0, 0],
        });
      }

      const bState = phys.getBallState();
      const vx = bState[12] || 0;
      const vy = bState[13] || 0;
      const vz = bState[14] || 0;
      const pz = bState[2] || 93.15;
      const speedMag = Math.hypot(vx, vy, vz);

      if (speedMag < 1.0 && pz <= 95.0) {
        this.clear();
        return 0;
      }

      const distanceTicks = Math.min(600, Math.max(60, predictionTicks || 600));
      const seconds = Math.min(5.0, Math.max(0.5, (distanceTicks + 0.05) / 120.0));
      const count = phys.updateBallPrediction(seconds);
      const rawData = phys.getBallPrediction();

      if (!rawData || count <= 1) {
        this.clear();
        return 0;
      }

      const actualCount = Math.min(count, distanceTicks, this.maxTicks);
      this.predictionCount = actualCount;
      this.validCachedCount = actualCount;
      this.wasmWindowTicks = count;
      const tickNow = Math.floor(phys.getHeaderView?.()?.tickCount ?? 0);
      this.impactTick = tickNow;
      this.patternAnchorTick = tickNow;
      this.lastUpdatedTick = tickNow;

      copyWasmPredictionToTrajectoryBuffers(
        rawData,
        actualCount,
        this.predictedPoints,
        this.rawPredictedPoints,
        this.rawSlicesBuffer
      );
      this._updateBounceMetrics(this.rawSlicesBuffer, actualCount);

      this.isActive = true;
      this.staticPreviewActive = true;
      return actualCount;
    } finally {
      if (savedBall) {
        phys.setBallState(savedBall);
      }
      if (savedWriteRev !== undefined) {
        phys.ballStateWriteRevision = savedWriteRev;
      }
    }
  }

  public predictFromCurrentState(
    phys: TrajectoryPhysicsPort,
    targetTick: number | null,
    cfg: TrajectorySamplingConfig,
    options: {
      forceFull?: boolean;
      deltaTicks?: number;
      reason?: TrajectoryUpdateKind;
      carBallHitEvent?: boolean;
      intentionalReset?: boolean;
    } = {}
  ): number {
    const distanceTicks = Math.min(600, Math.max(60, cfg.predictionTicks || 600));
    const updateMode = cfg.updateMode || 'continuous-incremental';
    const catchupBudget = Math.min(
      distanceTicks,
      Math.max(2, Math.round(Number(cfg.catchupTicksPerFrame) || 5))
    );

    const resolvedTick =
      targetTick !== null && targetTick !== undefined
        ? targetTick
        : (phys.getHeaderView?.()?.tickCount ?? 0);

    const deltaTicks = options.deltaTicks ?? 0;
    if (phys.state && !this.staticPreviewActive) {
      this.anomalyRecorder.snapshotPreviousTickSlices(
        this.lastUpdatedTick,
        this.lastUpdateKind,
        phys.state,
        this.rawSlicesBuffer,
        this.validCachedCount,
        this.predictedPoints,
        this.predictionCount,
        deltaTicks
      );
    }

    const activeBotHorizonSec = getActiveBotBallPredictionHorizonSeconds(resolvedTick);
    this.wasmFullHorizonActive = activeBotHorizonSec > 0;

    const ownHorizonSeconds = Math.min(5.0, Math.max(0.5, (distanceTicks + 0.05) / 120.0));
    const wasmHorizonSeconds = Math.max(ownHorizonSeconds, activeBotHorizonSec);
    const needFull =
      Boolean(options.forceFull) ||
      updateMode === 'full-every-tick' ||
      !this.isActive ||
      deltaTicks <= 0 ||
      deltaTicks >= this.validCachedCount ||
      this.wasmWindowTicks < distanceTicks;
    const forceBatchWasm =
      options.reason === 'full-deviation' ||
      options.reason === 'full-world-bounce' ||
      options.reason === 'full-forced' ||
      updateMode === 'full-every-tick';
    const useIncrementalWasm =
      Boolean(phys.updateBallPredictionIncremental) &&
      !forceBatchWasm &&
      (!needFull || this.wasmFullHorizonActive);

    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let count = useIncrementalWasm
      ? phys.updateBallPredictionIncremental!(wasmHorizonSeconds)
      : phys.updateBallPrediction(wasmHorizonSeconds);
    let rawData = phys.getBallPrediction();
    let refreshedTailSeam = false;

    if (useIncrementalWasm) {
      this._incStepsSinceFullBatch += 1;
      if (
        rawData &&
        count > 1 &&
        shouldRefreshTailSeamContact(
          rawData,
          Math.min(count, distanceTicks, this.maxTicks),
          this._incStepsSinceFullBatch
        )
      ) {
        count = phys.updateBallPrediction(wasmHorizonSeconds);
        rawData = phys.getBallPrediction();
        this._incStepsSinceFullBatch = 0;
        refreshedTailSeam = true;
      }
    } else {
      this._incStepsSinceFullBatch = 0;
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lastWasmUpdateUs = (t1 - t0) * 1000.0;

    if (!rawData || count <= 0) {
      this.clear();
      return 0;
    }

    const actualCount = Math.min(count, distanceTicks, this.maxTicks);
    const prevVisible = this.predictionCount;

    let wasIncrementalShift = false;
    if (!needFull && !refreshedTailSeam) {
      wasIncrementalShift = tryIncrementalShiftTrajectoryBuffers(
        rawData,
        actualCount,
        this.validCachedCount,
        deltaTicks,
        this.predictedPoints,
        this.rawPredictedPoints,
        this.rawSlicesBuffer
      );
      if (!wasIncrementalShift) {
        this._incStepsSinceFullBatch = 0;
      }
    } else {
      copyWasmPredictionToTrajectoryBuffers(
        rawData,
        actualCount,
        this.predictedPoints,
        this.rawPredictedPoints,
        this.rawSlicesBuffer
      );
      if (refreshedTailSeam) {
        wasIncrementalShift = true;
      }
    }

    this.validCachedCount = actualCount;
    this.wasmWindowTicks = count;
    this.impactTick = resolvedTick;
    this.lastUpdatedTick = resolvedTick;

    const isIncWindow = updateMode === 'continuous-incremental' && catchupBudget < actualCount;
    const stepVisible = isIncWindow
      ? Math.min(actualCount, Math.max(catchupBudget, prevVisible + catchupBudget))
      : actualCount;
    const shouldCollapseToCatchup =
      Boolean(options.intentionalReset) ||
      Boolean(options.carBallHitEvent) ||
      options.reason === 'full-car-hit' ||
      prevVisible <= catchupBudget;
    if (wasIncrementalShift) {
      this.predictionCount = stepVisible;
      this.incrementalStepCount++;
      this.lastUpdateKind = stepVisible < actualCount ? 'progressive-catchup' : 'incremental-tail';
    } else if (!needFull) {
      this.predictionCount = stepVisible;
      this.fullRecomputeCount++;
      this.lastUpdateKind = 'wasm-seam-resync';
    } else {
      this.predictionCount = isIncWindow
        ? shouldCollapseToCatchup
          ? Math.min(actualCount, Math.max(2, catchupBudget))
          : stepVisible
        : actualCount;
      this.fullRecomputeCount++;
      this.patternAnchorTick = resolvedTick;
      this.lastUpdateKind = options.reason || 'full-initial';
    }

    if (phys.state && !this.staticPreviewActive) {
      this.anomalyRecorder.recordTick({
        phys,
        statePtr: phys.state,
        currentTick: resolvedTick,
        deltaTicks: Math.max(1, deltaTicks),
        lastCarBallHitTick: this.lastCarBallHitTick,
        updateKind: this.lastUpdateKind,
        needFull,
        wasIncrementalShift,
        carBallHitEvent: Boolean(options.carBallHitEvent || this.lastUpdateKind === 'full-car-hit'),
        worldBounceEvent: this.lastUpdateKind === 'full-world-bounce',
        intentionalReset: Boolean(options.intentionalReset),
        deviationThresholdUu: Math.max(0.5, Number(cfg.deviationThresholdUu) || 5.0),
        rawSlices: this.rawSlicesBuffer,
        actualSliceCount: actualCount,
      });
    }

    this._updateBounceMetrics(this.rawSlicesBuffer, this.predictionCount);
    this.isActive = true;
    return this.predictionCount;
  }

  /**
   * Steps the live trajectory state machine for the current tick.
   * Returns `false` if the ball went to sleep or stopped below threshold.
   */
  public stepLivePrediction(
    phys: TrajectoryPhysicsPort,
    stateBuf: Float32Array,
    currentTick: number,
    forcePredictAnyMovement: boolean,
    cfg: TrajectorySamplingConfig
  ): boolean {
    const rawVelX = stateBuf[16];
    const rawVelY = stateBuf[17];
    const rawVelZ = stateBuf[18];

    const currentWriteRev = phys.ballStateWriteRevision ?? 0;
    const writeRevChanged =
      this._lastBallStateWriteRevision !== -1 &&
      currentWriteRev !== this._lastBallStateWriteRevision;
    this._lastBallStateWriteRevision = currentWriteRev;
    const intentionalReset = this.pendingIntentionalReset || writeRevChanged;
    this.pendingIntentionalReset = false;

    const carBallHitEvent = this.pendingCarBallHit;
    if (carBallHitEvent) {
      this.lastCarBallHitTick = currentTick;
    }

    const ticksSinceCarHit =
      this.lastCarBallHitTick >= 0 ? currentTick - this.lastCarBallHitTick : 99999;
    const closestSurfaceGapUu = computeClosestCarSurfaceGapUu(stateBuf);
    const isDirectCarSurfaceContact = closestSurfaceGapUu <= 24.0;
    const isMultiTickCarContact =
      isDirectCarSurfaceContact ||
      (ticksSinceCarHit >= 0 && ticksSinceCarHit <= 10 && closestSurfaceGapUu <= 32.0);
    if (isMultiTickCarContact) {
      this.lastCarBallHitTick = currentTick;
    }

    const decision = resolveLiveTrajectorySamplingDecision({
      isActive: this.isActive,
      lastUpdatedTick: this.lastUpdatedTick,
      validCachedCount: this.validCachedCount,
      currentTick,
      rawPosX: stateBuf[4],
      rawPosY: stateBuf[5],
      rawPosZ: stateBuf[6],
      rawVelX,
      rawVelY,
      rawVelZ,
      lastVelX: this.lastVelX,
      lastVelY: this.lastVelY,
      lastVelZ: this.lastVelZ,
      pendingCarBallHit: carBallHitEvent,
      pendingIntentionalReset: intentionalReset,
      isMultiTickCarContact,
      forcePredictAnyMovement,
      rawPredictedPoints: this.rawPredictedPoints,
      cfg,
    });

    this.lastVelX = rawVelX;
    this.lastVelY = rawVelY;
    this.lastVelZ = rawVelZ;
    this.pendingCarBallHit = false;

    if (decision.action === 'sleep') {
      this.clear();
      this.lastUpdateKind = 'sleeping';
      return false;
    }

    if (decision.action === 'cached-tick') {
      this.lastWasmUpdateUs = 0;
      this.lastUpdateKind = 'cached-tick';
      return true;
    }

    if (decision.action === 'predict') {
      this.carHitRecomputeCount += decision.carHitCountDelta;
      this.deviationRecomputeCount += decision.deviationCountDelta;
      this.predictFromCurrentState(phys, currentTick, cfg, {
        forceFull: decision.forceFull,
        deltaTicks: decision.deltaTicks,
        reason: decision.reason,
        carBallHitEvent: carBallHitEvent || isMultiTickCarContact,
        intentionalReset,
      });
      if (decision.markMovingFast) {
        this.wasMovingFast = true;
      }
    }

    return true;
  }
}
