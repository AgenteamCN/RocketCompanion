export interface AnomalyPhysicsCarTeamPort {
  readonly _carSpecs?: ReadonlyArray<{ readonly team?: number } | null>;
}

/**
 * High-speed arena surface / seam classification around the ball in Unreal Units (UU).
 * Standard carball arena half-extents:
 * - Sidewall X: +-4096 UU (with corner 45-deg bevel starting near |X| + |Y| > 8064)
 * - Backwall Y: +-5120 UU (goal opening |X| < 893, Z < 642.775)
 * - Floor Z: 0 UU (ball center resting ~93.15 UU)
 * - Ceiling Z: 2044 UU (ball center touching ~1950.85 UU)
 * - Curved ramp / fillet radius on floor-wall and ceiling-wall seams: ~160 - 256 UU
 */
export type TrajectoryArenaSeamRegion =
  | 'floor-sidewall-seam'
  | 'ceiling-sidewall-seam'
  | 'backwall-floor-seam'
  | 'backwall-ceiling-seam'
  | 'corner-curve'
  | 'sidewall-flat'
  | 'backwall-flat'
  | 'floor-flat'
  | 'ceiling-flat'
  | 'goal-mouth-lip'
  | 'mid-air';

export type TrajectoryAnomalyTriggerKind =
  | 'full-deviation'
  | 'wasm-seam-resync'
  | 'full-world-bounce'
  | 'velocity-step-mismatch';

export type TrajectoryAnomalyBufferGroup = 'alpha' | 'bravo';

export interface BallState18Snapshot {
  pos: [number, number, number];
  rotMat: [number, number, number, number, number, number, number, number, number];
  vel: [number, number, number];
  angVel: [number, number, number];
  speedUuPerSec: number;
  angSpeedRadPerSec: number;
}

export interface CarProximitySnapshot {
  carIndex: number;
  team: number;
  pos: [number, number, number];
  vel: [number, number, number];
  centerDistanceUu: number;
  approxSurfaceGapUu: number;
}

export interface TrajectoryPredictedSliceSample {
  sliceIndex: number;
  tickOffset: number;
  pos: [number, number, number];
  vel: [number, number, number];
  angVel: [number, number, number];
}

export interface PredictionSpaceSnapshot {
  spaceId: 'space-a-baseline' | 'space-b-recomputed' | 'prev-tick-expected';
  anchorTick: number;
  anchorUpdateKind: string;
  anchorBallState18: BallState18Snapshot;
  sliceCount: number;
  /** Dense raw slices near the anchor + seam window (up to 64 slices) */
  nearSlices: TrajectoryPredictedSliceSample[];
  /** Strided horizon slices across the full 600-tick trajectory */
  horizonSlices: TrajectoryPredictedSliceSample[];
}

export interface LiveTrajectoryTickRecord {
  tick: number;
  updateKind: string;
  wasIncrementalShift: boolean;
  needFull: boolean;
  carBallHitEvent: boolean;
  worldBounceEvent: boolean;
  seamRegion: TrajectoryArenaSeamRegion;
  closestCarGapUu: number;
  liveBallState18: BallState18Snapshot;
  expectedBeforeStepPos: [number, number, number];
  expectedBeforeStepVel: [number, number, number];
  expectedBeforeStepAngVel: [number, number, number];
  posErrorUu: number;
  velErrorUuPerSec: number;
  angVelErrorRadPerSec: number;
  wasmSlice0PosErrorUu: number;
  wasmSlice0VelErrorUuPerSec: number;
  wasmSlice0AngVelErrorRadPerSec: number;
  tailContinuityErrorUu: number;
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

export interface TrajectoryAnomalySample {
  id: string;
  sequenceNumber: number;
  bufferGroup: TrajectoryAnomalyBufferGroup;
  capturedAtIso: string;
  triggerKind: TrajectoryAnomalyTriggerKind;
  seamRegion: TrajectoryArenaSeamRegion;
  anomalyTick: number;
  ticksSinceLastCarHit: number;
  ticksSinceSpaceAAnchor: number;
  closestCarSurfaceGapUu: number;
  deviationThresholdUu: number;
  metrics: {
    posErrorUu: number;
    velErrorUuPerSec: number;
    angVelErrorRadPerSec: number;
    wasmSlice0PosErrorUu: number;
    wasmSlice0VelErrorUuPerSec: number;
    wasmSlice0AngVelErrorRadPerSec: number;
    tailContinuityErrorUu: number;
    spaceADirectOffsetIndex: number;
    spaceADirectPosErrorUu: number;
    spaceADirectVelErrorUuPerSec: number;
    spaceADirectAngVelErrorRadPerSec: number;
    posDeltaVec: [number, number, number];
    velDeltaVec: [number, number, number];
    angVelDeltaVec: [number, number, number];
  };
  liveBallAtAnomaly: BallState18Snapshot;
  carsAtAnomaly: CarProximitySnapshot[];
  /**
   * Space A: The prediction space established on the most recent Car-Ball Hit
   * (or initial launch before any non-car-hit anomaly).
   */
  spaceA: PredictionSpaceSnapshot;
  /**
   * Expected trajectory slice window from the immediately preceding tick before
   * the anomaly recomputation occurred.
   */
  previousTickSpace: PredictionSpaceSnapshot;
  /**
   * Space B: The newly recomputed prediction space at the anomaly tick.
   */
  spaceB: PredictionSpaceSnapshot;
  /**
   * Rolling buffer of recent physics ticks leading up to (and including) the anomaly.
   */
  recentTickHistory: LiveTrajectoryTickRecord[];
}

export interface BallTrajectoryAnomalySummary {
  armed: boolean;
  hasLatchedAnomaly: boolean;
  activeBufferGroup?: TrajectoryAnomalyBufferGroup;
  alphaSampleId?: string | null;
  bravoSampleId?: string | null;
  capturedCount: number;
  totalNonCarRecomputes: number;
  totalWasmSeamResyncs: number;
  spaceAAnchorTick: number;
  spaceAUpdateKind: string;
  latestSample: {
    id: string;
    sequenceNumber: number;
    bufferGroup?: TrajectoryAnomalyBufferGroup;
    capturedAtIso: string;
    triggerKind: TrajectoryAnomalyTriggerKind;
    seamRegion: TrajectoryArenaSeamRegion;
    anomalyTick: number;
    ticksSinceLastCarHit: number;
    ticksSinceSpaceAAnchor: number;
    closestCarSurfaceGapUu: number;
    posErrorUu: number;
    velErrorUuPerSec: number;
    angVelErrorRadPerSec: number;
    spaceADirectPosErrorUu: number;
    spaceADirectVelErrorUuPerSec: number;
    tailContinuityErrorUu: number;
    livePos: [number, number, number];
    liveVel: [number, number, number];
    liveSpeedUuPerSec: number;
  } | null;
}
