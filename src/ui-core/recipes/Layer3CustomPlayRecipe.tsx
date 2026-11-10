import React from 'react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { UnderConstructionPlaceholder } from '../primitives/UnderConstructionPlaceholder';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useScopedStore } from '../stores/storeSnapshotScope';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3CustomPlayRecipe',
  title: 'Custom Play',
  subtitle: 'Custom Game Modes & Mutator Presets (In Development)',
  description:
    'Custom game modes, mutator presets, and workshop rule builders are currently in development.',
  icon: 'Hammer',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 500,
    height: 400,
    minHeight: 220,
    maxHeight: 960,
    mode: 'adaptive',
  },
};

export interface Layer3CustomPlayRecipeProps extends StandardSurfaceProps {}

const CUSTOM_PLAY_TITLE = 'CUSTOM';
const CUSTOM_PLAY_DESCRIPTION =
  'Custom game modes, mutator presets, and workshop rule builders are currently in development.';

/**
 * [Recipe] Layer 3 Custom Play (In Development)
 * Displays the Hammer + IN DEVELOPMENT placeholder inside a standard Layer 3 PanelContainer.
 * Store-First contract: accepts only the 4 standard shell props (`StandardSurfaceProps`).
 */
export const Layer3CustomPlayRecipe: React.FC<Layer3CustomPlayRecipeProps> = React.memo(({
  isLight = true,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const onBack = propOnBack ?? storeGoBack;
  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels['layer3-custom-play']
  );
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const sizing = storeSizing ?? {
    mode: calibratedSizing.mode === 'fixed' ? 'fixed' : 'auto',
    width: calibratedSizing.width,
    targetHeight: typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 400,
    minHeight: calibratedSizing.minHeight ?? 220,
    maxHeight: calibratedSizing.maxHeight ?? 960,
  };

  return (
    <PanelContainer
      isLight={isLight}
      sizing={sizing}
      className="w-full select-none"
    >
      <PanelHeader
        isLight={isLight}
        title={CUSTOM_PLAY_TITLE}
        onBack={onBack}
      />

      <PanelContent scrollable={false} className="flex flex-col items-center justify-center">
        <UnderConstructionPlaceholder
          isLight={isLight}
          badge="IN DEVELOPMENT"
          title="In Development"
          description={CUSTOM_PLAY_DESCRIPTION}
        />
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription={CUSTOM_PLAY_DESCRIPTION}
      />
    </PanelContainer>
  );
});

Layer3CustomPlayRecipe.displayName = 'Layer3CustomPlayRecipe';
export default Layer3CustomPlayRecipe;
