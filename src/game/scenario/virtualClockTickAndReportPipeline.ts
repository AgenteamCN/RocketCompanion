/**
 * virtualClockTickAndReportPipeline.ts
 * Pure execution helpers for single-tick 7-stage FramePipeline stepping,
 * forced keyframe GPU render passes, ScenarioStepContext construction,
 * and final ScenarioRunReport statistical assembly.
 */

import type { CarControlsInput } from '../../network/protocol/InputPacketCodec.ts';
import {
  buildAllStageTimingDistributions,
  evaluateCameraSmoothness,
  extractTopHitchFrames,
  PIPELINE_STAGE_NAMES,
  roundMetric,
  type CameraPoseSample,
  type RawTickTimingSample,
} from './scenarioMetricsPipeline.ts';
import {
  buildGoldenBaselineDiffSummary,
  captureVehicleRigGeometryProbe,
  diffVehicleRigProbeAgainstGolden65f1538d,
} from './scenarioRigProbeAndGoldenDiffPipeline.ts';
import type { RuntimeErrorInterceptionSummary } from './scenarioRuntimeErrorInterceptor.ts';
import {
  normalizeCarControls,
  queryCompiledShaderProgramCount,
  queryWebGlError,
  type SpeedPacingConfig,
} from './scenarioWebGlAndPacingPipeline.ts';
import type {
  KeyframeRenderSample,
  MultiplayerLoopbackTelemetry,
  PipelineStageName,
  ScenarioAssertionResult,
  ScenarioLoopbackSimulatorPort,
  ScenarioRunReport,
  ScenarioRuntimePort,
  ScenarioScript,
  ScenarioStepContext,
  SoakWatchdogReportPayload,
  VehicleRigGeometryProbeSnapshot,
} from './ScenarioTypes.ts';

export const FIXED_TICK_DT_SEC = 1 / 120;
export const FIXED_TICK_DT_MS = 1000 / 120;

export interface VirtualClockPipelineContextPort {
  shouldSkipGpuRender: boolean;
  reset(virtualTs: number, dtSec: number): void;
}

export interface VirtualClockRuntimeTarget extends ScenarioRuntimePort {
  lastTimestamp?: number;
  pipeline: {
    context: VirtualClockPipelineContextPort;
    stages: ReadonlyArray<{ execute(ctx: VirtualClockPipelineContextPort): void }>;
  };
  interpolator?: {
    lastTime?: number;
    accumulator?: number;
    sync?(nowMs: number): void;
  } | null;
}

export interface VirtualTickExecutionResult {
  didGpuRender: boolean;
  shaderProgramsBefore: number;
  shaderProgramsAfter: number;
  shaderProgramsDelta: number;
  glError: number;
  stageDurationsMs: Record<PipelineStageName, number>;
  totalFrameWallMs: number;
}

export function executeSingleVirtualPipelineTick(
  r: VirtualClockRuntimeTarget,
  virtualTs: number,
  shouldRenderGpu: boolean,
  checkGlError: boolean,
  realNow: () => number
): VirtualTickExecutionResult {
  const { context: ctx, stages } = r.pipeline;
  r.lastTimestamp = virtualTs - FIXED_TICK_DT_MS;
  if (r.interpolator) {
    r.interpolator.lastTime = virtualTs - FIXED_TICK_DT_MS;
    r.interpolator.accumulator = 1e-6;
  }
  ctx.reset(virtualTs, FIXED_TICK_DT_SEC);
  ctx.shouldSkipGpuRender = !shouldRenderGpu;

  const shaderProgramsBefore = queryCompiledShaderProgramCount(r.renderer);
  const stageDurationsMs = {
    InputStage: 0,
    SimulationStage: 0,
    GameplayModeStage: 0,
    PresentationStage: 0,
    AudioStage: 0,
    RenderStage: 0,
    TelemetryStage: 0,
  } as Record<PipelineStageName, number>;
  let totalFrameWallMs = 0;

  for (let i = 0; i < stages.length; i++) {
    const name = PIPELINE_STAGE_NAMES[i] || ('TelemetryStage' as PipelineStageName);
    const t0 = realNow();
    stages[i].execute(ctx);
    const dur = realNow() - t0;
    stageDurationsMs[name] = dur;
    totalFrameWallMs += dur;
  }

  const glError = checkGlError && !ctx.shouldSkipGpuRender ? queryWebGlError(r.renderer) : 0;
  const shaderProgramsAfter = queryCompiledShaderProgramCount(r.renderer);
  return {
    didGpuRender: !ctx.shouldSkipGpuRender,
    shaderProgramsBefore,
    shaderProgramsAfter,
    shaderProgramsDelta: Math.max(0, shaderProgramsAfter - shaderProgramsBefore),
    glError,
    stageDurationsMs,
    totalFrameWallMs,
  };
}

export function executeForcedKeyframeGpuRenderPass(
  r: VirtualClockRuntimeTarget,
  res: VirtualTickExecutionResult,
  realNow: () => number
): void {
  const ctx = r.pipeline.context;
  ctx.shouldSkipGpuRender = false;
  res.shaderProgramsBefore = queryCompiledShaderProgramCount(r.renderer);
  const t0 = realNow();
  r.renderSubsystem?.update?.(ctx);
  const extraMs = realNow() - t0;
  res.glError = queryWebGlError(r.renderer);
  res.stageDurationsMs.RenderStage += extraMs;
  res.shaderProgramsAfter = queryCompiledShaderProgramCount(r.renderer);
  res.shaderProgramsDelta = Math.max(0, res.shaderProgramsAfter - res.shaderProgramsBefore);
  res.didGpuRender = true;
  res.totalFrameWallMs += extraMs;
}

export interface CreateStepContextOptions {
  r: VirtualClockRuntimeTarget;
  loopbackSimulator: ScenarioLoopbackSimulatorPort;
  baseVirtualMs: number;
  getCurrentTick: () => number;
  getVirtualNowMs: () => number;
  setOverrideControls: (c: CarControlsInput | null) => void;
  setPendingKeyframeReason: (reason: string) => void;
  capturedProbes: VehicleRigGeometryProbeSnapshot[];
  assertions: ScenarioAssertionResult[];
}

export function createVirtualClockStepContext(opts: CreateStepContextOptions): ScenarioStepContext {
  const {
    r,
    loopbackSimulator,
    baseVirtualMs,
    getCurrentTick,
    getVirtualNowMs,
    setOverrideControls,
    setPendingKeyframeReason,
    capturedProbes,
    assertions,
  } = opts;

  return {
    get tick() {
      return getCurrentTick();
    },
    get virtualTimeMs() {
      return baseVirtualMs + getCurrentTick() * FIXED_TICK_DT_MS;
    },
    runtime: r,
    loopbackSimulator,
    setLocalCarControls: (c) => {
      setOverrideControls(normalizeCarControls<CarControlsInput>(c));
    },
    setBallState: (s) => {
      r?.physics?.setBallState?.(s);
      r?.authoritativeServer?.fallbackSim?.setBallState?.(s);
      r?.interpolator?.sync?.(getVirtualNowMs());
    },
    setCarState: (carIndex, s) => {
      r?.physics?.setCarState?.(carIndex, s);
      r?.authoritativeServer?.fallbackSim?.setCarState?.(carIndex, s);
      r?.interpolator?.sync?.(getVirtualNowMs());
    },
    captureVehicleRigProbe: (carIndex = 0) => {
      const p = captureVehicleRigGeometryProbe(r?.arena, carIndex);
      if (p) capturedProbes.push(p);
      return p;
    },
    diffVehicleRigAgainstGolden: (carIndex = 0, tol) => {
      const p = captureVehicleRigGeometryProbe(r?.arena, carIndex);
      if (!p) return null;
      capturedProbes.push(p);
      return diffVehicleRigProbeAgainstGolden65f1538d(p, tol);
    },
    markKeyframe: (reason) => {
      setPendingKeyframeReason(reason);
    },
    recordAssertion: (label, passed, detail) => {
      assertions.push({ tick: getCurrentTick(), label, passed: Boolean(passed), detail });
    },
  };
}

export interface AssembleScenarioReportInput {
  script: ScenarioScript;
  pacing: SpeedPacingConfig;
  totalTicks: number;
  wallClockDurationMs: number;
  renderedFramesCount: number;
  skippedRenderFramesCount: number;
  tickSamples: readonly RawTickTimingSample[];
  keyframeSamples: KeyframeRenderSample[];
  cameraPoses: readonly CameraPoseSample[];
  capturedProbes: VehicleRigGeometryProbeSnapshot[];
  assertions: ScenarioAssertionResult[];
  multiplayerLoopback: MultiplayerLoopbackTelemetry | null;
  runtimeErrors: RuntimeErrorInterceptionSummary;
  arena: ScenarioRuntimePort['arena'];
  soakWatchdog?: SoakWatchdogReportPayload | null;
}

export function assembleVirtualClockScenarioRunReport(
  input: AssembleScenarioReportInput
): ScenarioRunReport {
  const {
    script,
    pacing,
    totalTicks,
    wallClockDurationMs,
    renderedFramesCount,
    skippedRenderFramesCount,
    tickSamples,
    keyframeSamples,
    cameraPoses,
    capturedProbes,
    assertions,
    multiplayerLoopback,
    runtimeErrors,
    arena,
    soakWatchdog,
  } = input;

  const stageTimings = buildAllStageTimingDistributions(tickSamples);
  const topHitchFrames = extractTopHitchFrames(tickSamples, 5);
  const cameraSmoothness = evaluateCameraSmoothness(cameraPoses, keyframeSamples);
  const goldenDiff = pacing.includeGoldenDiff
    ? buildGoldenBaselineDiffSummary(arena, capturedProbes)
    : null;

  assertions.push({
    tick: totalTicks - 1,
    label: 'camera_no_nan_poses',
    passed: cameraSmoothness.nanFrameCount === 0,
    detail:
      cameraSmoothness.nanFrameCount > 0
        ? `Detected ${cameraSmoothness.nanFrameCount} NaN camera poses`
        : `All ${cameraSmoothness.sampleCount} camera poses finite`,
  });

  if (pacing.failOnConsoleError) {
    const e0 = runtimeErrors.entries[0];
    const loc = e0?.fileName ? ` (${e0.fileName}:${e0.lineNumber ?? 0})` : '';
    assertions.push({
      tick: e0?.tick ?? totalTicks - 1,
      label: 'zero_runtime_and_console_errors',
      passed: runtimeErrors.totalErrorCount === 0,
      detail:
        runtimeErrors.totalErrorCount === 0
          ? 'window.onerror=0, unhandledrejection=0, console.error=0'
          : `Captured ${runtimeErrors.totalErrorCount} error(s): [${e0?.source}] ${e0?.message}${loc}`,
    });
  }

  const simulatedDurationSeconds = roundMetric(totalTicks * FIXED_TICK_DT_SEC, 3);
  const effectiveTickRateHz = roundMetric((totalTicks / wallClockDurationMs) * 1000, 1);

  return {
    scenarioId: script.id,
    title: script.title,
    description: script.description,
    passed: assertions.every((a) => a.passed),
    configuredSpeedPreset: pacing.presetLabel,
    totalTicks,
    simulatedDurationSeconds,
    wallClockDurationMs: roundMetric(wallClockDurationMs, 2),
    effectiveTickRateHz,
    speedupFactorVsRealtime: roundMetric(effectiveTickRateHz / 120, 2),
    renderedFramesCount,
    skippedRenderFramesCount,
    stageTimings,
    topHitchFrames,
    keyframeRenders: keyframeSamples,
    cameraSmoothness,
    multiplayerLoopback,
    runtimeErrors,
    vehicleRigProbes: capturedProbes,
    goldenDiff,
    soakWatchdog: soakWatchdog ?? null,
    assertions,
  };
}
