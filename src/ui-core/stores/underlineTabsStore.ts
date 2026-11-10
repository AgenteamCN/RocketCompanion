import { create } from 'zustand';
import { syncBridge as crossClientSync } from './syncBridge';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
  safeStorage,
} from '../config/storageHelpers';

export type UnderlineTabsFontFamily = 'sans' | 'mono';
export type UnderlineTabsFontWeight = '400' | '500' | '600' | '700';

export interface UnderlineTabsTokens {
  /** Tab label font size (in px, default: 14px) */
  fontSize: number;
  /** Leading SVG icon width & height (in px, default: 16px) */
  iconSize: number;
  /** Horizontal gap between leading SVG icon and tab label (in px, default: 7px) */
  iconGap: number;
  /** Horizontal padding inside each tab item (in px, default: 12px) */
  paddingX: number;
  /** Vertical padding inside each tab item (in px, default: 8px) */
  paddingY: number;
  /** Bottom sliding underline indicator thickness (in px, default: 2px) */
  indicatorHeight: number;
  /** Whether to render leading tab icons when provided (default: true) */
  showIcons: boolean;
  /** Whether tabs stretch equally across the full bar width by default (default: true) */
  fullWidth: boolean;
  /** Font family for tab labels ('sans' = Inter, 'mono' = JetBrains Mono, default: 'sans') */
  fontFamily: UnderlineTabsFontFamily;
  /** Font weight for the active tab label (default: '600') */
  activeFontWeight: UnderlineTabsFontWeight;
  /** Font weight for inactive tab labels (default: '500') */
  inactiveFontWeight: UnderlineTabsFontWeight;
}

export const DEFAULT_UNDERLINE_TABS_TOKENS: UnderlineTabsTokens = {
  fontSize: 14,
  iconSize: 16,
  iconGap: 7,
  paddingX: 12,
  paddingY: 8,
  indicatorHeight: 2,
  showIcons: true,
  fullWidth: true,
  fontFamily: 'sans',
  activeFontWeight: '600',
  inactiveFontWeight: '500',
};

const STORAGE_KEY = STORAGE_KEYS.UNDERLINE_TABS_TOKENS;
const SYNC_KEY = 'store:underlineTabs:v1';

const normalizeTokens = (raw?: Partial<UnderlineTabsTokens>): UnderlineTabsTokens => ({
  ...DEFAULT_UNDERLINE_TABS_TOKENS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

const loadSavedTokens = (): UnderlineTabsTokens =>
  normalizeTokens(
    readStorageJson<Partial<UnderlineTabsTokens>>(STORAGE_KEY, DEFAULT_UNDERLINE_TABS_TOKENS)
  );

const saveTokens = (tokens: UnderlineTabsTokens) => {
  if (!crossClientSync.isApplyingRemote()) {
    crossClientSync.set(SYNC_KEY, tokens);
  }
  writeStorageJson(STORAGE_KEY, tokens);
};

export interface UnderlineTabsStore extends UnderlineTabsTokens {
  setToken: <K extends keyof UnderlineTabsTokens>(
    key: K,
    value: UnderlineTabsTokens[K]
  ) => void;
  updateTokens: (patch: Partial<UnderlineTabsTokens>) => void;
  resetTokens: () => void;
  exportConfigCode: () => string;
}

const extractSnapshot = (s: UnderlineTabsTokens): UnderlineTabsTokens => ({
  fontSize: s.fontSize,
  iconSize: s.iconSize,
  iconGap: s.iconGap,
  paddingX: s.paddingX,
  paddingY: s.paddingY,
  indicatorHeight: s.indicatorHeight,
  showIcons: s.showIcons,
  fullWidth: s.fullWidth,
  fontFamily: s.fontFamily,
  activeFontWeight: s.activeFontWeight,
  inactiveFontWeight: s.inactiveFontWeight,
});

const initialTokens = normalizeTokens(
  crossClientSync.get<UnderlineTabsTokens>(SYNC_KEY, loadSavedTokens())
);

export const useUnderlineTabsStore = create<UnderlineTabsStore>((set, get) => ({
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
    const fresh = { ...DEFAULT_UNDERLINE_TABS_TOKENS };
    saveTokens(fresh);
    set(() => fresh);
  },

  exportConfigCode: () => {
    const snapshot = extractSnapshot(get());
    return `export const DEFAULT_UNDERLINE_TABS_TOKENS: UnderlineTabsTokens = ${JSON.stringify(
      snapshot,
      null,
      2
    )};`;
  },
}));

crossClientSync.registerDefault(SYNC_KEY, { ...DEFAULT_UNDERLINE_TABS_TOKENS });

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !SYNC_KEY.startsWith(scopePrefix)) return;
  const fresh = { ...DEFAULT_UNDERLINE_TABS_TOKENS };
  safeStorage.remove(STORAGE_KEY);
  useUnderlineTabsStore.setState(fresh);
});

crossClientSync.subscribeKey<UnderlineTabsTokens>(SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  const merged = normalizeTokens(remote);
  writeStorageJson(STORAGE_KEY, merged);
  useUnderlineTabsStore.setState(merged);
});
