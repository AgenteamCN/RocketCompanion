import {
  getEngineAudioTuningConfig,
  registerEngineAudioRuntimeActions,
  publishEngineAudioTelemetry,
  type EngineAudioPackId,
  type EngineDriveDirection,
} from '../ui-core/config/engineAudioConfig.ts';
import { getAudioSettings } from '../ui-core/config/audioConfig.ts';
import { getSpatialAttenuationProfile } from '../ui-core/config/spatialAttenuationProfiles.ts';
import { getAudioContext, getMasterAudioInput } from './audioContext.ts';
import {
  SpatialAudioSource,
  listenerManager,
  type SpatialVector3Like,
} from './SpatialAudioSource.ts';
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
  evaluateBackfirePopTrigger,
  evaluateEntitySpawnSfxTrigger,
  getResolvedEngineAudioPackAssets,
  loadEngineAudioPackAssets,
  playEngineSynthOneShotBuffer,
  stepEngineSynthDrivetrain,
  stepRemoteHibernateTimer,
  type EngineSynthDrivetrainSnapshot,
  type EngineSynthTelemetryInput,
  type LoadedEngineAudioPackAssets,
} from './turtleModemSynthAcousticPipeline.ts';
import type { CarStateView } from '../physics/RocketSimStateViews.ts';

export type { EngineSynthLodMode, GranularSliceChannel, EngineSynthTelemetryInput };

const OUTPUT_GAIN_DEADBAND = 1e-4;
const OUTPUT_GAIN_SMOOTHING_TAU_SEC = 0.025;
export const MAX_AUDIBLE_REMOTE_ENGINES = 3;

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
      currentRPM: cfg.idleRPM, targetRPM: cfg.idleRPM, currentGear: 1,
      isNeutral: true, isOnGround: true, driveDirection: 'stopped',
      smoothThrottle: 0, smoothForwardAccelUU: 0, airborneThrottleQuotaSec: 1.35,
      isShiftLocked: false, isUnderStrain: false, isInOverdrive: false,
      isBoosting: false, wasAccelerating: false, revLimiterTimer: 0,
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
      ctx, this.lowpassNode, isPrimary ? 'primary-full' : 'remote-lod'
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

  get currentRPM(): number { return this.drivetrain.currentRPM; }
  get currentGear(): number { return this.drivetrain.currentGear; }
  get isNeutral(): boolean { return this.drivetrain.isNeutral; }
  get driveDirection(): EngineDriveDirection { return this.drivetrain.driveDirection; }

  private _shouldPlayNow(): boolean {
    return (
      this.active && this.alive && !this.dormant &&
      (this.audible || (this.isPrimaryListener && this.manualBench.active)) &&
      this.engineVolume > 1e-4
    );
  }

  private _ensurePackLoaded(packId: EngineAudioPackId): void {
    const resolved = getResolvedEngineAudioPackAssets(packId);
    if (resolved) {
      this.assets = resolved;
      if ((this.isPrimaryListener || this._shouldPlayNow()) && !this.voiceGraph.graphBuilt) this.voiceGraph.build(resolved);
      return;
    }
    if (this.loadingPromise) return;
    this.loadingPromise = loadEngineAudioPackAssets(this.ctx, packId)
      .then((loaded) => {
        this.assets = loaded;
        this.loadingPromise = null;
        if ((this.isPrimaryListener || this._shouldPlayNow()) && !this.voiceGraph.graphBuilt) this.voiceGraph.build(loaded);
      })
      .catch(() => { this.loadingPromise = null; });
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
      currentRPM: idle, targetRPM: idle, currentGear: 1, isNeutral: true,
      driveDirection: 'stopped', smoothThrottle: 0, isUnderStrain: false, isInOverdrive: false,
    });
    this.manualBench.speedUU = 0;
  }

  triggerBackfire(forceAudition = false): void {
    const cfg = getEngineAudioTuningConfig();
    const now = this.ctx.currentTime;
    const d = evaluateBackfirePopTrigger(
      this.assets, cfg, now, this.lastBackfireTimeSec, this.lastPopIndex,
      this.engineVolume, forceAudition, this.active && this.alive && this.audible && !this.dormant
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
      this.assets, cfg, now, this.lastEntitySpawnTimeSec,
      this.engineVolume, forceAudition, this.audible && !this.dormant
    );
    if (!d) return;
    this.lastEntitySpawnTimeSec = now;
    this.entitySpawnCount += 1;
    playEngineSynthOneShotBuffer(this.ctx, this.destination, d.buffer, d.gain, 1.0);
    if (this.isPrimaryListener) {
      publishEngineAudioTelemetry({ entitySpawnCount: this.entitySpawnCount });
    }
  }

  update(speedOrTelemetry: number | EngineSynthTelemetryInput = 0, legacyIsAccelerating = false): void {
    if (!this.active) this.start();
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = Math.max(0.001, Math.min(0.1, this.lastUpdatePerfMs > 0 ? (nowPerf - this.lastUpdatePerfMs) / 1000 : 1 / 60));
    this.lastUpdatePerfMs = nowPerf;
    const cfg = getEngineAudioTuningConfig();
    if (cfg.activePackId && cfg.activePackId !== this.packId) {
      this.packId = cfg.activePackId;
      this.voiceGraph.teardown();
      this._ensurePackLoaded(this.packId);
    }
    const desiredLod: EngineSynthLodMode = this.isPrimaryListener ? 'primary-full' : 'remote-lod';
    if (this.voiceGraph.lodMode !== desiredLod) this.voiceGraph.setLodMode(desiredLod, this.assets);

    const t: EngineSynthTelemetryInput = typeof speedOrTelemetry === 'number'
      ? { speedUU: speedOrTelemetry, throttleInput: legacyIsAccelerating ? 1 : 0 }
      : speedOrTelemetry;
    if (t.alive !== undefined) this.alive = t.alive;
    if (t.audible !== undefined) this.audible = t.audible;
    if (t.dormant !== undefined) this.dormant = t.dormant;
    if (t.distanceUU !== undefined) this.distanceUU = t.distanceUU;

    const { rawSpeedUU, shouldTriggerBackfire } = stepEngineSynthDrivetrain(
      this.drivetrain, this.manualBench, this.isPrimaryListener, cfg, t, dt, this._prevSpeedUU
    );
    this._prevSpeedUU = rawSpeedUU;
    if (shouldTriggerBackfire && !this.dormant) this.triggerBackfire(false);
    this._updateAudioGraph(cfg, rawSpeedUU, dt);
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
    const targetMasterGain = computeEngineSynthMasterGain(shouldPlay, this.engineVolume, dtModel.isUnderStrain);
    const outGainStep = applySmoothedAudioParamValue(
      this.outputNode.gain, this.smoothedOutputGain, this.lastOutputGain,
      targetMasterGain, resolvedDt, OUTPUT_GAIN_SMOOTHING_TAU_SEC, OUTPUT_GAIN_DEADBAND
    );
    this.smoothedOutputGain = outGainStep.smoothed;
    this.lastOutputGain = outGainStep.written;

    const hib = stepRemoteHibernateTimer(
      shouldPlay, this.isPrimaryListener, this.dormant, now, this._inactiveSinceSec, this.voiceGraph.graphBuilt
    );
    this._inactiveSinceSec = hib.nextInactiveSinceSec;
    if (hib.shouldTeardown) this.voiceGraph.teardown();
    if (!shouldPlay && !this.isPrimaryListener) return;

    if (!this.voiceGraph.graphBuilt || !this.voiceGraph.sliceChannels.length) {
      if (this.assets && shouldPlay) this.voiceGraph.build(this.assets);
      if (!this.voiceGraph.graphBuilt) return;
    }
    const graphResult = this.voiceGraph.update({
      cfg, now, dtSec: resolvedDt, tau: Math.max(0.003, cfg.gainSmoothingTimeMs / 1000),
      currentRPM: dtModel.currentRPM, smoothThrottle: dtModel.smoothThrottle, isUnderStrain: dtModel.isUnderStrain,
      isStationaryNeutral: dtModel.isOnGround && dtModel.driveDirection === 'stopped' && dtModel.smoothThrottle < 0.01 && dtModel.currentRPM <= cfg.idleRPM + 15,
    });
    if (!graphResult || !this.isPrimaryListener) return;

    this.telemetryPublishCounter = (this.telemetryPublishCounter + 1) % 3;
    if (this.telemetryPublishCounter === 0) {
      publishEngineAudioTelemetry(
        buildEngineSynthTelemetryPayload({
          packId: this.packId, voiceGraph: this.voiceGraph, assets: this.assets, drivetrain: dtModel,
          graphResult, rawSpeedUU, lastPopIndex: this.lastPopIndex, backfireCount: this.backfireCount, entitySpawnCount: this.entitySpawnCount,
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

export interface EngineSynthSlotEntry {
  synth: TurtleModemEngineSynth | null;
  spatialBus: SpatialAudioSource | null;
  spatial: boolean;
  position: { x: number; y: number; z: number };
  wasDemoed: boolean;
  prevForwardSpeed: number;
  dormant?: boolean;
  distanceUU?: number;
}

export interface MultiCarEngineUpdateInput {
  activeCar: number;
  effectiveNumCars: number;
  isAudibleActive: boolean;
  curBoost: number;
  activeCarMesh: { visible?: boolean; position?: SpatialVector3Like | null } | null | undefined;
  arenaCars: ArrayLike<{ visible?: boolean; position?: SpatialVector3Like | null } | null | undefined> | null | undefined;
  playerControls: { throttle?: number; steer?: number; boost?: boolean; handbrake?: boolean } | null | undefined;
  resolveCarView: (carIndex: number) => CarStateView | null;
}

export class RemoteEngineAudioLodController {
  engineSynths: EngineSynthSlotEntry[] = [];
  private _awake = new Set<number>();

  resetAll(activeCar = 0): void {
    this._awake.clear();
    for (let i = 0; i < this.engineSynths.length; i++) {
      const e = this.engineSynths[i];
      const prim = i === activeCar;
      e.wasDemoed = false;
      e.prevForwardSpeed = 0;
      e.dormant = !prim;
      e.distanceUU = 0;
      e.synth?.setDormant?.(!prim);
      e.synth?.reset?.();
      e.synth?.silence?.();
      e.spatialBus?.setEnabled?.(false);
      if (prim) e.synth?.playEntitySpawnSfx?.(false);
    }
  }

  countActiveAwakeSynths(): number {
    let c = 0;
    for (const e of this.engineSynths) if (e?.synth?.active && !e.synth.dormant) c++;
    return c;
  }

  updateFrame(inp: MultiCarEngineUpdateInput): void {
    const { activeCar, effectiveNumCars, isAudibleActive, curBoost, activeCarMesh, arenaCars, playerControls, resolveCarView } = inp;
    const ctx = getAudioContext();
    const master = getMasterAudioInput();
    while (this.engineSynths.length < Math.max(2, effectiveNumCars)) {
      const idx = this.engineSynths.length;
      const sp = idx !== activeCar;
      const bus = ctx && master && sp ? new SpatialAudioSource(ctx, master, 'engine_other') : null;
      const synth = ctx && master ? new TurtleModemEngineSynth(ctx, bus ? bus.input : master, { isPrimaryListener: !sp }) : null;
      if (synth && sp) synth.setDormant(true);
      this.engineSynths.push({ synth, spatialBus: bus, spatial: sp, position: { x: 0, y: 0, z: 0 }, wasDemoed: false, prevForwardSpeed: 0, dormant: sp, distanceUU: 0 });
    }

    const prof = getSpatialAttenuationProfile('engine_other');
    const maxD = prof.maxDistanceUU;
    const wakeD = Math.max(prof.minDistanceUU + 50, maxD - 100);
    const lp = listenerManager.position;
    const cands: Array<{ idx: number; dist: number; awake: boolean }> = [];

    for (let i = 0; i < this.engineSynths.length; i++) {
      const e = this.engineSynths[i];
      const cv = i < effectiveNumCars ? resolveCarView(i) : null;
      if (!cv) { e.distanceUU = Infinity; continue; }
      const mp = i === activeCar ? activeCarMesh?.position : arenaCars?.[i]?.visible ? arenaCars?.[i]?.position : null;
      e.position.x = mp ? mp.x : cv.posX;
      e.position.y = mp ? mp.y : cv.posZ;
      e.position.z = mp ? mp.z : cv.posY;
      if (i === activeCar) { e.distanceUU = 0; continue; }
      const dist = listenerManager.hasListener ? Math.hypot(e.position.x - lp.x, e.position.y - lp.y, e.position.z - lp.z) : 0;
      e.distanceUU = dist;
      if (!isAudibleActive || cv.isDemoed) continue;
      const awake = this._awake.has(i);
      if (dist <= (awake ? maxD : wakeD)) cands.push({ idx: i, dist, awake });
    }

    cands.sort((a, b) => a.dist - (a.awake ? 60 : 0) - (b.dist - (b.awake ? 60 : 0)));
    this._awake.clear();
    for (let k = 0; k < Math.min(MAX_AUDIBLE_REMOTE_ENGINES, cands.length); k++) this._awake.add(cands[k].idx);

    const s = getAudioSettings();
    const vol = (s.engineVolume ?? 0.8) * (s.masterVolume ?? 1.0);

    for (let i = 0; i < this.engineSynths.length; i++) {
      const e = this.engineSynths[i];
      const prim = i === activeCar;
      const cv = i < effectiveNumCars ? resolveCarView(i) : null;
      if (e.synth) e.synth.isPrimaryListener = prim;
      if (!cv) {
        e.dormant = !prim;
        e.synth?.setDormant?.(!prim);
        e.synth?.silence();
        e.spatialBus?.setEnabled(false);
        continue;
      }
      const demo = Boolean(cv.isDemoed);
      const dorm = !prim && (!isAudibleActive || demo || !this._awake.has(i));
      e.dormant = dorm;
      e.synth?.setDormant?.(dorm);
      if (dorm) {
        e.wasDemoed = demo;
        e.prevForwardSpeed = cv.forwardSpeed;
        e.spatialBus?.setEnabled(false);
        continue;
      }
      if (e.wasDemoed && !demo) {
        e.synth?.resetToZeroSpeedState?.();
        e.synth?.playEntitySpawnSfx?.(false);
      }
      e.wasDemoed = demo;
      const fwd = cv.forwardSpeed;
      const boost = Boolean((cv.isBoosting && !demo) || (prim && playerControls?.boost && curBoost > 0.001));
      const thr = prim && playerControls
        ? boost ? 1 : Number(playerControls.throttle) || 0
        : boost ? 1 : Math.abs(fwd - e.prevForwardSpeed) > 1.5 ? (fwd > e.prevForwardSpeed ? 1 : -1) : 0;
      e.prevForwardSpeed = fwd;
      e.spatialBus?.setPosition(e.position);
      e.spatialBus?.setEnabled(!demo && isAudibleActive);
      e.synth?.setVolume(vol);
      e.synth?.update({
        speedUU: Math.hypot(cv.velX, cv.velY, cv.velZ),
        forwardSpeedUU: fwd, throttleInput: thr, isBoosting: boost,
        isOnGround: Boolean(cv.isOnGround || cv.getWheelContact(0)),
        alive: !demo, audible: isAudibleActive, dormant: false, distanceUU: e.distanceUU ?? 0,
      });
    }
  }

  dispose(): void {
    this._awake.clear();
    for (const e of this.engineSynths) {
      e.synth?.dispose?.();
      e.spatialBus?.dispose?.();
    }
    this.engineSynths.length = 0;
  }
}

