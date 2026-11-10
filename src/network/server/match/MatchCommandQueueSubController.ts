/**
 * src/network/server/match/MatchCommandQueueSubController.ts
 * Stateful SubController owning authoritative match signals, piggybacked ACK retirement,
 * reliable client command deduplication, voting (skip replay, rematch, forfeit),
 * and JSON control packet evaluation.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import {
  MATCH_STATES,
  collectSessionUserRtt,
  type ActiveMatchSignal,
  type ReplaySignalLogEntry,
  type UserRttSummary,
} from './matchLoadoutAndSpawnPipeline.ts';
import {
  createAndRecordMatchSignal,
  applyClientSignalAcksToActiveSignals,
  type ClientCommandPayload,
  type ClientReliableCommand,
  type ControlPacketPayload,
  type CommandQueuePhysicsPort,
  type CommandQueueSessionPort,
  type CommandQueueReplayBufferPort,
} from './matchCommandAndSignalPipeline.ts';
import {
  recordDeduplicatedClientCommandId,
  hasJumpEdgeInClientInputHistory,
  executeReliableClientCommand,
  evaluateSessionControlPacket,
} from './matchControlPacketPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';
import type {
  MatchRosterSubController,
  RosterDataHandlerPort,
} from './MatchRosterSubController.ts';

export type {
  ClientCommandPayload,
  ClientReliableCommand,
  ControlPacketPayload,
  CommandQueuePhysicsPort,
  CommandQueueSessionPort,
  CommandQueueReplayBufferPort,
};

export interface MatchCommandLifecyclePort {
  initiateMatchPrepare(durationSeconds?: number | null, timeoutTicks?: number): void;
  checkArenaLoadedBarrier(): boolean;
  startMatch(durationSeconds?: number | null): void;
  setPaused(pause: boolean): void;
  requestResumeWithCountdown(countdownSeconds?: number): void;
  endMatch(forcedWinner?: number | null, winReason?: number): void;
}

export interface MatchCommandGoalReplayPort {
  finishGoalReplay(): void;
}

export interface MatchCommandSystemControlPort {
  enterStateOnlyMode(stateSnapshot?: Float32Array | number[] | null, cursorTick?: number): void;
  beginInterveneCountdown(
    countdownSeconds?: number,
    stateSnapshot?: Float32Array | number[] | null
  ): number;
  resumePhysicsFromState(stateSnapshot?: Float32Array | number[] | null, resumeTick?: number): void;
}

export interface MatchCommandHostPort {
  readonly domain: MatchDomainState;
  readonly roster: MatchRosterSubController;
  lifecycle?: MatchCommandLifecyclePort | null;
  goalReplay?: MatchCommandGoalReplayPort | null;
  systemControl?: MatchCommandSystemControlPort | null;
  physicsManager?: CommandQueuePhysicsPort | null;
  sessionManager?: CommandQueueSessionPort | null;
  dataHandler?: RosterDataHandlerPort | null;
  replayBuffer?: CommandQueueReplayBufferPort | null;
}

export class MatchCommandQueueSubController {
  readonly domain: MatchDomainState;
  readonly roster: MatchRosterSubController;
  lifecycle: MatchCommandLifecyclePort | null;
  goalReplay: MatchCommandGoalReplayPort | null;
  systemControl: MatchCommandSystemControlPort | null;
  physicsManager: CommandQueuePhysicsPort | null | undefined;
  sessionManager: CommandQueueSessionPort | null | undefined;
  dataHandler: RosterDataHandlerPort | null | undefined;
  replayBuffer: CommandQueueReplayBufferPort | null | undefined;

  activeSignals = new Map<string | number, ActiveMatchSignal>();
  replaySignalLog: ReplaySignalLogEntry[] = [];
  currentFrameSignals: ReplaySignalLogEntry[] = [];
  nextSignalId = 0;
  matchSequence = 0;
  processedClientCommands = new Map<string, Set<number>>();
  skipReplayVotes = new Set<string>();
  rematchVotes = new Set<string>();
  forfeitVotes = new Set<string>();
  rttIntervalTicks = 600;
  lastRttBroadcastTick = -600;
  cachedAllUserRtt: UserRttSummary | null = null;

  constructor(options: MatchCommandHostPort) {
    this.domain = options.domain;
    this.roster = options.roster;
    this.lifecycle = options.lifecycle || null;
    this.goalReplay = options.goalReplay || null;
    this.systemControl = options.systemControl || null;
    this.physicsManager = options.physicsManager;
    this.sessionManager = options.sessionManager;
    this.dataHandler = options.dataHandler;
    this.replayBuffer = options.replayBuffer;
  }

  getExpectedAckPeerIds(): Set<string> {
    const peers = new Set<string>();
    for (const [sid, p] of this.domain.players.entries()) if (!p.isBot) peers.add(sid);
    for (const sid of this.domain.spectators.keys()) peers.add(sid);
    return peers;
  }

  dispatchSignal(
    signalType: number,
    frameId: number,
    param1 = 0,
    param2 = 0
  ): ActiveMatchSignal | null {
    const res = createAndRecordMatchSignal({
      signalType,
      frameId,
      param1,
      param2,
      currentNextSignalId: this.nextSignalId,
      shouldSuppressCountdown: this.domain.shouldSuppressCountdownClockSignal(),
      sessionManager: this.sessionManager,
      physicsManager: this.physicsManager,
      replayBuffer: this.replayBuffer,
      replaySignalLog: this.replaySignalLog,
      currentFrameSignals: this.currentFrameSignals,
      activeSignals: this.activeSignals,
    });
    this.nextSignalId = res.nextSignalId;
    return res.signal;
  }

  retireSignalTypes(signalTypes: number[], alsoRetireSessionBuffer = false): void {
    const sb = this.sessionManager ? this.sessionManager.signalBuffer : null;
    for (const sigType of signalTypes) {
      const prev = this.activeSignals.get(sigType);
      if (alsoRetireSessionBuffer && sb) {
        if (prev && sb.retireSignal) sb.retireSignal(prev.signalId);
        if (sb.retireByType) sb.retireByType(sigType);
      }
      this.activeSignals.delete(sigType);
    }
  }

  stepFrameSignalRedundancy(): void {
    for (const [sKey, sObj] of this.activeSignals.entries()) {
      if (sObj.signalType !== MATCH_SIGNALS.KICKOFF_WILL_START) {
        if (typeof sObj.remainingRedundancy === 'number' && --sObj.remainingRedundancy > 0)
          continue;
        this.activeSignals.delete(sKey);
      }
    }
  }

  sampleRttIfDue(matchTick: number): UserRttSummary | null {
    if (matchTick - this.lastRttBroadcastTick >= this.rttIntervalTicks) {
      this.lastRttBroadcastTick = matchTick;
      return collectSessionUserRtt(this.sessionManager);
    }
    return null;
  }

  handleClientSignalAcks(
    sessionId: string,
    acks: Array<{ signalId: number; signalType?: number }> = []
  ): void {
    if (!Array.isArray(acks) || acks.length === 0) return;
    applyClientSignalAcksToActiveSignals(
      sessionId,
      acks,
      this.activeSignals,
      this.domain.players,
      this.domain.spectators
    );
  }

  checkSkipReplayVotes(): void {
    if (this.domain.state !== MATCH_STATES.REPLAY && this.domain.state !== MATCH_STATES.GOAL_SCORED)
      return;
    const { allHumansVoted, spectatorSkippedAllBotMatch } = this.domain.areAllHumansVoted(
      this.skipReplayVotes,
      true
    );
    if (allHumansVoted || spectatorSkippedAllBotMatch) {
      if (this.domain.state === MATCH_STATES.REPLAY) {
        if (this.goalReplay) this.goalReplay.finishGoalReplay();
      } else {
        this.domain.clampGoalBufferTicksForSkip(35);
      }
    }
  }

  checkRematchReady(): void {
    if (this.domain.state !== MATCH_STATES.ENDED && this.domain.state !== MATCH_STATES.PODIUM)
      return;
    if (this.domain.areAllHumansVoted(this.rematchVotes).allHumansVoted && this.lifecycle) {
      this.lifecycle.startMatch(this.domain.clockDuration);
    }
  }

  recordSkipReplayInputEdge(
    sessionId: string,
    inputHistory: Array<{ jump?: boolean; controls?: { jump?: boolean } }>
  ): boolean {
    if (
      this.domain.state !== MATCH_STATES.REPLAY ||
      !Array.isArray(inputHistory) ||
      inputHistory.length === 0
    ) {
      return false;
    }
    if (this.skipReplayVotes.has(sessionId)) return true;
    if (!hasJumpEdgeInClientInputHistory(inputHistory)) return false;
    const player = this.domain.players.get(sessionId);
    if (typeof player?.entityId === 'number' && player.entityId >= 0) {
      this.physicsManager?.jumpSuppressedCarIndices?.add(player.entityId);
    }
    this.skipReplayVotes.add(sessionId);
    this.checkSkipReplayVotes();
    return true;
  }

  handleClientCommand(sessionId: string, cmd: ClientCommandPayload, _session?: unknown): void {
    const commandId = cmd.commandId ?? 0;
    if (commandId > 0) {
      this.dispatchSignal(
        MATCH_SIGNALS.COMMAND_ACK,
        this.domain.matchTick,
        commandId,
        cmd.commandType
      );
      if (recordDeduplicatedClientCommandId(this.processedClientCommands, sessionId, commandId)) {
        return;
      }
    }
    executeReliableClientCommand({
      sessionId,
      cmd,
      domain: this.domain,
      roster: this.roster,
      lifecycle: this.lifecycle,
      systemControl: this.systemControl,
      skipReplayVotes: this.skipReplayVotes,
      rematchVotes: this.rematchVotes,
      forfeitVotes: this.forfeitVotes,
      checkSkipReplayVotes: () => this.checkSkipReplayVotes(),
      checkRematchReady: () => this.checkRematchReady(),
      dispatchSignal: (t, f, p1, p2) => this.dispatchSignal(t, f, p1, p2),
    });
  }

  handleClientCommands(sessionId: string, commands: ClientCommandPayload[] = []): void {
    if (!Array.isArray(commands) || commands.length === 0) return;
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd && typeof cmd.commandType === 'number') this.handleClientCommand(sessionId, cmd);
    }
  }

  evaluateControlPacket(
    channelId: string,
    packetType: string | number,
    packetData: ControlPacketPayload | null | undefined
  ): unknown {
    return evaluateSessionControlPacket({
      channelId,
      packetType,
      packetData,
      roster: this.roster,
      dataHandler: this.dataHandler,
      sim: this.physicsManager ? this.physicsManager.sim : null,
      sessionManager: this.sessionManager,
      buildHandshakeJson: (p, snap) =>
        this.domain.buildRosterEnvelope(this.sessionManager).buildHandshakeJson(p, snap),
      handleClientCommand: (cid, cmd) => this.handleClientCommand(cid, cmd),
    });
  }

  removeSessionVotes(sessionId: string): void {
    this.skipReplayVotes.delete(sessionId);
    this.rematchVotes.delete(sessionId);
  }

  resetForMatchStart(): void {
    this.replaySignalLog = [];
    this.currentFrameSignals = [];
    this.activeSignals.clear();
    this.skipReplayVotes.clear();
    this.rematchVotes.clear();
    this.forfeitVotes.clear();
  }

  resetForTrainingStart(): void {
    this.replaySignalLog = [];
    this.currentFrameSignals = [];
    this.activeSignals.clear();
  }

  clear(): void {
    this.activeSignals.clear();
    this.processedClientCommands.clear();
    this.skipReplayVotes.clear();
    this.rematchVotes.clear();
    this.forfeitVotes.clear();
    this.replaySignalLog = [];
    this.currentFrameSignals = [];
  }
}
