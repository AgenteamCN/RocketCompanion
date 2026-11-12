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
import { stripInjectedDiffSuffixFromNote } from './exportDiffAndSizeTiering';
import {
  computeLiveSubtreeCombinedHash,
  detectChangedSubtreeFiles,
} from './liveSubtreeHashScanner';
import type {
  ReviewQueueFilterId,
  ReviewStaleReason,
  ReviewTriageBucketId,
  RuntimeReviewDecision,
  SurfaceVariantReviewUnit,
} from './reviewTypes';
import type { SurfaceVariantApprovalUnit } from '../../../ui-core/manifest/surfaceMetaTypes';

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

export function resolveLedgerVariantRecord(
  ledgerRecord: SurfaceApprovalRecord | undefined,
  variantId: string
): SurfaceVariantApprovalUnit | undefined {
  if (!ledgerRecord?.variants || variantId === 'default') return undefined;
  if (ledgerRecord.variants[variantId]) return ledgerRecord.variants[variantId];
  const stripped = variantId
    .replace(/^(?:user|dev)-l\d+-(?:garage|settings|main-menu)-/, '')
    .replace(/^(?:user|dev)-l1-/, '');
  return ledgerRecord.variants[stripped];
}

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

export function filterReviewUnitsByQueueFilter(
  units: readonly SurfaceVariantReviewUnit[],
  filter: ReviewQueueFilterId
): SurfaceVariantReviewUnit[] {
  if (filter === 'all') return [...units];
  if (filter === 'rejected-only') {
    return units.filter((u) => u.status === 'rejected');
  }
  if (filter === 'bucket-1-visual') {
    return units.filter((u) => u.status === 'pending' || u.changedSubtreeFiles.length > 0);
  }
  if (filter === 'bucket-2-config') {
    return units.filter((u) => u.status === 'deferred' && u.changedSubtreeFiles.length === 0);
  }
  if (filter === 'reviewed-healthy') {
    return units.filter((u) => u.status === 'approved');
  }
  return units.filter((u) => u.bucket === filter);
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
  effectiveDecision?: RuntimeReviewDecision;
} {
  const {
    surfaceId,
    variantId = 'default',
    sourceFile,
    ledgerRecord,
    runtimeDecision,
    globalTemplateStaleOverride,
  } = params;

  const variantRecord = resolveLedgerVariantRecord(ledgerRecord, variantId);
  const recordedHashes = variantRecord?.fileVisualHashes ?? ledgerRecord?.fileVisualHashes;
  const changedSubtreeFiles = detectChangedSubtreeFiles(recordedHashes);
  const liveVisualHash = computeLiveSubtreeCombinedHash(
    recordedHashes,
    sourceFile ?? variantRecord?.entryFile ?? ledgerRecord?.entryFile
  );

  const ledgerTimestamp = variantRecord?.approvedAt ?? ledgerRecord?.approvedAt ?? '';
  const isDecisionSupersededByLedger = Boolean(
    runtimeDecision &&
    ledgerTimestamp &&
    runtimeDecision.updatedAt &&
    ledgerTimestamp > runtimeDecision.updatedAt
  );
  const isDecisionSupersededByLiveCode = Boolean(
    runtimeDecision &&
    runtimeDecision.visualHashSnapshot &&
    runtimeDecision.visualHashSnapshot !== liveVisualHash
  );

  const effectiveDecision =
    isDecisionSupersededByLedger || isDecisionSupersededByLiveCode ? undefined : runtimeDecision;

  const ledgerEffectiveStatus = variantRecord?.status ?? ledgerRecord?.status;
  const isLedgerApprovalStale = Boolean(
    !effectiveDecision &&
    (ledgerEffectiveStatus === 'approved' || ledgerEffectiveStatus === 'rejected') &&
    changedSubtreeFiles.length > 0
  );

  const rawStatus: SurfaceApprovalStatus =
    effectiveDecision?.status ?? variantRecord?.status ?? ledgerRecord?.status ?? 'deferred';

  const status: SurfaceApprovalStatus =
    isDecisionSupersededByLiveCode || isLedgerApprovalStale
      ? 'pending'
      : rawStatus === 'unreviewed'
        ? 'deferred'
        : rawStatus;

  if (effectiveDecision?.simulatedStaleReason) {
    const sim = effectiveDecision.simulatedStaleReason;
    if (sim === 'unreviewed' || sim === 'visual-stale' || sim === 'rejected-rework') {
      return {
        status,
        bucket: 'bucket-1-visual',
        staleReason: sim,
        changedSubtreeFiles,
        effectiveDecision,
      };
    }
    if (sim === 'config-stale') {
      return {
        status,
        bucket: 'bucket-2-config',
        staleReason: 'config-stale',
        changedSubtreeFiles,
        effectiveDecision,
      };
    }
    if (sim === 'template-stale') {
      return {
        status,
        bucket: 'bucket-3-template',
        staleReason: 'template-stale',
        changedSubtreeFiles,
        effectiveDecision,
      };
    }
  }

  if (!ledgerRecord) {
    return {
      status: status === 'approved' ? 'approved' : 'deferred',
      bucket: status === 'approved' ? 'reviewed-healthy' : 'bucket-2-config',
      staleReason: status === 'approved' ? 'up-to-date' : 'deferred-hold',
      changedSubtreeFiles,
      effectiveDecision,
    };
  }

  if (status === 'rejected') {
    return {
      status,
      bucket: 'bucket-1-visual',
      staleReason: 'rejected-rework',
      changedSubtreeFiles,
      effectiveDecision,
    };
  }

  if (status === 'pending' || changedSubtreeFiles.length > 0) {
    return {
      status: status === 'approved' ? 'approved' : 'pending',
      bucket: 'bucket-1-visual',
      staleReason: 'visual-stale',
      changedSubtreeFiles,
      effectiveDecision,
    };
  }

  if (status === 'deferred') {
    return {
      status: 'deferred',
      bucket: 'bucket-2-config',
      staleReason: 'deferred-hold',
      changedSubtreeFiles,
      effectiveDecision,
    };
  }

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
      effectiveDecision,
    };
  }

  if (SURFACE_CALIBRATION_OVERRIDES[surfaceId]) {
    return {
      status,
      bucket: 'bucket-2-config',
      staleReason: 'config-stale',
      changedSubtreeFiles,
      effectiveDecision,
    };
  }

  return {
    status,
    bucket: 'reviewed-healthy',
    staleReason: 'up-to-date',
    changedSubtreeFiles,
    effectiveDecision,
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
    Omit<
      SurfaceVariantReviewUnit,
      'playlistIndex' | 'status' | 'bucket' | 'staleReason' | 'note' | 'updatedAt'
    >
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

  for (let i = 0; i < playlist.length; i++) {
    const step = playlist[i];
    const auditInfo = resolveRouteAuditInfo(step.route, step.tier, step.contextMode, step);
    const { surfaceId, variantId } = auditInfo;
    const unitKey = buildUnitKey(surfaceId, variantId);
    const defaultKey = buildUnitKey(surfaceId, 'default');
    const record = UI_APPROVAL_LEDGER.surfaces[surfaceId];
    const variantRecord = resolveLedgerVariantRecord(record, variantId);
    const reg = registeredUnitsMap[unitKey];
    const rawDecision =
      decisionsMap[unitKey] ?? (variantId === 'default' ? decisionsMap[defaultKey] : undefined);
    const resolvedSourceFile = reg?.sourceFile || rawDecision?.sourceFile || auditInfo.sourceFile;

    const { status, bucket, staleReason, changedSubtreeFiles, effectiveDecision } =
      classifySurfaceBucket({
        surfaceId,
        variantId,
        sourceFile: resolvedSourceFile,
        ledgerRecord: record,
        runtimeDecision: rawDecision,
        globalTemplateStaleOverride,
      });

    const ledgerNote =
      variantRecord?.note ??
      (variantId === 'default' || !record?.variants ? record?.note : undefined) ??
      '';
    const rawNote = effectiveDecision?.note ?? ledgerNote;

    units.push({
      playlistIndex: i + 1,
      unitKey,
      surfaceId,
      variantId,
      label: step.label || reg?.label || effectiveDecision?.label || auditInfo.componentName,
      referenceCode:
        reg?.referenceCode || effectiveDecision?.referenceCode || auditInfo.referenceCode,
      componentName:
        reg?.componentName || effectiveDecision?.componentName || auditInfo.componentName,
      sourceFile: resolvedSourceFile,
      subViewFile: reg?.subViewFile || effectiveDecision?.subViewFile,
      status,
      bucket,
      staleReason,
      note: stripInjectedDiffSuffixFromNote(rawNote),
      updatedAt:
        effectiveDecision?.updatedAt ?? variantRecord?.approvedAt ?? record?.approvedAt ?? '',
      changedSubtreeFiles:
        changedSubtreeFiles.length > 0 ? changedSubtreeFiles : (reg?.changedSubtreeFiles ?? []),
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
