import {
  getEngineAudioTuningConfig,
  registerEngineAudioRuntimeActions,
  publishEngineAudioTelemetry,
  type EngineAudioPackId,
  type EngineDriveDirection,
} from '../ui-core/config/engineAudioConfig.ts';
import {
  loadEngineAudioPackAssets,
  getResolvedEngineAudioPackAssets,
  type LoadedEngineAudioPackAssets,
} from './EngineAudioLoopConditioner.ts';
import { type EngineAudioEqualizer } from './EngineAudioEqualizer.ts';
import { type PowertrainTelemetryInput } from './EnginePhysicsKinematics.ts';
import { TurtleModemDrivetrainModel } from './TurtleModemDrivetrainModel.ts';
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
  createEngineSynthOutputNodes,
  createInitialManualBenchState,
  evaluateBackfirePopTrigger,
  evaluateEntitySpawnSfxTrigger,
  playEngineSynthOneShotBuffer,
  resolveEngineSynthKinematicsFrame,
  stepEngineSynthDrivetrain,
  stepEngineSynthVoiceGraph,
  stepRemoteHibernateTimer,
  type EngineSynthTelemetryInput,
} from './turtleModemSynthAcousticPipeline.ts';

export type {
  PowertrainTelemetryInput,
  EngineSynthLodMode,
  GranularSliceChannel,
  EngineSynthTelemetryInput,
};

const OUTPUT_GAIN_DEADBAND = 1e-4;
const OUTPUT_GAIN_SMOOTHING_TAU_SEC = 0.025;

export class TurtleModemEngineSynth {
  ctx: AudioContext;
  destination: AudioNode;
  outputNode: GainNode;
  lowpassNode: BiquadFilterNode;
  equalizer: EngineAudioEqualizer;
  voiceGraph: TurtleModemGranularVoiceGraph;
  drivetrain: TurtleModemDrivetrainModel;
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
    this.drivetrain = new TurtleModemDrivetrainModel(cfg.idleRPM);

    const nodes = createEngineSynthOutputNodes(ctx, this.destination, isPrimary);
    this.lowpassNode = nodes.lowpassNode;
    this.equalizer = nodes.equalizer;
    this.outputNode = nodes.outputNode;
    this.voiceGraph = nodes.voiceGraph;

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
      if ((this.isPrimaryListener || this._shouldPlayNow()) && !this.voiceGraph.graphBuilt) {
        this.voiceGraph.build(resolved);
      }
      return;
    }
    if (this.loadingPromise) return;
    this.loadingPromise = loadEngineAudioPackAssets(this.ctx, packId)
      .then((loaded) => {
        this.assets = loaded;
        this.loadingPromise = null;
        if ((this.isPrimaryListener || this._shouldPlayNow()) && !this.voiceGraph.graphBuilt) {
          this.voiceGraph.build(loaded);
        }
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
    this.drivetrain.resetToZeroSpeedState(getEngineAudioTuningConfig().idleRPM);
  }

  triggerBackfire(forceAudition = false): void {
    const cfg = getEngineAudioTuningConfig();
    const now = this.ctx.currentTime;
    const decision = evaluateBackfirePopTrigger(
      this.assets,
      cfg,
      now,
      this.lastBackfireTimeSec,
      this.lastPopIndex,
      this.engineVolume,
      forceAudition,
      this.active && this.alive && this.audible && !this.dormant
    );
    if (!decision) return;
    this.lastBackfireTimeSec = now;
    this.lastPopIndex = decision.nextPopIndex;
    this.backfireCount += 1;
    playEngineSynthOneShotBuffer(
      this.ctx,
      this.destination,
      decision.buffer,
      decision.gain,
      decision.playbackRate
    );
  }

  playEntitySpawnSfx(forceAudition = false): void {
    const cfg = getEngineAudioTuningConfig();
    this._ensurePackLoaded(this.packId);
    const now = this.ctx.currentTime;
    const decision = evaluateEntitySpawnSfxTrigger(
      this.assets,
      cfg,
      now,
      this.lastEntitySpawnTimeSec,
      this.engineVolume,
      forceAudition,
      this.audible && !this.dormant
    );
    if (!decision) return;
    this.lastEntitySpawnTimeSec = now;
    this.entitySpawnCount += 1;
    playEngineSynthOneShotBuffer(this.ctx, this.destination, decision.buffer, decision.gain, 1.0);
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
    const computedDt =
      this.lastUpdatePerfMs > 0 ? (nowPerf - this.lastUpdatePerfMs) / 1000 : 1 / 60;
    this.lastUpdatePerfMs = nowPerf;

    const cfg = getEngineAudioTuningConfig();
    if (cfg.activePackId && cfg.activePackId !== this.packId) {
      this.packId = cfg.activePackId;
      this.voiceGraph.teardown();
      this._ensurePackLoaded(this.packId);
    }

    const desiredLod: EngineSynthLodMode = this.isPrimaryListener ? 'primary-full' : 'remote-lod';
    if (this.voiceGraph.lodMode !== desiredLod) this.voiceGraph.setLodMode(desiredLod, this.assets);

    const frame = resolveEngineSynthKinematicsFrame(
      speedOrTelemetry,
      legacyIsAccelerating,
      computedDt,
      cfg,
      this.isPrimaryListener,
      this.manualBench,
      this.drivetrain.driveDirection
    );
    if (frame.alive !== undefined) this.alive = frame.alive;
    if (frame.audible !== undefined) this.audible = frame.audible;
    if (frame.dormant !== undefined) this.dormant = frame.dormant;
    if (frame.distanceUU !== undefined) this.distanceUU = frame.distanceUU;

    const res = stepEngineSynthDrivetrain(this.drivetrain, cfg, frame);
    if (res.shouldTriggerBackfire && !this.dormant) this.triggerBackfire(false);
    this._updateAudioGraph(cfg, frame.rawSpeedUU, frame.dt);
  }

  private _updateAudioGraph(
    cfg: ReturnType<typeof getEngineAudioTuningConfig>,
    rawSpeedUU: number,
    dtSec?: number
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

    const graphResult = stepEngineSynthVoiceGraph(
      this.voiceGraph,
      this.assets,
      dtModel,
      cfg,
      now,
      shouldPlay,
      resolvedDt
    );
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
    if (this.ctx && this.outputNode) {
      this._muteOutput();
    }
  }

  reset(): void {
    this.resetToZeroSpeedState();
    this.silence();
  }

  dispose(): void {
    this.active = false;
    this.voiceGraph.teardown();
    this.equalizer.dispose();
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
