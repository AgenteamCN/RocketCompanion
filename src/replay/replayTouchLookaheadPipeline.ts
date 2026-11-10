/**
 * replayTouchLookaheadPipeline.ts
 * Pure narrow-input pipeline for suffix camera trajectory plan resolution,
 * per-frame contact-driven subject lookahead anchors, and automatic dramatic slow-motion curves.
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import {
  buildSuffixSafeDirectorTrajectory,
  type SuffixDirectorTrajectoryPlan,
} from './ReplayDirectorTrajectoryPlanner.ts';
import type { PlannedDirectorCameraPose, ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import { REPLAY_DIRECTOR_CONFIG } from '../ui-core/config/replayDirectorConfig.ts';

export interface ReplayReboundEvent {
  frameIndex: number;
  tick: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  normX: number;
  normY: number;
}

export interface SuffixCameraPlanInput {
  isNetworkStreamed: boolean;
  streamedFramesReceived: number;
  expectedDurationTicks: number;
  cachedPlan: SuffixDirectorTrajectoryPlan | null;
  scoringTeam: number;
  scorerCarIndex: number;
  goalLineFrameIdx: number;
  touchEvents: ReplayTouchEvent[];
  carTeamResolver: ((carIndex: number) => number) | null;
  lateralBias?: number;
  initialSettledCarPos?: { carIndex?: number; x: number; y: number; z: number } | null;
}

export interface ResolveTouchLookaheadInput {
  suffixPlan: SuffixDirectorTrajectoryPlan | null;
  goalLineFrameIdx: number;
  scorerCarIndex: number;
  touchEvents: ReplayTouchEvent[];
  reboundEvents: ReplayReboundEvent[];
  scoringTeam: number;
  watchAllTouches: boolean;
}

export interface DramaticSlowMoInput {
  disableSlowMo: boolean;
  playbackSpeed: number;
  isScrubbing: boolean;
  lastScoringTouchFrameIdx: number;
  goalLineFrameIdx: number;
}

export interface ResolvedTouchLookahead {
  primaryCarIndex: number;
  nextCarIndex: number;
  nextTouchBlend: number;
  nextTouchBallPos: { x: number; y: number; z: number } | null;
  interceptorCarIndex: number;
  interceptorBlend: number;
  plannedPose: PlannedDirectorCameraPose | null;
  postGoalElapsedSec: number;
}

/**
 * Builds or reuses the full-window Suffix Safe-Zone Backward-Planned Camera Trajectory
 * whenever the full replay window (`frames`) is available locally.
 */
export function ensureSuffixCameraPlan(
  frames: ReadonlyArray<any>,
  input: SuffixCameraPlanInput
): SuffixDirectorTrajectoryPlan | null {
  if (
    input.isNetworkStreamed &&
    input.streamedFramesReceived < (input.expectedDurationTicks || 9999)
  ) {
    return null;
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }
  if (
    input.cachedPlan &&
    Array.isArray(input.cachedPlan.poses) &&
    input.cachedPlan.poses.length === frames.length
  ) {
    return input.cachedPlan;
  }
  return buildSuffixSafeDirectorTrajectory(frames as any[], {
    scoringTeam: input.scoringTeam ?? 0,
    scorerCarIndex: input.scorerCarIndex ?? 0,
    goalLineFrameIdx: input.goalLineFrameIdx ?? -1,
    touchEvents: input.touchEvents || [],
    carTeamResolver: input.carTeamResolver ?? undefined,
    lateralBias: input.lateralBias,
    initialSettledCarPos: input.initialSettledCarPos,
  });
}

/**
 * Resolves Contact-Driven Subject Anchors (Mandatory Next Scoring Player + Opponent Interceptor)
 * and Suffix Safe-Zone planned pose at `frameIdx`.
 */
export function resolveTouchLookaheadForFrame(
  input: ResolveTouchLookaheadInput,
  frameIdx: number,
  fallbackScorerCarIndex = 0
): ResolvedTouchLookahead {
  const plan = input.suffixPlan;
  if (plan && Array.isArray(plan.poses) && plan.poses.length > 0) {
    const idx = Math.max(0, Math.min(plan.poses.length - 1, Math.floor(frameIdx)));
    const p = plan.poses[idx];
    return {
      primaryCarIndex: p.activeTouchCarIndex,
      nextCarIndex: p.nextTouchCarIndex,
      nextTouchBlend: p.nextTouchBlend,
      nextTouchBallPos: p.nextTouchBallPos,
      interceptorCarIndex: p.interceptorCarIndex ?? -1,
      interceptorBlend: p.interceptorBlend ?? 0,
      plannedPose: p,
      postGoalElapsedSec: p.postGoalElapsedSec ?? 0,
    };
  }

  const goalLineFrameIdx = input.goalLineFrameIdx ?? -1;
  const postGoalElapsedSec =
    goalLineFrameIdx >= 0 && frameIdx > goalLineFrameIdx
      ? (frameIdx - goalLineFrameIdx) / REPLAY_TICK_RATE
      : 0;
  const resolvedScorerCarIndex =
    typeof input.scorerCarIndex === 'number' && input.scorerCarIndex >= 0
      ? input.scorerCarIndex
      : fallbackScorerCarIndex;

  const touches = input.touchEvents;
  const rebounds = input.reboundEvents || [];
  if ((!Array.isArray(touches) || touches.length === 0) && rebounds.length === 0) {
    return {
      primaryCarIndex: resolvedScorerCarIndex,
      nextCarIndex: -1,
      nextTouchBlend: 0,
      nextTouchBallPos: null,
      interceptorCarIndex: -1,
      interceptorBlend: 0,
      plannedPose: null,
      postGoalElapsedSec,
    };
  }

  const scoringTeam = input.scoringTeam ?? 0;
  const holdTicks = Math.round(
    (REPLAY_DIRECTOR_CONFIG.touchHoldAfterSeconds ?? 0.2) * REPLAY_TICK_RATE
  );
  const lookaheadTicks = Math.max(
    60,
    Math.round((REPLAY_DIRECTOR_CONFIG.twoTouchLookaheadSeconds ?? 2.2) * REPLAY_TICK_RATE)
  );
  const releaseTicks = Math.max(48, holdTicks + 36);
  const anticipationWeight = REPLAY_DIRECTOR_CONFIG.twoTouchAnticipationWeight ?? 0.36;

  const safeTouches = Array.isArray(touches) ? touches : [];
  const scoringTouches = input.watchAllTouches
    ? safeTouches
    : safeTouches.filter((t) => t.team === scoringTeam);
  const candidateTouches = scoringTouches.length > 0 ? scoringTouches : safeTouches;

  let primaryIdx = -1;
  for (let i = 0; i < candidateTouches.length; i++) {
    if (frameIdx <= candidateTouches[i].frameIndex + holdTicks) {
      primaryIdx = i;
      break;
    }
  }

  const lastTouch = candidateTouches[candidateTouches.length - 1];
  const primaryTouch = primaryIdx >= 0 ? candidateTouches[primaryIdx] : lastTouch;
  const primaryCarIndex =
    postGoalElapsedSec > 0
      ? resolvedScorerCarIndex
      : primaryTouch
        ? primaryTouch.carIndex
        : resolvedScorerCarIndex;

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let bestW = 0;
  let nextCarIndex = -1;

  for (let i = 0; i < candidateTouches.length; i++) {
    const t = candidateTouches[i];
    if (i === 0 && t.frameIndex <= 18) continue;

    const dt = t.frameIndex - frameIdx;
    if (dt > lookaheadTicks || dt < -releaseTicks) continue;

    let w = 0;
    if (dt >= 0) {
      const u = 1.0 - dt / lookaheadTicks;
      const s = 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, u)) * Math.PI);
      w = s * s;
    } else {
      const u = 1.0 - -dt / releaseTicks;
      const s = 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, u)) * Math.PI);
      w = s * s;
    }

    if (w > 1e-5) {
      sumW += w;
      sumX += w * t.ballX;
      sumY += w * t.ballY;
      sumZ += w * t.ballZ;
      if (w > bestW) {
        bestW = w;
        nextCarIndex = t.carIndex;
      }
    }
  }

  const oppTouches = safeTouches.filter((t) => t.team !== scoringTeam && t.frameIndex > 12);
  const interceptorPreTicks = Math.round(
    (REPLAY_DIRECTOR_CONFIG.interceptorLookaheadSeconds ?? 1.65) * REPLAY_TICK_RATE
  );
  const interceptorPostTicks = Math.round(0.75 * REPLAY_TICK_RATE);
  let bestOppW = 0;
  let interceptorCarIndex = -1;
  for (let i = 0; i < oppTouches.length; i++) {
    const ot = oppTouches[i];
    const dt = ot.frameIndex - frameIdx;
    let w = 0;
    if (dt >= 0 && dt <= interceptorPreTicks) {
      const u = 1.0 - dt / interceptorPreTicks;
      w = 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, u)) * Math.PI);
    } else if (dt < 0 && -dt <= interceptorPostTicks) {
      const u = 1.0 - -dt / interceptorPostTicks;
      w = 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, u)) * Math.PI);
    }
    w *= REPLAY_DIRECTOR_CONFIG.interceptorFramingWeight ?? 0.72;
    if (w > bestOppW) {
      bestOppW = w;
      interceptorCarIndex = ot.carIndex;
    }
  }

  if (sumW <= 1e-4) {
    return {
      primaryCarIndex,
      nextCarIndex: -1,
      nextTouchBlend: 0,
      nextTouchBallPos: null,
      interceptorCarIndex,
      interceptorBlend: bestOppW,
      plannedPose: null,
      postGoalElapsedSec,
    };
  }

  const effectiveW = sumW / (1.0 + 0.35 * sumW);
  const postGoalFade = postGoalElapsedSec > 0 ? Math.max(0, 1.0 - postGoalElapsedSec / 0.25) : 1.0;
  const nextTouchBlend = anticipationWeight * effectiveW * postGoalFade;

  return {
    primaryCarIndex,
    nextCarIndex,
    nextTouchBlend,
    nextTouchBallPos: {
      x: sumX / sumW,
      y: sumY / sumW,
      z: sumZ / sumW,
    },
    interceptorCarIndex,
    interceptorBlend: bestOppW,
    plannedPose: null,
    postGoalElapsedSec,
  };
}

export function resolveFocusCarForFrame(
  input: ResolveTouchLookaheadInput,
  frameIdx: number,
  fallbackScorerCarIndex = 0
): number {
  return resolveTouchLookaheadForFrame(input, frameIdx, fallbackScorerCarIndex).primaryCarIndex;
}

/**
 * Computes automatic RL-style dramatic slow-motion factor:
 * - Final scoring touch: [-0.50s (-60 ticks) .. +0.25s (+30 ticks)] held at 50% (0.50x)
 * - Goal-line crossing:  [-0.25s (-30 ticks) .. +0.25s (+30 ticks)] held at 50% (0.50x)
 */
export function computeDramaticSlowMoFactor(
  input: DramaticSlowMoInput,
  cursorFloat: number,
  options: { ignoreScrubState?: boolean } = {}
): number {
  const ignoreScrubState = Boolean(options?.ignoreScrubState);
  if (
    input.disableSlowMo ||
    (!ignoreScrubState && (Math.abs(input.playbackSpeed - 1.0) > 0.01 || input.isScrubbing))
  ) {
    return 1.0;
  }
  const rampTicks = 12;
  let factor = 1.0;

  const evalPlateauWindow = (
    dist: number,
    preTicks: number,
    postTicks: number,
    minScale: number
  ): number => {
    if (dist < -(preTicks + rampTicks) || dist > postTicks + rampTicks) {
      return 1.0;
    }
    if (dist >= -preTicks && dist <= postTicks) {
      return minScale;
    }
    const outside = dist < -preTicks ? -preTicks - dist : dist - postTicks;
    const t = Math.max(0, Math.min(1, outside / rampTicks));
    const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
    return minScale + (1.0 - minScale) * ease;
  };

  const touchIdx = input.lastScoringTouchFrameIdx ?? -1;
  if (touchIdx >= 0) {
    const preTouchTicks = Math.max(
      1,
      Math.round((REPLAY_DIRECTOR_CONFIG.lastTouchSlowMoPreSeconds ?? 0.5) * REPLAY_TICK_RATE)
    );
    const postTouchTicks = Math.max(
      1,
      Math.round((REPLAY_DIRECTOR_CONFIG.lastTouchSlowMoPostSeconds ?? 0.25) * REPLAY_TICK_RATE)
    );
    const minTouchScale = REPLAY_DIRECTOR_CONFIG.lastTouchSlowMoScale ?? 0.5;
    factor = Math.min(
      factor,
      evalPlateauWindow(cursorFloat - touchIdx, preTouchTicks, postTouchTicks, minTouchScale)
    );
  }

  const goalIdx = input.goalLineFrameIdx ?? -1;
  if (goalIdx > 0) {
    const preGoalTicks = Math.max(
      1,
      Math.round((REPLAY_DIRECTOR_CONFIG.goalLineSlowMoPreSeconds ?? 0.25) * REPLAY_TICK_RATE)
    );
    const postGoalTicks = Math.max(
      1,
      Math.round((REPLAY_DIRECTOR_CONFIG.goalLineSlowMoPostSeconds ?? 0.25) * REPLAY_TICK_RATE)
    );
    const minGoalScale = REPLAY_DIRECTOR_CONFIG.goalLineSlowMoScale ?? 0.5;
    factor = Math.min(
      factor,
      evalPlateauWindow(cursorFloat - goalIdx, preGoalTicks, postGoalTicks, minGoalScale)
    );
  }

  return Math.max(0.25, Math.min(1.0, factor));
}

export function buildLookaheadInputFromSession(
  sessionState: { scoringTeam: number; scorerCarIndex: number; watchAllTouches: boolean },
  directorState: {
    goalLineFrameIdx?: number;
    scorerCarIndex?: number;
    touchEvents?: ReplayTouchEvent[];
    reboundEvents?: ReplayReboundEvent[];
  },
  suffixPlan: SuffixDirectorTrajectoryPlan | null
): ResolveTouchLookaheadInput {
  return {
    suffixPlan,
    goalLineFrameIdx: directorState.goalLineFrameIdx ?? -1,
    scorerCarIndex: directorState.scorerCarIndex ?? sessionState.scorerCarIndex ?? 0,
    touchEvents: directorState.touchEvents || [],
    reboundEvents: directorState.reboundEvents || [],
    scoringTeam: sessionState.scoringTeam,
    watchAllTouches: sessionState.watchAllTouches,
  };
}

export function resolveSessionTouchLookahead(
  sessionState: { scoringTeam: number; scorerCarIndex: number; watchAllTouches: boolean },
  directorState: {
    goalLineFrameIdx?: number;
    scorerCarIndex?: number;
    touchEvents?: ReplayTouchEvent[];
    reboundEvents?: ReplayReboundEvent[];
  },
  suffixPlan: SuffixDirectorTrajectoryPlan | null,
  frameIdx: number,
  fallbackScorerCarIndex = 0
): ResolvedTouchLookahead {
  return resolveTouchLookaheadForFrame(
    buildLookaheadInputFromSession(sessionState, directorState, suffixPlan),
    frameIdx,
    fallbackScorerCarIndex
  );
}

export function computeSessionDramaticSlowMo(
  sessionState: { disableSlowMo: boolean; playbackSpeed: number; isScrubbing: boolean },
  directorState: { lastScoringTouchFrameIdx?: number; goalLineFrameIdx?: number },
  cursorFloat: number,
  options: { ignoreScrubState?: boolean } = {}
): number {
  return computeDramaticSlowMoFactor(
    {
      disableSlowMo: sessionState.disableSlowMo,
      playbackSpeed: sessionState.playbackSpeed,
      isScrubbing: sessionState.isScrubbing,
      lastScoringTouchFrameIdx: directorState.lastScoringTouchFrameIdx ?? -1,
      goalLineFrameIdx: directorState.goalLineFrameIdx ?? -1,
    },
    cursorFloat,
    options
  );
}
