/**
 * ReplayTimelineController.ts
 * Unified 256MB WASM Replay Buffer & JS RingBuffer Timeline Scrubber and Goal Replay Controller.
 */

import { type ReplayRingBuffer } from './ReplayRingBuffer.ts';
import {
  REPLAY_PLAYBACK_SPEEDS,
  resolveTimelineFrameEntryAt,
  resolveTimelineFrameBufferAt,
  resolveTimelineFrameBufferByOffset,
} from './ReplayPlaybackState.ts';
import { applyReplayFrameToEngine } from './ReplayFrameInterpolator.ts';
import { ReplayDirectorCameraSubController } from './ReplayDirectorCameraSubController.ts';
import {
  buildSessionCurrentFrameDiagnosticSnapshot,
  evaluateSessionDiagnosticPatternPayload,
  buildSessionDiagnosticPatternCsv,
  buildSessionFrameWindowDiagnostic,
  applyImportedDiagnosticPatternToSession,
  type ReplayDiagnosticSessionContext,
} from './ReplayDiagnosticPatternController.ts';
import {
  createInitialReplaySessionState,
  type DirectorCameraPose,
  type DirectorCameraState,
  type ReplaySessionState,
  type ReplaySessionInitOptions,
  type ImportedDiagnosticPatternInput,
  type ImportedDiagnosticLoadOptions,
  type ReplayTimelineFrameEntry,
  type ReplayFrameCarControlEntry,
  type ReplayInterpolatorPort,
  type ReplayPhysicsEnginePort,
  type DirectorDiagnosticPatternOptions,
} from './replayDirectorStateTypes.ts';
import {
  buildTimelineReplaySessionInitState,
  buildRetainedReplaySessionState,
  buildClonedRetainedReplaySessionState,
  buildEndedReplaySessionState,
  buildClearedRetainedReplaySessionState,
  executeReplayPlaybackStep,
  type ReplayPlaybackStepResult,
} from './ReplayDirectorStatePipeline.ts';
import {
  resolveSessionTouchLookahead,
  computeSessionDramaticSlowMo,
  type ResolvedTouchLookahead,
} from './replayTouchLookaheadPipeline.ts';
import {
  analyzeAndSyncReplayTouchTimelineState,
  appendStreamedReplayFrameToState,
  type ReplayTouchAnalysisConfig,
} from './ReplayTouchTimelineAnalyzer.ts';
import type { SuffixDirectorTrajectoryPlan } from './ReplayDirectorTrajectoryPlanner.ts';
import {
  getActiveReplayTimelineController,
  setActiveReplayTimelineController,
  notifyActiveReplayTimelineController,
  markReplayTimelineControllerRetained,
} from '../game/runtimeUiPort.ts';
import type { DirectorPatternSerializerOptions } from './ReplayDirectorPatternSerializer.ts';

export type {
  ReplayTimelineFrameEntry,
  ReplaySessionState,
  DirectorCameraState,
  ReplayPlaybackStepResult,
};

export interface ReplayTimelineControllerOptions {
  engine?: ReplayPhysicsEnginePort | null;
  ringBuffer?: ReplayRingBuffer | null;
}

export interface ReplayPreviewSessionStartOptions {
  loop?: boolean;
  startPaused?: boolean;
  restart?: boolean;
}

export class ReplayTimelineController {
  public engine: ReplayPhysicsEnginePort | null;
  public ringBuffer: ReplayRingBuffer | null;
  public sessionState: ReplaySessionState;
  public readonly directorCamera: ReplayDirectorCameraSubController;

  constructor(options: ReplayTimelineControllerOptions = {}) {
    this.engine = options.engine || null;
    this.ringBuffer = options.ringBuffer || null;
    this.sessionState = createInitialReplaySessionState();
    this.directorCamera = new ReplayDirectorCameraSubController();
  }

  public get directorCameraState(): DirectorCameraState {
    return this.directorCamera.state;
  }
  public set directorCameraState(val: DirectorCameraState) {
    this.directorCamera.state = val;
  }

  private _patch(patch: Partial<ReplaySessionState>): void {
    this.sessionState = { ...this.sessionState, ...patch };
  }

  private _diagnosticContext(): ReplayDiagnosticSessionContext {
    return {
      sessionState: this.sessionState,
      directorCamera: this.directorCamera,
      ringBuffer: this.ringBuffer,
      engine: this.engine,
    };
  }

  attach(engine: ReplayPhysicsEnginePort | null, ringBuffer: ReplayRingBuffer | null = null): this {
    this.engine = engine || this.engine;
    if (ringBuffer) this.ringBuffer = ringBuffer;
    return this;
  }

  getTotalRecordedFrames(): number {
    if (this.ActiveWindowCount > 0) return this.ActiveWindowCount;
    const wasmCount = this.engine?.getReplayFrameCount?.() ?? 0;
    return wasmCount > 0 ? wasmCount : (this.ringBuffer?.size ?? 0);
  }

  get frames(): ReplayTimelineFrameEntry[] {
    return this.sessionState.activeFrames;
  }
  get ActiveWindowCount(): number {
    return Array.isArray(this.sessionState.activeFrames)
      ? this.sessionState.activeFrames.length
      : 0;
  }

  get currentFrameIndex(): number {
    const total = this.getTotalRecordedFrames();
    return total <= 0
      ? 0
      : Math.max(0, Math.min(total - 1, Math.floor(this.sessionState.cursorFloat)));
  }

  get progress(): number {
    const total = this.getTotalRecordedFrames();
    return total <= 1 ? 0 : Math.max(0, Math.min(1, this.sessionState.cursorFloat / (total - 1)));
  }

  invalidateCachedDirectorPlans(disableCsv = false): void {
    const s = this.sessionState;
    this._patch({
      useRecordedCsvCamera:
        disableCsv && s.isImportedPreview && s.useRecordedCsvCamera
          ? false
          : s.useRecordedCsvCamera,
      cachedSuffixCameraPlan: null,
      cachedSmoothnessSummary: null,
      cachedAnomalyPeaks: null,
    });
    this.refreshCurrentFrameDirectorPose();
  }

  setRecordedCsvCameraMode(useCsv: boolean): boolean {
    this._patch({
      useRecordedCsvCamera: Boolean(useCsv),
      cachedSmoothnessSummary: null,
      cachedAnomalyPeaks: null,
    });
    this.refreshCurrentFrameDirectorPose();
    notifyActiveReplayTimelineController();
    return this.sessionState.useRecordedCsvCamera;
  }

  _analyzeReplayTouchTimeline(opts: ReplayTouchAnalysisConfig = {}): void {
    analyzeAndSyncReplayTouchTimelineState(this.sessionState, this.directorCamera, opts);
  }

  ensureSuffixCameraPlan(): SuffixDirectorTrajectoryPlan | null {
    return this.directorCamera.ensureSuffixCameraPlanForSession(this.sessionState);
  }

  resolveTouchLookaheadForFrame(frameIdx: number, fallback = 0): ResolvedTouchLookahead {
    return resolveSessionTouchLookahead(
      this.sessionState,
      this.directorCamera.state,
      this.ensureSuffixCameraPlan(),
      frameIdx,
      fallback
    );
  }

  resolveFocusCarForFrame(frameIdx: number, fallback = 0): number {
    return this.resolveTouchLookaheadForFrame(frameIdx, fallback).primaryCarIndex;
  }

  computeDramaticSlowMoFactor(cursor: number, opts: { ignoreScrubState?: boolean } = {}): number {
    return computeSessionDramaticSlowMo(this.sessionState, this.directorCamera.state, cursor, opts);
  }

  beginReplaySession(options: ReplaySessionInitOptions = {}): number {
    const s = buildTimelineReplaySessionInitState({
      ringBuffer: this.ringBuffer,
      engine: this.engine,
      options,
      currentRetainedReplaySeq: this.sessionState.retainedReplaySeq,
    });
    this.sessionState = s;
    this.directorCamera.reset(s.isImportedPreview && s.useRecordedCsvCamera, false, false);
    this._analyzeReplayTouchTimeline(options);
    this.directorCamera.applyPostAnalysisOverrides(options);
    if (!s.isNetworkStreamed && s.activeFrames.length > 0) this.ensureSuffixCameraPlan();
    if (s.hasRetainedReplay) markReplayTimelineControllerRetained(this);
    setActiveReplayTimelineController(this);
    return s.activeFrames.length;
  }

  retainReplaySessionFrames(options: ReplaySessionInitOptions = {}): number {
    const next = buildRetainedReplaySessionState(this.sessionState, options);
    if (next.activeFrames.length === 0) return 0;
    this.sessionState = next;
    this.directorCamera.reset(false, next.isPaused, next.isScrubbing);
    this._analyzeReplayTouchTimeline(options);
    this.ensureSuffixCameraPlan();
    markReplayTimelineControllerRetained(this);
    setActiveReplayTimelineController(this);
    return next.activeFrames.length;
  }

  copyRetainedReplayFrom(
    srcCtrl:
      | {
          sessionState?: ReplaySessionState;
          directorCamera?: ReplayDirectorCameraSubController;
          directorCameraState?: DirectorCameraState;
        }
      | null
      | undefined
  ): number {
    const src = srcCtrl?.sessionState;
    if (
      !srcCtrl ||
      srcCtrl === this ||
      !src ||
      !Array.isArray(src.activeFrames) ||
      src.activeFrames.length === 0
    )
      return 0;
    this.sessionState = buildClonedRetainedReplaySessionState({
      currentSessionState: this.sessionState,
      sourceSessionState: src,
    });
    this.directorCamera.cloneFrom(srcCtrl.directorCamera?.state || srcCtrl.directorCameraState);
    return this.sessionState.activeFrames.length;
  }

  loadImportedDiagnosticPattern(
    parsed: ImportedDiagnosticPatternInput | null | undefined,
    opts: ImportedDiagnosticLoadOptions = {}
  ): number {
    const nextState = applyImportedDiagnosticPatternToSession(
      this._diagnosticContext(),
      parsed,
      opts
    );
    if (!nextState) return 0;
    this.sessionState = nextState;
    this.refreshCurrentFrameDirectorPose();
    markReplayTimelineControllerRetained(this);
    setActiveReplayTimelineController(this);
    notifyActiveReplayTimelineController();
    return nextState.activeFrames.length;
  }

  startPreviewSession(opts: ReplayPreviewSessionStartOptions = {}): boolean {
    const s = this.sessionState;
    if (!Array.isArray(s.activeFrames) || s.activeFrames.length === 0) return false;
    const isPaused = Boolean(opts.startPaused);
    this._patch({
      isActive: true,
      isPersistent: true,
      isLoopingPreview: opts.loop !== false,
      isPaused,
      isScrubbing: false,
      lastDispatchedFrameIndex: -1,
      cursorFloat:
        Boolean(opts.restart) || s.cursorFloat >= s.activeFrames.length - 1 ? 0 : s.cursorFloat,
    });
    this.directorCamera.resetSmoothing();
    this.directorCamera.setPauseAndScrubState(isPaused, false);
    this.refreshCurrentFrameDirectorPose();
    const buf = this.getFrameBufferByIndex(this.currentFrameIndex);
    if (buf && this.engine) applyReplayFrameToEngine(this.engine, buf);
    setActiveReplayTimelineController(this);
    notifyActiveReplayTimelineController();
    return true;
  }

  refreshCurrentFrameDirectorPose(): DirectorCameraPose | null {
    return this.directorCamera.refreshSessionDirectorPose(
      this.sessionState,
      this.getTotalRecordedFrames(),
      (idx) => this.getFrameEntryByIndex(idx),
      (idx) => this.getFrameBufferByIndex(idx),
      (idx, fb) => this.resolveTouchLookaheadForFrame(idx, fb)
    );
  }

  appendStreamedReplayFrame(
    snap: Float32Array | number[],
    tick = 0,
    controls: ReplayFrameCarControlEntry[] | null = null
  ): number {
    const count = appendStreamedReplayFrameToState(
      this.sessionState,
      this.directorCamera,
      snap,
      tick,
      controls
    );
    if (count > 0) {
      markReplayTimelineControllerRetained(this);
      setActiveReplayTimelineController(this);
    }
    return count;
  }

  endReplaySession(): void {
    this.sessionState = buildEndedReplaySessionState(this.sessionState, this.directorCamera);
    if (this.sessionState.hasRetainedReplay) markReplayTimelineControllerRetained(this);
    setActiveReplayTimelineController(this);
    notifyActiveReplayTimelineController();
  }

  clearRetainedReplay(): void {
    this.sessionState = buildClearedRetainedReplaySessionState(
      this.sessionState,
      this.directorCamera
    );
    if (getActiveReplayTimelineController() === this) notifyActiveReplayTimelineController();
  }

  getFrameEntryByIndex(idx: number): ReplayTimelineFrameEntry | null {
    return resolveTimelineFrameEntryAt(this.sessionState.activeFrames, this.ringBuffer, idx);
  }

  getFrameBufferByIndex(idx: number): Float32Array | null {
    return resolveTimelineFrameBufferAt(
      this.sessionState.activeFrames,
      this.engine,
      this.ringBuffer,
      idx
    );
  }

  getFrameBufferByOffset(ticksAgo = 0): Float32Array | null {
    return resolveTimelineFrameBufferByOffset(
      this.sessionState.activeFrames,
      this.engine,
      this.ringBuffer,
      ticksAgo
    );
  }

  seekToIndex(
    frameIndex: number,
    interpolator: ReplayInterpolatorPort | null = null
  ): Float32Array | null {
    const total = this.getTotalRecordedFrames();
    if (total <= 0) return null;
    const clamped = Math.max(0, Math.min(total - 1, Number(frameIndex) || 0));
    const targetIdx = Math.floor(clamped);
    this._patch({
      cursorFloat: clamped,
      lastDispatchedFrameIndex: targetIdx,
      ...(this.sessionState.isActive ? { isScrubbing: true, isPersistent: true } : {}),
    });
    this.refreshCurrentFrameDirectorPose();
    const buf = this.getFrameBufferByIndex(targetIdx);
    if (this.sessionState.isActive && buf && this.engine)
      applyReplayFrameToEngine(this.engine, buf, interpolator);
    setActiveReplayTimelineController(this);
    notifyActiveReplayTimelineController();
    return buf;
  }

  seekByOffset(ticksAgo = 0, interp: ReplayInterpolatorPort | null = null): Float32Array | null {
    const total = this.getTotalRecordedFrames();
    return total <= 0
      ? null
      : this.seekToIndex(
          Math.max(0, Math.min(total - 1, total - 1 - Math.max(0, Math.floor(ticksAgo)))),
          interp
        );
  }

  seekToNormalized(p01: number, interp: ReplayInterpolatorPort | null = null): Float32Array | null {
    const total = this.getTotalRecordedFrames();
    return total <= 0
      ? null
      : this.seekToIndex(Math.max(0, Math.min(1, Number(p01) || 0)) * (total - 1), interp);
  }

  setPaused(paused: boolean): boolean {
    const isPaused = Boolean(paused),
      s = this.sessionState;
    this._patch({
      isPaused,
      isPersistent: isPaused ? true : s.isPersistent,
      isScrubbing: isPaused ? s.isScrubbing : false,
    });
    this.directorCamera.setPauseAndScrubState(isPaused, s.isScrubbing);
    setActiveReplayTimelineController(this);
    notifyActiveReplayTimelineController();
    return isPaused;
  }

  togglePause(): boolean {
    const s = this.sessionState;
    if (!s.isPersistent) {
      this._patch({ isPersistent: true });
      return this.setPaused(true);
    }
    const total = this.getTotalRecordedFrames();
    if (s.isPaused && total > 1 && s.cursorFloat >= total - 1.05) {
      this._patch({ cursorFloat: 0, lastDispatchedFrameIndex: -1 });
      this.directorCamera.resetSmoothing();
    }
    return this.setPaused(!s.isPaused);
  }

  setPlaybackSpeed(speed: number): number {
    const num = Number(speed);
    if (Number.isFinite(num) && num > 0)
      this._patch({ playbackSpeed: Math.max(0.1, Math.min(4.0, num)) });
    notifyActiveReplayTimelineController();
    return this.sessionState.playbackSpeed;
  }

  cyclePlaybackSpeed(): number {
    const idx = REPLAY_PLAYBACK_SPEEDS.findIndex(
      (s: number) => Math.abs(s - this.sessionState.playbackSpeed) < 0.01
    );
    this._patch({
      playbackSpeed: REPLAY_PLAYBACK_SPEEDS[(idx + 1) % REPLAY_PLAYBACK_SPEEDS.length],
    });
    notifyActiveReplayTimelineController();
    return this.sessionState.playbackSpeed;
  }

  stepPlayback(
    dt: number,
    interpolator: ReplayInterpolatorPort | null = null,
    applyToEngine = false
  ): ReplayPlaybackStepResult {
    const total = this.getTotalRecordedFrames();
    if (total <= 0)
      return {
        frame: null,
        frameIndex: 0,
        totalFrames: 0,
        progress: 0,
        isFinished: true,
        incidents: [],
        audioEvents: [],
      };
    setActiveReplayTimelineController(this);
    const res = executeReplayPlaybackStep({
      totalFrames: total,
      dtSeconds: dt,
      interpolator,
      applyToEngine,
      engine: this.engine,
      sessionState: this.sessionState,
      directorCamera: this.directorCamera,
      getFrameEntryByIndex: (idx) => this.getFrameEntryByIndex(idx),
      getFrameBufferByIndex: (idx) => this.getFrameBufferByIndex(idx),
      ensureSuffixCameraPlan: () => this.ensureSuffixCameraPlan(),
      resolveTouchLookaheadForFrame: (idx, fb) => this.resolveTouchLookaheadForFrame(idx, fb),
      computeDramaticSlowMoFactor: (c, opts) => this.computeDramaticSlowMoFactor(c, opts),
    });
    if (res.nextSessionState) this.sessionState = res.nextSessionState;
    return res;
  }

  getCurrentFrameDiagnosticSnapshot() {
    return buildSessionCurrentFrameDiagnosticSnapshot(this._diagnosticContext());
  }
  buildDirectorDiagnosticPatternPayload(opts?: DirectorDiagnosticPatternOptions) {
    return evaluateSessionDiagnosticPatternPayload(this._diagnosticContext(), opts);
  }
  buildDirectorDiagnosticPatternCsv(opts?: DirectorPatternSerializerOptions): string {
    return buildSessionDiagnosticPatternCsv(this._diagnosticContext(), opts);
  }
  buildDirectorFrameWindowDiagnostic(radius = 15) {
    return buildSessionFrameWindowDiagnostic(this._diagnosticContext(), radius);
  }
}

export default ReplayTimelineController;
