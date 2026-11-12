/**
 * src/network/server/match/matchControlPacketPipeline.ts
 * Pure data pipelines and narrow-interface helpers for reliable client command
 * deduplication, command type execution, replay-skip input edge detection,
 * and JSON control packet evaluation.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import { CLIENT_COMMAND_TYPES } from '../../../physics/RocketSimConstants.ts';
import {
  MATCH_STATES,
  type MatchPlayerSlot,
  type PlayerLoadoutOptions,
} from './matchLoadoutAndSpawnPipeline.ts';
import type {
  ClientCommandPayload,
  ControlPacketPayload,
  RoleSwitchDataHandlerPort,
} from './matchCommandAndSignalPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';

export interface ControlPacketRosterPort {
  assignPlayerSlot(
    sid: string,
    name: string,
    role: string,
    preferredTeam: number | null,
    loadout: PlayerLoadoutOptions
  ): unknown;
  updatePlayerLoadout(
    sid: string,
    visual: string | number,
    colorSlot: number | null,
    hitbox: string | number | null,
    extra?: Record<string, string | number | undefined> | null
  ): unknown;
  switchPlayerRoleOrTeam(sid: string, role: string | number, team: number): unknown;
  reclaimPlayerSession(
    sid: string,
    requestedEntityId: number,
    preferredTeam: number | null
  ): unknown;
  removePlayerSession(sid: string): void;
  broadcastRosterUpdate(): void;
}

export interface ReliableCommandLifecyclePort {
  initiateMatchPrepare(durationSeconds?: number | null, timeoutTicks?: number): void;
  checkArenaLoadedBarrier(): boolean;
  setPaused(pause: boolean): void;
  requestResumeWithCountdown(countdownSeconds?: number): void;
  endMatch(forcedWinner?: number | null, winReason?: number): void;
}

export interface ReliableCommandSystemControlPort {
  enterStateOnlyMode(stateSnapshot?: Float32Array | number[] | null, cursorTick?: number): void;
  beginInterveneCountdown(
    countdownSeconds?: number,
    stateSnapshot?: Float32Array | number[] | null
  ): number;
  resumePhysicsFromState(stateSnapshot?: Float32Array | number[] | null, resumeTick?: number): void;
}

export function recordDeduplicatedClientCommandId(
  processedClientCommands: Map<string, Set<number>>,
  sessionId: string,
  commandId: number
): boolean {
  if (commandId <= 0) return false;
  let seenSet = processedClientCommands.get(sessionId);
  if (!seenSet) {
    seenSet = new Set<number>();
    processedClientCommands.set(sessionId, seenSet);
  }
  if (seenSet.has(commandId)) return true;
  seenSet.add(commandId);
  if (seenSet.size > 256) {
    const first = seenSet.values().next().value;
    if (first !== undefined) seenSet.delete(first);
  }
  return false;
}

export function hasJumpEdgeInClientInputHistory(
  inputHistory: Array<{ jump?: boolean; controls?: { jump?: boolean } }>
): boolean {
  for (let i = 0; i < inputHistory.length; i++) {
    const ctrl = inputHistory[i]?.controls || inputHistory[i];
    if (ctrl?.jump) return true;
  }
  return false;
}

export function executeReliableClientCommand(p: {
  sessionId: string;
  cmd: ClientCommandPayload;
  domain: MatchDomainState;
  roster: ControlPacketRosterPort;
  lifecycle: ReliableCommandLifecyclePort | null;
  systemControl: ReliableCommandSystemControlPort | null;
  skipReplayVotes: Set<string>;
  rematchVotes: Set<string>;
  forfeitVotes: Set<string>;
  checkSkipReplayVotes: () => void;
  checkRematchReady: () => void;
  dispatchSignal: (type: number, frameId: number, p1?: number, p2?: number) => unknown;
}): void {
  const {
    sessionId,
    cmd,
    domain,
    roster,
    lifecycle: lc,
    systemControl: sc,
    skipReplayVotes,
    rematchVotes,
    forfeitVotes,
    checkSkipReplayVotes,
    checkRematchReady,
    dispatchSignal,
  } = p;
  const commandType = cmd.commandType;
  const param1 = cmd.param1 ?? 0;
  const param2 = cmd.param2 ?? 0;
  const st = domain.state;

  switch (commandType) {
    case CLIENT_COMMAND_TYPES.CMD_READY_ACK: {
      const player = domain.players.get(sessionId);
      if (player) {
        player.ready = param1 !== 0;
        roster.broadcastRosterUpdate();
      }
      if (domain.areAllHumanPlayersReadyInFullLobby()) {
        if (lc) lc.initiateMatchPrepare();
      } else if (st === MATCH_STATES.ENDED || st === MATCH_STATES.PODIUM) {
        if (param1 !== 0) {
          rematchVotes.add(sessionId);
          checkRematchReady();
        } else {
          rematchVotes.delete(sessionId);
        }
      }
      break;
    }
    case CLIENT_COMMAND_TYPES.CMD_ARENA_LOADED_ACK: {
      const player = domain.players.get(sessionId);
      if (player) {
        player.arenaLoaded = true;
        roster.broadcastRosterUpdate();
      }
      if (lc) lc.checkArenaLoadedBarrier();
      break;
    }
    case CLIENT_COMMAND_TYPES.CMD_SET_LOADOUT:
      roster.updatePlayerLoadout(sessionId, param1, param2, null);
      break;
    case CLIENT_COMMAND_TYPES.CMD_SWITCH_ROLE_TEAM:
      roster.switchPlayerRoleOrTeam(
        sessionId,
        param1 === 1 || param1 === 2 ? 'spectator' : 'player',
        param2 === 2 ? 2 : param2 === 1 ? 1 : 0
      );
      break;
    case CLIENT_COMMAND_TYPES.CMD_VOTE_SKIP_REPLAY:
      if (param1 !== 0) {
        skipReplayVotes.add(sessionId);
        checkSkipReplayVotes();
      }
      break;
    case CLIENT_COMMAND_TYPES.CMD_VOTE_REMATCH:
      if (param1 !== 0) rematchVotes.add(sessionId);
      else rematchVotes.delete(sessionId);
      checkRematchReady();
      break;
    case CLIENT_COMMAND_TYPES.CMD_REQUEST_PAUSE:
      if (param1 !== 0 && st === MATCH_STATES.PLAYING && lc) lc.setPaused(true);
      else if (param1 === 0 && st === MATCH_STATES.PAUSED && lc) lc.requestResumeWithCountdown(5);
      break;
    case CLIENT_COMMAND_TYPES.CMD_VOTE_FORFEIT: {
      const player = domain.players.get(sessionId);
      if (player && (st === MATCH_STATES.PLAYING || st === MATCH_STATES.KICKOFF)) {
        forfeitVotes.add(sessionId);
        const winningTeam = player.team === 0 ? 1 : 0;
        dispatchSignal(MATCH_SIGNALS.FORFEIT_VOTE, domain.matchTick, player.entityId, winningTeam);
        if (lc) lc.endMatch(winningTeam, 2);
      }
      break;
    }
    case CLIENT_COMMAND_TYPES.CMD_REJOIN_CLAIM:
      roster.reclaimPlayerSession(
        sessionId,
        typeof param1 === 'number' && param1 < 6 ? param1 : -1,
        param2 === 0 || param2 === 1 ? param2 : null
      );
      break;
    case CLIENT_COMMAND_TYPES.CMD_SYS_STATE_ONLY:
      if (sc) sc.enterStateOnlyMode(cmd.stateSnapshot || null, param1 > 0 ? param1 : undefined);
      break;
    case CLIENT_COMMAND_TYPES.CMD_SYS_INTERVENE_COUNTDOWN:
      if (sc) sc.beginInterveneCountdown(param1 > 0 ? param1 : 3, cmd.stateSnapshot || null);
      break;
    case CLIENT_COMMAND_TYPES.CMD_SYS_PHYSICS_RESUME:
      if (sc) {
        sc.resumePhysicsFromState(cmd.stateSnapshot || null, param1 > 0 ? param1 : undefined);
      }
      break;
    default:
      break;
  }
}

export function evaluateSessionControlPacket(params: {
  channelId: string;
  packetType: string | number;
  packetData: ControlPacketPayload | null | undefined;
  roster: ControlPacketRosterPort;
  dataHandler: RoleSwitchDataHandlerPort | null | undefined;
  sim?: { saveCompactState?: () => Float32Array; saveState?: () => Float32Array } | null;
  sessionManager?: {
    getSession?: (sid: string) => { updateRtt?: (rtt: number) => void } | null | undefined;
  } | null;
  buildHandshakeJson: (player: MatchPlayerSlot | null, initialSnapshot?: number[] | null) => string;
  handleClientCommand: (channelId: string, cmd: ClientCommandPayload) => void;
}): unknown {
  const {
    channelId,
    packetType,
    packetData: pd,
    roster,
    dataHandler,
    sim,
    sessionManager,
    buildHandshakeJson,
    handleClientCommand,
  } = params;
  if (!pd) return null;
  const type = pd.type || packetType;

  if (
    type === 'join' ||
    type === 'join_training' ||
    type === 'token' ||
    type === 'handshake_request'
  ) {
    const info = roster.assignPlayerSlot(
      channelId,
      pd.playerName || pd.clientName || 'Player',
      pd.role || 'player',
      pd.preferredTeam ?? null,
      {
        visualId: pd.visualId || pd.carVisual || 'fennec',
        hitboxId: pd.hitboxId || pd.carHitbox || null,
        colorSlot: pd.colorSlot,
        blueColorSlot: pd.blueColorSlot,
        orangeColorSlot: pd.orangeColorSlot,
        paintFinish: pd.paintFinish,
        boostVisual: pd.boostVisual,
        boostAudio: pd.boostAudio,
        anthemId: pd.anthemId,
      }
    );
    if (dataHandler && info && typeof info === 'object' && 'visualId' in info) {
      const rawSnap = sim?.saveCompactState ? sim.saveCompactState() : sim?.saveState?.();
      dataHandler.sendPacket(
        channelId,
        buildHandshakeJson(info as MatchPlayerSlot, rawSnap ? Array.from<number>(rawSnap) : null)
      );
    }
    return info;
  }

  if (type === 'color_change' || type === 'loadout_change') {
    if (
      pd.visualId !== undefined ||
      pd.slotId !== undefined ||
      pd.hitboxId !== undefined ||
      pd.paintFinish !== undefined ||
      pd.boostVisual !== undefined ||
      pd.boostAudio !== undefined
    ) {
      roster.updatePlayerLoadout(
        channelId,
        pd.visualId ?? 'fennec',
        pd.slotId ?? null,
        pd.hitboxId ?? null,
        {
          paintFinish: pd.paintFinish,
          boostVisual: pd.boostVisual,
          boostAudio: pd.boostAudio,
        }
      );
    }
    dataHandler?.broadcast?.(JSON.stringify(pd), (id: string) => id !== channelId);
    return null;
  }
  if (type === 'client_command' && typeof pd.commandType === 'number') {
    handleClientCommand(channelId, pd as ClientCommandPayload);
    return null;
  }
  if (type === 'match_ready_ack' || type === 'arena_loaded_ack') {
    handleClientCommand(channelId, {
      commandId: pd.commandId ?? 0,
      commandType:
        type === 'match_ready_ack'
          ? CLIENT_COMMAND_TYPES.CMD_READY_ACK
          : CLIENT_COMMAND_TYPES.CMD_ARENA_LOADED_ACK,
      param1: type === 'match_ready_ack' ? (pd.ready === false ? 0 : 1) : (pd.matchSequence ?? 0),
      param2: 0,
    });
    return null;
  }
  if (type === 'ping') {
    if (typeof pd.rtt === 'number') sessionManager?.getSession?.(channelId)?.updateRtt?.(pd.rtt);
    dataHandler?.sendPacket(
      channelId,
      JSON.stringify({ type: 'pong', sendTime: pd.sendTime || Date.now(), serverTime: Date.now() })
    );
    return null;
  }
  if (type === 'leave') roster.removePlayerSession(channelId);
  return null;
}
