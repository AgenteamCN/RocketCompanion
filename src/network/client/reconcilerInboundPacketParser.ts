/**
 * reconcilerInboundPacketParser.ts
 * Inbound server packet batch parser, RTT estimator, boost pad cooldown edge tracker,
 * and JSON control datagram handler for ReconcilerControlMessenger.
 */

import type { UnpackedCarControls } from '../protocol/InputPacketCodec.ts';
import {
  EstablishedSessionManager,
  type ParsedClientPacketHeader,
} from '../server/EstablishedSessionManager.ts';
import {
  GlobalPayloadCodec,
  MATCH_SIGNALS,
  type DecodedGlobalPayload,
  type MatchSignalDescriptor,
} from '../protocol/GlobalPayloadCodec.ts';
import {
  createBoostPadEdgeTracker,
  seedBoostPadEdgeTrackerFromSnapshot,
  applyBoostPadEdgeCooldowns,
  type BoostPadEdgeTracker,
} from '../protocol/boostPadBitmaskPipeline.ts';
import type { InspectablePacketInput } from '../diagnostics/PacketDumpDiagnostics.ts';
import type { ReconcilerMetrics, TelemetryChannelPort } from './ReconcilerMetricsModel.ts';

export interface ParsedReconcilerPacket extends InspectablePacketInput {
  serverTick: number;
  activeCarMask?: number;
  activeCarIndices?: number[];
  boostPadMaskLow?: number;
  boostPadMaskHigh?: number;
  stateSnapshot: Float32Array;
  acknowledgedControls?: Array<{ carIndex: number; controls: UnpackedCarControls }>;
  timestamp?: number;
  clientHeader?: ParsedClientPacketHeader;
  globalPayload?: DecodedGlobalPayload;
  rawBytes?: Uint8Array | ArrayBuffer;
}

export interface DrainServerPacketsContext {
  channel: TelemetryChannelPort | null | undefined;
  lobbyDualWorldMode: boolean;
  hostLobbyMode: boolean;
  replayPlaybackMode: boolean;
  inputBufferTarget: number;
  metrics: ReconcilerMetrics;
  boostPadEdgeTracker: BoostPadEdgeTracker;
  isTimelineSynchronized: () => boolean;
  onSignals: ((signals: MatchSignalDescriptor[], packetServerTick: number | null) => void) | null;
  onRosterUpdate: ((msg: Record<string, unknown>) => void) | null;
  onHandshakeResponse: ((msg: Record<string, unknown>) => void) | null;
  setLocalCarIndex: (entityId: number) => void;
  setLobbyDualWorldMode: (enabled: boolean) => void;
  setLobbyAuthoritativeSnapshots: (prev: Float32Array, curr: Float32Array) => void;
  syncTimelineFromHandshake: (snap: Float32Array, frame: number, nowMs: number) => void;
}

export interface InboundMessengerPort {
  hasServerReportedBuffer: boolean;
  lastServerRecordedInputTick: number;
  lastProcessedClientTimestamp: number;
  baseMeasuredRtt: number;
  measuredRtt: number;
  lastReceivedPacketRaw: Uint8Array | ArrayBuffer | null;
  drainedReplayPackets: ParsedReconcilerPacket[];
  acknowledgeServerSignals: (signals: MatchSignalDescriptor[] | null | undefined) => void;
  resolveClientCommandAck: (commandId: number) => void;
}

export function drainAndParseServerPacketBatch(
  messenger: InboundMessengerPort,
  ctx: DrainServerPacketsContext,
  incomingPackets: unknown[],
  nowMs: number
): ParsedReconcilerPacket | null {
  let latestPacket: ParsedReconcilerPacket | null = null;
  const drainedReplayPackets: ParsedReconcilerPacket[] = [];
  const boostPadTracker = ctx.boostPadEdgeTracker || createBoostPadEdgeTracker();

  let hasServerReportedBuffer = messenger.hasServerReportedBuffer;
  let lastServerRecordedInputTick = messenger.lastServerRecordedInputTick;
  let lastProcessedClientTimestamp = messenger.lastProcessedClientTimestamp;
  let baseMeasuredRtt = messenger.baseMeasuredRtt;
  let measuredRtt = messenger.measuredRtt;
  let lastReceivedPacketRaw = messenger.lastReceivedPacketRaw;

  for (const rawItem of incomingPackets) {
    let packet: ParsedReconcilerPacket | null = null;

    if (rawItem instanceof Uint8Array || rawItem instanceof ArrayBuffer) {
      lastReceivedPacketRaw = rawItem;
      const clientHeader = EstablishedSessionManager.parseClientPacket(rawItem);
      if (clientHeader) {
        if (
          ctx.lobbyDualWorldMode &&
          clientHeader.inputBufferSize === 0 &&
          !hasServerReportedBuffer
        ) {
          ctx.metrics.inputBufferSize = ctx.inputBufferTarget ?? 3;
        } else {
          ctx.metrics.inputBufferSize = clientHeader.inputBufferSize;
          hasServerReportedBuffer = true;
        }

        const extraUplink = Math.max(
          0,
          Number(ctx.channel?.extraUplinkMs ?? ctx.channel?.extraLatencyMs ?? 0) || 0
        );
        const extraDownlink = Math.max(
          0,
          Number(ctx.channel?.extraDownlinkMs ?? ctx.channel?.extraLatencyMs ?? 0) || 0
        );
        const extraRtt = extraUplink + extraDownlink;

        const isLastQueuedItem = rawItem === incomingPackets[incomingPackets.length - 1];
        if (ctx.channel?.isLoopback) {
          measuredRtt = Math.round(extraRtt);
          if (
            clientHeader.clientTimestamp > 0 &&
            clientHeader.clientTimestamp > lastProcessedClientTimestamp
          ) {
            lastProcessedClientTimestamp = clientHeader.clientTimestamp;
          }
        } else {
          if (
            isLastQueuedItem &&
            clientHeader.clientTimestamp > 0 &&
            clientHeader.clientTimestamp > lastProcessedClientTimestamp
          ) {
            lastProcessedClientTimestamp = clientHeader.clientTimestamp;
            const sampleRtt = Math.max(0, nowMs - clientHeader.clientTimestamp);
            const isQueueBurst = incomingPackets.length > 3;
            if (sampleRtt < 2000 && Number.isFinite(sampleRtt) && !isQueueBurst) {
              const baseSampleRtt = Math.max(0, sampleRtt - extraRtt);
              if (!Number.isFinite(baseMeasuredRtt) || baseMeasuredRtt === 0) {
                baseMeasuredRtt = baseSampleRtt;
              } else {
                const maxStepUp = Math.max(50, baseMeasuredRtt * 2);
                const clampedSample = Math.min(baseSampleRtt, baseMeasuredRtt + maxStepUp);
                baseMeasuredRtt = baseMeasuredRtt * 0.85 + clampedSample * 0.15;
              }
            }
          }
          measuredRtt = (baseMeasuredRtt || 0) + extraRtt;
          if (ctx.channel && Number.isFinite(measuredRtt)) {
            if (ctx.channel.simulator) {
              ctx.channel.simulator.measuredRttMs = Math.max(0, measuredRtt);
              ctx.channel.simulator.baseMeasuredRttMs = Math.max(0, baseMeasuredRtt || 0);
            } else {
              const desc = Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(ctx.channel) ?? ctx.channel,
                'measuredRttMs'
              );
              if (!desc || desc.writable || typeof desc.set === 'function') {
                ctx.channel.measuredRttMs = measuredRtt;
              }
            }
          }
        }

        const globalPayload = GlobalPayloadCodec.decode(clientHeader.globalPayloadSlice);
        if (globalPayload) {
          const allSignals =
            globalPayload.signals && globalPayload.signals.length > 0
              ? globalPayload.signals
              : clientHeader.sessionSignals || [];
          if (allSignals.length > 0) {
            messenger.acknowledgeServerSignals(allSignals);
            let hasTransitionSignal = false;
            for (const sig of allSignals) {
              if (!sig) continue;
              if (sig.signalType === MATCH_SIGNALS.COMMAND_ACK && typeof sig.param1 === 'number') {
                messenger.resolveClientCommandAck(sig.param1);
              }
              if (
                sig.signalType === MATCH_SIGNALS.MATCH_PREPARE ||
                sig.signalType === MATCH_SIGNALS.MATCH_STARTED ||
                sig.signalType === MATCH_SIGNALS.KICKOFF_WILL_START
              ) {
                hasTransitionSignal = true;
              }
            }
            const prevLobbyMode = Boolean(ctx.lobbyDualWorldMode);
            const pktServerTick =
              globalPayload.hasPhysics &&
              globalPayload.physics &&
              typeof globalPayload.physics.tick === 'number'
                ? globalPayload.physics.tick
                : null;
            ctx.onSignals?.(allSignals, pktServerTick);
            if (
              hasTransitionSignal ||
              Boolean(ctx.lobbyDualWorldMode) !== prevLobbyMode ||
              !ctx.isTimelineSynchronized()
            ) {
              latestPacket = null;
            }
          }
          if (globalPayload.allUserRtt) {
            ctx.metrics.allUserRtt = globalPayload.allUserRtt;
          }
          if (globalPayload.hasPhysics && globalPayload.physics) {
            const physMask = globalPayload.physics.activeCarMask;
            const isStaleLobbyPhysicsInMatch =
              !ctx.lobbyDualWorldMode &&
              !ctx.hostLobbyMode &&
              !ctx.channel?.isLoopback &&
              typeof physMask === 'number' &&
              (physMask & 0xc0) !== 0;
            if (!isStaleLobbyPhysicsInMatch) {
              const srvTick = globalPayload.physics.tick;
              if (globalPayload.physics.stateSnapshot) {
                applyBoostPadEdgeCooldowns(
                  globalPayload.physics.stateSnapshot,
                  srvTick,
                  boostPadTracker
                );
              }
              if (hasServerReportedBuffer && srvTick > 0) {
                const bufDepth = clientHeader.inputBufferSize | 0;
                const recordedUpTo = bufDepth > 0 ? srvTick + bufDepth - 1 : srvTick - 1;
                if (
                  typeof lastServerRecordedInputTick !== 'number' ||
                  recordedUpTo > lastServerRecordedInputTick
                ) {
                  lastServerRecordedInputTick = recordedUpTo;
                }
              }
              packet = {
                serverTick: srvTick,
                activeCarMask: globalPayload.physics.activeCarMask,
                activeCarIndices: globalPayload.physics.activeCarIndices,
                boostPadMaskLow: globalPayload.physics.boostPadMaskLow,
                boostPadMaskHigh: globalPayload.physics.boostPadMaskHigh,
                stateSnapshot: globalPayload.physics.stateSnapshot,
                acknowledgedControls: globalPayload.physics.acknowledgedControls,
                timestamp: clientHeader.serverTimestamp,
                clientHeader,
                globalPayload,
                rawBytes: rawItem,
              };
            }
          }
        }
      }
    } else if (rawItem) {
      let parsedItem: unknown = rawItem;
      if (typeof rawItem === 'string') {
        try {
          parsedItem = JSON.parse(rawItem);
        } catch (err) {
          console.warn(
            '[PredictionReconciler] Failed to parse datagram string as JSON:',
            err,
            rawItem
          );
        }
      }
      if (parsedItem && typeof parsedItem === 'object') {
        const obj = parsedItem as Record<string, unknown>;
        if (typeof obj.serverTick === 'number') {
          packet = obj as unknown as ParsedReconcilerPacket;
        } else if (obj.type === 'roster_update') {
          ctx.onRosterUpdate?.(obj);
          continue;
        } else if (obj.type === 'handshake_response') {
          if (!ctx.hostLobbyMode && typeof obj.entityId === 'number' && obj.entityId >= 0) {
            ctx.setLocalCarIndex(obj.entityId);
          }
          const initSnap = obj.initialSnapshot as ArrayLike<number> | undefined;
          const frame =
            (typeof obj.serverFrame === 'number' ? obj.serverFrame : undefined) ??
            (typeof obj.matchTick === 'number' ? obj.matchTick : 0);
          if (obj.state === 'lobby') {
            if (!ctx.hostLobbyMode) {
              ctx.setLobbyDualWorldMode(true);
            }
            if (initSnap) {
              const snap = new Float32Array(initSnap);
              seedBoostPadEdgeTrackerFromSnapshot(boostPadTracker, snap, frame);
              ctx.setLobbyAuthoritativeSnapshots(new Float32Array(snap), new Float32Array(snap));
            }
          } else {
            ctx.setLobbyDualWorldMode(false);
            if (initSnap && (obj.serverFrame !== undefined || obj.matchTick !== undefined)) {
              const snap = new Float32Array(initSnap);
              seedBoostPadEdgeTrackerFromSnapshot(boostPadTracker, snap, frame);
              ctx.syncTimelineFromHandshake(snap, frame, nowMs);
            }
          }
          ctx.onHandshakeResponse?.(obj);
          continue;
        }
      }
    }

    if (packet) {
      if (ctx.replayPlaybackMode && packet.stateSnapshot) {
        drainedReplayPackets.push(packet);
      }
      if (!latestPacket || packet.serverTick >= latestPacket.serverTick) {
        latestPacket = packet;
      }
    }
  }

  Object.assign(messenger, {
    hasServerReportedBuffer,
    lastServerRecordedInputTick,
    lastProcessedClientTimestamp,
    baseMeasuredRtt,
    measuredRtt,
    lastReceivedPacketRaw,
    drainedReplayPackets,
  });

  return latestPacket;
}
