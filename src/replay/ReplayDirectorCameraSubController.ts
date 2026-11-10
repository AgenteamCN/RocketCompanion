/**
 * ReplayDirectorCameraSubController.ts
 * Stateful sub-controller for Goal Replay Director Camera pose and smoothing lifecycle.
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import { computeGoalReplayCameraPose } from './ReplayDirectorCamera.ts';
import { decodeReplayDirectorTelemetryFromState } from './ReplayFrameInterpolator.ts';
import type { SuffixDirectorTrajectoryPlan } from './ReplayDirectorTrajectoryPlanner.ts';
import { ensureSuffixCameraPlan } from './replayTouchLookaheadPipeline.ts';
import type { ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import type {
  ReplayTouchAnalysisResult,
  ResolvedTouchLookahead,
} from './ReplayTouchTimelineAnalyzer.ts';
import {
  createInitialDirectorCameraState,
  type DirectorCameraPose,
  type DirectorCameraState,
  type RefreshDirectorPoseInput,
  type ReplaySessionInitOptions,
  type ReplaySessionState,
  type StepDirectorCameraSyncInput,
  type StepDirectorCameraSyncResult,
} from './replayDirectorStateTypes.ts';

export class ReplayDirectorCameraSubController {
  public state: DirectorCameraState;

  constructor(initialState?: DirectorCameraState) {
    this.state = initialState || createInitialDirectorCameraState();
  }

  private _applyLookahead(
    la: Omit<Partial<ResolvedTouchLookahead>, 'plannedPose'> & {
      primaryCarIndex: number;
      nextCarIndex: number;
      nextTouchBlend: number;
      plannedPose?: DirectorCameraPose | null;
    }
  ): void {
    const d = this.state;
    d.activeTouchCarIndex = la.primaryCarIndex;
    d.nextTouchCarIndex = la.nextCarIndex;
    d.nextTouchBlend = la.nextTouchBlend;
    d.nextTouchBallPos = la.nextTouchBallPos ?? null;
    d.interceptorCarIndex = la.interceptorCarIndex ?? -1;
    d.interceptorBlend = la.interceptorBlend ?? 0;
    d.plannedPose = la.plannedPose ?? null;
    d.postGoalElapsedSec = la.postGoalElapsedSec ?? 0;
  }

  reset(useRecordedCsvPose = false, isPaused = false, isScrubbing = false): void {
    const d = this.state;
    d.initialized = false;
    d.useRecordedCsvPose = useRecordedCsvPose;
    d.recordedPose = null;
    d.isPaused = isPaused;
    d.isScrubbing = isScrubbing;
  }

  resetSmoothing(): void {
    this.state.initialized = false;
  }

  setPauseAndScrubState(isPaused: boolean, isScrubbing: boolean): void {
    this.state.isPaused = isPaused;
    this.state.isScrubbing = isScrubbing;
  }

  setSuffixCameraPlan(plan: SuffixDirectorTrajectoryPlan | null): void {
    this.state.suffixCameraPlan = plan;
    if (plan && typeof plan.lateralBias === 'number') {
      this.state.lateralBias = plan.lateralBias;
    }
  }

  ensureSuffixCameraPlanForSession(
    sessionState: ReplaySessionState
  ): SuffixDirectorTrajectoryPlan | null {
    const d = this.state;
    const plan = ensureSuffixCameraPlan(sessionState.activeFrames, {
      isNetworkStreamed: sessionState.isNetworkStreamed,
      streamedFramesReceived: sessionState.streamedFramesReceived,
      expectedDurationTicks: sessionState.expectedDurationTicks,
      cachedPlan: sessionState.cachedSuffixCameraPlan,
      scoringTeam: sessionState.scoringTeam,
      scorerCarIndex: d.scorerCarIndex ?? sessionState.scorerCarIndex ?? 0,
      goalLineFrameIdx: d.goalLineFrameIdx ?? -1,
      touchEvents: d.touchEvents || [],
      carTeamResolver: sessionState.carTeamResolver,
      lateralBias: d.lateralBias,
      initialSettledCarPos: d.initialSettledCarPos,
    });
    sessionState.cachedSuffixCameraPlan = plan;
    this.setSuffixCameraPlan(plan);
    return plan;
  }

  onTimelineAnalyzed(res: ReplayTouchAnalysisResult): void {
    const d = this.state;
    d.touchEvents = res.touchEvents;
    d.reboundEvents = res.reboundEvents;
    d.lastScoringTouchFrameIdx = res.lastScoringTouchFrameIdx;
    d.goalLineFrameIdx = res.goalLineFrameIdx;
    d.scorerCarIndex = res.resolvedScorerCarIndex;
    this._applyLookahead({
      primaryCarIndex: res.openingCarIndex,
      nextCarIndex: -1,
      nextTouchBlend: 0,
    });
    d.lateralBias = res.resolvedLateralBias;
    d.hasResolvedInitialLateralBias = true;
    d.initialSettledCarPos = res.initialSettledCarPos;
  }

  applyPostAnalysisOverrides(options: ReplaySessionInitOptions = {}): void {
    if (Array.isArray(options.touchEvents) && options.touchEvents.length > 0) {
      this.state.touchEvents = options.touchEvents.map((t: ReplayTouchEvent) => ({ ...t }));
    }
    if (typeof options.goalLineFrameIdx === 'number' && options.goalLineFrameIdx >= 0) {
      this.state.goalLineFrameIdx = options.goalLineFrameIdx;
    }
    if (typeof options.lateralBias === 'number' && options.lateralBias !== 0) {
      this.state.lateralBias = options.lateralBias;
      this.state.hasResolvedInitialLateralBias = true;
    }
  }

  preserveSmoothingAround(runTouchAnalysis: () => void): void {
    const d = this.state;
    const saved = {
      initialized: d.initialized,
      eyeX: d.eyeX,
      eyeY: d.eyeY,
      eyeZ: d.eyeZ,
      targetX: d.targetX,
      targetY: d.targetY,
      targetZ: d.targetZ,
      ...(typeof d.smoothedCarX === 'number'
        ? {
            smoothedCarX: d.smoothedCarX,
            smoothedCarY: d.smoothedCarY,
            smoothedCarZ: d.smoothedCarZ,
            carSwitchBlend: d.carSwitchBlend,
          }
        : {}),
      ...(typeof d.smoothedUgX === 'number'
        ? { smoothedUgX: d.smoothedUgX, smoothedUgY: d.smoothedUgY }
        : {}),
      ...(typeof d.smoothedLateralBias === 'number'
        ? { smoothedLateralBias: d.smoothedLateralBias }
        : {}),
    };
    runTouchAnalysis();
    Object.assign(d, saved);
  }

  applyStreamedTelemetry(
    snap: Float32Array,
    isFollowingLiveStream: boolean,
    currentScorerCarIndex: number
  ): number {
    const d = this.state;
    let resolvedScorer = currentScorerCarIndex;
    const em = decodeReplayDirectorTelemetryFromState(snap);
    if (em) {
      if (typeof em.lateralBias === 'number' && em.lateralBias !== 0) {
        d.lateralBias = em.lateralBias;
        d.hasResolvedInitialLateralBias = true;
      }
      if (typeof em.scorerCarIndex === 'number' && em.scorerCarIndex >= 0) {
        d.scorerCarIndex = em.scorerCarIndex;
        resolvedScorer = em.scorerCarIndex;
      }
      if (isFollowingLiveStream) {
        this._applyLookahead({
          primaryCarIndex: em.activeTouchCarIndex,
          nextCarIndex: em.nextTouchCarIndex,
          nextTouchBlend: em.nextTouchBlend,
          nextTouchBallPos: em.nextTouchBallPos,
          interceptorCarIndex: em.interceptorCarIndex,
          interceptorBlend: em.interceptorBlend,
          plannedPose: em.plannedPose ?? d.plannedPose,
          postGoalElapsedSec: em.postGoalElapsedSec,
        });
      }
    }
    if ((d.postGoalElapsedSec ?? 0) <= 0) d.goalAnchorEyeY = undefined;
    return resolvedScorer;
  }

  refreshSessionDirectorPose(
    sessionState: ReplaySessionState,
    totalFrames: number,
    getFrameEntryByIndex: RefreshDirectorPoseInput['getFrameEntryByIndex'],
    getFrameBufferByIndex: (index: number) => Float32Array | null,
    resolveTouchLookaheadForFrame: RefreshDirectorPoseInput['resolveTouchLookaheadForFrame']
  ): DirectorCameraPose | null {
    return this.refreshPoseAtCursor({
      totalFrames,
      cursorFloat: sessionState.cursorFloat,
      isPaused: sessionState.isPaused,
      isScrubbing: sessionState.isScrubbing,
      isImportedPreview: sessionState.isImportedPreview,
      useRecordedCsvCamera: sessionState.useRecordedCsvCamera,
      scoringTeam: sessionState.scoringTeam,
      scorerCarIndex: sessionState.scorerCarIndex,
      getFrameEntryByIndex,
      getFrameBufferByIndex,
      ensureSuffixCameraPlan: () => this.ensureSuffixCameraPlanForSession(sessionState),
      resolveTouchLookaheadForFrame,
    });
  }

  refreshPoseAtCursor(input: RefreshDirectorPoseInput): DirectorCameraPose | null {
    const {
      totalFrames: total,
      cursorFloat,
      isPaused,
      isScrubbing,
      isImportedPreview,
      useRecordedCsvCamera,
      scoringTeam,
      scorerCarIndex,
      getFrameEntryByIndex,
      getFrameBufferByIndex,
      ensureSuffixCameraPlan,
      resolveTouchLookaheadForFrame,
    } = input;
    const d = this.state;
    if (total <= 0 || !d) return null;
    const targetIdx = Math.max(0, Math.min(total - 1, Math.floor(cursorFloat)));
    const entry = getFrameEntryByIndex(targetIdx);
    const useCsvPose = Boolean(isImportedPreview && useRecordedCsvCamera && entry?.recordedCsvRow);
    d.useRecordedCsvPose = useCsvPose;
    d.isPaused = isPaused;
    d.isScrubbing = isScrubbing;

    if (useCsvPose && entry?.recordedCsvRow) {
      const r = entry.recordedCsvRow;
      const recordedPose: DirectorCameraPose = {
        eyeX: r.cam_eye_x ?? 0,
        eyeY: r.cam_eye_y ?? 0,
        eyeZ: r.cam_eye_z ?? 0,
        targetX: r.cam_target_x ?? 0,
        targetY: r.cam_target_y ?? 0,
        targetZ: r.cam_target_z ?? 0,
      };
      d.recordedPose = recordedPose;
      d.eyeX = recordedPose.eyeX;
      d.eyeY = recordedPose.eyeY;
      d.eyeZ = recordedPose.eyeZ;
      d.targetX = recordedPose.targetX;
      d.targetY = recordedPose.targetY;
      d.targetZ = recordedPose.targetZ;
      d.initialized = true;
      return recordedPose;
    }

    d.recordedPose = null;
    const suffixPlan = ensureSuffixCameraPlan();
    if (suffixPlan && Array.isArray(suffixPlan.poses) && suffixPlan.poses.length > 0) {
      const s = getFrameBufferByIndex(targetIdx);
      const nextS = getFrameBufferByIndex(Math.min(total - 1, targetIdx + 1)) || s;
      d.currentFrameIndex = cursorFloat;
      d.plannedPose = suffixPlan.poses[targetIdx] || null;
      return computeGoalReplayCameraPose(nextS || s, scoringTeam, {
        prevStateBuffer: s,
        alpha: Math.max(0, Math.min(1, cursorFloat - targetIdx)),
        scorerCarIndex,
        progress: total > 1 ? cursorFloat / (total - 1) : 0,
        frameIndex: cursorFloat,
        suffixCameraPlan: suffixPlan,
        directorState: d,
        dt: 1 / REPLAY_TICK_RATE,
        exactDt: true,
      });
    }

    d.initialized = false;
    let lastPose: DirectorCameraPose | null = null;
    for (let i = Math.max(0, targetIdx - 90); i <= targetIdx; i++) {
      const s = getFrameBufferByIndex(i);
      if (!s) continue;
      const em = decodeReplayDirectorTelemetryFromState(s);
      this._applyLookahead(
        em
          ? {
              primaryCarIndex:
                em.activeTouchCarIndex >= 0 ? em.activeTouchCarIndex : (scorerCarIndex ?? 0),
              nextCarIndex: em.nextTouchCarIndex,
              nextTouchBlend: em.nextTouchBlend,
              nextTouchBallPos: em.nextTouchBallPos,
              interceptorCarIndex: em.interceptorCarIndex,
              interceptorBlend: em.interceptorBlend,
              plannedPose: em.plannedPose,
              postGoalElapsedSec: em.postGoalElapsedSec,
            }
          : resolveTouchLookaheadForFrame(i, d.activeTouchCarIndex ?? scorerCarIndex ?? 0)
      );
      lastPose = computeGoalReplayCameraPose(s, scoringTeam, {
        scorerCarIndex,
        progress: total > 1 ? i / (total - 1) : 0,
        frameIndex: i,
        directorState: d,
        dt: 1 / REPLAY_TICK_RATE,
        exactDt: true,
      });
    }
    return lastPose;
  }

  syncForPlaybackStep(input: StepDirectorCameraSyncInput): StepDirectorCameraSyncResult {
    const {
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
      scorerCarIndex,
      resolveTouchLookaheadForFrame,
    } = input;
    const d = this.state;
    d.isPaused = isPaused;
    d.isScrubbing = isScrubbing;
    d.useRecordedCsvPose = useCsvPose;
    d.currentFrameIndex = cursorFloat;
    let resolvedScorerCarIndex = scorerCarIndex;
    const em = !suffixPlan && currFrame ? decodeReplayDirectorTelemetryFromState(currFrame) : null;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;

    if (useCsvPose && prevEntry?.recordedCsvRow) {
      const r0 = prevEntry.recordedCsvRow;
      const r1 = nextEntry?.recordedCsvRow || r0;
      d.recordedPose = {
        eyeX: lerp(r0.cam_eye_x ?? 0, r1.cam_eye_x ?? 0),
        eyeY: lerp(r0.cam_eye_y ?? 0, r1.cam_eye_y ?? 0),
        eyeZ: lerp(r0.cam_eye_z ?? 0, r1.cam_eye_z ?? 0),
        targetX: lerp(r0.cam_target_x ?? 0, r1.cam_target_x ?? 0),
        targetY: lerp(r0.cam_target_y ?? 0, r1.cam_target_y ?? 0),
        targetZ: lerp(r0.cam_target_z ?? 0, r1.cam_target_z ?? 0),
      };
    } else {
      d.recordedPose = null;
    }

    if (
      !useCsvPose &&
      suffixPlan &&
      Array.isArray(suffixPlan.poses) &&
      suffixPlan.poses.length > 0
    ) {
      const p0 = suffixPlan.poses[baseIdx];
      const p1 = suffixPlan.poses[nextIdx] || p0;
      d.lateralBias = p0.lateralBias;
      this._applyLookahead({
        primaryCarIndex: p0.activeTouchCarIndex,
        nextCarIndex: p0.nextTouchCarIndex,
        nextTouchBlend: lerp(p0.nextTouchBlend, p1.nextTouchBlend),
        nextTouchBallPos: p0.nextTouchBallPos,
        interceptorCarIndex: p0.interceptorCarIndex,
        interceptorBlend: lerp(p0.interceptorBlend ?? 0, p1.interceptorBlend ?? 0),
        postGoalElapsedSec: lerp(p0.postGoalElapsedSec ?? 0, p1.postGoalElapsedSec ?? 0),
        plannedPose: {
          eyeX: lerp(p0.eyeX, p1.eyeX),
          eyeY: lerp(p0.eyeY, p1.eyeY),
          eyeZ: lerp(p0.eyeZ, p1.eyeZ),
          targetX: lerp(p0.targetX, p1.targetX),
          targetY: lerp(p0.targetY, p1.targetY),
          targetZ: lerp(p0.targetZ, p1.targetZ),
          rawEyeX: lerp(p0.rawEyeX, p1.rawEyeX),
          rawEyeY: lerp(p0.rawEyeY, p1.rawEyeY),
          rawEyeZ: lerp(p0.rawEyeZ, p1.rawEyeZ),
          rawTargetX: lerp(p0.rawTargetX, p1.rawTargetX),
          rawTargetY: lerp(p0.rawTargetY, p1.rawTargetY),
          rawTargetZ: lerp(p0.rawTargetZ, p1.rawTargetZ),
        },
      });
    } else if (!useCsvPose && em) {
      this._applyLookahead({
        primaryCarIndex:
          em.activeTouchCarIndex >= 0 ? em.activeTouchCarIndex : (scorerCarIndex ?? 0),
        nextCarIndex: em.nextTouchCarIndex,
        nextTouchBlend: em.nextTouchBlend,
        nextTouchBallPos: em.nextTouchBallPos,
        interceptorCarIndex: em.interceptorCarIndex,
        interceptorBlend: em.interceptorBlend,
        plannedPose: em.plannedPose,
        postGoalElapsedSec: em.postGoalElapsedSec,
      });
      if (typeof em.lateralBias === 'number' && em.lateralBias !== 0) {
        d.lateralBias = em.lateralBias;
        d.hasResolvedInitialLateralBias = true;
      }
      if (typeof em.scorerCarIndex === 'number' && em.scorerCarIndex >= 0) {
        d.scorerCarIndex = em.scorerCarIndex;
        resolvedScorerCarIndex = em.scorerCarIndex;
      }
    } else {
      this._applyLookahead(resolveTouchLookaheadForFrame(baseIdx, d.activeTouchCarIndex ?? 0));
    }

    return { embeddedTelemetry: em, resolvedScorerCarIndex };
  }

  clearRetained(): void {
    const d = this.state;
    d.initialized = false;
    d.useRecordedCsvPose = false;
    d.recordedPose = null;
    d.suffixCameraPlan = null;
    d.plannedPose = null;
    d.touchEvents = [];
  }

  cloneFrom(sourceState: Partial<DirectorCameraState> | null | undefined): void {
    if (!sourceState) return;
    this.state = {
      ...this.state,
      ...sourceState,
      touchEvents: Array.isArray(sourceState.touchEvents)
        ? sourceState.touchEvents.map((t: ReplayTouchEvent) => ({ ...t }))
        : [],
    };
  }
}
