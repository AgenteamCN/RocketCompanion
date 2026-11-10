/**
 * ReplayDirectorStatePipeline.ts
 * Pure TypeScript pipeline for ReplaySessionState value transitions
 * and fractional-tick playback stepping.
 */

import {
  REPLAY_TICK_RATE,
  type ReplaySignalEntry,
  type ReplayAudioCue,
} from './ReplayRingBuffer.ts';
import { applyReplayFrameToEngine } from './ReplayFrameInterpolator.ts';
import { DEFAULT_GOAL_REPLAY_TICKS, extractGoalReplayFrames } from './ReplayPlaybackState.ts';
import type { ReplayDirectorCameraSubController } from './ReplayDirectorCameraSubController.ts';
import {
  analyzeAndSyncReplayTouchTimelineState,
  type ResolvedTouchLookahead,
} from './ReplayTouchTimelineAnalyzer.ts';
import type { SuffixDirectorTrajectoryPlan } from './ReplayDirectorTrajectoryPlanner.ts';
import type {
  ReplayCarRosterEntry,
  ReplayIncidentEntry,
  ReplayInterpolatorPort,
  ReplayPhysicsEnginePort,
  ReplaySessionInitOptions,
  ReplaySessionState,
  ReplayTimelineFrameEntry,
  RetainedReplaySnapshotCloneInput,
  TimelineReplaySessionInitInput,
} from './replayDirectorStateTypes.ts';

export type {
  DirectorCameraPose,
  DirectorCameraState,
  ImportedDiagnosticLoadOptions,
  ImportedDiagnosticPatternInput,
  RefreshDirectorPoseInput,
  ReplayCarRosterEntry,
  ReplayFrameCarControlEntry,
  ReplayIncidentEntry,
  ReplayInterpolatorPort,
  ReplayPhysicsEnginePort,
  ReplaySessionInitOptions,
  ReplaySessionState,
  ReplayTimelineFrameEntry,
  RetainedReplaySnapshotCloneInput,
  StepDirectorCameraSyncInput,
  StepDirectorCameraSyncResult,
  TimelineReplaySessionInitInput,
} from './replayDirectorStateTypes.ts';

export interface ReplayPlaybackStepResult {
  frame: Float32Array | null;
  prevFrame?: Float32Array | null;
  currFrame?: Float32Array | null;
  alpha?: number;
  frameIndex: number;
  totalFrames: number;
  progress: number;
  slowMoFactor?: number;
  activeTouchCarIndex?: number;
  isFinished: boolean;
  incidents: ReplayIncidentEntry[];
  signals?: ReplaySignalEntry[];
  audioEvents: ReplayAudioCue[];
  nextSessionState?: ReplaySessionState;
}

export interface ExecuteReplayPlaybackStepInput {
  totalFrames: number;
  dtSeconds: number;
  interpolator: ReplayInterpolatorPort | null;
  applyToEngine: boolean;
  engine: ReplayPhysicsEnginePort | null;
  sessionState: ReplaySessionState;
  directorCamera: ReplayDirectorCameraSubController;
  getFrameEntryByIndex: (index: number) => ReplayTimelineFrameEntry | null;
  getFrameBufferByIndex: (index: number) => Float32Array | null;
  ensureSuffixCameraPlan: () => SuffixDirectorTrajectoryPlan | null;
  resolveTouchLookaheadForFrame: (
    frameIdx: number,
    fallbackScorerCarIndex: number
  ) => ResolvedTouchLookahead;
  computeDramaticSlowMoFactor: (
    cursorFloat: number,
    options?: { ignoreScrubState?: boolean }
  ) => number;
}

const cloneCarRoster = (entries: ReadonlyArray<ReplayCarRosterEntry> | null | undefined) =>
  Array.isArray(entries) && entries.length > 0 ? entries.map((c) => ({ ...c })) : null;

export function applyStepFrameAndControlsToEngine(
  engine: ReplayPhysicsEnginePort,
  currFrame: Float32Array,
  prevFrame: Float32Array | null,
  alpha: number,
  interpolator: ReplayInterpolatorPort | null,
  currEntry: ReplayTimelineFrameEntry | null
): void {
  applyReplayFrameToEngine(engine, currFrame, interpolator, prevFrame, alpha);
  const controls = currEntry?.acknowledgedControls || currEntry?.controls || null;
  const setControlsFn =
    typeof engine.setControls === 'function'
      ? engine.setControls.bind(engine)
      : typeof engine.setCarControls === 'function'
        ? engine.setCarControls.bind(engine)
        : null;
  if (Array.isArray(controls) && setControlsFn) {
    for (let c = 0; c < controls.length; c++) {
      if (controls[c]) setControlsFn(c, controls[c]);
    }
  }
}

export function collectDispatchedEventsInWindow(
  getFrameEntryByIndex: (index: number) => ReplayTimelineFrameEntry | null,
  lastDispatchedFrameIndex: number,
  baseIdx: number
): {
  incidents: ReplayIncidentEntry[];
  audioEvents: ReplayAudioCue[];
  signals: ReplaySignalEntry[];
} {
  const incidents: ReplayIncidentEntry[] = [];
  const audioEvents: ReplayAudioCue[] = [];
  const signals: ReplaySignalEntry[] = [];
  const startIdx = Math.max(0, lastDispatchedFrameIndex + 1, baseIdx - 10);
  for (let idx = startIdx; idx <= baseIdx; idx++) {
    const entry = getFrameEntryByIndex(idx);
    if (!entry) continue;
    if (entry.incidents?.length) incidents.push(...entry.incidents);
    if (entry.audioEvents?.length) audioEvents.push(...entry.audioEvents);
    if (entry.signals?.length) signals.push(...entry.signals);
  }
  return { incidents, audioEvents, signals };
}

export function buildTimelineReplaySessionInitState(
  input: TimelineReplaySessionInitInput
): ReplaySessionState {
  const { ringBuffer, engine, options = {}, currentRetainedReplaySeq } = input;
  const durationTicks = options.durationTicks ?? DEFAULT_GOAL_REPLAY_TICKS;
  const activeFrames: ReplayTimelineFrameEntry[] =
    Array.isArray(options.frames) && options.frames.length > 0
      ? options.frames
      : extractGoalReplayFrames({ ringBuffer, engine, durationTicks });

  return {
    activeFrames,
    cursorFloat: 0,
    isPaused: false,
    isPersistent: Boolean(options.isPersistent),
    playbackSpeed: 1.0,
    isScrubbing: false,
    scoringTeam: options.scoringTeam ?? 0,
    scorerCarIndex:
      typeof options.scorerCarIndex === 'number' && options.scorerCarIndex >= 0
        ? options.scorerCarIndex
        : 0,
    carTeamResolver: typeof options.carTeamResolver === 'function' ? options.carTeamResolver : null,
    isActive: true,
    isNetworkStreamed: Boolean(options.isNetworkStreamed),
    expectedDurationTicks: Math.max(1, Math.floor(durationTicks)),
    streamedFramesReceived: 0,
    hasRetainedReplay: activeFrames.length > 0,
    retainedReplaySeq: currentRetainedReplaySeq,
    isImportedPreview: Boolean(options.isImportedPreview),
    importedFileName: options.importedFileName || null,
    importedSummary: options.importedSummary || null,
    importedAnomalyPeaks: options.importedAnomalyPeaks || null,
    importedCarEntries: null,
    carEntries: cloneCarRoster(options.carEntries),
    cachedSuffixCameraPlan: null,
    cachedSmoothnessSummary: null,
    cachedAnomalyPeaks: null,
    useRecordedCsvCamera: Boolean(options.useRecordedCsvCamera),
    isLoopingPreview: Boolean(options.isLoopingPreview),
    disableSlowMo: Boolean(options.disableSlowMo),
    watchAllTouches: Boolean(options.watchAllTouches),
    goalLineFrameIdx: -1,
    reboundEvents: [],
    lateralBias: 1.0,
    lastDispatchedFrameIndex: -1,
    smoothedEye: null,
    smoothedTarget: null,
  };
}

export function buildRetainedReplaySessionState(
  currentState: ReplaySessionState,
  options: ReplaySessionInitOptions = {}
): ReplaySessionState {
  const frames: ReplayTimelineFrameEntry[] = Array.isArray(options.frames) ? options.frames : [];
  return {
    ...currentState,
    activeFrames: frames,
    expectedDurationTicks: frames.length,
    scoringTeam: options.scoringTeam ?? 0,
    scorerCarIndex:
      typeof options.scorerCarIndex === 'number' && options.scorerCarIndex >= 0
        ? options.scorerCarIndex
        : 0,
    carTeamResolver: typeof options.carTeamResolver === 'function' ? options.carTeamResolver : null,
    hasRetainedReplay: true,
    isImportedPreview: false,
    importedFileName: null,
    importedSummary: null,
    importedAnomalyPeaks: null,
    useRecordedCsvCamera: false,
    isNetworkStreamed: false,
    cursorFloat: 0,
    lastDispatchedFrameIndex: -1,
    cachedSuffixCameraPlan: null,
    cachedSmoothnessSummary: null,
    cachedAnomalyPeaks: null,
    carEntries: cloneCarRoster(options.carEntries) || currentState.carEntries,
  };
}

export function buildClonedRetainedReplaySessionState(
  input: RetainedReplaySnapshotCloneInput
): ReplaySessionState {
  const { currentSessionState, sourceSessionState: src } = input;
  const importedCarEntries = cloneCarRoster(src.importedCarEntries || src.carEntries);
  return {
    ...currentSessionState,
    activeFrames: src.activeFrames.slice(),
    expectedDurationTicks: src.activeFrames.length,
    scoringTeam: src.scoringTeam ?? 0,
    scorerCarIndex: src.scorerCarIndex ?? 0,
    carTeamResolver: src.carTeamResolver || null,
    hasRetainedReplay: true,
    retainedReplaySeq: src.retainedReplaySeq || currentSessionState.retainedReplaySeq,
    isImportedPreview: Boolean(src.isImportedPreview),
    importedFileName: src.importedFileName || null,
    importedSummary: src.importedSummary || null,
    importedAnomalyPeaks: src.importedAnomalyPeaks || null,
    importedCarEntries,
    carEntries: cloneCarRoster(src.carEntries) || importedCarEntries,
    useRecordedCsvCamera: Boolean(src.useRecordedCsvCamera),
    cursorFloat: Math.max(
      0,
      Math.min(src.activeFrames.length - 1, Math.floor(src.cursorFloat ?? 0))
    ),
    cachedSuffixCameraPlan: src.cachedSuffixCameraPlan || null,
    cachedSmoothnessSummary: src.cachedSmoothnessSummary || null,
    cachedAnomalyPeaks: src.cachedAnomalyPeaks || null,
  };
}

export function buildEndedReplaySessionState(
  currentState: ReplaySessionState,
  directorCamera: ReplayDirectorCameraSubController
): ReplaySessionState {
  const wasNetworkStreamed = Boolean(currentState.isNetworkStreamed);
  const hasRetained =
    Array.isArray(currentState.activeFrames) && currentState.activeFrames.length > 0;
  Object.assign(currentState, {
    isActive: false,
    isPaused: false,
    isPersistent: false,
    isScrubbing: false,
    isLoopingPreview: false,
    disableSlowMo: false,
    isNetworkStreamed: false,
    hasRetainedReplay: hasRetained,
    lastDispatchedFrameIndex: -1,
    smoothedEye: null,
    smoothedTarget: null,
    cursorFloat: hasRetained
      ? Math.max(
          0,
          Math.min(currentState.activeFrames.length - 1, Math.floor(currentState.cursorFloat))
        )
      : 0,
  });
  if (hasRetained && wasNetworkStreamed) {
    analyzeAndSyncReplayTouchTimelineState(currentState, directorCamera, {
      carTeamResolver: currentState.carTeamResolver,
      scorerCarIndex: currentState.scorerCarIndex,
    });
  }
  directorCamera.resetSmoothing();
  directorCamera.setPauseAndScrubState(false, false);
  return currentState;
}

export function buildClearedRetainedReplaySessionState(
  currentState: ReplaySessionState,
  directorCamera: ReplayDirectorCameraSubController
): ReplaySessionState {
  directorCamera.clearRetained();
  return Object.assign(currentState, {
    activeFrames: [],
    hasRetainedReplay: false,
    retainedReplaySeq: 0,
    isImportedPreview: false,
    importedFileName: null,
    importedSummary: null,
    cachedSuffixCameraPlan: null,
    useRecordedCsvCamera: false,
    isLoopingPreview: false,
    streamedFramesReceived: 0,
    cursorFloat: 0,
  });
}

export function executeReplayPlaybackStep(
  input: ExecuteReplayPlaybackStepInput
): ReplayPlaybackStepResult {
  const {
    totalFrames: total,
    dtSeconds,
    interpolator,
    applyToEngine,
    engine,
    sessionState,
    directorCamera,
    getFrameEntryByIndex,
    getFrameBufferByIndex,
    ensureSuffixCameraPlan,
    resolveTouchLookaheadForFrame,
    computeDramaticSlowMoFactor,
  } = input;

  let isPaused = sessionState.isPaused;
  const isScrubbing = isPaused ? sessionState.isScrubbing : false;
  const isFollowingLiveStream =
    sessionState.isNetworkStreamed &&
    sessionState.streamedFramesReceived > 0 &&
    !isPaused &&
    !isScrubbing &&
    Math.abs(sessionState.playbackSpeed - 1.0) <= 0.01;

  const currentEntry = getFrameEntryByIndex(Math.floor(sessionState.cursorFloat));
  const useCsvPose = Boolean(
    sessionState.isImportedPreview &&
    sessionState.useRecordedCsvCamera &&
    currentEntry?.recordedCsvRow
  );

  const slowMoFactor = useCsvPose
    ? Math.max(0.25, Math.min(1.0, currentEntry?.recordedCsvRow?.slow_mo_factor ?? 1.0))
    : computeDramaticSlowMoFactor(sessionState.cursorFloat);

  let cursorFloat = isFollowingLiveStream
    ? Math.max(0, total - 1)
    : !isPaused
      ? Math.min(
          total - 1,
          sessionState.cursorFloat +
            Math.max(0, dtSeconds * REPLAY_TICK_RATE * sessionState.playbackSpeed * slowMoFactor)
        )
      : sessionState.cursorFloat;

  const baseIdx = Math.max(0, Math.min(total - 1, Math.floor(cursorFloat)));
  const nextIdx = Math.min(total - 1, baseIdx + 1);
  const alpha = Math.max(0, Math.min(1, cursorFloat - baseIdx));

  const prevEntry = getFrameEntryByIndex(baseIdx);
  const nextEntry = getFrameEntryByIndex(nextIdx) || prevEntry;
  const prevFrame = getFrameBufferByIndex(baseIdx);
  const currFrame = getFrameBufferByIndex(nextIdx) || prevFrame;
  const suffixPlan = !useCsvPose ? ensureSuffixCameraPlan() : null;

  const { embeddedTelemetry: embedded, resolvedScorerCarIndex } =
    directorCamera.syncForPlaybackStep({
      baseIdx,
      nextIdx,
      alpha,
      useCsvPose,
      cursorFloat,
      isPaused,
      isScrubbing,
      prevEntry,
      nextEntry,
      currFrame,
      suffixPlan,
      scorerCarIndex: sessionState.scorerCarIndex,
      resolveTouchLookaheadForFrame: (idx, fb) => resolveTouchLookaheadForFrame(idx, fb),
    });

  if (
    (applyToEngine || isScrubbing || isPaused || sessionState.playbackSpeed !== 1.0) &&
    currFrame &&
    engine
  ) {
    applyStepFrameAndControlsToEngine(engine, currFrame, prevFrame, alpha, interpolator, prevEntry);
  }

  let incidents: ReplayIncidentEntry[] = [];
  let audioEvents: ReplayAudioCue[] = [];
  let signals: ReplaySignalEntry[] = [];
  let lastDispatchedFrameIndex = sessionState.lastDispatchedFrameIndex;
  if (!isPaused && baseIdx > lastDispatchedFrameIndex) {
    const dispatched = collectDispatchedEventsInWindow(
      (idx) => getFrameEntryByIndex(idx),
      lastDispatchedFrameIndex,
      baseIdx
    );
    incidents = dispatched.incidents;
    audioEvents = dispatched.audioEvents;
    signals = dispatched.signals;
    lastDispatchedFrameIndex = baseIdx;
  }

  let isFinished = cursorFloat >= total - 1;
  if (isFinished && sessionState.isLoopingPreview && !isPaused && !isScrubbing && total > 1) {
    cursorFloat = 0;
    lastDispatchedFrameIndex = -1;
    directorCamera.resetSmoothing();
    isFinished = false;
  } else if (isFinished && sessionState.isPersistent && !isPaused) {
    isPaused = true;
    directorCamera.setPauseAndScrubState(true, isScrubbing);
  }

  const nextSessionState = Object.assign(sessionState, {
    cursorFloat,
    isPaused,
    isScrubbing,
    scorerCarIndex: resolvedScorerCarIndex,
    lastDispatchedFrameIndex,
  });

  const progress =
    embedded && typeof embedded.progress === 'number' && embedded.progress > 0
      ? embedded.progress
      : isFollowingLiveStream && sessionState.expectedDurationTicks > 1
        ? Math.min(1, cursorFloat / Math.max(1, sessionState.expectedDurationTicks - 1))
        : total > 1
          ? cursorFloat / (total - 1)
          : 1;

  return {
    frame: currFrame,
    prevFrame,
    currFrame,
    alpha,
    frameIndex: baseIdx,
    totalFrames: total,
    progress,
    slowMoFactor,
    activeTouchCarIndex: directorCamera.state.activeTouchCarIndex,
    isFinished,
    incidents,
    signals,
    audioEvents,
    nextSessionState,
  };
}
