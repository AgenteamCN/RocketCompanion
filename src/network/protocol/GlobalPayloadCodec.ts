/**
 * src/network/protocol/GlobalPayloadCodec.ts
 * Ultra-fast Binary Serialization & Deserialization for Shared Global Payloads.
 */

import type { CarControlsInput, UnpackedCarControls } from './InputPacketCodec.ts';
import { SIGNAL_EVENT_TYPES } from '../../physics/RocketSimConstants.ts';
import type { BoostPadBitmask, BoostPadEdgeTracker } from './boostPadBitmaskPipeline.ts';
import {
  computePhysicsSectionBytePlan,
  readPhysicsSectionFromView,
  writePhysicsSectionToView,
  type DecodedGlobalPhysicsSection,
  type GlobalPhysicsSection,
} from './globalPhysicsSnapshotSectionCodec.ts';

export type {
  BoostPadBitmask,
  BoostPadEdgeTracker,
  CarControlsInput,
  UnpackedCarControls,
  DecodedGlobalPhysicsSection,
  GlobalPhysicsSection,
};

export const MATCH_SIGNALS = SIGNAL_EVENT_TYPES;

export const PAYLOAD_FLAGS = Object.freeze({
  PHYSICS: 1 << 0,
  SIGNAL: 1 << 1,
  ALL_RTT: 1 << 2,
  RESERVED_3: 1 << 3,
  RESERVED_4: 1 << 4,
  RESERVED_5: 1 << 5,
  RESERVED_6: 1 << 6,
  RESERVED_7: 1 << 7,
});

export const SIGNAL_NAMES: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MATCH_SIGNALS).map(([k, v]) => [v, k]))
);

export interface AcknowledgedCarControlEntry {
  carIndex: number;
  controls: CarControlsInput;
}

export interface MatchIncidentPayload {
  type?: number;
  tick?: number;
  carIndex?: number;
  primaryId?: number;
  secondaryId?: number;
  team?: number;
  x?: number;
  y?: number;
  z?: number;
  signalId?: number;
  signalType?: number;
  name?: string;
  frameId?: number;
  param1?: number;
  param2?: number;
  [key: string]: unknown;
}

export interface GlobalSignalEntry {
  signalId?: number;
  signalType: number;
  name?: string;
  frameId?: number;
  param1?: number;
  param2?: number;
  expiresAtTick?: number | null;
}

export type MatchSignalDescriptor = GlobalSignalEntry;

export interface SpectatorRttEntry {
  id: number;
  rtt: number;
}

export interface AllUserRttSection {
  players?: Array<number | null | undefined>;
  spectators?: SpectatorRttEntry[];
}

export interface GlobalPayloadEncodeInput {
  physics?: GlobalPhysicsSection | null;
  signals?: GlobalSignalEntry[];
  allUserRtt?: AllUserRttSection | null;
}

export interface DecodedGlobalPayload {
  flagByte: number;
  hasPhysics: boolean;
  hasSignals: boolean;
  hasAllUserRtt: boolean;
  physics: DecodedGlobalPhysicsSection | null;
  signals: Array<{
    signalId: number;
    signalType: number;
    name: string;
    frameId: number;
    param1: number;
    param2: number;
  }>;
  allUserRtt: {
    players: Array<number | null>;
    spectators: SpectatorRttEntry[];
  } | null;
}

export class GlobalPayloadCodec {
  static encode(payload: GlobalPayloadEncodeInput = {}): Uint8Array {
    let flagByte = 0;
    const physics = payload.physics;
    const hasPhysics = Boolean(physics && physics.stateSnapshot);
    const signals = payload.signals || [];
    const hasSignals = signals.length > 0;
    const hasAllUserRtt = Boolean(payload.allUserRtt);

    if (hasPhysics) flagByte |= PAYLOAD_FLAGS.PHYSICS;
    if (hasSignals) flagByte |= PAYLOAD_FLAGS.SIGNAL;
    if (hasAllUserRtt) flagByte |= PAYLOAD_FLAGS.ALL_RTT;

    let totalSize = 1;
    const physicsPlan = hasPhysics && physics ? computePhysicsSectionBytePlan(physics) : null;
    if (physicsPlan) {
      totalSize += physicsPlan.byteSize;
    }
    if (hasSignals) totalSize += 1 + signals.length * 15;
    const spectators = payload.allUserRtt?.spectators || [];
    if (hasAllUserRtt) totalSize += 12 + 1 + spectators.length * 3;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    view.setUint8(0, flagByte);
    let offset = 1;

    if (hasPhysics && physics && physicsPlan) {
      offset = writePhysicsSectionToView(view, offset, physics, physicsPlan);
    }

    if (hasSignals) {
      view.setUint8(offset, signals.length);
      offset += 1;
      for (let i = 0; i < signals.length; i++) {
        const s = signals[i];
        view.setUint16(offset, (s.signalId || 0) & 0xffff, false);
        view.setUint8(offset + 2, s.signalType);
        view.setUint32(offset + 3, s.frameId || 0, false);
        view.setUint32(offset + 7, s.param1 || 0, false);
        view.setUint32(offset + 11, s.param2 || 0, false);
        offset += 15;
      }
    }

    if (hasAllUserRtt && payload.allUserRtt) {
      const players = payload.allUserRtt.players || [];
      for (let i = 0; i < 6; i++) {
        const rtt = players[i];
        const val = typeof rtt === 'number' && rtt >= 0 ? Math.min(65534, Math.round(rtt)) : 0xffff;
        view.setUint16(offset, val, false);
        offset += 2;
      }
      view.setUint8(offset, spectators.length);
      offset += 1;
      for (let i = 0; i < spectators.length; i++) {
        const sp = spectators[i];
        view.setUint8(offset, sp.id ?? i);
        view.setUint16(offset + 1, Math.min(65534, Math.max(0, Math.round(sp.rtt ?? 0))), false);
        offset += 3;
      }
    }

    return uint8;
  }

  static decode(
    bufferInput: ArrayBuffer | Uint8Array | DataView | null | undefined,
    byteOffset = 0
  ): DecodedGlobalPayload | null {
    if (!bufferInput) return null;
    const view =
      bufferInput instanceof DataView
        ? bufferInput
        : bufferInput instanceof Uint8Array
          ? new DataView(bufferInput.buffer, bufferInput.byteOffset, bufferInput.byteLength)
          : bufferInput instanceof ArrayBuffer
            ? new DataView(bufferInput)
            : null;
    if (!view || view.byteLength < byteOffset + 1) return null;

    let offset = byteOffset;
    const flagByte = view.getUint8(offset++);
    const result: DecodedGlobalPayload = {
      flagByte,
      hasPhysics: Boolean(flagByte & PAYLOAD_FLAGS.PHYSICS),
      hasSignals: Boolean(flagByte & PAYLOAD_FLAGS.SIGNAL),
      hasAllUserRtt: Boolean(flagByte & PAYLOAD_FLAGS.ALL_RTT),
      physics: null,
      signals: [],
      allUserRtt: null,
    };

    if (result.hasPhysics) {
      const parsedPhysics = readPhysicsSectionFromView(view, offset);
      if (parsedPhysics.abortedEarly) return result;
      result.physics = parsedPhysics.physics;
      offset = parsedPhysics.nextOffset;
    }

    if (result.hasSignals && view.byteLength >= offset + 1) {
      const count = view.getUint8(offset++);
      for (let i = 0; i < count; i++) {
        if (view.byteLength < offset + 15) break;
        const signalId = view.getUint16(offset, false);
        const signalType = view.getUint8(offset + 2);
        const frameId = view.getUint32(offset + 3, false);
        const param1 = view.getUint32(offset + 7, false);
        const param2 = view.getUint32(offset + 11, false);
        result.signals.push({
          signalId,
          signalType,
          name: SIGNAL_NAMES[signalType] || `SIGNAL_0x${signalType.toString(16).toUpperCase()}`,
          frameId,
          param1,
          param2,
        });
        offset += 15;
      }
    }

    if (result.hasAllUserRtt && view.byteLength >= offset + 13) {
      const players: Array<number | null> = [];
      for (let i = 0; i < 6; i++) {
        const val = view.getUint16(offset, false);
        players.push(val === 0xffff ? null : val);
        offset += 2;
      }
      const spectatorCount = view.getUint8(offset++);
      const spectators: SpectatorRttEntry[] = [];
      for (let i = 0; i < spectatorCount; i++) {
        if (view.byteLength < offset + 3) break;
        spectators.push({
          id: view.getUint8(offset),
          rtt: view.getUint16(offset + 1, false),
        });
        offset += 3;
      }
      result.allUserRtt = { players, spectators };
    }

    return result;
  }
}
