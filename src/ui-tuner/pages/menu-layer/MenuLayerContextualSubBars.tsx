import React from 'react';
import { ArrowUpRight, Sliders } from 'lucide-react';
import { UnderlineTabs } from '../../../ui-core/primitives/UnderlineTabs';
import { usePlayCardStyleStore, type PlayCardStyleVariant } from '../../../ui-core/stores/playCardStyleStore';
import { useMainMenuStyleStore, MAIN_MENU_STYLE_PRESETS } from '../../../ui-core/stores/mainMenuStyleStore';
import { ONLINE_SESSION_CONTEXT_SPECS, resolveOnlineSessionContextId } from '../../../ui-core/recipes/Layer2ManageRoomRecipe';
import {
  USER_SETTINGS_QUICK_TABS,
  DEV_SETTINGS_QUICK_TABS,
  GARAGE_QUICK_TABS,
} from './menuLayerRouteConfig';
import { ONLINE_ROOM_MEMBER_SLOT_OPTIONS } from './menuLayerOnlineRoomSteps';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

export interface MenuLayerContextualSubBarProps {
  isLight: boolean;
}

export const MenuLayerL1ContextualSubBar: React.FC<MenuLayerContextualSubBarProps> = ({ isLight }) => {
  const {
    currentRoute,
    showToast,
    showInlineTuner,
    setShowInlineTuner,
    onNavigateShowcase,
  } = useMenuLayerSandbox();
  const mainMenuStyle = useMainMenuStyleStore();

  if (currentRoute !== 'main-menu') return null;

  return (
    <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60 mt-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
        <span>
          L1 MENU Minimalist large-font menu switching (current: {mainMenuStyle.titleFontSizePx}px{' '}
          {mainMenuStyle.titleFontFamily === 'mono' ? 'JetBrains Mono' : 'Apple Sans'} ·{' '}
          {mainMenuStyle.showDescription ? 'includes Description' : 'none Description'} ·{' '}
          {mainMenuStyle.conciseResumeLabel ? 'Resume Short Title' : 'Resume Match'}):
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setShowInlineTuner((prev) => !prev)}
            className="inline-flex items-center gap-1 text-emerald-500 hover:text-emerald-400 font-bold cursor-pointer"
          >
            <Sliders className="h-3 w-3" />
            <span>{showInlineTuner ? 'Collapse in-place full-parameter tuner ^' : 'Expand in-place full-parameter tuner v'}</span>
          </button>
          {onNavigateShowcase && (
            <button
              type="button"
              onClick={() => onNavigateShowcase('recipes', 'main-menu-style-tuner')}
              className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-bold cursor-pointer"
            >
              <span>open 6A.1M MENU Full-parameter workbench and three-scheme side-by-side comparison</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {MAIN_MENU_STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              mainMenuStyle.applyPreset(preset.params);
              showToast(`Toggled L1 MENU Style To: ${preset.label}`);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
              isLight
                ? 'bg-neutral-50 hover:bg-amber-50/70 border-neutral-200 hover:border-amber-400 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 hover:border-amber-500/60 text-neutral-200'
            }`}
            title={preset.subtitle}
          >
            {preset.label.split(' · ')[0]} · {preset.label.split(' · ')[1] || ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export const MenuLayerL2ContextualSubBars: React.FC<MenuLayerContextualSubBarProps> = ({ isLight }) => {
  const {
    visibilityTier,
    currentRoute,
    layer1ContextMode,
    setLayer1ContextMode,
    settingsTab,
    setSettingsTab,
    garageTab,
    setGarageTab,
    layer3StepOverride,
    setLayer3StepOverride,
    showToast,
    onNavigateToPlayCards,
  } = useMenuLayerSandbox();
  const { variant: playCardVariant, setVariant: setPlayCardVariant } = usePlayCardStyleStore();
  const activeMemberSlots = layer3StepOverride?.memberSlots ?? 3;

  return (
    <>
      {currentRoute === 'play' && visibilityTier === 'user' && (
        <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60 mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            <span>L2 Play Menu card style switching (PlayModeCard 3 Archetypes):</span>
            {onNavigateToPlayCards && (
              <button
                type="button"
                onClick={onNavigateToPlayCards}
                className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-bold cursor-pointer"
              >
                <span>open L2 · 2B PlayCard Three-style parameter tuning page</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'icon-badge-top', label: 'style 1: [Icon + Badge] / Title / Desc' },
                { id: 'icon-title-inline', label: 'style 2: [Icon + Title] (none Badge) / Desc' },
                { id: 'mono-giant-watermark', label: 'Style 3 (default): JetBrains Mono Large Text + 30% extra large background Icon' },
              ] as { id: PlayCardStyleVariant; label: string }[]
            ).map((item) => {
              const active = playCardVariant === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPlayCardVariant(item.id);
                    showToast(`Toggled L2 Play Card To: ${item.label}`);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                    active
                      ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                      : isLight
                      ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentRoute === 'garage' && visibilityTier === 'user' && (
        <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60 mt-1">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            <span>Garage 5-Tab Cascading Toggle (Car / Colour / Materials / Anthem / Sync):</span>
            <span className="text-amber-500 font-semibold">current: {garageTab.toUpperCase()}</span>
          </div>
          <UnderlineTabs
            items={GARAGE_QUICK_TABS}
            activeId={garageTab}
            onChange={(tabId) => {
              setGarageTab(tabId);
              showToast(`Switched to Garage -> ${tabId}`);
            }}
            isLight={isLight}
            size="sm"
            fullWidth={false}
          />
        </div>
      )}

      {currentRoute === 'settings' && (
        <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60 mt-1">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            <span>
              {visibilityTier === 'user'
                ? 'Settings User Tab Synchronization (Gameplay / Audio / Display / Advanced):'
                : 'Settings Developer Exclusive Tab (Show Only Developer Hub):'}
            </span>
            <span className="text-amber-500 font-semibold">current: {settingsTab.toUpperCase()}</span>
          </div>
          <UnderlineTabs
            items={visibilityTier === 'user' ? USER_SETTINGS_QUICK_TABS : DEV_SETTINGS_QUICK_TABS}
            activeId={settingsTab}
            onChange={(tabId) => {
              setSettingsTab(tabId);
              showToast(`Switched to Settings -> ${tabId}`);
            }}
            isLight={isLight}
            size="sm"
            fullWidth={false}
          />
        </div>
      )}

      {currentRoute === 'manage-room' && (
        <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60 mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            <span>Online Room Control · 6 Contexts &amp; Member Slot Density (1 vs 3 Slots):</span>
            <span className="text-amber-500 font-semibold">
              context={resolveOnlineSessionContextId(layer1ContextMode).toUpperCase()} · slots={activeMemberSlots}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {ONLINE_SESSION_CONTEXT_SPECS.map((spec) => {
                const active = resolveOnlineSessionContextId(layer1ContextMode) === spec.id;
                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => {
                      setLayer1ContextMode(spec.id);
                      showToast(`Room control panel switched to: ${spec.shortLabel} (${spec.role.toUpperCase()})`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                      active
                        ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                        : isLight
                        ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                    }`}
                  >
                    {spec.shortLabel}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              {ONLINE_ROOM_MEMBER_SLOT_OPTIONS.map((slotOpt) => {
                const active = activeMemberSlots === slotOpt.slots;
                return (
                  <button
                    key={slotOpt.suffix}
                    type="button"
                    onClick={() => {
                      setLayer3StepOverride({
                        ...layer3StepOverride,
                        memberSlots: slotOpt.slots,
                      });
                      showToast(`Room member slots switched to: ${slotOpt.shortLabel}`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                      active
                        ? 'bg-emerald-500 text-white border-emerald-500 font-bold shadow-2xs'
                        : isLight
                        ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                    }`}
                  >
                    {slotOpt.badgeLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
