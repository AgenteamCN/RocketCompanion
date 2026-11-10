/**
 * RLRCTrack0TimelineBatchPacker.ts
 * Batch Track 0 binary packer, in-place synthesized controls writer, and lazy Proxy
 * timeline view over a flat `stateInputTrackBytes` Uint8Array.
 */

import {
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  EXTENDED_STATE_OFFSETS,
  SIM_OFFSETS,
} from '../../../physics/RocketSimConstants.ts';
import { packCarControlsToTrack64 } from '../../container/RCReplayBinarySchema.ts';
import {
  RLRC_BOOKMARK_RECORD_STRIDE_BYTES,
  RLRC_CONTROLS_BYTES_PER_FRAME,
  RLRC_MAX_PLAYER_SLOTS,
  RLRC_STATE_BYTES_PER_FRAME,
  RLRC_STATE_FLOATS_PER_FRAME,
  RLRC_TRACK0_FRAME_STRIDE_BYTES,
  type RLRCBookmarkKind,
  type RLRCBookmarkRecord,
  type RLRCCarFrameState120Hz,
  type RLRCFrame120Hz,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import {
  packRLRCFrameToTrack0Slot,
  RLRC_TRACK0_META_OFFSETS,
  unpackRLRCFrameFromTrack0Slot,
} from './RLRCTrack0FrameSlotPacker.ts';

const MAX_PACKED_SLOTS = 8;
const RLRC_BOOKMARK_LABEL_MAX_BYTES = 44;

const BOOKMARK_KIND_TO_CODE: Readonly<Record<RLRCBookmarkKind, number>> = Object.freeze({
  'user-mark': 1,
  goal: 2,
  kickoff: 3,
  demolish: 4,
  'ue-keyframe': 5,
  save: 6,
});

const CODE_TO_BOOKMARK_KIND: Readonly<Record<number, RLRCBookmarkKind>> = Object.freeze({
  1: 'user-mark',
  2: 'goal',
  3: 'kickoff',
  4: 'demolish',
  5: 'ue-keyframe',
  6: 'save',
});

export function packRLRCFramesToTrack0Bytes(
  frames120Hz: readonly RLRCFrame120Hz[],
  targetTrackBytes?: Uint8Array
): Uint8Array {
  const requiredBytes = frames120Hz.length * RLRC_TRACK0_FRAME_STRIDE_BYTES;
  const out =
    targetTrackBytes && targetTrackBytes.byteLength >= requiredBytes
      ? targetTrackBytes
      : new Uint8Array(requiredBytes);

  for (let f = 0; f < frames120Hz.length; f++) {
    packRLRCFrameToTrack0Slot(frames120Hz[f], out, f * RLRC_TRACK0_FRAME_STRIDE_BYTES);
  }
  return out;
}

export function packRLRCFrameControlsTo64Bytes(
  cars: readonly RLRCCarFrameState120Hz[],
  targetU8?: Uint8Array,
  off = 0
): Uint8Array {
  const out =
    targetU8 && targetU8.byteLength >= off + RLRC_CONTROLS_BYTES_PER_FRAME
      ? targetU8.subarray(off, off + RLRC_CONTROLS_BYTES_PER_FRAME)
      : new Uint8Array(RLRC_CONTROLS_BYTES_PER_FRAME);
  out.fill(0);
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (!car?.entityActive) continue;
    const idx = car.slotIndex >= 0 && car.slotIndex < MAX_PACKED_SLOTS ? car.slotIndex : i;
    if (idx >= 0 && idx < MAX_PACKED_SLOTS) {
      packCarControlsToTrack64(out, idx, { ...car.controls });
    }
  }
  return out;
}

export function writeSynthesizedControlsToTrack0Buffer(
  frames: readonly RLRCFrame120Hz[],
  trackBytes: Uint8Array
): void {
  const maxF = Math.min(
    frames.length,
    Math.floor(trackBytes.byteLength / RLRC_TRACK0_FRAME_STRIDE_BYTES)
  );
  const {
    CAR_JUMP_AIR_BASE: j0,
    CAR_JUMP_AIR_STRIDE: jS,
    CAR_IS_JUMPING_OFFSET: oJ,
    CAR_AIR_TIME_OFFSET: oAir,
    CAR_JUMP_TIME_OFFSET: oJmp,
    CAR_AIR_TIME_SINCE_JUMP_OFFSET: oAt,
  } = EXTENDED_STATE_OFFSETS;
  const { HAS_FLIP_OR_JUMP: oFlp, IS_BOOSTING: oBst, IS_FLIPPING: oFl } = CAR_STATE_OFFSETS;

  for (let f = 0; f < maxF; f++) {
    const off = f * RLRC_TRACK0_FRAME_STRIDE_BYTES;
    const dst = new Float32Array(
      trackBytes.buffer,
      trackBytes.byteOffset + off,
      RLRC_STATE_FLOATS_PER_FRAME
    );
    const cars = frames[f].cars;
    let slotMask = 0;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car) continue;
      const slot = car.slotIndex >= 0 && car.slotIndex < RLRC_MAX_PLAYER_SLOTS ? car.slotIndex : i;
      if (slot < 0 || slot >= RLRC_MAX_PLAYER_SLOTS) continue;
      const cB = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
      const jB = j0 + slot * jS;
      const act = car.entityActive;
      const fl = car.activeFlags;
      const airTime = act && !car.isOnGround ? Math.max(0, car.airTimeSinceJump) : 0;
      if (act) {
        slotMask |=
          (1 << slot) |
          (fl.doubleJumpActive ? 1 << (slot + 6) : 0) |
          (fl.dodgeActive ? 1 << (slot + 12) : 0);
      }
      dst[cB + oFlp] = act && car.hasFlipOrJump ? 1 : 0;
      dst[cB + oBst] = act && (fl.boostActive || car.controls.boost) ? 1 : 0;
      dst[cB + oFl] = act && (fl.dodgeActive || fl.doubleJumpActive) ? 1 : 0;
      dst[jB + oJ] = act && fl.jumpActive ? 1 : 0;
      dst[jB + oAir] = airTime;
      dst[jB + oJmp] = act && fl.jumpActive ? Math.min(0.2, airTime) : 0;
      dst[jB + oAt] = act ? car.airTimeSinceJump : 0;
    }
    dst[RLRC_TRACK0_META_OFFSETS.SLOT_ACTION_MASK] = slotMask;
    dst[RLRC_TRACK0_META_OFFSETS.MAGIC_TAG] = RLRC_TRACK0_META_OFFSETS.MAGIC_VALUE;
    packRLRCFrameControlsTo64Bytes(cars, trackBytes, off + RLRC_STATE_BYTES_PER_FRAME);
  }
}

/**
 * Creates a lightweight array-like view over `stateInputTrackBytes` that unpacks
 * `RLRCFrame120Hz` on demand with a bounded ring cache, eliminating the need to keep
 * 36,000+ deep JS frame object graphs in heap memory after conversion.
 */
export function createLazyTrack0FramesView(
  stateInputTrackBytes: Uint8Array,
  cacheSize = 16
): readonly RLRCFrame120Hz[] {
  const frameCount = Math.floor(stateInputTrackBytes.byteLength / RLRC_TRACK0_FRAME_STRIDE_BYTES);
  if (frameCount <= 0) return [];

  const ringIndices = new Int32Array(cacheSize).fill(-1);
  const ringFrames: Array<RLRCFrame120Hz | undefined> = new Array(cacheSize);
  let ringCursor = 0;

  const getFrameAt = (index: number): RLRCFrame120Hz | undefined => {
    if (index < 0 || index >= frameCount) return undefined;
    for (let i = 0; i < cacheSize; i++) {
      if (ringIndices[i] === index && ringFrames[i] !== undefined) {
        return ringFrames[i];
      }
    }
    const unpacked = unpackRLRCFrameFromTrack0Slot(stateInputTrackBytes, index);
    ringIndices[ringCursor] = index;
    ringFrames[ringCursor] = unpacked;
    ringCursor = (ringCursor + 1) % cacheSize;
    return unpacked;
  };

  const target: RLRCFrame120Hz[] = [];
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === 'length') return frameCount;
      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (Number.isInteger(idx) && idx >= 0 && idx < frameCount) {
          return getFrameAt(idx);
        }
      }
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < frameCount; i++) {
            yield getFrameAt(i)!;
          }
        };
      }
      return Reflect.get(obj, prop, receiver);
    },
    has(obj, prop) {
      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (Number.isInteger(idx) && idx >= 0 && idx < frameCount) return true;
      }
      return Reflect.has(obj, prop);
    },
  });
}

export function encodeRLRCBookmarksToTrack1Bytes(
  bookmarks: readonly RLRCBookmarkRecord[]
): Uint8Array {
  const trackBytes = new Uint8Array(bookmarks.length * RLRC_BOOKMARK_RECORD_STRIDE_BYTES);
  const encoder = new TextEncoder();
  const dv = new DataView(trackBytes.buffer, trackBytes.byteOffset, trackBytes.byteLength);

  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    const base = i * RLRC_BOOKMARK_RECORD_STRIDE_BYTES;
    const labelBytes = encoder.encode(bm.label || '');
    const clampedLabelLen = Math.min(RLRC_BOOKMARK_LABEL_MAX_BYTES, labelBytes.byteLength);

    dv.setUint32(base + 0, Math.max(0, Math.trunc(bm.frameIndex120Hz)), true);
    dv.setUint32(base + 4, Math.max(0, Math.trunc(bm.sourceFrame30Hz)), true);
    dv.setFloat32(base + 8, bm.timeSeconds, true);
    dv.setUint8(base + 12, BOOKMARK_KIND_TO_CODE[bm.kind] ?? 1);
    dv.setInt8(base + 13, bm.slotIndex);
    dv.setInt8(base + 14, bm.team);
    dv.setUint8(base + 15, clampedLabelLen);
    trackBytes.set(labelBytes.subarray(0, clampedLabelLen), base + 16);
  }
  return trackBytes;
}

export function decodeRLRCBookmarksFromTrack1Bytes(
  bookmarkTrackBytes: Uint8Array
): RLRCBookmarkRecord[] {
  const count = Math.floor(bookmarkTrackBytes.byteLength / RLRC_BOOKMARK_RECORD_STRIDE_BYTES);
  const records: RLRCBookmarkRecord[] = new Array(count);
  const decoder = new TextDecoder();
  const dv = new DataView(
    bookmarkTrackBytes.buffer,
    bookmarkTrackBytes.byteOffset,
    bookmarkTrackBytes.byteLength
  );

  for (let i = 0; i < count; i++) {
    const base = i * RLRC_BOOKMARK_RECORD_STRIDE_BYTES;
    const kindCode = dv.getUint8(base + 12);
    const rawTeam = dv.getInt8(base + 14);
    const labelLen = Math.min(RLRC_BOOKMARK_LABEL_MAX_BYTES, dv.getUint8(base + 15));
    const team: RLRCTeamIndex | -1 = rawTeam === 0 || rawTeam === 1 ? rawTeam : -1;

    records[i] = {
      kind: CODE_TO_BOOKMARK_KIND[kindCode] ?? 'user-mark',
      frameIndex120Hz: dv.getUint32(base + 0, true),
      sourceFrame30Hz: dv.getUint32(base + 4, true),
      timeSeconds: dv.getFloat32(base + 8, true),
      slotIndex: dv.getInt8(base + 13),
      team,
      label: decoder.decode(bookmarkTrackBytes.subarray(base + 16, base + 16 + labelLen)),
    };
  }
  return records;
}
