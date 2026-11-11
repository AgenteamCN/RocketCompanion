import React from 'react';
import {
  BookOpen,
  Tag,
  Sliders,
  Layers,
  Square,
  LayoutTemplate,
  Compass,
  FileCode2,
  Activity,
  Eye,
  AppWindow,
  Loader2,
  Crosshair,
  MessageSquare,
  BellDot,
  ShieldCheck,
  LineChart,
  Boxes,
  Monitor,
  Coins,
  PanelRightClose,
  Megaphone,
} from 'lucide-react';
import {
  normalizeWorkspaceId,
  type ApprovalLedgerSummary,
  type ShowcaseTab,
  type TunerWorkspaceId,
  type TunerWorkspaceSpec,
  type WorkspaceSectionId,
  type WorkspaceSectionMeta,
} from './workspaceSpecs';

export type {
  ApprovalLedgerSummary,
  ShowcaseTab,
  TunerWorkspaceId,
  TunerWorkspaceSpec,
  WorkspaceSectionId,
  WorkspaceSectionMeta,
};

export interface SidebarLayerMeta {
  code: string;
  title: string;
  rule: string;
  badgeColor: string;
}

export const PYRAMID_LAYERS: Record<string, SidebarLayerMeta> = {
  L0: {
    code: 'L0',
    title: 'Foundations & Design Tokens',
    rule: 'Static Constants and Token · zero JSX',
    badgeColor: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-300 border-neutral-400/30',
  },
  L1: {
    code: 'L1',
    title: 'Primitives & Atomic Controls',
    rule: 'Minimalist display only · pure Props driver',
    badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  },
  L2: {
    code: 'L2',
    title: 'Layout & Container Shells',
    rule: 'Pure space container and optical padding · No Complex Interaction',
    badgeColor: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  },
  L3: {
    code: 'L3',
    title: 'Compounds & Setting Rows',
    rule: 'Self-consistent primitive assembly · No business context lock',
    badgeColor: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  },
  L4: {
    code: 'L4',
    title: 'Motion & Shell Transitions',
    rule: 'Container Morph, Three-stage sequencer and modal shell',
    badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  },
  L5: {
    code: 'L5',
    title: 'In-Game HUD & Spatial Choreography',
    rule: 'Match HUD · Telemetry Charts · Safe Area · Loading · Critical Alert · Takeover · Name Tag',
    badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  L6: {
    code: 'L6',
    title: 'Business Surfaces & Floating Windows',
    rule: 'Reusable menu surface recipes, Sidebar Storage & Floating Window calibration',
    badgeColor: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  },
  L7: {
    code: 'L7',
    title: 'Unified Approval Stage',
    rule: 'Rocket Companion UI stand-in stage, linear approval queue and concurrency verification',
    badgeColor: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  },
};

export interface SidebarNavItem {
  id: ShowcaseTab;
  label: string;
  icon: React.ReactNode;
  layer: keyof typeof PYRAMID_LAYERS;
  workspace: TunerWorkspaceId;
  workspaceSection: WorkspaceSectionId;
  badgeText?: string;
}

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  // Workspace 1 · UI Primitives & Lab
  { id: 'overview', label: 'Architecture & Dependency Pyramid', icon: <BookOpen className="h-4 w-4 text-amber-500" />, layer: 'L0', workspace: 'primitives', workspaceSection: 'primitives-0', badgeText: 'L0-L7' },
  { id: 'foundations', label: 'Typography, Color & Motion Tokens', icon: <Coins className="h-4 w-4" />, layer: 'L0', workspace: 'primitives', workspaceSection: 'primitives-1', badgeText: 'Tokens' },
  { id: 'badges', label: 'Badge, Keycap & Button Primitives', icon: <Tag className="h-4 w-4" />, layer: 'L1', workspace: 'primitives', workspaceSection: 'primitives-2' },
  { id: 'tabs', label: 'UnderlineTabs, Sliders & Setting Rows', icon: <Sliders className="h-4 w-4" />, layer: 'L1', workspace: 'primitives', workspaceSection: 'primitives-2' },
  { id: 'composable-nesting', label: 'Dropdown, UV & Compound Controls', icon: <Boxes className="h-4 w-4 text-amber-500" />, layer: 'L3', workspace: 'primitives', workspaceSection: 'primitives-2' },
  { id: 'dialogue', label: 'Dialogue Zero-Mask Popup Shell', icon: <MessageSquare className="h-4 w-4 text-amber-500" />, layer: 'L3', workspace: 'primitives', workspaceSection: 'primitives-2' },
  { id: 'quick-notification', label: 'Quick Notification Drawer Lab', icon: <BellDot className="h-4 w-4 text-amber-500" />, layer: 'L3', workspace: 'primitives', workspaceSection: 'primitives-2' },
  { id: 'panels', label: 'Container & Floating Window Shells', icon: <LayoutTemplate className="h-4 w-4 text-indigo-500" />, layer: 'L2', workspace: 'primitives', workspaceSection: 'primitives-3', badgeText: '3-Stage' },
  { id: 'cards', label: 'Card & SelectableCard Containers', icon: <Square className="h-4 w-4" />, layer: 'L2', workspace: 'primitives', workspaceSection: 'primitives-3' },
  { id: 'play-cards', label: 'PlayModeCard Tri-Style Lab', icon: <Square className="h-4 w-4 text-amber-500" />, layer: 'L2', workspace: 'primitives', workspaceSection: 'primitives-3', badgeText: 'Tri-Style' },
  { id: 'stacks', label: 'Stack & HudAnchorStage Layout', icon: <Layers className="h-4 w-4" />, layer: 'L2', workspace: 'primitives', workspaceSection: 'primitives-3' },
  { id: 'animation', label: 'Animation & Morphing Curves Lab', icon: <Activity className="h-4 w-4 text-purple-500" />, layer: 'L4', workspace: 'primitives', workspaceSection: 'primitives-3' },
  { id: 'navigation', label: 'MorphingShell & Drawer Shells', icon: <Compass className="h-4 w-4" />, layer: 'L4', workspace: 'primitives', workspaceSection: 'primitives-3' },

  // Workspace 2 · Surface Workbench
  { id: 'recipes', label: 'Menu Surface Tuners & Auto-Config', icon: <FileCode2 className="h-4 w-4 text-sky-500" />, layer: 'L6', workspace: 'workbench', workspaceSection: 'workbench-1', badgeText: '35 Surfaces' },
  { id: 'floating-windows', label: 'Floating Window Calibration Suite', icon: <AppWindow className="h-4 w-4 text-amber-500" />, layer: 'L6', workspace: 'workbench', workspaceSection: 'workbench-1', badgeText: '29 Windows' },
  { id: 'hud-elements', label: 'Match HUD & Spatial Choreography', icon: <Crosshair className="h-4 w-4 text-red-500" />, layer: 'L5', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'HUD' },
  { id: 'temporal-overlay', label: 'Temporal Archive (Replay & Hourglass)', icon: <Activity className="h-4 w-4 text-rose-500" />, layer: 'L5', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'Replay' },
  { id: 'charts-curves', label: 'Telemetry Charts & Bezier Curves', icon: <LineChart className="h-4 w-4 text-emerald-500" />, layer: 'L5', workspace: 'primitives', workspaceSection: 'primitives-3', badgeText: 'Charts' },
  { id: 'viewport-safe-area', label: 'Viewport Scaling & Safe Area', icon: <Monitor className="h-4 w-4 text-amber-500" />, layer: 'L5', workspace: 'primitives', workspaceSection: 'primitives-3', badgeText: 'SafeArea' },
  { id: 'loading-preview', label: 'Loading Dual-Progress Pipeline', icon: <Loader2 className="h-4 w-4 text-sky-500" />, layer: 'L5', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'Loading' },
  { id: 'center-upper-info', label: 'Center-Upper Alert & Countdown', icon: <Megaphone className="h-4 w-4 text-amber-500" />, layer: 'L5', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'Alert' },
  { id: 'takeover', label: 'Takeover Handoff & Vignette', icon: <Crosshair className="h-4 w-4 text-emerald-500" />, layer: 'L5', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'Takeover' },
  { id: 'name-tag-tuner', label: 'Multiplayer Name Tag & Boost Tuner', icon: <Tag className="h-4 w-4 text-teal-400" />, layer: 'L5', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'NameTag' },

  // Workspace 3 · Unified Approval Stage
  { id: 'layer-preview', label: 'Unified Approval Stage (Rocket Companion)', icon: <Layers className="h-4 w-4 text-emerald-500" />, layer: 'L7', workspace: 'approval', workspaceSection: 'approval-1', badgeText: 'Stage' },
  { id: 'live-preview', label: 'Live Preview Side Pill Dock Tuner', icon: <Eye className="h-4 w-4 text-amber-500" />, layer: 'L6', workspace: 'workbench', workspaceSection: 'workbench-1', badgeText: 'Dock' },
  { id: 'edge-inspector', label: 'Edge Inspector Side Drawer Tuner', icon: <PanelRightClose className="h-4 w-4 text-amber-500" />, layer: 'L6', workspace: 'workbench', workspaceSection: 'workbench-1', badgeText: 'Drawer' },
  { id: 'notification-integration', label: 'Notification Concurrency Verification', icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />, layer: 'L7', workspace: 'workbench', workspaceSection: 'workbench-2', badgeText: 'Suite' },
];

const TAB_TO_WORKSPACE_MAP: Record<ShowcaseTab, TunerWorkspaceId> = SIDEBAR_NAV_ITEMS.reduce(
  (acc, item) => {
    acc[item.id] = item.workspace;
    return acc;
  },
  {} as Record<ShowcaseTab, TunerWorkspaceId>
);

export function isValidShowcaseTab(value: string | undefined | null): value is ShowcaseTab {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(TAB_TO_WORKSPACE_MAP, value);
}

export function getWorkspaceForTab(tab: ShowcaseTab): TunerWorkspaceId {
  return TAB_TO_WORKSPACE_MAP[tab] ?? 'primitives';
}

export function getNavItemMeta(tab: ShowcaseTab): SidebarNavItem | undefined {
  return SIDEBAR_NAV_ITEMS.find((item) => item.id === tab);
}

export function readWorkspaceFromUrl(fallbackTab: ShowcaseTab): TunerWorkspaceId {
  if (typeof window === 'undefined') return getWorkspaceForTab(fallbackTab);
  try {
    const sp = new URLSearchParams(window.location.search);
    const normalized = normalizeWorkspaceId(sp.get('workspace'));
    if (normalized) return normalized;
  } catch {
    // ignore URL parse error
  }
  return getWorkspaceForTab(fallbackTab);
}
