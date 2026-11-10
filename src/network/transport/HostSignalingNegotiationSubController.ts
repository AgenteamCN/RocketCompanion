/**
 * HostSignalingNegotiationSubController.ts
 * Stateful SubController coordinating the host signaling lifecycle:
 * multi-relay E2EE signaling connection, 4-digit SAS pairing approval queue,
 * automatic reconnect on relay drop, relay re-probing, and match-phase relay convergence.
 */

import {
  SignalingProtocolHandler,
  type PendingPairingRequest,
  type SignalingPoolHealthSnapshot,
  type SignalingProtocolCallbacks,
} from './SignalingProtocolHandler.ts';
import type { HostSessionController } from './HostSessionController.ts';
import { testAllSignalingRelays } from './diagnostics/signalingDiagnosticsProbe.ts';
import {
  applyConnectivityMaskToRoomCode,
  getSlotBitForRelayId,
  parseRoomCode,
} from '../../ui-core/config/roomCodeConnectivityCodec.ts';

export type { PendingPairingRequest };

export interface HostSignalingNegotiationContext {
  roomId: string;
  password: string;
  playerName: string;
  hostController: HostSessionController | null;
  isHosting: () => boolean;
  setRoomId: (roomId: string) => void;
  updateSessionStatus: (status: Record<string, unknown>) => void;
  deliverPairingApprovalRequest?: (request: PendingPairingRequest) => void;
}

export class HostSignalingNegotiationSubController {
  signalingHandler: SignalingProtocolHandler | null = null;
  pendingPairingRequests = new Map<string, PendingPairingRequest>();
  private activeContext: HostSignalingNegotiationContext | null = null;
  private activeProbedMask = 0x0f;

  approvePendingPeer(
    peerId: string,
    updateSessionStatus: (status: Record<string, unknown>) => void
  ): boolean {
    const req = this.pendingPairingRequests.get(peerId);
    if (!req) return false;
    this.pendingPairingRequests.delete(peerId);
    this.syncPendingPairingStatus(updateSessionStatus);
    if (req.approve) {
      void req.approve();
    }
    return true;
  }

  declinePendingPeer(
    peerId: string,
    updateSessionStatus: (status: Record<string, unknown>) => void
  ): boolean {
    const req = this.pendingPairingRequests.get(peerId);
    if (!req) return false;
    this.pendingPairingRequests.delete(peerId);
    this.syncPendingPairingStatus(updateSessionStatus);
    if (req.decline) {
      void req.decline('Host declined the pairing verification request.');
    }
    return true;
  }

  removePendingPeer(
    peerId: string,
    updateSessionStatus: (status: Record<string, unknown>) => void
  ): void {
    if (this.pendingPairingRequests.delete(peerId)) {
      this.syncPendingPairingStatus(updateSessionStatus);
    }
  }

  syncPendingPairingStatus(updateSessionStatus: (status: Record<string, unknown>) => void): void {
    const list = Array.from(this.pendingPairingRequests.values()).map((r) => ({
      peerId: r.peerId,
      peerName: r.peerName,
      pairingCode: r.pairingCode,
      relayLabel: r.relayLabel,
      role: r.role,
    }));
    updateSessionStatus({ pendingPairingRequests: list });
  }

  private createSignalingCallbacks(): SignalingProtocolCallbacks {
    return {
      handleOpen: ({ relayLabel }) => {
        const ctx = this.activeContext;
        const handler = this.signalingHandler;
        if (!ctx || !handler) return;
        const liveMask = handler.relayPool.getConnectedConnectivityMask();
        const healthSnapshot = handler.relayPool.getHealthSnapshot();
        ctx.updateSessionStatus({
          signalingConnected: true,
          signalingHealthLevel: healthSnapshot.healthLevel,
          roomId: ctx.roomId,
          activeRelayLabel: relayLabel,
          hostMask: liveMask,
        });
      },
      handleRelayHealthChanged: (snapshot: SignalingPoolHealthSnapshot) => {
        const ctx = this.activeContext;
        if (!ctx) return;
        ctx.updateSessionStatus({
          signalingConnected: snapshot.hasAnyConnected,
          signalingHealthLevel: snapshot.healthLevel,
          hostMask: snapshot.connectedMask,
        });
      },
      handleClose: () => {
        this.handleSignalingDisconnected();
      },
      handleError: () => {
        this.handleSignalingDisconnected();
      },
      handlePairingApprovalRequired: (request: PendingPairingRequest) => {
        const ctx = this.activeContext;
        if (!ctx) return;
        this.pendingPairingRequests.set(request.peerId, request);
        this.syncPendingPairingStatus(ctx.updateSessionStatus);
        if (ctx.deliverPairingApprovalRequest) {
          ctx.deliverPairingApprovalRequest(request);
        }
      },
      handlePeerJoined: ({ peerId, name, peerName, role, allowSpectatorRelay, pairingCode }) => {
        const ctx = this.activeContext;
        if (!ctx) return;
        this.pendingPairingRequests.delete(peerId);
        this.syncPendingPairingStatus(ctx.updateSessionStatus);
        if (ctx.hostController) {
          void ctx.hostController.dispatchOfferToPeer(
            peerId,
            name || peerName,
            this.signalingHandler,
            role || 'player',
            { allowSpectatorRelay, pairingCode }
          );
        }
      },
      handleAnswer: async ({ sdp, fromPeerId, pairingCode }) => {
        const ctx = this.activeContext;
        if (!ctx || !ctx.hostController) return;
        try {
          await ctx.hostController.handleAnswer(sdp, fromPeerId || null, { pairingCode });
        } catch (err) {
          console.error(
            '[HostSignalingNegotiationSubController] Error accepting peer answer:',
            err
          );
          throw err;
        }
      },
      handleCandidate: ({ candidate, fromPeerId }) => {
        const ctx = this.activeContext;
        if (ctx && ctx.hostController) {
          ctx.hostController.handleRemoteCandidate(candidate, fromPeerId || null);
        }
      },
    };
  }

  private handleSignalingDisconnected(): void {
    const ctx = this.activeContext;
    if (!ctx) return;
    ctx.updateSessionStatus({
      signalingConnected: false,
      signalingHealthLevel: 'offline',
    });
    if (ctx.isHosting() && this.signalingHandler) {
      const mask = this.activeProbedMask;
      this.signalingHandler.scheduleReconnect(3000, () => this.initHostSignaling(ctx, mask));
    }
  }

  initHostSignaling(context: HostSignalingNegotiationContext, probedMask?: number): void {
    if (!context.isHosting()) return;
    if (this.signalingHandler) {
      this.signalingHandler.cleanup();
      this.signalingHandler = null;
    }

    const parsedHostRoom = parseRoomCode(context.roomId);
    const effectiveProbedMask =
      typeof probedMask === 'number' && (probedMask & 0x0f) !== 0
        ? probedMask & 0x0f
        : parsedHostRoom
          ? parsedHostRoom.hostMask
          : 0x0f;

    this.activeContext = context;
    this.activeProbedMask = effectiveProbedMask;

    const handler = new SignalingProtocolHandler(
      {
        roomId: context.roomId,
        password: context.password,
        role: 'host',
        playerName: context.playerName,
        allowSpectatorRelay: true,
        probedHostMask: effectiveProbedMask,
      },
      this.createSignalingCallbacks()
    );
    this.signalingHandler = handler;

    handler.connect().catch((err: unknown) => {
      console.warn(
        '[HostSignalingNegotiationSubController] Signaling connection notice:',
        err instanceof Error ? err.message : err
      );
      if (context.isHosting() && this.signalingHandler) {
        this.signalingHandler.scheduleReconnect(3000, () =>
          this.initHostSignaling(context, effectiveProbedMask)
        );
      }
    });
  }

  async reprobeAndRefresh(context: HostSignalingNegotiationContext): Promise<void> {
    if (!context.isHosting()) return;
    let probedMask = 0;
    try {
      const probeResults = await testAllSignalingRelays(4000);
      for (const r of probeResults) {
        if (r.ok) {
          probedMask |= getSlotBitForRelayId(r.id);
        }
      }
    } catch (err) {
      console.warn('[HostSignalingNegotiationSubController] Relay re-probe failed:', err);
    }
    const cleanMask = probedMask & 0x0f || 0x0f;
    const nextRoomId = applyConnectivityMaskToRoomCode(context.roomId, cleanMask);
    context.roomId = nextRoomId;
    context.setRoomId(nextRoomId);
    context.updateSessionStatus({
      roomId: nextRoomId,
      hostMask: cleanMask,
    });
    this.initHostSignaling(context, cleanMask);
  }

  notifyMatchStarted(): void {
    if (this.signalingHandler) {
      this.signalingHandler.relayPool.applyMatchPhaseRelayConvergence(
        this.signalingHandler.relayUsageTracker.getActiveRelayIds()
      );
    }
  }

  notifyReturnedToLobby(): void {
    if (this.signalingHandler) {
      this.signalingHandler.relayPool.restoreLobbyRelays();
    }
  }

  cleanup(): void {
    this.activeContext = null;
    this.pendingPairingRequests.clear();
    if (this.signalingHandler) {
      this.signalingHandler.cleanup();
      this.signalingHandler = null;
    }
  }
}
