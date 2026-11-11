/**
 * CloudProfileMqttTransport.ts
 * Stateful MQTT v3.1.1 over WebSocket transport connection manager for Cloud Profile Sync.
 * Handles WebSocket lifecycle, binary MQTT packet framing, keep-alive ping timers,
 * SUBACK/PUBACK waiters, and retained topic subscriptions.
 */

import { credentialBundleManager } from './CredentialBundleManager.ts';
import {
  MQTT_DISCONNECT_PACKET,
  MQTT_PINGREQ_PACKET,
  appendMqttRxChunk,
  buildMqttConnectPacket,
  buildMqttPubAckPacket,
  buildMqttPublishPacket,
  buildMqttSubscribePacket,
  buildMqttUnsubscribePacket,
  decodeMqttPublishBody,
  popMqttFramesFromBuffer,
  type DecodedMqttPublishPayload,
} from './mqttPacketCodec.ts';

interface PendingSubWaiter {
  packetId: number;
  resolve: () => void;
  reject: (err: Error) => void;
}

export class CloudProfileMqttTransport {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private connectPromise: Promise<string> | null = null;
  private activeRole: 'client' | 'dev' | null = null;
  private activeBrokerUrl = '';
  private activeNamespace = '';
  private rxBuffer: Uint8Array = new Uint8Array(0);
  private nextPacketId = 1;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private subWaiters = new Map<number, PendingSubWaiter>();
  private pubAckWaiters = new Map<number, () => void>();
  public readonly topicListeners = new Set<(msg: DecodedMqttPublishPayload) => void>();
  public readonly watchedTopics = new Set<string>();
  private readonly onUnexpectedClose?: () => void;

  constructor(onUnexpectedClose?: () => void) {
    this.onUnexpectedClose = onUnexpectedClose;
  }

  private allocatePacketId(): number {
    this.nextPacketId = (this.nextPacketId % 65534) + 1;
    return this.nextPacketId;
  }

  getAvailability(): { available: boolean; canManageAccounts: boolean; source: string } {
    const spec = credentialBundleManager.getConfigSyncSpec();
    if (!spec) {
      return {
        available: false,
        canManageAccounts: false,
        source: credentialBundleManager.getActiveSource(),
      };
    }
    return {
      available: true,
      canManageAccounts: Boolean(
        spec.source === 'dev-private' && spec.devUsername && spec.devPassword
      ),
      source: spec.source,
    };
  }

  async ensureConnected(
    preferredRole: 'client' | 'dev' = 'client',
    timeoutMs = 5000
  ): Promise<string> {
    const spec = credentialBundleManager.getConfigSyncSpec();
    if (!spec) {
      throw new Error('Cloud profile sync requires an active .rctbnspib credential bundle.');
    }
    const hasDevCreds =
      spec.source === 'dev-private' && Boolean(spec.devUsername && spec.devPassword);
    const targetRole: 'client' | 'dev' =
      (hasDevCreds || preferredRole === 'dev') && spec.devUsername && spec.devPassword
        ? 'dev'
        : 'client';
    const username = targetRole === 'dev' ? spec.devUsername! : spec.clientUsername;
    const password = targetRole === 'dev' ? spec.devPassword! : spec.clientPassword;

    if (
      this.isConnected &&
      this.ws?.readyState === 1 &&
      (this.activeRole === targetRole || this.activeRole === 'dev') &&
      this.activeBrokerUrl === spec.brokerUrl &&
      this.activeNamespace === spec.topicNamespace
    ) {
      return this.activeNamespace;
    }
    if (this.connectPromise) return this.connectPromise;

    const connecting = this.openMqttSocket({
      brokerUrl: spec.brokerUrl,
      topicNamespace: spec.topicNamespace,
      targetRole,
      username,
      password,
      timeoutMs,
    });
    this.connectPromise = connecting;
    try {
      return await connecting;
    } finally {
      if (this.connectPromise === connecting) this.connectPromise = null;
    }
  }

  private async openMqttSocket(params: {
    brokerUrl: string;
    topicNamespace: string;
    targetRole: 'client' | 'dev';
    username: string;
    password: string;
    timeoutMs: number;
  }): Promise<string> {
    this.closeSocketOnly();

    const WebSocketConstructor: typeof WebSocket | null =
      typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket || null;
    if (!WebSocketConstructor) {
      throw new Error('WebSocket is not supported in this environment.');
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.closeSocketOnly();
        reject(new Error(`Cloud sync connection timed out after ${params.timeoutMs}ms.`));
      }, params.timeoutMs);

      let sock: WebSocket;
      try {
        sock = new WebSocketConstructor(params.brokerUrl, 'mqtt');
        sock.binaryType = 'arraybuffer';
        this.ws = sock;
      } catch (err) {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      sock.onopen = () => {
        try {
          const clientId = `rc_cfg_${params.targetRole}_${Math.random().toString(36).slice(2, 10)}`;
          sock.send(buildMqttConnectPacket(clientId, params.username, params.password, 30));
        } catch (err) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.closeSocketOnly();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      };

      sock.onmessage = (ev) => {
        this.handleIncomingChunk(new Uint8Array(ev.data), {
          onConnAck: () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.isConnected = true;
            this.activeRole = params.targetRole;
            this.activeBrokerUrl = params.brokerUrl;
            this.activeNamespace = params.topicNamespace;
            this.startKeepAlive();
            resolve();
          },
          onConnError: (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            this.closeSocketOnly();
            reject(err);
          },
        });
      };

      sock.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.closeSocketOnly();
          reject(new Error('Cloud sync WebSocket connection failed.'));
        }
      };

      sock.onclose = () => {
        this.isConnected = false;
        this.stopKeepAlive();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Cloud sync socket closed before ready.'));
        } else {
          this.onUnexpectedClose?.();
        }
      };
    });

    if (this.watchedTopics.size > 0) {
      const topicsToResub = Array.from(this.watchedTopics);
      await Promise.allSettled(topicsToResub.map((t) => this.subscribeTopic(t)));
    }

    return this.activeNamespace;
  }

  private handleIncomingChunk(
    chunk: Uint8Array,
    hooks?: { onConnAck?: () => void; onConnError?: (err: Error) => void }
  ): void {
    if (!chunk || chunk.length === 0) return;
    this.rxBuffer = appendMqttRxChunk(this.rxBuffer, chunk);
    const { frames, remainder, malformed } = popMqttFramesFromBuffer(this.rxBuffer);
    this.rxBuffer = remainder;

    if (malformed) {
      hooks?.onConnError?.(new Error('Malformed MQTT frame from cloud sync broker.'));
      return;
    }

    for (const frame of frames) {
      if (frame.packetType === 2) {
        const returnCode = frame.body.length >= 2 ? frame.body[1] : 255;
        if (returnCode !== 0) {
          hooks?.onConnError?.(
            new Error(`Cloud sync authentication rejected (code ${returnCode}).`)
          );
        } else {
          hooks?.onConnAck?.();
        }
      } else if (frame.packetType === 9) {
        const packetId = frame.body.length >= 2 ? (frame.body[0] << 8) | frame.body[1] : 0;
        const grantCode = frame.body.length >= 3 ? frame.body[2] : 0x80;
        const waiter = this.subWaiters.get(packetId);
        if (waiter) {
          this.subWaiters.delete(packetId);
          if (grantCode === 0x80) {
            waiter.reject(new Error('Cloud sync topic subscription rejected by ACL.'));
          } else {
            waiter.resolve();
          }
        }
      } else if (frame.packetType === 4) {
        const packetId = frame.body.length >= 2 ? (frame.body[0] << 8) | frame.body[1] : 0;
        const pubResolve = this.pubAckWaiters.get(packetId);
        if (pubResolve) {
          this.pubAckWaiters.delete(packetId);
          pubResolve();
        }
      } else if (frame.packetType === 3) {
        const decoded = decodeMqttPublishBody(frame.flags, frame.body);
        if (!decoded) continue;
        if (decoded.qos === 1 && this.ws?.readyState === 1) {
          try {
            this.ws.send(buildMqttPubAckPacket(decoded.packetId));
          } catch {
            // Ignore puback send failure
          }
        }
        for (const listener of this.topicListeners) {
          try {
            listener(decoded);
          } catch {
            // Ignore listener error
          }
        }
      }
    }
  }

  async subscribeTopic(topic: string, timeoutMs = 2500): Promise<void> {
    if (!this.ws || this.ws.readyState !== 1 || !this.isConnected) {
      throw new Error('Cloud sync client is not connected.');
    }
    const packetId = this.allocatePacketId();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.subWaiters.delete(packetId);
        reject(new Error(`Subscription timeout for ${topic}`));
      }, timeoutMs);
      this.subWaiters.set(packetId, {
        packetId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.ws!.send(buildMqttSubscribePacket(packetId, topic, 1));
    });
  }

  unsubscribeTopic(topic: string): void {
    if (this.watchedTopics.has(topic)) return;
    if (!this.ws || this.ws.readyState !== 1 || !this.isConnected) return;
    try {
      this.ws.send(buildMqttUnsubscribePacket(this.allocatePacketId(), topic));
    } catch {
      // Ignore unsubscribe error
    }
  }

  async publishRetained(topic: string, payload: unknown | null, timeoutMs = 3000): Promise<void> {
    if (!this.ws || this.ws.readyState !== 1 || !this.isConnected) {
      throw new Error('Cloud sync client is not connected.');
    }
    const messageStr = payload === null ? '' : JSON.stringify(payload);
    const packetId = this.allocatePacketId();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pubAckWaiters.delete(packetId);
        reject(new Error('Cloud sync publish PUBACK timed out.'));
      }, timeoutMs);
      this.pubAckWaiters.set(packetId, () => {
        clearTimeout(timer);
        resolve();
      });
      const packet = buildMqttPublishPacket(topic, messageStr, 1, packetId, true);
      this.ws!.send(packet);
    });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === 1) {
        try {
          this.ws.send(MQTT_PINGREQ_PACKET);
        } catch {
          // Ignore keepalive error
        }
      }
    }, 24000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  closeSocketOnly(): void {
    this.stopKeepAlive();
    this.subWaiters.clear();
    this.pubAckWaiters.clear();
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        sock.onmessage = null;
        sock.onerror = null;
        sock.onclose = null;
        if (sock.readyState === 0) {
          sock.onopen = () => {
            sock.onopen = null;
            try {
              sock.close(1000, 'Client closed');
            } catch {
              // Ignore close error
            }
          };
        } else if (sock.readyState === 1) {
          sock.onopen = null;
          if (this.isConnected) {
            sock.send(MQTT_DISCONNECT_PACKET);
          }
          sock.close(1000, 'Client closed');
        } else {
          sock.onopen = null;
        }
      } catch {
        // Ignore close error
      }
    }
    this.rxBuffer = new Uint8Array(0);
    this.isConnected = false;
    this.activeRole = null;
  }
}
