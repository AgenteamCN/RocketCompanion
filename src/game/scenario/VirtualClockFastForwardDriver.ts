/**
 * VirtualClockFastForwardDriver.ts
 * Stateful SubController driving GameRuntime's 7-stage FramePipeline using a
 * deterministic 120Hz monotonic virtual clock with configurable fast-forward speed
 * (1x/10x/20x/50x), zero-escape runtime error interception, and SceneGraph probes.
 */

import type { CarControlsInput } from '../../network/protocol/InputPacketCodec.ts';
import type { CameraPoseSample, RawTickTimingSample } from './scenarioMetricsPipeline.ts';
import {
  captureVehicleRigGeometryProbe,
  diffVehicleRigProbeAgainstGolden65f1538d,
} from './scenarioRigProbeAndGoldenDiffPipeline.ts';
import { attachRuntimeErrorInterceptors } from './scenarioRuntimeErrorInterceptor.ts';
import {
  buildKeyframeRenderSample,
  buildStepsByTickMap,
  extractCameraPoseSample,
  queryCompiledShaderProgramCount,
  queryWebGlContextAttributesSummary,
  resolveRuntimeCameraMode,
  resolveSpeedPacingConfig,
} from './scenarioWebGlAndPacingPipeline.ts';
import { MultiClientLoopbackSimulator } from './MultiClientLoopbackSimulator.ts';
import { SoakAudioAndHeapHooksController } from './soakAudioAndHeapHooks.ts';
import type {
  KeyframeRenderSample,
  ScenarioAssertionResult,
  ScenarioDriverRunOptions,
  ScenarioRunReport,
  ScenarioRuntimePort,
  ScenarioScript,
  VehicleRigGeometryProbeSnapshot,
  VehicleRigGoldenDiffReport,
} from './ScenarioTypes.ts';
import {
  assembleVirtualClockScenarioRunReport,
  createVirtualClockStepContext,
  executeForcedKeyframeGpuRenderPass,
  executeSingleVirtualPipelineTick,
  FIXED_TICK_DT_MS,
  type VirtualClockRuntimeTarget,
} from './virtualClockTickAndReportPipeline.ts';

export const NEUTRAL_CONTROLS: Readonly<CarControlsInput> = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export class VirtualClockFastForwardDriver {
  public readonly runtime: VirtualClockRuntimeTarget;
  public readonly loopbackSimulator: MultiClientLoopbackSimulator;
  private readonly realNow: () => number;
  private virtualNowMs = 1000;
  private overrideLocalControls: CarControlsInput | null = null;
  private pendingKeyframeReason: string | null = null;
  private isRunningScenario = false;
  private defaultOptions: ScenarioDriverRunOptions = {
    speed: '20x',
    failOnConsoleError: true,
    includeGoldenDiff: true,
  };

  constructor(runtime: ScenarioRuntimePort, defaultOptions?: ScenarioDriverRunOptions) {
    this.runtime = runtime as VirtualClockRuntimeTarget;
    this.loopbackSimulator = new MultiClientLoopbackSimulator(runtime);
    this.realNow = performance.now.bind(performance);
    if (defaultOptions) this.defaultOptions = { ...this.defaultOptions, ...defaultOptions };
  }

  public setDefaultOptions(opts: ScenarioDriverRunOptions): void {
    this.defaultOptions = { ...this.defaultOptions, ...opts };
  }
  public getCompiledShaderProgramCount(): number {
    return queryCompiledShaderProgramCount(this.runtime?.renderer);
  }
  public getWebGlContextAttributesSummary(): { renderer: string; vendor: string } {
    return queryWebGlContextAttributesSummary(this.runtime?.renderer);
  }
  public captureVehicleRigProbe(carIndex = 0): VehicleRigGeometryProbeSnapshot | null {
    return captureVehicleRigGeometryProbe(this.runtime?.arena, carIndex);
  }
  public diffVehicleRigAgainstGolden(
    carIndex = 0,
    toleranceUu?: number
  ): VehicleRigGoldenDiffReport | null {
    const probe = this.captureVehicleRigProbe(carIndex);
    return probe ? diffVehicleRigProbeAgainstGolden65f1538d(probe, toleranceUu) : null;
  }

  public async runScenario(
    script: ScenarioScript,
    runOptions?: ScenarioDriverRunOptions
  ): Promise<ScenarioRunReport> {
    if (this.isRunningScenario) {
      throw new Error('[VirtualClockFastForwardDriver] A scenario is already running.');
    }
    this.isRunningScenario = true;

    const pacing = resolveSpeedPacingConfig(script.renderStride, script.batchYieldTicks, {
      ...this.defaultOptions,
      ...runOptions,
    });

    const r = this.runtime;
    const wasRunning = Boolean(r?.running);
    if (wasRunning) r.stop();

    const origPerfNow = performance.now;
    const origKeyboardRead = r?.keyboard?.read ? r.keyboard.read.bind(r.keyboard) : null;

    const assertions: ScenarioAssertionResult[] = [];
    const tickSamples: RawTickTimingSample[] = [];
    const keyframeSamples: KeyframeRenderSample[] = [];
    const cameraPoses: CameraPoseSample[] = [];
    const capturedProbes: VehicleRigGeometryProbeSnapshot[] = [];
    const stepsByTick = buildStepsByTickMap(script.steps);

    let currentTick = 0;
    const baseVirtualMs = Math.max(1000, this.realNow());
    this.virtualNowMs = baseVirtualMs;
    this.overrideLocalControls = null;
    this.pendingKeyframeReason =
      script.forceRenderOnKeyframes !== false ? 'scenario_initial_frame' : null;

    const errorInterceptor = attachRuntimeErrorInterceptors(() => ({
      tick: currentTick,
      virtualOffsetMs: this.virtualNowMs - baseVirtualMs,
    }));

    const stepContext = createVirtualClockStepContext({
      r,
      loopbackSimulator: this.loopbackSimulator,
      baseVirtualMs,
      getCurrentTick: () => currentTick,
      getVirtualNowMs: () => this.virtualNowMs,
      setOverrideControls: (c) => {
        this.overrideLocalControls = c;
      },
      setPendingKeyframeReason: (reason) => {
        this.pendingKeyframeReason = reason;
      },
      capturedProbes,
      assertions,
    });

    const isSoakActive = Boolean(runOptions?.soakWatchdog || script.id === 'freeplay_chaos_soak');
    const soakHooks = isSoakActive
      ? new SoakAudioAndHeapHooksController(r, this.realNow, runOptions?.soakConfig)
      : null;

    try {
      if (r?.keyboard && origKeyboardRead) {
        r.keyboard.read = () => this.overrideLocalControls ?? origKeyboardRead();
      }

      soakHooks?.install();
      performance.now = () => this.virtualNowMs;
      if (script.setup) await script.setup(stepContext);

      const configuredTicks = runOptions?.totalTicksOverride ?? script.totalTicks;
      const totalTicks = Math.max(1, configuredTicks);
      const sampleStride = totalTicks > 10000 ? Math.max(1, Math.floor(totalTicks / 2400)) : 1;
      const forceKeyframes = script.forceRenderOnKeyframes !== false;
      let prevPhase = String(r?.match?.state?.phase || 'freeplay');
      let prevMode = String(r?.match?.state?.mode || 'freeplay');
      let prevCam = resolveRuntimeCameraMode(r);
      let renderedFramesCount = 0;
      let skippedRenderFramesCount = 0;
      let executedTicks = totalTicks;

      const scenarioWallStartMs = this.realNow();

      for (let tick = 0; tick < totalTicks; tick++) {
        currentTick = tick;
        this.virtualNowMs = baseVirtualMs + tick * FIXED_TICK_DT_MS;
        soakHooks?.onBeforeTick(tick);

        const scheduledSteps = stepsByTick.get(tick);
        if (scheduledSteps) {
          for (const st of scheduledSteps) {
            if (st.forceKeyframeRender) {
              this.pendingKeyframeReason = st.keyframeReason || st.description || `step_${tick}`;
            }
            if (st.action) await st.action(stepContext);
          }
        }

        if (script.perTick) script.perTick(stepContext);
        const ov = this.overrideLocalControls as CarControlsInput | null;
        if (
          ov?.jump &&
          (r?.match?.state?.phase === 'replay' || r?.networkReconciler?.replayPlaybackMode)
        ) {
          r._localSkipReplayReady = true;
          if (r.networkReconciler) r.networkReconciler.localSkipReplayReady = true;
        }
        if (this.loopbackSimulator.isActive()) {
          this.loopbackSimulator.stepVirtualPeers(tick, this.virtualNowMs);
        }

        const prePhase = String(r?.match?.state?.phase || 'freeplay');
        const preMode = String(r?.match?.state?.mode || 'freeplay');
        const preCam = resolveRuntimeCameraMode(r);
        if (forceKeyframes) {
          if (prePhase !== prevPhase)
            this.pendingKeyframeReason = `phase_${prevPhase}_to_${prePhase}`;
          else if (preMode !== prevMode)
            this.pendingKeyframeReason = `mode_${prevMode}_to_${preMode}`;
          else if (preCam !== prevCam)
            this.pendingKeyframeReason = `camera_${prevCam}_to_${preCam}`;
        }

        const isKeyframeTick = Boolean(this.pendingKeyframeReason);
        const shouldRenderGpu =
          (tick > 0 && tick % pacing.renderStride === 0) ||
          (forceKeyframes && (tick === 0 || tick === totalTicks - 1)) ||
          isKeyframeTick;
        const tr = executeSingleVirtualPipelineTick(
          r,
          this.virtualNowMs,
          shouldRenderGpu,
          isKeyframeTick,
          this.realNow
        );

        const postPhase = String(r?.match?.state?.phase || 'freeplay');
        const postMode = String(r?.match?.state?.mode || 'freeplay');
        const postCam = resolveRuntimeCameraMode(r);

        if (
          forceKeyframes &&
          !shouldRenderGpu &&
          (postPhase !== prePhase || postMode !== preMode || postCam !== preCam)
        ) {
          this.pendingKeyframeReason =
            postPhase !== prePhase
              ? `phase_${prePhase}_to_${postPhase}`
              : postMode !== preMode
                ? `mode_${preMode}_to_${postMode}`
                : `camera_${preCam}_to_${postCam}`;
          executeForcedKeyframeGpuRenderPass(r, tr, this.realNow);
        }

        if (tr.didGpuRender) renderedFramesCount++;
        else skippedRenderFramesCount++;

        if (this.pendingKeyframeReason && tr.didGpuRender) {
          keyframeSamples.push(
            buildKeyframeRenderSample(
              tick,
              this.virtualNowMs - baseVirtualMs,
              this.pendingKeyframeReason,
              postPhase,
              postMode,
              postCam,
              tr.stageDurationsMs.RenderStage,
              tr.totalFrameWallMs,
              tr.shaderProgramsBefore,
              tr.shaderProgramsAfter,
              tr.shaderProgramsDelta,
              tr.glError,
              r?.renderer?.info
            )
          );
          this.pendingKeyframeReason = null;
        }

        prevPhase = postPhase;
        prevMode = postMode;
        prevCam = postCam;

        if (tick % sampleStride === 0 || tr.didGpuRender) {
          tickSamples.push({
            tick,
            virtualTimeMs: this.virtualNowMs - baseVirtualMs,
            phase: postPhase,
            cameraMode: postCam,
            didGpuRender: tr.didGpuRender,
            shaderProgramsDelta: tr.shaderProgramsDelta,
            stageDurationsMs: tr.stageDurationsMs,
            totalFrameWallMs: tr.totalFrameWallMs,
          });
          const pose = extractCameraPoseSample(tick, postPhase, postCam, r?.camera?.camera);
          if (pose) cameraPoses.push(pose);
        }

        if (tick === 1 && capturedProbes.length === 0) {
          const initialProbe = captureVehicleRigGeometryProbe(r?.arena, 0);
          if (initialProbe) capturedProbes.push(initialProbe);
        }

        if (soakHooks?.recordTick(tick, tr.stageDurationsMs, tr.totalFrameWallMs)) {
          executedTicks = tick + 1;
          break;
        }

        if ((tick + 1) % pacing.batchYieldTicks === 0) {
          performance.now = origPerfNow;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          performance.now = () => this.virtualNowMs;
        }
      }

      const wallClockDurationMs = Math.max(0.001, this.realNow() - scenarioWallStartMs);
      const multiplayerLoopback = this.loopbackSimulator.isActive()
        ? this.loopbackSimulator.collectTelemetry()
        : null;
      if (script.teardown) await script.teardown(stepContext);

      const soakWatchdog = soakHooks ? soakHooks.finalizeReport() : null;
      if (soakWatchdog) {
        const a = soakWatchdog.autopsy;
        assertions.push({
          tick: executedTicks - 1,
          label: 'soak_circuit_breaker_not_tripped',
          passed: !a.circuitBreakerTripped,
          detail: `abortReason=${a.abortReason}, uncleanedAudioEvents=${a.finalUncleanedAudioEvents}, heap=${a.finalJsHeapMb}MB`,
        });
      }

      return assembleVirtualClockScenarioRunReport({
        script,
        pacing,
        totalTicks: executedTicks,
        wallClockDurationMs,
        renderedFramesCount,
        skippedRenderFramesCount,
        tickSamples,
        keyframeSamples,
        cameraPoses,
        capturedProbes,
        assertions,
        multiplayerLoopback,
        runtimeErrors: errorInterceptor.buildSummary(),
        arena: r?.arena,
        soakWatchdog,
      });
    } finally {
      soakHooks?.dispose();
      errorInterceptor.dispose();
      performance.now = origPerfNow;
      if (r?.keyboard && origKeyboardRead) r.keyboard.read = origKeyboardRead;
      this.overrideLocalControls = null;
      this.isRunningScenario = false;
      if (wasRunning && r) {
        r.lastTimestamp = performance.now();
        r.interpolator?.sync?.(r.lastTimestamp);
        r.start?.();
      }
    }
  }
}
