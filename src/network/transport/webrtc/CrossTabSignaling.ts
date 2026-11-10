/**
 * CrossTabSignaling.ts
 * BroadcastChannel signaling layer for cross-tab discovery and 120Hz native local data exchange.
 */

export type CrossTabRoomPayload = Record<string, unknown> | Uint8Array | ArrayBuffer | string;
export type BroadcastMessageListener = (data: Record<string, unknown>) => void;
export type RoomMessageListener = (data: CrossTabRoomPayload) => void;

export interface CrossTabSignalingHandler {
  handleBroadcastMessage(data: Record<string, unknown>): void;
  handleRoomMessage(data: CrossTabRoomPayload): void;
}

export interface CrossTabSignalingOptions {
  signalingChannelName?: string;
  roomId?: string | null;
  onBroadcastMessage?: BroadcastMessageListener | null;
  onRoomMessage?: RoomMessageListener | null;
  handler?: CrossTabSignalingHandler | null;
}

export interface BroadcastSignalContext {
  roomId?: string | null;
  role?: string;
  playerName?: string;
}

export class CrossTabSignaling {
  signalingChannelName: string;
  roomId: string | null;
  onBroadcastMessage: BroadcastMessageListener | null;
  onRoomMessage: RoomMessageListener | null;
  handler: CrossTabSignalingHandler | null;
  broadcastChannel: BroadcastChannel | null = null;
  roomBroadcastChannel: BroadcastChannel | null = null;

  private readonly broadcastListeners = new Set<BroadcastMessageListener>();
  private readonly roomListeners = new Set<RoomMessageListener>();
  private readonly pendingBroadcastQueue: Record<string, unknown>[] = [];
  private readonly pendingRoomQueue: CrossTabRoomPayload[] = [];

  constructor(options: CrossTabSignalingOptions = {}) {
    this.signalingChannelName = options.signalingChannelName || 'online_discovery';
    this.roomId = options.roomId || null;
    this.onBroadcastMessage = options.onBroadcastMessage ?? null;
    this.onRoomMessage = options.onRoomMessage ?? null;
    this.handler = options.handler ?? null;

    this.initSignalingChannel(this.signalingChannelName);
    if (this.roomId) {
      this.initRoomChannel(this.roomId);
    }
  }

  subscribeBroadcast(listener: BroadcastMessageListener): () => void {
    this.broadcastListeners.add(listener);
    return () => {
      this.broadcastListeners.delete(listener);
    };
  }

  subscribeRoom(listener: RoomMessageListener): () => void {
    this.roomListeners.add(listener);
    return () => {
      this.roomListeners.delete(listener);
    };
  }

  drainBroadcastMessages(): Record<string, unknown>[] {
    if (this.pendingBroadcastQueue.length === 0) return [];
    return this.pendingBroadcastQueue.splice(0, this.pendingBroadcastQueue.length);
  }

  drainRoomMessages(): CrossTabRoomPayload[] {
    if (this.pendingRoomQueue.length === 0) return [];
    return this.pendingRoomQueue.splice(0, this.pendingRoomQueue.length);
  }

  private dispatchBroadcast(data: Record<string, unknown>): void {
    let handled = false;
    if (this.onBroadcastMessage) {
      this.onBroadcastMessage(data);
      handled = true;
    }
    const activeHandler = this.handler;
    if (activeHandler) {
      activeHandler.handleBroadcastMessage(data);
      handled = true;
    }
    for (const listener of this.broadcastListeners) {
      listener(data);
      handled = true;
    }
    const queue = this.pendingBroadcastQueue;
    if (!handled) {
      queue.push(data);
    }
  }

  private dispatchRoom(data: CrossTabRoomPayload): void {
    let handled = false;
    if (this.onRoomMessage) {
      this.onRoomMessage(data);
      handled = true;
    }
    const activeHandler = this.handler;
    if (activeHandler) {
      activeHandler.handleRoomMessage(data);
      handled = true;
    }
    for (const listener of this.roomListeners) {
      listener(data);
      handled = true;
    }
    const queue = this.pendingRoomQueue;
    if (!handled) {
      queue.push(data);
    }
  }

  initSignalingChannel(channelName: string): void {
    if (typeof BroadcastChannel === 'undefined' || !channelName) return;
    this.signalingChannelName = channelName;
    try {
      const existing = this.broadcastChannel;
      if (existing) {
        existing.close();
      }
      const channel = new BroadcastChannel(channelName);
      const unrefFn = (channel as BroadcastChannel & { unref?: () => void }).unref;
      if (typeof unrefFn === 'function') {
        unrefFn.call(channel);
      }
      channel.onmessage = (e: MessageEvent<Record<string, unknown>>) => {
        this.dispatchBroadcast(e.data);
      };
      this.broadcastChannel = channel;
    } catch (err) {
      console.warn('[P2PWebRTCChannel] BroadcastChannel unavailable:', err);
    }
  }

  initRoomChannel(roomId: string | null): void {
    if (!roomId || typeof BroadcastChannel === 'undefined') return;
    const targetName = 'p2p_room_' + roomId;
    const existing = this.roomBroadcastChannel;
    if (existing && existing.name === targetName) {
      return;
    }
    try {
      if (existing) {
        existing.close();
      }
      this.roomId = roomId;
      const channel = new BroadcastChannel(targetName);
      channel.onmessage = (e: MessageEvent<CrossTabRoomPayload>) => {
        this.dispatchRoom(e.data);
      };
      this.roomBroadcastChannel = channel;
      console.log(`[P2PWebRTCChannel] Room BroadcastChannel attached: p2p_room_${roomId}`);
    } catch (err) {
      console.warn('[P2PWebRTCChannel] Could not create room BroadcastChannel:', err);
    }
  }

  sendRoomMessage(msg: CrossTabRoomPayload, peerId: string | null = null): boolean {
    const channel = this.roomBroadcastChannel;
    if (channel) {
      try {
        const payload =
          typeof msg === 'object' &&
          msg !== null &&
          !(msg instanceof Uint8Array) &&
          !(msg instanceof ArrayBuffer)
            ? { ...(peerId ? { senderId: peerId } : {}), ...msg }
            : msg;
        channel.postMessage(payload);
        return true;
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Failed to post room message:', err);
      }
    }
    return false;
  }

  broadcastSignal(
    type: string,
    payload: Record<string, unknown> = {},
    context: BroadcastSignalContext = {}
  ): boolean {
    const channel = this.broadcastChannel;
    if (channel) {
      try {
        channel.postMessage({
          type,
          roomId: context.roomId || this.roomId,
          senderRole: context.role || 'client',
          senderName: context.playerName || 'Player',
          timestamp: Date.now(),
          ...payload,
        });
        return true;
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Failed to post message to broadcast channel:', err);
      }
    }
    return false;
  }

  closeRoomChannel(): void {
    const channel = this.roomBroadcastChannel;
    if (channel) {
      try {
        channel.close();
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Error closing roomBroadcastChannel:', err);
      }
      this.roomBroadcastChannel = null;
    }
  }

  destroy(): void {
    this.closeRoomChannel();
    const channel = this.broadcastChannel;
    if (channel) {
      try {
        channel.close();
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Error closing broadcastChannel:', err);
      }
      this.broadcastChannel = null;
    }
    this.pendingBroadcastQueue.length = 0;
    this.pendingRoomQueue.length = 0;
  }
}
