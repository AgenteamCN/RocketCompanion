import {
  LAYER1_CONTEXT_VARIATIONS,
  resolveLayer1ContextSpec,
  type CanonicalLayer1ContextVariation,
  type Layer1MenuContextMode,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import { floatingStore } from '../../../ui-core/stores/floatingStore';
import { useStaticTrainingPackStore } from '../../../ui-core/stores/staticTrainingPackStore';
import {
  buildFloatingWindowCrossTabTarget,
  buildMenuRouteCrossTabTarget,
  publishCrossTabActiveTarget,
} from '../../stores/crossTabTargetFollow';
import {
  MENU_ROUTE_CONFIG,
  normalizeMenuRoute,
  type ActiveMenuRoute,
  type LinearPlaylistStep,
  type MenuVisibilityTier,
} from './menuLayerRouteConfig';
import { isFloatingWindowPlaylistUnit } from '../floating-windows/floatingWindowsLinearPlaylists';
import {
  spawnFloatingPresetOnUnifiedStage,
  type UnifiedApprovalPlaylistStep,
} from './menuLayerLinearPlaylists';
import type { Layer3StepOverrideState } from './MenuLayerSandboxContext';
import { matchesOnlineRoomPlaylistStep } from './menuLayerOnlineRoomSteps';

export interface ActiveViewStateSummary {
  route: ActiveMenuRoute;
  contextMode: CanonicalLayer1ContextVariation;
  settingsTab: string;
  garageTab: string;
  layer3StepOverride: Layer3StepOverrideState;
  activeFloatingWindowId?: string | null;
  activeFloatingSubTab?: string;
}

export function doesViewMatchPlaylistStep(
  step: UnifiedApprovalPlaylistStep | LinearPlaylistStep | undefined,
  view: ActiveViewStateSummary
): boolean {
  if (!step) return false;
  if (isFloatingWindowPlaylistUnit(step)) {
    return (
      view.route === 'layer-0' &&
      view.activeFloatingWindowId === step.windowId &&
      (step.subtab || '') === (view.activeFloatingSubTab || '')
    );
  }
  if (view.activeFloatingWindowId) return false;

  const canonicalStepRoute = normalizeMenuRoute(step.route) ?? step.route;
  const canonicalViewRoute = normalizeMenuRoute(view.route) ?? view.route;
  if (canonicalStepRoute !== canonicalViewRoute) return false;

  if (canonicalViewRoute === 'layer-0') {
    const stepIsEdge = step.contextMode === 'static-training-edit';
    const viewIsEdge = view.contextMode === 'static-training-edit';
    return stepIsEdge === viewIsEdge;
  }

  if (
    (canonicalViewRoute === 'main-menu' || canonicalViewRoute === 'manage-room') &&
    step.contextMode
  ) {
    return (
      resolveLayer1ContextSpec(step.contextMode).id === view.contextMode &&
      matchesOnlineRoomPlaylistStep(
        step,
        canonicalViewRoute,
        view.contextMode,
        view.layer3StepOverride
      )
    );
  }

  if (canonicalViewRoute === 'settings' && step.subtab) {
    return step.subtab === view.settingsTab;
  }

  if (canonicalViewRoute === 'garage' && step.subtab) {
    return step.subtab === view.garageTab;
  }

  if (
    (canonicalViewRoute === 'host-match' ||
      canonicalViewRoute === 'host-training' ||
      canonicalViewRoute === 'join-room') &&
    step.progressStatus
  ) {
    return matchesOnlineRoomPlaylistStep(
      step,
      canonicalViewRoute,
      view.contextMode,
      view.layer3StepOverride
    );
  }

  return true;
}

export function formatActiveViewRoamLabel(view: ActiveViewStateSummary): string {
  if (view.activeFloatingWindowId) {
    return view.activeFloatingSubTab
      ? `Floating · ${view.activeFloatingWindowId} (${view.activeFloatingSubTab})`
      : `Floating · ${view.activeFloatingWindowId}`;
  }
  const canonicalRoute = normalizeMenuRoute(view.route) ?? view.route;
  if (canonicalRoute === 'layer-0' && view.contextMode === 'static-training-edit') {
    return 'Edge Inspector · Static Training';
  }
  if (canonicalRoute === 'main-menu') {
    const spec = resolveLayer1ContextSpec(view.contextMode);
    return `Main Menu (${spec.shortLabel})`;
  }
  if (canonicalRoute === 'garage') {
    const tabTitle = view.garageTab.charAt(0).toUpperCase() + view.garageTab.slice(1);
    return `Garage · ${tabTitle}`;
  }
  if (canonicalRoute === 'settings') {
    const tabTitle = view.settingsTab.charAt(0).toUpperCase() + view.settingsTab.slice(1);
    return `Settings · ${tabTitle}`;
  }
  if (canonicalRoute === 'manage-room') {
    const spec = resolveLayer1ContextSpec(view.contextMode);
    const slots = view.layer3StepOverride.memberSlots ?? 3;
    return `Room Control (${spec.shortLabel} · ${slots}S)`;
  }
  return MENU_ROUTE_CONFIG[canonicalRoute]?.label || canonicalRoute;
}

export function getStickySessionContextOptions(tier: 'user' | 'developer') {
  const tierVariations = LAYER1_CONTEXT_VARIATIONS.filter((v) => v.tier === tier);
  if (tier === 'user') {
    return tierVariations;
  }
  const freeplaySpec = LAYER1_CONTEXT_VARIATIONS[0];
  return [freeplaySpec, ...tierVariations];
}

export function broadcastStageTargetToWorkbench(params: {
  currentRoute: ActiveMenuRoute;
  settingsTab: string;
  garageTab: string;
  visibilityTier: MenuVisibilityTier;
  activeFloatingWindowId: string | null;
  activeFloatingSubTab: string;
  stepLabel?: string;
}): void {
  const {
    currentRoute,
    settingsTab,
    garageTab,
    visibilityTier,
    activeFloatingWindowId,
    activeFloatingSubTab,
    stepLabel,
  } = params;
  if (currentRoute === 'layer-0' && activeFloatingWindowId) {
    publishCrossTabActiveTarget(
      buildFloatingWindowCrossTabTarget({
        windowId: activeFloatingWindowId,
        title: stepLabel || activeFloatingWindowId,
        subtab: activeFloatingSubTab || undefined,
        tier: visibilityTier,
      })
    );
    return;
  }
  publishCrossTabActiveTarget(
    buildMenuRouteCrossTabTarget({
      route: currentRoute,
      settingsTab,
      garageTab,
      tier: visibilityTier,
      label: stepLabel || MENU_ROUTE_CONFIG[currentRoute]?.label || currentRoute,
    })
  );
}

export function executeUnifiedStepTransition(params: {
  step: UnifiedApprovalPlaylistStep;
  nextIdx: number;
  announceMsg?: string;
  visibilityTier: MenuVisibilityTier;
  stickySessionContext: Layer1MenuContextMode;
  activeFloatingWindowId: string | null;
  layer3StepOverride: Layer3StepOverrideState;
  setAnchorIndex: (idx: number) => void;
  setRouteHistory: (history: ActiveMenuRoute[]) => void;
  setVisibilityTier: (tier: MenuVisibilityTier) => void;
  setActiveFloatingWindowId: (id: string | null) => void;
  setActiveFloatingSubTab: (tab: string) => void;
  setCurrentRoute: (route: ActiveMenuRoute) => void;
  setDisplayedRoute: (route: ActiveMenuRoute) => void;
  setStickySessionContext: (mode: Layer1MenuContextMode) => void;
  setSettingsTab: (tab: string) => void;
  setGarageTab: (tab: string) => void;
  setLayer3StepOverride: (next: Layer3StepOverrideState) => void;
  handleSelectRoute: (
    route: ActiveMenuRoute,
    options?: { pushHistory?: boolean; keepFloatingWindow?: boolean }
  ) => void;
  showToast: (msg: string) => void;
}): void {
  const {
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
  } = params;

  setAnchorIndex(nextIdx);
  setRouteHistory([]);
  if (step.tier !== visibilityTier) setVisibilityTier(step.tier);
  if (isFloatingWindowPlaylistUnit(step)) {
    useStaticTrainingPackStore.getState().setEdgeInspectorExpanded(false);
    setActiveFloatingWindowId(step.windowId);
    setActiveFloatingSubTab(step.subtab || '');
    setCurrentRoute('layer-0');
    setDisplayedRoute('layer-0');
    spawnFloatingPresetOnUnifiedStage(step.preset);
    if (announceMsg) showToast(announceMsg);
    return;
  }
  if (activeFloatingWindowId) {
    setActiveFloatingWindowId(null);
    setActiveFloatingSubTab('');
    floatingStore.clearAll();
  }
  if (step.route === 'layer-0') {
    const isEdge = step.contextMode === 'static-training-edit';
    if (isEdge) setStickySessionContext('static-training-edit');
    else if (stickySessionContext === 'static-training-edit') setStickySessionContext('freeplay');
    useStaticTrainingPackStore.getState().setEdgeInspectorExpanded(isEdge);
  } else {
    useStaticTrainingPackStore.getState().setEdgeInspectorExpanded(false);
    if (step.contextMode) setStickySessionContext(step.contextMode);
    if (step.route === 'settings' && step.subtab) setSettingsTab(step.subtab);
    if (step.route === 'garage' && step.subtab) setGarageTab(step.subtab);
    setLayer3StepOverride({
      progressStatus: step.progressStatus ?? 'idle',
      currentStep: step.currentStep ?? 1,
      defaultEditingConfig: Boolean(step.defaultEditingConfig),
      memberSlots: step.memberSlots ?? layer3StepOverride.memberSlots ?? 3,
    });
  }
  handleSelectRoute(step.route, { pushHistory: false });
  if (announceMsg) showToast(announceMsg);
}

export function bindMenuLayerStageKeydown(params: {
  currentRoute: ActiveMenuRoute;
  stickySessionContext: Layer1MenuContextMode;
  liveAnimPhase: string;
  isModalOpen: () => boolean;
  onTriggerCollapse: () => void;
  onTriggerExpand: () => void;
  onToggleEdgeInspector: () => void;
  onNavigateBack: () => void;
  onStepPlaylist: (delta: 1 | -1) => void;
}): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || params.isModalOpen()) return;
    const target = e.target as HTMLElement | null;
    const isEditable =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (e.key === 'Tab') {
      if (params.currentRoute === 'trajectory' || params.currentRoute === 'camera') {
        e.preventDefault();
        if (params.liveAnimPhase === 'expanded') params.onTriggerCollapse();
        else if (params.liveAnimPhase === 'collapsed') params.onTriggerExpand();
      } else if (
        params.currentRoute === 'layer-0' &&
        params.stickySessionContext === 'static-training-edit'
      ) {
        e.preventDefault();
        params.onToggleEdgeInspector();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      params.onNavigateBack();
    } else if (!isEditable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      params.onStepPlaylist(e.key === 'ArrowRight' ? 1 : -1);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}

