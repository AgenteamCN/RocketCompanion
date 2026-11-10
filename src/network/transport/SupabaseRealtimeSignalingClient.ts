/**
 * SupabaseRealtimeSignalingClient.ts
 * Zero-dependency Phoenix Channel WebSocket client for Supabase Realtime Broadcast (`vsn=1.0.0`).
 * Subscribes to `realtime:<namespace>:dir:<topicHash>` for direct & incoming bridged frames,
 * and dispatches outgoing isolated bridge frames (`<namespace>/brg/<topicHash>`) via the co-hosted
 * Supabase Edge Function (`https://<project>.supabase.co/functions/v1/signaling-bridge`).
 */

export interface SupabaseRealtimeSignalingClientOptions {
  relayId?: string;
  relayLabel?: string;
  channelTopic?: string;
  bridgeTopic?: string;
  topicHash?: string;
  peerId?: string;
  anonKey?: string;
  edgeFunctionBridgeUrl?: string;
  keepAliveSeconds?: number;
}

export function normalizeSupabaseRealtimeWsUrl(rawUrl: string, anonKey = ''): string {
  let clean = String(rawUrl || '').trim();
  if (!clean) return '';

  if (clean.startsWith('https://')) {
    clean = `wss://${clean.slice('https://'.length)}`;
  } else if (clean.startsWith('http://')) {
    clean = `ws://${clean.slice('http://'.length)}`;
  }

  const [basePart, queryPart] = clean.split('?');
  let normalizedBase = basePart.replace(/\/+$/, '');
  if (!normalizedBase.endsWith('/realtime/v1/websocket')) {
    normalizedBase = `${normalizedBase}/realtime/v1/websocket`;
  }

  const params = new URLSearchParams(queryPart || '');
  if (anonKey && !params.has('apikey')) {
    params.set('apikey', anonKey);
  }
  if (!params.has('vsn')) {
    params.set('vsn', '1.0.0');
  }

  return `${normalizedBase}?${params.toString()}`;
}

export function deriveDefaultEdgeFunctionBridgeUrl(rawUrl: string): string {
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';
  try {
    const asHttp = clean.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
    const parsed = new URL(asHttp);
    return `${parsed.origin}/functions/v1/signaling-bridge`;
  } catch {
    return '';
  }
}

export class SupabaseRealtimeSignalingClient {
  endpointUrl: string;
  wsUrl: string;
  relayId: string;
  relayLabel: string;
  channelTopic: string;
  phoenixTopic: string;
  bridgeTopic: string;
  topicHash: string;
  peerId: string;
  anonKey: string;
  edgeFunctionBridgeUrl: string;
  keepAliveSeconds: number;

  ws: WebSocket | null = null;
  isConnected = false;
  isSubscribed = false;
  isLoopbackVerified = false;
  loopbackRttMs = 0;

  private _refCounter = 1;
  private _joinRef = '1';
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _probeId = `sb_probe_${Math.random().toString(36).slice(2, 10)}`;
  private _probeSentAt = 0;
  private eventListeners = new Map<
    string,
    Array<(payload?: Record<string, unknown> | Error | CloseEvent) => void>
  >();

  constructor(endpointUrl: string, options: SupabaseRealtimeSignalingClientOptions = {}) {
    this.endpointUrl = String(endpointUrl || '').trim();
    this.anonKey = String(options.anonKey || '').trim();
    this.wsUrl = normalizeSupabaseRealtimeWsUrl(this.endpointUrl, this.anonKey);
    this.relayId = options.relayId || 'supabase_jp';
    this.relayLabel = options.relayLabel || 'Supabase Realtime';
    this.topicHash = options.topicHash || 'default_room';
    this.channelTopic = options.channelTopic || `rc/sig:dir:${this.topicHash}`;
    this.phoenixTopic = this.channelTopic.startsWith('realtime:')
      ? this.channelTopic
      : `realtime:${this.channelTopic}`;
    this.bridgeTopic = options.bridgeTopic || `rc/sig/brg/${this.topicHash}`;
    this.peerId = options.peerId || `peer_${Math.random().toString(36).slice(2, 8)}`;
    this.edgeFunctionBridgeUrl =
      options.edgeFunctionBridgeUrl || deriveDefaultEdgeFunctionBridgeUrl(this.endpointUrl);
    this.keepAliveSeconds = options.keepAliveSeconds || 25;
  }

  private _nextRef(): string {
    this._refCounter = (this._refCounter % 900000) + 1;
    return String(this._refCounter);
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
    if (!this.wsUrl) {
      throw new Error('Supabase Realtime WebSocket URL is empty');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let loopbackFallbackHandle: ReturnType<typeof setTimeout> | null = null;
      const connectStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (loopbackFallbackHandle) clearTimeout(loopbackFallbackHandle);
        if (!this.loopbackRttMs) {
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this.loopbackRttMs = Math.max(1, Math.round(now - connectStartedAt));
        }
        this.emit('open', {
          relayId: this.relayId,
          loopbackVerified: this.isLoopbackVerified,
          rttMs: this.loopbackRttMs,
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
            new Error(
              `Supabase Realtime connection timed out after ${timeoutMs}ms (${this.relayLabel})`
            )
          );
        }, timeoutMs);
      }

      let sock: WebSocket;
      try {
        sock = new WebSocketConstructor(this.wsUrl);
        this.ws = sock;
      } catch (err) {
        return finishFailure(err);
      }

      sock.onopen = () => {
        try {
          this.isConnected = true;
          this._startHeartbeat();
          this._joinRef = this._nextRef();
          const joinFrame = {
            topic: this.phoenixTopic,
            event: 'phx_join',
            payload: {
              config: {
                broadcast: { ack: true, self: true },
                presence: { key: '' },
                private: false,
              },
              ...(this.anonKey ? { access_token: this.anonKey } : {}),
            },
            ref: this._joinRef,
            join_ref: this._joinRef,
          };
          sock.send(JSON.stringify(joinFrame));
        } catch (err) {
          finishFailure(err);
        }
      };

      sock.onmessage = (ev) => {
        try {
          const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
          if (!msg || typeof msg !== 'object') return;

          if (
            msg.topic === this.phoenixTopic &&
            msg.event === 'phx_reply' &&
            msg.ref === this._joinRef
          ) {
            if (msg.payload?.status === 'ok') {
              this.isSubscribed = true;
              this._sendLoopbackSelfProbe();
              loopbackFallbackHandle = setTimeout(() => {
                finishSuccess();
              }, 300);
            } else {
              finishFailure(
                new Error(
                  `Supabase Realtime channel join rejected: ${JSON.stringify(msg.payload?.response || msg.payload)}`
                )
              );
            }
            return;
          }

          if (msg.topic === this.phoenixTopic && msg.event === 'broadcast') {
            const inner = msg.payload?.payload ?? msg.payload;
            if (!inner || typeof inner !== 'object') return;

            if (inner.type === 'relay_loopback_probe') {
              if (inner.probeId === this._probeId && inner.fromPeerId === this.peerId) {
                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                this.isLoopbackVerified = true;
                this.loopbackRttMs = Math.max(1, Math.round(now - this._probeSentAt));
                this.emit('loopback_verified', {
                  relayId: this.relayId,
                  rttMs: this.loopbackRttMs,
                });
                finishSuccess();
              }
              return;
            }

            this.emit('message', inner);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      sock.onerror = () => {
        if (!settled) {
          finishFailure(new Error(`Supabase Realtime WebSocket error (${this.relayLabel})`));
        } else {
          this.emit('error', new Error(`Supabase Realtime socket error (${this.relayLabel})`));
        }
      };

      sock.onclose = (ev) => {
        this.isConnected = false;
        this.isSubscribed = false;
        this._stopHeartbeat();
        if (!settled) {
          finishFailure(new Error(`Supabase Realtime closed before ready (code ${ev.code})`));
        } else {
          this.emit('close', ev);
        }
      };
    });
  }

  private _sendLoopbackSelfProbe(): void {
    this._probeSentAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.send({
      type: 'relay_loopback_probe',
      probeId: this._probeId,
      fromPeerId: this.peerId,
      relayId: this.relayId,
      timestamp: Date.now(),
    });
  }

  send(data: Record<string, unknown> | string, _qos = 0): boolean {
    if (!this.ws || this.ws.readyState !== 1 || !this.isConnected || !this.isSubscribed) {
      return false;
    }
    try {
      const payloadObj = typeof data === 'string' ? JSON.parse(data) : data;
      const frame = {
        topic: this.phoenixTopic,
        event: 'broadcast',
        payload: {
          type: 'broadcast',
          event: 'signal',
          payload: payloadObj,
        },
        ref: this._nextRef(),
        join_ref: this._joinRef,
      };
      this.ws.send(JSON.stringify(frame));
      return true;
    } catch (err) {
      console.warn(
        `[SupabaseRealtimeSignalingClient] Failed to broadcast on ${this.relayLabel}:`,
        err
      );
      return false;
    }
  }

  async sendBridge(
    data: Record<string, unknown> | string,
    customBridgeTopic?: string,
    customEdgeFunctionUrl?: string
  ): Promise<{
    ok: boolean;
    latencyMs: number;
    response?: Record<string, unknown>;
    error?: string;
  }> {
    const bridgeUrl = (customEdgeFunctionUrl || this.edgeFunctionBridgeUrl || '').trim();
    if (!bridgeUrl) {
      return { ok: false, latencyMs: 0, error: 'No Edge Function bridge URL configured' };
    }
    const targetBridgeTopic = customBridgeTopic || this.bridgeTopic;
    const payloadObj = typeof data === 'string' ? JSON.parse(data) : data;
    const startAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-rc-source-relay': this.relayId,
      };
      if (this.anonKey) {
        headers.apikey = this.anonKey;
        headers.Authorization = `Bearer ${this.anonKey}`;
      }

      const resp = await fetch(bridgeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic: targetBridgeTopic,
          comingFrom: this.relayId,
          payload: {
            ...payloadObj,
            _brgHop: 0,
            _brgFrom: this.relayId,
          },
        }),
      });
      const latencyMs = Math.max(
        1,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startAt)
      );
      const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || json.ok === false) {
        return {
          ok: false,
          latencyMs,
          response: json,
          error: json.error || `HTTP ${resp.status}`,
        };
      }
      return { ok: true, latencyMs, response: json };
    } catch (err: unknown) {
      const latencyMs = Math.max(
        1,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startAt)
      );
      return { ok: false, latencyMs, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    const intervalMs = Math.max(10000, this.keepAliveSeconds * 1000);
    this._heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === 1) {
        try {
          this.ws.send(
            JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: this._nextRef(),
            })
          );
        } catch {
          // Ignore heartbeat send error
        }
      }
    }, intervalMs);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
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
        console.error('[SupabaseRealtimeSignalingClient] Listener error:', err);
      }
    }
  }

  close(): void {
    this._stopHeartbeat();
    if (this.ws) {
      try {
        if (this.ws.readyState === 1 && this.isSubscribed) {
          this.ws.send(
            JSON.stringify({
              topic: this.phoenixTopic,
              event: 'phx_leave',
              payload: {},
              ref: this._nextRef(),
            })
          );
        }
        this.ws.close(1000, 'Client closed');
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.isSubscribed = false;
  }
}
