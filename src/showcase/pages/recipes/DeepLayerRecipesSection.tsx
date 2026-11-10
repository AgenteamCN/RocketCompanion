import React, { Suspense, lazy } from 'react';
import { LocalPanelSizingTuner } from './LocalPanelSizingTuner';
import {
  DEEP_LAYER_ONLINE_AND_USER_RECIPE_SPECS,
  type DeepLayerRecipeSpec,
} from './deepLayerOnlineRecipeSpecs';
import { DEEP_LAYER_DEV_AND_L4_RECIPE_SPECS } from './deepLayerDevAndL4RecipeSpecs';

const CameraSettingsStyleTuner = lazy(() =>
  import('./CameraSettingsStyleTuner').then((m) => ({
    default: m.CameraSettingsStyleTuner,
  }))
);

export const DEEP_LAYER_RECIPE_SPECS: DeepLayerRecipeSpec[] = [
  ...DEEP_LAYER_ONLINE_AND_USER_RECIPE_SPECS,
  ...DEEP_LAYER_DEV_AND_L4_RECIPE_SPECS,
];
const BADGE_COLOR_CLASS: Record<DeepLayerRecipeSpec['badgeColor'], string> = {
  emerald: 'bg-emerald-500/20 text-emerald-500',
  amber: 'bg-amber-500/20 text-amber-500',
  sky: 'bg-sky-500/20 text-sky-500',
};

export const SingleDeepLayerRecipeCard = React.memo<{
  spec: DeepLayerRecipeSpec;
  isLight: boolean;
}>(({ spec, isLight }) => {
  const cardClass = `flex justify-center p-6 rounded-2xl border transition-colors ${
    isLight
      ? 'bg-neutral-50/70 border-neutral-200/80 shadow-2xs'
      : 'border-neutral-800 bg-neutral-950/60'
  }`;

  return (
    <div id={spec.id} className="scroll-mt-6 flex flex-col gap-3">
      {/* 1. TOP-PINNED VIEW BOX STAGE (Directly at the top so nothing above it ever changes) */}
      <div className={cardClass}>
        <Suspense
          fallback={
            <div className="py-12 text-xs font-mono text-neutral-400">
              Loading on Demand [{spec.code}] Menu Module...
            </div>
          }
        >
          {spec.renderPreview(isLight)}
        </Suspense>
      </div>

      {/* 2. MODULE HEADER & TUNERS (Placed BELOW the View Box) */}
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded-md ${BADGE_COLOR_CLASS[spec.badgeColor]} flex items-center justify-center font-mono font-bold text-xs`}
        >
          {spec.code}
        </span>
        <h2 className="text-base font-bold">{spec.title}</h2>
      </div>
      <LocalPanelSizingTuner
        code={spec.code}
        panelId={spec.panelId}
        label={spec.tunerLabel}
        recommendation={spec.recommendation}
        isLight={isLight}
      />
      {spec.id === 'recipe-6a-12-camera' && (
        <Suspense fallback={null}>
          <CameraSettingsStyleTuner
            isLight={isLight}
            codeBadge="6A.12M"
            showStandalonePreview={false}
          />
        </Suspense>
      )}
    </div>
  );
});

SingleDeepLayerRecipeCard.displayName = 'SingleDeepLayerRecipeCard';

export interface DeepLayerRecipesSectionProps {
  isLight: boolean;
  /** Optional target recipe ID; when provided, only that recipe is mounted on-demand */
  activeRecipeId?: string;
}

export const DeepLayerRecipesSection = React.memo<DeepLayerRecipesSectionProps>(
  ({ isLight, activeRecipeId }) => {
    const specsToRender = React.useMemo(() => {
      if (!activeRecipeId) return DEEP_LAYER_RECIPE_SPECS;
      return DEEP_LAYER_RECIPE_SPECS.filter(
        (s) => s.id === activeRecipeId || s.code === activeRecipeId
      );
    }, [activeRecipeId]);

    if (specsToRender.length === 0) return null;

    return (
      <div className="flex flex-col gap-10">
        {specsToRender.map((spec) => (
          <SingleDeepLayerRecipeCard key={spec.id} spec={spec} isLight={isLight} />
        ))}
      </div>
    );
  }
);

DeepLayerRecipesSection.displayName = 'DeepLayerRecipesSection';
