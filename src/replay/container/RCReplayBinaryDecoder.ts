/**
 * src/replay/container/RCReplayBinaryDecoder.ts
 * Column untransposition, XOR-delta unfiltering, and V2 4-section binary container deserializer.
 */

import {
  RC_REPLAY_STATE_INPUT_STRIDE,
  RC_REPLAY_EVENT_STRIDE,
  isBinaryRCReplayContainer,
  decodeIncidentFrom64Bytes,
  decodeSignalFrom64Bytes,
  type DecodedIncidentEvent,
  type DecodedSignalEvent,
  type ReplaySnapshotFloat32Array,
  type DecodedReplayFrameSlot,
} from './RCReplayBinarySchema.ts';
import {
  buildFrameSlotAt,
  finalizeDecodedContainerResult,
  type DeserializedRCReplayContainer,
} from './RCReplayTrackMaterializer.ts';

export type { ReplaySnapshotFloat32Array, DecodedReplayFrameSlot, DeserializedRCReplayContainer };

/**
 * Reverses the 4-byte column transposition + XOR-delta filter back into the contiguous Track A buffer.
 */
export function unfilterAndUntransposeStateInputTrack(
  filteredBytes: Uint8Array | null | undefined,
  frameCount: number,
  stride = RC_REPLAY_STATE_INPUT_STRIDE
): Uint8Array {
  if (!filteredBytes || frameCount <= 0 || filteredBytes.byteLength < frameCount * stride) {
    return new Uint8Array(0);
  }
  const totalBytes = frameCount * stride;
  const wordsPerFrame = stride >>> 2;
  const outBytes = new Uint8Array(totalBytes);
  const outU32 = new Uint32Array(outBytes.buffer, outBytes.byteOffset, frameCount * wordsPerFrame);
  const planeSize = frameCount * wordsPerFrame;

  for (let w = 0; w < wordsPerFrame; w++) {
    let prevWord = 0;
    const colBase = w * frameCount;
    for (let f = 0; f < frameCount; f++) {
      const idx = colBase + f;
      const b0 = filteredBytes[idx];
      const b1 = filteredBytes[planeSize + idx];
      const b2 = filteredBytes[planeSize * 2 + idx];
      const b3 = filteredBytes[planeSize * 3 + idx];
      const xorWord = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
      const curWord = (xorWord ^ prevWord) >>> 0;
      prevWord = curWord;
      outU32[f * wordsPerFrame + w] = curWord;
    }
  }
  return outBytes;
}

function parseContainerHeaderAndEventTracks(
  bytesOrBuffer: Uint8Array | ArrayBuffer,
  stateInputBytesResolver: (
    rawTrackASlice: Uint8Array,
    frameCount: number,
    stateStride: number,
    encoding: string | undefined
  ) => Uint8Array
) {
  const u8 = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);

  if (!isBinaryRCReplayContainer(u8)) {
    throw new Error('Invalid RCREPLAY V2 binary header.');
  }

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const version = dv.getUint32(8, true);
  const metaLength = dv.getUint32(12, true);
  if (16 + metaLength > u8.byteLength) {
    throw new Error('Corrupt RCREPLAY metadata header length.');
  }

  const metaJsonText = new TextDecoder().decode(u8.subarray(16, 16 + metaLength));
  const headerObj = JSON.parse(metaJsonText);
  const matchInfo = headerObj.matchInfo || {};
  const tracksToc = headerObj.tracks || {};

  const stateToc = tracksToc.stateInput || {};
  const frameCount = Number(stateToc.count ?? matchInfo.frameCount ?? 0);
  const stateStride = Number(stateToc.stride || RC_REPLAY_STATE_INPUT_STRIDE);
  const rawTrackASlice =
    frameCount > 0 && stateToc.byteLength > 0
      ? u8.subarray(stateToc.offset, stateToc.offset + stateToc.byteLength)
      : new Uint8Array(0);

  const stateInputBytes = stateInputBytesResolver(
    rawTrackASlice,
    frameCount,
    stateStride,
    stateToc.encoding
  );

  return {
    u8,
    version,
    matchInfo,
    tracksToc,
    frameCount,
    stateStride,
    stateInputBytes,
  };
}

function decodeIncidentsAndSignalsFromBytes(
  u8: Uint8Array,
  tracksToc: Record<string, any>,
  stateInputBytes: Uint8Array,
  frameCount: number,
  stateStride: number
) {
  const readFrameTick = (idx: number): number => {
    if (idx < 0 || idx >= frameCount) return -1;
    const f32 = new Float32Array(
      stateInputBytes.buffer,
      stateInputBytes.byteOffset + idx * stateStride,
      1
    );
    return Math.floor(f32[0] || idx);
  };
  const resolveFrameIdxByTick = (targetTick: number, hintIdx: number): number => {
    if (frameCount <= 0) return 0;
    if (hintIdx >= 0 && hintIdx < frameCount && readFrameTick(hintIdx) === targetTick) {
      return hintIdx;
    }
    if (targetTick > 0) {
      let lo = 0;
      let hi = frameCount - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const midTick = readFrameTick(mid);
        if (midTick === targetTick) return mid;
        if (midTick < targetTick) lo = mid + 1;
        else hi = mid - 1;
      }
      return Math.max(0, Math.min(frameCount - 1, lo));
    }
    return Math.max(0, Math.min(frameCount - 1, hintIdx ?? 0));
  };

  const incToc = tracksToc.incidents || {};
  const incidentCount = Number(incToc.count ?? 0);
  const incidentStride = Number(incToc.stride || RC_REPLAY_EVENT_STRIDE);
  const incidentBytes =
    incidentCount > 0 && incToc.byteLength > 0
      ? u8.slice(incToc.offset, incToc.offset + incToc.byteLength)
      : new Uint8Array(0);

  const incidents: DecodedIncidentEvent[] = new Array(incidentCount);
  const incidentsByFrame = new Map<number, DecodedIncidentEvent[]>();
  for (let i = 0; i < incidentCount; i++) {
    const inc = decodeIncidentFrom64Bytes(incidentBytes, i * incidentStride);
    const fIdx = resolveFrameIdxByTick(inc.tick, inc.frameIndex ?? 0);
    inc.frameIndex = fIdx;
    incidents[i] = inc;
    let list = incidentsByFrame.get(fIdx);
    if (!list) {
      list = [];
      incidentsByFrame.set(fIdx, list);
    }
    list.push(inc);
  }

  const sigToc = tracksToc.signals || {};
  const signalCount = Number(sigToc.count ?? 0);
  const signalStride = Number(sigToc.stride || RC_REPLAY_EVENT_STRIDE);
  const signalBytes =
    signalCount > 0 && sigToc.byteLength > 0
      ? u8.slice(sigToc.offset, sigToc.offset + sigToc.byteLength)
      : new Uint8Array(0);

  const recordedSignals: DecodedSignalEvent[] = new Array(signalCount);
  const signalsByFrame = new Map<number, DecodedSignalEvent[]>();
  for (let i = 0; i < signalCount; i++) {
    const sig = decodeSignalFrom64Bytes(signalBytes, i * signalStride);
    recordedSignals[i] = sig;
    const fIdx = Math.max(0, Math.min(Math.max(0, frameCount - 1), sig.frameIndex ?? 0));
    let list = signalsByFrame.get(fIdx);
    if (!list) {
      list = [];
      signalsByFrame.set(fIdx, list);
    }
    list.push(sig);
  }

  const navToc = tracksToc.nativeEvents || {};
  const nativeEventBytes =
    Number(navToc.count ?? 0) > 0 && navToc.byteLength > 0
      ? u8.slice(navToc.offset, navToc.offset + navToc.byteLength)
      : new Uint8Array(0);

  const kfToc = tracksToc.keyframes || {};
  const keyframeBytes =
    Number(kfToc.count ?? 0) > 0 && kfToc.byteLength > 0
      ? u8.slice(kfToc.offset, kfToc.offset + kfToc.byteLength)
      : new Uint8Array(0);

  return {
    incidentCount,
    incidentBytes,
    incidents,
    incidentsByFrame,
    signalCount,
    signalBytes,
    recordedSignals,
    signalsByFrame,
    nativeEventBytes,
    keyframeBytes,
  };
}

/**
 * Parses a decompressed V2 Binary Container into 3 parallel timelines
 * (stateInputTimeline, incidentTimeline, signalTimeline) + per-frame composite slots.
 */
export function deserializeRCReplayBinaryContainer(
  bytesOrBuffer: Uint8Array | ArrayBuffer
): DeserializedRCReplayContainer {
  const { u8, version, matchInfo, tracksToc, frameCount, stateStride, stateInputBytes } =
    parseContainerHeaderAndEventTracks(bytesOrBuffer, (rawTrackASlice, count, stride, encoding) =>
      encoding === 'xor-delta-bytetran-v1'
        ? unfilterAndUntransposeStateInputTrack(rawTrackASlice, count, stride)
        : new Uint8Array(rawTrackASlice)
    );

  const decodedTracks = decodeIncidentsAndSignalsFromBytes(
    u8,
    tracksToc,
    stateInputBytes,
    frameCount,
    stateStride
  );

  const frames: ReplaySnapshotFloat32Array[] = new Array(frameCount);
  const frameSlots: DecodedReplayFrameSlot[] = new Array(frameCount);
  const isCountUp = matchInfo.mode === 'freeplay' || matchInfo.mode === 'training';

  for (let i = 0; i < frameCount; i++) {
    buildFrameSlotAt(
      i,
      stateInputBytes,
      stateStride,
      decodedTracks.incidentsByFrame,
      decodedTracks.signalsByFrame,
      isCountUp,
      frames,
      frameSlots
    );
  }

  return finalizeDecodedContainerResult({
    version,
    matchInfo,
    tracksToc,
    frameCount,
    stateStride,
    stateInputBytes,
    ...decodedTracks,
    frames,
    frameSlots,
    isCountUp,
  });
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function unfilterAndUntransposeStateInputTrackAsync(
  filteredBytes: Uint8Array | null | undefined,
  frameCount: number,
  stride: number
): Promise<Uint8Array> {
  if (!filteredBytes || filteredBytes.byteLength === 0 || frameCount <= 0) {
    return new Uint8Array(0);
  }
  const totalBytes = frameCount * stride;
  const wordsPerFrame = stride >>> 2;
  const outBytes = new Uint8Array(totalBytes);
  const outU32 = new Uint32Array(outBytes.buffer, outBytes.byteOffset, frameCount * wordsPerFrame);
  const planeSize = frameCount * wordsPerFrame;

  let lastYieldMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (let w = 0; w < wordsPerFrame; w++) {
    let prevWord = 0;
    const colBase = w * frameCount;
    for (let f = 0; f < frameCount; f++) {
      const idx = colBase + f;
      const b0 = filteredBytes[idx];
      const b1 = filteredBytes[planeSize + idx];
      const b2 = filteredBytes[planeSize * 2 + idx];
      const b3 = filteredBytes[planeSize * 3 + idx];
      const xorWord = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
      const curWord = (xorWord ^ prevWord) >>> 0;
      prevWord = curWord;
      outU32[f * wordsPerFrame + w] = curWord;
    }
    if ((w & 15) === 15) {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - lastYieldMs >= 12) {
        await yieldToMainThread();
        lastYieldMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      }
    }
  }
  return outBytes;
}

/**
 * Asynchronously parses a decompressed V2 Binary Container while yielding to the main thread
 * so UI loading spinners and animations remain smooth at 60fps.
 */
export async function deserializeRCReplayBinaryContainerAsync(
  bytesOrBuffer: Uint8Array | ArrayBuffer
): Promise<DeserializedRCReplayContainer> {
  const u8 = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);

  if (!isBinaryRCReplayContainer(u8)) {
    throw new Error('Invalid RCREPLAY V2 binary header.');
  }

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const version = dv.getUint32(8, true);
  const metaLength = dv.getUint32(12, true);
  if (16 + metaLength > u8.byteLength) {
    throw new Error('Corrupt RCREPLAY metadata header length.');
  }

  const metaJsonText = new TextDecoder().decode(u8.subarray(16, 16 + metaLength));
  const headerObj = JSON.parse(metaJsonText);
  const matchInfo = headerObj.matchInfo || {};
  const tracksToc = headerObj.tracks || {};

  const stateToc = tracksToc.stateInput || {};
  const frameCount = Number(stateToc.count ?? matchInfo.frameCount ?? 0);
  const stateStride = Number(stateToc.stride || RC_REPLAY_STATE_INPUT_STRIDE);
  const rawTrackASlice =
    frameCount > 0 && stateToc.byteLength > 0
      ? u8.subarray(stateToc.offset, stateToc.offset + stateToc.byteLength)
      : new Uint8Array(0);

  const stateInputBytes =
    stateToc.encoding === 'xor-delta-bytetran-v1'
      ? await unfilterAndUntransposeStateInputTrackAsync(rawTrackASlice, frameCount, stateStride)
      : new Uint8Array(rawTrackASlice);

  const decodedTracks = decodeIncidentsAndSignalsFromBytes(
    u8,
    tracksToc,
    stateInputBytes,
    frameCount,
    stateStride
  );

  const frames: ReplaySnapshotFloat32Array[] = new Array(frameCount);
  const frameSlots: DecodedReplayFrameSlot[] = new Array(frameCount);
  const isCountUp = matchInfo.mode === 'freeplay' || matchInfo.mode === 'training';

  let lastYieldMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (let i = 0; i < frameCount; i++) {
    buildFrameSlotAt(
      i,
      stateInputBytes,
      stateStride,
      decodedTracks.incidentsByFrame,
      decodedTracks.signalsByFrame,
      isCountUp,
      frames,
      frameSlots
    );

    if ((i & 511) === 511) {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - lastYieldMs >= 12) {
        await yieldToMainThread();
        lastYieldMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      }
    }
  }

  return finalizeDecodedContainerResult({
    version,
    matchInfo,
    tracksToc,
    frameCount,
    stateStride,
    stateInputBytes,
    ...decodedTracks,
    frames,
    frameSlots,
    isCountUp,
  });
}
