/**
 * src/network/server/match/MatchRosterSubController.ts
 * Stateful SubController owning player/spectator rosters, disconnected slot reclamation,
 * spawn/color slot allocation, cosmetic loadouts, and bot fill policies.
 */

import {
  applyKickoffSpawnsToSim,
  type MatchPlayerSlot,
  type MatchSpectatorSlot,
  type DisconnectedPlayerSlot,
  type PlayerLoadoutOptions,
  type MatchRosterMetadataEntry,
  type RosterSnapshot,
  type RosterSessionManagerPort,
} from './matchLoadoutAndSpawnPipeline.ts';
import { buildMatchRosterMetadata } from './MatchRosterPolicyState.ts';
import {
  removeSessionFromRosterState,
  resolveReclaimedPlayerSlot,
  executeRosterRoleOrTeamSwitch,
  type RoleSwitchDataHandlerPort,
} from './matchSessionRoleSwitchPipeline.ts';
import {
  resolveBotCreationSlotSpec,
  resolveRosterSlotAssignmentOutcome,
  applyUpdatedPlayerLoadoutAndHotSwap,
  flushPendingHitboxSwapsToPhysics,
} from './matchRosterSlotAssignmentPipeline.ts';
import {
  rollTeamBotLoadout,
  syncRosterCarsWithPhysicsEngine,
  executeBotFillPolicyOnRoster,
  type RosterPhysicsManagerPort,
  type RosterSessionPort,
  type SignalDispatchFn,
} from './matchRosterPhysicsAndBotPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';

export interface RosterDataHandlerPort extends RoleSwitchDataHandlerPort {
  broadcast?: (packet: string | Uint8Array, filter?: (id: string) => boolean) => void;
}

export type RosterFullSessionPort = RosterSessionPort & RosterSessionManagerPort;

export interface RosterSignalAndVotePort {
  dispatchSignal(signalType: number, frameId: number, param1?: number, param2?: number): unknown;
  removeSessionVotes(sessionId: string): void;
}

export interface RosterLobbyAutoStartPort {
  initiateMatchPrepare(durationSeconds?: number | null, timeoutTicks?: number): void;
}

export interface MatchRosterHostPort {
  readonly domain: MatchDomainState;
  physicsManager?: RosterPhysicsManagerPort | null;
  sessionManager?: RosterFullSessionPort | null;
  dataHandler?: RosterDataHandlerPort | null;
  signalPort?: RosterSignalAndVotePort | null;
  lobbyAutoStarter?: RosterLobbyAutoStartPort | null;
}

export class MatchRosterSubController {
  readonly domain: MatchDomainState;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  sessionManager: RosterFullSessionPort | null | undefined;
  dataHandler: RosterDataHandlerPort | null | undefined;
  signalPort: RosterSignalAndVotePort | null;
  lobbyAutoStarter: RosterLobbyAutoStartPort | null;
  applyingBotFillPolicy = false;

  constructor(options: MatchRosterHostPort) {
    this.domain = options.domain;
    this.physicsManager = options.physicsManager;
    this.sessionManager = options.sessionManager;
    this.dataHandler = options.dataHandler;
    this.signalPort = options.signalPort || null;
    this.lobbyAutoStarter = options.lobbyAutoStarter || null;
  }

  private readonly emitSignal: SignalDispatchFn = (type, frameId, p1, p2) =>
    this.signalPort ? this.signalPort.dispatchSignal(type, frameId, p1, p2) : null;

  get players(): Map<string, MatchPlayerSlot> {
    return this.domain.players;
  }
  get spectators(): Map<string, MatchSpectatorSlot> {
    return this.domain.spectators;
  }
  get disconnectedPlayerSlots(): Map<number, DisconnectedPlayerSlot> {
    return this.domain.disconnectedPlayerSlots;
  }

  getMatchRosterMetadata(): MatchRosterMetadataEntry[] {
    return buildMatchRosterMetadata(this.players.values());
  }

  buildRosterSnapshot(): RosterSnapshot {
    return this.domain.buildRosterEnvelope(this.sessionManager).roster;
  }

  withBotFillGuard<T>(fn: () => T): T {
    const prev = this.applyingBotFillPolicy;
    this.applyingBotFillPolicy = true;
    try {
      return fn();
    } finally {
      this.applyingBotFillPolicy = prev;
    }
  }

  clearAutoFillBots(): boolean {
    return this.withBotFillGuard(() => {
      let cleared = false;
      for (const [sid, p] of Array.from(this.players.entries())) {
        if (p.isBot && String(sid).startsWith('bot_fill_')) {
          this.removePlayerSession(sid);
          cleared = true;
        }
      }
      return cleared;
    });
  }

  broadcastRosterUpdate(): void {
    const dh = this.dataHandler;
    if (!dh || typeof dh.broadcast !== 'function' || this.applyingBotFillPolicy) return;
    try {
      dh.broadcast(this.domain.buildRosterEnvelope(this.sessionManager).rosterUpdateJson);
    } catch (err) {
      console.warn('[MatchRosterSubController] Failed to broadcast roster_update:', err);
    }
  }

  setGameMode(gameMode: string, durationSeconds: number | null = null): void {
    const { shouldApplyBotFill } = this.domain.applyRosterPolicyConfig({
      gameMode,
      durationSeconds,
    });
    if (shouldApplyBotFill) this.applyBotFillPolicy();
    else this.broadcastRosterUpdate();
  }

  setBotFillMode(botFillMode = 'no_bots', botType?: string): void {
    const { shouldApplyBotFill } = this.domain.applyRosterPolicyConfig({ botFillMode, botType });
    if (shouldApplyBotFill) this.applyBotFillPolicy();
    else this.broadcastRosterUpdate();
  }

  rollBotLoadoutForTeam(team = 0): PlayerLoadoutOptions {
    return rollTeamBotLoadout(this.domain.botsLoadoutConfig, this.players.values(), team);
  }

  addBotPlayer(
    preferredTeam = 1,
    botName: string | null = null,
    visualId: string | PlayerLoadoutOptions | null = null,
    botType?: string
  ) {
    const spec = resolveBotCreationSlotSpec({
      domain: this.domain,
      preferredTeam,
      botName,
      visualId,
      botType,
    });
    if (!spec) return null;
    if (this.domain.botFillMode === 'no_bots') this.domain.botFillMode = 'custom';
    return this.assignPlayerSlot(
      spec.sessionId,
      spec.resolvedName,
      'player',
      spec.preferredTeam,
      spec.loadout,
      spec.colorSlot
    );
  }

  applyBotFillPolicy(): void {
    if (this.applyingBotFillPolicy) return;
    this.withBotFillGuard(() => {
      executeBotFillPolicyOnRoster({
        players: this.players,
        botFillMode: this.domain.botFillMode,
        maxPlayers: this.domain.maxPlayers,
        defaultBotType: this.domain.defaultBotType,
        botsLoadoutConfig: this.domain.botsLoadoutConfig,
        removePlayerSession: (sid) => this.removePlayerSession(sid),
        switchPlayerRoleOrTeam: (sid, role, team) => this.switchPlayerRoleOrTeam(sid, role, team),
        assignPlayerSlot: (sid, name, role, team, loadout, colorSlot) =>
          this.assignPlayerSlot(sid, name, role, team, loadout, colorSlot ?? null),
      });
    });
    this.broadcastRosterUpdate();
  }

  syncRosterPhysicsEntities(): void {
    syncRosterCarsWithPhysicsEngine({
      players: this.players,
      physicsManager: this.physicsManager,
      sessionManager: this.sessionManager,
      lobbyPhysicsActive: this.domain.applyRosterPolicyConfig().lobbyPhysicsActive,
    });
  }

  applyPendingHitboxSwaps(): void {
    flushPendingHitboxSwapsToPhysics(this.players.values(), this.physicsManager);
  }

  applyRosterKickoffSpawns(): void {
    const pm = this.physicsManager;
    applyKickoffSpawnsToSim(
      pm ? pm.sim : undefined,
      pm ? new Set(pm.activeCarIndices) : null,
      this.players.values(),
      this.domain.applyRosterPolicyConfig().kickoffBoostAmount
    );
  }

  assignPlayerSlot(
    sessionId: string,
    playerName = 'Player',
    role = 'player',
    preferredTeam: number | null = null,
    loadoutOptions: PlayerLoadoutOptions | string | number = {},
    colorSlotArg: number | null = null
  ) {
    const outcome = resolveRosterSlotAssignmentOutcome({
      sessionId,
      playerName,
      role,
      preferredTeam,
      loadoutOptions,
      colorSlotArg,
      applyingBotFillPolicy: this.applyingBotFillPolicy,
      clearAutoFillBots: () => this.clearAutoFillBots(),
      domain: this.domain,
      sessionManager: this.sessionManager,
      physicsManager: this.physicsManager,
      dispatchSignal: this.emitSignal,
    });
    if (outcome.triggerBotFill) this.applyBotFillPolicy();
    if (outcome.broadcastRoster) this.broadcastRosterUpdate();
    if (
      outcome.triggerLobbyAutoStart &&
      this.domain.applyRosterPolicyConfig().shouldAutoStartLobby &&
      this.lobbyAutoStarter
    ) {
      this.lobbyAutoStarter.initiateMatchPrepare();
    }
    return outcome.slot;
  }

  removePlayerSession(sessionId: string): void {
    const res = removeSessionFromRosterState({
      sessionId,
      domain: this.domain,
      sessionManager: this.sessionManager,
      physicsManager: this.physicsManager,
      dispatchSignal: this.emitSignal,
    });
    if (res.removedType === 'none') return;
    if (res.removedType === 'player') {
      this.signalPort?.removeSessionVotes(sessionId);
      const shouldFill = this.domain.applyRosterPolicyConfig().shouldApplyBotFill;
      if (res.wasHumanPlayer && !this.applyingBotFillPolicy && shouldFill) {
        this.applyBotFillPolicy();
      }
    }
    this.broadcastRosterUpdate();
  }

  reclaimPlayerSession(
    sessionId: string,
    requestedEntityId = -1,
    preferredTeam: number | null = null
  ) {
    const res = resolveReclaimedPlayerSlot({
      sessionId,
      requestedEntityId,
      domain: this.domain,
      sessionManager: this.sessionManager,
      physicsManager: this.physicsManager,
      dispatchSignal: this.emitSignal,
    });
    if (res.status === 'existing_player') return res.slot;
    if (res.status === 'assign_new_player') {
      return this.assignPlayerSlot(sessionId, 'Player', 'player', preferredTeam);
    }
    if (res.status === 'assign_spectator') {
      return this.assignPlayerSlot(sessionId, res.playerName, 'spectator');
    }
    this.broadcastRosterUpdate();
    return res.slot;
  }

  updatePlayerLoadout(
    sessionId: string,
    visualIdOrPackedParam1: string | number,
    colorSlotOrPackedParam2: number | null = null,
    explicitHitbox: string | number | null = null,
    extraLoadout: Record<string, string | number | undefined> | null = null
  ): MatchPlayerSlot | null {
    const player = this.players.get(sessionId);
    if (!player) return null;
    applyUpdatedPlayerLoadoutAndHotSwap({
      sessionId,
      player,
      visualIdOrPackedParam1,
      colorSlotOrPackedParam2,
      explicitHitbox,
      extraLoadout,
      domain: this.domain,
      physicsManager: this.physicsManager,
      dispatchSignal: this.emitSignal,
    });
    this.broadcastRosterUpdate();
    return player;
  }

  switchPlayerRoleOrTeam(
    sessionId: string,
    targetRole: string | number = 'player',
    targetTeam = 0
  ): MatchPlayerSlot | MatchSpectatorSlot | null {
    return executeRosterRoleOrTeamSwitch({
      sessionId,
      targetRole,
      targetTeam,
      applyingBotFillPolicy: this.applyingBotFillPolicy,
      domain: this.domain,
      sessionManager: this.sessionManager,
      physicsManager: this.physicsManager,
      dataHandler: this.dataHandler,
      withBotFillGuard: (fn) => this.withBotFillGuard(fn),
      removePlayerSession: (sid) => this.removePlayerSession(sid),
      assignPlayerSlot: (sid, name, role, preferredTeam, loadout) =>
        this.assignPlayerSlot(sid, name, role, preferredTeam, loadout),
      applyBotFillPolicy: () => this.applyBotFillPolicy(),
      broadcastRosterUpdate: () => this.broadcastRosterUpdate(),
      dispatchSignal: this.emitSignal,
    });
  }

  clear(): void {
    this.players.clear();
    this.spectators.clear();
    this.disconnectedPlayerSlots.clear();
  }
}
