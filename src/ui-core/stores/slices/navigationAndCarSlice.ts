import { type StateCreator } from 'zustand';
import { floatingStore } from '../floatingStore';
import { STORAGE_KEYS, safeStorage } from '../../config/storageHelpers';
import { getInitialTheme } from '../../config/themeConfig';
import { CAR_VISUAL_IDS } from '../../config/vehicleConstants';
import {
  getInitialCar,
  getPreferredColorHex,
  loadStoredColorPrefs,
  loadStoredPlayerName,
  saveStoredColorPrefs,
} from '../../config/vehiclePresets';
import { ROUTE_PARENT_MAP, type ActiveMenuRoute } from '../../config/uiConfig';
import { type AppState } from '../appStoreTypes';

export const initialTheme = getInitialTheme();

let lastToggleMenuTime = 0;
let lastExpMultiBotsParentRoute: ActiveMenuRoute = 'dev-sandboxes';

export type NavigationAndCarSlice = Pick<
  AppState,
  | 'isOpen'
  | 'activeRoute'
  | 'transitionMode'
  | 'activeCar'
  | 'colorPrefs'
  | 'theme'
  | 'highlightSetting'
  | 'settingsTargetTab'
  | 'isLivePreviewCollapsed'
  | 'bridge'
  | 'setHighlightSetting'
  | 'clearHighlightSetting'
  | 'setSettingsTargetTab'
  | 'setBridge'
  | 'openMenu'
  | 'closeMenu'
  | 'toggleMenu'
  | 'navigate'
  | 'goBack'
  | 'setTransitionMode'
  | 'setActiveCar'
  | 'setColorPrefs'
  | 'setTheme'
  | 'setLivePreviewCollapsed'
  | 'matchMode'
  | 'setMatchMode'
  | 'onlineSession'
  | 'setOnlineSession'
>;

export const createNavigationAndCarSlice: StateCreator<
  AppState,
  [],
  [],
  NavigationAndCarSlice
> = (set, get) => ({
  isOpen: false,
  activeRoute: 'main-menu',
  transitionMode: 'fluid-morph',
  activeCar: getInitialCar(),
  colorPrefs: loadStoredColorPrefs(),
  theme: initialTheme,
  highlightSetting: null,
  settingsTargetTab: 'gameplay',
  isLivePreviewCollapsed: false,
  bridge: {},

  setHighlightSetting: (id) => set({ highlightSetting: id }),
  clearHighlightSetting: () => set({ highlightSetting: null }),
  setSettingsTargetTab: (tab) => set({ settingsTargetTab: tab }),

  setBridge: (bridge) => set((state) => ({ bridge: { ...state.bridge, ...bridge } })),

  openMenu: (route = 'main-menu') => {
    set({ isOpen: true, activeRoute: route, isLivePreviewCollapsed: false });
    get().bridge.onOverlayChange?.(true);
    floatingStore.triggerBatchMinimize();
  },

  closeMenu: () => {
    set({ isOpen: false, activeRoute: 'main-menu', isLivePreviewCollapsed: false });
    const b = get().bridge;
    b.onOverlayChange?.(false);
    b.onResume?.();
  },

  toggleMenu: () => {
    const now = Date.now();
    if (now - lastToggleMenuTime < 180) {
      return;
    }
    lastToggleMenuTime = now;
    const state = get();
    if (state.isOpen) {
      if (state.isLivePreviewCollapsed) {
        state.setLivePreviewCollapsed(false);
      } else {
        state.goBack();
      }
    } else {
      state.openMenu('main-menu');
    }
  },

  navigate: (route) => {
    const current = get().activeRoute;
    const wasCollapsed = get().isLivePreviewCollapsed;
    if (route === 'exp-multi-bots') {
      lastExpMultiBotsParentRoute = current;
    }
    set({ activeRoute: route, isLivePreviewCollapsed: false });
    floatingStore.triggerBatchMinimize();
    if (wasCollapsed) {
      get().bridge.onOverlayChange?.(true);
    }
  },

  goBack: () => {
    const current = get().activeRoute;
    const wasCollapsed = get().isLivePreviewCollapsed;
    if (current === 'exp-multi-bots') {
      set({ activeRoute: lastExpMultiBotsParentRoute, isLivePreviewCollapsed: false });
      floatingStore.triggerBatchMinimize();
      if (wasCollapsed) {
        get().bridge.onOverlayChange?.(true);
      }
      return;
    }
    const parent = ROUTE_PARENT_MAP[current];
    if (parent) {
      set({ activeRoute: parent, isLivePreviewCollapsed: false });
      floatingStore.triggerBatchMinimize();
      if (wasCollapsed) {
        get().bridge.onOverlayChange?.(true);
      }
    } else {
      get().closeMenu();
    }
  },

  setTransitionMode: (mode) => set({ transitionMode: mode }),

  setActiveCar: (carId) => {
    set({ activeCar: carId });
    if ((CAR_VISUAL_IDS as readonly string[]).includes(carId)) {
      safeStorage.set(
        STORAGE_KEYS.DISPLAY_SETTINGS,
        JSON.stringify({ vehiclePreset: carId, carVisual: carId })
      );
    }
    get().bridge.onVehicleChange?.(carId);
  },

  setColorPrefs: (prefs) => {
    const normalized = {
      primaryTeam: prefs.primaryTeam === 'orange' ? ('orange' as const) : ('blue' as const),
      blueOrder:
        Array.isArray(prefs.blueOrder) && prefs.blueOrder.length > 0
          ? prefs.blueOrder.map((n) => Number(n))
          : [1, 5, 3],
      orangeOrder:
        Array.isArray(prefs.orangeOrder) && prefs.orangeOrder.length > 0
          ? prefs.orangeOrder.map((n) => Number(n))
          : [2, 4, 0],
    };
    const activeSlotId = saveStoredColorPrefs(normalized);
    const activeHex = getPreferredColorHex(normalized);
    set({ colorPrefs: normalized });
    get().bridge.onColorChange?.(activeHex, activeSlotId);
  },

  setTheme: (theme) => {
    set({ theme });
    safeStorage.set(STORAGE_KEYS.UI_THEME, theme);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle('light', theme === 'light');
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  },

  setLivePreviewCollapsed: (collapsed) => {
    set({ isLivePreviewCollapsed: collapsed });
    const b = get().bridge;
    if (collapsed) {
      b.onOverlayChange?.(false);
      b.onResume?.();
    } else {
      b.onOverlayChange?.(true);
      floatingStore.triggerBatchMinimize();
    }
  },

  matchMode: 'freeplay',
  setMatchMode: (mode) => set({ matchMode: mode }),
  onlineSession: {
    isHosting: false,
    roomId: '',
    playerName: loadStoredPlayerName(),
    signalingConnected: false,
    roomType: 'match',
    gameMode: '3v3',
    botFillMode: 'auto_fill',
    matchDurationSeconds: 90,
    localTeam: 'neutral',
    isReady: false,
    connectedPeers: [],
  },
  setOnlineSession: (session) =>
    set((s) => ({ onlineSession: { ...s.onlineSession, ...session } })),
});
