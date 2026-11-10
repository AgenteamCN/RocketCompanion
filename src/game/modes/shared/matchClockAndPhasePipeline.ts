import { useHudStore } from '../../runtimeUiPort.ts';
import type { MatchStateData } from '../../runtime/RuntimeMatchState.ts';

export const KICKOFF_COUNTDOWN_TICKS = 360;
export const CLOCK_START_FALLBACK_TICKS = 600;
export const POST_GOAL_CELEBRATION_TICKS = 180;
export const POST_GOAL_REPLAY_DELAY_TICKS = 180;
export const POST_MATCH_PODIUM_DELAY_TICKS = 360;
export const BALL_GROUND_Z_THRESHOLD = 110.0;

export interface KickoffCountdownStepResult {
  nextCountdownTicks: number;
  transitionedSecond: 2 | 1 | 0 | null;
  hudPhase: 'kickoff' | 'playing';
  phaseLabel: 'KICKOFF (2)' | 'KICKOFF (1)' | 'PLAYING' | 'OVERTIME' | null;
  audioCue: 'match_countdown_321' | 'match_start_go' | null;
}

export function stepKickoffCountdownState(
  countdownTicks: number,
  isOvertime: boolean
): KickoffCountdownStepResult {
  const nextCountdownTicks = Math.max(0, countdownTicks - 1);

  if (nextCountdownTicks === 240) {
    return {
      nextCountdownTicks,
      transitionedSecond: 2,
      hudPhase: 'kickoff',
      phaseLabel: 'KICKOFF (2)',
      audioCue: 'match_countdown_321',
    };
  }

  if (nextCountdownTicks === 120) {
    return {
      nextCountdownTicks,
      transitionedSecond: 1,
      hudPhase: 'kickoff',
      phaseLabel: 'KICKOFF (1)',
      audioCue: 'match_countdown_321',
    };
  }

  if (nextCountdownTicks === 0) {
    return {
      nextCountdownTicks,
      transitionedSecond: 0,
      hudPhase: 'playing',
      phaseLabel: isOvertime ? 'OVERTIME' : 'PLAYING',
      audioCue: 'match_start_go',
    };
  }

  return {
    nextCountdownTicks,
    transitionedSecond: null,
    hudPhase: 'kickoff',
    phaseLabel: null,
    audioCue: null,
  };
}

export interface MatchClockStepInput {
  clockStarted: boolean;
  clockTickAccum: number;
  ticksSinceKickoff: number;
  ballMoved: boolean;
  ballOnGround: boolean;
  isOvertime: boolean;
  remainingSec: number;
  blueScore: number;
  orangeScore: number;
  requireBallOnGroundForZeroSecondEnd?: boolean;
}

export interface MatchClockStepResult {
  clockStarted: boolean;
  clockTickAccum: number;
  ticksSinceKickoff: number;
  remainingSec: number;
  secondAdvanced: boolean;
  audioCue: 'match_60_seconds_left' | 'match_30_seconds_left' | 'match_countdown_10s' | null;
  timeAlertSecond: number | null;
  zeroSecondOutcome: 'none' | 'overtime' | 'blue-wins' | 'orange-wins';
}

export function stepMatchClockState(input: MatchClockStepInput): MatchClockStepResult {
  const ticksSinceKickoff = input.ticksSinceKickoff + 1;
  const clockStarted =
    input.clockStarted || input.ballMoved || ticksSinceKickoff >= CLOCK_START_FALLBACK_TICKS;

  let clockTickAccum = input.clockTickAccum;
  let remainingSec = input.remainingSec;
  let secondAdvanced = false;
  let audioCue: MatchClockStepResult['audioCue'] = null;
  let timeAlertSecond: number | null = null;

  if (clockStarted) {
    clockTickAccum += 1;
    if (clockTickAccum >= 120) {
      clockTickAccum = 0;
      if (!input.isOvertime) {
        if (remainingSec > 0) {
          remainingSec -= 1;
          secondAdvanced = true;
          if (remainingSec === 60) {
            audioCue = 'match_60_seconds_left';
            timeAlertSecond = 60;
          } else if (remainingSec === 30) {
            audioCue = 'match_30_seconds_left';
            timeAlertSecond = 30;
          } else if (remainingSec >= 1 && remainingSec <= 10) {
            audioCue = 'match_countdown_10s';
            timeAlertSecond = remainingSec;
          }
        }
      } else {
        remainingSec += 1;
        secondAdvanced = true;
      }
    }
  }

  let zeroSecondOutcome: MatchClockStepResult['zeroSecondOutcome'] = 'none';
  const canEndRegulationAtZero =
    !input.isOvertime &&
    clockStarted &&
    remainingSec <= 0 &&
    (input.requireBallOnGroundForZeroSecondEnd === false || input.ballOnGround);

  if (canEndRegulationAtZero) {
    if (input.blueScore === input.orangeScore) {
      zeroSecondOutcome = 'overtime';
    } else if (input.blueScore > input.orangeScore) {
      zeroSecondOutcome = 'blue-wins';
    } else {
      zeroSecondOutcome = 'orange-wins';
    }
  }

  return {
    clockStarted,
    clockTickAccum,
    ticksSinceKickoff,
    remainingSec,
    secondAdvanced,
    audioCue,
    timeAlertSecond,
    zeroSecondOutcome,
  };
}

export interface LocalAuthoritativeMatchStatePatch {
  matchPhase?:
    'kickoff' | 'playing' | 'goal' | 'replay' | 'ended' | 'podium' | 'freeplay' | 'paused';
  kickoffCountdown?: number;
  blueScore?: number;
  orangeScore?: number;
  remainingSeconds?: number;
  isOvertime?: boolean;
  overtimeSeconds?: number;
  localTeam?: 0 | 1;
  winner?: 0 | 1 | 'BLUE' | 'ORANGE' | null;
  winReason?: string | null;
  isReplayActive?: boolean;
  isUnlimited?: boolean;
  goalScorerName?: string | null;
  goalScoringTeam?: 0 | 1 | null;
  goalSpeedKph?: number | null;
  goalAssistName?: string | null;
  replayScorerName?: string | null;
  replayScorerTeam?: 0 | 1 | 'blue' | 'orange' | null;
  replayScorerAnthemId?: string | null;
  replayBallSpeedKph?: number | null;
  replayAssistName?: string | null;
}

export function syncLocalMatchStateToRuntimeAndHud(
  matchState: MatchStateData | null | undefined,
  patch: LocalAuthoritativeMatchStatePatch
): void {
  if (matchState) {
    if (patch.matchPhase !== undefined) {
      matchState.phase = patch.matchPhase;
    }
    if (patch.kickoffCountdown !== undefined) {
      matchState.countdown = patch.kickoffCountdown;
    }
    if (patch.blueScore !== undefined) {
      matchState.blueScore = patch.blueScore;
    }
    if (patch.orangeScore !== undefined) {
      matchState.orangeScore = patch.orangeScore;
    }
    if (patch.remainingSeconds !== undefined) {
      matchState.remainingSeconds = patch.remainingSeconds;
    }
    if (patch.isOvertime !== undefined) {
      matchState.overtime = patch.isOvertime;
    }
    if (patch.overtimeSeconds !== undefined) {
      matchState.overtimeSeconds = patch.overtimeSeconds;
    }
    if (patch.winner !== undefined) {
      matchState.winner =
        patch.winner === 0 || patch.winner === 'BLUE'
          ? 'BLUE'
          : patch.winner === 1 || patch.winner === 'ORANGE'
            ? 'ORANGE'
            : null;
    }
    if (patch.winReason !== undefined) {
      matchState.winReason = patch.winReason;
    }
  }

  useHudStore
    .getState()
    .setMatchState(
      patch as Parameters<ReturnType<typeof useHudStore.getState>['setMatchState']>[0]
    );
}
