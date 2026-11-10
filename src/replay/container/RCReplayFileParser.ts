/**
 * RCReplayFileParser.ts
 * Pure GZIP decompression, binary V2 container + JSON fixture fallback file parsing,
 * and track extraction / state-replay frame normalization for ReplayFileExporter.
 */

import { STATE_BUFFER_FLOATS } from '../../physics/RocketSimConstants.ts';
import {
  RC_REPLAY_MAGIC_V2,
  RC_REPLAY_STATE_INPUT_STRIDE,
  isBinaryRCReplayContainer,
  type DecodedReplayFrameSlot,
  type DecodedIncidentEvent,
  type DecodedSignalEvent,
  type ReplaySnapshotFloat32Array,
} from './RCReplayBinarySchema.ts';
import {
  normalizeReplayTracksPayload,
  type NormalizedReplayTracksPayload,
} from './RCReplayBinaryEncoder.ts';
import { deserializeRCReplayBinaryContainerAsync } from './RCReplayBinaryDecoder.ts';

export interface RetainedMatchReplay {
  magic: string;
  version: number;
  stateFloats: number;
  tickRate: number;
  frameCount: number;
  incidentCount?: number;
  signalCount?: number;
  durationSec: number;
  durationSeconds: number;
  winner: string;
  blueScore: number;
  orangeScore: number;
  winReason?: number;
  mode: string;
  gameMode?: string;
  arenaPreset: number;
  roster: Array<Record<string, unknown>>;
  loadouts: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown> | null;
  createdAtIso: string;
  frames: ReplaySnapshotFloat32Array[];
  frameSlots?: DecodedReplayFrameSlot[];
  slots?: Array<Record<string, unknown>>;
  incidents?: DecodedIncidentEvent[];
  signals?: DecodedSignalEvent[];
  timelines?: Record<string, unknown>;
  stateInputBytes?: Uint8Array;
  incidentBytes?: Uint8Array;
  signalBytes?: Uint8Array;
  [key: string]: unknown;
}

export type ReplayRawFrameSlotItem =
  | Float32Array
  | {
      tick?: number;
      snapshot?: Float32Array | null;
      compactSnap?: Float32Array | null;
      renderState?: Float32Array | null;
      controls?: unknown;
      acknowledgedControls?: unknown;
      incidents?: Array<Record<string, unknown>>;
      signals?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };

export interface RetainCompletedMatchReplayOptions {
  stateFloats?: number;
  stateInputBytes?: Uint8Array;
  incidentBytes?: Uint8Array;
  signalBytes?: Uint8Array;
  engine?: {
    extractWasmReplayTracks?: () => NormalizedReplayTracksPayload;
    getReplayFrameCount?: () => number;
  } | null;
  packedFrames?: Float32Array | null;
  frames?: Array<ReplayRawFrameSlotItem | null>;
  ringBuffer?: {
    getRecentFrames?: () => Array<ReplayRawFrameSlotItem | null>;
    _slots?: Array<ReplayRawFrameSlotItem | null | undefined>;
    size?: number;
    getFrameAt?: (idx: number) => ReplayRawFrameSlotItem | null | undefined;
  } | null;
  fallbackState?: Float32Array | null;
  incidents?: Array<Record<string, unknown>>;
  signals?: Array<Record<string, unknown>>;
  winner?: string;
  winnerTeam?: number | string;
  blueScore?: number;
  orangeScore?: number;
  winReason?: number;
  mode?: string;
  gameMode?: string;
  arenaPreset?: number;
  durationSeconds?: number;
  roster?: Array<Record<string, unknown>> | { players?: Array<Record<string, unknown>> } | null;
  loadouts?: Array<Record<string, unknown>>;
  createdAtIso?: string;
  suppressNotification?: boolean;
}

export interface ParsedRCReplayResult {
  version?: number;
  metadata?: Record<string, unknown> | null;
  frames: ReplaySnapshotFloat32Array[];
  frameSlots?: DecodedReplayFrameSlot[];
  timelines?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExportStateReplayOptions {
  roster?: Array<Record<string, unknown>>;
  loadouts?: Array<Record<string, unknown>>;
  durationSeconds?: number;
  winner?: string;
  blueScore?: number;
  orangeScore?: number;
  arenaPreset?: number;
  mode?: string;
}

export function extractReplayTracksFromMatchOptions(
  options: RetainCompletedMatchReplayOptions
): NormalizedReplayTracksPayload | null {
  const floatsPerFrame = Number(options.stateFloats) || STATE_BUFFER_FLOATS;

  if (
    options.stateInputBytes instanceof Uint8Array &&
    options.stateInputBytes.byteLength >= RC_REPLAY_STATE_INPUT_STRIDE
  ) {
    return normalizeReplayTracksPayload({
      stateInputBytes: options.stateInputBytes,
      incidentBytes: options.incidentBytes,
      signalBytes: options.signalBytes,
    });
  }

  if (
    options.engine &&
    typeof options.engine.extractWasmReplayTracks === 'function' &&
    (options.engine.getReplayFrameCount?.() ?? 0) > 0
  ) {
    return options.engine.extractWasmReplayTracks();
  }

  if (
    options.packedFrames instanceof Float32Array &&
    options.packedFrames.length >= floatsPerFrame
  ) {
    const count = Math.floor(options.packedFrames.length / floatsPerFrame);
    const rawSlots = new Array(count);
    for (let i = 0; i < count; i++) {
      const snap = new Float32Array(STATE_BUFFER_FLOATS);
      const slice = options.packedFrames.subarray(i * floatsPerFrame, (i + 1) * floatsPerFrame);
      snap.set(slice.subarray(0, Math.min(slice.length, STATE_BUFFER_FLOATS)));
      rawSlots[i] = { tick: Math.floor(snap[0] || i), snapshot: snap };
    }
    return normalizeReplayTracksPayload({
      slots: rawSlots,
      incidents: options.incidents,
      signals: options.signals,
    });
  }

  let rawFrames: ReplayRawFrameSlotItem[] = [];
  if (Array.isArray(options.frames) && options.frames.length > 0) {
    rawFrames = options.frames.filter((f): f is ReplayRawFrameSlotItem => f !== null);
  } else if (options.ringBuffer && typeof options.ringBuffer.getRecentFrames === 'function') {
    rawFrames = options.ringBuffer
      .getRecentFrames()
      .filter((f): f is ReplayRawFrameSlotItem => f !== null);
  } else if (Array.isArray(options.ringBuffer?._slots) && (options.ringBuffer.size ?? 0) > 0) {
    for (let i = 0; i < (options.ringBuffer.size ?? 0); i++) {
      const slot = options.ringBuffer.getFrameAt?.(i);
      if (slot) rawFrames.push(slot);
    }
  }

  if (rawFrames.length === 0 && options.fallbackState instanceof Float32Array) {
    console.warn(
      '[ReplayFileExporter] Replay ring buffer and frame tracks were empty; falling back to single-frame fallbackState snapshot.'
    );
    const snap = new Float32Array(STATE_BUFFER_FLOATS);
    snap.set(
      options.fallbackState.subarray(0, Math.min(options.fallbackState.length, STATE_BUFFER_FLOATS))
    );
    rawFrames.push({ tick: Math.floor(snap[0] || 0), snapshot: snap });
  }

  if (rawFrames.length > 0) {
    return normalizeReplayTracksPayload({
      slots: rawFrames,
      incidents: options.incidents,
      signals: options.signals,
    });
  }

  return null;
}

export async function decompressAndParseRCReplayFile(
  fileOrBuffer:
    ArrayBuffer | Uint8Array | Blob | { arrayBuffer?: () => Promise<ArrayBuffer> } | unknown
): Promise<ParsedRCReplayResult> {
  const buf: ArrayBuffer | null =
    fileOrBuffer instanceof ArrayBuffer
      ? fileOrBuffer
      : fileOrBuffer instanceof Uint8Array
        ? (fileOrBuffer.buffer.slice(
            fileOrBuffer.byteOffset,
            fileOrBuffer.byteOffset + fileOrBuffer.byteLength
          ) as ArrayBuffer)
        : typeof (fileOrBuffer as { arrayBuffer?: () => Promise<ArrayBuffer> })?.arrayBuffer ===
            'function'
          ? await (fileOrBuffer as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer()
          : null;

  if (!buf || buf.byteLength === 0) {
    throw new Error('Empty replay file.');
  }

  const headerBytes = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  const isGzip = headerBytes.length >= 2 && headerBytes[0] === 0x1f && headerBytes[1] === 0x8b;

  let rawBuffer = buf;
  if (isGzip) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Browser does not support GZIP DecompressionStream.');
    }
    const ds = new DecompressionStream('gzip');
    if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') {
      const decompressedStream = new Blob([buf]).stream().pipeThrough(ds);
      rawBuffer = await new Response(decompressedStream).arrayBuffer();
    } else {
      const readPromise = new Response(ds.readable).arrayBuffer();
      const writer = ds.writable.getWriter();
      await writer.write(new Uint8Array(buf));
      await writer.close();
      rawBuffer = await readPromise;
    }
  }

  if (isBinaryRCReplayContainer(rawBuffer)) {
    return (await deserializeRCReplayBinaryContainerAsync(
      rawBuffer
    )) as unknown as ParsedRCReplayResult;
  }

  console.warn(
    '[ReplayFileExporter] Input is not a binary RCREPLAY v2 container; attempting JSON fixture fallback parse.'
  );
  const jsonText = new TextDecoder().decode(rawBuffer);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  if (parsed && Array.isArray(parsed.frames)) {
    const frames: ReplaySnapshotFloat32Array[] = parsed.frames.map((arr: ArrayLike<number>) => {
      const snap = new Float32Array(STATE_BUFFER_FLOATS) as ReplaySnapshotFloat32Array;
      if (Array.isArray(arr) || arr instanceof Float32Array) {
        for (let k = 0; k < Math.min(arr.length, STATE_BUFFER_FLOATS); k++) {
          snap[k] = Number(arr[k]) || 0;
        }
      }
      snap.controls = [];
      snap.incidents = [];
      snap.signals = [];
      snap.audioEvents = [];
      return snap;
    });
    const frameSlots = frames.map((snap, idx) => ({
      frameIndex: idx,
      tick: Math.floor(snap[0] || idx),
      snapshot: snap,
      controls: [],
      incidents: [],
      signals: [],
      audioEvents: [],
    }));
    return {
      version: 2,
      metadata: {
        mode: (parsed.mode as string) || 'custom',
        arenaPreset: (parsed.arenaPreset as number) ?? 0,
        winner: (parsed.winner as string) || 'blue',
        blueScore: (parsed.blueScore as number) ?? 0,
        orangeScore: (parsed.orangeScore as number) ?? 0,
        durationSec: Number((frames.length / 120).toFixed(2)),
        durationSeconds: (parsed.durationSeconds as number) ?? 300,
        roster: Array.isArray(parsed.roster) ? parsed.roster : [],
        loadouts: Array.isArray(parsed.loadouts)
          ? parsed.loadouts
          : Array.isArray(parsed.roster)
            ? parsed.roster
            : [],
        createdAtIso: (parsed.createdAtIso as string) || '',
      },
      frames,
      frameSlots,
      timelines: { incidents: [], signals: [] },
    };
  }

  throw new Error('Unrecognized RC Replay file format.');
}

export function buildStateReplayExportPayload(
  rewinderFrames: ReplayRawFrameSlotItem[],
  options: ExportStateReplayOptions = {}
): RetainedMatchReplay | null {
  if (!Array.isArray(rewinderFrames) || rewinderFrames.length === 0) return null;
  const normalizedFrames: ReplaySnapshotFloat32Array[] = [];
  const normalizedSlots: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rewinderFrames.length; i++) {
    const item = rewinderFrames[i];
    const objItem = !(item instanceof Float32Array) ? item : null;
    const src =
      item instanceof Float32Array
        ? item
        : objItem?.compactSnap instanceof Float32Array
          ? objItem.compactSnap
          : objItem?.renderState instanceof Float32Array
            ? objItem.renderState
            : null;
    const snap = new Float32Array(STATE_BUFFER_FLOATS) as ReplaySnapshotFloat32Array;
    if (src) {
      snap.set(src.subarray(0, Math.min(src.length, STATE_BUFFER_FLOATS)));
    }
    normalizedFrames.push(snap);
    normalizedSlots.push({
      tick: Math.floor(snap[0] || i),
      snapshot: snap,
      controls: objItem?.controls || null,
      acknowledgedControls: objItem?.acknowledgedControls || null,
      incidents: Array.isArray(objItem?.incidents) ? objItem.incidents : [],
      signals: Array.isArray(objItem?.signals) ? objItem.signals : [],
    });
  }

  const normalizedRoster = Array.isArray(options.roster)
    ? options.roster
    : [{ carIndex: 0, name: 'Player', team: 0, isPlayer: true }];

  return {
    magic: RC_REPLAY_MAGIC_V2,
    version: 2,
    stateFloats: STATE_BUFFER_FLOATS,
    tickRate: 120,
    frameCount: normalizedFrames.length,
    durationSec: Number((normalizedFrames.length / 120).toFixed(2)),
    durationSeconds: options.durationSeconds ?? 300,
    winner: options.winner || 'draw',
    blueScore: options.blueScore ?? 0,
    orangeScore: options.orangeScore ?? 0,
    arenaPreset: options.arenaPreset ?? 0,
    roster: normalizedRoster,
    loadouts: Array.isArray(options.loadouts) ? options.loadouts : normalizedRoster,
    mode: options.mode || 'state-replay',
    createdAtIso: new Date().toISOString(),
    frames: normalizedFrames,
    slots: normalizedSlots,
  };
}
