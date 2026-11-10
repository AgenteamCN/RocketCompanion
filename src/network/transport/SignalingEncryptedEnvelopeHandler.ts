/**
 * SignalingEncryptedEnvelopeHandler.ts
 * Stateful SubController for peer metadata, relay routing, pending candidate queues,
 * pairing hold keepalives, and incoming encrypted E2EE signaling envelope dispatching.
 */

import { getManualPairingConfirmationEnabled } from './signalingRelayConfig.ts';
import type { SignalingCryptoSession } from './SignalingCryptoSession.ts';
import type { SignalingPoolHealthSnapshot } from './SignalingRelayLifecyclePolicy.ts';

export interface PendingPairingRequest {
  peerId: string;
  peerName: string;
  pairingCode: string;
  relayId?: string;
  relayLabel: string;
  role: string;
  approve?: () => Promise<void> | void;
  decline?: (reason?: string) => Promise<void> | void;
}

export interface SignalingPeerMetadata {
  peerId: string;
  name: string;
  role: string;
  allowSpectatorRelay?: boolean;
  pairingCode: string;
  relayId: string;
  requiresBridge?: boolean;
  bridgedFromRelayId?: string;
  confirmed: boolean;
  offerDispatched?: boolean;
  approved?: boolean;
}

export interface SignalingSdpEnvelope {
  sdp: string;
  fromPeerId: string;
  pairingCode?: string;
  relayId: string;
  [key: string]: unknown;
}

export interface SignalingProtocolCallbacks {
  handleOpen?: (info: { relayId: string; relayLabel: string; topicHash: string }) => void;
  handleRelayHealthChanged?: (snapshot: SignalingPoolHealthSnapshot) => void;
  handleClose?: (info: { relayId: string }) => void;
  handleError?: (err: Error) => void;
  handleRendezvousEstablished?: (info: {
    relayId: string;
    relayLabel: string;
    pairingCode: string;
    hostPeerId: string;
    hostName: string;
    requireManualApproval: boolean;
  }) => void;
  handlePairingHold?: (info: { hostPeerId: string; hostName: string; pairingCode: string }) => void;
  handlePairingKeepAlive?: (info: { peerId: string; timestamp: number }) => void;
  handlePairingApproved?: (info: { hostPeerId: string; pairingCode?: string }) => void;
  handlePairingDeclined?: (info: { hostPeerId: string; reason: string }) => void;
  handlePairingApprovalRequired?: (request: PendingPairingRequest) => void;
  handlePeerJoined?: (info: SignalingPeerMetadata & { peerName: string }) => void;
  handleOffer?: (info: SignalingSdpEnvelope) => Promise<void> | void;
  handleAnswer?: (info: SignalingSdpEnvelope) => Promise<void> | void;
  handleCandidate?: (info: {
    candidate: RTCIceCandidateInit | Record<string, unknown>;
    fromPeerId: string;
    relayId: string;
    [key: string]: unknown;
  }) => void;
}

export interface SignalingEnvelopeDispatchContext {
  peerId: string;
  playerName: string;
  cryptoSession: SignalingCryptoSession | null;
  callbacks: SignalingProtocolCallbacks;
  isCleanedUp: boolean;
  getActiveRelayLabel: (peerId?: string | null) => string | null;
  getPairingCodeForPeer: (peerId?: string | null) => string | null;
  sendEncryptedToPeer: (
    targetPeerId: string | null,
    payloadObj: Record<string, unknown>,
    preferredRelayId?: string | null
  ) => Promise<boolean>;
  sendCandidate: (targetPeerId: string | null, candidate: unknown) => Promise<boolean>;
}

export interface EncryptedSignalingWrapper {
  fromPeerId?: string;
  _brgHop?: number;
  _brgFrom?: string;
  env?: Parameters<SignalingCryptoSession['decryptFromPeer']>[1];
}

export class SignalingEncryptedEnvelopeHandler {
  peerRelayRoutes = new Map<string, string>();
  peerMetadata = new Map<string, SignalingPeerMetadata>();
  pendingCandidatesOut = new Map<string, unknown[]>();
  pairingKeepAliveTimer: ReturnType<typeof setInterval> | null = null;

  registerHandshakePeer(
    relayId: string,
    msg: Record<string, unknown>,
    pairingCode: string,
    isHostResponder: boolean
  ): { fromPeerId: string; pairingCode: string; isBridged: boolean } {
    const peerId = String(msg.fromPeerId || '');
    const isBridged = Number(msg._brgHop || 0) >= 1;
    const prev = this.peerMetadata.get(peerId);
    if (!isHostResponder || !prev || !prev.confirmed) {
      this.peerRelayRoutes.set(peerId, relayId);
    }
    this.peerMetadata.set(peerId, {
      peerId,
      name: String(msg.senderName || (isHostResponder ? 'Player' : 'Host')),
      role: isHostResponder ? String(msg.role || 'client') : 'host',
      allowSpectatorRelay: Boolean(msg.allowSpectatorRelay),
      pairingCode,
      relayId: this.peerRelayRoutes.get(peerId) || relayId,
      requiresBridge: Boolean(isBridged || (prev && prev.requiresBridge)),
      bridgedFromRelayId: msg._brgFrom
        ? String(msg._brgFrom)
        : prev
          ? prev.bridgedFromRelayId
          : undefined,
      confirmed: Boolean(!isHostResponder || (prev && prev.confirmed)),
      offerDispatched: Boolean(prev && prev.offerDispatched),
      approved: Boolean(prev && prev.approved),
    });
    return { fromPeerId: peerId, pairingCode, isBridged };
  }

  queuePendingOutgoingCandidate(targetPeerId: string, candidate: unknown): void {
    const list = this.pendingCandidatesOut.get(targetPeerId) || [];
    list.push(candidate);
    this.pendingCandidatesOut.set(targetPeerId, list);
  }

  startClientPairingKeepAlive(
    hostPeerId: string,
    pairingCode: string,
    hostName: string | undefined,
    ctx: SignalingEnvelopeDispatchContext
  ): void {
    this.stopPairingKeepAlive();
    if (ctx.callbacks.handlePairingHold) {
      ctx.callbacks.handlePairingHold({ hostPeerId, hostName: hostName || 'Host', pairingCode });
    }
    this.pairingKeepAliveTimer = setInterval(() => {
      if (ctx.isCleanedUp) return this.stopPairingKeepAlive();
      ctx
        .sendEncryptedToPeer(hostPeerId, { type: 'sig_pairing_ping', timestamp: Date.now() })
        .catch(() => {});
    }, 2000);
  }

  stopPairingKeepAlive(): void {
    if (this.pairingKeepAliveTimer) {
      clearInterval(this.pairingKeepAliveTimer);
      this.pairingKeepAliveTimer = null;
    }
  }

  async handleEncryptedEnvelope(
    relayId: string,
    wrapper: EncryptedSignalingWrapper,
    ctx: SignalingEnvelopeDispatchContext
  ): Promise<void> {
    const fromPeerId = wrapper.fromPeerId;
    const cs = ctx.cryptoSession;
    if (!fromPeerId || !wrapper.env || !cs || !cs.getPeerSession(fromPeerId)) return;

    const existingMeta = this.peerMetadata.get(fromPeerId);
    if (existingMeta && Number(wrapper._brgHop || 0) >= 1) {
      existingMeta.requiresBridge = true;
      if (wrapper._brgFrom) existingMeta.bridgedFromRelayId = String(wrapper._brgFrom);
    }

    let inner: Record<string, unknown>;
    try {
      inner = await cs.decryptFromPeer(fromPeerId, wrapper.env);
    } catch (err: unknown) {
      console.warn('[SignalingEncryptedEnvelopeHandler] Dropped undecryptable frame:', err);
      return;
    }

    const type = typeof inner.type === 'string' ? inner.type : '';
    if (!type) return;
    const cbs = ctx.callbacks;

    switch (type) {
      case 'sig_handshake_confirm':
        await this.handleHandshakeConfirm(relayId, fromPeerId, ctx);
        return;
      case 'sig_pairing_hold':
        this.startClientPairingKeepAlive(
          fromPeerId,
          String(inner.pairingCode || ''),
          typeof inner.hostName === 'string' ? inner.hostName : undefined,
          ctx
        );
        return;
      case 'sig_pairing_ping':
      case 'sig_pairing_pong':
        if (cbs.handlePairingKeepAlive) {
          cbs.handlePairingKeepAlive({ peerId: fromPeerId, timestamp: Date.now() });
        }
        if (type === 'sig_pairing_ping') {
          await ctx.sendEncryptedToPeer(fromPeerId, {
            type: 'sig_pairing_pong',
            timestamp: Date.now(),
          });
        }
        return;
      case 'sig_pairing_approved':
        this.stopPairingKeepAlive();
        if (cbs.handlePairingApproved) {
          cbs.handlePairingApproved({
            hostPeerId: fromPeerId,
            pairingCode: inner.pairingCode as string | undefined,
          });
        }
        return;
      case 'sig_pairing_declined':
        this.stopPairingKeepAlive();
        if (cbs.handlePairingDeclined) {
          cbs.handlePairingDeclined({
            hostPeerId: fromPeerId,
            reason: (inner.reason as string) || 'Host declined the connection request.',
          });
        }
        return;
      case 'offer':
      case 'answer': {
        if (type === 'offer') this.stopPairingKeepAlive();
        const handler = type === 'offer' ? cbs.handleOffer : cbs.handleAnswer;
        if (handler) {
          await handler({
            ...inner,
            sdp: String(inner.sdp || ''),
            fromPeerId,
            pairingCode: ctx.getPairingCodeForPeer(fromPeerId) || undefined,
            relayId,
          });
        }
        return;
      }
      case 'candidate':
        if (inner.candidate && cbs.handleCandidate) {
          cbs.handleCandidate({
            ...inner,
            candidate: inner.candidate as RTCIceCandidateInit | Record<string, unknown>,
            fromPeerId,
            relayId,
          });
        }
        return;
    }
  }

  private async dispatchConfirmedPeerReady(
    relayId: string,
    fromPeerId: string,
    meta: SignalingPeerMetadata,
    ctx: SignalingEnvelopeDispatchContext
  ): Promise<void> {
    if (meta.offerDispatched) return;
    meta.offerDispatched = true;
    meta.approved = true;
    if (ctx.callbacks.handlePeerJoined) {
      ctx.callbacks.handlePeerJoined({ ...meta, peerId: fromPeerId, peerName: meta.name, relayId });
    }
    const flushQueued = this.pendingCandidatesOut.get(fromPeerId);
    if (Array.isArray(flushQueued) && flushQueued.length > 0) {
      this.pendingCandidatesOut.delete(fromPeerId);
      for (const cand of flushQueued) await ctx.sendCandidate(fromPeerId, cand);
    }
  }

  async handleHandshakeConfirm(
    relayId: string,
    fromPeerId: string,
    ctx: SignalingEnvelopeDispatchContext
  ): Promise<void> {
    const meta = this.peerMetadata.get(fromPeerId);
    if (!meta) return;

    this.peerRelayRoutes.set(fromPeerId, relayId);
    meta.relayId = relayId;
    meta.confirmed = true;

    if (
      !getManualPairingConfirmationEnabled() ||
      meta.approved ||
      typeof ctx.callbacks.handlePairingApprovalRequired !== 'function'
    ) {
      await this.dispatchConfirmedPeerReady(relayId, fromPeerId, meta, ctx);
      return;
    }

    await ctx.sendEncryptedToPeer(
      fromPeerId,
      {
        type: 'sig_pairing_hold',
        pairingCode: meta.pairingCode,
        hostName: ctx.playerName,
        timestamp: Date.now(),
      },
      relayId
    );

    ctx.callbacks.handlePairingApprovalRequired({
      peerId: fromPeerId,
      peerName: meta.name,
      role: meta.role,
      pairingCode: meta.pairingCode,
      relayId,
      relayLabel: ctx.getActiveRelayLabel(fromPeerId) || relayId,
      approve: async () => {
        meta.approved = true;
        await ctx.sendEncryptedToPeer(
          fromPeerId,
          { type: 'sig_pairing_approved', pairingCode: meta.pairingCode, timestamp: Date.now() },
          relayId
        );
        await this.dispatchConfirmedPeerReady(relayId, fromPeerId, meta, ctx);
      },
      decline: async (reason = 'Connection declined by Host') => {
        this.peerMetadata.delete(fromPeerId);
        await ctx.sendEncryptedToPeer(
          fromPeerId,
          { type: 'sig_pairing_declined', reason, timestamp: Date.now() },
          relayId
        );
      },
    });
  }

  reset(): void {
    this.stopPairingKeepAlive();
    this.peerRelayRoutes.clear();
    this.peerMetadata.clear();
    this.pendingCandidatesOut.clear();
  }
}
