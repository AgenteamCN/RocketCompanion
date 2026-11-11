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
    const idle = getEngineAudioTuningConfig().idleRPM;
    this.drivetrain.currentRPM = idle;
    this.drivetrain.targetRPM = idle;
    this.drivetrain.currentGear = 1;
    this.drivetrain.isNeutral = true;
    this.drivetrain.driveDirection = 'stopped';
    this.drivetrain.smoothThrottle = 0;
    this.drivetrain.isUnderStrain = false;
    this.drivetrain.isInOverdrive = false;
    this.manualBench.speedUU = 0;
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

    const isNum = typeof speedOrTelemetry === 'number';
    const t: EngineSynthTelemetryInput = isNum
      ? { speedUU: speedOrTelemetry, throttleInput: legacyIsAccelerating ? 1 : 0 }
      : speedOrTelemetry;
    if (t.alive !== undefined) this.alive = t.alive;
    if (t.audible !== undefined) this.audible = t.audible;
    if (t.dormant !== undefined) this.dormant = t.dormant;
    if (t.distanceUU !== undefined) this.distanceUU = t.distanceUU;

    let rawSpeedUU = Math.max(0, Number(t.speedUU) || 0);
    let throttleIn = Number(t.throttleInput) || 0;
    let isOnGround = t.isOnGround ?? true;
    let isBoosting = Boolean(t.isBoosting);
    if (this.isPrimaryListener && this.manualBench.active) {
      isOnGround = !this.manualBench.airborne;
      isBoosting = this.manualBench.boost;
      throttleIn = this.manualBench.boost || this.manualBench.throttle ? 1 : this.manualBench.reverse ? -1 : 0;
      const cap = isBoosting ? cfg.maxBoostSpeedUU : throttleIn < 0 ? cfg.maxReverseSpeedUU : cfg.maxThrottleSpeedUU;
      const accel = throttleIn !== 0 ? 1100 : -650;
      this.manualBench.speedUU = Math.max(0, Math.min(cap, this.manualBench.speedUU + accel * dt));
      rawSpeedUU = this.manualBench.speedUU;
    }

    const dtState = this.drivetrain;
    const wasBoosting = dtState.isBoosting;
    dtState.isOnGround = isOnGround;
    dtState.isBoosting = isBoosting;
    dtState.wasAccelerating = Math.abs(throttleIn) > 0.05 || isBoosting;
    dtState.driveDirection = rawSpeedUU < 22 ? 'stopped' : (t.forwardSpeedUU ?? rawSpeedUU) < -22 ? 'reverse' : 'forward';
    dtState.isNeutral = rawSpeedUU < 25 && !dtState.wasAccelerating;
    const targetThr = dtState.wasAccelerating ? 1.0 : 0.0;
    dtState.smoothThrottle += (targetThr - dtState.smoothThrottle) * Math.min(1, dt * 14);
    dtState.smoothForwardAccelUU = (rawSpeedUU - this._prevSpeedUU) / dt;
    this._prevSpeedUU = rawSpeedUU;

    if (t.wasmRpm !== undefined && !this.manualBench.active) {
      dtState.currentRPM = t.wasmRpm;
      dtState.targetRPM = t.wasmRpm;
      dtState.currentGear = t.wasmGear ?? dtState.currentGear;
      dtState.isUnderStrain = Boolean(t.wasmIsUnderStrain);
    } else {
      const speedNorm = Math.min(1, rawSpeedUU / Math.max(1, cfg.maxBoostSpeedUU));
      const numGears = Math.max(1, Math.min(6, cfg.numGears || 4));
      dtState.currentGear = dtState.isNeutral ? 1 : Math.min(numGears, 1 + Math.floor(speedNorm * numGears));
      dtState.isInOverdrive = rawSpeedUU > cfg.maxThrottleSpeedUU + 40;
      dtState.isUnderStrain = isOnGround && dtState.wasAccelerating && dtState.smoothForwardAccelUU < -220;
      const gearRatio = (rawSpeedUU / Math.max(1, cfg.maxThrottleSpeedUU)) * numGears - (dtState.currentGear - 1);
      const clampedGearProgress = Math.max(0, Math.min(1.15, gearRatio));
      dtState.targetRPM = dtState.isNeutral
        ? cfg.idleRPM
        : Math.max(
            cfg.idleRPM,
            Math.min(
              cfg.redlineRPM,
              cfg.idleRPM + clampedGearProgress * (cfg.upshiftRPM - cfg.idleRPM) + (isBoosting ? 420 : 0)
            )
          );
      dtState.currentRPM += (dtState.targetRPM - dtState.currentRPM) * Math.min(1, dt * 12);
    }

    const backfire =
      t.wasmBackfireTriggered ||
      (!dtState.wasAccelerating && wasBoosting && dtState.currentRPM > cfg.minBackfireRPM);
    if (backfire && !this.dormant) this.triggerBackfire(false);
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
  arenaCars:
    | ArrayLike<{ visible?: boolean; position?: SpatialVector3Like | null } | null | undefined>
    | null
    | undefined;
  playerControls:
    | { throttle?: number; steer?: number; boost?: boolean; handbrake?: boolean }
    | null
    | undefined;
  resolveCarView: (carIndex: number) => CarStateView | null;
}

export class RemoteEngineAudioLodController {
  public engineSynths: EngineSynthSlotEntry[] = [];
  private readonly _awakeRemoteIndices: Set<number> = new Set();

  public resetAll(activeCarIndex = 0): void {
    this._awakeRemoteIndices.clear();
    for (let i = 0; i < this.engineSynths.length; i++) {
      const eng = this.engineSynths[i];
      const isPrimary = i === activeCarIndex;
      eng.wasDemoed = false;
      eng.prevForwardSpeed = 0;
      eng.dormant = !isPrimary;
      eng.distanceUU = 0;
      eng.synth?.setDormant?.(!isPrimary);
      eng.synth?.reset?.();
      eng.synth?.silence?.();
      eng.spatialBus?.setEnabled?.(false);
      if (isPrimary) eng.synth?.playEntitySpawnSfx?.(false);
    }
  }

  public countActiveAwakeSynths(): number {
    let count = 0;
    for (let i = 0; i < this.engineSynths.length; i++) {
      const s = this.engineSynths[i]?.synth;
      if (s?.active && !s.dormant) count++;
    }
    return count;
  }

  public updateFrame(input: MultiCarEngineUpdateInput): void {
    const {
      activeCar,
      effectiveNumCars,
      isAudibleActive,
      curBoost,
      activeCarMesh,
      arenaCars,
      playerControls,
      resolveCarView,
    } = input;
    const audioCtx = getAudioContext();
    const masterInput = getMasterAudioInput();

    while (this.engineSynths.length < Math.max(2, effectiveNumCars)) {
      const carIndex = this.engineSynths.length;
      const isSpatial = carIndex !== activeCar;
      let spatialBus: SpatialAudioSource | null = null;
      let synth: TurtleModemEngineSynth | null = null;
      if (audioCtx && masterInput) {
        if (isSpatial) {
          spatialBus = new SpatialAudioSource(audioCtx, masterInput, 'engine_other');
          synth = new TurtleModemEngineSynth(audioCtx, spatialBus.input, {
            isPrimaryListener: false,
          });
          synth.setDormant(true);
        } else {
          synth = new TurtleModemEngineSynth(audioCtx, masterInput, { isPrimaryListener: true });
        }
      }
      this.engineSynths.push({
        synth,
        spatialBus,
        spatial: isSpatial,
        position: { x: 0, y: 0, z: 0 },
        wasDemoed: false,
        prevForwardSpeed: 0,
        dormant: isSpatial,
        distanceUU: 0,
      });
    }

    const engineProfile = getSpatialAttenuationProfile('engine_other');
    const maxDistUU = engineProfile.maxDistanceUU;
    const wakeCutoffUU = Math.max(engineProfile.minDistanceUU + 50, maxDistUU - 100);
    const hasListener = Boolean(listenerManager.hasListener);
    const lx = listenerManager.position.x;
    const ly = listenerManager.position.y;
    const lz = listenerManager.position.z;
    const candidates: Array<{ carIndex: number; distanceUU: number; wasAwake: boolean }> = [];

    for (let i = 0; i < this.engineSynths.length; i++) {
      const entry = this.engineSynths[i];
      const isThisActive = i === activeCar;
      const carView = i < effectiveNumCars ? resolveCarView(i) : null;
      if (!carView) {
        entry.distanceUU = Infinity;
        continue;
      }
      if (isThisActive && activeCarMesh?.position) {
        entry.position.x = activeCarMesh.position.x;
        entry.position.y = activeCarMesh.position.y;
        entry.position.z = activeCarMesh.position.z;
      } else if (arenaCars?.[i]?.visible && arenaCars?.[i]?.position) {
        const p = arenaCars[i]!.position!;
        entry.position.x = p.x;
        entry.position.y = p.y;
        entry.position.z = p.z;
      } else {
        entry.position.x = carView.posX;
        entry.position.y = carView.posZ;
        entry.position.z = carView.posY;
      }
      if (isThisActive) {
        entry.distanceUU = 0;
        continue;
      }
      const distUU = hasListener
        ? Math.hypot(entry.position.x - lx, entry.position.y - ly, entry.position.z - lz)
        : 0;
      entry.distanceUU = distUU;
      if (!isAudibleActive || carView.isDemoed) continue;
      const wasAwake = this._awakeRemoteIndices.has(i);
      if (distUU <= (wasAwake ? maxDistUU : wakeCutoffUU)) {
        candidates.push({ carIndex: i, distanceUU: distUU, wasAwake });
      }
    }

    candidates.sort(
      (a, b) => a.distanceUU - (a.wasAwake ? 60 : 0) - (b.distanceUU - (b.wasAwake ? 60 : 0))
    );
    this._awakeRemoteIndices.clear();
    for (let k = 0; k < Math.min(MAX_AUDIBLE_REMOTE_ENGINES, candidates.length); k++) {
      this._awakeRemoteIndices.add(candidates[k].carIndex);
    }

    const settings = getAudioSettings();
    const engineVol = (settings.engineVolume ?? 0.8) * (settings.masterVolume ?? 1.0);

    for (let i = 0; i < this.engineSynths.length; i++) {
      const entry = this.engineSynths[i];
      const isThisActive = i === activeCar;
      const carView = i < effectiveNumCars ? resolveCarView(i) : null;
      if (entry.synth) entry.synth.isPrimaryListener = isThisActive;
      if (!carView) {
        entry.dormant = !isThisActive;
        entry.synth?.setDormant?.(!isThisActive);
        entry.synth?.silence();
        entry.spatialBus?.setEnabled(false);
        continue;
      }
      const isDemoed = Boolean(carView.isDemoed);
      const isDormant = !isThisActive && (!isAudibleActive || isDemoed || !this._awakeRemoteIndices.has(i));
      entry.dormant = isDormant;
      entry.synth?.setDormant?.(isDormant);
      if (isDormant) {
        entry.wasDemoed = isDemoed;
        entry.prevForwardSpeed = carView.forwardSpeed;
        entry.spatialBus?.setEnabled(false);
        continue;
      }
      if (entry.wasDemoed && !isDemoed) {
        entry.synth?.resetToZeroSpeedState?.();
        entry.synth?.playEntitySpawnSfx?.(false);
      }
      entry.wasDemoed = isDemoed;
      const fwd = carView.forwardSpeed;
      const speedUU = Math.hypot(carView.velX, carView.velY, carView.velZ);
      const isBoostingNow = Boolean(
        (carView.isBoosting && !isDemoed) || (isThisActive && playerControls?.boost && curBoost > 0.001)
      );
      const throttleInput = isThisActive && playerControls
        ? isBoostingNow
          ? 1
          : Number(playerControls.throttle) || 0
        : isBoostingNow
          ? 1
          : Math.abs(fwd - entry.prevForwardSpeed) > 1.5
            ? fwd > entry.prevForwardSpeed
              ? 1
              : -1
            : 0;
      entry.prevForwardSpeed = fwd;
      if (entry.spatialBus) {
        entry.spatialBus.setPosition(entry.position);
        entry.spatialBus.setEnabled(!isDemoed && isAudibleActive);
      }
      if (entry.synth) {
        entry.synth.setVolume(engineVol);
        entry.synth.update({
          speedUU,
          forwardSpeedUU: fwd,
          throttleInput,
          isBoosting: isBoostingNow,
          isOnGround: Boolean(carView.isOnGround || carView.getWheelContact(0)),
          alive: !isDemoed,
          audible: isAudibleActive,
          dormant: false,
          distanceUU: entry.distanceUU ?? 0,
        });
      }
    }
  }

  public dispose(): void {
    this._awakeRemoteIndices.clear();
    for (const eng of this.engineSynths) {
      eng.synth?.dispose?.();
      eng.spatialBus?.dispose?.();
    }
    this.engineSynths.length = 0;
  }
}

