import React, { useState } from 'react';
import { Play, Wrench, Settings, RotateCcw, LogOut } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelContent } from '../layout/Panel';
import { MainMenuRow } from '../layout/MainMenuRow';
import { MenuContainer, MenuDivider, Layer1TouchAgentSelector, Layer1PowerSaveFooterBar, renderLayer1CustomRowIcon, deriveLayer1ContextVariation, createLayer1ActionHandlers, type TouchInputAgentOption, type Layer1MainMenuBottomActionSpec, type Layer1ScopedAppOverrides } from '../layout/MenuContainer';
import { useAppStore } from '../stores/appStore';
import { useExperimentalMultiBotsStore } from '../stores/experimentalMultiBotsStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useNameTagTunerStore } from '../stores/nameTagTunerStore';
import { useNetworkDiagnosticsData } from '../stores/networkDiagnosticsStore';
import { getActiveReplayTimelineController } from '../stores/replayDirectorStore';
import { useReplayViewerStore } from '../stores/replayViewerStore';
import { useRewinderStore } from '../stores/rewinderStore';
import { useStaticTrainingPackStore } from '../stores/staticTrainingPackStore';
import { useScopedStore, useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import { useMainMenuStyleStore, resolveMainMenuTitleTypography, type MainMenuStyleParams, type MainMenuStyleVariant } from '../stores/mainMenuStyleStore';
import { LAYER1_SURFACE_VARIANTS, resolveLayer1ContextSpec, type CanonicalLayer1ContextVariation, type Layer1ContextVariation, type Layer1MenuContextMode, type Layer1ContextMeta, type Layer1ContextGroupId, type Layer1ContextGroupMeta } from './layer1MenuContextSpecs';

export type {
  CanonicalLayer1ContextVariation,
  Layer1ContextVariation,
  Layer1MenuContextMode,
  Layer1ContextMeta,
  Layer1ContextGroupId,
  Layer1ContextGroupMeta,
  TouchInputAgentOption,
  Layer1MainMenuBottomActionSpec,
};

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer1MainMenuRecipe',
  title: 'Main Menu',
  subtitle: 'Root ESC pause & session context menu across 14 user and developer variations',
  icon: 'Menu',
  layer: 'layer1',
  menuGroup: 'menu-layer',
  defaultSizing: { width: 420, minHeight: 240, maxHeight: 540, mode: 'adaptive' },
  variants: LAYER1_SURFACE_VARIANTS,
};

export interface Layer1MainMenuRecipeProps extends StandardSurfaceProps {
  className?: string;
}

export const Layer1MainMenuRecipe: React.FC<Layer1MainMenuRecipeProps> = ({
  isLight = false,
  activeTab,
  onTabChange,
  onBack,
  className = '',
}) => {
  const matchMode = useScopedStore('appStore', useAppStore, (s) => s.matchMode);
  const onlineSession = useScopedStore('appStore', useAppStore, (s) => s.onlineSession);
  const touchMode = useScopedStore('appStore', useAppStore, (s) => s.touchMode);
  const touchHeadlessMode = useScopedStore('appStore', useAppStore, (s) => s.touchHeadlessMode);
  const storeTouchInputAgent = useScopedStore('appStore', useAppStore, (s) => s.touchInputAgent);
  const setTouchInputAgent = useScopedStore('appStore', useAppStore, (s) => s.setTouchInputAgent);
  const storeMenuPowerSave = useScopedStore('appStore', useAppStore, (s) => s.graphics?.menuPowerSave);
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);
  const appOverrides = useStoreSnapshotOverride<Layer1ScopedAppOverrides>('appStore');

  const isExhibitionMode = useScopedStore('experimentalMultiBotsStore', useExperimentalMultiBotsStore, (s) => s.isExhibitionMode);
  const replayViewerHasLoaded = useScopedStore('replayViewerStore', useReplayViewerStore, (s) =>
    Boolean((s.loadedFileName && s.totalFrames > 0) || s.viewerState !== 'idle')
  );
  const isNameTagTunerArenaActive = useScopedStore('nameTagTunerStore', useNameTagTunerStore, (s) => s.isTunerArenaActive);
  const rewinderState = useScopedStore('rewinderStore', useRewinderStore, (s) => s.rewinderState);
  const staticTrainingSessionMode = useScopedStore('staticTrainingPackStore', useStaticTrainingPackStore, (s) => s.sessionMode);
  const { metrics: netDiagMetrics } = useNetworkDiagnosticsData();

  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels?.['layer1-main'] ?? DEFAULT_PANEL_SIZING['layer1-main']
  );
  const sizing = appOverrides?.sizing ?? storeSizing;

  const storeMenuStyle = useMainMenuStyleStore();
  const styleOverrides = useStoreSnapshotOverride<MainMenuStyleParams & { previewContextMode?: Layer1ContextVariation }>('mainMenuStyleStore');

  const mergedStyle: MainMenuStyleParams = {
    ...storeMenuStyle,
    ...(styleOverrides || {}),
    itemIconColors: { ...storeMenuStyle.itemIconColors, ...(styleOverrides?.itemIconColors || {}) },
  };
  const activeStyleVariant: MainMenuStyleVariant = styleOverrides?.variant ?? mergedStyle.variant;

  const [internalTouchInputAgent, setInternalTouchInputAgent] = useState<TouchInputAgentOption>('none');
  const touchInputAgent = storeTouchInputAgent ?? internalTouchInputAgent;
  const handleTouchInputAgentSelect = (next: TouchInputAgentOption) => {
    setInternalTouchInputAgent(next);
    setTouchInputAgent?.(next);
  };

  const activeDirectorCtrl = getActiveReplayTimelineController();
  const isDirectorPreviewActive = Boolean(
    activeDirectorCtrl?.sessionState?.isActive &&
      (activeDirectorCtrl?.sessionState?.isImportedPreview || activeDirectorCtrl?.sessionState?.isPersistent)
  );
  const isRewinderBlocking =
    rewinderState === 'paused-scrub' || rewinderState === 'rewinding' ||
    rewinderState === 'forwarding' || rewinderState === 'preroll-countdown';
  const hasFreeplaySubSceneOverride = Boolean(
    isNameTagTunerArenaActive || isDirectorPreviewActive || isRewinderBlocking || netDiagMetrics?.zeroGFleetEnabled
  );

  const isHosting = Boolean(onlineSession?.isHosting);
  const isOnlineMatchRoom = onlineSession?.roomType === 'match';
  const hasActiveOnlineRoom = matchMode === 'online-warmup' || Boolean(onlineSession?.roomId);

  const derivedVariation = deriveLayer1ContextVariation({
    matchMode,
    isHosting,
    isOnlineMatchRoom,
    hasActiveOnlineRoom,
    isExhibitionMode,
    replayViewerHasLoaded,
    staticTrainingSessionMode,
    hasExtraBottomAction: Boolean(appOverrides?.extraBottomAction),
  });

  const rawCtxInput =
    (activeTab as Layer1ContextVariation | undefined) ??
    styleOverrides?.previewContextMode ??
    appOverrides?.contextVariation ??
    appOverrides?.contextMode ??
    (derivedVariation !== 'freeplay' ? derivedVariation : storeMenuStyle.previewContextMode ?? 'freeplay');
  const ctxSpec = resolveLayer1ContextSpec(rawCtxInput);

  const {
    handleResume,
    handleNavigateGarage,
    handleNavigateSettings,
    handleCustomRowClick,
    handleRestartMatch,
    resolvedBottomAction,
  } = createLayer1ActionHandlers({
    appOverrides,
    onBack,
    onTabChange,
    closeMenu,
    navigate,
    bridge,
    ctxSpec,
    derivedVariation,
    hasFreeplaySubSceneOverride,
  });

  const powerSave =
    appOverrides?.menuPowerSave ?? storeMenuPowerSave ?? (appOverrides?.backgroundRenderPaused ? 'extreme' : '30');

  const resolvedHeaderTypography = resolveMainMenuTitleTypography(
    mergedStyle.headerFontFamily,
    mergedStyle.headerFontWeight,
    storeMenuStyle.platformPreviewMode
  );

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className={`w-full shadow-2xl ${className}`}>
      <div
        data-ui-element="panel-header"
        data-panel-section="header"
        style={{
          paddingLeft: `${mergedStyle.headerPaddingXPx}px`,
          paddingRight: `${mergedStyle.headerPaddingXPx}px`,
          paddingTop: `${mergedStyle.headerPaddingTopPx}px`,
          paddingBottom: `${mergedStyle.headerPaddingBottomPx}px`,
        }}
        className={`border-b select-none text-center transition-colors ${
          isLight ? 'border-neutral-200/90 bg-neutral-50/70 text-neutral-900' : 'border-neutral-800/80 bg-neutral-900/60 text-white'
        }`}
      >
        <h1
          style={{
            fontFamily: resolvedHeaderTypography.fontFamily,
            fontSize: `${mergedStyle.headerFontSizePx}px`,
            fontWeight: resolvedHeaderTypography.fontWeight,
            letterSpacing: `${mergedStyle.headerLetterSpacingEm}em`,
          }}
          className="uppercase leading-tight"
        >
          {ctxSpec.headerTitle}
        </h1>
      </div>

      <PanelContent
        scrollable={true}
        style={{
          paddingLeft: `${mergedStyle.contentPaddingXPx}px`,
          paddingRight: `${mergedStyle.contentPaddingXPx}px`,
          paddingTop: `${mergedStyle.contentPaddingYPx}px`,
          paddingBottom: `${mergedStyle.contentPaddingYPx}px`,
        }}
      >
        <MenuContainer ariaLabel="Main Game Menu" gapPx={mergedStyle.itemGapPx} paddingPx={mergedStyle.menuContainerPaddingPx}>
          <MainMenuRow
            slotId="resume"
            icon={<Play className="h-5 w-5" />}
            title={mergedStyle.conciseResumeLabel ? 'Resume' : 'Resume Match'}
            subtitle="Return to active arena gameplay"
            shortcut="ESC"
            variant="primary"
            styleVariant={activeStyleVariant}
            styleParams={mergedStyle}
            autoFocus
            onClick={handleResume}
            isLight={isLight}
          />

          {touchMode && (
            <Layer1TouchAgentSelector
              isLight={isLight}
              touchHeadlessMode={touchHeadlessMode}
              touchInputAgent={touchInputAgent}
              onSelect={handleTouchInputAgentSelect}
            />
          )}

          {mergedStyle.showDividers && <MenuDivider isLight={isLight} marginYPx={mergedStyle.dividerMarginYPx} />}

          {ctxSpec.customActionRow && (
            <MainMenuRow
              slotId={ctxSpec.customActionRow.slotId}
              icon={renderLayer1CustomRowIcon(ctxSpec.customActionRow.iconType, ctxSpec.customActionRow.iconColorClass)}
              iconColorToken={ctxSpec.customActionRow.iconColorToken}
              title={ctxSpec.customActionRow.title}
              subtitle={ctxSpec.customActionRow.subtitle}
              hasArrow
              styleVariant={activeStyleVariant}
              styleParams={mergedStyle}
              onClick={handleCustomRowClick}
              isLight={isLight}
            />
          )}

          {ctxSpec.showGarage && (
            <MainMenuRow
              slotId="garage"
              icon={<Wrench className="h-5 w-5" />}
              title="Garage"
              subtitle="Vehicle models, colours & player anthem"
              hasArrow
              styleVariant={activeStyleVariant}
              styleParams={mergedStyle}
              onClick={handleNavigateGarage}
              isLight={isLight}
            />
          )}

          {ctxSpec.showSettings && (
            <MainMenuRow
              slotId="settings"
              icon={<Settings className="h-5 w-5" />}
              title="Settings"
              subtitle="Gameplay, controls, video & sound"
              hasArrow
              styleVariant={activeStyleVariant}
              styleParams={mergedStyle}
              onClick={() => handleNavigateSettings()}
              isLight={isLight}
            />
          )}

          {ctxSpec.showRestartMatch && (
            <>
              {mergedStyle.showDividers && <MenuDivider isLight={isLight} marginYPx={mergedStyle.dividerMarginYPx} />}
              <MainMenuRow
                slotId="restart"
                icon={<RotateCcw className="h-5 w-5" />}
                title="Restart Match"
                subtitle="Reset score, clock and restart kickoff"
                variant="secondary"
                styleVariant={activeStyleVariant}
                styleParams={mergedStyle}
                onClick={handleRestartMatch}
                isLight={isLight}
              />
            </>
          )}

          {resolvedBottomAction &&
            (typeof resolvedBottomAction === 'object' && resolvedBottomAction !== null && 'title' in resolvedBottomAction ? (
              <>
                {mergedStyle.showDividers && <MenuDivider isLight={isLight} marginYPx={mergedStyle.dividerMarginYPx} />}
                <MainMenuRow
                  slotId="leave"
                  icon={resolvedBottomAction.icon || <LogOut className="h-5 w-5 text-rose-400" />}
                  title={resolvedBottomAction.title}
                  subtitle={resolvedBottomAction.subtitle}
                  variant={resolvedBottomAction.variant || 'danger'}
                  styleVariant={activeStyleVariant}
                  styleParams={mergedStyle}
                  onClick={resolvedBottomAction.onClick}
                  isLight={isLight}
                />
              </>
            ) : (
              resolvedBottomAction
            ))}
        </MenuContainer>
      </PanelContent>

      {mergedStyle.showFooter && (
        <Layer1PowerSaveFooterBar
          isLight={isLight}
          powerSave={powerSave}
          mergedStyle={mergedStyle}
          onNavigateDisplaySettings={() => handleNavigateSettings('display')}
        />
      )}
    </PanelContainer>
  );
};
