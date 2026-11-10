export type FloatingWindowTier = 'user' | 'developer';
export type FloatingWindowVisibilityTier = FloatingWindowTier;

export interface FloatingWindowTabMeta {
  id: string;
  label: string;
}

export interface PresetConfig {
  id: string;
  title: string;
  category: string;
  width: number;
  height: number;
  minWidth?: number;
  /** Explicit minimum height (integer px) for manual per-window vertical resize floor */
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  /** When true (default for user windows), default height and maxHeight dynamically track intrinsic content height so there is no vertical scrolling by default and no empty bottom void when resizing taller */
  autoFitHeight?: boolean;
  resizable: boolean;
  singleton?: boolean;
  defaultCenter?: boolean;
  tier?: FloatingWindowTier;
  summary?: string;
  menuEntryPath?: string;
  tabs?: FloatingWindowTabMeta[];
  component?: string;
  sourcePath?: string;
}

// ============================================================================
// NORMAL USER FLOATING WINDOWS (6 Total — Strictly User-Visible)
// ============================================================================

export const REPLAY_VIEWER_PRESET: PresetConfig = {
  id: 'replay-viewer',
  title: 'Replay Viewer',
  category: 'ReplayViewer',
  width: 471,
  height: 456,
  minWidth: 471,
  minHeight: 136,
  autoFitHeight: true,
  resizable: true,
  singleton: true,
  tier: 'user',
  summary: 'Multi-track replay timeline scrubber, camera mode switcher, and speed flow controls.',
  menuEntryPath: 'Play -> Self-Training -> Replay Viewer',
  component: 'ReplayViewerFloatingWindow',
  sourcePath: 'panels/user/ReplayViewerFloatingWindow.tsx',
};

export const GOAL_BARRIER_CONFIGURATOR_PRESET: PresetConfig = {
  id: 'goal-barrier-configurator',
  title: 'Goal Barrier Configurator',
  category: 'GoalBarrier',
  width: 418,
  height: 462,
  minWidth: 418,
  minHeight: 240,
  autoFitHeight: true,
  resizable: true,
  singleton: true,
  tier: 'user',
  summary: 'Interactive 2D goal barrier boolean rectangle designer with Orange/Blue/Both target selection.',
  menuEntryPath: 'Settings -> Gameplay -> Training Mode Configuration',
  component: 'GoalBarrierConfiguratorFloatingWindow',
  sourcePath: 'panels/user/GoalBarrierConfiguratorFloatingWindow.tsx',
};

export const REWINDER_CONFIGURATOR_PRESET: PresetConfig = {
  id: 'rewinder-configurator',
  title: 'Rewinder Configurator',
  category: 'Rewinder',
  width: 505,
  height: 367,
  minWidth: 505,
  minHeight: 160,
  autoFitHeight: true,
  resizable: true,
  singleton: true,
  tier: 'user',
  summary: 'Free Play state history recorder, timeline scrubber ([ / ]), and countdown takeover.',
  menuEntryPath: 'Settings -> Gameplay -> Training Mode Configuration',
  component: 'RewinderConfiguratorFloatingWindow',
  sourcePath: 'panels/user/RewinderConfiguratorFloatingWindow.tsx',
};

export const NETWORK_MONITOR_PRESET: PresetConfig = {
  id: 'network-monitor',
  title: 'Network Monitor',
  category: 'Network',
  width: 446,
  height: 501,
  minWidth: 446,
  minHeight: 230,
  autoFitHeight: true,
  resizable: true,
  singleton: true,
  tier: 'user',
  summary: 'Real-time RTT & jitter oscilloscope, input buffer queue depth, and 20-minute session telemetry export.',
  menuEntryPath: 'Settings -> Advanced -> Network Monitor',
  component: 'NetworkMonitorFloatingWindow',
  sourcePath: 'panels/user/NetworkMonitorFloatingWindow.tsx',
};

export const PERFORMANCE_MONITOR_PRESET: PresetConfig = {
  id: 'performance-monitor',
  title: 'Performance Monitor',
  category: 'Diagnostic',
  width: 441,
  height: 801,
  minWidth: 441,
  minHeight: 130,
  autoFitHeight: true,
  resizable: true,
  singleton: true,
  tier: 'user',
  summary: 'Real-time CPU 6-phase breakdown, physics simulation sub-ticks, and WebGL rendering pipeline metrics.',
  menuEntryPath: 'Settings -> Advanced -> Performance Monitor',
  component: 'PerformanceMonitorFloatingWindow',
  sourcePath: 'panels/user/PerformanceMonitorFloatingWindow.tsx',
};

export const FLOATING_WINDOW_OPACITY_PRESET: PresetConfig = {
  id: 'floating-window-opacity',
  title: 'Floating Window Opacity',
  category: 'System',
  width: 343,
  height: 123,
  minWidth: 343,
  minHeight: 115,
  autoFitHeight: true,
  resizable: false,
  singleton: true,
  defaultCenter: true,
  tier: 'user',
  summary: 'Global opacity adjustment (1% - 100%) for all active floating telemetry windows.',
  menuEntryPath: 'Settings -> Advanced -> Floating Window Opacity',
  component: 'FloatingWindowOpacityFloatingWindow',
  sourcePath: 'panels/user/FloatingWindowOpacityFloatingWindow.tsx',
};

export const KEYBOARD_INPUT_OVERLAY_PRESET: PresetConfig = {
  id: 'keyboard-input-overlay',
  title: 'Keyboard Input Overlay',
  category: 'KeyboardInputOverlay',
  width: 280,
  height: 320,
  minWidth: 180,
  minHeight: 210,
  maxHeight: 2400,
  autoFitHeight: false,
  resizable: true,
  singleton: true,
  tier: 'user',
  summary: 'Resizable 3x3 retro trapezoid keycap overlay (Q/W/E, A/S/D, Slide/Boost/Jump) with 3D camera-relative WASD attitude arrows.',
  menuEntryPath: 'Settings -> Gameplay -> Training Mode Configuration',
  component: 'KeyboardInputOverlayFloatingWindow',
  sourcePath: 'panels/user/KeyboardInputOverlayFloatingWindow.tsx',
};

export const USER_PRESET_WINDOWS: PresetConfig[] = [
  REPLAY_VIEWER_PRESET,
  GOAL_BARRIER_CONFIGURATOR_PRESET,
  REWINDER_CONFIGURATOR_PRESET,
  KEYBOARD_INPUT_OVERLAY_PRESET,
  NETWORK_MONITOR_PRESET,
  PERFORMANCE_MONITOR_PRESET,
  FLOATING_WINDOW_OPACITY_PRESET,
];
