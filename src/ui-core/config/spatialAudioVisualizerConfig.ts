/**
 * spatialAudioVisualizerConfig.ts
 * Configuration, reactive pub/sub bridge, and live telemetry state for the
 * 3D In-Arena Spatial Audio Attenuation Visualizer & Distance Tuner.
 */

import { solveCubicBezier } from './spatialAudioConfig';
import { AUDIO_ATTENUATION_CATEGORIES } from './spatialAttenuationPresets';
import { getSpatialAttenuationProfile, type AudioAttenuationCategory, type SpatialAttenuationProfile } from './spatialAttenuationProfiles';
import {
  booleanOrDefault,
  clampNumberOrDefault,
  isPlainObject,
  stringOrDefault,
} from './storageHelpers';

export type SpatialAudioAnchorMode = 'emitter' | 'listener';

export type SpatialAudioEmitterTarget = 'ball' | 'bot_car' | 'local_car' | 'fixed_point';

export type SpatialAudioListenerTarget = 'camera' | 'local_car';

export interface SpatialAudioFixedPointUU {
  x: number;
  y: number;
  z: number;
}

export interface SpatialAudioVisualizerConfig {
  /** Master 3D Arena Visualization toggle */
  enabled: boolean;
  /** Currently selected category profile to visualize and tune */
  activeCategory: AudioAttenuationCategory;
  /** Sphere attachment mode: 'emitter' (spheres around sound source) or 'listener' (radar around listener) */
  anchorMode: SpatialAudioAnchorMode;
  /** Which sound source entity to anchor/measure against */
  emitterTarget: SpatialAudioEmitterTarget;
  /** Target vehicle slot index when emitterTarget === 'bot_car' (1..7) */
  targetCarIndex: number;
  /** Which listener entity to anchor/measure from ('camera' or 'local_car') */
  listenerTarget: SpatialAudioListenerTarget;
  /** Fixed probe point in Unreal Units when emitterTarget === 'fixed_point' */
  fixedPointUU: SpatialAudioFixedPointUU;
  /** Render Inner Full-Volume Sphere (R_min) + ground footprint ring */
  showInnerSphere: boolean;
  /** Render Outer Cutoff Sphere (R_max) + ground footprint ring */
  showOuterSphere: boolean;
  /** Render Half-Power 50% (-6 dB) Iso-Ring (R_0.5) + 25%/75% contour rings */
  showIsoRing50: boolean;
  /** Render dynamic Radial Attenuation Ruler & 3D billboard readout between Emitter and Listener */
  showRadialRuler: boolean;
  /** Enable depth testing against arena geometry */
  depthTest: boolean;
  /** Wireframe opacity multiplier [0.1 .. 1.0] */
  sphereOpacity: number;
}

export interface SpatialAudioVisualizerTelemetry {
  distanceUU: number;
  gain: number;
  gainDb: number;
  isCulled: boolean;
  isoRadius25UU: number;
  isoRadius50UU: number;
  isoRadius75UU: number;
  emitterPosUU: [number, number, number];
  listenerPosUU: [number, number, number];
}

const ALLOWED_ANCHOR_MODES: readonly SpatialAudioAnchorMode[] = Object.freeze([
  'emitter',
  'listener',
]);

const ALLOWED_EMITTER_TARGETS: readonly SpatialAudioEmitterTarget[] = Object.freeze([
  'ball',
  'bot_car',
  'local_car',
  'fixed_point',
]);

const ALLOWED_LISTENER_TARGETS: readonly SpatialAudioListenerTarget[] = Object.freeze([
  'camera',
  'local_car',
]);

export const DEFAULT_SPATIAL_AUDIO_VISUALIZER_CONFIG: Readonly<SpatialAudioVisualizerConfig> =
  Object.freeze({
    enabled: false,
    activeCategory: 'boost_other',
    anchorMode: 'emitter',
    emitterTarget: 'ball',
    targetCarIndex: 1,
    listenerTarget: 'camera',
    fixedPointUU: Object.freeze({ x: 0, y: 0, z: 93 }),
    showInnerSphere: true,
    showOuterSphere: true,
    showIsoRing50: true,
    showRadialRuler: true,
    depthTest: true,
    sphereOpacity: 0.55,
  });

export const DEFAULT_SPATIAL_AUDIO_VISUALIZER_TELEMETRY: Readonly<SpatialAudioVisualizerTelemetry> =
  Object.freeze({
    distanceUU: 1500,
    gain: 0.42,
    gainDb: -7.5,
    isCulled: false,
    isoRadius25UU: 2450,
    isoRadius50UU: 1640,
    isoRadius75UU: 920,
    emitterPosUU: [0, 0, 93] as [number, number, number],
    listenerPosUU: [0, -1500, 120] as [number, number, number],
  });

/**
 * Pure normalized curve evaluation at t in [0, 1] (shared between UI curve plots & 3D gizmos).
 */
export function evaluateAttenuationCurveAtNormalizedT(
  t: number,
  profile: Pick<SpatialAttenuationProfile, 'curveType' | 'curveExponent' | 'bezierPoints'>
): number {
  if (t <= 0) return 1.0;
  if (t >= 1) return 0.0;

  switch (profile.curveType) {
    case 'linear':
      return 1.0 - t;
    case 'smoothstep':
      return 1.0 - t * t * (3.0 - 2.0 * t);
    case 'power':
    case 'exponential': {
      const p =
        Number.isFinite(profile.curveExponent) && profile.curveExponent > 0
          ? profile.curveExponent
          : 1.0;
      return Math.pow(Math.max(0, 1.0 - t), p);
    }
    case 'custom-bezier':
    case 'bezier': {
      const bz = profile.bezierPoints || { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 };
      const y = solveCubicBezier(t, bz.x1, bz.y1, bz.x2, bz.y2);
      return Math.max(0, Math.min(1, 1.0 - y));
    }
    case 'inverse': {
      const k = 3.0;
      return Math.max(0, (1.0 / (1.0 + k * t) - 1.0 / (1.0 + k)) / (1.0 - 1.0 / (1.0 + k)));
    }
    default:
      return 1.0 - t * t * (3.0 - 2.0 * t);
  }
}

export function evaluateAttenuationProfileGain(
  distanceUU: number,
  profile: SpatialAttenuationProfile
): number {
  if (!Number.isFinite(distanceUU) || distanceUU <= profile.minDistanceUU) {
    return 1.0;
  }
  const minFloor = Math.max(0, Math.min(1, profile.minGainFloor));
  if (distanceUU >= profile.maxDistanceUU) {
    return profile.cullBeyondMax && minFloor <= 1e-5 ? 0.0 : minFloor;
  }
  const span = Math.max(1e-3, profile.maxDistanceUU - profile.minDistanceUU);
  const t = Math.max(0, Math.min(1, (distanceUU - profile.minDistanceUU) / span));
  const curveFactor = evaluateAttenuationCurveAtNormalizedT(t, profile);
  return minFloor + (1.0 - minFloor) * curveFactor;
}

export function solveAttenuationIsoRadiusUU(
  profile: SpatialAttenuationProfile,
  targetGain = 0.5
): number {
  if (targetGain >= 1.0) return profile.minDistanceUU;
  if (targetGain <= profile.minGainFloor) return profile.maxDistanceUU;

  let low = profile.minDistanceUU;
  let high = profile.maxDistanceUU;
  for (let i = 0; i < 16; i++) {
    const mid = 0.5 * (low + high);
    const g = evaluateAttenuationProfileGain(mid, profile);
    if (g > targetGain) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return 0.5 * (low + high);
}

const runtimeVisualizerConfig: SpatialAudioVisualizerConfig = {
  ...DEFAULT_SPATIAL_AUDIO_VISUALIZER_CONFIG,
  fixedPointUU: { ...DEFAULT_SPATIAL_AUDIO_VISUALIZER_CONFIG.fixedPointUU },
};

const runtimeVisualizerTelemetry: SpatialAudioVisualizerTelemetry = {
  ...DEFAULT_SPATIAL_AUDIO_VISUALIZER_TELEMETRY,
  emitterPosUU: [...DEFAULT_SPATIAL_AUDIO_VISUALIZER_TELEMETRY.emitterPosUU],
  listenerPosUU: [...DEFAULT_SPATIAL_AUDIO_VISUALIZER_TELEMETRY.listenerPosUU],
};

type VisualizerConfigListener = (cfg: SpatialAudioVisualizerConfig) => void;
type VisualizerTelemetryListener = (telemetry: SpatialAudioVisualizerTelemetry) => void;

const configCallbacks: VisualizerConfigListener[] = [];
const configAppliers: VisualizerConfigListener[] = [];
const telemetryCallbacks: VisualizerTelemetryListener[] = [];

export function sanitizeSpatialAudioVisualizerConfig(
  raw: unknown,
  fallback: SpatialAudioVisualizerConfig = DEFAULT_SPATIAL_AUDIO_VISUALIZER_CONFIG
): SpatialAudioVisualizerConfig {
  const src = isPlainObject(raw) ? raw : {};
  const rawFp = isPlainObject(src.fixedPointUU) ? src.fixedPointUU : {};
  return {
    enabled: booleanOrDefault(src.enabled, fallback.enabled),
    activeCategory: stringOrDefault(
      src.activeCategory,
      AUDIO_ATTENUATION_CATEGORIES,
      fallback.activeCategory
    ) as AudioAttenuationCategory,
    anchorMode: stringOrDefault(
      src.anchorMode,
      ALLOWED_ANCHOR_MODES,
      fallback.anchorMode
    ) as SpatialAudioAnchorMode,
    emitterTarget: stringOrDefault(
      src.emitterTarget,
      ALLOWED_EMITTER_TARGETS,
      fallback.emitterTarget
    ) as SpatialAudioEmitterTarget,
    targetCarIndex: clampNumberOrDefault(src.targetCarIndex, fallback.targetCarIndex, {
      min: 0,
      max: 7,
      integer: true,
    }),
    listenerTarget: stringOrDefault(
      src.listenerTarget,
      ALLOWED_LISTENER_TARGETS,
      fallback.listenerTarget
    ) as SpatialAudioListenerTarget,
    fixedPointUU: {
      x: clampNumberOrDefault(rawFp.x, fallback.fixedPointUU.x, { min: -4096, max: 4096 }),
      y: clampNumberOrDefault(rawFp.y, fallback.fixedPointUU.y, { min: -5120, max: 5120 }),
      z: clampNumberOrDefault(rawFp.z, fallback.fixedPointUU.z, { min: 0, max: 2044 }),
    },
    showInnerSphere: booleanOrDefault(src.showInnerSphere, fallback.showInnerSphere),
    showOuterSphere: booleanOrDefault(src.showOuterSphere, fallback.showOuterSphere),
    showIsoRing50: booleanOrDefault(src.showIsoRing50, fallback.showIsoRing50),
    showRadialRuler: booleanOrDefault(src.showRadialRuler, fallback.showRadialRuler),
    depthTest: booleanOrDefault(src.depthTest, fallback.depthTest),
    sphereOpacity: clampNumberOrDefault(src.sphereOpacity, fallback.sphereOpacity, {
      min: 0.1,
      max: 1.0,
    }),
  };
}

export function getSpatialAudioVisualizerConfig(): SpatialAudioVisualizerConfig {
  return {
    ...runtimeVisualizerConfig,
    fixedPointUU: { ...runtimeVisualizerConfig.fixedPointUU },
  };
}

function notifyConfigChanged(): SpatialAudioVisualizerConfig {
  const snapshot = getSpatialAudioVisualizerConfig();
  for (const applier of configAppliers) {
    try {
      applier(snapshot);
    } catch {
      // ignore applier error
    }
  }
  for (const listener of configCallbacks) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener error
    }
  }
  return snapshot;
}

export function updateSpatialAudioVisualizerConfig(
  patch: Partial<SpatialAudioVisualizerConfig>
): SpatialAudioVisualizerConfig {
  if (!patch || typeof patch !== 'object') return getSpatialAudioVisualizerConfig();
  const merged = {
    ...runtimeVisualizerConfig,
    ...patch,
    fixedPointUU: {
      ...runtimeVisualizerConfig.fixedPointUU,
      ...(patch.fixedPointUU || {}),
    },
  };
  const clean = sanitizeSpatialAudioVisualizerConfig(merged, runtimeVisualizerConfig);
  Object.assign(runtimeVisualizerConfig, clean);
  return notifyConfigChanged();
}

export function resetSpatialAudioVisualizerConfig(): SpatialAudioVisualizerConfig {
  Object.assign(runtimeVisualizerConfig, {
    ...DEFAULT_SPATIAL_AUDIO_VISUALIZER_CONFIG,
    fixedPointUU: { ...DEFAULT_SPATIAL_AUDIO_VISUALIZER_CONFIG.fixedPointUU },
  });
  return notifyConfigChanged();
}

export function subscribeSpatialAudioVisualizerConfig(cb: VisualizerConfigListener): () => void {
  if (!configCallbacks.includes(cb)) {
    configCallbacks.push(cb);
  }
  return () => {
    const idx = configCallbacks.indexOf(cb);
    if (idx !== -1) configCallbacks.splice(idx, 1);
  };
}

export function registerSpatialAudioVisualizerApplier(
  applier: VisualizerConfigListener
): () => void {
  if (!configAppliers.includes(applier)) {
    configAppliers.push(applier);
  }
  return () => {
    const idx = configAppliers.indexOf(applier);
    if (idx !== -1) configAppliers.splice(idx, 1);
  };
}

export function getSpatialAudioVisualizerTelemetry(): SpatialAudioVisualizerTelemetry {
  const profile = getSpatialAttenuationProfile(runtimeVisualizerConfig.activeCategory);
  return {
    ...runtimeVisualizerTelemetry,
    isoRadius25UU: solveAttenuationIsoRadiusUU(profile, 0.25),
    isoRadius50UU: solveAttenuationIsoRadiusUU(profile, 0.5),
    isoRadius75UU: solveAttenuationIsoRadiusUU(profile, 0.75),
    emitterPosUU: [...runtimeVisualizerTelemetry.emitterPosUU],
    listenerPosUU: [...runtimeVisualizerTelemetry.listenerPosUU],
  };
}

export function publishSpatialAudioVisualizerTelemetry(
  patch: Partial<SpatialAudioVisualizerTelemetry>
): void {
  Object.assign(runtimeVisualizerTelemetry, patch);
  if (patch.emitterPosUU) {
    runtimeVisualizerTelemetry.emitterPosUU = [...patch.emitterPosUU];
  }
  if (patch.listenerPosUU) {
    runtimeVisualizerTelemetry.listenerPosUU = [...patch.listenerPosUU];
  }
  const snapshot = getSpatialAudioVisualizerTelemetry();
  for (const listener of telemetryCallbacks) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener error
    }
  }
}

export function subscribeSpatialAudioVisualizerTelemetry(
  cb: VisualizerTelemetryListener
): () => void {
  if (!telemetryCallbacks.includes(cb)) {
    telemetryCallbacks.push(cb);
  }
  return () => {
    const idx = telemetryCallbacks.indexOf(cb);
    if (idx !== -1) telemetryCallbacks.splice(idx, 1);
  };
}
