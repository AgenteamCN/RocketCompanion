/**
 * ClientJoinNegotiationSubController.ts
 * Stateful SubController coordinating the client room-join lifecycle:
 * deadline/keepalive watchdog timers, 3-way E2EE rendezvous, 4-digit SAS pairing hold,
 * encrypted offer/answer/ICE negotiation, and downstream spectator relay attachment.
 */

import {
  SignalingProtocolHandler,
  type SignalingProtocolCallbacks,
} from './SignalingProtocolHandler.ts';
import { ClientSessionController } from './ClientSessionController.ts';
import type { P2PWebRTCChannel } from './P2PWebRTCChannel.ts';
import { getAllowSpectatorDaisyChain } from './signalingRelayConfig.ts';

export interface ClientJoinNegotiationOptions {
  roomId: string;
  password?: string;
  timeoutMs?: number;
  playerName: string;
  colorSlot: number;
  colorHex: string;
}

export interface ClientJoinNegotiationCallbacks {
  updateSessionStatus: (status: Record<string, unknown>) => void;
  joinServer?: (config: {
    channel: P2PWebRTCChannel;
    playerName: string;
    remotePlayerName: string;
    pairingCode?: string;
  }) => Promise<void> | void;
  abortJoin: () => void;
  notifyUnexpectedDisconnect?: () => void;
}

function buildJoinTimeoutError(
  cleanRoomId: string,
  timeoutMs: number,
  sdpOfferReceived: boolean,
  signalingStatus: string | undefined
): Error {
  const timeoutSec = Math.round(timeoutMs / 1000);
  if (sdpOfferReceived) {
    return new Error(
      'Signaling Connected (SDP/ICE Exchanged) — P2P Blocked by NAT (Symmetric NAT or firewall blocked direct WebRTC DataChannel).'
    );
  }
  if (signalingStatus === 'connected') {
    return new Error(
      `Connected to signaling relay, but room "${cleanRoomId}" (or matching password) did not respond within ${timeoutSec}s.`
    );
  }
  return new Error(
    `Join room connection timed out after ${timeoutSec}s (All signaling relays unreachable)`
  );
}

export class ClientJoinNegotiationSubController {
  clientController: ClientSessionController | null = null;
  signalingHandler: SignalingProtocolHandler | null = null;

  private joinDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private isHeldForPairing = false;
  private lastKeepAliveAt = 0;
  private settled = false;
  private sdpOfferReceived = false;

  get channel(): P2PWebRTCChannel | null {
    return this.clientController ? this.clientController.channel : null;
  }

  private clearJoinTimer(): void {
    if (this.joinDeadlineTimer) {
      clearTimeout(this.joinDeadlineTimer);
      this.joinDeadlineTimer = null;
    }
  }

  async executeJoin(
    options: ClientJoinNegotiationOptions,
    callbacks: ClientJoinNegotiationCallbacks
  ): Promise<boolean> {
    const cleanRoomId = (options.roomId || '').trim();
    const joinPassword = String(options.password || '').trim();
    const timeoutMs = options.timeoutMs ?? 10000;
    const allowSpectatorRelay = getAllowSpectatorDaisyChain();

    this.cleanup();
    this.settled = false;
    this.isHeldForPairing = false;
    this.sdpOfferReceived = false;
    this.lastKeepAliveAt = Date.now();

    return new Promise(async (resolve, reject) => {
      const finishSuccess = () => {
        if (this.settled) return;
        this.settled = true;
        this.clearJoinTimer();
        resolve(true);
      };

      const finishFailure = (err: unknown) => {
        if (this.settled) return;
        this.settled = true;
        this.clearJoinTimer();
        callbacks.abortJoin();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const scheduleJoinDeadline = (durationMs = timeoutMs) => {
        this.clearJoinTimer();
        if (durationMs <= 0 || this.settled) return;
        this.joinDeadlineTimer = setTimeout(() => {
          if (this.settled) return;
          if (this.isHeldForPairing) {
            if (Date.now() - this.lastKeepAliveAt < 8000) {
              scheduleJoinDeadline(4000);
              return;
            }
            finishFailure(new Error('Host stopped responding during pairing code confirmation.'));
            return;
          }

          const ch = this.channel;
          if (ch && (ch.connected || ch.isOpen)) {
            finishSuccess();
            return;
          }
          finishFailure(
            buildJoinTimeoutError(
              cleanRoomId,
              timeoutMs,
              this.sdpOfferReceived,
              this.signalingHandler ? this.signalingHandler.status : undefined
            )
          );
        }, durationMs);
      };

      scheduleJoinDeadline(timeoutMs);

      const clientController = new ClientSessionController(
        {
          roomId: cleanRoomId,
          playerName: options.playerName,
          colorSlot: options.colorSlot,
          colorHex: options.colorHex,
          allowSpectatorRelay,
        },
        {
          onConnected: async (channel, peerName, pairingCode) => {
            const handler = this.signalingHandler;
            const resolvedPairingCode =
              pairingCode || (handler ? handler.getPairingCodeForPeer() : null) || undefined;
            const activeRelayLabel = (handler ? handler.getActiveRelayLabel() : null) || undefined;
            callbacks.updateSessionStatus({
              signalingConnected: true,
              pairingCode: resolvedPairingCode,
              activeRelayLabel,
              connectedPeers: [
                {
                  id: 'host',
                  name: peerName,
                  pingMs: 0,
                  pairingCode: resolvedPairingCode,
                },
              ],
            });
            if (callbacks.joinServer) {
              await callbacks.joinServer({
                channel,
                playerName: options.playerName,
                remotePlayerName: peerName,
                pairingCode: resolvedPairingCode,
              });
            }
            finishSuccess();
          },
          onDisconnected: () => {
            callbacks.updateSessionStatus({ connectedPeers: [] });
            if (!this.settled) {
              finishFailure(new Error('P2P channel disconnected'));
            } else if (callbacks.notifyUnexpectedDisconnect) {
              callbacks.notifyUnexpectedDisconnect();
            }
          },
          onIceCandidate: (cand) => {
            if (this.signalingHandler) {
              void this.signalingHandler.sendCandidate(null, cand);
            }
          },
        }
      );
      this.clientController = clientController;

      try {
        await clientController.initializeChannel();
      } catch (e) {
        console.error(
          '[ClientJoinNegotiationSubController] Failed to initialize client channel:',
          e
        );
        return finishFailure(e);
      }

      const signalingCallbacks: SignalingProtocolCallbacks = {
        handleOpen: ({ relayLabel }) => {
          callbacks.updateSessionStatus({
            signalingConnected: true,
            roomId: cleanRoomId,
            activeRelayLabel: relayLabel,
          });
        },
        handleRendezvousEstablished: ({ relayLabel, pairingCode, requireManualApproval }) => {
          this.lastKeepAliveAt = Date.now();
          callbacks.updateSessionStatus({
            pairingCode,
            activeRelayLabel: relayLabel,
          });
          if (requireManualApproval) {
            this.isHeldForPairing = true;
            scheduleJoinDeadline(6000);
          }
        },
        handlePairingHold: () => {
          this.isHeldForPairing = true;
          this.lastKeepAliveAt = Date.now();
          scheduleJoinDeadline(6000);
        },
        handlePairingKeepAlive: () => {
          this.lastKeepAliveAt = Date.now();
          if (this.isHeldForPairing) {
            scheduleJoinDeadline(6000);
          }
        },
        handlePairingApproved: () => {
          this.isHeldForPairing = false;
          this.lastKeepAliveAt = Date.now();
          scheduleJoinDeadline(timeoutMs);
        },
        handlePairingDeclined: ({ reason }) => {
          this.isHeldForPairing = false;
          finishFailure(
            new Error(reason || 'Connection declined by Host during pairing verification.')
          );
        },
        handleError: () => {
          const ch = this.channel;
          if (!ch || !ch.connected) {
            callbacks.updateSessionStatus({ signalingConnected: false });
          }
        },
        handleOffer: async ({ sdp, fromPeerId, pairingCode }) => {
          try {
            this.isHeldForPairing = false;
            this.sdpOfferReceived = true;
            scheduleJoinDeadline(Math.max(6000, timeoutMs));
            if (this.clientController) {
              await this.clientController.handleOffer(sdp, fromPeerId, this.signalingHandler, {
                pairingCode,
              });
            }
          } catch (err) {
            console.error('[ClientJoinNegotiationSubController] Error handling host offer:', err);
            finishFailure(err);
          }
        },
        handleCandidate: ({ candidate }) => {
          if (this.clientController) {
            this.clientController.handleRemoteCandidate(candidate);
          }
        },
        handlePeerJoined: ({ peerId, name }) => {
          const ctrl = this.clientController;
          if (ctrl && ctrl.allowSpectatorRelay) {
            void ctrl.acceptDownstreamSpectatorPeer(peerId, name, this.signalingHandler);
          }
        },
      };

      const signalingHandler = new SignalingProtocolHandler(
        {
          roomId: cleanRoomId,
          password: joinPassword,
          role: 'client',
          playerName: options.playerName,
          allowSpectatorRelay,
        },
        signalingCallbacks
      );
      this.signalingHandler = signalingHandler;

      try {
        await signalingHandler.connect(timeoutMs);
      } catch (sigErr: unknown) {
        console.warn(
          '[ClientJoinNegotiationSubController] Signaling connection notice:',
          sigErr instanceof Error ? sigErr.message : sigErr
        );
        const ch = this.channel;
        if (!ch || (!ch.connected && !ch.isOpen)) {
          finishFailure(sigErr);
        }
      }
    });
  }

  cleanup(): void {
    this.settled = true;
    this.isHeldForPairing = false;
    this.clearJoinTimer();
    if (this.signalingHandler) {
      this.signalingHandler.cleanup();
      this.signalingHandler = null;
    }
    if (this.clientController) {
      this.clientController.cleanup();
      this.clientController = null;
    }
  }
}
