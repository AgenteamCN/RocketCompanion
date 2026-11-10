/**
 * ReachabilityConstants.ts
 * Shared constants, physics parameters, visual palette, and precomputed trigonometric tables
 * for the Reachability & Intercept system.
 */

import { N_GROUND_BINS } from './groundReachabilityLut.ts';

export const FUNNEL_RINGS = 16;
export const FUNNEL_SECTORS = 24;
export const BUBBLE_LAT = 12;
export const BUBBLE_LON = 20;

export const GRAVITY_Z = -650.0;
export const BOOST_ACCEL = 1058.333; // RocketSim aerial boost (991.667) + air throttle (66.667)
export const BOOST_BURN_RATE = 33.333;
export const MAX_CAR_SPEED = 2300.0;
export const BALL_CAR_CONTACT_RADIUS = 148.0; // Ball radius (91.25) + Octane effective nose reach (~56.75)
export const JUMP_IMMEDIATE_FORCE = 291.667; // Frame-1 jump impulse (875 / 3 UU/s)
export const JUMP_MIN_VELOCITY = 328.125; // Minimum tap-jump upward velocity: 291.667 + 0.025s * 1458.333 (3-tick minimum hold)
export const JUMP_MAX_SINGLE_VELOCITY = 583.333; // Full 0.20s held single-jump upward velocity: 291.667 + 0.20s * 1458.333

export const HORIZON_COLORS_HEX = Object.freeze([0x0df2a6, 0xffd91a, 0xff47a6]); // 1s Cyan-Green, 2s Gold, 3s Rose
export const HORIZON_RGB = Object.freeze([
  Object.freeze([0.05, 0.95, 0.65]),
  Object.freeze([1.0, 0.85, 0.1]),
  Object.freeze([1.0, 0.28, 0.65]),
]);

// Precomputed polar angle tables for Ground (72 bins)
export const GROUND_ANGLES = new Float32Array(N_GROUND_BINS);
export const GROUND_COS = new Float32Array(N_GROUND_BINS);
export const GROUND_SIN = new Float32Array(N_GROUND_BINS);
for (let i = 0; i < N_GROUND_BINS; i++) {
  const a = -Math.PI + (2.0 * Math.PI * i) / N_GROUND_BINS;
  GROUND_ANGLES[i] = a;
  GROUND_COS[i] = Math.cos(a);
  GROUND_SIN[i] = Math.sin(a);
}

// Precomputed tables for Aerial Funnel (16 rings x 24 sectors)
export const FUNNEL_TIMES = new Float32Array(FUNNEL_RINGS);
for (let i = 0; i < FUNNEL_RINGS; i++) {
  FUNNEL_TIMES[i] = 0.06 + (2.94 * i) / (FUNNEL_RINGS - 1);
}
export const FUNNEL_COS = new Float32Array(FUNNEL_SECTORS);
export const FUNNEL_SIN = new Float32Array(FUNNEL_SECTORS);
for (let j = 0; j < FUNNEL_SECTORS; j++) {
  const phi = (2.0 * Math.PI * j) / FUNNEL_SECTORS;
  FUNNEL_COS[j] = Math.cos(phi);
  FUNNEL_SIN[j] = Math.sin(phi);
}

export const FUNNEL_IDX_1S = 5; // t ~ 1.04s
export const FUNNEL_IDX_2S = 10; // t ~ 2.02s
export const FUNNEL_IDX_3S = FUNNEL_RINGS - 1; // t = 3.00s

// Precomputed unit sphere directions for Discrete 3D Bubbles ((BUBBLE_LAT + 1) * BUBBLE_LON)
export const BUBBLE_VERTS_COUNT = (BUBBLE_LAT + 1) * BUBBLE_LON;
export const BUBBLE_UNIT_DIRS = new Float32Array(BUBBLE_VERTS_COUNT * 3);
for (let i = 0; i <= BUBBLE_LAT; i++) {
  const theta = (Math.PI * i) / BUBBLE_LAT;
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  for (let j = 0; j < BUBBLE_LON; j++) {
    const phi = (2.0 * Math.PI * j) / BUBBLE_LON;
    const idx = (i * BUBBLE_LON + j) * 3;
    BUBBLE_UNIT_DIRS[idx + 0] = st * Math.cos(phi);
    BUBBLE_UNIT_DIRS[idx + 1] = st * Math.sin(phi);
    BUBBLE_UNIT_DIRS[idx + 2] = ct;
  }
}

/**
 * Clips RocketSim world coordinates (x, y, z) to the standard carball arena boundary
 * including 45-degree corner bevels (|x| + |y| <= 8064 - margin).
 */
export function clipArenaRocketSimXYZ(x: number, y: number, z: number, margin = 46.0) {
  const xLim = 4096.0 - margin;
  const yLim = 5120.0 - margin;
  const zMin = 16.0;
  const zMax = 2044.0 - margin;

  let xc = x < -xLim ? -xLim : x > xLim ? xLim : x;
  let yc = y < -yLim ? -yLim : y > yLim ? yLim : y;
  const zc = z < zMin ? zMin : z > zMax ? zMax : z;

  const bevelLim = 8064.0 - margin;
  const sumAbs = Math.abs(xc) + Math.abs(yc);
  if (sumAbs > bevelLim && sumAbs > 1e-5) {
    const scale = bevelLim / sumAbs;
    xc *= scale;
    yc *= scale;
  }
  return { x: xc, y: yc, z: zc };
}
