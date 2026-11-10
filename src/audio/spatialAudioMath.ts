import {
  evaluateCategoryDistanceGain,
  setArenaAcousticScale,
} from './SpatialAttenuationEvaluator.ts';
import type {
  AudioAttenuationCategory,
  SpatialAttenuationProfile,
} from '../ui-core/config/spatialAttenuationProfiles.ts';

export type { AudioAttenuationCategory, SpatialAttenuationProfile };

export const UU_TO_METERS = 0.01;

export interface SpatialConfigPatch {
  spatialAudio?: boolean;
  arenaAcousticScale?: number;
  distanceUnitScale?: number;
  rolloffMinDistance?: number;
  rolloffMaxDistance?: number;
  minAudibleGainFloor?: number;
  spatialPanningModel?: PanningModelType | string;
  distanceModel?: string;
}

export interface SpatialVector3Like {
  x: number;
  y: number;
  z: number;
}

export interface SpatialPositionInput {
  isVector3?: boolean;
  isAudioCoords?: boolean;
  x?: number;
  y?: number;
  z?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
}

export const SPATIAL_CONFIG = {
  spatialAudio: true,
  arenaAcousticScale: 1.0,
  distanceUnitScale: 0.01,
  minDistance: 500,
  maxDistance: 9000,
  minGainFloor: 0.05,
  panningModel: 'equalpower' as PanningModelType, // 'equalpower' | 'HRTF'
  distanceModel: 'smoothstep', // 'smoothstep' | 'inverse' | 'linear' | 'exponential'
  rolloffFactor: 1.0,
  rampTime: 0.025,
};

export function getUuToMeters(): number {
  return SPATIAL_CONFIG.distanceUnitScale;
}

export function applySpatialConfigPatch(
  patch: SpatialConfigPatch | null | undefined,
  onPanningModelChange: ((model: PanningModelType) => void) | null = null
): void {
  if (!patch || typeof patch !== 'object') return;
  if (typeof patch.spatialAudio === 'boolean') {
    SPATIAL_CONFIG.spatialAudio = patch.spatialAudio;
  }
  if (Number.isFinite(patch.arenaAcousticScale) && (patch.arenaAcousticScale as number) > 0) {
    SPATIAL_CONFIG.arenaAcousticScale = patch.arenaAcousticScale as number;
    setArenaAcousticScale(SPATIAL_CONFIG.arenaAcousticScale);
  }
  if (Number.isFinite(patch.distanceUnitScale) && (patch.distanceUnitScale as number) > 0) {
    SPATIAL_CONFIG.distanceUnitScale = patch.distanceUnitScale as number;
  }
  if (Number.isFinite(patch.rolloffMinDistance) && (patch.rolloffMinDistance as number) >= 0) {
    SPATIAL_CONFIG.minDistance = patch.rolloffMinDistance as number;
  }
  if (
    Number.isFinite(patch.rolloffMaxDistance) &&
    (patch.rolloffMaxDistance as number) > SPATIAL_CONFIG.minDistance
  ) {
    SPATIAL_CONFIG.maxDistance = patch.rolloffMaxDistance as number;
  }
  if (Number.isFinite(patch.minAudibleGainFloor) && (patch.minAudibleGainFloor as number) >= 0) {
    SPATIAL_CONFIG.minGainFloor = Math.max(0, Math.min(1.0, patch.minAudibleGainFloor as number));
  }
  if (patch.spatialPanningModel === 'equalpower' || patch.spatialPanningModel === 'HRTF') {
    SPATIAL_CONFIG.panningModel = patch.spatialPanningModel;
    if (typeof onPanningModelChange === 'function') {
      onPanningModelChange(
        SPATIAL_CONFIG.spatialAudio ? SPATIAL_CONFIG.panningModel : 'equalpower'
      );
    }
  } else if (
    typeof patch.spatialAudio === 'boolean' &&
    typeof onPanningModelChange === 'function'
  ) {
    onPanningModelChange(SPATIAL_CONFIG.spatialAudio ? SPATIAL_CONFIG.panningModel : 'equalpower');
  }
  if (typeof patch.distanceModel === 'string') {
    SPATIAL_CONFIG.distanceModel = patch.distanceModel;
  }
}

export const SPATIAL_AUDIO_CONFIG = {
  get MIN_DISTANCE() {
    return SPATIAL_CONFIG.minDistance;
  },
  get MAX_DISTANCE() {
    return SPATIAL_CONFIG.maxDistance;
  },
  get MAX_GAIN() {
    return 1.0;
  },
  get RAMP_TIME() {
    return SPATIAL_CONFIG.rampTime;
  },
};

export const INCIDENT_SPATIAL_CONFIG = {
  get MIN_DISTANCE() {
    return SPATIAL_CONFIG.minDistance;
  },
  get MAX_DISTANCE() {
    return SPATIAL_CONFIG.maxDistance;
  },
  get MIN_GAIN() {
    return SPATIAL_CONFIG.minGainFloor;
  },
};

/**
 * Calculates distance gain attenuation for discrete physics incidents and 3D emitters across RocketSim arena.
 * Routes to category-specific SpatialAttenuationProfiles when a category or profile is provided,
 * or falls back to the primary gameplay profile ('car_ball_hit').
 */
export function calculateIncidentDistanceGain(
  distance: number,
  category?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
  distanceRadiusScale = 1.0
): number {
  if (!Number.isFinite(distance)) return 1.0;
  if (category) {
    return evaluateCategoryDistanceGain(distance, category, distanceRadiusScale);
  }
  return evaluateCategoryDistanceGain(distance, 'car_ball_hit', distanceRadiusScale);
}

/**
 * Coordinate mapping: RocketSim Unreal Units (X: width, Y: length, Z: up)
 * -> Three.js & Web Audio API (X: width, Y: up, Z: length)
 */
export function toAudioCoordinates(
  out: SpatialVector3Like,
  pos: SpatialPositionInput | null | undefined
): SpatialVector3Like | null {
  if (!pos) return null;
  if (pos.isVector3 || pos.isAudioCoords) {
    out.x = pos.x ?? 0;
    out.y = pos.y ?? 0;
    out.z = pos.z ?? 0;
    return out;
  }
  if (Number.isFinite(pos.posX) && Number.isFinite(pos.posY) && Number.isFinite(pos.posZ)) {
    out.x = pos.posX as number;
    out.y = pos.posZ as number;
    out.z = pos.posY as number;
    return out;
  }
  if (Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
    out.x = pos.x as number;
    out.y = pos.z as number;
    out.z = pos.y as number;
    return out;
  }
  return null;
}

export function calculateDistanceGain(
  distance: number,
  category?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
  distanceRadiusScale = 1.0
): number {
  if (!Number.isFinite(distance)) return 0;
  return calculateIncidentDistanceGain(distance, category ?? 'engine_other', distanceRadiusScale);
}
