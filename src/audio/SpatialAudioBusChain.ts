/**
 * SpatialAudioBusChain.ts
 * Stereo stadium impulse response synthesis and Web Audio spatial filter + reverb + dry/wet mix bus.
 */

import {
  DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG,
  solveCubicBezier,
  type SpatialAudioTunerConfig,
} from '../ui-core/config/spatialAttenuationProfiles.ts';

export interface SampleOutputPeakResult {
  peak: number;
  valid: boolean;
}

export interface SpatialAudioRuntimeContextSnapshot {
  isOpen: boolean;
  matchMode: string;
  onlineSession: Record<string, unknown> | null;
  matchPhase: string;
  choreographySignal: string | null;
  replayScorerAnthemId: string | null;
  staticTrainingReplayType: string | null;
}

export function evaluateSpatialBezierBlend(
  phase: number,
  cfg: Partial<SpatialAudioTunerConfig>
): number {
  if (cfg.overrideMode === 'manual') {
    return Math.max(0, Math.min(1, Number(cfg.manualBlend) || 0));
  }
  return solveCubicBezier(
    phase,
    Number(cfg.bzX1) || 0.22,
    Number(cfg.bzY1) || 1.0,
    Number(cfg.bzX2) || 1.0,
    Number(cfg.bzY2) || 1.0
  );
}

export function stepSpatialBezierTransition(
  currentLinearPhase: number,
  targetU: number,
  maxDelta: number,
  cfg: Partial<SpatialAudioTunerConfig>
): { linearPhase: number; blend: number } {
  if (cfg.overrideMode === 'manual') {
    return { linearPhase: targetU, blend: targetU };
  }
  let linearPhase = targetU;
  if (Math.abs(targetU - currentLinearPhase) > 1e-4) {
    linearPhase =
      targetU > currentLinearPhase
        ? Math.min(targetU, currentLinearPhase + maxDelta)
        : Math.max(targetU, currentLinearPhase - maxDelta);
  }
  return {
    linearPhase,
    blend: evaluateSpatialBezierBlend(linearPhase, cfg),
  };
}

const impulseBufferCache = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
const EARLY_REFLECTION_TAPS: ReadonlyArray<readonly [number, number]> = [
  [0.035, 0.7],
  [0.065, 0.5],
  [0.11, 0.35],
  [0.16, 0.25],
];

export function buildStadiumImpulseBuffer(ctx: AudioContext, durationSec = 3.0): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const seconds = Math.max(0.4, Math.min(8.0, Number(durationSec) || 3.0));
  const length = Math.floor(sampleRate * seconds);
  const cacheKey = `${sampleRate}:${length}`;

  let ctxCache = impulseBufferCache.get(ctx);
  if (ctxCache) {
    const cached = ctxCache.get(cacheKey);
    if (cached) return cached;
  } else {
    ctxCache = new Map<string, AudioBuffer>();
    impulseBufferCache.set(ctx, ctxCache);
  }

  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  const preDelaySamples = Math.floor(0.025 * sampleRate);
  const fadeInSamples = Math.max(1, Math.floor(0.005 * sampleRate));
  const fadeOutSamples = Math.max(1, Math.floor(0.01 * sampleRate));
  const invFadeIn = 1.0 / fadeInSamples;
  const invFadeOut = 1.0 / fadeOutSamples;
  const taps = EARLY_REFLECTION_TAPS.map(([sec, gain]) => [Math.floor(sec * sampleRate), gain] as const);
  const maxTapIdx = taps[3][0] + 4;

  let lpL = 0;
  let lpR = 0;
  let sumL = 0;
  let sumR = 0;
  const rc = 1.0 / (2.0 * Math.PI * 1500);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  const activeLen = Math.max(1, length - preDelaySamples);
  const invActiveLen = 1.0 / activeLen;

  let rngState = 0x9e3779b9 ^ length;
  const INV_INT32 = 1.0 / 2147483648.0;
  const nextRng = (): number => {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return rngState | 0;
  };

  for (let i = preDelaySamples; i < length; i++) {
    let sampleL = 0;
    let sampleR = 0;
    if (i <= maxTapIdx) {
      for (let t = 0; t < 4; t++) {
        const tapCenter = taps[t][0];
        if (i >= tapCenter - 4 && i <= tapCenter + 4) {
          const tapGain = taps[t][1] * INV_INT32;
          sampleL += nextRng() * tapGain;
          sampleR += nextRng() * tapGain;
        }
      }
    }

    const activeIdx = i - preDelaySamples;
    const rem = 1.0 - activeIdx * invActiveLen;
    const env = rem * rem * rem * (0.8 + 0.2 * rem) * 0.5 * INV_INT32;

    lpL += alpha * (nextRng() * env - lpL);
    lpR += alpha * (nextRng() * env - lpR);

    let boundaryEnv = 1.0;
    if (activeIdx < fadeInSamples) {
      boundaryEnv = activeIdx * invFadeIn;
    } else if (length - 1 - i < fadeOutSamples) {
      boundaryEnv = (length - 1 - i) * invFadeOut;
    }

    const outL = (sampleL + lpL) * boundaryEnv;
    const outR = (sampleR + lpR) * boundaryEnv;
    left[i] = outL;
    right[i] = outR;
    sumL += outL;
    sumR += outR;
  }

  const meanL = sumL * invActiveLen;
  const meanR = sumR * invActiveLen;
  for (let i = preDelaySamples; i < length; i++) {
    left[i] -= meanL;
    right[i] -= meanR;
  }
  left[length - 1] = 0;
  right[length - 1] = 0;

  ctxCache.set(cacheKey, impulse);
  return impulse;
}

export const TAIL_DRAIN_MIN_GUARD_SEC = 0.25;
export const TAIL_DRAIN_SILENCE_THRESHOLD = 5e-5;
export const TAIL_DRAIN_SILENCE_HOLD_SEC = 0.35;
export const TAIL_DRAIN_SAFETY_MARGIN_SEC = 0.5;

/**
 * Encapsulates an independent Web Audio spatial filter + stadium reverb + dry/wet mix chain.
 * Used separately by the Player Anthem bus and the Background Music bus so their opposite
 * spatial polarities never interfere, while sharing identical acoustic parameters from
 * Spatial Audio & Anthem Tuner.
 */
export class SpatialAudioBusChain {
  readonly ctx: AudioContext;
  impulseBuffer: AudioBuffer | null;
  readonly input: GainNode;
  readonly hpf: BiquadFilterNode;
  readonly lpf: BiquadFilterNode;
  convolver: ConvolverNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly output: GainNode;
  readonly analyser: AnalyserNode | null;
  private readonly _analyserBuffer: Float32Array<ArrayBuffer> | null;
  private _lastLpf = -1;
  private _lastHpf = -1;
  private _lastWet = -1;
  private _lastDry = -1;
  private _lastOut = -1;
  private _smoothedLpf = 20000;
  private _smoothedHpf = 20;
  private _smoothedWet = 0.0;
  private _smoothedDry = 1.0;
  private _smoothedOut = 0.0;
  private _lastStepTime = 0;

  constructor(ctx: AudioContext, destination: AudioNode, impulseBuffer: AudioBuffer | null = null) {
    this.ctx = ctx;
    this.impulseBuffer = impulseBuffer || null;
    this.input = ctx.createGain();
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 20;
    this.hpf.Q.value = 0.707;

    this.lpf = ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 20000;
    this.lpf.Q.value = 0.707;

    this.convolver = ctx.createConvolver();
    if (impulseBuffer) this.convolver.buffer = impulseBuffer;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.0;
    this.output = ctx.createGain();
    this.output.gain.value = 0.0;

    let analyser: AnalyserNode | null = null;
    let analyserBuffer: Float32Array<ArrayBuffer> | null = null;
    if (typeof ctx.createAnalyser === 'function') {
      try {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0;
        analyserBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      } catch {
        analyser = null;
      }
    }
    this.analyser = analyser;
    this._analyserBuffer = analyserBuffer;

    this.input.connect(this.hpf);
    this.hpf.connect(this.lpf);
    this.lpf.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.lpf.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
    if (this.analyser) this.output.connect(this.analyser);
    this.output.connect(destination);
  }

  sampleOutputPeak(): SampleOutputPeakResult {
    if (!this.analyser || !this._analyserBuffer || !this.ctx || this.ctx.state !== 'running') {
      return { peak: 0, valid: false };
    }
    try {
      this.analyser.getFloatTimeDomainData(this._analyserBuffer);
      let peak = 0;
      const buf = this._analyserBuffer;
      for (let i = 0; i < buf.length; i++) {
        const abs = Math.abs(buf[i]);
        if (abs > peak) peak = abs;
      }
      return { peak, valid: true };
    } catch {
      return { peak: 0, valid: false };
    }
  }

  private _stepSmoothedParam(
    param: AudioParam,
    target: number,
    smoothed: number,
    lastWritten: number,
    alpha: number,
    deadband: number,
    immediate: boolean
  ): [number, number] {
    if (!param || !this.ctx) return [smoothed, lastWritten];
    const isSnap = immediate || this.ctx.state !== 'running';
    let nextSmoothed = isSnap ? target : smoothed + (target - smoothed) * alpha;
    if (Math.abs(target - nextSmoothed) <= deadband) nextSmoothed = target;

    let nextWritten = lastWritten;
    if (
      isSnap ||
      nextWritten < 0 ||
      Math.abs(nextSmoothed - nextWritten) > deadband ||
      (target === nextSmoothed && nextWritten !== target)
    ) {
      nextWritten = nextSmoothed;
      try {
        if (immediate) param.cancelScheduledValues(this.ctx.currentTime);
        param.value = nextSmoothed;
      } catch {
        param.value = nextSmoothed;
      }
    }
    return [nextSmoothed, nextWritten];
  }

  setImpulseBuffer(impulseBuffer: AudioBuffer | null): void {
    if (!impulseBuffer || !this.ctx) return;
    this.impulseBuffer = impulseBuffer;
    try {
      const nextConvolver = this.ctx.createConvolver();
      nextConvolver.buffer = impulseBuffer;
      this.lpf.connect(nextConvolver);
      nextConvolver.connect(this.wetGain);
      if (this.convolver) {
        try {
          this.lpf.disconnect(this.convolver);
          this.convolver.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.convolver = nextConvolver;
    } catch (err) {
      console.warn('[SpatialAudioBusChain] Failed to swap convolver impulse buffer:', err);
    }
  }

  resetAndSilence(
    cfg: Partial<SpatialAudioTunerConfig> = DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG
  ): void {
    this._lastLpf = -1;
    this._lastHpf = -1;
    this._lastWet = -1;
    this._lastDry = -1;
    this._lastOut = -1;
    this.applyBlend(0.0, cfg, 0.0, true);
    if (this.impulseBuffer) this.setImpulseBuffer(this.impulseBuffer);
  }

  applyPodBlend(
    spatialBlend: number,
    hpfFreqHz: number,
    lpfFreqHz: number,
    wetGain: number,
    outputGain = 1.0,
    immediate = false,
    dryDuckFactor = 0.414
  ): void {
    const b = Math.max(0, Math.min(1, Number.isFinite(spatialBlend) ? spatialBlend : 0));
    const currentHpf = Math.max(20, Math.min(5000, Number.isFinite(hpfFreqHz) ? hpfFreqHz : 20));
    const currentLpf = Math.max(100, Math.min(20000, Number.isFinite(lpfFreqHz) ? lpfFreqHz : 20000));
    const currentWet = Math.max(0, Number.isFinite(wetGain) ? wetGain : 0);
    const currentDry = Math.max(0, 1.0 - b * dryDuckFactor);
    const currentOut = Math.max(
      0,
      Math.min(2, Number.isFinite(Number(outputGain)) ? Number(outputGain) : 1.0)
    );

    const now = this.ctx ? this.ctx.currentTime : 0;
    const rawDt = this._lastStepTime > 0 ? now - this._lastStepTime : 1 / 60;
    const dt = rawDt > 0.0005 && rawDt < 0.25 ? rawDt : 1 / 60;
    this._lastStepTime = now;
    const alpha = 1 - Math.exp(-dt / 0.015);

    [this._smoothedLpf, this._lastLpf] = this._stepSmoothedParam(
      this.lpf.frequency, currentLpf, this._smoothedLpf, this._lastLpf, alpha, 0.05, immediate
    );
    [this._smoothedHpf, this._lastHpf] = this._stepSmoothedParam(
      this.hpf.frequency, currentHpf, this._smoothedHpf, this._lastHpf, alpha, 0.05, immediate
    );
    [this._smoothedWet, this._lastWet] = this._stepSmoothedParam(
      this.wetGain.gain, currentWet, this._smoothedWet, this._lastWet, alpha, 1e-4, immediate
    );
    [this._smoothedDry, this._lastDry] = this._stepSmoothedParam(
      this.dryGain.gain, currentDry, this._smoothedDry, this._lastDry, alpha, 1e-4, immediate
    );
    [this._smoothedOut, this._lastOut] = this._stepSmoothedParam(
      this.output.gain, currentOut, this._smoothedOut, this._lastOut, alpha, 1e-4, immediate
    );
  }

  applyBlend(
    blend: number,
    cfg: Partial<SpatialAudioTunerConfig> = DEFAULT_SPATIAL_AUDIO_TUNER_CONFIG,
    outputGain = 1.0,
    immediate = false
  ): void {
    const b = Math.max(0, Math.min(1, Number.isFinite(Number(blend)) ? Number(blend) : 0));
    const maxFreq = 20000;
    const rawLpf = Number(cfg.lpfMinFreq);
    const minLpf = Math.max(100, Math.min(maxFreq, Number.isFinite(rawLpf) ? rawLpf : 3500));
    const rawHpf = Number(cfg.hpfMaxFreq);
    const maxHpf = Math.max(20, Math.min(5000, Number.isFinite(rawHpf) ? rawHpf : 425));
    const rawWetPct = Number(cfg.wetMaxPct);
    const targetWet = Math.max(0, Math.min(1, (Number.isFinite(rawWetPct) ? rawWetPct : 69) / 100));
    const rawWetBoost = Number(cfg.wetBoost);
    const wetBoost = Math.max(0.1, Number.isFinite(rawWetBoost) ? rawWetBoost : 1.35);

    this.applyPodBlend(
      b,
      20 + b * Math.max(0, maxHpf - 20),
      maxFreq * Math.pow(minLpf / maxFreq, b),
      b * targetWet * wetBoost,
      outputGain,
      immediate,
      targetWet * 0.6
    );
  }
}
