/**
 * ballTrajectoryTelemetryPipeline.ts
 * Pure data conversion pipeline for BallTrajectoryPredictor:
 * 1. Trajectory settings defaults and world linewidth / TubeRenderParams derivation.
 * 2. Telemetry snapshot assembly and publish-interval gating.
 * 3. Windowed catch-up slice state packing and active frame offset derivation.
 */

import type {
  TrajectoryDashCapStyle,
  TrajectoryRenderStyle,
  TrajectoryUpdateMode,
} from '../../ui-core/config/trainingDefaults.ts';
import type { TubeRenderParams } from './ballTrajectoryTubeMeshPipeline.ts';
import type { BallTrajectoryAnomalySummary } from './ballTrajectoryAnomalyPipeline.ts';

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
  hideAll(): void;
  updateBounceAndGroundAnchors(
    predictedPoints: Float32Array,
    predictionCount: number,
    startIndex: number,
    bounceMarkersBuffer: Float32Array,
    bounceCount: number,
    params: TubeRenderParams
  ): void;
  updateTubeGeometry(
    predictedPoints: Float32Array,
    predictionCount: number,
    startIndex: number,
    solidTicks: number,
    transparentTicks: number,
    phaseOffset: number,
    liveBallPosition: { x: number; y: number; z: number } | Float32Array | null | undefined,
    params: TubeRenderParams
  ): number;
}

export interface TrajectorySamplerPointsView {
  readonly predictedPoints: Float32Array;
  readonly predictionCount: number;
  readonly bounceMarkersBuffer: Float32Array;
  readonly bounceCount: number;
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
  sampler: TrajectorySamplerPointsView,
  ballRadius: number,
  settings: TrajectorySettingsConfig,
  elapsedTicks: number,
  patternElapsedTicks: number,
  dynamicMode: boolean,
  liveBallPosition: { x: number; y: number; z: number } | Float32Array | null | undefined
): number {
  if (!tubeRenderer) return 0;

  const tubeParams = buildTubeRenderParams(ballRadius, settings);
  const startIndex = Math.max(0, elapsedTicks);

  tubeRenderer.updateBounceAndGroundAnchors(
    sampler.predictedPoints,
    sampler.predictionCount,
    startIndex,
    sampler.bounceMarkersBuffer,
    sampler.bounceCount,
    tubeParams
  );

  const phaseOffset = dynamicMode ? 0 : patternElapsedTicks;
  return tubeRenderer.updateTubeGeometry(
    sampler.predictedPoints,
    sampler.predictionCount,
    startIndex,
    settings.solidTicks,
    settings.transparentTicks,
    phaseOffset,
    liveBallPosition,
    tubeParams
  );
}
