import { create } from 'zustand';
import { syncBridge as crossClientSync } from './syncBridge';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
  safeStorage,
} from '../config/storageHelpers';

export type BoostGaugeColorScheme = 'classic-4' | 'step-12';
export type BoostGaugeColorMode = 'standard' | 'inverted' | 'ring-only';
export type BoostGaugeThemeOverride = 'auto' | 'dark' | 'light';
export type BoostGaugeLineCap = 'round' | 'butt';

export interface BoostGaugeTokens {
  /** Color scheme: 'step-12' (12-boost 9-tier scheme) | 'classic-4' (4-tier scheme) */
  colorScheme: BoostGaugeColorScheme;
  /**
   * Color mode:
   * - 'inverted': Dial plate + active ring change color with boost tier; empty (100 - amount)% ring is carved to transparent; center digits stay fixedTextColor
   * - 'ring-only': Dark/Light dial plate, only outer ring changes color with boost tier; center digits stay fixedTextColor
   * - 'standard': Both outer ring and center digits change color with boost tier
   */
  colorMode: BoostGaugeColorMode;
  /** Fixed central readout color when colorMode is 'inverted' or 'ring-only' (default: '#FFFFFF') */
  fixedTextColor: string;
  /** Theme override: 'auto' | 'dark' | 'light' */
  themeOverride: BoostGaugeThemeOverride;
  /** Outer ring start radius percentage (0 ~ 98, default: 60) */
  ringInnerPct: number;
  /** Outer ring end radius percentage (2 ~ 100, default: 98) */
  ringOuterPct: number;
  /** Arc endpoint cap style: 'round' | 'butt' (default: 'round') */
  lineCap: BoostGaugeLineCap;
  /** Cutout angle in degrees (0 ~ 359, default: 90) */
  cutoutAngleDeg: number;
  /** Opening direction / rotation angle in degrees (-180 ~ 180, default: -45 for bottom-right) */
  rotationDeg: number;
  /** Gauge outer diameter in px (default: 148) */
  size: number;
}

export const DEFAULT_BOOST_GAUGE_TOKENS: BoostGaugeTokens = {
  colorScheme: 'step-12',
  colorMode: 'inverted',
  fixedTextColor: '#FFFFFF',
  themeOverride: 'auto',
  ringInnerPct: 60,
  ringOuterPct: 98,
  lineCap: 'round',
  cutoutAngleDeg: 90,
  rotationDeg: -45,
  size: 148,
};

const STORAGE_KEY = STORAGE_KEYS.BOOST_GAUGE_TOKENS;
const SYNC_KEY = 'store:boostGauge:v2';

const normalizeTokens = (raw?: Partial<BoostGaugeTokens>): BoostGaugeTokens => ({
  ...DEFAULT_BOOST_GAUGE_TOKENS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

const loadSavedTokens = (): BoostGaugeTokens =>
  normalizeTokens(readStorageJson<Partial<BoostGaugeTokens>>(STORAGE_KEY, DEFAULT_BOOST_GAUGE_TOKENS));

const saveTokens = (tokens: BoostGaugeTokens) => {
  if (!crossClientSync.isApplyingRemote()) {
    crossClientSync.set(SYNC_KEY, tokens);
  }
  writeStorageJson(STORAGE_KEY, tokens);
};

export interface BoostGaugeStore extends BoostGaugeTokens {
  setToken: <K extends keyof BoostGaugeTokens>(key: K, value: BoostGaugeTokens[K]) => void;
  updateTokens: (patch: Partial<BoostGaugeTokens>) => void;
  resetTokens: () => void;
  exportConfigCode: () => string;
}

const extractSnapshot = (s: BoostGaugeTokens): BoostGaugeTokens => ({
  colorScheme: s.colorScheme,
  colorMode: s.colorMode,
  fixedTextColor: s.fixedTextColor,
  themeOverride: s.themeOverride,
  ringInnerPct: s.ringInnerPct,
  ringOuterPct: s.ringOuterPct,
  lineCap: s.lineCap,
  cutoutAngleDeg: s.cutoutAngleDeg,
  rotationDeg: s.rotationDeg,
  size: s.size,
});

const initialTokens = normalizeTokens(
  crossClientSync.get<BoostGaugeTokens>(SYNC_KEY, loadSavedTokens())
);

export const useBoostGaugeStore = create<BoostGaugeStore>((set, get) => ({
  ...initialTokens,

  setToken: (key, value) => {
    set((state) => {
      const next = normalizeTokens({
        ...extractSnapshot(state),
        [key]: value,
      });
      saveTokens(next);
      return next;
    });
  },

  updateTokens: (patch) => {
    set((state) => {
      const next = normalizeTokens({
        ...extractSnapshot(state),
        ...patch,
      });
      saveTokens(next);
      return next;
    });
  },

  resetTokens: () => {
    const fresh = { ...DEFAULT_BOOST_GAUGE_TOKENS };
    saveTokens(fresh);
    set(() => fresh);
  },

  exportConfigCode: () => {
    const snapshot = extractSnapshot(get());
    return `export const DEFAULT_BOOST_GAUGE_TOKENS: BoostGaugeTokens = ${JSON.stringify(
      snapshot,
      null,
      2
    )};`;
  },
}));

crossClientSync.registerDefault(SYNC_KEY, { ...DEFAULT_BOOST_GAUGE_TOKENS });

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !SYNC_KEY.startsWith(scopePrefix)) return;
  const fresh = { ...DEFAULT_BOOST_GAUGE_TOKENS };
  safeStorage.remove(STORAGE_KEY);
  useBoostGaugeStore.setState(fresh);
});

crossClientSync.subscribeKey<BoostGaugeTokens>(SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  const merged = normalizeTokens(remote);
  writeStorageJson(STORAGE_KEY, merged);
  useBoostGaugeStore.setState(merged);
});
