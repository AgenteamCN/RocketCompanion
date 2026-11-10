/**
 * storageHelpers.ts
 * Pure LocalStorage persistence, storage key constants (SSOT), and validation helpers.
 */

export const STORAGE_KEYS = Object.freeze({
  UI_SCALE: 'ui-scale',
  UI_THEME: 'ui-theme',
  GAME_THEME: 'theme',
  SAFE_AREA_MARGIN: 'simpleui-safe-area-margin',
  SAFE_AREA_VISIBLE: 'simpleui-safe-area-visible',
  DISPLAY_SETTINGS: 'display-settings',
  COLOR_PREFS: 'color-preferences',
  PLAYER_NAME: 'player-name',
  CAMERA_SETTINGS: 'camera-settings',
  GRAPHICS_SETTINGS: 'graphics-settings',
  AUDIO_SETTINGS: 'audio-settings',
  MATERIALS: 'visual-materials',
  TRAJECTORY: 'ball-trajectory-config-v3',
  TELEMETRY_SETTINGS: 'telemetry-settings',
  BOOST_PAD_TUNER: 'boost-pad-tuner',
  DRIFTWOODS_TUNER: 'driftwoods-tuner',
  CLOCK_PACING: 'clock-pacing',
  CLOCK_PACING_PRIORITY: 'clock-pacing-priority',
  CLOCK_PACING_CUSTOM_PARAMS: 'clock-pacing-custom-params',
  INPUT_BUFFER_TARGET: 'input-buffer-target',
  INPUT_BUFFER_THRESHOLD: 'input-buffer-threshold',
  FLOATING_OPACITY: 'floating-window-opacity',
  BOT_SETTINGS: 'bot-settings',
  KICKOFF_WS_OFFSET_PCT: 'kickoff-ws-offset-pct',
  INPUT_BINDINGS: 'input-bindings',
  CONTROLLER_SELECTION: 'controller-selection',
  TOUCH_SETTINGS: 'touch-settings',
  REF_OVERLAY_PROFILES: 'hitbox-ref-overlay-profiles',
  PLAYER_ANTHEM: 'player-anthem',
  PLAYER_ANTHEM_RANDOM_PREFS: 'player-anthem-random-prefs',
  BGM_PREFS: 'bgm-preferences',
  SPATIAL_AUDIO_TUNER: 'spatial-audio-tuner',
  SPATIAL_ATTENUATION_PROFILES: 'spatial-attenuation-profiles-v1',
  BOTS_LOADOUT_CONFIG: 'bots-loadout-config',
  ACCENT_THEME: 'rc-accent-theme-v2',
  BOOST_GAUGE_TOKENS: 'rc-boost-gauge-tokens-v2',
  CAMERA_SETTINGS_STYLE: 'rc-camera-settings-style-v1',
  FLOATING_THREE_STAGE: 'rc-floating-three-stage-v2',
  MENU_LAYOUT_TOKENS: 'rc-menu-layout-tokens-v17',
  SETTING_ACTION_ROW_TOKENS: 'rc-setting-action-row-tokens-v7',
  UNDERLINE_TABS_TOKENS: 'rc-underline-tabs-tokens-v1',
  STATIC_TRAINING_BALL_CAM_TUNER: 'rc_static_training_ball_cam_tuner_v2',
  KEYBOARD_INPUT_OVERLAY: 'rc_keyboard_input_overlay_v2',
});

export const UI_THEME_STORAGE_KEY = STORAGE_KEYS.UI_THEME;

type SafeStorageChangeListener = (key: string) => void;
const storageListeners: SafeStorageChangeListener[] = [];

export const safeStorage = {
  get: (k: string, fallback: string | null = null): string | null => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(k) ?? fallback : fallback;
    } catch (err) {
      console.warn(`[safeStorage] Error reading key "${k}" from localStorage:`, err);
      return fallback;
    }
  },
  getItem: (k: string, fallback: string | null = null): string | null => {
    return safeStorage.get(k, fallback);
  },
  set: (k: string, v: unknown): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        const nextStr = String(v);
        const prevStr = localStorage.getItem(k);
        localStorage.setItem(k, nextStr);
        if (prevStr !== nextStr) {
          for (let i = 0; i < storageListeners.length; i++) storageListeners[i](k);
        }
      }
    } catch (err) {
      console.warn(`[safeStorage] Error writing key "${k}" to localStorage:`, err);
    }
  },
  setItem: (k: string, v: unknown): void => {
    safeStorage.set(k, v);
  },
  remove: (k: string): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        const hadPrev = localStorage.getItem(k) !== null;
        localStorage.removeItem(k);
        if (hadPrev) {
          for (let i = 0; i < storageListeners.length; i++) storageListeners[i](k);
        }
      }
    } catch (err) {
      console.warn(`[safeStorage] Error removing key "${k}" from localStorage:`, err);
    }
  },
  removeItem: (k: string): void => {
    safeStorage.remove(k);
  },
  subscribe: (listener: SafeStorageChangeListener): (() => void) => {
    if (!storageListeners.includes(listener)) {
      storageListeners.push(listener);
    }
    return () => {
      const idx = storageListeners.indexOf(listener);
      if (idx >= 0) storageListeners.splice(idx, 1);
    };
  },
};

export function safeLocalStorageGet(key: string): string | null {
  return safeStorage.get(key, null);
}

export function safeLocalStorageSet(key: string, value: string): void {
  safeStorage.set(key, value);
}

export function safeLocalStorageRemove(key: string): void {
  safeStorage.remove(key);
}

export function readStorageJson<T>(key: string, fallback: T): T {
  const raw = safeStorage.get(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorageJson<T>(key: string, value: T): void {
  try {
    safeStorage.set(key, JSON.stringify(value));
  } catch {
    // ignore storage serialization errors
  }
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function booleanOrDefault(val: unknown, fallback: boolean): boolean {
  if (typeof val !== 'boolean' && val !== undefined && val !== null) {
    console.warn('[storageHelpers] Non-boolean value in booleanOrDefault, falling back:', { val, fallback });
  }
  return typeof val === 'boolean' ? val : fallback;
}

export function clampNumberOrDefault(
  val: unknown,
  fallback: number,
  constraints: { min?: number; max?: number; integer?: boolean } = {}
): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    if (val !== undefined && val !== null) {
      console.warn('[storageHelpers] Non-finite number in clampNumberOrDefault, falling back:', { val, fallback });
    }
    return fallback;
  }
  let num = val;
  if (constraints.integer) num = Math.round(num);
  if (constraints.min !== undefined) num = Math.max(constraints.min, num);
  if (constraints.max !== undefined) num = Math.min(constraints.max, num);
  return num;
}

export function stringOrDefault(val: unknown, allowed: readonly string[] | Set<string>, fallback: string): string {
  if (typeof val === 'string') {
    if (Array.isArray(allowed) && allowed.includes(val)) return val;
    if (allowed instanceof Set && allowed.has(val)) return val;
  }
  if (val !== undefined && val !== null) {
    console.warn('[storageHelpers] Disallowed string in stringOrDefault, falling back:', { val, fallback });
  }
  return fallback;
}

export function filterArraySlice<T>(
  val: unknown,
  filterFn: (item: unknown) => item is T,
  maxLen: number
): T[] | null;
export function filterArraySlice<T>(
  val: unknown,
  filterFn: (item: unknown) => boolean,
  maxLen: number
): T[] | null;
export function filterArraySlice<T>(val: unknown, filterFn: (item: unknown) => boolean, maxLen: number): T[] | null {
  return Array.isArray(val) ? (val.filter(filterFn).slice(0, maxLen) as T[]) : null;
}

export interface LocalStorageStore<T> {
  key: string;
  defaults: () => T;
  load: () => T;
  get: () => T;
  loadInto: (target: T) => T;
  save: (data: T) => void;
  clear: () => void;
}

export function createLocalStorageStore<T extends object>(
  key: string,
  defaultFactory: () => T,
  migrateFn?: (target: T, loaded: Record<string, unknown>) => void
): LocalStorageStore<T> {
  const load = (): T => {
    const defaults = defaultFactory();
    const raw = safeStorage.get(key);
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        if (migrateFn) {
          migrateFn(defaults, parsed);
        } else {
          Object.assign(defaults, parsed);
        }
        return defaults;
      }
      console.warn(`[storageHelpers] Stored settings for key "${key}" is not a plain object, falling back to defaults:`, parsed);
      return defaultFactory();
    } catch (err) {
      console.warn(`[storageHelpers] Corrupted stored settings for key "${key}", using defaults:`, err);
      return defaultFactory();
    }
  };

  return {
    key,
    defaults: defaultFactory,
    load,
    get: load,
    loadInto(target: T) {
      return Object.assign(target, load());
    },
    save(data: T) {
      try {
        safeStorage.set(key, JSON.stringify(data));
      } catch (err) {
        console.warn(`[storageHelpers] Failed to stringify settings for key "${key}":`, err);
      }
    },
    clear() {
      safeStorage.remove(key);
    },
  };
}
