/**
 * vehicleExtendedDescriptorsConfig.ts
 * Extended custom GLB vehicle descriptors (Dominus, Breakout Mini, Sentinel, Merc, TriOctane 4W & 3W)
 * and canonical align preset options for custom GLB imports.
 */

import {
  DEFAULT_LAMPS_CONFIG,
  DEFAULT_SURFACE_MATERIALS,
  type VehicleDescriptor,
} from './vehicleDescriptorsConfig';

export const DOMINUS_DESCRIPTOR: VehicleDescriptor = {
  id: 'dominus',
  name: 'Dominus',
  aliases: ['hitbox-dominus'],
  hitboxPreset: 'hitbox-dominus',
  modelUrl: '/assets/vehicles/Dominus.glb',
  unitScale: 100,
  rawBounds: {
    min: [-61.6034, -15.7377, -36.2564],
    max: [89.685, 23.4339, 36.2564],
    length: 151.2884,
    height: 39.1716,
    width: 72.5128,
    center: [14.0408, 3.8481, 0],
    roofTopY: 23.4339,
    rlHitboxTopY: 31.4,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0, 0, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [50.3, 31.1, 12.0],
    [50.3, -31.1, 12.0],
    [-34.75, 33.0, 13.5],
    [-34.75, -33.0, 13.5],
  ],
  suspensionHeights: [-5.0, -5.0, -3.5, -3.5],
  boostOutlets: [
    [-59.5, 9.0, 14.0],
    [-59.5, 9.0, -14.0],
  ],
  boostNozzleParams: {
    x: -59.5,
    y: 9.0,
    z: 14.0,
    followChassisOffset: true,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const BREAKOUT_MINI_DESCRIPTOR: VehicleDescriptor = {
  id: 'breakout-mini',
  name: 'Breakout',
  aliases: ['hitbox-breakout', 'breakout', 'breakout-mini'],
  hitboxPreset: 'hitbox-breakout',
  modelUrl: '/assets/vehicles/BreakoutMini.glb',
  unitScale: 100,
  rawBounds: {
    min: [-59.7453, -14.7932, -37.6101],
    max: [88.7865, 25.8463, 37.6101],
    length: 148.5318,
    height: 40.6395,
    width: 75.2202,
    center: [14.5206, 5.5265, 0],
    roofTopY: 25.8463,
    rlHitboxTopY: 26.9,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0, 0, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [51.5, 26.67, 13.5],
    [51.5, -26.67, 13.5],
    [-35.75, 35.0, 15.0],
    [-35.75, -35.0, 15.0],
  ],
  suspensionHeights: [-3.5, -3.5, -2.0, -2.0],
  boostOutlets: [
    [-58.0, 9.5, 13.5],
    [-58.0, 9.5, -13.5],
  ],
  boostNozzleParams: {
    x: -58.0,
    y: 9.5,
    z: 13.5,
    followChassisOffset: true,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const SENTINEL_DESCRIPTOR: VehicleDescriptor = {
  id: 'sentinel',
  name: 'Sentinel',
  aliases: ['hitbox-plank', 'plank', 'batmobile'],
  hitboxPreset: 'hitbox-plank',
  modelUrl: '/assets/vehicles/Sentinel.glb',
  unitScale: 1,
  rawBounds: {
    min: [-71.9404, -16.8246, -43.7327],
    max: [94.1954, 26.9212, 43.7327],
    length: 166.1358,
    height: 43.7458,
    width: 87.4654,
    center: [11.1275, 5.0483, 0],
    roofTopY: 26.9212,
    rlHitboxTopY: 26.7914,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0, 0, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [49.97, 27.8, 12.5],
    [49.97, -27.8, 12.5],
    [-35.43, 20.28, 17.0],
    [-35.43, -20.28, 17.0],
  ],
  suspensionHeights: [-4.5, -4.5, 0.0, 0.0],
  boostOutlets: [
    [-68.0, 9.0, 16.0],
    [-68.0, 9.0, -16.0],
  ],
  boostNozzleParams: {
    x: -68.0,
    y: 9.0,
    z: 16.0,
    followChassisOffset: true,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 3115263,
      realisticPrimary: 3115263,
      pearl: 58879,
    },
  },
};

export const MERC_DESCRIPTOR: VehicleDescriptor = {
  id: 'merc',
  name: 'Merc',
  aliases: ['hitbox-merc'],
  hitboxPreset: 'hitbox-merc',
  modelUrl: '/assets/vehicles/Merc.glb',
  unitScale: 100,
  rawBounds: {
    min: [-68.4128, -11.6281, -34.3157],
    max: [72.7533, 50.5637, 34.3157],
    length: 141.1661,
    height: 62.1918,
    width: 68.6314,
    center: [2.1702, 19.4678, 0],
    roofTopY: 50.5637,
    rlHitboxTopY: 42.3346,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [-0.3, -1.5, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [38.0, 28.0, 15.0],
    [38.0, -28.0, 15.0],
    [-40.0, 29.5, 15.0],
    [-40.0, -29.5, 15.0],
  ],
  suspensionHeights: [-2.0, -2.0, -2.0, -2.0],
  boostOutlets: [
    [-63.9, 12.7, 0],
    [-63.9, 28.9, 0],
  ],
  boostNozzleParams: {
    x: -63.6,
    y: 14.2,
    z: 0,
    followChassisOffset: true,
    arrangement: 'vertical',
    verticalSpacing: 16.2,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const OCTANE_DESCRIPTOR: VehicleDescriptor = {
  id: 'octane',
  name: 'Octane',
  aliases: ['hitbox-octane'],
  hitboxPreset: 'hitbox-octane',
  modelUrl: '/assets/vehicles/Octane.glb',
  unitScale: 100,
  threeWheels: false,
  rawBounds: {
    min: [-60.3644, -11.1058, -36.2809],
    max: [78.7407, 43.529, 36.2809],
    length: 139.1051,
    height: 54.6348,
    width: 72.5618,
    center: [9.1882, 16.2116, 0],
    roofTopY: 43.529,
    rlHitboxTopY: 38.8346,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0, 0, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [51.25, 25.9, 12.5],
    [51.25, -25.9, 12.5],
    [-33.75, 29.5, 15.0],
    [-33.75, -29.5, 15.0],
  ],
  suspensionHeights: [-4.5, -4.5, -2.0, -2.0],
  boostOutlets: [
    [-50.5, 14.5, 10.0],
    [-50.5, 14.5, -10.0],
  ],
  boostNozzleParams: {
    x: -50.5,
    y: 14.5,
    z: 10.0,
    followChassisOffset: true,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const TRIOCTANE_DESCRIPTOR: VehicleDescriptor = {
  id: 'trioctane',
  name: 'TriOctane4',
  aliases: ['trioctane4', 'trioctane-4w', 'trioctane-octane'],
  hitboxPreset: 'hitbox-octane',
  modelUrl: '/assets/vehicles/TriOctane.glb',
  unitScale: 100,
  threeWheels: false,
  rawBounds: {
    min: [-51.6243, -11.0974, -36.2123],
    max: [78.6808, 39.2486, 36.2533],
    length: 130.3051,
    height: 50.346,
    width: 72.4656,
    center: [13.5283, 14.0756, 0.0205],
    roofTopY: 39.2486,
    rlHitboxTopY: 38.8346,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0, 0, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [51.25, 25.9, 12.5],
    [51.25, -25.9, 12.5],
    [-33.75, 29.5, 15.0],
    [-33.75, -29.5, 15.0],
  ],
  suspensionHeights: [-4.5, -4.5, -2.0, -2.0],
  boostOutlets: [
    [-50.5, 14.5, 10.0],
    [-50.5, 14.5, -10.0],
  ],
  boostNozzleParams: {
    x: -50.5,
    y: 14.5,
    z: 10.0,
    followChassisOffset: true,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const TRIOCTANE_THREEWHEEL_DESCRIPTOR: VehicleDescriptor = {
  id: 'trioctane-threewheel',
  name: 'TriOctane3',
  aliases: ['hitbox-psyclops', 'psyclops', 'tricycle', 'trioctane3', 'trioctane-3w'],
  hitboxPreset: 'hitbox-octane',
  modelUrl: '/assets/vehicles/TriOctane.glb',
  unitScale: 100,
  threeWheels: true,
  rawBounds: {
    min: [-51.6243, -11.0974, -36.2123],
    max: [78.6808, 39.2486, 36.2533],
    length: 130.3051,
    height: 50.346,
    width: 72.4656,
    center: [13.5283, 14.0756, 0.0205],
    roofTopY: 39.2486,
    rlHitboxTopY: 38.8346,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0, 0, 0],
  },
  wheelNames: [
    'wheel-front-center',
    'wheel-front-unused',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [51.25, 0.0, 12.5],
    [51.25, 0.0, 12.5],
    [-33.75, 29.5, 15.0],
    [-33.75, -29.5, 15.0],
  ],
  suspensionHeights: [-4.5, -4.5, -2.0, -2.0],
  boostOutlets: [
    [-50.5, 14.5, 10.0],
    [-50.5, 14.5, -10.0],
  ],
  boostNozzleParams: {
    x: -50.5,
    y: 14.5,
    z: 10.0,
    followChassisOffset: true,
  },
  surfaceMaterials: DEFAULT_SURFACE_MATERIALS,
  lampsConfig: DEFAULT_LAMPS_CONFIG,
  colors: {
    default: {
      primary: 16734742,
      realisticPrimary: 16555020,
      pearl: 16724660,
    },
  },
};

export const EXTENDED_VEHICLE_DESCRIPTORS: readonly VehicleDescriptor[] = [
  OCTANE_DESCRIPTOR,
  DOMINUS_DESCRIPTOR,
  BREAKOUT_MINI_DESCRIPTOR,
  SENTINEL_DESCRIPTOR,
  MERC_DESCRIPTOR,
  TRIOCTANE_DESCRIPTOR,
  TRIOCTANE_THREEWHEEL_DESCRIPTOR,
];

export interface VehicleAlignPresetOption {
  id: string;
  label: string;
  description: string;
}

export const VEHICLE_ALIGN_PRESET_OPTIONS: readonly VehicleAlignPresetOption[] = [
  {
    id: 'auto',
    label: 'Auto (Auto-Fit Bounds)',
    description: 'Normalizes arbitrary GLB units to ~140 UU length and centers on active hitbox',
  },
  {
    id: 'fennec',
    label: 'Fennec (Octane, 1 UU)',
    description: 'Applies Fennec native UU scale (1x) and calibrated Octane offsets',
  },
  {
    id: 'octane',
    label: 'Octane (Octane, 100x Meter)',
    description: 'Applies Octane meter scale (100x) and calibrated Octane offsets',
  },
  {
    id: 'insidio',
    label: 'Insidio (Hybrid, 1 UU)',
    description: 'Applies Insidio native UU scale (1x) and calibrated Hybrid offsets',
  },
  {
    id: 'ryza',
    label: 'Ryza (Octane, 100x Meter)',
    description: 'Applies Ryza meter scale (100x) and calibrated Octane offsets',
  },
  {
    id: 'dominus',
    label: 'Dominus (Dominus, 100x Meter)',
    description: 'Applies Dominus meter scale (100x) and calibrated Dominus offsets',
  },
  {
    id: 'breakout-mini',
    label: 'Breakout (Breakout, 100x Meter)',
    description: 'Applies Breakout meter scale (100x) and calibrated Breakout offsets',
  },
  {
    id: 'sentinel',
    label: 'Sentinel (Plank, 1 UU)',
    description: 'Applies Sentinel native UU scale (1x) and calibrated Plank offsets',
  },
  {
    id: 'merc',
    label: 'Merc (Merc, 100x Meter)',
    description: 'Applies Merc meter scale (100x) and calibrated Merc offsets',
  },
  {
    id: 'trioctane',
    label: 'TriOctane4 (Octane, 100x Meter)',
    description: 'Applies TriOctane4 meter scale (100x) and 4-wheel Octane offsets',
  },
  {
    id: 'trioctane-threewheel',
    label: 'TriOctane3 (Three-Wheeler, 100x Meter)',
    description: 'Applies TriOctane3 meter scale (100x) and 3-wheel center-front offsets',
  },
];
