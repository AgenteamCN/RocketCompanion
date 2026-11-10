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
} from '../../../ui-core/manifest/surfaceMetaTypes';
import { FLOATING_WINDOW_DESCRIPTORS } from '../../../ui-core/panels/floatingWindowRegistry';
import { DEV_PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import { USER_PRESET_WINDOWS } from '../../../ui-core/stores/floatingPresets';
import {
  DEFAULT_PANEL_SIZING,
  type MenuPanelId,
} from '../../../ui-core/tokens/menuLayoutTokens';
import {
  DEV_LINEAR_PLAYLIST,
  USER_LINEAR_PLAYLIST,
} from '../../pages/menu-layer/menuLayerLinearPlaylists';
import {
  MENU_SANDBOX_JUMP_ITEMS,
  ROUTE_TO_PANEL_ID,
} from '../../pages/menu-layer/menuLayerRouteConfig';
import { DEEP_LAYER_RECIPE_SPECS } from '../../pages/recipes/DeepLayerRecipesSection';
import { RECIPES_JUMP_ITEMS } from '../../pages/recipes/LocalPanelSizingTuner';
import {
  CORE_L1_TO_L3_6A_STAGE_RECIPES,
  deriveKebabPanelId,
  evaluateFloatingSurfaceItem,
  formatSizingSummary,
  normalizeRelEntryFile,
  type SurfaceMatchIssueCode,
  type SurfaceMatchStatus,
  type UnmatchedSurfaceDiagnosticItem,
  type UnmatchedSurfaceRadarReport,
} from './unmatchedSurfaceTypes';

type ImportMetaGlobFn = <T = unknown>(
  pattern: string,
  options?: { eager?: boolean }
) => Record<string, T>;

const importMetaGlob = (import.meta as unknown as { glob?: ImportMetaGlobFn }).glob;

const rawRecipeModules: Record<string, GlobSurfaceModule> =
  typeof importMetaGlob === 'function'
    ? importMetaGlob<GlobSurfaceModule>('../../../ui-core/recipes/*.tsx', {
        eager: true,
      })
    : {};

const rawFloatingModules: Record<string, GlobSurfaceModule> =
  typeof importMetaGlob === 'function'
    ? importMetaGlob<GlobSurfaceModule>(
        '../../../ui-core/panels/{user,dev}/*FloatingWindow.tsx',
        { eager: true }
      )
    : {};

function resolveAnyExportedComponent(
  mod: GlobSurfaceModule
): React.ComponentType<StandardSurfaceProps> | null {
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

export function getUnmatchedSurfaceRadarReport(): UnmatchedSurfaceRadarReport {
  const allPresets = [...USER_PRESET_WINDOWS, ...DEV_PRESET_WINDOWS];
  const presetIds = new Set(allPresets.map((p) => p.id));
  const presetComponents = new Set(
    allPresets.map((p) => p.component).filter((c): c is string => Boolean(c))
  );

  const curatedJumpByStem = new Map<string, string>();
  const autoJumpByStem = new Map<string, string>();
  for (const item of RECIPES_JUMP_ITEMS) {
    const cleanName = (item.name || item.componentName || '').replace(/\s*\(.*\)$/, '').trim();
    const itemId = item.id || item.targetId || item.code;
    if (!cleanName) continue;
    if (itemId.startsWith('recipe-auto-')) {
      autoJumpByStem.set(cleanName, itemId);
    } else {
      curatedJumpByStem.set(cleanName, itemId);
    }
  }

  const deepSpecIds = new Set(DEEP_LAYER_RECIPE_SPECS.map((s) => s.id));
  const deepSpecPanelIds = new Set<string>(DEEP_LAYER_RECIPE_SPECS.map((s) => s.panelId));

  const componentToRoutes = new Map<string, Set<string>>();
  for (const jump of MENU_SANDBOX_JUMP_ITEMS) {
    const comp = (jump.componentName || '').replace(/\s*\(.*\)$/, '').trim();
    if (!comp) continue;
    if (!componentToRoutes.has(comp)) {
      componentToRoutes.set(comp, new Set());
    }
    componentToRoutes.get(comp)!.add(jump.route);
  }

  const panelIdToRoutes = new Map<string, Set<string>>();
  for (const [route, panelId] of Object.entries(ROUTE_TO_PANEL_ID)) {
    if (!panelIdToRoutes.has(panelId)) {
      panelIdToRoutes.set(panelId, new Set());
    }
    panelIdToRoutes.get(panelId)!.add(route);
  }

  const playlistRoutes = new Set<string>([
    ...USER_LINEAR_PLAYLIST.map((s) => s.route),
    ...DEV_LINEAR_PLAYLIST.map((s) => s.route),
  ]);

  const issueCounts: Record<SurfaceMatchIssueCode, number> = {
    'missing-surface-meta': 0,
    'missing-6a-curated-tuner': 0,
    'missing-6a-stage-mount': 0,
    'missing-7a-route': 0,
    'missing-7a-playlist': 0,
    'missing-6d-preset': 0,
    'uncalibrated-sizing': 0,
    'missing-approval-ledger': 0,
  };

  const allItems: UnmatchedSurfaceDiagnosticItem[] = [];
  let recipeCandidatesCount = 0;
  let floatingCandidatesCount = 0;

  for (const [globPath, mod] of Object.entries(rawRecipeModules).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const fileStem = globPath.split('/').pop()?.replace(/\.tsx$/, '') ?? '';
    if (!fileStem.endsWith('Recipe') && !fileStem.endsWith('Drawer')) continue;
    recipeCandidatesCount += 1;

    const entryFile = normalizeRelEntryFile(globPath);
    const meta: SurfaceMeta | undefined = mod?.SURFACE_META;
    const Component = mod ? resolveAnyExportedComponent(mod) : null;
    const derivedPanelId = deriveKebabPanelId(fileStem);
    const effectiveMetaId = meta?.id || derivedPanelId;
    const ledgerSurfaceId = `recipe:${fileStem}`;
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
      followUpTargets.push('src/ui-core/manifest/uiApprovalLedger.json (pnpm run radar --sync-approval)');
    } else {
      passedChecks.push('Approval Ledger');
    }

    const mappedRoutes = new Set<string>([
      ...(componentToRoutes.get(fileStem) ?? []),
      ...(panelIdToRoutes.get(effectiveMetaId) ?? []),
      ...(panelIdToRoutes.get(derivedPanelId) ?? []),
    ]);

    const mappedPanelIds = Array.from(mappedRoutes)
      .map((r) => ROUTE_TO_PANEL_ID[r as keyof typeof ROUTE_TO_PANEL_ID])
      .filter((pid): pid is MenuPanelId => Boolean(pid));

    const resolvedPanelId =
      ([effectiveMetaId, derivedPanelId, ...mappedPanelIds].find(
        (id) => id in DEFAULT_PANEL_SIZING
      ) as MenuPanelId | undefined) ?? null;

    const hasCalibrationOverride = Boolean(
      SURFACE_CALIBRATION_OVERRIDES[ledgerSurfaceId] ||
        SURFACE_CALIBRATION_OVERRIDES[effectiveMetaId] ||
        SURFACE_CALIBRATION_OVERRIDES[derivedPanelId]
    );
    const isDrawer = fileStem.endsWith('Drawer');
    const hasSizingBaseline =
      Boolean(resolvedPanelId) || hasCalibrationOverride || (isDrawer && Boolean(meta?.defaultSizing));

    if (!hasSizingBaseline) {
      issues.push('uncalibrated-sizing');
      issueCounts['uncalibrated-sizing'] += 1;
      followUpTargets.push(
        `src/ui-core/tokens/menuPanelSizingPresets.ts (add ${derivedPanelId} to CANONICAL_PANEL_SIZING)`
      );
    } else {
      passedChecks.push('Sizing Baseline');
    }

    const curatedJumpId =
      curatedJumpByStem.get(fileStem) || curatedJumpByStem.get(effectiveMetaId) || null;
    const autoJumpId =
      autoJumpByStem.get(fileStem) ||
      autoJumpByStem.get(effectiveMetaId) ||
      (meta?.id ? `recipe-auto-${meta.id}` : null);

    if (!curatedJumpId) {
      issues.push('missing-6a-curated-tuner');
      issueCounts['missing-6a-curated-tuner'] += 1;
      followUpTargets.push(
        `src/showcase/pages/recipes/LocalPanelSizingTuner.tsx (curate ${fileStem} in CURATED_RECIPES_JUMP_ITEMS)`
      );
    } else {
      passedChecks.push('6A Curated Directory');
    }

    const hasStageMount =
      CORE_L1_TO_L3_6A_STAGE_RECIPES.has(fileStem) ||
      Boolean(curatedJumpId && deepSpecIds.has(curatedJumpId)) ||
      Boolean(resolvedPanelId && deepSpecPanelIds.has(resolvedPanelId));

    if (!hasStageMount) {
      issues.push('missing-6a-stage-mount');
      issueCounts['missing-6a-stage-mount'] += 1;
      followUpTargets.push(
        `src/showcase/pages/recipes/deepLayerRecipeSpecs.tsx (register ${fileStem} stage spec)`
      );
    } else {
      passedChecks.push('6A Stage Mount');
    }

    if (mappedRoutes.size === 0) {
      issues.push('missing-7a-route');
      issueCounts['missing-7a-route'] += 1;
      followUpTargets.push(
        `src/showcase/pages/menu-layer/menuLayerRouteConfig.ts (map ${fileStem} in MENU_SANDBOX_JUMP_ITEMS)`
      );
    } else {
      passedChecks.push(`7A Route (${Array.from(mappedRoutes).join(', ')})`);
    }

    const inPlaylist = Array.from(mappedRoutes).some((r) => playlistRoutes.has(r));
    if (!inPlaylist) {
      issues.push('missing-7a-playlist');
      issueCounts['missing-7a-playlist'] += 1;
      followUpTargets.push(
        `src/showcase/pages/menu-layer/menuLayerLinearPlaylists.ts (append ${
          mappedRoutes.size > 0 ? Array.from(mappedRoutes).join('/') : fileStem
        } to linear playlist)`
      );
    } else {
      passedChecks.push('7A Linear Playlist');
    }

    const resolvedSizing = meta?.defaultSizing
      ? resolveCalibratedSurfaceSizing(meta.id, meta.defaultSizing)
      : resolvedPanelId
      ? {
          width: DEFAULT_PANEL_SIZING[resolvedPanelId].width,
          height: DEFAULT_PANEL_SIZING[resolvedPanelId].targetHeight,
          minHeight: DEFAULT_PANEL_SIZING[resolvedPanelId].minHeight,
          maxHeight: DEFAULT_PANEL_SIZING[resolvedPanelId].maxHeight,
          mode:
            DEFAULT_PANEL_SIZING[resolvedPanelId].mode === 'fixed'
              ? ('fixed' as const)
              : ('adaptive' as const),
        }
      : undefined;

    const hasUnmatched = issues.some((c) =>
      [
        'missing-surface-meta',
        'missing-6a-curated-tuner',
        'missing-6a-stage-mount',
        'missing-7a-route',
        'missing-7a-playlist',
      ].includes(c)
    );
    const status: SurfaceMatchStatus = hasUnmatched
      ? 'unmatched'
      : issues.length > 0
      ? 'uncalibrated'
      : 'matched';

    allItems.push({
      surfaceId: ledgerSurfaceId,
      metaId: effectiveMetaId,
      componentName: fileStem,
      title: meta?.subtitle || meta?.title || fileStem,
      surfaceKind: 'menu-recipe',
      entryFile,
      layer: meta?.layer?.toUpperCase() || 'MENU',
      status,
      sizingSummary: formatSizingSummary(resolvedSizing),
      resolvedPanelId,
      recipeJumpId: curatedJumpId || autoJumpId,
      issues,
      passedChecks,
      followUpTargets,
      Component,
    });
  }

  for (const [globPath, mod] of Object.entries(rawFloatingModules).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const fileStem = globPath.split('/').pop()?.replace(/\.tsx$/, '') ?? '';
    if (!fileStem.endsWith('FloatingWindow')) continue;
    floatingCandidatesCount += 1;

    allItems.push(
      evaluateFloatingSurfaceItem(
        globPath,
        mod,
        fileStem,
        presetIds,
        presetComponents,
        issueCounts
      )
    );
  }

  const flaggedItems = allItems.filter((it) => it.status !== 'matched');
  const unmatchedCount = allItems.filter((it) => it.status === 'unmatched').length;
  const uncalibratedCount = allItems.filter((it) => it.status === 'uncalibrated').length;

  return {
    totalCandidates: allItems.length,
    recipeCandidatesCount,
    floatingCandidatesCount,
    matchedAndCalibratedCount: allItems.length - flaggedItems.length,
    unmatchedOrUncalibratedCount: flaggedItems.length,
    unmatchedCount,
    uncalibratedCount,
    issueCounts,
    flaggedItems,
    allItems,
  };
}

export function resolveAutoDiscoveredRecipeSurface(
  activeRecipeId: string
): UnmatchedSurfaceDiagnosticItem | null {
  if (!activeRecipeId.startsWith('recipe-auto-')) return null;
  const targetMetaId = activeRecipeId.replace(/^recipe-auto-/, '');
  const report = getUnmatchedSurfaceRadarReport();
  return (
    report.allItems.find(
      (item) =>
        item.surfaceKind === 'menu-recipe' &&
        (item.metaId === targetMetaId ||
          item.componentName === targetMetaId ||
          item.recipeJumpId === activeRecipeId)
    ) ?? null
  );
}
