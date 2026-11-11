import {
  SURFACE_CALIBRATION_OVERRIDES,
  UI_APPROVAL_LEDGER,
} from '../../../ui-core/manifest/surfaceCalibration';
import type {
  SurfaceApprovalRecord,
  SurfaceApprovalStatus,
} from '../../../ui-core/manifest/surfaceMetaTypes';
import {
  resolveRouteAuditInfo,
  resolveUnifiedPlaylistByScope,
  type UnifiedPlaylistScope,
} from '../../pages/menu-layer/menuLayerLinearPlaylists';
import {
  computeLiveSubtreeCombinedHash,
  detectChangedSubtreeFiles,
} from './liveSubtreeHashScanner';
import type {
  ReviewStaleReason,
  ReviewTriageBucketId,
  RuntimeReviewDecision,
  SurfaceVariantReviewUnit,
} from './reviewTypes';

/**
 * Resolves the canonical `uiApprovalLedger.json` surface ID from a component name,
 * source file path, or raw state ID.
 */
export function resolveCanonicalSurfaceId(params: {
  sourceFile?: string;
  componentName?: string;
  stateId?: string;
}): string {
  const { sourceFile = '', componentName = '', stateId = '' } = params;

  const fileStem = sourceFile
    .split('/')
    .pop()
    ?.replace(/\.(tsx|ts)$/, '');

  const candidateStem = fileStem || componentName;

  if (
    candidateStem === 'MenuLayerStageCanvas' ||
    candidateStem === 'StaticTrainingPackHUD' ||
    stateId === 'user-l0' ||
    stateId === 'user-l0-edge-inspector'
  ) {
    return 'recipe:StaticTrainingShotInspectorDrawer';
  }

  if (candidateStem.endsWith('FloatingWindow')) {
    const base = candidateStem.replace(/FloatingWindow$/, '');
    const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return `floating:${kebab}`;
  }

  if (candidateStem.endsWith('Recipe') || candidateStem.endsWith('Drawer')) {
    return `recipe:${candidateStem}`;
  }

  const rawPrefix = stateId.split(':')[0];
  if (rawPrefix && UI_APPROVAL_LEDGER.surfaces[`floating:${rawPrefix}`]) {
    return `floating:${rawPrefix}`;
  }
  if (rawPrefix && UI_APPROVAL_LEDGER.surfaces[`recipe:${rawPrefix}`]) {
    return `recipe:${rawPrefix}`;
  }

  return candidateStem || stateId || 'unknown-surface';
}

export function buildUnitKey(surfaceId: string, variantId: string = 'default'): string {
  const cleanVariant = variantId.trim() || 'default';
  return `${surfaceId}::${cleanVariant}`;
}

export function findUnitIndexByKeyOrSurface(
  list: readonly SurfaceVariantReviewUnit[],
  targetKey: string
): number {
  const exactIdx = list.findIndex((u) => u.unitKey === targetKey);
  if (exactIdx >= 0) return exactIdx;
  const targetSurfaceId = targetKey.split('::')[0];
  return list.findIndex((u) => u.surfaceId === targetSurfaceId);
}

/**
 * Extracts all shared Workspace Alpha foundation dependencies (Shells, Primitives,
 * Compounds, Charts, Tokens, Stores/Configs) for a surface record so Alpha <-> Bravo
 * root-cause attribution can cluster shared components across surfaces.
 */
export function extractAlphaMotherDeps(record?: SurfaceApprovalRecord): string[] {
  if (!record) return ['src/ui-core/layout/UniversalThreeStageShell.tsx'];
  const deps = new Set<string>(['src/ui-core/layout/UniversalThreeStageShell.tsx']);

  for (const fileRel of Object.keys(record.fileVisualHashes || {})) {
    if (
      fileRel.startsWith('src/ui-core/primitives/') ||
      fileRel.startsWith('src/ui-core/compounds/') ||
      fileRel.startsWith('src/ui-core/charts/') ||
      fileRel.startsWith('src/ui-core/layout/')
    ) {
      deps.add(fileRel);
    }
  }

  for (const alphaDep of record.alphaDeps || []) {
    deps.add(alphaDep);
  }

  return Array.from(deps).sort();
}

export function classifySurfaceBucket(params: {
  surfaceId: string;
  variantId?: string;
  sourceFile?: string;
  ledgerRecord?: SurfaceApprovalRecord;
  runtimeDecision?: RuntimeReviewDecision;
  globalTemplateStaleOverride?: boolean;
}): {
  status: SurfaceApprovalStatus;
  bucket: ReviewTriageBucketId;
  staleReason: ReviewStaleReason;
  changedSubtreeFiles: string[];
} {
  const {
    surfaceId,
    variantId = 'default',
    sourceFile,
    ledgerRecord,
    runtimeDecision,
    globalTemplateStaleOverride,
  } = params;

  const variantRecord =
    variantId !== 'default' ? ledgerRecord?.variants?.[variantId] : undefined;
  const recordedHashes =
    variantRecord?.fileVisualHashes ?? ledgerRecord?.fileVisualHashes;
  const changedSubtreeFiles = detectChangedSubtreeFiles(recordedHashes);
  const liveVisualHash = computeLiveSubtreeCombinedHash(
    recordedHashes,
    sourceFile ?? variantRecord?.entryFile ?? ledgerRecord?.entryFile
  );

  const isRuntimeDecisionStale = Boolean(
    runtimeDecision &&
      runtimeDecision.status === 'approved' &&
      ((runtimeDecision.visualHashSnapshot &&
        runtimeDecision.visualHashSnapshot !== liveVisualHash) ||
        (!runtimeDecision.visualHashSnapshot && changedSubtreeFiles.length > 0))
  );

  const isLedgerApprovalStale = Boolean(
    !runtimeDecision &&
      (variantRecord?.status === 'approved' || ledgerRecord?.status === 'approved') &&
      changedSubtreeFiles.length > 0
  );

  const rawStatus: SurfaceApprovalStatus =
    runtimeDecision?.status ??
    variantRecord?.status ??
    ledgerRecord?.status ??
    'deferred';

  const status: SurfaceApprovalStatus =
    isRuntimeDecisionStale || isLedgerApprovalStale ? 'deferred' : rawStatus;

  if (runtimeDecision?.simulatedStaleReason) {
    const sim = runtimeDecision.simulatedStaleReason;
    if (sim === 'unreviewed' || sim === 'visual-stale' || sim === 'rejected-rework') {
      return { status, bucket: 'bucket-1-visual', staleReason: sim, changedSubtreeFiles };
    }
    if (sim === 'config-stale') {
      return {
        status,
        bucket: 'bucket-2-config',
        staleReason: 'config-stale',
        changedSubtreeFiles,
      };
    }
    if (sim === 'template-stale') {
      return {
        status,
        bucket: 'bucket-3-template',
        staleReason: 'template-stale',
        changedSubtreeFiles,
      };
    }
  }

  if (!ledgerRecord) {
    return {
      status: status === 'approved' ? 'approved' : 'deferred',
      bucket: status === 'approved' ? 'reviewed-healthy' : 'bucket-2-config',
      staleReason: status === 'approved' ? 'up-to-date' : 'deferred-hold',
      changedSubtreeFiles,
    };
  }

  if (status === 'rejected') {
    return {
      status,
      bucket: 'bucket-1-visual',
      staleReason: 'rejected-rework',
      changedSubtreeFiles,
    };
  }

  if (status === 'pending' || status === 'unreviewed') {
    return {
      status: 'deferred',
      bucket: 'bucket-2-config',
      staleReason: 'deferred-hold',
      changedSubtreeFiles,
    };
  }

  if (status === 'deferred') {
    return {
      status,
      bucket: changedSubtreeFiles.length > 0 ? 'bucket-1-visual' : 'bucket-2-config',
      staleReason: changedSubtreeFiles.length > 0 ? 'visual-stale' : 'deferred-hold',
      changedSubtreeFiles,
    };
  }

  // Check template hash drift or Workspace Alpha live shell preview override
  if (
    globalTemplateStaleOverride ||
    (UI_APPROVAL_LEDGER.templateHash &&
      ledgerRecord.templateHash !== UI_APPROVAL_LEDGER.templateHash)
  ) {
    return {
      status,
      bucket: 'bucket-3-template',
      staleReason: 'template-stale',
      changedSubtreeFiles,
    };
  }

  // Check if calibration overrides exist for this surface
  if (SURFACE_CALIBRATION_OVERRIDES[surfaceId]) {
    return {
      status,
      bucket: 'bucket-2-config',
      staleReason: 'config-stale',
      changedSubtreeFiles,
    };
  }

  return {
    status,
    bucket: 'reviewed-healthy',
    staleReason: 'up-to-date',
    changedSubtreeFiles,
  };
}

/**
 * Builds the Unified Approval Playlist review queue in strict 1:1 sequential order
 * (`#1..#N`) matching `MenuLayerScannerAndAuditSection` (`All` / `User` / `Dev` scope),
 * merged with `uiApprovalLedger.json` records and runtime reviewer decisions.
 */
export function buildAllReviewUnits(params: {
  decisionsMap: Record<string, RuntimeReviewDecision>;
  registeredUnitsMap: Record<
    string,
    Omit<SurfaceVariantReviewUnit, 'status' | 'bucket' | 'staleReason' | 'note' | 'updatedAt'>
  >;
  globalTemplateStaleOverride?: boolean;
  activeUnitKey?: string;
  playlistScope?: UnifiedPlaylistScope;
}): SurfaceVariantReviewUnit[] {
  const {
    decisionsMap,
    registeredUnitsMap,
    globalTemplateStaleOverride,
    playlistScope = 'all',
  } = params;

  const playlist = resolveUnifiedPlaylistByScope(playlistScope);
  const units: SurfaceVariantReviewUnit[] = [];

  for (const step of playlist) {
    const auditInfo = resolveRouteAuditInfo(
      step.route,
      step.tier,
      step.contextMode,
      step
    );
    const { surfaceId, variantId } = auditInfo;
    const unitKey = buildUnitKey(surfaceId, variantId);
    const defaultKey = buildUnitKey(surfaceId, 'default');
    const record = UI_APPROVAL_LEDGER.surfaces[surfaceId];
    const reg = registeredUnitsMap[unitKey];
    const decision = decisionsMap[unitKey] ?? decisionsMap[defaultKey];
    const resolvedSourceFile =
      reg?.sourceFile || decision?.sourceFile || auditInfo.sourceFile;

    const { status, bucket, staleReason, changedSubtreeFiles } = classifySurfaceBucket({
      surfaceId,
      variantId,
      sourceFile: resolvedSourceFile,
      ledgerRecord: record,
      runtimeDecision: decision,
      globalTemplateStaleOverride,
    });

    units.push({
      unitKey,
      surfaceId,
      variantId,
      label: step.label || reg?.label || decision?.label || auditInfo.componentName,
      referenceCode: reg?.referenceCode || decision?.referenceCode || auditInfo.referenceCode,
      componentName: reg?.componentName || decision?.componentName || auditInfo.componentName,
      sourceFile: resolvedSourceFile,
      subViewFile: reg?.subViewFile || decision?.subViewFile,
      status,
      bucket,
      staleReason,
      note: decision?.note ?? record?.note ?? '',
      updatedAt: decision?.updatedAt ?? record?.approvedAt ?? '',
      changedSubtreeFiles:
        changedSubtreeFiles.length > 0
          ? changedSubtreeFiles
          : reg?.changedSubtreeFiles ?? [],
      alphaMotherDeps: reg?.alphaMotherDeps ?? extractAlphaMotherDeps(record),
      ledgerRecord: record,
    });
  }

  return units;
}

/**
 * Selects up to 3 representative `template-stale` surfaces (Simplest / Medium / Most Dense
 * by visual subtree file count) for 1-click spot-check before Batch Approving Bucket 3.
 */
export function pickRepresentativeTemplateStaleSamples(
  units: SurfaceVariantReviewUnit[]
): SurfaceVariantReviewUnit[] {
  const seenSurfaces = new Set<string>();
  const templateUnits = units.filter((u) => {
    if (u.bucket !== 'bucket-3-template') return false;
    if (seenSurfaces.has(u.surfaceId)) return false;
    seenSurfaces.add(u.surfaceId);
    return true;
  });
  if (templateUnits.length <= 3) return templateUnits;

  const sortedByDensity = [...templateUnits].sort((a, b) => {
    const countA = Object.keys(a.ledgerRecord?.fileVisualHashes || {}).length;
    const countB = Object.keys(b.ledgerRecord?.fileVisualHashes || {}).length;
    return countA - countB;
  });

  const simplest = sortedByDensity[0];
  const median = sortedByDensity[Math.floor(sortedByDensity.length / 2)];
  const densest = sortedByDensity[sortedByDensity.length - 1];

  return [simplest, median, densest];
}

