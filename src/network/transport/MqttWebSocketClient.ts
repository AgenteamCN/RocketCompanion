/**
 * MqttWebSocketClient.ts
 * Zero-dependency MQTT v3.1.1 over WebSocket client for browser WebRTC signaling.
 * Supports username/password authentication, topic subscription, QoS 0/1 publishing,
 * keepalive PINGREQ/PINGRESP, and pub/sub self-loopback verification.
 */

import {
  MQTT_DISCONNECT_PACKET,
  MQTT_PINGREQ_PACKET,
  appendMqttRxChunk,
  buildMqttConnectPacket,
  buildMqttPubAckPacket,
  buildMqttPublishPacket,
  buildMqttSubscribePacket,
  decodeMqttPublishBody,
  popMqttFramesFromBuffer,
} from './mqttPacketCodec.ts';

export interface MqttWebSocketClientOptions {
  relayId?: string;
  relayLabel?: string;
  topic?: string;
  bridgeTopic?: string;
  peerId?: string;
  clientId?: string;
  username?: string;
  password?: string;
  keepAliveSeconds?: number;
}

interface MqttPacketProcessHooks {
  onSubscribed?: () => void;
  onLoopbackVerified?: () => void;
  onFatalError?: (err: Error) => void;
}

export class MqttWebSocketClient {
  brokerUrl: string;
  relayId: string;
  relayLabel: string;
  topic: string | undefined;
  bridgeTopic: string | undefined;
  peerId: string;
  clientId: string;
  username: string;
  password: string;
  keepAliveSeconds: number;

  ws: WebSocket | null = null;
  isConnected = false;
  isSubscribed = false;
  isLoopbackVerified = false;
  loopbackRttMs = 0;
  _rxBuffer: Uint8Array = new Uint8Array(0);
  _nextPacketId = 1;
  _keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  _probeId = `probe_${Math.random().toString(36).slice(2, 10)}`;
  _probeSentAt = 0;
  eventListeners = new Map<
    string,
    Array<(payload?: Record<string, unknown> | Error | CloseEvent) => void>
  >();

  constructor(brokerUrl: string, options: MqttWebSocketClientOptions = {}) {
    this.brokerUrl = String(brokerUrl || '').trim();
    this.relayId = options.relayId || 'mqtt_relay';
    this.relayLabel = options.relayLabel || this.brokerUrl;
    this.topic = options.topic;
    this.bridgeTopic =
      options.bridgeTopic ||
      (options.topic && options.topic.includes('/dir/')
        ? options.topic.replace('/dir/', '/brg/')
        : undefined);
    this.peerId = options.peerId || `peer_${Math.random().toString(36).slice(2, 8)}`;
    this.clientId =
      options.clientId || `rc_${this.peerId}_${Math.random().toString(36).slice(2, 7)}`;
    this.username = options.username || '';
    this.password = options.password || '';
    this.keepAliveSeconds = options.keepAliveSeconds || 30;
  }

  _allocatePacketId(): number {
    this._nextPacketId = (this._nextPacketId % 65534) + 1;
    return this._nextPacketId;
  }

  async connect(timeoutMs = 5000): Promise<void> {
    if (this.isConnected && this.isSubscribed && this.ws?.readyState === 1) {
      return;
    }

    const WebSocketConstructor: typeof WebSocket | null =
      typeof WebSocket !== 'undefined'
        ? WebSocket
        : (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket || null;

    if (!WebSocketConstructor) {
      throw new Error('WebSocket is not supported in this environment');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let loopbackFallbackHandle: ReturnType<typeof setTimeout> | null = null;

      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (loopbackFallbackHandle) clearTimeout(loopbackFallbackHandle);
        this.emit('open', {
          relayId: this.relayId,
          loopbackVerified: this.isLoopbackVerified,
        });
        resolve();
      };

      const finishFailure = (err: unknown) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (loopbackFallbackHandle) clearTimeout(loopbackFallbackHandle);
        this.close();
        const errorObj = err instanceof Error ? err : new Error(String(err));
        this.emit('error', errorObj);
        reject(errorObj);
      };

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          finishFailure(
            new Error(`MQTT connection timed out after ${timeoutMs}ms (${this.relayLabel})`)
          );
        }, timeoutMs);
      }

      let sock: WebSocket;
      try {
        sock = new WebSocketConstructor(this.brokerUrl, 'mqtt');
        sock.binaryType = 'arraybuffer';
        this.ws = sock;
      } catch (err) {
        return finishFailure(err);
      }

      sock.onopen = () => {
        try {
          const connectPacket = buildMqttConnectPacket(
            this.clientId,
            this.username,
            this.password,
            this.keepAliveSeconds
          );
          sock.send(connectPacket);
        } catch (err) {
          finishFailure(err);
        }
      };

      sock.onmessage = (ev) => {
        this._appendAndProcessBuffer(new Uint8Array(ev.data), {
          onSubscribed: () => {
            this._sendLoopbackSelfProbe();
            loopbackFallbackHandle = setTimeout(() => {
              finishSuccess();
            }, 350);
          },
          onLoopbackVerified: () => {
            finishSuccess();
          },
          onFatalError: (err) => {
            finishFailure(err);
          },
        });
      };

      sock.onerror = () => {
        if (!settled) {
          finishFailure(new Error(`MQTT WebSocket error (${this.relayLabel})`));
        } else {
          this.emit('error', new Error(`MQTT runtime socket error (${this.relayLabel})`));
        }
      };

      sock.onclose = (ev) => {
        this.isConnected = false;
        this.isSubscribed = false;
        this._stopKeepAlive();
        if (!settled) {
          finishFailure(new Error(`MQTT socket closed before ready (code ${ev.code})`));
        } else {
          this.emit('close', ev);
        }
      };
    });
  }

  _sendLoopbackSelfProbe(): void {
    this._probeSentAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.send({
      type: 'relay_loopback_probe',
      probeId: this._probeId,
      fromPeerId: this.peerId,
      relayId: this.relayId,
      timestamp: Date.now(),
    });
  }

  _appendAndProcessBuffer(chunk: Uint8Array, hooks: MqttPacketProcessHooks = {}): void {
    if (!chunk || chunk.length === 0) return;
    this._rxBuffer = appendMqttRxChunk(this._rxBuffer, chunk);

    const { frames, remainder, malformed } = popMqttFramesFromBuffer(this._rxBuffer);
    this._rxBuffer = remainder;

    if (malformed) {
      hooks.onFatalError?.(new Error('Malformed MQTT remaining length'));
      return;
    }

    for (const frame of frames) {
      this._handleMqttPacket(frame.packetType, frame.flags, frame.body, hooks);
    }
  }

  _handleMqttPacket(
    packetType: number,
    flags: number,
    body: Uint8Array,
    hooks: MqttPacketProcessHooks = {}
  ): void {
    if (packetType === 2) {
      const returnCode = body.length >= 2 ? body[1] : 255;
      if (returnCode !== 0) {
        hooks.onFatalError?.(new Error(`MQTT CONNACK rejected with code ${returnCode}`));
        return;
      }
      this.isConnected = true;
      this._startKeepAlive();
      if (this.topic && this.ws?.readyState === 1) {
        const subPacket = buildMqttSubscribePacket(this._allocatePacketId(), this.topic, 1);
        this.ws.send(subPacket);
      } else {
        this.isSubscribed = true;
        hooks.onSubscribed?.();
      }
      return;
    }

    if (packetType === 9) {
      const grantCode = body.length >= 3 ? body[2] : 0x80;
      if (grantCode === 0x80) {
        hooks.onFatalError?.(new Error('MQTT SUBACK rejected subscription to topic'));
        return;
      }
      this.isSubscribed = true;
      hooks.onSubscribed?.();
      return;
    }

    if (packetType === 3) {
      const decoded = decodeMqttPublishBody(flags, body);
      if (!decoded) return;
      if (decoded.qos === 1 && this.ws?.readyState === 1) {
        try {
          this.ws.send(buildMqttPubAckPacket(decoded.packetId));
        } catch (_) {
          // Ignore puback error
        }
      }
      const parsed = decoded.parsedJson;
      if (!parsed) return;
      if (parsed.type === 'relay_loopback_probe') {
        if (parsed.probeId === this._probeId && parsed.fromPeerId === this.peerId) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this.isLoopbackVerified = true;
          this.loopbackRttMs = Math.max(1, Math.round(now - this._probeSentAt));
          this.emit('loopback_verified', {
            relayId: this.relayId,
            rttMs: this.loopbackRttMs,
          });
          hooks.onLoopbackVerified?.();
        }
        return;
      }
      this.emit('message', parsed);
      return;
    }

    if (packetType === 13) {
      this.emit('pong', { relayId: this.relayId });
    }
  }

  send(data: Record<string, unknown> | string, qos = 0): boolean {
    if (!this.topic) return false;
    return this.publishToTopic(this.topic, data, qos);
  }

  publishToTopic(targetTopic: string, data: Record<string, unknown> | string, qos = 0): boolean {
    if (!this.ws || this.ws.readyState !== 1 || !this.isConnected || !targetTopic) {
      return false;
    }
    try {
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      const packetId = qos > 0 ? this._allocatePacketId() : 0;
      const packet = buildMqttPublishPacket(targetTopic, jsonStr, qos, packetId);
      this.ws.send(packet);
      return true;
    } catch (err) {
      console.warn(`[MqttWebSocketClient] Failed to publish on ${this.relayLabel}:`, err);
      return false;
    }
  }

  sendBridge(data: Record<string, unknown> | string, customBridgeTopic?: string, qos = 1): boolean {
    const targetBridgeTopic =
      customBridgeTopic ||
      this.bridgeTopic ||
      (this.topic && this.topic.includes('/dir/')
        ? this.topic.replace('/dir/', '/brg/')
        : undefined);
    if (!targetBridgeTopic) return false;
    const payloadObj = typeof data === 'string' ? JSON.parse(data) : data;
    return this.publishToTopic(
      targetBridgeTopic,
      {
        ...payloadObj,
        _brgHop: 0,
        _brgFrom: this.relayId,
      },
      qos
    );
  }

  _startKeepAlive(): void {
    this._stopKeepAlive();
    const intervalMs = Math.max(10000, Math.floor(this.keepAliveSeconds * 800));
    this._keepAliveTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === 1) {
        try {
          this.ws.send(MQTT_PINGREQ_PACKET);
        } catch (_) {
          // Ignore keepalive error
        }
      }
    }, intervalMs);
  }

  _stopKeepAlive(): void {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }

  on(event: string, listener: (payload?: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off(event: string, listener: (payload?: any) => void): void {
    const list = this.eventListeners.get(event);
    if (!list) return;
    this.eventListeners.set(
      event,
      list.filter((fn) => fn !== listener)
    );
  }

  emit(event: string, payload?: Record<string, unknown> | Error | CloseEvent): void {
    const list = this.eventListeners.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (err) {
        console.error('[MqttWebSocketClient] Listener error:', err);
      }
    }
  }

  close(): void {
    this._stopKeepAlive();
    if (this.ws) {
      try {
        if (this.ws.readyState === 1 && this.isConnected) {
          this.ws.send(MQTT_DISCONNECT_PACKET);
        }
        this.ws.close(1000, 'Client closed');
      } catch (_) {
        // Ignore close error
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.isSubscribed = false;
  }
}
