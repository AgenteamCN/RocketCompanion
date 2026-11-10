/**
 * WebRTCConnection.ts
 * RTCPeerConnection lifecycle, SDP negotiation, and ICE candidate handling.
 */

import { injectLoopbackCandidate, type IceCandidateDescriptor } from './SdpUtils.ts';
import { credentialBundleManager } from '../CredentialBundleManager.ts';
import {
  prioritizeLoopbackCandidates,
  prepareRemoteSdpWithLoopback,
  finalizeLocalSdpWithLoopback,
  normalizeGatheredCandidate,
  type SdpHandshakePayload,
} from './dataChannelFramingPipeline.ts';

export type { SdpHandshakePayload };

export type WebRTCConnectionEvent =
  | { readonly type: 'ice_candidate'; readonly candidate: IceCandidateDescriptor }
  | { readonly type: 'connection_state'; readonly state: RTCPeerConnectionState }
  | { readonly type: 'ice_connection_state'; readonly state: RTCIceConnectionState }
  | { readonly type: 'data_channel'; readonly channel: RTCDataChannel };

export type IceCandidateListener = (cand: IceCandidateDescriptor) => void;
export type PeerConnectionStateListener = (state: RTCPeerConnectionState) => void;
export type IceConnectionStateListener = (state: RTCIceConnectionState) => void;
export type DataChannelEventListener = (event: RTCDataChannelEvent) => void;
export type BroadcastSignalEmitter = (type: string, payload: Record<string, unknown>) => void;

export interface WebRTCConnectionOptions {
  onIceCandidate?: IceCandidateListener | null;
  onConnectionStateChange?: PeerConnectionStateListener | null;
  onIceConnectionStateChange?: IceConnectionStateListener | null;
  onDataChannel?: DataChannelEventListener | null;
  onBroadcastSignal?: BroadcastSignalEmitter | null;
  emitIceCandidate?: IceCandidateListener | null;
  handleConnectionStateChange?: PeerConnectionStateListener | null;
  handleIceConnectionStateChange?: IceConnectionStateListener | null;
  handleDataChannel?: DataChannelEventListener | null;
  broadcastSignal?: BroadcastSignalEmitter | null;
}

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
];

export class WebRTCConnection {
  pc: RTCPeerConnection | null = null;
  localCandidates: IceCandidateDescriptor[] = [];
  pendingRemoteCandidates: IceCandidateDescriptor[] = [];
  gatheringPromise: Promise<void> | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';

  onIceCandidate: IceCandidateListener | null;
  onConnectionStateChange: PeerConnectionStateListener | null;
  onIceConnectionStateChange: IceConnectionStateListener | null;
  onDataChannel: DataChannelEventListener | null;
  onBroadcastSignal: BroadcastSignalEmitter | null;

  private readonly eventQueue: WebRTCConnectionEvent[] = [];

  constructor(options: WebRTCConnectionOptions = {}) {
    this.onIceCandidate = options.onIceCandidate ?? options.emitIceCandidate ?? null;
    this.onConnectionStateChange =
      options.onConnectionStateChange ?? options.handleConnectionStateChange ?? null;
    this.onIceConnectionStateChange =
      options.onIceConnectionStateChange ?? options.handleIceConnectionStateChange ?? null;
    this.onDataChannel = options.onDataChannel ?? options.handleDataChannel ?? null;
    this.onBroadcastSignal = options.onBroadcastSignal ?? options.broadcastSignal ?? null;
  }

  setDataChannelHandler(handler: ((event: RTCDataChannelEvent) => void) | null): void {
    this.onDataChannel = handler;
    const activePc = this.pc;
    if (activePc && handler) {
      activePc.ondatachannel = handler;
    }
  }

  drainConnectionEvents(): WebRTCConnectionEvent[] {
    if (this.eventQueue.length === 0) return [];
    return this.eventQueue.splice(0, this.eventQueue.length);
  }

  private dispatchBroadcastSignal(type: string, payload: Record<string, unknown>): void {
    if (this.onBroadcastSignal) {
      this.onBroadcastSignal(type, payload);
    }
  }

  private dispatchIceCandidate(candJson: IceCandidateDescriptor): void {
    this.eventQueue.push({ type: 'ice_candidate', candidate: candJson });
    if (typeof this.onIceCandidate === 'function') {
      try {
        this.onIceCandidate(candJson);
      } catch (err) {
        console.error('[P2PWebRTCChannel] Error in onIceCandidate callback:', err);
      }
    }
  }

  createPeerConnection(): RTCPeerConnection | null {
    if (typeof RTCPeerConnection === 'undefined') {
      console.warn(
        '[P2PWebRTCChannel] RTCPeerConnection is not supported in this environment, using direct channel.'
      );
      return null;
    }

    const customTurnServers = credentialBundleManager.getTurnIceServers();
    const config: RTCConfiguration = {
      iceServers: [...DEFAULT_STUN_SERVERS, ...customTurnServers],
      iceCandidatePoolSize: 2,
    };

    const pc = new RTCPeerConnection(config);
    this.pc = pc;
    this.localCandidates = [];
    this.pendingRemoteCandidates = [];

    pc.onicecandidate = (event) => {
      const localSdp = pc.localDescription ? pc.localDescription.sdp : '';
      if (event.candidate) {
        const extracted = normalizeGatheredCandidate(event.candidate);
        const primaryCand = extracted[0];
        const nextCandidates = [...this.localCandidates, ...extracted];
        const withLoopback = injectLoopbackCandidate(nextCandidates, localSdp);
        this.localCandidates = withLoopback;

        const loopbackCand = withLoopback[0];
        if (loopbackCand && withLoopback.length === 2) {
          this.dispatchBroadcastSignal('ice_candidate', { candidate: loopbackCand });
        }

        const typ =
          primaryCand.type ||
          (primaryCand.candidate ? primaryCand.candidate.split(' ')[7] : 'unknown');
        console.log(`[P2PWebRTCChannel] Candidate #${withLoopback.length} gathered (type: ${typ})`);
        this.dispatchBroadcastSignal('ice_candidate', { candidate: primaryCand });
        this.dispatchIceCandidate(primaryCand);
      } else {
        const withLoopback = injectLoopbackCandidate(this.localCandidates, localSdp);
        this.localCandidates = withLoopback;
        const firstCand = withLoopback[0];
        console.log(
          `[P2PWebRTCChannel] ICE candidate gathering complete (${withLoopback.length} total). Prioritized loopback candidate #0:`,
          firstCand ? firstCand.candidate : undefined
        );
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.connectionState = state;
      this.eventQueue.push({ type: 'connection_state', state });
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      this.iceConnectionState = state;
      this.eventQueue.push({ type: 'ice_connection_state', state });
      if (this.onIceConnectionStateChange) {
        this.onIceConnectionStateChange(state);
      }
    };

    if (this.onDataChannel) {
      pc.ondatachannel = this.onDataChannel;
    }

    return pc;
  }

  waitForIceGathering(timeoutMs = 1200): Promise<void> {
    const pc = this.pc;
    if (!pc || pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        pc.removeEventListener('icecandidate', onCandidate);
      };
      const onStateChange = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup();
          resolve();
        }
      };
      const onCandidate = (event: RTCPeerConnectionIceEvent) => {
        if (!event.candidate) {
          cleanup();
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onStateChange);
      pc.addEventListener('icecandidate', onCandidate);

      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);
    });
  }

  async addRemoteCandidate(candJson: IceCandidateDescriptor | null | undefined): Promise<void> {
    if (!candJson) return;
    const pc = this.pc;
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        const c =
          typeof RTCIceCandidate !== 'undefined'
            ? new RTCIceCandidate(candJson as RTCIceCandidateInit)
            : (candJson as RTCIceCandidateInit);
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Failed to add ICE candidate:', err);
      }
    } else {
      const pending = this.pendingRemoteCandidates;
      pending.push(candJson);
    }
  }

  async flushPendingCandidates(): Promise<void> {
    const pc = this.pc;
    const queued = this.pendingRemoteCandidates;
    if (!pc || queued.length === 0) {
      return;
    }
    this.pendingRemoteCandidates = [];
    for (const cand of queued) {
      try {
        const c =
          typeof RTCIceCandidate !== 'undefined'
            ? new RTCIceCandidate(cand as RTCIceCandidateInit)
            : (cand as RTCIceCandidateInit);
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Failed to add queued ICE candidate:', err);
      }
    }
  }

  private async applyRemoteDescriptionAndCandidates(
    pc: RTCPeerConnection,
    type: 'offer' | 'answer',
    payload: SdpHandshakePayload
  ): Promise<void> {
    const remoteSdp = prepareRemoteSdpWithLoopback(payload);
    await pc.setRemoteDescription(new RTCSessionDescription({ type, sdp: remoteSdp }));
    await this.flushPendingCandidates();

    if (Array.isArray(payload.candidates)) {
      for (const cand of prioritizeLoopbackCandidates(payload.candidates)) {
        await this.addRemoteCandidate(cand);
      }
    }
    await this.flushPendingCandidates();
  }

  private async gatherAndFinalizeLocalSdp(pc: RTCPeerConnection): Promise<string> {
    await this.waitForIceGathering(1200);
    const rawSdp = pc.localDescription ? pc.localDescription.sdp : '';
    const finalized = finalizeLocalSdpWithLoopback(rawSdp, this.localCandidates);
    this.localCandidates = finalized.candidates;
    return finalized.sdp;
  }

  async createOfferDescription(): Promise<string> {
    const pc = this.pc;
    if (!pc) return '';
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return this.gatherAndFinalizeLocalSdp(pc);
  }

  async applyRemoteOfferAndCreateAnswer(offerData: SdpHandshakePayload): Promise<string> {
    const pc = this.pc;
    if (!pc || !offerData.sdp) return '';

    await this.applyRemoteDescriptionAndCandidates(pc, 'offer', offerData);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return this.gatherAndFinalizeLocalSdp(pc);
  }

  async applyRemoteAnswer(answerData: SdpHandshakePayload): Promise<void> {
    const pc = this.pc;
    if (!pc || pc.signalingState === 'stable' || !answerData.sdp) {
      return;
    }
    await this.applyRemoteDescriptionAndCandidates(pc, 'answer', answerData);
  }

  destroy(): void {
    const pc = this.pc;
    if (pc) {
      try {
        pc.close();
      } catch (err) {
        console.warn('[P2PWebRTCChannel] Error closing peerConnection:', err);
      }
      this.pc = null;
    }
    this.localCandidates = [];
    this.pendingRemoteCandidates = [];
    this.eventQueue.length = 0;
  }
}
