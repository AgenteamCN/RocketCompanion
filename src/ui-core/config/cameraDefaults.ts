/**
 * cameraDefaults.ts
 * Default camera settings, storage keys, range bounds, and LocalStorage hydrator.
 */

import { safeStorage, STORAGE_KEYS } from './storageHelpers';

export const CAMERA_SETTINGS_STORAGE_KEY = STORAGE_KEYS.CAMERA_SETTINGS;

export interface CameraSettingsConfig {
  cameraShake: boolean;
  fov: number;
  distance: number;
  height: number;
  angleDeg: number;
  stiffness: number;
  swivelSpeed: number;
  transitionSpeed: number;
  invertSwivel: boolean;
  [key: string]: unknown;
}

export const DEFAULT_CAMERA_CONFIG: CameraSettingsConfig = {
  cameraShake: false,
  fov: 110,
  distance: 270,
  height: 90,
  angleDeg: -4,
  stiffness: 1,
  swivelSpeed: 10,
  transitionSpeed: 1.9,
  invertSwivel: true,
};

export const DEFAULT_CAMERA_SETTINGS: Readonly<CameraSettingsConfig> = Object.freeze({
  ...DEFAULT_CAMERA_CONFIG,
});

export interface CameraRangeSettingSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  suffix?: string;
}

export const CAMERA_RANGE_SETTINGS: readonly CameraRangeSettingSpec[] = Object.freeze([
  { key: 'fov', label: 'Field of View', min: 60, max: 110, step: 1, decimals: 0, suffix: '°' },
  { key: 'distance', label: 'Distance', min: 100, max: 400, step: 10, decimals: 2 },
  { key: 'height', label: 'Height', min: 40, max: 200, step: 10, decimals: 2 },
  { key: 'angleDeg', label: 'Angle', min: -15, max: 0, step: 1, decimals: 2, suffix: '°' },
  { key: 'stiffness', label: 'Stiffness', min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: 'swivelSpeed', label: 'Swivel Speed', min: 1, max: 10, step: 0.1, decimals: 2 },
  { key: 'transitionSpeed', label: 'Transition Speed', min: 1, max: 2, step: 0.1, decimals: 2 },
]);

export const CAMERA_RANGE_SETTINGS_MAP = new Map(CAMERA_RANGE_SETTINGS.map((i) => [i.key, i]));

export function getInitialCamera(): CameraSettingsConfig {
  const raw = safeStorage.get(CAMERA_SETTINGS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CAMERA_SETTINGS, ...parsed };
    } catch (err) {
      console.warn('[cameraDefaults] Failed to parse stored camera settings JSON, resetting to defaults:', err);
    }
  }
  return { ...DEFAULT_CAMERA_SETTINGS };
}

export const PRE_TRIGGER_FRAME_LIMIT = 600;
export const POST_TRIGGER_FRAME_LIMIT = 600;
export const MAX_CAPTURED_FRAMES = PRE_TRIGGER_FRAME_LIMIT + POST_TRIGGER_FRAME_LIMIT;

export const CAMERA_CAPTURE_STATES = Object.freeze({
  MONITORING: 'monitoring',
  CAPTURING_POST: 'capturing_post',
  CAPTURED_READY: 'captured_ready',
});

export const CAMERA_SOURCE_MODES = Object.freeze({
  WASM: 'wasm',
  CLEAN_JS: 'clean_js',
});
