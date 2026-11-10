import React, { createContext, useContext } from 'react';
import type { ContainerTransitionMode } from '../../../ui-core/tokens/easing';
import type {
  ClampedMenuPanelGeometry,
  MenuPanelWidthAdaptiveMode,
} from '../../../ui-core/navigation/menuPanelAdaptive';
import type { FloatingWindowItem } from '../../../ui-core/stores/floatingStore';
import type { PresetConfig } from '../../../ui-core/stores/floatingPresets';
import type { Layer1MenuContextMode } from '../../../ui-core/recipes/layer1MenuContextSpecs';
import type { ShowcaseTab } from '../../sidebarNavConfig';
import type {
  ActiveMenuRoute,
  Layer3StepProgressStatus,
  LivePreviewAnimPhase,
  MenuVisibilityTier,
} from './menuLayerRouteConfig';
import type {
  resolveRouteAuditInfo,
  UnifiedApprovalPlaylistStep,
  UnifiedPlaylistScope,
} from './menuLayerLinearPlaylists';

export interface Layer3StepOverrideState {
  progressStatus?: Layer3StepProgressStatus;
  currentStep?: number;
  defaultEditingConfig?: boolean;
  memberSlots?: 1 | 3;
}

export interface MenuLayerSandboxContextValue {
  stageRef: React.RefObject<HTMLDivElement | null>;
  contentWrapperRef: React.RefObject<HTMLDivElement | null>;
  containerPreset: 'full' | '1080p-compact' | 'small-squeeze';
  setContainerPreset: (preset: 'full' | '1080p-compact' | 'small-squeeze') => void;
  boundaryLocked: boolean;
  manualBoundarySize: { width: number; height: number };
  setManualBoundarySize: (next: { width: number; height: number }) => void;
  effectiveStageW: number;
  effectiveStageH: number;
  handleToggleBoundaryLock: () => void;
  handleChangeManualBoundarySize: (next: { width: number; height: number }) => void;
  isCursorHidden: boolean;
  currentRoute: ActiveMenuRoute;
  displayedRoute: ActiveMenuRoute;
  activeFloatingWindowId: string | null;
  setActiveFloatingWindowId: (id: string | null) => void;
  activeFloatingSubTab: string;
  setActiveFloatingSubTab: (tab: string) => void;
  playlistScope: UnifiedPlaylistScope;
  handleChangePlaylistScope: (scope: UnifiedPlaylistScope) => void;
  isDockState: boolean;
  ballSimSpeed: number;
  hasStackIcon: boolean;
  backdropDuration: number;
  triggerShake: () => void;
  showToast: (msg: string) => void;
  feedbackToast: string | null;
  handleSelectRoute: (targetRoute: ActiveMenuRoute, options?: { pushHistory?: boolean }) => void;
  handleNavigateBack: () => void;
  isShaking: boolean;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  targetRadius: number;
  handleTriggerExpand: () => void;
  handleTriggerCollapse: () => void;
  isPillHovered: boolean;
  setIsPillHovered: (v: boolean) => void;
  isPillContentVisible: boolean;
  isContentVisible: boolean;
  visibilityTier: MenuVisibilityTier;
  handleChangeVisibilityTier: (tier: MenuVisibilityTier) => void;
  layer1ContextMode: Layer1MenuContextMode;
  setLayer1ContextMode: (mode: Layer1MenuContextMode) => void;
  stickySessionContext: Layer1MenuContextMode;
  setStickySessionContext: (mode: Layer1MenuContextMode) => void;
  touchMode: boolean;
  setTouchMode: (v: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  garageTab: string;
  setGarageTab: (tab: string) => void;
  bgRenderPaused: boolean;
  setBgRenderPaused: (v: boolean) => void;
  lastParentRoute: ActiveMenuRoute;
  setLastParentRoute: (r: ActiveMenuRoute) => void;
  handleAddPresetWindow: (preset: PresetConfig, e: React.MouseEvent<HTMLButtonElement>) => void;
  windows: FloatingWindowItem[];
  minimizedCount: number;
  totalCount: number;
  closeWindow: (id: string) => void;
  setLiveAnimPhase: (phase: LivePreviewAnimPhase) => void;
  layer3StepOverride: Layer3StepOverrideState;
  setLayer3StepOverride: (next: Layer3StepOverrideState) => void;
  stepPlaylistBy: (delta: -1 | 1) => void;
  stepPlaylistToIndex: (index: number) => void;
  handleReturnToAnchor: () => void;
  anchorIndex: number;
  anchorPlaylistStep: UnifiedApprovalPlaylistStep | undefined;
  isFreeRoaming: boolean;
  activeViewRoamLabel: string;
  activePlaylistIdx: number;
  activePlaylist: UnifiedApprovalPlaylistStep[];
  activePlaylistStep: UnifiedApprovalPlaylistStep | undefined;
  transitionMode: ContainerTransitionMode;
  setTransitionMode: (mode: ContainerTransitionMode) => void;
  auditInfo: ReturnType<typeof resolveRouteAuditInfo>;
  showInlineTuner: boolean;
  setShowInlineTuner: React.Dispatch<React.SetStateAction<boolean>>;
  onNavigateShowcase?: (tab: ShowcaseTab, targetId?: string) => void;
  onNavigateToPlayCards?: () => void;
  widthMode: MenuPanelWidthAdaptiveMode;
  setWidthMode: (mode: MenuPanelWidthAdaptiveMode) => void;
  activeRouteSize: ClampedMenuPanelGeometry;
  minWidthDraft: string;
  setMinWidthDraft: (v: string) => void;
  setIsEditingMinWidth: (v: boolean) => void;
  hasManualMinOverride: boolean;
  applyManualMinWidth: (nextVal: number) => void;
  handleResetAutoMinWidth: () => void;
}

const MenuLayerSandboxContext = createContext<MenuLayerSandboxContextValue | null>(null);

export const MenuLayerSandboxProvider = MenuLayerSandboxContext.Provider;

export function useMenuLayerSandbox(): MenuLayerSandboxContextValue {
  const ctx = useContext(MenuLayerSandboxContext);
  if (!ctx) {
    throw new Error('useMenuLayerSandbox must be used within a MenuLayerSandboxProvider');
  }
  return ctx;
}
