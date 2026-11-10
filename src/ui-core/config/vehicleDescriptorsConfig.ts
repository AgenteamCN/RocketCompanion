export interface VehicleSurfaceMaterialSlot {
  slotName: string;
  label: string;
  mode: string;
  color: string;
  pearlColor: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  envMapIntensity: number;
  toonSteps: number;
  toonShadowMin: number;
  toonHighlightMax: number;
  toonSmooth: boolean;
  glbDefaultMetalness: number;
  glbDefaultRoughness: number;
}

export interface VehicleLampsConfig {
  frontColor: string;
  frontIntensity: number;
  frontToneMapped: boolean;
  tailIdleColor: string;
  tailIdleIntensity: number;
  brakeColor: string;
  brakeIntensity: number;
  brakeMinSpeed: number;
  brakeDecelEpsilon: number;
  tailToneMapped: boolean;
}

export type BoostNozzleArrangement = 'horizontal' | 'vertical';

export interface VehicleDescriptor {
  id: string;
  name: string;
  aliases?: string[];
  hitboxPreset: string;
  modelUrl: string;
  unitScale?: number;
  threeWheels?: boolean;
  rawBounds: {
    min: [number, number, number];
    max: [number, number, number];
    length: number;
    height: number;
    width: number;
    center: [number, number, number];
    roofTopY: number;
    rlHitboxTopY: number;
  };
  alignment: {
    scale: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    centerOffset: [number, number, number];
  };
  wheelNames: string[];
  wheelAnchors: [number, number, number][];
  suspensionHeights: [number, number, number, number];
  boostOutlets: [number, number, number][];
  boostNozzleParams: {
    x: number;
    y: number;
    z: number;
    followChassisOffset: boolean;
    arrangement?: BoostNozzleArrangement;
    verticalSpacing?: number;
  };
  surfaceMaterials: Record<string, VehicleSurfaceMaterialSlot>;
  lampsConfig: VehicleLampsConfig;
  colors: {
    default: {
      primary: number;
      realisticPrimary: number;
      pearl: number;
    };
  };
  [key: string]: unknown;
}

export interface WheelModifierConfig {
  mode: string;
  width: number;
  radiusScale: number;
  verticalOffsetY: number;
  outerRimRadiusPct: number;
  outerColor: string;
  innerColor: string;
  treadColor: string;
  treadShaderMode: string;
  treadRoughness: number;
  treadMetalness: number;
  sideShaderMode: string;
  sideRoughness: number;
  sideMetalness: number;
  innerRimFollowsOuter: boolean;
  innerRimRadiusPct: number;
  innerRimColor: string;
  innerRimShaderMode: string;
  innerRimRoughness: number;
  innerRimMetalness: number;
  innerShaderMode: string;
  innerRoughness: number;
  innerMetalness: number;
  shaderMode: string;
  roughness: number;
  metalness: number;
  [key: string]: unknown;
}

export function normalizeWheelModifierPatch(
  patch: Partial<WheelModifierConfig>,
  current: WheelModifierConfig
): Partial<WheelModifierConfig> {
  const nextConfig: Partial<WheelModifierConfig> = { ...patch };

  if (nextConfig.innerColor !== undefined && nextConfig.treadColor === undefined) {
    nextConfig.treadColor = nextConfig.innerColor;
  } else if (nextConfig.treadColor !== undefined && nextConfig.innerColor === undefined) {
    nextConfig.innerColor = nextConfig.treadColor;
  }

  if (nextConfig.innerShaderMode !== undefined && nextConfig.treadShaderMode === undefined) {
    nextConfig.treadShaderMode = nextConfig.innerShaderMode;
  } else if (nextConfig.treadShaderMode !== undefined && nextConfig.innerShaderMode === undefined) {
    nextConfig.innerShaderMode = nextConfig.treadShaderMode;
  }

  if (nextConfig.innerRoughness !== undefined && nextConfig.treadRoughness === undefined) {
    nextConfig.treadRoughness = nextConfig.innerRoughness;
  } else if (nextConfig.treadRoughness !== undefined && nextConfig.innerRoughness === undefined) {
    nextConfig.innerRoughness = nextConfig.treadRoughness;
  }

  if (nextConfig.innerMetalness !== undefined && nextConfig.treadMetalness === undefined) {
    nextConfig.treadMetalness = nextConfig.innerMetalness;
  } else if (nextConfig.treadMetalness !== undefined && nextConfig.innerMetalness === undefined) {
    nextConfig.innerMetalness = nextConfig.treadMetalness;
  }

  const hasExplicitSurfaceFields =
    nextConfig.treadShaderMode !== undefined ||
    nextConfig.sideShaderMode !== undefined ||
    nextConfig.innerShaderMode !== undefined ||
    nextConfig.innerRimShaderMode !== undefined ||
    nextConfig.treadRoughness !== undefined ||
    nextConfig.sideRoughness !== undefined ||
    nextConfig.innerRoughness !== undefined ||
    nextConfig.innerRimRoughness !== undefined ||
    nextConfig.treadMetalness !== undefined ||
    nextConfig.sideMetalness !== undefined ||
    nextConfig.innerMetalness !== undefined ||
    nextConfig.innerRimMetalness !== undefined;

  if (!hasExplicitSurfaceFields) {
    if (nextConfig.shaderMode !== undefined) {
      nextConfig.treadShaderMode = nextConfig.shaderMode;
      nextConfig.sideShaderMode = nextConfig.shaderMode;
      nextConfig.innerShaderMode = nextConfig.shaderMode;
      nextConfig.innerRimShaderMode = nextConfig.shaderMode;
    }
    if (nextConfig.roughness !== undefined) {
      nextConfig.treadRoughness = nextConfig.roughness;
      nextConfig.sideRoughness = nextConfig.roughness;
      nextConfig.innerRoughness = nextConfig.roughness;
      nextConfig.innerRimRoughness = nextConfig.roughness;
    }
    if (nextConfig.metalness !== undefined) {
      nextConfig.treadMetalness = nextConfig.metalness;
      nextConfig.sideMetalness = nextConfig.metalness;
      nextConfig.innerMetalness = nextConfig.metalness;
      nextConfig.innerRimMetalness = nextConfig.metalness;
    }
  }

  const shouldInnerFollowOuter =
    nextConfig.innerRimFollowsOuter !== undefined
      ? Boolean(nextConfig.innerRimFollowsOuter)
      : Boolean(current.innerRimFollowsOuter ?? true);

  if (shouldInnerFollowOuter) {
    const targetPct = nextConfig.outerRimRadiusPct ?? current.outerRimRadiusPct ?? 80;
    const targetColor = nextConfig.outerColor ?? current.outerColor ?? '#737373';
    const targetShader = nextConfig.sideShaderMode ?? current.sideShaderMode ?? 'standard';
    const targetRoughness = nextConfig.sideRoughness ?? current.sideRoughness ?? 0.5;
    const targetMetalness = nextConfig.sideMetalness ?? current.sideMetalness ?? 0.7;

    if (nextConfig.innerRimRadiusPct === undefined) nextConfig.innerRimRadiusPct = targetPct;
    if (nextConfig.innerRimColor === undefined) nextConfig.innerRimColor = targetColor;
    if (nextConfig.innerRimShaderMode === undefined) nextConfig.innerRimShaderMode = targetShader;
    if (nextConfig.innerRimRoughness === undefined) nextConfig.innerRimRoughness = targetRoughness;
    if (nextConfig.innerRimMetalness === undefined) nextConfig.innerRimMetalness = targetMetalness;
  }

  return nextConfig;
}

export const DEFAULT_SURFACE_MATERIALS: Record<string, VehicleSurfaceMaterialSlot> = {
  body: {
    slotName: 'body',
    label: 'Body Shell (body)',
    mode: 'standard',
    color: '#bc8100',
    pearlColor: '#ff2a60',
    metalness: 0.7,
    roughness: 0.45,
    clearcoat: 1,
    clearcoatRoughness: 0.11,
    sheen: 0.7,
    envMapIntensity: 1,
    toonSteps: 4,
    toonShadowMin: 0.11,
    toonHighlightMax: 1,
    toonSmooth: false,
    glbDefaultMetalness: 0,
    glbDefaultRoughness: 0.5,
  },
  window: {
    slotName: 'window',
    label: 'Windshield & Glass (window)',
    mode: 'standard',
    color: '#727272',
    pearlColor: '#243044',
    metalness: 1,
    roughness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    sheen: 0.2,
    envMapIntensity: 1,
    toonSteps: 3,
    toonShadowMin: 0.08,
    toonHighlightMax: 0.85,
    toonSmooth: false,
    glbDefaultMetalness: 0,
    glbDefaultRoughness: 0.5,
  },
  border: {
    slotName: 'border',
    label: 'Trim & Chassis Skirt (border)',
    mode: 'standard',
    color: '#262626',
    pearlColor: '#282e38',
    metalness: 0,
    roughness: 0.7,
    clearcoat: 0,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    envMapIntensity: 0.9,
    toonSteps: 3,
    toonShadowMin: 0.1,
    toonHighlightMax: 0.8,
    toonSmooth: false,
    glbDefaultMetalness: 0,
    glbDefaultRoughness: 0.5,
  },
  bottom: {
    slotName: 'bottom',
    label: 'Chassis Underbody (bottom)',
    mode: 'standard',
    color: '#1f2328',
    pearlColor: '#1f2328',
    metalness: 0.1,
    roughness: 0.75,
    clearcoat: 0,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    envMapIntensity: 0.8,
    toonSteps: 3,
    toonShadowMin: 0.1,
    toonHighlightMax: 0.8,
    toonSmooth: false,
    glbDefaultMetalness: 0,
    glbDefaultRoughness: 0.5,
  },
  metal: {
    slotName: 'metal',
    label: 'Rear Exhaust & Trim Metal (metal)',
    mode: 'standard',
    color: '#c9c9c9',
    pearlColor: '#6d788a',
    metalness: 1,
    roughness: 0.5,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
    sheen: 0.1,
    envMapIntensity: 1,
    toonSteps: 4,
    toonShadowMin: 0.15,
    toonHighlightMax: 1,
    toonSmooth: false,
    glbDefaultMetalness: 0,
    glbDefaultRoughness: 0.5,
  },
};

export const DEFAULT_LAMPS_CONFIG: VehicleLampsConfig = {
  frontColor: '#ffefd5',
  frontIntensity: 1,
  frontToneMapped: false,
  tailIdleColor: '#5c0a0a',
  tailIdleIntensity: 0.85,
  brakeColor: '#ff2200',
  brakeIntensity: 1,
  brakeMinSpeed: 30,
  brakeDecelEpsilon: 0.25,
  tailToneMapped: false,
};

export const INSIDIO_DESCRIPTOR: VehicleDescriptor = {
  id: 'insidio',
  name: 'Insidio',
  hitboxPreset: 'hitbox-hybrid',
  modelUrl: '/assets/vehicles/Insidio.glb',
  unitScale: 1,
  rawBounds: {
    min: [-59.8536, -10.7404, -39.3438],
    max: [79.8535, 31.1743, 39.3438],
    length: 139.7071,
    height: 41.9147,
    width: 78.6876,
    center: [10.0, 10.217, 0],
    roofTopY: 31.1743,
    rlHitboxTopY: 37.8346,
  },
  alignment: {
    scale: 1.0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
    centerOffset: [0.2, -1.0, 0],
  },
  wheelNames: [
    'wheel-front-right',
    'wheel-front-left',
    'wheel-rear-right',
    'wheel-rear-left',
  ],
  wheelAnchors: [
    [48.8139, 26.9291, 12.5],
    [48.8139, -26.9291, 12.5],
    [-36.5145, 28.6221, 15.0],
    [-36.5145, -28.622, 15.0],
  ],
  suspensionHeights: [-4.5, -4.5, -2.0, -2.0],
  boostOutlets: [
    [-56.8, 9.25, 20.428],
    [-56.8, 9.25, -20.428],
  ],
  boostNozzleParams: {
    x: -57.0,
    y: 10.25,
    z: 20.4278,
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

export const RYZA_DESCRIPTOR: VehicleDescriptor = {
  id: 'ryza',
  name: 'Ryza',
  hitboxPreset: 'hitbox-octane',
  modelUrl: '/assets/vehicles/Ryza.glb',
  unitScale: 100,
  rawBounds: {
    min: [-63.7602, -12.6091, -38.4309],
    max: [78.9037, 37.3574, 38.4309],
    length: 142.6639,
    height: 49.9665,
    width: 76.8618,
    center: [7.5718, 12.3741, 0],
    roofTopY: 37.3574,
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
    [50.25, 26.9291, 12.5],
    [50.25, -26.9291, 12.5],
    [-36.5, 28.6221, 15.0],
    [-36.5, -28.6221, 15.0],
  ],
  suspensionHeights: [-4.5, -4.5, -2.0, -2.0],
  boostOutlets: [
    [-55.5, 16.0, 10.0],
    [-55.5, 16.0, -10.0],
  ],
  boostNozzleParams: {
    x: -55.5,
    y: 16.0,
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
