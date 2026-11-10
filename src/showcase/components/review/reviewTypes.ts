import type {
  SurfaceApprovalRecord,
  SurfaceApprovalStatus,
  SurfaceCalibrationLedger,
  SurfaceCalibrationOverride,
} from '../../../ui-core/manifest/surfaceMetaTypes';

export type ReviewTriageBucketId =
  | 'bucket-1-visual'
  | 'bucket-2-config'
  | 'bucket-3-template'
  | 'reviewed-healthy';

export type ReviewStaleReason =
  | 'unreviewed'
  | 'visual-stale'
  | 'config-stale'
  | 'template-stale'
  | 'rejected-rework'
  | 'deferred-hold'
  | 'up-to-date';

export interface SurfaceVariantReviewUnit {
  /** Canonical unit key: `${surfaceId}::${variantId}` */
  unitKey: string;
  /** Canonical surface ID in `uiApprovalLedger.json` (e.g. `floating:boost-pad-tuner` or `recipe:Layer2SettingsRecipe`) */
  surfaceId: string;
  /** Variant / sub-tab / state identifier (e.g. `gameplay` or `default`) */
  variantId: string;
  /** Display label for the surface or variant */
  label: string;
  /** Reference code in RCUITuner (e.g. `6A.4` or `6D.D3`) */
  referenceCode: string;
  /** Component name (e.g. `Layer2SettingsRecipe`) */
  componentName: string;
  /** Entry `.tsx` path relative to repo root */
  sourceFile: string;
  /** Optional sub-view `.tsx` path relative to repo root */
  subViewFile?: string;
  /** Effective approval status (merges ledger baseline with runtime triage decisions) */
  status: SurfaceApprovalStatus;
  /** Computed triage bucket */
  bucket: ReviewTriageBucketId;
  /** Fine-grained reason for entering the bucket */
  staleReason: ReviewStaleReason;
  /** Inline review note / comment */
  note: string;
  /** Timestamp of latest decision */
  updatedAt: string;
  /** Changed files detected in subtree closure (if visual-stale) */
  changedSubtreeFiles: string[];
  /** Shared Alpha foundation primitives/compounds/layout/stores referenced by this surface */
  alphaMotherDeps: string[];
  /** Underlying ledger record if present */
  ledgerRecord?: SurfaceApprovalRecord;
}

export interface RuntimeReviewDecision {
  unitKey: string;
  surfaceId: string;
  variantId: string;
  label?: string;
  referenceCode?: string;
  componentName?: string;
  sourceFile?: string;
  subViewFile?: string;
  status: SurfaceApprovalStatus;
  note: string;
  approvalMessage?: string;
  simulatedStaleReason?: ReviewStaleReason;
  updatedAt: string;
}

export interface CalibrationOverrideDiffEntry {
  surfaceId: string;
  override: SurfaceCalibrationOverride;
  changedFields: string[];
  sizingDiff: Partial<SurfaceCalibrationOverride>;
  configDiff: Record<string, { before: unknown; after: unknown }>;
}

export interface StoreDiffEntry {
  key: string;
  scope: 'ui-store' | 'domain-store' | 'page-sync';
  before: unknown;
  after: unknown;
}

export interface TunerExportDiffSnapshot {
  calibrationOverrides: SurfaceCalibrationLedger;
  calibrationDiffs: CalibrationOverrideDiffEntry[];
  storeDiffs: StoreDiffEntry[];
  storeDiffMap: Record<string, { before: unknown; after: unknown }>;
  totalCalibrationSurfaceCount: number;
  totalStoreDiffCount: number;
  hasAnyDiff: boolean;
}

export type ExportRecommendedAction = 'copy-clipboard' | 'download-json';

export interface ExportSizeTierMetrics {
  lineCount: number;
  byteCount: number;
  maxCopyLines: number;
  maxCopyBytes: number;
  recommendedAction: ExportRecommendedAction;
  tierLabel: string;
  formattedBadge: string;
  reason: string;
}

export interface AlphaRootCauseCluster {
  alphaDep: string;
  shortName: string;
  category: 'alpha-shell' | 'alpha-primitive' | 'alpha-compound' | 'alpha-chart' | 'alpha-store-config';
  rejectedUnits: string[];
  approvedUnits: string[];
  totalUnitsUsingDep: number;
  verdict: 'fix-alpha-mother' | 'fix-bravo-surface-locally';
  recommendation: string;
}

export interface ReviewBundleExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  approvalMessage: string;
  summary: {
    totalUnits: number;
    approvedCount: number;
    rejectedCount: number;
    deferredCount: number;
    pendingCount: number;
    bucket1VisualCount: number;
    bucket2ConfigCount: number;
    bucket3TemplateCount: number;
    calibratedSurfaceCount: number;
    storeDiffCount: number;
  };
  rootCauseRecommendations: AlphaRootCauseCluster[];
  decisions: RuntimeReviewDecision[];
  surfaceCalibrationOverrides: SurfaceCalibrationLedger;
  calibrationDiffs: CalibrationOverrideDiffEntry[];
  storeDiffs: StoreDiffEntry[];
  storeDiffMap: Record<string, { before: unknown; after: unknown }>;
  ledgerPatch: {
    updatedAt: string;
    surfaces: Record<
      string,
      {
        status: SurfaceApprovalStatus;
        approvedAt: string;
        note?: string;
      }
    >;
  };
}
