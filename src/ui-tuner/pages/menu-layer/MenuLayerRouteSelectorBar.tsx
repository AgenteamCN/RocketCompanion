import React from 'react';
import {
  Gamepad2, Wrench, Settings, Play,
  Server, ChevronLeft, ChevronRight, User,
  Terminal, Smartphone, Sliders,
} from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { DEFAULT_PANEL_SIZING, type MenuPanelId } from '../../../ui-core/tokens/menuLayoutTokens';
import { Layer1ContextGroupedSelector } from '../recipes/Layer1ContextGroupedSelector';
import { resolveLayer1ContextSpec } from '../../../ui-core/recipes/layer1MenuContextSpecs';
import type { ActiveMenuRoute } from './menuLayerRouteConfig';
import {
  USER_LINEAR_PLAYLIST, DEV_LINEAR_PLAYLIST,
} from './menuLayerLinearPlaylists';
import {
  MenuLayerL1ContextualSubBar,
  MenuLayerL2ContextualSubBars,
} from './MenuLayerContextualSubBars';
import { MenuLayerDeepRouteRenderer } from './MenuLayerDeepRouteRenderer';
import { MenuLayerFooterControls } from './MenuLayerFooterControls';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

export interface MenuLayerRouteSelectorBarProps {
  isLight: boolean;
}

export const MenuLayerRouteSelectorBar = React.memo<MenuLayerRouteSelectorBarProps>(({
  isLight,
}) => {
  const {
    visibilityTier,
    handleChangeVisibilityTier: onChangeVisibilityTier,
    layer1ContextMode,
    setLayer1ContextMode: onChangeLayer1ContextMode,
    touchMode,
    setTouchMode: onToggleTouchMode,
    currentRoute,
    handleSelectRoute,
    settingsTab,
    setSettingsTab,
    garageTab,
    setGarageTab,
    activeRouteSize,
    feedbackToast,
    onNavigateShowcase,
    showInlineTuner,
    setShowInlineTuner,
    anchorIndex,
    anchorPlaylistStep,
    activePlaylist,
    activePlaylistStep,
    stepPlaylistBy,
  } = useMenuLayerSandbox();
  const activeRouteSizeModeLabel = activeRouteSize.modeLabel;
  const onToggleInlineTuner = () => setShowInlineTuner((prev) => !prev);
  const { panels } = useMenuLayoutStore();
  const getPanelWidth = (panelId: MenuPanelId) =>
    (panels?.[panelId] ?? DEFAULT_PANEL_SIZING[panelId])?.width ?? 480;

  const normalizedLayer1Ctx = resolveLayer1ContextSpec(layer1ContextMode).id;
  const currentPlaylistIndex = anchorIndex;
  const currentStep = anchorPlaylistStep || activePlaylistStep || activePlaylist[0];

  const getRouteBtnCls = (route: ActiveMenuRoute) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
      currentRoute === route
        ? 'bg-amber-500 text-white border-amber-500 font-semibold shadow-2xs'
        : isLight
        ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800'
        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
    }`;

  const stepNavBtnCls = `flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all active:scale-95 ${
    isLight
      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
  }`;

  const inactiveTierCls = isLight
    ? 'text-neutral-600 hover:text-neutral-900'
    : 'text-neutral-400 hover:text-neutral-200';

  return (
    <div
      className={`p-4 rounded-2xl border flex flex-col gap-3.5 transition-colors ${
        isLight
          ? 'bg-white border-neutral-200 shadow-2xs'
          : 'bg-neutral-900/70 border-neutral-800'
      }`}
    >
      {/* Top Bar: Strict User Only vs Developer Only Split + < Prev Page | Next Page > Linear Scanner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        {/* Strict Tier Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            View isolation (Strict Tier):
          </span>
          <div className="flex items-center gap-1 p-1 rounded-xl border bg-neutral-100/80 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => onChangeVisibilityTier('user')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                visibilityTier === 'user' ? 'bg-emerald-500 text-white shadow-2xs' : inactiveTierCls
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>User Only ({USER_LINEAR_PLAYLIST.length} Pages)</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeVisibilityTier('developer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                visibilityTier === 'developer' ? 'bg-amber-500 text-white shadow-2xs' : inactiveTierCls
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Developer Only ({DEV_LINEAR_PLAYLIST.length} Pages)</span>
            </button>
          </div>

          {visibilityTier === 'developer' && (
            <button
              type="button"
              onClick={() => onToggleTouchMode(!touchMode)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-semibold cursor-pointer transition-colors ${
                touchMode
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                  : isLight
                  ? 'bg-neutral-50 border-neutral-200 text-neutral-600'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Simulate ?touch=1 Touch Controls Agent Switcher in Layer 1 Main Menu"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>?touch={touchMode ? '1' : '0'}</span>
            </button>
          )}
        </div>

        {/* Linear Playlist Scanner (< Prev Page | [N/M] | Next Page >) */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => stepPlaylistBy(-1)}
            className={stepNavBtnCls}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Prev Page</span>
          </button>

          <div
            className={`px-3 py-1.5 rounded-xl border font-mono text-xs flex items-center gap-2 ${
              isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
                : 'bg-neutral-950 border-neutral-800 text-neutral-200'
            }`}
          >
            <span className="font-bold text-amber-500">
              [{currentPlaylistIndex + 1} / {activePlaylist.length}]
            </span>
            <span className="truncate max-w-[230px] font-semibold">{currentStep?.label}</span>
          </div>

          <button
            type="button"
            onClick={() => stepPlaylistBy(1)}
            className={stepNavBtnCls}
          >
            <span>Next Page</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Layer 0: Active Match (Shown in User Mode) */}
      {visibilityTier === 'user' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs">
          <div className="flex items-center gap-1.5 min-w-[130px] shrink-0 font-semibold text-neutral-500 dark:text-neutral-400">
            <Badge variant="neutral" size="sm" isLight={isLight}>
              Layer 0
            </Badge>
            <span>Level Zero Match (No Menu)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectRoute('layer-0')}
              className={getRouteBtnCls('layer-0')}
            >
              <Play className="h-3.5 w-3.5" />
              <span>Active Match (Level Zero Real-Time Match · No Menu State)</span>
              <span className="font-mono text-[10px] opacity-75">0px</span>
            </button>
          </div>
        </div>
      )}

      {/* Layer 1: Main Menu + Dynamic Context Variations */}
      <div className="flex flex-col gap-2 text-xs pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 min-w-[130px] shrink-0 font-semibold text-neutral-500 dark:text-neutral-400">
            <Badge variant="primary" size="sm" isLight={isLight}>
              Layer 1
            </Badge>
            <span>Primary root menu variant</span>
          </div>

          <Layer1ContextGroupedSelector
            activeContext={normalizedLayer1Ctx}
            onSelectContext={(ctx) => {
              onChangeLayer1ContextMode(ctx);
              handleSelectRoute('main-menu');
            }}
            tierFilter={visibilityTier}
            isRouteActive={currentRoute === 'main-menu'}
            isLight={isLight}
          />
        </div>

        <MenuLayerL1ContextualSubBar isLight={isLight} />
      </div>

      {/* Layer 2: Secondary Menus (Strictly separated by User vs Developer) */}
      <div className="flex flex-col gap-2 text-xs pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 min-w-[130px] shrink-0 font-semibold text-neutral-500 dark:text-neutral-400">
            <Badge variant="warning" size="sm" isLight={isLight}>
              Layer 2
            </Badge>
            <span>Secondary function menu</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {visibilityTier === 'user' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectRoute('play')}
                  className={getRouteBtnCls('play')}
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  <span>Play (6 Game Mode Grid)</span>
                  <span className="font-mono text-[10px] opacity-75">
                    {getPanelWidth('layer2-play')}px
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRoute('garage')}
                  className={getRouteBtnCls('garage')}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Garage (5 Tabs incl. Materials)</span>
                  <span className="font-mono text-[10px] opacity-75">
                    {getPanelWidth('layer2-garage')}px
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (settingsTab === 'developer') setSettingsTab('gameplay');
                    handleSelectRoute('settings');
                  }}
                  className={getRouteBtnCls('settings')}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Settings (User 4 Tabs · icon+text)</span>
                  <span className="font-mono text-[10px] opacity-75">
                    {getPanelWidth('layer2-settings')}px
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRoute('manage-room')}
                  className={getRouteBtnCls('manage-room')}
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>Room Host Control (Host Console)</span>
                  <span className="font-mono text-[10px] opacity-75">
                    {getPanelWidth('layer2-manage-room')}px
                  </span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('developer');
                  handleSelectRoute('settings');
                }}
                className={getRouteBtnCls('settings')}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Settings → Developer Tab (5 Developer Hub Portals)</span>
                <span className="font-mono text-[10px] opacity-75">
                  {getPanelWidth('layer2-settings')}px
                </span>
              </button>
            )}
          </div>
        </div>

        <MenuLayerL2ContextualSubBars isLight={isLight} />
      </div>

      <MenuLayerDeepRouteRenderer isLight={isLight} />

      <MenuLayerFooterControls
        isLight={isLight}
        currentRoute={currentRoute}
        settingsTab={settingsTab}
        garageTab={garageTab}
        currentStepBreadcrumb={currentStep?.breadcrumb}
        activeRouteSizeModeLabel={activeRouteSizeModeLabel}
        feedbackToast={feedbackToast}
        showInlineTuner={showInlineTuner}
        onToggleInlineTuner={onToggleInlineTuner}
        onNavigateShowcase={onNavigateShowcase}
      />
    </div>
  );
});

MenuLayerRouteSelectorBar.displayName = 'MenuLayerRouteSelectorBar';
