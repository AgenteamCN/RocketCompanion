import React, { useState as useLocalState, useEffect, useRef } from 'react';
import { Layers } from 'lucide-react';
import { crossClientSync, createScopedSyncedState } from '../stores/crossClientSync';
import {
  buildFloatingWindowCrossTabTarget,
  publishCrossTabActiveTarget,
} from '../stores/crossTabTargetFollow';
import { useViewportStore } from '../../ui-core/stores/viewportStore';
const useState = createScopedSyncedState('page:menu-layer-v2');
import { floatingStore, useFloatingStore } from '../../ui-core/stores/floatingStore';
import { type PresetConfig } from '../../ui-core/stores/floatingPresets';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, JumpDirectoryItem } from '../PageJumpDirectory';
import {
  type ActiveMenuRoute,
  MENU_SANDBOX_JUMP_ITEMS,
} from './menu-layer/menuLayerRouteConfig';
import { MenuLayerRouteSelectorBar } from './menu-layer/MenuLayerRouteSelectorBar';
import { MenuLayerAdaptiveControlDeck } from './menu-layer/MenuLayerAdaptiveControlDeck';
import { MenuLayerScannerAndAuditSection } from './menu-layer/MenuLayerScannerAndAuditSection';
import { MenuLayerStageCanvas } from './menu-layer/MenuLayerStageCanvas';
import { useMenuLayerAdaptiveMetrics } from './menu-layer/useMenuLayerAdaptiveMetrics';
import { useMenuLayerNavigationHandlers } from './menu-layer/useMenuLayerNavigationHandlers';
import { MenuLayerSandboxProvider } from './menu-layer/MenuLayerSandboxContext';
import { RapidReviewTriageBar } from '../components/review/RapidReviewTriageBar';
import type { ShowcaseTab } from '../sidebarNavConfig';

export interface MenuLayerPreviewPageProps {
  isLight?: boolean;
  onNavigateToPlayCards?: () => void;
  /** Cross-page anchor jump callback: Jump directly to the independent tuning page for the currently active node and scroll to target */
  onNavigateShowcase?: (tab: ShowcaseTab, targetId?: string) => void;
  /** Background shadow/Mask transition duration (Unit: ms), default 250ms, Allow modification */
  backdropDuration?: number;
}

export const MenuLayerPreviewPage: React.FC<MenuLayerPreviewPageProps> = ({
  isLight = true,
  onNavigateToPlayCards,
  onNavigateShowcase,
  backdropDuration = 250,
}) => {
  const { renderScale } = useViewportStore();
  const [touchMode, setTouchMode] = useState<boolean>(false, 'touchMode');
  const [bgRenderPaused, setBgRenderPaused] = useState<boolean>(true, 'bgRenderPaused');
  const [feedbackToast, setFeedbackToast] = useLocalState<string | null>(null);
  const [showInlineTuner, setShowInlineTuner] = useLocalState<boolean>(false);
  const [isPillHovered, setIsPillHovered] = useLocalState(false);
  const [ballSimSpeed] = useState(128, 'ballSimSpeed');
  const { windows, isStackDismissed, minimizedCount, totalCount, closeWindow } = useFloatingStore();
  const hasStackIcon = !(isStackDismissed && minimizedCount === 0);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast(null);
    }, 2400);
  };

  const [showWorkbenchDecks, setShowWorkbenchDecks] = useLocalState<boolean>(false);

  const {
    playlistScope,
    handleChangePlaylistScope,
    visibilityTier,
    layer1ContextMode,
    setLayer1ContextMode,
    stickySessionContext,
    setStickySessionContext,
    currentRoute,
    displayedRoute,
    activeFloatingWindowId,
    setActiveFloatingWindowId,
    activeFloatingSubTab,
    setActiveFloatingSubTab,
    transitionMode,
    setTransitionMode,
    settingsTab,
    setSettingsTab,
    garageTab,
    setGarageTab,
    lastParentRoute,
    setLastParentRoute,
    liveAnimPhase,
    setLiveAnimPhase,
    stepPhase,
    layer3StepOverride,
    setLayer3StepOverride,
    activePlaylist,
    activePlaylistIdx,
    activePlaylistStep,
    anchorIndex,
    anchorPlaylistStep,
    isFreeRoaming,
    activeViewRoamLabel,
    auditInfo,
    handleChangeVisibilityTier,
    handleSelectRoute,
    handleTriggerCollapse,
    handleTriggerExpand,
    handleNavigateBack,
    stepPlaylistBy,
    stepPlaylistToIndex,
    handleReturnToAnchor,
  } = useMenuLayerNavigationHandlers({ showToast });

  const isCursorHidden = currentRoute === 'layer-0' && !hasStackIcon;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useLocalState({ width: 900, height: 620 });
  const [isShaking, setIsShaking] = useLocalState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerShake = () => {
    if (isShaking) return;
    setIsShaking(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false);
    }, 360);
  };
  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);
  useEffect(() => {
    if (!stageRef.current) return;
    const update = () => {
      if (stageRef.current) {
        setStageSize({
          width: stageRef.current.clientWidth,
          height: stageRef.current.clientHeight,
        });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stageRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [renderScale]);

  const isDockState =
    (currentRoute === 'trajectory' || currentRoute === 'camera') &&
    (liveAnimPhase === 'collapsed' ||
      liveAnimPhase === 'collapsing_resize' ||
      liveAnimPhase === 'expanding_content');

  const {
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
  } = useMenuLayerAdaptiveMetrics({
    currentRoute,
    displayedRoute,
    visibilityTier,
    layer1ContextMode,
    touchMode,
    stageSize,
    isDockState,
    showToast,
  });

  const handleAddPresetWindow = (preset: PresetConfig, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!stageRef.current) return;
    floatingStore.spawnWithFlight(preset, e.currentTarget, stageRef.current);
    publishCrossTabActiveTarget(
      buildFloatingWindowCrossTabTarget({
        windowId: preset.id,
        title: preset.title,
        subtab: preset.tabs?.[0]?.id,
        tier: preset.tier || visibilityTier,
      })
    );
    showToast(`[ok] Spawned "${preset.title}" into top-right Floating Stack`);
  };

  const isContentVisible =
    currentRoute !== 'layer-0' &&
    !isDockState &&
    (transitionMode === 'fluid-morph'
      ? liveAnimPhase === 'expanded'
      : stepPhase !== 'fadeOut' && stepPhase !== 'resize' && liveAnimPhase === 'expanded');
  const isPillContentVisible = liveAnimPhase === 'collapsed';

  const sandboxContextValue = {
    stageRef,
    contentWrapperRef,
    containerPreset,
    setContainerPreset,
    boundaryLocked,
    manualBoundarySize,
    setManualBoundarySize,
    effectiveStageW,
    effectiveStageH,
    handleToggleBoundaryLock,
    handleChangeManualBoundarySize,
    isCursorHidden,
    currentRoute,
    displayedRoute,
    activeFloatingWindowId,
    setActiveFloatingWindowId,
    activeFloatingSubTab,
    setActiveFloatingSubTab,
    playlistScope,
    handleChangePlaylistScope,
    isDockState,
    ballSimSpeed,
    hasStackIcon,
    backdropDuration,
    triggerShake,
    showToast,
    feedbackToast,
    handleSelectRoute,
    handleNavigateBack,
    isShaking,
    targetX,
    targetY,
    targetW,
    targetH,
    targetRadius,
    handleTriggerExpand,
    handleTriggerCollapse,
    isPillHovered,
    setIsPillHovered,
    isPillContentVisible,
    isContentVisible,
    visibilityTier,
    handleChangeVisibilityTier,
    layer1ContextMode,
    setLayer1ContextMode,
    stickySessionContext,
    setStickySessionContext,
    touchMode,
    setTouchMode,
    settingsTab,
    setSettingsTab,
    garageTab,
    setGarageTab,
    bgRenderPaused,
    setBgRenderPaused,
    lastParentRoute,
    setLastParentRoute,
    handleAddPresetWindow,
    windows,
    minimizedCount,
    totalCount,
    closeWindow,
    setLiveAnimPhase,
    layer3StepOverride,
    setLayer3StepOverride,
    stepPlaylistBy,
    stepPlaylistToIndex,
    handleReturnToAnchor,
    anchorIndex,
    anchorPlaylistStep,
    isFreeRoaming,
    activeViewRoamLabel,
    activePlaylistIdx,
    activePlaylist,
    activePlaylistStep,
    transitionMode,
    setTransitionMode,
    auditInfo,
    showInlineTuner,
    setShowInlineTuner,
    onNavigateShowcase,
    onNavigateToPlayCards,
    widthMode,
    setWidthMode,
    activeRouteSize,
    minWidthDraft,
    setMinWidthDraft,
    setIsEditingMinWidth,
    hasManualMinOverride,
    applyManualMinWidth,
    handleResetAutoMinWidth,
  };

  const handleResetStageDefaults = () => {
    crossClientSync.resetAll({ scopePrefix: 'page:menu-layer-v2:' });
    showToast('[ok] Reset Unified Stage adaptive engine and route defaults');
  };

  const buildStageExportCode = () => {
    const snapshot = {
      routeState: {
        playlistScope,
        visibilityTier,
        currentRoute,
        activeFloatingWindowId,
        activeFloatingSubTab,
        layer1ContextMode,
        settingsTab,
        garageTab,
        transitionMode,
      },
      adaptiveEngine: {
        widthMode,
        containerPreset,
        boundaryLocked,
        effectiveStageSizePx: {
          width: Math.round(effectiveStageW),
          height: Math.round(effectiveStageH),
        },
        manualBoundarySize,
        manualMinWidths,
      },
      stageOptions: { touchMode, bgRenderPaused, ballSimSpeed },
    };
    return `export const DEFAULT_UNIFIED_STAGE_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  };

  return (
    <MenuLayerSandboxProvider value={sandboxContextValue}>
      <div className="flex flex-col gap-5 w-full">
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Unified Approval Stage · Rocket Companion UI
              </h1>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Clean single-stage acceptance environment — Menu Layer, Live Preview, Edge Inspector &amp; Floating Windows merged into one continuous inspection queue.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowWorkbenchDecks((v) => !v)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${
              showWorkbenchDecks
                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
          >
            {showWorkbenchDecks
              ? 'Clean Approval Stage (Hide Decks)'
              : '+ Show Route & Adaptive Workbench'}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <MenuLayerStageCanvas isLight={isLight} />
          <MenuLayerScannerAndAuditSection
            isLight={isLight}
            showWorkbenchDecks={showWorkbenchDecks}
          />
        </div>

        {showWorkbenchDecks && (
          <>
            <MenuLayerAdaptiveControlDeck isLight={isLight} />
            <MenuLayerRouteSelectorBar isLight={isLight} />

            <TunerConfigExporterBar
              badge="STAGE-EXPORT"
              title="Unified Stage Adaptive Engine & Route Config Exporter"
              subtitle="Exports adaptive widthMode, canvas boundary lock, manual min-width overrides, transitionMode & active route/tier snapshot"
              copyLabel="Copy Stage Config Snapshot"
              codeTitle="Current Unified Stage Adaptive & Route Parameter Snapshot"
              actionId="export-7a-menu-layer-config"
              isLight={isLight}
              buildExportCode={buildStageExportCode}
              onResetDefaults={handleResetStageDefaults}
            />

            <PageJumpDirectory
              title={`Menu Layer Quick-Jump Directory (${
                visibilityTier === 'user' ? 'User View' : 'Developer View'
              })`}
              subtitle="Click any card to load the Menu surface into the central stage above"
              items={MENU_SANDBOX_JUMP_ITEMS.filter((item) => item.tier === visibilityTier)}
              onSelect={(item) => {
                const r = (item as JumpDirectoryItem & { route?: ActiveMenuRoute }).route;
                if (r) handleSelectRoute(r);
              }}
              isLight={isLight}
            />
          </>
        )}

        <RapidReviewTriageBar isLight={isLight} />
      </div>
    </MenuLayerSandboxProvider>
  );
};
