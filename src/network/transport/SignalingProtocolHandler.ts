/** Multi-Relay E2EE Signaling Protocol Coordinator. */

import {
  deriveDeterministicRoomContext,
  SignalingCryptoSession,
  type DeterministicRoomContext,
} from './SignalingCryptoSession.ts';
import {
  getManualPairingConfirmationEnabled,
  getAllowSpectatorDaisyChain,
} from './signalingRelayConfig.ts';
import {
  SignalingEncryptedEnvelopeHandler,
  type PendingPairingRequest,
  type SignalingEnvelopeDispatchContext,
  type SignalingProtocolCallbacks,
} from './SignalingEncryptedEnvelopeHandler.ts';
import { SignalingMultiRelayTransportPool } from './SignalingMultiRelayTransportPool.ts';
import {
  SessionRelayUsageTracker,
  type SignalingPoolHealthSnapshot,
} from './SignalingRelayLifecyclePolicy.ts';
import {
  buildHandshakeConfirmPayload,
  buildSignedHelloAckFrame,
  buildSignedHelloFrame,
  resolveClientHelloDispatchTargets,
  verifySignedHelloAckFrame,
  verifySignedHelloFrame,
} from './signalingHandshakeFrames.ts';

export type { PendingPairingRequest, SignalingPoolHealthSnapshot, SignalingProtocolCallbacks };

export interface SignalingProtocolOptions {
  roomId: string;
  password?: string;
  role?: string;
  playerName?: string;
  allowSpectatorRelay?: boolean;
  peerId?: string;
  probedHostMask?: number;
}

export class SignalingProtocolHandler implements SignalingEnvelopeDispatchContext {
  roomId: string;
  password: string;
  role: string;
  playerName: string;
  allowSpectatorRelay: boolean;
  probedHostMask?: number;
  callbacks: SignalingProtocolCallbacks;

  peerId: string;
  roomContext: DeterministicRoomContext | null = null;
  cryptoSession: SignalingCryptoSession | null = null;

  readonly relayPool = new SignalingMultiRelayTransportPool();
  readonly envelopeHandler = new SignalingEncryptedEnvelopeHandler();
  readonly relayUsageTracker = new SessionRelayUsageTracker();

  remoteHostPeerId: string | null = null;
  status = 'idle';
  isCleanedUp = false;

  private helloRetryTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: SignalingProtocolOptions, callbacks: SignalingProtocolCallbacks = {}) {
    this.roomId = opts.roomId;
    this.password = opts.password || '';
    this.role = opts.role || 'client';
    this.playerName =
      opts.playerName && opts.playerName !== 'Host'
        ? opts.playerName
        : `Player${Math.floor(1000 + Math.random() * 9000)}`;
    this.allowSpectatorRelay = opts.allowSpectatorRelay ?? getAllowSpectatorDaisyChain();
    this.probedHostMask = opts.probedHostMask;
    this.callbacks = callbacks;
    this.peerId = opts.peerId || `peer_${Math.random().toString(36).slice(2, 9)}`;
  }

  getPairingCodeForPeer(peerId: string | null = null): string | null {
    const id = peerId || this.remoteHostPeerId;
    return id && this.cryptoSession ? this.cryptoSession.getPairingCode(id) : null;
  }

  getActiveRelayLabel(peerId: string | null = null): string | null {
    const routed = peerId ? this.envelopeHandler.peerRelayRoutes.get(peerId) : undefined;
    return this.relayPool.getRelayLabel(routed || this.relayPool.activeRelayId);
  }

  async connect(timeoutMs = 8000): Promise<void> {
    this.cleanup();
    this.isCleanedUp = false;
    this.status = 'connecting';

    const roomCtx = await deriveDeterministicRoomContext(this.roomId, this.password);
    this.roomContext = roomCtx;
    this.cryptoSession = new SignalingCryptoSession(roomCtx, this.peerId);
    await this.cryptoSession.initializeLocalIdentity();
    const cbs = this.callbacks;

    return this.relayPool.connectStaggered(timeoutMs, {
      role: this.role,
      peerId: this.peerId,
      roomId: this.roomId,
      playerName: this.playerName,
      roomContext: roomCtx,
      allowedMask: this.probedHostMask,
      isSkipLaunch: () =>
        this.isCleanedUp ||
        (this.role !== 'host' && !this.allowSpectatorRelay && Boolean(this.remoteHostPeerId)),
      handleFirstRelayOpen: (info) => {
        this.status = 'connected';
        if (cbs.handleOpen) cbs.handleOpen(info);
        if (this.role !== 'host') {
          this.stopClientHelloLoop();
          void this.broadcastClientHello();
          this.helloRetryTimer = setInterval(() => {
            if (this.isCleanedUp || this.remoteHostPeerId) return this.stopClientHelloLoop();
            void this.broadcastClientHello();
          }, 1350);
        }
      },
      handleRelayConnected: () => {
        if (this.role !== 'host' && !this.remoteHostPeerId) void this.broadcastClientHello();
      },
      handleRelayHealthChanged: (snap) => {
        if (cbs.handleRelayHealthChanged) cbs.handleRelayHealthChanged(snap);
      },
      handleFrameReceived: (relayId, msg) => void this.handleFrame(relayId, msg),
      handleAllRelaysClosed: (relayId) => {
        this.status = 'error';
        if (cbs.handleClose) cbs.handleClose({ relayId });
      },
      handleAllRelaysFailed: (err) => {
        this.status = 'error';
        if (cbs.handleError) cbs.handleError(err);
      },
    });
  }

  private stopClientHelloLoop(): void {
    if (this.helloRetryTimer) {
      clearInterval(this.helloRetryTimer);
      this.helloRetryTimer = null;
    }
  }

  private async broadcastClientHello(): Promise<void> {
    const ids = this.relayPool.getConnectedRelayIds();
    const cs = this.cryptoSession;
    const rc = this.roomContext;
    if (ids.length === 0 || !cs || !rc) return;
    const targets = resolveClientHelloDispatchTargets(
      this.roomId,
      ids,
      this.relayPool.getConnectedConnectivityMask(),
      this.relayPool.getBestRelayIdForBridge(ids[0])
    );
    for (const t of targets) {
      const frame = await buildSignedHelloFrame({
        roomContext: rc,
        fromPeerId: this.peerId,
        senderName: this.playerName,
        role: this.role,
        allowSpectatorRelay: this.allowSpectatorRelay,
        ecdhPub: cs.localPublicKeyBase64Url,
        nonce: cs.localNonce,
        relayId: t.relayId,
      });
      if (t.useBridge) await this.relayPool.sendBridgeOnRelay(t.relayId, frame);
      else this.relayPool.sendOnRelay(t.relayId, frame);
    }
  }

  private async establishPeer(relayId: string, msg: Record<string, unknown>, isHost: boolean) {
    const fromPeerId = String(msg.fromPeerId || '');
    const s = await this.cryptoSession!.establishPeerSession(
      fromPeerId,
      String(msg.ecdhPub || ''),
      String(msg.nonce || ''),
      isHost
    );
    this.relayUsageTracker.recordPeerHandshakeRelay(fromPeerId, relayId);
    return this.envelopeHandler.registerHandshakePeer(relayId, msg, s.pairingCode, isHost);
  }

  private async handleFrame(relayId: string, msg: Record<string, unknown>): Promise<void> {
    const cs = this.cryptoSession;
    const rc = this.roomContext;
    if (!cs || !rc || this.isCleanedUp || msg.fromPeerId === this.peerId) return;

    if (msg.type === 'sig_hello') {
      if (
        this.role !== 'host' &&
        (!this.allowSpectatorRelay || msg.targetRelayParentId !== this.peerId)
      ) {
        return;
      }
      if (!(await verifySignedHelloFrame(rc, msg))) return;
      const { fromPeerId, isBridged } = await this.establishPeer(relayId, msg, true);
      const ack = await buildSignedHelloAckFrame({
        roomContext: rc,
        targetPeerId: fromPeerId,
        fromPeerId: this.peerId,
        senderName: this.playerName,
        ecdhPub: cs.localPublicKeyBase64Url,
        nonce: cs.localNonce,
        relayId,
        requireManualApproval: getManualPairingConfirmationEnabled(),
      });
      const meta = this.envelopeHandler.peerMetadata.get(fromPeerId);
      if (isBridged || (meta && meta.requiresBridge)) {
        await this.relayPool.sendBridgeOnRelay(relayId, ack);
      } else {
        this.relayPool.sendOnRelay(relayId, ack);
      }
    } else if (msg.type === 'sig_hello_ack') {
      if (this.role === 'host' || msg.targetPeerId !== this.peerId) return;
      if (!(await verifySignedHelloAckFrame(rc, this.peerId, msg))) return;
      const fromPeerId = String(msg.fromPeerId || '');
      if (this.remoteHostPeerId && this.remoteHostPeerId !== fromPeerId) return;

      const isFirstLock = !this.remoteHostPeerId;
      this.remoteHostPeerId = fromPeerId;
      this.relayPool.activeRelayId = relayId;
      this.stopClientHelloLoop();

      const { pairingCode } = await this.establishPeer(relayId, msg, false);
      if (isFirstLock) {
        if (!this.allowSpectatorRelay) this.relayPool.closeRedundantRelays(relayId);
        if (this.callbacks.handleRendezvousEstablished) {
          this.callbacks.handleRendezvousEstablished({
            relayId,
            relayLabel: this.relayPool.getRelayLabel(relayId) || relayId,
            pairingCode,
            hostPeerId: fromPeerId,
            hostName: String(msg.senderName || 'Host'),
            requireManualApproval: Boolean(msg.requireManualApproval),
          });
        }
      }
      const confirm = buildHandshakeConfirmPayload(
        this.peerId,
        this.playerName,
        this.role,
        this.allowSpectatorRelay,
        pairingCode,
        relayId
      );
      await this.sendEncryptedToPeer(fromPeerId, confirm, relayId);
    } else if (
      msg.type === 'sig_encrypted' &&
      (!msg.targetPeerId || msg.targetPeerId === this.peerId)
    ) {
      await this.envelopeHandler.handleEncryptedEnvelope(relayId, msg, this);
    }
  }

  async sendEncryptedToPeer(
    targetPeerId: string | null,
    payloadObj: Record<string, unknown>,
    preferredRelayId: string | null = null
  ): Promise<boolean> {
    const peerId = targetPeerId || this.remoteHostPeerId;
    const cs = this.cryptoSession;
    if (!peerId || !cs || !cs.getPeerSession(peerId)) return false;

    const wrapper = {
      type: 'sig_encrypted',
      fromPeerId: this.peerId,
      targetPeerId: peerId,
      env: await cs.encryptForPeer(peerId, {
        fromPeerId: this.peerId,
        targetPeerId: peerId,
        senderName: this.playerName,
        ...payloadObj,
      }),
      timestamp: Date.now(),
    };
    const routeId =
      preferredRelayId ||
      this.envelopeHandler.peerRelayRoutes.get(peerId) ||
      this.relayPool.activeRelayId;
    const meta = this.envelopeHandler.peerMetadata.get(peerId);
    return meta && meta.requiresBridge && routeId
      ? this.relayPool.sendBridgeOnRelay(routeId, wrapper)
      : this.relayPool.sendRoutedFrame(wrapper, routeId, 1);
  }

  scheduleReconnect(delayMs = 3000, reconnectFn?: () => void): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (reconnectFn) reconnectFn();
    }, delayMs);
  }

  sendOffer(peerId: string, sdp: string): Promise<boolean> {
    return this.sendEncryptedToPeer(peerId, {
      type: 'offer',
      sdp,
      pairingCode: this.getPairingCodeForPeer(peerId),
    });
  }

  sendAnswer(sdp: string, targetPeerId: string | null = null): Promise<boolean> {
    const target = targetPeerId || this.remoteHostPeerId;
    return this.sendEncryptedToPeer(target, {
      type: 'answer',
      sdp,
      pairingCode: this.getPairingCodeForPeer(target),
    });
  }

  async sendCandidate(targetPeerId: string | null, candidate: unknown): Promise<boolean> {
    const target = targetPeerId || this.remoteHostPeerId;
    if (!target || !this.cryptoSession || !this.cryptoSession.getPeerSession(target)) {
      if (target) this.envelopeHandler.queuePendingOutgoingCandidate(target, candidate);
      return false;
    }
    return this.sendEncryptedToPeer(target, { type: 'candidate', candidate });
  }

  sendRelayAssignment(targetPeerId: string, assignment: Record<string, unknown>): Promise<boolean> {
    return this.sendEncryptedToPeer(targetPeerId, { type: 'relay_assignment', assignment });
  }

  cleanup(): void {
    this.isCleanedUp = true;
    this.stopClientHelloLoop();
    this.relayUsageTracker.clear();
    this.envelopeHandler.reset();
    this.relayPool.cleanup();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.cryptoSession) {
      this.cryptoSession.destroy();
      this.cryptoSession = null;
    }
    this.remoteHostPeerId = null;
    this.status = 'idle';
  }
}
