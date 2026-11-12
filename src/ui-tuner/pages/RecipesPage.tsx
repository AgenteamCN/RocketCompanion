import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Zap,
  Layers,
} from 'lucide-react';
import { Badge } from '../../ui-core/primitives/Badge';
import { useMenuLayoutStore } from '../../ui-core/stores/menuLayoutStore';
import { readUrlParams, updateUrlParams } from '../stores/urlSync';
import {
  publishCrossTabActiveTarget,
  useCrossTabTargetFollow,
} from '../stores/crossTabTargetFollow';
import { useQuickNotificationStore } from '../../ui-core/stores/quickNotificationStore';
import { dispatchOnlineRoomErrorNotification } from '../../ui-core/recipes/online/OnlineRoomCreationProgress';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { RECIPES_JUMP_ITEMS, RECIPES_CATEGORIES } from './recipes/LocalPanelSizingTuner';
import { OnDemandRecipeStage, resolveActiveRecipeFromUrl } from './recipes/recipeRegistry';
import { RecipesActiveWorkbenchBar } from './recipes/RecipesActiveWorkbenchBar';
import { RapidReviewTriageBar } from '../components/review/RapidReviewTriageBar';
import { useReviewLedgerStore } from '../components/review/reviewLedgerStore';
import { AutoConfigTunerPanel } from '../components/tuner/AutoConfigTunerPanel';
import {
  UnmatchedRecipeFallbackStage,
  UnmatchedSurfaceRadarPanel,
} from '../components/radar/UnmatchedSurfaceRadarPanel';

export const RecipesPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    simulateLayer3Error,
    setToken,
  } = useMenuLayoutStore();

  // Default to 'single' (on-demand single-module mounting: "Generate on click") to eliminate DOM bloat and scroll lag
  const [renderMode, setRenderMode] = useState<'single' | 'all'>('single');

  const [activeRecipeId, setActiveRecipeId] = useState<string>(() => {
    return resolveActiveRecipeFromUrl().itemId;
  });

  const scrollSubAnchorIntoView = useCallback((anchorId?: string) => {
    if (!anchorId || typeof document === 'undefined') return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(tryScroll, 60);
      }
    };
    window.setTimeout(tryScroll, 40);
  }, []);

  // Sync active recipe when URL hash or history changes (e.g. jumping from 7A or Browser Back/Forward)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromLocation = () => {
      const resolved = resolveActiveRecipeFromUrl(readUrlParams(), window.location.hash);
      setActiveRecipeId(resolved.itemId);
      if (resolved.subAnchorId) {
        scrollSubAnchorIntoView(resolved.subAnchorId);
      }
    };
    // Initial check for sub-anchors on mount (e.g., #setting-preset-custom-tuner)
    const initial = resolveActiveRecipeFromUrl(readUrlParams(), window.location.hash);
    if (initial.subAnchorId) {
      scrollSubAnchorIntoView(initial.subAnchorId);
    }

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, [scrollSubAnchorIntoView]);

  const handleSelectRecipeId = useCallback(
    (nextId: string, scrollStage: boolean = false) => {
      setActiveRecipeId(nextId);
      updateUrlParams(
        { tab: 'recipes', recipe: nextId },
        { push: true, hash: nextId }
      );
      if (nextId === 'setting-telemetry-summary-tuner') {
        scrollSubAnchorIntoView('setting-telemetry-summary-tuner');
      } else if (scrollStage && typeof document !== 'undefined') {
        window.setTimeout(() => {
          const stageEl = document.getElementById('recipes-active-workbench-bar');
          if (stageEl) {
            stageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 30);
      }
    },
    [scrollSubAnchorIntoView]
  );

  const handleDirectorySelect = useCallback(
    (item: JumpDirectoryItem) => {
      const targetId = item.targetId || item.id || 'recipe-6a-1-main';
      handleSelectRecipeId(targetId, renderMode === 'single');
      if (renderMode === 'all' && typeof document !== 'undefined') {
        window.setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      }
    },
    [handleSelectRecipeId, renderMode]
  );

  const handleToggleLayer3Error = useCallback(
    (enabled: boolean) => {
      setToken('simulateLayer3Error', enabled);
      if (enabled) {
        dispatchOnlineRoomErrorNotification();
        const st = useQuickNotificationStore.getState();
        if (st.activeNotification) {
          st.collapseActive();
        }
        st.setStackOpen(false);
      }
    },
    [setToken]
  );

  const activeIndex = useMemo(() => {
    const idx = RECIPES_JUMP_ITEMS.findIndex(
      (it) => (it.id || it.targetId) === activeRecipeId
    );
    return idx >= 0 ? idx : 0;
  }, [activeRecipeId]);

  const activeItem = RECIPES_JUMP_ITEMS[activeIndex] ?? RECIPES_JUMP_ITEMS[0];
  const prevItem =
    RECIPES_JUMP_ITEMS[
      (activeIndex - 1 + RECIPES_JUMP_ITEMS.length) % RECIPES_JUMP_ITEMS.length
    ];
  const nextItem =
    RECIPES_JUMP_ITEMS[(activeIndex + 1) % RECIPES_JUMP_ITEMS.length];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (renderMode !== 'single') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSelectRecipeId(prevItem.id || prevItem.targetId || 'recipe-6a-1-main');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSelectRecipeId(nextItem.id || nextItem.targetId || 'recipe-6a-1-main');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renderMode, prevItem, nextItem, handleSelectRecipeId]);

  const { activeTarget, isFollowingStage } = useCrossTabTargetFollow();
  const lastFollowedTargetStampRef = React.useRef<number>(activeTarget.updatedAt);
  const suppressBroadcastForRecipeRef = React.useRef<string | null>(null);

  // Follow stage target updates when Following Stage is enabled
  useEffect(() => {
    if (!isFollowingStage) {
      lastFollowedTargetStampRef.current = activeTarget.updatedAt;
      return;
    }
    if (activeTarget.updatedAt <= lastFollowedTargetStampRef.current) return;
    lastFollowedTargetStampRef.current = activeTarget.updatedAt;

    if (
      activeTarget.kind === 'menu-route' &&
      activeTarget.recipeId &&
      activeTarget.recipeId !== activeRecipeId
    ) {
      suppressBroadcastForRecipeRef.current = activeTarget.recipeId;
      setActiveRecipeId(activeTarget.recipeId);
      updateUrlParams(
        { tab: 'recipes', recipe: activeTarget.recipeId },
        { hash: activeTarget.recipeId }
      );
    }
  }, [
    isFollowingStage,
    activeTarget.kind,
    activeTarget.recipeId,
    activeTarget.updatedAt,
    activeRecipeId,
  ]);

  useEffect(() => {
    if (
      suppressBroadcastForRecipeRef.current &&
      suppressBroadcastForRecipeRef.current !== activeRecipeId
    ) {
      return;
    }
    suppressBroadcastForRecipeRef.current = null;
    const surfaceName = (
      activeItem.name ||
      activeItem.componentName ||
      activeRecipeId
    ).replace(/\s*\(.*\)$/, '');
    publishCrossTabActiveTarget({
      kind: 'menu-route',
      targetId: activeTarget.route || activeRecipeId,
      surfaceId: `recipe:${surfaceName}`,
      label: activeItem.label || surfaceName,
      route: activeTarget.route,
      subtab: activeTarget.subtab,
      recipeId: activeRecipeId,
      tier: activeTarget.tier,
      updatedAt: Date.now(),
    });
  }, [activeRecipeId, activeItem.label, activeItem.name, activeItem.componentName]);

  const navigationSeq = useReviewLedgerStore((s) => s.navigationSeq);
  const activeUnitKey = useReviewLedgerStore((s) => s.activeUnitKey);
  useEffect(() => {
    if (navigationSeq === 0 || !activeUnitKey.startsWith('recipe:')) return;
    const [surfaceId] = activeUnitKey.split('::');
    const recipeStem = surfaceId.replace(/^recipe:/, '');
    const match = RECIPES_JUMP_ITEMS.find(
      (it) =>
        it.name === recipeStem ||
        it.componentName === recipeStem ||
        it.id === `recipe-auto-${recipeStem}`
    );
    if (match) {
      const nextId = match.id || match.targetId || match.code;
      if (nextId !== activeRecipeId) {
        handleSelectRecipeId(nextId, false);
      }
    }
  }, [navigationSeq]);

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      {/* Static Top Header (Nothing above the View Box ever changes) */}
      <div className="flex flex-col gap-2 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">
            Surface Workbench · Menu Surface Calibration &amp; Parameter Tuner
          </h1>
          <Badge variant="primary" size="sm" isLight={isLight}>
            {isFollowingStage ? `Following Stage: ${activeTarget.label}` : 'Unlinked Local Focus'}
          </Badge>
          <Badge variant="amber" size="sm" isLight={isLight}>
            On-demand single-surface mounting
          </Badge>
        </div>
        <p
          className={`text-xs leading-relaxed ${
            isLight ? 'text-neutral-600' : 'text-neutral-400'
          }`}
        >
          Static top-pinned View Box stage — all module scanners, sibling switchers, size tuners, and config export tools operate below the View Box so nothing above it ever changes.
        </p>
      </div>

      {/* 1. TOP-PINNED VIEW BOX STAGE: Single On-Demand Module (Directly below static page header) */}
      {renderMode === 'single' &&
        (activeRecipeId.startsWith('recipe-auto-') ? (
          <UnmatchedRecipeFallbackStage
            activeRecipeId={activeRecipeId}
            isLight={isLight}
          />
        ) : (
          <OnDemandRecipeStage
            itemId={activeRecipeId}
            isLight={isLight}
            simulateLayer3Error={simulateLayer3Error}
            onToggleLayer3Error={handleToggleLayer3Error}
            onSelectRecipeId={handleSelectRecipeId}
          />
        ))}

      {/* 2. ACTIVE MODULE QUICK SWITCHER, RELATED SIBLING TUNERS & GLOBAL EXPORT BAR (Placed BELOW the View Box) */}
      {renderMode === 'single' && (
        <RecipesActiveWorkbenchBar
          activeRecipeId={activeRecipeId}
          activeIndex={activeIndex}
          isLight={isLight}
          onSelectRecipeId={handleSelectRecipeId}
        />
      )}

      {/* 3. RC UNMATCHED / UNCALIBRATED SURFACE RADAR DETECTOR */}
      <UnmatchedSurfaceRadarPanel
        isLight={isLight}
        defaultExpanded={false}
        onSelectRecipeId={handleSelectRecipeId}
      />

      {/* Categorized & Searchable On-Demand Selector Directory */}
      <PageJumpDirectory
        title="6A · Menu recipe generator and categorized search directory (Click-to-Mount Recipe Selector)"
        subtitle="Click any card to mount its specific menu and tuner independently (Isolated change tracking, Zero redundancy DOM Consumption) "
        items={RECIPES_JUMP_ITEMS}
        activeId={activeRecipeId}
        preventDefaultJump={renderMode === 'single'}
        categories={RECIPES_CATEGORIES}
        searchable={true}
        collapsible={true}
        onSelect={handleDirectorySelect}
        isLight={isLight}
        headerExtra={
          <div className="inline-flex items-center rounded-lg border p-0.5 text-[11px] font-mono bg-white/80 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setRenderMode('single')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                renderMode === 'single'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
              title="Generate on click: Mount only the currently selected 1 Menu modules, Smooth mouse scrolling"
            >
              <Zap className="h-3 w-3" />
              <span>On-demand single module ({1}/{RECIPES_JUMP_ITEMS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRenderMode('all')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                renderMode === 'all'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
              title="Expand all 31 Modules in a single long list (High resource usage) "
            >
              <Layers className="h-3 w-3" />
              <span>Fully expanded ({RECIPES_JUMP_ITEMS.length})</span>
            </button>
          </div>
        }
      />

      {renderMode === 'all' && (
        <div className="flex flex-col gap-12">
          {RECIPES_JUMP_ITEMS.map((item) => {
            const id = item.id || item.targetId || item.code;
            return (
              <OnDemandRecipeStage
                key={id}
                itemId={id}
                isLight={isLight}
                simulateLayer3Error={simulateLayer3Error}
                onToggleLayer3Error={handleToggleLayer3Error}
                onSelectRecipeId={handleSelectRecipeId}
              />
            );
          })}
        </div>
      )}

      <AutoConfigTunerPanel
        surfaceId={`recipe:${(activeItem.name || activeItem.componentName || activeRecipeId).replace(/\s*\(.*\)$/, '')}`}
        surfaceLabel={`[${activeItem.code}] ${activeItem.label}`}
        isLight={isLight}
      />

      <RapidReviewTriageBar isLight={isLight} />
    </div>
  );
};
