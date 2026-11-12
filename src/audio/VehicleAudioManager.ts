import { audioConfig } from '../ui-core/config/audioConfig.ts';
import {
  getAudioContext,
  getAudioSlotPool,
  getMasterAudioInput,
  subsystemState,
} from './audioContext.ts';
import { isBallFlipResetEvent } from '../physics/RocketSimConstants.ts';
import {
  listenerManager,
  toAudioCoordinates,
  getUuToMeters,
  calculateIncidentDistanceGain,
  isDistanceCulled,
  type AudioAttenuationCategory,
  type SpatialPositionInput,
  type SpatialVector3Like,
} from './SpatialAudioSource.ts';
import {
  INCIDENT_COOLDOWN_MS,
  calibrateWheelLandingModulation,
  stopSrc,
  type PhysicsImpactAudioEvent,
  type VehicleAudioBuffers,
  type VehicleAudioUpdateContext,
  type VehicleCarStateSnapshot,
  type VehicleLandingTrackingState,
} from './vehicleAudioContracts.ts';

export class VehicleAudioEmitter {
  activeSources = new Set<AudioBufferSourceNode>();
  audible = true;
  boostLoopBuffer: AudioBuffer | null = null;
  boostLoopGain: GainNode | null = null;
  boostLoopSource: AudioBufferSourceNode | null = null;
  carIndex: number;
  initialized = false;
  inputGain: GainNode | null = null;
  isAlive = true;
  isBoosting = false;
  isSelf = false;
  isSupersonic = false;
  panner3D: PannerNode | null = null;
  position: SpatialVector3Like = { x: 0, y: 0, z: 0 };
  supersonicLoopBuffer: AudioBuffer | null = null;
  supersonicLoopGain: GainNode | null = null;
  supersonicLoopSource: AudioBufferSourceNode | null = null;
  private _dist = 0;

  constructor(carIndex: number) {
    this.carIndex = carIndex;
    this.init();
  }

  init(): void {
    const ctx = getAudioContext();
    const dest = getMasterAudioInput();
    if (this.initialized || !ctx || !dest) return;
    const p = ctx.createPanner();
    try {
      p.panningModel = audioConfig.get('spatialPanningModel') || 'equalpower';
    } catch {
      p.panningModel = 'equalpower';
    }
    p.rolloffFactor = 0;
    p.connect(dest);
    this.panner3D = p;
    const mk = (v: number, out: AudioNode): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(out);
      return g;
    };
    this.inputGain = mk(1.0, this.isSelf ? dest : p);
    this.boostLoopGain = mk(0, this.inputGain);
    this.supersonicLoopGain = mk(0, this.inputGain);
    this.initialized = true;
  }

  setSelf(isSelf: boolean): void {
    const val = Boolean(isSelf);
    if (this.isSelf === val) return;
    this.isSelf = val;
    const dest = getMasterAudioInput();
    if (!this.inputGain || !dest) return;
    try {
      this.inputGain.disconnect();
      this.inputGain.connect(this.isSelf ? dest : this.panner3D || dest);
    } catch {
      /* ignore */
    }
  }

  setBuffers(boostLoop: AudioBuffer | null, supersonicLoop: AudioBuffer | null): void {
    if (boostLoop && this.boostLoopBuffer !== boostLoop) {
      this.boostLoopBuffer = boostLoop;
      stopSrc(this.boostLoopSource);
      this.boostLoopSource = null;
    }
    if (supersonicLoop && this.supersonicLoopBuffer !== supersonicLoop) {
      this.supersonicLoopBuffer = supersonicLoop;
      stopSrc(this.supersonicLoopSource);
      this.supersonicLoopSource = null;
    }
    this._startLoops();
  }

  private _spawn(buf: AudioBuffer | null, gain: GainNode | null, clear: () => void) {
    const ctx = getAudioContext();
    if (!ctx || !buf || !gain) return null;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start(ctx.currentTime, buf.duration > 0.1 ? Math.random() * buf.duration * 0.8 : 0);
      src.onended = clear;
      return src;
    } catch {
      return null;
    }
  }

  _startLoops(): void {
    if (!this.initialized || !this.isAlive || !this.audible) return;
    const d = !this.isSelf && listenerManager.hasListener ? this._dist : 0;
    if (
      this.isBoosting &&
      !this.boostLoopSource &&
      (this.isSelf || !isDistanceCulled(d, 'boost_other'))
    ) {
      this.boostLoopSource = this._spawn(this.boostLoopBuffer, this.boostLoopGain, () => {
        this.boostLoopSource = null;
      });
    }
    if (
      this.isSupersonic &&
      !this.supersonicLoopSource &&
      (this.isSelf || !isDistanceCulled(d, 'supersonic_other'))
    ) {
      this.supersonicLoopSource = this._spawn(
        this.supersonicLoopBuffer,
        this.supersonicLoopGain,
        () => {
          this.supersonicLoopSource = null;
        }
      );
    }
  }

  updatePosition(pos: SpatialPositionInput | null | undefined): void {
    const p = toAudioCoordinates(this.position, pos);
    if (!p) return;
    if (!this.isSelf && this.panner3D) {
      const s = getUuToMeters();
      if (this.panner3D.positionX) {
        this.panner3D.positionX.value = p.x * s;
        this.panner3D.positionY.value = p.y * s;
        this.panner3D.positionZ.value = p.z * s;
      } else {
        this.panner3D.setPosition?.(p.x * s, p.y * s, p.z * s);
      }
      this._dist = listenerManager.hasListener
        ? Math.hypot(
            p.x - listenerManager.position.x,
            p.y - listenerManager.position.y,
            p.z - listenerManager.position.z
          )
        : 0;
    } else {
      this._dist = 0;
    }
  }

  updateState(
    isBoosting: boolean,
    isSupersonic: boolean,
    isAlive: boolean,
    audible: boolean
  ): void {
    if (!this.initialized) this.init();
    this.isAlive = isAlive;
    this.audible = audible;
    const base =
      audioConfig.get('masterVolume') * (this.isSelf ? audioConfig.get('vehicleSelfVolume') : 1.0);
    const d = !this.isSelf && listenerManager.hasListener ? this._dist : 0;
    const atten = (c: AudioAttenuationCategory) =>
      this.isSelf ? 1.0 : isDistanceCulled(d, c) ? 0 : calculateIncidentDistanceGain(d, c);
    const bGain =
      isBoosting && isAlive && audible
        ? audioConfig.get('boostLoopVolume') *
          audioConfig.get('boostVolume') *
          base *
          atten('boost_other')
        : 0;
    const sGain =
      isSupersonic && isAlive && audible
        ? (audioConfig.get('supersonicLoopVolume') ?? audioConfig.get('supersonicVolume') ?? 1.0) *
          base *
          atten('supersonic_other')
        : 0;
    this.isBoosting = bGain > 1e-4;
    this.isSupersonic = sGain > 1e-4;
    if (this.isBoosting || this.isSupersonic) this._startLoops();
    if (!this.isBoosting && this.boostLoopSource) {
      stopSrc(this.boostLoopSource);
      this.boostLoopSource = null;
    }
    if (!this.isSupersonic && this.supersonicLoopSource) {
      stopSrc(this.supersonicLoopSource);
      this.supersonicLoopSource = null;
    }
    if (this.boostLoopGain) this.boostLoopGain.gain.value = bGain;
    if (this.supersonicLoopGain) this.supersonicLoopGain.gain.value = sGain;
  }

  playAction(
    buf: AudioBuffer | null,
    volume = 1.0,
    playbackRate = 1.0,
    category: AudioAttenuationCategory | string = 'jump_dodge_other',
    distanceRadiusScale = 1.0
  ): void {
    if (!buf) return;
    getAudioSlotPool()?.playBuffer(buf, {
      volume,
      playbackRate,
      position: this.isSelf ? null : { ...this.position, isAudioCoords: true },
      category,
      distanceRadiusScale,
    });
  }

  silenceAll(): void {
    stopSrc(this.boostLoopSource);
    stopSrc(this.supersonicLoopSource);
    this.boostLoopSource = null;
    this.supersonicLoopSource = null;
    if (this.boostLoopGain) this.boostLoopGain.gain.value = 0;
    if (this.supersonicLoopGain) this.supersonicLoopGain.gain.value = 0;
    for (const s of this.activeSources) stopSrc(s);
    this.activeSources.clear();
  }
}

export class VehicleAudioManager {
  _cd = new Map<number, number>();
  _lastBoostEdgeMsByCar = this._cd;
  _lastFlipResetMsByCar = this._cd;
  _lastJumpActionMsByCar = this._cd;
  _lastSupersonicEnterMsByCar = this._cd;
  _lastWheelLandingMsByCar = this._cd;
  _landingStateByCar = new Map<number, VehicleLandingTrackingState>();
  activeCarIndex = 0;
  buffers: VehicleAudioBuffers = {
    jump: [],
    doubleJump: [],
    dodge: [],
    boostStart: null,
    boostLoop: null,
    boostRelease: null,
    supersonicEnter: [],
    supersonicLoop: null,
    reset: null,
    wheelImpact: [],
    carCollision: null,
    vehicleDetail: [],
  };
  carBoostVariations = new Map<number, string>();
  emitters = new Map<number, VehicleAudioEmitter>();
  _lastIdx = [-1, -1, -1, -1, -1];

  private _resolveBoost(carIndex: number) {
    const bufs = subsystemState?.buffers;
    const varId = this.carBoostVariations.get(carIndex);
    if (varId && bufs) {
      return {
        boostStart: bufs.get(`boost_${varId}_start`) || this.buffers.boostStart,
        boostLoop: bufs.get(`boost_${varId}_loop`) || this.buffers.boostLoop,
        boostRelease: bufs.get(`boost_${varId}_end`) || this.buffers.boostRelease,
      };
    }
    return this.buffers;
  }

  setCarBoostAudioVariation(carIndex: number, variationId: string | null = null): void {
    if (typeof carIndex !== 'number' || carIndex < 0) return;
    if (variationId?.trim()) this.carBoostVariations.set(carIndex, variationId.trim());
    else this.carBoostVariations.delete(carIndex);
    this.emitters
      .get(carIndex)
      ?.setBuffers(this._resolveBoost(carIndex).boostLoop, this.buffers.supersonicLoop);
  }

  getEmitter(carIndex = 0): VehicleAudioEmitter {
    let em = this.emitters.get(carIndex);
    if (!em) {
      em = new VehicleAudioEmitter(carIndex);
      em.setSelf(carIndex === this.activeCarIndex);
      em.setBuffers(this._resolveBoost(carIndex).boostLoop, this.buffers.supersonicLoop);
      this.emitters.set(carIndex, em);
    }
    return em;
  }

  updatePanningModel(model: PanningModelType | null | undefined): void {
    if (!model) return;
    for (const e of this.emitters.values()) {
      if (e?.panner3D) {
        try {
          e.panner3D.panningModel = model;
        } catch {
          /* ignore */
        }
      }
    }
  }

  setBuffers(bufs: Partial<VehicleAudioBuffers> = {}): void {
    this.buffers = { ...this.buffers, ...bufs };
    for (const [idx, e] of this.emitters.entries()) {
      e.setBuffers(this._resolveBoost(idx).boostLoop, this.buffers.supersonicLoop);
    }
  }

  private _okCd(slot: number, car: number, now: number, ms: number): boolean {
    const key = slot * 64 + car;
    if (now - (this._cd.get(key) ?? -Infinity) < ms) return false;
    this._cd.set(key, now);
    return true;
  }

  private _pick(slot: number, list: Array<AudioBuffer | null>): AudioBuffer | null {
    if (!list.length) return null;
    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && idx === this._lastIdx[slot]) idx = (idx + 1) % list.length;
    this._lastIdx[slot] = idx;
    return list[idx] ?? null;
  }

  update(ctx: VehicleAudioUpdateContext): void {
    const active = ctx.activeCarIndex ?? 0;
    this.activeCarIndex = active;
    const audible =
      !ctx.hasBlockingOverlay &&
      Boolean(ctx.isMatchActive ?? true) &&
      (!ctx.isHidden || Boolean(ctx.continueOnBlur));
    const total = Math.max(1, ctx.numCars ?? 1);

    for (let i = 0; i < total; i++) {
      const em = this.getEmitter(i);
      em.setSelf(i === active);
      const pos = ctx.getCarPos?.(i);
      if (pos) em.updatePosition(pos);
      const st = ctx.getCarState?.(i);
      const alive = !st?.isDemoed;
      em.updateState(Boolean(st?.isBoosting), Boolean(st?.isSupersonic), alive, audible);

      if (st && alive && audible) {
        const grounded = Boolean(
          st.isOnGround ||
          st.getWheelContact?.(0) ||
          st.getWheelContact?.(1) ||
          st.getWheelContact?.(2) ||
          st.getWheelContact?.(3)
        );
        let ls = this._landingStateByCar.get(i);
        if (!ls) {
          ls = { wasGrounded: grounded, peakDownwardSpeedUU: 0, airborneTicks: 0 };
          this._landingStateByCar.set(i, ls);
        }
        if (!grounded) {
          ls.wasGrounded = false;
          ls.airborneTicks++;
          ls.peakDownwardSpeedUU = Math.max(ls.peakDownwardSpeedUU, -(st.velZ ?? 0));
        } else {
          if (!ls.wasGrounded && ls.airborneTicks >= 6 && ls.peakDownwardSpeedUU >= 220) {
            this.handleCarEvent({
              type: 'wheel_impact',
              carIndex: i,
              speed: ls.peakDownwardSpeedUU,
            });
          }
          ls.wasGrounded = true;
          ls.peakDownwardSpeedUU = 0;
          ls.airborneTicks = 0;
        }
      }
    }
  }

  handleCarEvent(event: PhysicsImpactAudioEvent | null | undefined): void {
    if (!event) return;
    const t = event.type;
    if (t === 0x05 || t === 'car_action') {
      const sub = Number(event.actionSubType ?? event.subType ?? 0);
      if (sub >= 1 && sub <= 3) this.handleCarEvent({ ...event, type: 0x05 + sub });
      return;
    }
    const rawCar = event.carIndex ?? event.primaryId ?? 0;
    const car = rawCar === 65535 ? 0 : rawCar;
    const em = this.getEmitter(car);
    if (event.carPosX !== undefined && event.carPosY !== undefined && event.carPosZ !== undefined) {
      em.updatePosition({ posX: event.carPosX, posY: event.carPosY, posZ: event.carPosZ });
    } else if (event.posX !== undefined || event.x !== undefined) {
      em.updatePosition(event);
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const base =
      (audioConfig.get('masterVolume') ?? 1.0) *
      (em.isSelf ? (audioConfig.get('vehicleSelfVolume') ?? 1.0) : 1.0);
    const cd = INCIDENT_COOLDOWN_MS;

    if (
      t === 0x06 ||
      t === 'car_jump' ||
      t === 0x07 ||
      t === 'car_double_jump' ||
      t === 0x08 ||
      t === 'car_dodge'
    ) {
      const k = t === 0x08 || t === 'car_dodge' ? 2 : t === 0x07 || t === 'car_double_jump' ? 1 : 0;
      if (!this._okCd(k, car, now, cd.JUMP_ACTION_PER_CAR)) return;
      const list =
        k === 2 ? this.buffers.dodge : k === 1 ? this.buffers.doubleJump : this.buffers.jump;
      const vol =
        (audioConfig.get(k === 2 ? 'dodgeVolume' : k === 1 ? 'doubleJumpVolume' : 'jumpVolume') ??
          1.0) * base;
      const buf = this._pick(k, list);
      if (buf) em.playAction(buf, vol, 1.0, 'jump_dodge_other');
      else
        em.playAction(
          this.buffers.carCollision,
          vol * 0.4,
          k === 2 ? 1.2 : k === 1 ? 1.7 : 1.4,
          'jump_dodge_other'
        );
    } else if (t === 0x0c || t === 'car_boost_start') {
      if (!this._okCd(3, car, now, cd.BOOST_EDGE_PER_CAR)) return;
      const { boostStart, boostLoop } = this._resolveBoost(car);
      const v =
        audioConfig.get('boostStartVolume') ?? audioConfig.get('boostStartStopVolume') ?? 1.0;
      em.playAction(
        boostStart || boostLoop,
        (audioConfig.get('boostVolume') ?? 1.0) * v * base,
        1.0,
        'boost_other'
      );
    } else if (t === 0x0d || t === 'car_boost_stop') {
      const { boostRelease } = this._resolveBoost(car);
      const v =
        audioConfig.get('boostReleaseVolume') ?? audioConfig.get('boostStartStopVolume') ?? 1.0;
      em.playAction(
        boostRelease,
        (audioConfig.get('boostVolume') ?? 1.0) * v * base * 0.8,
        1.0,
        'boost_other',
        0.85
      );
    } else if (t === 0x09 || t === 'car_supersonic_enter') {
      if (!this._okCd(4, car, now, cd.SUPERSONIC_ENTER_PER_CAR)) return;
      const vol =
        (audioConfig.get('supersonicEnterVolume') ?? audioConfig.get('supersonicVolume') ?? 1.0) *
        base;
      const buf = this._pick(3, this.buffers.supersonicEnter);
      em.playAction(buf || this.buffers.supersonicLoop, vol, buf ? 1.0 : 1.1, 'supersonic_other');
    } else if (t === 0x0f || t === 'flip_reset_gained') {
      if (isBallFlipResetEvent(event) && this._okCd(5, car, now, cd.FLIP_RESET_PER_CAR)) {
        em.playAction(
          this.buffers.reset,
          (audioConfig.get('flipResetVolume') ?? 1.0) * base,
          1.0,
          'flip_reset_other'
        );
      }
    } else if ((t === 0x12 || t === 'wheel_impact') && this.buffers.wheelImpact.length > 0) {
      if (!this._okCd(6, car, now, cd.WHEEL_LANDING_PER_CAR)) return;
      const spd = Math.abs(
        event.speed ?? event.relSpeed ?? event.normalRelVel ?? event.impulse ?? 500
      );
      const mod = calibrateWheelLandingModulation(spd, em.isSelf);
      em.playAction(
        this._pick(4, this.buffers.wheelImpact),
        (audioConfig.get('wheelImpactVolume') ?? 1.0) * base * mod.volumeGainMultiplier,
        mod.playbackRate,
        mod.category,
        mod.distanceRadiusScale
      );
    }
  }

  silenceAll(): void {
    for (const emitter of this.emitters.values()) emitter.silenceAll();
  }
}
