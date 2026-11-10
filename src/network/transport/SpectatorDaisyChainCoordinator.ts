/**
 * SpectatorDaisyChainCoordinator.ts
 * Topology coordinator and post-rollback committed snapshot relay buffer for P2P Spectator Daisy-Chaining.
 * Offloads spectator downlink bandwidth from the Authoritative Host onto relay-capable Player clients.
 */

export const DEFAULT_COMMITTED_ROLLBACK_WINDOW_MS = 100;
export const DEFAULT_MAX_SPECTATORS_PER_CLIENT_NODE = 2;

export interface SpectatorDaisyChainOptions {
  hostDirectPlayerThreshold?: number;
  maxSpectatorsPerNode?: number;
  rollbackCommitWindowMs?: number;
}

export interface RelayNodeRecord {
  peerId: string;
  playerName: string;
  role: string;
  allowSpectatorRelay: boolean;
  rttMs: number;
  downstreamSpectators: Set<string>;
  updatedAt: number;
}

export interface SpectatorRelayPlan {
  mode: 'direct_host' | 'daisy_chain';
  upstreamPeerId: string;
  upstreamPlayerName?: string;
  commitDelayMs: number;
}

export interface CommittedSnapshotItem {
  packetBuffer: ArrayBuffer | Uint8Array | string;
  serverTick: number;
  receivedAtMs: number;
}

export class SpectatorDaisyChainCoordinator {
  hostDirectPlayerThreshold: number;
  maxSpectatorsPerNode: number;
  rollbackCommitWindowMs: number;
  relayNodes = new Map<string, RelayNodeRecord>();
  spectatorAssignments = new Map<string, string>();

  constructor(options: SpectatorDaisyChainOptions = {}) {
    this.hostDirectPlayerThreshold = options.hostDirectPlayerThreshold ?? 4;
    this.maxSpectatorsPerNode =
      options.maxSpectatorsPerNode ?? DEFAULT_MAX_SPECTATORS_PER_CLIENT_NODE;
    this.rollbackCommitWindowMs =
      options.rollbackCommitWindowMs ?? DEFAULT_COMMITTED_ROLLBACK_WINDOW_MS;
  }

  registerRelayNode(
    peerId: string,
    nodeInfo: {
      playerName?: string;
      role?: string;
      allowSpectatorRelay?: boolean;
      rttMs?: number;
    } = {}
  ): void {
    if (!peerId) return;
    const existing = this.relayNodes.get(peerId);
    this.relayNodes.set(peerId, {
      peerId,
      playerName: nodeInfo.playerName || existing?.playerName || 'Player',
      role: nodeInfo.role || existing?.role || 'player',
      allowSpectatorRelay: nodeInfo.allowSpectatorRelay ?? existing?.allowSpectatorRelay ?? true,
      rttMs: nodeInfo.rttMs ?? existing?.rttMs ?? 20,
      downstreamSpectators: existing?.downstreamSpectators || new Set<string>(),
      updatedAt: Date.now(),
    });
  }

  updateNodeMetrics(
    peerId: string,
    patch: { allowSpectatorRelay?: boolean; rttMs?: number } = {}
  ): void {
    const node = this.relayNodes.get(peerId);
    if (!node) return;
    if (patch.allowSpectatorRelay !== undefined) {
      node.allowSpectatorRelay = Boolean(patch.allowSpectatorRelay);
    }
    if (typeof patch.rttMs === 'number' && Number.isFinite(patch.rttMs)) {
      node.rttMs = patch.rttMs;
    }
    node.updatedAt = Date.now();
  }

  unregisterNode(peerId: string): void {
    if (!peerId) return;
    this.relayNodes.delete(peerId);
    const prevParent = this.spectatorAssignments.get(peerId);
    if (prevParent && this.relayNodes.has(prevParent)) {
      this.relayNodes.get(prevParent)!.downstreamSpectators.delete(peerId);
    }
    this.spectatorAssignments.delete(peerId);
  }

  selectUpstreamRelayForSpectator(
    spectatorPeerId: string,
    activeHostPlayerCount = 0,
    hostPeerId = 'host'
  ): SpectatorRelayPlan {
    if (activeHostPlayerCount < this.hostDirectPlayerThreshold) {
      return {
        mode: 'direct_host',
        upstreamPeerId: hostPeerId,
        commitDelayMs: 0,
      };
    }

    let bestCandidate: RelayNodeRecord | null = null;
    let bestScore = Infinity;

    for (const node of this.relayNodes.values()) {
      if (node.peerId === spectatorPeerId) continue;
      if (!node.allowSpectatorRelay) continue;
      if (node.downstreamSpectators.size >= this.maxSpectatorsPerNode) continue;

      const loadPenalty = node.downstreamSpectators.size * 65;
      const rolePenalty = node.role === 'spectator' ? 40 : 0;
      const score = (node.rttMs || 25) + loadPenalty + rolePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = node;
      }
    }

    if (!bestCandidate) {
      return {
        mode: 'direct_host',
        upstreamPeerId: hostPeerId,
        commitDelayMs: 0,
      };
    }

    bestCandidate.downstreamSpectators.add(spectatorPeerId);
    this.spectatorAssignments.set(spectatorPeerId, bestCandidate.peerId);

    return {
      mode: 'daisy_chain',
      upstreamPeerId: bestCandidate.peerId,
      upstreamPlayerName: bestCandidate.playerName,
      commitDelayMs: this.rollbackCommitWindowMs,
    };
  }

  clear(): void {
    this.relayNodes.clear();
    this.spectatorAssignments.clear();
  }
}

export class CommittedFrameDaisyChainBuffer {
  commitDelayMs: number;
  pendingSnapshots: CommittedSnapshotItem[] = [];

  constructor(commitDelayMs = DEFAULT_COMMITTED_ROLLBACK_WINDOW_MS) {
    this.commitDelayMs = commitDelayMs;
  }

  enqueueVerifiedSnapshot(
    packetBuffer: ArrayBuffer | Uint8Array | string,
    serverTick: number,
    receivedAtMs = performance.now()
  ): void {
    if (!packetBuffer) return;
    this.pendingSnapshots.push({
      packetBuffer,
      serverTick,
      receivedAtMs,
    });
    if (this.pendingSnapshots.length > 64) {
      this.pendingSnapshots.shift();
    }
  }

  drainCommittedSnapshots(nowMs = performance.now()): CommittedSnapshotItem[] {
    if (this.pendingSnapshots.length === 0) return [];
    const committed: CommittedSnapshotItem[] = [];
    while (this.pendingSnapshots.length > 0) {
      const head = this.pendingSnapshots[0];
      if (nowMs - head.receivedAtMs >= this.commitDelayMs) {
        committed.push(this.pendingSnapshots.shift()!);
      } else {
        break;
      }
    }
    return committed;
  }

  clear(): void {
    this.pendingSnapshots.length = 0;
  }
}
