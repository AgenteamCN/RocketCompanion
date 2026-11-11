/**
 * performanceBoostConfig.ts
 * Runtime configuration, LocalStorage persistence, and pub/sub store for
 * Extreme Performance Boost (Pose-Attached Beam & Historical Trajectory Ribbon).
 */

import { safeStorage, STORAGE_KEYS } from './storageHelpers';
import { setMaterialsConfig, getMaterialsConfig } from './materialsConfig';

export type PerformanceBoostMode = 'attach' | 'trail';
export type PerformanceBoostColorMode = 'solid' | 'gradient';
export type PerformanceBoostBlendingMode = 'additive' | 'normal';
export type BoostTrailVisualId =
  | 'cartoon'
  | 'gold-rush'
  | 'light-beam'
  | 'light-wave'
  | 'custom';

/**
 * Implicit color variation parameter payload for Light Beam / Light Wave.
 * Supports future custom user/bot color variations while allowing bots to
 * automatically bind nozzle head (#ffffff) + mid/tail car body color.
 */
export interface PerformanceBoostColorParams {
  colorMode?: PerformanceBoostColorMode;
  solidColor?: string;
  headColor?: string;
  midColor?: string;
  tailColor?: string;
  midColorPosPct?: number;
  headGlowStrength?: number;
}

export interface PerformanceBoostConfig {
  mode: PerformanceBoostMode;
  mergeCenterNozzle: boolean;

  // Color & Gradient (supports Single Color or 3-Stop Gradient with 2-stage Bezier curves)
  colorMode: PerformanceBoostColorMode;
  solidColor: string;
  headColor: string;
  midColor: string;
  tailColor: string;
  midColorPosPct: number;
  headGlowStrength: number;

  // Stage 1 Bezier: Head -> Mid
  headToMidBezierP1X: number;
  headToMidBezierP1Y: number;
  headToMidBezierP2X: number;
  headToMidBezierP2Y: number;

  // Stage 2 Bezier: Mid -> Tail
  midToTailBezierP1X: number;
  midToTailBezierP1Y: number;
  midToTailBezierP2X: number;
  midToTailBezierP2Y: number;

  // Mode 1: Pose-Attached Beam ("Lightsaber" / Hard-Attach) Timing & Length
  attachStartDurationSec: number;
  attachEndDurationSec: number;
  attachLengthUu: number;

  // Mode 2: Historical Trajectory Ribbon Timing & Sampling
  startAgeTicks: number;
  endAgeTicks: number;
  minSampleDistUu: number;
  maxStepBreakDistUu: number;

  // Shared Tube Geometry & Alpha Blend Expire
  headWidthUu: number;
  tailWidthUu: number;
  widthTaperCurve: number;
  opacity: number;
  fadeCurve: number;
  coreSharpness: number;
  blendingMode: PerformanceBoostBlendingMode;
}

export type PerformanceBoostConfigPatch = Partial<PerformanceBoostConfig>;

const PERFORMANCE_BOOST_SCHEMA_VERSION = 2;

export const DEFAULT_PERFORMANCE_BOOST_CONFIG: Readonly<PerformanceBoostConfig> = Object.freeze({
  mode: 'trail',
  mergeCenterNozzle: false,

  colorMode: 'gradient',
  solidColor: '#ff9914',
  headColor: '#ffffff',
  midColor: '#ff8811',
  tailColor: '#ff2200',
  midColorPosPct: 28,
  headGlowStrength: 1.25,

  headToMidBezierP1X: 0.55,
  headToMidBezierP1Y: 0.25,
  headToMidBezierP2X: 0.62,
  headToMidBezierP2Y: 0.92,

  midToTailBezierP1X: 0.15,
  midToTailBezierP1Y: 0.72,
  midToTailBezierP2X: 0.25,
  midToTailBezierP2Y: 0.68,

  attachStartDurationSec: 0.12,
  attachEndDurationSec: 0.18,
  attachLengthUu: 185,

  startAgeTicks: 0,
  endAgeTicks: 38,
  minSampleDistUu: 10,
  maxStepBreakDistUu: 260,

  headWidthUu: 16,
  tailWidthUu: 2.5,
  widthTaperCurve: 1.05,
  opacity: 0.9,
  fadeCurve: 1.25,
  coreSharpness: 0.45,
  blendingMode: 'additive',
});

export interface ResolvePerformanceBoostEffectiveOptions {
  modeOverride?: PerformanceBoostMode | null;
  isBot?: boolean;
  carColorHex?: string | null;
  colorParams?: PerformanceBoostColorParams | null;
}

export function normalizeHexColorString(
  colorInput: string | number | null | undefined,
  fallback = '#ff8811'
): string {
  if (typeof colorInput === 'number' && Number.isFinite(colorInput)) {
    return `#${(colorInput & 0xffffff).toString(16).padStart(6, '0')}`;
  }
  if (typeof colorInput === 'string') {
    const trimmed = colorInput.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
  }
  return fallback;
}

export function resolvePerformanceBoostEffectiveConfig(
  baseCfg: PerformanceBoostConfig,
  options: ResolvePerformanceBoostEffectiveOptions = {}
): PerformanceBoostConfig {
  const effectiveMode: PerformanceBoostMode =
    options.modeOverride === 'attach' || options.modeOverride === 'trail'
      ? options.modeOverride
      : baseCfg.mode;

  const customParams = options.colorParams;
  if (customParams && typeof customParams === 'object') {
    return {
      ...baseCfg,
      mode: effectiveMode,
      colorMode: customParams.colorMode ?? baseCfg.colorMode,
      solidColor: customParams.solidColor ?? baseCfg.solidColor,
      headColor: customParams.headColor ?? baseCfg.headColor,
      midColor: customParams.midColor ?? baseCfg.midColor,
      tailColor: customParams.tailColor ?? baseCfg.tailColor,
      midColorPosPct: customParams.midColorPosPct ?? baseCfg.midColorPosPct,
      headGlowStrength: customParams.headGlowStrength ?? baseCfg.headGlowStrength,
    };
  }

  if (options.isBot) {
    const bodyHex = normalizeHexColorString(options.carColorHex, baseCfg.midColor);
    return {
      ...baseCfg,
      mode: effectiveMode,
      colorMode: 'gradient',
      headColor: '#ffffff',
      midColor: bodyHex,
      tailColor: bodyHex,
    };
  }

  if (effectiveMode === baseCfg.mode) {
    return baseCfg;
  }

  return {
    ...baseCfg,
    mode: effectiveMode,
  };
}

function sanitizeLoadedConfig(raw: unknown, checkSchemaMigration = false): PerformanceBoostConfig {
  const base: PerformanceBoostConfig = { ...DEFAULT_PERFORMANCE_BOOST_CONFIG };
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PERFORMANCE_BOOST_CONFIG) as (keyof PerformanceBoostConfig)[]) {
    if (src[key] !== undefined) {
      (base as unknown as Record<string, unknown>)[key] = src[key];
    }
  }
  if (checkSchemaMigration && src._schemaVersion !== PERFORMANCE_BOOST_SCHEMA_VERSION) {
    base.mergeCenterNozzle = false;
    base.mode = 'trail';
  }
  base.mode = base.mode === 'trail' ? 'trail' : 'attach';
  base.colorMode = base.colorMode === 'solid' ? 'solid' : 'gradient';
  base.blendingMode = base.blendingMode === 'normal' ? 'normal' : 'additive';
  base.mergeCenterNozzle = Boolean(base.mergeCenterNozzle);
  base.attachStartDurationSec = Math.max(0.01, Math.min(2.0, Number(base.attachStartDurationSec) || 0.12));
  base.attachEndDurationSec = Math.max(0.01, Math.min(2.0, Number(base.attachEndDurationSec) || 0.18));
  base.attachLengthUu = Math.max(20, Math.min(600, Number(base.attachLengthUu) || 185));
  base.startAgeTicks = Math.max(0, Math.min(90, Number(base.startAgeTicks) || 0));
  base.endAgeTicks = Math.max(base.startAgeTicks + 2, Math.min(180, Number(base.endAgeTicks) || 38));
  base.midColorPosPct = Math.max(1, Math.min(99, Number(base.midColorPosPct) || 28));
  base.headWidthUu = Math.max(1, Math.min(60, Number(base.headWidthUu) || 16));
  base.tailWidthUu = Math.max(0, Math.min(60, Number(base.tailWidthUu) ?? 2.5));
  base.opacity = Math.max(0.05, Math.min(1.0, Number(base.opacity) || 0.9));
  base.fadeCurve = Math.max(0.15, Math.min(4.0, Number(base.fadeCurve) || 1.25));
  base.coreSharpness = Math.max(0.05, Math.min(0.95, Number(base.coreSharpness) || 0.45));
  return base;
}

export const performanceBoostRuntimeConfig: PerformanceBoostConfig = (() => {
  const raw = safeStorage.get(STORAGE_KEYS.PERFORMANCE_BOOST);
  if (raw) {
    try {
      return sanitizeLoadedConfig(JSON.parse(raw), true);
    } catch {
      // ignore corrupted storage
    }
  }
  return { ...DEFAULT_PERFORMANCE_BOOST_CONFIG };
})();

type PerformanceBoostConfigListener = (snapshot: PerformanceBoostConfig) => void;
const listeners: PerformanceBoostConfigListener[] = [];

export function getPerformanceBoostConfig(): PerformanceBoostConfig {
  return { ...performanceBoostRuntimeConfig };
}

export function subscribePerformanceBoostConfig(
  listener: PerformanceBoostConfigListener
): () => void {
  if (typeof listener !== 'function') return () => {};
  if (!listeners.includes(listener)) {
    listeners.push(listener);
  }
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) {
      listeners.splice(idx, 1);
    }
  };
}

function notifyPerformanceBoostListeners(): PerformanceBoostConfig {
  const snapshot = getPerformanceBoostConfig();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  }
  return snapshot;
}

export interface UpdatePerformanceBoostOptions {
  autoSwitchToCustom?: boolean;
  persist?: boolean;
}

export function updatePerformanceBoostConfig(
  patch: PerformanceBoostConfigPatch = {},
  options: UpdatePerformanceBoostOptions = {}
): PerformanceBoostConfig {
  if (!patch || typeof patch !== 'object') return getPerformanceBoostConfig();
  const merged = sanitizeLoadedConfig({
    ...performanceBoostRuntimeConfig,
    ...patch,
  });
  Object.assign(performanceBoostRuntimeConfig, merged);

  if (options.persist !== false) {
    safeStorage.set(
      STORAGE_KEYS.PERFORMANCE_BOOST,
      JSON.stringify({
        ...performanceBoostRuntimeConfig,
        _schemaVersion: PERFORMANCE_BOOST_SCHEMA_VERSION,
      })
    );
  }

  if (options.autoSwitchToCustom !== false) {
    const curMats = getMaterialsConfig();
    if (patch.mode === 'attach') {
      if (curMats.boostVisual !== 'light-beam') {
        setMaterialsConfig({ boostVisual: 'light-beam' });
      }
    } else if (patch.mode === 'trail') {
      if (curMats.boostVisual !== 'light-wave') {
        setMaterialsConfig({ boostVisual: 'light-wave' });
      }
    } else if (
      curMats.boostVisual !== 'light-beam' &&
      curMats.boostVisual !== 'light-wave' &&
      curMats.boostVisual !== 'custom'
    ) {
      setMaterialsConfig({
        boostVisual: performanceBoostRuntimeConfig.mode === 'attach' ? 'light-beam' : 'light-wave',
      });
    }
  }

  return notifyPerformanceBoostListeners();
}

export function resetPerformanceBoostConfig(
  options: UpdatePerformanceBoostOptions = {}
): PerformanceBoostConfig {
  Object.assign(performanceBoostRuntimeConfig, DEFAULT_PERFORMANCE_BOOST_CONFIG);
  if (options.persist !== false) {
    safeStorage.set(
      STORAGE_KEYS.PERFORMANCE_BOOST,
      JSON.stringify({
        ...performanceBoostRuntimeConfig,
        _schemaVersion: PERFORMANCE_BOOST_SCHEMA_VERSION,
      })
    );
  }
  if (options.autoSwitchToCustom !== false) {
    const curMats = getMaterialsConfig();
    if (curMats.boostVisual !== 'light-wave') {
      setMaterialsConfig({ boostVisual: 'light-wave' });
    }
  }
  return notifyPerformanceBoostListeners();
}
