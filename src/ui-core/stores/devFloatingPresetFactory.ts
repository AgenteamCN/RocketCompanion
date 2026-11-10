import type { FloatingWindowTabMeta, PresetConfig } from './floatingPresets';

export interface DevPresetSpec {
  id: string;
  title: string;
  category: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  autoFitHeight?: boolean;
  summary: string;
  menuEntryPath: string;
  component: string;
  tabs?: FloatingWindowTabMeta[];
}

export const DEV_ENTRY_PATHS = {
  ACTIVE_TUNERS: 'Settings -> Developer -> Active Tuners',
  CALIBRATED_PRESETS: 'Settings -> Developer -> Calibrated Presets',
  SANDBOXES: 'Settings -> Developer -> Sandboxes',
  SANDBOXES_AND_LABS: 'Settings -> Developer -> Sandboxes & Isolation Labs',
  BOTS_LOADOUT: 'Settings -> Developer -> Bots Loadout Tuner',
} as const;

export const VEHICLE_OFFSET_TABS: FloatingWindowTabMeta[] = [
  { id: 'hitbox', label: '1. Hitbox & Align' },
  { id: 'wheels', label: '2. Wheel Offsets' },
  { id: 'boost', label: '3. Boost Nozzles' },
];

export const VEHICLE_GLOBAL_FX_TABS: FloatingWindowTabMeta[] = [
  { id: 'surfaces', label: '1. Surfaces' },
  { id: 'lamps', label: '2. Lamps' },
  { id: 'wheels', label: '3. Wheels' },
  { id: 'boost', label: '4. Boost & FX' },
];

export const ATMOSPHERE_FX_TABS: FloatingWindowTabMeta[] = [
  { id: 'wall-pulse', label: '1. Wall & Pulse' },
  { id: 'shadows-light', label: '2. Shadows & Light' },
  { id: 'skybox', label: '3. Skybox' },
  { id: 'ball', label: '4. Ball' },
];

export const SUBSYSTEM_ISOLATION_LAB_TABS: FloatingWindowTabMeta[] = [
  { id: 'probes', label: '1. Probes' },
  { id: 'multi-ghost', label: '2. Multi Ghost' },
  { id: 'state-replay', label: '3. State Replay' },
  { id: '90s-match', label: '4. 90s Match' },
  { id: 'goal-replay', label: '5. Goal Replay' },
  { id: 'kickoff-duel', label: '6. Kickoff Duel' },
  { id: 'demolish-respawn', label: '7. Demo Respawn' },
];

export const BOOST_PAD_TUNER_TABS: FloatingWindowTabMeta[] = [
  { id: 'shader', label: 'Shader & Orb' },
  { id: 'materials', label: 'Materials' },
  { id: 'rotations', label: 'Rotations' },
  { id: 'refill', label: 'Refilling' },
  { id: 'collect', label: 'Collect FX' },
];

export const DRIFTWOODS_TUNER_TABS: FloatingWindowTabMeta[] = [
  { id: 'ground', label: 'Ground' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'transparent', label: 'Transparent' },
  { id: 'performance', label: 'Performance' },
];

export function makeDevPreset(spec: DevPresetSpec): PresetConfig {
  const out: PresetConfig = {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    width: spec.width ?? 480,
    height: spec.height ?? 580,
    minHeight: spec.minHeight ?? 200,
    resizable: true,
    singleton: true,
    tier: 'developer',
    summary: spec.summary,
    menuEntryPath: spec.menuEntryPath,
    component: spec.component,
    sourcePath: `panels/dev/${spec.component}.tsx`,
  };
  if (spec.minWidth !== undefined) out.minWidth = spec.minWidth;
  if (spec.autoFitHeight !== undefined) out.autoFitHeight = spec.autoFitHeight;
  if (spec.tabs !== undefined) out.tabs = spec.tabs;
  return out;
}
