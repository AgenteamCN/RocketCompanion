/**
 * src/network/server/PeerSession.ts
 * Peer Session entity and Tailored Client Datagram wire framing codec.
 */

import { GlobalPayloadCodec } from '../protocol/GlobalPayloadCodec.ts';
import { SignalEventBuffer, type DecodedSessionSignal } from '../protocol/SignalEventBuffer.ts';

export const CLIENT_HEADER_SIZE = 17; // 8 + 8 + 1 bytes
export const HEADER_SESSION_SIGNAL_FLAG = 0x80; // Bit 7 of byte 16 indicates per-session signal block
export const INPUT_STALE_NEUTRAL_TIMEOUT_MS = 1000; // 1.0s without valid input -> switch to neutral controls
export const SESSION_DISCONNECT_TIMEOUT_MS = 30000; // 30.0s without valid input -> evict entity

export interface PeerSessionOptions {
  role?: string;
  entityId?: number;
  team?: number;
  visualId?: string;
  hitboxId?: string;
  playerName?: string;
  playerId?: string;
  connectedAt?: number;
  deferPhysicsRegistration?: boolean;
}

export interface TailoredPacketOptions {
  serverTick?: number | null;
  alreadyStripped?: boolean;
}

export interface ParsedTailoredClientPacket {
  clientTimestamp: number;
  serverTimestamp: number;
  inputBufferSize: number;
  sessionSignals: DecodedSessionSignal[];
  globalPayloadSlice: Uint8Array;
}

export class PeerSession {
  sessionId: string;
  role: string;
  entityId: number;
  team?: number;
  visualId?: string;
  hitboxId?: string;
  playerName: string;
  playerId: string;

  private _latestClientTimestamp = 0;
  private _latestServerReceiptTime: number;
  private _lastValidInputTime: number;

  rttMs = 0;
  jitterMs = 0;
  lastEchoedServerTimestamp = 0;

  acknowledgedSignalIds = new Set<number>();
  processedCommandIds = new Set<number>();
  lastAckedCommandId = 0;
  isInputStale = false;
  deferPhysicsRegistration: boolean;

  constructor(sessionId: string, options: PeerSessionOptions = {}) {
    this.sessionId = sessionId;
    this.role = options.role || 'player';
    this.entityId = options.entityId ?? -1;
    this.team = options.team;
    this.visualId = options.visualId;
    this.hitboxId = options.hitboxId;
    this.playerName = options.playerName || 'Player';
    this.playerId = options.playerId || sessionId;

    const initialNow = options.connectedAt ?? 0;
    this._latestServerReceiptTime = initialNow;
    this._lastValidInputTime = initialNow;
    this.deferPhysicsRegistration = Boolean(options.deferPhysicsRegistration);
  }

  get latestClientTimestamp(): number {
    return this._latestClientTimestamp;
  }

  get latestServerReceiptTime(): number {
    return this._latestServerReceiptTime;
  }

  get lastValidInputTime(): number {
    return this._lastValidInputTime;
  }

  _recordClientPacket(clientTs: number, serverNowMs: number, hasValidInput = true): void {
    this._latestClientTimestamp = clientTs;
    this._latestServerReceiptTime = serverNowMs;
    if (hasValidInput) {
      this._lastValidInputTime = serverNowMs;
      this.isInputStale = false;
    }
  }

  updateRtt(measuredRtt: number): void {
    if (this.rttMs === 0) {
      this.rttMs = measuredRtt;
    } else {
      this.rttMs = this.rttMs * 0.8 + measuredRtt * 0.2;
    }
  }
}

export interface TailoredPacketSessionManagerPort {
  sessions: Map<string, PeerSession>;
  physicsManager?: {
    currentTick: number;
    getInputBufferSize(entityId: number): number;
  } | null;
  signalBuffer: {
    getPendingSignalsForSession(
      sessionId: string,
      currentTick: number | null
    ): DecodedSessionSignal[];
  };
  getTime(): number;
  extractSignalsFromGlobalPayload(globalPayloadBytes: Uint8Array): {
    statelessPayloadBytes: Uint8Array;
    serverTick: number | null;
  };
}

export function buildTailoredClientPacket(
  manager: TailoredPacketSessionManagerPort,
  sessionId: string,
  globalPayloadBytes: Uint8Array,
  options: TailoredPacketOptions = {}
): Uint8Array {
  const session: PeerSession | undefined = manager.sessions.get(sessionId);
  const serverTs = manager.getTime();
  let clientTs = 0;
  if (session && session.latestClientTimestamp > 0) {
    const serverHoldMs =
      session.latestServerReceiptTime > 0
        ? Math.max(0, serverTs - session.latestServerReceiptTime)
        : 0;
    clientTs = session.latestClientTimestamp + serverHoldMs;
  }

  let bufferSize = 0;
  if (session && session.entityId >= 0 && manager.physicsManager) {
    bufferSize = manager.physicsManager.getInputBufferSize(session.entityId);
  }
  bufferSize = Math.max(-64, Math.min(63, Math.round(bufferSize)));

  let statelessBytes = globalPayloadBytes;
  let currentTick: number | null =
    options.serverTick ?? (manager.physicsManager ? manager.physicsManager.currentTick : null);

  if (!options.alreadyStripped && globalPayloadBytes && globalPayloadBytes.length > 0) {
    const extracted = manager.extractSignalsFromGlobalPayload(globalPayloadBytes);
    statelessBytes = extracted.statelessPayloadBytes;
    if (extracted.serverTick !== null) {
      currentTick = extracted.serverTick;
    }
  }

  const pendingSignals = manager.signalBuffer.getPendingSignalsForSession(sessionId, currentTick);
  const hasSessionSignals = pendingSignals.length > 0;
  const sessionSignalsBytes = hasSessionSignals
    ? SignalEventBuffer.encodeSessionSignals(pendingSignals)
    : null;

  const sigBytesLen = sessionSignalsBytes ? sessionSignalsBytes.length : 0;
  const payloadLen = statelessBytes ? statelessBytes.length : 0;
  const totalLen = CLIENT_HEADER_SIZE + sigBytesLen + payloadLen;

  const buffer = new ArrayBuffer(totalLen);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  view.setFloat64(0, clientTs, false);
  view.setFloat64(8, serverTs, false);
  const signed7Bit = bufferSize & 0x7f;
  const headerByte16 = hasSessionSignals ? signed7Bit | HEADER_SESSION_SIGNAL_FLAG : signed7Bit;
  view.setUint8(16, headerByte16);

  let offset = CLIENT_HEADER_SIZE;
  if (sigBytesLen > 0 && sessionSignalsBytes) {
    uint8.set(sessionSignalsBytes, offset);
    offset += sigBytesLen;
  }

  if (payloadLen > 0 && statelessBytes) {
    uint8.set(statelessBytes, offset);
  }

  return uint8;
}

export function parseTailoredClientPacket(
  rawPacket: Uint8Array | ArrayBuffer | null | undefined
): ParsedTailoredClientPacket | null {
  if (!rawPacket) return null;
  const bytes = rawPacket instanceof Uint8Array ? rawPacket : new Uint8Array(rawPacket);
  if (bytes.length < CLIENT_HEADER_SIZE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const clientTimestamp = view.getFloat64(0, false);
  const serverTimestamp = view.getFloat64(8, false);
  const rawByte16 = view.getUint8(16);
  const hasSessionSignals = Boolean(rawByte16 & HEADER_SESSION_SIGNAL_FLAG);
  const raw7 = rawByte16 & 0x7f;
  const inputBufferSize = raw7 >= 64 ? raw7 - 128 : raw7;

  let offset = CLIENT_HEADER_SIZE;
  let sessionSignals: DecodedSessionSignal[] = [];

  if (hasSessionSignals && bytes.length > offset) {
    const decodedSigs = SignalEventBuffer.decodeSessionSignals(bytes, offset);
    sessionSignals = decodedSigs.signals;
    offset += decodedSigs.bytesRead;
  }

  let globalPayloadSlice = bytes.subarray(offset);

  if (sessionSignals.length > 0) {
    if (globalPayloadSlice.length > 0) {
      const decodedGlobal = GlobalPayloadCodec.decode(globalPayloadSlice);
      if (decodedGlobal) {
        const mergedSignals = [...sessionSignals, ...(decodedGlobal.signals || [])];
        globalPayloadSlice = GlobalPayloadCodec.encode({
          physics: decodedGlobal.physics,
          signals: mergedSignals,
          allUserRtt: decodedGlobal.allUserRtt,
        });
      }
    } else {
      globalPayloadSlice = GlobalPayloadCodec.encode({
        physics: null,
        signals: sessionSignals,
        allUserRtt: null,
      });
    }
  }

  return {
    clientTimestamp,
    serverTimestamp,
    inputBufferSize,
    sessionSignals,
    globalPayloadSlice,
  };
}
