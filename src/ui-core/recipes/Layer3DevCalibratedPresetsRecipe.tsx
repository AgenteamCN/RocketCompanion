import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { FloatingWindowCard } from './settings/components/FloatingWindowCard';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  CALIBRATED_PRESET_SPECS,
  resolveBadgeClasses,
  resolveMenuGroupLauncherSpecs,
} from './dev/devHubSurfaceCatalog';

export type Layer3DevCalibratedPresetsRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-dev-calibrated-presets',
  title: 'CALIBRATED PRESETS',
  subtitle: 'Developer Calibrated Visual Presets',
  description:
    'Calibrated visual presets (Atmosphere & FX, Vehicle Global Surfaces, Supersonic Wheel Trail, Driftwoods Stadium, Boost Pad & Multiplayer Name Tag).',
  icon: 'palette',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-dev-calibrated-presets'].width,
    height: DEFAULT_PANEL_SIZING['layer3-dev-calibrated-presets'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-dev-calibrated-presets'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-dev-calibrated-presets'].maxHeight,
  },
};

/**
 * [Recipe] Layer 3 Calibrated Presets (Developer Tier)
 * Data-driven `menuGroup === 'calibrated-presets'` floating window launcher list.
 */
export const Layer3DevCalibratedPresetsRecipe: React.FC<
  Layer3DevCalibratedPresetsRecipeProps
> = ({ isLight = false, onBack: propOnBack }) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const onBack = propOnBack ?? storeGoBack;
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const sizing = useMenuLayoutStore(
    (s) =>
      s.panels?.['layer3-dev-calibrated-presets'] ??
      DEFAULT_PANEL_SIZING['layer3-dev-calibrated-presets']
  );
  const { rowGap } = useSettingActionRowStore();

  const resolvedSpecs = useMemo(
    () => resolveMenuGroupLauncherSpecs('calibrated-presets', CALIBRATED_PRESET_SPECS),
    []
  );

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader title="CALIBRATED PRESETS" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <div
          data-layout="calibrated-presets-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {resolvedSpecs.map((spec) => (
            <FloatingWindowCard
              key={spec.id}
              preset={spec.preset}
              icon={spec.icon}
              iconColor={spec.iconColor}
              badge={spec.badge}
              badgeClass={resolveBadgeClasses(spec.badgeTone, isLight)}
              bordered={false}
              showDescription={false}
              description={spec.description}
              hoverTooltip={spec.hoverTooltip}
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
              isLight={isLight}
            />
          ))}
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Calibrated visual presets (Atmosphere & FX, Vehicle Global Surfaces, Supersonic Wheel Trail, Driftwoods Stadium, Boost Pad & Multiplayer Name Tag)."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};
