/**
 * ballTrajectoryTelemetryPipeline.ts
 * Pure data conversion pipeline for BallTrajectoryPredictor:
 * 1. Trajectory settings defaults and world linewidth / TubeRenderParams derivation.
 * 2. Telemetry snapshot assembly and publish-interval gating.
 * 3. Windowed catch-up slice state packing and active frame offset derivation.
 */

import {
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  SIM_OFFSETS,
} from '../../physics/RocketSimConstants.ts';
import type {
  TrajectoryDashCapStyle,
  TrajectoryRenderStyle,
  TrajectoryUpdateMode,
} from '../../ui-core/config/trainingDefaults.ts';
import type { RocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import {
  hasTrajectoryCoordinateDeviation,
  hasTrajectoryVelocityImpulse,
  isBallMovingAboveTrajectoryThreshold,
  type LiveBallPositionLike,
} from './ballTrajectoryGeometryPipeline.ts';
import type { TubeRenderParams } from './BallTrajectoryTubeRenderer.ts';
import type { BallTrajectoryAnomalySummary } from './ballTrajectoryAnomalyTypes.ts';

export type { BallTrajectoryAnomalySummary };

export type TrajectoryUpdateKind =
  | 'incremental-tail'
  | 'progressive-catchup'
  | 'wasm-seam-resync'
  | 'full-car-hit'
  | 'full-deviation'
  | 'full-initial'
  | 'full-world-bounce'
  | 'full-forced'
  | 'cached-tick'
  | 'static-preview'
  | 'sleeping';

export interface TrajectorySamplingConfig {
  predictionTicks: number;
  updateMode: TrajectoryUpdateMode;
  recomputeOnCarHit: boolean;
  recomputeOnWorldBounce: boolean;
  deviationThresholdUu: number;
  velocityThresholdUu: number;
  catchupTicksPerFrame: number;
}

export interface LiveSamplingStepInput {
  isActive: boolean;
  lastUpdatedTick: number;
  validCachedCount: number;
  currentTick: number;
  rawPosX: number;
  rawPosY: number;
  rawPosZ: number;
  rawVelX: number;
  rawVelY: number;
  rawVelZ: number;
  lastVelX: number;
  lastVelY: number;
  lastVelZ: number;
  pendingCarBallHit: boolean;
  pendingIntentionalReset?: boolean;
  isMultiTickCarContact?: boolean;
  forcePredictAnyMovement: boolean;
  rawPredictedPoints: Float32Array;
  cfg: TrajectorySamplingConfig;
}

export type LiveTrajectorySamplingDecision =
  | { action: 'noop' }
  | { action: 'cached-tick' }
  | { action: 'sleep' }
  | {
      action: 'predict';
      forceFull: boolean;
      deltaTicks: number;
      reason: TrajectoryUpdateKind;
      carHitCountDelta: number;
      deviationCountDelta: number;
      markMovingFast: boolean;
    };

export function computeClosestCarSurfaceGapUu(statePtr: Float32Array): number {
  const b = SIM_OFFSETS.BALL;
  const bx = statePtr[b] ?? 0;
  const by = statePtr[b + 1] ?? 0;
  const bz = statePtr[b + 2] ?? 0;
  const numCars = Math.max(0, Math.floor(statePtr[SIM_OFFSETS.NUM_CARS] ?? 0));
  let closestGap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < numCars; i++) {
    const c = SIM_OFFSETS.CARS + i * CAR_STATE_STRIDE;
    const cx = statePtr[c + CAR_STATE_OFFSETS.POS] ?? 0;
    const cy = statePtr[c + CAR_STATE_OFFSETS.POS + 1] ?? 0;
    const cz = statePtr[c + CAR_STATE_OFFSETS.POS + 2] ?? 0;
    const gap = Math.max(0, Math.hypot(bx - cx, by - cy, bz - cz) - 178.0);
    if (gap < closestGap) closestGap = gap;
  }
  return Number.isFinite(closestGap) ? Math.round(closestGap * 10000) / 10000 : 99999;
}

function fullPredictDecision(
  reason: TrajectoryUpdateKind,
  carHitCountDelta = 0,
  deviationCountDelta = 0,
  markMovingFast = false
): LiveTrajectorySamplingDecision {
  return {
    action: 'predict',
    forceFull: true,
    deltaTicks: 0,
    reason,
    carHitCountDelta,
    deviationCountDelta,
    markMovingFast,
  };
}

export function resolveLiveTrajectorySamplingDecision(
  input: LiveSamplingStepInput
): LiveTrajectorySamplingDecision {
  const {
    isActive,
    lastUpdatedTick,
    validCachedCount,
    currentTick,
    rawPosX,
    rawPosY,
    rawPosZ,
    rawVelX,
    rawVelY,
    rawVelZ,
    lastVelX,
    lastVelY,
    lastVelZ,
    pendingCarBallHit,
    pendingIntentionalReset = false,
    isMultiTickCarContact = false,
    forcePredictAnyMovement,
    rawPredictedPoints,
    cfg,
  } = input;

  const hasImpulse = hasTrajectoryVelocityImpulse(
    rawVelX,
    rawVelY,
    rawVelZ,
    lastVelX,
    lastVelY,
    lastVelZ
  );
  const isFastEnough = isBallMovingAboveTrajectoryThreshold(
    rawVelX,
    rawVelY,
    rawVelZ,
    rawPosZ,
    forcePredictAnyMovement,
    cfg.velocityThresholdUu
  );
  const carHitTriggered = pendingCarBallHit && cfg.recomputeOnCarHit !== false;
  const updateMode = cfg.updateMode || 'continuous-incremental';
  const deviationThreshold = Math.max(0.5, Number(cfg.deviationThresholdUu) || 5.0);
  const deltaTicks = Math.floor(currentTick - lastUpdatedTick);

  if (!isActive || pendingIntentionalReset) {
    if (isFastEnough || carHitTriggered || hasImpulse) {
      return fullPredictDecision(
        carHitTriggered ? 'full-car-hit' : 'full-initial',
        carHitTriggered ? 1 : 0,
        0,
        true
      );
    }
    return pendingIntentionalReset ? { action: 'sleep' } : { action: 'noop' };
  }

  const checkDeviation = (ticks: number): LiveTrajectorySamplingDecision | null => {
    if (
      ticks >= 0 &&
      ticks < validCachedCount &&
      hasTrajectoryCoordinateDeviation(
        rawPosX,
        rawPosY,
        rawPosZ,
        rawPredictedPoints,
        ticks,
        deviationThreshold
      )
    ) {
      return isMultiTickCarContact && cfg.recomputeOnCarHit !== false
        ? fullPredictDecision('full-car-hit', 1, 0)
        : fullPredictDecision('full-deviation', 0, 1);
    }
    return null;
  };

  if (updateMode !== 'continuous-incremental' && updateMode !== 'full-every-tick') {
    if (carHitTriggered || (cfg.recomputeOnWorldBounce && hasImpulse)) {
      return fullPredictDecision(
        carHitTriggered ? 'full-car-hit' : 'full-world-bounce',
        carHitTriggered ? 1 : 0
      );
    }
    return checkDeviation(deltaTicks) ?? { action: 'noop' };
  }

  if (deltaTicks < 0 || deltaTicks >= validCachedCount) {
    return fullPredictDecision('full-initial', 0, 0, true);
  }
  if (carHitTriggered) return fullPredictDecision('full-car-hit', 1);
  if (cfg.recomputeOnWorldBounce && hasImpulse) return fullPredictDecision('full-world-bounce');

  if (deltaTicks > 0) {
    const dev = checkDeviation(deltaTicks);
    if (dev) return dev;
    if (!isFastEnough && !forcePredictAnyMovement) return { action: 'sleep' };
    const forceFull = updateMode === 'full-every-tick';
    return {
      action: 'predict',
      forceFull,
      deltaTicks,
      reason: forceFull ? 'full-forced' : 'incremental-tail',
      carHitCountDelta: 0,
      deviationCountDelta: 0,
      markMovingFast: false,
    };
  }

  return { action: 'cached-tick' };
}

export interface BallTrajectoryTelemetrySnapshot {
  computeTimeUs: number;
  wasmComputeTimeUs: number;
  geometryBuildTimeUs: number;
  lastUpdateKind: TrajectoryUpdateKind;
  activeSlices: number;
  remainingSlices: number;
  incrementalStepCount: number;
  fullRecomputeCount: number;
  carHitRecomputeCount: number;
  deviationRecomputeCount: number;
  primitiveCount: number;
  bounceCount: number;
  maxHeightUu: number;
  ballSpeedUu: number;
  anomalySummary?: BallTrajectoryAnomalySummary;
}

export interface TrajectorySettingsConfig {
  enabled: boolean;
  predictionTicks: number;
  solidTicks: number;
  transparentTicks: number;
  thickness: number;
  opacity: number;
  color: string;
  dynamicMode: boolean;
  updateMode: TrajectoryUpdateMode;
  recomputeOnCarHit: boolean;
  recomputeOnWorldBounce: boolean;
  deviationThresholdUu: number;
  velocityThresholdUu: number;
  catchupTicksPerFrame: number;
  renderStyle: TrajectoryRenderStyle;
  dashCapStyle: TrajectoryDashCapStyle;
  sampleStride: number;
  tubeRadialSegments: number;
  shadingStrength: number;
  radiusTaper: number;
  horizonFade: number;
  showBounceMarkers: boolean;
  showGroundProjection: boolean;
  dropLineIntervalTicks: number;
  allowUserThicknessEdit: boolean;
  allowUserDashEdit: boolean;
}

export interface TrajectorySamplerMetricsView {
  readonly lastWasmUpdateUs: number;
  readonly lastUpdateKind: TrajectoryUpdateKind;
  readonly predictionCount: number;
  readonly incrementalStepCount: number;
  readonly fullRecomputeCount: number;
  readonly carHitRecomputeCount: number;
  readonly deviationRecomputeCount: number;
  readonly bounceCount: number;
  readonly maxHeightUu: number;
}

export interface BuildBallTrajectoryTelemetryInput {
  frameStartMs: number;
  nowMs: number;
  geometryBuildTimeUs: number;
  remainingSlices: number;
  primitiveCount: number;
  ballSpeedUu: number;
  samplerMetrics: TrajectorySamplerMetricsView;
  anomalySummary?: BallTrajectoryAnomalySummary;
}

export const TELEMETRY_PUBLISH_INTERVAL_MS = 65.0;

export const DEFAULT_TRAJECTORY_SETTINGS: Readonly<TrajectorySettingsConfig> = Object.freeze({
  enabled: true,
  predictionTicks: 600,
  solidTicks: 50,
  transparentTicks: 20,
  thickness: 20,
  opacity: 0.5,
  color: '#ffffff',
  dynamicMode: true,
  updateMode: 'continuous-incremental',
  recomputeOnCarHit: true,
  recomputeOnWorldBounce: false,
  deviationThresholdUu: 5,
  velocityThresholdUu: 15,
  catchupTicksPerFrame: 5,
  renderStyle: 'tube-3d',
  dashCapStyle: 'round',
  sampleStride: 1,
  tubeRadialSegments: 6,
  shadingStrength: 0.75,
  radiusTaper: 0.35,
  horizonFade: 0.3,
  showBounceMarkers: false,
  showGroundProjection: false,
  dropLineIntervalTicks: 104,
  allowUserThicknessEdit: false,
  allowUserDashEdit: true,
});

export function resolveTrajectoryWorldLinewidth(ballRadius: number, thicknessPct: number): number {
  const ballDiameter = (ballRadius || 91.25) * 2;
  const clampedPct = Math.min(75, Math.max(1, Number(thicknessPct) || 20));
  return (clampedPct / 100) * ballDiameter;
}

export function buildTubeRenderParams(
  ballRadius: number,
  settings: TrajectorySettingsConfig
): TubeRenderParams {
  const worldLinewidth = resolveTrajectoryWorldLinewidth(ballRadius, settings.thickness);
  return {
    color: settings.color || '#ffffff',
    opacity: Number(settings.opacity) || 0.5,
    worldRadius: worldLinewidth * 0.5,
    sampleStride: Math.max(1, Math.min(8, Math.round(Number(settings.sampleStride) || 1))),
    radialSegments: Math.max(4, Math.min(8, Math.round(Number(settings.tubeRadialSegments) || 6))),
    dashCapStyle: settings.dashCapStyle === 'chamfer' ? 'chamfer' : 'round',
    shadingStrength: Number.isFinite(Number(settings.shadingStrength))
      ? Number(settings.shadingStrength)
      : 0.75,
    radiusTaper: Number.isFinite(Number(settings.radiusTaper))
      ? Number(settings.radiusTaper)
      : 0.35,
    horizonFade: Number.isFinite(Number(settings.horizonFade)) ? Number(settings.horizonFade) : 0.3,
    showBounceMarkers: Boolean(settings.showBounceMarkers),
    showGroundProjection: Boolean(settings.showGroundProjection),
    dropLineIntervalTicks: Number(settings.dropLineIntervalTicks) || 104,
  };
}

export function shouldPublishTrajectoryTelemetry(
  nowMs: number,
  lastPublishMs: number,
  intervalMs: number = TELEMETRY_PUBLISH_INTERVAL_MS
): boolean {
  return nowMs - lastPublishMs >= intervalMs;
}

export function buildBallTrajectoryTelemetrySnapshot(
  input: BuildBallTrajectoryTelemetryInput
): BallTrajectoryTelemetrySnapshot {
  const {
    frameStartMs,
    nowMs,
    geometryBuildTimeUs,
    remainingSlices,
    primitiveCount,
    ballSpeedUu,
    samplerMetrics,
    anomalySummary,
  } = input;

  return {
    computeTimeUs: (nowMs - frameStartMs) * 1000.0,
    wasmComputeTimeUs: samplerMetrics.lastWasmUpdateUs,
    geometryBuildTimeUs,
    lastUpdateKind: samplerMetrics.lastUpdateKind,
    activeSlices: samplerMetrics.predictionCount,
    remainingSlices,
    incrementalStepCount: samplerMetrics.incrementalStepCount,
    fullRecomputeCount: samplerMetrics.fullRecomputeCount,
    carHitRecomputeCount: samplerMetrics.carHitRecomputeCount,
    deviationRecomputeCount: samplerMetrics.deviationRecomputeCount,
    primitiveCount,
    bounceCount: samplerMetrics.bounceCount,
    maxHeightUu: Math.round(samplerMetrics.maxHeightUu),
    ballSpeedUu: Math.round(ballSpeedUu),
    anomalySummary,
  };
}

export function computeStaticPreviewScrollOffset(nowMs: number): number {
  return Math.floor(nowMs * 0.001 * 90);
}

export function resolvePatternElapsedTicks(
  currentTick: number,
  patternAnchorTick: number,
  elapsedTicks: number
): number {
  return patternAnchorTick >= 0
    ? Math.max(0, Math.floor(currentTick - patternAnchorTick))
    : elapsedTicks;
}

export interface TrajectoryTubeRenderTarget {
  readonly preOcclusionMesh: { visible: boolean };
  readonly foregroundMesh: { visible: boolean };
  readonly lastBounceCount: number;
  readonly lastMaxHeightUu: number;
  hideAll(): void;
  buildAndBindFromWasm(
    wasmModule: RocketSimWasmModule | null | undefined,
    startIndex: number,
    solidTicks: number,
    transparentTicks: number,
    phaseOffsetTicks: number,
    liveBallPosition: LiveBallPositionLike | null | undefined,
    params: TubeRenderParams
  ): number;
}

export interface TrajectorySamplerPointsView {
  readonly predictionCount: number;
  bounceCount: number;
  maxHeightUu: number;
}

export function isTubeRendererVisible(tubeRenderer: TrajectoryTubeRenderTarget | null): boolean {
  if (!tubeRenderer) return false;
  return Boolean(tubeRenderer.preOcclusionMesh.visible || tubeRenderer.foregroundMesh.visible);
}

export function hideTubeRenderer(tubeRenderer: TrajectoryTubeRenderTarget | null): void {
  if (tubeRenderer) {
    tubeRenderer.hideAll();
  }
}

export function renderTrajectoryTubeFrame(
  tubeRenderer: TrajectoryTubeRenderTarget | null,
  wasmModule: RocketSimWasmModule | null | undefined,
  sampler: TrajectorySamplerPointsView,
  ballRadius: number,
  settings: TrajectorySettingsConfig,
  elapsedTicks: number,
  patternElapsedTicks: number,
  dynamicMode: boolean,
  liveBallPosition: LiveBallPositionLike | null | undefined
): number {
  if (!tubeRenderer) return 0;

  const tubeParams = buildTubeRenderParams(ballRadius, settings);
  const startIndex = Math.max(0, elapsedTicks);
  const phaseOffset = dynamicMode ? 0 : patternElapsedTicks;

  const activeTris = tubeRenderer.buildAndBindFromWasm(
    wasmModule,
    startIndex,
    settings.solidTicks,
    settings.transparentTicks,
    phaseOffset,
    liveBallPosition,
    tubeParams
  );
  sampler.bounceCount = tubeRenderer.lastBounceCount;
  sampler.maxHeightUu = tubeRenderer.lastMaxHeightUu;
  return activeTris;
}
