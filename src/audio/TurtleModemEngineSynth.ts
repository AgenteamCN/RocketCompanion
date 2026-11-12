import {
  getEngineAudioTuningConfig,
  registerEngineAudioRuntimeActions,
  publishEngineAudioTelemetry,
  type EngineAudioPackId,
  type EngineDriveDirection,
} from '../ui-core/config/engineAudioConfig.ts';
import { getAudioSettings } from '../ui-core/config/audioConfig.ts';
import {
  TurtleModemGranularVoiceGraph,
  type EngineSynthLodMode,
  type GranularSliceChannel,
} from './TurtleModemGranularVoiceGraph.ts';
import {
  applySmoothedAudioParamValue,
  clampSmoothingDtSec,
  resetAudioParamValueImmediate,
} from './audioParamSmoothingPipeline.ts';
import {
  applyManualBenchPatch,
  buildEngineSynthTelemetryPayload,
  computeEngineSynthMasterGain,
  createInitialManualBenchState,
  getResolvedEngineAudioPackAssets,
  loadEngineAudioPackAssets,
  playEngineSynthOneShotBuffer,
  stepEngineSynthDrivetrain,
  stepRemoteHibernateTimer,
  type EngineSynthDrivetrainSnapshot,
  type EngineSynthTelemetryInput,
  type LoadedEngineAudioPackAssets,
} from './turtleModemSynthAcousticPipeline.ts';
import {
  evaluateBackfirePopTrigger,
  evaluateEntitySpawnSfxTrigger,
} from './engineSynthOneShotTriggers.ts';
import type { WasmCarAcousticCue } from './wasmCarCueReader.ts';

export type { EngineSynthLodMode, GranularSliceChannel, EngineSynthTelemetryInput };

const OUTPUT_GAIN_DEADBAND = 1e-4;
const OUTPUT_GAIN_SMOOTHING_TAU_SEC = 0.025;

export class TurtleModemEngineSynth {
  ctx: AudioContext;
  destination: AudioNode;
  outputNode: GainNode;
  lowpassNode: BiquadFilterNode;
  voiceGraph: TurtleModemGranularVoiceGraph;
  drivetrain: EngineSynthDrivetrainSnapshot;
  isPrimaryListener: boolean;
  active = false;
  alive = true;
  audible = true;
  dormant = false;
  distanceUU = 0;
  engineVolume = 0.8;
  packId: EngineAudioPackId = 'turtle_modem';
  assets: LoadedEngineAudioPackAssets | null = null;
  loadingPromise: Promise<void> | null = null;
  smoothedOutputGain = 0;
  lastOutputGain = -1;
  private _inactiveSinceSec = -1;
  private _prevSpeedUU = 0;
  lastPopIndex = -1;
  lastBackfireTimeSec = -10;
  backfireCount = 0;
  entitySpawnCount = 0;
  lastEntitySpawnTimeSec = -10;
  manualBench = createInitialManualBenchState();
  lastUpdatePerfMs = 0;
  telemetryPublishCounter = 0;

  constructor(
    ctx: AudioContext,
    destination?: AudioNode,
    options?: { isPrimaryListener?: boolean }
  ) {
    this.ctx = ctx;
    this.destination = destination || ctx.destination;
    const isPrimary = options?.isPrimaryListener ?? true;
    this.isPrimaryListener = isPrimary;
    const cfg = getEngineAudioTuningConfig();
    this.packId = cfg.activePackId || 'turtle_modem';
    this.drivetrain = {
      currentRPM: cfg.idleRPM,
      targetRPM: cfg.idleRPM,
      currentGear: 1,
      isNeutral: true,
      isOnGround: true,
      driveDirection: 'stopped',
      smoothThrottle: 0,
      smoothForwardAccelUU: 0,
      airborneThrottleQuotaSec: 1.35,
      isShiftLocked: false,
      isUnderStrain: false,
      isInOverdrive: false,
      isBoosting: false,
      wasAccelerating: false,
      revLimiterTimer: 0,
    };

    this.lowpassNode = ctx.createBiquadFilter();
    this.lowpassNode.type = 'lowpass';
    this.lowpassNode.frequency.value = 18000;
    this.lowpassNode.Q.value = 0.707;
    this.outputNode = ctx.createGain();
    this.outputNode.gain.value = 0;
    this.lowpassNode.connect(this.outputNode);
    this.outputNode.connect(this.destination);
    this.voiceGraph = new TurtleModemGranularVoiceGraph(
      ctx,
      this.lowpassNode,
      isPrimary ? 'primary-full' : 'remote-lod'
    );

    if (isPrimary) {
      registerEngineAudioRuntimeActions({
        triggerBackfireTest: () => this.triggerBackfire(true),
        triggerEntitySpawnTest: () => this.playEntitySpawnSfx(true),
        triggerZeroSpeedReset: () => this.resetToZeroSpeedState(),
        setManualBenchState: (p) => applyManualBenchPatch(this.manualBench, p),
      });
    }
    this._ensurePackLoaded(this.packId);
  }

  get currentRPM(): number {
    return this.drivetrain.currentRPM;
  }
  get currentGear(): number {
    return this.drivetrain.currentGear;
  }
  get isNeutral(): boolean {
    return this.drivetrain.isNeutral;
  }
  get driveDirection(): EngineDriveDirection {
    return this.drivetrain.driveDirection;
  }

  private _shouldPlayNow(): boolean {
    return (
      this.active &&
      this.alive &&
      !this.dormant &&
      (this.audible || (this.isPrimaryListener && this.manualBench.active)) &&
      this.engineVolume > 1e-4
    );
  }

  private _ensurePackLoaded(packId: EngineAudioPackId): void {
    const resolved = getResolvedEngineAudioPackAssets(packId);
    if (resolved) {
      this.assets = resolved;
      if ((this.isPrimaryListener || this._shouldPlayNow()) && !this.voiceGraph.graphBuilt)
        this.voiceGraph.build(resolved);
      return;
    }
    if (this.loadingPromise) return;
    this.loadingPromise = loadEngineAudioPackAssets(this.ctx, packId)
      .then((loaded) => {
        this.assets = loaded;
        this.loadingPromise = null;
        if ((this.isPrimaryListener || this._shouldPlayNow()) && !this.voiceGraph.graphBuilt)
          this.voiceGraph.build(loaded);
      })
      .catch(() => {
        this.loadingPromise = null;
      });
  }

  start(): void {
    if (this.active) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.active = true;
    this.lastUpdatePerfMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._ensurePackLoaded(this.packId);
  }

  resetToZeroSpeedState(): void {
    const idle = getEngineAudioTuningConfig().idleRPM;
    Object.assign(this.drivetrain, {
      currentRPM: idle,
      targetRPM: idle,
      currentGear: 1,
      isNeutral: true,
      driveDirection: 'stopped',
      smoothThrottle: 0,
      isUnderStrain: false,
      isInOverdrive: false,
    });
    this.manualBench.speedUU = 0;
  }

  triggerBackfire(forceAudition = false): void {
    const cfg = getEngineAudioTuningConfig();
    const now = this.ctx.currentTime;
    const d = evaluateBackfirePopTrigger(
      this.assets,
      cfg,
      now,
      this.lastBackfireTimeSec,
      this.lastPopIndex,
      this.engineVolume,
      forceAudition,
      this.active && this.alive && this.audible && !this.dormant
    );
    if (!d) return;
    this.lastBackfireTimeSec = now;
    this.lastPopIndex = d.nextPopIndex;
    this.backfireCount += 1;
    playEngineSynthOneShotBuffer(this.ctx, this.destination, d.buffer, d.gain, d.playbackRate);
  }

  playEntitySpawnSfx(forceAudition = false): void {
    const cfg = getEngineAudioTuningConfig();
    this._ensurePackLoaded(this.packId);
    const now = this.ctx.currentTime;
    const d = evaluateEntitySpawnSfxTrigger(
      this.assets,
      cfg,
      now,
      this.lastEntitySpawnTimeSec,
      this.engineVolume,
      forceAudition,
      this.audible && !this.dormant
    );
    if (!d) return;
    this.lastEntitySpawnTimeSec = now;
    this.entitySpawnCount += 1;
    playEngineSynthOneShotBuffer(this.ctx, this.destination, d.buffer, d.gain, 1.0);
    if (this.isPrimaryListener) {
      publishEngineAudioTelemetry({ entitySpawnCount: this.entitySpawnCount });
    }
  }

  update(
    speedOrTelemetry: number | EngineSynthTelemetryInput = 0,
    legacyIsAccelerating = false
  ): void {
    if (!this.active) this.start();
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(
      0.001,
      Math.min(0.1, this.lastUpdatePerfMs > 0 ? (nowPerf - this.lastUpdatePerfMs) / 1000 : 1 / 60)
    );
    this.lastUpdatePerfMs = nowPerf;
    const cfg = getEngineAudioTuningConfig();
    if (cfg.activePackId && cfg.activePackId !== this.packId) {
      this.packId = cfg.activePackId;
      this.voiceGraph.teardown();
      this._ensurePackLoaded(this.packId);
    }
    const desiredLod: EngineSynthLodMode = this.isPrimaryListener ? 'primary-full' : 'remote-lod';
    if (this.voiceGraph.lodMode !== desiredLod) this.voiceGraph.setLodMode(desiredLod, this.assets);

    const t: EngineSynthTelemetryInput =
      typeof speedOrTelemetry === 'number'
        ? { speedUU: speedOrTelemetry, throttleInput: legacyIsAccelerating ? 1 : 0 }
        : speedOrTelemetry;
    if (t.alive !== undefined) this.alive = t.alive;
    if (t.audible !== undefined) this.audible = t.audible;
    if (t.dormant !== undefined) this.dormant = t.dormant;
    if (t.distanceUU !== undefined) this.distanceUU = t.distanceUU;

    const { rawSpeedUU, shouldTriggerBackfire } = stepEngineSynthDrivetrain(
      this.drivetrain,
      this.manualBench,
      this.isPrimaryListener,
      cfg,
      t,
      dt,
      this._prevSpeedUU
    );
    this._prevSpeedUU = rawSpeedUU;
    if (shouldTriggerBackfire && !this.dormant) this.triggerBackfire(false);
    this._updateAudioGraph(cfg, rawSpeedUU, dt);
  }

  /**
   * Drives the voice graph from a Rust `CarAcousticLoopPod`. Rust owns the powertrain and
   * granular decisions, so no local drivetrain stepping happens on this path.
   */
  updateFromWasmCue(cue: WasmCarAcousticCue, speedUU = 0): void {
    if (!this.active) this.start();
    if (!this.voiceGraph.graphBuilt) {
      if (this.assets) this.voiceGraph.build(this.assets);
      if (!this.voiceGraph.graphBuilt) return;
    }
    const now = this.ctx.currentTime;
    const gain = Number.isFinite(cue.engineGain) ? Math.max(0, cue.engineGain) : 0;
    this.outputNode.gain.setTargetAtTime(gain, now, OUTPUT_GAIN_SMOOTHING_TAU_SEC);
    this.smoothedOutputGain = gain;
    this.lastOutputGain = gain;
    const lowerSliceIndex = (cue.packedFlags >>> 16) & 0xff;
    const upperSliceIndex = (cue.packedFlags >>> 24) & 0xff;
    this.voiceGraph.applyPod({
      enginePitch: cue.enginePitch,
      filterCutoffHz: cue.filterCutoffHz,
      idleGain: cue.idleGain,
      lowerSliceIndex,
      upperSliceIndex,
      lowerSliceGain: cue.lowerSliceGain,
      upperSliceGain: cue.upperSliceGain,
      lowerSliceRate: cue.lowerSliceRate,
      upperSliceRate: cue.upperSliceRate,
    });
    this.drivetrain.currentRPM = cue.engineRpm;
    this.drivetrain.targetRPM = cue.engineRpm;
    this.drivetrain.currentGear = (cue.packedFlags >>> 8) & 0xff;
    this.drivetrain.isUnderStrain = (cue.packedFlags & (1 << 3)) !== 0;
    this.drivetrain.isInOverdrive = (cue.packedFlags & (1 << 4)) !== 0;
    this.drivetrain.smoothThrottle = cue.engineLoad;
    this.drivetrain.isBoosting = cue.boostGain > 0;
    if (!this.isPrimaryListener) return;
    this.telemetryPublishCounter = (this.telemetryPublishCounter + 1) % 3;
    if (this.telemetryPublishCounter !== 0) return;
    const slices = this.assets?.slices;
    publishEngineAudioTelemetry(
      buildEngineSynthTelemetryPayload({
        packId: this.packId,
        voiceGraph: this.voiceGraph,
        assets: this.assets,
        drivetrain: this.drivetrain,
        graphResult: {
          lowerSliceIndex,
          upperSliceIndex,
          lowerSliceFreqHz: slices?.[lowerSliceIndex]?.meta.freq ?? 0,
          upperSliceFreqHz: slices?.[upperSliceIndex]?.meta.freq ?? 0,
          activeEqCompensationDb: 0,
          effectiveIdleGain: cue.idleGain,
          filterCutoffHz: cue.filterCutoffHz,
        },
        rawSpeedUU: speedUU,
        lastPopIndex: this.lastPopIndex,
        backfireCount: this.backfireCount,
        entitySpawnCount: this.entitySpawnCount,
      })
    );
  }

  private _updateAudioGraph(
    cfg: ReturnType<typeof getEngineAudioTuningConfig>,
    rawSpeedUU: number,
    dtSec: number
  ): void {
    const now = this.ctx.currentTime;
    const resolvedDt = clampSmoothingDtSec(dtSec);
    const dtModel = this.drivetrain;
    const shouldPlay = this._shouldPlayNow();
    const targetMasterGain = computeEngineSynthMasterGain(
      shouldPlay,
      this.engineVolume,
      dtModel.isUnderStrain
    );
    const outGainStep = applySmoothedAudioParamValue(
      this.outputNode.gain,
      this.smoothedOutputGain,
      this.lastOutputGain,
      targetMasterGain,
      resolvedDt,
      OUTPUT_GAIN_SMOOTHING_TAU_SEC,
      OUTPUT_GAIN_DEADBAND
    );
    this.smoothedOutputGain = outGainStep.smoothed;
    this.lastOutputGain = outGainStep.written;

    const hib = stepRemoteHibernateTimer(
      shouldPlay,
      this.isPrimaryListener,
      this.dormant,
      now,
      this._inactiveSinceSec,
      this.voiceGraph.graphBuilt
    );
    this._inactiveSinceSec = hib.nextInactiveSinceSec;
    if (hib.shouldTeardown) this.voiceGraph.teardown();
    if (!shouldPlay && !this.isPrimaryListener) return;

    if (!this.voiceGraph.graphBuilt || !this.voiceGraph.sliceChannels.length) {
      if (this.assets && shouldPlay) this.voiceGraph.build(this.assets);
      if (!this.voiceGraph.graphBuilt) return;
    }
    const graphResult = this.voiceGraph.update({
      cfg,
      now,
      dtSec: resolvedDt,
      tau: Math.max(0.003, cfg.gainSmoothingTimeMs / 1000),
      currentRPM: dtModel.currentRPM,
      smoothThrottle: dtModel.smoothThrottle,
      isUnderStrain: dtModel.isUnderStrain,
      isStationaryNeutral:
        dtModel.isOnGround &&
        dtModel.driveDirection === 'stopped' &&
        dtModel.smoothThrottle < 0.01 &&
        dtModel.currentRPM <= cfg.idleRPM + 15,
    });
    if (!graphResult || !this.isPrimaryListener) return;

    this.telemetryPublishCounter = (this.telemetryPublishCounter + 1) % 3;
    if (this.telemetryPublishCounter === 0) {
      publishEngineAudioTelemetry(
        buildEngineSynthTelemetryPayload({
          packId: this.packId,
          voiceGraph: this.voiceGraph,
          assets: this.assets,
          drivetrain: dtModel,
          graphResult,
          rawSpeedUU,
          lastPopIndex: this.lastPopIndex,
          backfireCount: this.backfireCount,
          entitySpawnCount: this.entitySpawnCount,
        })
      );
    }
  }

  private _muteOutput(): void {
    resetAudioParamValueImmediate(this.outputNode?.gain, 0, this.ctx?.currentTime);
    this.smoothedOutputGain = 0;
    this.lastOutputGain = 0;
  }

  setDormant(dormant: boolean): void {
    const next = Boolean(dormant);
    if (this.dormant === next) return;
    this.dormant = next;
    if (this.dormant) {
      this._muteOutput();
      if (this._inactiveSinceSec < 0) this._inactiveSinceSec = this.ctx.currentTime;
    } else {
      this._inactiveSinceSec = -1;
    }
  }

  setVolume(vol: number): void {
    if (typeof vol === 'number' && Number.isFinite(vol)) {
      this.engineVolume = Math.max(0, Math.min(2.0, vol));
    }
  }

  silence(): void {
    if (this.ctx && this.outputNode) this._muteOutput();
  }

  reset(): void {
    this.resetToZeroSpeedState();
    this.silence();
  }

  dispose(): void {
    this.active = false;
    this.voiceGraph.teardown();
    this.voiceGraph.disposeEq();
    const now = this.ctx?.currentTime;
    resetAudioParamValueImmediate(this.lowpassNode?.frequency, 18000, now);
    resetAudioParamValueImmediate(this.outputNode?.gain, 0, now);
    this.smoothedOutputGain = 0;
    this.lastOutputGain = 0;
    try {
      this.lowpassNode.disconnect();
      this.outputNode.disconnect();
    } catch {
      /* ignore */
    }
  }
}
