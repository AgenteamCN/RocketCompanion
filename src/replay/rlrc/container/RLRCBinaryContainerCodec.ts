/**
 * RLRCBinaryContainerCodec.ts
 * Binary container encoder, decoder, and background Worker GZIP packer for 120Hz RLRC replay sessions.
 * Uses the unified RCREPLAY V2 multi-track binary container
 * (Track A: XOR-delta byte-transposed 1856B State+Controls, Track B: 64B Incidents, Track C: 64B Signals).
 */

import { serializeRCReplayBinaryContainer } from '../../container/RCReplayBinaryEncoder.ts';
import { isBinaryRCReplayContainer } from '../../container/RCReplayBinarySchema.ts';
import {
  packAndCompressReplayInBackground,
  type CompressedReplayWorkerResult,
} from '../../container/RCReplayCompressionWorkerClient.ts';
import {
  RLRC_TRACK0_FRAME_STRIDE_BYTES,
  type RLRCContainerPacket,
  type RLRCFrame120Hz,
  type RLRCResamplerOutput,
} from '../RLRCReplayTypes.ts';
import {
  extractRLRCTracksFromRCReplayV2Bytes,
  mapRLRCPacketToRCReplayV2Payload,
  type RLRCReplayV2ExportPayload,
} from './RLRCRCReplayV2PayloadPipeline.ts';
import {
  resolveRLRCTrack0FrameByteOffset,
  unpackRLRCFrameFromTrack0Slot,
} from './RLRCTrack0FrameSlotPacker.ts';
import {
  encodeRLRCBookmarksToTrack1Bytes,
  packRLRCFramesToTrack0Bytes,
} from './RLRCTrack0TimelineBatchPacker.ts';

export type { RLRCReplayV2ExportPayload };

export interface DeserializedRLRCContainer extends RLRCContainerPacket {
  readonly frameCount120Hz: number;
  readonly frames120Hz: readonly RLRCFrame120Hz[];
}

export function isBinaryRLRCContainer(
  bytesOrBuffer: Uint8Array | ArrayBuffer | null | undefined
): boolean {
  return isBinaryRCReplayContainer(bytesOrBuffer);
}

export function getRLRCTrack0FrameByteOffset(frameIndex120Hz: number): number {
  return resolveRLRCTrack0FrameByteOffset(frameIndex120Hz);
}

export function encodeRLRCFramesToTrack0Bytes(frames120Hz: readonly RLRCFrame120Hz[]): Uint8Array {
  return packRLRCFramesToTrack0Bytes(frames120Hz);
}

export function decodeRLRCFramesFromTrack0Bytes(
  stateInputTrackBytes: Uint8Array
): RLRCFrame120Hz[] {
  const frameCount120Hz = Math.floor(
    stateInputTrackBytes.byteLength / RLRC_TRACK0_FRAME_STRIDE_BYTES
  );
  const frames120Hz: RLRCFrame120Hz[] = new Array(frameCount120Hz);
  for (let i = 0; i < frameCount120Hz; i++) {
    frames120Hz[i] = unpackRLRCFrameFromTrack0Slot(stateInputTrackBytes, i);
  }
  return frames120Hz;
}

export function buildRLRCContainerPacket(source: RLRCResamplerOutput): RLRCContainerPacket {
  const stateInputTrackBytes =
    source.stateInputTrackBytes.byteLength ===
    source.frames120Hz.length * RLRC_TRACK0_FRAME_STRIDE_BYTES
      ? source.stateInputTrackBytes
      : encodeRLRCFramesToTrack0Bytes(source.frames120Hz);
  const bookmarkTrackBytes = encodeRLRCBookmarksToTrack1Bytes(source.bookmarks);
  return {
    header: source.header,
    roster: source.roster,
    bookmarks: source.bookmarks,
    stateInputTrackBytes,
    bookmarkTrackBytes,
  };
}

export function buildRCReplayV2PayloadFromRLRC(
  source: RLRCResamplerOutput | RLRCContainerPacket
): RLRCReplayV2ExportPayload {
  const packet: RLRCContainerPacket =
    'bookmarkTrackBytes' in source ? source : buildRLRCContainerPacket(source);
  return mapRLRCPacketToRCReplayV2Payload(packet);
}

export async function compressGzipStreamSafe(rawBytes: Uint8Array): Promise<ArrayBuffer> {
  if (typeof CompressionStream === 'undefined') {
    return rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength
    ) as ArrayBuffer;
  }
  const cs = new CompressionStream('gzip');
  if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') {
    const compressedStream = new Blob([rawBytes as BlobPart]).stream().pipeThrough(cs);
    return new Response(compressedStream).arrayBuffer();
  }
  const readPromise = new Response(cs.readable).arrayBuffer();
  const writer = cs.writable.getWriter();
  await writer.write(rawBytes as BufferSource);
  await writer.close();
  return readPromise;
}

export async function packAndCompressRLRCContainer(
  source: RLRCResamplerOutput | RLRCContainerPacket
): Promise<CompressedReplayWorkerResult> {
  return packAndCompressReplayInBackground(buildRCReplayV2PayloadFromRLRC(source));
}

export function serializeRLRCBinaryContainer(
  source: RLRCResamplerOutput | RLRCContainerPacket
): Uint8Array {
  return serializeRCReplayBinaryContainer(buildRCReplayV2PayloadFromRLRC(source));
}

export function deserializeRLRCBinaryContainer(
  bytesOrBuffer: Uint8Array | ArrayBuffer
): DeserializedRLRCContainer {
  const u8 = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);
  if (!isBinaryRCReplayContainer(u8)) {
    throw new Error('Invalid RCREPLAY V2 binary container header.');
  }

  const extracted = extractRLRCTracksFromRCReplayV2Bytes(u8);
  const bookmarkTrackBytes = encodeRLRCBookmarksToTrack1Bytes(extracted.bookmarks);
  const frames120Hz = decodeRLRCFramesFromTrack0Bytes(extracted.stateInputTrackBytes);

  return {
    header: extracted.header,
    roster: extracted.roster,
    bookmarks: extracted.bookmarks,
    stateInputTrackBytes: extracted.stateInputTrackBytes,
    bookmarkTrackBytes,
    frameCount120Hz: frames120Hz.length,
    frames120Hz,
  };
}
