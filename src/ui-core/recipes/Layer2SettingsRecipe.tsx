import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Monitor,
  Info,
  Sliders,
  Terminal,
  Volume2,
} from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { UnderlineTabs, TabItem } from '../primitives/UnderlineTabs';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useAppStore } from '../stores/appStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { DEFAULT_PANEL_SIZING, type PanelSizingConfig } from '../tokens/menuLayoutTokens';
import type { DiagnosticWindowPayload } from './settings/components/FloatingWindowCard';
import {
  GameplayTab,
  SURFACE_VARIANT_META as GAMEPLAY_TAB_VARIANT_META,
  type GameplayConfig,
} from './settings/tabs/GameplayTab';
import {
  AudioTab,
  SURFACE_VARIANT_META as AUDIO_TAB_VARIANT_META,
  type AudioConfig,
} from './settings/tabs/AudioTab';
import {
  DisplayTab,
  SURFACE_VARIANT_META as DISPLAY_TAB_VARIANT_META,
  type GraphicsConfig,
} from './settings/tabs/DisplayTab';
import {
  AdvancedTab,
  SURFACE_VARIANT_META as ADVANCED_TAB_VARIANT_META,
  type TelemetryOverlayConfig,
} from './settings/tabs/AdvancedTab';
import type { AudioDebugTelemetryProps } from './settings/components/AudioDebugSection';
import {
  DeveloperTab,
  SURFACE_VARIANT_META as DEVELOPER_TAB_VARIANT_META,
} from './settings/tabs/DeveloperTab';

export type {
  AudioConfig,
  AudioDebugTelemetryProps,
  DiagnosticWindowPayload,
  GameplayConfig,
  GraphicsConfig,
  PanelSizingConfig,
  TelemetryOverlayConfig,
};

export type SettingsTabId = 'gameplay' | 'audio' | 'display' | 'advanced' | 'developer';

export const SETTINGS_TAB_VARIANTS = [
  GAMEPLAY_TAB_VARIANT_META,
  AUDIO_TAB_VARIANT_META,
  DISPLAY_TAB_VARIANT_META,
  ADVANCED_TAB_VARIANT_META,
  DEVELOPER_TAB_VARIANT_META,
] as const;

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer2SettingsRecipe',
  title: 'SETTINGS',
  subtitle: '5-Tab System & Developer Settings',
  description:
    'Gameplay, Audio, Display, Advanced telemetry, and Developer Hub configuration shell.',
  icon: 'Sliders',
  layer: 'layer2',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: DEFAULT_PANEL_SIZING['layer2-settings'].width,
    height: DEFAULT_PANEL_SIZING['layer2-settings'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer2-settings'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer2-settings'].maxHeight,
    mode: 'adaptive',
  },
  variants: [...SETTINGS_TAB_VARIANTS],
};

export type Layer2SettingsRecipeProps = StandardSurfaceProps;

const normalizeTab = (t?: string): SettingsTabId => {
  if (t === 'video') return 'display';
  if (
    t === 'gameplay' ||
    t === 'audio' ||
    t === 'display' ||
    t === 'advanced' ||
    t === 'developer'
  ) {
    return t;
  }
  return 'gameplay';
};

/**
 * [Recipe] Layer 2 Settings Menu (Width: 680px)
 * Matches RocketCompanion's authentic 5 icon+text tabs:
 * 1. Gameplay (`Gamepad2`)
 * 2. Audio (`Volume2`)
 * 3. Display (`Monitor`)
 * 4. Advanced (`Sliders`) — includes the Developer Settings status row
 * 5. Developer (`Terminal`) — visible when developerMode is true or activeTab === 'developer'
 *
 * Adheres to the 4-prop StandardSurfaceProps shell contract (`isLight`, `activeTab`,
 * `onTabChange`, `onBack`). All domain data and route transitions flow directly through
 * Zustand stores (or are locally shadowed in RCUITuner via `<StoreSnapshotScope>`).
 */
export const Layer2SettingsRecipe: React.FC<Layer2SettingsRecipeProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const storeDevMode = useScopedStore('appStore', useAppStore, (s) => s.developerMode);
  const storeNavigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const storeTargetTab = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.settingsTargetTab
  );
  const setStoreTargetTab = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.setSettingsTargetTab
  );

  const onBack = propOnBack ?? storeGoBack;

  const [internalTab, setInternalTab] = useState<SettingsTabId>(() =>
    normalizeTab(controlledTab ?? storeTargetTab)
  );

  const currentTab: SettingsTabId = controlledTab
    ? normalizeTab(controlledTab)
    : internalTab;

  useEffect(() => {
    if (!controlledTab && storeTargetTab) {
      setInternalTab(normalizeTab(storeTargetTab));
    }
  }, [storeTargetTab, controlledTab]);

  const developerMode = Boolean(storeDevMode) || currentTab === 'developer';

  const handleTabChange = (t: string) => {
    const valid = normalizeTab(t);
    setInternalTab(valid);
    setStoreTargetTab(valid);
    onTabChange?.(valid);
  };

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels?.['layer2-settings'] ?? DEFAULT_PANEL_SIZING['layer2-settings']
  );
  const panelBodyPaddingX = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panelBodyPaddingX ?? 18
  );

  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );

  const sizing: PanelSizingConfig = {
    ...storeSizing,
    width: calibratedSizing.width ?? storeSizing.width,
    minHeight: calibratedSizing.minHeight ?? storeSizing.minHeight,
    maxHeight: calibratedSizing.maxHeight ?? storeSizing.maxHeight,
  };

  const handleNavigateRoute = (route: string) => {
    const normalizedRoute =
      route === 'training'
        ? 'training-config'
        : route === 'audio-eq'
          ? 'acoustics-equalizer'
          : route;
    storeNavigate(normalizedRoute as Parameters<typeof storeNavigate>[0]);
  };

  const tabs: TabItem[] = [
    { id: 'gameplay', label: 'Gameplay', icon: <Gamepad2 className="h-3.5 w-3.5" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="h-3.5 w-3.5" /> },
    { id: 'display', label: 'Display', icon: <Monitor className="h-3.5 w-3.5" /> },
    { id: 'advanced', label: 'Advanced', icon: <Sliders className="h-3.5 w-3.5" /> },
  ];

  if (developerMode) {
    tabs.push({
      id: 'developer',
      label: 'Developer',
      icon: <Terminal className="h-3.5 w-3.5" />,
    });
  }

  const defaultFooterDesc =
    currentTab === 'developer'
      ? 'Internal developer diagnostics, sandboxes, active tuners, and calibrated presets.'
      : currentTab === 'advanced'
      ? 'Manage engine telemetry overlays, floating diagnostics windows, and developer tools.'
      : currentTab === 'display'
      ? 'Tune display render resolution, frame rate targets, and arena visual fidelity.'
      : currentTab === 'audio'
      ? 'Adjust master, engine, and boost sound levels or background audio behavior.'
      : 'Configure gameplay mechanics, training mode, camera, key bindings, and ball trajectory predictor.';

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader
        title="SETTINGS"
        onBack={onBack}
        isLight={isLight}
      />

      <div
        style={{ paddingLeft: `${panelBodyPaddingX}px`, paddingRight: `${panelBodyPaddingX}px` }}
        className="pt-2 w-full shrink-0"
        data-ui-element="tabs-wrapper"
        data-panel-section="tabs"
      >
        <UnderlineTabs
          items={tabs}
          activeId={currentTab}
          onChange={handleTabChange}
          isLight={isLight}
          size="sm"
          fullWidth={true}
        />
      </div>

      <PanelContent scrollable>
        <div
          className="grid grid-cols-1 items-start w-full shrink-0"
          data-tab-envelope-grid="true"
        >
          <div
            aria-hidden={currentTab !== 'gameplay'}
            inert={currentTab !== 'gameplay' ? true : undefined}
            data-tab-active={currentTab === 'gameplay' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full ${
              currentTab === 'gameplay'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0 h-0 overflow-hidden'
            }`}
          >
            <GameplayTab
              isLight={isLight}
              onNavigateRoute={handleNavigateRoute}
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
            />
          </div>

          <div
            aria-hidden={currentTab !== 'audio'}
            inert={currentTab !== 'audio' ? true : undefined}
            data-tab-active={currentTab === 'audio' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full ${
              currentTab === 'audio'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0 h-0 overflow-hidden'
            }`}
          >
            <AudioTab
              isLight={isLight}
              developerMode={developerMode}
              onNavigateAcousticsEqualizer={() => handleNavigateRoute('acoustics-equalizer')}
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
            />
          </div>

          <div
            aria-hidden={currentTab !== 'display'}
            inert={currentTab !== 'display' ? true : undefined}
            data-tab-active={currentTab === 'display' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full ${
              currentTab === 'display'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0 h-0 overflow-hidden'
            }`}
          >
            <DisplayTab
              isLight={isLight}
              developerMode={developerMode}
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
            />
          </div>

          <div
            aria-hidden={currentTab !== 'advanced'}
            inert={currentTab !== 'advanced' ? true : undefined}
            data-tab-active={currentTab === 'advanced' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full ${
              currentTab === 'advanced'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0 h-0 overflow-hidden'
            }`}
          >
            <AdvancedTab
              isLight={isLight}
              developerMode={developerMode}
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
            />
          </div>

          {developerMode && (
            <div
              aria-hidden={currentTab !== 'developer'}
              inert={currentTab !== 'developer' ? true : undefined}
              data-tab-active={currentTab === 'developer' ? 'true' : 'false'}
              className={`col-start-1 row-start-1 w-full ${
                currentTab === 'developer'
                  ? 'visible opacity-100 pointer-events-auto z-10'
                  : 'invisible opacity-0 pointer-events-none select-none z-0 h-0 overflow-hidden'
              }`}
            >
              <DeveloperTab
                isLight={isLight}
                onNavigateRoute={handleNavigateRoute}
                onHover={setHoveredDesc}
                onLeave={() => setHoveredDesc(null)}
              />
            </div>
          )}
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription={defaultFooterDesc}
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};

