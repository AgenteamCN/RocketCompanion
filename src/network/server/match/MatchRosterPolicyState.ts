/**
 * src/network/server/match/MatchRosterPolicyState.ts
 * Room roster policy, team/slot allocation state, handshake envelope assembly,
 * and rematch/skip-replay vote tallying for authoritative match sessions.
 */

import {
  encodeVisualIdIndex,
  encodeHitboxIdIndex,
} from '../../../ui-core/config/vehicleConstants.ts';
import {
  MATCH_STATES,
  DEFAULT_MATCH_DURATION_SECONDS,
  DEFAULT_MAX_OVERTIME_SECONDS,
  type MatchState,
  type MatchPlayerSlot,
  type MatchSpectatorSlot,
  type DisconnectedPlayerSlot,
  type RosterSnapshot,
  type RosterSnapshotPlayerEntry,
  type RosterSnapshotSpectatorEntry,
  type RosterSnapshotSource,
  type MatchRosterMetadataEntry,
  type RosterSessionManagerPort,
} from './matchLoadoutAndSpawnPipeline.ts';

export interface MatchDomainStateOptions {
  roomId?: string;
  password?: string;
  gameMode?: string;
  botFillMode?: string;
  defaultBotType?: string;
  botsLoadoutConfig?: Record<string, unknown> | null;
  isHost?: boolean;
  externalBotTunnels?: boolean;
  lobbyMode?: boolean;
  isTrainingMode?: boolean;
  trainingDisableGoalReset?: boolean;
  trainingUnlimitedBoost?: boolean;
  trainingGoalReplayEnabled?: boolean;
  trainingGoalCelebrationTicks?: number;
  autoStartWhenFull?: boolean;
  skipReplayByDefault?: boolean;
  matchDurationSeconds?: number;
  durationSeconds?: number;
  clockDuration?: number;
  maxOvertimeSeconds?: number;
  requireTouchToStartClock?: boolean;
}

export interface MatchSessionSnapshot {
  roomId: string;
  gameMode: string;
  botFillMode: string;
  state: MatchState;
  matchTick: number;
  clockDuration: number;
  clockSecondsRemaining: number;
  isOvertime: boolean;
  overtimeSeconds: number;
  blueScore: number;
  orangeScore: number;
  winner: number | null;
  winReason: number;
  lobbyPhysicsActive: boolean;
  stateOnlyMode?: boolean;
  interveneTargetTick?: number;
  roster: RosterSnapshot;
}

export type FramePhaseGateAction =
  | 'none'
  | 'ended_or_podium'
  | 'start_from_prepare'
  | 'encode_null'
  | 'initiate_prepare_from_countdown'
  | 'lobby'
  | 'resume_from_pause'
  | 'reset_training_play'
  | 'begin_goal_replay'
  | 'replay'
  | 'kickoff_started';

export function resolveMaxPlayersForGameMode(gameMode: string): number {
  return gameMode === '1v1' ? 2 : gameMode === '2v2' ? 4 : 6;
}

export function buildMatchRosterMetadata(
  players: Iterable<MatchPlayerSlot>
): MatchRosterMetadataEntry[] {
  const roster: MatchRosterMetadataEntry[] = [];
  for (const p of players) {
    roster.push({
      carIndex: p.entityId,
      entityId: p.entityId,
      sessionId: p.sessionId,
      name: p.name || `Car ${p.entityId}`,
      team: p.team ?? 0,
      role: p.role || 'player',
      isBot: Boolean(p.isBot),
      botType: p.botType,
      visualId: p.visualId || 'octane',
      visualIndex: p.visualIndex ?? encodeVisualIdIndex(p.visualId || 'octane'),
      hitboxId: p.hitboxId || 'hitbox-octane',
      hitboxIndex: p.hitboxIndex ?? encodeHitboxIdIndex(p.hitboxId || 'hitbox-octane'),
      colorSlot: p.colorSlot ?? (p.team === 0 ? 3 : 0),
      colorHex: p.colorHex || (p.team === 0 ? '#42a5f5' : '#ff7043'),
      paintFinish: p.paintFinish || 'metallic',
      boostVisual: p.boostVisual || 'cartoon',
      boostAudio: p.boostAudio || 'standard',
      anthemId: p.anthemId || 'none',
    });
  }
  return roster;
}

export function buildRosterSnapshot(source: RosterSnapshotSource): RosterSnapshot {
  const players: RosterSnapshotPlayerEntry[] = [];
  for (const p of source.players.values()) {
    const sess = source.sessionManager?.getSession?.(p.sessionId);
    players.push({
      sessionId: p.sessionId,
      entityId: p.entityId,
      carIndex: p.entityId,
      team: p.team,
      preferredTeam: p.preferredTeam ?? p.team,
      name: p.name,
      spawnSlot: p.spawnSlot,
      visualId: p.visualId,
      visualIndex: p.visualIndex,
      hitboxId: p.hitboxId,
      hitboxIndex: p.hitboxIndex,
      colorSlot: p.colorSlot,
      colorHex: p.colorHex || null,
      paintFinish: p.paintFinish || 'metallic',
      boostVisual: p.boostVisual || 'cartoon',
      boostAudio: p.boostAudio || 'standard',
      anthemId: p.anthemId || 'none',
      isBot: Boolean(p.isBot),
      botType: p.botType,
      ready: Boolean(p.ready),
      arenaLoaded: Boolean(p.arenaLoaded),
      pingMs: p.isBot ? 0 : Math.round(sess?.rttMs ?? p.pingMs ?? 0),
    });
  }
  const spectators: RosterSnapshotSpectatorEntry[] = [];
  for (const s of source.spectators.values()) {
    const sess = source.sessionManager?.getSession?.(s.sessionId);
    spectators.push({
      sessionId: s.sessionId,
      name: s.name,
      role: 'spectator',
      pingMs: Math.round(sess?.rttMs ?? s.pingMs ?? 0),
    });
  }
  return {
    players,
    spectators,
    gameMode: source.gameMode,
    botFillMode: source.botFillMode,
    durationSeconds: source.clockDuration,
    clockSeconds: source.clockSecondsRemaining,
    score: { blue: source.blueScore ?? 0, orange: source.orangeScore ?? 0 },
  };
}

export class MatchRosterPolicyState {
  roomId: string;
  password: string;
  gameMode: string;
  botFillMode: string;
  defaultBotType: string;
  botsLoadoutConfig: Record<string, unknown> | null;
  isHost: boolean;
  externalBotTunnels: boolean;
  maxPlayers: number;
  autoStartWhenFull: boolean;
  skipReplayByDefault: boolean;
  state: MatchState = MATCH_STATES.LOBBY;
  matchTick = 0;
  clockDuration: number;
  clockSecondsRemaining: number;
  isOvertime = false;
  overtimeSeconds = 0;
  clockDirection: 'up' | 'down';
  maxOvertimeSeconds: number;
  blueScore = 0;
  orangeScore = 0;
  winner: number | null = null;
  winReason = 0;
  lobbyMode: boolean;
  isTrainingMode: boolean;
  lobbyPhysicsActive = false;
  stateOnlyMode = false;
  interveneTargetTick = -1;
  startCountdownTicks = -1;
  prepareTimeoutTicks = -1;
  readonly players = new Map<string, MatchPlayerSlot>();
  readonly spectators = new Map<string, MatchSpectatorSlot>();
  readonly disconnectedPlayerSlots = new Map<number, DisconnectedPlayerSlot>();

  constructor(opts: MatchDomainStateOptions = {}) {
    this.roomId = opts.roomId || `room_${Math.random().toString(36).slice(2, 8)}`;
    this.password = opts.password || '';
    this.gameMode = opts.gameMode || '3v3';
    this.botFillMode = opts.botFillMode || 'no_bots';
    this.defaultBotType = opts.defaultBotType || 'nexto';
    this.botsLoadoutConfig = opts.botsLoadoutConfig || null;
    this.isHost = opts.isHost ?? true;
    this.externalBotTunnels = Boolean(opts.externalBotTunnels);
    this.lobbyMode = Boolean(opts.lobbyMode);
    this.isTrainingMode = opts.isTrainingMode ?? this.lobbyMode;
    this.maxPlayers = resolveMaxPlayersForGameMode(this.gameMode);
    this.autoStartWhenFull = opts.autoStartWhenFull ?? !this.lobbyMode;
    this.skipReplayByDefault =
      opts.skipReplayByDefault !== undefined ? Boolean(opts.skipReplayByDefault) : false;
    this.clockDuration =
      opts.matchDurationSeconds ??
      opts.durationSeconds ??
      opts.clockDuration ??
      DEFAULT_MATCH_DURATION_SECONDS;
    this.clockSecondsRemaining = this.clockDuration;
    this.clockDirection = this.isTrainingMode ? 'up' : 'down';
    this.maxOvertimeSeconds = opts.maxOvertimeSeconds ?? DEFAULT_MAX_OVERTIME_SECONDS;
  }

  buildRosterEnvelope(sessionManager?: RosterSessionManagerPort | null): {
    roster: RosterSnapshot;
    rosterUpdateJson: string;
    buildHandshakeJson: (
      player: MatchPlayerSlot | null,
      initialSnapshot?: number[] | null
    ) => string;
  } {
    const roster = buildRosterSnapshot({
      players: this.players,
      spectators: this.spectators,
      sessionManager,
      gameMode: this.gameMode,
      botFillMode: this.botFillMode,
      clockDuration: this.clockDuration,
      clockSecondsRemaining: this.clockSecondsRemaining,
      blueScore: this.blueScore,
      orangeScore: this.orangeScore,
    });
    const rosterUpdateJson = JSON.stringify({
      type: 'roster_update',
      roomId: this.roomId,
      gameMode: this.gameMode,
      botFillMode: this.botFillMode,
      durationSeconds: this.clockDuration,
      state: this.state,
      roster,
    });
    return {
      roster,
      rosterUpdateJson,
      buildHandshakeJson: (p, initialSnapshot) =>
        p
          ? JSON.stringify({
              type: 'handshake_response',
              assignedCarIndex: p.entityId,
              entityId: p.entityId,
              team: p.team,
              preferredTeam: p.preferredTeam ?? p.team,
              role: 'player',
              spawnSlot: p.spawnSlot,
              visualId: p.visualId,
              visualIndex: p.visualIndex,
              hitboxId: p.hitboxId,
              hitboxIndex: p.hitboxIndex,
              colorSlot: p.colorSlot,
              colorHex: p.colorHex,
              paintFinish: p.paintFinish,
              boostVisual: p.boostVisual,
              boostAudio: p.boostAudio,
              anthemId: p.anthemId,
              roomId: this.roomId,
              gameMode: this.gameMode,
              botFillMode: this.botFillMode,
              durationSeconds: this.clockDuration,
              clockSeconds: this.clockSecondsRemaining,
              score: { blue: this.blueScore, orange: this.orangeScore },
              matchTick: this.matchTick,
              serverFrame: this.matchTick,
              serverTick: this.matchTick,
              state: this.state,
              isHost: false,
              roster,
              initialSnapshot: initialSnapshot || null,
            })
          : JSON.stringify({
              type: 'handshake_response',
              assignedCarIndex: -1,
              entityId: -1,
              team: -1,
              role: 'spectator',
              roomId: this.roomId,
              gameMode: this.gameMode,
              matchTick: this.matchTick,
              serverFrame: this.matchTick,
              serverTick: this.matchTick,
              state: this.state,
              isHost: false,
              roster,
            }),
    };
  }

  applyRosterPolicyConfig(options?: {
    gameMode?: string;
    durationSeconds?: number | null;
    botFillMode?: string;
    botType?: string;
  }): {
    shouldApplyBotFill: boolean;
    shouldAutoStartLobby: boolean;
    lobbyMode: boolean;
    isTrainingMode: boolean;
    lobbyPhysicsActive: boolean;
    canHotSwapNow: boolean;
    kickoffBoostAmount: number;
  } {
    if (options?.gameMode === '1v1' || options?.gameMode === '2v2' || options?.gameMode === '3v3') {
      this.gameMode = options.gameMode;
      this.maxPlayers = resolveMaxPlayersForGameMode(options.gameMode);
    }
    if (
      typeof options?.durationSeconds === 'number' &&
      Number.isFinite(options.durationSeconds) &&
      options.durationSeconds >= 0
    ) {
      this.clockDuration = options.durationSeconds;
      if (this.state === MATCH_STATES.LOBBY) this.clockSecondsRemaining = options.durationSeconds;
    }
    if (options?.botType) this.defaultBotType = options.botType;
    if (
      options?.botFillMode &&
      ['no_bots', 'auto_fill', 'bots_vs_humans', 'custom'].includes(options.botFillMode)
    ) {
      this.botFillMode = options.botFillMode;
    }
    const shouldApplyBotFill =
      this.state !== MATCH_STATES.LOBBY &&
      (options?.botFillMode !== undefined ||
        this.botFillMode === 'auto_fill' ||
        this.botFillMode === 'bots_vs_humans');
    return {
      shouldApplyBotFill,
      shouldAutoStartLobby: Boolean(
        this.autoStartWhenFull &&
        this.players.size >= this.maxPlayers &&
        this.state === MATCH_STATES.LOBBY
      ),
      lobbyMode: this.lobbyMode,
      isTrainingMode: this.isTrainingMode,
      lobbyPhysicsActive: this.lobbyPhysicsActive,
      canHotSwapNow:
        this.state === MATCH_STATES.LOBBY ||
        this.state === MATCH_STATES.PREPARE ||
        this.state === MATCH_STATES.KICKOFF ||
        this.isTrainingMode,
      kickoffBoostAmount: this.state === MATCH_STATES.LOBBY || this.isTrainingMode ? 100.0 : 33.33,
    };
  }

  updatePlayerSlot(sessionId: string, patch: Partial<MatchPlayerSlot>): MatchPlayerSlot | null {
    const existing = this.players.get(sessionId);
    if (!existing) return null;
    const record = existing as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) record[k] = v;
    return existing;
  }

  areAllHumanPlayersReadyInFullLobby(): boolean {
    if (this.state !== MATCH_STATES.LOBBY || this.players.size < this.maxPlayers) return false;
    for (const p of this.players.values()) if (!p.isBot && !p.ready) return false;
    return true;
  }

  areAllHumansVoted(
    voteSet: Set<string>,
    excludeSpectators = false
  ): {
    allHumansVoted: boolean;
    spectatorSkippedAllBotMatch: boolean;
  } {
    let humanCount = 0,
      votedCount = 0;
    for (const [sid, p] of this.players.entries()) {
      if (!p.isBot && (!excludeSpectators || p.role !== 'spectator')) {
        humanCount++;
        if (voteSet.has(sid)) votedCount++;
      }
    }
    return {
      allHumansVoted: humanCount > 0 && votedCount >= humanCount,
      spectatorSkippedAllBotMatch: humanCount === 0 && voteSet.size > 0,
    };
  }

  resolveValidDuration(durationSeconds?: number | null, fallbackToDefault = false): void {
    if (
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds) &&
      durationSeconds >= 0
    ) {
      this.clockDuration = durationSeconds;
    } else if (
      fallbackToDefault &&
      (!Number.isFinite(this.clockDuration) || this.clockDuration < 0)
    ) {
      this.clockDuration = DEFAULT_MATCH_DURATION_SECONDS;
    }
  }

  beginPrepareOrCountdown(
    action: 'prepare' | 'countdown' | 'check_barrier' | 'check_force_prepare',
    value: number | null = null,
    timeoutTicks = 240,
    currentTick?: number
  ): { allReady: boolean; clockDuration: number } {
    if (action === 'countdown') {
      if (this.state !== MATCH_STATES.LOBBY)
        return { allReady: false, clockDuration: this.clockDuration };
      this.state = MATCH_STATES.COUNTDOWN;
      this.startCountdownTicks = Math.round((value ?? 3) * 120);
      return { allReady: true, clockDuration: this.clockDuration };
    }
    if (action === 'check_barrier') {
      if (this.state !== MATCH_STATES.PREPARE)
        return { allReady: false, clockDuration: this.clockDuration };
      for (const p of this.players.values())
        if (!p.isBot && !p.arenaLoaded)
          return { allReady: false, clockDuration: this.clockDuration };
      return { allReady: true, clockDuration: this.clockDuration };
    }
    if (action === 'check_force_prepare') {
      this.resolveValidDuration(value);
      let hasRemoteHuman = false;
      for (const [sid, p] of this.players.entries())
        if (!p.isBot && sid !== 'host') {
          hasRemoteHuman = true;
          break;
        }
      return {
        allReady: hasRemoteHuman && this.state === MATCH_STATES.LOBBY,
        clockDuration: this.clockDuration,
      };
    }
    this.resolveValidDuration(value);
    this.state = MATCH_STATES.PREPARE;
    this.prepareTimeoutTicks = timeoutTicks;
    if (typeof currentTick === 'number') this.matchTick = currentTick;
    let allReady = true;
    for (const [sid, p] of this.players.entries()) {
      p.arenaLoaded = Boolean(p.isBot || sid === 'host');
      if (!p.arenaLoaded) allReady = false;
    }
    return { allReady, clockDuration: this.clockDuration };
  }
}
