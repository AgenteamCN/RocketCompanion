import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MirroredRepeatWrapping,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
} from 'three';
import { GROUND_Q1_MANIFEST } from '../../../ui-core/config/driftwoodsConfig.ts';
import { resolveAssetPath } from '../../../utils/AssetResponseValidator.ts';

export const Q1_WIDTH = GROUND_Q1_MANIFEST.resolution?.width || 2048;
export const Q1_HEIGHT = GROUND_Q1_MANIFEST.resolution?.height || 3000;
export const Q1_TOTAL_PIXELS = Q1_WIDTH * Q1_HEIGHT;

import type { Texture } from 'three';

let sharedQ1GroundTexture: Texture | null = null;
let sharedQ1DilatedLayerId: Uint8Array | null = null;
let sharedQ1NormalizedCoverage: Uint8Array | null = null;
const q1MaskReadyListeners = new Set<() => void>();

export function subscribeQ1MaskReady(listener: () => void) {
  q1MaskReadyListeners.add(listener);
  return () => q1MaskReadyListeners.delete(listener);
}

export function getPrecomputedQ1Mask() {
  return {
    dilatedLayerId: sharedQ1DilatedLayerId,
    normalizedCoverage: sharedQ1NormalizedCoverage,
  };
}

/**
 * Extracts the raw 2048x3000 grayscale mask from the loaded WebP image once,
 * classifies L1..L6 according to the 7-layer plateau centers (36, 73, 109, 146, 182, 219),
 * normalizes sub-pixel anti-aliased edge coverage to [0..255], and performs a 2-pass
 * Chamfer Voronoi distance transform (color dilation) so every L0 background pixel
 * inherits the nearest line layer's ID.
 *
 * @param {HTMLImageElement | ImageBitmap | HTMLCanvasElement} image
 */
export function ensureQ1MaskPrecomputed(image) {
  if (sharedQ1DilatedLayerId && sharedQ1NormalizedCoverage) {
    return true;
  }
  if (!image || typeof document === 'undefined') {
    return false;
  }
  try {
    const w = image.width || Q1_WIDTH;
    const h = image.height || Q1_HEIGHT;
    const total = w * h;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(image, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h).data;

    const rawGray = new Uint8Array(total);
    for (let i = 0, p = 0; i < total; i++, p += 4) {
      rawGray[i] = imgData[p];
    }

    const layerId = new Uint8Array(total);
    const coverage = new Uint8Array(total);

    for (let y = 0; y < h; y++) {
      const y0 = y > 1 ? y - 2 : 0;
      const y1 = y < h - 2 ? y + 2 : h - 1;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const v = rawGray[row + x];
        if (v === 0) continue;
        const x0 = x > 1 ? x - 2 : 0;
        const x1 = x < w - 2 ? x + 2 : w - 1;
        let m = v;
        for (let yy = y0; yy <= y1; yy++) {
          const r2 = yy * w;
          for (let xx = x0; xx <= x1; xx++) {
            const val = rawGray[r2 + xx];
            if (val > m) m = val;
          }
        }
        let lid = 6;
        let peak = 219;
        if (m < 55) {
          lid = 1;
          peak = 36;
        } else if (m < 91) {
          lid = 2;
          peak = 73;
        } else if (m < 128) {
          lid = 3;
          peak = 109;
        } else if (m < 164) {
          lid = 4;
          peak = 146;
        } else if (m < 201) {
          lid = 5;
          peak = 182;
        }
        layerId[row + x] = lid;
        const c = Math.round((v * 255) / peak);
        coverage[row + x] = c > 255 ? 255 : c;
      }
    }

    const dist = new Uint16Array(total);
    dist.fill(65535);
    for (let i = 0; i < total; i++) {
      if (layerId[i] !== 0) dist[i] = 0;
    }

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        let d = dist[idx];
        if (d === 0) continue;
        if (y > 0 && dist[idx - w] + 3 < d) {
          d = dist[idx - w] + 3;
          layerId[idx] = layerId[idx - w];
        }
        if (x > 0 && dist[idx - 1] + 3 < d) {
          d = dist[idx - 1] + 3;
          layerId[idx] = layerId[idx - 1];
        }
        if (y > 0 && x > 0 && dist[idx - w - 1] + 4 < d) {
          d = dist[idx - w - 1] + 4;
          layerId[idx] = layerId[idx - w - 1];
        }
        if (y > 0 && x < w - 1 && dist[idx - w + 1] + 4 < d) {
          d = dist[idx - w + 1] + 4;
          layerId[idx] = layerId[idx - w + 1];
        }
        dist[idx] = d;
      }
    }

    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let x = w - 1; x >= 0; x--) {
        const idx = row + x;
        let d = dist[idx];
        if (d === 0) continue;
        if (y < h - 1 && dist[idx + w] + 3 < d) {
          d = dist[idx + w] + 3;
          layerId[idx] = layerId[idx + w];
        }
        if (x < w - 1 && dist[idx + 1] + 3 < d) {
          d = dist[idx + 1] + 3;
          layerId[idx] = layerId[idx + 1];
        }
        if (y < h - 1 && x < w - 1 && dist[idx + w + 1] + 4 < d) {
          d = dist[idx + w + 1] + 4;
          layerId[idx] = layerId[idx + w + 1];
        }
        if (y < h - 1 && x > 0 && dist[idx + w - 1] + 4 < d) {
          d = dist[idx + w - 1] + 4;
          layerId[idx] = layerId[idx + w - 1];
        }
        dist[idx] = d;
      }
    }

    sharedQ1DilatedLayerId = layerId;
    sharedQ1NormalizedCoverage = coverage;
    return true;
  } catch (err) {
    console.warn('[DriftwoodsMipmapBuilder] Failed to precompute Q1 RGBA mask buffers:', err);
    return false;
  }
}

export function getOrLoadQ1GroundTexture(existingTex: Texture | null = null) {
  if (existingTex && existingTex.image && !sharedQ1GroundTexture) {
    sharedQ1GroundTexture = existingTex;
    if (ensureQ1MaskPrecomputed(existingTex.image)) {
      for (const cb of q1MaskReadyListeners) cb();
    }
    return sharedQ1GroundTexture;
  }
  if (sharedQ1GroundTexture) {
    if (sharedQ1GroundTexture.image && !sharedQ1DilatedLayerId) {
      if (ensureQ1MaskPrecomputed(sharedQ1GroundTexture.image)) {
        for (const cb of q1MaskReadyListeners) cb();
      }
    }
    return sharedQ1GroundTexture;
  }
  const loader = new TextureLoader();
  const textureUrl = resolveAssetPath(GROUND_Q1_MANIFEST.url);
  const texture = loader.load(
    textureUrl,
    (loadedTex) => {
      loadedTex.flipY = false;
      loadedTex.wrapS = MirroredRepeatWrapping;
      loadedTex.wrapT = MirroredRepeatWrapping;
      loadedTex.colorSpace = NoColorSpace;
      loadedTex.generateMipmaps = false;
      loadedTex.needsUpdate = true;
      if (ensureQ1MaskPrecomputed(loadedTex.image)) {
        for (const cb of q1MaskReadyListeners) cb();
      }
    },
    undefined,
    (err) => {
      console.warn('[DriftwoodsMipmapBuilder] Failed to load Q1 7-layer ground texture:', err);
    }
  );
  texture.flipY = false;
  texture.wrapS = MirroredRepeatWrapping;
  texture.wrapT = MirroredRepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  sharedQ1GroundTexture = texture;
  return texture;
}

/**
 * Builds a complete MirroredRepeat-aware 2x2 box-filtered mipmap pyramid for a 2D RGBA DataTexture.
 *
 * @param {import('three').DataTexture} tex
 */
export function rebuildMirroredRepeatMipmaps(tex) {
  if (!tex?.image?.data) return;
  let prevW = tex.image.width || Q1_WIDTH;
  let prevH = tex.image.height || Q1_HEIGHT;
  let prevData = tex.image.data;

  const mipmaps = [
    {
      data: prevData,
      width: prevW,
      height: prevH,
    },
  ];

  while (prevW > 1 || prevH > 1) {
    const nextW = Math.max(1, prevW >> 1);
    const nextH = Math.max(1, prevH >> 1);
    const nextData = new Uint8Array(nextW * nextH * 4);

    for (let y = 0; y < nextH; y++) {
      const sy0 = Math.min(prevH - 1, y * 2);
      const sy1 = Math.min(prevH - 1, sy0 + 1);
      const row0 = sy0 * prevW;
      const row1 = sy1 * prevW;
      const dstRow = y * nextW;

      for (let x = 0; x < nextW; x++) {
        const sx0 = Math.min(prevW - 1, x * 2);
        const sx1 = Math.min(prevW - 1, sx0 + 1);

        const i00 = (row0 + sx0) << 2;
        const i10 = (row0 + sx1) << 2;
        const i01 = (row1 + sx0) << 2;
        const i11 = (row1 + sx1) << 2;
        const dstIdx = (dstRow + x) << 2;

        nextData[dstIdx] = (prevData[i00] + prevData[i10] + prevData[i01] + prevData[i11] + 2) >> 2;
        nextData[dstIdx + 1] =
          (prevData[i00 + 1] + prevData[i10 + 1] + prevData[i01 + 1] + prevData[i11 + 1] + 2) >> 2;
        nextData[dstIdx + 2] =
          (prevData[i00 + 2] + prevData[i10 + 2] + prevData[i01 + 2] + prevData[i11 + 2] + 2) >> 2;
        nextData[dstIdx + 3] =
          (prevData[i00 + 3] + prevData[i10 + 3] + prevData[i01 + 3] + prevData[i11 + 3] + 2) >> 2;
      }
    }

    mipmaps.push({
      data: nextData,
      width: nextW,
      height: nextH,
    });

    prevW = nextW;
    prevH = nextH;
    prevData = nextData;
  }

  tex.mipmaps = mipmaps;
  tex.generateMipmaps = false;
}

export function createBakedGroundDataTexture(buildInitialMipmaps = true) {
  const data = new Uint8Array(Q1_TOTAL_PIXELS * 4);
  const tex = new DataTexture(data, Q1_WIDTH, Q1_HEIGHT, RGBAFormat, UnsignedByteType);
  tex.flipY = false;
  tex.wrapS = MirroredRepeatWrapping;
  tex.wrapT = MirroredRepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  if (buildInitialMipmaps) {
    rebuildMirroredRepeatMipmaps(tex);
  }
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
