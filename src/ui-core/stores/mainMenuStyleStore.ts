import { create } from 'zustand';
import { syncBridge } from './syncBridge';
import type { JetBrainsMonoFontWeight } from '../tokens/colors';
import {
  createMainMenuStylePresets,
  detectIsAppleDeviceImpl,
  normalizeMainMenuContextModeImpl,
  type MainMenuFontFamilyMode,
  type MainMenuIconColorToken,
  type MainMenuIconColorValue,
  type MainMenuItemSlotId,
  type MainMenuPlatformPreviewMode,
  type MainMenuPreviewContextMode,
  type MainMenuResumeHighlightStyle,
  type MainMenuRowAlignMode,
  type MainMenuStyleParams,
  type MainMenuStylePreset,
  type MainMenuStyleVariant,
  type ResolvedMainMenuTypography,
} from './mainMenuStylePresetsInternal';

export type {
  MainMenuIconColorToken,
  MainMenuIconColorValue,
  MainMenuStyleVariant,
  MainMenuFontFamilyMode,
  MainMenuRowAlignMode,
  MainMenuResumeHighlightStyle,
  MainMenuItemSlotId,
  MainMenuStyleParams,
  MainMenuPlatformPreviewMode,
  MainMenuPreviewContextMode,
  ResolvedMainMenuTypography,
  MainMenuStylePreset,
};

export const MAIN_MENU_ITEM_SLOTS: {
  id: MainMenuItemSlotId;
  label: string;
  shortTitle: string;
}[] = [
  { id: 'resume', label: 'Resume (Return to Match)', shortTitle: 'Resume' },
  { id: 'play', label: 'Play (Mode Selection)', shortTitle: 'Play' },
  { id: 'garage', label: 'Garage (Vehicle Customization)', shortTitle: 'Garage' },
  { id: 'settings', label: 'Settings (System Preferences)', shortTitle: 'Settings' },
  { id: 'configure', label: 'Configure (Room / Training Setup)', shortTitle: 'Configure' },
  { id: 'restart', label: 'Restart (Restart Match)', shortTitle: 'Restart Match' },
  { id: 'leave', label: 'Leave / Exit (Leave Session)', shortTitle: 'Exit / Leave' },
];

export const DEFAULT_MAIN_MENU_ITEM_COLORS: Record<MainMenuItemSlotId, MainMenuIconColorValue> = {
  resume: 'neutral',
  play: 'amber',
  garage: 'sky',
  settings: 'emerald',
  configure: 'amber',
  restart: 'purple',
  leave: 'rose',
};

export const MAIN_MENU_APPLE_SANS_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const MAIN_MENU_JETBRAINS_MONO_STACK =
  '"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const DEFAULT_MAIN_MENU_MONO_FALLBACK_WEIGHT: JetBrainsMonoFontWeight = 400;

export const normalizeMainMenuContextMode = (
  raw?: string | null
): Exclude<MainMenuPreviewContextMode, 'match' | 'custom-match-host' | 'custom-match-client'> =>
  normalizeMainMenuContextModeImpl(raw);

export const detectIsAppleDevice = (): boolean => detectIsAppleDeviceImpl();

export const resolveMainMenuTitleTypography = (
  fontFamilyMode: MainMenuFontFamilyMode,
  configuredWeight: JetBrainsMonoFontWeight,
  platformPreviewMode: MainMenuPlatformPreviewMode = 'auto',
  fallbackMonoWeight: JetBrainsMonoFontWeight = DEFAULT_MAIN_MENU_MONO_FALLBACK_WEIGHT
): ResolvedMainMenuTypography => {
  if (fontFamilyMode === 'mono') {
    return {
      fontFamily: MAIN_MENU_JETBRAINS_MONO_STACK,
      fontWeight: configuredWeight,
      isUsingMonoFallback: false,
    };
  }
  const isApple =
    platformPreviewMode === 'apple'
      ? true
      : platformPreviewMode === 'non-apple-fallback'
      ? false
      : detectIsAppleDevice();

  if (!isApple) {
    return {
      fontFamily: MAIN_MENU_JETBRAINS_MONO_STACK,
      fontWeight: fallbackMonoWeight,
      isUsingMonoFallback: true,
    };
  }
  return {
    fontFamily: MAIN_MENU_APPLE_SANS_STACK,
    fontWeight: configuredWeight,
    isUsingMonoFallback: false,
  };
};

export const MAIN_MENU_STYLE_CONFIG: MainMenuStyleParams = {
  variant: 'large-clean-row',
  conciseResumeLabel: true,
  showDescription: false,
  itemPaddingXPx: 18,
  itemPaddingYPx: 12,
  itemMinHeightPx: 50,
  itemRadiusPx: 12,
  itemBorderWidthPx: 1,
  itemGapPx: 12,
  showDividers: true,
  dividerMarginYPx: -5,
  menuContainerPaddingPx: 0,
  titleFontFamily: 'sans',
  titleFontSizePx: 24,
  titleFontWeight: 800,
  titleLetterSpacingEm: 0,
  titleLineHeight: 1,
  titleUppercase: false,
  descFontSizePx: 12,
  descLineHeight: 1.4,
  titleDescGapPx: 2,
  showIcon: true,
  iconSizePx: 20,
  iconStrokeWidth: 2,
  showIconBox: false,
  iconBoxSizePx: 36,
  iconBoxRadiusPx: 9,
  iconTitleGapPx: 12,
  rowContentAlign: 'left',
  resumeHighlightStyle: 'solid-primary',
  showShortcutBadge: true,
  showRightArrow: true,
  rightArrowSizePx: 16,
  headerFontFamily: 'sans',
  headerFontSizePx: 20,
  headerFontWeight: 800,
  headerLetterSpacingEm: 0.1,
  headerPaddingXPx: 24,
  headerPaddingTopPx: 20,
  headerPaddingBottomPx: 16,
  contentPaddingXPx: 24,
  contentPaddingYPx: 14,
  showFooter: true,
  footerPaddingXPx: 24,
  footerPaddingYPx: 14,
  footerFontSizePx: 11,
  watermarkSizePx: 68,
  watermarkOpacityPct: 26,
  watermarkHoverOpacityPct: 45,
  watermarkStrokeWidth: 1.6,
  watermarkRotateDeg: -12,
  watermarkOffsetXPx: 8,
  watermarkOffsetYPx: 0,
  usePerItemIconColors: false,
  itemIconColors: { ...DEFAULT_MAIN_MENU_ITEM_COLORS },
};

export const DEFAULT_MAIN_MENU_STYLE_PARAMS: MainMenuStyleParams = MAIN_MENU_STYLE_CONFIG;

export const MAIN_MENU_STYLE_PRESETS: MainMenuStylePreset[] =
  createMainMenuStylePresets(MAIN_MENU_STYLE_CONFIG);

interface SyncedMainMenuStorePayload extends MainMenuStyleParams {
  platformPreviewMode: MainMenuPlatformPreviewMode;
  titleOffsetYPx: number;
  previewContextMode: MainMenuPreviewContextMode;
}

const DEFAULT_SYNCED_MAIN_MENU_PAYLOAD: SyncedMainMenuStorePayload = {
  ...DEFAULT_MAIN_MENU_STYLE_PARAMS,
  platformPreviewMode: 'auto',
  titleOffsetYPx: 0,
  previewContextMode: 'freeplay',
};

interface MainMenuStyleStore extends SyncedMainMenuStorePayload {
  setPlatformPreviewMode: (mode: MainMenuPlatformPreviewMode) => void;
  setTitleOffsetYPx: (offsetPx: number) => void;
  setPreviewContextMode: (ctx: MainMenuPreviewContextMode) => void;
  setParam: <K extends keyof MainMenuStyleParams>(key: K, value: MainMenuStyleParams[K]) => void;
  setVariant: (variant: MainMenuStyleVariant) => void;
  setItemIconColor: (slotId: MainMenuItemSlotId, color: MainMenuIconColorValue) => void;
  applyPreset: (params: Partial<MainMenuStyleParams>) => void;
  resetParams: () => void;
  exportConfigCode: () => string;
}

const SYNC_KEY = 'store:mainMenuStyle:v2';

let isApplyingRemote = false;

export const useMainMenuStyleStore = create<MainMenuStyleStore>((set, get) => {
  const initialSnapshot = syncBridge.get<Partial<SyncedMainMenuStorePayload>>(
    SYNC_KEY,
    DEFAULT_SYNCED_MAIN_MENU_PAYLOAD
  );
  const mergedInitial: SyncedMainMenuStorePayload = {
    ...DEFAULT_SYNCED_MAIN_MENU_PAYLOAD,
    ...(initialSnapshot || {}),
    previewContextMode: normalizeMainMenuContextMode(initialSnapshot?.previewContextMode),
    itemIconColors: {
      ...DEFAULT_MAIN_MENU_ITEM_COLORS,
      ...(initialSnapshot?.itemIconColors || {}),
    },
  };

  const broadcastState = (state: MainMenuStyleStore) => {
    if (isApplyingRemote) return;
    const payload: Partial<SyncedMainMenuStorePayload> = {};
    (
      Object.keys(DEFAULT_SYNCED_MAIN_MENU_PAYLOAD) as (keyof SyncedMainMenuStorePayload)[]
    ).forEach((k) => {
      (payload as Record<string, unknown>)[k] = state[k];
    });
    syncBridge.set(SYNC_KEY, payload);
  };

  return {
    ...mergedInitial,
    setPlatformPreviewMode: (mode) => {
      set({ platformPreviewMode: mode });
      broadcastState(get());
    },
    setTitleOffsetYPx: (offsetPx) => {
      set({ titleOffsetYPx: offsetPx });
      broadcastState(get());
    },
    setPreviewContextMode: (ctx) => {
      set({ previewContextMode: normalizeMainMenuContextMode(ctx) });
      broadcastState(get());
    },
    setParam: (key, value) => {
      set((prev) => {
        const patch: Partial<MainMenuStyleParams> = { [key]: value };
        if (key === 'showDescription' && value === true && prev.variant === 'large-clean-row') {
          patch.variant = 'classic-descriptive-row';
        } else if (
          key === 'showDescription' &&
          value === false &&
          prev.variant === 'classic-descriptive-row'
        ) {
          patch.variant = 'large-clean-row';
        }
        if (key === 'titleFontFamily' && value === 'mono' && prev.titleFontWeight === 800) {
          patch.titleFontWeight = DEFAULT_MAIN_MENU_MONO_FALLBACK_WEIGHT;
        } else if (
          key === 'titleFontFamily' &&
          value === 'sans' &&
          prev.titleFontWeight === DEFAULT_MAIN_MENU_MONO_FALLBACK_WEIGHT
        ) {
          patch.titleFontWeight = 800;
        }
        return patch as Partial<MainMenuStyleStore>;
      });
      broadcastState(get());
    },
    setVariant: (variant) => {
      set(() => {
        if (variant === 'classic-descriptive-row') {
          return {
            variant,
            showDescription: true,
          };
        }
        return {
          variant,
          showDescription: false,
        };
      });
      broadcastState(get());
    },
    setItemIconColor: (slotId, color) => {
      set((prev) => ({
        usePerItemIconColors: true,
        itemIconColors: {
          ...prev.itemIconColors,
          [slotId]: color,
        },
      }));
      broadcastState(get());
    },
    applyPreset: (params) => {
      set((prev) => ({
        ...prev,
        ...params,
        itemIconColors: {
          ...prev.itemIconColors,
          ...(params.itemIconColors || {}),
        },
      }));
      broadcastState(get());
    },
    resetParams: () => {
      set((prev) => ({
        ...DEFAULT_MAIN_MENU_STYLE_PARAMS,
        itemIconColors: { ...DEFAULT_MAIN_MENU_ITEM_COLORS },
        platformPreviewMode: 'auto',
        titleOffsetYPx: 0,
        previewContextMode: prev.previewContextMode || 'freeplay',
      }));
      broadcastState(get());
    },
    exportConfigCode: () => {
      const s = get();
      const exported: Record<string, unknown> = {};
      (Object.keys(DEFAULT_MAIN_MENU_STYLE_PARAMS) as (keyof MainMenuStyleParams)[]).forEach(
        (k) => {
          exported[k] = s[k];
        }
      );
      return `// Layer 1 Main Menu Style Configuration (stores/mainMenuStyleStore.ts)\nexport const MAIN_MENU_STYLE_CONFIG: MainMenuStyleParams = ${JSON.stringify(
        exported,
        null,
        2
      )};`;
    },
  };
});

syncBridge.registerDefault(SYNC_KEY, DEFAULT_SYNCED_MAIN_MENU_PAYLOAD);

syncBridge.subscribeKey<Partial<SyncedMainMenuStorePayload>>(SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  isApplyingRemote = true;
  try {
    useMainMenuStyleStore.setState((prev) => ({
      ...prev,
      ...remote,
      previewContextMode: normalizeMainMenuContextMode(
        remote.previewContextMode ?? prev.previewContextMode
      ),
      itemIconColors: {
        ...prev.itemIconColors,
        ...(remote.itemIconColors || {}),
      },
    }));
  } finally {
    isApplyingRemote = false;
  }
});
