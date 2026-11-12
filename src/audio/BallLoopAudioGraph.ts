/**
 * BallLoopAudioGraph.ts
 * WebAudio playback graph for the continuous ball rolling / aerial-fall loops.
 * Rust `rc_audio_director` owns every acoustic decision (gain, rate, position);
 * this module only applies the resulting `BallAcousticLoopPod` to WebAudio nodes.
 */

import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getAudioContext, getMasterAudioInput } from './audioContext.ts';

const GAIN_SMOOTHING_TAU_SEC = 0.012;
const RATE_SMOOTHING_TAU_SEC = 0.02;
const GAIN_WRITE_DEADBAND = 5e-4;
const RATE_WRITE_DEADBAND = 1e-3;
const POSITION_WRITE_DEADBAND = 0.005;

export interface BallLoopCue {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rollingGain: number;
  readonly rollingRate: number;
  readonly flyingGain: number;
  readonly flyingRate: number;
}

export class BallLoopAudioGraph {
  context: AudioContext | null = null;
  destination: AudioNode | null = null;
  panner: PannerNode | null = null;
  rollingGain: GainNode | null = null;
  flyingGain: GainNode | null = null;
  rollingSource: AudioBufferSourceNode | null = null;
  flyingSource: AudioBufferSourceNode | null = null;
  rollingBuffer: AudioBuffer | null = null;
  flyingBuffer: AudioBuffer | null = null;
  initialized = false;
  private _lastRollingGain = 0;
  private _lastFlyingGain = 0;
  private _lastRollingRate = 0;
  private _lastFlyingRate = 0;
  private _lastX = Number.NaN;
  private _lastY = Number.NaN;
  private _lastZ = Number.NaN;

  init(rollingBuffer: AudioBuffer | null, flyingBuffer: AudioBuffer | null): void {
    if (rollingBuffer) this.rollingBuffer = rollingBuffer;
    if (flyingBuffer) this.flyingBuffer = flyingBuffer;
    const ctx = this.context || getAudioContext();
    if (!ctx) return;
    this.context = ctx;
    const destination = this.destination || getMasterAudioInput();
    if (!destination) return;
    this.destination = destination;

    if (!this.initialized) {
      const panner = ctx.createPanner();
      const panModel = audioConfig.get('spatialPanningModel') || 'equalpower';
      try {
        panner.panningModel = panModel;
      } catch {
        panner.panningModel = 'equalpower';
      }
      panner.distanceModel = 'inverse';
      panner.rolloffFactor = 0;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.channelCount = 1;
      panner.channelCountMode = 'explicit';
      panner.channelInterpretation = 'speakers';
      panner.connect(destination);

      this.rollingGain = ctx.createGain();
      this.rollingGain.gain.value = 0;
      this.rollingGain.connect(panner);

      this.flyingGain = ctx.createGain();
      this.flyingGain.gain.value = 0;
      this.flyingGain.connect(panner);

      this.panner = panner;
      this.initialized = true;
    }
    this.startLoops();
  }

  startLoops(): void {
    const ctx = this.context || getAudioContext();
    if (!ctx || !this.initialized || ctx.state === 'closed') return;
    this.context = ctx;
    const now = ctx.currentTime;

    if (this.rollingBuffer && !this.rollingSource && this.rollingGain) {
      const source = ctx.createBufferSource();
      source.buffer = this.rollingBuffer;
      source.loop = true;
      source.connect(this.rollingGain);
      source.start(now);
      source.onended = () => {
        if (this.rollingSource === source) this.rollingSource = null;
      };
      this.rollingSource = source;
    }

    if (this.flyingBuffer && !this.flyingSource && this.flyingGain) {
      const source = ctx.createBufferSource();
      source.buffer = this.flyingBuffer;
      source.loop = true;
      source.connect(this.flyingGain);
      source.start(now);
      source.onended = () => {
        if (this.flyingSource === source) this.flyingSource = null;
      };
      this.flyingSource = source;
    }
  }

  apply(cue: BallLoopCue, isAudible: boolean): void {
    if (!isAudible || !this.initialized) {
      this.silence();
      return;
    }
    if (!this.rollingSource && this.rollingBuffer) this.startLoops();
    if (!this.flyingSource && this.flyingBuffer) this.startLoops();
    const ctx = this.context || getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const moved =
      this._isAxisChanged(cue.x, this._lastX) ||
      this._isAxisChanged(cue.y, this._lastY) ||
      this._isAxisChanged(cue.z, this._lastZ);
    if (moved) {
      this._lastX = cue.x;
      this._lastY = cue.y;
      this._lastZ = cue.z;
      const panner = this.panner;
      if (panner?.positionX) {
        panner.positionX.setTargetAtTime(cue.x, now, GAIN_SMOOTHING_TAU_SEC);
        panner.positionY.setTargetAtTime(cue.y, now, GAIN_SMOOTHING_TAU_SEC);
        panner.positionZ.setTargetAtTime(cue.z, now, GAIN_SMOOTHING_TAU_SEC);
      } else if (panner && typeof panner.setPosition === 'function') {
        panner.setPosition(cue.x, cue.y, cue.z);
      }
    }

    this._applyGain(this.rollingGain, cue.rollingGain, now, 'rolling');
    this._applyGain(this.flyingGain, cue.flyingGain, now, 'flying');

    if (this.rollingSource?.playbackRate && cue.rollingGain > 0) {
      this._applyRate(this.rollingSource, cue.rollingRate, now, 'rolling');
    }
    if (this.flyingSource?.playbackRate && cue.flyingGain > 0) {
      this._applyRate(this.flyingSource, cue.flyingRate, now, 'flying');
    }
  }

  private _isAxisChanged(value: number, previous: number): boolean {
    if (!Number.isFinite(value)) return false;
    if (!Number.isFinite(previous)) return true;
    return Math.abs(value - previous) > POSITION_WRITE_DEADBAND + Math.abs(value) * 1e-4;
  }

  private _applyGain(
    node: GainNode | null,
    target: number,
    now: number,
    channel: 'rolling' | 'flying'
  ): void {
    if (!node) return;
    const value = Number.isFinite(target) ? Math.max(0, target) : 0;
    const previous = channel === 'rolling' ? this._lastRollingGain : this._lastFlyingGain;
    if (Math.abs(value - previous) <= GAIN_WRITE_DEADBAND && value !== 0) return;
    if (channel === 'rolling') this._lastRollingGain = value;
    else this._lastFlyingGain = value;
    node.gain.setTargetAtTime(value, now, GAIN_SMOOTHING_TAU_SEC);
  }

  private _applyRate(
    source: AudioBufferSourceNode,
    target: number,
    now: number,
    channel: 'rolling' | 'flying'
  ): void {
    const value = Number.isFinite(target) ? Math.max(0.25, target) : 1;
    const previous = channel === 'rolling' ? this._lastRollingRate : this._lastFlyingRate;
    if (Math.abs(value - previous) <= RATE_WRITE_DEADBAND) return;
    if (channel === 'rolling') this._lastRollingRate = value;
    else this._lastFlyingRate = value;
    source.playbackRate.setTargetAtTime(value, now, RATE_SMOOTHING_TAU_SEC);
  }

  silence(): void {
    const ctx = this.context || getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const node of [this.rollingGain, this.flyingGain]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(now);
      node.gain.value = 0;
    }
    this._lastRollingGain = 0;
    this._lastFlyingGain = 0;
  }

  updatePanningModel(model: PanningModelType | null | undefined): void {
    if (!this.panner || !model) return;
    try {
      this.panner.panningModel = model;
    } catch {
      this.panner.panningModel = 'equalpower';
    }
  }

  get streamState(): {
    rollingActive: boolean;
    flyingActive: boolean;
    rollingGain: number;
    flyingGain: number;
  } {
    const read = (node: GainNode | null): number => (node ? Number(node.gain.value.toFixed(4)) : 0);
    return {
      rollingActive: Boolean(this.rollingSource),
      flyingActive: Boolean(this.flyingSource),
      rollingGain: read(this.rollingGain),
      flyingGain: read(this.flyingGain),
    };
  }

  dispose(): void {
    try {
      this.rollingSource?.stop();
      this.rollingSource?.disconnect();
      this.flyingSource?.stop();
      this.flyingSource?.disconnect();
      this.rollingGain?.disconnect();
      this.flyingGain?.disconnect();
      this.panner?.disconnect();
    } catch {
      /* ignore */
    }
    this.rollingSource = null;
    this.flyingSource = null;
    this.rollingGain = null;
    this.flyingGain = null;
    this.panner = null;
    this.initialized = false;
  }
}
