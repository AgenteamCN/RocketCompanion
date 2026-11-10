import { clampVolume, type AudioConfigSettings } from '../ui-core/config/audioConstants.ts';
import {
  MasterAcousticProcessor,
  type MasterAcousticProcessorSnapshot,
} from './MasterAcousticProcessor.ts';

export interface AudioMixerOutputMetrics {
  rms: number;
  peak: number;
  dbfs: number;
  nanCount?: number;
  silent: boolean;
  error?: string;
}

export class AudioMixer {
  _analyserBuffer: Float32Array<ArrayBuffer> | null;
  acousticProcessor: MasterAcousticProcessor;
  active: boolean;
  analyser: AnalyserNode | null;
  connected: boolean;
  context: AudioContext;
  input: GainNode;
  output: GainNode;
  volume: number;

  constructor(context: AudioContext) {
    this.context = context;
    this.input = context.createGain();
    this.acousticProcessor = new MasterAcousticProcessor(context);
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.volume = 1;
    this.active = false;
    this.connected = false;
    this.analyser = null;
    this._analyserBuffer = null;

    try {
      this.input.connect(this.acousticProcessor.input);
      this.acousticProcessor.output.connect(this.output);
    } catch (err) {
      console.warn(
        '[AudioMixer] Failed to wire MasterAcousticProcessor; connecting input directly to output:',
        err
      );
      this.input.connect(this.output);
    }

    try {
      if (typeof context.createAnalyser === 'function') {
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.5;
        this._analyserBuffer = new Float32Array(this.analyser.fftSize);
        this.output.connect(this.analyser);
      } else {
        console.warn(
          '[AudioMixer] AudioContext.createAnalyser is unavailable; continuing without analyser.'
        );
      }
    } catch (err) {
      console.warn(
        '[AudioMixer] Failed to initialize AnalyserNode; continuing without analyser:',
        err
      );
    }
  }

  applyAcousticConfig(
    cfg: Partial<AudioConfigSettings> | null | undefined,
    immediate = false
  ): void {
    this.acousticProcessor?.applyConfig(cfg, immediate);
  }

  getAcousticSnapshot(): MasterAcousticProcessorSnapshot {
    return this.acousticProcessor.getSnapshot();
  }

  sampleOutputMetrics(): AudioMixerOutputMetrics {
    if (!this.analyser || !this._analyserBuffer) {
      return { rms: 0, peak: 0, dbfs: -Infinity, silent: true };
    }
    try {
      this.analyser.getFloatTimeDomainData(this._analyserBuffer);
      let sumSq = 0;
      let peak = 0;
      let nanCount = 0;
      const len = this._analyserBuffer.length;
      for (let i = 0; i < len; i++) {
        const v = this._analyserBuffer[i];
        if (!Number.isFinite(v)) {
          nanCount++;
          continue;
        }
        const abs = Math.abs(v);
        if (abs > peak) peak = abs;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, len - nanCount));
      const dbfs = rms > 1e-7 ? 20 * Math.log10(rms) : -120;
      return {
        rms: Number(rms.toFixed(6)),
        peak: Number(peak.toFixed(6)),
        dbfs: Number(dbfs.toFixed(1)),
        nanCount,
        silent: peak < 1e-4,
      };
    } catch (e) {
      console.warn(
        '[AudioMixer] sampleOutputMetrics failed; returning silent metrics fallback:',
        e
      );
      return {
        rms: 0,
        peak: 0,
        dbfs: -120,
        silent: true,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  setVolume(vol: number): void {
    this.volume = clampVolume(vol);
    this.apply();
  }

  setActive(active: boolean): void {
    this.active = Boolean(active);
    this.apply();
  }

  flush(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    try {
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setValueAtTime(0, now);
    } catch (e) {
      console.warn('[AudioArchitecture] Error cancelling output gain schedule on reset:', e);
    }
  }

  apply(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const target = this.active ? this.volume : 0;
    const current = this.output.gain.value;

    try {
      this.output.gain.cancelScheduledValues(now);
      if (target === 0) {
        this.output.gain.setValueAtTime(0, now);
        if (this.connected) {
          this.output.disconnect(this.context.destination);
          this.connected = false;
        }
        return;
      }

      if (!this.connected) {
        this.output.gain.setValueAtTime(0, now);
        this.output.connect(this.context.destination);
        this.connected = true;
      }

      if (this.context.state === 'running') {
        this.output.gain.setValueAtTime(Math.min(current, target), now);
        this.output.gain.linearRampToValueAtTime(target, now + 0.05);
      } else {
        this.output.gain.setValueAtTime(target, now);
      }
    } catch (e) {
      console.warn('[AudioArchitecture] Error setting output gain on apply:', e);
    }
  }
}
