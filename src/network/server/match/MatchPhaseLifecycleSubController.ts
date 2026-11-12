/**
 * src/network/server/match/MatchPhaseLifecycleSubController.ts
 * Stateful SubController owning the authoritative match phase state machine,
 * clock progression, and frame packet encoding.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import { REPLAY_BUFFER_MODES } from '../../../replay/ReplayRingBuffer.ts';
import {
  MATCH_STATES,
  KICKOFF_TOTAL_TICKS,
  type MatchState,
  type RosterSessionManagerPort,
} from './matchLoadoutAndSpawnPipeline.ts';
import {
  emitRosterJoinAndLoadoutSignals,
  configureLobbyPhysicsArena,
  dispatchFlipResetIncidents,
  resolvePossessionTieBreakWinner,
  evaluateGoalScoredOutcome,
  encodeMatchGlobalFramePacket,
  advancePlayingClockState,
  type LifecyclePhysicsManagerPort,
  type LifecyclePhysicsSnapshotPort,
  type LifecycleDiagnosticsPort,
  type LifecycleReplayBufferPort,
} from './matchLifecyclePipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';
import type { MatchRosterSubController } from './MatchRosterSubController.ts';
import type { MatchCommandQueueSubController } from './MatchCommandQueueSubController.ts';
import type { MatchGoalReplaySubController } from './MatchGoalReplaySubController.ts';
import type { MatchSystemControlSubController } from './MatchSystemControlSubController.ts';

export type LobbyEnterOptions = Record<string, unknown>;
export type PhaseLifecyclePhysicsSnapshotPort = LifecyclePhysicsSnapshotPort;
export type PhaseLifecyclePhysicsManagerPort = LifecyclePhysicsManagerPort;
export type PhaseLifecycleDiagnosticsPort = LifecycleDiagnosticsPort;
export type PhaseLifecycleReplayBufferPort = LifecycleReplayBufferPort;

export interface PhaseLifecycleSessionManagerPort extends RosterSessionManagerPort {
  sessions?: Map<string, unknown>;
  signalBuffer?: {
    entries?: Map<unknown, unknown>;
    clear?: () => void;
    pruneExpired: (tick: number, keys?: Iterable<string>) => void;
  } | null;
}

export interface MatchPhaseLifecycleHostPort {
  readonly domain: MatchDomainState;
  readonly roster: MatchRosterSubController;
  readonly commandQueue: MatchCommandQueueSubController;
  readonly goalReplay: MatchGoalReplaySubController;
  readonly systemControl?: MatchSystemControlSubController;
  readonly physicsManager: PhaseLifecyclePhysicsManagerPort | null | undefined;
  readonly sessionManager: PhaseLifecycleSessionManagerPort | null | undefined;
  readonly diagnosticsController: PhaseLifecycleDiagnosticsPort | null | undefined;
  readonly replayBuffer: PhaseLifecycleReplayBufferPort | null | undefined;
  readonly onClearRetainedReplay: (() => void) | null;
  readonly onRetainCompletedReplay: ((data: Record<string, unknown>) => void) | null;
}

export class MatchPhaseLifecycleSubController {
  readonly host: MatchPhaseLifecycleHostPort;

  constructor(host: MatchPhaseLifecycleHostPort) {
    this.host = host;
  }

  get state(): MatchState {
    return this.host.domain.state;
  }
  set state(v: MatchState) {
    this.host.domain.state = v;
  }
  get matchTick(): number {
    return this.host.domain.matchTick;
  }
  set matchTick(v: number) {
    this.host.domain.matchTick = v;
  }
  get winner(): number | null {
    return this.host.domain.winner;
  }
  set winner(v: number | null) {
    this.host.domain.winner = v;
  }

  private prepareArenaForActiveMatch(skipBotFillIfAlreadyPopulated = false): void {
    const { domain: d, physicsManager: pm, diagnosticsController: dc, roster: r } = this.host;
    d.lobbyPhysicsActive = false;
    pm?.inputBuffer?.setLobbyMode?.(false);
    if (dc) {
      dc.enabled = false;
      if (pm) dc.releasePhysics(pm);
    }
    if (!skipBotFillIfAlreadyPopulated || r.players.size < d.maxPlayers) {
      r.applyBotFillPolicy();
    }
    r.syncRosterPhysicsEntities();
    pm?.sim?.setUnlimitedBoost?.(false);
    pm?.restoreSolidCollisions?.();
  }

  private resetArenaKickoffSpawns(maskInput?: boolean): void {
    const { domain: d, physicsManager: pm, roster: r } = this.host;
    if (!pm) return;
    const targetTick = Math.max(d.matchTick, pm.currentTick);
    r.applyPendingHitboxSwaps();
    pm.resetKickoff(0);
    r.applyRosterKickoffSpawns();
    if (maskInput !== undefined) pm.setInputMask?.(maskInput);
    if (targetTick > pm.currentTick) {
      pm.currentTick = targetTick;
      const snap = pm.sim?.saveCompactState?.() ?? pm.sim?.saveState?.();
      if (snap && snap.length > 0) {
        snap[0] = targetTick;
        pm.sim?.restoreState?.(snap);
      }
    }
    d.matchTick = Math.max(targetTick, pm.currentTick);
  }

  initiateMatchPrepare(sec: number | null = null, timeoutTicks = 240): void {
    const { domain: d, physicsManager: pm, roster: r, commandQueue: cq } = this.host;
    d.beginPrepareOrCountdown('prepare', sec, timeoutTicks);
    this.prepareArenaForActiveMatch(false);
    cq.matchSequence = ((cq.matchSequence || 0) + 1) & 0xffff;
    if (pm) {
      pm.resetKickoff(0);
      r.applyRosterKickoffSpawns();
      pm.setInputMask?.(true);
    }
    const { allReady, clockDuration } = d.beginPrepareOrCountdown(
      'prepare',
      sec,
      timeoutTicks,
      pm?.currentTick
    );
    cq.dispatchSignal(MATCH_SIGNALS.MATCH_PREPARE, d.matchTick, cq.matchSequence, clockDuration);
    emitRosterJoinAndLoadoutSignals(cq, r.players.values(), d.matchTick);
    if (allReady) this.startMatch(clockDuration);
  }

  checkArenaLoadedBarrier(): boolean {
    const { allReady, clockDuration } = this.host.domain.beginPrepareOrCountdown('check_barrier');
    if (allReady) this.startMatch(clockDuration);
    return allReady;
  }

  triggerStartCountdown(sec = 3): void {
    this.host.domain.beginPrepareOrCountdown('countdown', sec);
  }

  forceStartMatch(sec: number | null = null): void {
    const { allReady, clockDuration } = this.host.domain.beginPrepareOrCountdown(
      'check_force_prepare',
      sec
    );
    if (allReady) this.initiateMatchPrepare(clockDuration, 120);
    else this.startMatch(clockDuration);
  }

  startMatch(sec?: number | null): void {
    const {
      domain: d,
      physicsManager: pm,
      sessionManager: sm,
      replayBuffer: rb,
      onClearRetainedReplay,
      roster: r,
      commandQueue: cq,
      goalReplay: gr,
    } = this.host;
    onClearRetainedReplay?.();
    const wasLobbyPhysicsActive = d.lobbyPhysicsActive;
    const { modeCode, clockDuration, clockSecondsRemaining, blueScore, orangeScore } =
      d.resetForMatchStart(sec);
    this.prepareArenaForActiveMatch(!wasLobbyPhysicsActive);
    gr.resetForMatchStart();
    cq.resetForMatchStart();
    sm?.signalBuffer?.clear?.();
    rb?.configureMode(REPLAY_BUFFER_MODES.COUNTDOWN_MATCH);
    if (pm) {
      pm.isPaused = false;
      pm.applySignal(MATCH_SIGNALS.MATCH_STARTED);
      pm.resetKickoff(0);
      r.applyRosterKickoffSpawns();
      d.matchTick = pm.currentTick;
    }
    cq.dispatchSignal(MATCH_SIGNALS.MATCH_INITIALIZED, d.matchTick, modeCode, clockDuration);
    cq.dispatchSignal(MATCH_SIGNALS.MATCH_STARTED, d.matchTick, clockSecondsRemaining, 0);
    emitRosterJoinAndLoadoutSignals(cq, r.players.values(), d.matchTick);
    cq.dispatchSignal(MATCH_SIGNALS.SCORE_UPDATED, d.matchTick, blueScore, orangeScore);
    this.startKickoffSequence(KICKOFF_TOTAL_TICKS);
  }

  enterLobbyMode(options: Record<string, unknown> = {}): MatchState {
    const {
      domain: d,
      physicsManager: pm,
      sessionManager: sm,
      diagnosticsController: dc,
      replayBuffer: rb,
      roster: r,
      commandQueue: cq,
    } = this.host;
    const nextState = d.applyLobbyOrTrainingTransition('lobby', options);
    cq.activeSignals.clear();
    sm?.signalBuffer?.clear?.();
    rb?.configureMode(REPLAY_BUFFER_MODES.COUNTUP_FIFO);
    r.clearAutoFillBots();
    configureLobbyPhysicsArena({
      physicsManager: pm,
      sessionManager: sm,
      diagnosticsController: dc,
      players: r.players,
      applyRosterKickoffSpawns: () => r.applyRosterKickoffSpawns(),
      options,
    });
    r.broadcastRosterUpdate();
    return nextState;
  }

  resetTrainingPlay(): void {
    const { domain: d, commandQueue: cq, goalReplay: gr } = this.host;
    d.applyLobbyOrTrainingTransition('training_reset');
    gr.replayTicksRemaining = -1;
    this.resetArenaKickoffSpawns(false);
    cq.dispatchSignal(MATCH_SIGNALS.BALL_RESET, d.matchTick, 0, 0);
  }

  startKickoffSequence(ticks = KICKOFF_TOTAL_TICKS): void {
    const { domain: d, physicsManager: pm, commandQueue: cq, goalReplay: gr } = this.host;
    gr.replayTicksRemaining = -1;
    cq.skipReplayVotes.clear();
    this.resetArenaKickoffSpawns();
    const { startedOvertime, kickoffWillStartAt, isOvertime } = d.beginKickoffPhase(ticks);
    if (startedOvertime) {
      cq.retireSignalTypes(
        [
          MATCH_SIGNALS.TIME_ALERT_60S,
          MATCH_SIGNALS.TIME_ALERT_30S,
          MATCH_SIGNALS.COUNTDOWN_10S,
          MATCH_SIGNALS.CLOCK_UPDATED_SECONDS,
        ],
        true
      );
      cq.dispatchSignal(MATCH_SIGNALS.OVERTIME_START, d.matchTick, 0, 0);
    }
    cq.dispatchSignal(
      MATCH_SIGNALS.KICKOFF_WILL_START,
      d.matchTick,
      kickoffWillStartAt,
      isOvertime ? 1 : 0
    );
    pm?.applySignal(MATCH_SIGNALS.KICKOFF_WILL_START, { kickoffWillStartAt });
  }

  setPaused(pause: boolean): void {
    const { domain: d, physicsManager: pm, commandQueue: cq } = this.host;
    if (!d.applyPauseOrResume(pause).changed) return;
    const sig = pause ? MATCH_SIGNALS.MATCH_PAUSED : MATCH_SIGNALS.MATCH_RESUMED;
    pm?.applySignal(sig, { paused: pause });
    cq.dispatchSignal(sig, d.matchTick);
  }

  requestResumeWithCountdown(sec = 5): void {
    const { domain: d, physicsManager: pm, commandQueue: cq } = this.host;
    const { changed, targetResumeTick } = d.applyPauseOrResume(null, sec);
    if (!changed) return;
    pm?.applySignal(MATCH_SIGNALS.MATCH_WILL_RESUME, { targetResumeTick });
    cq.dispatchSignal(MATCH_SIGNALS.MATCH_WILL_RESUME, d.matchTick, targetResumeTick, sec);
  }

  resolvePossessionWinner(): number {
    return resolvePossessionTieBreakWinner(this.host.physicsManager);
  }

  endMatch(forcedWinner: number | null = null, winReason = 0): void {
    const {
      domain: d,
      physicsManager: pm,
      replayBuffer: rb,
      onRetainCompletedReplay,
      roster: r,
      commandQueue: cq,
    } = this.host;
    const { winner, retentionPayload } = d.recordMatchEndedOrPodium(
      'end',
      forcedWinner,
      winReason,
      {
        engine: pm?.sim || null,
        ringBuffer: rb,
        signals: cq.replaySignalLog,
        roster: r.getMatchRosterMetadata(),
      }
    );
    pm?.applySignal(MATCH_SIGNALS.MATCH_ENDED, { winner, winReason });
    cq.retireSignalTypes(
      [
        MATCH_SIGNALS.KICKOFF_WILL_START,
        MATCH_SIGNALS.SCORE_UPDATED,
        MATCH_SIGNALS.GOAL_REPLAY_WILL_START,
      ],
      true
    );
    cq.dispatchSignal(MATCH_SIGNALS.MATCH_ENDED, d.matchTick, winner, winReason);
    if (retentionPayload) onRetainCompletedReplay?.(retentionPayload);
  }

  enterPodiumPhase(): void {
    const { domain: d, physicsManager: pm, commandQueue: cq } = this.host;
    const { changed, winner, winReason } = d.recordMatchEndedOrPodium('podium');
    if (!changed) return;
    pm?.applySignal(MATCH_SIGNALS.PODIUM_START, { winner, winReason });
    cq.dispatchSignal(MATCH_SIGNALS.PODIUM_START, d.matchTick, winner, winReason);
  }

  startTrainingMode(o: Record<string, unknown> = {}): void {
    const { domain: d, physicsManager: pm, replayBuffer: rb, commandQueue: cq } = this.host;
    d.applyLobbyOrTrainingTransition('training_start', o);
    cq.resetForTrainingStart();
    const cap =
      typeof o.replayCapacityTicks === 'number'
        ? o.replayCapacityTicks
        : typeof o.fifoDurationSeconds === 'number'
          ? Math.round(o.fifoDurationSeconds * 120)
          : null;
    rb?.configureMode(REPLAY_BUFFER_MODES.COUNTUP_FIFO, cap);
    if (pm) {
      pm.setInputMask(false);
      pm.isPaused = false;
      pm.isRecordingFullReplay = true;
      pm.sim?.setReplayRecordingActive?.(true);
      if (o.unlimitedBoost !== undefined) pm.sim?.setUnlimitedBoost?.(Boolean(o.unlimitedBoost));
      if (o.initialState) pm.sim?.restoreState?.(o.initialState as Float32Array | number[]);
      else if (o.resetKickoff) pm.resetKickoff(0);
      d.matchTick = Math.floor(pm.sim?.getHeaderView?.()?.tickCount ?? pm.currentTick ?? 0);
    } else {
      d.matchTick = 0;
    }
  }

  private stepEndedOrPodiumFrame(): Uint8Array {
    const { domain: d, physicsManager: pm, sessionManager: sm, commandQueue: cq } = this.host;
    if (d.stepFramePhaseGate('ended_podium_tick').action === 'ended_or_podium')
      this.enterPodiumPhase();
    const snap = pm && !pm.isPaused ? pm.stepAuthoritativeTick() : null;
    d.matchTick = snap?.tick ?? d.matchTick + 1;
    sm?.signalBuffer?.pruneExpired(d.matchTick, sm.sessions?.keys?.());
    return snap || cq.activeSignals.size > 0 || (sm?.signalBuffer?.entries?.size || 0) > 0
      ? this.encodeFramePacket(snap)
      : new Uint8Array(0);
  }

  private stepLobbyFrame(): Uint8Array {
    const {
      domain: d,
      physicsManager: pm,
      diagnosticsController: dc,
      commandQueue: cq,
    } = this.host;
    if (d.lobbyPhysicsActive && pm) {
      if (pm.inputBuffer && !pm.inputBuffer.lobbyMode) pm.inputBuffer.setLobbyMode(true);
      if (dc?.enabled) dc.applyToAuthority(pm, pm.currentTick);
      const snap = pm.stepAuthoritativeTick();
      d.matchTick = snap.tick ?? pm.currentTick;
      if (snap.goalScored) {
        pm.resetBallToCenter();
        snap.stateSnapshot =
          pm.sim?.saveCompactState?.() ?? pm.sim?.saveState?.() ?? snap.stateSnapshot;
        cq.dispatchSignal(MATCH_SIGNALS.BALL_RESET, d.matchTick, 0, 0);
      }
      return this.encodeFramePacket(snap);
    }
    return cq.activeSignals.size > 0 ? this.encodeFramePacket(null) : new Uint8Array(0);
  }

  stepFrame(): Uint8Array {
    const {
      domain: d,
      physicsManager: pm,
      commandQueue: cq,
      goalReplay: gr,
      systemControl: sc,
    } = this.host;
    const stateOnlyPacket = sc?.stepStateOnlyFrameIfActive?.();
    if (stateOnlyPacket) return stateOnlyPacket;

    const preGate = d.stepFramePhaseGate('pre', pm?.currentTick);
    switch (preGate.action) {
      case 'ended_or_podium':
        return this.stepEndedOrPodiumFrame();
      case 'start_from_prepare':
        this.startMatch(preGate.clockDuration);
        break;
      case 'initiate_prepare_from_countdown':
        this.initiateMatchPrepare(preGate.clockDuration, 120);
        return this.encodeFramePacket(null);
      case 'encode_null':
        return this.encodeFramePacket(null);
      case 'lobby':
        return this.stepLobbyFrame();
      case 'resume_from_pause':
        this.setPaused(false);
        return this.encodeFramePacket(null);
      case 'reset_training_play':
        this.resetTrainingPlay();
        break;
      case 'begin_goal_replay': {
        gr.beginGoalReplay();
        if ((d.state as string) === MATCH_STATES.REPLAY) {
          d.matchTick++;
          const rs = gr.stepReplayTick();
          if (!rs.finished) return this.encodeFramePacket(rs.replayPhysicsSnapshot);
        }
        break;
      }
      case 'replay': {
        const rs = gr.stepReplayTick();
        if (!rs.finished) return this.encodeFramePacket(rs.replayPhysicsSnapshot);
        break;
      }
      default:
        break;
    }

    let snap: PhaseLifecyclePhysicsSnapshotPort | null = null;
    if (pm) {
      gr.stepServerFilledBots();
      snap = pm.stepAuthoritativeTick();
      d.matchTick = snap.tick ?? pm.currentTick;
      dispatchFlipResetIncidents(snap.incidents, d.matchTick, cq);
      if (snap.goalScored && d.state === MATCH_STATES.PLAYING) {
        const outcome = evaluateGoalScoredOutcome({
          domain: d,
          physicsSnapshot: snap,
          physicsManager: pm,
          goalReplayController: gr,
          commandController: cq,
        });
        if (!outcome.ignoredGoal) d.applyGoalScoredOutcome(outcome);
      }
    }

    if (d.stepFramePhaseGate('post', snap?.tick, Boolean(pm)).action === 'kickoff_started') {
      cq.retireSignalTypes([MATCH_SIGNALS.KICKOFF_WILL_START], true);
      cq.dispatchSignal(MATCH_SIGNALS.KICKOFF_START, d.matchTick);
      pm?.applySignal(MATCH_SIGNALS.KICKOFF_START);
    }

    advancePlayingClockState({
      domain: d,
      physicsManager: pm,
      physicsSnapshot: snap,
      commandQueue: cq,
      onStartOvertimeKickoff: (ticks) => this.startKickoffSequence(ticks),
      onEndMatch: (winner, reason) => this.endMatch(winner, reason),
    });
    return this.encodeFramePacket(snap);
  }

  encodeFramePacket(physicsSnapshot: LifecyclePhysicsSnapshotPort | null): Uint8Array {
    const { domain: d, physicsManager, sessionManager, replayBuffer, commandQueue } = this.host;
    return encodeMatchGlobalFramePacket({
      state: d.state,
      matchTick: d.matchTick,
      physicsSnapshot,
      physicsManager,
      sessionManager,
      replayBuffer,
      commandController: commandQueue,
    });
  }
}
