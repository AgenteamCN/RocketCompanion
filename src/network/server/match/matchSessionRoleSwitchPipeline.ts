/**
 * src/network/server/match/matchSessionRoleSwitchPipeline.ts
 * Pure data pipelines and narrow-interface helpers for disconnected slot reclamation,
 * session removal, existing-slot loadout/team patching, and role/team switching.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import {
  PLAYER_ROLE_CODES,
  packLoadoutSignalParam2,
} from '../../../ui-core/config/vehicleConstants.ts';
import {
  MATCH_STATES,
  resolveDefaultColorSlotForTeam,
  type MatchPlayerSlot,
  type MatchSpectatorSlot,
  type DisconnectedPlayerSlot,
  type PlayerLoadoutOptions,
} from './matchLoadoutAndSpawnPipeline.ts';
import {
  resolveInPlacePlayerTeamSwitchPatch,
  type RosterPhysicsManagerPort,
  type RosterSessionPort,
  type SignalDispatchFn,
} from './matchRosterPhysicsAndBotPipeline.ts';
import type {
  ClientCommandPayload,
  ControlPacketPayload,
  RoleSwitchDataHandlerPort,
} from './matchCommandAndSignalPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';

export type { ClientCommandPayload, ControlPacketPayload, RoleSwitchDataHandlerPort };

export function popReclaimedPlayerSlotCandidate(
  disconnectedPlayerSlots: Map<number, DisconnectedPlayerSlot>,
  players: Iterable<MatchPlayerSlot>,
  requestedEntityId: number
): { reclaimed: DisconnectedPlayerSlot | null; entityId: number } {
  let reclaimed: DisconnectedPlayerSlot | null = null;
  if (disconnectedPlayerSlots.size > 0) {
    if (
      typeof requestedEntityId === 'number' &&
      requestedEntityId >= 0 &&
      disconnectedPlayerSlots.has(requestedEntityId)
    ) {
      reclaimed = disconnectedPlayerSlots.get(requestedEntityId) || null;
      disconnectedPlayerSlots.delete(requestedEntityId);
    } else {
      const firstEntry = disconnectedPlayerSlots.entries().next().value;
      if (firstEntry) {
        reclaimed = firstEntry[1];
        disconnectedPlayerSlots.delete(firstEntry[0]);
      }
    }
  }
  if (!reclaimed) return { reclaimed: null, entityId: -1 };
  const usedEntityIds = new Set(Array.from(players).map((p) => p.entityId));
  let entityId = reclaimed.entityId;
  if (usedEntityIds.has(entityId) || entityId < 0 || entityId >= 6) {
    entityId = -1;
    for (let i = 0; i < 6; i++) {
      if (!usedEntityIds.has(i)) {
        entityId = i;
        break;
      }
    }
  }
  return { reclaimed, entityId };
}

export interface SessionRemovalOutcome {
  removedType: 'none' | 'player' | 'spectator';
  wasHumanPlayer: boolean;
}

export function removeSessionFromRosterState(p: {
  sessionId: string;
  domain: MatchDomainState;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): SessionRemovalOutcome {
  const { domain } = p;
  const player = domain.players.get(p.sessionId);
  if (player) {
    const entityId = player.entityId;
    const wasHumanPlayer = !player.isBot;
    if (wasHumanPlayer && entityId >= 0) {
      domain.disconnectedPlayerSlots.set(entityId, {
        ...player,
        disconnectedAtTick: domain.matchTick,
      });
    }
    domain.players.delete(p.sessionId);
    p.sessionManager?.unregisterSession?.(p.sessionId);
    if (p.physicsManager && entityId >= 0) p.physicsManager.unregisterCarEntity(entityId);
    p.dispatchSignal(MATCH_SIGNALS.PLAYER_LEFT, domain.matchTick, entityId, player.team ?? 0);
    return { removedType: 'player', wasHumanPlayer };
  }
  if (domain.spectators.has(p.sessionId)) {
    domain.spectators.delete(p.sessionId);
    p.sessionManager?.unregisterSession?.(p.sessionId);
    p.dispatchSignal(MATCH_SIGNALS.PLAYER_LEFT, domain.matchTick, -1, 2);
    return { removedType: 'spectator', wasHumanPlayer: false };
  }
  return { removedType: 'none', wasHumanPlayer: false };
}

export type ReclaimResolutionResult =
  | { status: 'existing_player'; slot: MatchPlayerSlot }
  | { status: 'assign_new_player' }
  | { status: 'assign_spectator'; playerName: string }
  | { status: 'reclaimed'; slot: MatchPlayerSlot };

export function resolveReclaimedPlayerSlot(p: {
  sessionId: string;
  requestedEntityId: number;
  domain: MatchDomainState;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): ReclaimResolutionResult {
  const { domain } = p;
  const existing = domain.players.get(p.sessionId);
  if (existing) return { status: 'existing_player', slot: existing };

  const { reclaimed, entityId } = popReclaimedPlayerSlotCandidate(
    domain.disconnectedPlayerSlots,
    domain.players.values(),
    p.requestedEntityId
  );
  if (!reclaimed) return { status: 'assign_new_player' };
  if (entityId < 0) return { status: 'assign_spectator', playerName: reclaimed.name || 'Player' };
  if (domain.spectators.has(p.sessionId)) domain.spectators.delete(p.sessionId);

  const slot: MatchPlayerSlot = {
    ...reclaimed,
    sessionId: p.sessionId,
    entityId,
    carIndex: entityId,
    ready: true,
    arenaLoaded: true,
    isBot: false,
  };
  domain.players.set(p.sessionId, slot);
  p.sessionManager?.registerSession(p.sessionId, {
    role: 'player',
    entityId,
    team: slot.team,
    visualId: slot.visualId,
    hitboxId: slot.hitboxId,
    deferPhysicsRegistration: false,
    playerName: slot.name,
  });
  if (p.physicsManager) {
    const hb = slot.hitboxId || slot.visualId || 'octane';
    p.physicsManager.registerCarEntity(entityId, slot.team, hb);
    p.physicsManager.applySignal('HOTSWAP_HITBOX', { carIndex: entityId, hitboxType: hb });
  }
  p.dispatchSignal(MATCH_SIGNALS.PLAYER_JOINED, domain.matchTick, entityId, slot.team);
  p.dispatchSignal(MATCH_SIGNALS.PLAYER_SLOT_UPDATED, domain.matchTick, entityId, slot.team);
  const packedLoadout = packLoadoutSignalParam2(
    slot.visualIndex ?? slot.visualId,
    slot.colorSlot,
    slot.hitboxIndex ?? slot.hitboxId,
    {
      paintFinish: slot.paintFinish || 'metallic',
      boostVisual: slot.boostVisual || 'cartoon',
      boostAudio: slot.boostAudio || 'rush',
    }
  );
  p.dispatchSignal(MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED, domain.matchTick, entityId, packedLoadout);
  return { status: 'reclaimed', slot };
}

function extractPreservedRoleSwitchLoadout(
  currentPlayer: MatchPlayerSlot | undefined,
  currentSpectator: MatchSpectatorSlot | undefined,
  targetTeam: number
): { name: string; spectatorLoadout: PlayerLoadoutOptions; playerLoadout: PlayerLoadoutOptions } {
  const name = currentPlayer?.name || currentSpectator?.name || 'Player';
  const visualId = currentPlayer?.visualId || 'fennec';
  const base: PlayerLoadoutOptions = {
    visualId,
    hitboxId: currentPlayer?.hitboxId || visualId,
    paintFinish: currentPlayer?.paintFinish || 'metallic',
    boostVisual: currentPlayer?.boostVisual || 'cartoon',
    boostAudio: currentPlayer?.boostAudio || 'rush',
  };
  return {
    name,
    spectatorLoadout: {
      ...base,
      colorSlot: currentPlayer?.colorSlot ?? resolveDefaultColorSlotForTeam(targetTeam),
    },
    playerLoadout: {
      ...base,
      colorSlot: resolveDefaultColorSlotForTeam(targetTeam === 1 ? 1 : 0),
    },
  };
}

export function executeRosterRoleOrTeamSwitch(p: {
  sessionId: string;
  targetRole: string | number;
  targetTeam: number;
  applyingBotFillPolicy: boolean;
  domain: MatchDomainState;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dataHandler: RoleSwitchDataHandlerPort | null | undefined;
  withBotFillGuard: <T>(fn: () => T) => T;
  removePlayerSession: (sid: string) => void;
  assignPlayerSlot: (
    sid: string,
    name: string,
    role: string,
    preferredTeam: number | null,
    loadout: PlayerLoadoutOptions
  ) => unknown;
  applyBotFillPolicy: () => void;
  broadcastRosterUpdate: () => void;
  dispatchSignal: SignalDispatchFn;
}): MatchPlayerSlot | MatchSpectatorSlot | null {
  const { sessionId, targetRole, targetTeam, domain, dataHandler, dispatchSignal } = p;
  const policyFlags = domain.applyRosterPolicyConfig();
  const cp = domain.players.get(sessionId);
  const cs = domain.spectators.get(sessionId);
  const { name, spectatorLoadout, playerLoadout } = extractPreservedRoleSwitchLoadout(
    cp,
    cs,
    targetTeam
  );

  if (targetRole === 'spectator' || targetRole === 2) {
    if (cp) p.removePlayerSession(sessionId);
    const specSlot = p.assignPlayerSlot(
      sessionId,
      name,
      'spectator',
      null,
      spectatorLoadout
    ) as MatchSpectatorSlot | null;
    dispatchSignal(
      MATCH_SIGNALS.PLAYER_SLOT_UPDATED,
      domain.matchTick,
      65535,
      PLAYER_ROLE_CODES.SPECTATOR
    );
    if (dataHandler && sessionId && sessionId !== 'host') {
      dataHandler.sendPacket(
        sessionId,
        domain.buildRosterEnvelope(p.sessionManager as never).buildHandshakeJson(null)
      );
    }
    return specSlot;
  }

  let teamCount = 0;
  let autoFillBotSid: string | null = null;
  if (targetTeam === 0 || targetTeam === 1) {
    for (const [sid, slot] of domain.players.entries()) {
      if (sid !== sessionId && slot.team === targetTeam) {
        teamCount++;
        if (slot.isBot && String(sid).startsWith('bot_fill_') && !autoFillBotSid) {
          autoFillBotSid = sid;
        }
      }
    }
  }
  if (teamCount >= 5 && autoFillBotSid && !p.applyingBotFillPolicy) {
    p.withBotFillGuard(() => {
      p.removePlayerSession(autoFillBotSid!);
      teamCount--;
    });
  }
  if ((targetTeam === 0 || targetTeam === 1) && teamCount >= 5) return cp || cs || null;
  if (cp && cp.team === targetTeam) return cp;

  const hadValidEntity = Boolean(cp && typeof cp.entityId === 'number' && cp.entityId >= 0);
  let updated: MatchPlayerSlot | MatchSpectatorSlot | null = null;
  if (hadValidEntity && cp) {
    const patch = resolveInPlacePlayerTeamSwitchPatch({
      sessionId,
      currentPlayer: cp,
      targetTeam,
      players: domain.players,
      state: domain.state,
      isTrainingMode: policyFlags.isTrainingMode,
      matchTick: domain.matchTick,
      sessionManager: p.sessionManager,
      physicsManager: p.physicsManager,
      dispatchSignal,
    });
    updated = domain.updatePlayerSlot(sessionId, patch) || cp;
    p.broadcastRosterUpdate();
  } else {
    updated = p.withBotFillGuard(() => {
      if (cs) p.removePlayerSession(sessionId);
      return p.assignPlayerSlot(sessionId, name, 'player', targetTeam, playerLoadout) as
        MatchPlayerSlot | MatchSpectatorSlot | null;
    });
  }

  if (!p.applyingBotFillPolicy && policyFlags.shouldApplyBotFill) p.applyBotFillPolicy();
  if (updated && 'entityId' in updated && updated.entityId >= 0) {
    if (domain.state !== MATCH_STATES.LOBBY || !hadValidEntity) {
      dispatchSignal(
        MATCH_SIGNALS.PLAYER_SLOT_UPDATED,
        domain.matchTick,
        updated.entityId,
        updated.team === 1 ? 1 : 0
      );
    }
    if (!hadValidEntity && dataHandler && sessionId && sessionId !== 'host') {
      dataHandler.sendPacket(
        sessionId,
        domain.buildRosterEnvelope(p.sessionManager as never).buildHandshakeJson(updated)
      );
    }
  }
  return updated;
}
