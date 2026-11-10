import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  WORKSPACE_SECTIONS,
  WORKSPACE_SPECS,
  getApprovalLedgerSummary,
  syncWorkspaceUrlParam,
} from './workspaceSpecs';
import {
  getNavItemMeta,
  getWorkspaceForTab,
  isValidShowcaseTab,
  readWorkspaceFromUrl,
  type ShowcaseTab,
  type TunerWorkspaceId,
} from './sidebarNavConfig';
import { readUrlParams, updateUrlParams } from './stores/urlSync';
import { useSyncedState } from './stores/crossClientSync';
import { useCrossTabTargetFollow } from './stores/crossTabTargetFollow';
import type { JumpOriginRecord } from './SidebarWorkspaceHeader';

export function resolveInitialTabFromUrl(): ShowcaseTab {
  const rawTab = readUrlParams().tab;
  if (isValidShowcaseTab(rawTab)) return rawTab;
  const initialWs = readWorkspaceFromUrl('overview');
  return WORKSPACE_SPECS[initialWs].defaultTab;
}

export function useWorkspaceUrlAndHotkeySync() {
  const initialUrlTab = resolveInitialTabFromUrl();
  /**
   * Window-local workspaceMode / activeTab state:
   * Never broadcast across tabs so Window A can remain on Unified Approval Stage
   * while Window B remains on Surface Workbench.
   */
  const [activeTab, setActiveTab] = React.useState<ShowcaseTab>(initialUrlTab);
  const [isLight, setIsLight] = useSyncedState<boolean>('app:isLight', true);
  const [lastJumpOrigin, setLastJumpOrigin] = React.useState<JumpOriginRecord | null>(
    null
  );
  const [lastTabByWorkspace, setLastTabByWorkspace] = React.useState<
    Record<TunerWorkspaceId, ShowcaseTab>
  >(() => {
    const ws = getWorkspaceForTab(initialUrlTab);
    return {
      primitives:
        ws === 'primitives' ? initialUrlTab : WORKSPACE_SPECS.primitives.defaultTab,
      workbench:
        ws === 'workbench' ? initialUrlTab : WORKSPACE_SPECS.workbench.defaultTab,
      approval:
        ws === 'approval' ? initialUrlTab : WORKSPACE_SPECS.approval.defaultTab,
    };
  });

  const activeWorkspace: TunerWorkspaceId = getWorkspaceForTab(activeTab);
  const activeNavMeta = useMemo(() => getNavItemMeta(activeTab), [activeTab]);
  const ledgerSummary = useMemo(() => getApprovalLedgerSummary(), []);
  const activeSectionMeta = activeNavMeta
    ? WORKSPACE_SECTIONS[activeNavMeta.workspaceSection]
    : undefined;

  const { activeTarget, isFollowingStage } = useCrossTabTargetFollow();
  const prevFollowedStampRef = useRef<number>(activeTarget.updatedAt);

  // When this window is in Surface Workbench and Following Stage is enabled,
  // automatically align between 'recipes' and 'floating-windows' when the remote target kind changes.
  useEffect(() => {
    if (!isFollowingStage) {
      prevFollowedStampRef.current = activeTarget.updatedAt;
      return;
    }
    if (activeTarget.updatedAt <= prevFollowedStampRef.current) return;
    prevFollowedStampRef.current = activeTarget.updatedAt;

    if (activeWorkspace !== 'workbench') return;

    if (
      activeTarget.kind === 'floating-window' &&
      activeTab === 'recipes' &&
      activeTarget.floatingWindowId
    ) {
      setActiveTab('floating-windows');
      updateUrlParams({
        tab: 'floating-windows',
        fw: activeTarget.floatingWindowId,
        ...(activeTarget.subtab ? { fwTab: activeTarget.subtab } : {}),
      });
    } else if (
      activeTarget.kind === 'menu-route' &&
      activeTab === 'floating-windows' &&
      activeTarget.recipeId
    ) {
      setActiveTab('recipes');
      updateUrlParams(
        { tab: 'recipes', recipe: activeTarget.recipeId },
        { hash: activeTarget.recipeId }
      );
    }
  }, [activeTarget, isFollowingStage, activeWorkspace, activeTab]);

  const scrollToAnchorWithRetry = useCallback((targetId?: string) => {
    if (!targetId || typeof document === 'undefined') return;
    const cleanId = targetId.startsWith('#') ? targetId.slice(1) : targetId;
    if (!cleanId) return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(cleanId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 18) window.setTimeout(tryScroll, 80);
    };
    window.setTimeout(tryScroll, 60);
  }, []);

  useEffect(() => {
    updateUrlParams({ tab: activeTab });
    syncWorkspaceUrlParam(getWorkspaceForTab(activeTab));
    if (typeof window !== 'undefined' && window.location.hash) {
      scrollToAnchorWithRetry(window.location.hash);
    }
  }, []);

  useEffect(() => {
    const ws = getWorkspaceForTab(activeTab);
    setLastTabByWorkspace((prev) =>
      prev[ws] === activeTab ? prev : { ...prev, [ws]: activeTab }
    );
    if (readUrlParams().tab !== activeTab) {
      updateUrlParams({ tab: activeTab });
    }
    syncWorkspaceUrlParam(ws);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const nextTab = resolveInitialTabFromUrl();
      setActiveTab(nextTab);
      if (window.location.hash) scrollToAnchorWithRetry(window.location.hash);
      setLastJumpOrigin((prev) => (prev && prev.fromTab === nextTab ? null : prev));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [scrollToAnchorWithRetry]);

  const handleSelectTab = useCallback((nextTab: ShowcaseTab) => {
    const nextWs = getWorkspaceForTab(nextTab);
    setLastTabByWorkspace((prev) => ({ ...prev, [nextWs]: nextTab }));
    updateUrlParams({ tab: nextTab }, { push: true, hash: null });
    syncWorkspaceUrlParam(nextWs);
    setActiveTab(nextTab);
  }, []);

  const handleSelectWorkspace = useCallback(
    (nextWorkspace: TunerWorkspaceId) => {
      if (nextWorkspace === activeWorkspace) return;
      let targetTab =
        lastTabByWorkspace[nextWorkspace] ?? WORKSPACE_SPECS[nextWorkspace].defaultTab;
      if (
        nextWorkspace === 'workbench' &&
        isFollowingStage &&
        activeTarget.kind === 'floating-window'
      ) {
        targetTab = 'floating-windows';
      }
      updateUrlParams(
        {
          tab: targetTab,
          ...(targetTab === 'recipes' && isFollowingStage && activeTarget.recipeId
            ? { recipe: activeTarget.recipeId }
            : {}),
        },
        {
          push: true,
          hash:
            targetTab === 'recipes' && isFollowingStage && activeTarget.recipeId
              ? activeTarget.recipeId
              : null,
        }
      );
      syncWorkspaceUrlParam(nextWorkspace);
      setActiveTab(targetTab);
    },
    [activeWorkspace, lastTabByWorkspace, isFollowingStage, activeTarget]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        handleSelectWorkspace('primitives');
      } else if (e.key === '2') {
        e.preventDefault();
        handleSelectWorkspace('workbench');
      } else if (e.key === '3') {
        e.preventDefault();
        handleSelectWorkspace('approval');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectWorkspace]);

  const handleNavigateShowcase = useCallback(
    (tab: ShowcaseTab, targetId?: string) => {
      if (typeof window !== 'undefined') {
        const p = readUrlParams();
        const routeDesc =
          activeTab === 'layer-preview'
            ? `Unified Approval Stage (${p.fw || p.route || 'main-menu'}${
                p.fwTab ? ` · ${p.fwTab}` : p.subtab ? ` · ${p.subtab}` : ''
              })`
            : activeTab;
        setLastJumpOrigin({
          fromTab: activeTab,
          fromHref: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          fromDesc: routeDesc,
          toTab: tab,
          targetId,
        });
      }
      const targetWs = getWorkspaceForTab(tab);
      setLastTabByWorkspace((prev) => ({ ...prev, [targetWs]: tab }));
      updateUrlParams(
        {
          tab,
          ...(tab === 'recipes' && targetId ? { recipe: targetId } : {}),
          ...(tab === 'floating-windows' && targetId ? { fw: targetId } : {}),
        },
        { push: true, hash: targetId ?? null }
      );
      syncWorkspaceUrlParam(targetWs);
      setActiveTab(tab);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      scrollToAnchorWithRetry(targetId);
    },
    [activeTab, scrollToAnchorWithRetry]
  );

  const handleReturnToJumpOrigin = useCallback(() => {
    if (!lastJumpOrigin) return;
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState(window.history.state, '', lastJumpOrigin.fromHref);
      } catch {
        // ignore
      }
    }
    setActiveTab(lastJumpOrigin.fromTab);
    setLastJumpOrigin(null);
  }, [lastJumpOrigin]);

  const handleNavigateToSandboxPlay = useCallback(() => {
    updateUrlParams(
      { tab: 'layer-preview', tier: 'user', route: 'play' },
      { push: true, hash: 'rc-ui-tuner-preview-stage' }
    );
    syncWorkspaceUrlParam('approval');
    setActiveTab('layer-preview');
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
      document.documentElement.classList.toggle('light', isLight);
      document.documentElement.classList.toggle('dark', !isLight);
      document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
    }
  }, [isLight]);

  return {
    activeTab,
    isLight,
    setIsLight,
    lastJumpOrigin,
    setLastJumpOrigin,
    activeWorkspace,
    activeNavMeta,
    activeSectionMeta,
    ledgerSummary,
    handleSelectTab,
    handleSelectWorkspace,
    handleNavigateShowcase,
    handleReturnToJumpOrigin,
    handleNavigateToSandboxPlay,
  };
}
