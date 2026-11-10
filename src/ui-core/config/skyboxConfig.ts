/**
 * skyboxConfig.ts
 * Pure skybox defaults, normalization, and runtime configuration state.
 */

import { type SkyboxCategory, type SkyboxPresetSpec, HEMISPHERE_SKYBOX_PRESETS, FULL_SPHERE_SKYBOX_PRESETS, SKYBOX_PRESETS } from './skyboxPresets';

export type { SkyboxCategory, SkyboxPresetSpec };

export const SKYBOX_TEXTURE_PATH = '/assets/arena/Woods_Sky_D.webp';
export const CORONA_TEXTURE_PATH = '/assets/arena/skyboxes/Corona_Sun01_D.webp';
export const SUN_GLOW_TEXTURE_PATH = '/assets/arena/skyboxes/Sun_Glow_001_D.webp';
export const CLOUD_OVERLAY_TEXTURE_PATH = '/assets/arena/skyboxes/ForbiddenTemple_Beach_Clouds_01.webp';
export const OOB_NORMAL_TEXTURE_PATH = '/assets/arena/skyboxes/OOB_PlanetClouds_N3.png';

export function resolveSkyboxPreset(
  presetIdOrPath: string | null | undefined,
  preferredCategory: SkyboxCategory | string | null = null
): SkyboxPresetSpec {
  if (presetIdOrPath) {
    const found = SKYBOX_PRESETS.find(
      (p) => p.id === presetIdOrPath || p.path === presetIdOrPath
    );
    if (found) return found;
  }
  if (preferredCategory === 'full-sphere') {
    return FULL_SPHERE_SKYBOX_PRESETS[3] || FULL_SPHERE_SKYBOX_PRESETS[0];
  }
  return HEMISPHERE_SKYBOX_PRESETS[4] || HEMISPHERE_SKYBOX_PRESETS[0];
}

export interface SkyboxConfig {
  enabled: boolean;
  skyCategory: SkyboxCategory | string;
  presetId: string;
  hemispherePresetId: string;
  fullSpherePresetId: string;
  texturePath: string;
  mode: string;
  useTexture: boolean;
  textureScaleU: number;
  rotationDeg: number;
  textureRotationDeg: number;
  exposure: number;
  textureExposure: number;
  upperVerticalStretch: number;
  contrastBalance: number;
  contrastMidpoint: number;
  horizonOffset: number;
  horizonBlendWidth: number;
  horizonColor: string;
  horizonHazeStrength: number;
  groundSampleHorizon: boolean;
  groundGradientRange: number;
  groundHorizonStrength: number;
  groundColor: string;
  zenithColor: string;
  middleColor: string;
  fullSphereLowerVOffset: number;
  fullSphereLowerVerticalStretch: number;
  fullSphereLowerCutoffElev: number;
  fullSphereLowerFadeRange: number;
  fullSphereLowerDimming: number;
  fullSphereLowerSampleHorizon: boolean;
  coronaEnabled: boolean;
  coronaFollowSceneSun: boolean;
  coronaAzimuthDeg: number;
  coronaElevationDeg: number;
  coronaSize: number;
  coronaIntensity: number;
  coronaRotationDeg: number;
  sunGlowSize: number;
  sunGlowIntensity: number;
  sunGlowColor: string;
  cloudOverlayEnabled: boolean;
  cloudOverlayOpacity: number;
  cloudOverlayScrollSpeed: number;
  cloudOverlayScaleU: number;
  cloudOverlayElevationOffset: number;
  oobNormalEnabled: boolean;
  oobNormalStrength: number;
  oobNormalTileScale: number;
  oobNormalScrollSpeed: number;
  [key: string]: unknown;
}

export const DEFAULT_SKYBOX_CONFIG: SkyboxConfig = {
  enabled: true,
  skyCategory: 'full-sphere',
  presetId: 'sbs-cloudy-10',
  hemispherePresetId: 'forbidden-temple-clouds',
  fullSpherePresetId: 'sbs-cloudy-10',
  texturePath: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_10.webp',
  mode: 'texture',
  useTexture: true,
  textureScaleU: 1,
  rotationDeg: 80,
  textureRotationDeg: 80,
  exposure: 0.65,
  textureExposure: 0.65,
  upperVerticalStretch: 1,
  contrastBalance: 0,
  contrastMidpoint: 0.15,
  horizonOffset: 0,
  horizonBlendWidth: 0.03,
  horizonColor: '#1a202c',
  horizonHazeStrength: 0,
  groundSampleHorizon: true,
  groundGradientRange: 0.95,
  groundHorizonStrength: 0.8,
  groundColor: '#585858',
  zenithColor: '#0c220d',
  middleColor: '#476649',
  fullSphereLowerVOffset: 0.04,
  fullSphereLowerVerticalStretch: 1.0,
  fullSphereLowerCutoffElev: 0.18,
  fullSphereLowerFadeRange: 0.45,
  fullSphereLowerDimming: 0.25,
  fullSphereLowerSampleHorizon: false,
  coronaEnabled: false,
  coronaFollowSceneSun: false,
  coronaAzimuthDeg: 0,
  coronaElevationDeg: 3.5,
  coronaSize: 0.16,
  coronaIntensity: 1.25,
  coronaRotationDeg: 0,
  sunGlowSize: 0.42,
  sunGlowIntensity: 0.65,
  sunGlowColor: '#ffaa44',
  cloudOverlayEnabled: false,
  cloudOverlayOpacity: 0.45,
  cloudOverlayScrollSpeed: 1.5,
  cloudOverlayScaleU: 1,
  cloudOverlayElevationOffset: 0,
  oobNormalEnabled: false,
  oobNormalStrength: 0.35,
  oobNormalTileScale: 6,
  oobNormalScrollSpeed: 0.06,
};

export const skyboxRuntimeConfig: SkyboxConfig = {
  ...DEFAULT_SKYBOX_CONFIG,
};

type SkyboxConfigListener = (config: SkyboxConfig) => void;
const skyboxConfigCallbacks: SkyboxConfigListener[] = [];

export function subscribeSkyboxConfig(listener: SkyboxConfigListener): () => void {
  if (typeof listener !== 'function') return () => {};
  if (!skyboxConfigCallbacks.includes(listener)) {
    skyboxConfigCallbacks.push(listener);
  }
  return () => {
    const idx = skyboxConfigCallbacks.indexOf(listener);
    if (idx !== -1) skyboxConfigCallbacks.splice(idx, 1);
  };
}

export function getSkyboxConfig(): SkyboxConfig {
  return { ...skyboxRuntimeConfig };
}

export function normalizeSkyboxPatch(patch: Partial<SkyboxConfig> = {}): Partial<SkyboxConfig> {
  const normalized: Partial<SkyboxConfig> = { ...patch };
  if (normalized.skyCategory !== undefined && normalized.presetId === undefined && normalized.texturePath === undefined) {
    const targetCat: SkyboxCategory = normalized.skyCategory === 'full-sphere' ? 'full-sphere' : 'hemisphere';
    normalized.skyCategory = targetCat;
    const rememberedId =
      targetCat === 'full-sphere'
        ? normalized.fullSpherePresetId || skyboxRuntimeConfig.fullSpherePresetId || 'sbs-cloudy-04'
        : normalized.hemispherePresetId || skyboxRuntimeConfig.hemispherePresetId || 'forbidden-temple-clouds';
    const preset = resolveSkyboxPreset(rememberedId, targetCat);
    normalized.presetId = preset.id;
    normalized.texturePath = preset.path;
  }
  if (normalized.presetId !== undefined || normalized.texturePath !== undefined) {
    const key = normalized.presetId !== undefined ? normalized.presetId : normalized.texturePath;
    const preset = resolveSkyboxPreset(key, normalized.skyCategory || skyboxRuntimeConfig.skyCategory);
    normalized.presetId = preset.id;
    if (normalized.presetId !== undefined) normalized.texturePath = preset.path;
    normalized.skyCategory = preset.category;
    if (preset.category === 'full-sphere') normalized.fullSpherePresetId = preset.id;
    else normalized.hemispherePresetId = preset.id;
  }
  if (normalized.useTexture !== undefined) {
    normalized.useTexture = Boolean(normalized.useTexture);
    normalized.mode = normalized.useTexture ? 'texture' : 'procedural';
  } else if (normalized.mode !== undefined) {
    normalized.useTexture = normalized.mode === 'texture';
  }
  if (normalized.rotationDeg !== undefined) normalized.textureRotationDeg = Number(normalized.rotationDeg) || 0;
  else if (normalized.textureRotationDeg !== undefined) normalized.rotationDeg = Number(normalized.textureRotationDeg) || 0;
  if (normalized.exposure !== undefined) normalized.textureExposure = Number(normalized.exposure) ?? 0.6;
  else if (normalized.textureExposure !== undefined) normalized.exposure = Number(normalized.textureExposure) ?? 0.6;
  return normalized;
}

export function updateSkyboxConfig(patch: Partial<SkyboxConfig> = {}): SkyboxConfig {
  if (!patch) return skyboxRuntimeConfig;
  const normalized = normalizeSkyboxPatch(patch);
  Object.assign(skyboxRuntimeConfig, normalized);
  for (const listener of skyboxConfigCallbacks) {
    try {
      listener(skyboxRuntimeConfig);
    } catch (err) {
      console.warn('[skyboxConfig] Listener threw an error:', err);
    }
  }
  return skyboxRuntimeConfig;
}
