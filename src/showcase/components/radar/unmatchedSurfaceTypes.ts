import type React from 'react';
import {
  resolveModuleComponent,
  type GlobSurfaceModule,
} from '../../../ui-core/manifest/floatingSurfaceRegistry';
import {
  SURFACE_CALIBRATION_OVERRIDES,
  UI_APPROVAL_LEDGER,
  resolveCalibratedSurfaceSizing,
} from '../../../ui-core/manifest/surfaceCalibration';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
  SurfaceSizingSpec,
} from '../../../ui-core/manifest/surfaceMetaTypes';
import { FLOATING_WINDOW_DESCRIPTORS } from '../../../ui-core/panels/floatingWindowRegistry';
import type { MenuPanelId } from '../../../ui-core/tokens/menuLayoutTokens';

export type SurfaceMatchIssueCode =
  | 'missing-surface-meta'
  | 'missing-6a-curated-tuner'
  | 'missing-6a-stage-mount'
  | 'missing-7a-route'
  | 'missing-7a-playlist'
  | 'missing-6d-preset'
  | 'uncalibrated-sizing'
  | 'missing-approval-ledger';

export type SurfaceMatchStatus = 'matched' | 'unmatched' | 'uncalibrated';

export interface UnmatchedSurfaceDiagnosticItem {
  surfaceId: string;
  metaId: string;
  componentName: string;
  title: string;
  surfaceKind: 'menu-recipe' | 'floating-window';
  entryFile: string;
  layer: string;
  status: SurfaceMatchStatus;
  sizingSummary: string;
  resolvedPanelId: MenuPanelId | null;
  recipeJumpId: string | null;
  issues: SurfaceMatchIssueCode[];
  passedChecks: string[];
  followUpTargets: string[];
  Component: React.ComponentType<StandardSurfaceProps> | null;
}

export interface UnmatchedSurfaceRadarReport {
  totalCandidates: number;
  recipeCandidatesCount: number;
  floatingCandidatesCount: number;
  matchedAndCalibratedCount: number;
  unmatchedOrUncalibratedCount: number;
  unmatchedCount: number;
  uncalibratedCount: number;
  issueCounts: Record<SurfaceMatchIssueCode, number>;
  flaggedItems: UnmatchedSurfaceDiagnosticItem[];
  allItems: UnmatchedSurfaceDiagnosticItem[];
}

export const ISSUE_CODE_LABELS: Record<SurfaceMatchIssueCode, string> = {
  'missing-surface-meta': 'Missing SURFACE_META',
  'missing-6a-curated-tuner': '6A Auto-Fallback Only',
  'missing-6a-stage-mount': 'Missing 6A Stage Spec',
  'missing-7a-route': 'Missing 7A Route',
  'missing-7a-playlist': 'Missing 7A Linear Playlist',
  'missing-6d-preset': 'Missing 6D Floating Preset',
  'uncalibrated-sizing': 'Uncalibrated Sizing Token',
  'missing-approval-ledger': 'Unreviewed in Approval Ledger',
};

export const CORE_L1_TO_L3_6A_STAGE_RECIPES = new Set<string>([
  'Layer1MainMenuRecipe',
  'Layer2PlayRecipe',
  'Layer2GarageRecipe',
  'Layer2SettingsRecipe',
  'Layer2ManageRoomRecipe',
  'Layer3HostMatchRecipe',
  'Layer3JoinRoomRecipe',
  'Layer3AcousticsEqualizerRecipe',
  'Layer3ExhibitionRecipe',
  'Layer3SelfTrainingRecipe',
  'Layer3KickoffTrainingRecipe',
  'Layer3CameraRecipe',
  'Layer3KeybindingsRecipe',
  'Layer3BallTrajectoryRecipe',
  'Layer3ExpMultiBotsRecipe',
  'Layer3ExpBotPackRecipe',
  'Layer3TrainingConfigRecipe',
  'Layer3HostTrainingRecipe',
  'Layer3CustomPlayRecipe',
  'Layer3DevSandboxesRecipe',
  'Layer3DevActiveTunersRecipe',
  'Layer3DevCalibratedPresetsRecipe',
  'Layer3DevUnderDevelopmentRecipe',
  'Layer3DevSelfTestRecipe',
  'Layer3DevRemoteProfileRecipe',
  'Layer3DevQuickActionsRecipe',
  'Layer4StaticTrainingPackBrowseRecipe',
  'StaticTrainingShotInspectorDrawer',
  'Layer4AdvancedAudioRecipe',
  'Layer4ControllerSettingsRecipe',
  'Layer4EventTriggerRulesRecipe',
  'Layer4DevSignalingLabRecipe',
]);

export function deriveKebabFloatingId(fileStem: string): string {
  const stem = fileStem.replace(/FloatingWindow$/, '');
  return stem.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function deriveKebabPanelId(fileStem: string): string {
  return fileStem
    .replace(/Recipe$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/(Layer[1-5])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

export function normalizeRelEntryFile(globPath: string): string {
  return globPath.replace(/^(\.\.\/)+/, 'src/');
}

export function formatSizingSummary(sizing: SurfaceSizingSpec | undefined): string {
  if (!sizing) return 'Uncalibrated sizing';
  const modeLabel = sizing.mode === 'fixed' ? 'Fixed' : 'Auto-Fit';
  const hPart =
    typeof sizing.height === 'number'
      ? `${sizing.height}px`
      : `${sizing.minHeight ?? 200}~${sizing.maxHeight ?? 960}px`;
  return `${modeLabel} · ${sizing.width}×${hPart}`;
}

export function resolveAnyExportedComponent(
  mod: GlobSurfaceModule | undefined
): React.ComponentType<StandardSurfaceProps> | null {
  if (!mod) return null;
  const primary = resolveModuleComponent(mod);
  if (primary) return primary;
  for (const [key, val] of Object.entries(mod)) {
    if (key === 'SURFACE_META') continue;
    if (
      (key.endsWith('Drawer') || key.endsWith('Recipe') || key.endsWith('FloatingWindow')) &&
      (typeof val === 'function' || (val && typeof val === 'object'))
    ) {
      return val as React.ComponentType<StandardSurfaceProps>;
    }
  }
  return null;
}

export function createEmptyIssueCounts(): Record<SurfaceMatchIssueCode, number> {
  return {
    'missing-surface-meta': 0,
    'missing-6a-curated-tuner': 0,
    'missing-6a-stage-mount': 0,
    'missing-7a-route': 0,
    'missing-7a-playlist': 0,
    'missing-6d-preset': 0,
    'uncalibrated-sizing': 0,
    'missing-approval-ledger': 0,
  };
}

export function evaluateFloatingSurfaceItem(
  globPath: string,
  mod: GlobSurfaceModule | undefined,
  fileStem: string,
  presetIds: Set<string>,
  presetComponents: Set<string>,
  issueCounts: Record<SurfaceMatchIssueCode, number>
): UnmatchedSurfaceDiagnosticItem {
  const entryFile = normalizeRelEntryFile(globPath);
  const meta: SurfaceMeta | undefined = mod?.SURFACE_META;
  const Component = resolveAnyExportedComponent(mod);
  const derivedId = deriveKebabFloatingId(fileStem);
  const effectiveMetaId = meta?.id || derivedId;
  const ledgerSurfaceId = `floating:${effectiveMetaId}`;
  const ledgerRecord = UI_APPROVAL_LEDGER.surfaces?.[ledgerSurfaceId];

  const issues: SurfaceMatchIssueCode[] = [];
  const passedChecks: string[] = [];
  const followUpTargets: string[] = [];

  if (!meta || !meta.id || !meta.defaultSizing) {
    issues.push('missing-surface-meta');
    issueCounts['missing-surface-meta'] += 1;
    followUpTargets.push(`${entryFile} (export const SURFACE_META)`);
  } else {
    passedChecks.push('SURFACE_META');
  }

  if (!ledgerRecord || ledgerRecord.status === 'unreviewed' || ledgerRecord.status === 'pending') {
    issues.push('missing-approval-ledger');
    issueCounts['missing-approval-ledger'] += 1;
    followUpTargets.push(
      'src/ui-core/manifest/uiApprovalLedger.json (pnpm run radar --sync-approval)'
    );
  } else {
    passedChecks.push('Approval Ledger');
  }

  const inPresets =
    presetIds.has(effectiveMetaId) ||
    presetIds.has(derivedId) ||
    presetComponents.has(fileStem);
  const inDescriptors = Boolean(
    FLOATING_WINDOW_DESCRIPTORS[effectiveMetaId] || FLOATING_WINDOW_DESCRIPTORS[derivedId]
  );

  if (!inPresets || !inDescriptors) {
    const targetPresetFile = entryFile.includes('/user/')
      ? 'src/ui-core/stores/floatingPresets.ts'
      : 'src/ui-core/stores/devFloatingPresets.ts';
    issues.push('missing-6d-preset');
    issueCounts['missing-6d-preset'] += 1;
    followUpTargets.push(`${targetPresetFile} (register PresetConfig for ${effectiveMetaId})`);
  } else {
    passedChecks.push('6D Preset & Registry');
  }

  const hasCalibrationOverride = Boolean(
    SURFACE_CALIBRATION_OVERRIDES[ledgerSurfaceId] ||
      SURFACE_CALIBRATION_OVERRIDES[effectiveMetaId]
  );
  if (!inPresets && !hasCalibrationOverride) {
    issues.push('uncalibrated-sizing');
    issueCounts['uncalibrated-sizing'] += 1;
  } else {
    passedChecks.push('Sizing Baseline');
  }

  const resolvedSizing = meta?.defaultSizing
    ? resolveCalibratedSurfaceSizing(meta.id, meta.defaultSizing)
    : undefined;

  const hasUnmatched = issues.some((c) =>
    ['missing-surface-meta', 'missing-6d-preset'].includes(c)
  );
  const status: SurfaceMatchStatus = hasUnmatched
    ? 'unmatched'
    : issues.length > 0
    ? 'uncalibrated'
    : 'matched';

  return {
    surfaceId: ledgerSurfaceId,
    metaId: effectiveMetaId,
    componentName: fileStem,
    title: meta?.title || fileStem,
    surfaceKind: 'floating-window',
    entryFile,
    layer:
      meta?.layer === 'floating-user' || entryFile.includes('/user/')
        ? 'FLOATING USER'
        : 'FLOATING DEV',
    status,
    sizingSummary: formatSizingSummary(resolvedSizing),
    resolvedPanelId: null,
    recipeJumpId: null,
    issues,
    passedChecks,
    followUpTargets,
    Component,
  };
}

export function formatUnmatchedSurfaceFollowUpMarkdown(
  report: UnmatchedSurfaceRadarReport
): string {
  const header = [
    '# RC Unmatched / Uncalibrated Surface Radar Report',
    `- Total Scanned RC Surfaces: ${report.totalCandidates} (${report.recipeCandidatesCount} Menu Recipes/Drawers + ${report.floatingCandidatesCount} Floating Windows)`,
    `- Fully Matched & Calibrated: ${report.matchedAndCalibratedCount} / ${report.totalCandidates}`,
    `- Flagged for Follow-Up: ${report.unmatchedOrUncalibratedCount} (${report.unmatchedCount} Unmatched, ${report.uncalibratedCount} Uncalibrated)`,
    '',
  ];
  if (report.flaggedItems.length === 0) {
    return [...header, 'All RC surfaces in `src/ui-core` are matched and calibrated.'].join('\n');
  }
  const rows = report.flaggedItems.map((item, idx) => {
    const issueList = item.issues.join(', ');
    const targets = item.followUpTargets.map((t) => `  - [ ] ${t}`).join('\n');
    return `${idx + 1}. **[${item.status.toUpperCase()}] \`${item.surfaceId}\`** (\`${item.entryFile}\`)\n  - Missing Checks: \`${issueList}\`\n${targets}`;
  });
  return [...header, '## Follow-Up Checklist', ...rows].join('\n');
}
