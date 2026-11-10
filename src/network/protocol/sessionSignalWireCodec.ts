/**
 * src/network/protocol/sessionSignalWireCodec.ts
 * Pure wire framing codec and peer-acknowledgement predicates for per-session reliable signals.
 */

import {
  GlobalPayloadCodec,
  PAYLOAD_FLAGS,
  SIGNAL_NAMES,
  type MatchSignalDescriptor,
} from './GlobalPayloadCodec.ts';

export const SIGNAL_WIRE_STRIDE = 15;

export interface PendingSessionSignal {
  signalId: number;
  signalType: number;
  name?: string;
  frameId: number;
  param1: number;
  param2: number;
}

export type DecodedSessionSignal = PendingSessionSignal;

export interface SignalIdCollisionCheckEntry {
  signalType: number;
  param1: number;
  param2: number;
}

export function areAllRequiredPeersAcked(
  ackedPeers: ReadonlySet<string>,
  requiredPeers: ReadonlySet<string> | null,
  activeSet: ReadonlySet<string> | null = null
): boolean {
  if (!requiredPeers || requiredPeers.size === 0) {
    return false;
  }
  for (const peerId of requiredPeers) {
    if (activeSet && !activeSet.has(peerId)) {
      continue;
    }
    if (!ackedPeers.has(peerId)) {
      return false;
    }
  }
  return true;
}

export function resolveNextSignalId(
  currentNextSignalId: number,
  requestedSignalId: number | undefined,
  signalType: number,
  param1: number,
  param2: number,
  entries: ReadonlyMap<number, SignalIdCollisionCheckEntry>
): { signalId: number; nextSignalId: number } {
  if (typeof requestedSignalId !== 'number' || requestedSignalId <= 0) {
    const nextSignalId = (currentNextSignalId % 65535) + 1;
    return { signalId: nextSignalId, nextSignalId };
  }

  const existingAtId = entries.get(requestedSignalId & 0xffff);
  if (
    existingAtId &&
    (existingAtId.signalType !== (signalType & 0xff) ||
      existingAtId.param1 !== param1 >>> 0 ||
      existingAtId.param2 !== param2 >>> 0)
  ) {
    const nextSignalId = (Math.max(currentNextSignalId, requestedSignalId) % 65535) + 1;
    return { signalId: nextSignalId, nextSignalId };
  }

  const nextSignalId = Math.max(currentNextSignalId, requestedSignalId);
  return { signalId: requestedSignalId, nextSignalId };
}

export function encodeSessionSignals(signals: PendingSessionSignal[] = []): Uint8Array {
  const count = Array.isArray(signals) ? Math.min(255, signals.length) : 0;
  const buffer = new ArrayBuffer(1 + count * SIGNAL_WIRE_STRIDE);
  const view = new DataView(buffer);
  view.setUint8(0, count);

  let offset = 1;
  for (let i = 0; i < count; i++) {
    const s = signals[i];
    view.setUint16(offset, (s.signalId || 0) & 0xffff, false);
    view.setUint8(offset + 2, (s.signalType || 0) & 0xff);
    view.setUint32(offset + 3, (s.frameId || 0) >>> 0, false);
    view.setUint32(offset + 7, (s.param1 || 0) >>> 0, false);
    view.setUint32(offset + 11, (s.param2 || 0) >>> 0, false);
    offset += SIGNAL_WIRE_STRIDE;
  }

  return new Uint8Array(buffer);
}

export function decodeSessionSignals(
  bufferInput: DataView | Uint8Array | ArrayBuffer | null | undefined,
  byteOffset = 0
): { signals: PendingSessionSignal[]; bytesRead: number } {
  if (!bufferInput) {
    return { signals: [], bytesRead: 0 };
  }

  const view =
    bufferInput instanceof DataView
      ? bufferInput
      : bufferInput instanceof Uint8Array
        ? new DataView(bufferInput.buffer, bufferInput.byteOffset, bufferInput.byteLength)
        : bufferInput instanceof ArrayBuffer
          ? new DataView(bufferInput)
          : null;
  if (!view || view.byteLength < byteOffset + 1) {
    return { signals: [], bytesRead: 0 };
  }

  const count = view.getUint8(byteOffset);
  let offset = byteOffset + 1;
  const signals: PendingSessionSignal[] = [];

  for (let i = 0; i < count; i++) {
    if (view.byteLength < offset + SIGNAL_WIRE_STRIDE) {
      break;
    }
    const signalId = view.getUint16(offset, false);
    const signalType = view.getUint8(offset + 2);
    const frameId = view.getUint32(offset + 3, false);
    const param1 = view.getUint32(offset + 7, false);
    const param2 = view.getUint32(offset + 11, false);
    signals.push({
      signalId,
      signalType,
      name: SIGNAL_NAMES[signalType] || `SIGNAL_0x${signalType.toString(16).toUpperCase()}`,
      frameId,
      param1,
      param2,
    });
    offset += SIGNAL_WIRE_STRIDE;
  }

  return {
    signals,
    bytesRead: offset - byteOffset,
  };
}

export function extractAndIngestGlobalPayloadSignals(
  globalPayloadBytes: Uint8Array,
  signalBuffer: {
    ingestSignals(signals: MatchSignalDescriptor[], requiredSessionIds: string[]): unknown;
    pruneExpired(currentTick: number, requiredSessionIds: string[]): number;
  },
  humanAckSessionIds: string[],
  fallbackTick: number | null
): { statelessPayloadBytes: Uint8Array; serverTick: number | null } {
  if (!globalPayloadBytes || globalPayloadBytes.length === 0) {
    return { statelessPayloadBytes: globalPayloadBytes, serverTick: null };
  }

  const flagByte = globalPayloadBytes[0];
  const hasSignalsInGlobal = Boolean(flagByte & PAYLOAD_FLAGS.SIGNAL);

  if (!hasSignalsInGlobal) {
    let serverTick: number | null = null;
    if (flagByte & PAYLOAD_FLAGS.PHYSICS && globalPayloadBytes.length >= 5) {
      const view = new DataView(
        globalPayloadBytes.buffer,
        globalPayloadBytes.byteOffset,
        globalPayloadBytes.byteLength
      );
      serverTick = view.getUint32(1, false);
    }
    if (serverTick !== null) {
      signalBuffer.pruneExpired(serverTick, humanAckSessionIds);
    }
    return { statelessPayloadBytes: globalPayloadBytes, serverTick };
  }

  const decoded = GlobalPayloadCodec.decode(globalPayloadBytes);
  if (!decoded) {
    return { statelessPayloadBytes: globalPayloadBytes, serverTick: null };
  }

  const serverTick = decoded.physics?.tick ?? fallbackTick;
  if (decoded.signals && decoded.signals.length > 0) {
    signalBuffer.ingestSignals(decoded.signals, humanAckSessionIds);
  }
  if (serverTick !== null) {
    signalBuffer.pruneExpired(serverTick, humanAckSessionIds);
  }

  const statelessPayloadBytes = GlobalPayloadCodec.encode({
    physics: decoded.physics ?? undefined,
    signals: [],
    allUserRtt: decoded.allUserRtt ?? undefined,
  });

  return { statelessPayloadBytes, serverTick };
}
