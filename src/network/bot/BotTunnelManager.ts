/**
 * BotTunnelManager.ts
 * Manages isolated virtual loopback tunnels between BotInferenceWorker and HostServerWorker.
 *
 * Each auto-filled bot slot (`bot_fill_1`, `bot_fill_2`, ..., or `bot`) is registered
 * as an independent virtual channel on the authoritative server and feeds standard
 * binary `InputPacketCodec` frames into `NetworkDataHandler` / `EstablishedSessionManager`.
 */

import {
  stepBotInferenceBatch,
  type BotSessionStepSpec,
  type BotTunnelEncodedPacket,
} from './BotInferenceWorker.ts';
import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';

export interface BotTunnelManagerOptions {
  forceInProcess?: boolean;
}

export interface RegisteredBotTunnelInfo {
  sessionId: string;
  carIndex: number;
  team: 0 | 1;
  botType: string;
}

let prewarmedBotWorker: Worker | null = null;
let prewarmBotWorkerPromise: Promise<boolean> | null = null;

/**
 * Pre-spawns an idle BotInferenceWorker and warms its TypeScript module graph,
 * SIMD WASM accelerator, and Nexto SafeTensors weights in the background right after
 * Free Play starts, eliminating on-demand worker module fetches when hosting a server.
 */
export function prewarmBotInferenceWorker(): Promise<boolean> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(false);
  }
  if (prewarmedBotWorker) {
    return Promise.resolve(true);
  }
  if (prewarmBotWorkerPromise) {
    return prewarmBotWorkerPromise;
  }

  prewarmBotWorkerPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean, worker: Worker | null) => {
      if (settled) return;
      settled = true;
      prewarmBotWorkerPromise = null;
      if (ok && worker) {
        prewarmedBotWorker = worker;
      } else {
        try {
          worker?.terminate();
        } catch (_e) {}
      }
      resolve(ok);
    };

    try {
      const worker = new Worker(new URL('./BotInferenceWorker.ts', import.meta.url), {
        type: 'module',
      });
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMsg);
        finish(false, worker);
      }, 15000);

      const onMsg = (ev: MessageEvent) => {
        if (ev?.data?.type === 'prewarmed') {
          clearTimeout(timer);
          worker.removeEventListener('message', onMsg);
          finish(true, worker);
        }
      };

      worker.addEventListener('message', onMsg);
      worker.onerror = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMsg);
        finish(false, worker);
      };

      worker.postMessage({ type: 'prewarm', botType: 'nexto' });
    } catch (_err) {
      finish(false, null);
    }
  });

  return prewarmBotWorkerPromise;
}

export class BotTunnelManager {
  hostServer: any;
  options: BotTunnelManagerOptions;
  worker: Worker | null = null;
  isWorker: boolean;
  registeredTunnels = new Map<string, RegisteredBotTunnelInfo>();
  lastSteppedServerTick = -1;
  lastSteppedMatchState = '';
  inferenceInFlight = false;
  inferenceStartedAtMs = 0;
  cachedPads: any[] | null = null;
  _padsSentToWorker = false;
  hasDirectPort = false;

  constructor(hostServer: any, options: BotTunnelManagerOptions = {}) {
    this.hostServer = hostServer;
    this.options = options;
    this.isWorker =
      typeof Worker !== 'undefined' && !options.forceInProcess && Boolean(hostServer?.isWorker);
  }

  init(): void {
    if (this.isWorker && !this.worker) {
      try {
        if (prewarmedBotWorker) {
          this.worker = prewarmedBotWorker;
          prewarmedBotWorker = null;
        } else {
          this.worker = new Worker(new URL('./BotInferenceWorker.ts', import.meta.url), {
            type: 'module',
          });
        }
        this.worker.onmessage = (ev) => this._handleWorkerMessage(ev.data);
        this.worker.onerror = (err) => {
          if (typeof err?.preventDefault === 'function') err.preventDefault();
          console.warn(
            '[BotTunnelManager] BotInferenceWorker error, falling back to async in-process tunnel:',
            err
          );
          try {
            this.worker?.terminate?.();
          } catch (_e) {
            // Ignore termination error
          }
          this.worker = null;
          this.isWorker = false;
          this.inferenceInFlight = false;
          this.hasDirectPort = false;
          this.hostServer?._postCommand?.('detach_bot_port', {});
          ensureExperimentalEngine('nexto');
        };
        this.worker.postMessage({ type: 'init', botType: 'nexto', pads: this.cachedPads });
        if (Array.isArray(this.cachedPads) && this.cachedPads.length > 0) {
          this._padsSentToWorker = true;
        }
        this._connectDirectPortIfAvailable();
      } catch (err) {
        console.warn(
          '[BotTunnelManager] Failed to spawn BotInferenceWorker, using in-process tunnel:',
          err
        );
        this.worker = null;
        this.isWorker = false;
        this.inferenceInFlight = false;
        this.hasDirectPort = false;
        ensureExperimentalEngine('nexto');
      }
    } else {
      ensureExperimentalEngine('nexto');
    }
  }

  _connectDirectPortIfAvailable(): boolean {
    if (
      this.hasDirectPort ||
      !this.isWorker ||
      !this.worker ||
      !this.hostServer?.isWorker ||
      !this.hostServer?.worker ||
      typeof MessageChannel === 'undefined'
    ) {
      return false;
    }
    try {
      const { port1, port2 } = new MessageChannel();
      this.worker.postMessage({ type: 'attach_port', port: port1 }, [port1]);
      this.hostServer._postCommand('attach_bot_port', { port: port2 }, [port2]);
      this.hasDirectPort = true;
      return true;
    } catch (err) {
      console.warn(
        '[BotTunnelManager] Failed to attach direct MessageChannel port, using main-thread relay:',
        err
      );
      this.hasDirectPort = false;
      return false;
    }
  }

  _handleWorkerMessage(data: any): void {
    if (!data) return;
    if (data.type === 'bot_tunnel_packets') {
      this.inferenceInFlight = false;
      this._deliverBotTunnelPackets(data.packets || []);
    }
  }

  _deliverBotTunnelPackets(packets: BotTunnelEncodedPacket[] = []): void {
    if (!this.hostServer || !Array.isArray(packets)) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let i = 0; i < packets.length; i++) {
      const item = packets[i];
      if (!item || !item.sessionId || !item.packetBytes) continue;
      if (this.hostServer.isWorker && this.hostServer.worker) {
        this.hostServer._postCommand('channel_packet', {
          channelId: item.sessionId,
          packet: item.packetBytes,
          timestamp: now,
        });
      } else if (this.hostServer.fallbackDataHandler) {
        this.hostServer.fallbackDataHandler.handleIncomingPacket(
          item.sessionId,
          item.packetBytes,
          now
        );
      }
    }
  }

  syncFromRoomState(roomState: any): void {
    if (Array.isArray(roomState?.pads) && roomState.pads.length > 0) {
      this.cachedPads = roomState.pads;
      if (this.isWorker && this.worker && !this._padsSentToWorker) {
        this.worker.postMessage({ type: 'set_pads', pads: this.cachedPads });
        this._padsSentToWorker = true;
      }
    }

    const players = roomState?.roster?.players || roomState?.players || [];
    const activeBotMap = new Map<string, RegisteredBotTunnelInfo>();

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const sid = p?.sessionId;
      const isBot = Boolean(p?.isBot || sid === 'bot' || String(sid || '').startsWith('bot_'));
      if (!isBot || !sid) continue;
      const carIndex = p.carIndex ?? p.entityId ?? -1;
      if (carIndex < 0 || carIndex >= 8) continue;
      const botType = p.botType || 'nexto';
      if (!this.isWorker && botType !== 'heuristic') {
        void ensureExperimentalEngine(botType);
      }
      activeBotMap.set(sid, {
        sessionId: sid,
        carIndex,
        team: p.team === 1 ? 1 : 0,
        botType,
      });
    }

    for (const [sid, info] of activeBotMap.entries()) {
      if (!this.registeredTunnels.has(sid)) {
        this.registeredTunnels.set(sid, info);
        if (this.hostServer?.isWorker && this.hostServer?.worker) {
          this.hostServer._postCommand('registerChannel', { channelId: sid });
        } else if (this.hostServer?.fallbackDataHandler) {
          this.hostServer.fallbackDataHandler.registerChannel(sid, { send: () => {} });
        }
      } else {
        this.registeredTunnels.set(sid, info);
      }
    }

    for (const sid of Array.from(this.registeredTunnels.keys())) {
      if (!activeBotMap.has(sid)) {
        this.registeredTunnels.delete(sid);
      }
    }
  }

  onServerPhysicsFrame(
    stateSnapshot: Float32Array,
    serverTick: number,
    matchState = 'playing'
  ): void {
    if (this.hasDirectPort) return;
    if (!stateSnapshot || this.registeredTunnels.size === 0) return;
    if (serverTick === this.lastSteppedServerTick && matchState === this.lastSteppedMatchState)
      return;
    this.lastSteppedServerTick = serverTick;
    this.lastSteppedMatchState = matchState;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const bots: BotSessionStepSpec[] = Array.from(this.registeredTunnels.values());
    const rosterPlayers = this.hostServer?.lastRoomState?.roster?.players || [];
    const activeCars: Array<{ carIndex: number; team: 0 | 1 }> = [];
    for (let i = 0; i < rosterPlayers.length; i++) {
      const p = rosterPlayers[i];
      const cIdx = p?.carIndex ?? p?.entityId ?? -1;
      if (cIdx >= 0 && cIdx < 8) {
        activeCars.push({
          carIndex: cIdx,
          team: p.team === 1 ? 1 : 0,
        });
      }
    }
    if (activeCars.length === 0) {
      for (let i = 0; i < bots.length; i++) {
        activeCars.push({ carIndex: bots[i].carIndex!, team: bots[i].team === 1 ? 1 : 0 });
      }
    }

    const payload = {
      stateSnapshot: new Float32Array(stateSnapshot),
      serverTick,
      matchState,
      bots,
      activeCars,
      pads: this._padsSentToWorker ? null : this.cachedPads,
      redundantTicks: 10,
      nowMs,
    };

    if (this.isWorker && this.worker) {
      if (this.inferenceInFlight && nowMs - this.inferenceStartedAtMs < 250) {
        return;
      }
      this.inferenceInFlight = true;
      this.inferenceStartedAtMs = nowMs;
      if (payload.pads) {
        this._padsSentToWorker = true;
      }
      this.worker.postMessage({ type: 'step_bots', ...payload }, [payload.stateSnapshot.buffer]);
    } else {
      const packets = stepBotInferenceBatch(payload);
      this._deliverBotTunnelPackets(packets);
    }
  }

  destroy(): void {
    this.registeredTunnels.clear();
    this.inferenceInFlight = false;
    this._padsSentToWorker = false;
    this.hasDirectPort = false;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (_e) {
        // Ignore terminate error
      }
      this.worker = null;
    }
  }
}

export default BotTunnelManager;
