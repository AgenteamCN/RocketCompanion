import {
  getEngineAudioPack,
  publishEngineAudioTelemetry,
  type EngineAudioPackId,
  type EngineAudioPackMetadata,
  type EngineAudioSliceMeta,
  type EngineAudioTuningConfig,
  type EngineDriveDirection,
} from '../ui-core/config/engineAudioConfig.ts';
import { yieldToNextFrame } from '../loader/frameBudgetScheduler.ts';

export const REMOTE_HIBERNATE_GRACE_SEC = 15.0;

export interface GranularGraphUpdateResult {
  lowerSliceIndex: number;
  upperSliceIndex: number;
  lowerSliceFreqHz: number;
  upperSliceFreqHz: number;
  activeEqCompensationDb: number;
  effectiveIdleGain: number;
  filterCutoffHz: number;
}

export interface VoiceGraphTelemetrySource {
  readonly graphBuilt: boolean;
  readonly sliceChannels: ReadonlyArray<unknown>;
}

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

export interface EngineSynthTelemetryInput {
  speedUU?: number;
  forwardSpeedUU?: number;
  forwardSpeed?: number;
  throttleInput?: number;
  steerInput?: number;
  handbrakeInput?: boolean;
  isBoosting?: boolean;
  isOnGround?: boolean;
  surfaceUpZ?: number;
  alive?: boolean;
  audible?: boolean;
  dormant?: boolean;
  distanceUU?: number;
  dt?: number;
  wasmRpm?: number;
  wasmGear?: number;
  wasmThrottleSmooth?: number;
  wasmIsUnderStrain?: boolean;
  wasmBackfireTriggered?: boolean;
}

export interface EngineSynthDrivetrainSnapshot {
  currentRPM: number;
  targetRPM: number;
  currentGear: number;
  isNeutral: boolean;
  isOnGround: boolean;
  driveDirection: EngineDriveDirection;
  smoothThrottle: number;
  smoothForwardAccelUU: number;
  airborneThrottleQuotaSec: number;
  isShiftLocked: boolean;
  isUnderStrain: boolean;
  isInOverdrive: boolean;
  isBoosting: boolean;
  wasAccelerating: boolean;
  revLimiterTimer: number;
}

export interface BackfirePopDecision {
  buffer: AudioBuffer;
  nextPopIndex: number;
  gain: number;
  playbackRate: number;
}

export interface EngineSynthManualBenchState {
  active: boolean;
  throttle: boolean;
  boost: boolean;
  reverse: boolean;
  airborne: boolean;
  speedUU: number;
}

const packAssetCache = new Map<EngineAudioPackId, Promise<LoadedEngineAudioPackAssets>>();
const resolvedPackAssets = new Map<EngineAudioPackId, LoadedEngineAudioPackAssets>();

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
  if (totalLen < P * 3) return rawBuffer;

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
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await ctx.decodeAudioData(await res.arrayBuffer());
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
    if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status} fetching ${descriptor.metadataUrl}`);
    const metadata: EngineAudioPackMetadata = await metaRes.json();
    const rawSlices = Array.isArray(metadata.slices) ? metadata.slices : [];
    const freqs = rawSlices.map((s) => Math.max(15, Number(s.freq) || 37.6));
    for (let i = 1; i < freqs.length; i++) {
      if (freqs[i] <= freqs[i - 1]) freqs[i] = Number((freqs[i - 1] + 0.05).toFixed(3));
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
      if (idx > 0 && rpm <= prevRpm) rpm = prevRpm + 12;
      prevRpm = rpm;
      return { index: s.index ?? idx, rpm, freq: f, on_file: s.on_file, off_file: s.off_file };
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
    } catch {
      /* ignore */
    }
    const popBuffers: AudioBuffer[] = [];
    await Promise.all(
      descriptor.popUrls.map(async (popUrl, idx) => {
        try {
          popBuffers[idx] = await fetchAndDecodeBuffer(ctx, popUrl);
        } catch {
          /* ignore */
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
    let lastYieldTime = typeof performance !== 'undefined' ? performance.now() : 0;

    const sliceWorker = async () => {
      while (sliceCursor < totalSlices) {
        const idx = sliceCursor++;
        const sliceMeta = normalizedSlices[idx];
        const rawOn = await fetchAndDecodeBuffer(
          ctx,
          `${descriptor.basePath}/${sliceMeta.on_file}`
        );
        const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
        if (nowPerf - lastYieldTime >= 2.0) {
          await yieldToNextFrame();
          lastYieldTime = typeof performance !== 'undefined' ? performance.now() : 0;
        }
        const onBuffer = conditionPeriodicLoopBuffer(ctx, rawOn, sliceMeta.freq);
        const offBuffer = createReversedLoopBuffer(ctx, onBuffer);
        rawConditionedSlices[idx] = {
          meta: sliceMeta,
          onBuffer,
          offBuffer,
          rms: computeBufferRms(onBuffer),
        };
        loadedCount++;
        if (loadedCount === totalSlices || loadedCount % 5 === 0) {
          publishEngineAudioTelemetry({ loadedSlicesCount: loadedCount });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(3, Math.max(1, totalSlices)) }, () => sliceWorker())
    );
    const sortedRms = rawConditionedSlices.map((s) => s.rms).sort((a, b) => a - b);
    const medianRms = sortedRms.length > 0 ? sortedRms[Math.floor(sortedRms.length / 2)] : 0.2;
    const slices: ConditionedEngineSliceBuffers[] = rawConditionedSlices.map((s) => ({
      ...s,
      autoNormDb: Math.max(-8.0, Math.min(8.0, 20 * Math.log10(medianRms / Math.max(1e-4, s.rms)))),
    }));

    const loadedAssets: LoadedEngineAudioPackAssets = {
      packId,
      metadata: { ...metadata, slices: normalizedSlices },
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

export function createInitialManualBenchState(): EngineSynthManualBenchState {
  return {
    active: false,
    throttle: false,
    boost: false,
    reverse: false,
    airborne: false,
    speedUU: 0,
  };
}

export function applyManualBenchPatch(
  bench: EngineSynthManualBenchState,
  patch: Partial<Omit<EngineSynthManualBenchState, 'speedUU'>>
): void {
  if (patch.active !== undefined) bench.active = patch.active;
  if (patch.throttle !== undefined) bench.throttle = patch.throttle;
  if (patch.boost !== undefined) bench.boost = patch.boost;
  if (patch.reverse !== undefined) bench.reverse = patch.reverse;
  if (patch.airborne !== undefined) bench.airborne = patch.airborne;
}

export function stepRemoteHibernateTimer(
  shouldPlay: boolean,
  isPrimaryListener: boolean,
  dormant: boolean,
  nowSec: number,
  inactiveSinceSec: number,
  graphBuilt: boolean
): { nextInactiveSinceSec: number; shouldTeardown: boolean } {
  if (shouldPlay) return { nextInactiveSinceSec: -1, shouldTeardown: false };
  if (!isPrimaryListener || dormant) {
    if (inactiveSinceSec < 0) return { nextInactiveSinceSec: nowSec, shouldTeardown: false };
    if (graphBuilt && nowSec - inactiveSinceSec >= REMOTE_HIBERNATE_GRACE_SEC) {
      return { nextInactiveSinceSec: inactiveSinceSec, shouldTeardown: true };
    }
  }
  return { nextInactiveSinceSec: inactiveSinceSec, shouldTeardown: false };
}

export function computeEngineSynthMasterGain(
  shouldPlay: boolean,
  engineVolume: number,
  isUnderStrain: boolean
): number {
  if (!shouldPlay) return 0;
  return Math.min(1.2, engineVolume * 0.42 * (isUnderStrain ? 1.08 : 1.0));
}

export function playEngineSynthOneShotBuffer(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  gainVal: number,
  rate = 1.0
): void {
  if (gainVal <= 0.001) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(g);
    g.connect(destination);
    src.start(ctx.currentTime);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

export function buildEngineSynthTelemetryPayload(input: {
  packId: EngineAudioPackId;
  voiceGraph: VoiceGraphTelemetrySource;
  assets: LoadedEngineAudioPackAssets | null;
  drivetrain: EngineSynthDrivetrainSnapshot;
  graphResult: GranularGraphUpdateResult;
  rawSpeedUU: number;
  lastPopIndex: number;
  backfireCount: number;
  entitySpawnCount: number;
}): Parameters<typeof publishEngineAudioTelemetry>[0] {
  const { drivetrain: dt, graphResult, voiceGraph, assets } = input;
  const rawSpeed = input.rawSpeedUU;
  return {
    packId: input.packId,
    loaded: voiceGraph.graphBuilt,
    loadedSlicesCount: voiceGraph.sliceChannels.length,
    totalSlicesCount: assets?.slices.length ?? 40,
    currentRPM: dt.currentRPM,
    targetRPM: dt.targetRPM,
    currentGear: dt.currentGear,
    isNeutral: dt.isNeutral,
    isOnGround: dt.isOnGround,
    driveDirection: dt.driveDirection,
    speedUU: rawSpeed,
    speedKmh: Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed * 0.036 : 0,
    forwardAccelUU: dt.smoothForwardAccelUU,
    airborneRevQuotaRemainingSec: dt.airborneThrottleQuotaSec,
    isShiftLocked: dt.isShiftLocked,
    isUnderStrain: dt.isUnderStrain,
    isInOverdrive: dt.isInOverdrive,
    isBoosting: dt.isBoosting,
    throttleLoad: dt.wasAccelerating ? 1 : 0,
    smoothThrottle: dt.smoothThrottle,
    isRevLimiting: dt.revLimiterTimer > 0,
    lowerSliceIndex: graphResult.lowerSliceIndex,
    upperSliceIndex: graphResult.upperSliceIndex,
    lowerSliceFreqHz: graphResult.lowerSliceFreqHz,
    upperSliceFreqHz: graphResult.upperSliceFreqHz,
    activeEqCompensationDb: graphResult.activeEqCompensationDb,
    idleWeight: graphResult.effectiveIdleGain,
    filterCutoffHz: graphResult.filterCutoffHz,
    lastBackfireIndex: input.lastPopIndex,
    backfireCount: input.backfireCount,
    entitySpawnCount: input.entitySpawnCount,
  };
}

export function stepEngineSynthDrivetrain(
  dtState: EngineSynthDrivetrainSnapshot,
  manualBench: EngineSynthManualBenchState,
  isPrimaryListener: boolean,
  cfg: EngineAudioTuningConfig,
  t: EngineSynthTelemetryInput,
  dt: number,
  prevSpeedUU: number
): { rawSpeedUU: number; shouldTriggerBackfire: boolean } {
  let rawSpeedUU = Math.max(0, Number(t.speedUU) || 0);
  let throttleIn = Number(t.throttleInput) || 0;
  let isOnGround = t.isOnGround ?? true;
  let isBoosting = Boolean(t.isBoosting);
  const maxBoostSpd = cfg.supersonicSpeedUU || 2300;
  if (isPrimaryListener && manualBench.active) {
    isOnGround = !manualBench.airborne;
    isBoosting = manualBench.boost;
    throttleIn = manualBench.boost || manualBench.throttle ? 1 : manualBench.reverse ? -1 : 0;
    const cap = isBoosting
      ? maxBoostSpd
      : throttleIn < 0
        ? cfg.maxThrottleSpeedUU * 0.5
        : cfg.maxThrottleSpeedUU;
    manualBench.speedUU = Math.max(
      0,
      Math.min(cap, manualBench.speedUU + (throttleIn !== 0 ? 1100 : -650) * dt)
    );
    rawSpeedUU = manualBench.speedUU;
  }

  const wasBoosting = dtState.isBoosting;
  dtState.isOnGround = isOnGround;
  dtState.isBoosting = isBoosting;
  dtState.wasAccelerating = Math.abs(throttleIn) > 0.05 || isBoosting;
  dtState.driveDirection =
    rawSpeedUU < 22 ? 'stopped' : (t.forwardSpeedUU ?? rawSpeedUU) < -22 ? 'reverse' : 'forward';
  dtState.isNeutral = rawSpeedUU < 25 && !dtState.wasAccelerating;
  dtState.smoothThrottle +=
    ((dtState.wasAccelerating ? 1.0 : 0.0) - dtState.smoothThrottle) * Math.min(1, dt * 14);
  dtState.smoothForwardAccelUU = (rawSpeedUU - prevSpeedUU) / dt;

  if (t.wasmRpm !== undefined && !manualBench.active) {
    dtState.currentRPM = t.wasmRpm;
    dtState.targetRPM = t.wasmRpm;
    dtState.currentGear = t.wasmGear ?? dtState.currentGear;
    dtState.isUnderStrain = Boolean(t.wasmIsUnderStrain);
  } else {
    const numGears = Math.max(1, Math.min(6, cfg.maxGears || 6));
    const speedNorm = Math.min(1, rawSpeedUU / Math.max(1, maxBoostSpd));
    dtState.currentGear = dtState.isNeutral
      ? 1
      : Math.min(numGears, 1 + Math.floor(speedNorm * numGears));
    dtState.isInOverdrive = rawSpeedUU > cfg.maxThrottleSpeedUU + 40;
    dtState.isUnderStrain =
      isOnGround && dtState.wasAccelerating && dtState.smoothForwardAccelUU < -220;
    const gearRatio = Math.max(
      0,
      Math.min(
        1.15,
        (rawSpeedUU / Math.max(1, cfg.maxThrottleSpeedUU)) * numGears - (dtState.currentGear - 1)
      )
    );
    dtState.targetRPM = dtState.isNeutral
      ? cfg.idleRPM
      : Math.max(
          cfg.idleRPM,
          Math.min(
            cfg.redlineRPM,
            cfg.idleRPM + gearRatio * (cfg.revLimitCutoffRPM - cfg.idleRPM) + (isBoosting ? 420 : 0)
          )
        );
    dtState.currentRPM += (dtState.targetRPM - dtState.currentRPM) * Math.min(1, dt * 12);
  }

  const shouldTriggerBackfire = Boolean(
    t.wasmBackfireTriggered ||
    (!dtState.wasAccelerating && wasBoosting && dtState.currentRPM > cfg.backfireTriggerRPM)
  );
  return { rawSpeedUU, shouldTriggerBackfire };
}
