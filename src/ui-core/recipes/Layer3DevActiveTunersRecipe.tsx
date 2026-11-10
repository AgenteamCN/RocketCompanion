import React, { useMemo, useState } from 'react';
import { Box, Info } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { FloatingWindowCard } from './settings/components/FloatingWindowCard';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  ACTIVE_TUNER_SPECS,
  resolveBadgeClasses,
  resolveMenuGroupLauncherSpecs,
} from './dev/devHubSurfaceCatalog';
import {
  DevActiveTunersInlineControlsSection,
  type BoostPhaseSelectionState,
} from './dev/DevActiveTunersInlineControlsSection';

export type { BoostPhaseSelectionState };
export type Layer3DevActiveTunersRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-dev-active-tuners',
  title: 'ACTIVE TUNERS',
  subtitle: 'Developer Active Tuners & Phase Matrix',
  description:
    'Active tuners under calibration (Atmosphere, Vehicle, Kickoff, Audio & Diagnostics).',
  icon: 'sliders',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-dev-active-tuners'].width,
    height: DEFAULT_PANEL_SIZING['layer3-dev-active-tuners'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-dev-active-tuners'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-dev-active-tuners'].maxHeight,
  },
};

/**
 * [Recipe] Layer 3 Active Tuners (Developer Tier)
 * Data-driven `menuGroup === 'active-tuners'` floating launcher list + inline Store-First calibration controls.
 */
export const Layer3DevActiveTunersRecipe: React.FC<Layer3DevActiveTunersRecipeProps> = ({
  isLight = false,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const showAllCarHitboxes = useScopedStore('appStore', useAppStore, (s) =>
    Boolean(s.gameplay?.showAllCarHitboxes)
  );
  const updateGameplay = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateGameplay
  );
  const onBack = propOnBack ?? storeGoBack;

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const sizing = useMenuLayoutStore(
    (s) =>
      s.panels?.['layer3-dev-active-tuners'] ??
      DEFAULT_PANEL_SIZING['layer3-dev-active-tuners']
  );
  const { rowGap } = useSettingActionRowStore();

  const resolvedSpecs = useMemo(
    () => resolveMenuGroupLauncherSpecs('active-tuners', ACTIVE_TUNER_SPECS),
    []
  );
  const primarySpecs = resolvedSpecs.filter((s) => s.section !== 'diagnostics');
  const diagnosticSpecs = resolvedSpecs.filter((s) => s.section === 'diagnostics');

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader title="ACTIVE TUNERS" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <div
          data-layout="active-tuners-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {primarySpecs.map((spec) => (
            <React.Fragment key={spec.id}>
              <FloatingWindowCard
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
              {spec.id === 'vehicle-model-offset-tuner' && (
                <SettingToggleRow
                  icon={Box}
                  iconName="box"
                  iconColor="text-emerald-400"
                  title="Show All Car Hitboxes"
                  description="Developer override to render 3D OBB collision wireframes on all vehicles in the arena"
                  checked={showAllCarHitboxes}
                  onChange={(visible) => updateGameplay({ showAllCarHitboxes: visible })}
                  bordered={false}
                  showDescription={false}
                  hoverDescription="Show All Car Hitboxes: Developer override that renders 3D oriented bounding box (OBB) collision wireframes on every vehicle in the arena regardless of POV."
                  onHover={(desc) => desc && setHoveredDesc(desc)}
                  onLeave={() => setHoveredDesc(null)}
                  isLight={isLight}
                />
              )}
            </React.Fragment>
          ))}

          <DevActiveTunersInlineControlsSection
            isLight={isLight}
            onHover={setHoveredDesc}
          />

          {diagnosticSpecs.map((spec) => (
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
        defaultDescription="Active tuners under calibration (Atmosphere, Vehicle, Kickoff, Audio & Diagnostics)."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};
