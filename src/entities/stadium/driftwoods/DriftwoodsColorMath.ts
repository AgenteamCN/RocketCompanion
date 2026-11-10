import { type Color, type DataTexture } from 'three';
import {
  DEFAULT_Q1_LAYER_COLORS,
  DEFAULT_Q1_LAYER_OPACITIES,
  type DriftwoodsGroundConfig,
  type DriftwoodsQ1LayerId,
  mixDecalOverBaseOklab,
  oklchToHex,
  setHexOklchLightness,
} from '../../../ui-core/config/driftwoodsConfig.ts';
import type { ExperimentalWallFxConfig } from '../../../ui-core/config/atmosphereFxConfig.ts';
import {
  Q1_TOTAL_PIXELS,
  getPrecomputedQ1Mask,
  rebuildMirroredRepeatMipmaps,
} from './DriftwoodsMipmapBuilder.ts';
import type {
  DriftwoodsGoalTeamUniforms,
  DriftwoodsGroundUniforms,
} from './DriftwoodsMaterialPaletteSpecs.ts';
import type { WallFxUniforms } from './WallFxShaderInjector.ts';

export interface DriftwoodsGroundBakeTarget {
  groundUniforms: DriftwoodsGroundUniforms;
  goalTeamUniforms: DriftwoodsGoalTeamUniforms;
  wallFxUniforms: WallFxUniforms;
  wallFxConfig: ExperimentalWallFxConfig;
  bakedBlueGroundTexture: DataTexture;
  bakedOrangeGroundTexture: DataTexture;
  _lastBakedPaletteSignature: string | null;
}

export interface DriftwoodsResolvedTeamColors {
  blue: string;
  orange: string;
}

/**
 * Resolves effective layer colors and opacities in OKLCH / Oklab perceptual space
 * with unified Chroma (C) and Blue/Orange Hue (H) and independent Lightness (L)
 * for Ground Markings, Goal Posts/Frame, and Hexagon Grid.
 */
export function bakeQ1GroundTexturesIntoManager(
  manager: DriftwoodsGroundBakeTarget,
  g: Partial<DriftwoodsGroundConfig> | null | undefined
): void {
  if (!g) return;
  const rawColors = {
    ...DEFAULT_Q1_LAYER_COLORS,
    ...(g.q1Colors || {}),
  };
  const opacities = {
    ...DEFAULT_Q1_LAYER_OPACITIES,
    ...(g.q1Opacities || {}),
  };

  const oklchSync = g.oklchSyncEnabled !== false;
  const markingsL = g.oklchMarkingsLightness ?? 0.96;
  const teamL = g.oklchTeamLightness ?? 0.7;
  const goalL = g.oklchGoalLightness ?? 0.582;
  const goalGlowL = g.oklchGoalPostsGlowLightness ?? 0.65;
  const rampsUpperOuterL = g.oklchRampsUpperOuterLightness ?? 0.5;
  const hexL = g.oklchHexLightness ?? 0.65;
  const teamC = g.oklchTeamChroma ?? 0.19;
  const blueH = g.oklchBlueHue ?? 250;
  const orangeH = g.oklchOrangeHue ?? 45;

  const groundC = g.oklchGroundIndependentCH ? (g.oklchGroundChroma ?? teamC) : teamC;
  const groundBlueH = g.oklchGroundIndependentCH ? (g.oklchGroundBlueHue ?? blueH) : blueH;
  const groundOrangeH = g.oklchGroundIndependentCH ? (g.oklchGroundOrangeHue ?? orangeH) : orangeH;

  const goalC = g.oklchGoalIndependentCH ? (g.oklchGoalChroma ?? teamC) : teamC;
  const goalBlueH = g.oklchGoalIndependentCH ? (g.oklchGoalBlueHue ?? blueH) : blueH;
  const goalOrangeH = g.oklchGoalIndependentCH ? (g.oklchGoalOrangeHue ?? orangeH) : orangeH;

  const goalGlowC = g.oklchGoalPostsGlowIndependentCH
    ? (g.oklchGoalPostsGlowChroma ?? teamC)
    : teamC;
  const goalGlowBlueH = g.oklchGoalPostsGlowIndependentCH
    ? (g.oklchGoalPostsGlowBlueHue ?? blueH)
    : blueH;
  const goalGlowOrangeH = g.oklchGoalPostsGlowIndependentCH
    ? (g.oklchGoalPostsGlowOrangeHue ?? orangeH)
    : orangeH;

  const rampsUpperOuterC =
    g.oklchRampsUpperOuterIndependentCH !== false ? (g.oklchRampsUpperOuterChroma ?? 0.1) : teamC;
  const rampsUpperOuterBlueH =
    g.oklchRampsUpperOuterIndependentCH !== false
      ? (g.oklchRampsUpperOuterBlueHue ?? blueH)
      : blueH;
  const rampsUpperOuterOrangeH =
    g.oklchRampsUpperOuterIndependentCH !== false
      ? (g.oklchRampsUpperOuterOrangeHue ?? orangeH)
      : orangeH;

  const hexC = g.oklchHexIndependentCH !== false ? (g.oklchHexChroma ?? 0.32) : teamC;
  const hexBlueH = g.oklchHexIndependentCH !== false ? (g.oklchHexBlueHue ?? blueH) : blueH;
  const hexOrangeH = g.oklchHexIndependentCH !== false ? (g.oklchHexOrangeHue ?? orangeH) : orangeH;

  const baseTurfHex = rawColors.L0 || '#1b4a00';
  manager.groundUniforms.uL0Color.value.set(baseTurfHex);

  const blueTeamHex = oklchSync
    ? oklchToHex(teamL, groundC, groundBlueH)
    : g.blueTeamLineColor || manager.wallFxConfig.blueTeamColor || '#0089ff';
  const orangeTeamHex = oklchSync
    ? oklchToHex(teamL, groundC, groundOrangeH)
    : g.orangeTeamLineColor || manager.wallFxConfig.orangeTeamColor || '#ff5200';

  const blueGoalHex = oklchSync ? oklchToHex(goalL, goalC, goalBlueH) : blueTeamHex;
  const orangeGoalHex = oklchSync ? oklchToHex(goalL, goalC, goalOrangeH) : orangeTeamHex;
  manager.goalTeamUniforms.uGoalBlueColor.value.set(blueGoalHex);
  manager.goalTeamUniforms.uGoalOrangeColor.value.set(orangeGoalHex);

  const blueGoalGlowHex = oklchSync
    ? oklchToHex(goalGlowL, goalGlowC, goalGlowBlueH)
    : setHexOklchLightness(blueTeamHex, goalGlowL);
  const orangeGoalGlowHex = oklchSync
    ? oklchToHex(goalGlowL, goalGlowC, goalGlowOrangeH)
    : setHexOklchLightness(orangeTeamHex, goalGlowL);
  manager.goalTeamUniforms.uGoalPostsGlowBlueColor.value.set(blueGoalGlowHex);
  manager.goalTeamUniforms.uGoalPostsGlowOrangeColor.value.set(orangeGoalGlowHex);

  const blueRampsUpperOuterHex = oklchSync
    ? oklchToHex(rampsUpperOuterL, rampsUpperOuterC, rampsUpperOuterBlueH)
    : setHexOklchLightness(blueTeamHex, rampsUpperOuterL);
  const orangeRampsUpperOuterHex = oklchSync
    ? oklchToHex(rampsUpperOuterL, rampsUpperOuterC, rampsUpperOuterOrangeH)
    : setHexOklchLightness(orangeTeamHex, rampsUpperOuterL);
  manager.goalTeamUniforms.uRampsUpperOuterBlueColor.value.set(blueRampsUpperOuterHex);
  manager.goalTeamUniforms.uRampsUpperOuterOrangeColor.value.set(orangeRampsUpperOuterHex);

  if (oklchSync) {
    const blueHexGridColor = oklchToHex(hexL, hexC, hexBlueH);
    const orangeHexGridColor = oklchToHex(hexL, hexC, hexOrangeH);
    manager.wallFxUniforms.uBlueTeamColor.value.set(blueHexGridColor);
    manager.wallFxUniforms.uOrangeTeamColor.value.set(orangeHexGridColor);
    manager.wallFxConfig.blueTeamColor = blueHexGridColor;
    manager.wallFxConfig.orangeTeamColor = orangeHexGridColor;
  }

  const effColors: Record<DriftwoodsQ1LayerId, string> = {
    L0: baseTurfHex,
    L1: oklchSync ? setHexOklchLightness(rawColors.L1, markingsL) : rawColors.L1,
    L2: oklchSync ? setHexOklchLightness(rawColors.L2, markingsL) : rawColors.L2,
    L3: oklchSync ? setHexOklchLightness(rawColors.L3, markingsL) : rawColors.L3,
    L4: rawColors.L4,
    L5: oklchSync ? setHexOklchLightness(rawColors.L5, markingsL) : rawColors.L5,
    L6: rawColors.L6,
  };

  const l4Team = g.l4UseTeamColor !== false;
  const l5Team = g.l5UseTeamColor !== false;
  const l6Team = g.l6UseTeamColor !== false;

  const layerIds: ReadonlyArray<Exclude<DriftwoodsQ1LayerId, 'L0'>> = [
    'L1',
    'L2',
    'L3',
    'L4',
    'L5',
    'L6',
  ];
  const blueRgbLut = new Uint32Array(7);
  const orangeRgbLut = new Uint32Array(7);
  const baseBlend = mixDecalOverBaseOklab(baseTurfHex, baseTurfHex, 0);
  const basePacked =
    baseBlend.srgbBytes[0] | (baseBlend.srgbBytes[1] << 8) | (baseBlend.srgbBytes[2] << 16);
  blueRgbLut[0] = basePacked;
  orangeRgbLut[0] = basePacked;

  const layerColorUniforms: Record<Exclude<DriftwoodsQ1LayerId, 'L0'>, { value: Color }> = {
    L1: manager.groundUniforms.uL1Color,
    L2: manager.groundUniforms.uL2Color,
    L3: manager.groundUniforms.uL3Color,
    L4: manager.groundUniforms.uL4Color,
    L5: manager.groundUniforms.uL5Color,
    L6: manager.groundUniforms.uL6Color,
  };

  for (let i = 0; i < 6; i++) {
    const id = layerIds[i];
    const idx = i + 1;
    const op = Math.max(0, Math.min(1, Number(opacities[id] ?? 0.85)));
    const useTeam = (id === 'L4' && l4Team) || (id === 'L5' && l5Team) || (id === 'L6' && l6Team);

    const blueTargetHex = useTeam ? blueTeamHex : effColors[id];
    const orangeTargetHex = useTeam ? orangeTeamHex : effColors[id];

    const blueMixed = mixDecalOverBaseOklab(baseTurfHex, blueTargetHex, op);
    const orangeMixed = mixDecalOverBaseOklab(baseTurfHex, orangeTargetHex, op);

    blueRgbLut[idx] =
      blueMixed.srgbBytes[0] | (blueMixed.srgbBytes[1] << 8) | (blueMixed.srgbBytes[2] << 16);
    orangeRgbLut[idx] =
      orangeMixed.srgbBytes[0] | (orangeMixed.srgbBytes[1] << 8) | (orangeMixed.srgbBytes[2] << 16);

    const uCol = layerColorUniforms[id];
    if (uCol) {
      uCol.value.setRGB(blueMixed.linear.r, blueMixed.linear.g, blueMixed.linear.b);
    }
  }

  const origGroundHex = g.groundColor || '#18441c';
  const origLineHex = oklchSync
    ? setHexOklchLightness(g.lineColor || '#e1e6eb', markingsL)
    : g.lineColor || '#e1e6eb';
  const origLineOp = Math.max(0, Math.min(1, Number(g.lineOpacity ?? 0.85)));
  const origBlended = mixDecalOverBaseOklab(origGroundHex, origLineHex, origLineOp);
  manager.groundUniforms.uGroundColor.value.set(origGroundHex);
  manager.groundUniforms.uLineColor.value.setRGB(
    origBlended.linear.r,
    origBlended.linear.g,
    origBlended.linear.b
  );

  const { dilatedLayerId, normalizedCoverage } = getPrecomputedQ1Mask();
  if (!dilatedLayerId || !normalizedCoverage) {
    manager.groundUniforms.uQ1BakedReady.value = 0.0;
    return;
  }

  const sig = JSON.stringify({
    b: Array.from(blueRgbLut),
    o: Array.from(orangeRgbLut),
  });
  if (
    sig === manager._lastBakedPaletteSignature &&
    manager.groundUniforms.uQ1BakedReady.value > 0.5
  ) {
    return;
  }
  manager._lastBakedPaletteSignature = sig;

  const blueUint32 = new Uint32Array(manager.bakedBlueGroundTexture.image.data.buffer);
  const orangeUint32 = new Uint32Array(manager.bakedOrangeGroundTexture.image.data.buffer);

  const len = Math.min(Q1_TOTAL_PIXELS, dilatedLayerId.length);
  for (let i = 0; i < len; i++) {
    const lid = dilatedLayerId[i];
    const alphaShift = normalizedCoverage[i] << 24;
    blueUint32[i] = blueRgbLut[lid] | alphaShift;
    orangeUint32[i] = orangeRgbLut[lid] | alphaShift;
  }

  rebuildMirroredRepeatMipmaps(manager.bakedBlueGroundTexture);
  rebuildMirroredRepeatMipmaps(manager.bakedOrangeGroundTexture);
  manager.bakedBlueGroundTexture.needsUpdate = true;
  manager.bakedOrangeGroundTexture.needsUpdate = true;
  manager.groundUniforms.uQ1BakedReady.value = 1.0;
}

export function resolveDriftwoodsTeamColors(
  groundConfig?: Partial<DriftwoodsGroundConfig> | null,
  wallFxConfig?: Partial<ExperimentalWallFxConfig> | null
): DriftwoodsResolvedTeamColors {
  const g = groundConfig;
  if (g && g.oklchSyncEnabled !== false) {
    const goalL = g.oklchGoalLightness ?? 0.582;
    const teamC = g.oklchTeamChroma ?? 0.19;
    const blueH = g.oklchBlueHue ?? 250;
    const orangeH = g.oklchOrangeHue ?? 45;
    const goalC = g.oklchGoalIndependentCH ? (g.oklchGoalChroma ?? teamC) : teamC;
    const goalBlueH = g.oklchGoalIndependentCH ? (g.oklchGoalBlueHue ?? blueH) : blueH;
    const goalOrangeH = g.oklchGoalIndependentCH ? (g.oklchGoalOrangeHue ?? orangeH) : orangeH;
    return {
      blue: oklchToHex(goalL, goalC, goalBlueH),
      orange: oklchToHex(goalL, goalC, goalOrangeH),
    };
  }
  return {
    blue: g?.blueTeamLineColor || wallFxConfig?.blueTeamColor || '#3fa3ff',
    orange: g?.orangeTeamLineColor || wallFxConfig?.orangeTeamColor || '#fa6e1d',
  };
}
