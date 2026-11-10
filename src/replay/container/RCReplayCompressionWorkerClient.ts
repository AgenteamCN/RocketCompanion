/**
 * src/replay/container/RCReplayCompressionWorkerClient.ts
 * Off-main-thread Web Worker compression & packing client for .rcreplay.gz export.
 *
 * Ensures that even 14-minute (100,800 frames, ~180MB raw) replay files are
 * transposed, XOR-delta filtered, and GZIP-compressed completely asynchronously
 * in a background Worker without stalling the main UI/render thread.
 */

import {
  serializeRCReplayBinaryContainer,
  normalizeReplayTracksPayload,
} from './RCReplayBinaryEncoder.ts';

const WORKER_SOURCE = `
self.onmessage = async (e) => {
  const { id, action, matchInfo, stateInputBytes, incidentBytes, signalBytes } = e.data || {};
  try {
    if (action === 'pack_and_gzip') {
      const stride = 1856;
      const frameCount = Math.floor((stateInputBytes ? stateInputBytes.byteLength : 0) / stride);
      const incidentCount = Math.floor((incidentBytes ? incidentBytes.byteLength : 0) / 64);
      const signalCount = Math.floor((signalBytes ? signalBytes.byteLength : 0) / 64);

      // 1. XOR-delta + 4-byte column plane transposition on Track A
      const totalBytes = frameCount * stride;
      const wordsPerFrame = stride >>> 2;
      const srcU32 = new Uint32Array(stateInputBytes.buffer, stateInputBytes.byteOffset, frameCount * wordsPerFrame);
      const encodedTrackA = new Uint8Array(totalBytes);
      const planeSize = frameCount * wordsPerFrame;

      for (let w = 0; w < wordsPerFrame; w++) {
        let prevWord = 0;
        const colBase = w * frameCount;
        for (let f = 0; f < frameCount; f++) {
          const curWord = srcU32[f * wordsPerFrame + w];
          const xorWord = (curWord ^ prevWord) >>> 0;
          prevWord = curWord;

          const idx = colBase + f;
          encodedTrackA[idx] = xorWord & 0xff;
          encodedTrackA[planeSize + idx] = (xorWord >>> 8) & 0xff;
          encodedTrackA[planeSize * 2 + idx] = (xorWord >>> 16) & 0xff;
          encodedTrackA[planeSize * 3 + idx] = (xorWord >>> 24) & 0xff;
        }
      }

      const encodedTrackB = incidentBytes || new Uint8Array(0);
      const encodedTrackC = signalBytes || new Uint8Array(0);

      const buildMeta = (aOff, bOff, cOff) => ({
        magic: 'RCREPLAY',
        version: 2,
        format: 'multi-track-binary-v2',
        matchInfo,
        tracks: {
          stateInput: {
            offset: aOff,
            byteLength: encodedTrackA.byteLength,
            count: frameCount,
            stride,
            stateFloats: 448,
            controlsBytes: 64,
            encoding: 'xor-delta-bytetran-v1'
          },
          incidents: {
            offset: bOff,
            byteLength: encodedTrackB.byteLength,
            count: incidentCount,
            stride: 64,
            encoding: 'physics-event-64b'
          },
          signals: {
            offset: cOff,
            byteLength: encodedTrackC.byteLength,
            count: signalCount,
            stride: 64,
            encoding: 'signal-event-64b-dedup'
          }
        }
      });

      const enc = new TextEncoder();
      let draftMeta = enc.encode(JSON.stringify(buildMeta(0, 0, 0)));
      let aOff = (16 + draftMeta.byteLength + 7) & ~7;
      let bOff = (aOff + encodedTrackA.byteLength + 7) & ~7;
      let cOff = (bOff + encodedTrackB.byteLength + 7) & ~7;
      let finalMeta = enc.encode(JSON.stringify(buildMeta(aOff, bOff, cOff)));
      const alignedHeader = (16 + finalMeta.byteLength + 7) & ~7;
      if (alignedHeader !== aOff) {
        aOff = alignedHeader;
        bOff = (aOff + encodedTrackA.byteLength + 7) & ~7;
        cOff = (bOff + encodedTrackB.byteLength + 7) & ~7;
        finalMeta = enc.encode(JSON.stringify(buildMeta(aOff, bOff, cOff)));
      }

      const totalContainer = (cOff + encodedTrackC.byteLength + 7) & ~7;
      const container = new Uint8Array(totalContainer);
      const dv = new DataView(container.buffer);
      const magic = [0x52, 0x43, 0x52, 0x45, 0x50, 0x4c, 0x41, 0x59];
      for (let i = 0; i < 8; i++) container[i] = magic[i];
      dv.setUint32(8, 2, true);
      dv.setUint32(12, finalMeta.byteLength, true);
      container.fill(0x20, 16, aOff);
      container.set(finalMeta, 16);
      if (encodedTrackA.byteLength > 0) container.set(encodedTrackA, aOff);
      if (encodedTrackB.byteLength > 0) container.set(encodedTrackB, bOff);
      if (encodedTrackC.byteLength > 0) container.set(encodedTrackC, cOff);

      if (typeof CompressionStream !== 'undefined') {
        const cs = new CompressionStream('gzip');
        let compressedBuf;
        if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') {
          const compressedStream = new Blob([container]).stream().pipeThrough(cs);
          compressedBuf = await new Response(compressedStream).arrayBuffer();
        } else {
          const readPromise = new Response(cs.readable).arrayBuffer();
          const writer = cs.writable.getWriter();
          await writer.write(container);
          await writer.close();
          compressedBuf = await readPromise;
        }
        self.postMessage({
          id,
          ok: true,
          compressed: true,
          rawByteLength: container.byteLength,
          compressedByteLength: compressedBuf.byteLength,
          buffer: compressedBuf
        }, [compressedBuf]);
      } else {
        console.warn('[RCReplayCompressionWorker] CompressionStream is unavailable inside Worker; returning uncompressed .rcreplay container.');
        self.postMessage({
          id,
          ok: true,
          compressed: false,
          rawByteLength: container.byteLength,
          compressedByteLength: container.byteLength,
          buffer: container.buffer
        }, [container.buffer]);
      }
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err ? err.message : 'Worker compression failed' });
  }
};
`;

export interface CompressedReplayWorkerResult {
  id?: number;
  ok: boolean;
  compressed: boolean;
  rawByteLength: number;
  compressedByteLength: number;
  buffer: ArrayBuffer;
  compressedBytes: Uint8Array;
}

/**
 * Compresses and packs a replay object into a GZIP binary container asynchronously in a background Worker,
 * with automatic fallback to async main-thread CompressionStream if Blob Worker is restricted.
 */
export async function packAndCompressReplayInBackground(
  replayObj: Record<string, any>
): Promise<CompressedReplayWorkerResult> {
  const tracks = normalizeReplayTracksPayload(replayObj);
  const normalizedRoster = Array.isArray(replayObj.roster)
    ? replayObj.roster
    : Array.isArray(replayObj.roster?.players)
      ? replayObj.roster.players
      : [];
  const normalizedLoadouts = Array.isArray(replayObj.loadouts)
    ? replayObj.loadouts
    : normalizedRoster;
  const matchInfo = {
    mode: replayObj.mode || replayObj.gameMode || 'match',
    arenaPreset: replayObj.arenaPreset ?? 0,
    tickRate: replayObj.tickRate || 120,
    frameCount: tracks.frameCount,
    durationSec: Number((tracks.frameCount / (replayObj.tickRate || 120)).toFixed(2)),
    durationSeconds: replayObj.durationSeconds ?? 300,
    winner: replayObj.winner || 'blue',
    blueScore: replayObj.blueScore ?? 0,
    orangeScore: replayObj.orangeScore ?? 0,
    winReason: replayObj.winReason ?? 0,
    createdAtIso: replayObj.createdAtIso || new Date().toISOString(),
    roster: normalizedRoster,
    loadouts: normalizedLoadouts,
    ...(replayObj.directorReplayMeta ? { directorReplayMeta: replayObj.directorReplayMeta } : {}),
  };

  if (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      const workerResult = await new Promise<CompressedReplayWorkerResult>((resolve, reject) => {
        const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const worker = new Worker(url);
        const cleanup = () => {
          try {
            worker.terminate();
          } catch (termErr) {
            console.warn(
              '[RCReplayCompressionWorkerClient] Failed to terminate compression worker:',
              termErr
            );
          }
          try {
            URL.revokeObjectURL(url);
          } catch (revokeErr) {
            console.warn(
              '[RCReplayCompressionWorkerClient] Failed to revoke worker blob URL:',
              revokeErr
            );
          }
        };
        const stateCopy = new Uint8Array(tracks.stateInputBytes);
        const incCopy = new Uint8Array(tracks.incidentBytes);
        const sigCopy = new Uint8Array(tracks.signalBytes);

        worker.onmessage = (evt: MessageEvent) => {
          cleanup();
          if (evt.data?.ok && evt.data.buffer) {
            resolve({
              ...evt.data,
              compressedBytes: new Uint8Array(evt.data.buffer),
            });
          } else {
            reject(new Error(evt.data?.error || 'Background worker failed'));
          }
        };
        worker.onerror = (err) => {
          cleanup();
          reject(err);
        };
        worker.postMessage(
          {
            id: 1,
            action: 'pack_and_gzip',
            matchInfo,
            stateInputBytes: stateCopy,
            incidentBytes: incCopy,
            signalBytes: sigCopy,
          },
          [stateCopy.buffer, incCopy.buffer, sigCopy.buffer]
        );
      });
      return workerResult;
    } catch (workerErr) {
      console.warn(
        '[RCReplayCompressionWorkerClient] Background Worker compression failed; falling back to main-thread serialization:',
        workerErr
      );
    }
  } else {
    console.warn(
      '[RCReplayCompressionWorkerClient] Blob Worker is unavailable in this environment; falling back to main-thread serialization.'
    );
  }

  // Fallback for Node.js / environments without Blob Worker
  const containerBytes = serializeRCReplayBinaryContainer({
    ...matchInfo,
    ...tracks,
  });

  if (typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const readPromise = new Response(cs.readable).arrayBuffer();
    const writer = cs.writable.getWriter();
    await writer.write(containerBytes as unknown as BufferSource);
    await writer.close();
    const compressedBuf = await readPromise;
    return {
      ok: true,
      compressed: true,
      rawByteLength: containerBytes.byteLength,
      compressedByteLength: compressedBuf.byteLength,
      buffer: compressedBuf,
      compressedBytes: new Uint8Array(compressedBuf),
    };
  }

  console.warn(
    '[RCReplayCompressionWorkerClient] CompressionStream is unavailable; returning uncompressed .rcreplay container.'
  );
  const fallbackBuffer = containerBytes.buffer.slice(
    containerBytes.byteOffset,
    containerBytes.byteOffset + containerBytes.byteLength
  ) as ArrayBuffer;
  return {
    ok: true,
    compressed: false,
    rawByteLength: containerBytes.byteLength,
    compressedByteLength: containerBytes.byteLength,
    buffer: fallbackBuffer,
    compressedBytes: new Uint8Array(fallbackBuffer),
  };
}
