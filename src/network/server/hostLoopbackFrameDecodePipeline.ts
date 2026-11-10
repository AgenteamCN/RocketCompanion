/**
 * src/network/server/hostLoopbackFrameDecodePipeline.ts
 * Pure packet decoding, loopback frame ingestion, loadout command normalization,
 * and narrow bot tunnel port adapter for AuthoritativeServerHost.
 */

import { deliverToHostLoopback, type HostLoopbackChannelPort } from './HostLoopbackChannel.ts';
import {
  GlobalPayloadCodec,
  MATCH_SIGNALS,
  type AcknowledgedCarControlEntry,
  type MatchSignalDescriptor,
} from '../protocol/GlobalPayloadCodec.ts';
import {
  applyBoostPadEdgeCooldowns,
  type BoostPadEdgeTracker,
} from '../protocol/boostPadBitmaskPipeline.ts';
import { parseTailoredClientPacket } from './PeerSession.ts';
import type { WorkerRoomStateSummary } from './HostWorkerMessageRouter.ts';
import type {
  ReplayAcknowledgedControlEntry,
  ReplayRingBuffer,
  ReplaySignalsOrOptionsArg,
} from '../../replay/ReplayRingBuffer.ts';
import type { NetworkDataHandler } from './NetworkDataHandler.ts';

export interface DecodedHostLoopbackFrame {
  roomStatePhase: string | null;
  hasPhysics: boolean;
  snapshot: Float32Array | null;
  tick: number;
  newReplaySignals: MatchSignalDescriptor[];
  acknowledgedControls: AcknowledgedCarControlEntry[] | null;
}

export interface HostLoopbackPacketConsumerPort {
  active?: boolean;
  lastRoomState: Partial<WorkerRoomStateSummary> | null;
  botTunnelManager?: {
    init?(): unknown;
    syncFromRoomState?(state: Partial<WorkerRoomStateSummary> | null): void;
    onServerPhysicsFrame(snapshot: Float32Array, tick: number, state: string): void;
  } | null;
  hostChannel: HostLoopbackChannelPort | null;
  boostPadEdgeTracker: BoostPadEdgeTracker;
  _seenReplaySignalIds: Set<string>;
  cachedSnapshot: Float32Array;
  lastServerTick: number;
  isWorker: boolean;
  hostReplayRingBuffer?: ReplayRingBuffer | null;
}

export interface BotTunnelHostServerPort {
  readonly isWorker: boolean;
  readonly worker: Worker | null;
  readonly fallbackDataHandler: NetworkDataHandler | null;
  readonly lastRoomState: Partial<WorkerRoomStateSummary> | null;
  _postCommand(type: string, data?: Record<string, unknown>, transfer?: Transferable[]): void;
}

export function createBotTunnelHostPort(
  serverPort: BotTunnelHostServerPort
): BotTunnelHostServerPort {
  return {
    get isWorker() {
      return serverPort.isWorker;
    },
    get worker() {
      return serverPort.worker;
    },
    get fallbackDataHandler() {
      return serverPort.fallbackDataHandler;
    },
    get lastRoomState() {
      return serverPort.lastRoomState;
    },
    _postCommand: (type, data, transfer) => serverPort._postCommand(type, data, transfer),
  };
}

export function resolveRoomStatePhaseFromSignal(signalType: number): string | null {
  if (
    signalType === MATCH_SIGNALS.KICKOFF_START ||
    signalType === MATCH_SIGNALS.ROUND_STARTED ||
    signalType === MATCH_SIGNALS.OVERTIME_START
  ) {
    return 'playing';
  }
  if (
    signalType === MATCH_SIGNALS.KICKOFF_WILL_START ||
    signalType === MATCH_SIGNALS.GOAL_REPLAY_END ||
    signalType === MATCH_SIGNALS.MATCH_STARTED
  ) {
    return 'kickoff';
  }
  if (
    signalType === MATCH_SIGNALS.GOAL_REPLAY_WILL_START ||
    signalType === MATCH_SIGNALS.GOAL_REPLAY_START
  ) {
    return 'replay';
  }
  if (signalType === MATCH_SIGNALS.MATCH_PREPARE) {
    return 'prepare';
  }
  if (signalType === MATCH_SIGNALS.MATCH_ENDED || signalType === MATCH_SIGNALS.PODIUM_START) {
    return 'ended';
  }
  return null;
}

export function decodeHostLoopbackFramePacket(
  packet: Uint8Array | ArrayBuffer,
  boostPadEdgeTracker: BoostPadEdgeTracker,
  seenReplaySignalIds: Set<string>
): DecodedHostLoopbackFrame | null {
  const clientHeader = parseTailoredClientPacket(packet);
  if (!clientHeader?.globalPayloadSlice) {
    return null;
  }

  const globalPayload = GlobalPayloadCodec.decode(clientHeader.globalPayloadSlice);
  let roomStatePhase: string | null = null;
  const newReplaySignals: MatchSignalDescriptor[] = [];

  if (Array.isArray(globalPayload?.signals)) {
    for (let s = 0; s < globalPayload.signals.length; s++) {
      const sig = globalPayload.signals[s];
      if (!sig) {
        continue;
      }
      const phase = resolveRoomStatePhaseFromSignal(sig.signalType);
      if (phase) {
        roomStatePhase = phase;
      }
      if (
        sig.signalType === MATCH_SIGNALS.CLOCK_UPDATED_SECONDS ||
        sig.signalType === MATCH_SIGNALS.COMMAND_ACK
      ) {
        continue;
      }
      const key = sig.signalId ? `id_${sig.signalId}` : `${sig.signalType}_${sig.frameId}`;
      if (!seenReplaySignalIds.has(key)) {
        seenReplaySignalIds.add(key);
        newReplaySignals.push(sig);
      }
    }
  }

  if (globalPayload?.hasPhysics && globalPayload.physics?.stateSnapshot) {
    const snap = globalPayload.physics.stateSnapshot;
    applyBoostPadEdgeCooldowns(snap, globalPayload.physics.tick, boostPadEdgeTracker);
    return {
      roomStatePhase,
      hasPhysics: true,
      snapshot: snap,
      tick: globalPayload.physics.tick,
      newReplaySignals,
      acknowledgedControls: globalPayload.physics.acknowledgedControls || null,
    };
  }

  return {
    roomStatePhase,
    hasPhysics: false,
    snapshot: null,
    tick: 0,
    newReplaySignals,
    acknowledgedControls: null,
  };
}

export function processHostLoopbackChannelPacket(
  consumer: HostLoopbackPacketConsumerPort,
  packet: Uint8Array | ArrayBuffer | string | undefined
): void {
  if (!packet) {
    return;
  }
  if (typeof packet === 'string') {
    try {
      const parsed = JSON.parse(packet);
      if (parsed?.type === 'roster_update') {
        consumer.lastRoomState = {
          ...(consumer.lastRoomState || {}),
          state: parsed.state || consumer.lastRoomState?.state || 'lobby',
          roster: parsed.roster ||
            consumer.lastRoomState?.roster || { players: [], spectators: [] },
        };
        consumer.botTunnelManager?.syncFromRoomState?.(consumer.lastRoomState);
      }
    } catch (_e) {
      // Ignore non-JSON control strings
    }
  }
  if (!deliverToHostLoopback(consumer.hostChannel, packet)) {
    return;
  }
  if (packet instanceof Uint8Array || packet instanceof ArrayBuffer) {
    try {
      const decoded = decodeHostLoopbackFramePacket(
        packet,
        consumer.boostPadEdgeTracker,
        consumer._seenReplaySignalIds
      );
      if (!decoded) {
        return;
      }
      if (decoded.roomStatePhase) {
        if (!consumer.lastRoomState) {
          consumer.lastRoomState = {
            state: decoded.roomStatePhase,
            roster: {
              players: [],
              spectators: [],
              gameMode: '3v3',
              botFillMode: 'no_bots',
              durationSeconds: 300,
              clockSeconds: 300,
              score: { blue: 0, orange: 0 },
            },
          };
        } else {
          consumer.lastRoomState.state = decoded.roomStatePhase;
        }
      }
      if (decoded.hasPhysics && decoded.snapshot) {
        if (consumer.cachedSnapshot.length !== decoded.snapshot.length) {
          consumer.cachedSnapshot = new Float32Array(decoded.snapshot.length);
        }
        consumer.cachedSnapshot.set(decoded.snapshot);
        consumer.lastServerTick = decoded.tick;
        if (consumer.botTunnelManager && consumer.isWorker) {
          consumer.botTunnelManager.onServerPhysicsFrame(
            consumer.cachedSnapshot,
            consumer.lastServerTick,
            consumer.lastRoomState?.state || 'playing'
          );
        }
        const isReplaySliceFrame =
          Math.abs((consumer.cachedSnapshot[302] || 0) - 1337.5) <= 0.01 ||
          consumer.lastRoomState?.state === 'replay';
        if (!isReplaySliceFrame) {
          consumer.hostReplayRingBuffer?.recordFrame(
            consumer.lastServerTick,
            consumer.cachedSnapshot,
            decoded.newReplaySignals as unknown as ReplaySignalsOrOptionsArg,
            null,
            null,
            decoded.acknowledgedControls as unknown as
              readonly ReplayAcknowledgedControlEntry[] | null
          );
        }
      }
    } catch (err) {
      console.warn('[HostServerWorker] Failed to decode authoritative frame packet:', err);
    }
  }
}
