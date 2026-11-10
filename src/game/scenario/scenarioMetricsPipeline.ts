/**
 * scenarioMetricsPipeline.ts
 * Pure statistical and geometric evaluation functions for scenario stage timings,
 * hitch frame attribution, camera smoothness telemetry, and speed pacing presets.
 */

import type {
  CameraSmoothnessTelemetry,
  HitchFrameAttribution,
  KeyframeRenderSample,
  PipelineStageName,
  StageTimingDistribution,
} from './ScenarioTypes.ts';

export const PIPELINE_STAGE_NAMES: readonly PipelineStageName[] = Object.freeze([
  'InputStage',
  'SimulationStage',
  'GameplayModeStage',
  'PresentationStage',
  'AudioStage',
  'RenderStage',
  'TelemetryStage',
]);

export interface RawTickTimingSample {
  tick: number;
  virtualTimeMs: number;
  phase: string;
  cameraMode: string;
  didGpuRender: boolean;
  shaderProgramsDelta: number;
  stageDurationsMs: Record<PipelineStageName, number>;
  totalFrameWallMs: number;
}

export interface CameraPoseSample {
  tick: number;
  phase: string;
  cameraMode: string;
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export function computeQuantile(sortedAscending: readonly number[], q: number): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAscending[0];
  const clampedQ = Math.max(0, Math.min(1, q));
  const pos = clampedQ * (n - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedAscending[lower];
  const weight = pos - lower;
  return sortedAscending[lower] * (1 - weight) + sortedAscending[upper] * weight;
}

export function roundMetric(val: number, decimals = 4): number {
  if (!Number.isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function summarizeStageTimingSeries(
  stage: PipelineStageName | 'TotalFrame',
  values: readonly number[],
  ticks: readonly number[]
): StageTimingDistribution {
  const n = values.length;
  if (n === 0) {
    return {
      stage,
      sampleCount: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      maxTick: 0,
      totalWallMs: 0,
    };
  }

  let sum = 0;
  let maxVal = -1;
  let maxTick = 0;
  const copy: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const v = values[i];
    copy[i] = v;
    sum += v;
    if (v > maxVal) {
      maxVal = v;
      maxTick = ticks[i] ?? i;
    }
  }

  copy.sort((a, b) => a - b);

  return {
    stage,
    sampleCount: n,
    meanMs: roundMetric(sum / n, 4),
    p50Ms: roundMetric(computeQuantile(copy, 0.5), 4),
    p95Ms: roundMetric(computeQuantile(copy, 0.95), 4),
    p99Ms: roundMetric(computeQuantile(copy, 0.99), 4),
    maxMs: roundMetric(maxVal, 4),
    maxTick,
    totalWallMs: roundMetric(sum, 3),
  };
}

export function buildAllStageTimingDistributions(
  samples: readonly RawTickTimingSample[]
): Record<PipelineStageName | 'TotalFrame', StageTimingDistribution> {
  const ticks = samples.map((s) => s.tick);
  const result = {} as Record<PipelineStageName | 'TotalFrame', StageTimingDistribution>;

  for (const stageName of PIPELINE_STAGE_NAMES) {
    const values = samples.map((s) => s.stageDurationsMs[stageName] ?? 0);
    result[stageName] = summarizeStageTimingSeries(stageName, values, ticks);
  }

  const totalValues = samples.map((s) => s.totalFrameWallMs);
  result.TotalFrame = summarizeStageTimingSeries('TotalFrame', totalValues, ticks);
  return result;
}

export function extractTopHitchFrames(
  samples: readonly RawTickTimingSample[],
  topN = 5
): HitchFrameAttribution[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) => b.totalFrameWallMs - a.totalFrameWallMs);
  const limit = Math.min(topN, sorted.length);
  const result: HitchFrameAttribution[] = [];

  for (let i = 0; i < limit; i++) {
    const s = sorted[i];
    let dominantStage: PipelineStageName = 'SimulationStage';
    let dominantStageWallMs = -1;
    const roundedBreakdown = {} as Record<PipelineStageName, number>;

    for (const stage of PIPELINE_STAGE_NAMES) {
      const dur = s.stageDurationsMs[stage] ?? 0;
      roundedBreakdown[stage] = roundMetric(dur, 4);
      if (dur > dominantStageWallMs) {
        dominantStageWallMs = dur;
        dominantStage = stage;
      }
    }

    result.push({
      tick: s.tick,
      virtualTimeMs: roundMetric(s.virtualTimeMs, 2),
      totalFrameWallMs: roundMetric(s.totalFrameWallMs, 4),
      dominantStage,
      dominantStageWallMs: roundMetric(dominantStageWallMs, 4),
      phase: s.phase,
      cameraMode: s.cameraMode,
      didGpuRender: s.didGpuRender,
      shaderProgramsDelta: s.shaderProgramsDelta,
      stageBreakdownMs: roundedBreakdown,
    });
  }

  return result;
}

export function evaluateCameraSmoothness(
  poses: readonly CameraPoseSample[],
  keyframes: readonly KeyframeRenderSample[]
): CameraSmoothnessTelemetry {
  if (poses.length === 0) {
    return {
      sampleCount: 0,
      nanFrameCount: 0,
      maxPositionStepDistance: 0,
      p95PositionStepDistance: 0,
      maxAngularStepDeg: 0,
      p95AngularStepDeg: 0,
      directorReplaySamples: 0,
      directorReplayFirstFrameRenderMs: null,
      directorReplayFirstFrameShaderDelta: null,
    };
  }

  let nanFrameCount = 0;
  let directorReplaySamples = 0;
  const posSteps: number[] = [];
  const angSteps: number[] = [];

  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    const hasNan =
      !Number.isFinite(p.px) ||
      !Number.isFinite(p.py) ||
      !Number.isFinite(p.pz) ||
      !Number.isFinite(p.qx) ||
      !Number.isFinite(p.qy) ||
      !Number.isFinite(p.qz) ||
      !Number.isFinite(p.qw);
    if (hasNan) {
      nanFrameCount++;
      continue;
    }

    if (p.phase === 'replay' || p.cameraMode === 'director') {
      directorReplaySamples++;
    }

    if (i > 0) {
      const prev = poses[i - 1];
      if (prev.phase === p.phase && prev.cameraMode === p.cameraMode) {
        const dx = p.px - prev.px;
        const dy = p.py - prev.py;
        const dz = p.pz - prev.pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (Number.isFinite(dist)) posSteps.push(dist);

        const dot = Math.min(
          1,
          Math.abs(prev.qx * p.qx + prev.qy * p.qy + prev.qz * p.qz + prev.qw * p.qw)
        );
        const angleRad = 2 * Math.acos(dot);
        const angleDeg = (angleRad * 180) / Math.PI;
        if (Number.isFinite(angleDeg)) angSteps.push(angleDeg);
      }
    }
  }

  posSteps.sort((a, b) => a - b);
  angSteps.sort((a, b) => a - b);

  const firstReplayKeyframe = keyframes.find(
    (k) => k.phase === 'replay' || k.reason.includes('replay') || k.reason.includes('director')
  );

  return {
    sampleCount: poses.length,
    nanFrameCount,
    maxPositionStepDistance: roundMetric(
      posSteps.length > 0 ? posSteps[posSteps.length - 1] : 0,
      3
    ),
    p95PositionStepDistance: roundMetric(computeQuantile(posSteps, 0.95), 3),
    maxAngularStepDeg: roundMetric(angSteps.length > 0 ? angSteps[angSteps.length - 1] : 0, 3),
    p95AngularStepDeg: roundMetric(computeQuantile(angSteps, 0.95), 3),
    directorReplaySamples,
    directorReplayFirstFrameRenderMs: firstReplayKeyframe
      ? roundMetric(firstReplayKeyframe.renderStageWallMs, 3)
      : null,
    directorReplayFirstFrameShaderDelta: firstReplayKeyframe
      ? firstReplayKeyframe.shaderProgramsDelta
      : null,
  };
}
