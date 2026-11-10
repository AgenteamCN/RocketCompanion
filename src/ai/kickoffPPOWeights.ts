/**
 * kickoffPPOWeights.ts
 * Externalized MLP Actor Weights Loader & Metadata for the 1v1 Kickoff PPO Agent.
 *
 * Loads the Float32 parameter tensor (89,103 floats) from the external SafeTensors
 * policy model (`EXPERIMENTAL_MODEL_URLS.ko_v1`).
 */

import { validateAssetResponse, resolveAssetPath } from '../utils/AssetResponseValidator.ts';
import {
  EXPERIMENTAL_MODEL_URLS,
  parseSafeTensorsBuffer,
  registerCachedSafeTensors,
} from './experimental/SafeTensorsLoader.ts';

export const KICKOFF_PPO_WEIGHTS_URL = EXPERIMENTAL_MODEL_URLS.ko_v1;

export const KICKOFF_PPO_META = {
  arch: 'mlp_75_256_256_15_tanh',
  obsDim: 75,
  logitsDim: 15,
  settleTicks: 30,
  actionRepeat: 4,
  totalFloats: 89103,
  byteLength: 356412,
  layers: {
    'actor.0.weight': { shape: [256, 75], offset: 0, length: 19200 },
    'actor.0.bias': { shape: [256], offset: 19200, length: 256 },
    'actor.2.weight': { shape: [256, 256], offset: 19456, length: 65536 },
    'actor.2.bias': { shape: [256], offset: 84992, length: 256 },
    'actor.4.weight': { shape: [15, 256], offset: 85248, length: 3840 },
    'actor.4.bias': { shape: [15], offset: 89088, length: 15 },
  },
};

let _cachedSlices: any = null;
let _loadingPromise: Promise<any> | null = null;

function sliceFlatWeights(flat: Float32Array, isFallback = false) {
  const l = KICKOFF_PPO_META.layers;
  return {
    w0: flat.subarray(
      l['actor.0.weight'].offset,
      l['actor.0.weight'].offset + l['actor.0.weight'].length
    ),
    b0: flat.subarray(
      l['actor.0.bias'].offset,
      l['actor.0.bias'].offset + l['actor.0.bias'].length
    ),
    w2: flat.subarray(
      l['actor.2.weight'].offset,
      l['actor.2.weight'].offset + l['actor.2.weight'].length
    ),
    b2: flat.subarray(
      l['actor.2.bias'].offset,
      l['actor.2.bias'].offset + l['actor.2.bias'].length
    ),
    w4: flat.subarray(
      l['actor.4.weight'].offset,
      l['actor.4.weight'].offset + l['actor.4.weight'].length
    ),
    b4: flat.subarray(
      l['actor.4.bias'].offset,
      l['actor.4.bias'].offset + l['actor.4.bias'].length
    ),
    isFallback,
  };
}

/**
 * Asynchronously fetches and caches the SafeTensors Float32 weights for the Kickoff PPO Actor.
 */
export async function preloadKickoffPPOWeights(rawUrl = KICKOFF_PPO_WEIGHTS_URL) {
  const url = resolveAssetPath(rawUrl);
  if (_cachedSlices && !_cachedSlices.isFallback) {
    return _cachedSlices;
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
        const parsed = parseSafeTensorsBuffer(buf);
        registerCachedSafeTensors('ko_v1', parsed);
        const t = parsed.tensors;
        _cachedSlices = {
          w0: t['actor.0.weight'].data,
          b0: t['actor.0.bias'].data,
          w2: t['actor.2.weight'].data,
          b2: t['actor.2.bias'].data,
          w4: t['actor.4.weight'].data,
          b4: t['actor.4.bias'].data,
          isFallback: false,
        };
        return _cachedSlices;
      } else {
        console.warn(
          '[KickoffPPOWeights] Global fetch is unavailable; using zero-initialized fallback weights.'
        );
      }
    } catch (err) {
      console.warn(
        '[KickoffPPOWeights] Failed to fetch SafeTensors weights, using fallback until loaded:',
        err
      );
    } finally {
      _loadingPromise = null;
    }

    if (!_cachedSlices) {
      _cachedSlices = sliceFlatWeights(new Float32Array(KICKOFF_PPO_META.totalFloats), true);
    }
    return _cachedSlices;
  })();

  return _loadingPromise;
}

/**
 * Synchronously returns the cached Kickoff PPO Actor weights if already preloaded,
 * or triggers background preloading and returns a zero-initialized fallback tensor.
 */
export function getKickoffPPOActorWeights() {
  if (_cachedSlices) {
    return _cachedSlices;
  }
  console.warn(
    '[KickoffPPOWeights] getKickoffPPOActorWeights called before async preload completed; returning zero-initialized fallback weights while preloading in background.'
  );
  preloadKickoffPPOWeights();
  _cachedSlices = sliceFlatWeights(new Float32Array(KICKOFF_PPO_META.totalFloats), true);
  return _cachedSlices;
}
