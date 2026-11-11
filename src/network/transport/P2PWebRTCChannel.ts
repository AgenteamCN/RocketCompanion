/**
 * P2PWebRTCChannel.ts
 * High-Speed Direct Transport & WebRTC Facade Layer.
 * Coordinates modular sub-layers (NetworkSimulator, CrossTabSignaling, WebRTCConnection,
 * HandshakeSession, and DataChannelTransport) via narrow typed ports.
 */

import {
  NetworkSimulator,
  type NetworkSimulatorOptions,
  type SimulatedPayload,
} from './webrtc/NetworkSimulator.ts';
import { CrossTabSignaling } from './webrtc/CrossTabSignaling.ts';
import { WebRTCConnection } from './webrtc/WebRTCConnection.ts';
import type { IceCandidateDescriptor } from './webrtc/SdpUtils.ts';
import { HandshakeSession, type HandshakeMetadataState } from './webrtc/HandshakeSession.ts';
import { DataChannelTransport } from './webrtc/DataChannelTransport.ts';

export interface P2PWebRTCChannelOptions extends NetworkSimulatorOptions {
  role?: string;
  playerName?: string;
  roomId?: string | null;
  colorSlot?: number;
  colorHex?: string;
  signalingChannelName?: string;
}

export type ChannelHook<T extends unknown[] = []> = ((...args: T) => void) | null;

export class P2PWebRTCChannel implements HandshakeMetadataState {
  role: string;
  peerId: string | null = null;
  peerRole?: string;
  carIndex?: number;
  pairingCode: string | null = null;
  allowSpectatorRelay = true;
  playerName: string;
  roomId: string | null;
  localColorSlot: number;
  localColorHex: string;
  peerColorSlot: number | null = null;
  peerColorHex: string | null = null;
  peerName: string | null = null;
  pendingColorChange?: { slotId: number; hex: string; carIndex: number };

  isOpen = false;
  isCrossTab = false;
  isWebRTC = false;
  transportMode = 'none';

  dataChannel: RTCDataChannel | null = null;
  offerToken = '';
  answerToken = '';

  readonly simulator: NetworkSimulator;
  stats: NetworkSimulator['stats'];
  declare extraRttMs: number;
  declare baseMeasuredRttMs: number;
  declare measuredJitterMs: number;
  declare latencyMs: number;

  readonly signaling: CrossTabSignaling;
  readonly connection: WebRTCConnection;
  readonly handshake: HandshakeSession;
  readonly transport: DataChannelTransport;

  onConnected: ChannelHook = null;
  onDisconnected: ChannelHook = null;
  onPacketReceived: ChannelHook<[SimulatedPayload]> = null;
  onMessage: ChannelHook<[SimulatedPayload]> = null;
  onColorChange: ChannelHook<[Record<string, unknown>]> = null;
  onDiagnosticFleetToggle: ChannelHook<[boolean, string]> = null;
  onBroadcastSignal: ChannelHook<[Record<string, unknown>]> = null;
  onIceCandidate: ChannelHook<[IceCandidateDescriptor]> = null;

  readonly send: DataChannelTransport['send'];
  readonly sendClientInput: DataChannelTransport['sendClientInput'];
  readonly sendServerState: DataChannelTransport['send'];
  readonly sendColorChange: DataChannelTransport['sendColorChange'];
  readonly sendDiagnosticFleetToggle: DataChannelTransport['sendDiagnosticFleetToggle'];
  readonly receiveServerPackets: NetworkSimulator['drainInboundQueue'];
  readonly receiveClientPackets: NetworkSimulator['drainInboundQueue'];

  readonly createOfferToken: HandshakeSession['createOfferToken'];
  readonly acceptOfferAndCreateAnswer: HandshakeSession['acceptOfferAndCreateAnswer'];
  readonly acceptAnswerToken: HandshakeSession['acceptAnswerToken'];
  readonly addIceCandidate: (
    candJson: IceCandidateDescriptor | RTCIceCandidateInit | Record<string, unknown>
  ) => Promise<void>;

  readonly setAsymmetricLatency: NetworkSimulator['setAsymmetricLatency'];
  readonly setExtraLatency: NetworkSimulator['setExtraLatency'];
  readonly setJitter: NetworkSimulator['setJitter'];
  readonly setPacketLossRate: NetworkSimulator['setPacketLossRate'];
  readonly setBurstDrop: NetworkSimulator['setBurstDrop'];
  readonly toggleBurstDrop: NetworkSimulator['toggleBurstDrop'];
  readonly forceDropNextInput: NetworkSimulator['forceDropNextInput'];

  constructor(options: P2PWebRTCChannelOptions = {}) {
    this.role = options.role ?? 'client';
    this.playerName = options.playerName ?? 'Player';
    this.roomId = options.roomId ?? null;
    this.localColorSlot = options.colorSlot ?? (this.role === 'host' ? 3 : 0);
    this.localColorHex = options.colorHex ?? (this.role === 'host' ? '#42a5f5' : '#ff7043');

    this.simulator = new NetworkSimulator(options);
    this.stats = this.simulator.stats;
    this.signaling = new CrossTabSignaling({
      signalingChannelName: options.signalingChannelName ?? 'online_discovery',
      roomId: this.roomId,
    });
    this.connection = new WebRTCConnection({
      emitIceCandidate: (cand) => {
        if (this.onIceCandidate) this.onIceCandidate(cand);
      },
      handleConnectionStateChange: (state) => {
        if (state === 'connected') {
          this.isWebRTC = true;
          this.isOpen = true;
          this.transportMode = 'webrtc';
        } else if (state === 'failed') {
          this.handleWebRtcFailureDisconnect();
        }
      },
      handleIceConnectionStateChange: (state) => {
        if (state === 'failed') this.handleWebRtcFailureDisconnect();
      },
      broadcastSignal: (typ, payload) => this.broadcastSignal(typ, payload),
    });

    this.transport = new DataChannelTransport({
      simulator: this.simulator,
      signaling: this.signaling,
      getDataChannel: () => this.dataChannel,
      setDataChannel: (dc) => {
        this.dataChannel = dc;
      },
      isChannelOpen: () => this.isOpen,
      isCrossTabActive: () => this.isCrossTab,
      markDataChannelOpen: () => {
        this.isWebRTC = true;
        this.isOpen = true;
        this.transportMode = 'webrtc';
        if (this.onConnected) this.onConnected();
      },
      markDataChannelClosed: () => {
        this.isOpen = false;
        if (this.onDisconnected) this.onDisconnected();
      },
      updateLocalColor: (slotId, hex, pendingIfClosed) => {
        this.localColorSlot = slotId;
        this.localColorHex = hex;
        if (pendingIfClosed) this.pendingColorChange = pendingIfClosed;
      },
      deliverColorChange: (msg) => {
        if (this.onColorChange) this.onColorChange(msg);
      },
      deliverDiagnosticFleetToggle: (enabled, anchorMode) => {
        if (this.onDiagnosticFleetToggle) this.onDiagnosticFleetToggle(enabled, anchorMode);
      },
      deliverPacket: (delivered) => {
        if (this.onPacketReceived) this.onPacketReceived(delivered);
        if (this.onMessage) this.onMessage(delivered);
      },
    });

    this.handshake = new HandshakeSession({
      connection: this.connection,
      signaling: this.signaling,
      simulator: this.simulator,
      getState: () => this,
      applyHandshakeState: (patch) => this.applyHandshakePatch(patch),
      activateCrossTabTransport: (peerPatch) => {
        this.peerName = peerPatch.peerName;
        this.peerColorSlot = peerPatch.peerColorSlot;
        this.peerColorHex = peerPatch.peerColorHex;
        this.isCrossTab = true;
        this.transportMode = 'crosstab';
        const wasOpen = this.isOpen;
        this.isOpen = true;
        if (!wasOpen) {
          queueMicrotask(() => {
            if (this.onConnected) this.onConnected();
          });
        }
      },
      bindDataChannel: (channel) => this.transport.bindDataChannel(channel),
      handleIncomingMessage: (data) => this.transport.handleIncomingMessage(data),
      sendPong: (sendTime) => this.transport.sendPong(sendTime),
      deliverColorChange: (msg) => {
        if (this.onColorChange) this.onColorChange(msg);
      },
      deliverBroadcastSignal: (msg) => {
        if (this.onBroadcastSignal) this.onBroadcastSignal(msg);
      },
    });

    this.signaling.handler = this.handshake;
    this.send = this.transport.send.bind(this.transport);
    this.sendClientInput = this.transport.sendClientInput.bind(this.transport);
    this.sendServerState = this.transport.send.bind(this.transport);
    this.sendColorChange = this.transport.sendColorChange.bind(this.transport);
    this.sendDiagnosticFleetToggle = this.transport.sendDiagnosticFleetToggle.bind(this.transport);
    this.receiveServerPackets = this.simulator.drainInboundQueue.bind(this.simulator);
    this.receiveClientPackets = this.simulator.drainInboundQueue.bind(this.simulator);

    this.createOfferToken = this.handshake.createOfferToken.bind(this.handshake);
    this.acceptOfferAndCreateAnswer = this.handshake.acceptOfferAndCreateAnswer.bind(
      this.handshake
    );
    this.acceptAnswerToken = this.handshake.acceptAnswerToken.bind(this.handshake);
    this.addIceCandidate = (candJson) =>
      this.connection.addRemoteCandidate(candJson as IceCandidateDescriptor);

    this.setAsymmetricLatency = this.simulator.setAsymmetricLatency.bind(this.simulator);
    this.setExtraLatency = this.simulator.setExtraLatency.bind(this.simulator);
    this.setJitter = this.simulator.setJitter.bind(this.simulator);
    this.setPacketLossRate = this.simulator.setPacketLossRate.bind(this.simulator);
    this.setBurstDrop = this.simulator.setBurstDrop.bind(this.simulator);
    this.toggleBurstDrop = this.simulator.toggleBurstDrop.bind(this.simulator);
    this.forceDropNextInput = this.simulator.forceDropNextInput.bind(this.simulator);
  }

  private applyHandshakePatch(patch: Partial<HandshakeMetadataState>): void {
    if (patch.role !== undefined) this.role = patch.role;
    if (patch.roomId !== undefined) this.roomId = patch.roomId;
    if (patch.localColorSlot !== undefined) this.localColorSlot = patch.localColorSlot;
    if (patch.localColorHex !== undefined) this.localColorHex = patch.localColorHex;
    if (patch.peerName !== undefined) this.peerName = patch.peerName;
    if (patch.peerColorSlot !== undefined) this.peerColorSlot = patch.peerColorSlot;
    if (patch.peerColorHex !== undefined) this.peerColorHex = patch.peerColorHex;
    if (patch.offerToken !== undefined) this.offerToken = patch.offerToken;
    if (patch.answerToken !== undefined) this.answerToken = patch.answerToken;
  }

  get connected(): boolean {
    return Boolean(this.isOpen || (this.dataChannel && this.dataChannel.readyState === 'open'));
  }
  get rttMs(): number {
    return this.simulator.rttMs;
  }
  get measuredRttMs(): number {
    return this.simulator.measuredRttMs;
  }
  set measuredRttMs(val: number) {
    if (Number.isFinite(val)) {
      this.simulator.rttMs = val;
    }
  }
  get extraUplinkMs(): number {
    return this.simulator.extraUplinkMs;
  }
  get extraDownlinkMs(): number {
    return this.simulator.extraDownlinkMs;
  }
  get extraLatencyMs(): number {
    return this.simulator.extraLatencyMs;
  }
  get jitterMs(): number {
    return this.simulator.jitterMs;
  }
  get packetLossRate(): number {
    return this.simulator.packetLossRate;
  }

  setColor(slotId: number, hex: string): void {
    this.localColorSlot = slotId;
    this.localColorHex = hex;
  }

  initRoomChannel(roomId: string | null): void {
    this.roomId = roomId;
    this.signaling.initRoomChannel(roomId);
  }

  sendRoomMessage(msg: Record<string, unknown>): boolean {
    return this.signaling.sendRoomMessage(msg, this.peerId);
  }

  private handleWebRtcFailureDisconnect(): void {
    if (this.isCrossTab) return;
    const wasOpen = this.isOpen;
    this.isOpen = false;
    if (wasOpen && this.onDisconnected) this.onDisconnected();
  }

  broadcastSignal(type: string, payload: Record<string, unknown> = {}): boolean {
    return this.signaling.broadcastSignal(type, payload, {
      roomId: this.roomId,
      role: this.role,
      playerName: this.playerName,
    });
  }

  reset(): void {
    this.simulator.reset();
    this.stats = this.simulator.stats;
  }

  destroy(): void {
    this.reset();
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Error closing dataChannel:', err);
      }
    }
    this.connection.destroy();
    this.signaling.destroy();
    this.dataChannel = null;
    this.isOpen = false;
    this.isCrossTab = false;
    this.isWebRTC = false;
  }
}
