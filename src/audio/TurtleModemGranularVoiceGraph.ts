import type { EngineAudioTuningConfig } from '../ui-core/config/engineAudioConfig.ts';
import type {
  LoadedEngineAudioPackAssets,
  ConditionedEngineSliceBuffers,
} from './EngineAudioLoopConditioner.ts';
import { EngineAudioEqualizer, evaluateSliceLoudnessCompensation } from './EngineAudioEqualizer.ts';
import {
  applySmoothedAudioParamValue,
  clampSmoothingDtSec,
  resetAudioParamValueImmediate,
  stepExponentialSmoothedValue,
} from './audioParamSmoothingPipeline.ts';

export type EngineSynthLodMode = 'primary-full' | 'remote-lod';

export const REMOTE_ENGINE_LOD_ANCHOR_COUNT = 10;

const FILTER_CUTOFF_DEADBAND_HZ = 5;
const PLAYBACK_RATE_DEADBAND = 1e-3;
const GAIN_DEADBAND = 1e-4;
const DELAY_DEADBAND_SEC = 1e-4;
const SLICE_RATE_SMOOTHING_TAU_SEC = 0.015;
const SLICE_DELAY_SMOOTHING_TAU_SEC = 0.04;

export interface GranularSliceChannel {
  index: number;
  sourceSliceIndex: number;
  meta: ConditionedEngineSliceBuffers['meta'];
  autoNormDb: number;
  onSource: AudioBufferSourceNode;
  offSource: AudioBufferSourceNode | null;
  onGain: GainNode;
  offGain: GainNode | null;
  delayNode: DelayNode | null;
  smoothedOnGain: number;
  smoothedOffGain: number;
  smoothedRate: number;
  smoothedDelay: number;
  lastOnGain: number;
  lastOffGain: number;
  lastRate: number;
  lastDelay: number;
}

export interface GranularGraphUpdateInput {
  cfg: EngineAudioTuningConfig;
  now: number;
  dtSec?: number;
  tau: number;
  currentRPM: number;
  smoothThrottle: number;
  isUnderStrain: boolean;
  isStationaryNeutral: boolean;
}

export interface GranularGraphUpdateResult {
  lowerSliceIndex: number;
  upperSliceIndex: number;
  lowerSliceFreqHz: number;
  upperSliceFreqHz: number;
  activeEqCompensationDb: number;
  effectiveIdleGain: number;
  filterCutoffHz: number;
}

/**
 * Selects a decimated set of RPM anchor slices for remote/non-primary vehicles,
 * always preserving the lowest (idle) and highest (redline) harmonic slices.
 */
export function selectRemoteLodAnchorSlices(
  slices: readonly ConditionedEngineSliceBuffers[],
  targetCount: number = REMOTE_ENGINE_LOD_ANCHOR_COUNT
): Array<{ slice: ConditionedEngineSliceBuffers; sourceIndex: number }> {
  const total = slices.length;
  if (total === 0) return [];
  const count = Math.max(2, Math.min(total, targetCount));
  if (count >= total) {
    return slices.map((slice, idx) => ({ slice, sourceIndex: idx }));
  }

  const selected: Array<{ slice: ConditionedEngineSliceBuffers; sourceIndex: number }> = [];
  let lastIdx = -1;
  for (let k = 0; k < count; k++) {
    const idx = Math.round((k * (total - 1)) / (count - 1));
    if (idx !== lastIdx && slices[idx]) {
      selected.push({ slice: slices[idx], sourceIndex: idx });
      lastIdx = idx;
    }
  }
  return selected;
}

/**
 * Manages the Web Audio granular harmonic oscillator bank for TurtleModemEngineSynth.
 * Supports two LOD tiers:
 * - 'primary-full': 40 dual-buffer (on + reversed-off) slices + 40 phase-decorrelation delays + 3-band EQ
 * - 'remote-lod': 10 single-buffer RPM anchor slices + 1 idle loop routed directly into the lowpass filter,
 *   reducing active AudioBufferSourceNodes per remote car from 81 to 11 (and 0 when hibernated).
 */
export class TurtleModemGranularVoiceGraph {
  readonly ctx: AudioContext;
  readonly lowpassNode: BiquadFilterNode;
  readonly equalizer: EngineAudioEqualizer;

  lodMode: EngineSynthLodMode;
  graphBuilt: boolean = false;
  sliceChannels: GranularSliceChannel[] = [];

  idleSource: AudioBufferSourceNode | null = null;
  idleGain: GainNode | null = null;
  smoothedIdleGain: number = 0;
  smoothedIdleRate: number = 1;
  smoothedFilterCutoff: number = NaN;
  lastIdleGain: number = -1;
  lastIdleRate: number = -1;
  lastFilterCutoff: number = -1;
  private _lastUpdateSec: number = -1;

  constructor(
    ctx: AudioContext,
    lowpassNode: BiquadFilterNode,
    equalizer: EngineAudioEqualizer,
    lodMode: EngineSynthLodMode = 'primary-full'
  ) {
    this.ctx = ctx;
    this.lowpassNode = lowpassNode;
    this.equalizer = equalizer;
    this.lodMode = lodMode;
  }

  setLodMode(mode: EngineSynthLodMode, assets: LoadedEngineAudioPackAssets | null): void {
    if (this.lodMode === mode) return;
    const wasBuilt = this.graphBuilt;
    this.teardown();
    this.lodMode = mode;
    if (wasBuilt && assets) {
      this.build(assets);
    }
  }

  build(assets: LoadedEngineAudioPackAssets | null): boolean {
    if (this.graphBuilt || !assets) return this.graphBuilt;
    this.teardown();

    try {
      const now = this.ctx.currentTime;
      const isFull = this.lodMode === 'primary-full';
      const sliceTargetNode: AudioNode = isFull ? this.equalizer.input : this.lowpassNode;

      const idleSrc = this.ctx.createBufferSource();
      idleSrc.buffer = assets.idleBuffer;
      idleSrc.loop = true;
      const idleGain = this.ctx.createGain();
      idleGain.gain.value = 0;
      idleSrc.connect(idleGain);
      idleGain.connect(sliceTargetNode);
      const idleOffset =
        assets.idleBuffer.duration > 0.05 ? Math.random() * (assets.idleBuffer.duration * 0.8) : 0;
      idleSrc.start(now, idleOffset);

      this.idleSource = idleSrc;
      this.idleGain = idleGain;
      this.smoothedIdleGain = 0;
      this.smoothedIdleRate = 1;
      this.lastIdleGain = 0;
      this.lastIdleRate = 1;

      const sourceEntries = isFull
        ? assets.slices.map((slice, idx) => ({ slice, sourceIndex: idx }))
        : selectRemoteLodAnchorSlices(assets.slices, REMOTE_ENGINE_LOD_ANCHOR_COUNT);

      this.sliceChannels = sourceEntries.map(({ slice, sourceIndex }, idx) => {
        const onSource = this.ctx.createBufferSource();
        onSource.buffer = slice.onBuffer;
        onSource.loop = true;

        const onGain = this.ctx.createGain();
        onGain.gain.value = 0;
        onSource.connect(onGain);

        const onOffset =
          slice.onBuffer.duration > 0.05 ? Math.random() * (slice.onBuffer.duration * 0.8) : 0;
        onSource.start(now, onOffset);

        let offSource: AudioBufferSourceNode | null = null;
        let offGain: GainNode | null = null;
        let delayNode: DelayNode | null = null;

        if (isFull) {
          offSource = this.ctx.createBufferSource();
          offSource.buffer = slice.offBuffer;
          offSource.loop = true;

          offGain = this.ctx.createGain();
          offGain.gain.value = 0;
          offSource.connect(offGain);

          delayNode = this.ctx.createDelay(0.1);
          delayNode.delayTime.value = 0;

          onGain.connect(delayNode);
          offGain.connect(delayNode);
          delayNode.connect(sliceTargetNode);

          const offOffset =
            slice.offBuffer.duration > 0.05 ? Math.random() * (slice.offBuffer.duration * 0.8) : 0;
          offSource.start(now, offOffset);
        } else {
          // Remote LOD: connect onGain directly to lowpassNode (0 offSource, 0 DelayNode, 0 3-band EQ overhead)
          onGain.connect(sliceTargetNode);
        }

        return {
          index: idx,
          sourceSliceIndex: sourceIndex,
          meta: slice.meta,
          autoNormDb: slice.autoNormDb ?? 0,
          onSource,
          offSource,
          onGain,
          offGain,
          delayNode,
          smoothedOnGain: 0,
          smoothedOffGain: 0,
          smoothedRate: 1,
          smoothedDelay: 0,
          lastOnGain: 0,
          lastOffGain: 0,
          lastRate: 1,
          lastDelay: 0,
        };
      });

      this.graphBuilt = true;
      return true;
    } catch (err) {
      console.warn('[TurtleModemGranularVoiceGraph] Failed building granular graph:', err);
      return false;
    }
  }

  teardown(): void {
    const now = this.ctx?.currentTime;
    resetAudioParamValueImmediate(this.idleSource?.playbackRate, 1, now);
    resetAudioParamValueImmediate(this.idleGain?.gain, 0, now);
    try {
      this.idleSource?.stop();
      this.idleSource?.disconnect();
      this.idleGain?.disconnect();
    } catch {
      /* ignore */
    }
    this.idleSource = null;
    this.idleGain = null;
    this.smoothedIdleGain = 0;
    this.smoothedIdleRate = 1;
    this.smoothedFilterCutoff = NaN;
    this.lastIdleGain = -1;
    this.lastIdleRate = -1;
    this.lastFilterCutoff = -1;
    this._lastUpdateSec = -1;

    for (const ch of this.sliceChannels) {
      resetAudioParamValueImmediate(ch.onSource?.playbackRate, 1, now);
      resetAudioParamValueImmediate(ch.offSource?.playbackRate, 1, now);
      resetAudioParamValueImmediate(ch.onGain?.gain, 0, now);
      resetAudioParamValueImmediate(ch.offGain?.gain, 0, now);
      resetAudioParamValueImmediate(ch.delayNode?.delayTime, 0, now);
      try {
        ch.onSource.stop();
        ch.onSource.disconnect();
      } catch {
        /* ignore */
      }
      try {
        ch.offSource?.stop();
        ch.offSource?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        ch.onGain.disconnect();
        ch.offGain?.disconnect();
        ch.delayNode?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sliceChannels = [];
    this.graphBuilt = false;
  }

  update(input: GranularGraphUpdateInput): GranularGraphUpdateResult | null {
    if (!this.graphBuilt || this.sliceChannels.length === 0) return null;

    const { cfg, now, dtSec, tau, currentRPM, smoothThrottle, isUnderStrain, isStationaryNeutral } =
      input;
    const resolvedDt =
      dtSec !== undefined
        ? clampSmoothingDtSec(dtSec)
        : this._lastUpdateSec >= 0 && now > this._lastUpdateSec
          ? clampSmoothingDtSec(now - this._lastUpdateSec)
          : clampSmoothingDtSec(undefined);
    this._lastUpdateSec = now;

    const isFull = this.lodMode === 'primary-full';

    if (isFull) {
      this.equalizer.update(cfg, now, tau, resolvedDt);
    }

    const strainCutoffOffset = isUnderStrain ? -1800 : 0;
    const rawCutoff =
      cfg.decelMode === 'reverse-filter'
        ? 900 + smoothThrottle * 17100 + (currentRPM / cfg.redlineRPM) * 2000 + strainCutoffOffset
        : 2200 + smoothThrottle * 15800 + strainCutoffOffset;
    const filterCutoff = Math.max(800, Math.min(20000, rawCutoff));
    const cutoffStep = applySmoothedAudioParamValue(
      this.lowpassNode.frequency,
      this.smoothedFilterCutoff,
      this.lastFilterCutoff,
      filterCutoff,
      resolvedDt,
      tau,
      FILTER_CUTOFF_DEADBAND_HZ
    );
    this.smoothedFilterCutoff = cutoffStep.smoothed;
    this.lastFilterCutoff = cutoffStep.written;

    const idleWeight =
      currentRPM < 1450 ? Math.max(0, Math.min(1, 1.0 - (currentRPM - cfg.idleRPM) / 550)) : 0;
    const idleVolMult = Math.max(0, Math.min(2.0, cfg.idleVolume ?? 1.0));
    const effectiveIdleGain = idleWeight * idleVolMult;
    const idleRate = Math.max(0.5, Math.min(2.0, currentRPM / cfg.idleRPM));

    if (this.idleSource) {
      const rateStep = applySmoothedAudioParamValue(
        this.idleSource.playbackRate,
        this.smoothedIdleRate,
        this.lastIdleRate,
        idleRate,
        resolvedDt,
        tau,
        PLAYBACK_RATE_DEADBAND
      );
      this.smoothedIdleRate = rateStep.smoothed;
      this.lastIdleRate = rateStep.written;
    }
    if (this.idleGain) {
      const gainStep = applySmoothedAudioParamValue(
        this.idleGain.gain,
        this.smoothedIdleGain,
        this.lastIdleGain,
        effectiveIdleGain,
        resolvedDt,
        tau,
        GAIN_DEADBAND
      );
      this.smoothedIdleGain = gainStep.smoothed;
      this.lastIdleGain = gainStep.written;
    }

    const count = this.sliceChannels.length;
    let lowerIdx = 0;
    for (let i = 0; i < count - 1; i++) {
      if (currentRPM >= this.sliceChannels[i].meta.rpm) lowerIdx = i;
      else break;
    }
    const upperIdx = Math.min(count - 1, lowerIdx + 1);
    const lowerMeta = this.sliceChannels[lowerIdx].meta;
    const upperMeta = this.sliceChannels[upperIdx].meta;

    const rpmSpan = upperMeta.rpm - lowerMeta.rpm;
    const mixAlpha =
      upperIdx !== lowerIdx && rpmSpan > 1e-3
        ? Math.max(0, Math.min(1, (currentRPM - lowerMeta.rpm) / rpmSpan))
        : 0;
    const wLower =
      cfg.crossfadeCurveType === 'equal-sine' ? Math.cos(mixAlpha * 0.5 * Math.PI) : 1.0 - mixAlpha;
    const wUpper =
      cfg.crossfadeCurveType === 'equal-sine' ? Math.sin(mixAlpha * 0.5 * Math.PI) : mixAlpha;

    const rpmEngagement = Math.max(0, Math.min(1, (currentRPM - cfg.idleRPM) / 160));
    const sliceEngagement = isStationaryNeutral
      ? 0
      : Math.max(rpmEngagement, Math.min(1, smoothThrottle * 2.5));
    const slicesMasterGain = (1.0 - idleWeight * 0.65) * sliceEngagement;

    const minFreq = this.sliceChannels[0].meta.freq;
    const maxFreq = this.sliceChannels[count - 1].meta.freq;
    const targetFreq =
      minFreq +
      ((currentRPM - cfg.idleRPM) / Math.max(1, cfg.redlineRPM - cfg.idleRPM)) *
        (maxFreq - minFreq);

    let activeEqCompensationDb = 0;
    const minRateClamp = isFull ? 0.7 : 0.65;
    const maxRateClamp = isFull ? 1.4 : 1.45;

    for (let i = 0; i < count; i++) {
      const ch = this.sliceChannels[i];
      let sliceWeight = 0;
      if (i === lowerIdx) sliceWeight += wLower;
      if (i === upperIdx && upperIdx !== lowerIdx) sliceWeight += wUpper;
      sliceWeight *= slicesMasterGain;

      let eqGain = 1.0;
      if (sliceWeight > 1e-4) {
        const comp = evaluateSliceLoudnessCompensation(
          cfg,
          ch.meta.freq,
          ch.autoNormDb,
          minFreq,
          maxFreq
        );
        eqGain = comp.linearGain;
        if (i === lowerIdx) {
          activeEqCompensationDb += comp.totalDb * (1 - mixAlpha);
        } else if (i === upperIdx && upperIdx !== lowerIdx) {
          activeEqCompensationDb += comp.totalDb * mixAlpha;
        }
      }
      const compensatedWeight = sliceWeight * eqGain;

      const useDualReverseOff = isFull && ch.offGain !== null && cfg.decelMode === 'reverse-filter';
      const targetOnGain = useDualReverseOff
        ? compensatedWeight * smoothThrottle
        : compensatedWeight * (0.42 + 0.58 * smoothThrottle);
      const targetOffGain = useDualReverseOff
        ? compensatedWeight * (1.0 - smoothThrottle) * 0.72
        : 0;

      if (
        compensatedWeight <= 1e-4 &&
        ch.lastOnGain <= 1e-4 &&
        ch.lastOffGain <= 1e-4 &&
        ch.smoothedOnGain <= 1e-4 &&
        ch.smoothedOffGain <= 1e-4
      ) {
        continue;
      }

      if (compensatedWeight > 1e-4) {
        const rawRate = targetFreq / Math.max(15, ch.meta.freq);
        const clampedRate = Math.max(
          minRateClamp,
          Math.min(maxRateClamp, Number.isFinite(rawRate) ? rawRate : 1.0)
        );
        const nextSmoothedRate = stepExponentialSmoothedValue(
          ch.smoothedRate,
          clampedRate,
          resolvedDt,
          SLICE_RATE_SMOOTHING_TAU_SEC,
          PLAYBACK_RATE_DEADBAND * 0.25
        );
        ch.smoothedRate = nextSmoothedRate;
        const rateDelta = Math.abs(nextSmoothedRate - ch.lastRate);
        const snappedRate =
          nextSmoothedRate === clampedRate &&
          Math.abs(ch.lastRate - clampedRate) > PLAYBACK_RATE_DEADBAND * 0.1;
        if (rateDelta > PLAYBACK_RATE_DEADBAND || snappedRate) {
          ch.onSource.playbackRate.value = nextSmoothedRate;
          if (ch.offSource) {
            ch.offSource.playbackRate.value = nextSmoothedRate;
          }
          ch.lastRate = nextSmoothedRate;
        }
      }

      const onGainStep = applySmoothedAudioParamValue(
        ch.onGain.gain,
        ch.smoothedOnGain,
        ch.lastOnGain,
        targetOnGain,
        resolvedDt,
        tau,
        GAIN_DEADBAND
      );
      ch.smoothedOnGain = onGainStep.smoothed;
      ch.lastOnGain = onGainStep.written;

      if (ch.offGain) {
        const offGainStep = applySmoothedAudioParamValue(
          ch.offGain.gain,
          ch.smoothedOffGain,
          ch.lastOffGain,
          targetOffGain,
          resolvedDt,
          tau,
          GAIN_DEADBAND
        );
        ch.smoothedOffGain = offGainStep.smoothed;
        ch.lastOffGain = offGainStep.written;
      }

      if (ch.delayNode) {
        const targetDelay =
          i === upperIdx && upperIdx !== lowerIdx ? cfg.decorrelationDelayMs / 1000 : 0;
        const delayStep = applySmoothedAudioParamValue(
          ch.delayNode.delayTime,
          ch.smoothedDelay,
          ch.lastDelay,
          targetDelay,
          resolvedDt,
          SLICE_DELAY_SMOOTHING_TAU_SEC,
          DELAY_DEADBAND_SEC
        );
        ch.smoothedDelay = delayStep.smoothed;
        ch.lastDelay = delayStep.written;
      }
    }

    return {
      lowerSliceIndex: this.sliceChannels[lowerIdx].sourceSliceIndex,
      upperSliceIndex: this.sliceChannels[upperIdx].sourceSliceIndex,
      lowerSliceFreqHz: lowerMeta.freq,
      upperSliceFreqHz: upperMeta.freq,
      activeEqCompensationDb,
      effectiveIdleGain,
      filterCutoffHz: filterCutoff,
    };
  }
}
