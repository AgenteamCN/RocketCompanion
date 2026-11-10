import React, { useState, useEffect } from 'react';
import {
  Car,
  Palette,
  Sparkles,
  Music,
  CloudSync,
} from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { UnderlineTabs, TabItem } from '../primitives/UnderlineTabs';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSpatialAudioStore } from '../stores/spatialAudioStore';
import {
  useScopedStore,
  useStoreSnapshotOverride,
} from '../stores/storeSnapshotScope';
import { GarageCarTab, SURFACE_VARIANT_META as GARAGE_CAR_VARIANT_META } from './garage/GarageCarTab';
import { GaragePaintTab, SURFACE_VARIANT_META as GARAGE_PAINT_VARIANT_META } from './garage/GaragePaintTab';
import { GarageLoadoutTab, SURFACE_VARIANT_META as GARAGE_LOADOUT_VARIANT_META } from './garage/GarageLoadoutTab';
import { GarageAnthemTab, SURFACE_VARIANT_META as GARAGE_ANTHEM_VARIANT_META } from './garage/GarageAnthemTab';
import { GarageSyncTab, SURFACE_VARIANT_META as GARAGE_SYNC_VARIANT_META } from './garage/GarageSyncTab';

export type GarageTabId =
  | 'car'
  | 'paint'
  | 'loadout'
  | 'anthem'
  | 'sync';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer2GarageRecipe',
  title: 'Garage Loadout',
  subtitle: 'Vehicle chassis, team paint priority, visual FX loadout, goal anthem & cloud sync',
  icon: 'Wrench',
  layer: 'layer2',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 640,
    height: 520,
    minHeight: 480,
    maxHeight: 560,
    mode: 'fixed',
  },
  variants: [
    GARAGE_CAR_VARIANT_META,
    GARAGE_PAINT_VARIANT_META,
    GARAGE_LOADOUT_VARIANT_META,
    GARAGE_ANTHEM_VARIANT_META,
    GARAGE_SYNC_VARIANT_META,
  ],
};

export interface Layer2GarageRecipeProps extends StandardSurfaceProps {
  className?: string;
}

const normalizeGarageTab = (t?: string): GarageTabId => {
  if (t === 'player-name' || t === 'sync') return 'sync';
  if (t === 'colour' || t === 'paint') return 'paint';
  if (t === 'materials' || t === 'loadout') return 'loadout';
  if (t === 'anthem') return 'anthem';
  return 'car';
};

/**
 * [Recipe] Layer 2 Garage Loadout Menu (Width: 640px, Height: 520px)
 * Store-First zero-prop-drilling shell across 5 decoupled tabs:
 * 1. Car (`GarageCarTab`)
 * 2. Paint (`GaragePaintTab`)
 * 3. Loadout (`GarageLoadoutTab`)
 * 4. Anthem (`GarageAnthemTab`)
 * 5. Sync (`GarageSyncTab`)
 */
export const Layer2GarageRecipe: React.FC<Layer2GarageRecipeProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
  onBack,
  className = '',
}) => {
  const goBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const stopPreviewAnthem = useScopedStore(
    'spatialAudioStore',
    useSpatialAudioStore,
    (s) => s.stopPreviewAnthem
  );
  const scopedOverrides = useStoreSnapshotOverride<{ activeTab?: string }>('appStore');

  const sizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels['layer2-garage']
  );
  const panelBodyPaddingX = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panelBodyPaddingX
  );

  const externalTab = controlledTab ?? scopedOverrides?.activeTab;
  const [internalTab, setInternalTab] = useState<GarageTabId>(() =>
    normalizeGarageTab(externalTab)
  );
  const activeTab = normalizeGarageTab(externalTab ?? internalTab);

  useEffect(() => {
    if (externalTab) {
      setInternalTab(normalizeGarageTab(externalTab));
    }
  }, [externalTab]);

  const handleTabChange = (tab: string) => {
    const normalized = normalizeGarageTab(tab);
    if (normalized !== 'anthem') {
      stopPreviewAnthem();
    }
    setInternalTab(normalized);
    onTabChange?.(normalized);
  };

  const handleBack = () => {
    stopPreviewAnthem();
    if (onBack) {
      onBack();
    } else {
      goBack();
    }
  };

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const tabs: TabItem[] = [
    { id: 'car', label: 'Car', icon: <Car className="h-3.5 w-3.5" /> },
    { id: 'paint', label: 'Paint', icon: <Palette className="h-3.5 w-3.5" /> },
    { id: 'loadout', label: 'Loadout', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: 'anthem', label: 'Anthem', icon: <Music className="h-3.5 w-3.5" /> },
    { id: 'sync', label: 'Sync', icon: <CloudSync className="h-3.5 w-3.5" /> },
  ];

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className={`w-full ${className}`.trim()}>
      <PanelHeader
        title="GARAGE LOADOUT"
        onBack={handleBack}
        isLight={isLight}
      />

      <div
        style={{ paddingLeft: `${panelBodyPaddingX}px`, paddingRight: `${panelBodyPaddingX}px` }}
        className="pt-1 shrink-0"
        data-panel-section="tabs"
      >
        <UnderlineTabs
          items={tabs}
          activeId={activeTab}
          onChange={handleTabChange}
          isLight={isLight}
          size="sm"
        />
      </div>

      <PanelContent scrollable>
        <div
          className="relative grid grid-cols-1 items-stretch w-full shrink-0"
          data-tab-envelope-grid="true"
        >
          <div
            aria-hidden={activeTab !== 'car'}
            inert={activeTab !== 'car' ? true : undefined}
            data-tab-active={activeTab === 'car' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full h-full flex flex-col ${
              activeTab === 'car'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0'
            }`}
          >
            <GarageCarTab onHoverDesc={setHoveredDesc} isLight={isLight} />
          </div>

          <div
            aria-hidden={activeTab !== 'paint'}
            inert={activeTab !== 'paint' ? true : undefined}
            data-tab-active={activeTab === 'paint' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full h-full flex flex-col ${
              activeTab === 'paint'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0'
            }`}
          >
            <GaragePaintTab onHoverDesc={setHoveredDesc} isLight={isLight} />
          </div>

          <div
            aria-hidden={activeTab !== 'loadout'}
            inert={activeTab !== 'loadout' ? true : undefined}
            data-tab-active={activeTab === 'loadout' ? 'true' : 'false'}
            className={`col-start-1 row-start-1 w-full h-full flex flex-col ${
              activeTab === 'loadout'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0'
            }`}
          >
            <GarageLoadoutTab onHoverDesc={setHoveredDesc} isLight={isLight} />
          </div>

          <div
            aria-hidden={activeTab !== 'anthem'}
            inert={activeTab !== 'anthem' ? true : undefined}
            data-tab-active={activeTab === 'anthem' ? 'true' : 'false'}
            data-envelope-exclude="true"
            className={`absolute inset-0 w-full h-full flex flex-col overflow-hidden ${
              activeTab === 'anthem'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0'
            }`}
          >
            <GarageAnthemTab
              isActive={activeTab === 'anthem'}
              onHoverDesc={setHoveredDesc}
              isLight={isLight}
            />
          </div>

          <div
            aria-hidden={activeTab !== 'sync'}
            inert={activeTab !== 'sync' ? true : undefined}
            data-tab-active={activeTab === 'sync' ? 'true' : 'false'}
            data-envelope-exclude="true"
            className={`absolute inset-0 w-full h-full flex flex-col overflow-hidden ${
              activeTab === 'sync'
                ? 'visible opacity-100 pointer-events-auto z-10'
                : 'invisible opacity-0 pointer-events-none select-none z-0'
            }`}
          >
            <GarageSyncTab onHoverDesc={setHoveredDesc} isLight={isLight} />
          </div>
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Customization loadout, team paint preference, visual loadout effects & cloud sync."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
};
