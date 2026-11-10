import { type SpatialAudioTunerConfig } from '../ui-core/config/spatialAudioConfig.ts';
import {
  useSpatialAudioStore,
  getFilteredBgmTracks,
  type SpatialAudioStorePortState,
} from '../game/runtimeUiPort.ts';
import {
  SpatialAudioBusChain,
  evaluateSpatialBezierBlend,
  stepSpatialBezierTransition,
  type SpatialAudioRuntimeContextSnapshot,
} from './SpatialAudioBusChain.ts';
import {
  bindBgmMediaSession,
  computeBgmTargetPhase,
  computeBgmVolumeScalar,
  evaluateBgmSceneAllowed,
  readRuntimeAudioSnapshot,
  setBgmMediaSessionPlaybackState,
  stepLinearFadeEnvelope,
  type BgmTrackEntry,
} from './spatialMusicAndAnthemPipeline.ts';

export type { BgmTrackEntry };

export interface BackgroundMusicOptions {
  ensureAudioGraph?(autoResume?: boolean): AudioContext | null;
  getBgmChain?(): SpatialAudioBusChain | null;
  getBgmVolScalar?(store?: SpatialAudioStorePortState): number;
  isWindowUnfocusedMuted?(): boolean;
  getRuntimeContext?(): SpatialAudioRuntimeContextSnapshot;
  isPreviewOrPreviewDrainActive?(): boolean;
  refreshGoalSequenceBgmGate?(): boolean;
}

export class BackgroundMusicController {
  private readonly ensureGraphFn: ((autoResume?: boolean) => AudioContext | null) | null;
  private readonly isPreviewDrainActiveFn: (() => boolean) | null;
  private readonly refreshGoalGateFn: (() => boolean) | null;

  audioContext: AudioContext | null = null;
  bgmChain: SpatialAudioBusChain | null = null;
  audioEl: HTMLAudioElement | null = null;
  mediaSourceNode: MediaElementAudioSourceNode | null = null;
  objectUrl: string | null = null;
  currentTrack: BgmTrackEntry | null = null;

  windowUnfocusedMuted = false;
  userPaused = false;
  goalSequenceActive = false;
  fadeEnvelope = 0.0;
  linearPhase = 1.0;
  blend = 1.0;
  lastShouldBeAudible: boolean | undefined = undefined;

  constructor(options: BackgroundMusicOptions = {}) {
    this.ensureGraphFn = options.ensureAudioGraph ?? null;
    this.isPreviewDrainActiveFn = options.isPreviewOrPreviewDrainActive ?? null;
    this.refreshGoalGateFn = options.refreshGoalSequenceBgmGate ?? null;
  }

  private _ensureBusChain(autoResume = true): SpatialAudioBusChain | null {
    if (!this.bgmChain && this.ensureGraphFn) {
      this.ensureGraphFn(autoResume);
    } else if (autoResume && this.audioContext?.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.bgmChain;
  }

  attachToBusChain(ctx: AudioContext, bgmChain: SpatialAudioBusChain | null): void {
    this.audioContext = ctx;
    this.bgmChain = bgmChain;
    if (this.audioEl && bgmChain && !this.mediaSourceNode) {
      try {
        this.mediaSourceNode = ctx.createMediaElementSource(this.audioEl);
        this.mediaSourceNode.connect(bgmChain.input);
      } catch (err) {
        console.warn('[BackgroundMusicController] MediaElementSource attach failed:', err);
      }
    }
  }

  ensureAudioElement(): HTMLAudioElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.audioEl) {
      const audioEl = document.createElement('audio');
      audioEl.preload = 'auto';
      audioEl.style.display = 'none';
      audioEl.dataset.rcBgmElement = 'true';
      document.body.appendChild(audioEl);

      audioEl.addEventListener('ended', () => this.playNextTrack(1));
      audioEl.addEventListener('play', () => {
        if (this.shouldBeAudible()) this._setPlaying(true);
      });
      audioEl.addEventListener('pause', () => this._setPlaying(false));

      this.audioEl = audioEl;
      this._ensureBusChain();
      if (this.audioContext && this.bgmChain) {
        this.attachToBusChain(this.audioContext, this.bgmChain);
      }
    }
    return this.audioEl;
  }

  private _setPlaying(isPlaying: boolean): void {
    useSpatialAudioStore.getState().setBgmPlaybackState({ isPlaying });
    setBgmMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused');
  }

  private _playAudioElement(audioEl: HTMLAudioElement, store: SpatialAudioStorePortState): void {
    this.bgmChain?.applyBlend(
      this.blend,
      store.tunerConfig,
      this.fadeEnvelope * computeBgmVolumeScalar(store)
    );
    audioEl
      .play()
      .then(() => this._setPlaying(true))
      .catch(() => {});
  }

  setupMediaSession(track: BgmTrackEntry | null): void {
    bindBgmMediaSession(track, {
      onPlay: () => {
        this.userPaused = false;
        this.syncPlaybackState();
      },
      onPause: () => {
        this.userPaused = true;
        this.syncPlaybackState();
      },
      onPrevious: () => {
        this.userPaused = false;
        this.playNextTrack(-1);
      },
      onNext: () => {
        this.userPaused = false;
        this.playNextTrack(1);
      },
    });
  }

  shouldBeAudible(): boolean {
    if (this.windowUnfocusedMuted) return false;

    const store = useSpatialAudioStore.getState();
    if (!store.bgmEnabled) {
      this.userPaused = false;
      return false;
    }
    if (this.userPaused) return false;

    const playlist = getFilteredBgmTracks(store) as BgmTrackEntry[];
    if (playlist.length === 0) return false;

    const appState = readRuntimeAudioSnapshot();
    if (!evaluateBgmSceneAllowed(store, appState)) return false;

    const isPreviewing =
      store.previewingAnthemId !== null || Boolean(this.isPreviewDrainActiveFn?.());
    if (Boolean(appState.isOpen) && (store.isGarageAnthemTabActive || isPreviewing)) {
      return false;
    }
    const goalGated = this.refreshGoalGateFn ? this.refreshGoalGateFn() : this.goalSequenceActive;
    return !isPreviewing && !goalGated;
  }

  handleFocusChanged(muted: boolean, cfg: Partial<SpatialAudioTunerConfig>): void {
    this.windowUnfocusedMuted = muted;
    this.fadeEnvelope = 0.0;
    if (muted) {
      this.lastShouldBeAudible = false;
      this.bgmChain?.resetAndSilence(cfg);
      if (this.audioEl && !this.audioEl.paused) this.audioEl.pause();
    } else {
      this.bgmChain?.applyBlend(this.blend, cfg, 0.0, true);
      this.syncPlaybackState();
    }
  }

  applyCurrentChainBlend(
    cfg: Partial<SpatialAudioTunerConfig>,
    bgmVolScalar: number,
    immediate = false
  ): void {
    this.bgmChain?.applyBlend(this.blend, cfg, this.fadeEnvelope * bgmVolScalar, immediate);
  }

  updateGoalSequenceGate(isGoalOrReplayPhase: boolean, isAnthemStillActive: boolean): boolean {
    if (!this.goalSequenceActive) return false;
    if (!isGoalOrReplayPhase && !isAnthemStillActive) {
      this.goalSequenceActive = false;
    }
    return this.goalSequenceActive;
  }

  onFilesUploaded(): void {
    this.userPaused = false;
    const store = useSpatialAudioStore.getState();
    const playlist = getFilteredBgmTracks(store) as BgmTrackEntry[];
    if (playlist.length > 0 && store.bgmEnabled && this.shouldBeAudible()) {
      this.loadAndPlayTrack(playlist[Math.floor(Math.random() * playlist.length)]);
    } else if (playlist.length > 0 && !this.currentTrack) {
      this.currentTrack = playlist[Math.floor(Math.random() * playlist.length)];
      store.setBgmPlaybackState({
        currentTrackId: this.currentTrack.id,
        currentTrackTitle: this.currentTrack.title,
      });
    }
  }

  syncPlaybackState(): void {
    const store = useSpatialAudioStore.getState();
    const playlist = getFilteredBgmTracks(store) as BgmTrackEntry[];
    if (!this.shouldBeAudible()) {
      if (store.bgmIsPlaying) this._setPlaying(false);
      return;
    }

    const currentStillValid =
      this.currentTrack && playlist.some((t) => t.id === this.currentTrack?.id);
    if (!currentStillValid) {
      const nextTrack = playlist[Math.floor(Math.random() * playlist.length)];
      if (nextTrack) this.loadAndPlayTrack(nextTrack);
      return;
    }

    const audioEl = this.ensureAudioElement();
    if (!audioEl) return;
    this._ensureBusChain();
    if (!audioEl.src && this.currentTrack?.file) {
      this.loadAndPlayTrack(this.currentTrack);
      return;
    }
    if (audioEl.paused) {
      this._playAudioElement(audioEl, store);
    } else if (!store.bgmIsPlaying) {
      this._setPlaying(true);
    }
  }

  loadAndPlayTrack(track: BgmTrackEntry | null | undefined): void {
    if (!track?.file) return;
    const audioEl = this.ensureAudioElement();
    if (!audioEl) return;
    this._ensureBusChain();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.currentTrack = track;
    this.objectUrl = URL.createObjectURL(track.file);
    audioEl.src = this.objectUrl;

    const store = useSpatialAudioStore.getState();
    store.setBgmPlaybackState({ currentTrackId: track.id, currentTrackTitle: track.title });
    this.setupMediaSession(track);

    if (this.shouldBeAudible()) {
      this._playAudioElement(audioEl, store);
    }
  }

  playTrackById(trackId: string): void {
    this.userPaused = false;
    const tracks = (useSpatialAudioStore.getState().bgmTracks || []) as BgmTrackEntry[];
    const found = tracks.find((t) => t.id === trackId);
    if (found) this.loadAndPlayTrack(found);
  }

  playNextTrack(direction = 1): void {
    const playlist = getFilteredBgmTracks(useSpatialAudioStore.getState()) as BgmTrackEntry[];
    if (playlist.length === 0) return;
    const curIdx = this.currentTrack
      ? playlist.findIndex((t) => t.id === this.currentTrack?.id)
      : -1;
    const nextIdx = curIdx < 0 ? 0 : (curIdx + direction + playlist.length) % playlist.length;
    this.loadAndPlayTrack(playlist[nextIdx]);
  }

  togglePlayPause(): void {
    const store = useSpatialAudioStore.getState();
    const audioEl = this.ensureAudioElement();
    if (!audioEl) return;
    if (!this.currentTrack) {
      this.userPaused = false;
      this.playNextTrack(1);
      return;
    }
    this.userPaused = !(this.userPaused || audioEl.paused || !store.bgmIsPlaying);
    this.syncPlaybackState();
  }

  applyTunerConfig(cfg: Partial<SpatialAudioTunerConfig>, bgmVolScalar: number): void {
    this.blend = evaluateSpatialBezierBlend(this.linearPhase, cfg);
    this.bgmChain?.applyBlend(this.blend, cfg, this.fadeEnvelope * bgmVolScalar);
  }

  stepTransition(
    dt: number,
    maxDelta: number,
    cfg: Partial<SpatialAudioTunerConfig>,
    bgmVolScalar: number
  ): void {
    const store = useSpatialAudioStore.getState();
    const next = stepSpatialBezierTransition(
      this.linearPhase,
      computeBgmTargetPhase(cfg),
      maxDelta,
      cfg
    );
    this.linearPhase = next.linearPhase;
    this.blend = next.blend;

    const shouldBeAudible = this.shouldBeAudible();
    if (shouldBeAudible !== this.lastShouldBeAudible) {
      this.lastShouldBeAudible = shouldBeAudible;
      this.syncPlaybackState();
    }
    this.fadeEnvelope = stepLinearFadeEnvelope(
      this.fadeEnvelope,
      shouldBeAudible,
      dt,
      cfg.bgmFadeDurationSec
    );

    if (!shouldBeAudible && this.fadeEnvelope <= 0.001) {
      this.fadeEnvelope = 0.0;
      if (this.audioEl && !this.audioEl.paused) this.audioEl.pause();
    }

    this.bgmChain?.applyBlend(this.blend, cfg, this.fadeEnvelope * bgmVolScalar);

    if (
      Math.abs(store.bgmLinearPhase - this.linearPhase) > 0.005 ||
      Math.abs(store.bgmBlend - this.blend) > 0.005
    ) {
      store.setBgmTransitionState(this.linearPhase, this.blend);
    }
  }
}
