import rawCalibrationOverrides from './surfaceCalibrationOverrides.json';
import rawApprovalLedger from './uiApprovalLedger.json';
import type {
  RootCauseClusterRecommendation,
  SurfaceApprovalRecord,
  SurfaceCalibrationLedger,
  SurfaceCalibrationOverride,
  SurfaceDriftState,
  SurfaceSizingSpec,
  SurfaceTriageBucket,
  SurfaceTriageStatus,
  SurfaceVariantApprovalUnit,
  SurfaceVariantTriageStatus,
  UiApprovalLedger,
} from './surfaceMetaTypes';

export const SURFACE_CALIBRATION_OVERRIDES: SurfaceCalibrationLedger = {
  ...((rawCalibrationOverrides as SurfaceCalibrationLedger) ?? {}),
};

const INITIAL_CALIBRATION_OVERRIDES: SurfaceCalibrationLedger = JSON.parse(
  JSON.stringify(SURFACE_CALIBRATION_OVERRIDES)
);

const calibrationListeners = new Set<() => void>();

export function subscribeSurfaceCalibration(listener: () => void): () => void {
  calibrationListeners.add(listener);
  return () => {
    calibrationListeners.delete(listener);
  };
}

function notifyCalibrationChanged(): void {
  for (const listener of calibrationListeners) {
    listener();
  }
}

export function setRuntimeSurfaceCalibrationOverride(
  surfaceId: string,
  patch: Partial<SurfaceCalibrationOverride>
): SurfaceCalibrationOverride {
  const prev = SURFACE_CALIBRATION_OVERRIDES[surfaceId] ?? {};
  const next: SurfaceCalibrationOverride = {
    ...prev,
    ...patch,
    defaultConfigOverrides:
      patch.defaultConfigOverrides !== undefined
        ? {
            ...(prev.defaultConfigOverrides ?? {}),
            ...patch.defaultConfigOverrides,
          }
        : prev.defaultConfigOverrides,
    calibratedAt: new Date().toISOString().slice(0, 10),
  };
  SURFACE_CALIBRATION_OVERRIDES[surfaceId] = next;
  notifyCalibrationChanged();
  return next;
}

export function resetRuntimeSurfaceCalibrationOverrides(surfaceId?: string): void {
  if (surfaceId) {
    if (INITIAL_CALIBRATION_OVERRIDES[surfaceId]) {
      SURFACE_CALIBRATION_OVERRIDES[surfaceId] = JSON.parse(
        JSON.stringify(INITIAL_CALIBRATION_OVERRIDES[surfaceId])
      );
    } else {
      delete SURFACE_CALIBRATION_OVERRIDES[surfaceId];
    }
  } else {
    for (const key of Object.keys(SURFACE_CALIBRATION_OVERRIDES)) {
      delete SURFACE_CALIBRATION_OVERRIDES[key];
    }
    for (const [key, val] of Object.entries(INITIAL_CALIBRATION_OVERRIDES)) {
      SURFACE_CALIBRATION_OVERRIDES[key] = JSON.parse(JSON.stringify(val));
    }
  }
  notifyCalibrationChanged();
}

export function exportSurfaceCalibrationOverridesJson(): string {
  return JSON.stringify(SURFACE_CALIBRATION_OVERRIDES, null, 2);
}

export const UI_APPROVAL_LEDGER: UiApprovalLedger =
  (rawApprovalLedger as unknown as UiApprovalLedger) ?? {
    schemaVersion: 1,
    updatedAt: '',
    templateHash: '',
    surfaces: {},
  };

/**
 * Returns the RCUITuner calibration override entry for a given surface ID, if any.
 */
export function getSurfaceCalibrationOverride(
  surfaceId: string
): SurfaceCalibrationOverride | undefined {
  return SURFACE_CALIBRATION_OVERRIDES[surfaceId];
}

/**
 * Merges a surface's initial `SURFACE_META.defaultSizing` declaration with any
 * non-intrusive calibration overrides recorded by RCUITuner in
 * `manifest/surfaceCalibrationOverrides.json`.
 */
export function resolveCalibratedSurfaceSizing(
  surfaceId: string,
  defaultSizing: SurfaceSizingSpec
): SurfaceSizingSpec {
  const override = SURFACE_CALIBRATION_OVERRIDES[surfaceId];
  if (!override) {
    return { ...defaultSizing };
  }
  return {
    width: override.width ?? defaultSizing.width,
    height: override.height ?? defaultSizing.height,
    minWidth: override.minWidth ?? defaultSizing.minWidth,
    minHeight: override.minHeight ?? defaultSizing.minHeight,
    maxHeight: override.maxHeight ?? defaultSizing.maxHeight,
    mode: override.mode ?? defaultSizing.mode,
  };
}

/**
 * Merges a surface's initial default config object with any calibrated default config
 * overrides from `manifest/surfaceCalibrationOverrides.json`.
 */
export function resolveCalibratedDefaultConfig<TConfig extends object>(
  surfaceId: string,
  defaultConfig: TConfig
): TConfig {
  const override = SURFACE_CALIBRATION_OVERRIDES[surfaceId]?.defaultConfigOverrides;
  if (!override || typeof override !== 'object') {
    return defaultConfig;
  }
  return {
    ...defaultConfig,
    ...(override as Partial<TConfig>),
  };
}

/**
 * Looks up the 3-layer semantic hash approval record for a surface ID.
 */
export function getSurfaceApprovalRecord(
  surfaceId: string
): SurfaceApprovalRecord | undefined {
  return UI_APPROVAL_LEDGER.surfaces?.[surfaceId];
}

/**
 * Looks up a specific sub-variant / tab approval unit (`SurfaceVariantApprovalUnit`),
 * e.g. `getSurfaceVariantApprovalUnit('recipe:Layer2SettingsRecipe', 'gameplay')`.
 */
export function getSurfaceVariantApprovalUnit(
  surfaceId: string,
  variantId: string
): SurfaceVariantApprovalUnit | undefined {
  return UI_APPROVAL_LEDGER.surfaces?.[surfaceId]?.variants?.[variantId];
}

function classifyBucketAndDriftState(params: {
  status: SurfaceApprovalRecord['status'];
  visualDrifted: boolean;
  configDrifted: boolean;
  templateDrifted: boolean;
}): { driftState: SurfaceDriftState; bucket: SurfaceTriageBucket } {
  const { status, visualDrifted, configDrifted, templateDrifted } = params;
  if (status === 'unreviewed' || status === 'pending') {
    return { driftState: 'unreviewed', bucket: 'bucket-1-visual' };
  }
  if (status === 'rejected') {
    return { driftState: 'rejected', bucket: 'bucket-1-visual' };
  }
  if (visualDrifted) {
    return { driftState: 'visual-stale', bucket: 'bucket-1-visual' };
  }
  if (configDrifted) {
    return { driftState: 'config-stale', bucket: 'bucket-2-config' };
  }
  if (templateDrifted) {
    return { driftState: 'template-stale', bucket: 'bucket-3-template' };
  }
  if (status === 'deferred') {
    return { driftState: 'deferred', bucket: 'clean' };
  }
  return { driftState: 'approved', bucket: 'clean' };
}

/**
 * Evaluates a surface record against an optional runtime hash snapshot and classifies
 * both the surface and its `SurfaceVariantApprovalUnit` sub-tabs into the 3-Bucket Triage queue.
 */
export function evaluateSurfaceTriageStatus(
  surfaceId: string,
  liveSnapshot?: Partial<
    Pick<
      SurfaceApprovalRecord,
      'templateHash' | 'sizingAndConfigHash' | 'visualAstHash' | 'fileVisualHashes'
    >
  >
): SurfaceTriageStatus | undefined {
  const record = getSurfaceApprovalRecord(surfaceId);
  if (!record) return undefined;

  const templateDrifted = Boolean(
    liveSnapshot?.templateHash && liveSnapshot.templateHash !== record.templateHash
  );
  const sizingOrConfigDrifted = Boolean(
    liveSnapshot?.sizingAndConfigHash &&
      liveSnapshot.sizingAndConfigHash !== record.sizingAndConfigHash
  );
  const visualAstDrifted = Boolean(
    liveSnapshot?.visualAstHash && liveSnapshot.visualAstHash !== record.visualAstHash
  );

  const changedFiles: string[] = [];
  if (liveSnapshot?.fileVisualHashes) {
    for (const [fileRel, hash] of Object.entries(liveSnapshot.fileVisualHashes)) {
      if (record.fileVisualHashes?.[fileRel] !== hash) {
        changedFiles.push(fileRel);
      }
    }
  }

  const { driftState, bucket } = classifyBucketAndDriftState({
    status: record.status,
    visualDrifted: visualAstDrifted,
    configDrifted: sizingOrConfigDrifted,
    templateDrifted,
  });

  const variants: SurfaceVariantTriageStatus[] = Object.values(record.variants ?? {}).map(
    (unit) => {
      const unitChangedFiles = changedFiles.filter((f) => f in unit.fileVisualHashes);
      const unitVisualDrifted = unitChangedFiles.length > 0;
      const unitClass = classifyBucketAndDriftState({
        status: unit.status,
        visualDrifted: unitVisualDrifted,
        configDrifted: sizingOrConfigDrifted,
        templateDrifted,
      });
      return {
        unitId: unit.unitId,
        variantId: unit.variantId,
        label: unit.label,
        entryFile: unit.entryFile,
        status: unit.status,
        driftState: unitClass.driftState,
        bucket: unitClass.bucket,
        changedFiles: unitChangedFiles,
        alphaDependencies: unit.alphaDependencies,
        note: unit.note,
      };
    }
  );

  return {
    surfaceId,
    surfaceKind: record.surfaceKind,
    entryFile: record.entryFile,
    status: record.status,
    driftState,
    bucket,
    templateDrifted,
    sizingOrConfigDrifted,
    visualAstDrifted,
    changedFiles,
    alphaDependencies: record.alphaDependencies ?? record.alphaDeps ?? [],
    variants,
    note: record.note,
  };
}

/**
 * Generates Alpha ⇄ Bravo Root-Cause Clustering Recommendations from a set of surface triage statuses.
 *
 * - When >= 2 rejected/stale surfaces share a `Alpha:*` component dependency, recommends inspecting
 *   and fixing the shared Workspace Alpha mother component rather than patching individual Bravo surfaces.
 * - When only 1 surface is rejected and its `Alpha:*` dependencies have healthy approved peers,
 *   recommends local Bravo surface or `surfaceCalibrationOverrides.json` adjustment.
 */
export function buildAlphaBravoRootCauseRecommendations(
  triageList: SurfaceTriageStatus[]
): RootCauseClusterRecommendation[] {
  const alphaStats = new Map<
    string,
    { rejected: string[]; drifted: string[]; approved: string[] }
  >();

  for (const item of triageList) {
    const alphaTokens = item.alphaDependencies.filter((d) => d.startsWith('Alpha:'));
    for (const alphaId of alphaTokens) {
      if (!alphaStats.has(alphaId)) {
        alphaStats.set(alphaId, { rejected: [], drifted: [], approved: [] });
      }
      const bucket = alphaStats.get(alphaId)!;
      if (item.status === 'rejected') {
        bucket.rejected.push(item.surfaceId);
      } else if (item.bucket !== 'clean') {
        bucket.drifted.push(item.surfaceId);
      } else {
        bucket.approved.push(item.surfaceId);
      }
    }
  }

  const recommendations: RootCauseClusterRecommendation[] = [];

  for (const [alphaId, stat] of alphaStats.entries()) {
    if (stat.rejected.length >= 2) {
      recommendations.push({
        targetType: 'alpha-mother-component',
        targetId: alphaId,
        affectedSurfaceIds: stat.rejected,
        approvedPeerCount: stat.approved.length,
        rejectedCount: stat.rejected.length,
        driftedCount: stat.drifted.length,
        recommendation: `Multiple rejected surfaces (${stat.rejected.length}) co-depend on ${alphaId}. Inspect and fix the ${alphaId} mother template in Workspace Alpha first instead of patching individual business surfaces.`,
      });
    }
  }

  for (const item of triageList) {
    if (item.status === 'rejected') {
      const sharedMotherTriggered = recommendations.some(
        (r) =>
          r.targetType === 'alpha-mother-component' &&
          r.affectedSurfaceIds.includes(item.surfaceId)
      );
      if (!sharedMotherTriggered) {
        const alphaTokens = item.alphaDependencies.filter((d) => d.startsWith('Alpha:'));
        const maxApprovedPeers = alphaTokens.reduce(
          (acc, id) => Math.max(acc, alphaStats.get(id)?.approved.length ?? 0),
          0
        );
        recommendations.push({
          targetType: 'bravo-surface-local',
          targetId: item.surfaceId,
          affectedSurfaceIds: [item.surfaceId],
          approvedPeerCount: maxApprovedPeers,
          rejectedCount: 1,
          driftedCount: item.bucket !== 'clean' ? 1 : 0,
          recommendation: `Underlying Alpha mother components are healthy (${maxApprovedPeers} approved peer surfaces). Apply local fix to ${item.entryFile} or update surfaceCalibrationOverrides.json for ${item.surfaceId}.`,
        });
      }
    }
  }

  return recommendations;
}
