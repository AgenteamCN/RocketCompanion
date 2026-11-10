/**
 * incidentEventAcousticPipeline.ts
 * Pure acoustic parameter evaluation, buffer selection, cooldown key derivation,
 * and event routing classification for discrete physics incidents.
 */

import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { INCIDENT_EVENT_TYPES, PHYSICS_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import {
  type WorldImpactAudioBuffers,
  type PhysicsImpactAudioEvent,
} from './WorldImpactAudioHandler.ts';
import { type PlayAudioBufferOptions } from './AudioSlotPool.ts';
import {
  INCIDENT_SLOT_PRIORITY,
  calibrateCarBallHitModulation,
  calibrateCarBumpModulation,
  calibrateBoostPickupModulation,
} from './IncidentSpatialModulator.ts';

export interface IncidentAudioBuffers extends WorldImpactAudioBuffers {
  ballHit: Array<AudioBuffer | null>;
  vehicleAccent: AudioBuffer | null;
  vehicleDetail: Array<AudioBuffer | null>;
  sidewallHit: Array<AudioBuffer | null>;
  carDemo: Array<AudioBuffer | null>;
  carCollision: AudioBuffer | null;
  goalpost: AudioBuffer | null;
  boostCollect: AudioBuffer | null;
  goalScored: AudioBuffer | null;
  supersonic: AudioBuffer | null;
  jump: Array<AudioBuffer | null>;
  doubleJump: Array<AudioBuffer | null>;
  dodge: Array<AudioBuffer | null>;
  reset: AudioBuffer | null;
  wheelImpact: Array<AudioBuffer | null>;
  groundHit: Array<AudioBuffer | null>;
  crossbarPing: Array<AudioBuffer | null>;
  crossbarPingSmall: Array<AudioBuffer | null>;
  boostStart: AudioBuffer | null;
  boostRelease: AudioBuffer | null;
  supersonicEnter: Array<AudioBuffer | null>;
}

export interface ResolvedIncidentPlayback {
  buffer: AudioBuffer;
  options: PlayAudioBufferOptions;
  nextSoundIdx?: number;
}

const VEHICLE_ACTION_EVENT_TYPES = new Set<number | string>([
  INCIDENT_EVENT_TYPES.CAR_JUMP,
  INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP,
  INCIDENT_EVENT_TYPES.CAR_DODGE,
  PHYSICS_EVENT_TYPES.CAR_ACTION,
  0x06,
  0x07,
  0x08,
  INCIDENT_EVENT_TYPES.CAR_SUPERSONIC_ENTER,
  PHYSICS_EVENT_TYPES.CAR_SUPERSONIC_ENTER,
  0x09,
  INCIDENT_EVENT_TYPES.CAR_BOOST_START,
  0x0c,
  INCIDENT_EVENT_TYPES.CAR_BOOST_STOP,
  0x0d,
  INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED,
  PHYSICS_EVENT_TYPES.FLIP_RESET_GAINED,
  0x0f,
  'wheel_impact',
  0x12,
]);

export function isVehicleActionIncidentEvent(type: number | string | undefined): boolean {
  return type !== undefined && VEHICLE_ACTION_EVENT_TYPES.has(type);
}

export function createInitialIncidentAudioBuffers(): IncidentAudioBuffers {
  return {
    ballHit: [],
    vehicleAccent: null,
    vehicleDetail: [],
    sidewallHit: [],
    carDemo: [],
    carCollision: null,
    goalpost: null,
    boostCollect: null,
    goalScored: null,
    supersonic: null,
    jump: [],
    doubleJump: [],
    dodge: [],
    reset: null,
    wheelImpact: [],
    groundHit: [],
    crossbarPing: [],
    crossbarPingSmall: [],
    boostStart: null,
    boostRelease: null,
    supersonicEnter: [],
  };
}

export function isCarBallImpactAboveThreshold(event: PhysicsImpactAudioEvent): {
  passes: boolean;
  threshold: number;
} {
  const threshold = Number(audioConfig.get('carBallHitImpulseThreshold') ?? 80);
  const impulse = Number.isFinite(event.impulse)
    ? (event.impulse as number)
    : (event.relSpeed ?? 0);
  return { passes: impulse >= threshold, threshold };
}

export function evaluateCarBallHitPlayback(
  event: PhysicsImpactAudioEvent,
  buffers: IncidentAudioBuffers,
  activeCarIndex: number,
  threshold: number,
  lastBallHitSoundIdx: number
): ResolvedIncidentPlayback | null {
  const ballHitMode = audioConfig.get('carBallSoundMode') || 'vehicle_body';
  let bufferToPlay: AudioBuffer | null = null;
  let nextSoundIdx = lastBallHitSoundIdx;

  if (ballHitMode === 'vehicle_accent' && buffers.vehicleAccent) {
    bufferToPlay = buffers.vehicleAccent;
  } else {
    const hitList = buffers.ballHit;
    if (!hitList || hitList.length === 0) return null;
    let idx = Math.floor(Math.random() * hitList.length);
    if (hitList.length > 1 && idx === lastBallHitSoundIdx) {
      idx = (idx + 1) % hitList.length;
    }
    nextSoundIdx = idx;
    bufferToPlay = hitList[idx];
  }

  if (!bufferToPlay) return null;

  const mod = calibrateCarBallHitModulation(event, activeCarIndex, threshold);
  const master = audioConfig.get('masterVolume') ?? 1.0;
  const hitVol =
    ballHitMode === 'vehicle_accent'
      ? (audioConfig.get('carBallAccentVolume') ?? 1.0) *
        (audioConfig.get('carBallHitVolume') ?? 1.0)
      : (audioConfig.get('carBallHitVolume') ?? 1.0);
  const layerVol = audioConfig.get('ballCollisionVolume') ?? 1.0;
  const volume = Math.max(0, Math.min(5.0, hitVol * layerVol * master * mod.volumeGainMultiplier));

  return {
    buffer: bufferToPlay,
    nextSoundIdx,
    options: {
      volume,
      position: event,
      category: mod.category,
      distanceRadiusScale: mod.distanceRadiusScale,
      playbackRate: mod.playbackRate,
      priority: mod.priority,
    },
  };
}

export function computeCarCollisionPairKey(event: PhysicsImpactAudioEvent): number {
  const c1 = event.car1Index ?? event.carIndex ?? event.primaryId ?? 0;
  const c2 = event.car2Index ?? event.secondaryId ?? 0;
  return (Math.min(c1, c2) & 0xff) | ((Math.max(c1, c2) & 0xff) << 8);
}

export function evaluateCarCarCollisionPlayback(
  event: PhysicsImpactAudioEvent,
  buffers: IncidentAudioBuffers,
  activeCarIndex: number
): ResolvedIncidentPlayback | null {
  const carCarMode = audioConfig.get('carCarSoundMode') || 'vehicle_detail';
  let buf: AudioBuffer | null = null;
  if (
    carCarMode === 'vehicle_detail' &&
    buffers.vehicleDetail &&
    buffers.vehicleDetail.length > 0
  ) {
    const list = buffers.vehicleDetail;
    buf = list[Math.floor(Math.random() * list.length)];
  } else {
    buf = buffers.carCollision;
  }
  if (!buf) return null;

  const mod = calibrateCarBumpModulation(event, activeCarIndex);
  const master = audioConfig.get('masterVolume') ?? 1.0;
  const carVol =
    carCarMode === 'vehicle_detail'
      ? (audioConfig.get('carCarCollisionVolume') ?? 1.0)
      : (audioConfig.get('carCarSfxCollisionVolume') ?? 1.0) *
        (audioConfig.get('carCarCollisionVolume') ?? 1.0);
  const volume = Math.max(0, Math.min(5.0, carVol * master * mod.volumeGainMultiplier));

  return {
    buffer: buf,
    options: {
      volume,
      position: event,
      category: mod.category,
      distanceRadiusScale: mod.distanceRadiusScale,
      playbackRate: mod.playbackRate,
      priority: mod.priority,
    },
  };
}

export function evaluateCarCarDemoPlayback(
  event: PhysicsImpactAudioEvent,
  buffers: IncidentAudioBuffers,
  lastCarDemoSoundIdx: number
): ResolvedIncidentPlayback | null {
  let buf: AudioBuffer | null = null;
  let nextSoundIdx = lastCarDemoSoundIdx;
  const demoList = buffers.carDemo;
  if (Array.isArray(demoList) && demoList.length > 0) {
    let idx = Math.floor(Math.random() * demoList.length);
    if (demoList.length > 1 && idx === lastCarDemoSoundIdx) {
      idx = (idx + 1 + Math.floor(Math.random() * (demoList.length - 1))) % demoList.length;
    }
    nextSoundIdx = idx;
    buf = demoList[idx];
  } else {
    buf = buffers.carCollision;
  }
  if (!buf) return null;

  const master = audioConfig.get('masterVolume') ?? 1.0;
  const demoVol =
    audioConfig.get('carDemoVolume') ?? audioConfig.get('carCarCollisionVolume') ?? 1.0;
  const volume = Math.max(0, Math.min(5.0, demoVol * master));

  return {
    buffer: buf,
    nextSoundIdx,
    options: {
      volume,
      position: event,
      category: 'demolish',
      playbackRate: 1.0,
      priority: INCIDENT_SLOT_PRIORITY.DEMOLISH,
    },
  };
}

export function evaluateBoostPickupPlayback(
  event: PhysicsImpactAudioEvent,
  buffers: IncidentAudioBuffers,
  activeCarIndex: number
): ResolvedIncidentPlayback | null {
  if (!buffers.boostCollect) return null;

  const mod = calibrateBoostPickupModulation(event, activeCarIndex);
  const master = audioConfig.get('masterVolume') ?? 1.0;
  const boostVol =
    (audioConfig.get('boostCollectVolume') ?? 1.0) * (audioConfig.get('boostVolume') ?? 1.0);
  const selfMult = mod.isSelfPickup ? (audioConfig.get('vehicleSelfVolume') ?? 1.0) : 1.0;
  const finalVol = Math.max(
    0,
    Math.min(5.0, master * boostVol * selfMult * mod.volumeGainMultiplier)
  );

  const hasValidPadPosition =
    (Number.isFinite(event.x) && Number.isFinite(event.y) && Number.isFinite(event.z)) ||
    (Number.isFinite(event.posX) && Number.isFinite(event.posY) && Number.isFinite(event.posZ));

  return {
    buffer: buffers.boostCollect,
    options: {
      volume: finalVol,
      position: !mod.isSelfPickup && hasValidPadPosition ? event : null,
      category: mod.category,
      distanceRadiusScale: mod.distanceRadiusScale,
      playbackRate: mod.playbackRate,
      priority: mod.priority,
    },
  };
}

export function evaluateGoalScoredPlayback(
  event: PhysicsImpactAudioEvent,
  buffers: IncidentAudioBuffers
): ResolvedIncidentPlayback | null {
  if (!buffers.goalScored) return null;
  const master = audioConfig.get('masterVolume') ?? 1.0;
  const goalVol = audioConfig.get('goalScoredVolume') ?? 1.0;
  const volume = Math.max(0, Math.min(5.0, goalVol * master));

  return {
    buffer: buffers.goalScored,
    options: {
      volume,
      position: event,
      category: 'goal_explosion',
      priority: INCIDENT_SLOT_PRIORITY.GOAL_EXPLOSION,
    },
  };
}
