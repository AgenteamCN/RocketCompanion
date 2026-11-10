/**
 * webrtcHandshakePipeline.ts
 * Pure SDP loopback preparation, ICE candidate sorting, handshake token synthesis,
 * and cross-tab room/broadcast message classification pipeline.
 */

import type { IceCandidateDescriptor } from './SdpUtils.ts';
import {
  encodeSignalToken,
  decodeSignalToken,
  type DecodedSignalTokenPayload,
} from './SignalTokenCodec.ts';
import type { BroadcastSignalContext } from './CrossTabSignaling.ts';
import type { SimulatedPayload } from './NetworkSimulator.ts';

export interface HandshakeMetadataState {
  role: string;
  isHost?: boolean;
  peerId: string | null;
  playerName: string;
  roomId: string | null;
  localColorSlot: number;
  localColorHex: string;
  peerName: string | null;
  peerColorSlot: number | null;
  peerColorHex: string | null;
  offerToken: string;
  answerToken: string;
  isOpen: boolean;
}

export const DEFAULT_HANDSHAKE_STATE: HandshakeMetadataState = {
  role: 'host',
  isHost: true,
  peerId: null,
  playerName: 'Player 1',
  roomId: null,
  localColorSlot: 0,
  localColorHex: '#3b82f6',
  peerName: null,
  peerColorSlot: null,
  peerColorHex: null,
  offerToken: '',
  answerToken: '',
  isOpen: false,
};

export interface PeerAppearancePatch {
  peerName: string;
  peerColorSlot: number | null;
  peerColorHex: string | null;
}

export type CrossTabActivatedListener = (peerPatch: PeerAppearancePatch) => void;
export type DataChannelBoundListener = (channel: RTCDataChannel) => void;
export type IncomingPayloadListener = (data: SimulatedPayload) => void;
export type PingReceivedListener = (sendTime: number) => void;
export type HandshakeJsonListener = (msg: Record<string, unknown>) => void;

export interface OfferTokenBuildResult {
  token: string;
  logLine: string;
  broadcastPayload: Record<string, unknown>;
  broadcastContext: BroadcastSignalContext;
}

export interface AnswerTokenBuildResult {
  token: string;
  logLine: string;
  broadcastPayload: Record<string, unknown>;
  broadcastContext: BroadcastSignalContext;
}

export type HandshakeSessionEvent =
  | { readonly type: 'data_channel_bound'; readonly channel: RTCDataChannel }
  | { readonly type: 'cross_tab_activated'; readonly peerPatch: PeerAppearancePatch }
  | { readonly type: 'incoming_message'; readonly payload: SimulatedPayload }
  | { readonly type: 'ping'; readonly sendTime: number }
  | { readonly type: 'color_change'; readonly payload: Record<string, unknown> }
  | { readonly type: 'broadcast_signal'; readonly payload: Record<string, unknown> };

export type RoomMessageResolution =
  | { readonly action: 'ignore' }
  | { readonly action: 'raw_packet'; readonly payload: SimulatedPayload }
  | {
      readonly action: 'cross_tab_join';
      readonly peerPatch: PeerAppearancePatch;
      readonly logLine: string;
    }
  | {
      readonly action: 'cross_tab_ack';
      readonly peerPatch: PeerAppearancePatch;
      readonly logLine: string;
      readonly offerTokenToAccept: string | null;
    }
  | { readonly action: 'room_answer'; readonly sdp: string; readonly clientName: string }
  | {
      readonly action: 'color_change';
      readonly payload: Record<string, unknown>;
      readonly logLine: string;
    }
  | { readonly action: 'ping'; readonly sendTime: number }
  | { readonly action: 'pong'; readonly sendTime: number };

export function buildHostOfferResult(
  state: HandshakeMetadataState,
  sdp: string,
  candidates: IceCandidateDescriptor[]
): OfferTokenBuildResult {
  const token =
    'RL_OFFER_' +
    encodeSignalToken({
      type: 'offer',
      roomId: state.roomId,
      sdp,
      candidates,
      hostName: state.playerName,
      hostColorSlot: state.localColorSlot,
      hostColorHex: state.localColorHex,
      version: 2,
    });
  return {
    token,
    logLine: `[P2PWebRTCChannel] Host offer token created (${token.length} chars). Room: ${state.roomId}, Color: slot ${state.localColorSlot} (${state.localColorHex})`,
    broadcastPayload: {
      token,
      roomId: state.roomId,
      hostName: state.playerName,
      hostColorSlot: state.localColorSlot,
      hostColorHex: state.localColorHex,
    },
    broadcastContext: {
      roomId: state.roomId,
      role: state.role,
      playerName: state.playerName,
    },
  };
}

export function decodeAndValidateOffer(
  offerToken: string,
  prev: HandshakeMetadataState,
  options: { clientColorSlot?: number; clientColorHex?: string }
): {
  offerData: DecodedSignalTokenPayload;
  roomId: string | null;
  statePatch: Partial<HandshakeMetadataState>;
} {
  const offerData = decodeSignalToken(offerToken);
  if (!offerData || offerData.type !== 'offer') {
    throw new Error('Invalid offer token: expected offer payload');
  }
  const roomId = offerData.roomId || null;
  const statePatch: Partial<HandshakeMetadataState> = {
    role: 'client',
    roomId,
    localColorSlot: options.clientColorSlot ?? prev.localColorSlot,
    localColorHex: options.clientColorHex ?? prev.localColorHex,
    peerName: offerData.hostName || 'Host',
    ...(offerData.hostColorHex
      ? {
          peerColorHex: offerData.hostColorHex,
          peerColorSlot: offerData.hostColorSlot ?? null,
        }
      : {}),
  };
  return { offerData, roomId, statePatch };
}

export function decodeAndValidateAnswer(
  answerToken: string,
  prev: HandshakeMetadataState
): {
  answerData: DecodedSignalTokenPayload;
  roomToInit: string | null;
  statePatch: Partial<HandshakeMetadataState>;
} {
  const answerData = decodeSignalToken(answerToken);
  if (!answerData || answerData.type !== 'answer') {
    throw new Error('Invalid answer token: expected answer payload');
  }
  const roomToInit = !prev.roomId && answerData.roomId ? answerData.roomId : null;
  const statePatch: Partial<HandshakeMetadataState> = {
    peerName: answerData.clientName || 'Player 2',
    ...(roomToInit ? { roomId: roomToInit } : {}),
    ...(answerData.clientColorHex
      ? {
          peerColorHex: answerData.clientColorHex,
          peerColorSlot: answerData.clientColorSlot ?? null,
        }
      : {}),
  };
  return { answerData, roomToInit, statePatch };
}

export function buildCrossTabAckMessage(
  state: HandshakeMetadataState,
  includeOfferToken: boolean
): Record<string, unknown> {
  return {
    type: 'cross_tab_ack',
    hostName: state.playerName,
    hostColorSlot: state.localColorSlot,
    hostColorHex: state.localColorHex,
    ...(includeOfferToken ? { offerToken: state.offerToken } : {}),
  };
}

export function buildCrossTabJoinMessage(state: HandshakeMetadataState): Record<string, unknown> {
  return {
    type: 'cross_tab_join',
    clientName: state.playerName,
    clientColorSlot: state.localColorSlot,
    clientColorHex: state.localColorHex,
  };
}

export function buildRoomAnswerMessage(
  state: HandshakeMetadataState,
  sdp: string
): Record<string, unknown> {
  return { type: 'room_answer', senderId: state.peerId, sdp, clientName: state.playerName };
}

export function buildClientAnswerResult(
  state: HandshakeMetadataState,
  sdp: string,
  candidates: IceCandidateDescriptor[]
): AnswerTokenBuildResult {
  const token =
    'RL_ANSWER_' +
    encodeSignalToken({
      type: 'answer',
      roomId: state.roomId,
      sdp,
      candidates,
      clientName: state.playerName,
      clientColorSlot: state.localColorSlot,
      clientColorHex: state.localColorHex,
      version: 2,
    });
  return {
    token,
    logLine: `[P2PWebRTCChannel] Client answer token created (${token.length} chars). Candidates: ${candidates.length}`,
    broadcastPayload: {
      token,
      answerToken: token,
      roomId: state.roomId,
      clientName: state.playerName,
      clientColorSlot: state.localColorSlot,
      clientColorHex: state.localColorHex,
    },
    broadcastContext: {
      roomId: state.roomId,
      role: state.role,
      playerName: state.playerName,
    },
  };
}

export function classifyRoomMessage(
  data: unknown,
  state: HandshakeMetadataState,
  hasRemoteDescription: boolean
): RoomMessageResolution {
  if (!data) return { action: 'ignore' };
  if (data instanceof Uint8Array || data instanceof ArrayBuffer || typeof data === 'string') {
    return { action: 'raw_packet', payload: data };
  }
  if (typeof data !== 'object') return { action: 'ignore' };

  const msg = data as Record<string, unknown>;
  if (msg.senderId && msg.senderId === state.peerId) {
    return { action: 'ignore' };
  }

  if (msg.type === 'cross_tab_join') {
    if (!state.isHost || state.role === 'client') return { action: 'ignore' };
    const clientName = typeof msg.clientName === 'string' ? msg.clientName : 'Player 2';
    return {
      action: 'cross_tab_join',
      logLine: `[P2PWebRTCChannel] Host received cross_tab_join from ${clientName} (color: slot ${String(msg.clientColorSlot)} ${String(msg.clientColorHex)}), activating BroadcastChannel transport immediately`,
      peerPatch: {
        peerName: clientName || 'Player 2',
        peerColorSlot: typeof msg.clientColorSlot === 'number' ? msg.clientColorSlot : null,
        peerColorHex: typeof msg.clientColorHex === 'string' ? msg.clientColorHex : null,
      },
    };
  }

  if (msg.type === 'cross_tab_ack') {
    if (state.isHost || state.role !== 'client') return { action: 'ignore' };
    const offerToken = typeof msg.offerToken === 'string' && msg.offerToken ? msg.offerToken : null;
    const shouldAcceptOffer = Boolean(offerToken && !state.answerToken && !hasRemoteDescription);
    const hostName = typeof msg.hostName === 'string' ? msg.hostName : 'Host';
    return {
      action: 'cross_tab_ack',
      logLine: `[P2PWebRTCChannel] Client received cross_tab_ack from ${hostName} (color: slot ${String(msg.hostColorSlot)} ${String(msg.hostColorHex)}), activating BroadcastChannel transport immediately`,
      peerPatch: {
        peerName: hostName || 'Host',
        peerColorSlot: typeof msg.hostColorSlot === 'number' ? msg.hostColorSlot : null,
        peerColorHex: typeof msg.hostColorHex === 'string' ? msg.hostColorHex : null,
      },
      offerTokenToAccept: shouldAcceptOffer ? offerToken : null,
    };
  }

  if (
    msg.type === 'room_answer' &&
    state.isHost &&
    state.role === 'host' &&
    typeof msg.sdp === 'string'
  ) {
    return {
      action: 'room_answer',
      sdp: msg.sdp,
      clientName: typeof msg.clientName === 'string' && msg.clientName ? msg.clientName : 'Client',
    };
  }

  if (msg.type === 'color_change') {
    return {
      action: 'color_change',
      payload: msg,
      logLine: `[P2PWebRTCChannel] Received cross-tab color_change: car ${String(msg.carIndex)} -> slot ${String(msg.slotId)} (${String(msg.hex)})`,
    };
  }

  if (msg.type === 'ping') {
    return { action: 'ping', sendTime: typeof msg.sendTime === 'number' ? msg.sendTime : 0 };
  }

  if (msg.type === 'pong') {
    return { action: 'pong', sendTime: typeof msg.sendTime === 'number' ? msg.sendTime : 0 };
  }

  if (
    msg.type === 'p2p_packet' &&
    (msg.buffer instanceof Uint8Array ||
      msg.buffer instanceof ArrayBuffer ||
      typeof msg.buffer === 'string')
  ) {
    return { action: 'raw_packet', payload: msg.buffer };
  }

  return { action: 'ignore' };
}
