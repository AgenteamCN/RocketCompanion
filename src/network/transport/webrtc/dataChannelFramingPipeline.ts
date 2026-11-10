/**
 * dataChannelFramingPipeline.ts
 * Pure control-frame parsing, client input packet encoding, and dual-channel dispatch helpers.
 */

import { InputPacketCodec, type InputHistoryEntry } from '../../protocol/InputPacketCodec.ts';
import type { CarControlsInput } from '../../protocol/GlobalPayloadCodec.ts';
import type { SimulatedPayload } from './NetworkSimulator.ts';
import {
  injectLoopbackCandidate,
  injectLoopbackIntoSdp,
  ensureValidSdp,
  type IceCandidateDescriptor,
} from './SdpUtils.ts';

export interface SdpHandshakePayload {
  sdp?: string;
  candidates?: IceCandidateDescriptor[];
}

export interface PendingColorChangeState {
  slotId: number;
  hex: string;
  carIndex: number;
}

export interface StructuredClientInputPacket {
  carIndex?: number;
  tick: number;
  targetTick?: number;
  history?: InputHistoryEntry[];
  controls?: CarControlsInput;
}

export type ClientInputPacketPayload = StructuredClientInputPacket | SimulatedPayload;

export type InboundControlFrame =
  | { readonly kind: 'color_change'; readonly raw: Record<string, unknown> }
  | {
      readonly kind: 'diagnostic_fleet_toggle';
      readonly enabled: boolean;
      readonly anchorMode: string;
    }
  | { readonly kind: 'ping'; readonly sendTime: number; readonly rtt: number | null }
  | { readonly kind: 'pong'; readonly sendTime: number };

export type DataChannelTransportEvent =
  | { readonly type: 'channel_open' }
  | { readonly type: 'channel_closed' }
  | { readonly type: 'color_change'; readonly payload: Record<string, unknown> }
  | {
      readonly type: 'diagnostic_fleet_toggle';
      readonly enabled: boolean;
      readonly anchorMode: string;
    }
  | { readonly type: 'packet'; readonly payload: SimulatedPayload };

export function parseInboundControlFrame(raw: string): InboundControlFrame | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const msg = parsed as Record<string, unknown>;
    if (msg.type === 'color_change') {
      return { kind: 'color_change', raw: msg };
    }
    if (msg.type === 'diagnostic_fleet_toggle') {
      return {
        kind: 'diagnostic_fleet_toggle',
        enabled: Boolean(msg.enabled),
        anchorMode: typeof msg.anchorMode === 'string' ? msg.anchorMode : '',
      };
    }
    if (msg.type === 'ping') {
      const sendTime = typeof msg.sendTime === 'number' ? msg.sendTime : 0;
      const rtt =
        typeof msg.rtt === 'number' && Number.isFinite(msg.rtt) && msg.rtt > 0 ? msg.rtt : null;
      return { kind: 'ping', sendTime, rtt };
    }
    if (msg.type === 'pong') {
      const sendTime = typeof msg.sendTime === 'number' ? msg.sendTime : 0;
      return { kind: 'pong', sendTime };
    }
  } catch (err) {
    console.warn('[P2PWebRTCChannel] Failed to parse incoming string message as JSON:', err, raw);
  }
  return null;
}

export function encodeClientInputPayload(packet: ClientInputPacketPayload): SimulatedPayload {
  if (packet instanceof Uint8Array || packet instanceof ArrayBuffer || typeof packet === 'string') {
    return packet;
  }
  if (typeof packet === 'object' && packet !== null) {
    const input = packet as StructuredClientInputPacket;
    if (input.history) {
      return InputPacketCodec.encode(
        input.carIndex ?? 0,
        input.targetTick ?? input.tick,
        input.history
      );
    }
    if (input.controls) {
      return InputPacketCodec.encode(input.carIndex ?? 0, input.tick, [
        { tick: input.tick, controls: input.controls },
      ]);
    }
  }
  return new Uint8Array(0);
}

export function dispatchOpportunisticPing(
  dc: RTCDataChannel | null,
  roomChannel: BroadcastChannel | null,
  isOpen: boolean,
  nowMs: number,
  rttMs: number
): void {
  const pingPayload = JSON.stringify({
    type: 'ping',
    sendTime: nowMs,
    rtt: Math.round(rttMs || 0),
  });
  if (dc && dc.readyState === 'open') {
    try {
      dc.send(pingPayload);
    } catch (_err) {
      // Ignore ping error
    }
  } else if (roomChannel && isOpen) {
    try {
      roomChannel.postMessage(pingPayload);
    } catch (_err) {
      // Ignore ping error
    }
  }
}

export function transmitClonedPayload(
  activeDc: RTCDataChannel | null,
  activeRoomChannel: BroadcastChannel | null,
  isOpen: boolean,
  clonedPacket: SimulatedPayload
): boolean {
  let dispatched = false;
  if (activeDc && activeDc.readyState === 'open') {
    try {
      activeDc.send(clonedPacket as string);
      dispatched = true;
    } catch (err) {
      console.warn('[P2PWebRTCChannel] DataChannel send failed:', err);
    }
  }
  if (!dispatched && activeRoomChannel && isOpen) {
    try {
      activeRoomChannel.postMessage(clonedPacket);
      dispatched = true;
    } catch (err) {
      console.warn('[P2PWebRTCChannel] RoomChannel send failed:', err);
    }
  }
  return dispatched;
}

export function dispatchDualChannelControlFrame(
  dc: RTCDataChannel | null,
  roomChannel: BroadcastChannel | null,
  messageObj: Record<string, unknown>,
  label: string,
  logDetail?: string
): void {
  const serialized = JSON.stringify(messageObj);
  if (dc && dc.readyState === 'open') {
    try {
      dc.send(serialized);
      if (logDetail) {
        console.log(`[P2PWebRTCChannel] Sent ${label} via DataChannel: ${logDetail}`);
      }
    } catch (err) {
      console.warn(`[P2PWebRTCChannel] Failed to send ${label} via DataChannel:`, err);
    }
  }
  if (roomChannel) {
    try {
      roomChannel.postMessage(messageObj);
      if (logDetail) {
        console.log(`[P2PWebRTCChannel] Sent ${label} via RoomChannel: ${logDetail}`);
      }
    } catch (err) {
      console.warn(`[P2PWebRTCChannel] Failed to send ${label} via RoomChannel:`, err);
    }
  }
}

export function isLoopbackCandidate(cand: IceCandidateDescriptor | null | undefined): boolean {
  if (!cand) return false;
  const text = cand.candidate || cand.address || cand.ip || '';
  return text.includes('127.0.0.1');
}

export function prioritizeLoopbackCandidates(
  candidates: readonly IceCandidateDescriptor[]
): IceCandidateDescriptor[] {
  return [...candidates].sort((a, b) => {
    const aLoopback = isLoopbackCandidate(a);
    const bLoopback = isLoopbackCandidate(b);
    if (aLoopback && !bLoopback) return -1;
    if (!aLoopback && bLoopback) return 1;
    return 0;
  });
}

export function prepareRemoteSdpWithLoopback(payload: SdpHandshakePayload): string {
  const rawSdp = payload.sdp || '';
  let remoteSdp = ensureValidSdp(rawSdp);
  const candidates = payload.candidates;
  const remoteLoopback = Array.isArray(candidates)
    ? candidates.find((c) => isLoopbackCandidate(c))
    : undefined;
  if (remoteLoopback) {
    remoteSdp = injectLoopbackIntoSdp(remoteSdp, remoteLoopback);
  }
  return ensureValidSdp(remoteSdp);
}

export function finalizeLocalSdpWithLoopback(
  rawSdp: string,
  candidates: IceCandidateDescriptor[]
): { sdp: string; candidates: IceCandidateDescriptor[] } {
  const nextCandidates = injectLoopbackCandidate(candidates, rawSdp);
  const loopbackCand = nextCandidates.find((c) => (c.candidate || '').includes('127.0.0.1'));
  let sdp = rawSdp;
  if (loopbackCand && sdp) {
    sdp = injectLoopbackIntoSdp(sdp, loopbackCand);
  }
  return {
    sdp: ensureValidSdp(sdp),
    candidates: nextCandidates,
  };
}

export function normalizeGatheredCandidate(rtcCand: RTCIceCandidate): IceCandidateDescriptor[] {
  const candJson: IceCandidateDescriptor =
    typeof rtcCand.toJSON === 'function'
      ? (rtcCand.toJSON() as IceCandidateDescriptor)
      : {
          candidate: rtcCand.candidate,
          sdpMid: rtcCand.sdpMid,
          sdpMLineIndex: rtcCand.sdpMLineIndex,
        };
  const extracted: IceCandidateDescriptor[] = [candJson];
  if (candJson.candidate && candJson.candidate.includes('.local')) {
    extracted.push({
      ...candJson,
      candidate: candJson.candidate.replace(/\S+\.local/, '127.0.0.1'),
      address: '127.0.0.1',
      ip: '127.0.0.1',
    });
  }
  return extracted;
}
