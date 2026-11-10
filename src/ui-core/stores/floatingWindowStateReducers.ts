/**
 * floatingWindowStateReducers.ts
 * Pure state transition reducers, types, and persistence hooks for `floatingStore`.
 */

import type { PresetConfig } from './floatingPresets';

export type FloatingWindowConfig = PresetConfig;

export interface FloatingStorePersistenceHooks {
  getInitialOpacity?: () => number;
  onSaveOpacity?: (opacity: number) => void;
}

let persistenceHooks: FloatingStorePersistenceHooks = {};

export function setFloatingStorePersistenceHooks(hooks: FloatingStorePersistenceHooks): void {
  persistenceHooks = { ...persistenceHooks, ...hooks };
}

export function getSavedOrDefaultFloatingOpacity(): number {
  if (persistenceHooks.getInitialOpacity) {
    const val = persistenceHooks.getInitialOpacity();
    if (typeof val === 'number' && Number.isFinite(val)) {
      return Math.max(1, Math.min(100, Math.round(val)));
    }
  }
  return 85;
}

export function notifySavedFloatingOpacity(opacity: number): void {
  persistenceHooks.onSaveOpacity?.(opacity);
}

export interface FloatingWindowItem {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  /** Optional manually calibrated minWidth (strictly integer 1px unit) overriding auto-detection */
  manualMinWidth?: number;
  /** Auto-detected minimum width (integer 1px unit, including scrollbar reserve) reported by FloatingWindowManager */
  autoMinWidth?: number;
  /** Vertical scrollbar width reserved in minWidth (integer 1px unit, 16px for resizable windows) */
  scrollbarReservePx?: number;
  minHeight?: number;
  /** Optional manually calibrated minHeight (strictly integer 1px unit) overriding preset minHeight */
  manualMinHeight?: number;
  /** Intrinsic full content height (Header + Content + Footer + 2px border) reported by FloatingWindowManager */
  intrinsicMaxHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  autoFitHeight?: boolean;
  /** True once the user explicitly resizes the window via corner handle */
  userAdjustedSize?: boolean;
  isMinimized: boolean;
  position?: { x: number; y: number };
  resizable?: boolean;
  singleton?: boolean;
  defaultCenter?: boolean;
}

export interface FlyingGhostState {
  id: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  destX: number;
  destY: number;
  preset: PresetConfig;
  targetHadStack: boolean;
}

export interface FloatingWindowState {
  /** Map of registered floating windows */
  windows: FloatingWindowItem[];
  /** Order of windows for z-index layering (last is on top) */
  windowOrder: string[];
  /** Whether the stack tray dropdown in top-right is open */
  isStackTrayOpen: boolean;
  /** Whether the stack icon itself in top-right is dismissed by user (when window count == 0) */
  isStackDismissed: boolean;
  /** Currently active (focused) restored window id */
  focusedWindowId: string | null;
  /** Currently active spawning flight animation to top-right Stack */
  activeFlight: FlyingGhostState | null;
  /** Counter signal to trigger animated batch minimization of all open windows */
  batchMinimizeSignal: number;
  /** Global opacity (1..100%) applied to floating windows */
  opacity: number;
}

export const DEFAULT_FLOATING_STATE: FloatingWindowState = {
  windows: [],
  windowOrder: [],
  isStackTrayOpen: false,
  isStackDismissed: true,
  focusedWindowId: null,
  activeFlight: null,
  batchMinimizeSignal: 0,
  opacity: getSavedOrDefaultFloatingOpacity(),
};

export function normalizeFloatingState(
  raw?: Partial<FloatingWindowState> | null
): FloatingWindowState {
  return {
    ...DEFAULT_FLOATING_STATE,
    ...(raw && typeof raw === 'object' ? raw : {}),
    windows: Array.isArray(raw?.windows) ? raw.windows : [],
    windowOrder: Array.isArray(raw?.windowOrder) ? raw.windowOrder : [],
    opacity:
      typeof raw?.opacity === 'number' ? raw.opacity : getSavedOrDefaultFloatingOpacity(),
  };
}

export function reduceSpawnWindow(
  state: FloatingWindowState,
  item: Omit<FloatingWindowItem, 'isMinimized'> & { startMinimized?: boolean }
): FloatingWindowState {
  const shouldMinimize = item.startMinimized ?? false;
  const existing = state.windows.find((w) => w.id === item.id);
  if (existing) {
    const nextMinimized = shouldMinimize ? true : false;
    const nextOrder = nextMinimized
      ? state.windowOrder.filter((id) => id !== item.id)
      : state.windowOrder.filter((id) => id !== item.id).concat(item.id);
    return {
      ...state,
      windows: state.windows.map((w) =>
        w.id === item.id ? { ...w, isMinimized: nextMinimized } : w
      ),
      windowOrder: nextOrder,
      isStackDismissed: false,
      focusedWindowId: nextMinimized
        ? state.focusedWindowId === item.id
          ? null
          : state.focusedWindowId
        : item.id,
      isStackTrayOpen: false,
    };
  }

  const isCenter = item.id === 'floating-window-opacity' || item.defaultCenter;
  let defaultPos = {
    x: 40 + (state.windows.length % 5) * 32,
    y: 40 + (state.windows.length % 5) * 32,
  };
  if (isCenter && typeof window !== 'undefined') {
    const w = item.width ?? 360;
    const h = item.height ?? 123;
    defaultPos = {
      x: Math.max(20, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(20, Math.round((window.innerHeight - h) / 2)),
    };
  }

  const newItem: FloatingWindowItem = {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    category: item.category,
    width: item.width ?? 440,
    height: item.height ?? 300,
    minWidth: item.minWidth,
    manualMinWidth: item.manualMinWidth,
    minHeight: item.minHeight,
    manualMinHeight: item.manualMinHeight,
    maxWidth: item.maxWidth,
    maxHeight: item.maxHeight,
    autoFitHeight: item.autoFitHeight,
    userAdjustedSize: item.userAdjustedSize ?? false,
    isMinimized: shouldMinimize,
    position: item.position ?? defaultPos,
    resizable: item.resizable ?? true,
    singleton: item.singleton,
    defaultCenter: item.defaultCenter,
  };

  const nextOrder = newItem.isMinimized
    ? state.windowOrder
    : state.windowOrder.filter((id) => id !== newItem.id).concat(newItem.id);

  return {
    ...state,
    windows: [...state.windows, newItem],
    windowOrder: nextOrder,
    isStackDismissed: false,
    focusedWindowId: newItem.isMinimized ? state.focusedWindowId : newItem.id,
  };
}

export function reduceSpawnWithFlight(
  state: FloatingWindowState,
  preset: PresetConfig,
  sourceEl: HTMLElement,
  containerEl: HTMLElement
): FloatingWindowState {
  const srcRect = sourceEl.getBoundingClientRect();
  const contRect = containerEl.getBoundingClientRect();
  const localW =
    containerEl.clientWidth > 0 ? Math.floor(containerEl.clientWidth) : Math.floor(contRect.width);
  const localH =
    containerEl.clientHeight > 0
      ? Math.floor(containerEl.clientHeight)
      : Math.floor(contRect.height);
  const scaleX = localW > 0 && contRect.width > 0 ? contRect.width / localW : 1;
  const scaleY = localH > 0 && contRect.height > 0 ? contRect.height / localH : 1;
  const startX = Math.round((srcRect.left - contRect.left) / scaleX);
  const startY = Math.round((srcRect.top - contRect.top) / scaleY);
  const startW = Math.round(srcRect.width / scaleX);
  const startH = Math.round(srcRect.height / scaleY);
  const destX = Math.max(16, Math.round(localW - 56));
  const destY = 16;
  const minimizedCount = state.windows.filter((w) => w.isMinimized).length;
  const hasStack = !(state.isStackDismissed && minimizedCount === 0);
  const flightId = `${preset.id}-${Date.now()}`;

  return {
    ...state,
    activeFlight: {
      id: flightId,
      startX,
      startY,
      startW,
      startH,
      destX,
      destY,
      preset,
      targetHadStack: hasStack,
    },
  };
}

export function reduceCompleteFlight(state: FloatingWindowState): FloatingWindowState {
  if (!state.activeFlight) return state;
  const { preset } = state.activeFlight;
  const isSingleton = preset.singleton ?? false;
  const winId = isSingleton ? preset.id : `${preset.id}-${Date.now().toString().slice(-4)}`;
  const existingIndex = state.windows.findIndex((w) => w.id === winId);
  let nextWindows = state.windows;

  if (existingIndex >= 0) {
    nextWindows = state.windows.map((w, idx) =>
      idx === existingIndex ? { ...w, isMinimized: true } : w
    );
  } else {
    const newItem: FloatingWindowItem = {
      id: winId,
      title: preset.title,
      subtitle: preset.summary,
      category: preset.category,
      width: preset.width,
      height: preset.height,
      minWidth: preset.minWidth,
      minHeight: preset.minHeight,
      maxWidth: preset.maxWidth,
      maxHeight: preset.maxHeight,
      autoFitHeight: preset.autoFitHeight,
      isMinimized: true,
      resizable: preset.resizable,
      position: {
        x: 40 + (state.windows.length % 5) * 32,
        y: 40 + (state.windows.length % 5) * 32,
      },
    };
    nextWindows = [...state.windows, newItem];
  }

  return { ...state, windows: nextWindows, isStackDismissed: false, activeFlight: null };
}
