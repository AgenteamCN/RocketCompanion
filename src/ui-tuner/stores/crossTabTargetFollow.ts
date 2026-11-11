import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { crossClientSync, useSyncedState } from './crossClientSync';
import type { ActiveMenuRoute, MenuVisibilityTier } from '../pages/menu-layer/menuLayerRouteConfig';
import { resolveNodePathInspectorLinks } from '../pages/menu-layer/menuLayerInspectorLinks';

export const CROSS_TAB_ACTIVE_TARGET_SYNC_KEY = 'sync:activeTarget';
const FOLLOW_STAGE_SESSION_KEY = 'rc-ui-tuner:follow-stage';

export type CrossTabTargetKind = 'menu-route' | 'floating-window' | 'live-preview' | 'edge-inspector';

export interface CrossTabActiveTarget {
  kind: CrossTabTargetKind;
  /** Semantic target ID (e.g. 'garage', 'main-menu', 'replay-viewer') */
  targetId: string;
  /** Canonical surface ledger ID (e.g. 'recipe:Layer2GarageRecipe', 'floating:replay-viewer') */
  surfaceId: string;
  /** Human-readable display label (e.g. 'Garage Loadout · Car', 'Replay Viewer') */
  label: string;
  /** Active menu route when kind === 'menu-route' */
  route?: ActiveMenuRoute;
  /** Active subtab (e.g. settingsTab, garageTab, floating window subtab) */
  subtab?: string;
  /** Mapped Surface Workbench recipe item ID in RecipesPage (e.g. 'recipe-6a-3-garage') */
  recipeId?: string;
  /** Mapped floating window preset ID in FloatingWindowsSimulationPage */
  floatingWindowId?: string;
  /** Active visibility tier ('user' | 'developer') */
  tier?: MenuVisibilityTier;
  /** Monotonic sequence counter / timestamp of last target focus update */
  updatedAt: number;
}

export const DEFAULT_CROSS_TAB_ACTIVE_TARGET: CrossTabActiveTarget = {
  kind: 'menu-route',
  targetId: 'main-menu',
  surfaceId: 'recipe:Layer1MainMenuRecipe',
  label: 'Main Menu',
  route: 'main-menu',
  recipeId: 'recipe-6a-1-main',
  tier: 'user',
  updatedAt: 0,
};

let windowLocalFollowingStage: boolean = readInitialFollowingStage();
const followListeners = new Set<() => void>();

function readInitialFollowingStage(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.sessionStorage.getItem(FOLLOW_STAGE_SESSION_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function getIsFollowingStage(): boolean {
  return windowLocalFollowingStage;
}

export function setIsFollowingStage(next: boolean | ((prev: boolean) => boolean)): void {
  const resolved = typeof next === 'function' ? next(windowLocalFollowingStage) : next;
  if (resolved === windowLocalFollowingStage) return;
  windowLocalFollowingStage = resolved;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(FOLLOW_STAGE_SESSION_KEY, resolved ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }
  followListeners.forEach((listener) => listener());
}

export function subscribeFollowingStage(listener: () => void): () => void {
  followListeners.add(listener);
  return () => {
    followListeners.delete(listener);
  };
}

export function useFollowingStageState(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const isFollowing = useSyncExternalStore(
    subscribeFollowingStage,
    getIsFollowingStage,
    () => true
  );
  const toggleOrSet = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setIsFollowingStage(next);
  }, []);
  return [isFollowing, toggleOrSet];
}

export function buildMenuRouteCrossTabTarget(params: {
  route: ActiveMenuRoute;
  settingsTab?: string;
  garageTab?: string;
  tier?: MenuVisibilityTier;
  label?: string;
}): CrossTabActiveTarget {
  const {
    route,
    settingsTab = 'gameplay',
    garageTab = 'car',
    tier = 'user',
    label,
  } = params;
  const inspector = resolveNodePathInspectorLinks(route, settingsTab, garageTab);
  const recipeId = inspector.pageRecipeTarget.targetId || 'recipe-6a-1-main';
  const componentName = inspector.pageRecipeTarget.componentName || 'Layer1MainMenuRecipe';
  const subtab =
    route === 'settings' ? settingsTab : route === 'garage' ? garageTab : undefined;
  const surfaceId =
    route === 'layer-0'
      ? 'stage:ActiveMatchLayer0'
      : `recipe:${componentName}`;

  return {
    kind: 'menu-route',
    targetId: route,
    surfaceId,
    label: label || inspector.pageRecipeTarget.label.replace(/^[0-9A-Z.]+\s+/, ''),
    route,
    subtab,
    recipeId,
    tier,
    updatedAt: Date.now(),
  };
}

export function buildFloatingWindowCrossTabTarget(params: {
  windowId: string;
  title: string;
  subtab?: string;
  tier?: MenuVisibilityTier;
}): CrossTabActiveTarget {
  const { windowId, title, subtab, tier = 'user' } = params;
  return {
    kind: 'floating-window',
    targetId: windowId,
    surfaceId: `floating:${windowId}`,
    label: subtab ? `${title} (${subtab})` : title,
    subtab,
    floatingWindowId: windowId,
    tier,
    updatedAt: Date.now(),
  };
}

export function publishCrossTabActiveTarget(target: CrossTabActiveTarget): void {
  const prev = crossClientSync.get<CrossTabActiveTarget>(
    CROSS_TAB_ACTIVE_TARGET_SYNC_KEY,
    DEFAULT_CROSS_TAB_ACTIVE_TARGET
  );
  const norm = (val?: string) => (val && val.length > 0 ? val : undefined);
  if (
    prev &&
    prev.kind === target.kind &&
    prev.targetId === target.targetId &&
    norm(prev.subtab) === norm(target.subtab) &&
    norm(prev.recipeId) === norm(target.recipeId) &&
    norm(prev.floatingWindowId) === norm(target.floatingWindowId) &&
    (prev.tier ?? 'user') === (target.tier ?? 'user')
  ) {
    return;
  }
  crossClientSync.set<CrossTabActiveTarget>(CROSS_TAB_ACTIVE_TARGET_SYNC_KEY, {
    ...target,
    updatedAt: Date.now(),
  });
}

export function useCrossTabTargetFollow() {
  const [activeTarget, setActiveTarget] = useSyncedState<CrossTabActiveTarget>(
    CROSS_TAB_ACTIVE_TARGET_SYNC_KEY,
    DEFAULT_CROSS_TAB_ACTIVE_TARGET
  );
  const [isFollowingStage, setFollowingStage] = useFollowingStageState();
  const [lastFollowedAt, setLastFollowedAt] = useState<number>(0);

  useEffect(() => {
    if (isFollowingStage && activeTarget?.updatedAt) {
      setLastFollowedAt(activeTarget.updatedAt);
    }
  }, [isFollowingStage, activeTarget?.updatedAt]);

  return {
    activeTarget: activeTarget ?? DEFAULT_CROSS_TAB_ACTIVE_TARGET,
    setActiveTarget,
    isFollowingStage,
    setFollowingStage,
    toggleFollowingStage: useCallback(() => {
      setFollowingStage((prev) => !prev);
    }, [setFollowingStage]),
    lastFollowedAt,
  };
}
