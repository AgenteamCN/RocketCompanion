import {
  ENGINE_AUDIO_EQ_BAND_FREQS_HZ,
  type EngineAudioTuningConfig,
} from '../ui-core/config/engineAudioConfig.ts';
import {
  applySmoothedAudioParamValue,
  clampSmoothingDtSec,
  resetAudioParamValueImmediate,
} from './audioParamSmoothingPipeline.ts';

export interface EngineSliceLoudnessResult {
  totalDb: number;
  linearGain: number;
  autoNormContributionDb: number;
  eqCurveDb: number;
  tiltContributionDb: number;
}

/**
 * Evaluates piecewise-smooth 5-band equalizer gain in dB at a given slice fundamental frequency (37Hz .. 75Hz).
 */
export function evaluateEngineFreqEqCurveDb(
  freqHz: number,
  eqBandGainsDb: readonly [number, number, number, number, number]
): number {
  const centers = ENGINE_AUDIO_EQ_BAND_FREQS_HZ;
  const f = Math.max(centers[0], Math.min(centers[centers.length - 1], freqHz));

  if (f <= centers[0]) return eqBandGainsDb[0] ?? 0;
  for (let i = 0; i < centers.length - 1; i++) {
    const f0 = centers[i];
    const f1 = centers[i + 1];
    if (f <= f1) {
      const t = (f - f0) / Math.max(0.1, f1 - f0);
      const smoothT = 0.5 * (1 - Math.cos(Math.PI * t));
      const g0 = eqBandGainsDb[i] ?? 0;
      const g1 = eqBandGainsDb[i + 1] ?? 0;
      return g0 + (g1 - g0) * smoothT;
    }
  }
  return eqBandGainsDb[centers.length - 1] ?? 0;
}

/**
 * Computes combined loudness compensation for a granular slice at `freqHz` given its measured
 * RMS auto-normalization offset (`autoNormDb`) and the active Engine Audio EQ configuration.
 */
export function evaluateSliceLoudnessCompensation(
  cfg: EngineAudioTuningConfig,
  freqHz: number,
  autoNormDb: number,
  minFreqHz: number = 37.65,
  maxFreqHz: number = 74.65
): EngineSliceLoudnessResult {
  if (!cfg.engineEqEnabled) {
    return {
      totalDb: 0,
      linearGain: 1.0,
      autoNormContributionDb: 0,
      eqCurveDb: 0,
      tiltContributionDb: 0,
    };
  }

  const normStrength = Math.max(0, Math.min(1, cfg.sliceRmsAutoNormStrength ?? 0.85));
  const autoNormContributionDb = autoNormDb * normStrength;

  const eqBands = cfg.eqBandGainsDb ?? [0, 0, 0, 0, 0];
  const eqCurveDb = evaluateEngineFreqEqCurveDb(freqHz, eqBands);

  const freqNorm = Math.max(
    0,
    Math.min(1, (freqHz - minFreqHz) / Math.max(1, maxFreqHz - minFreqHz))
  );
  const tiltContributionDb = (cfg.freqTiltDb ?? 0) * (freqNorm - 0.5) * 2.0;

  const totalDb = Math.max(
    -15.0,
    Math.min(15.0, autoNormContributionDb + eqCurveDb + tiltContributionDb)
  );
  const linearGain = Math.pow(10, totalDb / 20);

  return {
    totalDb,
    linearGain,
    autoNormContributionDb,
    eqCurveDb,
    tiltContributionDb,
  };
}

const EQ_DB_DEADBAND = 0.02;

/**
 * Dedicated 3-Band Web Audio Parametric Output Timbre Equalizer for Engine Audio.
 * Shapes low-end fundamental warmth (90Hz lowshelf), midrange body (650Hz peaking),
 * and high-frequency harmonic buzz/presence (3200Hz highshelf) before the lowpass stage.
 */
export class EngineAudioEqualizer {
  readonly ctx: AudioContext;
  readonly lowShelf: BiquadFilterNode;
  readonly midPeak: BiquadFilterNode;
  readonly highShelf: BiquadFilterNode;

  private _smoothedLowDb: number = NaN;
  private _smoothedMidDb: number = NaN;
  private _smoothedHighDb: number = NaN;
  private _lastLowDb: number = NaN;
  private _lastMidDb: number = NaN;
  private _lastHighDb: number = NaN;
  private _lastUpdateSec: number = -1;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;

    this.lowShelf = ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 90;
    this.lowShelf.gain.value = 0;

    this.midPeak = ctx.createBiquadFilter();
    this.midPeak.type = 'peaking';
    this.midPeak.frequency.value = 650;
    this.midPeak.Q.value = 0.85;
    this.midPeak.gain.value = 0;

    this.highShelf = ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 3200;
    this.highShelf.gain.value = 0;

    this.lowShelf.connect(this.midPeak);
    this.midPeak.connect(this.highShelf);
    this.highShelf.connect(destination);
  }

  get input(): AudioNode {
    return this.lowShelf;
  }

  update(cfg: EngineAudioTuningConfig, now: number, tau: number, dtSec?: number): void {
    const enabled = Boolean(cfg.engineEqEnabled);
    const lowDb = enabled ? Math.max(-15, Math.min(15, cfg.timbreLowShelfDb ?? 0)) : 0;
    const midDb = enabled ? Math.max(-15, Math.min(15, cfg.timbreMidPeakDb ?? 0)) : 0;
    const highDb = enabled ? Math.max(-15, Math.min(15, cfg.timbreHighShelfDb ?? 0)) : 0;

    const resolvedDt =
      dtSec !== undefined
        ? clampSmoothingDtSec(dtSec)
        : this._lastUpdateSec >= 0 && now > this._lastUpdateSec
          ? clampSmoothingDtSec(now - this._lastUpdateSec)
          : clampSmoothingDtSec(undefined);
    this._lastUpdateSec = now;

    const lowStep = applySmoothedAudioParamValue(
      this.lowShelf.gain,
      this._smoothedLowDb,
      this._lastLowDb,
      lowDb,
      resolvedDt,
      tau,
      EQ_DB_DEADBAND
    );
    this._smoothedLowDb = lowStep.smoothed;
    this._lastLowDb = lowStep.written;

    const midStep = applySmoothedAudioParamValue(
      this.midPeak.gain,
      this._smoothedMidDb,
      this._lastMidDb,
      midDb,
      resolvedDt,
      tau,
      EQ_DB_DEADBAND
    );
    this._smoothedMidDb = midStep.smoothed;
    this._lastMidDb = midStep.written;

    const highStep = applySmoothedAudioParamValue(
      this.highShelf.gain,
      this._smoothedHighDb,
      this._lastHighDb,
      highDb,
      resolvedDt,
      tau,
      EQ_DB_DEADBAND
    );
    this._smoothedHighDb = highStep.smoothed;
    this._lastHighDb = highStep.written;
  }

  dispose(): void {
    const now = this.ctx?.currentTime;
    resetAudioParamValueImmediate(this.lowShelf?.gain, 0, now);
    resetAudioParamValueImmediate(this.midPeak?.gain, 0, now);
    resetAudioParamValueImmediate(this.highShelf?.gain, 0, now);
    this._smoothedLowDb = NaN;
    this._smoothedMidDb = NaN;
    this._smoothedHighDb = NaN;
    this._lastLowDb = NaN;
    this._lastMidDb = NaN;
    this._lastHighDb = NaN;
    this._lastUpdateSec = -1;
    try {
      this.lowShelf.disconnect();
      this.midPeak.disconnect();
      this.highShelf.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}
