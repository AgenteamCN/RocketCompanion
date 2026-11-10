import { useEffect } from 'react';
import { dialogue } from '../../../ui-core/compounds/dialogue/dialogueStore';
import { floatingStore } from '../../../ui-core/stores/floatingStore';
import { useStaticTrainingPackStore } from '../../../ui-core/stores/staticTrainingPackStore';
import type { ContainerTransitionMode } from '../../../ui-core/tokens/easing';
import {
  resolveLayer1ContextSpec,
  type Layer1MenuContextMode,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import { useReviewLedgerStore } from '../../components/review/reviewLedgerStore';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { readUrlParams } from '../../stores/urlSync';
import { isFloatingWindowPlaylistUnit } from '../floating-windows/floatingWindowsLinearPlaylists';
import type { Layer3StepOverrideState } from './MenuLayerStageRecipeRouter';
import {
  MENU_ROUTE_CONFIG,
  normalizeMenuRoute,
  type ActiveMenuRoute,
  type LivePreviewAnimPhase,
  type MenuVisibilityTier,
} from './menuLayerRouteConfig';
import {
  ALL_UNIFIED_APPROVAL_PLAYLIST,
  findPlaylistStepIndex,
  findUnifiedStepByLedgerKey,
  resolveRouteAuditInfo,
  resolveUnifiedPlaylistByScope,
  spawnFloatingPresetOnUnifiedStage,
  type UnifiedApprovalPlaylistStep,
  type UnifiedPlaylistScope,
} from './menuLayerLinearPlaylists';
import {
  bindMenuLayerStageKeydown,
  broadcastStageTargetToWorkbench,
  doesViewMatchPlaylistStep,
  executeUnifiedStepTransition,
  formatActiveViewRoamLabel,
} from './menuLayerFreeRoamUtils';
import { useMenuLayerUrlSync } from './useMenuLayerUrlSync';

const useState = createScopedSyncedState('page:menu-layer-v2');

export interface UseMenuLayerNavigationHandlersParams {
  showToast: (msg: string) => void;
}

export function useMenuLayerNavigationHandlers({
  showToast,
}: UseMenuLayerNavigationHandlersParams) {
  const [rawPlaylistScope, setPlaylistScope] = useState<UnifiedPlaylistScope>('all', 'playlistScope');
  const playlistScope: UnifiedPlaylistScope =
    rawPlaylistScope === 'user' || rawPlaylistScope === 'developer' ? rawPlaylistScope : 'all';

  const [rawVisibilityTier, setVisibilityTier] = useState<MenuVisibilityTier>(() => {
    return readUrlParams().tier === 'developer' ? 'developer' : 'user';
  }, 'visibilityTier');
  const visibilityTier: MenuVisibilityTier =
    rawVisibilityTier === 'developer' ? 'developer' : 'user';

  const [rawStickySessionContext, setRawStickySessionContext] = useState<Layer1MenuContextMode>(
    () => resolveLayer1ContextSpec(readUrlParams().ctx).id,
    'layer1ContextMode'
  );
  const stickySessionContext = resolveLayer1ContextSpec(rawStickySessionContext).id;
  const setStickySessionContext = (mode: Layer1MenuContextMode) => {
    setRawStickySessionContext(resolveLayer1ContextSpec(mode).id);
  };

  const [rawCurrentRoute, setCurrentRoute] = useState<ActiveMenuRoute>(() => {
    const p = readUrlParams();
    return p.fw ? 'layer-0' : normalizeMenuRoute(p.route) ?? 'main-menu';
  }, 'currentRoute');
  const currentRoute: ActiveMenuRoute = normalizeMenuRoute(rawCurrentRoute) ?? 'main-menu';

  const [rawDisplayedRoute, setDisplayedRoute] = useState<ActiveMenuRoute>(() => {
    const p = readUrlParams();
    return p.fw ? 'layer-0' : normalizeMenuRoute(p.route) ?? 'main-menu';
  }, 'displayedRoute');
  const displayedRoute: ActiveMenuRoute = normalizeMenuRoute(rawDisplayedRoute) ?? currentRoute;

  const [activeFloatingWindowId, setActiveFloatingWindowId] = useState<string | null>(
    () => readUrlParams().fw || null,
    'activeFloatingWindowId'
  );
  const [activeFloatingSubTab, setActiveFloatingSubTab] = useState<string>(
    () => readUrlParams().fwTab || '',
    'activeFloatingSubTab'
  );
  const [transitionMode, setTransitionMode] = useState<ContainerTransitionMode>(
    'fluid-morph',
    'transitionMode'
  );
  const [settingsTab, setSettingsTab] = useState<string>(() => {
    const p = readUrlParams();
    return p.route !== 'garage' && p.subtab ? p.subtab : 'gameplay';
  }, 'settingsTab');
  const [garageTab, setGarageTab] = useState<string>(() => {
    const p = readUrlParams();
    return p.route === 'garage' && p.subtab ? p.subtab : 'car';
  }, 'garageTab');

  const [lastParentRoute, setLastParentRoute] = useState<ActiveMenuRoute>('main-menu', 'lastParentRoute');
  const [routeHistory, setRouteHistory] = useState<ActiveMenuRoute[]>([], 'routeHistory');
  const [liveAnimPhase, setLiveAnimPhase] = useState<LivePreviewAnimPhase>('expanded', 'liveAnimPhase');
  const [stepPhase, setStepPhase] = useState<'idle' | 'fadeOut' | 'resize' | 'fadeIn'>('idle', 'stepPhase');
  const [layer3StepOverride, setLayer3StepOverride] = useState<Layer3StepOverrideState>(
    { progressStatus: 'idle', currentStep: 1, defaultEditingConfig: false, memberSlots: 3 },
    'layer3StepOverride'
  );

  const activePlaylist = resolveUnifiedPlaylistByScope(playlistScope);

  const [rawAnchorIndex, setAnchorIndex] = useState<number>(() => {
    const p = readUrlParams();
    const initRoute = p.fw ? 'layer-0' : normalizeMenuRoute(p.route) ?? 'main-menu';
    return findPlaylistStepIndex(
      resolveUnifiedPlaylistByScope('all'),
      initRoute,
      resolveLayer1ContextSpec(p.ctx).id,
      p.route !== 'garage' && p.subtab ? p.subtab : 'gameplay',
      p.route === 'garage' && p.subtab ? p.subtab : 'car',
      undefined,
      p.fw || null,
      p.fwTab || ''
    );
  }, 'anchorIndex');

  const anchorIndex = Math.max(0, Math.min(activePlaylist.length - 1, rawAnchorIndex));
  const anchorPlaylistStep = activePlaylist[anchorIndex] || activePlaylist[0];

  const activeViewSummary = {
    route: currentRoute,
    contextMode: stickySessionContext,
    settingsTab,
    garageTab,
    layer3StepOverride,
    activeFloatingWindowId,
    activeFloatingSubTab,
  };

  const isFreeRoaming = !doesViewMatchPlaylistStep(anchorPlaylistStep, activeViewSummary);
  const activeViewRoamLabel = formatActiveViewRoamLabel(activeViewSummary);

  const matchedStepIdx = findPlaylistStepIndex(
    activePlaylist,
    currentRoute,
    stickySessionContext,
    settingsTab,
    garageTab,
    layer3StepOverride,
    activeFloatingWindowId,
    activeFloatingSubTab
  );
  const activePlaylistIdx = anchorIndex;
  const activePlaylistStep =
    (doesViewMatchPlaylistStep(activePlaylist[matchedStepIdx], activeViewSummary)
      ? activePlaylist[matchedStepIdx]
      : undefined) || anchorPlaylistStep;

  useMenuLayerUrlSync({
    visibilityTier,
    setVisibilityTier,
    currentRoute,
    setCurrentRoute,
    setDisplayedRoute,
    settingsTab,
    setSettingsTab,
    garageTab,
    setGarageTab,
    layer1ContextMode: stickySessionContext,
    setLayer1ContextMode: setStickySessionContext,
    floatingSync: {
      activeFloatingWindowId,
      setActiveFloatingWindowId,
      activeFloatingSubTab,
      setActiveFloatingSubTab,
      onRestoreFloatingFromUrl: (fwId) => {
        const fwStep = ALL_UNIFIED_APPROVAL_PLAYLIST.find(
          (s) => isFloatingWindowPlaylistUnit(s) && s.windowId === fwId
        );
        if (fwStep && isFloatingWindowPlaylistUnit(fwStep)) {
          spawnFloatingPresetOnUnifiedStage(fwStep.preset);
        }
      },
    },
  });

  const auditInfo = resolveRouteAuditInfo(
    currentRoute,
    visibilityTier,
    stickySessionContext,
    activePlaylistStep
  );

  useEffect(() => {
    const store = useReviewLedgerStore.getState();
    store.setPlaylistScope(playlistScope);
    store.setActiveUnit({
      surfaceId: auditInfo.surfaceId,
      variantId: auditInfo.variantId,
      label: activePlaylistStep?.label || currentRoute,
      referenceCode: auditInfo.referenceCode,
      componentName: auditInfo.componentName,
      sourceFile: auditInfo.sourceFile,
    });
  }, [
    playlistScope,
    auditInfo.surfaceId,
    auditInfo.variantId,
    auditInfo.referenceCode,
    auditInfo.componentName,
    auditInfo.sourceFile,
    activePlaylistStep?.label,
    currentRoute,
  ]);

  useEffect(() => {
    broadcastStageTargetToWorkbench({
      currentRoute,
      settingsTab,
      garageTab,
      visibilityTier,
      activeFloatingWindowId,
      activeFloatingSubTab,
      stepLabel: activePlaylistStep?.label,
    });
  }, [
    currentRoute,
    settingsTab,
    garageTab,
    visibilityTier,
    activeFloatingWindowId,
    activeFloatingSubTab,
    activePlaylistStep?.label,
  ]);

  const handleChangeVisibilityTier = (nextTier: MenuVisibilityTier) => {
    setVisibilityTier(nextTier);
    setAnchorIndex(0);
    setRouteHistory([]);
    if (playlistScope !== 'all') setPlaylistScope(nextTier);
    if (nextTier === 'developer') {
      if (stickySessionContext !== 'dev-test-lab' && stickySessionContext !== 'exp-multi-bots') {
        setStickySessionContext('dev-test-lab');
      }
      setSettingsTab('developer');
      if (MENU_ROUTE_CONFIG[currentRoute]?.tier === 'user') {
        setActiveFloatingWindowId(null);
        setCurrentRoute('settings');
        setDisplayedRoute('settings');
      }
    } else {
      if (stickySessionContext === 'dev-test-lab' || stickySessionContext === 'exp-multi-bots') {
        setStickySessionContext('freeplay');
      }
      if (settingsTab === 'developer') setSettingsTab('gameplay');
      if (MENU_ROUTE_CONFIG[currentRoute]?.tier === 'developer') {
        setActiveFloatingWindowId(null);
        setCurrentRoute('main-menu');
        setDisplayedRoute('main-menu');
      }
    }
  };

  const handleChangePlaylistScope = (nextScope: UnifiedPlaylistScope) => {
    setPlaylistScope(nextScope);
    setAnchorIndex(0);
    if (nextScope === 'user' || nextScope === 'developer') {
      handleChangeVisibilityTier(nextScope);
    }
  };

  const handleSelectRoute = (
    rawTargetRoute: ActiveMenuRoute,
    options?: { pushHistory?: boolean; keepFloatingWindow?: boolean }
  ) => {
    const targetRoute = normalizeMenuRoute(rawTargetRoute) ?? rawTargetRoute;
    if (!options?.keepFloatingWindow && activeFloatingWindowId) {
      setActiveFloatingWindowId(null);
      setActiveFloatingSubTab('');
    }
    if (targetRoute === currentRoute && !activeFloatingWindowId) return;
    if (options?.pushHistory !== false && currentRoute !== 'layer-0' && targetRoute !== 'layer-0') {
      setRouteHistory((prev) =>
        (prev[prev.length - 1] === currentRoute ? prev : [...prev, currentRoute]).slice(-16)
      );
    } else if (targetRoute === 'layer-0' || targetRoute === 'main-menu') {
      setRouteHistory([]);
    }
    if (liveAnimPhase !== 'expanded') setLiveAnimPhase('expanded');
    if (currentRoute === 'layer-0' && targetRoute !== 'layer-0') {
      floatingStore.triggerBatchMinimize();
    }
    if (transitionMode === 'fluid-morph') {
      setCurrentRoute(targetRoute);
      setDisplayedRoute(targetRoute);
      return;
    }
    setStepPhase('fadeOut');
    setTimeout(() => {
      setCurrentRoute(targetRoute);
      setDisplayedRoute(targetRoute);
      setStepPhase('resize');
      setTimeout(() => {
        setStepPhase('fadeIn');
        setTimeout(() => setStepPhase('idle'), 100);
      }, 150);
    }, 100);
  };

  const applyUnifiedStep = (
    step: UnifiedApprovalPlaylistStep,
    nextIdx: number,
    announceMsg?: string
  ) =>
    executeUnifiedStepTransition({
      step,
      nextIdx,
      announceMsg,
      visibilityTier,
      stickySessionContext,
      activeFloatingWindowId,
      layer3StepOverride,
      setAnchorIndex,
      setRouteHistory,
      setVisibilityTier,
      setActiveFloatingWindowId,
      setActiveFloatingSubTab,
      setCurrentRoute,
      setDisplayedRoute,
      setStickySessionContext,
      setSettingsTab,
      setGarageTab,
      setLayer3StepOverride,
      handleSelectRoute,
      showToast,
    });

  const navigationSeq = useReviewLedgerStore((s) => s.navigationSeq);
  const activeUnitKey = useReviewLedgerStore((s) => s.activeUnitKey);
  useEffect(() => {
    if (navigationSeq === 0) return;
    const matchedStep = findUnifiedStepByLedgerKey(activeUnitKey);
    if (!matchedStep) return;
    const nextScope =
      playlistScope !== 'all' && matchedStep.tier !== playlistScope ? 'all' : playlistScope;
    if (nextScope !== playlistScope) setPlaylistScope('all');
    const targetList = resolveUnifiedPlaylistByScope(nextScope);
    const nextIdx = Math.max(0, targetList.findIndex((s) => s.id === matchedStep.id));
    applyUnifiedStep(matchedStep, nextIdx);
  }, [navigationSeq]);

  const handleTriggerCollapse = () => {
    if (liveAnimPhase !== 'expanded') return;
    setLiveAnimPhase('collapsing_content');
    setTimeout(() => {
      setLiveAnimPhase('collapsing_resize');
      setTimeout(() => setLiveAnimPhase('collapsed'), 260);
    }, 100);
  };

  const handleTriggerExpand = () => {
    if (liveAnimPhase !== 'collapsed') return;
    setLiveAnimPhase('expanding_content');
    setTimeout(() => {
      setLiveAnimPhase('expanding_resize');
      setTimeout(() => setLiveAnimPhase('expanded'), 260);
    }, 80);
  };

  const handleNavigateBack = () => {
    if (currentRoute === 'layer-0') {
      floatingStore.triggerBatchMinimize();
      setActiveFloatingWindowId(null);
      handleSelectRoute('main-menu', { pushHistory: false });
      showToast('ESC: Open Main Menu (Expanded floating window collapsed)');
      return;
    }
    if (currentRoute === 'main-menu') {
      handleSelectRoute('layer-0', { pushHistory: false });
      showToast('ESC: Return to game (Layer 0)');
      return;
    }
    if ((currentRoute === 'trajectory' || currentRoute === 'camera') && liveAnimPhase === 'collapsed') {
      handleTriggerExpand();
      return;
    }
    if (routeHistory.length > 0) {
      const prevRoute = routeHistory[routeHistory.length - 1];
      setRouteHistory((prev) => prev.slice(0, -1));
      handleSelectRoute(prevRoute, { pushHistory: false });
      return;
    }
    handleSelectRoute(MENU_ROUTE_CONFIG[currentRoute]?.parentRoute ?? 'main-menu', {
      pushHistory: false,
    });
  };

  const stepPlaylistToIndex = (rawIndex: number) => {
    const nextIdx = (rawIndex + activePlaylist.length) % activePlaylist.length;
    const step = activePlaylist[nextIdx];
    if (step) applyUnifiedStep(step, nextIdx, `[${nextIdx + 1}/${activePlaylist.length}] ${step.label}`);
  };

  const stepPlaylistBy = (delta: 1 | -1) => stepPlaylistToIndex(anchorIndex + delta);

  const handleReturnToAnchor = () => {
    const step = activePlaylist[anchorIndex];
    if (step) applyUnifiedStep(step, anchorIndex, `Returned to #${anchorIndex + 1} ${step.label}`);
  };

  useEffect(
    () =>
      bindMenuLayerStageKeydown({
        currentRoute,
        stickySessionContext,
        liveAnimPhase,
        isModalOpen: () => dialogue.getCount() > 0,
        onTriggerCollapse: handleTriggerCollapse,
        onTriggerExpand: handleTriggerExpand,
        onToggleEdgeInspector: () =>
          useStaticTrainingPackStore.getState().toggleEdgeInspectorExpanded(),
        onNavigateBack: handleNavigateBack,
        onStepPlaylist: stepPlaylistBy,
      }),
    [
      currentRoute,
      stickySessionContext,
      liveAnimPhase,
      lastParentRoute,
      routeHistory,
      activePlaylist,
      anchorIndex,
      activeFloatingWindowId,
      activeFloatingSubTab,
    ]
  );

  return {
    playlistScope,
    handleChangePlaylistScope,
    visibilityTier,
    layer1ContextMode: stickySessionContext,
    setLayer1ContextMode: setStickySessionContext,
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
  };
}
