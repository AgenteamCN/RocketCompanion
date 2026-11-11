/**
 * SafeTensorsLoader.ts
 * Zero-dependency, zero-copy SafeTensors binary format parser and weight cache
 * for native Web (TypedArray) neural network policy inference.
 *
 * SafeTensors specification:
 * - Bytes [0..7]: uint64 little-endian byte length N of the UTF-8 JSON header
 * - Bytes [8..8+N-1]: UTF-8 JSON object mapping tensor names to { dtype, shape, data_offsets: [start, end] }
 * - Bytes [8+N..]: Contiguous little-endian tensor data buffer
 */

import { validateAssetResponse, resolveAssetPath } from '../../utils/AssetResponseValidator.ts';
import { yieldToNextFrame } from '../../loader/frameBudgetScheduler.ts';

export const EXPERIMENTAL_MODEL_URLS = Object.freeze({
  necto: '/assets/models/experimental/necto_policy.safetensors',
  nexto: '/assets/models/experimental/nexto_policy.safetensors',
  ko_v2: '/assets/models/experimental/kickoff_v2_policy.safetensors',
  ko_v1: '/assets/models/experimental/kickoff_v1_policy.safetensors',
  chronos: '/assets/models/experimental/botpack_9700488/chronos_policy.safetensors',
  dice: '/assets/models/experimental/botpack_9700488/dice_policy.safetensors',
  ducky: '/assets/models/experimental/botpack_9700488/ducky_policy.safetensors',
  fury: '/assets/models/experimental/botpack_9700488/fury_policy.safetensors',
  galactus: '/assets/models/experimental/botpack_9700488/galactus_policy.safetensors',
  kira: '/assets/models/experimental/botpack_9700488/kira_policy.safetensors',
  rain: '/assets/models/experimental/botpack_9700488/rain_3v3_policy.safetensors',
  ripple_v1_1: '/assets/models/experimental/botpack_9700488/ripple_v1_1_policy.safetensors',
});

const _modelCache = new Map();
const _loadingPromises = new Map();

// Precomputed 65536-entry IEEE-754 float16 -> float32 lookup table for instant F16 decoding
const _F16_TO_F32_LUT = (() => {
  const lut = new Float32Array(65536);
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  for (let h = 0; h < 65536; h++) {
    const sign = (h & 0x8000) << 16;
    const exp = (h >> 10) & 0x1f;
    const mant = h & 0x03ff;
    if (exp === 0) {
      if (mant === 0) {
        u32[0] = sign;
      } else {
        let m = mant;
        let e = -14;
        while ((m & 0x0400) === 0) {
          m <<= 1;
          e--;
        }
        m &= 0x03ff;
        u32[0] = sign | ((e + 127) << 23) | (m << 13);
      }
    } else if (exp === 31) {
      u32[0] = sign | 0x7f800000 | (mant << 13);
    } else {
      u32[0] = sign | ((exp - 15 + 127) << 23) | (mant << 13);
    }
    lut[h] = f32[0];
  }
  return lut;
})();

export interface SafeTensorEntry {
  shape: number[];
  dtype: string;
  data: Float32Array | Int32Array;
}

export type SafeTensorsMap = Record<string, SafeTensorEntry>;

export interface ParsedSafeTensorsModel {
  metadata: Record<string, unknown>;
  tensors: SafeTensorsMap;
  rawBuffer?: ArrayBuffer;
}

/**
 * Parses an ArrayBuffer in SafeTensors format into Float32Array / Int32Array views.
 */
export function parseSafeTensorsBuffer(buffer: ArrayBuffer): ParsedSafeTensorsModel {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) {
    throw new Error(`[SafeTensorsLoader] Invalid buffer (byteLength=${buffer?.byteLength ?? 0}).`);
  }

  const view = new DataView(buffer);
  const headerLenLow = view.getUint32(0, true);
  const headerLenHigh = view.getUint32(4, true);
  if (headerLenHigh !== 0 || headerLenLow <= 0 || 8 + headerLenLow > buffer.byteLength) {
    throw new Error(`[SafeTensorsLoader] Corrupt SafeTensors header length: ${headerLenLow}.`);
  }

  const headerBytes = new Uint8Array(buffer, 8, headerLenLow);
  const headerStr = new TextDecoder('utf-8').decode(headerBytes).trim();
  const headerJson = JSON.parse(headerStr);

  const dataBaseOffset = 8 + headerLenLow;
  const metadata: Record<string, unknown> = headerJson.__metadata__ || {};
  const tensors: Record<string, SafeTensorEntry> = {};

  for (const [name, info] of Object.entries<any>(headerJson)) {
    if (name === '__metadata__') continue;
    const { dtype, shape, data_offsets: offsets } = info;
    if (!Array.isArray(offsets) || offsets.length !== 2) {
      throw new Error(`[SafeTensorsLoader] Missing data_offsets for tensor "${name}".`);
    }
    const startByte = dataBaseOffset + offsets[0];
    const endByte = dataBaseOffset + offsets[1];
    const byteLength = endByte - startByte;

    if (startByte < dataBaseOffset || endByte > buffer.byteLength || byteLength < 0) {
      throw new Error(`[SafeTensorsLoader] Out-of-bounds offsets for tensor "${name}".`);
    }

    if (dtype === 'F32') {
      const floatCount = byteLength / 4;
      const data =
        startByte % 4 === 0
          ? new Float32Array(buffer, startByte, floatCount)
          : new Float32Array(buffer.slice(startByte, endByte));
      tensors[name] = { shape, dtype, data };
    } else if (dtype === 'F16') {
      const count = byteLength / 2;
      const u16 =
        startByte % 2 === 0
          ? new Uint16Array(buffer, startByte, count)
          : new Uint16Array(buffer.slice(startByte, endByte));
      const data = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        data[i] = _F16_TO_F32_LUT[u16[i]];
      }
      tensors[name] = { shape, dtype: 'F32', data };
    } else if (dtype === 'I32') {
      const count = byteLength / 4;
      const data =
        startByte % 4 === 0
          ? new Int32Array(buffer, startByte, count)
          : new Int32Array(buffer.slice(startByte, endByte));
      tensors[name] = { shape, dtype, data };
    }
  }

  return { metadata, tensors, rawBuffer: buffer };
}

/**
 * Time-sliced async SafeTensors parser that yields to the 120Hz render loop during
 * large F16 -> F32 weight conversions.
 */
export async function parseSafeTensorsBufferAsync(
  buffer: ArrayBuffer
): Promise<ParsedSafeTensorsModel> {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) {
    throw new Error(`[SafeTensorsLoader] Invalid buffer (byteLength=${buffer?.byteLength ?? 0}).`);
  }

  const view = new DataView(buffer);
  const headerLenLow = view.getUint32(0, true);
  const headerLenHigh = view.getUint32(4, true);
  if (headerLenHigh !== 0 || headerLenLow <= 0 || 8 + headerLenLow > buffer.byteLength) {
    throw new Error(`[SafeTensorsLoader] Corrupt SafeTensors header length: ${headerLenLow}.`);
  }

  const headerBytes = new Uint8Array(buffer, 8, headerLenLow);
  const headerStr = new TextDecoder('utf-8').decode(headerBytes).trim();
  const headerJson = JSON.parse(headerStr);

  const dataBaseOffset = 8 + headerLenLow;
  const metadata: Record<string, unknown> = headerJson.__metadata__ || {};
  const tensors: Record<string, SafeTensorEntry> = {};
  let sliceStart = typeof performance !== 'undefined' ? performance.now() : 0;

  for (const [name, info] of Object.entries<any>(headerJson)) {
    if (name === '__metadata__') continue;
    const { dtype, shape, data_offsets: offsets } = info;
    if (!Array.isArray(offsets) || offsets.length !== 2) {
      throw new Error(`[SafeTensorsLoader] Missing data_offsets for tensor "${name}".`);
    }
    const startByte = dataBaseOffset + offsets[0];
    const endByte = dataBaseOffset + offsets[1];
    const byteLength = endByte - startByte;

    if (startByte < dataBaseOffset || endByte > buffer.byteLength || byteLength < 0) {
      throw new Error(`[SafeTensorsLoader] Out-of-bounds offsets for tensor "${name}".`);
    }

    if (dtype === 'F32') {
      const floatCount = byteLength / 4;
      const data =
        startByte % 4 === 0
          ? new Float32Array(buffer, startByte, floatCount)
          : new Float32Array(buffer.slice(startByte, endByte));
      tensors[name] = { shape, dtype, data };
    } else if (dtype === 'F16') {
      const count = byteLength / 2;
      const u16 =
        startByte % 2 === 0
          ? new Uint16Array(buffer, startByte, count)
          : new Uint16Array(buffer.slice(startByte, endByte));
      const data = new Float32Array(count);
      const CHUNK_SIZE = 65536;
      for (let base = 0; base < count; base += CHUNK_SIZE) {
        const limit = Math.min(count, base + CHUNK_SIZE);
        for (let i = base; i < limit; i++) {
          data[i] = _F16_TO_F32_LUT[u16[i]];
        }
        const now = typeof performance !== 'undefined' ? performance.now() : 0;
        if (now - sliceStart >= 2.0) {
          await yieldToNextFrame();
          sliceStart = typeof performance !== 'undefined' ? performance.now() : 0;
        }
      }
      tensors[name] = { shape, dtype: 'F32', data };
    } else if (dtype === 'I32') {
      const count = byteLength / 4;
      const data =
        startByte % 4 === 0
          ? new Int32Array(buffer, startByte, count)
          : new Int32Array(buffer.slice(startByte, endByte));
      tensors[name] = { shape, dtype, data };
    }
  }

  return { metadata, tensors, rawBuffer: buffer };
}

/**
 * Loads and caches a SafeTensors policy file by model ID or URL.
 * @param {string} modelId
 * @param {string|null} [customUrl]
 */
export async function loadExperimentalPolicySafeTensors(
  modelId: string,
  customUrl: string | null = null
) {
  const rawUrl = customUrl || (EXPERIMENTAL_MODEL_URLS as Record<string, string>)[modelId];
  if (!rawUrl) {
    throw new Error(`[SafeTensorsLoader] Unknown experimental modelId "${modelId}".`);
  }
  const url = resolveAssetPath(rawUrl);

  if (_modelCache.has(modelId)) {
    return _modelCache.get(modelId);
  }
  if (_loadingPromises.has(modelId)) {
    return _loadingPromises.get(modelId);
  }

  const promise = (async () => {
    try {
      if (typeof fetch === 'function') {
        const res = await fetch(url);
        const check = validateAssetResponse(res, url, 'binary');
        if (!check.ok) {
          throw check.error;
        }
        const buf = await res.arrayBuffer();
        await yieldToNextFrame();
        const parsed = await parseSafeTensorsBufferAsync(buf);
        _modelCache.set(modelId, parsed);
        return parsed;
      }
      throw new Error('[SafeTensorsLoader] Global fetch API is unavailable.');
    } finally {
      _loadingPromises.delete(modelId);
    }
  })();

  _loadingPromises.set(modelId, promise);
  return promise;
}

/**
 * Injects a pre-parsed SafeTensors object into the runtime cache (useful for Node/headless verification).
 * @param {string} modelId
 * @param {Object} parsedSafeTensors
 */
export function registerCachedSafeTensors(modelId, parsedSafeTensors) {
  _modelCache.set(modelId, parsedSafeTensors);
}

/**
 * Synchronously retrieves cached SafeTensors weights if already loaded.
 * @param {string} modelId
 */
export function getCachedSafeTensors(modelId) {
  return _modelCache.get(modelId) || null;
}
