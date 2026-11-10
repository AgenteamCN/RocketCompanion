/**
 * SignalTokenCodec.ts
 * Base64 URL-safe pack / unpack and token serialization for WebRTC signaling.
 */

import { injectLoopback, type IceCandidateDescriptor } from './SdpUtils.ts';

export interface DecodedSignalTokenPayload {
  type?: string;
  sdp?: string;
  candidates?: IceCandidateDescriptor[];
  roomId?: string | null;
  hostName?: string;
  hostColorSlot?: number | null;
  hostColorHex?: string | null;
  clientName?: string;
  clientColorSlot?: number | null;
  clientColorHex?: string | null;
  timestamp?: number;
  [key: string]: unknown;
}

export function packSdp(
  sdpObj: { type?: string; sdp?: string } | string | null | undefined,
  candidates: Array<IceCandidateDescriptor | RTCIceCandidateInit | string> = []
): string {
  const sdpStr = typeof sdpObj === 'string' ? sdpObj : sdpObj?.sdp || '';
  const type = typeof sdpObj === 'object' && sdpObj?.type ? sdpObj.type : 'offer';
  return btoa(
    encodeURIComponent(JSON.stringify({ type, sdp: injectLoopback(sdpStr, candidates) }))
  );
}

export function unpackSdp(str: string | null | undefined): DecodedSignalTokenPayload | null {
  if (!str) return null;
  return JSON.parse(decodeURIComponent(atob(str.trim())));
}

export const pack = packSdp;
export const unpack = unpackSdp;

export function encodeSignalToken(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  return btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_match, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

export function decodeSignalToken(tokenStr: string): DecodedSignalTokenPayload {
  if (!tokenStr) throw new Error('Token string is empty');
  const clean = tokenStr.trim().replace(/^RL_(OFFER|ANSWER)_/, '');
  try {
    const raw = atob(clean);
    try {
      const json = decodeURIComponent(
        raw
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch (uriErr) {
      console.warn(
        '[P2PWebRTCChannel] decodeURIComponent failed in decodeSignalToken, falling back to raw atob JSON:',
        uriErr
      );
      return JSON.parse(raw);
    }
  } catch (b64Err) {
    console.warn(
      '[P2PWebRTCChannel] Base64 decode failed in decodeSignalToken, falling back to direct JSON parse:',
      b64Err
    );
    return JSON.parse(tokenStr.trim());
  }
}
