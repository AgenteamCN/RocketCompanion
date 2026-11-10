import {
  Activity,
  Bot,
  Box,
  Camera,
  Car,
  Crosshair,
  Database,
  Film,
  Keyboard,
  Palette,
  PencilRuler,
  Router,
  Sliders,
  Sparkles,
  Tag,
  Target,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  ATMOSPHERE_FX_TUNER_PRESET,
  BOOST_PAD_TUNER_PRESET,
  BOTS_LOADOUT_TUNER_PRESET,
  DEMOLISH_SHOCKWAVE_TUNER_PRESET,
  DIAGNOSTIC_DUMP_PRESET,
  DRIFTWOODS_TUNER_PRESET,
  ENGINE_AUDIO_TUNER_PRESET,
  GOAL_VOLUME_TUNER_PRESET,
  KEYBOARD_INPUT_OVERLAY_TUNER_PRESET,
  NAME_TAG_TUNER_PRESET,
  SPATIAL_AUDIO_TUNER_PRESET,
  STATIC_TRAINING_BALL_CAM_TUNER_PRESET,
  SUPERSONIC_TRAIL_TUNER_PRESET,
  VEHICLE_GLOBAL_FX_TUNER_PRESET,
  VEHICLE_MODEL_OFFSET_TUNER_PRESET,
} from '../../stores/devFloatingPresets';
import type { PresetConfig } from '../../stores/floatingPresets';
import { getDiscoveredFloatingSurfacesByMenuGroup as getDiscoveredSurfacesByMenuGroup } from '../../manifest/floatingSurfaceRegistry';
import type {
  DiscoveredSurfaceEntry,
  SurfaceMenuGroup,
} from '../../manifest/surfaceMetaTypes';
import {
  EXPERIMENTAL_AND_DIAGNOSTIC_TUNER_SPECS,
  type DevFloatingLauncherSpec,
  type DevIconComponent,
} from './devHubExperimentalCatalogEntries';

export type { DevFloatingLauncherSpec, DevIconComponent } from './devHubExperimentalCatalogEntries';

export const DEV_ICON_BY_NAME: Record<string, DevIconComponent> = {
  activity: Activity,
  bot: Bot,
  box: Box,
  camera: Camera,
  car: Car,
  crosshair: Crosshair,
  database: Database,
  film: Film,
  keyboard: Keyboard,
  palette: Palette,
  'pencil-ruler': PencilRuler,
  router: Router,
  sliders: Sliders,
  sparkles: Sparkles,
  tag: Tag,
  target: Target,
  volume2: Volume2,
  zap: Zap,
};

export function resolveBadgeClasses(
  tone: DevFloatingLauncherSpec['badgeTone'],
  isLight: boolean
): string {
  switch (tone) {
    case 'amber':
      return isLight
        ? 'bg-amber-500/15 border-amber-500/30 text-amber-700'
        : 'bg-amber-500/15 border-amber-500/30 text-amber-400';
    case 'emerald':
      return isLight
        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700'
        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
    case 'purple':
      return isLight
        ? 'bg-purple-500/15 border-purple-500/30 text-purple-700'
        : 'bg-purple-500/15 border-purple-500/30 text-purple-400';
    case 'rose':
      return isLight
        ? 'bg-rose-500/15 border-rose-500/30 text-rose-700'
        : 'bg-rose-500/15 border-rose-500/30 text-rose-400';
    case 'sky':
    default:
      return isLight
        ? 'bg-sky-500/15 border-sky-500/30 text-sky-700'
        : 'bg-sky-500/15 border-sky-500/30 text-sky-400';
  }
}

export const ACTIVE_TUNER_SPECS: DevFloatingLauncherSpec[] = [
  {
    id: DIAGNOSTIC_DUMP_PRESET.id,
    preset: DIAGNOSTIC_DUMP_PRESET,
    icon: Database,
    iconColor: 'text-sky-400',
    badge: 'Live Buffers · Anytime ZIP',
    badgeTone: 'sky',
    description:
      'Live Client Replay, Reconcile & Pacing Telemetry, and Authoritative Server Replay gauges + anytime mid-match dump',
    hoverTooltip:
      'Export Diagnostic Dump: Real-time buffer usage monitor with configurable capacity and one-click unified .zip export anytime via ESC.',
    section: 'primary',
  },
  {
    id: KEYBOARD_INPUT_OVERLAY_TUNER_PRESET.id,
    preset: KEYBOARD_INPUT_OVERLAY_TUNER_PRESET,
    icon: Keyboard,
    iconColor: 'text-emerald-400',
    badge: '3x3 Retro · 3D Nose Arrows',
    badgeTone: 'emerald',
    description:
      'Developer tuner for the 3x3 Keyboard Input Overlay (opacity superposition, trapezoid bevels, 3D WASD attitude arrows) and 4-way 3D Car Nose Arrows',
    hoverTooltip:
      'Keyboard Input Overlay Tuner: Calibrate 3x3 retro keycap geometry, opacity superposition, 3D camera-relative WASD arrows, and 4-way 3D Car Nose Arrows.',
    section: 'primary',
  },
  {
    id: BOTS_LOADOUT_TUNER_PRESET.id,
    preset: BOTS_LOADOUT_TUNER_PRESET,
    icon: Bot,
    iconColor: 'text-amber-400',
    badge: '3 GLB Default · Multi-Select',
    badgeTone: 'amber',
    description:
      'Multi-select randomizable Bot Loadout pool (3 GLB models default, Metallic paint, Cartoon boost, Standard boost audio, Random TrainStation anthem)',
    hoverTooltip:
      'Bots Loadout Tuner: Configure multi-select randomizable bot loadout pools for Exhibition and Auto-Fill.',
    section: 'primary',
  },
  {
    id: SPATIAL_AUDIO_TUNER_PRESET.id,
    preset: SPATIAL_AUDIO_TUNER_PRESET,
    icon: Volume2,
    iconColor: 'text-amber-400',
    badge: '2.0s Curve · Stadium Reverb',
    badgeTone: 'amber',
    description:
      'Stadium spatial acoustics (HPF 425Hz, LPF 3500Hz, Wet 69%, 3.0s Decay) & 2.0s directional non-linear transition curve',
    hoverTooltip:
      'Spatial Audio & Anthem Tuner: Live calibration for Player Anthem and Realistic Background Music stadium acoustics and 2.0s directional non-linear transitions.',
    section: 'primary',
  },
  {
    id: ENGINE_AUDIO_TUNER_PRESET.id,
    preset: ENGINE_AUDIO_TUNER_PRESET,
    icon: Volume2,
    iconColor: 'text-emerald-400',
    badge: 'Turtle Modem · 40-Slice REV',
    badgeTone: 'emerald',
    description:
      'Turtle Modem 40-slice granular REV powertrain synthesizer, RPM/gear/reverse physics, backfire pops & Entity Spawn SFX',
    hoverTooltip:
      'Engine Audio Tuner (Turtle Modem): Calibrate 1st gear accel (1000), reverse accel (300), linear drop (1400), rev-limit bounce (200@0.02s), backfire threshold (4000 RPM), and Entity Spawn SFX.',
    section: 'primary',
  },
  {
    id: STATIC_TRAINING_BALL_CAM_TUNER_PRESET.id,
    preset: STATIC_TRAINING_BALL_CAM_TUNER_PRESET,
    icon: Camera,
    iconColor: 'text-sky-400',
    badge: 'Ball Cam · Opacity Override',
    badgeTone: 'sky',
    description:
      'Relative ball camera (Distance, Height, Angle, Lateral Offset), Edit-Mode 70% Opacity Override & JSON Export',
    hoverTooltip:
      'Training Ball Camera & Opacity Tuner: Live slider + text input tuner for Static Training Pack relative ball camera and temporary Edit-Mode ball opacity override.',
    section: 'primary',
  },
  {
    id: VEHICLE_MODEL_OFFSET_TUNER_PRESET.id,
    preset: VEHICLE_MODEL_OFFSET_TUNER_PRESET,
    icon: Car,
    iconColor: 'text-amber-400',
    badge: 'Per-Model Offsets',
    badgeTone: 'amber',
    description:
      'Hitbox & Align, Per-Vehicle Wheel Hub Anchors & Dual Boost Exhaust Nozzle Offsets',
    hoverTooltip:
      'Vehicle Model & Offset Tuner: Per-vehicle spatial calibration for Fennec & Insidio (Hitbox archetype, Chassis Center Offset, Wheel Hub Anchors & Boost Nozzle Offsets).',
    section: 'primary',
  },
  {
    id: GOAL_VOLUME_TUNER_PRESET.id,
    preset: GOAL_VOLUME_TUNER_PRESET,
    icon: Box,
    iconColor: 'text-emerald-400',
    badge: '3D AABB · JSON Export',
    badgeTone: 'emerald',
    description:
      'Goal Volume Hitbox 3D wireframe overlay (default off), Standard & Throwback AABB calibration & JSON export',
    hoverTooltip:
      'Goal Volume Hitbox Active Tuner: Toggle the 3D Goal Volume & Ball-Center Trigger wireframe overlay, tune Standard & Throwback goal bounds, and export/import JSON.',
    section: 'primary',
  },
  {
    id: DEMOLISH_SHOCKWAVE_TUNER_PRESET.id,
    preset: DEMOLISH_SHOCKWAVE_TUNER_PRESET,
    icon: Sparkles,
    iconColor: 'text-amber-400',
    badge: 'Shockwave Ring · 3D XYZ Sim',
    badgeTone: 'amber',
    description:
      'Camera-facing radial shockwave ring (Outer Radius + Inner Hole % + 6-stop thermal fade), 120 FPS scrubber & 3D XYZ coordinate simulation',
    hoverTooltip:
      'Demolish Shockwave Active Tuner: Tune outer radius expansion, inner hole burn-through %, 6-stop color evolution, and trigger/scrub simulated explosions at any 3D Arena coordinate.',
    section: 'primary',
  },
  ...EXPERIMENTAL_AND_DIAGNOSTIC_TUNER_SPECS,
];

export const CALIBRATED_PRESET_SPECS: DevFloatingLauncherSpec[] = [
  {
    id: ATMOSPHERE_FX_TUNER_PRESET.id,
    preset: ATMOSPHERE_FX_TUNER_PRESET,
    icon: Sparkles,
    iconColor: 'text-sky-400',
    badge: 'Calibrated',
    badgeTone: 'sky',
    description:
      'Wall & Pulse (Cubic-Bezier Fade-Out Curve), Shadows, Full-Sphere Skybox & 70% Ball',
    hoverTooltip:
      'Atmosphere & FX Tuner: Calibrated 3D Ball-Wall Intersection Ring & Sonar Pulse, Single-Sun Sharp Shadows, Full-Sphere Cloudy Skybox & 70% Ball Opacity.',
  },
  {
    id: VEHICLE_GLOBAL_FX_TUNER_PRESET.id,
    preset: VEHICLE_GLOBAL_FX_TUNER_PRESET,
    icon: Car,
    iconColor: 'text-emerald-400',
    badge: 'Calibrated',
    badgeTone: 'emerald',
    description:
      'Universal Surfaces & Paint, Head/Brake Lamps, 3-Face Solid Cylinder Wheels & Boost FX',
    hoverTooltip:
      'Vehicle Global Surfaces & FX Tuner: Calibrated universal vehicle surface materials, headlamp/brake intensities, 7uu solid-cylinder wheels & dual-stream Gold Rush boost FX.',
  },
  {
    id: SUPERSONIC_TRAIL_TUNER_PRESET.id,
    preset: SUPERSONIC_TRAIL_TUNER_PRESET,
    icon: Zap,
    iconColor: 'text-purple-400',
    badge: 'Calibrated',
    badgeTone: 'purple',
    description:
      'Dual rear-wheel contact trail ribbons (-1t to -30t window, 3-stop White→Pink→Purple Bezier gradient, ground-hinge upright tilt & POV preview)',
    hoverTooltip:
      'Supersonic Wheel Trail Tuner: Calibrated dual rear-wheel contact trail ribbons (-1t to -30t history window, 3-stop White→Pink→Purple Bezier gradient, ground-hinge upright stand, dual-pass border occlusion & POV preview).',
  },
  {
    id: DRIFTWOODS_TUNER_PRESET.id,
    preset: DRIFTWOODS_TUNER_PRESET,
    icon: Palette,
    iconColor: 'text-emerald-400',
    badge: 'Calibrated',
    badgeTone: 'emerald',
    description:
      'Ground dynamic mask, 8-mesh PBR palette, 0.20 Hex Shield & Lite mode',
    hoverTooltip:
      'Driftwoods Stadium Tuner: Calibrated PBR material colors, ground dual-color mask, 0.20 shield hex grid opacity & Lite Lambert mode.',
  },
  {
    id: BOOST_PAD_TUNER_PRESET.id,
    preset: BOOST_PAD_TUNER_PRESET,
    icon: Sparkles,
    iconColor: 'text-amber-400',
    badge: 'Calibrated',
    badgeTone: 'amber',
    description:
      'Upward gradient opacity, midpoint falloff & Big Pad floating orb',
    hoverTooltip:
      'Boost Pad Visual Tuner: Calibrated upward opacity gradient falloff, midpoint calibration & Big Pad floating orb geometry.',
  },
  {
    id: NAME_TAG_TUNER_PRESET.id,
    preset: NAME_TAG_TUNER_PRESET,
    icon: Tag,
    iconColor: 'text-sky-400',
    badge: 'Calibrated',
    badgeTone: 'sky',
    description:
      '208×54 pill, γ=0.86 distance curve, 50UU+6px dual offset, 100% Retina overlay & 6-car kickoff arena',
    hoverTooltip:
      'Multiplayer Name Tag Tuner: Calibrated 208×54 horizontal pill name cards (Scale 0.04, γ=0.86, 50 UU world + 6 px screen offset, 100% independent Retina overlay render scale).',
  },
];

export function discoveredSurfaceToLauncherSpec(
  entry: DiscoveredSurfaceEntry,
  defaultSection: 'primary' | 'diagnostics' = 'diagnostics'
): DevFloatingLauncherSpec {
  const { meta, resolvedSizing } = entry;
  const preset: PresetConfig = {
    id: meta.id,
    title: meta.title,
    category: meta.menuGroup ?? 'DeveloperTuner',
    width: resolvedSizing.width,
    height: typeof resolvedSizing.height === 'number' ? resolvedSizing.height : 580,
    minWidth: resolvedSizing.minWidth,
    minHeight: resolvedSizing.minHeight ?? 200,
    resizable: true,
    singleton: true,
    tier: 'developer',
    summary: meta.description || meta.subtitle || meta.title,
    menuEntryPath: `Settings -> Developer -> ${meta.menuGroup ?? 'Active Tuners'}`,
    component: entry.Component.displayName || entry.Component.name || meta.id,
    sourcePath: entry.modulePath,
  };
  const iconKey = (meta.icon || '').toLowerCase();
  const IconComp = DEV_ICON_BY_NAME[iconKey] ?? Sliders;
  return {
    id: meta.id,
    preset,
    icon: IconComp,
    iconColor: meta.menuGroup === 'calibrated-presets' ? 'text-emerald-400' : 'text-sky-400',
    badge:
      meta.subtitle ||
      (meta.menuGroup === 'calibrated-presets' ? 'Calibrated' : undefined),
    badgeTone: meta.menuGroup === 'calibrated-presets' ? 'emerald' : 'sky',
    description: meta.description || meta.subtitle || meta.title,
    hoverTooltip: meta.description || meta.title,
    section: defaultSection,
  };
}

/**
 * Merges the canonical ordered specs for `menuGroup` with any newly added
 * `SURFACE_META` floating windows discovered via `import.meta.glob` in `surfaceRegistry.ts`.
 */
export function resolveMenuGroupLauncherSpecs(
  menuGroup: Extract<SurfaceMenuGroup, 'active-tuners' | 'calibrated-presets'>,
  baseSpecs: DevFloatingLauncherSpec[]
): DevFloatingLauncherSpec[] {
  const discovered = getDiscoveredSurfacesByMenuGroup(menuGroup);
  const discoveredById = new Map(discovered.map((d) => [d.meta.id, d]));

  const allDiscoveredFloating = [
    ...getDiscoveredSurfacesByMenuGroup('active-tuners'),
    ...getDiscoveredSurfacesByMenuGroup('calibrated-presets'),
    ...getDiscoveredSurfacesByMenuGroup('sandboxes'),
  ];
  const explicitGroupById = new Map(
    allDiscoveredFloating.map((d) => [d.meta.id, d.meta.menuGroup])
  );

  const merged: DevFloatingLauncherSpec[] = [];
  const seenIds = new Set<string>();

  for (const spec of baseSpecs) {
    const explicitGroup = explicitGroupById.get(spec.id);
    if (explicitGroup && explicitGroup !== menuGroup) {
      continue;
    }
    const disc = discoveredById.get(spec.id);
    if (disc) {
      merged.push({
        ...spec,
        preset: {
          ...spec.preset,
          title: disc.meta.title || spec.preset.title,
          width: disc.resolvedSizing.width,
          height:
            typeof disc.resolvedSizing.height === 'number'
              ? disc.resolvedSizing.height
              : spec.preset.height,
          minWidth: disc.resolvedSizing.minWidth ?? spec.preset.minWidth,
          minHeight: disc.resolvedSizing.minHeight ?? spec.preset.minHeight,
        },
        description: disc.meta.description || spec.description,
      });
    } else {
      merged.push(spec);
    }
    seenIds.add(spec.id);
  }

  for (const entry of discovered) {
    if (!seenIds.has(entry.meta.id)) {
      merged.push(discoveredSurfaceToLauncherSpec(entry));
      seenIds.add(entry.meta.id);
    }
  }

  return merged;
}
