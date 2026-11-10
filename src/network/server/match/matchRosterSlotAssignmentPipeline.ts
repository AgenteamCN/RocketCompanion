/**
 * src/network/server/match/matchRosterSlotAssignmentPipeline.ts
 * Pure data pipelines and narrow-interface helpers for bot slot specification,
 * spectator/player slot registration, existing-player slot patching, and hitbox hot-swapping.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import {
  MATCH_STATES,
  resolveNormalizedSlotLoadout,
  resolveCosmeticsPatchForExistingPlayerSlot,
  resolveUpdatedPlayerLoadout,
  computeNormalizedTeamSpawnSlots,
  type MatchPlayerSlot,
  type MatchSpectatorSlot,
  type PlayerLoadoutOptions,
  type NormalizedSlotLoadoutResult,
} from './matchLoadoutAndSpawnPipeline.ts';
import {
  createNewPlayerSlotInfo,
  registerAssignedPlayerWithSessionAndPhysics,
  resolveLobbyExistingPlayerTeamSwitchPatch,
  rollTeamBotLoadout,
  type RosterPhysicsManagerPort,
  type RosterSessionPort,
  type SignalDispatchFn,
} from './matchRosterPhysicsAndBotPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';

export interface BotCreationSlotSpec {
  sessionId: string;
  resolvedName: string;
  preferredTeam: number;
  loadout: PlayerLoadoutOptions;
  colorSlot: number | null;
}

export function resolveBotCreationSlotSpec(p: {
  domain: MatchDomainState;
  preferredTeam: number;
  botName: string | null;
  visualId: string | PlayerLoadoutOptions | null;
  botType?: string;
}): BotCreationSlotSpec | null {
  const { domain, preferredTeam, botName, visualId, botType } = p;
  if (domain.players.size >= 6) return null;
  let botIdx = 1;
  while (domain.players.has(`bot_${botIdx}`)) botIdx++;
  const resolvedBotType =
    botType ||
    (visualId && typeof visualId === 'object' ? visualId.botType : undefined) ||
    domain.defaultBotType ||
    'nexto';
  const botLabel = resolvedBotType.charAt(0).toUpperCase() + resolvedBotType.slice(1);
  const sessionId = `bot_${botIdx}`;
  const resolvedName = botName || `${botLabel} #${botIdx}`;
  const rolled = {
    ...rollTeamBotLoadout(domain.botsLoadoutConfig, domain.players.values(), preferredTeam ?? 1),
    botType: resolvedBotType,
  };
  const loadout: PlayerLoadoutOptions =
    visualId && typeof visualId === 'object'
      ? { ...rolled, ...visualId, botType: resolvedBotType }
      : visualId
        ? { ...rolled, visualId }
        : rolled;
  return {
    sessionId,
    resolvedName,
    preferredTeam,
    loadout,
    colorSlot: loadout.colorSlot ?? null,
  };
}

export function updateExistingAssignedPlayerSlot(p: {
  sessionId: string;
  playerName: string;
  preferredTeam: number | null;
  isBotSession: boolean;
  resolved: NormalizedSlotLoadoutResult;
  existing: MatchPlayerSlot;
  domain: MatchDomainState;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): MatchPlayerSlot {
  const { sessionId, playerName, preferredTeam, isBotSession, resolved, existing, domain } = p;
  const nl = resolved.normalizedLoadout;
  const basePatch: Partial<MatchPlayerSlot> = {};
  if (typeof nl.blueColorSlot === 'number') basePatch.blueColorSlot = nl.blueColorSlot;
  if (typeof nl.orangeColorSlot === 'number') basePatch.orangeColorSlot = nl.orangeColorSlot;
  if (playerName && playerName !== 'Player') {
    basePatch.name = playerName;
    const s = p.sessionManager?.getSession?.(sessionId);
    if (s) s.playerName = playerName;
  }
  domain.updatePlayerSlot(sessionId, basePatch);

  if (
    !isBotSession &&
    (preferredTeam === 0 || preferredTeam === 1) &&
    existing.team !== preferredTeam &&
    domain.state === MATCH_STATES.LOBBY
  ) {
    const teamPatch = resolveLobbyExistingPlayerTeamSwitchPatch({
      sessionId,
      existing,
      preferredTeam,
      requestedColorSlot: nl.colorSlot,
      players: domain.players,
      sessionManager: p.sessionManager,
      physicsManager: p.physicsManager,
    });
    domain.updatePlayerSlot(sessionId, teamPatch);
    computeNormalizedTeamSpawnSlots(domain.players.values());
    if (typeof existing.entityId === 'number' && existing.entityId >= 0) {
      p.dispatchSignal(
        MATCH_SIGNALS.PLAYER_SLOT_UPDATED,
        domain.matchTick,
        existing.entityId,
        existing.team
      );
    }
  }
  domain.updatePlayerSlot(
    sessionId,
    resolveCosmeticsPatchForExistingPlayerSlot(existing, resolved)
  );
  return existing;
}

export type RosterSlotAssignmentResult = {
  slot:
    | MatchPlayerSlot
    | MatchSpectatorSlot
    | { entityId: number; team: number; role: string; spawnSlot: number };
  broadcastRoster: boolean;
  triggerBotFill: boolean;
  triggerLobbyAutoStart: boolean;
};

export function resolveRosterSlotAssignmentOutcome(p: {
  sessionId: string;
  playerName: string;
  role: string;
  preferredTeam: number | null;
  loadoutOptions: PlayerLoadoutOptions | string | number;
  colorSlotArg: number | null;
  applyingBotFillPolicy: boolean;
  clearAutoFillBots: () => boolean;
  domain: MatchDomainState;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): RosterSlotAssignmentResult {
  const { sessionId, playerName, role, preferredTeam, applyingBotFillPolicy, domain } = p;
  const isBotSession = sessionId === 'bot' || String(sessionId).startsWith('bot_');
  const resolved = resolveNormalizedSlotLoadout(p.loadoutOptions, p.colorSlotArg, isBotSession);

  const existingPlayer = domain.players.get(sessionId);
  if (existingPlayer) {
    updateExistingAssignedPlayerSlot({
      sessionId,
      playerName,
      preferredTeam,
      isBotSession,
      resolved,
      existing: existingPlayer,
      domain,
      sessionManager: p.sessionManager,
      physicsManager: p.physicsManager,
      dispatchSignal: p.dispatchSignal,
    });
    return {
      slot: existingPlayer,
      broadcastRoster: true,
      triggerBotFill:
        !isBotSession &&
        !applyingBotFillPolicy &&
        domain.applyRosterPolicyConfig().shouldApplyBotFill,
      triggerLobbyAutoStart: false,
    };
  }

  const existingSpec = domain.spectators.get(sessionId);
  if (existingSpec && role === 'spectator') {
    if (playerName && playerName !== 'Player') existingSpec.name = playerName;
    return {
      slot: existingSpec,
      broadcastRoster: true,
      triggerBotFill: false,
      triggerLobbyAutoStart: false,
    };
  }

  const clearedAutoFillBots =
    role !== 'spectator' && !isBotSession && !applyingBotFillPolicy ? p.clearAutoFillBots() : false;

  if (role === 'spectator' || domain.players.size >= domain.maxPlayers) {
    domain.spectators.set(sessionId, {
      sessionId,
      name: playerName,
      role: 'spectator',
      ready: true,
      arenaLoaded: true,
    });
    p.sessionManager?.registerSession(sessionId, { role: 'spectator', entityId: -1, playerName });
    p.dispatchSignal(MATCH_SIGNALS.PLAYER_JOINED, domain.matchTick, -1, 2);
    return {
      slot: { entityId: -1, team: -1, role: 'spectator', spawnSlot: -1 },
      broadcastRoster: false,
      triggerBotFill: false,
      triggerLobbyAutoStart: false,
    };
  }

  const playerInfo = createNewPlayerSlotInfo(
    sessionId,
    playerName,
    preferredTeam,
    domain.players.values(),
    resolved,
    isBotSession
  );
  domain.players.set(sessionId, playerInfo);

  const policyFlags = domain.applyRosterPolicyConfig();
  registerAssignedPlayerWithSessionAndPhysics({
    sessionId,
    playerInfo,
    state: domain.state,
    lobbyMode: policyFlags.lobbyMode,
    isTrainingMode: policyFlags.isTrainingMode,
    matchTick: domain.matchTick,
    sessionManager: p.sessionManager,
    physicsManager: p.physicsManager,
    dispatchSignal: p.dispatchSignal,
  });

  const triggerBotFill =
    (clearedAutoFillBots || policyFlags.shouldApplyBotFill) &&
    !isBotSession &&
    !applyingBotFillPolicy &&
    domain.state !== MATCH_STATES.LOBBY;
  return {
    slot: playerInfo,
    broadcastRoster: true,
    triggerBotFill,
    triggerLobbyAutoStart: !applyingBotFillPolicy,
  };
}

export function applyUpdatedPlayerLoadoutAndHotSwap(p: {
  sessionId: string;
  player: MatchPlayerSlot;
  visualIdOrPackedParam1: string | number;
  colorSlotOrPackedParam2: number | null;
  explicitHitbox: string | number | null;
  extraLoadout: Record<string, string | number | undefined> | null;
  domain: MatchDomainState;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): MatchPlayerSlot {
  const { sessionId, player, domain, physicsManager } = p;
  const { patch, packedLoadout } = resolveUpdatedPlayerLoadout(
    player,
    sessionId,
    p.visualIdOrPackedParam1,
    p.colorSlotOrPackedParam2,
    p.explicitHitbox,
    p.extraLoadout
  );
  domain.updatePlayerSlot(sessionId, patch);

  if (domain.applyRosterPolicyConfig().canHotSwapNow && physicsManager && player.entityId >= 0) {
    physicsManager.applySignal('HOTSWAP_HITBOX', {
      carIndex: player.entityId,
      hitboxType: player.hitboxId,
    });
    player.pendingVisualId = null;
  } else {
    player.pendingVisualId = player.hitboxId;
  }

  p.dispatchSignal(
    MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED,
    domain.matchTick,
    player.entityId,
    packedLoadout
  );
  return player;
}

export function flushPendingHitboxSwapsToPhysics(
  players: Iterable<MatchPlayerSlot>,
  physicsManager: RosterPhysicsManagerPort | null | undefined
): void {
  if (!physicsManager) return;
  for (const p of players) {
    if (p.pendingVisualId && p.entityId >= 0) {
      physicsManager.applySignal('HOTSWAP_HITBOX', {
        carIndex: p.entityId,
        hitboxType: p.pendingVisualId,
      });
      p.pendingVisualId = null;
    }
  }
}
