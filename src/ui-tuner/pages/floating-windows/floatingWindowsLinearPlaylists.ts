import { getDiscoveredFloatingSurfaces } from '../../../ui-core/manifest/floatingSurfaceRegistry';
import {
  ATMOSPHERE_FX_TABS,
  BOOST_PAD_TUNER_TABS,
  DRIFTWOODS_TUNER_TABS,
  SUBSYSTEM_ISOLATION_LAB_TABS,
  VEHICLE_GLOBAL_FX_TABS,
  VEHICLE_OFFSET_TABS,
} from '../../../ui-core/stores/devFloatingPresetFactory';
import { DEV_PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import {
  USER_PRESET_WINDOWS,
  type FloatingWindowTabMeta,
  type FloatingWindowVisibilityTier,
  type PresetConfig,
} from '../../../ui-core/stores/floatingPresets';
import type {
  ActiveMenuRoute,
  LinearPlaylistStep,
} from '../menu-layer/menuLayerRouteConfig';

export type FloatingSubTabExpansionMode = 'all' | 'underline-tabs-only' | 'none';

export interface FloatingWindowPlaylistUnit extends LinearPlaylistStep {
  kind: 'floating-window';
  tier: FloatingWindowVisibilityTier;
  windowId: string;
  surfaceId: string;
  variantId: string;
  unitKey: string;
  stateId: string;
  referenceCode: string;
  componentName: string;
  sourceFile: string;
  category: string;
  menuEntryPath: string;
  windowIndex: number;
  windowCount: number;
  tabIndex: number;
  tabCount: number;
  tabLabel?: string;
  usesUnderlineTabs: boolean;
  storeOverrides?: Record<string, Record<string, unknown>>;
  activeProps: Record<string, unknown>;
  preset: PresetConfig;
}

export interface BuildFloatingPlaylistOptions {
  presets?: readonly PresetConfig[];
  subTabFilter?: FloatingSubTabExpansionMode;
  route?: ActiveMenuRoute;
}

export const REPLAY_DIRECTOR_TUNER_TABS: FloatingWindowTabMeta[] = [
  { id: 'framing', label: 'Corridor & Damping' },
  { id: 'lookahead', label: '2-Touch Lookahead' },
  { id: 'slowmo', label: 'Slow-Mo Windows' },
];

export const SPATIAL_AUDIO_TUNER_TABS: FloatingWindowTabMeta[] = [
  { id: 'distance', label: '3D Distance Profiles & Gizmo' },
  { id: 'reverb', label: 'Stadium Reverb & BGM Transition' },
];

export const STATIC_TRAINING_BALL_CAM_TABS: FloatingWindowTabMeta[] = [
  { id: 'arrow', label: '1. Direction Arrow & Expire' },
  { id: 'ballcam', label: '2. Ball Cam & Edit Opacity' },
];

export const GOAL_VOLUME_TUNER_TABS: FloatingWindowTabMeta[] = [
  { id: 'ball_rim_fx', label: 'Ball Rim FX' },
  { id: 'hitbox', label: 'Hitbox Bounds' },
];

/**
 * Floating windows whose internal sub-tabs are driven by the `UnderlineTabs` primitive.
 */
export const UNDERLINE_TABS_FLOATING_WINDOW_IDS: ReadonlySet<string> = new Set([
  'vehicle-model-offset-tuner',
  'vehicle-global-fx-tuner',
  'atmosphere-fx-tuner',
  'subsystem-isolation-lab',
  'replay-director-tuner',
]);

/**
 * Canonical sub-tab registry covering both `UnderlineTabs` floating windows and
 * multi-variant dev tuners declared via `SURFACE_META.variants`.
 */
export const CANONICAL_FLOATING_WINDOW_SUBTABS: Readonly<
  Record<string, FloatingWindowTabMeta[]>
> = {
  'vehicle-model-offset-tuner': VEHICLE_OFFSET_TABS,
  'vehicle-global-fx-tuner': VEHICLE_GLOBAL_FX_TABS,
  'atmosphere-fx-tuner': ATMOSPHERE_FX_TABS,
  'subsystem-isolation-lab': SUBSYSTEM_ISOLATION_LAB_TABS,
  'replay-director-tuner': REPLAY_DIRECTOR_TUNER_TABS,
  'boost-pad-tuner': BOOST_PAD_TUNER_TABS,
  'driftwoods-tuner': DRIFTWOODS_TUNER_TABS,
  'spatial-audio-tuner': SPATIAL_AUDIO_TUNER_TABS,
  'static-training-ball-cam-tuner': STATIC_TRAINING_BALL_CAM_TABS,
  'goal-volume-tuner': GOAL_VOLUME_TUNER_TABS,
};

export function resolveFloatingPresetSubTabs(
  preset: PresetConfig,
  subTabFilter: FloatingSubTabExpansionMode = 'all'
): FloatingWindowTabMeta[] {
  if (subTabFilter === 'none') return [];
  if (
    subTabFilter === 'underline-tabs-only' &&
    !UNDERLINE_TABS_FLOATING_WINDOW_IDS.has(preset.id)
  ) {
    return [];
  }

  if (preset.tabs && preset.tabs.length > 0) {
    return preset.tabs;
  }

  const canonical = CANONICAL_FLOATING_WINDOW_SUBTABS[preset.id];
  if (canonical && canonical.length > 0) {
    return canonical;
  }

  const discovered = getDiscoveredFloatingSurfaces().find(
    (entry) => entry.meta.id === `floating:${preset.id}` || entry.meta.id === preset.id
  );
  if (discovered?.meta.variants && discovered.meta.variants.length > 0) {
    return discovered.meta.variants.map((v) => ({
      id: v.variantId,
      label: v.label,
    }));
  }

  return [];
}

function buildFloatingBreadcrumb(
  preset: PresetConfig,
  tier: FloatingWindowVisibilityTier,
  tabLabel?: string
): string {
  const base =
    preset.menuEntryPath ||
    `Floating Window (${tier === 'user' ? 'User' : 'Developer'}) > ${preset.category}`;
  return tabLabel
    ? `${base} > ${preset.title} > ${tabLabel}`
    : `${base} > ${preset.title}`;
}

/**
 * Generates a flattened linear inspection sequence for Floating Windows and their
 * internal `UnderlineTabs` / variant sub-tabs. Each returned unit extends
 * `LinearPlaylistStep` so it can be seamlessly appended to Menu playlists.
 */
export function buildFloatingWindowsLinearPlaylist(
  tier: FloatingWindowVisibilityTier,
  options: BuildFloatingPlaylistOptions = {}
): FloatingWindowPlaylistUnit[] {
  const sourcePresets =
    options.presets ?? (tier === 'user' ? USER_PRESET_WINDOWS : DEV_PRESET_WINDOWS);
  const subTabFilter = options.subTabFilter ?? 'all';
  const route: ActiveMenuRoute = options.route ?? 'layer-0';
  const tierPrefix = tier === 'user' ? 'U' : 'D';
  const idTierSlug = tier === 'user' ? 'user' : 'dev';
  const windowCount = sourcePresets.length;
  const discoveredList = getDiscoveredFloatingSurfaces();

  const units: FloatingWindowPlaylistUnit[] = [];

  sourcePresets.forEach((rawPreset, windowIndex) => {
    const tabs = resolveFloatingPresetSubTabs(rawPreset, subTabFilter);
    const preset: PresetConfig =
      tabs.length > 0 && (!rawPreset.tabs || rawPreset.tabs.length === 0)
        ? { ...rawPreset, tabs }
        : rawPreset;

    const baseRefCode = `6D.${tierPrefix}${windowIndex + 1}`;
    const surfaceId = `floating:${preset.id}`;
    const componentName = preset.component || preset.id;
    const sourceFile =
      preset.sourcePath ||
      `src/ui-core/panels/${tier === 'user' ? 'user' : 'dev'}/${componentName}.tsx`;
    const menuEntryPath =
      preset.menuEntryPath ||
      (tier === 'user'
        ? 'Layer 0 HUD -> Top-Right Quick Stack'
        : 'Settings -> Developer -> Active Tuners');
    const usesUnderlineTabs = UNDERLINE_TABS_FLOATING_WINDOW_IDS.has(preset.id);

    const discovered = discoveredList.find(
      (entry) => entry.meta.id === surfaceId || entry.meta.id === preset.id
    );

    if (tabs.length > 0) {
      tabs.forEach((tab, tabIndex) => {
        const variantMeta = discovered?.meta.variants?.find(
          (v) => v.variantId === tab.id
        );
        const variantId = tab.id;
        units.push({
          kind: 'floating-window',
          id: `fw-${idTierSlug}-${preset.id}-${tab.id}`,
          route,
          label: `${preset.title} · [${tab.label}] (${tabIndex + 1}/${tabs.length})`,
          layer: 0,
          breadcrumb: buildFloatingBreadcrumb(preset, tier, tab.label),
          subtab: tab.id,
          tier,
          windowId: preset.id,
          surfaceId,
          variantId,
          unitKey: `${surfaceId}::${variantId}`,
          stateId: `${preset.id}:${tab.id}`,
          referenceCode: `${baseRefCode}.${tabIndex + 1}`,
          componentName,
          sourceFile,
          category: preset.category,
          menuEntryPath,
          windowIndex,
          windowCount,
          tabIndex,
          tabCount: tabs.length,
          tabLabel: tab.label,
          usesUnderlineTabs,
          storeOverrides: variantMeta?.storeOverrides,
          activeProps: {
            windowId: preset.id,
            tier,
            activeTab: tab.id,
          },
          preset,
        });
      });
      return;
    }

    units.push({
      kind: 'floating-window',
      id: `fw-${idTierSlug}-${preset.id}`,
      route,
      label: preset.title,
      layer: 0,
      breadcrumb: buildFloatingBreadcrumb(preset, tier),
      tier,
      windowId: preset.id,
      surfaceId,
      variantId: 'default',
      unitKey: `${surfaceId}::default`,
      stateId: `${preset.id}:default`,
      referenceCode: baseRefCode,
      componentName,
      sourceFile,
      category: preset.category,
      menuEntryPath,
      windowIndex,
      windowCount,
      tabIndex: 0,
      tabCount: 1,
      usesUnderlineTabs,
      activeProps: {
        windowId: preset.id,
        tier,
      },
      preset,
    });
  });

  return units;
}

export const USER_FLOATING_LINEAR_PLAYLIST: FloatingWindowPlaylistUnit[] =
  buildFloatingWindowsLinearPlaylist('user');

export const DEV_FLOATING_LINEAR_PLAYLIST: FloatingWindowPlaylistUnit[] =
  buildFloatingWindowsLinearPlaylist('developer');

export const DEV_UNDERLINE_TABS_FLOATING_LINEAR_PLAYLIST: FloatingWindowPlaylistUnit[] =
  buildFloatingWindowsLinearPlaylist('developer', {
    subTabFilter: 'underline-tabs-only',
  });

export const ALL_FLOATING_LINEAR_PLAYLIST: FloatingWindowPlaylistUnit[] = [
  ...USER_FLOATING_LINEAR_PLAYLIST,
  ...DEV_FLOATING_LINEAR_PLAYLIST,
];

export function isFloatingWindowPlaylistUnit(
  step: LinearPlaylistStep | FloatingWindowPlaylistUnit | null | undefined
): step is FloatingWindowPlaylistUnit {
  return Boolean(
    step &&
      'kind' in step &&
      (step as FloatingWindowPlaylistUnit).kind === 'floating-window'
  );
}

/**
 * Seamlessly appends flattened Floating Window inspection units onto the tail of
 * any Menu `LinearPlaylistStep[]` sequence (`USER_LINEAR_PLAYLIST` / `DEV_LINEAR_PLAYLIST`).
 */
export function appendFloatingWindowsToPlaylist<TStep extends LinearPlaylistStep>(
  menuPlaylist: readonly TStep[],
  tier: FloatingWindowVisibilityTier | 'all' = 'user',
  options?: BuildFloatingPlaylistOptions
): Array<TStep | FloatingWindowPlaylistUnit> {
  if (tier === 'all') {
    const userUnits = options
      ? buildFloatingWindowsLinearPlaylist('user', options)
      : USER_FLOATING_LINEAR_PLAYLIST;
    const devUnits = options
      ? buildFloatingWindowsLinearPlaylist('developer', options)
      : DEV_FLOATING_LINEAR_PLAYLIST;
    return [...menuPlaylist, ...userUnits, ...devUnits];
  }

  const floatingUnits = options
    ? buildFloatingWindowsLinearPlaylist(tier, options)
    : tier === 'user'
    ? USER_FLOATING_LINEAR_PLAYLIST
    : DEV_FLOATING_LINEAR_PLAYLIST;

  return [...menuPlaylist, ...floatingUnits];
}

export function findFloatingPlaylistUnitIndex(
  playlist: readonly FloatingWindowPlaylistUnit[],
  selectedWindowId: string,
  activeSubTab?: string
): number {
  if (playlist.length === 0) return 0;

  if (activeSubTab) {
    const exactIdx = playlist.findIndex(
      (u) => u.windowId === selectedWindowId && u.subtab === activeSubTab
    );
    if (exactIdx !== -1) return exactIdx;
  }

  const windowFirstIdx = playlist.findIndex((u) => u.windowId === selectedWindowId);
  return windowFirstIdx !== -1 ? windowFirstIdx : 0;
}

export function findFloatingPlaylistUnitByKey(
  playlist: readonly FloatingWindowPlaylistUnit[],
  unitKeyOrStateId: string
): FloatingWindowPlaylistUnit | undefined {
  return playlist.find(
    (u) =>
      u.unitKey === unitKeyOrStateId ||
      u.stateId === unitKeyOrStateId ||
      u.id === unitKeyOrStateId
  );
}
