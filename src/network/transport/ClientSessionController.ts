/**
 * ClientSessionController.ts
 * Headless Client Session Controller for managing WebRTC P2P client joining,
 * encrypted offer handling, and downstream P2P spectator daisy-chaining.
 */

import { P2PWebRTCChannel } from './P2PWebRTCChannel.ts';
import { loadActiveHostOffer, getAllowSpectatorDaisyChain } from './signalingRelayConfig.ts';
import {
  CommittedFrameDaisyChainBuffer,
  DEFAULT_COMMITTED_ROLLBACK_WINDOW_MS,
} from './SpectatorDaisyChainCoordinator.ts';

export interface ClientSessionOptions {
  roomId: string;
  playerName: string;
  colorSlot?: number;
  colorHex?: string;
  allowSpectatorRelay?: boolean;
  rollbackCommitWindowMs?: number;
}

export interface ClientSignalingPort {
  sendAnswer: (sdp: string, targetPeerId?: string | null) => unknown;
  sendCandidate: (targetPeerId: string, candidate: unknown) => unknown;
  sendOffer: (targetPeerId: string, offerToken: string) => Promise<unknown> | unknown;
}

export interface ClientSessionCallbacks {
  onConnected?: (
    channel: P2PWebRTCChannel,
    peerName: string,
    pairingCode: string | null
  ) => Promise<void> | void;
  onDisconnected?: () => void;
  onIceCandidate?: (cand: RTCIceCandidateInit | Record<string, unknown>) => void;
}

export class ClientSessionController {
  roomId: string;
  playerName: string;
  colorSlot: number;
  colorHex: string;
  allowSpectatorRelay: boolean;
  callbacks: ClientSessionCallbacks;

  channel: P2PWebRTCChannel | null = null;
  pairingCode: string | null = null;
  answerToken = '';
  _isProcessingOffer = false;

  downstreamSpectatorChannels = new Map<string, P2PWebRTCChannel>();
  committedDaisyChainBuffer: CommittedFrameDaisyChainBuffer;

  constructor(options: ClientSessionOptions, callbacks: ClientSessionCallbacks = {}) {
    this.roomId = options.roomId;
    this.playerName = options.playerName;
    this.colorSlot = options.colorSlot ?? 0;
    this.colorHex = options.colorHex ?? '#ff7043';
    this.allowSpectatorRelay = options.allowSpectatorRelay ?? getAllowSpectatorDaisyChain();
    this.callbacks = callbacks;

    this.committedDaisyChainBuffer = new CommittedFrameDaisyChainBuffer(
      options.rollbackCommitWindowMs ?? DEFAULT_COMMITTED_ROLLBACK_WINDOW_MS
    );
  }

  private getActiveChannel(): P2PWebRTCChannel | null {
    return this.channel;
  }

  async initializeChannel(): Promise<P2PWebRTCChannel> {
    this.cleanup();

    this.channel = new P2PWebRTCChannel({
      role: 'client',
      roomId: this.roomId,
      playerName: this.playerName,
      colorSlot: this.colorSlot,
      colorHex: this.colorHex,
      extraLatencyMs: 0,
    });

    this.channel.initRoomChannel(this.roomId);

    this.channel.onConnected = async () => {
      const active = this.getActiveChannel();
      if (!active) return;
      const peerName = active.peerName || 'Host';
      if (this.callbacks.onConnected) {
        await this.callbacks.onConnected(active, peerName, this.pairingCode);
      }
    };

    this.channel.onDisconnected = () => {
      this.callbacks.onDisconnected?.();
    };

    this.channel.onIceCandidate = (cand) => {
      this.callbacks.onIceCandidate?.(cand);
    };

    this.channel.sendRoomMessage({
      type: 'cross_tab_join',
      clientName: this.playerName,
      clientColorSlot: this.colorSlot,
      clientColorHex: this.colorHex,
    });

    this._checkLocalStorageOffer();

    return this.channel;
  }

  _checkLocalStorageOffer(): void {
    try {
      const hostInfo = loadActiveHostOffer();
      const active = this.getActiveChannel();
      if (hostInfo && hostInfo.roomId === this.roomId && hostInfo.token && active) {
        active
          .acceptOfferAndCreateAnswer(hostInfo.token, {
            clientColorSlot: this.colorSlot,
            clientColorHex: this.colorHex,
          })
          .then((answer) => {
            this.answerToken = answer;
            this.getActiveChannel()?.sendRoomMessage({
              type: 'room_answer',
              sdp: answer,
              roomId: this.roomId,
              clientName: this.playerName,
            });
          })
          .catch((err) => {
            console.warn(
              '[ClientSessionController] Failed to ingest local active host offer:',
              err
            );
          });
      }
    } catch (e) {
      console.warn('[ClientSessionController] Error checking local active host:', e);
    }
  }

  async handleOffer(
    sdp: string,
    fromPeerId: string | null | undefined,
    signalingClient: ClientSignalingPort | null | undefined,
    metadata: { pairingCode?: string } = {}
  ): Promise<void> {
    const active = this.getActiveChannel();
    if (active?.isOpen) return;
    if (this._isProcessingOffer) return;

    this._isProcessingOffer = true;
    try {
      if (metadata.pairingCode) {
        this.pairingCode = metadata.pairingCode;
        if (active) {
          active.pairingCode = metadata.pairingCode;
        }
      }

      if (active?.connected && this.answerToken) {
        signalingClient?.sendAnswer(this.answerToken, fromPeerId || null);
        return;
      }

      if (!active) return;
      const answer = await active.acceptOfferAndCreateAnswer(sdp, {
        clientColorSlot: this.colorSlot,
        clientColorHex: this.colorHex,
      });

      signalingClient?.sendAnswer(answer, fromPeerId || null);
      this.answerToken = answer;
    } catch (err) {
      console.error('[ClientSessionController] Failed to accept host offer:', err);
      throw err;
    } finally {
      this._isProcessingOffer = false;
    }
  }

  handleRemoteCandidate(
    candidate: RTCIceCandidateInit | Record<string, unknown> | null | undefined
  ): void {
    const active = this.getActiveChannel();
    if (candidate && active) {
      active.addIceCandidate(candidate);
    }
  }

  async acceptDownstreamSpectatorPeer(
    spectatorPeerId: string,
    spectatorName: string | undefined,
    signalingClient: ClientSignalingPort | null | undefined
  ): Promise<P2PWebRTCChannel | null> {
    if (!this.allowSpectatorRelay || !spectatorPeerId || !signalingClient) return null;
    let specChannel = this.downstreamSpectatorChannels.get(spectatorPeerId);
    if (!specChannel) {
      specChannel = new P2PWebRTCChannel({
        role: 'host',
        roomId: this.roomId,
        playerName: this.playerName,
        colorSlot: this.colorSlot,
        colorHex: this.colorHex,
      });
      specChannel.peerId = spectatorPeerId;
      specChannel.peerName = spectatorName || 'Spectator';
      specChannel.peerRole = 'spectator';
      specChannel.onDisconnected = () => {
        this.downstreamSpectatorChannels.delete(spectatorPeerId);
      };
      specChannel.onIceCandidate = (cand) => {
        signalingClient.sendCandidate(spectatorPeerId, cand);
      };
      this.downstreamSpectatorChannels.set(spectatorPeerId, specChannel);
    }

    const offerToken = await specChannel.createOfferToken({
      roomId: this.roomId,
      hostColorSlot: this.colorSlot,
      hostColorHex: this.colorHex,
    });
    if (offerToken) {
      await signalingClient.sendOffer(spectatorPeerId, offerToken);
    }
    return specChannel;
  }

  forwardCommittedSnapshotToSpectators(
    packetBuffer: ArrayBuffer | Uint8Array | string,
    serverTick = 0,
    nowMs = performance.now()
  ): void {
    if (!this.allowSpectatorRelay || this.downstreamSpectatorChannels.size === 0) return;
    this.committedDaisyChainBuffer.enqueueVerifiedSnapshot(packetBuffer, serverTick, nowMs);
    const committedList = this.committedDaisyChainBuffer.drainCommittedSnapshots(nowMs);
    if (committedList.length === 0) return;

    for (const item of committedList) {
      for (const specChannel of this.downstreamSpectatorChannels.values()) {
        if (specChannel.connected || specChannel.isOpen) {
          specChannel.send(item.packetBuffer, nowMs);
        }
      }
    }
  }

  sendReadyAck(ready = true): void {
    const active = this.getActiveChannel();
    if (active && (active.connected || active.isOpen)) {
      active.send(
        JSON.stringify({
          type: 'match_ready_ack',
          ready: Boolean(ready),
          playerName: this.playerName,
          timestamp: Date.now(),
        })
      );
    }
  }

  sendArenaLoadedAck(matchSeq = 0): void {
    const active = this.getActiveChannel();
    if (active && (active.connected || active.isOpen)) {
      active.send(
        JSON.stringify({
          type: 'arena_loaded_ack',
          ready: true,
          matchSeq,
          playerName: this.playerName,
          timestamp: Date.now(),
        })
      );
    }
  }

  cleanup(): void {
    this._isProcessingOffer = false;
    this.pairingCode = null;
    this.committedDaisyChainBuffer.clear();
    for (const specChannel of this.downstreamSpectatorChannels.values()) {
      try {
        specChannel.destroy();
      } catch (_) {
        // Ignore destroy error
      }
    }
    this.downstreamSpectatorChannels.clear();
    if (this.channel) {
      try {
        this.channel.destroy();
      } catch (err) {
        console.warn('[ClientSessionController] Error destroying channel:', err);
      }
      this.channel = null;
    }
    this.answerToken = '';
  }
}
