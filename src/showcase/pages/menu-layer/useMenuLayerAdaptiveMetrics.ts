import { useState as useLocalState, useEffect, useRef } from 'react';
import {
  measureMenuPanelIntrinsicDimensions,
  resolveClampedMenuPanelGeometry,
  type MenuPanelIntrinsicMetrics,
  type MenuPanelWidthAdaptiveMode,
} from '../../../ui-core/navigation/menuPanelAdaptive';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { DEFAULT_PANEL_SIZING } from '../../../ui-core/tokens/menuLayoutTokens';
import { useMainMenuStyleStore } from '../../../ui-core/stores/mainMenuStyleStore';
import type { Layer1MenuContextMode } from '../../../ui-core/recipes/layer1MenuContextSpecs';
import {
  type ActiveMenuRoute,
  type MenuVisibilityTier,
  normalizeMenuRoute,
  ROUTE_TO_PANEL_ID,
} from './menuLayerRouteConfig';

import { createScopedSyncedState } from '../../stores/crossClientSync';
const useSyncedState = createScopedSyncedState('page:menu-layer-v2');

export interface UseMenuLayerAdaptiveMetricsParams {
  currentRoute: ActiveMenuRoute;
  displayedRoute: ActiveMenuRoute;
  visibilityTier: MenuVisibilityTier;
  layer1ContextMode: Layer1MenuContextMode;
  touchMode: boolean;
  stageSize: { width: number; height: number };
  isDockState: boolean;
  showToast: (msg: string) => void;
}

export function useMenuLayerAdaptiveMetrics({
  currentRoute,
  displayedRoute,
  visibilityTier,
  layer1ContextMode,
  touchMode,
  stageSize,
  isDockState,
  showToast,
}: UseMenuLayerAdaptiveMetricsParams) {
  const [containerPreset, setContainerPreset] = useSyncedState<
    'full' | '1080p-compact' | 'small-squeeze'
  >('full', 'containerPreset');
  const [boundaryLocked, setBoundaryLocked] = useSyncedState<boolean>(false, 'boundaryLocked');
  const [manualBoundarySize, setManualBoundarySize] = useSyncedState<{
    width: number;
    height: number;
  }>({ width: 960, height: 640 }, 'manualBoundarySize');
  const [widthMode, setWidthMode] = useSyncedState<MenuPanelWidthAdaptiveMode>(
    'design-auto-expand',
    'widthMode'
  );
  const [manualMinWidths, setManualMinWidths] = useSyncedState<Record<string, number>>(
    {},
    'manualMinWidths'
  );
  const [minWidthDraft, setMinWidthDraft] = useLocalState<string>('');
  const [isEditingMinWidth, setIsEditingMinWidth] = useLocalState<boolean>(false);
  const {
    panels,
    dividerMarginY,
    menuItemGap,
    menuItemPaddingY,
    menuContainerPadding,
    panelContentPaddingY,
    panelHeaderPaddingX,
    panelHeaderPaddingY,
    panelHeaderTitleFontSize,
    panelHeaderBackBtnWidth,
    panelHeaderBackBtnHeight,
    panelOuterRadius,
    panelHeaderGap,
    panelBodyPaddingX,
    panelBodyPaddingY,
    panelFooterPaddingX,
    panelFooterPaddingY,
    panelFooterFontSize,
    simulateLayer3Error,
  } = useMenuLayoutStore();
  const mainMenuStyle = useMainMenuStyleStore();

  const getRouteMetricKey = (route: ActiveMenuRoute) => {
    if (route === 'main-menu') return `main-menu:${layer1ContextMode}`;
    if (route === 'settings') return `settings:${visibilityTier}`;
    if (route === 'garage') return 'garage';
    if (route === 'manage-room') return `manage-room:${layer1ContextMode}`;
    return normalizeMenuRoute(route) ?? route;
  };

  const contentWrapperRef = useRef<HTMLDivElement | null>(null);
  const isProbingRef = useRef<boolean>(false);
  const lastWidthProbeSigRef = useRef<string>('');
  const [metricsByRouteKey, setMetricsByRouteKey] = useLocalState<
    Record<string, MenuPanelIntrinsicMetrics>
  >({});

  useEffect(() => {
    const wrapper = contentWrapperRef.current;
    if (!wrapper || currentRoute === 'layer-0' || displayedRoute === 'layer-0') return;
    const panelEl = wrapper.querySelector<HTMLElement>('[data-panel="container"]');
    if (!panelEl) return;

    const metricKey = getRouteMetricKey(displayedRoute);
    const panelId = ROUTE_TO_PANEL_ID[displayedRoute] ?? 'layer1-main';
    const cfg =
      panels?.[panelId] ??
      DEFAULT_PANEL_SIZING[panelId] ??
      DEFAULT_PANEL_SIZING['layer1-main'];

    const measure = () => {
      if (isProbingRef.current) return;
      isProbingRef.current = true;
      try {
        const contentEl = panelEl.querySelector<HTMLElement>(
          '[data-panel-section="content"]'
        );
        const childCount =
          contentEl?.firstElementChild?.children.length ??
          contentEl?.children.length ??
          0;
        const widthSig = `${metricKey}:${childCount}:${simulateLayer3Error}:${touchMode}:${panelHeaderTitleFontSize}:${panelBodyPaddingX}`;
        const shouldProbeWidth = lastWidthProbeSigRef.current !== widthSig;

        const measured = measureMenuPanelIntrinsicDimensions(panelEl, {
          fallbackMinWidth: Math.min(cfg.width, 360),
          tier: visibilityTier,
          measureWidth: shouldProbeWidth,
        });

        if (shouldProbeWidth && contentEl && contentEl.clientWidth > 0) {
          lastWidthProbeSigRef.current = widthSig;
        }

        if (measured.intrinsicHeight > 40) {
          setMetricsByRouteKey((prev) => {
            const existing = prev[metricKey];
            const nextAutoMinW = shouldProbeWidth
              ? measured.autoMinWidth
              : existing?.autoMinWidth ?? measured.autoMinWidth;
            const nextContentMinW = shouldProbeWidth
              ? measured.contentMinWidth
              : existing?.contentMinWidth ?? measured.contentMinWidth;

            if (
              existing &&
              Math.abs(existing.intrinsicHeight - measured.intrinsicHeight) <= 1 &&
              existing.autoMinWidth === nextAutoMinW
            ) {
              return prev;
            }
            return {
              ...prev,
              [metricKey]: {
                intrinsicHeight: measured.intrinsicHeight,
                autoMinWidth: nextAutoMinW,
                contentMinWidth: nextContentMinW,
                chromeMinWidth: measured.chromeMinWidth,
                scrollbarReservePx: measured.scrollbarReservePx,
              },
            };
          });
        }
      } finally {
        isProbingRef.current = false;
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(panelEl);
    Array.from(panelEl.children).forEach((child) => {
      ro.observe(child);
      if (
        (child as HTMLElement).getAttribute('data-panel-section') === 'content'
      ) {
        Array.from(child.children).forEach((grandChild) => ro.observe(grandChild));
      }
    });

    return () => ro.disconnect();
  }, [
    displayedRoute,
    currentRoute,
    visibilityTier,
    layer1ContextMode,
    touchMode,
    mainMenuStyle,
    panels,
    dividerMarginY,
    menuItemGap,
    menuItemPaddingY,
    menuContainerPadding,
    panelContentPaddingY,
    panelHeaderPaddingX,
    panelHeaderPaddingY,
    panelHeaderTitleFontSize,
    panelHeaderBackBtnWidth,
    panelHeaderBackBtnHeight,
    panelHeaderGap,
    panelBodyPaddingX,
    panelBodyPaddingY,
    panelFooterPaddingX,
    panelFooterPaddingY,
    panelFooterFontSize,
    simulateLayer3Error,
    stageSize.width,
    stageSize.height,
  ]);

  const resolveRouteGeometry = (route: ActiveMenuRoute) => {
    if (route === 'layer-0') {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        desiredWidth: 0,
        desiredHeight: 0,
        effectiveMinWidth: 0,
        autoMinWidth: 0,
        intrinsicHeight: 0,
        scrollbarReservePx: 16,
        isWidthSqueezed: false,
        isHeightSqueezed: false,
        modeLabel: '0px',
      };
    }
    const metricKey = getRouteMetricKey(route);
    const panelId = ROUTE_TO_PANEL_ID[route] ?? 'layer1-main';
    const cfg =
      panels?.[panelId] ??
      DEFAULT_PANEL_SIZING[panelId] ??
      DEFAULT_PANEL_SIZING['layer1-main'];
    const measured = metricsByRouteKey[metricKey];
    const fallbackIntrinsic =
      route === 'main-menu'
        ? 377
        : route === 'play'
        ? 298
        : route === 'garage'
        ? 417
        : route === 'settings'
        ? 457
        : cfg.targetHeight;
    const naturalH = measured?.intrinsicHeight ?? fallbackIntrinsic;
    const autoMinW = measured?.autoMinWidth ?? Math.min(cfg.width, 400);
    const manualMinW =
      typeof manualMinWidths[metricKey] === 'number'
        ? Math.round(manualMinWidths[metricKey])
        : undefined;

    const effectiveBoundsH =
      boundaryLocked && manualBoundarySize
        ? manualBoundarySize.height
        : containerPreset === '1080p-compact'
        ? 520
        : containerPreset === 'small-squeeze'
        ? 380
        : Math.max(stageSize.height, 620, Math.min(980, naturalH + 48));
    const effectiveBoundsW =
      boundaryLocked && manualBoundarySize
        ? manualBoundarySize.width
        : containerPreset === '1080p-compact'
        ? Math.min(stageSize.width, 760)
        : containerPreset === 'small-squeeze'
        ? Math.min(stageSize.width, 520)
        : stageSize.width;

    return resolveClampedMenuPanelGeometry({
      sizing: cfg,
      intrinsicHeight: naturalH,
      autoMinWidth: autoMinW,
      manualMinWidth: manualMinW,
      widthMode,
      stageBounds: {
        width: Math.max(300, effectiveBoundsW),
        height: Math.max(240, effectiveBoundsH),
      },
      margin: 16,
    });
  };

  const dockW = 88;
  const dockH = 38;
  const activeRouteSize = resolveRouteGeometry(currentRoute);
  const expandedW = activeRouteSize.width || 480;
  const expandedH = activeRouteSize.height || 540;
  const activeMetricKey = getRouteMetricKey(currentRoute);
  const hasManualMinOverride =
    currentRoute !== 'layer-0' && typeof manualMinWidths[activeMetricKey] === 'number';

  useEffect(() => {
    if (!isEditingMinWidth && currentRoute !== 'layer-0') {
      setMinWidthDraft(String(Math.round(activeRouteSize.effectiveMinWidth)));
    }
  }, [currentRoute, activeMetricKey, activeRouteSize.effectiveMinWidth, isEditingMinWidth]);

  const applyManualMinWidth = (nextVal: number) => {
    if (currentRoute === 'layer-0' || !Number.isFinite(nextVal)) return;
    const clamped = Math.max(260, Math.min(1100, Math.round(nextVal)));
    setManualMinWidths((prev) => ({
      ...prev,
      [activeMetricKey]: clamped,
    }));
    setMinWidthDraft(String(clamped));
  };

  const handleResetAutoMinWidth = () => {
    if (currentRoute === 'layer-0') return;
    setManualMinWidths((prev) => {
      const next = { ...prev };
      delete next[activeMetricKey];
      return next;
    });
    showToast(
      `[ok] Restored ${activeMetricKey} Auto-detect minimum width (${activeRouteSize.autoMinWidth}px)`
    );
  };

  const autoResolvedStageW =
    containerPreset === '1080p-compact'
      ? Math.min(stageSize.width, 760)
      : containerPreset === 'small-squeeze'
      ? Math.min(stageSize.width, 520)
      : stageSize.width;
  const autoResolvedStageH =
    containerPreset === '1080p-compact'
      ? 520
      : containerPreset === 'small-squeeze'
      ? 380
      : currentRoute !== 'layer-0' && !isDockState
      ? Math.max(stageSize.height, 620, Math.min(980, expandedH + 48))
      : Math.max(stageSize.height, 620);

  const effectiveStageW = boundaryLocked ? manualBoundarySize.width : autoResolvedStageW;
  const effectiveStageH = boundaryLocked ? manualBoundarySize.height : autoResolvedStageH;

  const handleToggleBoundaryLock = () => {
    if (!boundaryLocked) {
      const snapW = Math.max(320, Math.round(autoResolvedStageW));
      const snapH = Math.max(260, Math.round(autoResolvedStageH));
      setManualBoundarySize({ width: snapW, height: snapH });
      setBoundaryLocked(true);
      showToast(`[ok] Canvas Boundary Locked at ${snapW}x${snapH}px`);
    } else {
      setBoundaryLocked(false);
      showToast('[ok] Canvas Boundary Unlocked (Auto-Adaptive)');
    }
  };

  const handleChangeManualBoundarySize = (next: { width: number; height: number }) => {
    setManualBoundarySize({
      width: Math.max(320, Math.min(2560, Math.round(next.width))),
      height: Math.max(260, Math.min(1600, Math.round(next.height))),
    });
    setBoundaryLocked(true);
  };

  const xExpanded =
    currentRoute !== 'layer-0'
      ? activeRouteSize.x
      : Math.max(16, Math.round((effectiveStageW - expandedW) / 2));
  const yExpanded =
    currentRoute !== 'layer-0'
      ? activeRouteSize.y
      : Math.max(16, Math.round((effectiveStageH - expandedH) / 2));
  const xDock = Math.max(16, Math.round(effectiveStageW - 16 - dockW));
  const yDock = Math.max(16, Math.round((effectiveStageH - dockH) / 2));
  const targetX = isDockState ? xDock : xExpanded;
  const targetY = isDockState ? yDock : yExpanded;
  const targetW = isDockState ? dockW : expandedW;
  const targetH = isDockState ? dockH : expandedH;
  const targetRadius = isDockState ? 12 : panelOuterRadius;

  return {
    contentWrapperRef,
    containerPreset,
    setContainerPreset,
    boundaryLocked,
    manualBoundarySize,
    setManualBoundarySize,
    widthMode,
    setWidthMode,
    manualMinWidths,
    minWidthDraft,
    setMinWidthDraft,
    setIsEditingMinWidth,
    activeRouteSize,
    hasManualMinOverride,
    applyManualMinWidth,
    handleResetAutoMinWidth,
    effectiveStageW,
    effectiveStageH,
    handleToggleBoundaryLock,
    handleChangeManualBoundarySize,
    targetX,
    targetY,
    targetW,
    targetH,
    targetRadius,
  };
}
