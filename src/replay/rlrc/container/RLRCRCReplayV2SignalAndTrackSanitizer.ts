/**
 * RLRCRCReplayV2SignalAndTrackSanitizer.ts
 * Sanitizes RLRC Track 0 state buffers for standard RCREPLAY V2 / RocketSim compatibility
 * and synthesizes authoritative Track C match signals (clock, kickoff, score) without
 * polluting `SIM_OFFSETS.GOAL`, `IS_SIMULATION_FROZEN`, or inactive roster slots.
 */

import {
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  EXTENDED_STATE_OFFSETS,
  MATCH_SIGNALS,
  SIM_OFFSETS,
} from '../../../physics/RocketSimConstants.ts';
import {
  decodeSignalFrom64Bytes,
  encodeSignalTo64Bytes,
  RC_REPLAY_EVENT_STRIDE,
} from '../../container/RCReplayBinarySchema.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  RLRC_STATE_FLOATS_PER_FRAME,
  RLRC_TICK_RATE,
  RLRC_TRACK0_FRAME_STRIDE_BYTES,
  type RLRCBookmarkRecord,
  type RLRCContainerPacket,
  type RLRCReplayHeaderMeta,
} from '../RLRCReplayTypes.ts';
import { RLRC_TRACK0_META_OFFSETS as M } from './RLRCTrack0FrameSlotPacker.ts';

export interface SanitizedRLRCV2TracksResult {
  readonly sanitizedStateInputBytes: Uint8Array;
  readonly signalBytes: Uint8Array;
  readonly regulationDurationSeconds: number;
  readonly rlrcNativeEvents: readonly RLRCBookmarkRecord[];
  readonly rlrcKeyframes: readonly RLRCBookmarkRecord[];
}

interface RawSignalSpec {
  readonly signalType: number;
  readonly frameIndex: number;
  readonly param1: number;
  readonly param2: number;
}

export function sanitizeRLRCTrack0AndSynthesizeSignals(
  packet: RLRCContainerPacket
): SanitizedRLRCV2TracksResult {
  const srcBytes = packet.stateInputTrackBytes;
  const frameCount = Math.floor(srcBytes.byteLength / RLRC_TRACK0_FRAME_STRIDE_BYTES);
  const sanitizedStateInputBytes = srcBytes.slice();
  const rosterLen = packet.roster.length;
  const activeCarCount = Math.max(1, Math.min(RLRC_MAX_PLAYER_SLOTS, rosterLen || 1));

  let initialClockSec = 0;
  for (let f = 0; f < Math.min(frameCount, 240); f++) {
    const f32 = new Float32Array(
      srcBytes.buffer,
      srcBytes.byteOffset + f * RLRC_TRACK0_FRAME_STRIDE_BYTES,
      RLRC_STATE_FLOATS_PER_FRAME
    );
    const hasMeta = Math.round(f32[M.MAGIC_TAG]) === M.MAGIC_VALUE;
    const sec = Math.round(
      f32[hasMeta ? M.SECONDS_REMAINING : EXTENDED_STATE_OFFSETS.IS_SIMULATION_FROZEN]
    );
    if (sec > 0 && sec <= 600) {
      initialClockSec = sec;
      break;
    }
  }
  const rawHeaderDur = Math.round(
    packet.header.durationSeconds || frameCount / RLRC_TICK_RATE || 300
  );
  const regulationDurationSeconds =
    initialClockSec > 0 ? initialClockSec : rawHeaderDur > 300 ? 300 : Math.max(1, rawHeaderDur);

  const signalSpecs: RawSignalSpec[] = [];
  if (frameCount > 0) {
    signalSpecs.push(
      {
        signalType: MATCH_SIGNALS.MATCH_STARTED,
        frameIndex: 0,
        param1: regulationDurationSeconds,
        param2: 0,
      },
      {
        signalType: MATCH_SIGNALS.KICKOFF_START,
        frameIndex: 0,
        param1: 0,
        param2: 0,
      },
      {
        signalType: MATCH_SIGNALS.CLOCK_UPDATED_SECONDS,
        frameIndex: 0,
        param1: regulationDurationSeconds,
        param2: 0,
      }
    );
  }

  const goalBookmarksByFrame = new Map<number, RLRCBookmarkRecord>();
  const kickoffFrames = new Set<number>();
  for (const bm of packet.bookmarks) {
    const fIdx = Math.max(0, Math.min(Math.max(0, frameCount - 1), Math.trunc(bm.frameIndex120Hz)));
    if (bm.kind === 'goal') {
      goalBookmarksByFrame.set(fIdx, bm);
    } else if (bm.kind === 'kickoff' && fIdx > 0) {
      kickoffFrames.add(fIdx);
    }
  }

  let prevSec = regulationDurationSeconds;
  let prevOt = false;
  let prevBlue = 0;
  let prevOrange = 0;

  for (let f = 0; f < frameCount; f++) {
    const byteOff = f * RLRC_TRACK0_FRAME_STRIDE_BYTES;
    const f32 = new Float32Array(
      sanitizedStateInputBytes.buffer,
      sanitizedStateInputBytes.byteOffset + byteOff,
      RLRC_STATE_FLOATS_PER_FRAME
    );

    const hasMeta = Math.round(f32[M.MAGIC_TAG]) === M.MAGIC_VALUE;
    const rawSec = Math.round(
      f32[hasMeta ? M.SECONDS_REMAINING : EXTENDED_STATE_OFFSETS.IS_SIMULATION_FROZEN]
    );
    const packedFlags = Math.round(
      f32[hasMeta ? M.MATCH_FLAGS : EXTENDED_STATE_OFFSETS.POSSESSION_STATE]
    );
    const isOt = (packedFlags & 1) !== 0;
    const blue = Math.max(
      prevBlue,
      Math.round(f32[hasMeta ? M.BLUE_SCORE : EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS])
    );
    const orange = Math.max(
      prevOrange,
      Math.round(f32[hasMeta ? M.ORANGE_SCORE : EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS])
    );

    const goalBm = goalBookmarksByFrame.get(f);
    if (blue > prevBlue || orange > prevOrange || goalBm) {
      const nextBlue = blue > prevBlue ? blue : goalBm?.team === 0 ? prevBlue + 1 : prevBlue;
      const nextOrange =
        orange > prevOrange ? orange : goalBm?.team === 1 ? prevOrange + 1 : prevOrange;
      if (nextBlue !== prevBlue || nextOrange !== prevOrange) {
        prevBlue = nextBlue;
        prevOrange = nextOrange;
        signalSpecs.push(
          {
            signalType: MATCH_SIGNALS.SCORE_UPDATED,
            frameIndex: f,
            param1: prevBlue,
            param2: prevOrange,
          },
          {
            signalType: MATCH_SIGNALS.KICKOFF_START,
            frameIndex: f,
            param1: 0,
            param2: 0,
          }
        );
      }
    } else if (kickoffFrames.has(f)) {
      signalSpecs.push({
        signalType: MATCH_SIGNALS.KICKOFF_START,
        frameIndex: f,
        param1: 0,
        param2: 0,
      });
    }

    const effSec = rawSec > 0 && rawSec <= 600 ? rawSec : prevSec;
    if (f > 0 && (effSec !== prevSec || isOt !== prevOt)) {
      prevSec = effSec;
      prevOt = isOt;
      signalSpecs.push({
        signalType: MATCH_SIGNALS.CLOCK_UPDATED_SECONDS,
        frameIndex: f,
        param1: effSec,
        param2: isOt ? 1 : 0,
      });
    }

    f32[SIM_OFFSETS.GOAL] = 0;
    f32[SIM_OFFSETS.NUM_CARS] = activeCarCount;
    f32[EXTENDED_STATE_OFFSETS.IS_SIMULATION_FROZEN] = 0;
    f32[EXTENDED_STATE_OFFSETS.POSSESSION_STATE] = 0;

    for (let s = 0; s < RLRC_MAX_PLAYER_SLOTS; s++) {
      const carBase = SIM_OFFSETS.CARS + s * CAR_STATE_STRIDE;
      const isOutOfRoster = rosterLen > 0 && s >= rosterLen;
      const isParked =
        f32[carBase + CAR_STATE_OFFSETS.POS + 0] <= -5000 &&
        f32[carBase + CAR_STATE_OFFSETS.POS + 2] <= -200;
      if (isOutOfRoster || isParked) {
        f32[carBase + CAR_STATE_OFFSETS.POS + 0] = -5500;
        f32[carBase + CAR_STATE_OFFSETS.POS + 1] = s * 300;
        f32[carBase + CAR_STATE_OFFSETS.POS + 2] = -2000;
        f32.fill(0, carBase + CAR_STATE_OFFSETS.FWD, carBase + CAR_STATE_OFFSETS.FWD + 9);
        f32[carBase + CAR_STATE_OFFSETS.DEMOED] = 0;
      } else if (f32[carBase + CAR_STATE_OFFSETS.DEMOED] >= 0.5) {
        const fwdLen = Math.hypot(
          f32[carBase + CAR_STATE_OFFSETS.FWD + 0],
          f32[carBase + CAR_STATE_OFFSETS.FWD + 1],
          f32[carBase + CAR_STATE_OFFSETS.FWD + 2]
        );
        if (fwdLen < 0.5) {
          f32.fill(0, carBase + CAR_STATE_OFFSETS.FWD, carBase + CAR_STATE_OFFSETS.FWD + 9);
          f32[carBase + CAR_STATE_OFFSETS.FWD + 0] = 1;
          f32[carBase + CAR_STATE_OFFSETS.RIGHT + 1] = 1;
          f32[carBase + CAR_STATE_OFFSETS.UP + 2] = 1;
        }
        f32.fill(0, carBase + CAR_STATE_OFFSETS.VEL, carBase + CAR_STATE_OFFSETS.VEL + 6);
        f32[carBase + CAR_STATE_OFFSETS.DEMOED] = 1;
      }
    }
  }

  const signalBytes = new Uint8Array(signalSpecs.length * RC_REPLAY_EVENT_STRIDE);
  for (let i = 0; i < signalSpecs.length; i++) {
    const spec = signalSpecs[i];
    encodeSignalTo64Bytes(
      {
        signalId: i + 1,
        signalType: spec.signalType,
        type: spec.signalType,
        frameId: spec.frameIndex,
        tick: spec.frameIndex,
        frameIndex: spec.frameIndex,
        param1: spec.param1,
        param2: spec.param2,
      },
      signalBytes,
      i * RC_REPLAY_EVENT_STRIDE,
      spec.frameIndex
    );
  }

  const rlrcNativeEvents = packet.bookmarks.filter(
    (b) => b.kind === 'goal' || b.kind === 'save' || b.kind === 'demolish' || b.kind === 'user-mark'
  );
  const rlrcKeyframes = packet.bookmarks.filter(
    (b) => b.kind === 'ue-keyframe' || b.kind === 'kickoff'
  );

  return {
    sanitizedStateInputBytes,
    signalBytes,
    regulationDurationSeconds,
    rlrcNativeEvents,
    rlrcKeyframes,
  };
}

export function restoreRLRCTrack0FromSanitizedStateInput(
  stateInputTrackBytes: Uint8Array,
  rosterLength: number,
  header: RLRCReplayHeaderMeta,
  rawSignalsSlice?: Uint8Array
): void {
  const frameCount = Math.floor(stateInputTrackBytes.byteLength / RLRC_TRACK0_FRAME_STRIDE_BYTES);
  if (frameCount <= 0) return;

  const clockByFrame = new Int16Array(frameCount);
  const otByFrame = new Uint8Array(frameCount);
  let curSec = 300;
  let curOt = 0;
  if (rawSignalsSlice && rawSignalsSlice.byteLength >= RC_REPLAY_EVENT_STRIDE) {
    const sigCount = Math.floor(rawSignalsSlice.byteLength / RC_REPLAY_EVENT_STRIDE);
    let sIdx = 0;
    for (let f = 0; f < frameCount; f++) {
      while (sIdx < sigCount) {
        const sig = decodeSignalFrom64Bytes(rawSignalsSlice, sIdx * RC_REPLAY_EVENT_STRIDE);
        const sf = Math.max(0, sig.frameIndex ?? sig.tick ?? 0);
        if (sf > f) break;
        if (
          sig.signalType === MATCH_SIGNALS.CLOCK_UPDATED_SECONDS ||
          sig.signalType === MATCH_SIGNALS.MATCH_STARTED
        ) {
          if (typeof sig.param1 === 'number' && sig.param1 >= 0 && sig.param1 <= 600) {
            curSec = sig.param1;
          }
          if (sig.signalType === MATCH_SIGNALS.CLOCK_UPDATED_SECONDS) {
            curOt = sig.param2 === 1 ? 1 : 0;
          }
        }
        sIdx++;
      }
      clockByFrame[f] = curSec;
      otByFrame[f] = curOt;
    }
  } else {
    clockByFrame.fill(300);
  }

  const recordFps = header.recordFps > 0 ? header.recordFps : 30;
  for (let f = 0; f < frameCount; f++) {
    const f32 = new Float32Array(
      stateInputTrackBytes.buffer,
      stateInputTrackBytes.byteOffset + f * RLRC_TRACK0_FRAME_STRIDE_BYTES,
      RLRC_STATE_FLOATS_PER_FRAME
    );
    const hasMeta = Math.round(f32[M.MAGIC_TAG]) === M.MAGIC_VALUE;
    if (!hasMeta) {
      if (f32[SIM_OFFSETS.GOAL] === 0 && f > 0) {
        f32[SIM_OFFSETS.GOAL] = Math.floor((f * recordFps) / RLRC_TICK_RATE);
      }
      if (f32[EXTENDED_STATE_OFFSETS.IS_SIMULATION_FROZEN] === 0) {
        f32[EXTENDED_STATE_OFFSETS.IS_SIMULATION_FROZEN] = clockByFrame[f];
      }
      if (f32[EXTENDED_STATE_OFFSETS.POSSESSION_STATE] === 0 && otByFrame[f]) {
        f32[EXTENDED_STATE_OFFSETS.POSSESSION_STATE] = 1;
      }
    }
    for (let s = 0; s < RLRC_MAX_PLAYER_SLOTS; s++) {
      const carBase = SIM_OFFSETS.CARS + s * CAR_STATE_STRIDE;
      const isOutOfRoster = rosterLength > 0 && s >= rosterLength;
      if (isOutOfRoster) {
        f32[carBase + CAR_STATE_OFFSETS.POS + 0] = -5500;
        f32[carBase + CAR_STATE_OFFSETS.POS + 1] = s * 300;
        f32[carBase + CAR_STATE_OFFSETS.POS + 2] = -2000;
        f32.fill(0, carBase + CAR_STATE_OFFSETS.FWD, carBase + CAR_STATE_OFFSETS.FWD + 9);
        f32[carBase + CAR_STATE_OFFSETS.DEMOED] = 0;
      }
    }
  }
}
