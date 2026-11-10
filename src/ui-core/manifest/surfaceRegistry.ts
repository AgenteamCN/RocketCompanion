/// <reference types="vite/client" />
import type React from 'react';

import type {
  DiscoveredSurfaceEntry,
  RootCauseClusterRecommendation,
  StandardSurfaceProps,
  SurfaceApprovalRecord,
  SurfaceApprovalStatus,
  SurfaceCalibrationLedger,
  SurfaceCalibrationOverride,
  SurfaceDriftState,
  SurfaceLayerKind,
  SurfaceMenuGroup,
  SurfaceMeta,
  SurfaceSizingMode,
  SurfaceSizingSpec,
  SurfaceTriageBucket,
  SurfaceTriageStatus,
  SurfaceVariantApprovalUnit,
  SurfaceVariantMeta,
  SurfaceVariantTriageStatus,
  UiApprovalLedger,
} from './surfaceMetaTypes';

export type {
  DiscoveredSurfaceEntry,
  RootCauseClusterRecommendation,
  StandardSurfaceProps,
  SurfaceApprovalRecord,
  SurfaceApprovalStatus,
  SurfaceCalibrationLedger,
  SurfaceCalibrationOverride,
  SurfaceDriftState,
  SurfaceLayerKind,
  SurfaceMenuGroup,
  SurfaceMeta,
  SurfaceSizingMode,
  SurfaceSizingSpec,
  SurfaceTriageBucket,
  SurfaceTriageStatus,
  SurfaceVariantApprovalUnit,
  SurfaceVariantMeta,
  SurfaceVariantTriageStatus,
  UiApprovalLedger,
};

import { collectDiscoveredEntries, getDiscoveredFloatingSurfaces, type GlobSurfaceModule } from './floatingSurfaceRegistry';

const recipeSurfaceModules: Record<string, GlobSurfaceModule> = {
  ...import.meta.glob<GlobSurfaceModule>('../recipes/Layer*Recipe.tsx', {
    eager: true,
  }),
  ...import.meta.glob<GlobSurfaceModule>(
    '../recipes/StaticTrainingShotInspectorDrawer.tsx',
    { eager: true }
  ),
};

const DISCOVERED_RECIPE_SURFACES: DiscoveredSurfaceEntry[] =
  collectDiscoveredEntries(recipeSurfaceModules);



/**
 * Returns all menu layer recipe surfaces that declare co-located `export const SURFACE_META`.
 */
export function getDiscoveredRecipeSurfaces(): DiscoveredSurfaceEntry[] {
  return DISCOVERED_RECIPE_SURFACES;
}

/**
 * Filters discovered surfaces by `menuGroup` (e.g. `'active-tuners'`, `'calibrated-presets'`, `'sandboxes'`).
 */
export function getDiscoveredSurfacesByMenuGroup(
  menuGroup: SurfaceMenuGroup
): DiscoveredSurfaceEntry[] {
  return [...getDiscoveredFloatingSurfaces(), ...DISCOVERED_RECIPE_SURFACES].filter(
    (entry) => entry.meta.menuGroup === menuGroup
  );
}
