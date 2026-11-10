import { InputPacketCodec, MAGIC_BYTE } from '../protocol/InputPacketCodec.ts';
import type { MatchSessionAdmin } from './match/MatchSessionAdmin.ts';
import type { EstablishedSessionManager } from './EstablishedSessionManager.ts';
import type { PhysicsEngineManager } from './PhysicsEngineManager.ts';

export const PACKET_TYPES = Object.freeze({
  UNKNOWN: 'unknown',
  CLIENT_INPUT: 'client_input',
  HANDSHAKE_REQUEST: 'handshake_request',
  HANDSHAKE_RESPONSE: 'handshake_response',
  COLOR_CHANGE: 'color_change',
  HEARTBEAT_PING: 'heartbeat_ping',
  HEARTBEAT_PONG: 'heartbeat_pong',
});

export interface NetworkTransportChannel {
  isVirtualBot?: boolean;
  send?: (packet: Uint8Array | string) => void;
  postMessage?: (packet: Uint8Array | string) => void;
}

export interface NetworkDataHandlerOptions {
  matchManager?: MatchSessionAdmin | null;
  sessionManager?: EstablishedSessionManager | null;
  physicsManager?: PhysicsEngineManager | null;
}

export class NetworkDataHandler {
  matchManager: MatchSessionAdmin | null;
  sessionManager: EstablishedSessionManager | null;
  physicsManager: PhysicsEngineManager | null;
  channels: Map<string, NetworkTransportChannel>;
  interceptors: Array<
    (
      channelId: string,
      rawData: Uint8Array | ArrayBuffer | string,
      arrivalTimestamp: number
    ) => boolean
  >;

  constructor(options: NetworkDataHandlerOptions = {}) {
    this.matchManager = options.matchManager || null;
    this.sessionManager = options.sessionManager || null;
    this.physicsManager = options.physicsManager || null;

    this.channels = new Map();
    this.interceptors = [];
  }

  registerChannel(channelId: string, channel: NetworkTransportChannel): void {
    this.channels.set(channelId, channel);
  }

  unregisterChannel(channelId: string): void {
    this.channels.delete(channelId);
  }

  handleIncomingPacket(
    channelId: string,
    rawData: Uint8Array | ArrayBuffer | string,
    arrivalTimestamp = Date.now()
  ): void {
    for (let i = 0; i < this.interceptors.length; i++) {
      if (this.interceptors[i](channelId, rawData, arrivalTimestamp) === false) {
        return;
      }
    }

    const packetType = this.classifyPacket(rawData);

    if (packetType === PACKET_TYPES.CLIENT_INPUT) {
      this.handleClientInputPacket(channelId, rawData, arrivalTimestamp);
      return;
    }

    this.handleUnknownOrControlPacket(channelId, packetType, rawData);
  }

  classifyPacket(rawData: unknown): string {
    if (!rawData) return PACKET_TYPES.UNKNOWN;

    if (rawData instanceof Uint8Array || rawData instanceof ArrayBuffer) {
      const u8 = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
      if (u8.length >= 7 && u8[0] === MAGIC_BYTE) {
        return PACKET_TYPES.CLIENT_INPUT;
      }
    }

    if (typeof rawData === 'string') {
      try {
        const obj = JSON.parse(rawData);
        if (
          obj.type === 'join' ||
          obj.type === 'join_training' ||
          obj.type === 'token' ||
          obj.type === 'handshake_request'
        ) {
          return PACKET_TYPES.HANDSHAKE_REQUEST;
        }
        if (obj.type === 'handshake_response' || obj.type === 'handshake_accept') {
          return PACKET_TYPES.HANDSHAKE_RESPONSE;
        }
        if (obj.type === 'color_change') return PACKET_TYPES.COLOR_CHANGE;
        if (obj.type === 'ping') return PACKET_TYPES.HEARTBEAT_PING;
      } catch (err) {
        console.warn('[NetworkDataHandler] Failed to parse packet string as JSON:', err, rawData);
      }
    }

    return PACKET_TYPES.UNKNOWN;
  }

  handleClientInputPacket(
    channelId: string,
    rawData: Uint8Array | ArrayBuffer | string,
    arrivalTimestamp: number
  ): void {
    const session = this.sessionManager?.getSession(channelId);
    if (!session) {
      this.handleUnknownOrControlPacket(channelId, PACKET_TYPES.UNKNOWN, rawData);
      return;
    }

    let decoded: ReturnType<typeof InputPacketCodec.decode> = null;
    try {
      decoded = InputPacketCodec.decode(rawData as Uint8Array | ArrayBuffer);
    } catch (err) {
      console.warn(`[NetworkDataHandler] Failed to decode input packet from ${channelId}:`, err);
    }

    const inputHistory = decoded?.history || decoded?.inputs || null;
    const hasValidInput = Array.isArray(inputHistory) && inputHistory.length > 0;

    const clientTs =
      decoded && typeof decoded.clientTimestamp === 'number' && decoded.clientTimestamp > 0
        ? decoded.clientTimestamp
        : arrivalTimestamp;
    this.sessionManager?.recordClientTimestamp(channelId, clientTs, hasValidInput);

    if (decoded?.acks && decoded.acks.length > 0 && this.sessionManager) {
      this.sessionManager.recordClientSignalAcks(channelId, decoded.acks);
      if (this.matchManager) {
        this.matchManager.commandQueue.handleClientSignalAcks(channelId, decoded.acks);
      }
    }

    if (decoded?.commands && decoded.commands.length > 0 && this.sessionManager) {
      const currentTick =
        this.physicsManager?.currentTick ?? this.matchManager?.lifecycle.matchTick ?? 0;
      const freshCommands = this.sessionManager.ingestClientCommands(
        channelId,
        decoded.commands,
        currentTick
      );
      if (freshCommands.length > 0 && this.matchManager) {
        for (let i = 0; i < freshCommands.length; i++) {
          const cmd = freshCommands[i];
          this.matchManager.commandQueue.handleClientCommand(channelId, cmd as never, session);
        }
      }
    }

    if (hasValidInput && inputHistory && this.matchManager) {
      this.matchManager.commandQueue.recordSkipReplayInputEdge(channelId, inputHistory);
    }

    if (session.role === 'spectator') {
      return;
    }

    if (hasValidInput && inputHistory && this.physicsManager) {
      const targetEntityId = session.entityId >= 0 ? session.entityId : (decoded?.carIndex ?? 0);
      const isBotChannel = channelId === 'bot' || String(channelId || '').startsWith('bot_');
      this.physicsManager.pushRedundantInputs(targetEntityId, inputHistory);
      if (isBotChannel) {
        const latestCtrl = inputHistory[inputHistory.length - 1]?.controls;
        if (latestCtrl && this.physicsManager.lastAcknowledgedControls) {
          this.physicsManager.lastAcknowledgedControls.set(targetEntityId, { ...latestCtrl });
        }
      }
    }
  }

  handleUnknownOrControlPacket(
    channelId: string,
    packetType: string,
    rawData: Uint8Array | ArrayBuffer | string
  ): void {
    if (!this.matchManager) {
      console.warn(
        `[NetworkDataHandler] No match manager configured to handle packet from ${channelId}`
      );
      return;
    }

    let parsed: unknown = rawData;
    if (typeof rawData === 'string') {
      try {
        parsed = JSON.parse(rawData);
      } catch (err) {
        console.warn(
          '[NetworkDataHandler] Failed to parse unknown packet string as JSON:',
          err,
          rawData
        );
      }
    }

    this.matchManager.commandQueue.evaluateControlPacket(channelId, packetType, parsed as never);
  }

  sendPacket(channelId: string, packetData: Uint8Array | string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    if (typeof channel.send === 'function') {
      channel.send(packetData);
      return true;
    }
    if (typeof channel.postMessage === 'function') {
      channel.postMessage(packetData);
      return true;
    }
    return false;
  }

  broadcast(
    packetData: Uint8Array | string,
    filterFn: ((channelId: string, channel: NetworkTransportChannel) => boolean) | null = null
  ): void {
    for (const [chId, channel] of this.channels.entries()) {
      if (!filterFn || filterFn(chId, channel)) {
        this.sendPacket(chId, packetData);
      }
    }
  }

  dispatchFrameToSessions(globalPayloadBytes: Uint8Array): void {
    if (!this.sessionManager) return;

    this.sessionManager.evaluateSessionTimeouts(
      this.sessionManager.getTime(),
      (evictedSessionId) => {
        if (this.matchManager) {
          this.matchManager.roster.removePlayerSession(evictedSessionId);
        } else {
          this.sessionManager?.unregisterSession(evictedSessionId, true);
        }
      }
    );

    const { statelessPayloadBytes, serverTick } =
      this.sessionManager.extractSignalsFromGlobalPayload(globalPayloadBytes);

    const sessions = this.sessionManager.getAllSessions();
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const ch = this.channels.get(s.sessionId);
      if (ch?.isVirtualBot) continue;
      const packet = this.sessionManager.buildClientPacket(s.sessionId, statelessPayloadBytes, {
        alreadyStripped: true,
        serverTick,
      });
      this.sendPacket(s.sessionId, packet);
    }
  }

  destroy(): void {
    this.channels.clear();
    this.interceptors = [];
    this.matchManager = null;
    this.sessionManager = null;
    this.physicsManager = null;
  }
}
