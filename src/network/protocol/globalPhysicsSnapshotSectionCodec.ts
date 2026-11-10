/**
 * src/network/protocol/globalPhysicsSnapshotSectionCodec.ts
 * Binary serialization and deserialization for the physics snapshot section
 * (sparse 448-float snapshots, boost-pad bitmasks, replay director telemetry,
 * and dense fallback snapshots) inside shared global payloads.
 */

import {
  InputPacketCodec,
  type CarControlsInput,
  type UnpackedCarControls,
} from './InputPacketCodec.ts';
import {
  BOOST_PAD_BITMASK_BYTES,
  packBoostPadBitmask,
  unpackBoostPadBitmaskIntoSnapshot,
} from './boostPadBitmaskPipeline.ts';

export const SPARSE_SNAPSHOT_MAGIC_MASK = 0xa800;

export interface GlobalPhysicsSection {
  tick: number;
  activeCarMask?: number;
  activeCarIndices?: number[];
  boostPadMaskLow?: number;
  boostPadMaskHigh?: number;
  acknowledgedControls?: Array<{
    carIndex: number;
    controls: CarControlsInput;
  }>;
  stateSnapshot: Float32Array | number[];
}

export interface DecodedGlobalPhysicsSection {
  tick: number;
  activeCarMask: number;
  activeCarIndices: number[];
  boostPadMaskLow?: number;
  boostPadMaskHigh?: number;
  acknowledgedControls: Array<{
    carIndex: number;
    controls: UnpackedCarControls;
  }>;
  stateSnapshot: Float32Array;
}

export interface PhysicsSectionBytePlan {
  byteSize: number;
  snapFloats: number;
  ackCount: number;
  useSparseEncoding: boolean;
  hasReplayDirectorTelemetry: boolean;
  activeCarMask: number;
  activeCarList: number[];
}

export function resolveActiveCarMaskForEncode(physics: Partial<GlobalPhysicsSection> = {}): number {
  if (typeof physics.activeCarMask === 'number' && physics.activeCarMask > 0) {
    return physics.activeCarMask & 0xff;
  }
  const ackList = physics.acknowledgedControls || [];
  if (ackList.length > 0) {
    let mask = 0;
    for (let i = 0; i < ackList.length; i++) {
      const idx = ackList[i]?.carIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < 8) mask |= 1 << idx;
    }
    if (mask > 0) return mask & 0xff;
  }
  const snap = physics.stateSnapshot;
  if (snap && snap.length >= 448) {
    const numCars = Math.min(8, Math.max(0, Math.round(snap[2] || 0)));
    let mask = 0;
    for (let c = 0; c < numCars; c++) {
      const base = 22 + c * 40;
      const fx = snap[base + 3];
      const fy = snap[base + 4];
      const fz = snap[base + 5];
      if (fx * fx + fy * fy + fz * fz > 0.01) mask |= 1 << c;
    }
    if (mask > 0) return mask & 0xff;
    return ((1 << Math.max(1, numCars)) - 1) & 0xff;
  }
  return 0x01;
}

export function maskToActiveCarIndices(mask?: number | null): number[] {
  const indices: number[] = [];
  const safeMask = (mask || 0) & 0xff;
  for (let c = 0; c < 8; c++) {
    if ((safeMask & (1 << c)) !== 0) indices.push(c);
  }
  return indices;
}

export function computePhysicsSectionBytePlan(
  physics: GlobalPhysicsSection
): PhysicsSectionBytePlan {
  const snapFloats = physics.stateSnapshot.length;
  const ackCount = Math.min(8, (physics.acknowledgedControls || []).length);
  if (snapFloats === 448) {
    const activeCarMask = resolveActiveCarMaskForEncode(physics);
    const activeCarList = maskToActiveCarIndices(activeCarMask);
    const hasReplayDirectorTelemetry =
      (activeCarMask & (1 << 7)) === 0 &&
      Math.abs((physics.stateSnapshot[302] || 0) - 1337.5) <= 0.01;
    const encodedFloats = 28 + activeCarList.length * 44 + (hasReplayDirectorTelemetry ? 27 : 0);
    const byteSize = 4 + 1 + ackCount * 4 + 2 + BOOST_PAD_BITMASK_BYTES + encodedFloats * 4;
    return {
      byteSize,
      snapFloats,
      ackCount,
      useSparseEncoding: true,
      hasReplayDirectorTelemetry,
      activeCarMask,
      activeCarList,
    };
  }
  return {
    byteSize: 4 + 1 + ackCount * 4 + 2 + snapFloats * 4,
    snapFloats,
    ackCount,
    useSparseEncoding: false,
    hasReplayDirectorTelemetry: false,
    activeCarMask: 0,
    activeCarList: [],
  };
}

export function writePhysicsSectionToView(
  view: DataView,
  startOffset: number,
  physics: GlobalPhysicsSection,
  plan: PhysicsSectionBytePlan
): number {
  let offset = startOffset;
  view.setUint32(offset, physics.tick || 0, false);
  offset += 4;
  view.setUint8(offset, plan.ackCount);
  offset += 1;

  const ackList = physics.acknowledgedControls || [];
  for (let i = 0; i < plan.ackCount; i++) {
    const item = ackList[i] || { carIndex: i, controls: {} };
    const [b0, b1, b2] = InputPacketCodec.packTickControls(item.controls || {});
    view.setUint8(offset, item.carIndex ?? i);
    view.setUint8(offset + 1, b0);
    view.setUint8(offset + 2, b1);
    view.setUint8(offset + 3, b2);
    offset += 4;
  }

  const snap = physics.stateSnapshot;
  if (plan.useSparseEncoding) {
    const headerFlags =
      SPARSE_SNAPSHOT_MAGIC_MASK |
      (plan.hasReplayDirectorTelemetry ? 0x0100 : 0) |
      (plan.activeCarMask & 0xff);
    view.setUint16(offset, headerFlags, false);
    offset += 2;
    for (let i = 0; i < 22; i++) {
      view.setFloat32(offset, snap[i], false);
      offset += 4;
    }
    const padMask = packBoostPadBitmask(snap);
    view.setUint32(offset, padMask.low, false);
    offset += 4;
    view.setUint8(offset, padMask.high);
    offset += 1;
    for (let i = 410; i < 416; i++) {
      view.setFloat32(offset, snap[i], false);
      offset += 4;
    }
    for (let idx = 0; idx < plan.activeCarList.length; idx++) {
      const c = plan.activeCarList[idx];
      const carBase = 22 + c * 40;
      for (let f = 0; f < 40; f++) {
        view.setFloat32(offset, snap[carBase + f], false);
        offset += 4;
      }
      const extBase = 416 + c * 4;
      for (let f = 0; f < 4; f++) {
        view.setFloat32(offset, snap[extBase + f], false);
        offset += 4;
      }
    }
    if (plan.hasReplayDirectorTelemetry) {
      for (let f = 0; f < 27; f++) {
        view.setFloat32(offset, snap[302 + f] || 0, false);
        offset += 4;
      }
    }
  } else {
    view.setUint16(offset, plan.snapFloats, false);
    offset += 2;
    for (let i = 0; i < plan.snapFloats; i++) {
      view.setFloat32(offset, snap[i], false);
      offset += 4;
    }
  }

  return offset;
}

export function readPhysicsSectionFromView(
  view: DataView,
  startOffset: number
): { physics: DecodedGlobalPhysicsSection | null; nextOffset: number; abortedEarly: boolean } {
  let offset = startOffset;
  if (view.byteLength < offset + 7) {
    return { physics: null, nextOffset: offset, abortedEarly: true };
  }

  const tick = view.getUint32(offset, false);
  offset += 4;
  const ackCount = view.getUint8(offset++);
  const acknowledgedControls: Array<{
    carIndex: number;
    controls: UnpackedCarControls;
  }> = [];
  for (let i = 0; i < ackCount; i++) {
    if (view.byteLength < offset + 4) break;
    const carIndex = view.getUint8(offset);
    const controls = InputPacketCodec.unpackTickControls(
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    acknowledgedControls.push({ carIndex, controls });
    offset += 4;
  }

  let physics: DecodedGlobalPhysicsSection | null = null;
  if (view.byteLength >= offset + 2) {
    const snapHeader = view.getUint16(offset, false);
    offset += 2;
    if ((snapHeader & 0xfe00) === SPARSE_SNAPSHOT_MAGIC_MASK) {
      const hasReplayDirectorTelemetry = (snapHeader & 0x0100) !== 0;
      const activeCarMask = snapHeader & 0xff;
      const activeCarIndices = maskToActiveCarIndices(activeCarMask);
      const telemetryFloats = hasReplayDirectorTelemetry
        ? view.byteLength >=
          offset + BOOST_PAD_BITMASK_BYTES + (28 + activeCarIndices.length * 44 + 27) * 4
          ? 27
          : 12
        : 0;
      const encodedFloats = 28 + activeCarIndices.length * 44 + telemetryFloats;
      if (view.byteLength >= offset + BOOST_PAD_BITMASK_BYTES + encodedFloats * 4) {
        const stateSnapshot = new Float32Array(448);
        for (let c = 0; c < 8; c++) {
          const carBase = 22 + c * 40;
          stateSnapshot[carBase + 0] = -5500;
          stateSnapshot[carBase + 1] = c * 300;
          stateSnapshot[carBase + 2] = -500;
          stateSnapshot[carBase + 3] = 1;
          stateSnapshot[carBase + 7] = 1;
          stateSnapshot[carBase + 11] = 1;
          stateSnapshot[416 + c * 4 + 2] = -1;
        }
        for (let i = 0; i < 22; i++) {
          stateSnapshot[i] = view.getFloat32(offset, false);
          offset += 4;
        }
        const boostPadMaskLow = view.getUint32(offset, false);
        offset += 4;
        const boostPadMaskHigh = view.getUint8(offset++) & 0x03;
        unpackBoostPadBitmaskIntoSnapshot(boostPadMaskLow, boostPadMaskHigh, stateSnapshot);
        for (let i = 410; i < 416; i++) {
          stateSnapshot[i] = view.getFloat32(offset, false);
          offset += 4;
        }
        let maxSlotSpan = 0;
        for (let idx = 0; idx < activeCarIndices.length; idx++) {
          const c = activeCarIndices[idx];
          if (c + 1 > maxSlotSpan) maxSlotSpan = c + 1;
          const carBase = 22 + c * 40;
          for (let f = 0; f < 40; f++) {
            stateSnapshot[carBase + f] = view.getFloat32(offset, false);
            offset += 4;
          }
          const extBase = 416 + c * 4;
          for (let f = 0; f < 4; f++) {
            stateSnapshot[extBase + f] = view.getFloat32(offset, false);
            offset += 4;
          }
        }
        if (hasReplayDirectorTelemetry) {
          for (let f = 0; f < telemetryFloats; f++) {
            stateSnapshot[302 + f] = view.getFloat32(offset, false);
            offset += 4;
          }
        }
        if (maxSlotSpan > 0) stateSnapshot[2] = maxSlotSpan;
        physics = {
          tick,
          activeCarMask,
          activeCarIndices,
          boostPadMaskLow,
          boostPadMaskHigh,
          acknowledgedControls,
          stateSnapshot,
        };
      }
    } else {
      const snapFloats = snapHeader;
      if (view.byteLength >= offset + snapFloats * 4) {
        const stateSnapshot = new Float32Array(snapFloats);
        for (let i = 0; i < snapFloats; i++) {
          stateSnapshot[i] = view.getFloat32(offset, false);
          offset += 4;
        }
        let activeCarMask = 0;
        for (let i = 0; i < acknowledgedControls.length; i++) {
          const c = acknowledgedControls[i]?.carIndex;
          if (typeof c === 'number' && c >= 0 && c < 8) activeCarMask |= 1 << c;
        }
        if (activeCarMask === 0 && snapFloats >= 3) {
          const n = Math.min(8, Math.max(1, Math.round(stateSnapshot[2] || 1)));
          activeCarMask = ((1 << n) - 1) & 0xff;
        }
        physics = {
          tick,
          activeCarMask,
          activeCarIndices: maskToActiveCarIndices(activeCarMask),
          acknowledgedControls,
          stateSnapshot,
        };
      }
    }
  }

  return { physics, nextOffset: offset, abortedEarly: false };
}
