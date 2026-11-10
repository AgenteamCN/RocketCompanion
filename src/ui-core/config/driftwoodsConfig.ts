/**
 * driftwoodsConfig.ts
 * Config cloning/merging helpers, preset hydration, and OKLCH perceptual color re-exports
 * for the Driftwoods stadium.
 */

import defaultConfigJson from './driftwoods.default.json' with { type: 'json' };
import groundQ1ManifestJson from './groundQ1Manifest.json' with { type: 'json' };
import presetsJson from './driftwoods.presets.json' with { type: 'json' };
import { type OklchColor, type OklabColor, type LinearRgbColor, linearToSrgbChannel, linearRgbToHex, hexToOklab, oklchToLinearRgb, hexToOklch } from './driftwoodsColorMath';
import type {
  DriftwoodsGroundConfig,
  DriftwoodsGroundTextureMode,
  DriftwoodsLayerConfig,
  DriftwoodsPreset,
  DriftwoodsQ1LayerColors,
  DriftwoodsQ1LayerId,
  DriftwoodsQ1LayerOpacities,
  DriftwoodsQ1LayerSpec,
  DriftwoodsQ1Manifest,
  DriftwoodsTunerConfig,
} from './driftwoodsSchemaAndPresets';

export type {
  OklchColor,
  OklabColor,
  LinearRgbColor,
  DriftwoodsGroundConfig,
  DriftwoodsGroundTextureMode,
  DriftwoodsLayerConfig,
  DriftwoodsPreset,
  DriftwoodsQ1LayerColors,
  DriftwoodsQ1LayerId,
  DriftwoodsQ1LayerOpacities,
  DriftwoodsQ1LayerSpec,
  DriftwoodsQ1Manifest,
  DriftwoodsTunerConfig,
};

export const GROUND_Q1_MANIFEST: DriftwoodsQ1Manifest =
  groundQ1ManifestJson as unknown as DriftwoodsQ1Manifest;

export const DEFAULT_Q1_LAYER_COLORS: DriftwoodsQ1LayerColors = {
  L0: '#1b4a00',
  L1: '#ffffff',
  L2: '#ffffff',
  L3: '#ffffff',
  L4: '#454545',
  L5: '#ffffff',
  L6: '#f87171',
};

export const DEFAULT_Q1_LAYER_OPACITIES: DriftwoodsQ1LayerOpacities = {
  L0: 1.0,
  L1: 0.5,
  L2: 0.4,
  L3: 0.5,
  L4: 0.3,
  L5: 0.7,
  L6: 0.3,
};

export const DEFAULT_DRIFTWOODS_CONFIG: DriftwoodsTunerConfig =
  defaultConfigJson as DriftwoodsTunerConfig;

export function oklchToHex(l: number, c: number, hDeg: number): string {
  return linearRgbToHex(oklchToLinearRgb(l, c, hDeg));
}

export function setHexOklchLightness(hex: string, targetL: number): string {
  const { c, h } = hexToOklch(hex);
  return oklchToHex(targetL, c, h);
}

export function mixDecalOverBaseOklab(
  baseHex: string,
  decalHex: string,
  opacity: number
): { linear: LinearRgbColor; srgbBytes: [number, number, number]; hex: string } {
  const baseLab = hexToOklab(baseHex);
  const decalLab = hexToOklab(decalHex);
  const t = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1));
  const L = baseLab.L + (decalLab.L - baseLab.L) * t;
  const a = baseLab.a + (decalLab.a - baseLab.a) * t;
  const b = baseLab.b + (decalLab.b - baseLab.b) * t;
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  const linear = oklchToLinearRgb(L, C, H);
  const sr = Math.max(0, Math.min(255, Math.round(linearToSrgbChannel(linear.r) * 255)));
  const sg = Math.max(0, Math.min(255, Math.round(linearToSrgbChannel(linear.g) * 255)));
  const sb = Math.max(0, Math.min(255, Math.round(linearToSrgbChannel(linear.b) * 255)));
  const hex =
    '#' +
    sr.toString(16).padStart(2, '0') +
    sg.toString(16).padStart(2, '0') +
    sb.toString(16).padStart(2, '0');
  return { linear, srgbBytes: [sr, sg, sb], hex };
}

export function cloneDriftwoodsConfig(
  config: DriftwoodsTunerConfig = DEFAULT_DRIFTWOODS_CONFIG
): DriftwoodsTunerConfig {
  return JSON.parse(JSON.stringify(config));
}

export function mergeDriftwoodsConfig(
  base: DriftwoodsTunerConfig,
  patch?: Partial<DriftwoodsTunerConfig> | null
): DriftwoodsTunerConfig {
  if (!patch) return cloneDriftwoodsConfig(base);
  const baseQ1Colors = {
    ...DEFAULT_Q1_LAYER_COLORS,
    ...(base.ground?.q1Colors || {}),
  };
  const baseQ1Opacities = {
    ...DEFAULT_Q1_LAYER_OPACITIES,
    ...(base.ground?.q1Opacities || {}),
  };
  const baseRampsUpperOuter = base.rampsUpperOuter || DEFAULT_DRIFTWOODS_CONFIG.rampsUpperOuter;
  const baseGoalPostsGlow = base.goalPostsGlow || DEFAULT_DRIFTWOODS_CONFIG.goalPostsGlow;
  const pg: Partial<DriftwoodsGroundConfig> = patch.ground || {};
  const bg = base.ground;

  return {
    ...base,
    ...patch,
    fastDiffuse: patch.fastDiffuse ?? base.fastDiffuse,
    specularAA: patch.specularAA ?? base.specularAA ?? true,
    specularAAStrength: patch.specularAAStrength ?? base.specularAAStrength ?? 1.0,
    occlusionOpacity: patch.occlusionOpacity ?? base.occlusionOpacity ?? 0.12,
    wallExteriorOcclusion: patch.wallExteriorOcclusion ?? base.wallExteriorOcclusion ?? true,
    goalDepthMaskEnabled: patch.goalDepthMaskEnabled ?? base.goalDepthMaskEnabled ?? true,
    goalMaskOffsetUu: patch.goalMaskOffsetUu ?? base.goalMaskOffsetUu ?? 0,
    goalMaskGradientDistanceUu:
      patch.goalMaskGradientDistanceUu ?? base.goalMaskGradientDistanceUu ?? 240,
    goalMaskBezierP1X: patch.goalMaskBezierP1X ?? base.goalMaskBezierP1X ?? 0.42,
    goalMaskBezierP1Y: patch.goalMaskBezierP1Y ?? base.goalMaskBezierP1Y ?? 0.0,
    goalMaskBezierP2X: patch.goalMaskBezierP2X ?? base.goalMaskBezierP2X ?? 0.58,
    goalMaskBezierP2Y: patch.goalMaskBezierP2Y ?? base.goalMaskBezierP2Y ?? 1.0,
    ground: {
      ...bg,
      ...pg,
      textureMode: pg.textureMode ?? bg.textureMode ?? 'q1-7gray',
      lineOpacity: pg.lineOpacity ?? bg.lineOpacity ?? 0.85,
      q1Colors: { ...baseQ1Colors, ...(pg.q1Colors || {}) },
      q1Opacities: { ...baseQ1Opacities, ...(pg.q1Opacities || {}) },
      l4UseTeamColor: pg.l4UseTeamColor ?? bg.l4UseTeamColor ?? true,
      l5UseTeamColor: pg.l5UseTeamColor ?? bg.l5UseTeamColor ?? true,
      l6UseTeamColor: pg.l6UseTeamColor ?? bg.l6UseTeamColor ?? true,
      oklchSyncEnabled: pg.oklchSyncEnabled ?? bg.oklchSyncEnabled ?? true,
      oklchMarkingsLightness: pg.oklchMarkingsLightness ?? bg.oklchMarkingsLightness ?? 0.96,
      oklchTeamLightness: pg.oklchTeamLightness ?? bg.oklchTeamLightness ?? 0.7,
      oklchGoalLightness: pg.oklchGoalLightness ?? bg.oklchGoalLightness ?? 0.582,
      oklchGoalPostsGlowLightness:
        pg.oklchGoalPostsGlowLightness ?? bg.oklchGoalPostsGlowLightness ?? 0.65,
      oklchRampsUpperOuterLightness:
        pg.oklchRampsUpperOuterLightness ?? bg.oklchRampsUpperOuterLightness ?? 0.5,
      oklchHexLightness: pg.oklchHexLightness ?? bg.oklchHexLightness ?? 0.65,
      oklchTeamChroma: pg.oklchTeamChroma ?? bg.oklchTeamChroma ?? 0.19,
      oklchBlueHue: pg.oklchBlueHue ?? bg.oklchBlueHue ?? 250,
      oklchOrangeHue: pg.oklchOrangeHue ?? bg.oklchOrangeHue ?? 45,
      oklchGroundIndependentCH:
        pg.oklchGroundIndependentCH ?? bg.oklchGroundIndependentCH ?? false,
      oklchGroundChroma: pg.oklchGroundChroma ?? bg.oklchGroundChroma ?? 0.19,
      oklchGroundBlueHue: pg.oklchGroundBlueHue ?? bg.oklchGroundBlueHue ?? 250,
      oklchGroundOrangeHue: pg.oklchGroundOrangeHue ?? bg.oklchGroundOrangeHue ?? 45,
      oklchGoalIndependentCH: pg.oklchGoalIndependentCH ?? bg.oklchGoalIndependentCH ?? false,
      oklchGoalChroma: pg.oklchGoalChroma ?? bg.oklchGoalChroma ?? 0.19,
      oklchGoalBlueHue: pg.oklchGoalBlueHue ?? bg.oklchGoalBlueHue ?? 250,
      oklchGoalOrangeHue: pg.oklchGoalOrangeHue ?? bg.oklchGoalOrangeHue ?? 45,
      oklchGoalPostsGlowIndependentCH:
        pg.oklchGoalPostsGlowIndependentCH ?? bg.oklchGoalPostsGlowIndependentCH ?? false,
      oklchGoalPostsGlowChroma:
        pg.oklchGoalPostsGlowChroma ?? bg.oklchGoalPostsGlowChroma ?? 0.19,
      oklchGoalPostsGlowBlueHue:
        pg.oklchGoalPostsGlowBlueHue ?? bg.oklchGoalPostsGlowBlueHue ?? 250,
      oklchGoalPostsGlowOrangeHue:
        pg.oklchGoalPostsGlowOrangeHue ?? bg.oklchGoalPostsGlowOrangeHue ?? 45,
      oklchRampsUpperOuterIndependentCH:
        pg.oklchRampsUpperOuterIndependentCH ?? bg.oklchRampsUpperOuterIndependentCH ?? true,
      oklchRampsUpperOuterChroma:
        pg.oklchRampsUpperOuterChroma ?? bg.oklchRampsUpperOuterChroma ?? 0.1,
      oklchRampsUpperOuterBlueHue:
        pg.oklchRampsUpperOuterBlueHue ?? bg.oklchRampsUpperOuterBlueHue ?? 250,
      oklchRampsUpperOuterOrangeHue:
        pg.oklchRampsUpperOuterOrangeHue ?? bg.oklchRampsUpperOuterOrangeHue ?? 45,
      oklchHexIndependentCH: pg.oklchHexIndependentCH ?? bg.oklchHexIndependentCH ?? true,
      oklchHexChroma: pg.oklchHexChroma ?? bg.oklchHexChroma ?? 0.32,
      oklchHexBlueHue: pg.oklchHexBlueHue ?? bg.oklchHexBlueHue ?? 250,
      oklchHexOrangeHue: pg.oklchHexOrangeHue ?? bg.oklchHexOrangeHue ?? 45,
      blueTeamLineColor: pg.blueTeamLineColor ?? bg.blueTeamLineColor ?? '#3fa3ff',
      orangeTeamLineColor: pg.orangeTeamLineColor ?? bg.orangeTeamLineColor ?? '#fa6e1d',
      q1ScaleX: pg.q1ScaleX ?? bg.q1ScaleX ?? 1,
      q1ScaleY: pg.q1ScaleY ?? bg.q1ScaleY ?? 1,
      q1OffsetX: pg.q1OffsetX ?? bg.q1OffsetX ?? 0,
      q1OffsetY: pg.q1OffsetY ?? bg.q1OffsetY ?? 0,
      anisotropy: pg.anisotropy ?? bg.anisotropy ?? 4,
      lineThreshold: pg.lineThreshold ?? bg.lineThreshold ?? 0.35,
      lineSmoothness: pg.lineSmoothness ?? bg.lineSmoothness ?? 0.15,
      originalLineThreshold: pg.originalLineThreshold ?? bg.originalLineThreshold ?? 0.0921,
      originalLineSmoothness: pg.originalLineSmoothness ?? bg.originalLineSmoothness ?? 0.0364,
    },
    ramps: patch.ramps ? { ...base.ramps, ...patch.ramps } : { ...base.ramps },
    rampsUpperOuter: patch.rampsUpperOuter
      ? {
          ...baseRampsUpperOuter,
          ...patch.rampsUpperOuter,
          useTeamColor:
            patch.rampsUpperOuter.useTeamColor ?? baseRampsUpperOuter.useTeamColor ?? true,
          oneWaySeeThrough:
            patch.rampsUpperOuter.oneWaySeeThrough ?? baseRampsUpperOuter.oneWaySeeThrough ?? true,
        }
      : {
          ...baseRampsUpperOuter,
          useTeamColor: baseRampsUpperOuter.useTeamColor ?? true,
          oneWaySeeThrough: baseRampsUpperOuter.oneWaySeeThrough ?? true,
        },
    rampsTrim: patch.rampsTrim ? { ...base.rampsTrim, ...patch.rampsTrim } : { ...base.rampsTrim },
    wallPosts: patch.wallPosts ? { ...base.wallPosts, ...patch.wallPosts } : { ...base.wallPosts },
    goalFrame: patch.goalFrame
      ? {
          ...base.goalFrame,
          ...patch.goalFrame,
          useTeamColor: patch.goalFrame.useTeamColor ?? base.goalFrame.useTeamColor ?? false,
        }
      : {
          ...base.goalFrame,
          useTeamColor: base.goalFrame.useTeamColor ?? false,
        },
    goalPosts: patch.goalPosts
      ? {
          ...base.goalPosts,
          ...patch.goalPosts,
          useTeamColor: patch.goalPosts.useTeamColor ?? base.goalPosts.useTeamColor ?? false,
        }
      : {
          ...base.goalPosts,
          useTeamColor: base.goalPosts.useTeamColor ?? false,
        },
    goalPostsGlow: patch.goalPostsGlow
      ? {
          ...baseGoalPostsGlow,
          ...patch.goalPostsGlow,
          useTeamColor:
            patch.goalPostsGlow.useTeamColor ?? baseGoalPostsGlow.useTeamColor ?? true,
        }
      : {
          ...baseGoalPostsGlow,
          useTeamColor: baseGoalPostsGlow.useTeamColor ?? true,
        },
    walls: patch.walls ? { ...base.walls, ...patch.walls } : { ...base.walls },
    goalNet: patch.goalNet ? { ...base.goalNet, ...patch.goalNet } : { ...base.goalNet },
    hexes: patch.hexes ? { ...base.hexes, ...patch.hexes } : { ...base.hexes },
  };
}

export const DRIFTWOODS_PRESETS: DriftwoodsPreset[] = [
  {
    id: 'q1-7gray-tactical',
    name: 'Q1 7-Layer Tactical Mask',
    description:
      '4-quadrant mirrored Q1 RGBA decal mask (2048x3000, 16x AF) with OKLCH perceptual palette & L0-L6 opacity.',
    config: DEFAULT_DRIFTWOODS_CONFIG,
  },
  {
    id: 'classic-wood',
    name: 'Classic Driftwoods (Original)',
    description:
      'Authentic Rocket League wooden ramps, golden trims, cyan glass, and lush green 2-color pitch.',
    config: {
      ...DEFAULT_DRIFTWOODS_CONFIG,
      ground: {
        ...DEFAULT_DRIFTWOODS_CONFIG.ground,
        textureMode: 'original',
        anisotropy: 16,
        originalLineThreshold: 0.0921,
        originalLineSmoothness: 0.0364,
      },
    },
  },
  ...(presetsJson as DriftwoodsPreset[]).map((preset) => ({
    ...preset,
    config: mergeDriftwoodsConfig(DEFAULT_DRIFTWOODS_CONFIG, {
      ...preset.config,
      ground: {
        ...DEFAULT_DRIFTWOODS_CONFIG.ground,
        ...preset.config.ground,
        textureMode: preset.config.ground?.textureMode ?? 'original',
        anisotropy: preset.config.ground?.anisotropy ?? 16,
        q1Colors: {
          ...DEFAULT_Q1_LAYER_COLORS,
          ...(preset.config.ground?.q1Colors || {}),
        },
        q1Opacities: {
          ...DEFAULT_Q1_LAYER_OPACITIES,
          ...(preset.config.ground?.q1Opacities || {}),
        },
      },
    }),
  })),
];
