export type TakeoverVignetteRenderMode = 'sdf-smooth' | 'css-inset' | 'hybrid';

export interface TakeoverVignetteCurve {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

export interface TakeoverVignetteConfig {
  enabled: boolean;
  renderMode?: TakeoverVignetteRenderMode;
  depthYPct?: number;
  depthTopPct?: number;
  depthBottomPct?: number;
  verticalOffsetPx?: number;
  depthXPct?: number;
  blurPx?: number;
  innerColor?: string;
  innerIntensityPct?: number;
  color: string;
  intensityPct: number;
  distancePct: number;
  outerReachPct: number;
  curve: TakeoverVignetteCurve;
  fadeInMs: number;
  fadeOutMs: number;
  cornerRadiusPx?: number;
}

export const DEFAULT_TAKEOVER_VIGNETTE: TakeoverVignetteConfig = {
  enabled: true,
  renderMode: 'sdf-smooth',
  depthYPct: 15,
  depthTopPct: 0,
  depthBottomPct: 35,
  verticalOffsetPx: 0,
  depthXPct: 0,
  blurPx: 160,
  innerColor: '#000000',
  innerIntensityPct: 0,
  color: '#000000',
  intensityPct: 85,
  distancePct: 40,
  outerReachPct: 100,
  curve: {
    p1x: 0.64,
    p1y: 0,
    p2x: 0.28,
    p2y: 1,
  },
  fadeInMs: 280,
  fadeOutMs: 380,
  cornerRadiusPx: 0,
};

export function parseHexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '#000000').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [
      Number.isFinite(r) ? r : 0,
      Number.isFinite(g) ? g : 0,
      Number.isFinite(b) ? b : 0,
    ];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0,
  ];
}

export function formatVignetteEndpointRgba(hex: string, alphaPct: number): string {
  const [r, g, b] = parseHexToRgbTuple(hex);
  const a = Math.max(0, Math.min(1, alphaPct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function sampleCubicBezier1D(u: number, p1: number, p2: number): number {
  const inv = 1 - u;
  return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u;
}

export function evaluateCubicBezierAtX(
  targetX: number,
  curve: TakeoverVignetteCurve
): number {
  const x = Math.max(0, Math.min(1, targetX));
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const p1x = Math.max(0, Math.min(1, curve.p1x));
  const p2x = Math.max(0, Math.min(1, curve.p2x));

  let low = 0;
  let high = 1;
  let u = x;
  for (let i = 0; i < 14; i++) {
    u = 0.5 * (low + high);
    const estX = sampleCubicBezier1D(u, p1x, p2x);
    if (estX < x) {
      low = u;
    } else {
      high = u;
    }
  }
  const y = sampleCubicBezier1D(u, curve.p1y, curve.p2y);
  return Math.max(0, Math.min(1, y));
}

export interface VignetteAxisGeometry {
  blurPx: number;
  depthXPct: number;
  depthYPct: number;
  depthTopPct: number;
  depthBottomPct: number;
  verticalOffsetPx: number;
  offsetX: number;
  offsetY: number;
  offsetTop: number;
  offsetBottom: number;
  cornerRadiusPx: number;
}

export function computeVignetteAxisOffsets(
  config: TakeoverVignetteConfig
): VignetteAxisGeometry {
  const blurPx = Math.max(20, Math.min(450, config.blurPx ?? 160));
  const depthXPct = Math.max(0, Math.min(140, config.depthXPct ?? 0));
  const depthYPct = Math.max(0, Math.min(160, config.depthYPct ?? 15));
  const depthTopPct = Math.max(0, Math.min(160, config.depthTopPct ?? 0));
  const depthBottomPct = Math.max(0, Math.min(160, config.depthBottomPct ?? 35));
  const verticalOffsetPx = Math.max(-360, Math.min(360, config.verticalOffsetPx ?? 0));
  const cornerRadiusPx = Math.max(0, Math.min(240, config.cornerRadiusPx ?? 0));
  const scale = blurPx * 0.012;
  const offsetX = (100 - depthXPct) * scale;
  const offsetY = (100 - depthYPct) * scale;
  const offsetTop = (100 - depthTopPct) * scale + verticalOffsetPx;
  const offsetBottom = (100 - depthBottomPct) * scale - verticalOffsetPx;
  return {
    blurPx,
    depthXPct,
    depthYPct,
    depthTopPct,
    depthBottomPct,
    verticalOffsetPx,
    offsetX,
    offsetY,
    offsetTop,
    offsetBottom,
    cornerRadiusPx,
  };
}

export function buildTakeoverVignetteGradient(config: TakeoverVignetteConfig): string {
  const innerAlpha = Math.max(0, Math.min(1, (config.innerIntensityPct ?? 0) / 100));
  const outerAlpha = Math.max(0, Math.min(1, config.intensityPct / 100));
  if (!config.enabled || (innerAlpha <= 0 && outerAlpha <= 0)) {
    return 'none';
  }
  const innerRgb = parseHexToRgbTuple(config.innerColor ?? config.color ?? '#000000');
  const outerRgb = parseHexToRgbTuple(config.color ?? '#000000');
  const innerStop = Math.max(0, Math.min(95, config.distancePct));
  const outerStop = Math.max(innerStop + 4, Math.min(160, config.outerReachPct));
  const span = outerStop - innerStop;

  const sampleFractions = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  const buildEdgeStops = (depthScale: number) =>
    sampleFractions
      .map((frac) => {
        const distFromCenterPct = innerStop + frac * span;
        const posFromEdgePct = Math.max(0, (50 - distFromCenterPct * 0.5) * depthScale);
        const curveFactor = evaluateCubicBezierAtX(frac, config.curve);
        const r = Math.round(innerRgb[0] + (outerRgb[0] - innerRgb[0]) * curveFactor);
        const g = Math.round(innerRgb[1] + (outerRgb[1] - innerRgb[1]) * curveFactor);
        const b = Math.round(innerRgb[2] + (outerRgb[2] - innerRgb[2]) * curveFactor);
        const alpha = Math.min(
          1,
          (innerAlpha + (outerAlpha - innerAlpha) * curveFactor) * depthScale
        );
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)}) ${posFromEdgePct.toFixed(1)}%`;
      })
      .reverse()
      .join(', ');

  const depthTopScale = Math.max(0.1, (config.depthTopPct ?? 0) / 100);
  const depthBottomScale = Math.max(0.1, (config.depthBottomPct ?? 35) / 100);
  const depthXScale = Math.max(0.1, (config.depthXPct ?? 0) / 100);
  const topStops = buildEdgeStops(depthTopScale);
  const bottomStops = buildEdgeStops(depthBottomScale);
  const xStops = buildEdgeStops(depthXScale);
  const centerStopRgba = `rgba(${innerRgb[0]}, ${innerRgb[1]}, ${innerRgb[2]}, ${innerAlpha.toFixed(3)})`;
  return [
    `linear-gradient(to bottom, ${topStops}, ${centerStopRgba} 50%)`,
    `linear-gradient(to top, ${bottomStops}, ${centerStopRgba} 50%)`,
    `linear-gradient(to right, ${xStops}, ${centerStopRgba} 50%)`,
    `linear-gradient(to left, ${xStops}, ${centerStopRgba} 50%)`,
  ].join(', ');
}

export const VIGNETTE_LUT_SIZE = 1024;

export function buildBezierLut(curve: TakeoverVignetteCurve): Float32Array {
  const lut = new Float32Array(VIGNETTE_LUT_SIZE);
  for (let i = 0; i < VIGNETTE_LUT_SIZE; i++) {
    const t = i / (VIGNETTE_LUT_SIZE - 1);
    lut[i] = evaluateCubicBezierAtX(t, curve);
  }
  return lut;
}
