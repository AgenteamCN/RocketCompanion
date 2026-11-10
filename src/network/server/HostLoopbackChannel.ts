/**
 * src/network/server/HostLoopbackChannel.ts
 * Loopback transport channel with NetworkSimulator impairment support for local host sessions.
 */

import {
  NetworkSimulator,
  type NetworkSimulatorOptions,
  type SimulatedPayload,
} from '../transport/webrtc/NetworkSimulator.ts';
import { InputPacketCodec, type CarControlsInput } from '../protocol/InputPacketCodec.ts';
import type { HostSimProxyPort } from './HostSimProxy.ts';

export interface ClientInputCommandPayload {
  carIndex?: number;
  tick?: number;
  targetTick?: number;
  history?: Array<{ tick: number; controls: CarControlsInput }>;
  controls?: CarControlsInput;
}

export function createDefaultHostChannel(
  hostWorker: HostSimProxyPort,
  options: NetworkSimulatorOptions = {}
) {
  const simulator = new NetworkSimulator({
    ...options,
    isLoopback: true,
  });

  const ch: Record<string, unknown> & {
    isLoopback: boolean;
    transportMode: string;
    simulator: NetworkSimulator;
    stats: NetworkSimulator['stats'];
    readonly rttMs: number;
    readonly measuredRttMs: number;
    readonly extraUplinkMs: number;
    readonly extraDownlinkMs: number;
    readonly extraLatencyMs: number;
    readonly jitterMs: number;
    readonly packetLossRate: number;
    onPacketReceived: ((payload: SimulatedPayload) => void) | null;
    onMessage: ((payload: SimulatedPayload) => void) | null;
    onColorChange: ((msg: Record<string, unknown>) => void) | null;
    send: (packet: SimulatedPayload, nowMs?: number) => boolean;
    sendClientInput: (
      packet: SimulatedPayload | ClientInputCommandPayload,
      nowMs?: number
    ) => boolean;
    sendServerState: (packet: SimulatedPayload, nowMs?: number) => boolean;
    receiveClientPackets: (nowMs?: number) => SimulatedPayload[];
    receiveServerPackets: (nowMs?: number) => SimulatedPayload[];
    reset: () => void;
    destroy: () => void;
  } = {
    isLoopback: true,
    transportMode: 'loopback',
    simulator,
    stats: simulator.stats,
    get rttMs(): number {
      return simulator.rttMs;
    },
    get measuredRttMs(): number {
      return simulator.measuredRttMs;
    },
    get extraUplinkMs(): number {
      return simulator.extraUplinkMs;
    },
    get extraDownlinkMs(): number {
      return simulator.extraDownlinkMs;
    },
    get extraLatencyMs(): number {
      return simulator.extraLatencyMs;
    },
    get jitterMs(): number {
      return simulator.jitterMs;
    },
    get packetLossRate(): number {
      return simulator.packetLossRate;
    },
    setExtraUplinkLatency: (uplinkMs: number) => simulator.setExtraUplinkLatency(uplinkMs),
    setExtraDownlinkLatency: (downlinkMs: number) => simulator.setExtraDownlinkLatency(downlinkMs),
    setAsymmetricLatency: (uplinkMs: number, downlinkMs: number) =>
      simulator.setAsymmetricLatency(uplinkMs, downlinkMs),
    setExtraLatency: (latencyMs: number) => simulator.setExtraLatency(latencyMs),
    setLatency: (latencyMs: number) => simulator.setLatency(latencyMs),
    setJitter: (jitterMs: number) => simulator.setJitter(jitterMs),
    setRtt: (rttMs: number) => simulator.setRtt(rttMs),
    setPacketLossRate: (rate: number) => simulator.setPacketLossRate(rate),
    setBurstDrop: (periodMs: number, durationMs: number, enabled?: boolean) =>
      simulator.setBurstDrop(periodMs, durationMs, enabled),
    setBurstDropEnabled: (enabled: boolean) => simulator.setBurstDropEnabled(enabled),
    toggleBurstDrop: (forceEnabled?: boolean) => simulator.toggleBurstDrop(forceEnabled),
    triggerBlackout: (durationMs: number, nowMs?: number) =>
      simulator.triggerBlackout(durationMs, nowMs),
    clearBlackout: () => simulator.clearBlackout(),
    forceDropNextInput: (count = 5) => simulator.forceDropNextInput(count),
    dropSinglePacket: () => simulator.dropSinglePacket(),
    onPacketReceived: null,
    onMessage: null,
    onColorChange: null,
    send: (packet: SimulatedPayload, nowMs = performance.now()): boolean => {
      return simulator.scheduleSend(
        packet,
        (clonedPacket: SimulatedPayload) => {
          if (hostWorker.isWorker && hostWorker.worker) {
            hostWorker._postCommand('clientInput', {
              channelId: 'host',
              packet: clonedPacket,
              timestamp: nowMs,
            });
            return true;
          }
          if (hostWorker.fallbackDataHandler) {
            if (!hostWorker._loggedFallbackSend) {
              hostWorker._loggedFallbackSend = true;
              console.info(
                '[HostLoopbackChannel] Routing host loopback packets through in-memory fallbackDataHandler.'
              );
            }
            hostWorker.fallbackDataHandler.handleIncomingPacket(
              'host',
              clonedPacket as Uint8Array | ArrayBuffer | string,
              nowMs
            );
            return true;
          }
          return false;
        },
        nowMs
      );
    },
    sendClientInput: (
      packet: SimulatedPayload | ClientInputCommandPayload,
      nowMs = performance.now()
    ): boolean => {
      let buf: SimulatedPayload = packet;
      if (
        !(packet instanceof Uint8Array) &&
        !(packet instanceof ArrayBuffer) &&
        typeof packet !== 'string'
      ) {
        const cmd = packet as ClientInputCommandPayload;
        if (cmd?.history) {
          buf = InputPacketCodec.encode(
            cmd.carIndex ?? 0,
            (cmd.targetTick ?? cmd.tick) || 0,
            cmd.history,
            nowMs
          );
        } else if (cmd?.controls) {
          const tick = cmd.tick || 0;
          buf = InputPacketCodec.encode(
            cmd.carIndex ?? 0,
            tick,
            [{ tick, controls: cmd.controls }],
            nowMs
          );
        }
      }
      const sent = ch.send(buf, nowMs);
      if (nowMs - simulator.lastPingSentTime > simulator.pingIntervalMs) {
        simulator.lastPingSentTime = nowMs;
        simulator.stats.pingsSent++;
        ch.send(
          JSON.stringify({ type: 'ping', sendTime: nowMs, rtt: Math.round(simulator.rttMs) }),
          nowMs
        );
      }
      return sent;
    },
    sendServerState: (packet: SimulatedPayload, nowMs = performance.now()): boolean => {
      return ch.send(packet, nowMs);
    },
    receiveClientPackets: (nowMs = performance.now()) => {
      return simulator.drainInboundQueue(nowMs);
    },
    receiveServerPackets: (nowMs = performance.now()) => {
      return simulator.drainInboundQueue(nowMs);
    },
    reset: () => {
      simulator.reset();
      ch.stats = simulator.stats;
    },
    destroy: () => {
      simulator.reset();
      ch.stats = simulator.stats;
    },
  };
  return ch;
}

export interface HostLoopbackChannelPort {
  simulator?: NetworkSimulator;
  onColorChange?: ((msg: Record<string, unknown>) => void) | null;
  onPacketReceived?: ((payload: SimulatedPayload) => void) | null;
  onMessage?: ((payload: SimulatedPayload) => void) | null;
  _loggedMockFallback?: boolean;
  packetLossRate?: number;
  extraLatencyMs?: number;
  inboundQueue?: SimulatedPayload[];
}

export function deliverToHostLoopback(
  hostChannel: HostLoopbackChannelPort | null,
  packet: SimulatedPayload
): boolean {
  if (!hostChannel) return false;
  const now = performance.now();
  const simulator = hostChannel.simulator;

  if (simulator) {
    simulator.stats.packetsReceived++;

    if (typeof packet === 'string') {
      try {
        const msg = JSON.parse(packet) as { type?: string; sendTime?: number };
        if (msg.type === 'color_change') {
          hostChannel.onColorChange?.(msg);
          return true;
        }
        if (msg.type === 'ping') {
          const pongMsg = JSON.stringify({ type: 'pong', sendTime: msg.sendTime });
          deliverToHostLoopback(hostChannel, pongMsg);
          return true;
        }
        if (msg.type === 'pong' && typeof msg.sendTime === 'number') {
          simulator.handlePong(msg.sendTime, now);
          return true;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(
          '[HostLoopbackChannel] Non-JSON string payload received, forwarding raw:',
          errMsg
        );
      }
    }

    return simulator.receivePayload(
      packet,
      (delivered: SimulatedPayload) => {
        hostChannel.onPacketReceived?.(delivered);
        hostChannel.onMessage?.(delivered);
      },
      now
    );
  }

  if (!hostChannel._loggedMockFallback) {
    hostChannel._loggedMockFallback = true;
    console.warn(
      '[HostLoopbackChannel] hostChannel.simulator is missing; using direct mock channel queue fallback.'
    );
  }
  const lossRate = hostChannel.packetLossRate ?? 0;
  if (lossRate > 0 && Math.random() < lossRate) {
    return false;
  }
  const cloned = NetworkSimulator.clonePayload(packet);
  const delay = hostChannel.extraLatencyMs ?? 0;
  const deliverAt = delay > 0 ? now + delay : 0;
  if (hostChannel.inboundQueue) {
    if (deliverAt === 0) {
      hostChannel.inboundQueue.push(cloned);
    } else {
      hostChannel.inboundQueue.push({ payload: cloned, deliverAt });
    }
  }
  if (deliverAt === 0) {
    hostChannel.onPacketReceived?.(cloned);
    hostChannel.onMessage?.(cloned);
  } else {
    setTimeout(() => {
      hostChannel.onPacketReceived?.(cloned);
      hostChannel.onMessage?.(cloned);
    }, delay);
  }
  return true;
}
