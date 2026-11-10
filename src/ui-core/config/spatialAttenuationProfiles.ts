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
