import { RAW_STRIDE } from './ballTrajectoryGeometryPipeline.ts';
import {
  type BallState18Snapshot,
  type BallTrajectoryAnomalySummary,
  type CarProximitySnapshot,
  type LiveTrajectoryTickRecord,
  type TrajectoryAnomalyBufferGroup,
  type TrajectoryAnomalySample,
  type TrajectoryAnomalyTriggerKind,
  type TrajectoryArenaSeamRegion,
  buildPredictionSpaceSnapshot,
} from './ballTrajectoryAnomalyPipeline.ts';

function round4(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

export interface AnomalyTickMetricsSummary {
  posErrorUu: number;
  velErrorUuPerSec: number;
  angVelErrorRadPerSec: number;
  wasmSlice0PosErrorUu: number;
  wasmSlice0VelErrorUuPerSec: number;
  wasmSlice0AngVelErrorRadPerSec: number;
  tailContinuityErrorUu: number;
}

export function buildCapturedAnomalySample(params: {
  sequenceNumber: number;
  bufferGroup?: TrajectoryAnomalyBufferGroup;
  triggerKind: TrajectoryAnomalyTriggerKind;
  seamRegion: TrajectoryArenaSeamRegion;
  currentTick: number;
  ticksSinceLastCarHit: number;
  closestSurfaceGapUu: number;
  deviationThresholdUu: number;
  updateKind: string;
  liveBall: BallState18Snapshot;
  cars: CarProximitySnapshot[];
  evalMetrics: AnomalyTickMetricsSummary;
  expectedBeforeStepPos: [number, number, number];
  expectedBeforeStepVel: [number, number, number];
  expectedBeforeStepAngVel: [number, number, number];
  spaceATick: number;
  spaceAUpdateKind: string;
  spaceABallState: BallState18Snapshot | null;
  spaceARawSlices: Float32Array;
  spaceASliceCount: number;
  prevTick: number;
  prevUpdateKind: string;
  prevBallState: BallState18Snapshot | null;
  prevRawSlices: Float32Array;
  prevSliceCount: number;
  rawSlices: Float32Array;
  actualSliceCount: number;
  recentTickHistory: LiveTrajectoryTickRecord[];
}): TrajectoryAnomalySample {
  const {
    sequenceNumber,
    bufferGroup = 'alpha',
    triggerKind,
    seamRegion,
    currentTick,
    ticksSinceLastCarHit,
    closestSurfaceGapUu,
    deviationThresholdUu,
    updateKind,
    liveBall,
    cars,
    evalMetrics,
    expectedBeforeStepPos,
    expectedBeforeStepVel,
    expectedBeforeStepAngVel,
    spaceATick,
    spaceAUpdateKind,
    spaceABallState,
    spaceARawSlices,
    spaceASliceCount,
    prevTick,
    prevUpdateKind,
    prevBallState,
    prevRawSlices,
    prevSliceCount,
    rawSlices,
    actualSliceCount,
    recentTickHistory,
  } = params;

  const ticksSinceSpaceAAnchor = spaceATick >= 0 ? Math.max(0, currentTick - spaceATick) : 0;
  const spaceADirectIdx = Math.max(
    0,
    Math.min(Math.max(0, spaceASliceCount - 1), ticksSinceSpaceAAnchor)
  );
  let spaceADirectPosErrorUu = 0;
  let spaceADirectVelErrorUuPerSec = 0;
  let spaceADirectAngVelErrorRadPerSec = 0;
  if (spaceASliceCount > 0 && ticksSinceSpaceAAnchor > 0) {
    const aBase = spaceADirectIdx * RAW_STRIDE;
    spaceADirectPosErrorUu = round4(
      Math.hypot(
        liveBall.pos[0] - (spaceARawSlices[aBase] ?? 0),
        liveBall.pos[1] - (spaceARawSlices[aBase + 1] ?? 0),
        liveBall.pos[2] - (spaceARawSlices[aBase + 2] ?? 0)
      )
    );
    spaceADirectVelErrorUuPerSec = round4(
      Math.hypot(
        liveBall.vel[0] - (spaceARawSlices[aBase + 3] ?? 0),
        liveBall.vel[1] - (spaceARawSlices[aBase + 4] ?? 0),
        liveBall.vel[2] - (spaceARawSlices[aBase + 5] ?? 0)
      )
    );
    spaceADirectAngVelErrorRadPerSec = round4(
      Math.hypot(
        liveBall.angVel[0] - (spaceARawSlices[aBase + 6] ?? 0),
        liveBall.angVel[1] - (spaceARawSlices[aBase + 7] ?? 0),
        liveBall.angVel[2] - (spaceARawSlices[aBase + 8] ?? 0)
      )
    );
  }

  return {
    id: `traj-anomaly-${sequenceNumber}-${bufferGroup}-t${currentTick}`,
    sequenceNumber,
    bufferGroup,
    capturedAtIso: new Date().toISOString(),
    triggerKind,
    seamRegion,
    anomalyTick: currentTick,
    ticksSinceLastCarHit,
    ticksSinceSpaceAAnchor,
    closestCarSurfaceGapUu: closestSurfaceGapUu,
    deviationThresholdUu,
    metrics: {
      posErrorUu: evalMetrics.posErrorUu,
      velErrorUuPerSec: evalMetrics.velErrorUuPerSec,
      angVelErrorRadPerSec: evalMetrics.angVelErrorRadPerSec,
      wasmSlice0PosErrorUu: evalMetrics.wasmSlice0PosErrorUu,
      wasmSlice0VelErrorUuPerSec: evalMetrics.wasmSlice0VelErrorUuPerSec,
      wasmSlice0AngVelErrorRadPerSec: evalMetrics.wasmSlice0AngVelErrorRadPerSec,
      tailContinuityErrorUu: evalMetrics.tailContinuityErrorUu,
      spaceADirectOffsetIndex: spaceADirectIdx,
      spaceADirectPosErrorUu,
      spaceADirectVelErrorUuPerSec,
      spaceADirectAngVelErrorRadPerSec,
      posDeltaVec: [
        round4(liveBall.pos[0] - expectedBeforeStepPos[0]),
        round4(liveBall.pos[1] - expectedBeforeStepPos[1]),
        round4(liveBall.pos[2] - expectedBeforeStepPos[2]),
      ],
      velDeltaVec: [
        round4(liveBall.vel[0] - expectedBeforeStepVel[0]),
        round4(liveBall.vel[1] - expectedBeforeStepVel[1]),
        round4(liveBall.vel[2] - expectedBeforeStepVel[2]),
      ],
      angVelDeltaVec: [
        round4(liveBall.angVel[0] - expectedBeforeStepAngVel[0]),
        round4(liveBall.angVel[1] - expectedBeforeStepAngVel[1]),
        round4(liveBall.angVel[2] - expectedBeforeStepAngVel[2]),
      ],
    },
    liveBallAtAnomaly: liveBall,
    carsAtAnomaly: cars,
    spaceA: buildPredictionSpaceSnapshot(
      'space-a-baseline',
      spaceATick,
      spaceAUpdateKind,
      spaceABallState ?? liveBall,
      spaceARawSlices,
      spaceASliceCount,
      spaceADirectIdx
    ),
    previousTickSpace: buildPredictionSpaceSnapshot(
      'prev-tick-expected',
      prevTick,
      prevUpdateKind,
      prevBallState ?? liveBall,
      prevRawSlices,
      prevSliceCount,
      0
    ),
    spaceB: buildPredictionSpaceSnapshot(
      'space-b-recomputed',
      currentTick,
      updateKind,
      liveBall,
      rawSlices,
      actualSliceCount,
      0
    ),
    recentTickHistory,
  };
}

export function buildTrajectoryAnomalySummary(params: {
  latchedSample: TrajectoryAnomalySample | null;
  samples: TrajectoryAnomalySample[];
  activeBufferGroup?: TrajectoryAnomalyBufferGroup;
  alphaSample?: TrajectoryAnomalySample | null;
  bravoSample?: TrajectoryAnomalySample | null;
  totalNonCarRecomputes: number;
  totalWasmSeamResyncs: number;
  spaceATick: number;
  spaceAUpdateKind: string;
}): BallTrajectoryAnomalySummary {
  const {
    latchedSample,
    samples,
    activeBufferGroup = 'alpha',
    alphaSample = null,
    bravoSample = null,
    totalNonCarRecomputes,
    totalWasmSeamResyncs,
    spaceATick,
    spaceAUpdateKind,
  } = params;
  const active = latchedSample ?? samples[samples.length - 1] ?? null;
  return {
    armed: true,
    hasLatchedAnomaly: latchedSample !== null,
    activeBufferGroup,
    alphaSampleId: alphaSample?.id ?? null,
    bravoSampleId: bravoSample?.id ?? null,
    capturedCount: samples.length,
    totalNonCarRecomputes,
    totalWasmSeamResyncs,
    spaceAAnchorTick: spaceATick,
    spaceAUpdateKind,
    latestSample: active
      ? {
          id: active.id,
          sequenceNumber: active.sequenceNumber,
          bufferGroup: active.bufferGroup,
          capturedAtIso: active.capturedAtIso,
          triggerKind: active.triggerKind,
          seamRegion: active.seamRegion,
          anomalyTick: active.anomalyTick,
          ticksSinceLastCarHit: active.ticksSinceLastCarHit,
          ticksSinceSpaceAAnchor: active.ticksSinceSpaceAAnchor,
          closestCarSurfaceGapUu: active.closestCarSurfaceGapUu,
          posErrorUu: active.metrics.posErrorUu,
          velErrorUuPerSec: active.metrics.velErrorUuPerSec,
          angVelErrorRadPerSec: active.metrics.angVelErrorRadPerSec,
          spaceADirectPosErrorUu: active.metrics.spaceADirectPosErrorUu,
          spaceADirectVelErrorUuPerSec: active.metrics.spaceADirectVelErrorUuPerSec,
          tailContinuityErrorUu: active.metrics.tailContinuityErrorUu,
          livePos: active.liveBallAtAnomaly.pos,
          liveVel: active.liveBallAtAnomaly.vel,
          liveSpeedUuPerSec: active.liveBallAtAnomaly.speedUuPerSec,
        }
      : null,
  };
}

export function buildTrajectoryAnomalyExportBundle(params: {
  latchedSample: TrajectoryAnomalySample | null;
  samples: TrajectoryAnomalySample[];
  activeBufferGroup?: TrajectoryAnomalyBufferGroup;
  alphaSample?: TrajectoryAnomalySample | null;
  bravoSample?: TrajectoryAnomalySample | null;
  summary: BallTrajectoryAnomalySummary;
  tickHistory: LiveTrajectoryTickRecord[];
  includeAllSamples: boolean;
}): Record<string, unknown> {
  const {
    latchedSample,
    samples,
    activeBufferGroup = 'alpha',
    alphaSample = null,
    bravoSample = null,
    summary,
    tickHistory,
    includeAllSamples,
  } = params;
  const primary = latchedSample ?? samples[samples.length - 1] ?? null;
  return {
    schema: 'rocket-companion.ball-trajectory-anomaly-debug.v2',
    exportedAtIso: new Date().toISOString(),
    summary,
    bufferGroups: {
      activeArmedGroup: activeBufferGroup,
      alpha: alphaSample,
      bravo: bravoSample,
    },
    latchedSample: primary,
    samples: includeAllSamples ? samples : primary ? [primary] : [],
    currentRollingTickHistory: tickHistory,
  };
}

export function populateLiveTickRecordSlot(params: {
  slot: LiveTrajectoryTickRecord;
  currentTick: number;
  updateKind: string;
  wasIncrementalShift: boolean;
  needFull: boolean;
  carBallHitEvent: boolean;
  worldBounceEvent: boolean;
  seamRegion: TrajectoryArenaSeamRegion;
  closestSurfaceGapUu: number;
  liveBall: BallState18Snapshot;
  hasExpected: boolean;
  expectedBeforeStepPos: [number, number, number];
  expectedBeforeStepVel: [number, number, number];
  expectedBeforeStepAngVel: [number, number, number];
  rawSlices: Float32Array;
  actualSliceCount: number;
  tailContinuityErrorUu: number;
}): AnomalyTickMetricsSummary {
  const {
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
    expectedBeforeStepPos,
    expectedBeforeStepVel,
    expectedBeforeStepAngVel,
    rawSlices,
    actualSliceCount,
    tailContinuityErrorUu,
  } = params;

  const dist3 = (a: [number, number, number], bx: number, by: number, bz: number) =>
    round4(Math.hypot(a[0] - bx, a[1] - by, a[2] - bz));

  const posErrorUu = hasExpected
    ? dist3(
        liveBall.pos,
        expectedBeforeStepPos[0],
        expectedBeforeStepPos[1],
        expectedBeforeStepPos[2]
      )
    : 0;
  const velErrorUuPerSec = hasExpected
    ? dist3(
        liveBall.vel,
        expectedBeforeStepVel[0],
        expectedBeforeStepVel[1],
        expectedBeforeStepVel[2]
      )
    : 0;
  const angVelErrorRadPerSec = hasExpected
    ? dist3(
        liveBall.angVel,
        expectedBeforeStepAngVel[0],
        expectedBeforeStepAngVel[1],
        expectedBeforeStepAngVel[2]
      )
    : 0;

  const wasmSlice0PosErrorUu =
    actualSliceCount > 0
      ? dist3(liveBall.pos, rawSlices[0] ?? 0, rawSlices[1] ?? 0, rawSlices[2] ?? 0)
      : 0;
  const wasmSlice0VelErrorUuPerSec =
    actualSliceCount > 0
      ? dist3(liveBall.vel, rawSlices[3] ?? 0, rawSlices[4] ?? 0, rawSlices[5] ?? 0)
      : 0;
  const wasmSlice0AngVelErrorRadPerSec =
    actualSliceCount > 0
      ? dist3(liveBall.angVel, rawSlices[6] ?? 0, rawSlices[7] ?? 0, rawSlices[8] ?? 0)
      : 0;

  slot.tick = currentTick;
  slot.updateKind = updateKind;
  slot.wasIncrementalShift = wasIncrementalShift;
  slot.needFull = needFull;
  slot.carBallHitEvent = carBallHitEvent;
  slot.worldBounceEvent = worldBounceEvent;
  slot.seamRegion = seamRegion;
  slot.closestCarGapUu = closestSurfaceGapUu;
  slot.expectedBeforeStepPos[0] = round4(expectedBeforeStepPos[0]);
  slot.expectedBeforeStepPos[1] = round4(expectedBeforeStepPos[1]);
  slot.expectedBeforeStepPos[2] = round4(expectedBeforeStepPos[2]);
  slot.expectedBeforeStepVel[0] = round4(expectedBeforeStepVel[0]);
  slot.expectedBeforeStepVel[1] = round4(expectedBeforeStepVel[1]);
  slot.expectedBeforeStepVel[2] = round4(expectedBeforeStepVel[2]);
  slot.expectedBeforeStepAngVel[0] = round4(expectedBeforeStepAngVel[0]);
  slot.expectedBeforeStepAngVel[1] = round4(expectedBeforeStepAngVel[1]);
  slot.expectedBeforeStepAngVel[2] = round4(expectedBeforeStepAngVel[2]);
  slot.posErrorUu = posErrorUu;
  slot.velErrorUuPerSec = velErrorUuPerSec;
  slot.angVelErrorRadPerSec = angVelErrorRadPerSec;
  slot.wasmSlice0PosErrorUu = wasmSlice0PosErrorUu;
  slot.wasmSlice0VelErrorUuPerSec = wasmSlice0VelErrorUuPerSec;
  slot.wasmSlice0AngVelErrorRadPerSec = wasmSlice0AngVelErrorRadPerSec;
  slot.tailContinuityErrorUu = tailContinuityErrorUu;

  return {
    posErrorUu,
    velErrorUuPerSec,
    angVelErrorRadPerSec,
    wasmSlice0PosErrorUu,
    wasmSlice0VelErrorUuPerSec,
    wasmSlice0AngVelErrorRadPerSec,
    tailContinuityErrorUu,
  };
}
