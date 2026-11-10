/**
 * signalingHandshakeFrames.ts
 * Pure HMAC-SHA256 authenticated handshake frame builders, verifiers,
 * and client hello route planners for 3-way ECDH signaling rendezvous
 * (sig_hello, sig_hello_ack, sig_handshake_confirm).
 */

import {
  signRoomHandshakeFrame,
  verifyRoomHandshakeFrame,
  type DeterministicRoomContext,
} from './SignalingCryptoSession.ts';
import {
  getSlotBitForRelayId,
  parseRoomCode,
  resolveSignalingRouteDecision,
} from '../../ui-core/config/roomCodeConnectivityCodec.ts';

export interface SignedHelloFrameInput {
  roomContext: DeterministicRoomContext;
  fromPeerId: string;
  senderName: string;
  role: string;
  allowSpectatorRelay: boolean;
  ecdhPub: string;
  nonce: string;
  relayId: string;
}

export interface SignedHelloAckFrameInput {
  roomContext: DeterministicRoomContext;
  targetPeerId: string;
  fromPeerId: string;
  senderName: string;
  ecdhPub: string;
  nonce: string;
  relayId: string;
  requireManualApproval: boolean;
}

export interface ClientHelloDispatchTarget {
  relayId: string;
  useBridge: boolean;
}

export function resolveClientHelloDispatchTargets(
  roomId: string,
  connectedIds: string[],
  clientMask: number,
  bestBridgeRelayId: string | null
): ClientHelloDispatchTarget[] {
  if (connectedIds.length === 0) return [];

  const parsedRoom = parseRoomCode(roomId);
  const hostMask = parsedRoom ? parsedRoom.hostMask : 0x0f;
  const route = resolveSignalingRouteDecision(hostMask, clientMask);

  if (route.routeType === 'direct-shared') {
    const targets: ClientHelloDispatchTarget[] = [];
    for (const relayId of connectedIds) {
      const bit = getSlotBitForRelayId(relayId);
      if (bit === 0 || (route.sharedMask & bit) !== 0) {
        targets.push({ relayId, useBridge: false });
      }
    }
    return targets;
  }

  // Isolated island (sharedMask === 0): dispatch via Edge Function / bridge channel
  if (bestBridgeRelayId) {
    return [{ relayId: bestBridgeRelayId, useBridge: true }];
  }
  return [];
}

export async function buildSignedHelloFrame(
  input: SignedHelloFrameInput
): Promise<Record<string, unknown>> {
  const hmac = await signRoomHandshakeFrame(input.roomContext, [
    'sig_hello',
    input.fromPeerId,
    input.senderName,
    input.role,
    input.ecdhPub,
    input.nonce,
  ]);

  return {
    type: 'sig_hello',
    fromPeerId: input.fromPeerId,
    senderName: input.senderName,
    role: input.role,
    allowSpectatorRelay: Boolean(input.allowSpectatorRelay),
    ecdhPub: input.ecdhPub,
    nonce: input.nonce,
    relayId: input.relayId,
    hmac,
    timestamp: Date.now(),
  };
}

export async function verifySignedHelloFrame(
  roomContext: DeterministicRoomContext,
  msg: Record<string, unknown>
): Promise<boolean> {
  return verifyRoomHandshakeFrame(
    roomContext,
    [
      'sig_hello',
      String(msg.fromPeerId || ''),
      String(msg.senderName || ''),
      String(msg.role || ''),
      String(msg.ecdhPub || ''),
      String(msg.nonce || ''),
    ],
    String(msg.hmac || '')
  );
}

export async function buildSignedHelloAckFrame(
  input: SignedHelloAckFrameInput
): Promise<Record<string, unknown>> {
  const hmac = await signRoomHandshakeFrame(input.roomContext, [
    'sig_hello_ack',
    input.targetPeerId,
    input.fromPeerId,
    input.senderName,
    input.ecdhPub,
    input.nonce,
  ]);

  return {
    type: 'sig_hello_ack',
    targetPeerId: input.targetPeerId,
    fromPeerId: input.fromPeerId,
    senderName: input.senderName,
    ecdhPub: input.ecdhPub,
    nonce: input.nonce,
    relayId: input.relayId,
    requireManualApproval: input.requireManualApproval,
    hmac,
    timestamp: Date.now(),
  };
}

export async function verifySignedHelloAckFrame(
  roomContext: DeterministicRoomContext,
  localPeerId: string,
  msg: Record<string, unknown>
): Promise<boolean> {
  return verifyRoomHandshakeFrame(
    roomContext,
    [
      'sig_hello_ack',
      localPeerId,
      String(msg.fromPeerId || ''),
      String(msg.senderName || ''),
      String(msg.ecdhPub || ''),
      String(msg.nonce || ''),
    ],
    String(msg.hmac || '')
  );
}

export function buildHandshakeConfirmPayload(
  fromPeerId: string,
  senderName: string,
  role: string,
  allowSpectatorRelay: boolean,
  pairingCode: string,
  relayId: string
): Record<string, unknown> {
  return {
    type: 'sig_handshake_confirm',
    fromPeerId,
    senderName,
    role,
    allowSpectatorRelay: Boolean(allowSpectatorRelay),
    pairingCode,
    relayId,
    timestamp: Date.now(),
  };
}
