/**
 * ReplayDiagnosticPatternController.ts
 * Sub-controller and pure helpers for importing, evaluating, and serializing
 * Goal Replay Director diagnostic patterns, frame snapshots, and local frame windows.
 */

import { registerReplayDirectorDiagnosticExporter } from '../game/runtimeUiPort.ts';
import {
  exportReplayDirectorDiagnosticPattern,
  exportReplayDirectorReferenceKeyframe,
} from './ReplayDirectorExporter.ts';
import { parseDirectorDiagnosticInput } from './ReplayDirectorPatternParser.ts';
import type { ReplayDirectorCameraSubController } from './ReplayDirectorCameraSubController.ts';
import {
  evaluateDirectorDiagnosticPatternPayload,
  type ReplayDirectorDiagnosticInput,
  type DirectorDiagnosticPatternOptions,
  type DirectorDiagnosticPatternPayload,
} from './ReplayDirectorDiagnostics.ts';
import { buildCurrentFrameDiagnosticSnapshot } from './replayDirectorSingleFramePipeline.ts';
import {
  resolveGoalExplosionFrameIndex,
  type ReplayTouchEvent,
} from './ReplayDirectorGazeSolver.ts';
import {
  buildDirectorDiagnosticPatternCsv,
  buildDirectorFrameWindowDiagnostic,
  type DirectorPatternSerializerOptions,
} from './ReplayDirectorPatternSerializer.ts';
import {
  resolveTimelineFrameEntryAt,
  resolveTimelineFrameBufferAt,
} from './ReplayPlaybackState.ts';
import {
  resolveSessionTouchLookahead,
  computeSessionDramaticSlowMo,
} from './replayTouchLookaheadPipeline.ts';
import { analyzeAndSyncReplayTouchTimelineState } from './ReplayTouchTimelineAnalyzer.ts';
import type { ReplayRingBuffer } from './ReplayRingBuffer.ts';
import type {
  DirectorCameraState,
  ImportedDiagnosticLoadOptions,
  ImportedDiagnosticPatternInput,
  ReplayCarRosterEntry,
  ReplayPhysicsEnginePort,
  ReplaySessionState,
  ReplayTimelineFrameEntry,
} from './replayDirectorStateTypes.ts';

export function buildImportedCarTeamResolver(
  importedCarEntries: ReplayCarRosterEntry[] | null | undefined
): ((carIndex: number) => number) | null {
  if (!Array.isArray(importedCarEntries) || importedCarEntries.length === 0) return null;
  const teamMap = new Map<number, number>();
  for (const c of importedCarEntries) {
    if (typeof c?.carIndex === 'number' && typeof c?.team === 'number')
      teamMap.set(c.carIndex, c.team);
  }
  return teamMap.size > 0 ? (cIdx: number) => teamMap.get(cIdx) ?? cIdx % 2 : null;
}

export function buildImportedDiagnosticPatternSessionState(
  currentState: ReplaySessionState,
  parsedPattern: ImportedDiagnosticPatternInput,
  fallbackCarTeamResolver: ((carIndex: number) => number) | null,
  options: ImportedDiagnosticLoadOptions = {}
): { sessionState: ReplaySessionState; initialCursorFloat: number } {
  const importedCarEntries = Array.isArray(parsedPattern.carEntries)
    ? parsedPattern.carEntries
    : null;
  const resolvedTeamResolver = buildImportedCarTeamResolver(importedCarEntries);
  const hasRecordedRows = Boolean(
    parsedPattern.hasRecordedCsvRows ||
    parsedPattern.activeFrames.some((f: ReplayTimelineFrameEntry) => Boolean(f?.recordedCsvRow))
  );
  const useRecordedCsvCamera =
    typeof options.useRecordedCsvCamera === 'boolean'
      ? options.useRecordedCsvCamera && hasRecordedRows
      : false;
  const startIdx = Math.max(
    0,
    Math.min(parsedPattern.activeFrames.length - 1, parsedPattern.selectedCursorIndex ?? 0)
  );
  return {
    sessionState: {
      ...currentState,
      activeFrames: parsedPattern.activeFrames,
      expectedDurationTicks: parsedPattern.activeFrames.length,
      scoringTeam: parsedPattern.scoringTeam ?? 0,
      scorerCarIndex: parsedPattern.scorerCarIndex ?? 0,
      hasRetainedReplay: true,
      isImportedPreview: true,
      importedFileName: parsedPattern.fileName || options.fileName || 'imported.rcgr.gz',
      importedCarEntries,
      carEntries: importedCarEntries,
      carTeamResolver: resolvedTeamResolver || fallbackCarTeamResolver,
      cachedSuffixCameraPlan: null,
      cachedSmoothnessSummary: null,
      cachedAnomalyPeaks: null,
      useRecordedCsvCamera,
      isNetworkStreamed: false,
      streamedFramesReceived: 0,
    },
    initialCursorFloat: options.startFromBeginning ? 0 : startIdx,
  };
}

export function applyImportedPatternOverridesToDirectorState(
  state: DirectorCameraState,
  parsedPattern: ImportedDiagnosticPatternInput,
  activeFrames: ReplayTimelineFrameEntry[],
  scoringTeam: number,
  currentGoalLineFrameIdx: number
): number {
  let resolvedGoalLineFrameIdx = currentGoalLineFrameIdx;
  if (Array.isArray(parsedPattern.touchEvents) && parsedPattern.touchEvents.length > 0) {
    state.touchEvents = parsedPattern.touchEvents.map((t: ReplayTouchEvent) => ({ ...t }));
  }
  if (
    typeof parsedPattern.lastScoringTouchFrameIdx === 'number' &&
    parsedPattern.lastScoringTouchFrameIdx >= 0
  ) {
    state.lastScoringTouchFrameIdx = parsedPattern.lastScoringTouchFrameIdx;
  }
  if (typeof parsedPattern.goalLineFrameIdx === 'number' && parsedPattern.goalLineFrameIdx >= 0) {
    resolvedGoalLineFrameIdx = resolveGoalExplosionFrameIndex(
      activeFrames,
      (scoringTeam ?? 0) === 0 ? 1.0 : -1.0,
      parsedPattern.goalLineFrameIdx
    );
    state.goalLineFrameIdx = resolvedGoalLineFrameIdx;
  }
  if (
    parsedPattern.initialSettledCarPos &&
    typeof parsedPattern.initialSettledCarPos === 'object'
  ) {
    state.initialSettledCarPos = { ...parsedPattern.initialSettledCarPos };
  }
  if (typeof parsedPattern.lateralBias === 'number' && parsedPattern.lateralBias !== 0) {
    state.lateralBias = parsedPattern.lateralBias;
    state.hasResolvedInitialLateralBias = true;
  }
  return resolvedGoalLineFrameIdx;
}

export interface ReplayDiagnosticSessionContext {
  readonly sessionState: ReplaySessionState;
  readonly directorCamera: ReplayDirectorCameraSubController;
  readonly ringBuffer: ReplayRingBuffer | null;
  readonly engine: ReplayPhysicsEnginePort | null;
}

function resolveTotalFramesForDiagnostic(ctx: ReplayDiagnosticSessionContext): number {
  const activeLen = Array.isArray(ctx.sessionState.activeFrames)
    ? ctx.sessionState.activeFrames.length
    : 0;
  if (activeLen > 0) return activeLen;
  const wasmCount = ctx.engine?.getReplayFrameCount?.() ?? 0;
  return wasmCount > 0 ? wasmCount : (ctx.ringBuffer?.size ?? 0);
}

export function buildReplayDiagnosticInput(
  ctx: ReplayDiagnosticSessionContext
): ReplayDirectorDiagnosticInput {
  const s = ctx.sessionState;
  const totalFrames = resolveTotalFramesForDiagnostic(ctx);
  const activeWindowCount = Array.isArray(s.activeFrames) ? s.activeFrames.length : 0;
  const currentFrameIndex =
    totalFrames <= 0 ? 0 : Math.max(0, Math.min(totalFrames - 1, Math.floor(s.cursorFloat)));
  const progress =
    totalFrames <= 1 ? 0 : Math.max(0, Math.min(1, s.cursorFloat / (totalFrames - 1)));

  return {
    totalFrames,
    activeWindowCount,
    currentFrameIndex,
    cursorFloat: s.cursorFloat,
    progress,
    playbackSpeed: s.playbackSpeed,
    isPaused: s.isPaused,
    isPersistent: s.isPersistent,
    isScrubbing: s.isScrubbing,
    isActive: s.isActive,
    isImportedPreview: s.isImportedPreview,
    importedFileName: s.importedFileName,
    useRecordedCsvCamera: s.useRecordedCsvCamera,
    cachedSmoothnessSummary: s.cachedSmoothnessSummary,
    importedSummary: s.importedSummary,
    cachedAnomalyPeaks: s.cachedAnomalyPeaks,
    importedAnomalyPeaks: s.importedAnomalyPeaks,
    scoringTeam: s.scoringTeam,
    scorerCarIndex: s.scorerCarIndex,
    carTeamResolver: s.carTeamResolver,
    carEntries: s.importedCarEntries || s.carEntries || null,
    directorCameraState: ctx.directorCamera.state,
    getFrameEntryByIndex: (idx) => resolveTimelineFrameEntryAt(s.activeFrames, ctx.ringBuffer, idx),
    getFrameBufferByIndex: (idx) =>
      resolveTimelineFrameBufferAt(s.activeFrames, ctx.engine, ctx.ringBuffer, idx),
    ensureSuffixCameraPlan: () => ctx.directorCamera.ensureSuffixCameraPlanForSession(s),
    resolveTouchLookaheadForFrame: (idx, fb = 0) =>
      resolveSessionTouchLookahead(
        s,
        ctx.directorCamera.state,
        ctx.directorCamera.ensureSuffixCameraPlanForSession(s),
        idx,
        fb
      ),
    computeDramaticSlowMoFactor: (cursor, opts = {}) =>
      computeSessionDramaticSlowMo(s, ctx.directorCamera.state, cursor, opts),
  };
}

registerReplayDirectorDiagnosticExporter(
  exportReplayDirectorDiagnosticPattern,
  parseDirectorDiagnosticInput,
  buildDirectorFrameWindowDiagnostic,
  exportReplayDirectorReferenceKeyframe
);

export function evaluateSessionDiagnosticPatternPayload(
  ctx: ReplayDiagnosticSessionContext,
  options: DirectorDiagnosticPatternOptions = {}
): DirectorDiagnosticPatternPayload | null {
  const res = evaluateDirectorDiagnosticPatternPayload(buildReplayDiagnosticInput(ctx), options);
  if (!res) return null;
  ctx.sessionState.cachedSmoothnessSummary = res.trajectorySmoothnessSummary;
  ctx.sessionState.cachedAnomalyPeaks = res.anomalyPeaks;
  return res.payload;
}

export function buildSessionCurrentFrameDiagnosticSnapshot(
  ctx: ReplayDiagnosticSessionContext
): ReturnType<typeof buildCurrentFrameDiagnosticSnapshot> {
  const s = ctx.sessionState;
  if (!s.isNetworkStreamed && s.activeFrames.length > 0 && !s.cachedSmoothnessSummary) {
    evaluateSessionDiagnosticPatternPayload(ctx);
  }
  return buildCurrentFrameDiagnosticSnapshot(buildReplayDiagnosticInput(ctx));
}

export function buildSessionDiagnosticPatternCsv(
  ctx: ReplayDiagnosticSessionContext,
  options: DirectorPatternSerializerOptions = {}
): string {
  const totalFrames = resolveTotalFramesForDiagnostic(ctx);
  const currentFrameIndex =
    totalFrames <= 0
      ? 0
      : Math.max(0, Math.min(totalFrames - 1, Math.floor(ctx.sessionState.cursorFloat)));
  return buildDirectorDiagnosticPatternCsv(
    {
      currentFrameIndex,
      sessionState: ctx.sessionState,
      directorCameraState: ctx.directorCamera.state,
      buildDirectorDiagnosticPatternPayload: (opts) =>
        evaluateSessionDiagnosticPatternPayload(ctx, opts),
    },
    options
  );
}

export function buildSessionFrameWindowDiagnostic(
  ctx: ReplayDiagnosticSessionContext,
  windowRadius = 15
): ReturnType<typeof buildDirectorFrameWindowDiagnostic> {
  const totalFrames = resolveTotalFramesForDiagnostic(ctx);
  const currentFrameIndex =
    totalFrames <= 0
      ? 0
      : Math.max(0, Math.min(totalFrames - 1, Math.floor(ctx.sessionState.cursorFloat)));
  return buildDirectorFrameWindowDiagnostic(
    {
      currentFrameIndex,
      sessionState: ctx.sessionState,
      directorCameraState: ctx.directorCamera.state,
      buildDirectorDiagnosticPatternPayload: (opts) =>
        evaluateSessionDiagnosticPatternPayload(ctx, opts),
    },
    windowRadius
  );
}

export function applyImportedDiagnosticPatternToSession(
  ctx: ReplayDiagnosticSessionContext,
  parsedPattern: ImportedDiagnosticPatternInput | null | undefined,
  options: ImportedDiagnosticLoadOptions = {}
): ReplaySessionState | null {
  if (
    !parsedPattern ||
    !Array.isArray(parsedPattern.activeFrames) ||
    parsedPattern.activeFrames.length === 0
  ) {
    return null;
  }
  const fields = buildImportedDiagnosticPatternSessionState(
    ctx.sessionState,
    parsedPattern,
    ctx.sessionState.carTeamResolver,
    options
  );
  const nextState = fields.sessionState;

  analyzeAndSyncReplayTouchTimelineState(nextState, ctx.directorCamera, {
    scorerCarIndex: nextState.scorerCarIndex,
    carTeamResolver: nextState.carTeamResolver,
  });

  nextState.goalLineFrameIdx = applyImportedPatternOverridesToDirectorState(
    ctx.directorCamera.state,
    parsedPattern,
    nextState.activeFrames,
    nextState.scoringTeam,
    nextState.goalLineFrameIdx
  );

  const nextCtx: ReplayDiagnosticSessionContext = {
    ...ctx,
    sessionState: nextState,
  };
  if (!nextState.useRecordedCsvCamera || !parsedPattern.summary || !parsedPattern.anomalyPeaks) {
    ctx.directorCamera.ensureSuffixCameraPlanForSession(nextState);
    evaluateSessionDiagnosticPatternPayload(nextCtx);
  }

  nextState.importedSummary = nextState.useRecordedCsvCamera
    ? parsedPattern.summary || nextState.cachedSmoothnessSummary
    : nextState.cachedSmoothnessSummary || parsedPattern.summary || null;
  nextState.importedAnomalyPeaks = nextState.useRecordedCsvCamera
    ? parsedPattern.anomalyPeaks || nextState.cachedAnomalyPeaks
    : nextState.cachedAnomalyPeaks || parsedPattern.anomalyPeaks || null;
  nextState.cursorFloat = fields.initialCursorFloat;
  nextState.lastDispatchedFrameIndex = -1;

  return nextState;
}
