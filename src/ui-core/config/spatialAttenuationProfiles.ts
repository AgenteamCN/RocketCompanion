/**
 * spatialAttenuationProfiles.ts
 * Acoustic Attenuation Profile Sanitization, Cloning, and Registry Helpers.
 */

import {
  STORAGE_KEYS,
  safeStorage,
  isPlainObject,
  clampNumberOrDefault,
  booleanOrDefault,
  stringOrDefault,
} from './storageHelpers';
import { ALLOWED_CURVE_TYPES, AUDIO_ATTENUATION_CATEGORIES, DEFAULT_SPATIAL_ATTENUATION_PROFILES, type AttenuationArchetypeId, type AttenuationBezierPoints, type AttenuationCurveType, type AudioAttenuationCategory, type SpatialAttenuationProfile, type SpatialAttenuationProfileMap } from './spatialAttenuationPresets';

export type { AttenuationArchetypeId, AttenuationBezierPoints, AttenuationCurveType, AudioAttenuationCategory, SpatialAttenuationProfile, SpatialAttenuationProfileMap };

export function sanitizeSpatialAttenuationProfile(
  raw: unknown,
  fallback: SpatialAttenuationProfile
): SpatialAttenuationProfile {
  const src = isPlainObject(raw) ? raw : {};
  const minDistanceUU = clampNumberOrDefault(src.minDistanceUU, fallback.minDistanceUU, {
    min: 0,
    max: 15000,
  });
  const maxDistanceUU = clampNumberOrDefault(src.maxDistanceUU, fallback.maxDistanceUU, {
    min: Math.max(50, minDistanceUU + 50),
    max: 25000,
  });
  const minGainFloor = clampNumberOrDefault(src.minGainFloor, fallback.minGainFloor, {
    min: 0.0,
    max: 1.0,
  });
  const curveType = stringOrDefault(
    src.curveType,
    ALLOWED_CURVE_TYPES,
    fallback.curveType
  ) as AttenuationCurveType;
  const curveExponent = clampNumberOrDefault(src.curveExponent, fallback.curveExponent, {
    min: 0.2,
    max: 5.0,
  });

  const rawBz = isPlainObject(src.bezierPoints) ? src.bezierPoints : {};
  const bezierPoints: AttenuationBezierPoints = {
    x1: clampNumberOrDefault(rawBz.x1, fallback.bezierPoints.x1, { min: 0.01, max: 0.99 }),
    y1: clampNumberOrDefault(rawBz.y1, fallback.bezierPoints.y1, { min: 0.0, max: 1.0 }),
    x2: clampNumberOrDefault(rawBz.x2, fallback.bezierPoints.x2, { min: 0.01, max: 0.99 }),
    y2: clampNumberOrDefault(rawBz.y2, fallback.bezierPoints.y2, { min: 0.0, max: 1.0 }),
  };

  const cullBeyondMax = booleanOrDefault(src.cullBeyondMax, fallback.cullBeyondMax);
  const innerSpread = clampNumberOrDefault(src.innerSpread, fallback.innerSpread, {
    min: 0.0,
    max: 1.0,
  });

  return {
    id: fallback.id,
    label: fallback.label,
    archetype: fallback.archetype,
    minDistanceUU,
    maxDistanceUU,
    minGainFloor,
    curveType,
    curveExponent,
    bezierPoints,
    cullBeyondMax,
    innerSpread,
  };
}

export function cloneDefaultSpatialAttenuationProfiles(): SpatialAttenuationProfileMap {
  const out = {} as SpatialAttenuationProfileMap;
  for (const cat of AUDIO_ATTENUATION_CATEGORIES) {
    const def = DEFAULT_SPATIAL_ATTENUATION_PROFILES[cat];
    out[cat] = {
      ...def,
      bezierPoints: { ...def.bezierPoints },
    };
  }
  return out;
}

export type SpatialAttenuationProfilesSubscriber = (profiles: SpatialAttenuationProfileMap) => void;

class SpatialAttenuationProfileRegistry {
  profiles: SpatialAttenuationProfileMap;
  onChangeHandlers: SpatialAttenuationProfilesSubscriber[];

  constructor() {
    this.profiles = cloneDefaultSpatialAttenuationProfiles();
    this.onChangeHandlers = [];
    this.load();
  }

  load(): void {
    const raw = safeStorage.get(STORAGE_KEYS.SPATIAL_ATTENUATION_PROFILES);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) return;
      for (const cat of AUDIO_ATTENUATION_CATEGORIES) {
        if (parsed[cat] !== undefined) {
          this.profiles[cat] = sanitizeSpatialAttenuationProfile(
            parsed[cat],
            DEFAULT_SPATIAL_ATTENUATION_PROFILES[cat]
          );
        }
      }
    } catch (e) {
      console.warn('[SpatialAttenuationProfileRegistry] Failed to load stored profiles:', e);
    }
  }

  save(): void {
    safeStorage.set(STORAGE_KEYS.SPATIAL_ATTENUATION_PROFILES, JSON.stringify(this.profiles));
    this.notify();
  }

  getProfile(category: AudioAttenuationCategory | string | null | undefined): SpatialAttenuationProfile {
    if (category && category in this.profiles) {
      return this.profiles[category as AudioAttenuationCategory];
    }
    return this.profiles.car_ball_hit;
  }

  updateProfile(
    category: AudioAttenuationCategory,
    patch: Partial<SpatialAttenuationProfile>
  ): SpatialAttenuationProfile {
    const current = this.getProfile(category);
    const merged = {
      ...current,
      ...patch,
      bezierPoints: {
        ...current.bezierPoints,
        ...(patch.bezierPoints || {}),
      },
    };
    const sanitized = sanitizeSpatialAttenuationProfile(
      merged,
      DEFAULT_SPATIAL_ATTENUATION_PROFILES[category]
    );
    this.profiles[category] = sanitized;
    this.save();
    return sanitized;
  }

  resetProfile(category: AudioAttenuationCategory): SpatialAttenuationProfile {
    const def = DEFAULT_SPATIAL_ATTENUATION_PROFILES[category];
    this.profiles[category] = {
      ...def,
      bezierPoints: { ...def.bezierPoints },
    };
    this.save();
    return this.profiles[category];
  }

  resetAll(): SpatialAttenuationProfileMap {
    this.profiles = cloneDefaultSpatialAttenuationProfiles();
    safeStorage.remove(STORAGE_KEYS.SPATIAL_ATTENUATION_PROFILES);
    this.notify();
    return this.profiles;
  }

  subscribe(cb: SpatialAttenuationProfilesSubscriber): () => boolean {
    if (!this.onChangeHandlers.includes(cb)) {
      this.onChangeHandlers.push(cb);
    }
    return () => {
      const idx = this.onChangeHandlers.indexOf(cb);
      if (idx >= 0) {
        this.onChangeHandlers.splice(idx, 1);
        return true;
      }
      return false;
    };
  }

  notify(): void {
    for (const handler of this.onChangeHandlers) {
      try {
        handler(this.profiles);
      } catch (e) {
        console.error('[SpatialAttenuationProfileRegistry] Subscriber error:', e);
      }
    }
  }

  exportJson(): string {
    return JSON.stringify(this.profiles, null, 2);
  }

  importJson(jsonOrObj: string | Record<string, unknown>): boolean {
    try {
      const parsed = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : jsonOrObj;
      if (!isPlainObject(parsed)) return false;
      for (const cat of AUDIO_ATTENUATION_CATEGORIES) {
        if (parsed[cat] !== undefined) {
          this.profiles[cat] = sanitizeSpatialAttenuationProfile(
            parsed[cat],
            DEFAULT_SPATIAL_ATTENUATION_PROFILES[cat]
          );
        }
      }
      this.save();
      return true;
    } catch (e) {
      console.error('[SpatialAttenuationProfileRegistry] Failed to import JSON:', e);
      return false;
    }
  }
}

export const spatialAttenuationProfiles = new SpatialAttenuationProfileRegistry();

export function getSpatialAttenuationProfile(
  category: AudioAttenuationCategory | string | null | undefined
): SpatialAttenuationProfile {
  return spatialAttenuationProfiles.getProfile(category);
}

export type SpatialAudioOverrideMode = 'auto' | 'normal' | 'spatial' | 'manual';

export interface SpatialAudioTunerConfig {
  transitionDurationSec: number;
  bgmFadeDurationSec: number;
  hpfMaxFreq: number;
  lpfMinFreq: number;
  wetMaxPct: number;
  decaySec: number;
  wetBoost: number;
  bzX1: number;
  bzY1: number;
  bzX2: number;
  bzY2: number;
  overrideMode: SpatialAudioOverrideMode;
  manualBlend: number;
  muteSignalAudioInGoalReplay: boolean;
}

export const DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG: SpatialAudioTunerConfig = Object.freeze({
  transitionDurationSec: 2.0,
  bgmFadeDurationSec: 2.0,
  hpfMaxFreq: 425,
  lpfMinFreq: 3500,
  wetMaxPct: 69,
  decaySec: 3.0,
  wetBoost: 1.35,
  bzX1: 0.22,
  bzY1: 1.0,
  bzX2: 1.0,
  bzY2: 1.0,
  overrideMode: 'auto',
  manualBlend: 0,
  muteSignalAudioInGoalReplay: true,
});

export interface BgmSceneConfig {
  freePlay: boolean;
  singlePlayerTraining: boolean;
  multiplayerTraining: boolean;
  match: boolean;
}

export const DEFAULT_BGM_SCENE_CONFIG: BgmSceneConfig = Object.freeze({
  freePlay: true,
  singlePlayerTraining: true,
  multiplayerTraining: false,
  match: false,
});

/**
 * Solves a 1D Cubic-Bezier curve y(x) for x in [0, 1] with control points P1=(x1,y1), P2=(x2,y2).
 */
export function solveCubicBezier(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const cx = 3.0 * x1;
  const bx = 3.0 * (x2 - x1) - cx;
  const ax = 1.0 - cx - bx;

  const cy = 3.0 * y1;
  const by = 3.0 * (y2 - y1) - cy;
  const ay = 1.0 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleCurveDerivativeX = (t: number) => (3.0 * ax * t + 2.0 * bx) * t + cx;

  let t2 = x;
  for (let i = 0; i < 8; i++) {
    const xEst = sampleCurveX(t2) - x;
    if (Math.abs(xEst) < 1e-6) break;
    const d2 = sampleCurveDerivativeX(t2);
    if (Math.abs(d2) < 1e-6) break;
    t2 = t2 - xEst / d2;
  }

  if (t2 < 0 || t2 > 1 || Number.isNaN(t2)) {
    let t0 = 0.0;
    let t1 = 1.0;
    t2 = x;
    for (let i = 0; i < 12; i++) {
      const xEst = sampleCurveX(t2);
      if (Math.abs(xEst - x) < 1e-6) break;
      if (x > xEst) t0 = t2;
      else t1 = t2;
      t2 = 0.5 * (t1 - t0) + t0;
    }
  }

  return Math.max(0, Math.min(1, sampleCurveY(t2)));
}

