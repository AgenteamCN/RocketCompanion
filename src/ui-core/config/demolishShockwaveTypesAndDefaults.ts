/**
 * demolishShockwaveTypesAndDefaults.ts
 * Types, default preset configuration, and pure smoothstep track evaluators
 * for the camera-facing demolition shockwave ring effect.
 */

export interface DemolishOuterRadiusKey {
  t: number;
  size: number;
}

export interface DemolishInnerHoleKey {
  t: number;
  innerHole: number;
}

export interface DemolishColorKey {
  t: number;
  color: string;
}

export interface DemolishOpacityKey {
  t: number;
  opacity: number;
}

export type DemolishSimAnchorMode = 'custom-xyz' | 'local-car' | 'in-front-car' | 'ball';

export interface DemolishShockwaveConfig {
  enabled: boolean;
  duration: number;
  worldScale: number;
  verticalOffsetUu: number;
  featherPct: number;
  outerFeatherPct: number;
  glowEndNormT: number;
  glowStrength: number;
  fadeStartNormT: number;
  outerKeys: [
    DemolishOuterRadiusKey,
    DemolishOuterRadiusKey,
    DemolishOuterRadiusKey,
    DemolishOuterRadiusKey,
  ];
  innerKeys: [
    DemolishInnerHoleKey,
    DemolishInnerHoleKey,
    DemolishInnerHoleKey,
    DemolishInnerHoleKey,
  ];
  colorKeys: [
    DemolishColorKey,
    DemolishColorKey,
    DemolishColorKey,
    DemolishColorKey,
    DemolishColorKey,
    DemolishColorKey,
  ];
  opacityKeys: [
    DemolishOpacityKey,
    DemolishOpacityKey,
    DemolishOpacityKey,
    DemolishOpacityKey,
  ];
  simAnchorMode: DemolishSimAnchorMode;
  simX: number;
  simY: number;
  simZ: number;
  simAutoLoop: boolean;
  simLoopDelaySec: number;
  simHideTargetCar: boolean;
  simShowReticle: boolean;
}

export interface DemolishShockwaveEvaluatedFrame {
  normT: number;
  elapsedSec: number;
  frameIndex120: number;
  totalFrames120: number;
  size: number;
  worldDiameterUu: number;
  innerHolePct: number;
  rgb: [number, number, number];
  rgbNormalized: [number, number, number];
  cssRgb: string;
  glowFactor: number;
  opacityPct: number;
  opacity: number;
}

export interface DemolishShockwaveSimState {
  isPlaying: boolean;
  activeIn3d: boolean;
  normT: number;
  loopDelayRemainingSec: number;
  triggerId: number;
  lastStepMs: number;
}

export interface DemolishLiveAnchors {
  carX: number;
  carY: number;
  carZ: number;
  carFwdX: number;
  carFwdY: number;
  ballX: number;
  ballY: number;
  ballZ: number;
}

export const DEFAULT_DEMOLISH_SHOCKWAVE_CONFIG: DemolishShockwaveConfig = {
  enabled: true,
  duration: 1.6,
  worldScale: 1,
  verticalOffsetUu: 32,
  featherPct: 45,
  outerFeatherPct: 25,
  glowEndNormT: 0.35,
  glowStrength: 0.85,
  fadeStartNormT: 0.75,
  outerKeys: [
    { t: 0, size: 6 },
    { t: 0.15, size: 470 },
    { t: 0.55, size: 720 },
    { t: 1, size: 850 },
  ],
  innerKeys: [
    { t: 0, innerHole: 0 },
    { t: 0.28, innerHole: 0 },
    { t: 0.65, innerHole: 35 },
    { t: 1, innerHole: 100 },
  ],
  colorKeys: [
    { t: 0, color: '#ffffff' },
    { t: 0.08, color: '#ffe600' },
    { t: 0.25, color: '#ff4500' },
    { t: 0.48, color: '#8c1d00' },
    { t: 0.72, color: '#222020' },
    { t: 1, color: '#0d0d0d' },
  ],
  opacityKeys: [
    { t: 0, opacity: 100 },
    { t: 0.15, opacity: 100 },
    { t: 0.65, opacity: 72 },
    { t: 1, opacity: 0 },
  ],
  simAnchorMode: 'in-front-car',
  simX: 0,
  simY: -1500,
  simZ: 45,
  simAutoLoop: false,
  simLoopDelaySec: 1.0,
  simHideTargetCar: false,
  simShowReticle: false,
};

export function cloneDemolishShockwaveConfig(
  src: DemolishShockwaveConfig
): DemolishShockwaveConfig {
  return {
    ...src,
    outerKeys: [
      { ...src.outerKeys[0] },
      { ...src.outerKeys[1] },
      { ...src.outerKeys[2] },
      { ...src.outerKeys[3] },
    ],
    innerKeys: [
      { ...src.innerKeys[0] },
      { ...src.innerKeys[1] },
      { ...src.innerKeys[2] },
      { ...src.innerKeys[3] },
    ],
    colorKeys: [
      { ...src.colorKeys[0] },
      { ...src.colorKeys[1] },
      { ...src.colorKeys[2] },
      { ...src.colorKeys[3] },
      { ...src.colorKeys[4] },
      { ...src.colorKeys[5] },
    ],
    opacityKeys: [
      { ...src.opacityKeys[0] },
      { ...src.opacityKeys[1] },
      { ...src.opacityKeys[2] },
      { ...src.opacityKeys[3] },
    ],
  };
}

export function smoothstep01(f: number): number {
  const c = Math.max(0, Math.min(1, f));
  return c * c * (3 - 2 * c);
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const cleaned = String(hex || '#ffffff').replace('#', '').trim();
  const n = parseInt(
    cleaned.length === 3 ? cleaned.replace(/(.)/g, '$1$1') : cleaned,
    16
  );
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function sampleOuterTrack(
  keys: readonly DemolishOuterRadiusKey[],
  normT: number
): number {
  if (normT <= keys[0].t) return keys[0].size;
  const last = keys[keys.length - 1];
  if (normT >= last.t) return last.size;
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i];
    const k2 = keys[i + 1];
    if (normT >= k1.t && normT <= k2.t) {
      const f = smoothstep01((normT - k1.t) / Math.max(1e-5, k2.t - k1.t));
      return k1.size + (k2.size - k1.size) * f;
    }
  }
  return keys[0].size;
}

export function sampleInnerHoleTrack(
  keys: readonly DemolishInnerHoleKey[],
  normT: number
): number {
  if (normT <= keys[0].t) return keys[0].innerHole;
  const last = keys[keys.length - 1];
  if (normT >= last.t) return last.innerHole;
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i];
    const k2 = keys[i + 1];
    if (normT >= k1.t && normT <= k2.t) {
      const f = smoothstep01((normT - k1.t) / Math.max(1e-5, k2.t - k1.t));
      return k1.innerHole + (k2.innerHole - k1.innerHole) * f;
    }
  }
  return keys[0].innerHole;
}

export function sampleOpacityTrack(
  keys: readonly DemolishOpacityKey[],
  normT: number
): number {
  if (normT <= keys[0].t) return keys[0].opacity;
  const last = keys[keys.length - 1];
  if (normT >= last.t) return last.opacity;
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i];
    const k2 = keys[i + 1];
    if (normT >= k1.t && normT <= k2.t) {
      const f = smoothstep01((normT - k1.t) / Math.max(1e-5, k2.t - k1.t));
      return k1.opacity + (k2.opacity - k1.opacity) * f;
    }
  }
  return keys[0].opacity;
}

export function sampleColorTrack(
  keys: readonly DemolishColorKey[],
  normT: number
): [number, number, number] {
  if (normT <= keys[0].t) return hexToRgbTuple(keys[0].color);
  const last = keys[keys.length - 1];
  if (normT >= last.t) return hexToRgbTuple(last.color);
  for (let i = 0; i < keys.length - 1; i++) {
    const k1 = keys[i];
    const k2 = keys[i + 1];
    if (normT >= k1.t && normT <= k2.t) {
      const f = smoothstep01((normT - k1.t) / Math.max(1e-5, k2.t - k1.t));
      const c1 = hexToRgbTuple(k1.color);
      const c2 = hexToRgbTuple(k2.color);
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * f),
        Math.round(c1[1] + (c2[1] - c1[1]) * f),
        Math.round(c1[2] + (c2[2] - c1[2]) * f),
      ];
    }
  }
  return hexToRgbTuple(keys[0].color);
}
