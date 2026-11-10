import React, { useRef } from 'react';
import { ArrowUpRight, Bot, Gamepad2, HouseCog, Info, LogOut, UserRoundCog } from 'lucide-react';
import { UI_SPACING } from '../tokens/spacing';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import type { MainMenuStyleParams } from '../stores/mainMenuStyleStore';
import type { PanelSizingConfig } from '../tokens/menuLayoutTokens';
import type {
  CanonicalLayer1ContextVariation,
  Layer1ContextMeta,
  Layer1ContextVariation,
  Layer1CustomRowIconType,
} from '../recipes/layer1MenuContextSpecs';

export type TouchInputAgentOption = 'none' | 'necto' | 'nexto';

export interface Layer1MainMenuBottomActionSpec {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
}

export interface Layer1ScopedAppOverrides {
  contextVariation?: Layer1ContextVariation;
  contextMode?: Layer1ContextVariation;
  backgroundRenderPaused?: boolean;
  menuPowerSave?: 'extreme' | '15' | '30' | 'disable' | 'freeze' | 'match';
  extraBottomAction?: Layer1MainMenuBottomActionSpec | React.ReactNode;
  sizing?: PanelSizingConfig;
  onResume?: () => void;
  onRestartMatch?: () => void;
  onReturnToFreeplay?: () => void;
  onNavigatePlay?: () => void;
  onNavigateGarage?: () => void;
  onNavigateSettings?: (targetTab?: string) => void;
  onNavigateManageRoom?: () => void;
  onNavigateExpMultiBotsConfig?: () => void;
  onLeaveRoom?: () => void;
  onExitEditMode?: () => void;
}

export function createLayer1ActionHandlers(params: {
  appOverrides?: Layer1ScopedAppOverrides;
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
  closeMenu: () => void;
  navigate: (route: any) => void;
  bridge?: {
    onReturnToFreeplay?: () => void;
    onRestartMatch?: () => void;
    onLeaveOnlineServer?: () => void | Promise<void>;
  };
  ctxSpec: Layer1ContextMeta;
  derivedVariation: CanonicalLayer1ContextVariation;
  hasFreeplaySubSceneOverride: boolean;
}) {
  const {
    appOverrides,
    onBack,
    onTabChange,
    closeMenu,
    navigate,
    bridge,
    ctxSpec,
    derivedVariation,
    hasFreeplaySubSceneOverride,
  } = params;

  const handleResume = () => {
    if (appOverrides?.onResume) return appOverrides.onResume();
    if (onBack) return onBack();
    closeMenu();
  };

  const handleReturnToFreeplay = () => {
    if (appOverrides?.onReturnToFreeplay) return appOverrides.onReturnToFreeplay();
    if (onTabChange) return onTabChange('return-freeplay');
    useAppStore.getState().setMatchMode('freeplay');
    closeMenu();
    bridge?.onReturnToFreeplay?.();
  };

  const handleNavigatePlay = () => {
    if (appOverrides?.onNavigatePlay) return appOverrides.onNavigatePlay();
    if (onTabChange) return onTabChange('play');
    navigate('play');
  };

  const handleNavigateGarage = () => {
    if (appOverrides?.onNavigateGarage) return appOverrides.onNavigateGarage();
    if (onTabChange) return onTabChange('garage');
    navigate('garage');
  };

  const handleNavigateSettings = (targetTab?: string) => {
    if (appOverrides?.onNavigateSettings) return appOverrides.onNavigateSettings(targetTab);
    if (targetTab === 'display') useAppStore.getState().setHighlightSetting('menu-power-save');
    if (onTabChange) return onTabChange(targetTab ? `settings:${targetTab}` : 'settings');
    navigate('settings');
  };

  const handleCustomRowClick = () => {
    const actionType = ctxSpec.customActionRow?.actionType;
    if (actionType === 'manage-room') {
      if (appOverrides?.onNavigateManageRoom) return appOverrides.onNavigateManageRoom();
      if (onTabChange) return onTabChange('manage-room');
      navigate('manage-room');
    } else if (actionType === 'exp-multi-bots') {
      if (appOverrides?.onNavigateExpMultiBotsConfig) return appOverrides.onNavigateExpMultiBotsConfig();
      if (onTabChange) return onTabChange('exp-multi-bots');
      navigate('exp-multi-bots');
    } else {
      handleNavigatePlay();
    }
  };

  const handleRestartMatch = () => {
    if (appOverrides?.onRestartMatch) return appOverrides.onRestartMatch();
    if (onTabChange) return onTabChange('restart-match');
    bridge?.onRestartMatch?.();
  };

  const handleBottomRowClick = () => {
    const actionType = ctxSpec.bottomActionRow?.actionType;
    if (actionType === 'leave-room') {
      if (appOverrides?.onLeaveRoom) return appOverrides.onLeaveRoom();
      if (onTabChange) return onTabChange('leave-room');
      void bridge?.onLeaveOnlineServer?.();
      handleReturnToFreeplay();
    } else if (actionType === 'exit-edit-mode') {
      if (appOverrides?.onExitEditMode) return appOverrides.onExitEditMode();
      if (onTabChange) return onTabChange('exit-edit-mode');
      handleReturnToFreeplay();
    } else {
      handleReturnToFreeplay();
    }
  };

  const resolvedBottomAction: Layer1MainMenuBottomActionSpec | React.ReactNode | undefined =
    appOverrides?.extraBottomAction ??
    (ctxSpec.bottomActionRow
      ? {
          title: ctxSpec.bottomActionRow.title,
          subtitle: ctxSpec.bottomActionRow.subtitle,
          icon: <LogOut className={`h-5 w-5 ${ctxSpec.bottomActionRow.iconColorClass}`} />,
          variant: ctxSpec.bottomActionRow.variant,
          onClick: handleBottomRowClick,
        }
      : derivedVariation === 'freeplay' && hasFreeplaySubSceneOverride
      ? {
          title: 'Exit to Free Play',
          subtitle: 'Leave active arena preview and return to Free Play',
          variant: 'secondary',
          onClick: handleReturnToFreeplay,
        }
      : undefined);

  return {
    handleResume,
    handleNavigateGarage,
    handleNavigateSettings,
    handleCustomRowClick,
    handleRestartMatch,
    resolvedBottomAction,
  };
}

export const renderLayer1CustomRowIcon = (
  iconType: Layer1CustomRowIconType,
  colorClass?: string
): React.ReactNode => {
  const cls = `h-5 w-5 ${colorClass || ''}`.trim();
  switch (iconType) {
    case 'house-cog':
      return <HouseCog className={cls} />;
    case 'user-round-cog':
      return <UserRoundCog className={cls} />;
    case 'info':
      return <Info className={cls} />;
    case 'bot':
      return <Bot className={cls} />;
    case 'gamepad-2':
    default:
      return <Gamepad2 className={cls} />;
  }
};

export function deriveLayer1ContextVariation(params: {
  matchMode?: string;
  isHosting: boolean;
  isOnlineMatchRoom: boolean;
  hasActiveOnlineRoom: boolean;
  isExhibitionMode: boolean;
  replayViewerHasLoaded: boolean;
  staticTrainingSessionMode?: string;
  hasExtraBottomAction: boolean;
}): CanonicalLayer1ContextVariation {
  const {
    matchMode,
    isHosting,
    isOnlineMatchRoom,
    hasActiveOnlineRoom,
    isExhibitionMode,
    replayViewerHasLoaded,
    staticTrainingSessionMode,
    hasExtraBottomAction,
  } = params;
  if (matchMode === 'match') {
    return hasActiveOnlineRoom ? (isHosting ? 'online-match-host' : 'online-match-client') : 'exhibition';
  }
  if (matchMode === 'dev-test-lab') return 'dev-test-lab';
  if (matchMode === 'exp-multi-bots') return isExhibitionMode ? 'exhibition' : 'exp-multi-bots';
  if (matchMode === 'kickoff-training') return 'kickoff-training';
  if (matchMode === 'replay-viewer' || (matchMode === 'freeplay' && replayViewerHasLoaded)) {
    return 'replay-viewer';
  }
  if (matchMode === 'static-training-pack') {
    return staticTrainingSessionMode === 'edit' || hasExtraBottomAction
      ? 'static-training-edit'
      : 'static-training-play';
  }
  if (hasActiveOnlineRoom) {
    return isOnlineMatchRoom
      ? isHosting
        ? 'match-lobby-host'
        : 'match-lobby-client'
      : isHosting
      ? 'online-warmup-host'
      : 'online-warmup-client';
  }
  return 'freeplay';
}

export interface MenuContainerProps {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Optional explicit gap override in px */
  gapPx?: number;
  /** Optional explicit container padding override in px */
  paddingPx?: number;
}

/**
 * MenuContainer
 * Roving keyboard focus manager for SimpleUI menus:
 * - ArrowDown / ArrowUp traverses interactive items
 * - Home / End keys jump to first / last items
 * - Tokenized gap & padding connected to L0 menuLayoutStore
 */
export const MenuContainer: React.FC<MenuContainerProps> = React.memo(({
  children,
  className = '',
  ariaLabel = 'Navigation Menu',
  gapPx,
  paddingPx,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { menuItemGap, menuContainerPadding } = useMenuLayoutStore();

  const resolvedGap = gapPx ?? menuItemGap;
  const resolvedPadding = paddingPx ?? menuContainerPadding;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const focusable = Array.from(
      containerRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    );
    if (!focusable.length) return;

    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % focusable.length;
      focusable[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + focusable.length) % focusable.length;
      focusable[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusable[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      focusable[focusable.length - 1]?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      data-ui-element="menu-container"
      data-menu-container="true"
      style={{
        gap: `${resolvedGap}px`,
        padding: `${resolvedPadding}px`,
      }}
      className={`flex flex-col ${UI_SPACING.menu.gap} ${UI_SPACING.menu.container} w-full transition-colors ${className}`}
    >
      {children}
    </div>
  );
});

MenuContainer.displayName = 'MenuContainer';

export const MenuDivider: React.FC<{
  isLight?: boolean;
  className?: string;
  marginYPx?: number;
}> = React.memo(({ isLight = false, className = '', marginYPx }) => {
  const dividerMarginY = useMenuLayoutStore((s) => s.dividerMarginY);
  const resolvedMarginY = marginYPx ?? dividerMarginY;

  return (
    <hr
      style={{
        marginTop: `${resolvedMarginY}px`,
        marginBottom: `${resolvedMarginY}px`,
      }}
      className={`border-none h-px w-full shrink-0 ${
        isLight ? 'bg-neutral-200' : 'bg-neutral-800'
      } ${className}`}
    />
  );
});

MenuDivider.displayName = 'MenuDivider';

export const MenuSectionTitle: React.FC<{
  children: React.ReactNode;
  isLight?: boolean;
  className?: string;
}> = React.memo(({ children, isLight = false, className = '' }) => (
  <div
    className={`px-1 py-1 text-[11px] font-bold uppercase tracking-wider select-none ${
      isLight ? 'text-neutral-500' : 'text-neutral-400'
    } ${className}`}
  >
    {children}
  </div>
));

MenuSectionTitle.displayName = 'MenuSectionTitle';

export const Layer1TouchAgentSelector: React.FC<{
  isLight: boolean;
  touchHeadlessMode?: boolean;
  touchInputAgent: TouchInputAgentOption;
  onSelect: (next: TouchInputAgentOption) => void;
}> = React.memo(({ isLight, touchHeadlessMode, touchInputAgent, onSelect }) => (
  <div
    className={`p-3 rounded-xl border flex flex-col gap-2 font-mono ${
      isLight ? 'bg-neutral-100/90 border-neutral-300 text-neutral-800' : 'bg-neutral-900/80 border-neutral-700/80 text-neutral-200'
    }`}
  >
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
        <Bot className="h-3.5 w-3.5" />
        <span>Touch Input Agent ({touchHeadlessMode ? '?touch=2' : '?touch=1'})</span>
      </span>
      <span className="text-[10px] opacity-75">Model Takeover</span>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {(['none', 'necto', 'nexto'] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`py-1.5 px-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
            touchInputAgent === id
              ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-sm'
              : isLight
              ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-200'
              : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          {id === 'none' ? 'No input' : id === 'necto' ? 'Necto' : 'Nexto'}
        </button>
      ))}
    </div>
  </div>
));

Layer1TouchAgentSelector.displayName = 'Layer1TouchAgentSelector';

export const Layer1PowerSaveFooterBar: React.FC<{
  isLight: boolean;
  powerSave?: string;
  mergedStyle: MainMenuStyleParams;
  onNavigateDisplaySettings: () => void;
}> = React.memo(({ isLight, powerSave = '30', mergedStyle, onNavigateDisplaySettings }) => {
  let dotColor = 'bg-emerald-500';
  let powerLabel = 'Power Saving: 30 FPS';
  if (powerSave === 'extreme' || powerSave === 'freeze') {
    dotColor = 'bg-amber-500 animate-pulse';
    powerLabel = 'Power Saving: Extreme';
  } else if (powerSave === '15') {
    dotColor = 'bg-amber-400';
    powerLabel = 'Power Saving: 15 FPS';
  } else if (powerSave === '30') {
    dotColor = 'bg-emerald-400';
    powerLabel = 'Power Saving: 30 FPS';
  } else if (powerSave === 'disable' || powerSave === 'match') {
    dotColor = 'bg-emerald-500';
    powerLabel = 'Power Saving: Disable';
  }

  return (
    <div
      data-ui-element="panel-footer"
      data-panel-section="footer"
      style={{
        paddingLeft: `${mergedStyle.footerPaddingXPx}px`,
        paddingRight: `${mergedStyle.footerPaddingXPx}px`,
        paddingTop: `${mergedStyle.footerPaddingYPx}px`,
        paddingBottom: `${mergedStyle.footerPaddingYPx}px`,
        fontSize: `${mergedStyle.footerFontSizePx}px`,
      }}
      className={`border-t select-none flex items-center justify-between transition-colors shrink-0 mt-auto relative z-10 ${
        isLight ? 'border-neutral-200/90 text-neutral-600 bg-neutral-50/90' : 'border-neutral-800/80 text-neutral-400 bg-neutral-900/90'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="font-mono truncate">{powerLabel}</span>
      </div>

      <button
        type="button"
        onClick={onNavigateDisplaySettings}
        className={`flex items-center gap-1 font-mono shrink-0 font-medium transition-colors cursor-pointer outline-none ${
          isLight ? 'text-neutral-500 hover:text-amber-600' : 'text-neutral-400 hover:text-amber-400'
        }`}
        title="Jump directly to Settings -> Display (Menu Power Save)"
      >
        <span>click to change</span>
        <ArrowUpRight className="h-3 w-3 stroke-[2.5]" />
      </button>
    </div>
  );
});

Layer1PowerSaveFooterBar.displayName = 'Layer1PowerSaveFooterBar';

