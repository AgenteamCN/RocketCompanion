import {
  HOST_WORKER_MSG_TYPES as MSG,
  createWorkerEnvelope,
  type WorkerEnvelope,
} from '../protocol/HostWorkerProtocol.ts';
import { MATCH_STATES, type RosterSnapshot } from './match/matchLoadoutAndSpawnPipeline.ts';
import {
  releaseDiagnosticFleetIfEnabled,
  routeReplayAndDiagnosticsMessage,
  type WorkerRouterContext,
  type WorkerReplayDiagnosticsPayload,
} from './workerReplayAndDiagnosticsRouter.ts';
import {
  routeTrainingAndPhysicsMessage,
  type WorkerTrainingAndPhysicsPayload,
} from './workerTrainingAndPhysicsRouter.ts';
import type { MatchSessionAdmin } from './match/MatchSessionAdmin.ts';
import type { PhysicsEngineManager } from './PhysicsEngineManager.ts';
import type { EstablishedSessionManager } from './EstablishedSessionManager.ts';
import type { NetworkDataHandler } from './NetworkDataHandler.ts';
import type { AuthoritativePhysicsSimPort } from './authoritativePhysicsStepPipeline.ts';
import type { LobbyGhostConfigOptions } from './LobbyGhostCarCoordinator.ts';
import type { CarControlsInput } from '../protocol/GlobalPayloadCodec.ts';
import type { ClientReliableCommand } from './match/MatchCommandQueueSubController.ts';

export type { WorkerRouterContext };

export interface WorkerRoomStateSummary {
  roomId: string;
  gameMode: string;
  botFillMode: string;
  state: string;
  matchTick: number;
  clockSecondsRemaining: number;
  isOvertime: boolean;
  overtimeSeconds: number;
  blueScore: number;
  orangeScore: number;
  winner: string | number | null;
  winReason: string | number | null;
  lobbyPhysicsActive: boolean;
  ghostConfig: LobbyGhostConfigOptions | null;
  pads: unknown;
  roster: RosterSnapshot;
}

export interface HostWorkerInitOptions {
  roomId?: string;
  gameMode?: string;
  botFillMode?: string;
  externalBotTunnels?: boolean;
  initialState?: Float32Array | number[] | null;
  wasmInitOptions?: {
    collisionData?: Uint8Array[] | null;
    isolated?: boolean;
    [key: string]: unknown;
  };
  hostPlayerName?: string;
  hostVisualId?: string;
  hostHitboxId?: string | null;
  hostColorSlot?: number;
  hostBlueColorSlot?: number | null;
  hostOrangeColorSlot?: number | null;
  hostPaintFinish?: string;
  hostBoostVisual?: string;
  hostBoostAudio?: string;
  isBotMatch?: boolean;
  botPlayerName?: string;
  botVisualId?: string;
  numCars?: number;
  startAsMatch?: boolean;
  lobbyMode?: boolean;
  lobbyOptions?: Record<string, unknown> | null;
  durationSeconds?: number;
  maxOvertimeSeconds?: number;
  skipReplayByDefault?: boolean;
  trainingOptions?: WorkerTrainingAndPhysicsPayload | null;
  resetKickoff?: boolean;
  autoStartLoop?: boolean;
  [key: string]: unknown;
}

export interface WorkerProtocolPayload
  extends WorkerReplayDiagnosticsPayload, WorkerTrainingAndPhysicsPayload, HostWorkerInitOptions {
  channelId?: string;
  playerName?: string;
  name?: string;
  preferredTeam?: number | null;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
  packet?: Uint8Array | ArrayBuffer;
  timestamp?: number;
  targetTick?: number;
  commands?: ClientReliableCommand[];
  command?: ClientReliableCommand;
  commandType?: number;
  acks?: Array<{ signalId: number; signalType?: number }>;
  signalId?: number;
  signalType?: number;
  forceEnterLobby?: boolean;
  ghostCars?: boolean;
  ghostMode?: string;
  hostCarIndex?: number;
  hostInteractsWithBall?: boolean;
  broadcastHostOnly?: boolean;
  ghostOpacity?: number;
  force?: boolean;
  prepareOnly?: boolean;
  entityId?: number;
  controls?: CarControlsInput;
}

export interface WorkerProtocolIncomingMessage extends WorkerProtocolPayload {
  type?: string;
  seq?: number;
  payload?: WorkerProtocolPayload | Uint8Array;
}

export interface HostWorkerMessageRouterOptions extends WorkerRouterContext {
  admin?: MatchSessionAdmin | null;
}

export function buildWorkerRoomStateSummary(
  matchManager: MatchSessionAdmin | null | undefined,
  physicsManager: PhysicsEngineManager | null | undefined
): WorkerRoomStateSummary | null {
  if (!matchManager) return null;
  const s = matchManager.getSnapshot();
  return {
    roomId: s.roomId,
    gameMode: s.gameMode,
    botFillMode: s.botFillMode,
    state: s.state,
    matchTick: s.matchTick,
    clockSecondsRemaining: s.clockSecondsRemaining,
    isOvertime: s.isOvertime,
    overtimeSeconds: s.overtimeSeconds,
    blueScore: s.blueScore,
    orangeScore: s.orangeScore,
    winner: s.winner,
    winReason: s.winReason,
    lobbyPhysicsActive: s.lobbyPhysicsActive,
    ghostConfig: physicsManager?.lobbyGhostCoordinator?.getSnapshotConfig?.() || null,
    pads: physicsManager?.sim?.getPads?.() || null,
    roster: s.roster,
  };
}

export function routeProtocolMessageInWorker(
  workerCtx: WorkerRouterContext,
  msg: WorkerProtocolIncomingMessage | null | undefined
): boolean {
  if (!msg || typeof msg.type !== 'string') return false;
  const { type, ...rest } = msg;
  const p: WorkerProtocolPayload =
    msg.payload && typeof msg.payload === 'object' && !(msg.payload instanceof Uint8Array)
      ? { ...rest, ...msg.payload }
      : (rest as WorkerProtocolPayload);
  const seq = msg.seq ?? p?.reqId ?? 0;
  const { sim, physicsManager, sessionManager, matchManager, dataHandler } = workerCtx;
  const emitRaw: ((m: Record<string, unknown>, transfer?: Transferable[]) => void) | null =
    workerCtx.emit ||
    (workerCtx.postEnvelope
      ? (envMsg: Record<string, unknown>, transfer?: Transferable[]) =>
          workerCtx.postEnvelope?.(envMsg as unknown as WorkerEnvelope, transfer)
      : null);

  const reply = (replyType: string, replyPayload: unknown, transfer: Transferable[] = []) => {
    workerCtx.postEnvelope?.(
      createWorkerEnvelope(replyType, (replyPayload || {}) as Record<string, unknown>, seq),
      transfer
    );
  };
  const syncRoomState = () => {
    if (matchManager)
      reply(MSG.ROOM_STATE_SYNC, buildWorkerRoomStateSummary(matchManager, physicsManager));
  };

  if (routeReplayAndDiagnosticsMessage(workerCtx, type, p, seq, reply)) return true;
  if (routeTrainingAndPhysicsMessage(workerCtx, type, p, syncRoomState, emitRaw)) return true;

  switch (type) {
    case MSG.ROOM_CREATE: {
      if (matchManager) {
        if (p.roomId) matchManager.domain.roomId = p.roomId;
        if (p.botFillMode) matchManager.domain.botFillMode = p.botFillMode;
        if (p.gameMode) matchManager.roster.setGameMode(p.gameMode, p.durationSeconds ?? null);
        if (p.startAsMatch) matchManager.lifecycle.startMatch(p.durationSeconds);
        else if (p.lobbyMode !== false) matchManager.lifecycle.enterLobbyMode(p);
        else matchManager.lifecycle.startTrainingMode();
        syncRoomState();
      }
      return true;
    }

    case MSG.ROOM_JOIN: {
      const chId = p.channelId || p.sessionId || `peer_${Date.now()}`;
      workerCtx.registerWorkerChannel?.(chId);
      if (matchManager) {
        matchManager.roster.assignPlayerSlot(
          chId,
          p.playerName || 'Player',
          p.role || 'player',
          p.preferredTeam ?? null,
          {
            visualId: p.visualId || 'octane',
            hitboxId: p.hitboxId || null,
            colorSlot: p.colorSlot ?? null,
            paintFinish: p.paintFinish,
            boostVisual: p.boostVisual,
            boostAudio: p.boostAudio,
          },
          p.colorSlot ?? null
        );
        if (
          matchManager.lifecycle.state === MATCH_STATES.LOBBY &&
          physicsManager?.lobbyGhostCoordinator?.lobbyModeActive
        ) {
          physicsManager.syncLobbyGhostMasks();
        }
        syncRoomState();
      }
      return true;
    }

    case MSG.ROOM_LEAVE: {
      const chId = p.channelId || p.sessionId;
      if (chId) workerCtx.unregisterWorkerChannel?.(chId);
      syncRoomState();
      return true;
    }

    case MSG.ROOM_STATE_SYNC:
      syncRoomState();
      return true;

    case MSG.LOCAL_INPUT_FRAME: {
      const chId = p.channelId || 'host';
      if (p.packet && dataHandler) {
        dataHandler.handleIncomingPacket(chId, p.packet, p.timestamp || performance.now());
      } else if (p.controls && physicsManager) {
        const carIdx = p.carIndex ?? 0;
        if (typeof p.targetTick === 'number')
          physicsManager.pushInput(carIdx, p.targetTick, p.controls);
        else physicsManager.setDirectCarControls(carIdx, p.controls);
      }
      return true;
    }

    case MSG.RELIABLE_COMMAND: {
      const sid = p.sessionId || p.channelId || 'host';
      if (matchManager) {
        if (Array.isArray(p.commands))
          matchManager.commandQueue.handleClientCommands(sid, p.commands);
        else if (p.command) matchManager.commandQueue.handleClientCommand(sid, p.command);
        else if (typeof p.commandType === 'number') {
          matchManager.commandQueue.handleClientCommand(sid, p as unknown as ClientReliableCommand);
        }
      }
      return true;
    }

    case MSG.SIGNAL_ACK: {
      const sid = p.sessionId || p.channelId || 'host';
      const acks = Array.isArray(p.acks)
        ? p.acks
        : typeof p.signalId === 'number'
          ? [{ signalId: p.signalId, signalType: p.signalType }]
          : [];
      if (acks.length > 0) {
        sessionManager?.recordClientSignalAcks?.(sid, acks);
        matchManager?.commandQueue.handleClientSignalAcks(sid, acks);
      }
      return true;
    }

    case MSG.LOBBY_MODE_SET: {
      if (matchManager) {
        const enabled = p.enabled !== undefined ? Boolean(p.enabled) : true;
        if (enabled) {
          if (matchManager.lifecycle.state !== MATCH_STATES.LOBBY || p.forceEnterLobby) {
            matchManager.lifecycle.enterLobbyMode(p);
          } else if (physicsManager) {
            physicsManager.setLobbyGhostMode(p.ghostCars !== false, {
              mode: String(p.mode || p.ghostMode || 'ghost_passthrough'),
              hostCarIndex: p.hostCarIndex ?? 0,
              hostInteractsWithBall: p.hostInteractsWithBall ?? true,
              broadcastHostOnly: p.broadcastHostOnly ?? false,
              ghostOpacity: p.ghostOpacity ?? p.opacity ?? 0.7,
            });
          }
        } else {
          physicsManager?.setLobbyGhostMode(false);
        }
        syncRoomState();
      }
      return true;
    }

    case MSG.GHOST_CAR_CONFIG: {
      if (physicsManager) {
        if (typeof p.carIndex === 'number') {
          physicsManager.setCarCollisionMask(
            p.carIndex,
            p.interactWithBall ?? false,
            p.interactWithCars ?? false,
            p.opacity
          );
        } else {
          physicsManager.setLobbyGhostMode(p.enabled ?? true, {
            mode: typeof p.mode === 'string' ? p.mode : undefined,
            hostCarIndex: p.hostCarIndex,
            hostInteractsWithBall: p.hostInteractsWithBall,
            broadcastHostOnly: p.broadcastHostOnly,
            ghostOpacity: p.ghostOpacity ?? p.opacity,
          });
        }
        syncRoomState();
      }
      return true;
    }

    case MSG.MATCH_START_REQUEST: {
      releaseDiagnosticFleetIfEnabled(workerCtx, matchManager, physicsManager);
      if (matchManager) {
        if (p.force) matchManager.lifecycle.forceStartMatch(p.durationSeconds);
        else if (p.prepareOnly) matchManager.lifecycle.initiateMatchPrepare(p.durationSeconds);
        else matchManager.lifecycle.startMatch(p.durationSeconds);
        syncRoomState();
      }
      return true;
    }

    case MSG.PODIUM_ENTER: {
      if (matchManager) matchManager.lifecycle.state = MATCH_STATES.PODIUM;
      if (physicsManager && sim) {
        const w: unknown = matchManager?.lifecycle.winner;
        const winTeam = w === 'blue' || w === 1 ? 0 : w === 'orange' || w === 2 ? 1 : -1;
        for (const cIdx of physicsManager.activeCarIndices) {
          let isWinner = winTeam < 0;
          if (!isWinner && matchManager?.roster.players) {
            for (const pl of matchManager.roster.players.values()) {
              if (pl.entityId === cIdx && pl.team === winTeam) {
                isWinner = true;
                break;
              }
            }
          }
          sim.setCarLinearFactorAndGravity?.(cIdx, isWinner ? 1 : 0, isWinner ? 1 : 0, 1, 1);
        }
      }
      syncRoomState();
      return true;
    }

    case 'registerChannel':
      if (p.channelId) workerCtx.registerWorkerChannel?.(p.channelId);
      return true;

    case 'removeChannel':
      if (p.channelId) workerCtx.unregisterWorkerChannel?.(p.channelId);
      return true;

    case 'channel_packet':
    case 'clientInput':
      if (p.channelId && p.packet) {
        dataHandler?.handleIncomingPacket(p.channelId, p.packet, p.timestamp || performance.now());
      }
      return true;

    case 'notifyPlayerJoined': {
      const chId = p.channelId || (p.entityId === 0 ? 'host' : `peer_${p.entityId}`);
      matchManager?.roster.assignPlayerSlot(
        chId,
        p.name || `Player ${p.entityId}`,
        p.role || 'player',
        typeof p.entityId === 'number' && p.entityId >= 0 ? p.entityId % 2 : null,
        {
          visualId: p.visualId || 'octane',
          hitboxId: p.hitboxId || null,
          colorSlot: p.colorSlot ?? 0,
          paintFinish: p.paintFinish,
          boostVisual: p.boostVisual,
          boostAudio: p.boostAudio,
        },
        p.colorSlot ?? 0
      );
      return true;
    }

    default:
      return false;
  }
}

export class HostWorkerMessageRouter {
  sim: AuthoritativePhysicsSimPort | null;
  matchManager: MatchSessionAdmin | null;
  physicsManager: PhysicsEngineManager | null;
  sessionManager: EstablishedSessionManager | null;
  dataHandler: NetworkDataHandler | null;
  registerWorkerChannel: ((channelId: string) => void) | null;
  unregisterWorkerChannel: ((channelId: string) => void) | null;
  postEnvelope: ((envelope: WorkerEnvelope, transfer?: Transferable[]) => void) | null;

  constructor(options: HostWorkerMessageRouterOptions = {}) {
    this.sim = options.sim || options.physicsManager?.sim || null;
    this.matchManager = options.matchManager || options.admin || null;
    this.physicsManager =
      options.physicsManager ||
      (this.matchManager?.physicsManager as PhysicsEngineManager | null) ||
      null;
    this.sessionManager =
      options.sessionManager ||
      (this.matchManager?.sessionManager as EstablishedSessionManager | null) ||
      null;
    this.dataHandler = options.dataHandler || null;
    this.registerWorkerChannel = options.registerWorkerChannel || null;
    this.unregisterWorkerChannel = options.unregisterWorkerChannel || null;
    this.postEnvelope = options.postEnvelope || null;
  }

  handleEnvelope(envelope: WorkerEnvelope): boolean {
    return routeProtocolMessageInWorker(this, envelope as unknown as WorkerProtocolIncomingMessage);
  }
}

export default HostWorkerMessageRouter;
