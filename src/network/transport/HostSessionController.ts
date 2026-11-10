/**
 * HostSessionController.ts
 * Headless Multi-Peer Host Session Controller for managing WebRTC P2P hosting,
 * multi-channel negotiation (up to 6 player input channels + N spectator broadcast channels),
 * spectator daisy-chain relay coordination, and two-phase ready barrier coordination.
 */

import { P2PWebRTCChannel } from './P2PWebRTCChannel.ts';
import { SpectatorDaisyChainCoordinator } from './SpectatorDaisyChainCoordinator.ts';

export const DEFAULT_MAX_INPUT_CHANNELS = 6;
export const DEFAULT_MAX_BROADCAST_CHANNELS = 16;

export interface HostSessionOptions {
  roomId: string;
  playerName: string;
  colorSlot?: number;
  colorHex?: string;
  maxInputChannels?: number;
  maxBroadcastChannels?: number;
}

export interface HostSignalingPort {
  peerId?: string;
  sendOffer: (targetPeerId: string, offerToken: string) => unknown;
  sendRelayAssignment?: (targetPeerId: string, relayPlan: unknown) => Promise<unknown>;
}

export interface HostSessionCallbacks {
  onPeerConnected?: (
    ch: P2PWebRTCChannel,
    resolvedName: string,
    peerId: string,
    assignedRole: string
  ) => Promise<number | void> | number | void;
  onPeerDisconnected?: (peerId: string, ch: P2PWebRTCChannel) => void;
  onColorChange?: (carIdx: number, slotId: number | null, hex: string | null) => void;
  onIceCandidate?: (cand: RTCIceCandidateInit | Record<string, unknown>, peerId: string) => void;
}

export interface ConnectedPeerSummary {
  id: string;
  name: string;
  role: string;
  carIndex?: number;
  pingMs: number;
  pairingCode?: string;
  allowSpectatorRelay: boolean;
  ready: boolean;
  arenaLoaded: boolean;
}

export class HostSessionController {
  roomId: string;
  playerName: string;
  colorSlot: number;
  colorHex: string;
  maxInputChannels: number;
  maxBroadcastChannels: number;
  callbacks: HostSessionCallbacks;

  channel: P2PWebRTCChannel | null = null;
  peerChannels = new Map<string, P2PWebRTCChannel>();
  peerRoles = new Map<string, string>();
  peerReadyStates = new Map<string, { ready: boolean; arenaLoaded: boolean }>();
  peerPairingCodes = new Map<string, string>();
  daisyChainCoordinator = new SpectatorDaisyChainCoordinator();
  offerToken = '';
  offersSentTime = new Map<string, number>();
  _nextPeerSeq = 1;

  constructor(options: HostSessionOptions, callbacks: HostSessionCallbacks = {}) {
    this.roomId = options.roomId;
    this.playerName = options.playerName;
    this.colorSlot = options.colorSlot ?? 3;
    this.colorHex = options.colorHex ?? '#42a5f5';
    this.maxInputChannels = options.maxInputChannels ?? DEFAULT_MAX_INPUT_CHANNELS;
    this.maxBroadcastChannels = options.maxBroadcastChannels ?? DEFAULT_MAX_BROADCAST_CHANNELS;
    this.callbacks = callbacks;
  }

  _createPeerChannel(
    peerId: string,
    peerName = 'Player',
    preferredRole = 'player',
    metadata: { pairingCode?: string; allowSpectatorRelay?: boolean } = {}
  ): P2PWebRTCChannel {
    const ch = new P2PWebRTCChannel({
      role: 'host',
      roomId: this.roomId,
      playerName: this.playerName,
      colorSlot: this.colorSlot,
      colorHex: this.colorHex,
      extraLatencyMs: 0,
    });
    ch.peerId = peerId;
    ch.peerName = peerName;
    ch.pairingCode = metadata.pairingCode || null;
    ch.allowSpectatorRelay = metadata.allowSpectatorRelay !== false;

    const currentPlayerCount = this.getInputChannelCount();
    const assignedRole =
      preferredRole === 'spectator' || currentPlayerCount >= this.maxInputChannels
        ? 'spectator'
        : 'player';
    ch.peerRole = assignedRole;

    this.peerChannels.set(peerId, ch);
    this.peerRoles.set(peerId, assignedRole);
    this.peerReadyStates.set(peerId, { ready: false, arenaLoaded: false });
    if (metadata.pairingCode) {
      this.peerPairingCodes.set(peerId, metadata.pairingCode);
    }

    ch.onConnected = async () => {
      const resolvedName = ch.peerName || peerName || 'Player 2';
      this.daisyChainCoordinator.registerRelayNode(peerId, {
        playerName: resolvedName,
        role: assignedRole,
        allowSpectatorRelay: ch.allowSpectatorRelay,
        rttMs: Math.round(ch.measuredRttMs || ch.rttMs || 20),
      });
      if (this.callbacks.onPeerConnected) {
        const assignedCarIdx = await this.callbacks.onPeerConnected(
          ch,
          resolvedName,
          peerId,
          assignedRole
        );
        if (typeof assignedCarIdx === 'number' && assignedCarIdx >= 0) {
          ch.carIndex = assignedCarIdx;
        }
      }
      ch.sendColorChange(this.colorSlot, this.colorHex, 0);
      if (ch.peerColorHex) {
        this.callbacks.onColorChange?.(ch.carIndex ?? 1, ch.peerColorSlot, ch.peerColorHex);
      }
    };

    ch.onDisconnected = () => {
      this.peerReadyStates.delete(peerId);
      this.peerPairingCodes.delete(peerId);
      this.daisyChainCoordinator.unregisterNode(peerId);
      this.callbacks.onPeerDisconnected?.(peerId, ch);
    };

    ch.onColorChange = (msg: { carIndex?: number; slotId: number | null; hex: string | null }) => {
      const cIdx = msg.carIndex ?? ch.carIndex ?? 1;
      if (msg.slotId !== undefined) {
        ch.peerColorSlot = msg.slotId;
      }
      if (msg.hex !== undefined) {
        ch.peerColorHex = msg.hex;
      }
      this.callbacks.onColorChange?.(cIdx, msg.slotId, msg.hex);
    };

    ch.onIceCandidate = (cand: RTCIceCandidateInit | Record<string, unknown>) => {
      this.callbacks.onIceCandidate?.(cand, peerId);
    };

    return ch;
  }

  getInputChannelCount(): number {
    let count = 0;
    for (const [peerId, role] of this.peerRoles.entries()) {
      const ch = this.peerChannels.get(peerId);
      if (ch && role === 'player') {
        count++;
      }
    }
    return count;
  }

  getConnectedPeerList(): ConnectedPeerSummary[] {
    const list: ConnectedPeerSummary[] = [];
    for (const [peerId, ch] of this.peerChannels.entries()) {
      if (ch.connected || ch.isOpen) {
        const readyInfo = this.peerReadyStates.get(peerId) || { ready: false, arenaLoaded: false };
        list.push({
          id: peerId,
          name: ch.peerName || 'Player',
          role: this.peerRoles.get(peerId) || 'player',
          carIndex: typeof ch.carIndex === 'number' ? ch.carIndex : undefined,
          pingMs: Math.round(ch.measuredRttMs || ch.rttMs || 0),
          pairingCode: ch.pairingCode || this.peerPairingCodes.get(peerId) || undefined,
          allowSpectatorRelay: Boolean(ch.allowSpectatorRelay),
          ready: readyInfo.ready,
          arenaLoaded: readyInfo.arenaLoaded,
        });
      }
    }
    return list;
  }

  async initializeChannel(): Promise<string> {
    this.cleanup();

    const defaultPeerId = 'peer_1';
    this.channel = this._createPeerChannel(defaultPeerId, 'Player 2', 'player');

    this.offerToken = await this.channel.createOfferToken({
      roomId: this.roomId,
      hostColorSlot: this.colorSlot,
      hostColorHex: this.colorHex,
    });

    return this.offerToken;
  }

  async dispatchOfferToPeer(
    peerId: string,
    peerName: string | undefined,
    signalingClient: HostSignalingPort | null | undefined,
    role = 'player',
    metadata: { pairingCode?: string; allowSpectatorRelay?: boolean } = {}
  ): Promise<void> {
    if (!peerId || !signalingClient || peerId === signalingClient.peerId) return;
    if (this.peerChannels.size >= this.maxBroadcastChannels && !this.peerChannels.has(peerId)) {
      console.warn(
        `[HostSessionController] Broadcast channel limit (${this.maxBroadcastChannels}) reached; rejecting peer ${peerId}`
      );
      return;
    }

    const now = Date.now();
    const lastSent = this.offersSentTime.get(peerId) || 0;
    if (now - lastSent < 2500) {
      return;
    }
    this.offersSentTime.set(peerId, now);

    if (metadata.pairingCode) {
      this.peerPairingCodes.set(peerId, metadata.pairingCode);
    }

    const currentPlayerCount = this.getInputChannelCount();
    const effectiveRole =
      role === 'spectator' || currentPlayerCount >= this.maxInputChannels ? 'spectator' : 'player';

    if (
      effectiveRole === 'spectator' &&
      typeof signalingClient.sendRelayAssignment === 'function'
    ) {
      const relayPlan = this.daisyChainCoordinator.selectUpstreamRelayForSpectator(
        peerId,
        currentPlayerCount,
        signalingClient.peerId
      );
      if (relayPlan.mode === 'daisy_chain' && relayPlan.upstreamPeerId !== signalingClient.peerId) {
        signalingClient.sendRelayAssignment(peerId, relayPlan).catch(() => {});
      }
    }

    let targetChannel = this.peerChannels.get(peerId);

    if (!targetChannel) {
      const prewarmed = this.peerChannels.get('peer_1');
      if (
        prewarmed &&
        !prewarmed.connected &&
        !prewarmed.isOpen &&
        (!prewarmed.connection.pc || prewarmed.connection.pc.signalingState === 'have-local-offer')
      ) {
        this.peerChannels.delete('peer_1');
        const prevRole = effectiveRole || this.peerRoles.get('peer_1') || role;
        this.peerRoles.delete('peer_1');
        const prevReady = this.peerReadyStates.get('peer_1') || {
          ready: false,
          arenaLoaded: false,
        };
        this.peerReadyStates.delete('peer_1');

        prewarmed.peerId = peerId;
        prewarmed.peerName = peerName || 'Player 2';
        prewarmed.pairingCode = metadata.pairingCode || null;
        prewarmed.allowSpectatorRelay = metadata.allowSpectatorRelay !== false;
        this.peerChannels.set(peerId, prewarmed);
        this.peerRoles.set(peerId, prevRole);
        this.peerReadyStates.set(peerId, prevReady);
        targetChannel = prewarmed;
      } else {
        targetChannel = this._createPeerChannel(
          peerId,
          peerName || `Player ${++this._nextPeerSeq}`,
          effectiveRole,
          metadata
        );
      }
    } else if (metadata.pairingCode) {
      targetChannel.pairingCode = metadata.pairingCode;
    }

    let token = targetChannel.offerToken;
    if (!token) {
      token = await targetChannel.createOfferToken({
        roomId: this.roomId,
        hostColorSlot: this.colorSlot,
        hostColorHex: this.colorHex,
      });
      if (!this.offerToken) {
        this.offerToken = token;
      }
    }

    if (token) {
      signalingClient.sendOffer(peerId, token);
    }
  }

  async handleAnswer(
    sdp: string,
    fromPeerId: string | null = null,
    metadata: { pairingCode?: string } = {}
  ): Promise<void> {
    let targetChannel = fromPeerId ? this.peerChannels.get(fromPeerId) || null : null;
    if (!targetChannel) {
      for (const ch of this.peerChannels.values()) {
        if (!ch.connected && (!ch.connection.pc || ch.connection.pc.signalingState !== 'stable')) {
          targetChannel = ch;
          break;
        }
      }
      if (!targetChannel) {
        targetChannel = this.channel;
      }
    }

    if (!targetChannel) {
      throw new Error('[HostSessionController] Cannot handle answer: channel is not initialized');
    }
    if (metadata.pairingCode) {
      targetChannel.pairingCode = metadata.pairingCode;
      if (fromPeerId) this.peerPairingCodes.set(fromPeerId, metadata.pairingCode);
    }
    return targetChannel.acceptAnswerToken(sdp);
  }

  handleRemoteCandidate(
    candidate: RTCIceCandidateInit | Record<string, unknown> | null | undefined,
    fromPeerId: string | null = null
  ): void {
    if (!candidate) return;
    if (fromPeerId && this.peerChannels.has(fromPeerId)) {
      this.peerChannels.get(fromPeerId)!.addIceCandidate(candidate);
      return;
    }
    if (this.channel) {
      this.channel.addIceCandidate(candidate);
    }
    for (const ch of this.peerChannels.values()) {
      if (ch !== this.channel && !ch.connected) {
        ch.addIceCandidate(candidate);
      }
    }
  }

  broadcastMatchPrepare(matchConfig: Record<string, unknown> = {}): void {
    const msg = JSON.stringify({
      type: 'match_prepare',
      roomId: this.roomId,
      timestamp: Date.now(),
      ...matchConfig,
    });
    for (const state of this.peerReadyStates.values()) {
      state.arenaLoaded = false;
    }
    for (const ch of this.peerChannels.values()) {
      if (ch.connected || ch.isOpen) {
        ch.send(msg);
      }
    }
  }

  recordPeerReadyState(
    peerId: string,
    update: { ready?: boolean; arenaLoaded?: boolean } = {}
  ): { allReady: boolean; allArenaLoaded: boolean } {
    const current = this.peerReadyStates.get(peerId) || { ready: false, arenaLoaded: false };
    if (update.ready !== undefined) current.ready = Boolean(update.ready);
    if (update.arenaLoaded !== undefined) current.arenaLoaded = Boolean(update.arenaLoaded);
    this.peerReadyStates.set(peerId, current);

    let allReady = true;
    let allArenaLoaded = true;
    let activePlayerPeers = 0;

    for (const [id, ch] of this.peerChannels.entries()) {
      if ((ch.connected || ch.isOpen) && this.peerRoles.get(id) === 'player') {
        activePlayerPeers++;
        const st = this.peerReadyStates.get(id) || { ready: false, arenaLoaded: false };
        if (!st.ready) allReady = false;
        if (!st.arenaLoaded) allArenaLoaded = false;
      }
    }

    return {
      allReady: activePlayerPeers > 0 && allReady,
      allArenaLoaded: activePlayerPeers > 0 && allArenaLoaded,
    };
  }

  cleanup(): void {
    this.offersSentTime.clear();
    this.peerRoles.clear();
    this.peerReadyStates.clear();
    this.peerPairingCodes.clear();
    this.daisyChainCoordinator.clear();
    for (const ch of this.peerChannels.values()) {
      try {
        ch.destroy();
      } catch (err) {
        console.warn('[HostSessionController] Error destroying peer channel:', err);
      }
    }
    this.peerChannels.clear();
    this.channel = null;
    this.offerToken = '';
  }
}
