/**
 * vehicleAudioAcousticPipeline.ts
 * Pure acoustic parameter calculation, boost variation buffer resolution,
 * landing impact tracking, and action playback evaluation for VehicleAudioManager.
 */

import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { subsystemState } from './audioContext.ts';
import { INCIDENT_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import { type AudioAttenuationCategory, type SpatialPositionInput } from './SpatialAudioSource.ts';
import { type VehiclePlayActionOptions } from './VehicleAudioEmitter.ts';
import { type PhysicsImpactAudioEvent } from './WorldImpactAudioHandler.ts';
import { calibrateWheelLandingModulation } from './IncidentSpatialModulator.ts';

export interface VehicleAudioBuffers {
  jump: Array<AudioBuffer | null>;
  doubleJump: Array<AudioBuffer | null>;
  dodge: Array<AudioBuffer | null>;
  boostStart: AudioBuffer | null;
  boostLoop: AudioBuffer | null;
  boostRelease: AudioBuffer | null;
  supersonicEnter: Array<AudioBuffer | null>;
  supersonicLoop: AudioBuffer | null;
  reset: AudioBuffer | null;
  wheelImpact: Array<AudioBuffer | null>;
  carCollision: AudioBuffer | null;
  vehicleDetail: Array<AudioBuffer | null>;
}

export interface VehicleCarStateSnapshot {
  isBoosting?: boolean;
  isSupersonic?: boolean;
  isDemoed?: boolean;
  isOnGround?: boolean;
  velZ?: number;
  airTime?: number;
  getWheelContact?: (wheelIndex: number) => boolean;
}

export interface VehicleLandingTrackingState {
  wasGrounded: boolean;
  peakDownwardSpeedUU: number;
  airborneTicks: number;
}

export interface ResolvedVehicleActionPlayback {
  buffer: AudioBuffer;
  options: VehiclePlayActionOptions;
  nextSoundIdx?: number;
}

export function createInitialVehicleAudioBuffers(): VehicleAudioBuffers {
  return {
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
}

export function resolveCarBoostVariationBuffers(
  carIndex: number,
  activeCarIndex: number,
  carBoostVariations: ReadonlyMap<number, string>,
  fallbackBuffers: VehicleAudioBuffers
): {
  boostStart: AudioBuffer | null;
  boostLoop: AudioBuffer | null;
  boostRelease: AudioBuffer | null;
} {
  const bufs = subsystemState?.buffers;
  const resolveKeys = (sKey: string, lKey: string, eKey: string) => ({
    boostStart: bufs?.get(`boost_${sKey}_start`) || fallbackBuffers.boostStart,
    boostLoop: bufs?.get(`boost_${lKey}_loop`) || fallbackBuffers.boostLoop,
    boostRelease: bufs?.get(`boost_${eKey}_end`) || fallbackBuffers.boostRelease,
  });
  if (carIndex === activeCarIndex && bufs) {
    const sVar = audioConfig.get('boostStartVariation');
    const lVar = audioConfig.get('boostLoopVariation');
    const eVar = audioConfig.get('boostEndVariation');
    if (sVar && lVar && eVar && (sVar !== lVar || lVar !== eVar)) {
      return resolveKeys(sVar, lVar, eVar);
    }
  }
  const varId = carBoostVariations.get(carIndex);
  if (varId && bufs) return resolveKeys(varId, varId, varId);
  return {
    boostStart: fallbackBuffers.boostStart,
    boostLoop: fallbackBuffers.boostLoop,
    boostRelease: fallbackBuffers.boostRelease,
  };
}

export function isVehicleCurrentlyGrounded(carState: VehicleCarStateSnapshot): boolean {
  if (carState.isOnGround) return true;
  if (typeof carState.getWheelContact === 'function') {
    return (
      carState.getWheelContact(0) ||
      carState.getWheelContact(1) ||
      carState.getWheelContact(2) ||
      carState.getWheelContact(3)
    );
  }
  return false;
}

export function stepVehicleLandingTracking(
  landingSt: VehicleLandingTrackingState,
  carState: VehicleCarStateSnapshot
): number | null {
  const isGroundedNow = isVehicleCurrentlyGrounded(carState);
  if (!isGroundedNow) {
    landingSt.wasGrounded = false;
    landingSt.airborneTicks++;
    const downwardVel = Math.max(0, -(carState.velZ ?? 0));
    if (downwardVel > landingSt.peakDownwardSpeedUU) {
      landingSt.peakDownwardSpeedUU = downwardVel;
    }
    return null;
  }

  let triggeredSpeed: number | null = null;
  if (
    !landingSt.wasGrounded &&
    landingSt.airborneTicks >= 6 &&
    landingSt.peakDownwardSpeedUU >= 220
  ) {
    triggeredSpeed = landingSt.peakDownwardSpeedUU;
  }
  landingSt.wasGrounded = true;
  landingSt.peakDownwardSpeedUU = 0;
  landingSt.airborneTicks = 0;
  return triggeredSpeed;
}

export function resolveVehicleEventSpatialPosition(
  event: PhysicsImpactAudioEvent
): SpatialPositionInput | null {
  if (event.carPosX !== undefined && event.carPosY !== undefined && event.carPosZ !== undefined) {
    return { posX: event.carPosX, posY: event.carPosY, posZ: event.carPosZ };
  }
  if (
    (event.posX !== undefined || event.x !== undefined) &&
    event.type !== INCIDENT_EVENT_TYPES.BOOST_PICKUP &&
    event.type !== 0x0a &&
    event.type !== INCIDENT_EVENT_TYPES.BOOST_SPAWN &&
    event.type !== 0x0b
  ) {
    return event;
  }
  return null;
}

export function resolveCarActionSubEventType(event: PhysicsImpactAudioEvent): number | null {
  const actionSubType = Number(event.actionSubType ?? event.subType ?? 0);
  if (actionSubType === 1) return INCIDENT_EVENT_TYPES.CAR_JUMP;
  if (actionSubType === 2) return INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP;
  if (actionSubType === 3) return INCIDENT_EVENT_TYPES.CAR_DODGE;
  return null;
}

export function computeVehicleBaseVolumeMultiplier(isSelf: boolean): number {
  return (
    (audioConfig.get('masterVolume') ?? 1.0) *
    (isSelf ? (audioConfig.get('vehicleSelfVolume') ?? 1.0) : 1.0)
  );
}

export function pickNonRepeatingSoundIndex(length: number, lastIdx: number): number {
  let idx = Math.floor(Math.random() * length);
  if (length > 1 && idx === lastIdx) idx = (idx + 1) % length;
  return idx;
}

export interface JumpFamilyActionSpec {
  volumeConfigKey: string;
  bufferKey: 'jump' | 'doubleJump' | 'dodge';
  lastIdxKey: 'lastJumpSoundIdx' | 'lastDoubleJumpSoundIdx' | 'lastDodgeSoundIdx';
  fallbackRate: number;
}

export function resolveJumpFamilyActionSpec(
  eventType: string | number | undefined
): JumpFamilyActionSpec | null {
  if (eventType === INCIDENT_EVENT_TYPES.CAR_JUMP || eventType === 0x06) {
    return {
      volumeConfigKey: 'jumpVolume',
      bufferKey: 'jump',
      lastIdxKey: 'lastJumpSoundIdx',
      fallbackRate: 1.4,
    };
  }
  if (eventType === INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP || eventType === 0x07) {
    return {
      volumeConfigKey: 'doubleJumpVolume',
      bufferKey: 'doubleJump',
      lastIdxKey: 'lastDoubleJumpSoundIdx',
      fallbackRate: 1.7,
    };
  }
  if (eventType === INCIDENT_EVENT_TYPES.CAR_DODGE || eventType === 0x08) {
    return {
      volumeConfigKey: 'dodgeVolume',
      bufferKey: 'dodge',
      lastIdxKey: 'lastDodgeSoundIdx',
      fallbackRate: 1.2,
    };
  }
  return null;
}

export function evaluateJumpFamilyActionPlayback(
  list: Array<AudioBuffer | null>,
  fallbackBuffer: AudioBuffer | null,
  lastIdx: number,
  volumeConfigKey: string,
  baseMult: number,
  fallbackRate: number,
  category: AudioAttenuationCategory = 'jump_dodge_other'
): ResolvedVehicleActionPlayback | null {
  const vol = (audioConfig.get(volumeConfigKey) ?? 1.0) * baseMult;
  if (list && list.length > 0) {
    const idx = pickNonRepeatingSoundIndex(list.length, lastIdx);
    const buf = list[idx];
    if (!buf) return null;
    return { buffer: buf, nextSoundIdx: idx, options: { volume: vol, category } };
  }
  if (fallbackBuffer) {
    return {
      buffer: fallbackBuffer,
      options: { volume: vol * 0.4, playbackRate: fallbackRate, category },
    };
  }
  return null;
}

export function evaluateBoostStartPlayback(
  boostStart: AudioBuffer | null,
  boostLoop: AudioBuffer | null,
  baseMult: number
): ResolvedVehicleActionPlayback | null {
  const buf = boostStart || boostLoop;
  if (!buf) return null;
  const startVol =
    audioConfig.get('boostStartVolume') ?? audioConfig.get('boostStartStopVolume') ?? 1.0;
  const volume = (audioConfig.get('boostVolume') ?? 1.0) * startVol * baseMult;
  return { buffer: buf, options: { volume, category: 'boost_other' } };
}

export function evaluateBoostStopPlayback(
  boostRelease: AudioBuffer | null,
  baseMult: number
): ResolvedVehicleActionPlayback | null {
  if (!boostRelease) return null;
  const releaseVol =
    audioConfig.get('boostReleaseVolume') ?? audioConfig.get('boostStartStopVolume') ?? 1.0;
  const volume = (audioConfig.get('boostVolume') ?? 1.0) * releaseVol * baseMult * 0.8;
  return {
    buffer: boostRelease,
    options: { volume, category: 'boost_other', distanceRadiusScale: 0.85 },
  };
}

export function evaluateSupersonicEnterPlayback(
  buffers: VehicleAudioBuffers,
  lastIdx: number,
  baseMult: number
): ResolvedVehicleActionPlayback | null {
  const vol =
    (audioConfig.get('supersonicEnterVolume') ?? audioConfig.get('supersonicVolume') ?? 1.0) *
    baseMult;
  const enterList = buffers.supersonicEnter;
  if (enterList && enterList.length > 0) {
    const idx = pickNonRepeatingSoundIndex(enterList.length, lastIdx);
    const buf = enterList[idx];
    if (!buf) return null;
    return {
      buffer: buf,
      nextSoundIdx: idx,
      options: { volume: vol, category: 'supersonic_other' },
    };
  }
  if (buffers.supersonicLoop) {
    return {
      buffer: buffers.supersonicLoop,
      options: {
        volume: vol,
        playbackRate: 1.1,
        category: 'supersonic_other',
      },
    };
  }
  return null;
}

export function evaluateWheelImpactPlayback(
  event: PhysicsImpactAudioEvent,
  buffers: VehicleAudioBuffers,
  lastIdx: number,
  isSelf: boolean,
  baseMult: number
): ResolvedVehicleActionPlayback | null {
  const list = buffers.wheelImpact;
  if (!list || list.length === 0) return null;
  const idx = pickNonRepeatingSoundIndex(list.length, lastIdx);
  const buf = list[idx];
  if (!buf) return null;

  const speed = Math.abs(
    event.speed ?? event.relSpeed ?? event.normalRelVel ?? event.impulse ?? 500
  );
  const mod = calibrateWheelLandingModulation(speed, isSelf);
  const volume =
    (audioConfig.get('wheelImpactVolume') ?? 1.0) * baseMult * mod.volumeGainMultiplier;

  return {
    buffer: buf,
    nextSoundIdx: idx,
    options: {
      volume,
      playbackRate: mod.playbackRate,
      category: mod.category,
      distanceRadiusScale: mod.distanceRadiusScale,
    },
  };
}
