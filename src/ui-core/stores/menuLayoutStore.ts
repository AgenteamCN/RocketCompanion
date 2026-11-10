import { create } from 'zustand';
import { syncBridge } from './syncBridge';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
  safeStorage,
} from '../config/storageHelpers';
import {
  CANONICAL_PANEL_SIZING,
  DEFAULT_MENU_LAYOUT_TOKENS,
  DEFAULT_PANEL_SHELL_TOKENS,
  type CanonicalMenuPanelId,
  type MenuLayoutTokens,
  type MenuPanelId,
  type PanelSizingConfig,
} from '../tokens/menuLayoutTokens';

const STORAGE_KEY = STORAGE_KEYS.MENU_LAYOUT_TOKENS;

export const normalizePanels = (
  rawPanels?: Partial<Record<MenuPanelId, Partial<PanelSizingConfig>>>
): Record<MenuPanelId, PanelSizingConfig> => {
  const merged = {} as Record<MenuPanelId, PanelSizingConfig>;
  (Object.keys(CANONICAL_PANEL_SIZING) as CanonicalMenuPanelId[]).forEach((id) => {
    const incoming = rawPanels && typeof rawPanels === 'object' ? rawPanels[id] : undefined;
    const isStaleStaticTrainingPanel =
      (id === 'layer4-static-training-pack' || id === 'layer3-dev-tem-pack-converter') &&
      incoming &&
      (incoming.mode === 'auto' ||
        (typeof incoming.width === 'number' && incoming.width < 900) ||
        (typeof incoming.targetHeight === 'number' && incoming.targetHeight < 700));
    merged[id] = isStaleStaticTrainingPanel
      ? { ...CANONICAL_PANEL_SIZING[id] }
      : {
          ...CANONICAL_PANEL_SIZING[id],
          ...(incoming && typeof incoming === 'object' ? incoming : {}),
        };
  });
  return merged;
};

const syncLegacyFields = (tokens: MenuLayoutTokens): MenuLayoutTokens => {
  const safePanels = normalizePanels(tokens?.panels);
  return {
    ...DEFAULT_MENU_LAYOUT_TOKENS,
    ...tokens,
    showAdditionalPreviews: false,
    panels: safePanels,
    panelHeaderBackBtnSize:
      tokens.panelHeaderBackBtnHeight ?? DEFAULT_PANEL_SHELL_TOKENS.panelHeaderBackBtnHeight,
    layer1Width: safePanels['layer1-main'].width,
    layer1Height: safePanels['layer1-main'].targetHeight,
    layer2Width: safePanels['layer2-settings'].width,
    layer2Height: safePanels['layer2-settings'].targetHeight,
    layer3Width: safePanels['layer3-host-match'].width,
    layer3Height: safePanels['layer3-host-match'].targetHeight,
  };
};

const cloneDefaultTokens = (): MenuLayoutTokens => {
  return syncLegacyFields({
    ...DEFAULT_MENU_LAYOUT_TOKENS,
    panels: normalizePanels(),
  });
};

const loadSavedTokens = (): MenuLayoutTokens => {
  const base = cloneDefaultTokens();
  const parsed = readStorageJson<Partial<MenuLayoutTokens>>(STORAGE_KEY, base);
  return syncLegacyFields({
    ...base,
    ...parsed,
    panels: normalizePanels(parsed?.panels),
  });
};

const extractTokens = (state: MenuLayoutTokens): MenuLayoutTokens =>
  syncLegacyFields({
    panels: normalizePanels(state.panels),
    dividerMarginY: state.dividerMarginY,
    menuItemGap: state.menuItemGap,
    menuItemPaddingY: state.menuItemPaddingY,
    menuContainerPadding: state.menuContainerPadding,
    panelContentPaddingY: state.panelContentPaddingY,
    showAdditionalPreviews: state.showAdditionalPreviews,
    simulateLayer3Error: state.simulateLayer3Error,
    lockPanelPaddingX: state.lockPanelPaddingX,
    panelHeaderPaddingX: state.panelHeaderPaddingX,
    panelHeaderPaddingY: state.panelHeaderPaddingY,
    panelHeaderTitleFontSize: state.panelHeaderTitleFontSize,
    lockPanelHeaderBackBtnAspect: state.lockPanelHeaderBackBtnAspect,
    panelHeaderBackBtnWidth: state.panelHeaderBackBtnWidth,
    panelHeaderBackBtnHeight: state.panelHeaderBackBtnHeight,
    panelHeaderBackBtnSize: state.panelHeaderBackBtnHeight,
    panelHeaderBackBtnShowArrow: state.panelHeaderBackBtnShowArrow,
    panelHeaderBackBtnShowLabel: state.panelHeaderBackBtnShowLabel,
    panelHeaderBackBtnIdleTone: state.panelHeaderBackBtnIdleTone,
    panelHeaderBackBtnStyle: state.panelHeaderBackBtnStyle,
    panelHeaderBackBtnRadiusMode: state.panelHeaderBackBtnRadiusMode,
    panelHeaderBackBtnRadius: state.panelHeaderBackBtnRadius,
    panelHeaderBackBtnInnerRadius: state.panelHeaderBackBtnInnerRadius,
    panelHeaderBackBtnRadiusTL: state.panelHeaderBackBtnRadiusTL,
    panelHeaderBackBtnRadiusTR: state.panelHeaderBackBtnRadiusTR,
    panelHeaderBackBtnRadiusBR: state.panelHeaderBackBtnRadiusBR,
    panelHeaderBackBtnRadiusBL: state.panelHeaderBackBtnRadiusBL,
    panelHeaderShowRightBtn: state.panelHeaderShowRightBtn,
    panelHeaderRightBtnTransform: state.panelHeaderRightBtnTransform,
    panelHeaderRightBtnExpandOnHover: state.panelHeaderRightBtnExpandOnHover,
    panelOuterRadius: state.panelOuterRadius,
    panelHeaderGap: state.panelHeaderGap,
    panelBodyPaddingX: state.panelBodyPaddingX,
    panelBodyPaddingY: state.panelBodyPaddingY,
    panelFooterPaddingX: state.panelFooterPaddingX,
    panelFooterPaddingY: state.panelFooterPaddingY,
    panelFooterFontSize: state.panelFooterFontSize,
    panelFooterSplitRight: state.panelFooterSplitRight,
    panelFooterRightDivider: state.panelFooterRightDivider,
    panelFooterRightPaddingX: state.panelFooterRightPaddingX,
    floatingOuterRadius:
      state.floatingOuterRadius ?? DEFAULT_PANEL_SHELL_TOKENS.floatingOuterRadius,
    floatingHeaderPaddingX:
      state.floatingHeaderPaddingX ?? DEFAULT_PANEL_SHELL_TOKENS.floatingHeaderPaddingX,
    floatingHeaderPaddingY:
      state.floatingHeaderPaddingY ?? DEFAULT_PANEL_SHELL_TOKENS.floatingHeaderPaddingY,
    floatingHeaderTitleFontSize:
      state.floatingHeaderTitleFontSize ??
      DEFAULT_PANEL_SHELL_TOKENS.floatingHeaderTitleFontSize,
    floatingHeaderMinimizeBtnSize:
      state.floatingHeaderMinimizeBtnSize ??
      DEFAULT_PANEL_SHELL_TOKENS.floatingHeaderMinimizeBtnSize,
    floatingHeaderMinimizeBtnRadius:
      state.floatingHeaderMinimizeBtnRadius ??
      DEFAULT_PANEL_SHELL_TOKENS.floatingHeaderMinimizeBtnRadius,
    floatingBodyPaddingX:
      state.floatingBodyPaddingX ?? DEFAULT_PANEL_SHELL_TOKENS.floatingBodyPaddingX,
    floatingBodyPaddingY:
      state.floatingBodyPaddingY ?? DEFAULT_PANEL_SHELL_TOKENS.floatingBodyPaddingY,
    floatingFooterPaddingX:
      state.floatingFooterPaddingX ?? DEFAULT_PANEL_SHELL_TOKENS.floatingFooterPaddingX,
    floatingFooterPaddingY:
      state.floatingFooterPaddingY ?? DEFAULT_PANEL_SHELL_TOKENS.floatingFooterPaddingY,
    floatingFooterCornerReserveRightPx:
      state.floatingFooterCornerReserveRightPx ??
      DEFAULT_PANEL_SHELL_TOKENS.floatingFooterCornerReserveRightPx,
    floatingFooterFontSize:
      state.floatingFooterFontSize ?? DEFAULT_PANEL_SHELL_TOKENS.floatingFooterFontSize,
    layer1Width: state.layer1Width,
    layer1Height: state.layer1Height,
    layer2Width: state.layer2Width,
    layer2Height: state.layer2Height,
    layer3Width: state.layer3Width,
    layer3Height: state.layer3Height,
  });

const SYNC_KEY = 'store:menuLayout:v5';

const saveTokens = (tokens: MenuLayoutTokens) => {
  if (!syncBridge.isApplyingRemote()) {
    syncBridge.set(SYNC_KEY, tokens);
  }
  writeStorageJson(STORAGE_KEY, tokens);
};

export interface MenuLayoutStore extends MenuLayoutTokens {
  setToken: <K extends keyof MenuLayoutTokens>(key: K, value: MenuLayoutTokens[K]) => void;
  updateTokens: (patch: Partial<MenuLayoutTokens>) => void;
  setPanelSizing: (panelId: MenuPanelId, patch: Partial<PanelSizingConfig>) => void;
  resetPanelSizing: (panelId: MenuPanelId) => void;
  resetPanelShellTokens: () => void;
  resetTokens: () => void;
  exportPanelShellConfigCode: () => string;
  exportConfigCode: () => string;
}

const buildShellTokensSnapshot = (s: MenuLayoutTokens) => ({
  lockPanelPaddingX: s.lockPanelPaddingX,
  panelHeaderPaddingX: s.panelHeaderPaddingX,
  panelHeaderPaddingY: s.panelHeaderPaddingY,
  panelHeaderTitleFontSize: s.panelHeaderTitleFontSize,
  lockPanelHeaderBackBtnAspect: s.lockPanelHeaderBackBtnAspect,
  panelHeaderBackBtnWidth: s.panelHeaderBackBtnWidth,
  panelHeaderBackBtnHeight: s.panelHeaderBackBtnHeight,
  panelHeaderBackBtnSize: s.panelHeaderBackBtnHeight,
  panelHeaderBackBtnShowArrow: s.panelHeaderBackBtnShowArrow,
  panelHeaderBackBtnShowLabel: s.panelHeaderBackBtnShowLabel,
  panelHeaderBackBtnIdleTone: s.panelHeaderBackBtnIdleTone,
  panelHeaderBackBtnStyle: s.panelHeaderBackBtnStyle,
  panelHeaderBackBtnRadiusMode: s.panelHeaderBackBtnRadiusMode,
  panelHeaderBackBtnRadius: s.panelHeaderBackBtnRadius,
  panelHeaderBackBtnInnerRadius: s.panelHeaderBackBtnInnerRadius,
  panelHeaderBackBtnRadiusTL: s.panelHeaderBackBtnRadiusTL,
  panelHeaderBackBtnRadiusTR: s.panelHeaderBackBtnRadiusTR,
  panelHeaderBackBtnRadiusBR: s.panelHeaderBackBtnRadiusBR,
  panelHeaderBackBtnRadiusBL: s.panelHeaderBackBtnRadiusBL,
  panelHeaderShowRightBtn: s.panelHeaderShowRightBtn,
  panelHeaderRightBtnTransform: s.panelHeaderRightBtnTransform,
  panelHeaderRightBtnExpandOnHover: s.panelHeaderRightBtnExpandOnHover,
  panelOuterRadius: s.panelOuterRadius,
  panelHeaderGap: s.panelHeaderGap,
  panelBodyPaddingX: s.panelBodyPaddingX,
  panelBodyPaddingY: s.panelBodyPaddingY,
  panelFooterPaddingX: s.panelFooterPaddingX,
  panelFooterPaddingY: s.panelFooterPaddingY,
  panelFooterFontSize: s.panelFooterFontSize,
  panelFooterSplitRight: s.panelFooterSplitRight,
  panelFooterRightDivider: s.panelFooterRightDivider,
  panelFooterRightPaddingX: s.panelFooterRightPaddingX,
  floatingOuterRadius: s.floatingOuterRadius,
  floatingHeaderPaddingX: s.floatingHeaderPaddingX,
  floatingHeaderPaddingY: s.floatingHeaderPaddingY,
  floatingHeaderTitleFontSize: s.floatingHeaderTitleFontSize,
  floatingHeaderMinimizeBtnSize: s.floatingHeaderMinimizeBtnSize,
  floatingHeaderMinimizeBtnRadius: s.floatingHeaderMinimizeBtnRadius,
  floatingBodyPaddingX: s.floatingBodyPaddingX,
  floatingBodyPaddingY: s.floatingBodyPaddingY,
  floatingFooterPaddingX: s.floatingFooterPaddingX,
  floatingFooterPaddingY: s.floatingFooterPaddingY,
  floatingFooterCornerReserveRightPx: s.floatingFooterCornerReserveRightPx,
  floatingFooterFontSize: s.floatingFooterFontSize,
});

const rawInitialTokens = syncBridge.get<MenuLayoutTokens>(SYNC_KEY, loadSavedTokens());
const initialMenuLayoutTokens = syncLegacyFields({
  ...cloneDefaultTokens(),
  ...rawInitialTokens,
  panels: normalizePanels(rawInitialTokens?.panels),
});

export const useMenuLayoutStore = create<MenuLayoutStore>((set, get) => ({
  ...initialMenuLayoutTokens,

  setToken: (key, value) => {
    set((state) => {
      const patch: Partial<MenuLayoutTokens> = { [key]: value };
      if (key === 'panelHeaderBackBtnShowArrow' && value === false && !state.panelHeaderBackBtnShowLabel) {
        patch.panelHeaderBackBtnShowLabel = true;
      } else if (key === 'panelHeaderBackBtnShowLabel' && value === false && !state.panelHeaderBackBtnShowArrow) {
        patch.panelHeaderBackBtnShowArrow = true;
      }
      if (
        state.lockPanelPaddingX &&
        typeof value === 'number' &&
        (key === 'panelHeaderPaddingX' ||
          key === 'panelBodyPaddingX' ||
          key === 'panelFooterPaddingX')
      ) {
        patch.panelHeaderPaddingX = value;
        patch.panelBodyPaddingX = value;
        patch.panelFooterPaddingX = value;
      }
      if (key === 'lockPanelPaddingX' && value === true) {
        patch.panelBodyPaddingX = state.panelHeaderPaddingX;
        patch.panelFooterPaddingX = state.panelHeaderPaddingX;
      }
      if (key === 'panelHeaderBackBtnSize' && typeof value === 'number') {
        patch.panelHeaderBackBtnWidth = value;
        patch.panelHeaderBackBtnHeight = value;
      } else if (
        state.lockPanelHeaderBackBtnAspect &&
        typeof value === 'number' &&
        (key === 'panelHeaderBackBtnWidth' || key === 'panelHeaderBackBtnHeight')
      ) {
        patch.panelHeaderBackBtnWidth = value;
        patch.panelHeaderBackBtnHeight = value;
      } else if (key === 'lockPanelHeaderBackBtnAspect' && value === true) {
        patch.panelHeaderBackBtnWidth = state.panelHeaderBackBtnHeight;
      }
      const next = syncLegacyFields({
        ...extractTokens(state),
        ...patch,
      });
      saveTokens(next);
      return next;
    });
  },

  updateTokens: (patch) => {
    set((state) => {
      const next = syncLegacyFields({
        ...extractTokens(state),
        ...patch,
      });
      saveTokens(next);
      return next;
    });
  },

  setPanelSizing: (panelId, patch) => {
    set((state) => {
      const currentPanels = normalizePanels(state.panels);
      const nextPanels: Record<MenuPanelId, PanelSizingConfig> = {
        ...currentPanels,
        [panelId]: {
          ...currentPanels[panelId],
          ...patch,
        },
      };
      const next = syncLegacyFields({
        ...extractTokens(state),
        panels: nextPanels,
      });
      saveTokens(next);
      return next;
    });
  },

  resetPanelSizing: (panelId) => {
    set((state) => {
      const currentPanels = normalizePanels(state.panels);
      const nextPanels: Record<MenuPanelId, PanelSizingConfig> = {
        ...currentPanels,
        [panelId]: { ...CANONICAL_PANEL_SIZING[panelId] },
      };
      const next = syncLegacyFields({
        ...extractTokens(state),
        panels: nextPanels,
      });
      saveTokens(next);
      return next;
    });
  },

  resetPanelShellTokens: () => {
    set((state) => {
      const next = syncLegacyFields({
        ...extractTokens(state),
        ...DEFAULT_PANEL_SHELL_TOKENS,
      });
      saveTokens(next);
      return next;
    });
  },

  resetTokens: () => {
    const fresh = cloneDefaultTokens();
    saveTokens(fresh);
    set(() => fresh);
  },

  exportPanelShellConfigCode: () => {
    const s = get();
    return `export const DEFAULT_PANEL_SHELL_TOKENS = ${JSON.stringify(
      buildShellTokensSnapshot(s),
      null,
      2
    )};`;
  },

  exportConfigCode: () => {
    const s = get();
    return `export const DEFAULT_PANEL_SHELL_TOKENS = ${JSON.stringify(
      buildShellTokensSnapshot(s),
      null,
      2
    )};

export const DEFAULT_PANEL_SIZING: Record<MenuPanelId, PanelSizingConfig> = ${JSON.stringify(
      s.panels,
      null,
      2
    )};

export const DEFAULT_MENU_LAYOUT_TOKENS = ${JSON.stringify(
      {
        dividerMarginY: s.dividerMarginY,
        menuItemGap: s.menuItemGap,
        menuItemPaddingY: s.menuItemPaddingY,
        menuContainerPadding: s.menuContainerPadding,
        panelContentPaddingY: s.panelContentPaddingY,
        showAdditionalPreviews: s.showAdditionalPreviews,
      },
      null,
      2
    )};`;
  },
}));

syncBridge.registerDefault(SYNC_KEY, cloneDefaultTokens());

syncBridge.onReset((scopePrefix) => {
  if (scopePrefix && !SYNC_KEY.startsWith(scopePrefix)) return;
  const fresh = cloneDefaultTokens();
  safeStorage.remove(STORAGE_KEY);
  useMenuLayoutStore.setState(fresh);
});

syncBridge.subscribeKey<MenuLayoutTokens>(SYNC_KEY, (remoteTokens) => {
  if (!remoteTokens || typeof remoteTokens !== 'object') return;
  const merged = syncLegacyFields({
    ...extractTokens(useMenuLayoutStore.getState()),
    ...remoteTokens,
    panels: normalizePanels({
      ...useMenuLayoutStore.getState().panels,
      ...(remoteTokens.panels || {}),
    }),
  });
  writeStorageJson(STORAGE_KEY, merged);
  useMenuLayoutStore.setState(merged);
});

export const menuLayoutStore = Object.assign(useMenuLayoutStore, {
  setToken: <K extends keyof MenuLayoutTokens>(key: K, value: MenuLayoutTokens[K]) =>
    useMenuLayoutStore.getState().setToken(key, value),
  updateTokens: (patch: Partial<MenuLayoutTokens>) =>
    useMenuLayoutStore.getState().updateTokens(patch),
  setPanelSizing: (panelId: MenuPanelId, patch: Partial<PanelSizingConfig>) =>
    useMenuLayoutStore.getState().setPanelSizing(panelId, patch),
  resetPanelSizing: (panelId: MenuPanelId) =>
    useMenuLayoutStore.getState().resetPanelSizing(panelId),
  resetPanelShellTokens: () =>
    useMenuLayoutStore.getState().resetPanelShellTokens(),
  resetTokens: () => useMenuLayoutStore.getState().resetTokens(),
  exportPanelShellConfigCode: () =>
    useMenuLayoutStore.getState().exportPanelShellConfigCode(),
  exportConfigCode: () => useMenuLayoutStore.getState().exportConfigCode(),
});
