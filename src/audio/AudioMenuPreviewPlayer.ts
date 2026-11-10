import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getAudioContext, getMasterAudioInput, subsystemState } from './audioContext.ts';
import { TurtleModemEngineSynth } from './TurtleModemEngineSynth.ts';
import {
  AudioPreviewBufferCatalog,
  type PreviewAudioBufferOptions,
} from './audioMenuPreviewCatalog.ts';
import type { VehicleAudioBuffers } from './VehicleAudioManager.ts';
import type { IncidentAudioBuffers } from './IncidentAudioEngine.ts';

export type { PreviewAudioBufferOptions };

export interface AudioMenuPreviewOptions {
  readonly preload?: () => Promise<void>;
}

export type AudioMenuPreviewDeps = AudioMenuPreviewOptions;

export class AudioMenuPreviewPlayer {
  private readonly preloadFn: (() => Promise<void>) | null;
  readonly catalog = new AudioPreviewBufferCatalog();
  _previewGain: GainNode | null = null;
  _previewSource: AudioBufferSourceNode | null = null;
  _previewSynth: TurtleModemEngineSynth | null = null;
  _previewSynthInterval: ReturnType<typeof setInterval> | null = null;
  _previewSynthTimeout: ReturnType<typeof setTimeout> | null = null;
  loading = false;

  constructor(options: AudioMenuPreviewOptions = {}) {
    this.preloadFn = options.preload ?? null;
  }

  get _previewVariantCounters(): Record<string, number> {
    return this.catalog.variantCounters;
  }

  syncLoadedBuffers(
    incident: IncidentAudioBuffers,
    vehicle: VehicleAudioBuffers,
    signals: ReadonlyMap<string, AudioBuffer | null>,
    ballRolling: AudioBuffer | null,
    ballFlying: AudioBuffer | null
  ): void {
    this.catalog.syncLoadedBuffers(incident, vehicle, signals, ballRolling, ballFlying);
  }

  syncBoostBuffers(vehicle: VehicleAudioBuffers): void {
    this.catalog.syncBoostBuffers(vehicle);
  }

  stopAudioDetailPreview(): void {
    if (this._previewSynthInterval) {
      clearInterval(this._previewSynthInterval);
      this._previewSynthInterval = null;
    }
    if (this._previewSynthTimeout) {
      clearTimeout(this._previewSynthTimeout);
      this._previewSynthTimeout = null;
    }
    if (this._previewSynth) {
      try {
        this._previewSynth.silence();
        this._previewSynth.dispose();
      } catch {
        /* ignore */
      }
      this._previewSynth = null;
    }
    if (this._previewSource) {
      try {
        this._previewSource.onended = null;
        this._previewSource.stop();
        this._previewSource.disconnect();
      } catch {
        /* ignore */
      }
      this._previewSource = null;
    }
    if (this._previewGain) {
      try {
        this._previewGain.disconnect();
      } catch {
        /* ignore */
      }
      this._previewGain = null;
    }
  }

  _playPreviewBuffer(
    buf: AudioBuffer | null | undefined,
    gainMult = 1.0,
    options: PreviewAudioBufferOptions = {}
  ): void {
    const ctx = getAudioContext();
    const dest = getMasterAudioInput() || ctx?.destination;
    if (!ctx || !dest || !buf) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.stopAudioDetailPreview();

    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(Number(options.playbackRate) || 1.0, ctx.currentTime);
      if (options.loop) src.loop = true;

      const gain = ctx.createGain();
      const targetGain = Math.max(0, Math.min(5.0, Number(gainMult) || 0));
      gain.gain.setValueAtTime(targetGain, ctx.currentTime);
      src.connect(gain);
      gain.connect(dest);

      const maxOffset = Math.max(0, (buf.duration || 0) - 0.5);
      const startOffset = Math.max(0, Math.min(maxOffset, Number(options.offset) || 0));
      src.start(ctx.currentTime, startOffset);

      if (options.maxDurationSec && options.maxDurationSec > 0) {
        const stopAt = ctx.currentTime + Number(options.maxDurationSec);
        const fadeStart = Math.max(ctx.currentTime, stopAt - 0.15);
        gain.gain.setValueAtTime(targetGain, fadeStart);
        gain.gain.linearRampToValueAtTime(0.0001, stopAt);
        src.stop(stopAt);
      }

      this._previewSource = src;
      this._previewGain = gain;
      src.onended = () => {
        if (this._previewSource === src) {
          this._previewSource = null;
          this._previewGain = null;
        }
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch (err) {
      console.warn('[AudioMenuPreviewPlayer] Failed to play preview buffer:', err);
    }
  }

  private _previewEngineSynth(gainMult: number): void {
    const ctx = getAudioContext();
    const dest = getMasterAudioInput() || ctx?.destination;
    if (!ctx || !dest) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.stopAudioDetailPreview();

    try {
      const synth = new TurtleModemEngineSynth(ctx, dest, { isPrimaryListener: false });
      synth.setVolume(Math.max(0, Math.min(5.0, gainMult)));
      this._previewSynth = synth;
      let step = 0;
      synth.update({
        speedUU: 450,
        forwardSpeedUU: 450,
        throttleInput: 1,
        isOnGround: true,
        alive: true,
        audible: true,
        dt: 0.05,
      });
      this._previewSynthInterval = setInterval(() => {
        step++;
        const progress = Math.min(1, step / 28);
        const isAccel = progress < 0.72;
        const speed = isAccel
          ? 450 + (progress / 0.72) * 1750
          : 2200 - ((progress - 0.72) / 0.28) * 900;
        synth.update({
          speedUU: speed,
          forwardSpeedUU: speed,
          throttleInput: isAccel ? 1 : 0,
          isOnGround: true,
          alive: true,
          audible: true,
          dt: 0.05,
        });
      }, 50);
      this._previewSynthTimeout = setTimeout(() => this.stopAudioDetailPreview(), 1450);
    } catch (err) {
      console.warn('[AudioMenuPreviewPlayer] Failed to preview TurtleModemEngineSynth:', err);
    }
  }

  private async _previewAnthemSuite(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) return;
    const sample = await this.catalog.resolveAnthemSuiteSample(ctx);
    if (sample) this._playPreviewBuffer(sample.buffer, sample.gain, sample.options);
  }

  private async _previewBgmSuite(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) return;
    const sample = await this.catalog.resolveBgmSuiteSample(ctx);
    if (sample) this._playPreviewBuffer(sample.buffer, sample.gain, sample.options);
  }

  private _triggerLazyPreload(retryCallback: () => void): void {
    if (this.loading || !this.preloadFn) return;
    this.loading = true;
    this.preloadFn()
      .then(() => {
        this.loading = false;
        retryCallback();
      })
      .catch(() => {
        this.loading = false;
      });
  }

  previewAudioDetail(detailKey: string): void {
    if (!detailKey) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    if (detailKey === 'anthemVolume') {
      void this._previewAnthemSuite();
      return;
    }
    if (detailKey === 'bgmBusVolume') {
      void this._previewBgmSuite();
      return;
    }

    const v = (k: string): number => Number(audioConfig.get(k) ?? 1.0);
    if (detailKey === 'engineVolume' || detailKey === 'vehicleSelfVolume') {
      this._previewEngineSynth(v('engineVolume') * v('vehicleSelfVolume'));
      return;
    }

    if (!this.catalog.loaded && subsystemState.buffers.size === 0) {
      this._triggerLazyPreload(() => this.previewAudioDetail(detailKey));
      return;
    }

    const sample = this.catalog.resolveDetailSample(detailKey);
    if (sample) {
      this._playPreviewBuffer(sample.buffer, sample.gain, sample.options);
    }
  }

  previewBoostVariation(variationId = 'rush', phase = 'start'): void {
    const ctx = getAudioContext();
    const dest = getMasterAudioInput() || ctx?.destination;
    if (!ctx || !dest) return;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .catch((err) =>
          console.warn('[AudioMenuPreviewPlayer] AudioContext resume failed/blocked:', err)
        );
    }
    this.stopAudioDetailPreview();
    const normalizedPhase = phase === 'release' ? 'end' : phase;
    const key = `boost_${variationId}_${normalizedPhase}`;
    const buf = this.catalog.singleBuffers.get(key) || subsystemState.buffers.get(key);
    if (!buf) {
      if (!this.catalog.loaded) {
        this._triggerLazyPreload(() => this.previewBoostVariation(variationId, phase));
      }
      return;
    }
    const boostVol = audioConfig.get('boostVolume') ?? 1.0;
    const phaseVol =
      normalizedPhase === 'loop'
        ? (audioConfig.get('boostLoopVolume') ?? 1.0)
        : normalizedPhase === 'start'
          ? (audioConfig.get('boostStartVolume') ?? audioConfig.get('boostStartStopVolume') ?? 1.0)
          : (audioConfig.get('boostReleaseVolume') ??
            audioConfig.get('boostStartStopVolume') ??
            1.0);
    this._playPreviewBuffer(
      buf,
      boostVol * phaseVol,
      normalizedPhase === 'loop' ? { loop: true, maxDurationSec: 1.1 } : {}
    );
  }
}
