/**
 * driftwoodsSchemaAndPresets.ts
 * Schema definitions for the Driftwoods stadium.
 */

export type DriftwoodsGroundTextureMode = 'original' | 'q1-7gray';

export type DriftwoodsQ1LayerId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface DriftwoodsQ1LayerColors {
  L0: string;
  L1: string;
  L2: string;
  L3: string;
  L4: string;
  L5: string;
  L6: string;
}

export interface DriftwoodsQ1LayerOpacities {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
  L4: number;
  L5: number;
  L6: number;
}

export interface DriftwoodsQ1LayerSpec {
  id: DriftwoodsQ1LayerId;
  name: string;
  centerGray: number;
  normalizedValue: number;
  grayRange: [number, number];
  normalizedRange: [number, number];
  defaultColor: string;
  defaultOpacity?: number;
}

export interface DriftwoodsQ1Manifest {
  texture: string;
  url: string;
  resolution: {
    width: number;
    height: number;
  };
  spatialMapping: {
    quadrant: string;
    uvOriginTopLeft: { u: number; v: number; worldX: number; worldY: number };
    uvExtentBottomRight: { u: number; v: number; worldX: number; worldY: number };
    worldBoundsUu: {
      x: [number, number];
      y: [number, number];
      goalDepthRangeY: [number, number];
    };
    wrapMode: string;
    uvFormula: { u: string; v: string };
  };
  layers: DriftwoodsQ1LayerSpec[];
}

export interface DriftwoodsLayerConfig {
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
  visible: boolean;
  wireframe: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  useTeamColor?: boolean;
  oneWaySeeThrough?: boolean;
}

export interface DriftwoodsGroundConfig {
  textureMode?: DriftwoodsGroundTextureMode;
  groundColor: string;
  lineColor: string;
  lineOpacity?: number;
  q1Colors?: DriftwoodsQ1LayerColors;
  q1Opacities?: DriftwoodsQ1LayerOpacities;
  l4UseTeamColor?: boolean;
  l5UseTeamColor?: boolean;
  l6UseTeamColor?: boolean;
  oklchSyncEnabled?: boolean;
  oklchMarkingsLightness?: number;
  oklchTeamLightness?: number;
  oklchGoalLightness?: number;
  oklchGoalPostsGlowLightness?: number;
  oklchRampsUpperOuterLightness?: number;
  oklchHexLightness?: number;
  oklchTeamChroma?: number;
  oklchBlueHue?: number;
  oklchOrangeHue?: number;
  oklchGroundIndependentCH?: boolean;
  oklchGroundChroma?: number;
  oklchGroundBlueHue?: number;
  oklchGroundOrangeHue?: number;
  oklchGoalIndependentCH?: boolean;
  oklchGoalChroma?: number;
  oklchGoalBlueHue?: number;
  oklchGoalOrangeHue?: number;
  oklchGoalPostsGlowIndependentCH?: boolean;
  oklchGoalPostsGlowChroma?: number;
  oklchGoalPostsGlowBlueHue?: number;
  oklchGoalPostsGlowOrangeHue?: number;
  oklchRampsUpperOuterIndependentCH?: boolean;
  oklchRampsUpperOuterChroma?: number;
  oklchRampsUpperOuterBlueHue?: number;
  oklchRampsUpperOuterOrangeHue?: number;
  oklchHexIndependentCH?: boolean;
  oklchHexChroma?: number;
  oklchHexBlueHue?: number;
  oklchHexOrangeHue?: number;
  blueTeamLineColor?: string;
  orangeTeamLineColor?: string;
  q1ScaleX?: number;
  q1ScaleY?: number;
  q1OffsetX?: number;
  q1OffsetY?: number;
  roughness: number;
  metalness: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  linkScale: boolean;
  visible: boolean;
  wireframe: boolean;
  magFilter?: 'linear' | 'nearest';
  anisotropy?: number;
  lineThreshold?: number;
  lineSmoothness?: number;
  originalLineThreshold?: number;
  originalLineSmoothness?: number;
}

export interface DriftwoodsTunerConfig {
  fastDiffuse: boolean;
  specularAA?: boolean;
  specularAAStrength?: number;
  occlusionOpacity?: number;
  wallExteriorOcclusion?: boolean;
  goalDepthMaskEnabled?: boolean;
  goalMaskOffsetUu?: number;
  goalMaskGradientDistanceUu?: number;
  goalMaskBezierP1X?: number;
  goalMaskBezierP1Y?: number;
  goalMaskBezierP2X?: number;
  goalMaskBezierP2Y?: number;
  ground: DriftwoodsGroundConfig;
  ramps: DriftwoodsLayerConfig;
  rampsUpperOuter: DriftwoodsLayerConfig;
  rampsTrim: DriftwoodsLayerConfig;
  wallPosts: DriftwoodsLayerConfig;
  goalFrame: DriftwoodsLayerConfig;
  goalPosts: DriftwoodsLayerConfig;
  goalPostsGlow: DriftwoodsLayerConfig;
  walls: DriftwoodsLayerConfig;
  goalNet: DriftwoodsLayerConfig;
  hexes: DriftwoodsLayerConfig;
}

export interface DriftwoodsPreset {
  id: string;
  name: string;
  description: string;
  config: DriftwoodsTunerConfig;
}

