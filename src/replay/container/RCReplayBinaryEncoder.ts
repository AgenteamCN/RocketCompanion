/**
 * src/replay/container/RCReplayBinaryEncoder.ts
 * Track normalization, XOR-delta column transposition, and V2 4-section binary container serializer.
 */

import {
  STATE_BUFFER_FLOATS,
  MAX_CARS,
  isIncidentEvent,
  isSystemControlSignal,
} from '../../physics/RocketSimConstants.ts';
import {
  RC_REPLAY_MAGIC_V2,
  RC_REPLAY_VERSION_V2,
  RC_REPLAY_STATE_BYTES,
  RC_REPLAY_CONTROLS_BYTES,
  RC_REPLAY_STATE_INPUT_STRIDE,
  RC_REPLAY_EVENT_STRIDE,
  MAGIC_BYTES,
  packCarControlsToTrack64,
  encodeIncidentTo64Bytes,
  encodeSignalTo64Bytes,
} from './RCReplayBinarySchema.ts';
import { synthesizeFallbackSignalsFromIncidents } from './RCReplayFallbackSignalSynthesizer.ts';

export interface NormalizedReplayTracksPayload {
  frameCount: number;
  stateStride: number;
  incidentCount: number;
  signalCount: number;
  nativeEventCount?: number;
  keyframeCount?: number;
  stateInputBytes: Uint8Array;
  incidentBytes: Uint8Array;
  signalBytes: Uint8Array;
  nativeEventBytes?: Uint8Array;
  keyframeBytes?: Uint8Array;
}

export interface ReplaySerializeOptions {
  deltaTranspose?: boolean;
}

/**
 * Applies XOR-delta + 4-byte column transposition on Track A (State + Input)
 * so GZIP achieves ultra-high compression ratios on floating-point state streams.
 */
export function filterAndTransposeStateInputTrack(
  rawTrackBytes: Uint8Array | null | undefined,
  frameCount: number,
  stride = RC_REPLAY_STATE_INPUT_STRIDE
): Uint8Array {
  if (!rawTrackBytes || frameCount <= 0 || rawTrackBytes.byteLength < frameCount * stride) {
    return new Uint8Array(0);
  }
  const totalBytes = frameCount * stride;
  const wordsPerFrame = stride >>> 2; // 464 words
  const srcU32 = new Uint32Array(
    rawTrackBytes.buffer,
    rawTrackBytes.byteOffset,
    frameCount * wordsPerFrame
  );

  const outBytes = new Uint8Array(totalBytes);
  const planeSize = frameCount * wordsPerFrame;

  for (let w = 0; w < wordsPerFrame; w++) {
    let prevWord = 0;
    const colBase = w * frameCount;
    for (let f = 0; f < frameCount; f++) {
      const curWord = srcU32[f * wordsPerFrame + w];
      const xorWord = (curWord ^ prevWord) >>> 0;
      prevWord = curWord;

      const idx = colBase + f;
      outBytes[idx] = xorWord & 0xff;
      outBytes[planeSize + idx] = (xorWord >>> 8) & 0xff;
      outBytes[planeSize * 2 + idx] = (xorWord >>> 16) & 0xff;
      outBytes[planeSize * 3 + idx] = (xorWord >>> 24) & 0xff;
    }
  }
  return outBytes;
}

function resolveFrameIndexFromTrackBytes(
  stateInputBytes: Uint8Array,
  frameCount: number,
  stride: number,
  targetTick: number,
  hintFrameIndex = 0
): number {
  if (frameCount <= 0) return 0;
  const readTick = (idx: number) =>
    Math.floor(
      new Float32Array(stateInputBytes.buffer, stateInputBytes.byteOffset + idx * stride, 1)[0] ||
        idx
    );
  if (
    hintFrameIndex >= 0 &&
    hintFrameIndex < frameCount &&
    readTick(hintFrameIndex) === targetTick
  ) {
    return hintFrameIndex;
  }
  let lo = 0,
    hi = frameCount - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midTick = readTick(mid);
    if (midTick === targetTick) return mid;
    if (midTick < targetTick) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(frameCount - 1, lo));
}

/**
 * Normalizes any replay source (WASM tracks, ReplayRingBuffer, or frames array)
 * into the 3 raw binary tracks + metadata.
 */
export function normalizeReplayTracksPayload(
  replayObj: Record<string, any> = {}
): NormalizedReplayTracksPayload {
  const stride = RC_REPLAY_STATE_INPUT_STRIDE;
  const nativeEventBytes =
    replayObj.nativeEventBytes instanceof Uint8Array
      ? replayObj.nativeEventBytes
      : new Uint8Array(0);
  const keyframeBytes =
    replayObj.keyframeBytes instanceof Uint8Array ? replayObj.keyframeBytes : new Uint8Array(0);

  if (
    replayObj.stateInputBytes instanceof Uint8Array &&
    replayObj.stateInputBytes.byteLength >= stride
  ) {
    const frameCount = Math.floor(replayObj.stateInputBytes.byteLength / stride);
    const stateInputSlice = replayObj.stateInputBytes.subarray(0, frameCount * stride);
    let incidentBytes =
      replayObj.incidentBytes instanceof Uint8Array ? replayObj.incidentBytes : new Uint8Array(0);
    const rawIncidentCount = Math.floor(incidentBytes.byteLength / RC_REPLAY_EVENT_STRIDE);
    let incidentCount = 0;
    if (rawIncidentCount > 0) {
      const filtered = new Uint8Array(rawIncidentCount * RC_REPLAY_EVENT_STRIDE);
      for (let i = 0; i < rawIncidentCount; i++) {
        const off = i * RC_REPLAY_EVENT_STRIDE;
        if (!isIncidentEvent(incidentBytes[off])) continue;
        const dstOff = incidentCount * RC_REPLAY_EVENT_STRIDE;
        filtered.set(incidentBytes.subarray(off, off + RC_REPLAY_EVENT_STRIDE), dstOff);
        if (frameCount > 0) {
          const u32 = new Uint32Array(filtered.buffer, filtered.byteOffset + dstOff, 16);
          if (u32[1] > 0) {
            u32[15] =
              resolveFrameIndexFromTrackBytes(
                stateInputSlice,
                frameCount,
                stride,
                u32[1],
                u32[15]
              ) >>> 0;
          }
        }
        incidentCount++;
      }
      incidentBytes = filtered.subarray(0, incidentCount * RC_REPLAY_EVENT_STRIDE);
    }
    const signalBytes =
      replayObj.signalBytes instanceof Uint8Array ? replayObj.signalBytes : new Uint8Array(0);
    return {
      frameCount,
      stateStride: stride,
      incidentCount,
      signalCount: Math.floor(signalBytes.byteLength / RC_REPLAY_EVENT_STRIDE),
      nativeEventCount: Math.floor(nativeEventBytes.byteLength / RC_REPLAY_EVENT_STRIDE),
      keyframeCount: Math.floor(keyframeBytes.byteLength / RC_REPLAY_EVENT_STRIDE),
      stateInputBytes: stateInputSlice,
      incidentBytes,
      signalBytes,
      nativeEventBytes,
      keyframeBytes,
    };
  }

  const rawSlots =
    Array.isArray(replayObj.slots) && replayObj.slots.length > 0
      ? replayObj.slots
      : Array.isArray(replayObj.frames)
        ? replayObj.frames
        : [];
  const frameCount = rawSlots.length;
  const stateInputBytes = new Uint8Array(frameCount * stride);
  const collectedIncidents: Array<Record<string, any>> = [];
  const collectedSignals: Array<Record<string, any>> = [];
  const seenSignalKeys = new Set<string>();
  const includeSysCtrl = Boolean(replayObj.includeSystemControlSignals);

  const pushSignalIfUnique = (
    sig: Record<string, unknown> | null | undefined,
    fallbackTick: number,
    frameIndex?: number
  ) => {
    if (
      !sig ||
      (!includeSysCtrl && isSystemControlSignal(Number(sig.signalType ?? sig.type ?? 0)))
    ) {
      return;
    }
    const sigId = Number(sig.signalId ?? 0);
    const key =
      sigId > 0
        ? `id_${sigId}`
        : `t_${sig.signalType}_${sig.frameId ?? fallbackTick}_${sig.param1 ?? 0}_${sig.param2 ?? 0}`;
    if (seenSignalKeys.has(key)) return;
    seenSignalKeys.add(key);
    collectedSignals.push(
      frameIndex !== undefined
        ? { ...sig, frameId: sig.frameId ?? fallbackTick, frameIndex }
        : sig
    );
  };

  for (let i = 0; i < frameCount; i++) {
    const item = rawSlots[i];
    const snap =
      item instanceof Float32Array
        ? item
        : (item?.snapshot ?? item?.compactSnap ?? item?.state ?? item?.renderState);
    const frameByteOff = i * stride;
    if (snap instanceof Float32Array) {
      new Float32Array(
        stateInputBytes.buffer,
        stateInputBytes.byteOffset + frameByteOff,
        STATE_BUFFER_FLOATS
      ).set(snap.subarray(0, Math.min(snap.length, STATE_BUFFER_FLOATS)));
    }

    const ctrlSlice = stateInputBytes.subarray(
      frameByteOff + RC_REPLAY_STATE_BYTES,
      frameByteOff + stride
    );
    if (item?.controlsBytes instanceof Uint8Array && item.controlsBytes.byteLength >= 24) {
      ctrlSlice.set(item.controlsBytes.subarray(0, Math.min(64, item.controlsBytes.byteLength)));
    } else if (Array.isArray(item?.acknowledgedControls)) {
      for (let c = 0; c < item.acknowledgedControls.length; c++) {
        const entry = item.acknowledgedControls[c];
        if (!entry) continue;
        if (typeof entry.carIndex === 'number' && entry.controls) {
          packCarControlsToTrack64(ctrlSlice, entry.carIndex, entry.controls);
        } else if (c < MAX_CARS && typeof entry === 'object') {
          packCarControlsToTrack64(ctrlSlice, c, entry);
        }
      }
    } else if (Array.isArray(item?.controls)) {
      for (let c = 0; c < Math.min(MAX_CARS, item.controls.length); c++) {
        if (item.controls[c]) packCarControlsToTrack64(ctrlSlice, c, item.controls[c]);
      }
    } else if (item?.controls && typeof item.controls === 'object') {
      packCarControlsToTrack64(ctrlSlice, 0, item.controls);
    }

    const tick = item?.tick ?? (snap instanceof Float32Array ? Math.floor(snap[0] || i) : i);
    if (Array.isArray(item?.incidents)) {
      for (const inc of item.incidents) {
        if (inc && isIncidentEvent(inc.type)) {
          collectedIncidents.push({ ...inc, tick: inc.tick ?? tick, frameIndex: i });
        }
      }
    }
    if (Array.isArray(item?.signals)) {
      for (const sig of item.signals) pushSignalIfUnique(sig, tick, i);
    }
  }

  if (Array.isArray(replayObj.incidents) && collectedIncidents.length === 0) {
    for (const inc of replayObj.incidents) {
      if (inc && isIncidentEvent(inc.type)) collectedIncidents.push(inc);
    }
  }
  if (Array.isArray(replayObj.signals) && collectedSignals.length === 0) {
    for (const sig of replayObj.signals) pushSignalIfUnique(sig, 0);
  }

  if (collectedSignals.length === 0 && frameCount > 0 && collectedIncidents.length > 0) {
    const synthSlots = rawSlots.map((item: Record<string, unknown> | Float32Array, i: number) => {
      const snap =
        item instanceof Float32Array
          ? item
          : ((item?.snapshot ?? item?.compactSnap) as Float32Array | undefined);
      const tickVal = !(item instanceof Float32Array) && typeof item?.tick === 'number'
        ? item.tick
        : snap
          ? Math.floor(snap[0] || i)
          : i;
      return { tick: tickVal };
    });
    collectedSignals.push(
      ...synthesizeFallbackSignalsFromIncidents(collectedIncidents, synthSlots, {
        mode: replayObj.mode || replayObj.gameMode || 'match',
        winner: replayObj.winner || 'blue',
        winReason: replayObj.winReason ?? 0,
      })
    );
  }

  const incidentBytes = new Uint8Array(collectedIncidents.length * RC_REPLAY_EVENT_STRIDE);
  for (let i = 0; i < collectedIncidents.length; i++) {
    encodeIncidentTo64Bytes(
      collectedIncidents[i],
      incidentBytes,
      i * RC_REPLAY_EVENT_STRIDE,
      collectedIncidents[i].frameIndex ?? 0
    );
  }
  const signalBytes = new Uint8Array(collectedSignals.length * RC_REPLAY_EVENT_STRIDE);
  for (let i = 0; i < collectedSignals.length; i++) {
    encodeSignalTo64Bytes(
      collectedSignals[i],
      signalBytes,
      i * RC_REPLAY_EVENT_STRIDE,
      collectedSignals[i].frameIndex ?? 0
    );
  }

  return {
    frameCount,
    stateStride: stride,
    incidentCount: collectedIncidents.length,
    signalCount: collectedSignals.length,
    nativeEventCount: Math.floor(nativeEventBytes.byteLength / RC_REPLAY_EVENT_STRIDE),
    keyframeCount: Math.floor(keyframeBytes.byteLength / RC_REPLAY_EVENT_STRIDE),
    stateInputBytes,
    incidentBytes,
    signalBytes,
    nativeEventBytes,
    keyframeBytes,
  };
}

export function serializeRCReplayBinaryContainer(
  replayObj: Record<string, any> = {},
  options: ReplaySerializeOptions = {}
): Uint8Array {
  const tracks = normalizeReplayTracksPayload(replayObj);
  const useDeltaTranspose = options.deltaTranspose !== false;
  const encodedTrackA = useDeltaTranspose
    ? filterAndTransposeStateInputTrack(
        tracks.stateInputBytes,
        tracks.frameCount,
        tracks.stateStride
      )
    : tracks.stateInputBytes;
  const [encodedTrackB, encodedTrackC, encodedTrackD, encodedTrackE] = [
    tracks.incidentBytes,
    tracks.signalBytes,
    tracks.nativeEventBytes ?? new Uint8Array(0),
    tracks.keyframeBytes ?? new Uint8Array(0),
  ];
  const normalizedRoster = Array.isArray(replayObj.roster)
    ? replayObj.roster
    : Array.isArray(replayObj.roster?.players)
      ? replayObj.roster.players
      : [];
  const normalizedLoadouts = Array.isArray(replayObj.loadouts)
    ? replayObj.loadouts
    : normalizedRoster;
  const tickRate = replayObj.tickRate || 120;

  const buildMetaJson = (a: number, b: number, c: number, d: number, e: number) => ({
    magic: RC_REPLAY_MAGIC_V2,
    version: RC_REPLAY_VERSION_V2,
    format: 'multi-track-binary-v2',
    matchInfo: {
      mode: replayObj.mode || replayObj.gameMode || 'match',
      arenaPreset: replayObj.arenaPreset ?? 0,
      tickRate,
      frameCount: tracks.frameCount,
      durationSec: Number((tracks.frameCount / tickRate).toFixed(2)),
      durationSeconds: replayObj.durationSeconds ?? 300,
      winner: replayObj.winner || 'blue',
      blueScore: replayObj.blueScore ?? 0,
      orangeScore: replayObj.orangeScore ?? 0,
      winReason: replayObj.winReason ?? 0,
      createdAtIso: replayObj.createdAtIso || new Date().toISOString(),
      roster: normalizedRoster,
      loadouts: normalizedLoadouts,
      ...(replayObj.directorReplayMeta ? { directorReplayMeta: replayObj.directorReplayMeta } : {}),
    },
    tracks: {
      stateInput: {
        offset: a,
        byteLength: encodedTrackA.byteLength,
        count: tracks.frameCount,
        stride: tracks.stateStride,
        stateFloats: STATE_BUFFER_FLOATS,
        controlsBytes: RC_REPLAY_CONTROLS_BYTES,
        encoding: useDeltaTranspose ? 'xor-delta-bytetran-v1' : 'raw',
      },
      incidents: {
        offset: b,
        byteLength: encodedTrackB.byteLength,
        count: tracks.incidentCount,
        stride: RC_REPLAY_EVENT_STRIDE,
        encoding: 'physics-event-64b',
      },
      signals: {
        offset: c,
        byteLength: encodedTrackC.byteLength,
        count: tracks.signalCount,
        stride: RC_REPLAY_EVENT_STRIDE,
        encoding: 'signal-event-64b-dedup',
      },
      nativeEvents: {
        offset: d,
        byteLength: encodedTrackD.byteLength,
        count: tracks.nativeEventCount ?? 0,
        stride: RC_REPLAY_EVENT_STRIDE,
        encoding: 'rlrc-bookmark-64b',
      },
      keyframes: {
        offset: e,
        byteLength: encodedTrackE.byteLength,
        count: tracks.keyframeCount ?? 0,
        stride: RC_REPLAY_EVENT_STRIDE,
        encoding: 'rlrc-bookmark-64b',
      },
    },
  });

  const encoder = new TextEncoder();
  const computeOffsets = (metaByteLen: number) => {
    const a = (16 + metaByteLen + 7) & ~7;
    const b = (a + encodedTrackA.byteLength + 7) & ~7;
    const c = (b + encodedTrackB.byteLength + 7) & ~7;
    const d = (c + encodedTrackC.byteLength + 7) & ~7;
    const e = (d + encodedTrackD.byteLength + 7) & ~7;
    return [a, b, c, d, e] as const;
  };
  const draftMetaBytes = encoder.encode(JSON.stringify(buildMetaJson(0, 0, 0, 0, 0)));
  let [trackAOffset, trackBOffset, trackCOffset, trackDOffset, trackEOffset] = computeOffsets(
    draftMetaBytes.byteLength
  );
  let finalMetaBytes = encoder.encode(
    JSON.stringify(
      buildMetaJson(trackAOffset, trackBOffset, trackCOffset, trackDOffset, trackEOffset)
    )
  );
  if (((16 + finalMetaBytes.byteLength + 7) & ~7) !== trackAOffset) {
    [trackAOffset, trackBOffset, trackCOffset, trackDOffset, trackEOffset] = computeOffsets(
      finalMetaBytes.byteLength
    );
    finalMetaBytes = encoder.encode(
      JSON.stringify(
        buildMetaJson(trackAOffset, trackBOffset, trackCOffset, trackDOffset, trackEOffset)
      )
    );
  }

  const totalContainerBytes = (trackEOffset + encodedTrackE.byteLength + 7) & ~7;
  const container = new Uint8Array(totalContainerBytes);
  const dv = new DataView(container.buffer, container.byteOffset, container.byteLength);

  container.set(MAGIC_BYTES, 0);
  dv.setUint32(8, RC_REPLAY_VERSION_V2, true);
  dv.setUint32(12, finalMetaBytes.byteLength, true);
  container.fill(0x20, 16, trackAOffset);
  container.set(finalMetaBytes, 16);

  if (encodedTrackA.byteLength > 0) container.set(encodedTrackA, trackAOffset);
  if (encodedTrackB.byteLength > 0) container.set(encodedTrackB, trackBOffset);
  if (encodedTrackC.byteLength > 0) container.set(encodedTrackC, trackCOffset);
  if (encodedTrackD.byteLength > 0) container.set(encodedTrackD, trackDOffset);
  if (encodedTrackE.byteLength > 0) container.set(encodedTrackE, trackEOffset);

  return container;
}
