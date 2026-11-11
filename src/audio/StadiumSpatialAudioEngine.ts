/**
 * StadiumSpatialAudioEngine.ts
 * Orchestrates Non-Linear Directional Stadium Spatial Audio for Player Goal Anthems
 * and Background Music, bridging UI/game runtime context with Web Audio bus chains.
 */

import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getAudioContext, getMasterAudioInput } from './audioContext.ts';
import { type SpatialAudioTunerConfig } from '../ui-core/config/spatialAttenuationProfiles.ts';
import {
  useSpatialAudioStore,
  useHudStore,
  useAppStore,
  useStaticTrainingPackStore,
} from '../game/runtimeUiPort.ts';
import {
  buildStadiumImpulseBuffer,
  SpatialAudioBusChain,
  type SpatialAudioRuntimeContextSnapshot,
} from './SpatialAudioBusChain.ts';
import { GoalAnthemPlayer } from './GoalAnthemPlayer.ts';
import { BackgroundMusicController } from './BackgroundMusicController.ts';
import {
  computeAnthemOutputGain,
  computeBgmVolumeScalar,
  readRuntimeAudioSnapshot,
} from './spatialMusicAndAnthemPipeline.ts';
import {
  computeSpatialTransitionMaxDelta,
  evaluateSpatialContextTransition,
  hasImpulseDecayChanged,
  isTrainingShotExpireContext,
  resolveAnthemVolumeSampleBuffer,
  resolveBgmVolumeSampleBuffer,
  resolveImpulseDecaySec,
} from './stadiumSpatialAcousticPipeline.ts';

export type PlaySampleBufferCallback = (
  buffer: AudioBuffer,
  volume: number,
  options?: { offset?: number; maxDurationSec?: number }
) => void;

export class StadiumSpatialAudioEngine {
  ctx: AudioContext | null = null;
  impulseBuffer: AudioBuffer | null = null;
  lastImpulseDecaySec = -1;
  private _decayRebuildTimer: ReturnType<typeof setTimeout> | null = null;

  anthemChain: SpatialAudioBusChain | null = null;
  bgmChain: SpatialAudioBusChain | null = null;

  readonly anthemPlayer: GoalAnthemPlayer;
  readonly bgmController: BackgroundMusicController;

  private _cachedBgmPreviewBuffer: AudioBuffer | null = null;
  _isWindowUnfocusedMuted = false;

  runtimeContext: SpatialAudioRuntimeContextSnapshot = readRuntimeAudioSnapshot();

  private _lastRafTime = 0;
  private _rafId: number | null = null;
  private _lastHudMatchPhase: string | null = null;
  private _lastChoreographySignal: string | null = null;
  private _initialized = false;

  constructor() {
    this.anthemPlayer = new GoalAnthemPlayer({
      ensureAudioGraph: (autoResume = true) => this._ensureAudioGraph(autoResume),
      getAudioContext: () => this.ctx,
      getAnthemChain: () => this.anthemChain,
      getImpulseBuffer: () => this.impulseBuffer,
      getOutputGain: (forceActive = false) =>
        computeAnthemOutputGain(this.anthemPlayer.isActiveOrDraining(), forceActive),
      isWindowUnfocusedMuted: () => this._isWindowUnfocusedMuted,
      getRuntimeContext: () => this.runtimeContext,
      notifyPlaybackOrDrainStateChanged: () => {
        this._refreshGoalSequenceBgmGate();
        this.bgmController.syncPlaybackState();
      },
    });

    this.bgmController = new BackgroundMusicController({
      ensureAudioGraph: (autoResume = true) => this._ensureAudioGraph(autoResume),
      getBgmChain: () => this.bgmChain,
      getBgmVolScalar: (store) => computeBgmVolumeScalar(store),
      isWindowUnfocusedMuted: () => this._isWindowUnfocusedMuted,
      getRuntimeContext: () => this.runtimeContext,
      isPreviewOrPreviewDrainActive: () => this.anthemPlayer.isPreviewOrPreviewDrainActive(),
      refreshGoalSequenceBgmGate: () => this._refreshGoalSequenceBgmGate(),
    });
  }

  init(): void {
    if (this._initialized || typeof window === 'undefined') return;
    this._initialized = true;

    const store = useSpatialAudioStore.getState();
    const anthem = this.anthemPlayer;
    const bgm = this.bgmController;

    store.registerRuntimeCallbacks({
      onPreviewAnthem: anthem.startPreview.bind(anthem),
      onStopPreviewAnthem: anthem.stopPreview.bind(anthem),
      onSelectBgmTrack: bgm.playTrackById.bind(bgm),
      onNextBgmTrack: () => bgm.playNextTrack(1),
      onPrevBgmTrack: () => bgm.playNextTrack(-1),
      onToggleBgmPlayPause: bgm.togglePlayPause.bind(bgm),
      onBgmPrefsChanged: bgm.syncPlaybackState.bind(bgm),
      onBgmFilesUploaded: bgm.onFilesUploaded.bind(bgm),
      onTunerConfigChanged: this.onTunerConfigChanged.bind(this),
    });

    const syncFromPort = () => this.updateRuntimeContext(readRuntimeAudioSnapshot());
    syncFromPort();
    useHudStore.subscribe(syncFromPort);
    useAppStore.subscribe(syncFromPort);
    useStaticTrainingPackStore.subscribe(syncFromPort);

    audioConfig.subscribe(() => {
      const curStore = useSpatialAudioStore.getState();
      const cfg = curStore.tunerConfig;
      this.anthemChain?.applyBlend(
        this.anthemPlayer.blend,
        cfg,
        computeAnthemOutputGain(this.anthemPlayer.isActiveOrDraining())
      );
      this.bgmController.applyCurrentChainBlend(cfg, computeBgmVolumeScalar(curStore));
    });

    this._startTransitionLoop();
  }

  updateRuntimeContext(partial: Partial<SpatialAudioRuntimeContextSnapshot> = {}): void {
    const prev = this.runtimeContext;
    if (
      (partial.isOpen === undefined || partial.isOpen === prev.isOpen) &&
      (partial.matchMode === undefined || partial.matchMode === prev.matchMode) &&
      (partial.onlineSession === undefined || partial.onlineSession === prev.onlineSession) &&
      (partial.matchPhase === undefined || partial.matchPhase === prev.matchPhase) &&
      (partial.choreographySignal === undefined ||
        partial.choreographySignal === prev.choreographySignal) &&
      (partial.replayScorerAnthemId === undefined ||
        partial.replayScorerAnthemId === prev.replayScorerAnthemId) &&
      (partial.staticTrainingReplayType === undefined ||
        partial.staticTrainingReplayType === prev.staticTrainingReplayType)
    ) {
      return;
    }
    const next: SpatialAudioRuntimeContextSnapshot = { ...prev, ...partial };
    this.runtimeContext = next;

    const plan = evaluateSpatialContextTransition(
      prev,
      next,
      this._lastChoreographySignal,
      this._lastHudMatchPhase
    );
    this._lastChoreographySignal = plan.nextChoreographySignal;
    this._lastHudMatchPhase = plan.nextHudMatchPhase;

    if (plan.activateGoalSequenceBgm) this.bgmController.goalSequenceActive = true;
    if (plan.setGoalReplaySkipped !== null) {
      useSpatialAudioStore.getState().setGoalReplaySkipped(plan.setGoalReplaySkipped);
    }
    if (plan.startGoalReplayAnthem) {
      const selected = useSpatialAudioStore.getState().selectedAnthem;
      this.anthemPlayer.startGoalReplayAnthem(next.replayScorerAnthemId || selected);
    }
    if (plan.refreshGoalSequenceGate) this._refreshGoalSequenceBgmGate();
    if (plan.syncBgmPlayback) this.bgmController.syncPlaybackState();
  }

  prewarm(): void {
    try {
      this._ensureAudioGraph(false);
    } catch {
      /* ignore */
    }
  }

  handleWindowFocusChange(hasFocus: boolean, continueOnBlur: boolean): void {
    if (!hasFocus && !continueOnBlur) {
      if (this._isWindowUnfocusedMuted) return;
      this._isWindowUnfocusedMuted = true;
      const mode = this.anthemPlayer.activeMode;
      if (mode === 'garage-preview' || mode === 'tuner-audition') this.anthemPlayer.stopPreview();
      if (this.anthemPlayer.isTailDraining) this.anthemPlayer.completeTailDrain();
      this.bgmController.handleFocusChanged(true, useSpatialAudioStore.getState().tunerConfig);
    } else if (this._isWindowUnfocusedMuted) {
      this._isWindowUnfocusedMuted = false;
      if (typeof performance !== 'undefined') this._lastRafTime = performance.now();
      this.bgmController.handleFocusChanged(false, useSpatialAudioStore.getState().tunerConfig);
    }
  }

  private _ensureAudioGraph(autoResume = true): AudioContext | null {
    const ctx = getAudioContext();
    const masterInput = getMasterAudioInput() || ctx?.destination || null;
    if (!ctx || !masterInput) return null;
    if (autoResume && ctx.state === 'suspended') ctx.resume().catch(() => {});

    const store = useSpatialAudioStore.getState();
    const cfg = store.tunerConfig || {};
    const decaySec = resolveImpulseDecaySec(cfg);

    if (!this.ctx || this.ctx !== ctx) {
      this.ctx = ctx;
      this.impulseBuffer = buildStadiumImpulseBuffer(ctx, decaySec);
      this.lastImpulseDecaySec = decaySec;
      this.anthemChain = new SpatialAudioBusChain(ctx, masterInput, this.impulseBuffer);
      this.bgmChain = new SpatialAudioBusChain(ctx, masterInput, this.impulseBuffer);
      this.anthemChain.applyBlend(
        this.anthemPlayer.blend,
        cfg,
        computeAnthemOutputGain(this.anthemPlayer.isActiveOrDraining()),
        true
      );
      this.bgmController.applyCurrentChainBlend(cfg, computeBgmVolumeScalar(store), true);
      this.bgmController.attachToBusChain(ctx, this.bgmChain);
    } else if (hasImpulseDecayChanged(decaySec, this.lastImpulseDecaySec)) {
      this._rebuildImpulseBuffers(ctx, decaySec);
    }

    this.bgmController.attachToBusChain(ctx, this.bgmChain);
    return ctx;
  }

  private _rebuildImpulseBuffers(ctx: AudioContext, decaySec: number): void {
    this.lastImpulseDecaySec = decaySec;
    this.impulseBuffer = buildStadiumImpulseBuffer(ctx, decaySec);
    this.anthemChain?.setImpulseBuffer(this.impulseBuffer);
    this.bgmChain?.setImpulseBuffer(this.impulseBuffer);
  }

  onTunerConfigChanged(cfg: Partial<SpatialAudioTunerConfig>): void {
    if (!this.ctx) this._ensureAudioGraph(false);
    if (!this.ctx) return;

    if (hasImpulseDecayChanged(resolveImpulseDecaySec(cfg), this.lastImpulseDecaySec)) {
      if (this._decayRebuildTimer) clearTimeout(this._decayRebuildTimer);
      this._decayRebuildTimer = setTimeout(() => {
        this._decayRebuildTimer = null;
        if (!this.ctx) return;
        const latestDecay = resolveImpulseDecaySec(useSpatialAudioStore.getState().tunerConfig);
        if (hasImpulseDecayChanged(latestDecay, this.lastImpulseDecaySec)) {
          this._rebuildImpulseBuffers(this.ctx, latestDecay);
        }
      }, 100);
    }

    const store = useSpatialAudioStore.getState();
    this.anthemPlayer.applyTunerConfig(cfg);
    this.bgmController.applyTunerConfig(cfg, computeBgmVolumeScalar(store));
  }

  applyStadiumBusPod(
    spatialBlend: number,
    hpfFreqHz: number,
    lpfFreqHz: number,
    wetGain: number,
    immediate = false
  ): void {
    if (!this.bgmChain) return;
    const store = useSpatialAudioStore.getState();
    const bgmOut = computeBgmVolumeScalar(store) * this.bgmController.fadeEnvelope;
    this.bgmChain.applyPodBlend(spatialBlend, hpfFreqHz, lpfFreqHz, wetGain, bgmOut, immediate);
  }

  async previewAnthemVolumeSample(playBufferFn: PlaySampleBufferCallback): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx || typeof playBufferFn !== 'function') return;
    const buf = await resolveAnthemVolumeSampleBuffer(
      ctx,
      useSpatialAudioStore.getState().selectedAnthem,
      this.anthemPlayer
    );
    if (buf) playBufferFn(buf, Number(audioConfig.get('anthemVolume') ?? 1.0), { maxDurationSec: 2.2 });
  }

  async previewBgmVolumeSample(playBufferFn: PlaySampleBufferCallback): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx || typeof playBufferFn !== 'function') return;
    const { buffer, offsetSec } = await resolveBgmVolumeSampleBuffer(ctx, this._cachedBgmPreviewBuffer);
    if (!buffer) return;
    this._cachedBgmPreviewBuffer = buffer;
    playBufferFn(buffer, Number(audioConfig.get('bgmBusVolume') ?? 1.0), {
      offset: offsetSec,
      maxDurationSec: 2.2,
    });
  }

  private _refreshGoalSequenceBgmGate(): boolean {
    const phase = this.runtimeContext.matchPhase;
    const isGoalOrReplay =
      (phase === 'goal' || phase === 'replay') && !isTrainingShotExpireContext(this.runtimeContext);
    return this.bgmController.updateGoalSequenceGate(
      isGoalOrReplay,
      this.anthemPlayer.isGoalSequenceAnthemActive()
    );
  }

  notifyGoalReplaySkipped(): void {
    useSpatialAudioStore.getState().setGoalReplaySkipped(true);
    this._refreshGoalSequenceBgmGate();
    this.bgmController.syncPlaybackState();
  }

  private _startTransitionLoop(): void {
    if (typeof window === 'undefined' || this._rafId !== null) return;
    this._lastRafTime = performance.now();

    const step = (now: number) => {
      const store = useSpatialAudioStore.getState();
      const cfg = store.tunerConfig || {};
      const { dt, maxDelta } = computeSpatialTransitionMaxDelta(now, this._lastRafTime, cfg);
      this._lastRafTime = now;
      this.anthemPlayer.stepTransition(dt, now, maxDelta, cfg);
      this.bgmController.stepTransition(dt, maxDelta, cfg, computeBgmVolumeScalar(store));
      this._rafId = window.requestAnimationFrame(step);
    };

    this._rafId = window.requestAnimationFrame(step);
  }
}

export const stadiumSpatialAudioEngine = new StadiumSpatialAudioEngine();
