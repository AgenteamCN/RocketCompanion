import { MAX_STEPS, RAW_STRIDE } from './ballTrajectoryGeometryPipeline.ts';
import {
  type AnomalyPhysicsCarTeamPort,
  type BallState18Snapshot,
  type BallTrajectoryAnomalySummary,
  type LiveTrajectoryTickRecord,
  type TrajectoryAnomalyBufferGroup,
  type TrajectoryAnomalySample,
  type TrajectoryAnomalyTriggerKind,
  classifyArenaSeamRegion,
  cloneLiveTrajectoryTickRecord,
  computeClosestCarSurfaceGapUu,
  computeTailContinuityErrorUu,
  copyBallState18Snapshot,
  createEmptyBallState18Snapshot,
  createEmptyLiveTrajectoryTickRecord,
  extractCarProximitySnapshots,
  writeBallState18Snapshot,
} from './ballTrajectoryAnomalyPipeline.ts';
import {
  buildCapturedAnomalySample,
  buildTrajectoryAnomalyExportBundle,
  buildTrajectoryAnomalySummary,
  populateLiveTickRecordSlot,
} from './BallTrajectoryAnomalySnapshotBuilder.ts';

const MAX_TICK_HISTORY = 90;

interface AnomalyBufferGroupSlotState {
  readonly group: TrajectoryAnomalyBufferGroup;
  readonly tickHistoryRing: LiveTrajectoryTickRecord[];
  tickHistoryHead: number;
  tickHistoryCount: number;
  capturedSample: TrajectoryAnomalySample | null;
}

function createBufferGroupSlotState(
  group: TrajectoryAnomalyBufferGroup
): AnomalyBufferGroupSlotState {
  return {
    group,
    tickHistoryRing: Array.from({ length: MAX_TICK_HISTORY }, () =>
      createEmptyLiveTrajectoryTickRecord()
    ),
    tickHistoryHead: 0,
    tickHistoryCount: 0,
    capturedSample: null,
  };
}

export interface RecordTrajectoryTickInput {
  phys: AnomalyPhysicsCarTeamPort | null | undefined;
  statePtr: Float32Array;
  currentTick: number;
  deltaTicks: number;
  lastCarBallHitTick: number;
  updateKind: string;
  needFull: boolean;
  wasIncrementalShift: boolean;
  carBallHitEvent: boolean;
  worldBounceEvent: boolean;
  intentionalReset: boolean;
  deviationThresholdUu: number;
  rawSlices: Float32Array;
  actualSliceCount: number;
}

/**
 * Dual-Space & Dual-Group (Alpha / Bravo) Trajectory Prediction Anomaly Detector.
 *
 * 1. Prediction Spaces:
 *    - Space A (`spaceA` - Car-Hit / Launch Baseline): Overwritten on every legitimate
 *      `full-car-hit` or launch. Stores the 600-slice raw trajectory buffer and 18-float ball state.
 *    - Space B (`spaceB` - Anomaly Recomputed Space): Captured when a non-car-hit recomputation
 *      (`full-deviation`, `wasm-seam-resync`, `full-world-bounce`, or `velocity-step-mismatch`) occurs.
 * 2. Ping-Pong Buffer Groups (`alpha` & `bravo`, max 2 retained anomalies, auto-arming):
 *    - Anomaly #1 latches into `alpha` and automatically arms `bravo` to record the next rolling buffer.
 *    - Anomaly #2 latches into `bravo` (retaining both #1 in `alpha` and #2 in `bravo`) and automatically
 *      arms `alpha` for #3.
 *    - Anomaly #3 overwrites `alpha` (retaining #2 in `bravo` and #3 in `alpha`) and automatically arms `bravo`.
 */
export class BallTrajectoryAnomalyDetector {
  private spaceATick = -1;
  private spaceAUpdateKind = 'idle';
  private hasSpaceABallState = false;
  private readonly spaceABallStateSlot: BallState18Snapshot = createEmptyBallState18Snapshot();
  private spaceARawSlices = new Float32Array(MAX_STEPS * RAW_STRIDE);
  private spaceASliceCount = 0;

  private prevTick = -1;
  private prevUpdateKind = 'idle';
  private hasPrevBallState = false;
  private readonly prevBallStateSlot: BallState18Snapshot = createEmptyBallState18Snapshot();
  private prevRawSlices = new Float32Array(MAX_STEPS * RAW_STRIDE);
  private prevSliceCount = 0;
  private prevPredictedPoints = new Float32Array(MAX_STEPS * 3);
  private prevPredictionCount = 0;
  private readonly expectedBeforeStepPos: [number, number, number] = [0, 0, 0];
  private readonly expectedBeforeStepVel: [number, number, number] = [0, 0, 0];
  private readonly expectedBeforeStepAngVel: [number, number, number] = [0, 0, 0];

  private readonly alphaGroup: AnomalyBufferGroupSlotState = createBufferGroupSlotState('alpha');
  private readonly bravoGroup: AnomalyBufferGroupSlotState = createBufferGroupSlotState('bravo');
  private activeBufferGroup: TrajectoryAnomalyBufferGroup = 'alpha';

  private latchedSample: TrajectoryAnomalySample | null = null;
  private samples: TrajectoryAnomalySample[] = [];
  private sequenceCounter = 0;
  private totalNonCarRecomputes = 0;
  private totalWasmSeamResyncs = 0;

  private onAnomalyCapturedCallback: ((sample: TrajectoryAnomalySample) => void) | null = null;

  public setOnAnomalyCaptured(cb: ((sample: TrajectoryAnomalySample) => void) | null): void {
    this.onAnomalyCapturedCallback = cb;
  }

  private _getGroupSlot(group: TrajectoryAnomalyBufferGroup): AnomalyBufferGroupSlotState {
    return group === 'alpha' ? this.alphaGroup : this.bravoGroup;
  }

  private _snapshotGroupTickHistory(
    groupSlot: AnomalyBufferGroupSlotState
  ): LiveTrajectoryTickRecord[] {
    const count = groupSlot.tickHistoryCount;
    const out: LiveTrajectoryTickRecord[] = new Array(count);
    const startIdx = count < MAX_TICK_HISTORY ? 0 : groupSlot.tickHistoryHead;
    for (let i = 0; i < count; i++) {
      const slot = groupSlot.tickHistoryRing[(startIdx + i) % MAX_TICK_HISTORY]!;
      out[i] = cloneLiveTrajectoryTickRecord(slot);
    }
    return out;
  }

  private _rebuildRetainedSamplesList(): void {
    const retained: TrajectoryAnomalySample[] = [];
    if (this.alphaGroup.capturedSample) {
      retained.push(this.alphaGroup.capturedSample);
    }
    if (this.bravoGroup.capturedSample) {
      retained.push(this.bravoGroup.capturedSample);
    }
    retained.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    this.samples = retained;
  }

  public snapshotPreviousTickSlices(
    tick: number,
    updateKind: string,
    statePtr: Float32Array,
    rawSlices: Float32Array,
    sliceCount: number,
    predictedPoints: Float32Array,
    predictionCount: number,
    deltaTicks: number
  ): void {
    const count = Math.max(0, Math.min(MAX_STEPS, sliceCount));
    const expectedSliceIdx = Math.max(0, Math.min(Math.max(0, count - 1), Math.max(0, deltaTicks)));
    const expBase = expectedSliceIdx * RAW_STRIDE;
    this.expectedBeforeStepPos[0] = rawSlices[expBase] ?? 0;
    this.expectedBeforeStepPos[1] = rawSlices[expBase + 1] ?? 0;
    this.expectedBeforeStepPos[2] = rawSlices[expBase + 2] ?? 0;

    this.expectedBeforeStepVel[0] = rawSlices[expBase + 3] ?? 0;
    this.expectedBeforeStepVel[1] = rawSlices[expBase + 4] ?? 0;
    this.expectedBeforeStepVel[2] = rawSlices[expBase + 5] ?? 0;

    this.expectedBeforeStepAngVel[0] = rawSlices[expBase + 6] ?? 0;
    this.expectedBeforeStepAngVel[1] = rawSlices[expBase + 7] ?? 0;
    this.expectedBeforeStepAngVel[2] = rawSlices[expBase + 8] ?? 0;

    this.prevPredictionCount = Math.max(0, Math.min(MAX_STEPS, predictionCount));
    if (this.prevPredictionCount > 0) {
      this.prevPredictedPoints.set(predictedPoints.subarray(0, this.prevPredictionCount * 3));
    }
    if (count <= 0) return;
    this.prevTick = tick;
    this.prevUpdateKind = updateKind;
    writeBallState18Snapshot(statePtr, this.prevBallStateSlot);
    this.hasPrevBallState = true;
    this.prevSliceCount = count;
    this.prevRawSlices.set(rawSlices.subarray(0, count * RAW_STRIDE));
  }

  public overwriteSpaceA(
    tick: number,
    updateKind: string,
    ballState: BallState18Snapshot,
    rawSlices: Float32Array,
    sliceCount: number
  ): void {
    const count = Math.max(0, Math.min(MAX_STEPS, sliceCount));
    this.spaceATick = tick;
    this.spaceAUpdateKind = updateKind;
    copyBallState18Snapshot(ballState, this.spaceABallStateSlot);
    this.hasSpaceABallState = true;
    this.spaceASliceCount = count;
    if (count > 0) {
      this.spaceARawSlices.set(rawSlices.subarray(0, count * RAW_STRIDE));
    }
  }

  public recordTick(input: RecordTrajectoryTickInput): TrajectoryAnomalySample | null {
    const {
      phys,
      statePtr,
      currentTick,
      deltaTicks,
      lastCarBallHitTick,
      updateKind,
      needFull,
      wasIncrementalShift,
      carBallHitEvent,
      worldBounceEvent,
      intentionalReset,
      deviationThresholdUu,
      rawSlices,
      actualSliceCount,
    } = input;

    const activeGroupSlot = this._getGroupSlot(this.activeBufferGroup);
    const slot = activeGroupSlot.tickHistoryRing[activeGroupSlot.tickHistoryHead]!;
    activeGroupSlot.tickHistoryHead = (activeGroupSlot.tickHistoryHead + 1) % MAX_TICK_HISTORY;
    if (activeGroupSlot.tickHistoryCount < MAX_TICK_HISTORY) {
      activeGroupSlot.tickHistoryCount += 1;
    }

    const liveBall = writeBallState18Snapshot(statePtr, slot.liveBallState18);
    const seamRegion = classifyArenaSeamRegion(liveBall.pos[0], liveBall.pos[1], liveBall.pos[2]);
    const closestSurfaceGapUu = computeClosestCarSurfaceGapUu(statePtr);
    const hasExpected = this.prevPredictionCount > 1 && !intentionalReset;
    const tailContinuityErrorUu = hasExpected
      ? computeTailContinuityErrorUu(
          this.prevPredictedPoints,
          this.prevPredictionCount,
          rawSlices,
          actualSliceCount,
          deltaTicks
        )
      : 0;

    const evalMetrics = populateLiveTickRecordSlot({
      slot,
      currentTick,
      updateKind,
      wasIncrementalShift,
      needFull,
      carBallHitEvent,
      worldBounceEvent,
      seamRegion,
      closestSurfaceGapUu,
      liveBall,
      hasExpected,
      expectedBeforeStepPos: this.expectedBeforeStepPos,
      expectedBeforeStepVel: this.expectedBeforeStepVel,
      expectedBeforeStepAngVel: this.expectedBeforeStepAngVel,
      rawSlices,
      actualSliceCount,
      tailContinuityErrorUu,
    });

    const isCarHitOrLaunch =
      carBallHitEvent ||
      intentionalReset ||
      updateKind === 'full-car-hit' ||
      updateKind === 'full-initial' ||
      this.spaceASliceCount === 0;

    if (isCarHitOrLaunch) {
      this.overwriteSpaceA(currentTick, updateKind, liveBall, rawSlices, actualSliceCount);
      return null;
    }

    const ticksSinceLastCarHit =
      lastCarBallHitTick >= 0 ? Math.max(0, currentTick - lastCarBallHitTick) : 99999;
    const isMultiTickCarFollowThrough =
      closestSurfaceGapUu <= 24.0 || (ticksSinceLastCarHit <= 10 && closestSurfaceGapUu <= 32.0);

    if (isMultiTickCarFollowThrough) {
      this.overwriteSpaceA(
        currentTick,
        'full-car-hit-followthrough',
        liveBall,
        rawSlices,
        actualSliceCount
      );
      return null;
    }

    const { velErrorUuPerSec } = evalMetrics;
    const isDeviationRecompute = updateKind === 'full-deviation';
    const isWorldBounceRecompute = updateKind === 'full-world-bounce';
    const isWasmSeamResync =
      updateKind === 'wasm-seam-resync' ||
      (!needFull && !wasIncrementalShift && this.prevPredictionCount > 1);
    const isVelocityStepMismatch =
      hasExpected && velErrorUuPerSec >= 18.0 && closestSurfaceGapUu > 45.0;

    if (isWasmSeamResync) {
      this.totalWasmSeamResyncs += 1;
    }

    const shouldCaptureAnomaly =
      isDeviationRecompute ||
      isWorldBounceRecompute ||
      isVelocityStepMismatch ||
      (isWasmSeamResync && (velErrorUuPerSec >= 0.35 || tailContinuityErrorUu >= 1.5));

    if (!shouldCaptureAnomaly) {
      return null;
    }

    this.totalNonCarRecomputes += 1;

    const triggerKind: TrajectoryAnomalyTriggerKind = isDeviationRecompute
      ? 'full-deviation'
      : isWorldBounceRecompute
        ? 'full-world-bounce'
        : isWasmSeamResync
          ? 'wasm-seam-resync'
          : 'velocity-step-mismatch';

    const capturedGroup = this.activeBufferGroup;
    this.sequenceCounter += 1;
    const { cars } = extractCarProximitySnapshots(phys, statePtr);
    const liveBallSnapshot = copyBallState18Snapshot(liveBall);
    const spaceABallSnapshot = this.hasSpaceABallState
      ? copyBallState18Snapshot(this.spaceABallStateSlot)
      : null;
    const prevBallSnapshot = this.hasPrevBallState
      ? copyBallState18Snapshot(this.prevBallStateSlot)
      : null;

    const sample = buildCapturedAnomalySample({
      sequenceNumber: this.sequenceCounter,
      bufferGroup: capturedGroup,
      triggerKind,
      seamRegion,
      currentTick,
      ticksSinceLastCarHit,
      closestSurfaceGapUu,
      deviationThresholdUu,
      updateKind,
      liveBall: liveBallSnapshot,
      cars,
      evalMetrics,
      expectedBeforeStepPos: [
        this.expectedBeforeStepPos[0],
        this.expectedBeforeStepPos[1],
        this.expectedBeforeStepPos[2],
      ],
      expectedBeforeStepVel: [
        this.expectedBeforeStepVel[0],
        this.expectedBeforeStepVel[1],
        this.expectedBeforeStepVel[2],
      ],
      expectedBeforeStepAngVel: [
        this.expectedBeforeStepAngVel[0],
        this.expectedBeforeStepAngVel[1],
        this.expectedBeforeStepAngVel[2],
      ],
      spaceATick: this.spaceATick,
      spaceAUpdateKind: this.spaceAUpdateKind,
      spaceABallState: spaceABallSnapshot,
      spaceARawSlices: this.spaceARawSlices,
      spaceASliceCount: this.spaceASliceCount,
      prevTick: this.prevTick,
      prevUpdateKind: this.prevUpdateKind,
      prevBallState: prevBallSnapshot,
      prevRawSlices: this.prevRawSlices,
      prevSliceCount: this.prevSliceCount,
      rawSlices,
      actualSliceCount,
      recentTickHistory: this._snapshotGroupTickHistory(activeGroupSlot),
    });

    activeGroupSlot.capturedSample = sample;
    this.latchedSample = sample;
    this._rebuildRetainedSamplesList();

    const nextGroup: TrajectoryAnomalyBufferGroup = capturedGroup === 'alpha' ? 'bravo' : 'alpha';
    this.activeBufferGroup = nextGroup;
    const nextGroupSlot = this._getGroupSlot(nextGroup);
    nextGroupSlot.tickHistoryHead = 0;
    nextGroupSlot.tickHistoryCount = 0;

    this.onAnomalyCapturedCallback?.(sample);

    return sample;
  }

  public getSummary(): BallTrajectoryAnomalySummary {
    return buildTrajectoryAnomalySummary({
      latchedSample: this.latchedSample,
      samples: this.samples,
      activeBufferGroup: this.activeBufferGroup,
      alphaSample: this.alphaGroup.capturedSample,
      bravoSample: this.bravoGroup.capturedSample,
      totalNonCarRecomputes: this.totalNonCarRecomputes,
      totalWasmSeamResyncs: this.totalWasmSeamResyncs,
      spaceATick: this.spaceATick,
      spaceAUpdateKind: this.spaceAUpdateKind,
    });
  }

  public resetLatchedAnomaly(): void {
    this.latchedSample = null;
    const activeSlot = this._getGroupSlot(this.activeBufferGroup);
    activeSlot.tickHistoryHead = 0;
    activeSlot.tickHistoryCount = 0;
  }

  public clearAllSamples(): void {
    this.latchedSample = null;
    this.samples = [];
    this.alphaGroup.capturedSample = null;
    this.alphaGroup.tickHistoryHead = 0;
    this.alphaGroup.tickHistoryCount = 0;
    this.bravoGroup.capturedSample = null;
    this.bravoGroup.tickHistoryHead = 0;
    this.bravoGroup.tickHistoryCount = 0;
    this.activeBufferGroup = 'alpha';
    this.totalNonCarRecomputes = 0;
    this.totalWasmSeamResyncs = 0;
  }

  public buildExportBundle(includeAllSamples = true): Record<string, unknown> {
    const activeSlot = this._getGroupSlot(this.activeBufferGroup);
    return buildTrajectoryAnomalyExportBundle({
      latchedSample: this.latchedSample,
      samples: this.samples,
      activeBufferGroup: this.activeBufferGroup,
      alphaSample: this.alphaGroup.capturedSample,
      bravoSample: this.bravoGroup.capturedSample,
      summary: this.getSummary(),
      tickHistory: this._snapshotGroupTickHistory(activeSlot),
      includeAllSamples,
    });
  }
}
