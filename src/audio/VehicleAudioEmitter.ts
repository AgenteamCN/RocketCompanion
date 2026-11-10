import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getAudioContext, getMasterAudioInput } from './audioContext.ts';
import { listenerManager } from './SpatialAudioSource.ts';
import {
  toAudioCoordinates,
  getUuToMeters,
  calculateIncidentDistanceGain,
  type AudioAttenuationCategory,
  type SpatialVector3Like,
  type SpatialPositionInput,
} from './spatialAudioMath.ts';
import { isDistanceCulled } from './SpatialAttenuationEvaluator.ts';

export interface VehicleAudioLoopBuffers {
  boostLoop?: AudioBuffer | null;
  supersonicLoop?: AudioBuffer | null;
}

export interface VehicleAudioStateInput {
  isBoosting?: boolean;
  isSupersonic?: boolean;
  isAlive?: boolean;
  audible?: boolean;
}

export interface VehiclePlayActionOptions {
  volume?: number;
  playbackRate?: number;
  category?: AudioAttenuationCategory | string | null;
  distanceRadiusScale?: number;
}

const BOOST_LOOP_HIBERNATE_GRACE_SEC = 0.16;
const SUPERSONIC_LOOP_HIBERNATE_GRACE_SEC = 0.22;

export class VehicleAudioEmitter {
  _lastDist = 0;
  _lastLoopStepTime = 0;
  _lastPanX: number | undefined;
  _lastPanY: number | undefined;
  _lastPanZ: number | undefined;
  _lastSelfGain: number | undefined;
  _lastTargetBoostGain: number | undefined;
  _lastTargetSuperGain: number | undefined;
  _lastWrittenBoostGain: number | undefined;
  _lastWrittenSuperGain: number | undefined;
  _smoothedBoostGain = 0;
  _smoothedSuperGain = 0;
  _boostSilentSinceSec = -1;
  _superSilentSinceSec = -1;
  _scratchAudioPos: SpatialVector3Like = { x: 0, y: 0, z: 0 };
  activeSources: Set<AudioBufferSourceNode> = new Set();
  audible = true;
  boostLoopBuffer: AudioBuffer | null = null;
  boostLoopGain: GainNode | null = null;
  boostLoopSource: AudioBufferSourceNode | null = null;
  carIndex: number;
  context: AudioContext | null;
  destinationNode: AudioNode | null;
  distanceGain: GainNode | null = null;
  initialized = false;
  inputGain: GainNode | null = null;
  isAlive = true;
  isBoosting = false;
  isSelf = false;
  isSupersonic = false;
  panner3D: PannerNode | null = null;
  position: SpatialVector3Like = { x: 0, y: 0, z: 0 };
  selfGain: GainNode | null = null;
  supersonicLoopBuffer: AudioBuffer | null = null;
  supersonicLoopGain: GainNode | null = null;
  supersonicLoopSource: AudioBufferSourceNode | null = null;

  constructor(
    carIndex: number,
    context: AudioContext | null = null,
    destinationNode: AudioNode | null = null
  ) {
    this.carIndex = carIndex;
    this.context = context;
    this.destinationNode = destinationNode;
    this.init();
  }

  init() {
    if (this.initialized) return;
    const ctx = this.context || getAudioContext();
    if (!ctx) return;
    this.context = ctx;
    const dest = this.destinationNode || getMasterAudioInput();

    const p = ctx.createPanner();
    const panModel = audioConfig.get('spatialPanningModel') || 'equalpower';
    try {
      p.panningModel = panModel;
    } catch {
      p.panningModel = 'equalpower';
    }
    p.distanceModel = 'inverse';
    p.rolloffFactor = 0;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    p.channelCount = 1;
    p.channelCountMode = 'explicit';
    p.channelInterpretation = 'speakers';
    this.panner3D = p;

    const makeGain = (val: number, out?: AudioNode | null): GainNode => {
      const g = ctx.createGain();
      g.gain.value = val;
      if (out) g.connect(out);
      return g;
    };

    this.distanceGain = makeGain(1.0, dest);
    p.connect(this.distanceGain);
    this.selfGain = makeGain(1.0, dest);
    this.inputGain = makeGain(1.0, this.isSelf ? this.selfGain : p);
    this.boostLoopGain = makeGain(0, this.inputGain);
    this.supersonicLoopGain = makeGain(0, this.inputGain);

    this.initialized = true;
    this._startLoops();
  }

  setSelf(isSelf: boolean): void {
    const val = Boolean(isSelf);
    if (this.isSelf === val) return;
    this.isSelf = val;
    if (!this.inputGain) return;
    try {
      this.inputGain.disconnect();
      const target = this.isSelf ? this.selfGain : this.panner3D;
      if (target) this.inputGain.connect(target);
    } catch (e) {
      console.warn('[PositionalVehicleAudio] Error reconnecting spatial panner:', e);
    }
  }

  setBuffers({ boostLoop, supersonicLoop }: VehicleAudioLoopBuffers): void {
    if (boostLoop && this.boostLoopBuffer !== boostLoop) {
      this.boostLoopBuffer = boostLoop;
      this._stopBoostLoopSource();
    }
    if (supersonicLoop && this.supersonicLoopBuffer !== supersonicLoop) {
      this.supersonicLoopBuffer = supersonicLoop;
      this._stopSupersonicLoopSource();
    }
    this._startLoops();
  }

  private _spawnLoopSource(
    ctx: AudioContext,
    now: number,
    buffer: AudioBuffer | null,
    targetGain: GainNode | null,
    onEndedClear: (src: AudioBufferSourceNode) => void
  ): AudioBufferSourceNode | null {
    if (!buffer) return null;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      if (targetGain) src.connect(targetGain);
      src.start(now, buffer.duration > 0.1 ? Math.random() * (buffer.duration * 0.8) : 0);
      src.onended = () => onEndedClear(src);
      return src;
    } catch {
      return null;
    }
  }

  private _teardownLoopSource(src: AudioBufferSourceNode | null): void {
    if (!src) return;
    try {
      src.onended = null;
      src.stop();
      src.disconnect();
    } catch {
      /* ignore */
    }
  }

  private _ensureBoostLoopStarted(ctx: AudioContext, now: number): void {
    if (this.boostLoopBuffer && !this.boostLoopSource) {
      this.boostLoopSource = this._spawnLoopSource(
        ctx,
        now,
        this.boostLoopBuffer,
        this.boostLoopGain,
        (src) => {
          if (this.boostLoopSource === src) this.boostLoopSource = null;
        }
      );
    }
  }

  private _stopBoostLoopSource(): void {
    this._teardownLoopSource(this.boostLoopSource);
    this.boostLoopSource = null;
  }

  private _ensureSupersonicLoopStarted(ctx: AudioContext, now: number): void {
    if (this.supersonicLoopBuffer && !this.supersonicLoopSource) {
      this.supersonicLoopSource = this._spawnLoopSource(
        ctx,
        now,
        this.supersonicLoopBuffer,
        this.supersonicLoopGain,
        (src) => {
          if (this.supersonicLoopSource === src) this.supersonicLoopSource = null;
        }
      );
    }
  }

  private _stopSupersonicLoopSource(): void {
    this._teardownLoopSource(this.supersonicLoopSource);
    this.supersonicLoopSource = null;
  }

  _startLoops(): void {
    const ctx = this.context || getAudioContext();
    if (!this.initialized || !ctx || ctx.state === 'closed' || !this.isAlive || !this.audible)
      return;
    const now = ctx.currentTime;
    const dist = !this.isSelf && listenerManager.hasListener ? this._lastDist : 0;
    if (this.isBoosting && (this.isSelf || !isDistanceCulled(dist, 'boost_other'))) {
      this._ensureBoostLoopStarted(ctx, now);
    }
    if (this.isSupersonic && (this.isSelf || !isDistanceCulled(dist, 'supersonic_other'))) {
      this._ensureSupersonicLoopStarted(ctx, now);
    }
  }

  updatePosition(pos: SpatialPositionInput | null | undefined): void {
    if (!pos) return;
    const audioPos = toAudioCoordinates(this._scratchAudioPos, pos);
    if (!audioPos) return;
    this.position.x = audioPos.x;
    this.position.y = audioPos.y;
    this.position.z = audioPos.z;

    const ctx = this.context || getAudioContext();
    if (!ctx) return;

    if (!this.isSelf && this.panner3D) {
      try {
        const scale = getUuToMeters();
        const px = audioPos.x * scale,
          py = audioPos.y * scale,
          pz = audioPos.z * scale;
        if (
          this._lastPanX === undefined ||
          this._lastPanY === undefined ||
          this._lastPanZ === undefined ||
          Math.abs(px - this._lastPanX) > 1e-4 ||
          Math.abs(py - this._lastPanY) > 1e-4 ||
          Math.abs(pz - this._lastPanZ) > 1e-4
        ) {
          this._lastPanX = px;
          this._lastPanY = py;
          this._lastPanZ = pz;
          if (this.panner3D.positionX) {
            this.panner3D.positionX.value = px;
            this.panner3D.positionY.value = py;
            this.panner3D.positionZ.value = pz;
          } else if (typeof this.panner3D.setPosition === 'function') {
            this.panner3D.setPosition(px, py, pz);
          }
        }
        if (listenerManager.hasListener) {
          const lp = listenerManager.position;
          this._lastDist = Math.hypot(audioPos.x - lp.x, audioPos.y - lp.y, audioPos.z - lp.z);
        }
      } catch {
        /* ignore */
      }
    } else if (this.isSelf && this.selfGain) {
      this._lastDist = 0;
      const targetSelfGain = audioConfig.get('masterVolume') * audioConfig.get('vehicleSelfVolume');
      if (
        this._lastSelfGain === undefined ||
        Math.abs(targetSelfGain - this._lastSelfGain) > 1e-4
      ) {
        this._lastSelfGain = targetSelfGain;
        this.selfGain.gain.value = targetSelfGain;
      }
    }
  }

  private _stepLoopChannel(
    now: number,
    dt: number,
    dist: number,
    active: boolean,
    category: AudioAttenuationCategory,
    baseVol: number,
    gainNode: GainNode | null,
    hasSource: boolean,
    silentSinceSec: number,
    graceSec: number,
    smoothedGain: number,
    lastWrittenGain: number | undefined,
    tauSec: number,
    onStart: () => void,
    onStop: () => void
  ): [number, number, number | undefined, number] {
    if (!gainNode) return [silentSinceSec, smoothedGain, lastWrittenGain, 0];
    const culled = !this.isSelf && listenerManager.hasListener && isDistanceCulled(dist, category);
    const distAtten = this.isSelf
      ? 1.0
      : culled
        ? 0
        : calculateIncidentDistanceGain(dist, category);
    const targetGain = active && this.isAlive && this.audible && !culled ? baseVol * distAtten : 0;

    let nextSilent = silentSinceSec;
    if (targetGain > 1e-4) {
      nextSilent = -1;
      onStart();
    } else if (hasSource) {
      if (nextSilent < 0) nextSilent = now;
      else if (now - nextSilent >= graceSec) onStop();
    }

    const alpha = 1 - Math.exp(-dt / Math.max(0.005, tauSec));
    let nextSmoothed = smoothedGain + (targetGain - smoothedGain) * alpha;
    if (Math.abs(targetGain - nextSmoothed) <= 1e-4) {
      nextSmoothed = targetGain;
    }

    let nextWritten = lastWrittenGain;
    if (
      nextWritten === undefined ||
      Math.abs(nextSmoothed - nextWritten) > 1e-4 ||
      (targetGain === 0 && nextSmoothed === 0 && nextWritten !== 0)
    ) {
      nextWritten = nextSmoothed;
      try {
        gainNode.gain.value = nextSmoothed;
      } catch {
        /* ignore */
      }
    }
    return [nextSilent, nextSmoothed, nextWritten, targetGain];
  }

  updateState({ isBoosting, isSupersonic, isAlive, audible }: VehicleAudioStateInput = {}): void {
    if (isBoosting !== undefined) this.isBoosting = Boolean(isBoosting);
    if (isSupersonic !== undefined) this.isSupersonic = Boolean(isSupersonic);
    if (isAlive !== undefined) this.isAlive = Boolean(isAlive);
    if (audible !== undefined) this.audible = Boolean(audible);

    if (!this.initialized) return;
    const ctx = this.context || getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const rawDt = this._lastLoopStepTime > 0 ? now - this._lastLoopStepTime : 1 / 120;
    const dt = rawDt > 0.0005 && rawDt < 0.25 ? rawDt : 1 / 120;
    this._lastLoopStepTime = now;

    const baseMult =
      audioConfig.get('masterVolume') * (this.isSelf ? audioConfig.get('vehicleSelfVolume') : 1.0);
    const dist = !this.isSelf && listenerManager.hasListener ? this._lastDist : 0;

    [
      this._boostSilentSinceSec,
      this._smoothedBoostGain,
      this._lastWrittenBoostGain,
      this._lastTargetBoostGain,
    ] = this._stepLoopChannel(
      now,
      dt,
      dist,
      this.isBoosting,
      'boost_other',
      audioConfig.get('boostLoopVolume') * audioConfig.get('boostVolume') * baseMult,
      this.boostLoopGain,
      Boolean(this.boostLoopSource),
      this._boostSilentSinceSec,
      BOOST_LOOP_HIBERNATE_GRACE_SEC,
      this._smoothedBoostGain,
      this._lastWrittenBoostGain,
      0.035,
      () => this._ensureBoostLoopStarted(ctx, now),
      () => this._stopBoostLoopSource()
    );

    [
      this._superSilentSinceSec,
      this._smoothedSuperGain,
      this._lastWrittenSuperGain,
      this._lastTargetSuperGain,
    ] = this._stepLoopChannel(
      now,
      dt,
      dist,
      this.isSupersonic,
      'supersonic_other',
      (audioConfig.get('supersonicLoopVolume') ?? audioConfig.get('supersonicVolume') ?? 1.0) *
        baseMult,
      this.supersonicLoopGain,
      Boolean(this.supersonicLoopSource),
      this._superSilentSinceSec,
      SUPERSONIC_LOOP_HIBERNATE_GRACE_SEC,
      this._smoothedSuperGain,
      this._lastWrittenSuperGain,
      0.05,
      () => this._ensureSupersonicLoopStarted(ctx, now),
      () => this._stopSupersonicLoopSource()
    );
  }

  updateBoost(isBoosting: boolean, audible = true, isAlive = true): void {
    this.updateState({ isBoosting, audible, isAlive });
  }

  updateSupersonic(isSupersonic: boolean, audible = true, isAlive = true): void {
    this.updateState({ isSupersonic, audible, isAlive });
  }

  playAction(buffer: AudioBuffer | null, options: VehiclePlayActionOptions = {}): void {
    if (!buffer) return;
    const ctx = this.context || getAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const baseVolume = options.volume ?? 1.0;
    const playbackRate = options.playbackRate ?? 1.0;
    const category = options.category ?? 'jump_dodge_other';
    const distanceRadiusScale = options.distanceRadiusScale ?? 1.0;

    let effectiveVolume = baseVolume;
    if (!this.isSelf && listenerManager.hasListener) {
      const dist = Math.hypot(
        this.position.x - listenerManager.position.x,
        this.position.y - listenerManager.position.y,
        this.position.z - listenerManager.position.z
      );
      this._lastDist = dist;
      if (isDistanceCulled(dist, category, distanceRadiusScale)) return;
      effectiveVolume =
        baseVolume * calculateIncidentDistanceGain(dist, category, distanceRadiusScale);
    }
    if (effectiveVolume <= 1e-5 || !this.inputGain) return;

    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = playbackRate;

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = effectiveVolume;

      src.connect(voiceGain);
      voiceGain.connect(this.inputGain);

      src.start(now);
      this.activeSources.add(src);
      src.onended = () => {
        this.activeSources.delete(src);
        try {
          src.disconnect();
          voiceGain.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      console.warn('[PositionalVehicleAudio] Error starting playAction source:', e);
    }
  }

  silenceAll() {
    const ctx = this.context || getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this._lastTargetBoostGain = 0;
    this._lastTargetSuperGain = 0;
    this._smoothedBoostGain = 0;
    this._smoothedSuperGain = 0;
    this._lastWrittenBoostGain = 0;
    this._lastWrittenSuperGain = 0;
    this._boostSilentSinceSec = -1;
    this._superSilentSinceSec = -1;
    try {
      this._stopBoostLoopSource();
      this._stopSupersonicLoopSource();
      for (const g of [this.boostLoopGain, this.supersonicLoopGain]) {
        if (g) {
          g.gain.cancelScheduledValues(now);
          g.gain.value = 0;
        }
      }
      for (const src of this.activeSources) {
        try {
          src.stop(now);
          src.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.activeSources.clear();
    } catch (e) {
      console.warn('[PositionalVehicleAudio] Error in silenceAll:', e);
    }
  }

  dispose() {
    this.silenceAll();
    try {
      this.inputGain?.disconnect();
      this.panner3D?.disconnect();
      this.distanceGain?.disconnect();
      this.selfGain?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
