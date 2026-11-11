import { useEffect, useRef } from 'react';
import { readUrlParams, updateUrlParams } from '../../stores/urlSync';
import {
  resolveLayer1ContextSpec,
  type Layer1MenuContextMode,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import {
  type ActiveMenuRoute,
  type MenuVisibilityTier,
  normalizeMenuRoute,
} from './menuLayerRouteConfig';

export interface MenuLayerFloatingUrlSyncBindings {
  activeFloatingWindowId: string | null;
  setActiveFloatingWindowId: (id: string | null) => void;
  activeFloatingSubTab: string;
  setActiveFloatingSubTab: (tab: string) => void;
  onRestoreFloatingFromUrl?: (fwId: string, fwTab?: string) => void;
}

export interface UseMenuLayerUrlSyncParams {
  visibilityTier: MenuVisibilityTier;
  setVisibilityTier: (tier: MenuVisibilityTier) => void;
  currentRoute: ActiveMenuRoute;
  setCurrentRoute: (route: ActiveMenuRoute) => void;
  setDisplayedRoute: (route: ActiveMenuRoute) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  garageTab: string;
  setGarageTab: (tab: string) => void;
  layer1ContextMode: Layer1MenuContextMode;
  setLayer1ContextMode: (mode: Layer1MenuContextMode) => void;
  floatingSync?: MenuLayerFloatingUrlSyncBindings;
}

export function useMenuLayerUrlSync({
  visibilityTier,
  setVisibilityTier,
  currentRoute,
  setCurrentRoute,
  setDisplayedRoute,
  settingsTab,
  setSettingsTab,
  garageTab,
  setGarageTab,
  layer1ContextMode,
  setLayer1ContextMode,
  floatingSync,
}: UseMenuLayerUrlSyncParams): void {
  const isRestoringFromUrlRef = useRef(false);
  const hasMountedUrlSyncRef = useRef(false);

  useEffect(() => {
    const syncFromUrl = () => {
      const p = readUrlParams();
      if (!p.route && !p.tier && !p.subtab && !p.ctx && !p.fw) return;
      isRestoringFromUrlRef.current = true;
      if (p.tier === 'user' || p.tier === 'developer') {
        setVisibilityTier(p.tier);
      }
      if (p.fw && floatingSync) {
        setCurrentRoute('layer-0');
        setDisplayedRoute('layer-0');
        floatingSync.setActiveFloatingWindowId(p.fw);
        floatingSync.setActiveFloatingSubTab(p.fwTab || '');
        floatingSync.onRestoreFloatingFromUrl?.(p.fw, p.fwTab);
        return;
      }
      if (floatingSync) {
        floatingSync.setActiveFloatingWindowId(null);
      }
      const nextRoute = normalizeMenuRoute(p.route);
      if (nextRoute) {
        setCurrentRoute(nextRoute);
        setDisplayedRoute(nextRoute);
      }
      if (p.subtab) {
        if (p.route === 'garage') {
          setGarageTab(p.subtab);
        } else {
          setSettingsTab(p.subtab);
        }
      }
      if (p.ctx) {
        setLayer1ContextMode(resolveLayer1ContextSpec(p.ctx).id);
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const activeFwId = floatingSync?.activeFloatingWindowId ?? null;
  const activeFwTab = floatingSync?.activeFloatingSubTab ?? '';

  useEffect(() => {
    const isFwActive = currentRoute === 'layer-0' && Boolean(activeFwId);
    const subtab = isFwActive
      ? null
      : currentRoute === 'settings'
      ? settingsTab
      : currentRoute === 'garage'
      ? garageTab
      : null;
    const shouldPush = hasMountedUrlSyncRef.current && !isRestoringFromUrlRef.current;
    hasMountedUrlSyncRef.current = true;
    isRestoringFromUrlRef.current = false;
    updateUrlParams(
      {
        tier: visibilityTier,
        route: normalizeMenuRoute(currentRoute) ?? currentRoute,
        subtab,
        ctx: !isFwActive ? layer1ContextMode : null,
        fw: isFwActive ? activeFwId : null,
        fwTab: isFwActive && activeFwTab ? activeFwTab : null,
      },
      { push: shouldPush }
    );
  }, [
    visibilityTier,
    currentRoute,
    settingsTab,
    garageTab,
    layer1ContextMode,
    activeFwId,
    activeFwTab,
  ]);
}
