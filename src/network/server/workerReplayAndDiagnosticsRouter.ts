import { HOST_WORKER_MSG_TYPES } from '../protocol/HostWorkerProtocol.ts';
import { MATCH_STATES } from './match/matchLoadoutAndSpawnPipeline.ts';
import {
  DiagnosticsTestVehicleController,
  DEFAULT_DIAGNOSTIC_FLEET,
  type DiagnosticFleetEntry,
} from '../diagnostics/DiagnosticsTestVehicles.ts';
import {
  ZERO_G_ANCHOR_MODES,
  configureZeroGVehiclePhysics,
  releaseZeroGVehiclePhysics,
} from '../diagnostics/ZeroGDiagnosticLab.ts';
import type { WorkerEnvelope } from '../protocol/HostWorkerProtocol.ts';
import type { MatchSessionAdmin } from './match/MatchSessionAdmin.ts';
import type { PhysicsEngineManager } from './PhysicsEngineManager.ts';
import type { EstablishedSessionManager } from './EstablishedSessionManager.ts';
import type { NetworkDataHandler } from './NetworkDataHandler.ts';
import type { AuthoritativePhysicsSimPort } from './authoritativePhysicsStepPipeline.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';

export interface WorkerRouterContext {
  sim?: AuthoritativePhysicsSimPort | null;
  physicsManager?: PhysicsEngineManager | null;
  sessionManager?: EstablishedSessionManager | null;
  matchManager?: MatchSessionAdmin | null;
  dataHandler?: NetworkDataHandler | null;
  diagnosticsController?: DiagnosticsTestVehicleController | null;
  registerWorkerChannel?: ((channelId: string) => void) | null;
  unregisterWorkerChannel?: ((channelId: string) => void) | null;
  postEnvelope?: ((envelope: WorkerEnvelope, transfer?: Transferable[]) => void) | null;
  emit?: ((msg: Record<string, unknown>, transfer?: Transferable[]) => void) | null;
}

export type WorkerReplyFn = (
  replyType: string,
  replyPayload: unknown,
  transfer?: Transferable[]
) => void;

export interface WorkerReplayDiagnosticsPayload {
  enabled?: boolean;
  fleet?: DiagnosticFleetEntry[];
  anchorMode?: string;
  extraLatencyMs?: number;
  jitterMs?: number;
  packetLossRate?: number;
  count?: number;
  reqId?: number;
  [key: string]: unknown;
}

function isVirtualBotChannelId(channelId: string): boolean {
  return channelId === 'bot' || String(channelId || '').startsWith('bot_');
}

export class WorkerDirectBotPortBridge {
  botPort: MessagePort | null = null;
  botInferenceInFlight = false;
  botInferenceLastSentAt = 0;
  sentPadsToBotPort = false;

  attach(
    port: MessagePort,
    dataHandler: NetworkDataHandler | null,
    registerChannel: (channelId: string) => void
  ): void {
    if (!port) return;
    if (this.botPort && this.botPort !== port) {
      try {
        this.botPort.close?.();
      } catch (_e) {}
    }
    this.botPort = port;
    this.botInferenceInFlight = false;
    this.botInferenceLastSentAt = 0;
    this.sentPadsToBotPort = false;
    this.botPort.onmessage = (ev: MessageEvent) => {
      const msg = ev?.data;
      if (!msg || msg.type !== 'bot_tunnel_packets') return;
      this.botInferenceInFlight = false;
      if (!dataHandler || !Array.isArray(msg.packets)) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      for (let i = 0; i < msg.packets.length; i++) {
        const item = msg.packets[i];
        if (!item || !item.sessionId || !item.packetBytes) continue;
        if (!dataHandler.channels.has(item.sessionId)) {
          registerChannel(item.sessionId);
        }
        dataHandler.handleIncomingPacket(item.sessionId, item.packetBytes, now);
      }
    };
    this.botPort.start?.();
  }

  detach(): void {
    if (this.botPort) {
      try {
        this.botPort.close?.();
      } catch (_e) {}
    }
    this.botPort = null;
    this.botInferenceInFlight = false;
    this.sentPadsToBotPort = false;
  }

  step(
    matchManager: MatchSessionAdmin | null,
    sim: RocketSimPhysicsEngine | null,
    physicsManager: PhysicsEngineManager | null,
    dataHandler: NetworkDataHandler | null,
    registerChannel: (channelId: string) => void
  ): void {
    if (!this.botPort || !matchManager || !sim || !sim.state) return;
    const bots: Array<{
      sessionId: string;
      carIndex: number;
      team: number;
      botType: string;
    }> = [];
    const activeCars: Array<{ carIndex: number; team: number }> = [];
    for (const [sid, p] of matchManager.roster.players.entries()) {
      const cIdx = p.entityId;
      if (typeof cIdx !== 'number' || cIdx < 0 || cIdx >= 6) continue;
      const team = p.team === 1 ? 1 : 0;
      activeCars.push({ carIndex: cIdx, team });
      if (p.isBot || isVirtualBotChannelId(sid)) {
        if (dataHandler && !dataHandler.channels.has(sid)) {
          registerChannel(sid);
        }
        bots.push({
          sessionId: sid,
          carIndex: cIdx,
          team,
          botType: p.botType || 'nexto',
        });
      }
    }
    if (bots.length === 0) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.botInferenceInFlight && now - this.botInferenceLastSentAt < 150) {
      return;
    }

    const serverTick = physicsManager?.currentTick ?? Math.floor(sim.getHeaderView().tickCount);
    const stateCopy = new Float32Array(sim.state);
    let pads: unknown = null;
    if (!this.sentPadsToBotPort && typeof sim.getPads === 'function') {
      pads = sim.getPads();
      this.sentPadsToBotPort = true;
    }

    this.botInferenceInFlight = true;
    this.botInferenceLastSentAt = now;
    try {
      this.botPort.postMessage(
        {
          type: 'step_bots',
          stateSnapshot: stateCopy,
          serverTick,
          matchState: matchManager.lifecycle.state || 'playing',
          bots,
          activeCars,
          pads,
          redundantTicks: 10,
          nowMs: now,
        },
        [stateCopy.buffer]
      );
    } catch (_err) {
      this.botInferenceInFlight = false;
    }
  }
}

export function releaseDiagnosticFleetIfEnabled(
  workerCtx: WorkerRouterContext,
  matchManager: MatchSessionAdmin | null | undefined,
  physicsManager: PhysicsEngineManager | null | undefined
): void {
  const diagCtrl = workerCtx.diagnosticsController || matchManager?.diagnosticsController;
  if (diagCtrl?.enabled && physicsManager) {
    diagCtrl.enabled = false;
    diagCtrl.releasePhysics(physicsManager as never);
  }
}

export function handleFullReplayExport(
  sim: AuthoritativePhysicsSimPort | null | undefined,
  matchManager: MatchSessionAdmin | null | undefined,
  reqId: number,
  reply: WorkerReplyFn
): void {
  const snap = matchManager?.getSnapshot();
  const roster = snap?.roster ?? {
    players: [],
    spectators: [],
    gameMode: '3v3',
    botFillMode: 'no_bots',
    durationSeconds: 300,
    clockSeconds: 300,
    score: { blue: 0, orange: 0 },
  };
  const loadouts = matchManager
    ? matchManager.roster.getMatchRosterMetadata()
    : roster.players || [];
  const meta = {
    blueScore: snap?.blueScore ?? 0,
    orangeScore: snap?.orangeScore ?? 0,
    winner: snap?.winner ?? 0,
    winReason: snap?.winReason ?? 0,
    gameMode: snap?.gameMode || '3v3',
    durationSeconds: snap?.clockDuration ?? 300,
    roster,
    loadouts,
  };
  if (
    sim &&
    typeof sim.extractWasmReplayTracks === 'function' &&
    (sim.getReplayFrameCount?.() ?? 0) > 0
  ) {
    const tracks = sim.extractWasmReplayTracks();
    const transfer: Transferable[] = [];
    if (tracks.stateInputBytes?.buffer) transfer.push(tracks.stateInputBytes.buffer);
    if (tracks.incidentBytes?.buffer) transfer.push(tracks.incidentBytes.buffer);
    if (tracks.signalBytes?.buffer) transfer.push(tracks.signalBytes.buffer);
    reply(
      HOST_WORKER_MSG_TYPES.REPLAY_FULL_EXPORT_DATA,
      {
        reqId,
        frameCount: tracks.frameCount,
        stateStride: tracks.stateStride,
        incidentCount: tracks.incidentCount,
        signalCount: tracks.signalCount,
        stateInputBytes: tracks.stateInputBytes,
        incidentBytes: tracks.incidentBytes,
        signalBytes: tracks.signalBytes,
        ...meta,
      },
      transfer
    );
    return;
  }

  const frames = matchManager?.replayBuffer ? matchManager.replayBuffer.getRecentFrames() : [];
  reply(HOST_WORKER_MSG_TYPES.REPLAY_FULL_EXPORT_DATA, {
    reqId,
    frameCount: frames.length,
    frames,
    signals: matchManager ? matchManager.commandQueue.replaySignalLog.slice() : [],
    ...meta,
  });
}

/**
 * Narrow-waist router for replay export/window requests and network/zero-G diagnostics.
 */
export function routeReplayAndDiagnosticsMessage(
  workerCtx: WorkerRouterContext,
  type: string,
  payload: WorkerReplayDiagnosticsPayload,
  seq: number,
  reply: WorkerReplyFn
): boolean {
  const { sim, physicsManager, matchManager } = workerCtx;

  switch (type) {
    case HOST_WORKER_MSG_TYPES.NET_DIAG_CONFIG:
    case 'configureDiagnosticFleet': {
      const isLobby = !matchManager || matchManager.lifecycle.state === MATCH_STATES.LOBBY;
      const enableZeroG = Boolean(payload.enabled) && isLobby;
      const fleet = Array.isArray(payload.fleet) ? payload.fleet : DEFAULT_DIAGNOSTIC_FLEET;
      const anchorMode = payload.anchorMode || ZERO_G_ANCHOR_MODES.Z_HOVER;
      let diagCtrl = (workerCtx.diagnosticsController ||
        matchManager?.diagnosticsController ||
        null) as DiagnosticsTestVehicleController | null;
      if (!diagCtrl && workerCtx) {
        diagCtrl = new DiagnosticsTestVehicleController(fleet, { anchorMode });
        workerCtx.diagnosticsController = diagCtrl;
      }
      if (diagCtrl) {
        diagCtrl.anchorMode = anchorMode;
        diagCtrl.enabled = enableZeroG;
        if (physicsManager) {
          if (enableZeroG) diagCtrl.configurePhysics(physicsManager as never, anchorMode);
          else diagCtrl.releasePhysics(physicsManager as never);
        }
      } else if (physicsManager && sim) {
        if (enableZeroG) configureZeroGVehiclePhysics(physicsManager as never, fleet, anchorMode);
        else releaseZeroGVehiclePhysics(physicsManager as never, fleet);
      }
      return true;
    }

    case HOST_WORKER_MSG_TYPES.NET_IMPAIRMENT_SET: {
      reply(HOST_WORKER_MSG_TYPES.NET_DIAG_METRICS, {
        extraLatencyMs: payload.extraLatencyMs ?? 0,
        jitterMs: payload.jitterMs ?? 0,
        packetLossRate: payload.packetLossRate ?? 0,
      });
      return true;
    }

    case HOST_WORKER_MSG_TYPES.REPLAY_WINDOW_REQUEST: {
      const count = payload.count ?? 360;
      const frames = matchManager?.replayBuffer
        ? matchManager.replayBuffer.getRecentFrames(count)
        : [];
      reply(HOST_WORKER_MSG_TYPES.REPLAY_WINDOW_DATA, {
        reqId: payload.reqId ?? seq,
        frameCount: frames.length,
        wasmFrameCount: sim?.getReplayFrameCount?.() ?? 0,
        frames,
      });
      return true;
    }

    case HOST_WORKER_MSG_TYPES.REPLAY_FULL_EXPORT_REQUEST: {
      handleFullReplayExport(sim, matchManager, payload.reqId ?? seq, reply);
      return true;
    }

    default:
      return false;
  }
}
