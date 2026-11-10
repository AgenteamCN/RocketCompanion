/**
 * ScenarioTypes.ts
 * Declarative scenario script format, tick-scheduled action/assertion descriptors,
 * per-stage wall-clock timing distributions, keyframe GPU/shader telemetry,
 * and baseline suite report schemas.
 */

import type { CarControlsInput } from '../../network/protocol/InputPacketCodec.ts';
import type {
  GoldenBaselineDiffSummary,
  GoldenFieldDiffItem,
  VehicleRigGeometryProbeSnapshot,
  VehicleRigGoldenDiffReport,
  VehicleWheelGeometrySample,
} from './goldenBaseline65f1538dData.ts';
import type {
  CapturedRuntimeErrorEntry,
  RuntimeErrorInterceptionSummary,
} from './scenarioRuntimeErrorInterceptor.ts';
import type {
  KinematicPatch,
  MultiplayerLoopbackTelemetry,
  PeerReplaySkipPolicy,
  ScenarioActiveModePort,
  ScenarioAuthoritativeServerPort,
  ScenarioLoopbackSimulatorPort,
  ScenarioRuntimePort,
  ScenarioServerPlayerEntry,
  Vec3Obj,
  Vec3Tuple,
  VirtualPeerLoadoutSpec,
} from './ScenarioPortTypes.ts';

export type {
  CapturedRuntimeErrorEntry,
  GoldenBaselineDiffSummary,
  GoldenFieldDiffItem,
  KinematicPatch,
  MultiplayerLoopbackTelemetry,
  PeerReplaySkipPolicy,
  RuntimeErrorInterceptionSummary,
  ScenarioActiveModePort,
  ScenarioAuthoritativeServerPort,
  ScenarioLoopbackSimulatorPort,
  ScenarioRuntimePort,
  ScenarioServerPlayerEntry,
  Vec3Obj,
  Vec3Tuple,
  VehicleRigGeometryProbeSnapshot,
  VehicleRigGoldenDiffReport,
  VehicleWheelGeometrySample,
  VirtualPeerLoadoutSpec,
};

export type PipelineStageName =
  | 'InputStage'
  | 'SimulationStage'
  | 'GameplayModeStage'
  | 'PresentationStage'
  | 'AudioStage'
  | 'RenderStage'
  | 'TelemetryStage';

export type ScenarioSpeedPreset = '1x' | '10x' | '20x' | '50x' | 'max';

export type SoakAbortReason =
  | 'NONE'
  | 'WEB_AUDIO_TIMELINE_UNBOUNDED_GROWTH'
  | 'JS_HEAP_SOFT_LIMIT_EXCEEDED'
  | 'PIPELINE_STAGE_DRIFT_EXCEEDED';

export interface SoakCircuitBreakerConfig {
  enabled: boolean;
  windowTicks: number;
  minWindowsBeforeTrip: number;
  maxHeapMb: number;
  maxUncleanedAudioEvents: number;
  maxStageDriftRatio: number;
  minStageAbsoluteDriftMs: number;
  slopeWindowCount: number;
}

export interface AudioCallerAttributionEntry {
  caller: string;
  uncleanedEvents: number;
  totalScheduledEvents: number;
  cancelCount: number;
  directValueWrites: number;
  activeParamInstances: number;
  sharePercent: number;
  eventsPerSimSecond: number;
  estimatedNativeTimelineKb: number;
}

export interface TransientAllocationSourceEntry {
  source: string;
  totalAllocations: number;
  allocationsPerSimSecond: number;
  sharePercent: number;
}

export interface SoakStageWindowMetric {
  stage: PipelineStageName | 'TotalFrame';
  baselineMeanMs: number;
  currentMeanMs: number;
  driftPercent: number;
  driftRatio: number;
  slopeMsPer1000Ticks: number;
}

export interface SoakWindowTelemetrySample {
  windowIndex: number;
  tick: number;
  simSeconds: number;
  wallSeconds: number;
  windowWallMs: number;
  fpsEquivalentHz: number;
  jsHeapUsedMb: number;
  jsHeapTotalMb: number;
  uncleanedAudioEvents: number;
  totalScheduledAudioEvents: number;
  directAudioValueWrites: number;
  estimatedAudioNativeKb: number;
  topAudioCallers: AudioCallerAttributionEntry[];
  vectorsAndTransientAllocPerSec: number;
  totalTransientAllocations: number;
  topAllocationSources: TransientAllocationSourceEntry[];
  stageMetrics: Record<PipelineStageName | 'TotalFrame', SoakStageWindowMetric>;
  formattedLine: string;
}

export interface SoakAutopsyReport {
  circuitBreakerTripped: boolean;
  abortReason: SoakAbortReason;
  triggeredAtTick: number;
  triggeredAtSimSeconds: number;
  triggeredAtWallSeconds: number;
  configuredThresholds: SoakCircuitBreakerConfig;
  initialJsHeapMb: number;
  finalJsHeapMb: number;
  peakJsHeapMb: number;
  heapSlopeMbPerSimMinute: number;
  finalUncleanedAudioEvents: number;
  finalEstimatedAudioNativeMb: number;
  audioEventsPerSimSecond: number;
  topAudioCulprits: AudioCallerAttributionEntry[];
  topAllocationCulprits: TransientAllocationSourceEntry[];
  stageDriftSummary: SoakStageWindowMetric[];
  formattedAutopsyLines: string[];
}

export interface SoakWatchdogReportPayload {
  config: SoakCircuitBreakerConfig;
  windows: SoakWindowTelemetrySample[];
  autopsy: SoakAutopsyReport;
}

export interface ScenarioDriverRunOptions {
  speed?: ScenarioSpeedPreset | string | number;
  totalTicksOverride?: number;
  renderStrideOverride?: number;
  batchYieldTicksOverride?: number;
  failOnConsoleError?: boolean;
  includeGoldenDiff?: boolean;
  soakWatchdog?: boolean;
  soakConfig?: Partial<SoakCircuitBreakerConfig>;
}

export interface BootstrapTaskTelemetry {
  stageIndex: number;
  stageTitle: string;
  step: number;
  totalSteps: number;
  taskId: string;
  taskName: string;
  durationMs: number;
  status: 'completed' | 'skipped' | 'error';
}

export interface BootstrapStageSummary {
  stageIndex: number;
  stageTitle: string;
  totalDurationMs: number;
  taskCount: number;
  tasks: BootstrapTaskTelemetry[];
}

export interface BootstrapTelemetrySnapshot {
  totalDurationMs: number;
  totalSteps: number;
  backgroundAssetsDurationMs: number;
  initialCompiledShaderPrograms: number;
  stages: BootstrapStageSummary[];
}

export interface StageTimingDistribution {
  stage: PipelineStageName | 'TotalFrame';
  sampleCount: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  maxTick: number;
  totalWallMs: number;
}

export interface KeyframeRenderSample {
  tick: number;
  virtualTimeMs: number;
  reason: string;
  phase: string;
  gameMode: string;
  cameraMode: string;
  renderStageWallMs: number;
  totalFrameWallMs: number;
  shaderProgramsBefore: number;
  shaderProgramsAfter: number;
  shaderProgramsDelta: number;
  glError: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface HitchFrameAttribution {
  tick: number;
  virtualTimeMs: number;
  totalFrameWallMs: number;
  dominantStage: PipelineStageName;
  dominantStageWallMs: number;
  phase: string;
  cameraMode: string;
  didGpuRender: boolean;
  shaderProgramsDelta: number;
  stageBreakdownMs: Record<PipelineStageName, number>;
}

export interface CameraSmoothnessTelemetry {
  sampleCount: number;
  nanFrameCount: number;
  maxPositionStepDistance: number;
  p95PositionStepDistance: number;
  maxAngularStepDeg: number;
  p95AngularStepDeg: number;
  directorReplaySamples: number;
  directorReplayFirstFrameRenderMs: number | null;
  directorReplayFirstFrameShaderDelta: number | null;
}

export interface ScenarioAssertionResult {
  tick: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ScenarioStepContext {
  readonly tick: number;
  readonly virtualTimeMs: number;
  readonly runtime: ScenarioRuntimePort;
  readonly loopbackSimulator: ScenarioLoopbackSimulatorPort;
  setLocalCarControls(controls: Partial<CarControlsInput> | null): void;
  setBallState(state: KinematicPatch): void;
  setCarState(carIndex: number, state: KinematicPatch): void;
  captureVehicleRigProbe(carIndex?: number): VehicleRigGeometryProbeSnapshot | null;
  diffVehicleRigAgainstGolden(
    carIndex?: number,
    toleranceUu?: number
  ): VehicleRigGoldenDiffReport | null;
  markKeyframe(reason: string): void;
  recordAssertion(label: string, passed: boolean, detail: string): void;
}

export interface ScenarioTickStep {
  tick: number;
  description: string;
  forceKeyframeRender?: boolean;
  keyframeReason?: string;
  action?: (ctx: ScenarioStepContext) => void | Promise<void>;
}

export interface ScenarioScript {
  id: string;
  title: string;
  description: string;
  totalTicks: number;
  renderStride: number;
  batchYieldTicks?: number;
  forceRenderOnKeyframes?: boolean;
  setup?: (ctx: ScenarioStepContext) => void | Promise<void>;
  perTick?: (ctx: ScenarioStepContext) => void;
  teardown?: (ctx: ScenarioStepContext) => void | Promise<void>;
  steps: ScenarioTickStep[];
}

export interface ScenarioRunReport {
  scenarioId: string;
  title: string;
  description: string;
  passed: boolean;
  configuredSpeedPreset: string;
  totalTicks: number;
  simulatedDurationSeconds: number;
  wallClockDurationMs: number;
  effectiveTickRateHz: number;
  speedupFactorVsRealtime: number;
  renderedFramesCount: number;
  skippedRenderFramesCount: number;
  stageTimings: Record<PipelineStageName | 'TotalFrame', StageTimingDistribution>;
  topHitchFrames: HitchFrameAttribution[];
  keyframeRenders: KeyframeRenderSample[];
  cameraSmoothness: CameraSmoothnessTelemetry;
  multiplayerLoopback: MultiplayerLoopbackTelemetry | null;
  runtimeErrors: RuntimeErrorInterceptionSummary;
  vehicleRigProbes: VehicleRigGeometryProbeSnapshot[];
  goldenDiff: GoldenBaselineDiffSummary | null;
  soakWatchdog?: SoakWatchdogReportPayload | null;
  assertions: ScenarioAssertionResult[];
}

export interface BaselineSuiteTelemetryReport {
  schemaVersion: '1.0.0' | '1.1.0';
  generatedAtIso: string;
  gitCommitShort?: string;
  configuredSpeedPreset: string;
  userAgent: string;
  webglRenderer: string;
  webglVendor: string;
  bootstrap: BootstrapTelemetrySnapshot;
  goldenBaselineDiff: GoldenBaselineDiffSummary | null;
  scenarios: ScenarioRunReport[];
  overallPassed: boolean;
}
