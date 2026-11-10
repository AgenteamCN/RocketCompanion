/**
 * src/network/server/match/MatchDomainState.ts
 * Core score, match clock, phase state, and atomic state transitions for authoritative match sessions.
 */

import {
  MATCH_STATES,
  type MatchState,
  type RosterSnapshot,
} from './matchLoadoutAndSpawnPipeline.ts';
import {
  MatchRosterPolicyState,
  type MatchDomainStateOptions,
  type MatchSessionSnapshot,
  type FramePhaseGateAction,
} from './MatchRosterPolicyState.ts';
import { evaluateDomainStepFrameGate } from './matchCommandAndSignalPipeline.ts';

export type { MatchDomainStateOptions, MatchSessionSnapshot, FramePhaseGateAction };

export class MatchDomainState extends MatchRosterPolicyState {
  trainingDisableGoalReset = false;
  trainingUnlimitedBoost = true;
  trainingGoalReplayEnabled = false;
  trainingGoalCelebrationTicks = 150;
  trainingSeconds = 0;
  clockStarted = false;
  requireTouchToStartClock = true;
  kickoffWillStartAt = -1;
  kickoffStartedAtTick = -1;
  lastKickoffWillStartFrame = -1;
  goalBufferTicks = -1;
  willResumeUntilTick = -1;
  podiumDelayTicks = 0;
  pendingOvertimeAfterGoal = false;
  pendingMatchEndAfterGoal = false;
  pendingMatchWinner: number | null = null;

  constructor(opts: MatchDomainStateOptions = {}) {
    super(opts);
    this.trainingDisableGoalReset = Boolean(opts.trainingDisableGoalReset);
    this.trainingUnlimitedBoost = opts.trainingUnlimitedBoost ?? true;
    this.trainingGoalReplayEnabled = Boolean(opts.trainingGoalReplayEnabled ?? false);
    this.trainingGoalCelebrationTicks = opts.trainingGoalCelebrationTicks ?? 150;
    this.requireTouchToStartClock = opts.requireTouchToStartClock ?? true;
  }

  buildSessionSnapshot(roster: RosterSnapshot): MatchSessionSnapshot {
    return {
      roomId: this.roomId,
      gameMode: this.gameMode,
      botFillMode: this.botFillMode,
      state: this.state,
      matchTick: this.matchTick,
      clockDuration: this.clockDuration,
      clockSecondsRemaining: this.clockSecondsRemaining,
      isOvertime: this.isOvertime,
      overtimeSeconds: this.overtimeSeconds,
      blueScore: this.blueScore,
      orangeScore: this.orangeScore,
      winner: this.winner,
      winReason: this.winReason,
      lobbyPhysicsActive: Boolean(this.lobbyPhysicsActive),
      stateOnlyMode: Boolean(this.stateOnlyMode),
      interveneTargetTick: this.interveneTargetTick,
      roster,
    };
  }

  shouldSuppressCountdownClockSignal(): boolean {
    return Boolean(this.isOvertime || this.clockDirection === 'up');
  }

  resetForMatchStart(sec?: number | null) {
    this.resolveValidDuration(sec, true);
    const d = this.clockDuration;
    this.isTrainingMode = false;
    this.state = MATCH_STATES.KICKOFF;
    this.matchTick = 0;
    this.clockSecondsRemaining = d;
    this.isOvertime = false;
    this.overtimeSeconds = 0;
    this.clockDirection = d === 0 ? 'up' : 'down';
    this.blueScore = 0;
    this.orangeScore = 0;
    this.winner = null;
    this.winReason = 0;
    this.lastKickoffWillStartFrame = -1;
    this.kickoffWillStartAt = -1;
    this.kickoffStartedAtTick = -1;
    this.goalBufferTicks = -1;
    this.willResumeUntilTick = -1;
    this.podiumDelayTicks = 0;
    this.clockStarted = false;
    this.pendingMatchEndAfterGoal = false;
    this.pendingMatchWinner = null;
    this.pendingOvertimeAfterGoal = d === 0;
    this.disconnectedPlayerSlots.clear();
    const modeCode = this.gameMode === '1v1' ? 1 : this.gameMode === '2v2' ? 2 : 3;
    return { modeCode, clockDuration: d, clockSecondsRemaining: d, blueScore: 0, orangeScore: 0 };
  }

  applyLobbyOrTrainingTransition(
    mode: 'lobby' | 'training_reset' | 'training_start',
    o: Record<string, unknown> = {}
  ): MatchState {
    if (mode === 'lobby') {
      this.lobbyMode = true;
      this.isTrainingMode = true;
      this.clockDirection = 'up';
      this.state = MATCH_STATES.LOBBY;
      this.winner = null;
      this.winReason = 0;
      this.lobbyPhysicsActive =
        o.lobbyPhysicsActive !== undefined ? Boolean(o.lobbyPhysicsActive) : true;
    } else if (mode === 'training_reset') {
      this.state = MATCH_STATES.PLAYING;
      this.goalBufferTicks = -1;
      this.kickoffWillStartAt = -1;
    } else {
      this.isTrainingMode = true;
      this.stateOnlyMode = false;
      this.interveneTargetTick = -1;
      this.lobbyPhysicsActive = false;
      this.goalBufferTicks = -1;
      this.clockDirection = 'up';
      this.state = MATCH_STATES.PLAYING;
      this.trainingSeconds = 0;
      this.clockSecondsRemaining = 0;
      this.clockStarted = true;
      this.applyTrainingRulesetOptions({
        disableGoalReset: o.disableGoalReset as boolean | undefined,
        unlimitedBoost: o.unlimitedBoost as boolean | undefined,
        goalReplayEnabled: o.goalReplayEnabled as boolean | undefined,
        celebrationTicks: o.goalCelebrationTicks as number | undefined,
      });
      if (o.skipReplayByDefault !== undefined)
        this.skipReplayByDefault = Boolean(o.skipReplayByDefault);
    }
    return this.state;
  }

  beginKickoffPhase(ticks: number) {
    this.state = MATCH_STATES.KICKOFF;
    this.goalBufferTicks = -1;
    this.kickoffStartedAtTick = -1;
    this.clockStarted = !this.requireTouchToStartClock;
    const regTie =
      !this.isTrainingMode &&
      !this.isOvertime &&
      this.clockSecondsRemaining === 0 &&
      this.blueScore === this.orangeScore;
    const startedOvertime = this.pendingOvertimeAfterGoal || regTie;
    if (startedOvertime) {
      this.pendingOvertimeAfterGoal = false;
      this.isOvertime = true;
      this.clockDirection = 'up';
      this.overtimeSeconds = 0;
    }
    this.lastKickoffWillStartFrame = this.matchTick;
    this.kickoffWillStartAt = this.matchTick + ticks;
    return {
      startedOvertime,
      kickoffWillStartAt: this.kickoffWillStartAt,
      isOvertime: this.isOvertime,
    };
  }

  completeKickoffToPlaying(): void {
    if (this.state === MATCH_STATES.KICKOFF) this.state = MATCH_STATES.PLAYING;
    this.kickoffStartedAtTick = this.matchTick;
    this.kickoffWillStartAt = -1;
  }

  applyPauseOrResume(pause: boolean | null, sec = 5) {
    if (pause === null) {
      if (this.state !== MATCH_STATES.PAUSED) return { changed: false, targetResumeTick: -1 };
      this.willResumeUntilTick = this.matchTick + Math.max(1, Math.round(sec * 120));
      return { changed: true, targetResumeTick: this.willResumeUntilTick };
    }
    if (this.state !== MATCH_STATES.PLAYING && this.state !== MATCH_STATES.PAUSED) {
      return { changed: false, targetResumeTick: -1 };
    }
    this.state = pause ? MATCH_STATES.PAUSED : MATCH_STATES.PLAYING;
    this.willResumeUntilTick = -1;
    return { changed: true, targetResumeTick: -1 };
  }

  recordMatchEndedOrPodium(
    act: 'end' | 'podium',
    forcedWinner: number | null = null,
    winReason = 0,
    src?: {
      engine: unknown;
      ringBuffer: { size: number } | null | undefined;
      signals: unknown;
      roster: unknown;
    }
  ) {
    if (act === 'podium') {
      if (this.state !== MATCH_STATES.ENDED)
        return { changed: false, winner: 0, winReason: 0, retentionPayload: null };
      this.state = MATCH_STATES.PODIUM;
      this.podiumDelayTicks = 0;
      const w = typeof this.winner === 'number' ? this.winner : 0;
      return { changed: true, winner: w, winReason: this.winReason ?? 0, retentionPayload: null };
    }
    const winner =
      forcedWinner ??
      (this.blueScore > this.orangeScore ? 0 : this.orangeScore > this.blueScore ? 1 : 2);
    this.state = MATCH_STATES.ENDED;
    this.podiumDelayTicks = 360;
    this.winner = winner;
    this.winReason = winReason;
    const retentionPayload =
      this.isHost && src?.ringBuffer && src.ringBuffer.size > 0
        ? {
            engine: src.engine || null,
            ringBuffer: src.ringBuffer,
            signals: src.signals,
            winnerTeam: winner,
            blueScore: this.blueScore,
            orangeScore: this.orangeScore,
            gameMode: this.gameMode || '3v3',
            durationSeconds: this.clockDuration,
            roster: src.roster,
            loadouts: src.roster,
          }
        : null;
    return { changed: true, winner, winReason, retentionPayload };
  }

  applyGoalScoredOutcome(o: {
    celebrationTicks: number;
    blueScore: number;
    orangeScore: number;
    pendingOvertimeAfterGoal: boolean;
    pendingMatchEndAfterGoal: boolean;
    pendingMatchWinner: number | null;
  }): void {
    this.state = MATCH_STATES.GOAL_SCORED;
    this.goalBufferTicks = o.celebrationTicks;
    this.blueScore = o.blueScore;
    this.orangeScore = o.orangeScore;
    this.pendingOvertimeAfterGoal = o.pendingOvertimeAfterGoal;
    this.pendingMatchEndAfterGoal = o.pendingMatchEndAfterGoal;
    this.pendingMatchWinner = o.pendingMatchWinner;
  }

  stepFramePhaseGate(
    p: 'pre' | 'post' | 'ended_podium_tick',
    pt?: number,
    hasPhys = true
  ): { action: FramePhaseGateAction; clockDuration: number } {
    return evaluateDomainStepFrameGate(this, p, pt, hasPhys);
  }

  advanceClockTickSecond() {
    if (this.isTrainingMode) {
      this.clockDirection = 'up';
      this.trainingSeconds = (this.trainingSeconds || 0) + 1;
      return { mode: 'training' as const, seconds: this.trainingSeconds, overtimeExpired: false };
    }
    if (!this.isOvertime && this.clockDirection !== 'up') {
      this.clockDirection = 'down';
      return this.clockSecondsRemaining > 0
        ? {
            mode: 'regulation' as const,
            seconds: --this.clockSecondsRemaining,
            overtimeExpired: false,
          }
        : { mode: 'none' as const, seconds: 0, overtimeExpired: false };
    }
    this.clockDirection = 'up';
    const seconds = ++this.overtimeSeconds;
    const overtimeExpired = this.maxOvertimeSeconds > 0 && seconds >= this.maxOvertimeSeconds;
    return { mode: 'overtime' as const, seconds, overtimeExpired };
  }

  consumePendingMatchEndAfterGoal() {
    const r = {
      shouldEnd: Boolean(this.pendingMatchEndAfterGoal),
      winner: this.pendingMatchWinner,
    };
    this.pendingMatchEndAfterGoal = false;
    this.pendingMatchWinner = null;
    return r;
  }

  clampGoalBufferTicksForSkip(max: number): void {
    if (this.goalBufferTicks > max) this.goalBufferTicks = max;
  }

  applyTrainingRulesetOptions(o: {
    disableGoalReset?: boolean;
    goalReplayEnabled?: boolean;
    celebrationTicks?: number;
    unlimitedBoost?: boolean;
  }): void {
    if (o.disableGoalReset !== undefined)
      this.trainingDisableGoalReset = Boolean(o.disableGoalReset);
    if (o.goalReplayEnabled !== undefined)
      this.trainingGoalReplayEnabled = Boolean(o.goalReplayEnabled);
    if (typeof o.celebrationTicks === 'number' && o.celebrationTicks > 0) {
      this.trainingGoalCelebrationTicks = Math.round(o.celebrationTicks);
    }
    if (o.unlimitedBoost !== undefined) this.trainingUnlimitedBoost = Boolean(o.unlimitedBoost);
  }

  applySystemControlState(mode: 'state_only' | 'intervene' | 'resume', tick?: number): number {
    if (mode === 'state_only') {
      this.stateOnlyMode = true;
      this.interveneTargetTick = -1;
      if (typeof tick === 'number' && tick >= 0) this.matchTick = tick;
      return this.matchTick;
    }
    if (mode === 'intervene') {
      this.stateOnlyMode = true;
      this.interveneTargetTick = this.matchTick + (tick ?? 0);
      return this.interveneTargetTick;
    }
    this.stateOnlyMode = false;
    this.interveneTargetTick = -1;
    if (this.state === MATCH_STATES.PAUSED || this.state === MATCH_STATES.REPLAY) {
      this.state = MATCH_STATES.PLAYING;
    }
    if (typeof tick === 'number' && tick >= 0) this.matchTick = tick;
    return this.matchTick;
  }
}
