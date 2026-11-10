import React, { Suspense, lazy } from 'react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';
import { LocalPanelSizingTuner } from './LocalPanelSizingTuner';
import { MultiStateRecipeShootoutStage } from './MultiStateRecipeShootoutStage';
import {
  LAYER2_GARAGE_STATES,
  LAYER2_SETTINGS_STATES,
} from './recipeStateMatrixSpecs';

const Layer2PlayRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer2PlayRecipe').then((m) => ({
    default: m.Layer2PlayRecipe,
  }))
);
const Layer2SettingsRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer2SettingsRecipe').then((m) => ({
    default: m.Layer2SettingsRecipe,
  }))
);
const Layer2GarageRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer2GarageRecipe').then((m) => ({
    default: m.Layer2GarageRecipe,
  }))
);

const noop = () => {};

export function renderLayer2RecipeStage(
  itemId: string,
  isLight: boolean,
  previewWrapClass: string,
  suspenseFallback: React.ReactNode
): React.ReactNode | null {
  switch (itemId) {
    case 'recipe-6a-2-play':
      return (
        <div id="recipe-6a-2-play" className="scroll-mt-6 flex flex-col gap-4">
          <div className={previewWrapClass}>
            <Suspense fallback={suspenseFallback}>
              <Layer2PlayRecipe isLight={isLight} onBack={noop} />
            </Suspense>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-mono font-bold text-xs">
              6A.2
            </span>
            <h2 className="text-base font-bold">
              Layer 2 Game mode selection panel menu (Play · Single view grid recommendation Auto-Fit)
            </h2>
          </div>
          <LocalPanelSizingTuner
            code="6A.2"
            panelId="layer2-play"
            label="Layer 2 Play Mode Selection"
            recommendation="recommended Auto-Fit: No Inner Tab Toggle, Auto-fit Height 2×3 Mode Card"
            isLight={isLight}
          />
        </div>
      );
    case 'recipe-6a-3-garage':
      return (
        <div id="recipe-6a-3-garage" className="scroll-mt-6 flex flex-col gap-4">
          <div className={previewWrapClass}>
            <Suspense fallback={suspenseFallback}>
              <MultiStateRecipeShootoutStage
                referenceCode="6A.3"
                states={LAYER2_GARAGE_STATES}
                badgeColor="amber"
                isLight={isLight}
                renderStateCard={(st) => (
                  <Layer2GarageRecipe isLight={isLight} activeTab={st.props.activeTab} onBack={noop} />
                )}
              />
            </Suspense>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 flex items-center justify-center font-mono font-bold text-xs">
                6A.3
              </span>
              <h2 className="text-base font-bold">
                Layer 2 Garage Loadout (5-Tab Audit Matrix &amp; Single Stage · Car / Paint / Loadout / Anthem / Sync)
              </h2>
            </div>
            <Badge variant="amber" size="sm" isLight={isLight}>
              5-Tab Matrix ⇄ Single Stage · CSS Grid 0px Jump Locked
            </Badge>
          </div>
          <LocalPanelSizingTuner
            code="6A.3"
            panelId="layer2-garage"
            label="Layer 2 Garage Loadout Config"
            recommendation="5-Tab Matrix or Single Stage: Renders Car, Paint, Loadout, Anthem, and Sync tabs with locked envelope height."
            isLight={isLight}
          />
        </div>
      );
    case 'recipe-6a-4-settings':
    case 'recipe-6a-5-settings-preview':
      return (
        <div id={itemId} className="scroll-mt-6 flex flex-col gap-4">
          <div id="recipe-6a-5-settings-preview" className={previewWrapClass}>
            <Suspense fallback={suspenseFallback}>
              <MultiStateRecipeShootoutStage
                referenceCode="6A.4"
                states={LAYER2_SETTINGS_STATES}
                badgeColor="indigo"
                isLight={isLight}
                renderStateCard={(st) => (
                  <StoreSnapshotScope
                    overrides={{
                      appStore: {
                        settingsTargetTab: st.props.activeTab,
                        developerMode: true,
                      },
                    }}
                  >
                    <Layer2SettingsRecipe
                      isLight={isLight}
                      activeTab={st.props.activeTab}
                      onBack={noop}
                    />
                  </StoreSnapshotScope>
                )}
              />
            </Suspense>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-mono font-bold text-xs">
                {itemId === 'recipe-6a-5-settings-preview' ? '6A.5' : '6A.4'}
              </span>
              <h2 className="text-base font-bold">
                Layer 2 System Settings (5-Tab Audit Matrix &amp; Single Stage · Gameplay / Audio / Display / Advanced / Developer)
              </h2>
            </div>
            <Badge variant="neutral" size="sm" isLight={isLight}>
              5-Tab Matrix ⇄ Single Stage · CSS Grid 0px Jump Locked
            </Badge>
          </div>
          <LocalPanelSizingTuner
            code="6A.4"
            panelId="layer2-settings"
            label="Layer 2 System Settings"
            recommendation="5-Tab Matrix or Single Stage: Renders Gameplay, Audio, Display, Advanced, and Developer tabs with locked envelope height."
            isLight={isLight}
          />
        </div>
      );
    default:
      return null;
  }
}
