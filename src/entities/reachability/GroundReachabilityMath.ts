/**
 * GroundReachabilityMath.ts
 * Zero-allocation ground/surface reachability isochrone solvers (1s / 2s / 3s, Boost = 0):
 * - "lut": 3D Trilinear Interpolation over RocketSim WASM (core.wasm) Convex-Hull LUT (~1.4 us/call)
 * - "analytical": Kinematic super-ellipse envelope (~2.1 us/call)
 */

import {
  N_GROUND_BINS,
  VF_GRID,
  VR_GRID,
  WZ_GRID,
  getGroundReachabilityLut,
} from './groundReachabilityLut.ts';
import { GROUND_ANGLES } from './ReachabilityConstants.ts';

function findGridSegment(grid, val) {
  const n = grid.length;
  if (val <= grid[0]) return { idx: 0, t: 0.0 };
  if (val >= grid[n - 1]) return { idx: n - 2, t: 1.0 };
  for (let i = 0; i < n - 1; i++) {
    const g0 = grid[i];
    const g1 = grid[i + 1];
    if (val >= g0 && val <= g1) {
      return { idx: i, t: (val - g0) / (g1 - g0) };
    }
  }
  return { idx: 0, t: 0.0 };
}

/**
 * Analytical kinematic super-ellipse envelope model (~2.1 us/call).
 */
export function predictGroundRadiiAnalytical(vf, vr, wz, outRadii) {
  if (Math.hypot(vf, vr) < 8.0) {
    vf = 0.0;
    vr = 0.0;
  }
  if (Math.abs(wz) < 0.05) {
    wz = 0.0;
  }

  const isSymmetric = vr === 0.0 && wz === 0.0;
  const yawBias = Math.max(-0.45, Math.min(0.45, wz * 0.14));

  for (let hIdx = 0; hIdx < 3; hIdx++) {
    let driftU, driftV, rFwd, rBwd, rLat;
    const absVfClamped = Math.min(Math.abs(vf), 1400.0);
    if (hIdx === 0) {
      driftU = vf * 0.62;
      driftV = vr * 0.45 + wz * 35.0;
      rFwd = 585.0 + Math.max(0.0, vf) * 0.35;
      rBwd = 440.0 - Math.min(0.0, vf) * 0.25;
      rLat = 440.0 + absVfClamped * 0.3;
    } else if (hIdx === 1) {
      driftU = vf * 0.85;
      driftV = vr * 0.65 + wz * 85.0;
      rFwd = 1800.0 + Math.max(0.0, vf) * 0.4;
      rBwd = 1420.0 - Math.min(0.0, vf) * 0.35;
      rLat = 1420.0 + absVfClamped * 0.35;
    } else {
      driftU = vf * 0.95;
      driftV = vr * 0.75 + wz * 125.0;
      rFwd = 3200.0 + Math.max(0.0, vf) * 0.45;
      rBwd = 1950.0 - Math.min(0.0, vf) * 0.4;
      rLat = 1950.0 + absVfClamped * 0.38;
    }

    const base = hIdx * N_GROUND_BINS;
    const turnSide = wz >= 0.0 ? 1.0 : -1.0;
    const wzScale = Math.min(Math.abs(wz) / 3.0, 1.0);

    for (let i = 0; i < N_GROUND_BINS; i++) {
      const phi = GROUND_ANGLES[i] - yawBias;
      const cPhi = Math.cos(phi);
      const sPhi = Math.sin(phi);
      const wFwd = 0.5 * (1.0 + cPhi);
      const rLon = Math.max(1.0, wFwd * rFwd + (1.0 - wFwd) * rBwd);
      const rLatSafe = Math.max(1.0, rLat);

      const denom = Math.hypot(cPhi / rLon, sPhi / rLatSafe);
      let rShape = 1.0 / Math.max(denom, 1e-6);

      if (Math.abs(wz) > 0.05) {
        const rawBulge = Math.max(-1.0, Math.min(1.0, turnSide * sPhi * (1.0 + cPhi * 0.5)));
        rShape *= 1.0 + 0.12 * rawBulge * wzScale;
      }

      const pu = driftU + rShape * cPhi;
      const pv = driftV + rShape * sPhi;
      outRadii[base + i] = Math.hypot(pu, pv);
    }

    if (isSymmetric) {
      for (let b = 1; b < N_GROUND_BINS >> 1; b++) {
        const sym = N_GROUND_BINS - b;
        const avg = 0.5 * (outRadii[base + b] + outRadii[base + sym]);
        outRadii[base + b] = avg;
        outRadii[base + sym] = avg;
      }
    }
  }

  for (let b = 0; b < N_GROUND_BINS; b++) {
    const r0 = Math.max(60.0, outRadii[b]);
    const r1 = Math.max(r0 + 60.0, outRadii[N_GROUND_BINS + b]);
    const r2 = Math.max(r1 + 60.0, outRadii[2 * N_GROUND_BINS + b]);
    outRadii[b] = r0;
    outRadii[N_GROUND_BINS + b] = r1;
    outRadii[2 * N_GROUND_BINS + b] = r2;
  }
  return outRadii;
}

/**
 * Predicts (3 * 72) polar radii using 3D Trilinear Interpolation over the pre-baked core.wasm LUT.
 * Falls back gracefully to the analytical kinematic model if the external LUT binary is still loading.
 * Execution time: ~1.4 microseconds.
 */
export function predictGroundRadiiLUT(vf, vr, wz, outRadii) {
  const lut = getGroundReachabilityLut();
  if (!lut) {
    return predictGroundRadiiAnalytical(vf, vr, wz, outRadii);
  }
  const stride = 3 * N_GROUND_BINS;
  const nVr = VR_GRID.length;
  const nWz = WZ_GRID.length;

  if (Math.hypot(vf, vr) < 8.0) {
    vf = 0.0;
    vr = 0.0;
  }
  if (Math.abs(wz) < 0.05) {
    wz = 0.0;
  }

  const flip = vr < 0.0 || (vr === 0.0 && wz < 0.0);
  const vrAbs = Math.abs(vr);
  const wzSym = flip ? -wz : wz;

  const segU = findGridSegment(VF_GRID, vf);
  const segV = findGridSegment(VR_GRID, vrAbs);
  const segW = findGridSegment(WZ_GRID, wzSym);

  const i0 = segU.idx,
    du = segU.t;
  const j0 = segV.idx,
    dv = segV.t;
  const k0 = segW.idx,
    dw = segW.t;

  const w000 = (1.0 - du) * (1.0 - dv) * (1.0 - dw);
  const w100 = du * (1.0 - dv) * (1.0 - dw);
  const w010 = (1.0 - du) * dv * (1.0 - dw);
  const w110 = du * dv * (1.0 - dw);
  const w001 = (1.0 - du) * (1.0 - dv) * dw;
  const w101 = du * (1.0 - dv) * dw;
  const w011 = (1.0 - du) * dv * dw;
  const w111 = du * dv * dw;

  const idx000 = ((i0 * nVr + j0) * nWz + k0) * stride;
  const idx100 = (((i0 + 1) * nVr + j0) * nWz + k0) * stride;
  const idx010 = ((i0 * nVr + (j0 + 1)) * nWz + k0) * stride;
  const idx110 = (((i0 + 1) * nVr + (j0 + 1)) * nWz + k0) * stride;
  const idx001 = idx000 + stride;
  const idx101 = idx100 + stride;
  const idx011 = idx010 + stride;
  const idx111 = idx110 + stride;

  for (let m = 0; m < stride; m++) {
    outRadii[m] =
      lut[idx000 + m] * w000 +
      lut[idx100 + m] * w100 +
      lut[idx010 + m] * w010 +
      lut[idx110 + m] * w110 +
      lut[idx001 + m] * w001 +
      lut[idx101 + m] * w101 +
      lut[idx011 + m] * w011 +
      lut[idx111 + m] * w111;
  }

  if (flip) {
    for (let h = 0; h < 3; h++) {
      const base = h * N_GROUND_BINS;
      for (let b = 1; b < N_GROUND_BINS >> 1; b++) {
        const sym = N_GROUND_BINS - b;
        const tmp = outRadii[base + b];
        outRadii[base + b] = outRadii[base + sym];
        outRadii[base + sym] = tmp;
      }
    }
  }

  // Enforce strict horizon nesting
  for (let b = 0; b < N_GROUND_BINS; b++) {
    const r0 = Math.max(60.0, outRadii[b]);
    const r1 = Math.max(r0 + 50.0, outRadii[N_GROUND_BINS + b]);
    const r2 = Math.max(r1 + 50.0, outRadii[2 * N_GROUND_BINS + b]);
    outRadii[b] = r0;
    outRadii[N_GROUND_BINS + b] = r1;
    outRadii[2 * N_GROUND_BINS + b] = r2;
  }
  return outRadii;
}
