import { VehicleAudioEmitter } from './VehicleAudioEmitter.ts';
import { audioConfig } from '../ui-core/config/audioConfig.ts';
import {
  INCIDENT_EVENT_TYPES,
  PHYSICS_EVENT_TYPES,
  isBallFlipResetEvent,
} from '../physics/RocketSimConstants.ts';
import { type SpatialPositionInput } from './SpatialAudioSource.ts';
import {
  INCIDENT_COOLDOWN_MS,
  computeVehicleBaseVolumeMultiplier,
  createInitialVehicleAudioBuffers,
  evaluateBoostStartPlayback,
  evaluateBoostStopPlayback,
  evaluateJumpFamilyActionPlayback,
  evaluateSupersonicEnterPlayback,
  evaluateWheelImpactPlayback,
  isVehicleCurrentlyGrounded,
  resolveCarActionSubEventType,
  resolveCarBoostVariationBuffers,
  resolveJumpFamilyActionSpec,
  resolveVehicleEventSpatialPosition,
  stepVehicleLandingTracking,
  type PhysicsImpactAudioEvent,
  type VehicleAudioBuffers,
  type VehicleCarStateSnapshot,
  type VehicleLandingTrackingState,
} from './vehicleAudioAcousticPipeline.ts';

export type {
  PhysicsImpactAudioEvent,
  VehicleAudioBuffers,
  VehicleCarStateSnapshot,
  VehicleLandingTrackingState,
};

export interface VehicleAudioUpdateContext {
  activeCarIndex?: number;
  numCars?: number;
  getCarPos?: ((carIndex: number) => SpatialPositionInput | null | undefined) | null;
  getCarState?: ((carIndex: number) => VehicleCarStateSnapshot | null | undefined) | null;
  isMatchActive?: boolean;
  hasBlockingOverlay?: boolean;
  continueOnBlur?: boolean;
  isHidden?: boolean;
}

export class VehicleAudioManager {
  _lastBoostEdgeMsByCar = new Map<number, number>();
  _lastFlipResetMsByCar?: Map<number, number>;
  _lastJumpActionMsByCar = new Map<number, number>();
  _lastSupersonicEnterMsByCar = new Map<number, number>();
  _lastWheelLandingMsByCar = new Map<number, number>();
  _landingStateByCar = new Map<number, VehicleLandingTrackingState>();
  activeCarIndex = 0;
  buffers: VehicleAudioBuffers = createInitialVehicleAudioBuffers();
  carBoostVariations = new Map<number, string>();
  emitters = new Map<number, VehicleAudioEmitter>();
  lastDodgeSoundIdx = -1;
  lastDoubleJumpSoundIdx = -1;
  lastJumpSoundIdx = -1;
  lastSupersonicEnterSoundIdx = -1;
  lastWheelImpactSoundIdx = -1;

  private _resolveBoostBuffersForCar(carIndex: number) {
    return resolveCarBoostVariationBuffers(
      carIndex,
      this.activeCarIndex,
      this.carBoostVariations,
      this.buffers
    );
  }

  private _syncEmitterBuffers(carIndex: number, emitter: VehicleAudioEmitter): void {
    const { boostLoop } = this._resolveBoostBuffersForCar(carIndex);
    emitter.setBuffers({ boostLoop, supersonicLoop: this.buffers.supersonicLoop });
  }

  setCarBoostAudioVariation(carIndex: number, variationId: string | null = null): void {
    if (typeof carIndex !== 'number' || carIndex < 0) return;
    if (typeof variationId === 'string' && variationId.trim()) {
      this.carBoostVariations.set(carIndex, variationId.trim());
    } else {
      this.carBoostVariations.delete(carIndex);
    }
    const emitter = this.emitters.get(carIndex);
    if (emitter) this._syncEmitterBuffers(carIndex, emitter);
  }

  getEmitter(carIndex = 0): VehicleAudioEmitter {
    let emitter = this.emitters.get(carIndex);
    if (!emitter) {
      emitter = new VehicleAudioEmitter(carIndex);
      emitter.setSelf(carIndex === this.activeCarIndex);
      this._syncEmitterBuffers(carIndex, emitter);
      this.emitters.set(carIndex, emitter);
    }
    return emitter;
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
    for (const [carIdx, e] of this.emitters.entries()) this._syncEmitterBuffers(carIdx, e);
  }

  private _checkCarCooldown(
    map: Map<number, number>,
    carIndex: number,
    nowMs: number,
    cooldownMs: number
  ): boolean {
    const prevMs = map.get(carIndex) || -Infinity;
    if (nowMs - prevMs < cooldownMs) return false;
    map.set(carIndex, nowMs);
    return true;
  }

  update({
    activeCarIndex = 0,
    numCars = 1,
    getCarPos = null,
    getCarState = null,
    isMatchActive = true,
    hasBlockingOverlay = false,
    continueOnBlur = false,
    isHidden = false,
  }: VehicleAudioUpdateContext): void {
    this.activeCarIndex = activeCarIndex;
    const totalCars = Math.max(1, numCars);
    const audible =
      !hasBlockingOverlay && Boolean(isMatchActive) && (!isHidden || Boolean(continueOnBlur));

    for (let i = 0; i < totalCars; i++) {
      const emitter = this.getEmitter(i);
      emitter.setSelf(i === activeCarIndex);

      const pos = getCarPos ? getCarPos(i) : null;
      if (pos) emitter.updatePosition(pos);

      const carState = getCarState ? getCarState(i) : null;
      const isAlive = !carState?.isDemoed;
      emitter.updateState({
        isBoosting: Boolean(carState?.isBoosting),
        isSupersonic: Boolean(carState?.isSupersonic),
        isAlive,
        audible,
      });

      if (carState && isAlive && audible) {
        let landingSt = this._landingStateByCar.get(i);
        if (!landingSt) {
          landingSt = {
            wasGrounded: isVehicleCurrentlyGrounded(carState),
            peakDownwardSpeedUU: 0,
            airborneTicks: 0,
          };
          this._landingStateByCar.set(i, landingSt);
        }
        const triggeredLandingSpeed = stepVehicleLandingTracking(landingSt, carState);
        if (triggeredLandingSpeed !== null) {
          this.handleCarEvent({
            type: 'wheel_impact',
            carIndex: i,
            speed: triggeredLandingSpeed,
          });
        }
      }
    }
  }

  handleCarEvent(event: PhysicsImpactAudioEvent | null | undefined): void {
    if (!event) return;
    const rawCarIndex = event.carIndex ?? event.primaryId ?? 0;
    const carIndex = rawCarIndex === 65535 ? 0 : rawCarIndex;
    const emitter = this.getEmitter(carIndex);
    const spatialPos = resolveVehicleEventSpatialPosition(event);
    if (spatialPos) emitter.updatePosition(spatialPos);

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const baseMult = computeVehicleBaseVolumeMultiplier(emitter.isSelf);

    const jumpSpec = resolveJumpFamilyActionSpec(event.type);
    if (jumpSpec) {
      const actionCooldownKey =
        carIndex * 16 +
        (jumpSpec.bufferKey === 'dodge' ? 2 : jumpSpec.bufferKey === 'doubleJump' ? 1 : 0);
      if (
        !this._checkCarCooldown(
          this._lastJumpActionMsByCar,
          actionCooldownKey,
          nowMs,
          INCIDENT_COOLDOWN_MS.JUMP_ACTION_PER_CAR
        )
      ) {
        return;
      }
      const resolved = evaluateJumpFamilyActionPlayback(
        this.buffers[jumpSpec.bufferKey],
        this.buffers.carCollision,
        this[jumpSpec.lastIdxKey],
        jumpSpec.volumeConfigKey,
        baseMult,
        jumpSpec.fallbackRate
      );
      if (resolved) {
        if (resolved.nextSoundIdx !== undefined) {
          this[jumpSpec.lastIdxKey] = resolved.nextSoundIdx;
        }
        emitter.playAction(resolved.buffer, resolved.options);
      }
      return;
    }

    switch (event.type) {
      case PHYSICS_EVENT_TYPES.CAR_ACTION: {
        const mappedType = resolveCarActionSubEventType(event);
        if (mappedType !== null) {
          this.handleCarEvent({ ...event, type: mappedType });
        }
        break;
      }

      case INCIDENT_EVENT_TYPES.CAR_BOOST_START:
      case 0x0c: {
        if (
          !this._checkCarCooldown(
            this._lastBoostEdgeMsByCar,
            carIndex,
            nowMs,
            INCIDENT_COOLDOWN_MS.BOOST_EDGE_PER_CAR
          )
        ) {
          break;
        }
        const { boostStart, boostLoop } = this._resolveBoostBuffersForCar(carIndex);
        const resolved = evaluateBoostStartPlayback(boostStart, boostLoop, baseMult);
        if (resolved) emitter.playAction(resolved.buffer, resolved.options);
        break;
      }

      case INCIDENT_EVENT_TYPES.CAR_BOOST_STOP:
      case 0x0d: {
        const { boostRelease } = this._resolveBoostBuffersForCar(carIndex);
        const resolved = evaluateBoostStopPlayback(boostRelease, baseMult);
        if (resolved) emitter.playAction(resolved.buffer, resolved.options);
        break;
      }

      case INCIDENT_EVENT_TYPES.CAR_SUPERSONIC_ENTER:
      case PHYSICS_EVENT_TYPES.CAR_SUPERSONIC_ENTER:
      case 0x09: {
        if (
          !this._checkCarCooldown(
            this._lastSupersonicEnterMsByCar,
            carIndex,
            nowMs,
            INCIDENT_COOLDOWN_MS.SUPERSONIC_ENTER_PER_CAR
          )
        ) {
          break;
        }
        const resolved = evaluateSupersonicEnterPlayback(
          this.buffers,
          this.lastSupersonicEnterSoundIdx,
          baseMult
        );
        if (resolved) {
          if (resolved.nextSoundIdx !== undefined) {
            this.lastSupersonicEnterSoundIdx = resolved.nextSoundIdx;
          }
          emitter.playAction(resolved.buffer, resolved.options);
        }
        break;
      }

      case INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED:
      case PHYSICS_EVENT_TYPES.FLIP_RESET_GAINED:
      case 0x0f: {
        if (!isBallFlipResetEvent(event)) break;
        if (!this._lastFlipResetMsByCar) this._lastFlipResetMsByCar = new Map();
        if (
          !this._checkCarCooldown(
            this._lastFlipResetMsByCar,
            carIndex,
            nowMs,
            INCIDENT_COOLDOWN_MS.FLIP_RESET_PER_CAR
          )
        ) {
          break;
        }
        const vol = (audioConfig.get('flipResetVolume') ?? 1.0) * baseMult;
        if (this.buffers.reset) {
          emitter.playAction(this.buffers.reset, {
            volume: vol,
            playbackRate: 1.0,
            category: 'flip_reset_other',
          });
        } else {
          console.error('[AudioArchitecture] Missing flip reset audio asset!', {
            carIndex,
            eventType: event.type,
          });
        }
        break;
      }

      case 'wheel_impact':
      case 0x12: {
        if (
          !this._checkCarCooldown(
            this._lastWheelLandingMsByCar,
            carIndex,
            nowMs,
            INCIDENT_COOLDOWN_MS.WHEEL_LANDING_PER_CAR
          )
        ) {
          break;
        }
        const resolved = evaluateWheelImpactPlayback(
          event,
          this.buffers,
          this.lastWheelImpactSoundIdx,
          emitter.isSelf,
          baseMult
        );
        if (resolved) {
          if (resolved.nextSoundIdx !== undefined) {
            this.lastWheelImpactSoundIdx = resolved.nextSoundIdx;
          }
          emitter.playAction(resolved.buffer, resolved.options);
        }
        break;
      }

      default:
        break;
    }
  }

  silenceAll(): void {
    for (const emitter of this.emitters.values()) emitter.silenceAll();
  }
}
