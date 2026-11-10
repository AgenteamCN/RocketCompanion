/**
 * experimentalMultiBotsLifecyclePipeline.ts
 * Pure match lifecycle, kickoff countdown, and clock progression helpers
 * for ExperimentalMultiBotsMatchLifecycleController.
 */

import { MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { useExperimentalMultiBotsStore } from '../../runtimeUiPort.ts';
import { type BallStateViewLike, hasKickoffBallMoved } from '../shared/goalAndBallTouchPipeline.ts';
import {
  KICKOFF_COUNTDOWN_TICKS,
  POST_MATCH_PODIUM_DELAY_TICKS,
  stepKickoffCountdownState,
  stepMatchClockState,
  syncLocalMatchStateToRuntimeAndHud,
} from '../shared/matchClockAndPhasePipeline.ts';
import {
  type ExpGoalIncidentMeta,
  type ExpModeRuntimePort,
  type ExpReplaySignal,
  type ExpSpawnedCarEntry,
  getExpModeAudio,
} from './ExperimentalMultiBotsMatchMath.ts';
import type { PodiumCelebrationController } from '../PodiumCelebrationController.ts';

export interface ExpMatchLifecycleMutableState {
  countdownTicks: number;
  kickoffTick: number;
  ticksSinceKickoff: number;
  lastKickoffStartTick: number;
  clockStarted: boolean;
  clockTickAccum: number;
  configuredDuration: number;
  remainingSec: number;
  overtimeSeconds: number;
  clockDirection: 'up' | 'down';
  isOvertime: boolean;
  isMatchEnded: boolean;
  matchWinnerTeam: 0 | 1;
  podiumDelayTicks: number;
  matchPhase: string;
  blueScore: number;
  orangeScore: number;
  pendingMatchEndAfterReplay: boolean;
  pendingOvertimeAfterReplay: boolean;
  pendingMatchWinner: 0 | 1 | null;
  lastStepInferenceMs: number;
}

export interface ExpLifecycleReplayPort {
  isReplayActive: boolean;
  replayController?: { endReplaySession?: () => void } | null;
  emitReplaySignal(
    signalType: number,
    param1?: number,
    param2?: number,
    explicitTick?: number | null
  ): ExpReplaySignal;
  emitClockSecondAndAlertSignals(
    currentTick: number,
    remainingSec: number,
    isOvertime: boolean,
    timeAlertSecond: number | null
  ): void;
  retainMatchReplayAndNotify(params: {
    winnerTeam: 0 | 1;
    blueScore: number;
    orangeScore: number;
    configuredDuration: number;
    goalMeta: ExpGoalIncidentMeta;
    spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>;
  }): void;
}

export interface ExpLifecycleTrackerPort {
  goalResetTicks: number;
  resetPlayTouchAndGoalState(): void;
  getGoalIncidentMeta(lastKickoffStartTick: number): ExpGoalIncidentMeta;
  syncKickoffCountdownStart(
    simPorts: ExpModeRuntimePort | null,
    matchPhase: string,
    blueScore: number,
    orangeScore: number,
    isOvertime: boolean,
    remainingSec: number,
    enteringOvertimeNow: boolean
  ): void;
  syncCountdownTransitionHudAndAudio(
    simPorts: ExpModeRuntimePort | null,
    second: number,
    matchPhase: string,
    audioCue: string | null
  ): void;
  syncMatchEndHudAndAudio(
    simPorts: ExpModeRuntimePort | null,
    matchPhase: string,
    blueScore: number,
    orangeScore: number,
    remainingSec: number,
    winnerTeam: 0 | 1
  ): void;
  syncPeriodicPlayingTelemetry(
    simPorts: ExpModeRuntimePort | null,
    remainingSec: number,
    isOvertime: boolean,
    matchPhase: string,
    totalInferenceMs: number
  ): void;
}

export function computeConfiguredMatchDuration(rawDurationSec: unknown): number {
  return typeof rawDurationSec === 'number' && Number.isFinite(rawDurationSec)
    ? Math.max(0, Math.round(rawDurationSec))
    : 300;
}

export function resolveLocalPlayerTeamFromRoster(
  humanPlayerCarIndex: number,
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
): 0 | 1 {
  return humanPlayerCarIndex >= 0 && spawnedCars[humanPlayerCarIndex]?.team === 1 ? 1 : 0;
}

export function initializeExpMatchClockState(
  state: ExpMatchLifecycleMutableState,
  rawDurationSec: unknown
): number {
  const configuredDuration = computeConfiguredMatchDuration(rawDurationSec);
  state.configuredDuration = configuredDuration;
  state.blueScore = 0;
  state.orangeScore = 0;
  state.remainingSec = configuredDuration;
  state.isOvertime = false;
  state.pendingOvertimeAfterReplay = configuredDuration === 0;
  state.overtimeSeconds = 0;
  state.clockDirection = configuredDuration === 0 ? 'up' : 'down';
  return configuredDuration;
}

export function startExpKickoffCountdownState(
  state: ExpMatchLifecycleMutableState,
  simPorts: ExpModeRuntimePort | null,
  tracker: ExpLifecycleTrackerPort,
  replayPort: ExpLifecycleReplayPort
): void {
  replayPort.replayController?.endReplaySession?.();
  replayPort.isReplayActive = false;
  simPorts?.releaseGoalReplayCameraOverride?.();
  tracker.resetPlayTouchAndGoalState();

  const enteringOvertimeNow =
    Boolean(state.pendingOvertimeAfterReplay) ||
    (!state.isOvertime && state.remainingSec === 0 && state.blueScore === state.orangeScore);
  if (enteringOvertimeNow) {
    state.pendingOvertimeAfterReplay = false;
    state.isOvertime = true;
    state.overtimeSeconds = 0;
    state.clockDirection = 'up';
    replayPort.emitReplaySignal(MATCH_SIGNALS.OVERTIME_START, 0, 0);
  }

  state.countdownTicks = KICKOFF_COUNTDOWN_TICKS;
  state.kickoffTick = 0;
  state.ticksSinceKickoff = 0;
  state.clockStarted = false;
  state.clockTickAccum = 0;
  state.matchPhase = 'kickoff (3)';
  state.lastKickoffStartTick = Math.floor(simPorts?.physics?.getHeaderView?.()?.tickCount ?? 0) + 1;
  replayPort.emitReplaySignal(MATCH_SIGNALS.KICKOFF_WILL_START, KICKOFF_COUNTDOWN_TICKS, 3);

  tracker.syncKickoffCountdownStart(
    simPorts,
    state.matchPhase,
    state.blueScore,
    state.orangeScore,
    state.isOvertime,
    state.remainingSec,
    enteringOvertimeNow
  );
}

export function finishExpMatchState(
  state: ExpMatchLifecycleMutableState,
  winnerTeam: 0 | 1,
  simPorts: ExpModeRuntimePort | null,
  podiumCtrl: PodiumCelebrationController,
  tracker: ExpLifecycleTrackerPort,
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>,
  replayPort: ExpLifecycleReplayPort
): void {
  const currentTick = Math.floor(simPorts?.physics?.getHeaderView?.()?.tickCount ?? 0);

  replayPort.emitReplaySignal(MATCH_SIGNALS.MATCH_ENDED, winnerTeam, 0, currentTick);
  replayPort.retainMatchReplayAndNotify({
    winnerTeam,
    blueScore: state.blueScore,
    orangeScore: state.orangeScore,
    configuredDuration: state.configuredDuration,
    goalMeta: tracker.getGoalIncidentMeta(state.lastKickoffStartTick),
    spawnedCars,
  });

  replayPort.replayController?.endReplaySession?.();
  replayPort.isReplayActive = false;
  state.isMatchEnded = true;
  state.matchWinnerTeam = winnerTeam;
  state.podiumDelayTicks = POST_MATCH_PODIUM_DELAY_TICKS;
  state.isOvertime = false;
  tracker.goalResetTicks = 0;
  state.pendingMatchEndAfterReplay = false;
  state.matchPhase = winnerTeam === 0 ? 'MATCH END (BLUE WINS)' : 'MATCH END (ORANGE WINS)';

  if (simPorts) {
    simPorts._localSkipReplayReady = false;
    simPorts.releaseGoalReplayCameraOverride();
    simPorts.podiumController = podiumCtrl;
  }

  tracker.syncMatchEndHudAndAudio(
    simPorts,
    state.matchPhase,
    state.blueScore,
    state.orangeScore,
    state.remainingSec,
    winnerTeam
  );
}

export function stepExpCountdownPhaseState(
  state: ExpMatchLifecycleMutableState,
  currentTick: number,
  simPorts: ExpModeRuntimePort | null,
  tracker: ExpLifecycleTrackerPort,
  replayPort: ExpLifecycleReplayPort
): boolean {
  if (state.countdownTicks <= 0) return false;
  const stepRes = stepKickoffCountdownState(state.countdownTicks, state.isOvertime);
  state.countdownTicks = stepRes.nextCountdownTicks;

  if (stepRes.transitionedSecond === 2 || stepRes.transitionedSecond === 1) {
    const sec = stepRes.transitionedSecond;
    state.matchPhase = `kickoff (${sec})`;
    replayPort.emitReplaySignal(MATCH_SIGNALS.KICKOFF_WILL_START, state.countdownTicks, sec);
    tracker.syncCountdownTransitionHudAndAudio(simPorts, sec, state.matchPhase, stepRes.audioCue);
  } else if (stepRes.transitionedSecond === 0) {
    state.matchPhase = state.isOvertime ? 'overtime' : 'playing';
    state.lastKickoffStartTick = currentTick + 1;
    replayPort.emitReplaySignal(MATCH_SIGNALS.KICKOFF_START, 0, 0);
    tracker.syncCountdownTransitionHudAndAudio(simPorts, 0, state.matchPhase, stepRes.audioCue);
  }
  return true;
}

export function syncOvertimeResetHudAndStore(
  matchState: NonNullable<ExpModeRuntimePort['match']>['state'],
  tiedScore: number
): void {
  useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
    blueScore: tiedScore,
    orangeScore: tiedScore,
    remainingSec: 0,
    isOvertime: true,
  });
  syncLocalMatchStateToRuntimeAndHud(matchState, {
    blueScore: tiedScore,
    orangeScore: tiedScore,
    remainingSeconds: 0,
    isOvertime: true,
    overtimeSeconds: 0,
  });
}

export function stepExpPlayingClockPipeline(
  state: ExpMatchLifecycleMutableState,
  currentTick: number,
  bView: BallStateViewLike | null | undefined,
  ballOnGround: boolean,
  simPorts: ExpModeRuntimePort | null,
  tracker: ExpLifecycleTrackerPort,
  replayPort: ExpLifecycleReplayPort
): 'none' | 'overtime' | 'blue-wins' | 'orange-wins' {
  const prevRemSec = state.remainingSec;
  const clockStep = stepMatchClockState({
    clockStarted: state.clockStarted,
    clockTickAccum: state.clockTickAccum,
    ticksSinceKickoff: state.ticksSinceKickoff,
    ballMoved: hasKickoffBallMoved(bView),
    ballOnGround,
    isOvertime: state.isOvertime,
    remainingSec: state.remainingSec,
    blueScore: state.blueScore,
    orangeScore: state.orangeScore,
  });

  state.clockStarted = clockStep.clockStarted;
  state.clockTickAccum = clockStep.clockTickAccum;
  state.ticksSinceKickoff = clockStep.ticksSinceKickoff;
  state.remainingSec = clockStep.remainingSec;

  if (clockStep.secondAdvanced) {
    replayPort.emitClockSecondAndAlertSignals(
      currentTick,
      clockStep.remainingSec,
      state.isOvertime,
      clockStep.timeAlertSecond
    );
    if (clockStep.audioCue) {
      getExpModeAudio(simPorts)?.play?.(
        clockStep.audioCue,
        1.0,
        clockStep.audioCue === 'match_countdown_10s' ? undefined : 10000
      );
    }
  }

  if (
    clockStep.zeroSecondOutcome === 'overtime' ||
    clockStep.zeroSecondOutcome === 'blue-wins' ||
    clockStep.zeroSecondOutcome === 'orange-wins'
  ) {
    return clockStep.zeroSecondOutcome;
  }

  if (clockStep.ticksSinceKickoff % 8 === 0 || clockStep.remainingSec !== prevRemSec) {
    tracker.syncPeriodicPlayingTelemetry(
      simPorts,
      clockStep.remainingSec,
      state.isOvertime,
      state.matchPhase,
      state.lastStepInferenceMs || 0
    );
  }

  return 'none';
}
