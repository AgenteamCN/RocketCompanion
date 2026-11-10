/**
 * HandshakeSession.ts
 * Signaling handshake orchestration, token generation, and room message dispatching.
 */

import type { WebRTCConnection } from './WebRTCConnection.ts';
import type { CrossTabSignaling } from './CrossTabSignaling.ts';
import type { NetworkSimulator } from './NetworkSimulator.ts';
import type { IceCandidateDescriptor } from './SdpUtils.ts';
import {
  DEFAULT_HANDSHAKE_STATE,
  buildHostOfferResult,
  decodeAndValidateOffer,
  decodeAndValidateAnswer,
  buildClientAnswerResult,
  buildCrossTabAckMessage,
  buildCrossTabJoinMessage,
  buildRoomAnswerMessage,
  classifyRoomMessage,
  type HandshakeMetadataState,
  type PeerAppearancePatch,
  type HandshakeSessionEvent,
  type CrossTabActivatedListener,
  type DataChannelBoundListener,
  type IncomingPayloadListener,
  type PingReceivedListener,
  type HandshakeJsonListener,
} from './webrtcHandshakePipeline.ts';

export type {
  HandshakeMetadataState,
  PeerAppearancePatch,
  HandshakeSessionEvent,
  CrossTabActivatedListener,
  DataChannelBoundListener,
  IncomingPayloadListener,
  PingReceivedListener,
  HandshakeJsonListener,
};

export interface HandshakeSessionPort {
  connection: WebRTCConnection;
  signaling: CrossTabSignaling;
  simulator: NetworkSimulator;
  getState?: () => HandshakeMetadataState;
  applyHandshakeState?: (patch: Partial<HandshakeMetadataState>) => void;
  onCrossTabActivated?: CrossTabActivatedListener | null;
  activateCrossTabTransport?: CrossTabActivatedListener | null;
  onDataChannelBound?: DataChannelBoundListener | null;
  bindDataChannel?: DataChannelBoundListener | null;
  onIncomingMessage?: IncomingPayloadListener | null;
  handleIncomingMessage?: IncomingPayloadListener | null;
  onPingReceived?: PingReceivedListener | null;
  sendPong?: PingReceivedListener | null;
  onColorChange?: HandshakeJsonListener | null;
  deliverColorChange?: HandshakeJsonListener | null;
  onBroadcastSignal?: HandshakeJsonListener | null;
  deliverBroadcastSignal?: HandshakeJsonListener | null;
}

export class HandshakeSession {
  readonly connection: WebRTCConnection;
  readonly signaling: CrossTabSignaling;
  readonly simulator: NetworkSimulator;
  lastProcessedOfferToken: string | null = null;
  currentAnswerToken: string | null = null;

  onCrossTabActivated: CrossTabActivatedListener | null;
  onDataChannelBound: DataChannelBoundListener | null;
  onIncomingMessage: IncomingPayloadListener | null;
  onPingReceived: PingReceivedListener | null;
  onColorChange: HandshakeJsonListener | null;
  onBroadcastSignal: HandshakeJsonListener | null;

  private localState: HandshakeMetadataState = { ...DEFAULT_HANDSHAKE_STATE };
  private readonly readExternalState: (() => HandshakeMetadataState) | null;
  private readonly writeExternalState: ((patch: Partial<HandshakeMetadataState>) => void) | null;
  private acceptOfferPromise: Promise<string> | null = null;
  private readonly handshakeEvents: HandshakeSessionEvent[] = [];

  constructor(config: HandshakeSessionPort) {
    this.connection = config.connection;
    this.signaling = config.signaling;
    this.simulator = config.simulator;
    this.readExternalState = config.getState ?? null;
    this.writeExternalState = config.applyHandshakeState ?? null;
    this.onCrossTabActivated =
      config.onCrossTabActivated ?? config.activateCrossTabTransport ?? null;
    this.onDataChannelBound = config.onDataChannelBound ?? config.bindDataChannel ?? null;
    this.onIncomingMessage = config.onIncomingMessage ?? config.handleIncomingMessage ?? null;
    this.onPingReceived = config.onPingReceived ?? config.sendPong ?? null;
    this.onColorChange = config.onColorChange ?? config.deliverColorChange ?? null;
    this.onBroadcastSignal = config.onBroadcastSignal ?? config.deliverBroadcastSignal ?? null;
  }

  drainHandshakeEvents(): HandshakeSessionEvent[] {
    if (this.handshakeEvents.length === 0) return [];
    return this.handshakeEvents.splice(0, this.handshakeEvents.length);
  }

  private getStateSnapshot(): HandshakeMetadataState {
    if (this.readExternalState) {
      const ext = this.readExternalState();
      this.localState = { ...ext };
      return ext;
    }
    return this.localState;
  }

  private applyStatePatch(patch: Partial<HandshakeMetadataState>): HandshakeMetadataState {
    this.localState = { ...this.localState, ...patch };
    if (this.writeExternalState) {
      this.writeExternalState(patch);
    }
    return this.getStateSnapshot();
  }

  private bindIncomingDataChannel(dc: RTCDataChannel): void {
    dc.binaryType = 'arraybuffer';
    this.handshakeEvents.push({ type: 'data_channel_bound', channel: dc });
    if (this.onDataChannelBound) {
      this.onDataChannelBound(dc);
    }
  }

  private activateCrossTabSession(peerPatch: PeerAppearancePatch): void {
    this.localState = { ...this.localState, ...peerPatch, isOpen: true };
    this.handshakeEvents.push({ type: 'cross_tab_activated', peerPatch });
    if (this.onCrossTabActivated) {
      this.onCrossTabActivated(peerPatch);
    }
  }

  async createOfferToken(
    options: { roomId?: string; hostColorSlot?: number; hostColorHex?: string } = {}
  ): Promise<string> {
    const prev = this.getStateSnapshot();
    const roomId =
      options.roomId || `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.applyStatePatch({
      role: 'host',
      roomId,
      localColorSlot: options.hostColorSlot ?? prev.localColorSlot,
      localColorHex: options.hostColorHex ?? prev.localColorHex,
    });
    const signaling = this.signaling;
    const connection = this.connection;
    signaling.initRoomChannel(roomId);

    const pc = connection.createPeerConnection();
    let sdp = '';
    if (pc) {
      const dc = pc.createDataChannel('game_net', { ordered: false, maxRetransmits: 0 });
      this.bindIncomingDataChannel(dc);
      sdp = await connection.createOfferDescription();
    }

    const state = this.getStateSnapshot();
    const offerResult = buildHostOfferResult(state, sdp, connection.localCandidates);
    this.applyStatePatch({ offerToken: offerResult.token });
    console.log(offerResult.logLine);
    signaling.broadcastSignal(
      'room_offer',
      offerResult.broadcastPayload,
      offerResult.broadcastContext
    );
    return offerResult.token;
  }

  async acceptOfferAndCreateAnswer(
    offerToken: string,
    options: { clientColorSlot?: number; clientColorHex?: string } = {}
  ): Promise<string> {
    if (this.lastProcessedOfferToken === offerToken && this.currentAnswerToken) {
      return this.currentAnswerToken;
    }
    if (this.acceptOfferPromise) {
      return this.acceptOfferPromise;
    }

    this.acceptOfferPromise = (async () => {
      const prev = this.getStateSnapshot();
      const { offerData, roomId, statePatch } = decodeAndValidateOffer(offerToken, prev, options);
      const state = this.applyStatePatch(statePatch);
      const signaling = this.signaling;
      const connection = this.connection;

      if (roomId) {
        signaling.initRoomChannel(roomId);
        signaling.sendRoomMessage(buildCrossTabJoinMessage(state), state.peerId);
      }

      connection.setDataChannelHandler((event) => {
        console.log('[P2PWebRTCChannel] Client accepted dataChannel from Host');
        this.bindIncomingDataChannel(event.channel);
      });
      connection.createPeerConnection();

      const sdp = await connection.applyRemoteOfferAndCreateAnswer(offerData);
      const answerResult = buildClientAnswerResult(state, sdp, connection.localCandidates);
      console.log(answerResult.logLine);
      signaling.broadcastSignal(
        'room_answer',
        answerResult.broadcastPayload,
        answerResult.broadcastContext
      );

      this.lastProcessedOfferToken = offerToken;
      this.currentAnswerToken = answerResult.token;
      this.applyStatePatch({ answerToken: answerResult.token });
      return answerResult.token;
    })();

    try {
      return await this.acceptOfferPromise;
    } finally {
      this.acceptOfferPromise = null;
    }
  }

  async acceptAnswerToken(answerToken: string): Promise<void> {
    const connection = this.connection;
    const signaling = this.signaling;
    const pc = connection.pc;
    if (pc && pc.signalingState === 'stable') {
      console.log(
        '[P2PWebRTCChannel] Signaling state is already stable, answer description was already set.'
      );
      return;
    }

    const { answerData, roomToInit, statePatch } = decodeAndValidateAnswer(
      answerToken,
      this.getStateSnapshot()
    );
    const state = this.applyStatePatch(statePatch);
    if (roomToInit) {
      signaling.initRoomChannel(roomToInit);
    }

    signaling.sendRoomMessage(buildCrossTabAckMessage(state, false), state.peerId);
    if (!pc || pc.signalingState === 'stable') return;

    console.log(`[P2PWebRTCChannel] Setting remote answer SDP from ${state.peerName}...`);
    await connection.applyRemoteAnswer(answerData);
    console.log(
      '[P2PWebRTCChannel] Remote answer SDP applied. Signaling state:',
      pc.signalingState
    );
  }

  handleRoomMessage(data: unknown): void {
    const state = this.getStateSnapshot();
    const pc = this.connection.pc;
    const resolved = classifyRoomMessage(data, state, Boolean(pc && pc.currentRemoteDescription));

    switch (resolved.action) {
      case 'ignore':
        return;
      case 'raw_packet':
        this.handshakeEvents.push({ type: 'incoming_message', payload: resolved.payload });
        if (this.onIncomingMessage) {
          this.onIncomingMessage(resolved.payload);
        }
        return;
      case 'cross_tab_join': {
        console.log(resolved.logLine);
        this.activateCrossTabSession(resolved.peerPatch);
        const updated = this.getStateSnapshot();
        this.signaling.sendRoomMessage(buildCrossTabAckMessage(updated, true), updated.peerId);
        return;
      }
      case 'cross_tab_ack': {
        console.log(resolved.logLine);
        this.activateCrossTabSession(resolved.peerPatch);
        if (resolved.offerTokenToAccept) {
          this.acceptOfferAndCreateAnswer(resolved.offerTokenToAccept)
            .then((ans) => {
              const latest = this.getStateSnapshot();
              this.signaling.sendRoomMessage(buildRoomAnswerMessage(latest, ans), latest.peerId);
            })
            .catch((err) => {
              console.error(
                '[P2PWebRTCChannel] Failed to accept offer & create answer in room message:',
                err
              );
            });
        }
        return;
      }
      case 'room_answer':
        console.log(
          `[P2PWebRTCChannel] Host received room_answer via BroadcastChannel from ${resolved.clientName}`
        );
        this.acceptAnswerToken(resolved.sdp).catch((err) => {
          console.warn('[P2PWebRTCChannel] Failed to accept room_answer:', err);
        });
        return;
      case 'color_change': {
        console.log(resolved.logLine);
        this.handshakeEvents.push({ type: 'color_change', payload: resolved.payload });
        if (this.onColorChange) {
          this.onColorChange(resolved.payload);
        }
        return;
      }
      case 'ping':
        this.handshakeEvents.push({ type: 'ping', sendTime: resolved.sendTime });
        if (this.onPingReceived) {
          this.onPingReceived(resolved.sendTime);
        }
        return;
      case 'pong': {
        const sim = this.simulator;
        sim.handlePong(resolved.sendTime);
        return;
      }
    }
  }

  handleBroadcastMessage(msg: Record<string, unknown> | null | undefined): void {
    if (!msg || !msg.type) return;
    const state = this.getStateSnapshot();
    if (msg.senderRole === state.role && msg.senderName === state.playerName) return;

    if (
      msg.type === 'ice_candidate' &&
      msg.candidate &&
      (!msg.roomId || msg.roomId === state.roomId)
    ) {
      const conn = this.connection;
      void conn.addRemoteCandidate(msg.candidate as IceCandidateDescriptor);
    }

    this.handshakeEvents.push({ type: 'broadcast_signal', payload: msg });
    if (this.onBroadcastSignal) {
      this.onBroadcastSignal(msg);
    }
  }
}
