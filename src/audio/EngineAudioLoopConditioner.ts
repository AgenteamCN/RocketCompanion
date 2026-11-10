import {
  getEngineAudioPack,
  publishEngineAudioTelemetry,
  type EngineAudioPackId,
  type EngineAudioPackMetadata,
  type EngineAudioSliceMeta,
} from '../ui-core/config/engineAudioConfig.ts';
import { yieldToNextFrame } from '../loader/frameBudgetScheduler.ts';

export interface ConditionedEngineSliceBuffers {
  meta: EngineAudioSliceMeta;
  onBuffer: AudioBuffer;
  offBuffer: AudioBuffer;
  rms: number;
  autoNormDb: number;
}

export interface LoadedEngineAudioPackAssets {
  packId: EngineAudioPackId;
  metadata: EngineAudioPackMetadata;
  idleBuffer: AudioBuffer;
  entitySpawnBuffer: AudioBuffer | null;
  popBuffers: AudioBuffer[];
  slices: ConditionedEngineSliceBuffers[];
}

const packAssetCache = new Map<EngineAudioPackId, Promise<LoadedEngineAudioPackAssets>>();
const resolvedPackAssets = new Map<EngineAudioPackId, LoadedEngineAudioPackAssets>();

/**
 * Computes root-mean-square (RMS) amplitude of a mono AudioBuffer.
 */
export function computeBufferRms(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const len = data.length;
  if (len === 0) return 0.2;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const v = data[i];
    sumSq += v * v;
  }
  return Math.max(1e-4, Math.sqrt(sumSq / len));
}

/**
 * Conditions a decoded periodic harmonic AudioBuffer so that Web Audio `loop = true`
 * has zero step discontinuity, zero slope discontinuity, and zero AAC priming/padding artifacts.
 */
export function conditionPeriodicLoopBuffer(
  ctx: AudioContext,
  rawBuffer: AudioBuffer,
  freqHz: number
): AudioBuffer {
  const sr = rawBuffer.sampleRate;
  const src = rawBuffer.getChannelData(0);
  const totalLen = src.length;
  const safeFreq = Math.max(15, Number.isFinite(freqHz) ? freqHz : 45);
  const P = Math.max(64, Math.round(sr / safeFreq));

  if (totalLen < P * 3) {
    return rawBuffer;
  }

  const margin = Math.min(1536, Math.floor(totalLen / 6));
  const searchEnd = Math.min(Math.floor(totalLen / 2), margin + P * 3);
  let zc = margin;
  for (let i = Math.max(1, margin); i < searchEnd; i++) {
    if (src[i - 1] <= 0 && src[i] > 0) {
      zc = i;
      break;
    }
  }

  const avail = totalLen - margin - zc - P;
  const K = Math.max(1, Math.floor(avail / P));
  const L = K * P;

  const outBuffer = ctx.createBuffer(1, L, sr);
  const out = outBuffer.getChannelData(0);

  for (let n = 0; n < P; n++) {
    const alpha = 0.5 * (1.0 - Math.cos((Math.PI * n) / P));
    out[n] = (1.0 - alpha) * src[zc + L + n] + alpha * src[zc + n];
  }
  for (let n = P; n < L; n++) {
    out[n] = src[zc + n];
  }

  return outBuffer;
}

/**
 * Creates a sample-reversed AudioBuffer from a conditioned seamless forward loop buffer.
 */
export function createReversedLoopBuffer(
  ctx: AudioContext,
  forwardBuffer: AudioBuffer
): AudioBuffer {
  const len = forwardBuffer.length;
  const revBuffer = ctx.createBuffer(1, len, forwardBuffer.sampleRate);
  const src = forwardBuffer.getChannelData(0);
  const dst = revBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    dst[i] = src[len - 1 - i];
  }
  return revBuffer;
}

async function fetchAndDecodeBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuf);
}

export function getResolvedEngineAudioPackAssets(
  packId: EngineAudioPackId = 'turtle_modem'
): LoadedEngineAudioPackAssets | null {
  return resolvedPackAssets.get(packId) ?? null;
}

export function loadEngineAudioPackAssets(
  ctx: AudioContext,
  packId: EngineAudioPackId = 'turtle_modem'
): Promise<LoadedEngineAudioPackAssets> {
  const existing = packAssetCache.get(packId);
  if (existing) return existing;

  const descriptor = getEngineAudioPack(packId);
  const promise = (async () => {
    const metaRes = await fetch(descriptor.metadataUrl);
    if (!metaRes.ok) {
      throw new Error(`HTTP ${metaRes.status} fetching ${descriptor.metadataUrl}`);
    }
    const metadata: EngineAudioPackMetadata = await metaRes.json();

    const rawSlices = Array.isArray(metadata.slices) ? metadata.slices : [];
    const freqs = rawSlices.map((s) => Math.max(15, Number(s.freq) || 37.6));
    for (let i = 1; i < freqs.length; i++) {
      if (freqs[i] <= freqs[i - 1]) {
        freqs[i] = Number((freqs[i - 1] + 0.05).toFixed(3));
      }
    }
    const minFreq = Math.min(...freqs);
    const maxFreq = Math.max(minFreq + 1, ...freqs);

    let prevRpm = 0;
    const normalizedSlices: EngineAudioSliceMeta[] = rawSlices.map((s, idx) => {
      const f = freqs[idx];
      let rpm =
        typeof s.rpm === 'number' && Number.isFinite(s.rpm)
          ? s.rpm
          : Math.round(900 + ((f - minFreq) / (maxFreq - minFreq)) * 5100);
      if (idx > 0 && rpm <= prevRpm) {
        rpm = prevRpm + 12;
      }
      prevRpm = rpm;
      return {
        index: s.index ?? idx,
        rpm,
        freq: f,
        on_file: s.on_file,
        off_file: s.off_file,
      };
    });

    publishEngineAudioTelemetry({
      packId,
      loaded: false,
      loadedSlicesCount: 0,
      totalSlicesCount: normalizedSlices.length,
    });

    const rawIdle = await fetchAndDecodeBuffer(ctx, descriptor.idleLoopUrl);
    const idleBuffer = conditionPeriodicLoopBuffer(
      ctx,
      rawIdle,
      metadata.idle_freq_hz || descriptor.idleFreqHz || 37.02
    );

    let entitySpawnBuffer: AudioBuffer | null = null;
    try {
      entitySpawnBuffer = await fetchAndDecodeBuffer(ctx, descriptor.entitySpawnUrl);
    } catch (err) {
      console.warn('[EngineAudioLoopConditioner] Entity spawn SFX load failed:', err);
    }

    const popBuffers: AudioBuffer[] = [];
    await Promise.all(
      descriptor.popUrls.map(async (popUrl, idx) => {
        try {
          popBuffers[idx] = await fetchAndDecodeBuffer(ctx, popUrl);
        } catch (err) {
          console.warn(`[EngineAudioLoopConditioner] Pop SFX ${popUrl} failed:`, err);
        }
      })
    );

    let loadedCount = 0;
    let sliceCursor = 0;
    const totalSlices = normalizedSlices.length;
    const rawConditionedSlices = new Array<{
      meta: EngineAudioSliceMeta;
      onBuffer: AudioBuffer;
      offBuffer: AudioBuffer;
      rms: number;
    }>(totalSlices);
    const sliceConcurrency = Math.min(3, Math.max(1, totalSlices));
    let lastYieldTime = typeof performance !== 'undefined' ? performance.now() : 0;

    const sliceWorker = async () => {
      while (sliceCursor < totalSlices) {
        const idx = sliceCursor++;
        const sliceMeta = normalizedSlices[idx];
        const onUrl = `${descriptor.basePath}/${sliceMeta.on_file}`;
        const rawOn = await fetchAndDecodeBuffer(ctx, onUrl);

        const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
        if (nowPerf - lastYieldTime >= 2.0) {
          await yieldToNextFrame();
          lastYieldTime = typeof performance !== 'undefined' ? performance.now() : 0;
        }

        const onBuffer = conditionPeriodicLoopBuffer(ctx, rawOn, sliceMeta.freq);
        const offBuffer = createReversedLoopBuffer(ctx, onBuffer);
        const rms = computeBufferRms(onBuffer);
        rawConditionedSlices[idx] = {
          meta: sliceMeta,
          onBuffer,
          offBuffer,
          rms,
        };
        loadedCount++;
        if (loadedCount === totalSlices || loadedCount % 5 === 0) {
          publishEngineAudioTelemetry({
            loadedSlicesCount: loadedCount,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: sliceConcurrency }, () => sliceWorker()));

    // Compute median RMS across all slices to derive per-slice loudness normalization offset in dB
    const sortedRms = rawConditionedSlices.map((s) => s.rms).sort((a, b) => a - b);
    const medianRms = sortedRms.length > 0 ? sortedRms[Math.floor(sortedRms.length / 2)] : 0.2;

    const slices: ConditionedEngineSliceBuffers[] = rawConditionedSlices.map((s) => {
      const rawOffsetDb = 20 * Math.log10(medianRms / Math.max(1e-4, s.rms));
      const autoNormDb = Math.max(-8.0, Math.min(8.0, rawOffsetDb));
      return {
        ...s,
        autoNormDb,
      };
    });

    const loadedAssets: LoadedEngineAudioPackAssets = {
      packId,
      metadata: {
        ...metadata,
        slices: normalizedSlices,
      },
      idleBuffer,
      entitySpawnBuffer,
      popBuffers: popBuffers.filter(Boolean),
      slices,
    };

    resolvedPackAssets.set(packId, loadedAssets);
    publishEngineAudioTelemetry({
      packId,
      loaded: true,
      loadedSlicesCount: slices.length,
      totalSlicesCount: slices.length,
    });

    return loadedAssets;
  })();

  packAssetCache.set(packId, promise);
  return promise;
}
