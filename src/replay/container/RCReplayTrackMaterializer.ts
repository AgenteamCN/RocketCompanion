/**
 * src/replay/container/RCReplayTrackMaterializer.ts
 * Pure data pipeline that materializes decoded binary replay tracks (Track A State+Input,
 * Track B Incidents, Track C Signals) into per-frame Float32Array snapshots, composite
 * frame slots, and the 3 parallel timelines (StateInputTimeline, IncidentTimeline, SignalTimeline).
 */

import { STATE_BUFFER_FLOATS, isIncidentEvent } from '../../physics/RocketSimConstants.ts';
import { resolveReplayAudioCueForSignal } from '../ReplayBufferSliceExtractor.ts';
import {
  RC_REPLAY_STATE_BYTES,
  RC_REPLAY_STATE_INPUT_STRIDE,
  unpackTrack64ToCarControls,
  decodeIncidentFrom64Bytes,
  decodeSignalFrom64Bytes,
  type DecodedIncidentEvent,
  type DecodedSignalEvent,
  type ReplaySnapshotFloat32Array,
  type DecodedReplayFrameSlot,
} from './RCReplayBinarySchema.ts';
import { StateInputTimeline, IncidentTimeline } from './RCReplayTimelineParser.ts';
import { SignalTimeline } from './RCReplaySignalTimeline.ts';
import {
  enrichLegacyFlipResetIncidentFromFrames,
  synthesizeFallbackSignalsFromIncidents,
} from './RCReplayFallbackSignalSynthesizer.ts';
import type { NormalizedReplayTracksPayload } from './RCReplayBinaryEncoder.ts';

export interface ReplayMatchInfoInput {
  mode?: string;
  arenaPreset?: number;
  tickRate?: number;
  durationSec?: number;
  durationSeconds?: number;
  winner?: string;
  blueScore?: number;
  orangeScore?: number;
  winReason?: number;
  createdAtIso?: string;
  roster?: Array<Record<string, unknown>>;
  loadouts?: Array<Record<string, unknown>>;
  directorReplayMeta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface DeserializedRCReplayContainer {
  version: number;
  metadata: {
    mode: string;
    arenaPreset: number;
    tickRate: number;
    frameCount: number;
    durationSec: number;
    durationSeconds: number;
    winner: string;
    blueScore: number;
    orangeScore: number;
    winReason: number;
    createdAtIso: string;
    roster: Array<Record<string, unknown>>;
    loadouts: Array<Record<string, unknown>>;
    directorReplayMeta: Record<string, unknown> | null;
    tracks: Record<string, unknown>;
  };
  frames: ReplaySnapshotFloat32Array[];
  frameSlots: DecodedReplayFrameSlot[];
  incidents?: DecodedIncidentEvent[];
  signals?: DecodedSignalEvent[];
  timelines: {
    stateInput: StateInputTimeline;
    incidents: DecodedIncidentEvent[];
    signals: DecodedSignalEvent[];
    recordedSignals: DecodedSignalEvent[];
    synthesizedSignals: DecodedSignalEvent[];
    stateInputTimeline: StateInputTimeline;
    incidentTimeline: IncidentTimeline;
    signalTimeline: SignalTimeline;
    stateInputBytes: Uint8Array;
    incidentBytes: Uint8Array;
    signalBytes: Uint8Array;
    nativeEventBytes?: Uint8Array;
    keyframeBytes?: Uint8Array;
    incidentsByFrame: Map<number, DecodedIncidentEvent[]>;
    signalsByFrame: Map<number, DecodedSignalEvent[]>;
  };
}

export function buildFrameSlotAt(
  i: number,
  stateInputBytes: Uint8Array,
  stateStride: number,
  incidentsByFrame: Map<number, DecodedIncidentEvent[]>,
  signalsByFrame: Map<number, DecodedSignalEvent[]>,
  isCountUp: boolean,
  frames: ReplaySnapshotFloat32Array[],
  frameSlots: DecodedReplayFrameSlot[]
): void {
  const byteOff = i * stateStride;
  const snap = new Float32Array(
    stateInputBytes.buffer,
    stateInputBytes.byteOffset + byteOff,
    STATE_BUFFER_FLOATS
  ) as ReplaySnapshotFloat32Array;
  const controlsBytes = stateInputBytes.subarray(
    byteOff + RC_REPLAY_STATE_BYTES,
    byteOff + stateStride
  );
  const controls = unpackTrack64ToCarControls(controlsBytes);
  const frameIncidents = incidentsByFrame.get(i) || [];
  const frameSignals = signalsByFrame.get(i) || [];
  const audioEvents: NonNullable<DecodedReplayFrameSlot['audioEvents']> = [];

  for (let s = 0; s < frameSignals.length; s++) {
    const cue = resolveReplayAudioCueForSignal(frameSignals[s], isCountUp);
    if (cue) audioEvents.push(cue);
  }

  Object.assign(snap, {
    controls,
    controlsBytes,
    incidents: frameIncidents,
    signals: frameSignals,
    audioEvents,
  });
  frames[i] = snap;

  frameSlots[i] = {
    frameIndex: i,
    tick: Math.floor(snap[0] || i),
    snapshot: snap,
    controls,
    acknowledgedControls: controls,
    controlsBytes,
    incidents: frameIncidents,
    signals: frameSignals,
    audioEvents,
  };
}

export function finalizeDecodedContainerResult(params: {
  version: number;
  matchInfo: ReplayMatchInfoInput;
  tracksToc: Record<string, unknown>;
  frameCount: number;
  stateStride: number;
  stateInputBytes: Uint8Array;
  incidentCount: number;
  incidentBytes: Uint8Array;
  incidents: DecodedIncidentEvent[];
  incidentsByFrame: Map<number, DecodedIncidentEvent[]>;
  signalCount: number;
  signalBytes: Uint8Array;
  recordedSignals: DecodedSignalEvent[];
  signalsByFrame: Map<number, DecodedSignalEvent[]>;
  nativeEventBytes?: Uint8Array;
  keyframeBytes?: Uint8Array;
  frames: ReplaySnapshotFloat32Array[];
  frameSlots: DecodedReplayFrameSlot[];
  isCountUp: boolean;
}): DeserializedRCReplayContainer {
  const {
    version,
    matchInfo,
    tracksToc,
    frameCount,
    stateStride,
    stateInputBytes,
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
    frames,
    frameSlots,
    isCountUp,
  } = params;

  if (frameCount > 0 && (incidentCount > 0 || signalCount > 0)) {
    const tickToFrameMap = new Map<number, number>();
    for (let i = 0; i < frameCount; i++) {
      tickToFrameMap.set(frameSlots[i].tick, i);
    }
    for (let i = 0; i < incidentCount; i++) {
      const inc = incidents[i];
      if (inc.frameIndex === 0 && inc.tick > 0 && tickToFrameMap.has(inc.tick)) {
        const trueIdx = tickToFrameMap.get(inc.tick)!;
        if (trueIdx > 0) {
          const idxInZero = frameSlots[0].incidents.indexOf(inc);
          if (idxInZero !== -1) frameSlots[0].incidents.splice(idxInZero, 1);
          inc.frameIndex = trueIdx;
          frameSlots[trueIdx].incidents.push(inc);
          incidentsByFrame.set(trueIdx, frameSlots[trueIdx].incidents);
        }
      }
    }
    for (let i = 0; i < signalCount; i++) {
      const sig = recordedSignals[i];
      if (sig.frameIndex === 0 && sig.tick > 0 && tickToFrameMap.has(sig.tick)) {
        const trueIdx = tickToFrameMap.get(sig.tick)!;
        if (trueIdx > 0) {
          const idxInZero = frameSlots[0].signals.indexOf(sig);
          if (idxInZero !== -1) frameSlots[0].signals.splice(idxInZero, 1);
          sig.frameIndex = trueIdx;
          frameSlots[trueIdx].signals.push(sig);
          signalsByFrame.set(trueIdx, frameSlots[trueIdx].signals);
          const cue = resolveReplayAudioCueForSignal(sig, isCountUp);
          if (cue) frameSlots[trueIdx].audioEvents.push(cue);
        }
      }
    }
  }

  if (frameCount > 0 && incidentCount > 0) {
    for (let i = 0; i < incidentCount; i++) {
      enrichLegacyFlipResetIncidentFromFrames(incidents[i], frames);
    }
  }

  let synthesizedSignals: DecodedSignalEvent[] = [];
  if (signalCount === 0 && frameCount > 0) {
    synthesizedSignals = synthesizeFallbackSignalsFromIncidents(incidents, frameSlots, matchInfo);
    for (let s = 0; s < synthesizedSignals.length; s++) {
      const sig = synthesizedSignals[s];
      const fIdx = Math.max(0, Math.min(frameCount - 1, sig.frameIndex ?? 0));
      let list = signalsByFrame.get(fIdx);
      if (!list) {
        list = frameSlots[fIdx].signals;
        signalsByFrame.set(fIdx, list);
      }
      list.push(sig);
      const cue = resolveReplayAudioCueForSignal(sig, isCountUp);
      if (cue) {
        frameSlots[fIdx].audioEvents.push(cue);
      }
    }
  }

  const effectiveSignals = signalCount > 0 ? recordedSignals : synthesizedSignals;

  const stateInputTimeline = new StateInputTimeline({
    bytes: stateInputBytes,
    frameCount,
    stride: stateStride,
    stateBytes: RC_REPLAY_STATE_BYTES,
    tickRate: matchInfo.tickRate || 120,
    frames,
    frameSlots,
  });

  const incidentTimeline = new IncidentTimeline({
    bytes: incidentBytes,
    events: incidents,
    byFrameMap: incidentsByFrame,
    frameCount,
  });

  const signalTimeline = new SignalTimeline({
    bytes: signalBytes,
    recordedEvents: recordedSignals,
    synthesizedEvents: synthesizedSignals,
    byFrameMap: signalsByFrame,
    frameCount,
    isCountUp,
    stateInputTimeline,
    incidentTimeline,
  });

  return {
    version,
    metadata: {
      mode: matchInfo.mode || 'match',
      arenaPreset: matchInfo.arenaPreset ?? 0,
      tickRate: matchInfo.tickRate || 120,
      frameCount,
      durationSec: matchInfo.durationSec ?? Number((frameCount / 120).toFixed(2)),
      durationSeconds: matchInfo.durationSeconds ?? 300,
      winner: matchInfo.winner || 'blue',
      blueScore: matchInfo.blueScore ?? 0,
      orangeScore: matchInfo.orangeScore ?? 0,
      winReason: matchInfo.winReason ?? 0,
      createdAtIso: matchInfo.createdAtIso || '',
      roster: matchInfo.roster || [],
      loadouts: matchInfo.loadouts || matchInfo.roster || [],
      directorReplayMeta: matchInfo.directorReplayMeta || null,
      tracks: tracksToc,
    },
    frames,
    frameSlots,
    timelines: {
      stateInput: stateInputTimeline,
      incidents: incidentTimeline.events,
      signals: effectiveSignals,
      recordedSignals,
      synthesizedSignals,
      stateInputTimeline,
      incidentTimeline,
      signalTimeline,
      stateInputBytes,
      incidentBytes,
      signalBytes,
      ...(nativeEventBytes ? { nativeEventBytes } : {}),
      ...(keyframeBytes ? { keyframeBytes } : {}),
      incidentsByFrame,
      signalsByFrame,
    },
  };
}

/**
 * Builds rich per-frame slots, Float32Array views, and 3 parallel timelines from 3 normalized binary tracks.
 */
export function materializeFramesFromBinaryTracks(
  tracks: NormalizedReplayTracksPayload,
  matchInfo: ReplayMatchInfoInput = {}
) {
  const frameCount = tracks.frameCount;
  const stride = tracks.stateStride || RC_REPLAY_STATE_INPUT_STRIDE;
  const stateInputBytes = tracks.stateInputBytes;
  const incidentBytes = tracks.incidentBytes || new Uint8Array(0);
  const signalBytes = tracks.signalBytes || new Uint8Array(0);
  const incidentCount = Math.floor(incidentBytes.byteLength / 64);
  const signalCount = Math.floor(signalBytes.byteLength / 64);

  const readFrameTick = (idx: number): number => {
    if (idx < 0 || idx >= frameCount) return -1;
    const f32 = new Float32Array(
      stateInputBytes.buffer,
      stateInputBytes.byteOffset + idx * stride,
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

  const incidents: DecodedIncidentEvent[] = [];
  const incidentsByFrame = new Map<number, DecodedIncidentEvent[]>();
  for (let i = 0; i < incidentCount; i++) {
    const inc = decodeIncidentFrom64Bytes(incidentBytes, i * 64);
    if (!isIncidentEvent(inc.type)) continue;
    const fIdx = resolveFrameIdxByTick(inc.tick, inc.frameIndex ?? 0);
    Object.assign(inc, { frameIndex: fIdx });
    incidents.push(inc);
    let arr = incidentsByFrame.get(fIdx);
    if (!arr) {
      arr = [];
      incidentsByFrame.set(fIdx, arr);
    }
    arr.push(inc);
  }

  const recordedSignals: DecodedSignalEvent[] = new Array(signalCount);
  const signalsByFrame = new Map<number, DecodedSignalEvent[]>();
  for (let i = 0; i < signalCount; i++) {
    const sig = decodeSignalFrom64Bytes(signalBytes, i * 64);
    recordedSignals[i] = sig;
    const fIdx = Math.max(0, Math.min(Math.max(0, frameCount - 1), sig.frameIndex ?? 0));
    let arr = signalsByFrame.get(fIdx);
    if (!arr) {
      arr = [];
      signalsByFrame.set(fIdx, arr);
    }
    arr.push(sig);
  }

  const frames: ReplaySnapshotFloat32Array[] = new Array(frameCount);
  const frameSlots: DecodedReplayFrameSlot[] = new Array(frameCount);
  const isCountUp = matchInfo.mode === 'freeplay' || matchInfo.mode === 'training';

  for (let i = 0; i < frameCount; i++) {
    buildFrameSlotAt(
      i,
      stateInputBytes,
      stride,
      incidentsByFrame,
      signalsByFrame,
      isCountUp,
      frames,
      frameSlots
    );
  }

  if (signalCount === 0 && frameCount > 0) {
    console.info(
      `[ReplayFileExporter] Signal track is empty for ${frameCount} frames; synthesizing fallback signals from incidents.`
    );
  }

  const finalized = finalizeDecodedContainerResult({
    version: 2,
    matchInfo,
    tracksToc: {},
    frameCount,
    stateStride: stride,
    stateInputBytes,
    incidentCount: incidents.length,
    incidentBytes,
    incidents,
    incidentsByFrame,
    signalCount,
    signalBytes,
    recordedSignals,
    signalsByFrame,
    frames,
    frameSlots,
    isCountUp,
  });

  return {
    frames: finalized.frames,
    frameSlots: finalized.frameSlots,
    incidents: finalized.timelines.incidents,
    signals: finalized.timelines.signals,
    incidentsByFrame: finalized.timelines.incidentsByFrame,
    signalsByFrame: finalized.timelines.signalsByFrame,
    timelines: finalized.timelines,
  };
}
