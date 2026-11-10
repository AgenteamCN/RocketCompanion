/**
 * vehicleTunerConfig.ts
 * Pure configuration data, descriptors, and runtime tuning state for vehicles, wheels, anodized paint, and boost particles.
 */

import {
  DEFAULT_LAMPS_CONFIG,
  DEFAULT_SURFACE_MATERIALS,
  INSIDIO_DESCRIPTOR,
  RYZA_DESCRIPTOR,
  normalizeWheelModifierPatch,
  type BoostNozzleArrangement,
  type VehicleSurfaceMaterialSlot,
  type VehicleLampsConfig,
  type VehicleDescriptor,
  type WheelModifierConfig,
} from './vehicleDescriptorsConfig';
import {
  BREAKOUT_MINI_DESCRIPTOR,
  DOMINUS_DESCRIPTOR,
  EXTENDED_VEHICLE_DESCRIPTORS,
  MERC_DESCRIPTOR,
  SENTINEL_DESCRIPTOR,
  TRIOCTANE_DESCRIPTOR,
  TRIOCTANE_THREEWHEEL_DESCRIPTOR,
  VEHICLE_ALIGN_PRESET_OPTIONS,
  type VehicleAlignPresetOption,
} from './vehicleExtendedDescriptorsConfig';
import { registerDynamicVisualId } from './vehicleConstants';

export type {
  BoostNozzleArrangement,
  VehicleSurfaceMaterialSlot,
  VehicleLampsConfig,
  VehicleDescriptor,
  WheelModifierConfig,
  VehicleAlignPresetOption,
};

export const GLOBAL_VEHICLE_SURFACE_MATERIALS: Record<string, VehicleSurfaceMaterialSlot> = {
  body: DEFAULT_SURFACE_MATERIALS.body,
  window: DEFAULT_SURFACE_MATERIALS.window,
  border: DEFAULT_SURFACE_MATERIALS.border,
  bottom: DEFAULT_SURFACE_MATERIALS.bottom,
  metal: DEFAULT_SURFACE_MATERIALS.metal,
};

export const GLOBAL_VEHICLE_LAMPS_CONFIG: VehicleLampsConfig = {
  ...DEFAULT_LAMPS_CONFIG,
};

export const FENNEC_DESCRIPTOR: VehicleDescriptor = {
  id: 'fennec',
  name: 'Fennec',
  hitboxPreset: 'hitbox-octane',
  modelUrl: '/assets/vehicles/Fennec.glb',
  unitScale: 1,
  rawBounds: {
    min: [-62.3896, -13.8302, -35.7124],
    max: [78.0319, 33.4147, 35.7124],
    length: 140.4215,
    height: 47.2449,
    width: 71.4248,
    center: [7.8212, 9.7923, 0],
    roofTopY: 33.4147,
    rlHitboxTopY: 38.8346,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [-0.1, 1.6, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [48.55, 26.9291, 12.5],
    [48.55, -26.9291, 12.5],
    [-36.68, 28.6221, 15.0],
    [-36.68, -28.6221, 15.0],
  ],
  suspensionHeights: [-4.5, -4.5, -2.0, -2.0],
  boostOutlets: [
    [-57.97, 10.57, 19.62],
    [-57.97, 10.57, -19.62],
  ],
  boostNozzleParams: {
    x: -57.87,
    y: 8.97,
    z: 19.62,
    followChassisOffset: true,
  },
  surfaceMaterials: GLOBAL_VEHICLE_SURFACE_MATERIALS,
  lampsConfig: GLOBAL_VEHICLE_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const DEFAULT_TEAM_COLORS = [3111891, 13857839];
export const DEFAULT_PLAYER_TEAM_INDEX = 0;

export interface VehiclePaintFinishPreset {
  mode: string;
  metalness: number;
  roughness: number;
}

export const VEHICLE_PAINT_FINISH_PRESETS: Record<string, VehiclePaintFinishPreset> = {
  matte: {
    mode: 'standard',
    metalness: 0.5,
    roughness: 0.85,
  },
  metallic: {
    mode: 'standard',
    metalness: 0.7,
    roughness: 0.45,
  },
};

export function applyVehiclePaintFinishPreset(finish: string): VehicleSurfaceMaterialSlot {
  const preset = VEHICLE_PAINT_FINISH_PRESETS[finish];
  if (preset && GLOBAL_VEHICLE_SURFACE_MATERIALS.body) {
    GLOBAL_VEHICLE_SURFACE_MATERIALS.body.mode = preset.mode;
    GLOBAL_VEHICLE_SURFACE_MATERIALS.body.metalness = preset.metalness;
    GLOBAL_VEHICLE_SURFACE_MATERIALS.body.roughness = preset.roughness;
  }
  return GLOBAL_VEHICLE_SURFACE_MATERIALS.body;
}

export function getActiveVehiclePaintFinishPreset(): 'matte' | 'metallic' {
  const body = GLOBAL_VEHICLE_SURFACE_MATERIALS.body;
  if (
    body &&
    Math.abs((body.metalness ?? 0.7) - VEHICLE_PAINT_FINISH_PRESETS.matte.metalness) < 0.05 &&
    Math.abs((body.roughness ?? 0.45) - VEHICLE_PAINT_FINISH_PRESETS.matte.roughness) < 0.05
  ) {
    return 'matte';
  }
  return 'metallic';
}

const vehicleRegistry = new Map<string, VehicleDescriptor>();

export function registerVehicleDescriptor(descriptor: VehicleDescriptor): void {
  if (!descriptor || !descriptor.id) {
    throw new Error("Vehicle descriptor must include a valid unique 'id'");
  }
  descriptor.surfaceMaterials = GLOBAL_VEHICLE_SURFACE_MATERIALS;
  descriptor.lampsConfig = GLOBAL_VEHICLE_LAMPS_CONFIG;
  const normalizedId = descriptor.id.toLowerCase().trim();
  vehicleRegistry.set(normalizedId, descriptor);
  registerDynamicVisualId(
    normalizedId,
    descriptor.threeWheels ? 'hitbox-psyclops' : descriptor.hitboxPreset
  );
  if (descriptor.aliases && Array.isArray(descriptor.aliases)) {
    for (const alias of descriptor.aliases) {
      vehicleRegistry.set(alias, descriptor);
    }
  }
}

for (const baseDesc of [FENNEC_DESCRIPTOR, INSIDIO_DESCRIPTOR, RYZA_DESCRIPTOR, ...EXTENDED_VEHICLE_DESCRIPTORS]) {
  registerVehicleDescriptor(baseDesc);
}

export function getVehicleDescriptor(id: string): VehicleDescriptor | null {
  return vehicleRegistry.get(String(id || '').toLowerCase().trim()) || null;
}

export function getAllVehicleDescriptors(): VehicleDescriptor[] {
  const unique = new Set(vehicleRegistry.values());
  return Array.from(unique);
}

export function hasVehicleDescriptor(id: string): boolean {
  return vehicleRegistry.has(String(id || '').toLowerCase().trim());
}

export function recomputeDescriptorBoostOutlets(
  descriptor: VehicleDescriptor | null | undefined
): [number, number, number][] | undefined {
  if (!descriptor) return undefined;
  registerDynamicVisualId(
    descriptor.id,
    descriptor.threeWheels ? 'hitbox-psyclops' : descriptor.hitboxPreset
  );
  if (!descriptor.boostNozzleParams) return descriptor.boostOutlets;
  const { x, y, z, followChassisOffset, arrangement = 'horizontal', verticalSpacing = 16.2 } =
    descriptor.boostNozzleParams;
  const offsetX = followChassisOffset ? (descriptor.alignment?.centerOffset?.[0] ?? 0) : 0;
  const offsetY = followChassisOffset ? (descriptor.alignment?.centerOffset?.[1] ?? 0) : 0;
  const offsetZ = followChassisOffset ? (descriptor.alignment?.centerOffset?.[2] ?? 0) : 0;

  if (arrangement === 'vertical') {
    const spacing = Number.isFinite(verticalSpacing) ? verticalSpacing : 16.2;
    descriptor.boostOutlets = [
      [Number((x + offsetX).toFixed(3)), Number((y + offsetY).toFixed(3)), Number((z + offsetZ).toFixed(3))],
      [Number((x + offsetX).toFixed(3)), Number((y + spacing + offsetY).toFixed(3)), Number((z + offsetZ).toFixed(3))],
    ];
  } else {
    descriptor.boostOutlets = [
      [Number((x + offsetX).toFixed(3)), Number((y + offsetY).toFixed(3)), Number((z + offsetZ).toFixed(3))],
      [Number((x + offsetX).toFixed(3)), Number((y + offsetY).toFixed(3)), Number((-z + offsetZ).toFixed(3))],
    ];
  }
  return descriptor.boostOutlets;
}

export const DEFAULT_BORDER_OVERRIDE_COLOR = '#ff40ff';

export interface VehicleTunerRuntimeFlags {
  activeVehicleId: string;
  colorOverride: boolean;
  borderColorOverride: boolean;
  borderOverrideColor: string;
  forceBoostPreview: boolean;
  forceBrakeLightPreview: boolean;
  brakePreviewMode: string;
  showNozzleGizmos: boolean;
  showWheelWire: boolean;
  [key: string]: unknown;
}

export const DEFAULT_VEHICLE_TUNER_FLAGS_CONFIG: VehicleTunerRuntimeFlags = {
  activeVehicleId: 'fennec',
  colorOverride: false,
  borderColorOverride: false,
  borderOverrideColor: DEFAULT_BORDER_OVERRIDE_COLOR,
  forceBoostPreview: false,
  forceBrakeLightPreview: false,
  brakePreviewMode: 'auto',
  showNozzleGizmos: false,
  showWheelWire: false,
};

export const vehicleTunerRuntimeFlags: VehicleTunerRuntimeFlags = {
  ...DEFAULT_VEHICLE_TUNER_FLAGS_CONFIG,
};

export function getVehicleTunerRuntimeFlags(): VehicleTunerRuntimeFlags {
  return { ...vehicleTunerRuntimeFlags };
}

export function setVehicleTunerRuntimeFlags(
  patch: Partial<VehicleTunerRuntimeFlags> = {}
): VehicleTunerRuntimeFlags {
  Object.assign(vehicleTunerRuntimeFlags, patch);
  return getVehicleTunerRuntimeFlags();
}

export const DEFAULT_WHEEL_MODIFIER_CONFIG: WheelModifierConfig = {
  mode: 'solid-cylinder',
  width: 6,
  radiusScale: 1,
  verticalOffsetY: 0,
  outerRimRadiusPct: 80,
  outerColor: '#737373',
  innerColor: '#000000',
  treadColor: '#000000',
  treadShaderMode: 'standard',
  treadRoughness: 1,
  treadMetalness: 0,
  sideShaderMode: 'standard',
  sideRoughness: 0.5,
  sideMetalness: 0.7,
  innerRimFollowsOuter: true,
  innerRimRadiusPct: 80,
  innerRimColor: '#737373',
  innerRimShaderMode: 'standard',
  innerRimRoughness: 0.5,
  innerRimMetalness: 0.7,
  innerShaderMode: 'standard',
  innerRoughness: 1,
  innerMetalness: 0,
  shaderMode: 'standard',
  roughness: 1,
  metalness: 0,
};

export const wheelModifierRuntimeConfig: WheelModifierConfig = {
  ...DEFAULT_WHEEL_MODIFIER_CONFIG,
};

export function getWheelModifierConfig(): WheelModifierConfig {
  return { ...wheelModifierRuntimeConfig };
}

export function setWheelModifierConfig(
  patch: Partial<WheelModifierConfig> = {}
): WheelModifierConfig {
  if (!patch) return getWheelModifierConfig();
  Object.assign(
    wheelModifierRuntimeConfig,
    normalizeWheelModifierPatch(patch, wheelModifierRuntimeConfig)
  );
  return getWheelModifierConfig();
}

export interface AnodizedPaintTuning {
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  envMapIntensity: number;
  pearlFresnelPower: number;
  pearlBlendStrength: number;
  [key: string]: unknown;
}

export const DEFAULT_ANODIZED_PAINT_CONFIG: AnodizedPaintTuning = {
  roughness: 0.04,
  metalness: 0.76,
  clearcoat: 1.0,
  clearcoatRoughness: 0.11,
  sheen: 0.7,
  sheenRoughness: 0.24,
  envMapIntensity: 1.4,
  pearlFresnelPower: 1.35,
  pearlBlendStrength: 0.82,
};

export const anodizedPaintTuning: AnodizedPaintTuning = {
  ...DEFAULT_ANODIZED_PAINT_CONFIG,
};

type AnodizedPaintListener = (patch: Partial<AnodizedPaintTuning>, state: AnodizedPaintTuning) => void;
const anodizedPaintCallbacks: AnodizedPaintListener[] = [];

export function subscribeAnodizedPaintTuning(listener: AnodizedPaintListener): () => void {
  if (typeof listener !== 'function') return () => {};
  if (!anodizedPaintCallbacks.includes(listener)) {
    anodizedPaintCallbacks.push(listener);
  }
  return () => {
    const idx = anodizedPaintCallbacks.indexOf(listener);
    if (idx !== -1) anodizedPaintCallbacks.splice(idx, 1);
  };
}

export function getAnodizedPaintTuning(): AnodizedPaintTuning {
  return { ...anodizedPaintTuning };
}

export function updateAnodizedPaintTuning(
  patch: Partial<AnodizedPaintTuning> = {}
): AnodizedPaintTuning {
  if (!patch) return anodizedPaintTuning;
  Object.assign(anodizedPaintTuning, patch);
  for (const listener of anodizedPaintCallbacks) {
    try {
      listener(patch, anodizedPaintTuning);
    } catch (err) {
      console.warn('[vehicleTunerConfig] Anodized paint listener threw an error:', err);
    }
  }
  return anodizedPaintTuning;
}

export interface BoostParticleRuntimeConfig {
  detailPreset: string;
  trailSpawnMultiplier: number;
  trailLifeMultiplier: number;
  dualStreamEnabled: boolean;
  shortTrailSpawnMultiplier: number;
  shortTrailLifetime: number;
  shortTrailScaleRefLife: number;
  longTrailSpawnMultiplier: number;
  longTrailLifetime: number;
  smoothStreamTransition: boolean;
  distanceDecayEnabled: boolean;
  distanceDecayFalloff: number;
  drivePuffsEnabled: boolean;
  pointLightEnabled: boolean;
  bloomEnabled: boolean;
  [key: string]: unknown;
}

export const DEFAULT_BOOST_PARTICLE_CONFIG: BoostParticleRuntimeConfig = {
  detailPreset: 'full',
  trailSpawnMultiplier: 1,
  trailLifeMultiplier: 1,
  dualStreamEnabled: true,
  shortTrailSpawnMultiplier: 1,
  shortTrailLifetime: 0.1,
  shortTrailScaleRefLife: 0.6,
  longTrailSpawnMultiplier: 0.1,
  longTrailLifetime: 2,
  smoothStreamTransition: true,
  distanceDecayEnabled: true,
  distanceDecayFalloff: 1200,
  drivePuffsEnabled: true,
  pointLightEnabled: false,
  bloomEnabled: false,
};

export const boostParticleRuntimeConfig: BoostParticleRuntimeConfig = {
  ...DEFAULT_BOOST_PARTICLE_CONFIG,
};

export function getBoostParticleRuntimeConfig(): BoostParticleRuntimeConfig {
  return { ...boostParticleRuntimeConfig };
}

const BOOST_PARTICLE_PRESETS: Record<string, Partial<BoostParticleRuntimeConfig>> = {
  none: {
    detailPreset: 'none',
    trailSpawnMultiplier: 0.0,
    trailLifeMultiplier: 0.5,
    shortTrailSpawnMultiplier: 0.0,
    longTrailSpawnMultiplier: 0.0,
    drivePuffsEnabled: false,
  },
  low: {
    detailPreset: 'low',
    trailSpawnMultiplier: 0.4,
    trailLifeMultiplier: 0.65,
    shortTrailSpawnMultiplier: 0.6,
    shortTrailLifetime: 0.1,
    shortTrailScaleRefLife: 0.6,
    longTrailSpawnMultiplier: 0.05,
    longTrailLifetime: 1.4,
    drivePuffsEnabled: false,
  },
  full: {
    detailPreset: 'full',
    trailSpawnMultiplier: 1,
    trailLifeMultiplier: 1,
    shortTrailSpawnMultiplier: 1,
    shortTrailLifetime: 0.1,
    shortTrailScaleRefLife: 0.6,
    longTrailSpawnMultiplier: 0.1,
    longTrailLifetime: 2,
    drivePuffsEnabled: true,
  },
};

export function setBoostParticleRuntimeConfig(
  patch: Partial<BoostParticleRuntimeConfig> = {}
): BoostParticleRuntimeConfig {
  if (!patch) return boostParticleRuntimeConfig;
  if (patch.detailPreset && BOOST_PARTICLE_PRESETS[patch.detailPreset]) {
    Object.assign(boostParticleRuntimeConfig, BOOST_PARTICLE_PRESETS[patch.detailPreset]);
  }
  Object.assign(boostParticleRuntimeConfig, patch);
  return boostParticleRuntimeConfig;
}

type VehicleTunerListener = (payload: Record<string, unknown>) => void;
const vehicleTunerCallbacks: VehicleTunerListener[] = [];

export function subscribeVehicleTunerConfig(listener: VehicleTunerListener): () => boolean {
  if (typeof listener !== 'function') return () => false;
  if (!vehicleTunerCallbacks.includes(listener)) {
    vehicleTunerCallbacks.push(listener);
  }
  return () => {
    const idx = vehicleTunerCallbacks.indexOf(listener);
    if (idx === -1) return false;
    vehicleTunerCallbacks.splice(idx, 1);
    return true;
  };
}

export function notifyVehicleTunerConfigChange(payload: Record<string, unknown> = {}): void {
  for (const fn of vehicleTunerCallbacks) {
    try {
      fn(payload);
    } catch (err) {
      console.warn('[vehicleTunerConfig] Listener error:', err);
    }
  }
}
