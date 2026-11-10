/**
 * ScenarioAutorunBootstrap.ts
 * Stateful SubController capturing Stage 1~6 engine bootstrap telemetry via
 * LoadingProgressObserver and orchestrating ?autorunScenario=... baseline suites,
 * configurable speed presets (?autorunSpeed=10x|20x|50x), 65f1538d Golden Baseline
 * diffs (?diffBaseline=1), and real-device Self-Test diagnostic APIs.
 */

import {
  getStageMeta,
  type LoadingCompleteEvent,
  type LoadingErrorEvent,
  type LoadingProgressObserver,
  type LoadingStageChangeEvent,
  type LoadingTaskCompleteEvent,
} from '../../loader/types.ts';
import { resolveRequestedScenarios } from './builtinBaselineScenarios.ts';
import { roundMetric } from './scenarioMetricsPipeline.ts';
import {
  buildGoldenBaselineDiffSummary,
  captureVehicleRigGeometryProbe,
} from './scenarioRigProbeAndGoldenDiffPipeline.ts';
import type {
  BaselineSuiteTelemetryReport,
  BootstrapStageSummary,
  BootstrapTaskTelemetry,
  BootstrapTelemetrySnapshot,
  GoldenBaselineDiffSummary,
  ScenarioDriverRunOptions,
  ScenarioRunReport,
  ScenarioRuntimePort,
  VehicleRigGeometryProbeSnapshot,
} from './ScenarioTypes.ts';
import { VirtualClockFastForwardDriver } from './VirtualClockFastForwardDriver.ts';

declare global {
  interface Window {
    __rcScenarioDriver?: ScenarioAutorunController;
    __rcScenarioReport?: BaselineSuiteTelemetryReport;
    __rcScenarioError?: string;
  }
}

export interface AutorunUrlQueryConfig {
  scenarioQuery: string | null;
  runOptions: ScenarioDriverRunOptions;
}

export function getAutorunScenarioParam(): string | null {
  return parseAutorunUrlQueryConfig().scenarioQuery;
}

export function parseAutorunUrlQueryConfig(): AutorunUrlQueryConfig {
  if (typeof window === 'undefined' || !window.location?.search) {
    return { scenarioQuery: null, runOptions: {} };
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const scenarioQuery = params.get('autorunScenario');
    const speed = params.get('autorunSpeed') || params.get('speed') || undefined;
    const diffParam = params.get('diffBaseline') ?? params.get('includeGoldenDiff');
    const allowConsoleErr = params.get('allowConsoleError');

    const runOptions: ScenarioDriverRunOptions = {};
    if (speed) runOptions.speed = speed;
    if (diffParam !== null) {
      runOptions.includeGoldenDiff = diffParam !== '0' && diffParam !== 'false';
    }
    if (allowConsoleErr === '1' || allowConsoleErr === 'true') {
      runOptions.failOnConsoleError = false;
    }

    const soakTicks = Number(params.get('soakTicks') || 0);
    if (Number.isFinite(soakTicks) && soakTicks > 0) {
      runOptions.totalTicksOverride = Math.round(soakTicks);
    }
    const renderStride = Number(params.get('renderStride') || 0);
    if (Number.isFinite(renderStride) && renderStride > 0) {
      runOptions.renderStrideOverride = Math.round(renderStride);
    }

    if (params.get('soakWatchdog') === '1' || scenarioQuery === 'freeplay_chaos_soak') {
      runOptions.soakWatchdog = true;
      const soakConfig: NonNullable<ScenarioDriverRunOptions['soakConfig']> = {};
      if (params.get('noCircuitBreaker') === '1') soakConfig.enabled = false;
      const winTicks = Number(params.get('soakWindowTicks') || 0);
      if (winTicks > 0) soakConfig.windowTicks = Math.round(winTicks);
      const minWin = Number(params.get('minWindows') || 0);
      if (minWin > 0) soakConfig.minWindowsBeforeTrip = Math.round(minWin);
      const maxHeap = Number(params.get('maxHeapMb') || 0);
      if (maxHeap > 0) soakConfig.maxHeapMb = maxHeap;
      const maxAudio = Number(params.get('maxUncleanedAudioEvents') || 0);
      if (maxAudio > 0) soakConfig.maxUncleanedAudioEvents = Math.round(maxAudio);
      const maxDrift = Number(params.get('maxStageDriftRatio') || 0);
      if (maxDrift > 0) soakConfig.maxStageDriftRatio = maxDrift;
      runOptions.soakConfig = soakConfig;
    }

    return { scenarioQuery, runOptions };
  } catch {
    return { scenarioQuery: null, runOptions: {} };
  }
}

export class ScenarioBootstrapTelemetryObserver implements LoadingProgressObserver {
  private readonly stageTitles = new Map<number, string>();
  private readonly tasks: BootstrapTaskTelemetry[] = [];
  private totalDurationMs = 0;
  private totalSteps = 0;
  private backgroundAssetsDurationMs = 0;

  public onStageChange(event: LoadingStageChangeEvent): void {
    this.stageTitles.set(event.stageIndex, event.stageTitle);
  }

  public onTaskComplete(event: LoadingTaskCompleteEvent): void {
    const stageTitle =
      this.stageTitles.get(event.stageIndex) || getStageMeta(event.stageIndex).title;
    this.tasks.push({
      stageIndex: event.stageIndex,
      stageTitle,
      step: event.step,
      totalSteps: event.totalSteps,
      taskId: event.taskId,
      taskName: event.taskName,
      durationMs: roundMetric(event.durationMs ?? 0, 2),
      status: event.status === 'skipped' ? 'skipped' : 'completed',
    });
  }

  public onError(event: LoadingErrorEvent): void {
    this.tasks.push({
      stageIndex: 0,
      stageTitle: 'Error',
      step: 0,
      totalSteps: this.totalSteps,
      taskId: event.taskId || 'unknown',
      taskName: event.taskName || 'Unknown Task',
      durationMs: 0,
      status: 'error',
    });
  }

  public onComplete(event: LoadingCompleteEvent = {}): void {
    this.totalDurationMs = roundMetric(event.totalDurationMs ?? 0, 2);
    this.totalSteps = event.totalSteps ?? this.tasks.length;
  }

  public setBackgroundAssetsDurationMs(durationMs: number): void {
    this.backgroundAssetsDurationMs = roundMetric(durationMs, 2);
  }

  public buildSnapshot(initialCompiledShaderPrograms: number): BootstrapTelemetrySnapshot {
    const stageMap = new Map<number, BootstrapStageSummary>();
    for (const task of this.tasks) {
      let group = stageMap.get(task.stageIndex);
      if (!group) {
        group = {
          stageIndex: task.stageIndex,
          stageTitle: task.stageTitle,
          totalDurationMs: 0,
          taskCount: 0,
          tasks: [],
        };
        stageMap.set(task.stageIndex, group);
      }
      group.tasks.push(task);
      group.taskCount++;
      group.totalDurationMs = roundMetric(group.totalDurationMs + task.durationMs, 2);
    }

    const stages = Array.from(stageMap.values()).sort((a, b) => a.stageIndex - b.stageIndex);
    return {
      totalDurationMs: this.totalDurationMs,
      totalSteps: this.totalSteps,
      backgroundAssetsDurationMs: this.backgroundAssetsDurationMs,
      initialCompiledShaderPrograms,
      stages,
    };
  }
}

export class ScenarioAutorunController {
  public readonly runtime: ScenarioRuntimePort;
  public readonly bootstrapObserver: ScenarioBootstrapTelemetryObserver;
  public readonly driver: VirtualClockFastForwardDriver;
  private readonly initialShaderPrograms: number;

  constructor(runtime: ScenarioRuntimePort, bootstrapObserver: ScenarioBootstrapTelemetryObserver) {
    this.runtime = runtime;
    this.bootstrapObserver = bootstrapObserver;
    this.driver = new VirtualClockFastForwardDriver(runtime);
    this.initialShaderPrograms = this.driver.getCompiledShaderProgramCount();
  }

  public setFastForwardSpeed(speedPreset: '1x' | '10x' | '20x' | '50x'): void {
    if (typeof window !== 'undefined') {
      (window as unknown as { __rcScenarioSpeed?: string }).__rcScenarioSpeed = speedPreset;
    }
  }

  public captureVehicleRigProbe(carIndex = 0): VehicleRigGeometryProbeSnapshot | null {
    return captureVehicleRigGeometryProbe(this.runtime?.arena, carIndex);
  }

  public runGoldenDiffAudit(
    probes: readonly VehicleRigGeometryProbeSnapshot[] = []
  ): GoldenBaselineDiffSummary {
    return buildGoldenBaselineDiffSummary(this.runtime?.arena, probes);
  }

  public listScenarioIds(): string[] {
    return resolveRequestedScenarios('all').map((s) => s.id);
  }

  public async runScenarioById(
    scenarioId: string,
    options?: ScenarioDriverRunOptions
  ): Promise<BaselineSuiteTelemetryReport> {
    return this.runBaselineSuite(scenarioId, options);
  }

  public async runSelfTest(
    options: ScenarioDriverRunOptions = { speed: '20x', includeGoldenDiff: true }
  ): Promise<BaselineSuiteTelemetryReport> {
    return this.runBaselineSuite('all', options);
  }

  public async runBaselineSuite(
    queryValue = 'all',
    options?: ScenarioDriverRunOptions
  ): Promise<BaselineSuiteTelemetryReport> {
    const scripts = resolveRequestedScenarios(queryValue);
    const scenarioReports: ScenarioRunReport[] = [];
    const collectedProbes: VehicleRigGeometryProbeSnapshot[] = [];

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      console.info(
        `[ScenarioBaseline] Starting scenario (${i + 1}/${scripts.length}): ${script.id} (${script.totalTicks} ticks, speed=${options?.speed ?? '20x'})...`
      );
      const report = await this.driver.runScenario(script, options);
      scenarioReports.push(report);
      for (const p of report.vehicleRigProbes) {
        if (!collectedProbes.some((existing) => existing.visualId === p.visualId)) {
          collectedProbes.push(p);
        }
      }
      console.info(
        `[ScenarioBaseline] Completed ${script.id}: passed=${report.passed}, wall=${report.wallClockDurationMs}ms, rate=${report.effectiveTickRateHz}Hz (${report.speedupFactorVsRealtime}x realtime), errors=${report.runtimeErrors.totalErrorCount}`
      );
    }

    const glSummary = this.driver.getWebGlContextAttributesSummary();
    const overallPassed = scenarioReports.every((r) => r.passed);
    const includeDiff = options?.includeGoldenDiff !== false;
    const goldenBaselineDiff = includeDiff
      ? buildGoldenBaselineDiffSummary(this.runtime?.arena, collectedProbes)
      : null;

    const suiteReport: BaselineSuiteTelemetryReport = {
      schemaVersion: '1.1.0',
      generatedAtIso: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless',
      webglRenderer: glSummary.renderer,
      webglVendor: glSummary.vendor,
      configuredSpeedPreset:
        scenarioReports[0]?.configuredSpeedPreset || String(options?.speed ?? '20x'),
      bootstrap: this.bootstrapObserver.buildSnapshot(this.initialShaderPrograms),
      scenarios: scenarioReports,
      goldenBaselineDiff,
      overallPassed,
    };

    if (typeof window !== 'undefined') {
      window.__rcScenarioReport = suiteReport;
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.rcScenarioStatus = overallPassed ? 'passed' : 'failed';
    }
    console.info(`[ScenarioBaselineReport:JSON] ${JSON.stringify(suiteReport)}`);
    if (typeof fetch === 'function') {
      try {
        await fetch('/__rc_scenario_report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(suiteReport),
        });
      } catch {
        // Ignore when running without CLI report receiver middleware
      }
    }
    return suiteReport;
  }
}

export function attachScenarioAutorunController(
  runtime: ScenarioRuntimePort,
  bootstrapObserver: ScenarioBootstrapTelemetryObserver,
  backgroundAssetsPromise: Promise<unknown>
): ScenarioAutorunController {
  const controller = new ScenarioAutorunController(runtime, bootstrapObserver);
  if (typeof window !== 'undefined') {
    window.__rcScenarioDriver = controller;
  }

  const { scenarioQuery, runOptions } = parseAutorunUrlQueryConfig();
  if (scenarioQuery) {
    const bgStart = performance.now();
    void backgroundAssetsPromise
      .then(() => {
        bootstrapObserver.setBackgroundAssetsDurationMs(performance.now() - bgStart);
      })
      .catch(() => {
        bootstrapObserver.setBackgroundAssetsDurationMs(performance.now() - bgStart);
      })
      .then(() => controller.runBaselineSuite(scenarioQuery, runOptions))
      .catch(async (err) => {
        const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
        if (typeof window !== 'undefined') {
          window.__rcScenarioError = msg;
        }
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.dataset.rcScenarioStatus = 'error';
        }
        console.error('[ScenarioBaseline] Fatal error in autorun suite:', err);
        if (typeof fetch === 'function') {
          try {
            await fetch('/__rc_scenario_report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fatalError: msg }),
            });
          } catch {
            // Ignore
          }
        }
      });
  }

  return controller;
}
