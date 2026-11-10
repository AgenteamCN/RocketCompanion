/**
 * atmosphereFxConfig.ts
 * Pure configuration defaults and runtime state for Driftwoods Wall FX and Arena Shadow Lighting.
 */

export interface ExperimentalWallFxConfig {
  circleEnabled: boolean;
  circleRadius: number;
  circleVerticalExtendUu: number;
  circleThickness: number;
  circleColor: string;
  circleUseTeamColor: boolean;
  circleOpacity: number;
  circlePreviewOrbit: boolean;
  circleShowSpherePreview: boolean;

  pulseEnabled: boolean;
  pulseSphereRadius: number;
  pulseVerticalExtendUu: number;
  pulseDirection: string;

  pulseFadeShrinkPct: number;
  pulseFadeRangeUu: number;
  pulseFadeBezierP1X: number;
  pulseFadeBezierP1Y: number;
  pulseFadeBezierP2X: number;
  pulseFadeBezierP2Y: number;

  pulseSteadyMode: string;
  pulseStaticPositionPct: number;
  pulseStaticBandWidthPct: number;

  pulseIntervalSec: number;
  pulseSpeedRadiusPct: number;

  pulseRiseDurationSec: number;
  pulseFallDurationSec: number;
  pulseDurationSec: number;
  pulseRiseBezierP1X: number;
  pulseRiseBezierP1Y: number;
  pulseRiseBezierP2X: number;
  pulseRiseBezierP2Y: number;
  pulseFallBezierP1X: number;
  pulseFallBezierP1Y: number;
  pulseFallBezierP2X: number;
  pulseFallBezierP2Y: number;

  pulseIntensity: number;
  pulseColor: string;
  pulseMultiplyTeamColor: boolean;
  pulseOpacity: number;
  pulsePreviewOrbit: boolean;
  pulseShowSpherePreview: boolean;

  teamGradientEnabled: boolean;
  centerLineWidth: number;
  teamTransitionWidth: number;
  teamColorStrength: number;
  blueTeamColor: string;
  blueTeamAlpha: number;
  orangeTeamColor: string;
  orangeTeamAlpha: number;
  centerLineColor: string;
  centerLineAlpha: number;
  previewBallNearWall: boolean;
  circleApplyToWalls: boolean;
  circleApplyToHexes: boolean;
  pulseApplyToHexes: boolean;
  pulseApplyToWalls: boolean;
  teamApplyToHexes: boolean;
  teamApplyToWalls: boolean;
  [key: string]: unknown;
}

export const DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG: ExperimentalWallFxConfig = {
  circleEnabled: true,
  circleRadius: 500,
  circleVerticalExtendUu: 0,
  circleThickness: 5,
  circleColor: '#d6d6d6',
  circleUseTeamColor: true,
  circleOpacity: 0.75,
  circlePreviewOrbit: false,
  circleShowSpherePreview: false,

  pulseEnabled: true,
  pulseSphereRadius: 4000,
  pulseVerticalExtendUu: 0,
  pulseDirection: 'inward',

  pulseFadeShrinkPct: 50,
  pulseFadeRangeUu: -2000,
  pulseFadeBezierP1X: 0.5,
  pulseFadeBezierP1Y: 0.0,
  pulseFadeBezierP2X: 1.0,
  pulseFadeBezierP2Y: 0.0,

  pulseSteadyMode: 'wave',
  pulseStaticPositionPct: 47,
  pulseStaticBandWidthPct: 5,

  pulseIntervalSec: 1,
  pulseSpeedRadiusPct: 50,

  pulseRiseDurationSec: 0.01,
  pulseFallDurationSec: 0.2,
  pulseDurationSec: 0.21,
  pulseRiseBezierP1X: 0.33,
  pulseRiseBezierP1Y: 0.33,
  pulseRiseBezierP2X: 0.67,
  pulseRiseBezierP2Y: 0.67,
  pulseFallBezierP1X: 0.0,
  pulseFallBezierP1Y: 0.5,
  pulseFallBezierP2X: 0.0,
  pulseFallBezierP2Y: 1.01,

  pulseIntensity: 1,
  pulseColor: '#ffffff',
  pulseMultiplyTeamColor: true,
  pulseOpacity: 0.92,
  pulsePreviewOrbit: false,
  pulseShowSpherePreview: false,

  teamGradientEnabled: true,
  centerLineWidth: 5,
  teamTransitionWidth: 1000,
  teamColorStrength: 0.8,
  blueTeamColor: '#0089ff',
  blueTeamAlpha: 0.85,
  orangeTeamColor: '#ff5200',
  orangeTeamAlpha: 0.85,
  centerLineColor: '#ffffff',
  centerLineAlpha: 0,
  previewBallNearWall: false,
  circleApplyToWalls: true,
  circleApplyToHexes: false,
  pulseApplyToHexes: true,
  pulseApplyToWalls: false,
  teamApplyToHexes: true,
  teamApplyToWalls: false,
};

export const experimentalWallFxRuntimeConfig: ExperimentalWallFxConfig = {
  ...DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG,
};

export function getExperimentalWallFxConfig(): ExperimentalWallFxConfig {
  return { ...experimentalWallFxRuntimeConfig };
}

export function setExperimentalWallFxRuntimeConfig(
  patch: Partial<ExperimentalWallFxConfig> = {}
): ExperimentalWallFxConfig {
  if (!patch) return experimentalWallFxRuntimeConfig;
  Object.assign(experimentalWallFxRuntimeConfig, patch);
  if (
    patch.pulseRiseDurationSec !== undefined ||
    patch.pulseFallDurationSec !== undefined
  ) {
    experimentalWallFxRuntimeConfig.pulseDurationSec = Number(
      (
        Math.max(0.0001, Number(experimentalWallFxRuntimeConfig.pulseRiseDurationSec ?? 0.01)) +
        Math.max(0.0001, Number(experimentalWallFxRuntimeConfig.pulseFallDurationSec ?? 0.2))
      ).toFixed(5)
    );
  }
  return { ...experimentalWallFxRuntimeConfig };
}

export const DEFAULT_SUN_OFFSET_X = 3033;
export const DEFAULT_SUN_OFFSET_Y = 3942;
export const DEFAULT_SUN_OFFSET_Z = 535;
export const DEFAULT_SUN_DISTANCE = 5002;
export const DEFAULT_SUN_AZIMUTH_DEG = 10;
export const DEFAULT_SUN_ELEVATION_DEG = 52;

export interface ShadowConfig {
  mode: string;
  sharpness: string;
  mapSize: number;
  singleSunFrustumRadius: number;
  shadowBias: number;
  carsReceiveShadows: boolean;
  sunOffsetX: number;
  sunOffsetY: number;
  sunOffsetZ: number;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  sunDistance: number;
  sunColor: string;
  sunIntensity: number;
  keyLightEnabled: boolean;
  keyLightMode: string;
  keyLightAzimuthDeg: number;
  keyLightElevationDeg: number;
  keyLightColor: string;
  keyLightIntensity: number;
  hemiLightEnabled: boolean;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  showLightGizmo: boolean;
  lightRayOrigin: string;
  showKeyLightGizmo: boolean;
  lightGizmoDepthTest: boolean;
  [key: string]: unknown;
}

export const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  mode: 'single-sun',
  sharpness: 'sharp',
  mapSize: 2048,
  singleSunFrustumRadius: 1100,
  shadowBias: -0.0001,
  carsReceiveShadows: false,

  sunOffsetX: DEFAULT_SUN_OFFSET_X,
  sunOffsetY: DEFAULT_SUN_OFFSET_Y,
  sunOffsetZ: DEFAULT_SUN_OFFSET_Z,
  sunAzimuthDeg: DEFAULT_SUN_AZIMUTH_DEG,
  sunElevationDeg: DEFAULT_SUN_ELEVATION_DEG,
  sunDistance: DEFAULT_SUN_DISTANCE,
  sunColor: '#ffffff',
  sunIntensity: 1,

  keyLightEnabled: true,
  keyLightMode: 'fixed',
  keyLightAzimuthDeg: -135,
  keyLightElevationDeg: 35.3,
  keyLightColor: '#88aadf',
  keyLightIntensity: 0.5,

  hemiLightEnabled: true,
  hemiSkyColor: '#c8e0ff',
  hemiGroundColor: '#2732c8',
  hemiIntensity: 1,

  showLightGizmo: false,
  lightRayOrigin: 'car',
  showKeyLightGizmo: false,
  lightGizmoDepthTest: false,
};

export const shadowRuntimeConfig: ShadowConfig = {
  ...DEFAULT_SHADOW_CONFIG,
};

export function normalizeShadowLightingPatch(
  currentConfig: ShadowConfig,
  patch: Partial<ShadowConfig> = {}
): ShadowConfig {
  if (!patch) return { ...currentConfig };
  const merged: ShadowConfig = { ...currentConfig, ...patch };

  const hasSphericalPatch =
    patch.sunAzimuthDeg !== undefined ||
    patch.sunElevationDeg !== undefined ||
    patch.sunDistance !== undefined;
  const hasCartesianPatch =
    patch.sunOffsetX !== undefined ||
    patch.sunOffsetY !== undefined ||
    patch.sunOffsetZ !== undefined;

  if (hasSphericalPatch && !hasCartesianPatch) {
    const azRad = ((Number(merged.sunAzimuthDeg) || 0) * Math.PI) / 180;
    const elDeg = Math.max(1, Math.min(89, Number(merged.sunElevationDeg) ?? DEFAULT_SUN_ELEVATION_DEG));
    const elRad = (elDeg * Math.PI) / 180;
    const dist = Math.max(500, Number(merged.sunDistance) || DEFAULT_SUN_DISTANCE);
    const cosEl = Math.cos(elRad);
    merged.sunElevationDeg = Number(elDeg.toFixed(1));
    merged.sunDistance = Math.round(dist);
    merged.sunOffsetX = Math.round(dist * cosEl * Math.cos(azRad));
    merged.sunOffsetY = Math.round(dist * Math.sin(elRad));
    merged.sunOffsetZ = Math.round(dist * cosEl * Math.sin(azRad));
  } else if (hasCartesianPatch) {
    const ox = Number(merged.sunOffsetX) || 0;
    const oy = Math.max(50, Number(merged.sunOffsetY) || 50);
    const oz = Number(merged.sunOffsetZ) || 0;
    const dist = Math.max(100, Math.hypot(ox, oy, oz));
    const azDeg = (Math.atan2(oz, ox) * 180) / Math.PI;
    const elDeg = (Math.asin(Math.max(-1, Math.min(1, oy / dist))) * 180) / Math.PI;
    merged.sunOffsetX = Math.round(ox);
    merged.sunOffsetY = Math.round(oy);
    merged.sunOffsetZ = Math.round(oz);
    merged.sunDistance = Math.round(dist);
    merged.sunAzimuthDeg = Number(azDeg.toFixed(1));
    merged.sunElevationDeg = Number(elDeg.toFixed(1));
  }

  return merged;
}

export function getShadowConfig(): ShadowConfig {
  return { ...shadowRuntimeConfig };
}

export function updateShadowRuntimeConfig(patch: Partial<ShadowConfig> = {}): ShadowConfig {
  if (!patch) return shadowRuntimeConfig;
  const next = normalizeShadowLightingPatch(shadowRuntimeConfig, patch);
  Object.assign(shadowRuntimeConfig, next);
  return { ...shadowRuntimeConfig };
}
