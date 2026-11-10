/**
 * SpatialAttenuationEvaluator.ts
 * Pure non-linear spatial distance attenuation evaluator and iso-contour radius solver.
 *
 * Evaluates category-specific SpatialAttenuationProfiles using linear, smoothstep, power/exponential,
 * inverse, or cubic-bezier curves, and supports inverse radius solving (e.g. 50% / -6dB iso-ring)
 * for 3D in-arena visualization.
 */

import { solveCubicBezier } from '../ui-core/config/spatialAudioConfig.ts';
import {
  getSpatialAttenuationProfile,
  type AudioAttenuationCategory,
  type SpatialAttenuationProfile,
} from '../ui-core/config/spatialAttenuationProfiles.ts';

/**
 * Evaluates normalized rolloff factor in [0, 1] at normalized distance `t` in [0, 1],
 * where t = 0 is at `minDistanceUU` (factor = 1.0) and t = 1 is at `maxDistanceUU` (factor = 0.0).
 */
export function evaluateNormalizedAttenuationCurve(
  t: number,
  profile: Pick<SpatialAttenuationProfile, 'curveType' | 'curveExponent' | 'bezierPoints'>
): number {
  if (t <= 0) return 1.0;
  if (t >= 1) return 0.0;

  const { curveType, curveExponent, bezierPoints } = profile;

  switch (curveType) {
    case 'linear':
      return 1.0 - t;

    case 'smoothstep':
      return 1.0 - t * t * (3.0 - 2.0 * t);

    case 'power':
    case 'exponential': {
      const p = Number.isFinite(curveExponent) && curveExponent > 0 ? curveExponent : 1.0;
      return Math.pow(Math.max(0, 1.0 - t), p);
    }

    case 'custom-bezier':
    case 'bezier': {
      const bz = bezierPoints || { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 };
      const y = solveCubicBezier(t, bz.x1, bz.y1, bz.x2, bz.y2);
      return Math.max(0, Math.min(1, 1.0 - y));
    }

    case 'inverse': {
      // Normalized hyperbolic rolloff that reaches 0 at t = 1
      const k = 3.0;
      return Math.max(0, (1.0 / (1.0 + k * t) - 1.0 / (1.0 + k)) / (1.0 - 1.0 / (1.0 + k)));
    }

    default:
      return 1.0 - t * t * (3.0 - 2.0 * t);
  }
}

let _arenaAcousticScale = 1.0;

export function setArenaAcousticScale(scale: number): void {
  if (Number.isFinite(scale) && scale > 0) {
    _arenaAcousticScale = Math.max(0.25, Math.min(4.0, scale));
  }
}

export function getArenaAcousticScale(): number {
  return _arenaAcousticScale;
}

/**
 * Evaluates the distance attenuation gain [0.0 .. 1.0] for a given distance in Unreal Units
 * using an explicit SpatialAttenuationProfile and an optional dynamic radius scale factor.
 * When `distanceRadiusScale > 1`, the sound propagates farther (effective distance is divided by scale).
 */
export function evaluateProfileDistanceGain(
  distanceUU: number,
  profile: SpatialAttenuationProfile,
  distanceRadiusScale = 1.0
): number {
  const minDist = profile.minDistanceUU * _arenaAcousticScale;
  const maxDist = profile.maxDistanceUU * _arenaAcousticScale;
  const scale =
    Number.isFinite(distanceRadiusScale) && distanceRadiusScale > 0
      ? Math.max(0.25, Math.min(3.0, distanceRadiusScale))
      : 1.0;
  const effectiveDistanceUU = distanceUU / scale;

  if (!Number.isFinite(effectiveDistanceUU) || effectiveDistanceUU <= minDist) {
    return 1.0;
  }

  const minFloor = Math.max(0, Math.min(1, profile.minGainFloor));
  if (effectiveDistanceUU >= maxDist) {
    return profile.cullBeyondMax && minFloor <= 1e-5 ? 0.0 : minFloor;
  }

  const span = Math.max(1e-3, maxDist - minDist);
  const t = Math.max(0, Math.min(1, (effectiveDistanceUU - minDist) / span));
  const curveFactor = evaluateNormalizedAttenuationCurve(t, profile);

  return minFloor + (1.0 - minFloor) * curveFactor;
}

/**
 * Evaluates the distance attenuation gain [0.0 .. 1.0] for a given distance in Unreal Units
 * and an AudioAttenuationCategory (or profile object).
 */
export function evaluateCategoryDistanceGain(
  distanceUU: number,
  categoryOrProfile:
    AudioAttenuationCategory | SpatialAttenuationProfile | string | null | undefined,
  distanceRadiusScale = 1.0
): number {
  const profile =
    typeof categoryOrProfile === 'object' && categoryOrProfile !== null
      ? categoryOrProfile
      : getSpatialAttenuationProfile(categoryOrProfile);
  return evaluateProfileDistanceGain(distanceUU, profile, distanceRadiusScale);
}

/**
 * Checks whether a 3D emitter at `distanceUU` should be hard-culled (completely silent / skipped)
 * under the given category or profile and optional radius scale factor.
 */
export function isDistanceCulled(
  distanceUU: number,
  categoryOrProfile:
    AudioAttenuationCategory | SpatialAttenuationProfile | string | null | undefined,
  distanceRadiusScale = 1.0
): boolean {
  if (!Number.isFinite(distanceUU)) return false;
  const scale =
    Number.isFinite(distanceRadiusScale) && distanceRadiusScale > 0
      ? Math.max(0.25, Math.min(3.0, distanceRadiusScale))
      : 1.0;
  const effectiveDistanceUU = distanceUU / scale;
  const profile =
    typeof categoryOrProfile === 'object' && categoryOrProfile !== null
      ? categoryOrProfile
      : getSpatialAttenuationProfile(categoryOrProfile);
  const maxDist = profile.maxDistanceUU * _arenaAcousticScale;
  return profile.cullBeyondMax && profile.minGainFloor <= 1e-5 && effectiveDistanceUU >= maxDist;
}

/**
 * Solves the exact radius in Unreal Units where the profile's gain equals `targetGain` (e.g. 0.5 for -6dB iso-ring)
 * using binary search over the monotonic attenuation curve.
 */
export function solveIsoGainRadiusUU(profile: SpatialAttenuationProfile, targetGain = 0.5): number {
  const minDist = profile.minDistanceUU * _arenaAcousticScale;
  const maxDist = profile.maxDistanceUU * _arenaAcousticScale;
  if (targetGain >= 1.0) return minDist;
  if (targetGain <= profile.minGainFloor) return maxDist;

  let low = minDist;
  let high = maxDist;
  for (let i = 0; i < 16; i++) {
    const mid = 0.5 * (low + high);
    const g = evaluateProfileDistanceGain(mid, profile);
    if (g > targetGain) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return 0.5 * (low + high);
}

export class SpatialAttenuationEvaluator {
  evaluateGain(
    distanceUU: number,
    categoryOrProfile?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
    distanceRadiusScale = 1.0
  ): number {
    return evaluateCategoryDistanceGain(distanceUU, categoryOrProfile, distanceRadiusScale);
  }

  isCulled(
    distanceUU: number,
    categoryOrProfile?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
    distanceRadiusScale = 1.0
  ): boolean {
    return isDistanceCulled(distanceUU, categoryOrProfile, distanceRadiusScale);
  }

  getIsoRadiusUU(
    categoryOrProfile: AudioAttenuationCategory | SpatialAttenuationProfile | string,
    targetGain = 0.5
  ): number {
    const profile =
      typeof categoryOrProfile === 'object' && categoryOrProfile !== null
        ? categoryOrProfile
        : getSpatialAttenuationProfile(categoryOrProfile);
    return solveIsoGainRadiusUU(profile, targetGain);
  }
}

export const spatialAttenuationEvaluator = new SpatialAttenuationEvaluator();
