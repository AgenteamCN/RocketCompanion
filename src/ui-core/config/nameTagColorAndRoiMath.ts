/**
 * nameTagColorAndRoiMath.ts
 * Pure color blending, car color palette resolution, 2D ROI boundary clamping,
 * and aerial climb alert ring/glow canvas primitives for Name Tags & Offscreen Indicators.
 */

import { DEFAULT_NAME_TAG_CONFIG, DEFAULT_NAME_TAG_DISTINCT_COLORS, type NameTagConfig } from './nameTagConfig';

export function parseHexRgb(hexColor: string): [number, number, number] {
  const cleanHex = String(hexColor || '#075985').replace('#', '').trim();
  const expanded =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : cleanHex;
  const numericValue = Number.parseInt(expanded, 16);
  if (!Number.isFinite(numericValue)) return [12, 45, 72];
  return [
    (numericValue >> 16) & 255,
    (numericValue >> 8) & 255,
    numericValue & 255,
  ];
}

export function hexToRgba(hexColor: string, alpha = 1.0): string {
  const [r, g, b] = parseHexRgb(hexColor);
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

export function mixHexColors(hexA: string, hexB: string, weightB = 0.35): string {
  const [rA, gA, bA] = parseHexRgb(hexA);
  const [rB, gB, bB] = parseHexRgb(hexB);
  const t = Math.max(0, Math.min(1, weightB));
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function resolveActiveBoostFillColor(
  bgColor: string,
  boostBorderColor: string,
  blendRatio = DEFAULT_NAME_TAG_CONFIG.boostFillColorBlendRatio
): string {
  const clampedBlend = Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(Number(blendRatio))
        ? Number(blendRatio)
        : DEFAULT_NAME_TAG_CONFIG.boostFillColorBlendRatio
    )
  );
  return mixHexColors(bgColor, boostBorderColor, clampedBlend);
}

export function resolveUnfilledBaseHexColor(
  bgColor: string,
  darkenRatio = DEFAULT_NAME_TAG_CONFIG.boostUnfilledDarkenRatio
): string {
  const clampedDarken = Math.max(
    0,
    Math.min(
      1,
      Number.isFinite(Number(darkenRatio))
        ? Number(darkenRatio)
        : DEFAULT_NAME_TAG_CONFIG.boostUnfilledDarkenRatio
    )
  );
  return mixHexColors(bgColor, '#040914', clampedDarken);
}


export function resolveAerialClimbInwardFillFraction(
  rawGlowRadiusValue: number | undefined
): number {
  const numeric = Number.isFinite(Number(rawGlowRadiusValue))
    ? Number(rawGlowRadiusValue)
    : DEFAULT_NAME_TAG_CONFIG.aerialClimbGlowRadiusPx;
  return Math.max(0.08, Math.min(1.0, numeric / 100));
}

export function drawAerialClimbInwardRing2D(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  circleRadiusPx: number,
  config: Pick<
    NameTagConfig,
    'aerialClimbGlowColor' | 'aerialClimbGlowRadiusPx' | 'aerialClimbGlowOpacity'
  >
): void {
  const alertColor =
    config.aerialClimbGlowColor || DEFAULT_NAME_TAG_CONFIG.aerialClimbGlowColor;
  const fillFraction = resolveAerialClimbInwardFillFraction(
    config.aerialClimbGlowRadiusPx
  );
  const alertOpacity = Math.max(
    0.1,
    Math.min(
      1.0,
      Number(config.aerialClimbGlowOpacity) ??
        DEFAULT_NAME_TAG_CONFIG.aerialClimbGlowOpacity
    )
  );

  const innerRadiusPx = Math.max(0, circleRadiusPx * (1 - fillFraction));

  ctx.save();
  ctx.fillStyle = hexToRgba(alertColor, alertOpacity);
  ctx.beginPath();
  ctx.arc(centerX, centerY, circleRadiusPx, 0, Math.PI * 2, false);
  if (innerRadiusPx > 0.5) {
    ctx.arc(centerX, centerY, innerRadiusPx, 0, Math.PI * 2, true);
  }
  ctx.fill('evenodd');
  ctx.restore();
}

export function drawAerialClimbOuterGlow2D(
  ctx: CanvasRenderingContext2D,
  config: Pick<
    NameTagConfig,
    'aerialClimbGlowColor' | 'aerialClimbGlowRadiusPx' | 'aerialClimbGlowOpacity'
  >,
  drawShapePath: () => void,
  strokeWidthPx = 3
): void {
  const glowColor =
    config.aerialClimbGlowColor || DEFAULT_NAME_TAG_CONFIG.aerialClimbGlowColor;
  const glowOpacity = Math.max(
    0.1,
    Math.min(
      1.0,
      Number(config.aerialClimbGlowOpacity) ??
        DEFAULT_NAME_TAG_CONFIG.aerialClimbGlowOpacity
    )
  );

  ctx.save();
  ctx.strokeStyle = hexToRgba(glowColor, glowOpacity);
  ctx.lineWidth = Math.max(2, strokeWidthPx);
  drawShapePath();
  ctx.stroke();
  ctx.restore();
}
