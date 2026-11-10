import {
  SURFACE_CALIBRATION_OVERRIDES,
  UI_APPROVAL_LEDGER,
} from '../ui-core/manifest/surfaceCalibration';

export type ShowcaseTab =
  | 'overview'
  | 'foundations'
  | 'badges'
  | 'tabs'
  | 'stacks'
  | 'cards'
  | 'play-cards'
  | 'panels'
  | 'composable-nesting'
  | 'dialogue'
  | 'quick-notification'
  | 'animation'
  | 'navigation'
  | 'hud-elements'
  | 'center-upper-info'
  | 'takeover'
  | 'temporal-overlay'
  | 'charts-curves'
  | 'viewport-safe-area'
  | 'loading-preview'
  | 'name-tag-tuner'
  | 'recipes'
  | 'live-preview'
  | 'edge-inspector'
  | 'floating-windows'
  | 'layer-preview'
  | 'notification-integration';

export type TunerWorkspaceId = 'primitives' | 'workbench' | 'approval';

export const WORKSPACE_ORDER: readonly TunerWorkspaceId[] = [
  'primitives',
  'workbench',
  'approval',
] as const;

export type WorkspaceSectionId =
  | 'primitives-0'
  | 'primitives-1'
  | 'primitives-2'
  | 'primitives-3'
  | 'workbench-1'
  | 'workbench-2'
  | 'approval-1'
  | 'approval-2';

export interface TunerWorkspaceSpec {
  id: TunerWorkspaceId;
  index: 1 | 2 | 3;
  code: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  defaultTab: ShowcaseTab;
  badgeColor: string;
}

export const WORKSPACE_SPECS: Record<TunerWorkspaceId, TunerWorkspaceSpec> = {
  primitives: {
    id: 'primitives',
    index: 1,
    code: 'WORKSPACE 1 · PRIMITIVES',
    shortLabel: '1 · UI Primitives & Lab',
    title: 'UI Primitives & Motion Lab',
    subtitle:
      'Typography, Color Tokens, Buttons, Sliders, Setting Rows, UnderlineTabs, Container Shells & Morphing Curves',
    defaultTab: 'panels',
    badgeColor:
      'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  },
  workbench: {
    id: 'workbench',
    index: 2,
    code: 'WORKSPACE 2 · WORKBENCH',
    shortLabel: '2 · Surface Workbench',
    title: 'Surface Calibration & Parameter Workbench',
    subtitle:
      'Menu Adaptive Sizing, Floating Window Presets, HUD Spatial Choreography & Auto-Reflected Surface Tuners',
    defaultTab: 'recipes',
    badgeColor:
      'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  },
  approval: {
    id: 'approval',
    index: 3,
    code: 'WORKSPACE 3 · APPROVAL STAGE',
    shortLabel: '3 · Unified Approval Stage',
    title: 'Unified Approval Stage',
    subtitle:
      'Clean Rocket Companion Interactive Acceptance Stage, Linear Review Queue, Trackpad Scrub Resizer & Smart Diff Export',
    defaultTab: 'layer-preview',
    badgeColor:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
};

export interface WorkspaceSectionMeta {
  id: WorkspaceSectionId;
  workspace: TunerWorkspaceId;
  code: string;
  title: string;
  rule: string;
  badgeColor: string;
}

export const WORKSPACE_SECTIONS: Record<WorkspaceSectionId, WorkspaceSectionMeta> = {
  'primitives-0': {
    id: 'primitives-0',
    workspace: 'primitives',
    code: 'PRIMITIVES · ARCH',
    title: 'Architecture & Dependency Pyramid',
    rule: 'Unidirectional L0->L7 dependency contract & zero-barrel module addressing',
    badgeColor:
      'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300 border-neutral-400/30',
  },
  'primitives-1': {
    id: 'primitives-1',
    workspace: 'primitives',
    code: 'PRIMITIVES · TOKENS',
    title: 'Design Tokens & Foundations',
    rule: 'Static color, corner radius, spacing, easing & visual tone tokens',
    badgeColor:
      'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  },
  'primitives-2': {
    id: 'primitives-2',
    workspace: 'primitives',
    code: 'PRIMITIVES · ATOMIC',
    title: 'Atomic Controls & Compound Rows',
    rule: 'UnderlineTabs, SliderControl, DualGrabber, SettingActionRow, Dialogue & QuickNotification',
    badgeColor:
      'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  },
  'primitives-3': {
    id: 'primitives-3',
    workspace: 'primitives',
    code: 'PRIMITIVES · SHELLS',
    title: 'Container Shells, Cards & Motion Lab',
    rule: '3-Stage Universal Shell, Floating Window Shell, PlayModeCard, Stacks & Morphing Curves',
    badgeColor:
      'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  },
  'workbench-1': {
    id: 'workbench-1',
    workspace: 'workbench',
    code: 'WORKBENCH · SURFACES',
    title: 'Business Surface & Window Calibration',
    rule: 'Menu Surface Tuners, Floating Window Min-Width/Height Calibration & AutoConfigTunerPanel',
    badgeColor:
      'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  },
  'workbench-2': {
    id: 'workbench-2',
    workspace: 'workbench',
    code: 'WORKBENCH · HUD',
    title: 'In-Game HUD & Spatial Choreography',
    rule: 'Match HUD, Telemetry Charts, Safe Area, Loading Pipeline, Alerts, Takeover & NameTag Tuners',
    badgeColor:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  'approval-1': {
    id: 'approval-1',
    workspace: 'approval',
    code: 'APPROVAL · STAGE',
    title: 'Unified Approval Stage',
    rule: 'Rocket Companion UI Stand-in, Trackpad Resizer, Linear Stepper & Smart Tiered Diff Export',
    badgeColor:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  'approval-2': {
    id: 'approval-2',
    workspace: 'approval',
    code: 'APPROVAL · DOCKS',
    title: 'Interactive Docks & Concurrency Verification',
    rule: 'Live Preview Side Pill Dock, Edge Inspector Drawer & Notification Concurrency Suite',
    badgeColor:
      'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  },
};

export interface ApprovalLedgerSummary {
  totalSurfaces: number;
  menuRecipeCount: number;
  floatingWindowCount: number;
  approvedCount: number;
  pendingOrDriftCount: number;
  calibratedCount: number;
  templateHash: string;
}

export function getApprovalLedgerSummary(): ApprovalLedgerSummary {
  const surfaces = Object.values(UI_APPROVAL_LEDGER.surfaces ?? {});
  let menuRecipeCount = 0;
  let floatingWindowCount = 0;
  let approvedCount = 0;

  for (const rec of surfaces) {
    if (rec.surfaceKind === 'floating-window') floatingWindowCount += 1;
    else menuRecipeCount += 1;

    if (
      rec.status === 'approved' &&
      rec.templateHash === UI_APPROVAL_LEDGER.templateHash
    ) {
      approvedCount += 1;
    }
  }

  return {
    totalSurfaces: surfaces.length,
    menuRecipeCount,
    floatingWindowCount,
    approvedCount,
    pendingOrDriftCount: Math.max(0, surfaces.length - approvedCount),
    calibratedCount: Object.keys(SURFACE_CALIBRATION_OVERRIDES ?? {}).length,
    templateHash: UI_APPROVAL_LEDGER.templateHash || 'n/a',
  };
}

export function normalizeWorkspaceId(
  rawWorkspace?: string | null
): TunerWorkspaceId | null {
  if (!rawWorkspace) return null;
  const clean = rawWorkspace.trim().toLowerCase();
  if (clean === 'primitives' || clean === 'primitives-lab' || clean === 'alpha' || clean === '1') {
    return 'primitives';
  }
  if (clean === 'workbench' || clean === 'surface-workbench' || clean === 'tuner' || clean === '2') {
    return 'workbench';
  }
  if (clean === 'approval' || clean === 'approval-stage' || clean === 'bravo' || clean === 'stage' || clean === '3') {
    return 'approval';
  }
  return null;
}

export function syncWorkspaceUrlParam(workspace: TunerWorkspaceId): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('workspace') !== workspace) {
      url.searchParams.set('workspace', workspace);
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`
      );
    }
  } catch {
    // ignore history errors
  }
}
