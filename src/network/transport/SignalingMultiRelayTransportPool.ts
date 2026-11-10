/** Multi-relay signaling transport pool with staggered launch and match convergence. */

import { MqttWebSocketClient } from './MqttWebSocketClient.ts';
import { SupabaseRealtimeSignalingClient } from './SupabaseRealtimeSignalingClient.ts';
import { getSignalingRelays, type SignalingRelaySpec } from './signalingRelayConfig.ts';
import {
  computeConnectivityMaskFromRelayIds,
  getSlotBitForRelayId,
} from '../../ui-core/config/roomCodeConnectivityCodec.ts';
import {
  createSignalingRelayTransport,
  resolveCoHostedEdgeBridgeUrlForRelay,
  type RelayTransportClient,
} from './signalingRelaySlotRegistry.ts';
import type { DeterministicRoomContext } from './SignalingCryptoSession.ts';
import {
  SignalingRelayHealthSupervisor,
  getSignalingRelayMatchPolicy,
  type SignalingPoolHealthSnapshot,
  type SignalingRelayMatchPolicy,
} from './SignalingRelayLifecyclePolicy.ts';

export type { RelayTransportClient, SignalingPoolHealthSnapshot, SignalingRelayMatchPolicy };

export interface SignalingRelayLaunchHooks {
  role: string;
  peerId: string;
  roomId: string;
  playerName: string;
  roomContext: DeterministicRoomContext;
  allowedMask?: number;
  isSkipLaunch?: () => boolean;
  handleFirstRelayOpen: (info: { relayId: string; relayLabel: string; topicHash: string }) => void;
  handleRelayConnected?: (relayId: string) => void;
  handleRelayHealthChanged?: (snapshot: SignalingPoolHealthSnapshot) => void;
  handleFrameReceived: (relayId: string, frame: Record<string, unknown>) => void;
  handleAllRelaysClosed: (lastClosedRelayId: string) => void;
  handleAllRelaysFailed: (finalError: Error) => void;
}

export class SignalingMultiRelayTransportPool {
  transports = new Map<string, RelayTransportClient>();
  relayConfigs = new Map<string, SignalingRelaySpec>();
  activeRelayId: string | null = null;
  readonly healthSupervisor = new SignalingRelayHealthSupervisor();

  private pausedMatchRelays = new Set<string>();
  private lastHooks: SignalingRelayLaunchHooks | null = null;
  private staggerTimers: Array<ReturnType<typeof setTimeout>> = [];
  private isCleanedUp = false;

  getRelayLabel(relayId: string | null | undefined): string | null {
    const id = relayId || this.activeRelayId || this.getConnectedRelayIds()[0];
    const cfg = id ? this.relayConfigs.get(id) : undefined;
    return cfg ? cfg.label : relayId || null;
  }

  getConnectedRelayIds(): string[] {
    const ids: string[] = [];
    for (const [id, t] of this.transports) if (t.isConnected) ids.push(id);
    return ids;
  }

  getConnectedConnectivityMask(): number {
    return computeConnectivityMaskFromRelayIds(this.getConnectedRelayIds());
  }

  getHealthSnapshot(): SignalingPoolHealthSnapshot {
    return this.healthSupervisor.getSnapshot(this.getConnectedConnectivityMask());
  }

  private emitHealthSnapshot(): void {
    if (this.lastHooks && this.lastHooks.handleRelayHealthChanged) {
      this.lastHooks.handleRelayHealthChanged(this.getHealthSnapshot());
    }
  }

  getBestRelayIdForBridge(preferredRelayId: string | null = null): string | null {
    const pref = preferredRelayId ? this.transports.get(preferredRelayId) : undefined;
    if (pref && pref.isConnected) return preferredRelayId;
    let bestId: string | null = null;
    let bestRtt = Number.POSITIVE_INFINITY;
    for (const [id, transport] of this.transports) {
      if (!transport.isConnected) continue;
      const rawRtt = (transport as MqttWebSocketClient).loopbackRttMs;
      const rtt = typeof rawRtt === 'number' && rawRtt > 0 ? rawRtt : 500;
      if (rtt < bestRtt) {
        bestRtt = rtt;
        bestId = id;
      }
    }
    return bestId || this.activeRelayId;
  }

  sendOnRelay(relayId: string, payload: Record<string, unknown>, qos = 0): boolean {
    const t = this.transports.get(relayId);
    return Boolean(t && t.isConnected && (t as MqttWebSocketClient).send(payload, qos));
  }

  async sendBridgeOnRelay(relayId: string, payload: Record<string, unknown>): Promise<boolean> {
    const targetId = this.getBestRelayIdForBridge(relayId);
    const transport = targetId ? this.transports.get(targetId) : undefined;
    if (!targetId || !transport || !transport.isConnected) return false;

    const frame = {
      ...payload,
      _brgMsgId:
        payload._brgMsgId || `${targetId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    if (transport instanceof SupabaseRealtimeSignalingClient) {
      return (await transport.sendBridge(frame)).ok;
    }
    if (transport instanceof MqttWebSocketClient) {
      const cfg = this.relayConfigs.get(targetId);
      const url = resolveCoHostedEdgeBridgeUrlForRelay(
        targetId,
        cfg ? cfg.edgeFunctionBridgeUrl : undefined
      );
      if (url) await fetch(`${url}?action=logs`, { method: 'GET' }).catch(() => {});
      return transport.sendBridge(frame, undefined, 1);
    }
    return false;
  }

  sendRoutedFrame(
    wrapper: Record<string, unknown>,
    preferredRelayId: string | null = null,
    qos = 1
  ): boolean {
    const routeId = preferredRelayId || this.activeRelayId;
    if (routeId && this.sendOnRelay(routeId, wrapper, qos)) return true;
    let sentAny = false;
    for (const id of this.transports.keys()) {
      if (this.sendOnRelay(id, wrapper, qos)) sentAny = true;
    }
    return sentAny;
  }

  private closeAndDelete(id: string, transport: RelayTransportClient): void {
    try {
      transport.close();
    } catch {
      // ignore
    }
    this.transports.delete(id);
  }

  closeRedundantRelays(winningRelayId: string): void {
    this.activeRelayId = winningRelayId;
    for (const [id, transport] of this.transports) {
      if (id !== winningRelayId) {
        this.healthSupervisor.markPausedInMatch(id);
        this.closeAndDelete(id, transport);
      }
    }
    this.emitHealthSnapshot();
  }

  applyMatchPhaseRelayConvergence(
    activePlayerRelayIds: Set<string>,
    policy: SignalingRelayMatchPolicy = getSignalingRelayMatchPolicy()
  ): void {
    if (this.isCleanedUp || !this.lastHooks || this.lastHooks.role !== 'host') return;
    const keepIds = this.healthSupervisor.resolveMatchPhaseRelaysToKeep(
      Array.from(this.relayConfigs.keys()),
      activePlayerRelayIds,
      policy
    );
    for (const [id, transport] of this.transports) {
      if (!keepIds.has(id)) {
        this.pausedMatchRelays.add(id);
        this.healthSupervisor.markPausedInMatch(id);
        this.closeAndDelete(id, transport);
      }
    }
    this.emitHealthSnapshot();
  }

  restoreLobbyRelays(): void {
    if (this.isCleanedUp || !this.lastHooks) return;
    for (const id of Array.from(this.pausedMatchRelays)) {
      this.pausedMatchRelays.delete(id);
      const relay = this.relayConfigs.get(id);
      if (relay) this.launchSingleRelay(relay, this.lastHooks, 4500);
    }
    this.emitHealthSnapshot();
  }

  private resolveTargetRelays(hooks: SignalingRelayLaunchHooks): SignalingRelaySpec[] {
    const allRelays = getSignalingRelays();
    if (allRelays.length === 0) {
      const err = new Error('No signaling profile loaded. Import a .rctbnspib bundle in Settings.');
      hooks.handleAllRelaysFailed(err);
      throw err;
    }
    const mask =
      hooks.role === 'host' && hooks.allowedMask && (hooks.allowedMask & 0x0f) !== 0
        ? hooks.allowedMask & 0x0f
        : 0x0f;
    this.healthSupervisor.setProbedMask(mask);
    const filtered = allRelays.filter((r) => {
      const bit = hooks.role === 'host' ? getSlotBitForRelayId(r.id) : 0;
      return bit === 0 || (mask & bit) !== 0;
    });
    const relays = filtered.length > 0 ? filtered : allRelays;
    for (const r of relays) {
      this.relayConfigs.set(r.id, r);
      this.healthSupervisor.registerRelay(r.id, r.label);
    }
    return relays;
  }

  async connectStaggered(timeoutMs: number, hooks: SignalingRelayLaunchHooks): Promise<void> {
    this.cleanup();
    this.isCleanedUp = false;
    this.lastHooks = hooks;
    const relays = this.resolveTargetRelays(hooks);

    return new Promise((resolve, reject) => {
      let anyConnected = false;
      let failedCount = 0;
      const failAll = (err: Error) => {
        if (globalTimer) clearTimeout(globalTimer);
        hooks.handleAllRelaysFailed(err);
        reject(err);
      };
      const globalTimer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (!anyConnected && !this.isCleanedUp) {
                failAll(new Error(`Signaling connection timed out after ${timeoutMs}ms`));
              }
            }, timeoutMs)
          : null;

      for (const relay of relays) {
        const delay = Math.max(0, relay.staggerDelayMs || 0);
        const launch = () => {
          if (this.isCleanedUp || (hooks.isSkipLaunch && hooks.isSkipLaunch())) return;
          this.launchSingleRelay(
            relay,
            hooks,
            Math.min(timeoutMs || 5000, relay.connectTimeoutMs || 4500),
            () => {
              if (anyConnected || this.isCleanedUp) return;
              anyConnected = true;
              if (globalTimer) clearTimeout(globalTimer);
              if (!this.activeRelayId) this.activeRelayId = relay.id;
              hooks.handleFirstRelayOpen({
                relayId: relay.id,
                relayLabel: relay.label,
                topicHash: hooks.roomContext.topicHash,
              });
              resolve();
            },
            (err) => {
              if (!anyConnected && ++failedCount >= relays.length) {
                failAll(err instanceof Error ? err : new Error('All signaling relays failed'));
              }
            }
          );
        };
        if (delay === 0) launch();
        else this.staggerTimers.push(setTimeout(launch, delay));
      }
    });
  }

  private launchSingleRelay(
    relay: SignalingRelaySpec,
    hooks: SignalingRelayLaunchHooks,
    perRelayTimeout: number,
    onSuccess?: () => void,
    onFailure?: (err: unknown) => void
  ): void {
    if (this.isCleanedUp) return;
    const existing = this.transports.get(relay.id);
    if (existing) {
      if (existing.isConnected) return;
      this.closeAndDelete(relay.id, existing);
    }

    this.healthSupervisor.markConnecting(relay.id);
    const transport = createSignalingRelayTransport(relay, hooks);
    this.transports.set(relay.id, transport);
    transport.on('message', (msg?: Record<string, unknown>) => {
      if (!this.isCleanedUp && msg) hooks.handleFrameReceived(relay.id, msg);
    });
    transport.on('close', () => this.handleRelayClosed(relay.id, hooks));

    transport
      .connect(perRelayTimeout)
      .then(() => {
        if (this.isCleanedUp) return transport.close();
        this.healthSupervisor.markConnected(relay.id);
        if (onSuccess) onSuccess();
        if (hooks.handleRelayConnected) hooks.handleRelayConnected(relay.id);
        this.emitHealthSnapshot();
      })
      .catch((err: unknown) => {
        if (onFailure) onFailure(err);
        this.handleRelayClosed(relay.id, hooks);
      });
  }

  private handleRelayClosed(relayId: string, hooks: SignalingRelayLaunchHooks): void {
    if (this.isCleanedUp || this.pausedMatchRelays.has(relayId)) return;
    let anyStillOpen = false;
    for (const [id, t] of this.transports) {
      if (id !== relayId && t.isConnected) {
        anyStillOpen = true;
        if (this.activeRelayId === relayId) this.activeRelayId = id;
        break;
      }
    }
    this.healthSupervisor.handleRelayDisconnected(
      relayId,
      anyStillOpen,
      (retryId) => {
        const relay = !this.isCleanedUp ? this.relayConfigs.get(retryId) : undefined;
        if (relay) this.launchSingleRelay(relay, hooks, relay.connectTimeoutMs || 4500);
      },
      () => this.emitHealthSnapshot()
    );
    if (!anyStillOpen && !this.isCleanedUp) {
      this.emitHealthSnapshot();
      hooks.handleAllRelaysClosed(relayId);
    }
  }

  cleanup(): void {
    this.isCleanedUp = true;
    this.healthSupervisor.dispose();
    this.pausedMatchRelays.clear();
    for (const timer of this.staggerTimers) clearTimeout(timer);
    this.staggerTimers.length = 0;
    for (const [id, t] of this.transports) this.closeAndDelete(id, t);
    this.activeRelayId = null;
  }
}
