import React from 'react';

/**
 * Standard 4-Prop Shell Contract for all `Layer*Recipe` and `*FloatingWindow` surfaces.
 *
 * All domain data and mutations flow directly from Zustand stores (or are transparently
 * shadowed inside RCUITuner via `<StoreSnapshotScope overrides={{ ... }}>`).
 */
export interface StandardSurfaceProps {
  isLight?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onBack?: () => void;
}

export type SurfaceLayerKind =
  | 'floating-user'
  | 'floating-dev'
  | 'layer1'
  | 'layer2'
  | 'layer3'
  | 'layer4'
  | 'layer5';

export type SurfaceMenuGroup =
  | 'active-tuners'
  | 'calibrated-presets'
  | 'sandboxes'
  | 'user-floating'
  | 'menu-layer';

export type SurfaceSizingMode = 'fixed' | 'adaptive';

export interface SurfaceSizingSpec {
  width: number;
  height?: number | 'auto';
  minWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  mode?: SurfaceSizingMode;
}

export interface SurfaceVariantMeta {
  variantId: string;
  label: string;
  description?: string;
  entryFile?: string;
  storeOverrides?: Record<string, Record<string, unknown>>;
}

/**
 * Co-located declarative metadata exported by each `*FloatingWindow.tsx` and `Layer*Recipe.tsx`:
 * `export const SURFACE_META: SurfaceMeta = { ... };`
 */
export interface SurfaceMeta {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  layer: SurfaceLayerKind;
  menuGroup?: SurfaceMenuGroup;
  defaultSizing: SurfaceSizingSpec;
  defaultOpen?: boolean;
  variants?: SurfaceVariantMeta[];
}

export interface SurfaceCalibrationOverride extends Partial<SurfaceSizingSpec> {
  defaultConfigOverrides?: Record<string, unknown>;
  calibratedAt?: string;
  calibratedBy?: string;
}

export type SurfaceCalibrationLedger = Record<string, SurfaceCalibrationOverride>;

export type SurfaceApprovalStatus =
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'pending'
  | 'unreviewed';

export type SurfaceDriftState =
  | 'approved'
  | 'unreviewed'
  | 'visual-stale'
  | 'config-stale'
  | 'template-stale'
  | 'rejected'
  | 'deferred';

/**
 * 3-Bucket Triage Classification for Workspace Bravo Rapid Review:
 * - `bucket-1-visual`: `unreviewed` + `visual-stale` + `rejected` (New surface or JSX/visual structure modified)
 * - `bucket-2-config`: `config-stale` (JSX unchanged; sizing or `DEFAULT_*_CONFIG` values changed)
 * - `bucket-3-template`: `template-stale` (Surface untouched; only underlying Alpha 3-stage shell/primitive template changed)
 * - `clean`: `approved` / `deferred` with 0 semantic hash drift
 */
export type SurfaceTriageBucket =
  | 'bucket-1-visual'
  | 'bucket-2-config'
  | 'bucket-3-template'
  | 'clean';

/**
 * Sub-variant / Tab approval unit (`SurfaceVariantUnit`) within a multi-tab or multi-state surface
 * (e.g., `recipe:Layer2SettingsRecipe:gameplay`, `floating:boost-pad-tuner:shader`).
 * Isolates subtree visual AST hashes per tab so modifying 1 tab does not invalidate sibling approved tabs.
 */
export interface SurfaceVariantApprovalUnit {
  unitId: string;
  variantId: string;
  label: string;
  entryFile: string;
  status: SurfaceApprovalStatus;
  visualAstHash: string;
  fileVisualHashes: Record<string, string>;
  alphaDependencies: string[];
  approvedAt: string;
  note?: string;
}

/**
 * 3-Layer Semantic Fingerprint & Approval Record stored in `manifest/uiApprovalLedger.json`.
 *
 * - `templateHash`: Hash of the universal shell template (`Panel.tsx` / `PanelFooter.tsx` / `UniversalThreeStageShell.tsx` / `FloatingWindowInstance.tsx`)
 * - `sizingAndConfigHash`: Hash of resolved sizing + default config (`SURFACE_META` + preset sizing + `DEFAULT_*_CONFIG` + `surfaceCalibrationOverrides.json`)
 * - `visualAstHash`: Combined AST-normalized visual structure hash across the surface entry and its local UI subtree closure
 */
export interface SurfaceApprovalRecord {
  status: SurfaceApprovalStatus;
  surfaceKind: 'floating-window' | 'menu-recipe' | 'showcase-section';
  entryFile: string;
  templateHash: string;
  sizingAndConfigHash: string;
  visualAstHash: string;
  fileVisualHashes: Record<string, string>;
  alphaDeps: string[];
  alphaDependencies: string[];
  variants?: Record<string, SurfaceVariantApprovalUnit>;
  approvedAt: string;
  note?: string;
}

export interface UiApprovalLedger {
  schemaVersion: 1;
  updatedAt: string;
  templateHash: string;
  surfaces: Record<string, SurfaceApprovalRecord>;
}

export interface SurfaceVariantTriageStatus {
  unitId: string;
  variantId: string;
  label: string;
  entryFile: string;
  status: SurfaceApprovalStatus;
  driftState: SurfaceDriftState;
  bucket: SurfaceTriageBucket;
  changedFiles: string[];
  alphaDependencies: string[];
  note?: string;
}

export interface SurfaceTriageStatus {
  surfaceId: string;
  surfaceKind: SurfaceApprovalRecord['surfaceKind'];
  entryFile: string;
  status: SurfaceApprovalStatus;
  driftState: SurfaceDriftState;
  bucket: SurfaceTriageBucket;
  templateDrifted: boolean;
  sizingOrConfigDrifted: boolean;
  visualAstDrifted: boolean;
  changedFiles: string[];
  alphaDependencies: string[];
  variants: SurfaceVariantTriageStatus[];
  note?: string;
}

export interface RootCauseClusterRecommendation {
  targetType: 'alpha-mother-component' | 'bravo-surface-local';
  targetId: string;
  affectedSurfaceIds: string[];
  approvedPeerCount: number;
  rejectedCount: number;
  driftedCount: number;
  recommendation: string;
}

export interface DiscoveredSurfaceEntry {
  meta: SurfaceMeta;
  resolvedSizing: SurfaceSizingSpec;
  Component: React.ComponentType<StandardSurfaceProps>;
  modulePath: string;
}
