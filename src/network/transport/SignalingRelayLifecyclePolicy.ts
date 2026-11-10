/**
 * SignalingRelayLifecyclePolicy.ts
 * Decoupled lifecycle supervisor and active-relay tracker for multi-relay signaling.
 *
 * Responsibilities:
 * 1. `SessionRelayUsageTracker`: Records which signaling relay IDs have actively mediated
 *    handshakes for connected peers in the current session.
 * 2. `SignalingRelayHealthSupervisor`: Manages per-relay bounded auto-reconnect (max 2 retries
 *    on single-relay drop before marking that relay degraded/yellow) vs full-disconnect detection,
 *    plus match-phase relay convergence (`smart-prune` vs `keep-all-probed`).
 */

import { getSlotBitForRelayId } from '../../ui-core/config/roomCodeConnectivityCodec.ts';

export type SignalingRelayMatchPolicy = 'smart-prune' | 'keep-all-probed';

export type RelaySlotHealthState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'paused-in-match';

export interface RelaySlotHealthEntry {
  relayId: string;
  relayLabel: string;
  bit: number;
  state: RelaySlotHealthState;
  retryCount: number;
}

export interface SignalingPoolHealthSnapshot {
  connectedMask: number;
  probedMask: number;
  degradedRelayIds: string[];
  pausedRelayIds: string[];
  hasAnyConnected: boolean;
  isDegraded: boolean;
  healthLevel: 'healthy' | 'degraded' | 'offline';
}

const MAX_SINGLE_RELAY_RETRIES = 2;
const RETRY_DELAYS_MS = [1800, 3600];

let currentMatchRelayPolicy: SignalingRelayMatchPolicy = 'smart-prune';

export function getSignalingRelayMatchPolicy(): SignalingRelayMatchPolicy {
  return currentMatchRelayPolicy;
}

export function setSignalingRelayMatchPolicy(policy: SignalingRelayMatchPolicy): void {
  currentMatchRelayPolicy = policy;
}

/**
 * Tracks which signaling relay IDs were used by peers during handshake in the current room.
 */
export class SessionRelayUsageTracker {
  private peerToRelayMap = new Map<string, string>();
  private historicalRelays = new Set<string>();

  recordPeerHandshakeRelay(peerId: string, relayId: string): void {
    if (!peerId || !relayId) return;
    this.peerToRelayMap.set(peerId, relayId);
    this.historicalRelays.add(relayId);
  }

  removePeer(peerId: string): void {
    this.peerToRelayMap.delete(peerId);
  }

  getActiveRelayIds(): Set<string> {
    const active = new Set<string>(this.historicalRelays);
    for (const relayId of this.peerToRelayMap.values()) {
      active.add(relayId);
    }
    return active;
  }

  clear(): void {
    this.peerToRelayMap.clear();
    this.historicalRelays.clear();
  }
}

/**
 * Supervises per-relay health states, bounded single-relay retries, and match-phase convergence.
 */
export class SignalingRelayHealthSupervisor {
  private slots = new Map<string, RelaySlotHealthEntry>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private probedMask = 0x0f;

  setProbedMask(mask: number): void {
    this.probedMask = mask & 0x0f;
  }

  getProbedMask(): number {
    return this.probedMask;
  }

  registerRelay(relayId: string, relayLabel: string): void {
    const bit = getSlotBitForRelayId(relayId);
    const existing = this.slots.get(relayId);
    this.slots.set(relayId, {
      relayId,
      relayLabel,
      bit,
      state: existing?.state ?? 'idle',
      retryCount: existing?.retryCount ?? 0,
    });
  }

  markConnecting(relayId: string): void {
    const entry = this.slots.get(relayId);
    if (!entry) return;
    entry.state = entry.retryCount > 0 ? 'reconnecting' : 'connecting';
  }

  markConnected(relayId: string): void {
    this.clearRetryTimer(relayId);
    const entry = this.slots.get(relayId);
    if (!entry) return;
    entry.state = 'connected';
    entry.retryCount = 0;
  }

  markPausedInMatch(relayId: string): void {
    this.clearRetryTimer(relayId);
    const entry = this.slots.get(relayId);
    if (!entry) return;
    entry.state = 'paused-in-match';
  }

  /**
   * Handles a relay disconnect and decides whether to schedule a bounded single-relay retry
   * or mark the relay as degraded (`yellow` warning).
   */
  handleRelayDisconnected(
    relayId: string,
    anyOtherRelayStillOpen: boolean,
    onRetryRelay: (relayId: string) => void,
    onDegradedChange: () => void
  ): void {
    this.clearRetryTimer(relayId);
    const entry = this.slots.get(relayId);
    if (!entry) return;
    if (entry.state === 'paused-in-match') return;

    if (!anyOtherRelayStillOpen) {
      entry.state = 'degraded';
      onDegradedChange();
      return;
    }

    if (entry.retryCount < MAX_SINGLE_RELAY_RETRIES) {
      const delayMs = RETRY_DELAYS_MS[entry.retryCount] ?? 3600;
      entry.retryCount += 1;
      entry.state = 'reconnecting';
      onDegradedChange();

      const timer = setTimeout(() => {
        this.retryTimers.delete(relayId);
        onRetryRelay(relayId);
      }, delayMs);
      this.retryTimers.set(relayId, timer);
    } else {
      entry.state = 'degraded';
      onDegradedChange();
    }
  }

  /**
   * Computes which relay IDs should remain open during an active Match under the current policy.
   * - `keep-all-probed`: keeps all probed relays open.
   * - `smart-prune`: keeps relays used by players in this session + probed EMQX relays (low overhead).
   */
  resolveMatchPhaseRelaysToKeep(
    allProbedRelayIds: string[],
    activePlayerRelayIds: Set<string>,
    policy: SignalingRelayMatchPolicy = currentMatchRelayPolicy
  ): Set<string> {
    if (policy === 'keep-all-probed') {
      return new Set(allProbedRelayIds);
    }
    const keep = new Set<string>();
    for (const id of allProbedRelayIds) {
      if (activePlayerRelayIds.has(id) || id.startsWith('emqx_')) {
        keep.add(id);
      }
    }
    if (keep.size === 0 && allProbedRelayIds.length > 0) {
      keep.add(allProbedRelayIds[0]);
    }
    return keep;
  }

  getSnapshot(connectedMask: number): SignalingPoolHealthSnapshot {
    const degradedRelayIds: string[] = [];
    const pausedRelayIds: string[] = [];
    for (const entry of this.slots.values()) {
      if (this.probedMask !== 0 && entry.bit !== 0 && (this.probedMask & entry.bit) === 0) {
        continue;
      }
      if (entry.state === 'degraded' || entry.state === 'reconnecting') {
        degradedRelayIds.push(entry.relayId);
      } else if (entry.state === 'paused-in-match') {
        pausedRelayIds.push(entry.relayId);
      }
    }

    const hasAnyConnected = connectedMask !== 0;
    const isDegraded = hasAnyConnected && degradedRelayIds.length > 0;
    const healthLevel: 'healthy' | 'degraded' | 'offline' = !hasAnyConnected
      ? 'offline'
      : isDegraded
        ? 'degraded'
        : 'healthy';

    return {
      connectedMask,
      probedMask: this.probedMask,
      degradedRelayIds,
      pausedRelayIds,
      hasAnyConnected,
      isDegraded,
      healthLevel,
    };
  }

  clearRetryTimer(relayId: string): void {
    const timer = this.retryTimers.get(relayId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(relayId);
    }
  }

  dispose(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.slots.clear();
  }
}
