/**
 * groundReachabilityLut.ts
 * Pre-baked 3D Ground Reachability Lookup Table (1s / 2s / 3s Isochrones, Boost = 0)
 * Generated directly from RocketSim WASM (core.wasm) extremal trajectory rollouts
 * with 2D Andrew Monotone Chain Convex Hull ray sampling (72 polar angle bins).
 *
 * Grid dimensions:
 *   VF_GRID (11): [-1400, -1000, -600, -250, 0, 250, 600, 1000, 1400, 1850, 2300] UU/s
 *   VR_GRID (5):  [0, 250, 600, 1000, 1500] UU/s (exploits bilateral symmetry for vr < 0)
 *   WZ_GRID (3):  [-3.0, 0.0, 3.0] rad/s
 *   Horizons (3): [1.0s, 2.0s, 3.0s]
 *   Angles (72):  [-pi, pi) in 5-degree steps
 *
 * The raw Uint16Array tensor (35,640 uint16 values = 71,280 bytes, stored in units of 0.1 UU)
 * is externalized at `/assets/models/ground_reachability_lut.bin`.
 */

import { validateAssetResponse, resolveAssetPath } from '../../utils/AssetResponseValidator.ts';

export const GROUND_REACHABILITY_LUT_URL = '/assets/models/ground_reachability_lut.bin';

export const N_GROUND_BINS = 72;
export const GROUND_HORIZONS = Object.freeze([1.0, 2.0, 3.0]);
export const VF_GRID = Object.freeze([
  -1400, -1000, -600, -250, 0, 250, 600, 1000, 1400, 1850, 2300,
]);
export const VR_GRID = Object.freeze([0, 250, 600, 1000, 1500]);
export const WZ_GRID = Object.freeze([-3.0, 0.0, 3.0]);

export const GROUND_REACHABILITY_LUT_META = Object.freeze({
  totalElements:
    VF_GRID.length * VR_GRID.length * WZ_GRID.length * GROUND_HORIZONS.length * N_GROUND_BINS,
  byteLength:
    VF_GRID.length * VR_GRID.length * WZ_GRID.length * GROUND_HORIZONS.length * N_GROUND_BINS * 2,
  unitScaleUU: 0.1,
});

let _decodedLut: any = null;
let _loadingPromise: any = null;

/**
 * Asynchronously fetches, validates, and decodes the external binary Uint16Array LUT
 * into a cached Float32Array in Unreal Units (UU).
 */
export async function preloadGroundReachabilityLut(rawUrl = GROUND_REACHABILITY_LUT_URL) {
  const url = resolveAssetPath(rawUrl);
  if (_decodedLut) {
    return _decodedLut;
  }
  if (_loadingPromise) {
    return _loadingPromise;
  }

  _loadingPromise = (async () => {
    try {
      if (typeof fetch === 'function') {
        const res = await fetch(url);
        const check = validateAssetResponse(res, url, 'binary');
        if (!check.ok) {
          throw check.error;
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength < GROUND_REACHABILITY_LUT_META.byteLength) {
          throw new Error(
            `[GroundReachabilityLut] Invalid binary byteLength ${buf.byteLength} (expected ${GROUND_REACHABILITY_LUT_META.byteLength})`
          );
        }
        const u16 = new Uint16Array(buf, 0, GROUND_REACHABILITY_LUT_META.totalElements);
        const f32 = new Float32Array(u16.length);
        const scale = GROUND_REACHABILITY_LUT_META.unitScaleUU;
        for (let i = 0; i < u16.length; i++) {
          f32[i] = u16[i] * scale;
        }
        _decodedLut = f32;
        return _decodedLut;
      }
    } catch (err) {
      console.warn(
        '[GroundReachabilityLut] Failed to fetch binary LUT, falling back to analytical kinematic model until loaded:',
        err
      );
    } finally {
      _loadingPromise = null;
    }
    return null;
  })();

  return _loadingPromise;
}

/**
 * Synchronously returns the decoded Float32Array LUT if already preloaded,
 * or triggers background preloading and returns null so callers can fall back to the analytical model.
 */
export function getGroundReachabilityLut() {
  if (_decodedLut) {
    return _decodedLut;
  }
  preloadGroundReachabilityLut();
  return null;
}

export function isGroundReachabilityLutReady() {
  return Boolean(_decodedLut);
}
