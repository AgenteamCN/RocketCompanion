import { useSyncExternalStore } from 'react';
import { syncBridge as crossClientSync } from './syncBridge';
import { STORAGE_KEYS, safeStorage } from '../config/storageHelpers';
import { createExternalStore } from './createExternalStore';

export interface ViewportMetrics {
  scaleFactor: number;
  renderWidth: number;
  renderHeight: number;
  isPortrait: boolean;
  isPillarboxed: boolean;
  pillarboxWidth: number;
  safeMarginPct: number;
}

export interface ViewportState {
  renderScale: number; // 50 to 200 (%)
  safeAreaMargin: number; // -5 to +10 (%)
  showSafeAreaHud: boolean;
  showSafeAreaGuides: boolean;
  portraitDismissed: boolean;
  metrics: ViewportMetrics;
}

interface ViewportSyncPayload {
  safeAreaMargin: number;
  showSafeAreaHud: boolean;
}

const getInitialMargin = (): number => {
  const val = safeStorage.get(STORAGE_KEYS.SAFE_AREA_MARGIN);
  if (val !== null) {
    const num = parseFloat(val);
    if (!Number.isNaN(num)) return Math.min(10, Math.max(-5, num));
  }
  return 0;
};

const getInitialScale = (): number => {
  const val = safeStorage.get(STORAGE_KEYS.UI_SCALE);
  if (val !== null) {
    const num = parseInt(val, 10);
    if (!Number.isNaN(num)) return Math.min(200, Math.max(50, num));
  }
  return 100;
};

const getInitialHud = (): boolean => {
  return safeStorage.get(STORAGE_KEYS.SAFE_AREA_VISIBLE) === 'true';
};

const calculateMetrics = (marginPct: number, scalePct: number): ViewportMetrics => {
  if (typeof window === 'undefined') {
    return {
      scaleFactor: 1,
      renderWidth: 1280,
      renderHeight: 720,
      isPortrait: false,
      isPillarboxed: false,
      pillarboxWidth: 0,
      safeMarginPct: marginPct,
    };
  }

  const Wwin = window.innerWidth;
  const Hwin = window.innerHeight;

  const marginW = Wwin * (marginPct / 100);
  const marginH = Hwin * (marginPct / 100);
  const Wsafe = Math.max(100, Wwin - marginW * 2);
  const Hsafe = Math.max(100, Hwin - marginH * 2);

  const maxRenderW = Hsafe * 2.0;
  const Wrender = Math.min(Wsafe, maxRenderW);
  const Hrender = Hsafe;

  const isPillarboxed = Wsafe > maxRenderW;
  const pillarboxWidth = isPillarboxed ? (Wsafe - Wrender) / 2 : 0;
  const isPortrait = Wsafe < Hsafe;

  const scaleFactor = Number((scalePct / 100).toFixed(3));

  return {
    scaleFactor,
    renderWidth: Wrender,
    renderHeight: Hrender,
    isPortrait,
    isPillarboxed,
    pillarboxWidth,
    safeMarginPct: marginPct,
  };
};

const applyCssVariables = (metrics: ViewportMetrics, scalePct: number, marginPct: number) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const Wwin = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const Hwin = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const marginX = (Wwin * marginPct) / 100;
  const marginY = (Hwin * marginPct) / 100;
  root.style.setProperty('--ui-scale', String(metrics.scaleFactor));
  root.style.setProperty('--ui-user-scale', `${scalePct}%`);
  root.style.setProperty('--ui-render-width', `${Math.round(metrics.renderWidth)}px`);
  root.style.setProperty('--ui-render-height', `${Math.round(metrics.renderHeight)}px`);
  root.style.setProperty('--ui-pillarbox-width', `${Math.round(metrics.pillarboxWidth)}px`);
  root.style.setProperty('--ui-safe-margin', `${marginPct}%`);
  root.style.setProperty('--ui-safe-margin-x', `${Math.round(marginX)}px`);
  root.style.setProperty('--ui-safe-margin-y', `${Math.round(marginY)}px`);
  root.style.setProperty('--ui-font-scale', String(metrics.scaleFactor));
};

const initialLocalScale = getInitialScale();
const initialSync = crossClientSync.get<ViewportSyncPayload>('store:viewport', {
  safeAreaMargin: getInitialMargin(),
  showSafeAreaHud: getInitialHud(),
});

const core = createExternalStore<ViewportState>(
  {
    renderScale: initialLocalScale,
    safeAreaMargin: initialSync.safeAreaMargin,
    showSafeAreaHud: initialSync.showSafeAreaHud,
    showSafeAreaGuides: initialSync.showSafeAreaHud,
    portraitDismissed: false,
    metrics: calculateMetrics(initialSync.safeAreaMargin, initialLocalScale),
  },
  {
    onNotify: (state) => {
      state.metrics = calculateMetrics(state.safeAreaMargin, state.renderScale);
      applyCssVariables(state.metrics, state.renderScale, state.safeAreaMargin);
    },
  }
);

const publishViewportSync = () => {
  const state = core.getSnapshot();
  crossClientSync.set<ViewportSyncPayload>('store:viewport', {
    safeAreaMargin: state.safeAreaMargin,
    showSafeAreaHud: state.showSafeAreaHud,
  });
};

crossClientSync.registerDefault<ViewportSyncPayload>('store:viewport', {
  safeAreaMargin: 0,
  showSafeAreaHud: false,
});

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !'store:viewport'.startsWith(scopePrefix)) return;
  safeStorage.remove(STORAGE_KEYS.SAFE_AREA_MARGIN);
  safeStorage.remove(STORAGE_KEYS.SAFE_AREA_VISIBLE);
  core.setState((state) => ({
    ...state,
    safeAreaMargin: 0,
    showSafeAreaHud: false,
    showSafeAreaGuides: false,
    portraitDismissed: false,
  }));
});

crossClientSync.subscribeKey<ViewportSyncPayload>('store:viewport', (remote) => {
  if (!remote || typeof remote !== 'object') return;
  const state = core.getSnapshot();
  const nextMargin =
    typeof remote.safeAreaMargin === 'number' ? remote.safeAreaMargin : state.safeAreaMargin;
  const nextHud =
    typeof remote.showSafeAreaHud === 'boolean' ? remote.showSafeAreaHud : state.showSafeAreaHud;
  if (nextMargin === state.safeAreaMargin && nextHud === state.showSafeAreaHud) {
    return;
  }
  safeStorage.set(STORAGE_KEYS.SAFE_AREA_MARGIN, nextMargin);
  safeStorage.set(STORAGE_KEYS.SAFE_AREA_VISIBLE, nextHud);
  core.setState((s) => ({
    ...s,
    safeAreaMargin: nextMargin,
    showSafeAreaHud: nextHud,
    showSafeAreaGuides: nextHud,
  }));
});

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => core.notify());
  const initial = core.getSnapshot();
  applyCssVariables(initial.metrics, initial.renderScale, initial.safeAreaMargin);
}

export const viewportStore = {
  getSnapshot: core.getSnapshot,
  subscribe: core.subscribe,
  setRenderScale: (scale: number) => {
    const clamped = Math.min(200, Math.max(50, Math.round(scale)));
    safeStorage.set(STORAGE_KEYS.UI_SCALE, clamped);
    core.setState((state) => ({ ...state, renderScale: clamped }));
  },
  setSafeAreaMargin: (margin: number) => {
    const clamped = Math.min(10, Math.max(-5, Math.round(margin * 10) / 10));
    safeStorage.set(STORAGE_KEYS.SAFE_AREA_MARGIN, clamped);
    core.setState((state) => ({ ...state, safeAreaMargin: clamped }), false);
    publishViewportSync();
    core.notify();
  },
  setShowSafeAreaHud: (show: boolean) => {
    safeStorage.set(STORAGE_KEYS.SAFE_AREA_VISIBLE, show);
    core.setState((state) => ({ ...state, showSafeAreaHud: show, showSafeAreaGuides: show }), false);
    publishViewportSync();
    core.notify();
  },
  toggleSafeAreaGuides: () => {
    const next = !core.getSnapshot().showSafeAreaHud;
    safeStorage.set(STORAGE_KEYS.SAFE_AREA_VISIBLE, next);
    core.setState((state) => ({ ...state, showSafeAreaHud: next, showSafeAreaGuides: next }), false);
    publishViewportSync();
    core.notify();
  },
  dismissPortraitGate: () => {
    core.setState((state) => ({ ...state, portraitDismissed: true }));
  },
};

export const useViewportStore = () => {
  return useSyncExternalStore(viewportStore.subscribe, viewportStore.getSnapshot);
};
