import { type SpatialAudioTunerConfig } from '../ui-core/config/spatialAudioConfig.ts';
import { type AnthemDef } from '../ui-core/config/anthemCatalogConfig.ts';
import { useSpatialAudioStore } from '../game/runtimeUiPort.ts';
import { getAudioContext } from './audioContext.ts';
import {
  SpatialAudioBusChain,
  evaluateSpatialBezierBlend,
  stepSpatialBezierTransition,
  type SpatialAudioRuntimeContextSnapshot,
} from './SpatialAudioBusChain.ts';
import {
  computeAnthemOutputGain,
  evaluateAnthemTargetPhase,
  fetchAndCacheAnthemBuffer,
  isWindowFocusAudioMuted,
  resolveCatalogAnthemDef,
  stepAnthemTailDrainSilenceCheck,
  type AnthemPlaybackMode,
  type AnthemPreviewSource,
} from './spatialMusicAndAnthemPipeline.ts';

export type { SpatialAudioRuntimeContextSnapshot, AnthemPlaybackMode, AnthemPreviewSource };

export interface GoalAnthemOptions {
  ensureAudioGraph?(autoResume?: boolean): AudioContext | null;
  getAudioContext?(): AudioContext | null;
  getAnthemChain?(): SpatialAudioBusChain | null;
  getImpulseBuffer?(): AudioBuffer | null;
  getOutputGain?(forceActive?: boolean): number;
  isWindowUnfocusedMuted?(): boolean;
  getRuntimeContext?(): SpatialAudioRuntimeContextSnapshot;
  notifyPlaybackOrDrainStateChanged?(): void;
}

export class GoalAnthemPlayer {
  private readonly ensureGraphFn: ((autoResume?: boolean) => AudioContext | null) | null;
  private readonly resolveChainFn: (() => SpatialAudioBusChain | null) | null;
  private readonly onStateChangedFn: (() => void) | null;

  audioContext: AudioContext | null = null;
  anthemChain: SpatialAudioBusChain | null = null;
  readonly bufferCache = new Map<string, AudioBuffer>();
  readonly loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  activeSource: AudioBufferSourceNode | null = null;
  activeMode: AnthemPlaybackMode | null = null;
  activeAnthemId: string | null = null;
  isGoalAnthemLoading = false;
  previewToken = 0;
  windowUnfocusedMuted = false;

  isTailDraining = false;
  drainingMode: AnthemPlaybackMode | null = null;
  drainMinTargetPhase = 0.0;
  readonly drainTiming = { startCtxTime: 0, startPerfMs: 0, silentAccumSec: 0 };

  linearPhase = 0.0;
  blend = 0.0;

  constructor(options: GoalAnthemOptions = {}) {
    this.ensureGraphFn = options.ensureAudioGraph ?? null;
    this.resolveChainFn = options.getAnthemChain ?? null;
    this.onStateChangedFn = options.notifyPlaybackOrDrainStateChanged ?? null;
  }

  private _ensureBusChain(autoResume = true): SpatialAudioBusChain | null {
    if (!this.audioContext || !this.anthemChain) {
      const ctx = this.ensureGraphFn ? this.ensureGraphFn(autoResume) : getAudioContext();
      if (ctx) this.audioContext = ctx;
      if (!this.anthemChain && this.resolveChainFn) this.anthemChain = this.resolveChainFn();
      if (!this.audioContext && this.anthemChain) this.audioContext = this.anthemChain.ctx;
    } else if (autoResume && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.anthemChain;
  }

  isActiveOrDraining(): boolean {
    return this.activeMode !== null || this.isTailDraining;
  }

  isGoalSequenceAnthemActive(): boolean {
    const isGoal = (m: AnthemPlaybackMode | null) => m === 'goal-replay' || m === 'goal';
    return (
      isGoal(this.activeMode) ||
      this.isGoalAnthemLoading ||
      (this.isTailDraining && isGoal(this.drainingMode))
    );
  }

  isPreviewOrPreviewDrainActive(): boolean {
    const isPrev = (m: AnthemPlaybackMode | null) =>
      m === 'garage-preview' || m === 'tuner-audition';
    return isPrev(this.activeMode) || (this.isTailDraining && isPrev(this.drainingMode));
  }

  resolveAnthemDefinition(anthemId: string | null | undefined): AnthemDef | null {
    return resolveCatalogAnthemDef(anthemId);
  }

  async loadAnthemBuffer(anthemDef: AnthemDef | null | undefined): Promise<AudioBuffer | null> {
    this._ensureBusChain(true);
    return fetchAndCacheAnthemBuffer(
      this.audioContext || getAudioContext(),
      anthemDef,
      this.bufferCache,
      this.loadingPromises
    );
  }

  stopCurrentSource(): void {
    if (this.activeSource) {
      const src = this.activeSource;
      this.activeSource = null;
      src.onended = null;
      try {
        src.stop();
        src.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.activeMode = null;
    this.activeAnthemId = null;
    this.isGoalAnthemLoading = false;
  }

  cancelTailDrain(): void {
    this.isTailDraining = false;
    this.drainingMode = null;
    this.drainMinTargetPhase = 0.0;
    this.drainTiming.startCtxTime = 0;
    this.drainTiming.startPerfMs = 0;
    this.drainTiming.silentAccumSec = 0;
  }

  private _resetPhaseAndChain(): void {
    const store = useSpatialAudioStore.getState();
    this.linearPhase = 0.0;
    this.blend = 0.0;
    this.anthemChain?.resetAndSilence(store.tunerConfig);
    store.setAnthemTransitionState(0.0, 0.0);
  }

  beginTailDrain(mode: AnthemPlaybackMode | null, anthemId: string | null = null): void {
    const store = useSpatialAudioStore.getState();
    const cfg = store.tunerConfig || {};
    const targetPhase = this._computeTargetPhase(cfg, mode);
    const hasSpatial =
      !isWindowFocusAudioMuted(this.windowUnfocusedMuted) &&
      Boolean(this.anthemChain) &&
      computeAnthemOutputGain(true, true) > 1e-4 &&
      Number(cfg.wetMaxPct) > 0 &&
      (this.blend > 1e-4 || targetPhase > 1e-4);

    if (!hasSpatial) {
      this.completeTailDrain();
      return;
    }

    this.isTailDraining = true;
    this.drainingMode = mode;
    this.drainMinTargetPhase = Math.max(this.linearPhase, targetPhase);
    this.drainTiming.startCtxTime = this.audioContext ? this.audioContext.currentTime : 0;
    this.drainTiming.startPerfMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this.drainTiming.silentAccumSec = 0;

    if (anthemId && store.activeGoalAnthemId !== anthemId) store.setActiveGoalAnthemId(anthemId);
    this.onStateChangedFn?.();
  }

  completeTailDrain(): void {
    this.cancelTailDrain();
    const store = useSpatialAudioStore.getState();
    if (this.activeMode === null) {
      this._resetPhaseAndChain();
      if (store.activeGoalAnthemId !== null) store.setActiveGoalAnthemId(null);
    }
    this.onStateChangedFn?.();
  }

  private _computeTargetPhase(
    cfg: Partial<SpatialAudioTunerConfig>,
    modeOverride: AnthemPlaybackMode | null = null
  ): number {
    const mode =
      modeOverride || this.activeMode || (this.isTailDraining ? this.drainingMode : null);
    const res = evaluateAnthemTargetPhase(cfg, mode, this.isTailDraining, this.drainMinTargetPhase);
    this.drainMinTargetPhase = res.nextDrainMinTargetPhase;
    return res.targetPhase;
  }

  applyTunerConfig(cfg: Partial<SpatialAudioTunerConfig>): void {
    this._ensureBusChain(false);
    this.blend = evaluateSpatialBezierBlend(this.linearPhase, cfg);
    const gain = computeAnthemOutputGain(this.isActiveOrDraining());
    this.anthemChain?.applyBlend(this.blend, cfg, gain);
  }

  stepTransition(
    dt: number,
    now: number,
    maxDelta: number,
    cfg: Partial<SpatialAudioTunerConfig>
  ): void {
    const store = useSpatialAudioStore.getState();
    const targetAnthemU = this._computeTargetPhase(cfg);
    const next = stepSpatialBezierTransition(this.linearPhase, targetAnthemU, maxDelta, cfg);
    this.linearPhase = next.linearPhase;
    this.blend = next.blend;

    const gain = computeAnthemOutputGain(this.isActiveOrDraining());
    this.anthemChain?.applyBlend(this.blend, cfg, gain);
    if (this.isTailDraining) {
      const done =
        !this.anthemChain ||
        isWindowFocusAudioMuted(this.windowUnfocusedMuted) ||
        stepAnthemTailDrainSilenceCheck(
          this.anthemChain,
          this.audioContext,
          cfg,
          this.drainTiming,
          now,
          dt,
          targetAnthemU,
          this.linearPhase
        );
      if (done) this.completeTailDrain();
    }

    if (
      Math.abs(store.anthemLinearPhase - this.linearPhase) > 0.005 ||
      Math.abs(store.anthemBlend - this.blend) > 0.005
    ) {
      store.setAnthemTransitionState(this.linearPhase, this.blend);
    }
  }

  private async _loadAndMount(
    anthemId: string,
    mode: AnthemPlaybackMode,
    resetChainFirst: boolean,
    onEndedExtra?: () => void
  ): Promise<boolean> {
    const token = ++this.previewToken;
    this.cancelTailDrain();
    this.stopCurrentSource();
    if (!resetChainFirst) this.isGoalAnthemLoading = true;

    const store = useSpatialAudioStore.getState();
    const resolved = this.resolveAnthemDefinition(anthemId);
    const chain = resolved?.file ? this._ensureBusChain(true) : null;
    const ctx = this.audioContext;
    if (!resolved?.file || !ctx || !chain) {
      if (resetChainFirst) chain?.resetAndSilence(store.tunerConfig);
      return true;
    }
    if (resetChainFirst) chain.resetAndSilence(store.tunerConfig);
    const buffer = await this.loadAnthemBuffer(resolved);
    if (token !== this.previewToken || !buffer) return token === this.previewToken;

    this.isGoalAnthemLoading = false;
    if (!resetChainFirst) useSpatialAudioStore.getState().setActiveGoalAnthemId(resolved.id);

    const mountedId = resetChainFirst ? anthemId : resolved.id;
    const curStore = useSpatialAudioStore.getState();
    const cfg = curStore.tunerConfig || {};
    chain.resetAndSilence(cfg);

    this.linearPhase = this._computeTargetPhase(cfg, mode);
    this.blend = evaluateSpatialBezierBlend(this.linearPhase, cfg);
    chain.applyBlend(this.blend, cfg, computeAnthemOutputGain(true, true), true);
    curStore.setAnthemTransitionState(this.linearPhase, this.blend);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(chain.input);
    this.activeSource = src;
    this.activeMode = mode;
    this.activeAnthemId = mountedId;

    src.onended = () => {
      if (this.activeSource === src) {
        const finishedId = this.activeAnthemId || mountedId;
        const finishedMode = this.activeMode || mode;
        this.stopCurrentSource();
        onEndedExtra?.();
        this.beginTailDrain(finishedMode, finishedId);
      }
    };

    try {
      src.start(ctx.currentTime);
      return false;
    } catch {
      this.stopCurrentSource();
      if (resetChainFirst) {
        this.anthemChain?.resetAndSilence(useSpatialAudioStore.getState().tunerConfig || {});
      }
      return true;
    }
  }

  async startPreview(
    anthemId: string,
    source: AnthemPreviewSource = 'garage-preview'
  ): Promise<void> {
    const previewMode: AnthemPlaybackMode =
      source === 'tuner-audition' ? 'tuner-audition' : 'garage-preview';
    useSpatialAudioStore.getState().setActiveGoalAnthemId(null);
    this.onStateChangedFn?.();

    const clearPreview = () => useSpatialAudioStore.getState().setPreviewingAnthemId(null);
    if (await this._loadAndMount(anthemId, previewMode, true, clearPreview)) clearPreview();
  }

  stopPreview(): void {
    this.previewToken++;
    const store = useSpatialAudioStore.getState();
    if (store.previewingAnthemId !== null) store.setPreviewingAnthemId(null);
    if (this.activeMode === 'garage-preview' || this.activeMode === 'tuner-audition') {
      const stoppedId = this.activeAnthemId;
      const stoppedMode = this.activeMode;
      this.stopCurrentSource();
      this.beginTailDrain(stoppedMode, stoppedId);
      return;
    }
    if (this.activeMode === null && !this.isTailDraining) this._resetPhaseAndChain();
    this.onStateChangedFn?.();
  }

  async startGoalReplayAnthem(
    anthemId: string | null = useSpatialAudioStore.getState().selectedAnthem
  ): Promise<void> {
    if (!anthemId || anthemId === 'none') {
      this.isGoalAnthemLoading = false;
      this.onStateChangedFn?.();
      return;
    }
    useSpatialAudioStore.getState().setPreviewingAnthemId(null);

    if (await this._loadAndMount(anthemId, 'goal-replay', false)) {
      this.isGoalAnthemLoading = false;
      useSpatialAudioStore.getState().setActiveGoalAnthemId(null);
      this.onStateChangedFn?.();
    }
  }
}
