import { UI_APPROVAL_LEDGER } from '../../../ui-core/manifest/surfaceCalibration';
import {
  buildApprovalMessageWithDiffs,
  collectTunerExportDiffSnapshot,
  stripInjectedDiffSuffixFromNote,
} from './exportDiffAndSizeTiering';
import { resolveLedgerVariantRecord } from './reviewLedgerAdapter';
import type {
  AlphaRootCauseCluster,
  ReviewBundleExportPayload,
  RuntimeReviewDecision,
  SurfaceVariantReviewUnit,
  TunerExportDiffSnapshot,
} from './reviewTypes';

function classifyAlphaDepCategory(depPath: string): AlphaRootCauseCluster['category'] {
  if (depPath.startsWith('src/ui-core/layout/')) return 'alpha-shell';
  if (depPath.startsWith('src/ui-core/primitives/')) return 'alpha-primitive';
  if (depPath.startsWith('src/ui-core/compounds/')) return 'alpha-compound';
  if (depPath.startsWith('src/ui-core/charts/')) return 'alpha-chart';
  return 'alpha-store-config';
}

function formatAlphaShortName(depPath: string): string {
  const file = depPath.split('/').pop() || depPath;
  const stem = file.replace(/\.(tsx|ts)$/, '');
  if (depPath.startsWith('src/ui-core/layout/')) return `Alpha:Shell(${stem})`;
  if (depPath.startsWith('src/ui-core/primitives/')) return `Alpha:Primitive(${stem})`;
  if (depPath.startsWith('src/ui-core/compounds/')) return `Alpha:Compound(${stem})`;
  if (depPath.startsWith('src/ui-core/charts/')) return `Alpha:Chart(${stem})`;
  return `Alpha:StoreConfig(${stem})`;
}

export function formatCompactIndexRanges(indices: readonly number[]): string {
  if (indices.length === 0) return 'None';
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `#${start}` : `#${start}-#${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `#${start}` : `#${start}-#${end}`);
  return ranges.join(', ');
}

export function computeAlphaBravoRootCauseClusters(
  units: SurfaceVariantReviewUnit[]
): AlphaRootCauseCluster[] {
  const rejectedUnits = units.filter((u) => u.status === 'rejected');
  if (rejectedUnits.length === 0) {
    return [];
  }

  const depMap = new Map<
    string,
    {
      rejectedUnits: Set<string>;
      rejectedSurfaces: Set<string>;
      approvedUnits: Set<string>;
      allUnits: Set<string>;
    }
  >();

  for (const unit of units) {
    for (const dep of unit.alphaMotherDeps) {
      if (dep.startsWith('src/ui-core/stores/') || dep.startsWith('src/ui-core/tokens/')) {
        continue;
      }
      if (!depMap.has(dep)) {
        depMap.set(dep, {
          rejectedUnits: new Set(),
          rejectedSurfaces: new Set(),
          approvedUnits: new Set(),
          allUnits: new Set(),
        });
      }
      const entry = depMap.get(dep)!;
      entry.allUnits.add(unit.unitKey);
      if (unit.status === 'rejected') {
        entry.rejectedUnits.add(unit.unitKey);
        entry.rejectedSurfaces.add(unit.surfaceId);
      } else if (unit.status === 'approved') {
        entry.approvedUnits.add(unit.unitKey);
      }
    }
  }

  const clusters: AlphaRootCauseCluster[] = [];

  for (const [alphaDep, stats] of depMap.entries()) {
    if (stats.rejectedUnits.size === 0) continue;
    if (
      alphaDep === 'src/ui-core/layout/UniversalThreeStageShell.tsx' &&
      stats.rejectedSurfaces.size < 3
    ) {
      continue;
    }

    const rejectedList = Array.from(stats.rejectedUnits).sort();
    const approvedList = Array.from(stats.approvedUnits).sort();
    const totalCount = stats.allUnits.size;
    const shortName = formatAlphaShortName(alphaDep);
    const category = classifyAlphaDepCategory(alphaDep);

    const isSystemicAlphaIssue =
      stats.rejectedSurfaces.size >= 2 &&
      (stats.rejectedSurfaces.size >= 3 || rejectedList.length / Math.max(1, totalCount) >= 0.25);

    const verdict: AlphaRootCauseCluster['verdict'] = isSystemicAlphaIssue
      ? 'fix-alpha-mother'
      : 'fix-bravo-surface-locally';

    const recommendation = isSystemicAlphaIssue
      ? `${stats.rejectedSurfaces.size} rejected surfaces co-depend on \`${shortName}\` (\`${alphaDep}\`). Inspect shared Alpha component first.`
      : `\`${shortName}\` (\`${alphaDep}\`) is healthy across ${approvedList.length} approved surface(s); apply localized fix to target surface.`;

    clusters.push({
      alphaDep,
      shortName,
      category,
      rejectedUnits: rejectedList,
      approvedUnits: approvedList,
      totalUnitsUsingDep: totalCount,
      verdict,
      recommendation,
    });
  }

  return clusters.sort((a, b) => {
    if (a.verdict !== b.verdict) {
      return a.verdict === 'fix-alpha-mother' ? -1 : 1;
    }
    return b.rejectedUnits.length - a.rejectedUnits.length;
  });
}

export function buildReviewBundlePayload(params: {
  units: SurfaceVariantReviewUnit[];
  decisionsMap: Record<string, RuntimeReviewDecision>;
  diffSnapshot?: TunerExportDiffSnapshot;
}): ReviewBundleExportPayload {
  const { units, decisionsMap, diffSnapshot = collectTunerExportDiffSnapshot() } = params;
  const nowIso = new Date().toISOString();

  const approvedCount = units.filter((u) => u.status === 'approved').length;
  const rejectedCount = units.filter((u) => u.status === 'rejected').length;
  const deferredCount = units.filter((u) => u.status === 'deferred').length;
  const pendingCount = units.filter((u) => u.status === 'pending').length;

  const bucket1VisualCount = units.filter(
    (u) => u.status === 'pending' || u.changedSubtreeFiles.length > 0
  ).length;
  const bucket2ConfigCount = units.filter(
    (u) => u.status === 'deferred' && u.changedSubtreeFiles.length === 0
  ).length;
  const bucket3TemplateCount = units.filter((u) => u.bucket === 'bucket-3-template').length;

  const rootCauseRecommendations = computeAlphaBravoRootCauseClusters(units);
  const decisions = Object.values(decisionsMap).sort((a, b) => a.unitKey.localeCompare(b.unitKey));

  const approvalMessage = buildApprovalMessageWithDiffs({
    baseNote: `Approved ${approvedCount}/${units.length} (${rejectedCount} rejected, ${pendingCount} fixed-verify, ${deferredCount} hold)`,
    diffSnapshot,
  });

  const surfacePatch: ReviewBundleExportPayload['ledgerPatch']['surfaces'] = {};
  const unitsBySurface = new Map<string, SurfaceVariantReviewUnit[]>();
  for (const unit of units) {
    const group = unitsBySurface.get(unit.surfaceId) ?? [];
    group.push(unit);
    unitsBySurface.set(unit.surfaceId, group);
  }

  for (const [surfaceId, group] of unitsBySurface.entries()) {
    const baseLedger = UI_APPROVAL_LEDGER.surfaces[surfaceId];
    const isMultiVariant = group.length > 1 || group[0]?.variantId !== 'default';

    if (!isMultiVariant) {
      const u = group[0];
      const cleanNote = stripInjectedDiffSuffixFromNote(u.note);
      const baseNote = stripInjectedDiffSuffixFromNote(baseLedger?.note);
      const statusChanged = !baseLedger || baseLedger.status !== u.status;
      const noteChanged = cleanNote !== baseNote;
      if (statusChanged || noteChanged || u.status === 'rejected' || cleanNote.length > 0) {
        surfacePatch[surfaceId] = {
          status: u.status,
          approvedAt: u.updatedAt || nowIso,
          ...(cleanNote ? { note: cleanNote } : {}),
        };
      }
      continue;
    }

    const changedVariants: Record<
      string,
      { status: SurfaceVariantReviewUnit['status']; approvedAt: string; note?: string }
    > = {};

    for (const u of group) {
      const baseVar = resolveLedgerVariantRecord(baseLedger, u.variantId);
      const cleanNote = stripInjectedDiffSuffixFromNote(u.note);
      const baseNote = stripInjectedDiffSuffixFromNote(baseVar?.note);
      const baseStatus = baseVar?.status ?? baseLedger?.status ?? 'deferred';
      if (
        u.status !== baseStatus ||
        cleanNote !== baseNote ||
        u.status === 'rejected' ||
        cleanNote.length > 0
      ) {
        changedVariants[u.variantId] = {
          status: u.status,
          approvedAt: u.updatedAt || nowIso,
          ...(cleanNote ? { note: cleanNote } : {}),
        };
      }
    }

    const hasRejected = group.some((u) => u.status === 'rejected');
    const allApproved = group.every((u) => u.status === 'approved');
    const anyPending = group.some((u) => u.status === 'pending');
    const aggStatus: SurfaceVariantReviewUnit['status'] = hasRejected
      ? 'rejected'
      : allApproved
        ? 'approved'
        : anyPending
          ? 'pending'
          : 'deferred';

    if (Object.keys(changedVariants).length > 0 || !baseLedger || baseLedger.status !== aggStatus) {
      surfacePatch[surfaceId] = {
        status: aggStatus,
        approvedAt: nowIso,
        ...(Object.keys(changedVariants).length > 0 ? { variants: changedVariants } : {}),
      };
    }
  }

  return {
    schemaVersion: 1,
    exportedAt: nowIso,
    approvalMessage,
    summary: {
      totalUnits: units.length,
      approvedCount,
      rejectedCount,
      deferredCount,
      pendingCount,
      bucket1VisualCount,
      bucket2ConfigCount,
      bucket3TemplateCount,
      calibratedSurfaceCount: diffSnapshot.totalCalibrationSurfaceCount,
      storeDiffCount: diffSnapshot.totalStoreDiffCount,
    },
    rootCauseRecommendations,
    decisions,
    surfaceCalibrationOverrides: diffSnapshot.calibrationOverrides,
    calibrationDiffs: diffSnapshot.calibrationDiffs,
    storeDiffs: diffSnapshot.storeDiffs,
    storeDiffMap: diffSnapshot.storeDiffMap,
    ledgerPatch: {
      updatedAt: nowIso,
      surfaces: surfacePatch,
    },
  };
}

export function formatReviewBundleMarkdown(
  payload: ReviewBundleExportPayload,
  units: SurfaceVariantReviewUnit[]
): string {
  const rejected = units.filter((u) => u.status === 'rejected');
  const approved = units.filter((u) => u.status === 'approved');
  const pendingVerify = units.filter(
    (u) => u.status === 'pending' || (u.status !== 'rejected' && u.changedSubtreeFiles.length > 0)
  );
  const notedOther = units.filter((u) => u.status !== 'rejected' && u.note.trim().length > 0);

  const lines: string[] = [
    '# [RCUITuner · Rapid Review Triage Summary]',
    `- **Summary**: **${payload.summary.approvedCount}** Approved · ` +
      `**${payload.summary.rejectedCount}** Rejected · ` +
      `**${payload.summary.pendingCount}** Fixed/Verify · ` +
      `**${payload.summary.deferredCount}** Hold (Total ${payload.summary.totalUnits} units)`,
    `- **Approved Units (${approved.length})**: \`${formatCompactIndexRanges(
      approved.map((u) => u.playlistIndex)
    )}\``,
  ];

  if (pendingVerify.length > 0) {
    lines.push(
      `- **Fixed / Pending Verify (${pendingVerify.length})**: ${pendingVerify
        .map((u) => `\`#${u.playlistIndex} ${u.unitKey}\``)
        .join(', ')}`
    );
  }

  lines.push('', '## 1. Rejected Units Requiring Rework');
  if (rejected.length === 0) {
    lines.push('- None');
  } else {
    for (const u of rejected) {
      lines.push(
        `- [REJECTED] **#${u.playlistIndex} [${u.referenceCode}] ${u.label}** (\`${u.unitKey}\`)`,
        `  - **Source**: \`${u.sourceFile}\`${u.subViewFile ? ` → \`${u.subViewFile}\`` : ''}`,
        `  - **Note**: ${u.note.trim() || '*(Rejected via R shortcut)*'}`
      );
    }
  }

  if (notedOther.length > 0) {
    lines.push('', '## 2. Other Units With Reviewer Notes');
    for (const u of notedOther) {
      lines.push(
        `- [${u.status.toUpperCase()}] **#${u.playlistIndex} [${u.referenceCode}] ${u.label}** (\`${u.unitKey}\`) — \`${u.sourceFile}\``,
        `  - **Note**: ${u.note.trim()}`
      );
    }
  }

  const hasCalDiffs = Object.keys(payload.surfaceCalibrationOverrides).length > 0;
  const hasStoreDiffs = Object.keys(payload.storeDiffMap).length > 0;
  if (hasCalDiffs || hasStoreDiffs) {
    lines.push(
      '',
      '## 3. Calibrated Overrides & Store Diffs',
      '```json',
      JSON.stringify(
        {
          ...(hasCalDiffs
            ? { surfaceCalibrationOverrides: payload.surfaceCalibrationOverrides }
            : {}),
          ...(hasStoreDiffs ? { storeDiffMap: payload.storeDiffMap } : {}),
        },
        null,
        2
      ),
      '```'
    );
  }

  if (Object.keys(payload.ledgerPatch.surfaces).length > 0) {
    lines.push(
      '',
      '## 4. `manifest/uiApprovalLedger.json` Delta Patch',
      '```json',
      JSON.stringify(payload.ledgerPatch, null, 2),
      '```'
    );
  }

  lines.push('');
  return lines.join('\n');
}
