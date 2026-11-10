/**
 * ReplayTouchTimelineAnalyzer.ts
 * Pure narrow-input pipeline for touch event timeline extraction, suffix camera trajectory
 * planning, per-frame lookahead focus car resolution, and dramatic slow-motion curves.
 */

import {
  SIM_OFFSETS,
  CAR_STATE_STRIDE,
  MAX_CARS,
  PHYSICS_EVENT_TYPES,
  INCIDENT_EVENT_TYPES,
} from '../physics/RocketSimConstants.ts';
import type { ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import type {
  ReplayReboundEvent,
  SuffixCameraPlanInput,
  ResolveTouchLookaheadInput,
  DramaticSlowMoInput,
  ResolvedTouchLookahead,
} from './replayTouchLookaheadPipeline.ts';

export type {
  ReplayReboundEvent,
  SuffixCameraPlanInput,
  ResolveTouchLookaheadInput,
  DramaticSlowMoInput,
  ResolvedTouchLookahead,
};

export interface ReplayTouchAnalysisConfig {
  scoringTeam?: number;
  isNetworkStreamed?: boolean;
  watchAllTouches?: boolean;
  carTeamResolver?: ((carIndex: number) => number) | null;
  scorerCarIndex?: number;
}

export interface ReplayTouchAnalysisResult {
  touchEvents: ReplayTouchEvent[];
  reboundEvents: ReplayReboundEvent[];
  lastScoringTouchFrameIdx: number;
  goalLineFrameIdx: number;
  resolvedScorerCarIndex: number;
  openingCarIndex: number;
  resolvedLateralBias: number;
  initialSettledCarPos: { carIndex: number; x: number; y: number; z: number } | null;
}

export function analyzeReplayTouchTimeline(
  frames: ReadonlyArray<any>,
  config: ReplayTouchAnalysisConfig = {}
): ReplayTouchAnalysisResult {
  const total = Array.isArray(frames) ? frames.length : 0;
  const scoringTeam = config.scoringTeam ?? 0;
  const goalSignY = scoringTeam === 0 ? 1.0 : -1.0;
  const carTeamResolver =
    typeof config.carTeamResolver === 'function' ? config.carTeamResolver : (c: number) => c % 2;
  const fallbackScorer =
    typeof config.scorerCarIndex === 'number' && config.scorerCarIndex >= 0
      ? config.scorerCarIndex
      : 0;

  const touchEvents: ReplayTouchEvent[] = [];
  const reboundEvents: ReplayReboundEvent[] = [];
  let goalLineFrameIdx = -1;
  let sumPreGoalBallX = 0;
  let countPreGoalBallX = 0;
  let trajectorySideScore = 0;

  const pushTouchCandidate = (
    idx: number,
    tick: number,
    carIndex: number,
    team: number,
    ballX: number,
    ballY: number,
    ballZ: number
  ) => {
    const prevTouch = touchEvents[touchEvents.length - 1];
    if (!prevTouch || prevTouch.carIndex !== carIndex || idx - prevTouch.frameIndex > 10) {
      touchEvents.push({
        frameIndex: idx,
        tick,
        carIndex,
        team,
        ballX,
        ballY,
        ballZ,
      });
    }
  };

  const pushReboundCandidate = (
    idx: number,
    tick: number,
    ballX: number,
    ballY: number,
    ballZ: number,
    normX = 0,
    normY = 0
  ) => {
    const prevRebound = reboundEvents[reboundEvents.length - 1];
    if (!prevRebound || idx - prevRebound.frameIndex > 14) {
      reboundEvents.push({
        frameIndex: idx,
        tick,
        ballX,
        ballY,
        ballZ,
        normX,
        normY,
      });
    }
  };

  for (let idx = 0; idx < total; idx++) {
    const entry = frames[idx];
    if (!entry) continue;
    const snap = entry.snapshot;
    if (snap && snap.length > 6) {
      const ballX = snap[4] || 0;
      const ballY = snap[5] || 0;
      const bvx = snap.length > 17 ? snap[16] || 0 : 0;
      const bvy = snap.length > 17 ? snap[17] || 0 : 0;

      if (goalLineFrameIdx >= 0 && ballY * goalSignY < 5020) {
        goalLineFrameIdx = -1;
      }
      if (goalLineFrameIdx < 0) {
        const recencyWeight = 0.5 + 0.5 * (idx / Math.max(1, total - 1));
        sumPreGoalBallX += ballX * recencyWeight;
        countPreGoalBallX += recencyWeight;
        const forwardWeight = Math.max(0.15, (bvy * goalSignY) / 1200.0);
        trajectorySideScore += (-ballX * 0.65 - bvx * 0.22) * forwardWeight * recencyWeight;
        if (ballY * goalSignY >= 5100) {
          goalLineFrameIdx = idx;
        }
      }
    }

    let recordedIncidentTouch = false;
    let recordedIncidentRebound = false;
    const evList =
      Array.isArray(entry.incidents) && entry.incidents.length > 0
        ? entry.incidents
        : Array.isArray(entry.events)
          ? entry.events
          : [];
    if (evList.length > 0) {
      for (let j = 0; j < evList.length; j++) {
        const inc = evList[j];
        if (!inc) continue;
        if (
          inc.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT ||
          inc.type === PHYSICS_EVENT_TYPES.CAR_BALL_HIT ||
          inc.type === 0x01
        ) {
          const numCars = Math.min(
            MAX_CARS,
            Math.max(1, Math.round(snap?.[SIM_OFFSETS.NUM_CARS] || 1))
          );
          const rawCarIndex = inc.carIndex ?? inc.primaryId ?? -1;
          const carIndex = rawCarIndex >= 0 && rawCarIndex < numCars ? rawCarIndex : 0;
          if (rawCarIndex >= 0) {
            const team = carTeamResolver(carIndex);
            const ballX = snap && snap.length > 6 ? snap[4] : 0;
            const ballY = snap && snap.length > 6 ? snap[5] : 0;
            const ballZ = snap && snap.length > 6 ? snap[6] : 93;
            pushTouchCandidate(idx, entry.tick ?? idx, carIndex, team, ballX, ballY, ballZ);
            recordedIncidentTouch = true;
          }
        } else if (
          inc.type === INCIDENT_EVENT_TYPES.BALL_WORLD_HIT ||
          inc.type === INCIDENT_EVENT_TYPES.BALL_GOALPOST_HIT ||
          inc.type === 0x04 ||
          inc.type === 0x05
        ) {
          const ballX = snap && snap.length > 6 ? snap[4] : (inc.posX ?? inc.x ?? 0);
          const ballY = snap && snap.length > 6 ? snap[5] : (inc.posY ?? inc.y ?? 0);
          const ballZ = snap && snap.length > 6 ? snap[6] : (inc.posZ ?? inc.z ?? 93);
          const nz = inc.normZ ?? inc.nz ?? 0;
          if (Math.abs(nz) < 0.75 && (goalLineFrameIdx < 0 || idx <= goalLineFrameIdx)) {
            pushReboundCandidate(
              idx,
              entry.tick ?? idx,
              ballX,
              ballY,
              ballZ,
              inc.normX ?? inc.nx ?? 0,
              inc.normY ?? inc.ny ?? 0
            );
            recordedIncidentRebound = true;
          }
        }
      }
    }

    if (
      idx > 1 &&
      (goalLineFrameIdx < 0 || idx <= goalLineFrameIdx + 4) &&
      snap &&
      snap.length >= 22
    ) {
      const prevSnap = frames[idx - 1]?.snapshot;
      if (prevSnap && prevSnap.length >= 22) {
        const dvx = (snap[16] || 0) - (prevSnap[16] || 0);
        const dvy = (snap[17] || 0) - (prevSnap[17] || 0);
        const dvz = (snap[18] || 0) - (prevSnap[18] || 0);
        const impulse = Math.hypot(dvx, dvy, dvz + 5.4);
        if (impulse > 180.0) {
          const ballX = snap[4] || 0;
          const ballY = snap[5] || 0;
          const ballZ = snap[6] || 93;
          const numCars = Math.min(
            MAX_CARS,
            Math.max(0, Math.round(snap[SIM_OFFSETS.NUM_CARS] || 0))
          );
          let bestCar = -1;
          let bestDist = 265.0;
          for (let c = 0; c < numCars; c++) {
            const cBase = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
            if (snap.length < cBase + 3) continue;
            const dist = Math.hypot(
              (snap[cBase] || 0) - ballX,
              (snap[cBase + 1] || 0) - ballY,
              (snap[cBase + 2] || 0) - ballZ
            );
            if (dist < bestDist) {
              bestDist = dist;
              bestCar = c;
            }
          }
          if (bestCar >= 0 && !recordedIncidentTouch) {
            const team = carTeamResolver(bestCar);
            pushTouchCandidate(idx, entry.tick ?? idx, bestCar, team, ballX, ballY, ballZ);
          } else if (
            bestCar < 0 &&
            !recordedIncidentRebound &&
            Math.hypot(dvx, dvy) > 240.0 &&
            (Math.abs(ballX) > 3820 ||
              Math.abs(ballY) > 4820 ||
              Math.abs(ballX) + Math.abs(ballY) > 7480)
          ) {
            const horizNorm = Math.hypot(dvx, dvy) || 1.0;
            pushReboundCandidate(
              idx,
              entry.tick ?? idx,
              ballX,
              ballY,
              ballZ,
              dvx / horizNorm,
              dvy / horizNorm
            );
          }
        }
      }
    }
  }

  if (goalLineFrameIdx < 0 && total > 0 && !config.isNetworkStreamed) {
    goalLineFrameIdx = Math.max(0, total - 360);
  }

  let lastScoringTouchFrameIdx = -1;
  let resolvedScorerCarIndex = fallbackScorer;
  const maxTouchSearchFrame = goalLineFrameIdx >= 0 ? goalLineFrameIdx + 12 : total;
  for (let i = touchEvents.length - 1; i >= 0; i--) {
    const t = touchEvents[i];
    if (t.frameIndex <= maxTouchSearchFrame && (config.watchAllTouches || t.team === scoringTeam)) {
      lastScoringTouchFrameIdx = t.frameIndex;
      resolvedScorerCarIndex = t.carIndex;
      break;
    }
  }
  if (lastScoringTouchFrameIdx < 0 && touchEvents.length > 0) {
    const lastT = touchEvents[touchEvents.length - 1];
    lastScoringTouchFrameIdx = lastT.frameIndex;
    resolvedScorerCarIndex = lastT.carIndex;
  }

  const scoringTouches = touchEvents.filter((t) => t.team === scoringTeam);
  const candidateTouches = scoringTouches.length > 0 ? scoringTouches : touchEvents;
  const openingCarIndex =
    candidateTouches.length > 0 ? candidateTouches[0].carIndex : resolvedScorerCarIndex;

  let reboundSideScore = 0;
  for (let i = 0; i < reboundEvents.length; i++) {
    const rb = reboundEvents[i];
    if (goalLineFrameIdx >= 0 && rb.frameIndex > goalLineFrameIdx) continue;
    reboundSideScore += -rb.ballX * 0.9 + rb.normX * 450.0;
  }

  const openSnap = frames[Math.min(Math.max(0, total - 1), 6)]?.snapshot;
  const openCarBase = SIM_OFFSETS.CARS + Math.max(0, openingCarIndex) * CAR_STATE_STRIDE;
  const openCarRelX =
    openSnap && openSnap.length > openCarBase + 2
      ? (openSnap[openCarBase] || 0) - (openSnap[SIM_OFFSETS.BALL] || 0)
      : 0;
  const meanBallX = countPreGoalBallX > 0 ? sumPreGoalBallX / countPreGoalBallX : 0;
  const wallBlend = Math.max(0, Math.min(1, (Math.abs(meanBallX) - 1800.0) / 1300.0));
  const combinedInteriorMetric =
    (-meanBallX * 0.65 +
      (reboundEvents.length > 0 ? reboundSideScore / reboundEvents.length : 0) * 0.35) *
      wallBlend +
    openCarRelX * (1.0 - wallBlend * 0.85);
  const interiorSign = combinedInteriorMetric >= 0 ? 1.0 : -1.0;
  const resolvedLateralBias = -goalSignY * interiorSign >= 0 ? 1.0 : -1.0;

  let initialSettledCarPos: { carIndex: number; x: number; y: number; z: number } | null = null;
  const maxCheckIdx = Math.min(total - 1, 3);
  for (let idx = 1; idx <= maxCheckIdx; idx++) {
    const prevSnap = frames[idx - 1]?.snapshot;
    const currSnap = frames[idx]?.snapshot;
    if (!prevSnap || !currSnap) continue;
    const numCars = Math.min(
      Math.round(prevSnap[SIM_OFFSETS.NUM_CARS] || 0),
      Math.round(currSnap[SIM_OFFSETS.NUM_CARS] || 0),
      MAX_CARS
    );
    if (openingCarIndex >= 0 && openingCarIndex < numCars) {
      const base = SIM_OFFSETS.CARS + openingCarIndex * CAR_STATE_STRIDE;
      const stepDist = Math.hypot(
        currSnap[base + 0] - prevSnap[base + 0],
        currSnap[base + 1] - prevSnap[base + 1],
        currSnap[base + 2] - prevSnap[base + 2]
      );
      if (stepDist > 180.0) {
        initialSettledCarPos = {
          carIndex: openingCarIndex,
          x: currSnap[base + 0],
          y: currSnap[base + 1],
          z: currSnap[base + 2],
        };
      }
    }
  }

  return {
    touchEvents,
    reboundEvents,
    lastScoringTouchFrameIdx,
    goalLineFrameIdx,
    resolvedScorerCarIndex,
    openingCarIndex,
    resolvedLateralBias,
    initialSettledCarPos,
  };
}

export function analyzeAndSyncReplayTouchTimelineState(
  sessionState: {
    activeFrames: ReadonlyArray<any>;
    scoringTeam: number;
    isNetworkStreamed: boolean;
    watchAllTouches: boolean;
    carTeamResolver: ((carIndex: number) => number) | null;
    scorerCarIndex: number;
    reboundEvents?: ReplayReboundEvent[];
    goalLineFrameIdx?: number;
    lateralBias?: number;
    cachedSuffixCameraPlan?: unknown;
  },
  directorCamera: { onTimelineAnalyzed: (res: ReplayTouchAnalysisResult) => void },
  options: ReplayTouchAnalysisConfig = {}
): void {
  const res = analyzeReplayTouchTimeline(sessionState.activeFrames, {
    scoringTeam: sessionState.scoringTeam,
    isNetworkStreamed: sessionState.isNetworkStreamed,
    watchAllTouches: sessionState.watchAllTouches,
    carTeamResolver: options.carTeamResolver ?? sessionState.carTeamResolver,
    scorerCarIndex: options.scorerCarIndex ?? sessionState.scorerCarIndex,
  });
  Object.assign(sessionState, {
    reboundEvents: res.reboundEvents,
    goalLineFrameIdx: res.goalLineFrameIdx,
    lateralBias: res.resolvedLateralBias,
    cachedSuffixCameraPlan: null,
  });
  directorCamera.onTimelineAnalyzed(res);
}

export function appendStreamedReplayFrameToState(
  sessionState: {
    activeFrames: any[];
    streamedFramesReceived: number;
    hasRetainedReplay: boolean;
    scoringTeam: number;
    isNetworkStreamed: boolean;
    watchAllTouches: boolean;
    carTeamResolver: ((carIndex: number) => number) | null;
    scorerCarIndex: number;
    isPaused: boolean;
    isScrubbing: boolean;
    cursorFloat: number;
  },
  directorCamera: {
    onTimelineAnalyzed: (res: ReplayTouchAnalysisResult) => void;
    preserveSmoothingAround: (fn: () => void) => void;
    applyStreamedTelemetry: (
      snap: Float32Array,
      isFollowingLive: boolean,
      scorerCarIndex: number
    ) => number;
  },
  stateSnapshot: Float32Array | number[],
  serverTick = 0,
  acknowledgedControls: any[] | null = null
): number {
  if (!stateSnapshot || stateSnapshot.length < 410) return 0;
  const snap = new Float32Array(stateSnapshot.length);
  snap.set(stateSnapshot);

  const nextFrames = sessionState.streamedFramesReceived === 0 ? [] : sessionState.activeFrames;
  const nextCount = sessionState.streamedFramesReceived + 1;
  const tick = Math.floor(snap[SIM_OFFSETS.TICK] || serverTick || nextCount);
  const lastEntry = nextFrames.length > 0 ? nextFrames[nextFrames.length - 1] : null;

  if (!lastEntry || lastEntry.tick !== tick) {
    nextFrames.push({
      tick,
      snapshot: snap,
      acknowledgedControls: acknowledgedControls || null,
      incidents: [],
      signals: [],
      audioEvents: [],
    });
    Object.assign(sessionState, {
      activeFrames: nextFrames,
      streamedFramesReceived: nextCount,
      hasRetainedReplay: true,
    });
    directorCamera.preserveSmoothingAround(() => {
      analyzeAndSyncReplayTouchTimelineState(sessionState, directorCamera, {
        carTeamResolver: sessionState.carTeamResolver,
        scorerCarIndex: sessionState.scorerCarIndex,
      });
    });
  } else {
    Object.assign(sessionState, { activeFrames: nextFrames, streamedFramesReceived: nextCount });
    if (acknowledgedControls && !lastEntry.acknowledgedControls) {
      lastEntry.acknowledgedControls = acknowledgedControls;
    }
  }

  const isFollowingLive = !sessionState.isPaused && !sessionState.isScrubbing;
  const resolvedScorer = directorCamera.applyStreamedTelemetry(
    snap,
    isFollowingLive,
    sessionState.scorerCarIndex
  );
  Object.assign(sessionState, {
    scorerCarIndex: resolvedScorer,
    ...(isFollowingLive ? { cursorFloat: Math.max(0, sessionState.activeFrames.length - 1) } : {}),
  });
  return sessionState.activeFrames.length;
}
