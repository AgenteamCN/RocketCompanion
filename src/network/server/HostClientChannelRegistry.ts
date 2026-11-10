import type { HostLoopbackChannelPort } from './HostLoopbackChannel.ts';
import { HOST_WORKER_MSG_TYPES } from '../protocol/HostWorkerProtocol.ts';
import type { WorkerRoomStateSummary, HostWorkerInitOptions } from './HostWorkerMessageRouter.ts';
import type { NetworkDataHandler } from './NetworkDataHandler.ts';
import { REPLAY_BUFFER_MODES as RBM } from '../../replay/ReplayRingBuffer.ts';
import type { ExtraLoadoutConfig } from './match/matchLoadoutAndSpawnPipeline.ts';
import {
  processHostLoopbackChannelPacket,
  type DecodedHostLoopbackFrame,
  type HostLoopbackPacketConsumerPort,
} from './hostLoopbackFrameDecodePipeline.ts';

export type { DecodedHostLoopbackFrame, HostLoopbackPacketConsumerPort };

export interface AuthoritativeServerHostOptions extends HostWorkerInitOptions {
  forceFallback?: boolean;
  replayCapacityTicks?: number | null;
  fifoDurationSeconds?: number;
}

export interface HostClientChannelPort extends HostLoopbackChannelPort {
  peerName?: string;
  visualId?: string;
  colorSlot?: number;
  send?(packet: Uint8Array | ArrayBuffer | string): void;
  sendServerState?(packet: Uint8Array | ArrayBuffer | string): void;
  sendClientInput?(packet: Uint8Array | ArrayBuffer | string): void;
  onPacketReceived?: ((packet: Uint8Array | ArrayBuffer | string) => void) | null;
}

export interface HostWorkerEnvelopeMessage {
  type?: string;
  seq?: number;
  payload?: unknown;
  channelId?: string;
  packet?: Uint8Array | ArrayBuffer | string;
  reqId?: number;
  result?: unknown;
}

export function resolveAuthoritativeHostConstructorArgs(
  ch: HostClientChannelPort | AuthoritativeServerHostOptions | null = null,
  opts: AuthoritativeServerHostOptions = {}
): { channel: HostClientChannelPort | null; options: AuthoritativeServerHostOptions } {
  if (
    ch &&
    typeof ch === 'object' &&
    !('send' in ch && typeof ch.send === 'function') &&
    !('sendClientInput' in ch && typeof ch.sendClientInput === 'function') &&
    !('inboundQueue' in ch && Array.isArray(ch.inboundQueue))
  ) {
    return { channel: null, options: { ...(ch as AuthoritativeServerHostOptions) } };
  }
  return { channel: (ch as HostClientChannelPort | null) ?? null, options: { ...opts } };
}

export function applyAuthoritativeHostSyncedSnapshot(
  consumer: HostLoopbackPacketConsumerPort,
  snap: Float32Array | number[] | null | undefined,
  tick: number | undefined,
  roomState: Partial<WorkerRoomStateSummary> | null | undefined,
  fallbackMatchState?: string
): void {
  consumer.active = true;
  if (snap) {
    const arr = snap instanceof Float32Array ? snap : new Float32Array(snap);
    const len = Math.min(consumer.cachedSnapshot.length, arr.length);
    consumer.cachedSnapshot.subarray(0, len).set(arr.subarray(0, len));
  }
  if (tick !== undefined) {
    consumer.lastServerTick = tick;
  }
  if (roomState) {
    consumer.lastRoomState = roomState;
    consumer.botTunnelManager?.init?.();
    consumer.botTunnelManager?.syncFromRoomState?.(roomState);
  }
  if (fallbackMatchState !== undefined) {
    consumer.botTunnelManager?.onServerPhysicsFrame?.(
      consumer.cachedSnapshot,
      consumer.lastServerTick,
      fallbackMatchState
    );
    consumer.hostReplayRingBuffer?.recordFrame(consumer.lastServerTick, consumer.cachedSnapshot);
  }
}

export function syncHostReplayBufferBeforeEnvelope(
  consumer: HostLoopbackPacketConsumerPort,
  type: string,
  payload: AuthoritativeServerHostOptions
): void {
  if (type === HOST_WORKER_MSG_TYPES.MATCH_START_REQUEST) {
    consumer.hostReplayRingBuffer?.configureMode?.(RBM.COUNTDOWN_MATCH);
    consumer.hostReplayRingBuffer?.clear();
    consumer._seenReplaySignalIds?.clear();
  } else if (type === HOST_WORKER_MSG_TYPES.ROOM_CREATE) {
    consumer.hostReplayRingBuffer?.configureMode?.(
      payload.startAsMatch ? RBM.COUNTDOWN_MATCH : RBM.COUNTUP_FIFO,
      payload.replayCapacityTicks || null
    );
    consumer.hostReplayRingBuffer?.clear();
    consumer._seenReplaySignalIds?.clear();
  }
}

export function buildNotifyPlayerJoinedPayload(
  entityId: number,
  name: string,
  role = 'player',
  channelId: string | null = null,
  visualId = 'octane',
  colorSlot = 0,
  hitboxId: string | null = null,
  paintFinish?: string,
  boostVisual?: string,
  boostAudio?: string
): Record<string, unknown> {
  return {
    entityId,
    name,
    role,
    channelId: channelId || (entityId === 0 ? 'host' : `peer_${entityId}`),
    visualId,
    colorSlot,
    hitboxId,
    paintFinish,
    boostVisual,
    boostAudio,
  };
}

export function normalizeHostLoadoutCommandPayload(
  sessionId: string | null,
  visualId: string,
  colorSlot = 0,
  hitboxId: string | null = null,
  extra: ExtraLoadoutConfig | string | null = null,
  boostVisual: string | null = null,
  boostAudio: string | null = null
): {
  sessionId: string | null;
  visualId: string;
  colorSlot: number;
  hitboxId: string | null;
  extraLoadout: ExtraLoadoutConfig | null;
} {
  const extraLoadout: ExtraLoadoutConfig | null =
    extra && typeof extra === 'object'
      ? extra
      : extra !== null || boostVisual !== null || boostAudio !== null
        ? {
            paintFinish: typeof extra === 'string' ? extra : undefined,
            boostVisual: boostVisual ?? undefined,
            boostAudio: boostAudio ?? undefined,
          }
        : null;
  return { sessionId, visualId, colorSlot, hitboxId, extraLoadout };
}

export class HostClientChannelRegistry {
  channels: HostClientChannelPort[] = [];
  channelMap = new Map<HostClientChannelPort, string>();
  channelIdToChannel = new Map<string, HostClientChannelPort>();
  nextChannelId = 1;
  hostChannel: HostClientChannelPort;
  pendingRequests = new Map<number, { resolve: (val: unknown) => void }>();
  envelopeListeners = new Set<(envelope: HostWorkerEnvelopeMessage) => void>();
  reqId = 0;

  constructor(initialChannel: HostClientChannelPort) {
    this.hostChannel = initialChannel;
    this.channelMap.set(this.hostChannel, 'host');
    this.channelIdToChannel.set('host', this.hostChannel);
  }

  addEnvelopeListener(fn: (envelope: HostWorkerEnvelopeMessage) => void): () => void {
    if (typeof fn === 'function') {
      this.envelopeListeners.add(fn);
      return () => this.envelopeListeners.delete(fn);
    }
    return () => {};
  }

  notifyEnvelopeListeners(envelope: HostWorkerEnvelopeMessage): void {
    for (const listener of this.envelopeListeners) {
      try {
        listener(envelope);
      } catch (err) {
        console.warn('[HostServerWorker] Error in envelope listener:', err);
      }
    }
  }

  allocatePendingRequest<T = unknown>(
    transform?: (val: unknown) => T
  ): { reqId: number; promise: Promise<T> } {
    const reqId = ++this.reqId;
    const promise = new Promise<T>((resolve) => {
      this.pendingRequests.set(reqId, {
        resolve: (val: unknown) => resolve(transform ? transform(val) : (val as T)),
      });
    });
    return { reqId, promise };
  }

  handleWorkerMessage(
    consumer: HostLoopbackPacketConsumerPort,
    data: HostWorkerEnvelopeMessage | null | undefined
  ): void {
    if (!data) {
      return;
    }
    if (data.type && data.payload !== undefined) {
      if (data.type === HOST_WORKER_MSG_TYPES.ROOM_STATE_SYNC) {
        consumer.lastRoomState = data.payload as Partial<WorkerRoomStateSummary>;
        consumer.botTunnelManager?.syncFromRoomState?.(consumer.lastRoomState);
      }
      if (data.seq && this.pendingRequests.has(data.seq)) {
        const req = this.pendingRequests.get(data.seq)!;
        this.pendingRequests.delete(data.seq);
        req.resolve(data.payload);
      }
      this.notifyEnvelopeListeners(data);
    }

    switch (data.type) {
      case 'channel_packet': {
        const { channelId, packet } = data;
        if (channelId === 'host') {
          processHostLoopbackChannelPacket(consumer, packet);
        } else if (channelId && packet !== undefined) {
          const ch = this.channelIdToChannel.get(channelId);
          if (ch) {
            if (typeof ch.send === 'function') {
              ch.send(packet);
            } else if (typeof ch.sendServerState === 'function') {
              ch.sendServerState(packet);
            }
          }
        }
        break;
      }
      case 'requestResponse': {
        const { reqId, result } = data;
        if (typeof reqId === 'number' && this.pendingRequests.has(reqId)) {
          const req = this.pendingRequests.get(reqId)!;
          this.pendingRequests.delete(reqId);
          req.resolve(result);
        }
        break;
      }
      default:
        break;
    }
  }

  addClientChannel(
    channel: HostClientChannelPort | null | undefined,
    overrideId: string | null,
    isWorker: boolean,
    worker: Worker | null,
    postCommand: (type: string, data: Record<string, unknown>) => void,
    fallbackDataHandler: NetworkDataHandler | null
  ): string | null {
    if (!channel) {
      return null;
    }
    if (this.channelMap.has(channel)) {
      return this.channelMap.get(channel)!;
    }
    const channelId = overrideId || `peer_${this.nextChannelId++}`;
    this.channels.push(channel);
    this.channelMap.set(channel, channelId);
    this.channelIdToChannel.set(channelId, channel);

    const origPacketReceived = channel.onPacketReceived;
    channel.onPacketReceived = (packet: Uint8Array | ArrayBuffer | string) => {
      origPacketReceived?.(packet);
      if (isWorker && worker) {
        postCommand('channel_packet', { channelId, packet });
      } else if (fallbackDataHandler && packet instanceof Uint8Array) {
        fallbackDataHandler.handleIncomingPacket(channelId, packet, performance.now());
      } else if (fallbackDataHandler && packet instanceof ArrayBuffer) {
        fallbackDataHandler.handleIncomingPacket(
          channelId,
          new Uint8Array(packet),
          performance.now()
        );
      }
    };

    if (isWorker && worker) {
      postCommand('registerChannel', {
        channelId,
        playerName: channel.peerName || 'Player',
        visualId: channel.visualId || 'octane',
        colorSlot: channel.colorSlot ?? 0,
      });
    } else if (fallbackDataHandler) {
      fallbackDataHandler.registerChannel(channelId, {
        send: (pkt) => {
          if (typeof channel.send === 'function') {
            channel.send(pkt);
          }
        },
      });
    }
    return channelId;
  }

  destroy(): void {
    this.channels = [];
    this.channelMap.clear();
    this.channelIdToChannel.clear();
    this.pendingRequests.clear();
    this.envelopeListeners.clear();
  }
}
