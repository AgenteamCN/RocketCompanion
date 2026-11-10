/**
 * experimentalMultiBotsReplayPipeline.ts
 * Pure replay signal, window extraction, match export, and session orchestration
 * helpers for ExperimentalMultiBotsReplayController.
 */

import { extractGoalReplayFrames } from '../../../replay/ReplayPlaybackState.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import { retainCompletedMatchReplayAndNotify } from '../../../replay/ReplayFileExporter.ts';
import { MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { packLoadoutSignalParam2 } from '../../../ui-core/config/vehicleConstants.ts';
import { useExperimentalMultiBotsStore, hudStore } from '../../runtimeUiPort.ts';
import { beginGoalReplaySession } from '../shared/GoalReplaySessionCoordinator.ts';
import {
  type CarControls,
  type ExpGoalIncidentMeta,
  type ExpModeRuntimePort,
  type ExpReplayCarEntry,
  type ExpReplaySignal,
  type ExpSpawnedCarEntry,
  MAX_GOAL_LOOKBACK_SECONDS,
  SCORER_TOUCH_LOOKBACK_SECONDS,
  buildExpCarEntriesForReplay,
  buildExpRosterForExport,
} from './ExperimentalMultiBotsMatchMath.ts';

export function pushExpReplaySignalToSim(
  sim: { pushSignalEvent?: (...args: number[]) => void } | null | undefined,
  sig: ExpReplaySignal
): void {
  if (!sim || typeof sim.pushSignalEvent !== 'function') return;
  sim.pushSignalEvent(
    sig.signalType,
    0,
    sig.param1 | 0,
    sig.param2 | 0,
    0,
    0,
    sig.frameId,
    sig.param1,
    sig.param2,
    sig.signalId,
    0,
    0,
    0,
    0
  );
}

export function emitExpRosterJoinAndLoadoutSignals(
  emitSignal: (signalType: number, param1: number, param2: number) => void,
  configuredDuration: number,
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
): void {
  const carCount = spawnedCars.length;
  emitSignal(MATCH_SIGNALS.MATCH_INITIALIZED, configuredDuration, carCount);
  for (const c of spawnedCars) {
    emitSignal(MATCH_SIGNALS.PLAYER_JOINED, c.carIndex, c.team & 0xff);
    const packed = packLoadoutSignalParam2(c.visualId, c.colorSlot, c.hitboxId, {
      paintFinish: c.paintFinish,
      boostVisual: c.boostVisual,
      boostAudio: c.boostAudio,
    });
    emitSignal(MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED, c.carIndex, packed);
  }
  emitSignal(MATCH_SIGNALS.MATCH_STARTED, configuredDuration, carCount);
}

export function emitExpClockSecondAndAlertSignals(
  emitSignal: (signalType: number, param1: number, param2: number, explicitTick: number) => void,
  currentTick: number,
  remainingSec: number,
  isOvertime: boolean,
  timeAlertSecond: number | null
): void {
  emitSignal(MATCH_SIGNALS.CLOCK_UPDATED_SECONDS, remainingSec, isOvertime ? 1 : 0, currentTick);
  if (timeAlertSecond === 60) {
    emitSignal(MATCH_SIGNALS.TIME_ALERT_60S, 60, 0, currentTick);
  } else if (timeAlertSecond === 30) {
    emitSignal(MATCH_SIGNALS.TIME_ALERT_30S, 30, 0, currentTick);
  } else if (timeAlertSecond !== null) {
    emitSignal(MATCH_SIGNALS.COUNTDOWN_10S, timeAlertSecond, 0, currentTick);
  }
}

export function extractExpGoalReplayWindow(params: {
  ringBuffer: ReplayRingBuffer;
  currentTick: number;
  goalMeta: ExpGoalIncidentMeta;
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>;
}): {
  extractedFrames: ReturnType<typeof extractGoalReplayFrames>;
  carEntries: ExpReplayCarEntry[];
  carTeamResolver: (carIdx: number) => 0 | 1;
} | null {
  const { ringBuffer, currentTick, goalMeta, spawnedCars } = params;
  if (!ringBuffer || ringBuffer.size === 0) return null;
  const goalTick = goalMeta.goalIncidentTick > 0 ? goalMeta.goalIncidentTick : currentTick;
  const postGoalTicks = Math.max(0, currentTick - goalTick);
  const extractedFrames = extractGoalReplayFrames({
    ringBuffer,
    engine: null,
    goalIncidentTick: goalTick,
    scorerTouchTick: goalMeta.goalScorerTouchTick,
    lookbackSeconds: MAX_GOAL_LOOKBACK_SECONDS,
    touchLookbackSeconds: SCORER_TOUCH_LOOKBACK_SECONDS,
    postGoalTicks,
    lastKickoffWillStartTick: goalMeta.lastKickoffStartTick,
  });
  if (!Array.isArray(extractedFrames) || extractedFrames.length === 0) return null;
  const carEntries = buildExpCarEntriesForReplay(spawnedCars);
  const carTeamResolver = (c: number): 0 | 1 => {
    const entry = spawnedCars.find((e) => e.carIndex === c);
    return entry ? entry.team : ((c % 2) as 0 | 1);
  };
  return { extractedFrames, carEntries, carTeamResolver };
}

export function exportCompletedExpMatchReplay(params: {
  ringBuffer: ReplayRingBuffer;
  fallbackState: Float32Array | null;
  winnerTeam: 0 | 1;
  blueScore: number;
  orangeScore: number;
  configuredDuration: number;
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>;
}): void {
  const blueCount = params.spawnedCars.filter((c) => c.team === 0).length || 1;
  const orangeCount = params.spawnedCars.filter((c) => c.team === 1).length || 1;
  const roster = buildExpRosterForExport(params.spawnedCars);
  retainCompletedMatchReplayAndNotify({
    ringBuffer: params.ringBuffer,
    fallbackState: params.fallbackState,
    winnerTeam: params.winnerTeam,
    blueScore: params.blueScore,
    orangeScore: params.orangeScore,
    gameMode: `${blueCount}v${orangeCount}`,
    durationSeconds: params.configuredDuration ?? 300,
    roster,
    loadouts: roster,
  });
}

export function syncReplayInterpolatedCarControls(
  interpolator: ExpModeRuntimePort['interpolator'],
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>,
  carControlsMap: Map<number, CarControls>
): void {
  for (const entry of spawnedCars) {
    const cv = interpolator?.getCurrCarStateView?.(entry.carIndex);
    if (cv) {
      const fwdSpeed = cv.velX * cv.fwdX + cv.velY * cv.fwdY + cv.velZ * cv.fwdZ;
      carControlsMap.set(entry.carIndex, {
        throttle: Math.abs(fwdSpeed) > 25 ? (fwdSpeed > 0 ? 1 : -1) : 0,
        steer: 0,
        pitch: 0,
        yaw: 0,
        roll: 0,
        jump: Boolean(cv.isJumping),
        boost: Boolean(cv.isBoosting),
        handbrake: false,
      });
    }
  }
}

export function syncReplayExitPhaseToKickoff(
  matchState: { phase?: string } | null | undefined
): void {
  if (matchState?.phase === 'replay') {
    matchState.phase = 'kickoff';
  }
  if (hudStore.getState().matchPhase === 'replay') {
    hudStore.getState().setMatchState({ matchPhase: 'kickoff' });
  }
}

export interface ExpGoalReplaySessionStatePort {
  replayCameraMode: 'director' | 'pov';
  replayPovCarIndex: number;
  readonly activeGoalMeta: ExpGoalIncidentMeta;
}

export function launchExpGoalReplaySession(params: {
  simPorts: ExpModeRuntimePort | null;
  timelineCtrl: ReplayTimelineController;
  sessionState: ExpGoalReplaySessionStatePort;
  goalMeta: ExpGoalIncidentMeta;
  initialSnapshot: Float32Array | null;
  totalFrames: number;
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>;
  applyCameraCarIndex: (carIdx: number) => number;
}): void {
  const {
    simPorts,
    timelineCtrl,
    sessionState,
    goalMeta,
    initialSnapshot,
    totalFrames,
    spawnedCars,
    applyCameraCarIndex,
  } = params;
  const store = useExperimentalMultiBotsStore.getState();

  if (simPorts?.match?.state) {
    simPorts.match.state.phase = 'replay';
  }

  applyCameraCarIndex(goalMeta.goalScorerCarIndex);
  store.updateLiveTelemetry({
    matchPhase: 'GOAL REPLAY',
    activeCameraCarIndex: goalMeta.goalScorerCarIndex,
  });

  const scorerCarEntry = spawnedCars.find((e) => e.carIndex === goalMeta.goalScorerCarIndex);
  beginGoalReplaySession(simPorts, timelineCtrl, {
    cameraMode: 'director',
    source: 'exp-multi-bots-replay',
    initialSnapshot,
    totalFrames,
    scoringTeam: goalMeta.goalScoringTeam,
    scorerCarIndex: goalMeta.goalScorerCarIndex,
    scorerName: goalMeta.goalScorerName,
    scorerTeam: goalMeta.goalScoringTeam,
    scorerAnthemId: scorerCarEntry?.anthemId || null,
    ballSpeedKph: goalMeta.goalBallSpeedKph,
    assistName: goalMeta.goalAssistName,
    choreographySignal: 'goal-replay-started',
    getCameraMode: () => sessionState.replayCameraMode,
    setCameraMode: (nextMode) => {
      sessionState.replayCameraMode = nextMode;
    },
    getScoringTeam: () => sessionState.activeGoalMeta.goalScoringTeam,
    getScorerCarIndex: () => sessionState.activeGoalMeta.goalScorerCarIndex,
    getPovCarIndex: () =>
      typeof sessionState.replayPovCarIndex === 'number'
        ? sessionState.replayPovCarIndex
        : sessionState.activeGoalMeta.goalScorerCarIndex,
    setPovCarIndex: (carIdx) => {
      if (typeof carIdx === 'number') {
        sessionState.replayPovCarIndex = carIdx;
      }
    },
    onApplyPovCarIndex: (carIdx) => {
      sessionState.replayPovCarIndex = applyCameraCarIndex(carIdx);
      store.setActiveCameraCarIndex(sessionState.replayPovCarIndex);
    },
  });
}
