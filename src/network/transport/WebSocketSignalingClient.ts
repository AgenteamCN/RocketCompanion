/**
 * WebSocketSignalingClient.ts
 * Client-Side Signaling Adapter for Cloudflare WebSocket Worker.
 */

import { getSignalingRoomPrefix } from './signalingRelayConfig.ts';
import {
  testSignalingConnectivity,
  type SignalingProbeResult,
} from './diagnostics/signalingDiagnosticsProbe.ts';

export interface WebSocketSignalingClientOptions {
  relayId?: string;
  relayLabel?: string;
  roomId?: string;
  workerRoomKey?: string | null;
  role?: string;
  peerId?: string;
  password?: string;
  authToken?: string;
  playerName?: string;
  gameMode?: string;
}

export class WebSocketSignalingClient {
  workerUrl: string;
  relayId: string;
  relayLabel: string;
  roomId: string | undefined;
  workerRoomKey: string | null;
  role: string;
  peerId: string;
  password: string;
  authToken: string;
  playerName: string;
  gameMode: string;
  ws: WebSocket | null = null;
  isConnected = false;
  eventListeners = new Map<
    string,
    Array<(data?: Record<string, unknown> | Error | Event | CloseEvent) => void>
  >();
  _heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(workerUrl: string, options: WebSocketSignalingClientOptions = {}) {
    this.workerUrl = (workerUrl || '').trim();
    this.relayId = options.relayId || 'cloudflare_worker';
    this.relayLabel = options.relayLabel || 'Cloudflare Worker';
    this.roomId = options.roomId;
    this.workerRoomKey = options.workerRoomKey || null;
    this.role = options.role || 'client';
    this.peerId = options.peerId || `peer_${Math.random().toString(36).slice(2, 8)}`;
    this.password = options.password || '';
    this.authToken = options.authToken || '';
    this.playerName =
      options.playerName && options.playerName !== 'Host'
        ? options.playerName
        : `Player${Math.floor(1000 + Math.random() * 9000)}`;
    this.gameMode = options.gameMode || '3v3';
  }

  get connectUrl(): string {
    let base = this.workerUrl;
    if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
      base = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
      if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
        base = 'wss://' + base;
      }
    }
    const url = new URL(base);
    const effectiveRoom = this.workerRoomKey || (this.roomId || '').trim();
    const roomPrefix = getSignalingRoomPrefix();
    const fullRoomId =
      roomPrefix && !effectiveRoom.startsWith(roomPrefix)
        ? `${roomPrefix}${effectiveRoom}`
        : effectiveRoom;

    url.searchParams.set('room', fullRoomId);
    url.searchParams.set('roomId', fullRoomId);
    url.searchParams.set('password', '');
    if (this.authToken && !url.searchParams.has('key')) {
      url.searchParams.set('key', this.authToken);
    }
    url.searchParams.set('peerId', this.peerId);
    url.searchParams.set('isHost', String(this.role === 'host'));
    url.searchParams.set('role', this.role);
    url.searchParams.set('name', this.playerName);
    url.searchParams.set('gameMode', this.gameMode);
    return url.toString();
  }

  async connect(timeoutMs = 5000): Promise<void> {
    if (
      this.isConnected &&
      this.ws &&
      this.ws.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1)
    ) {
      return;
    }

    const WebSocketConstructor: typeof WebSocket | null =
      typeof WebSocket !== 'undefined'
        ? WebSocket
        : (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket || null;

    if (!WebSocketConstructor) {
      throw new Error('WebSocket is not supported in this environment');
    }

    const wsUrl = this.connectUrl;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const attempts: WebSocket[] = [];
      let backupTimer: ReturnType<typeof setTimeout> | null = null;
      let globalTimer: ReturnType<typeof setTimeout> | null = null;

      const safeCloseConnecting = (sock: WebSocket) => {
        try {
          if (sock.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.CONNECTING : 0)) {
            sock.onopen = () => {
              try {
                sock.close(1000, 'Superseded');
              } catch (_) {
                // Ignore close error
              }
            };
            sock.onerror = null;
            sock.onclose = null;
            sock.onmessage = null;
          } else if (sock.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1)) {
            sock.close(1000, 'Superseded');
          }
        } catch (_) {
          // Ignore close error
        }
      };

      const cleanupExcept = (winner: WebSocket | null = null) => {
        if (backupTimer) {
          clearTimeout(backupTimer);
          backupTimer = null;
        }
        if (globalTimer) {
          clearTimeout(globalTimer);
          globalTimer = null;
        }
        for (const sock of attempts) {
          if (sock !== winner) {
            safeCloseConnecting(sock);
          }
        }
        attempts.length = 0;
      };

      const settleSuccess = (winnerWs: WebSocket) => {
        if (isSettled) return;
        isSettled = true;
        cleanupExcept(winnerWs);
        this.ws = winnerWs;
        this.isConnected = true;
        this._bindSocketEvents(winnerWs);
        this._startHeartbeat();
        this.emit('open', { relayId: this.relayId });
        resolve();
      };

      const settleFailure = (err: unknown) => {
        if (isSettled) return;
        isSettled = true;
        cleanupExcept(null);
        this.isConnected = false;
        const errorObj = err instanceof Error ? err : new Error(String(err));
        this.emit('error', errorObj);
        reject(errorObj);
      };

      if (timeoutMs > 0) {
        globalTimer = setTimeout(() => {
          settleFailure(new Error(`WebSocket connect timed out after ${timeoutMs}ms: ${wsUrl}`));
        }, timeoutMs);
      }

      let attemptCount = 0;
      const launchAttempt = () => {
        if (isSettled || attemptCount >= 2) return;
        attemptCount++;

        let sock: WebSocket;
        try {
          sock = new WebSocketConstructor(wsUrl);
          attempts.push(sock);
        } catch (e) {
          if (attemptCount >= 2) settleFailure(e);
          return;
        }

        sock.onopen = () => {
          settleSuccess(sock);
        };

        sock.onerror = (err) => {
          if (isSettled) return;
          if (attemptCount < 2) {
            launchAttempt();
          } else if (attempts.every((s) => s.readyState >= 2)) {
            settleFailure(err instanceof Error ? err : new Error('WebSocket connection error'));
          }
        };

        sock.onclose = (ev) => {
          if (isSettled) return;
          if (attemptCount < 2) {
            launchAttempt();
          } else if (attempts.every((s) => s.readyState >= 2)) {
            settleFailure(new Error(`WebSocket closed before open (code: ${ev.code})`));
          }
        };
      };

      launchAttempt();
      backupTimer = setTimeout(() => {
        if (!isSettled && attemptCount < 2) {
          launchAttempt();
        }
      }, 2200);
    });
  }

  _bindSocketEvents(ws: WebSocket): void {
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        this.handleMessage(data);
      } catch (err) {
        console.error('[WebSocketSignalingClient] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      this.emit('error', err);
    };

    ws.onclose = (ev) => {
      this.isConnected = false;
      this._stopHeartbeat();
      this.emit('close', ev);
    };
  }

  _startHeartbeat(): void {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (
        this.isConnected &&
        this.ws &&
        this.ws.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1)
      ) {
        try {
          this.ws.send(
            JSON.stringify({ type: 'ping', peerId: this.peerId, timestamp: Date.now() })
          );
        } catch (_) {
          // Ignore ping error
        }
      }
    }, 12000);
  }

  _stopHeartbeat(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  handleMessage(msg: Record<string, unknown> & { type?: string }): void {
    if (!msg) return;
    if (msg.type === 'ping') {
      this.send({ type: 'pong', peerId: this.peerId, timestamp: Date.now() });
      return;
    }
    this.emit('message', msg);
    if (msg.type) {
      this.emit(msg.type, msg);
    }
  }

  sendOffer(targetPeerId: string | null, sdpOffer: string): boolean {
    return this.send({
      type: 'offer',
      targetPeerId,
      fromPeerId: this.peerId,
      senderName: this.playerName,
      sdp: sdpOffer,
    });
  }

  sendAnswer(sdpAnswer: string, targetPeerId: string | null = null): boolean {
    return this.send({
      type: 'answer',
      targetPeerId,
      fromPeerId: this.peerId,
      senderName: this.playerName,
      sdp: sdpAnswer,
    });
  }

  sendCandidate(
    targetPeerId: string | null,
    candidate: RTCIceCandidateInit | Record<string, unknown>
  ): boolean {
    return this.send({
      type: 'candidate',
      targetPeerId,
      fromPeerId: this.peerId,
      senderName: this.playerName,
      candidate,
    });
  }

  send(data: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1)) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  on(event: string, cb: (data?: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(cb);
  }

  off(event: string, cb: (data?: any) => void): void {
    const list = this.eventListeners.get(event);
    if (!list) return;
    this.eventListeners.set(
      event,
      list.filter((fn) => fn !== cb)
    );
  }

  emit(event: string, data?: Record<string, unknown> | Error | Event | CloseEvent): void {
    const list = this.eventListeners.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (err) {
        console.error('[WebSocketSignalingClient] Listener error:', err);
      }
    }
  }

  close(): void {
    this._stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {
        // Ignore close error
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  static async testConnectivity(
    endpointUrl?: string | null,
    timeoutMs = 5000
  ): Promise<SignalingProbeResult> {
    return testSignalingConnectivity(endpointUrl, timeoutMs);
  }
}
