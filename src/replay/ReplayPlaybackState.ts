/**
 * ReplayPlaybackState.ts
 * Goal Replay time window resolution and chronological frame slice extraction
 * from either a ReplayRingBuffer or the 256MB C++ WASM Replay Buffer.
 */

import { MATCH_SIGNALS } from '../physics/RocketSimConstants.ts';
import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import { resolveReplayAudioCueForSignal } from './ReplayBufferSliceExtractor.ts';
import {
  unpackControls64ToCars,
  unpackIncidentTrackToEvents,
  unpackSignalTrackToEvents,
  type DecodedIncidentEvent,
  type DecodedSignalEvent,
} from './container/RCReplayBinarySchema.ts';
import type { ReplayRingBuffer, ReplayRingBufferSlot } from './ReplayRingBuffer.ts';

export const REPLAY_PLAYBACK_SPEEDS = Object.freeze([0.25, 0.5, 1.0, 2.0]);
export const DEFAULT_GOAL_REPLAY_TICKS = 360;
export const DEFAULT_GOAL_LOOKBACK_SECONDS = 10.0;
export const DEFAULT_SCORER_TOUCH_LOOKBACK_SECONDS = 7.0;
export const DEFAULT_GOAL_POST_SECONDS = 3.0;

interface WasmEventTrackMaps {
  incidentsByFrame: Map<number, DecodedIncidentEvent[]>;
  signalsByFrame: Map<number, DecodedSignalEvent[]>;
  incidentsByTick: Map<number, DecodedIncidentEvent[]>;
  signalsByTick: Map<number, DecodedSignalEvent[]>;
}

export interface WasmReplayBufferReaderPort {
  getReplayFrameCount?: () => number;
  getReplayFrameByIndex?: (index: number) => Float32Array | null;
  getReplayFrameByOffset?: (ticksAgo: number) => Float32Array | null;
  getReplayControlsByIndex?: (index: number) => Uint8Array | null;
  getReplayIncidentTrackBytes?: () => Uint8Array | null;
  getReplaySignalTrackBytes?: () => Uint8Array | null;
}

function decodeWasmEventTrackMaps(
  wasmReader: WasmReplayBufferReaderPort | null | undefined
): WasmEventTrackMaps {
  const incidentsByFrame = new Map<number, DecodedIncidentEvent[]>();
  const signalsByFrame = new Map<number, DecodedSignalEvent[]>();
  const incidentsByTick = new Map<number, DecodedIncidentEvent[]>();
  const signalsByTick = new Map<number, DecodedSignalEvent[]>();

  if (!wasmReader) {
    return { incidentsByFrame, signalsByFrame, incidentsByTick, signalsByTick };
  }

  const incidentBytes = wasmReader.getReplayIncidentTrackBytes?.() || null;
  if (incidentBytes && incidentBytes.byteLength >= 64) {
    const incList = unpackIncidentTrackToEvents(incidentBytes);
    for (let i = 0; i < incList.length; i++) {
      const inc = incList[i];
      const fIdx = inc.frameIndex ?? -1;
      if (fIdx >= 0) {
        let arr = incidentsByFrame.get(fIdx);
        if (!arr) {
          arr = [];
          incidentsByFrame.set(fIdx, arr);
        }
        arr.push(inc);
      }
      const tick = inc.tick ?? -1;
      if (tick >= 0) {
        let tArr = incidentsByTick.get(tick);
        if (!tArr) {
          tArr = [];
          incidentsByTick.set(tick, tArr);
        }
        tArr.push(inc);
      }
    }
  }

  const signalBytes = wasmReader.getReplaySignalTrackBytes?.() || null;
  if (signalBytes && signalBytes.byteLength >= 64) {
    const sigList = unpackSignalTrackToEvents(signalBytes);
    for (let i = 0; i < sigList.length; i++) {
      const sig = sigList[i];
      const fIdx = sig.frameIndex ?? -1;
      if (fIdx >= 0) {
        let arr = signalsByFrame.get(fIdx);
        if (!arr) {
          arr = [];
          signalsByFrame.set(fIdx, arr);
        }
        arr.push(sig);
      }
      const tick = sig.frameId ?? -1;
      if (tick >= 0) {
        let tArr = signalsByTick.get(tick);
        if (!tArr) {
          tArr = [];
          signalsByTick.set(tick, tArr);
        }
        tArr.push(sig);
      }
    }
  }

  return { incidentsByFrame, signalsByFrame, incidentsByTick, signalsByTick };
}

function buildWasmFrameSlot(
  wasmReader: WasmReplayBufferReaderPort,
  wasmFrameIndex: number,
  view: Float32Array,
  eventMaps: WasmEventTrackMaps
): ReplayRingBufferSlot {
  const snapshot = new Float32Array(view.length);
  snapshot.set(view);
  const tick = Math.floor(snapshot[0] || 0);
  const ctrlBytes = wasmReader.getReplayControlsByIndex?.(wasmFrameIndex) || null;
  const acknowledgedControls = ctrlBytes ? unpackControls64ToCars(ctrlBytes, 0) : [];
  const incidents =
    eventMaps.incidentsByFrame.get(wasmFrameIndex) || eventMaps.incidentsByTick.get(tick) || [];
  const signals =
    eventMaps.signalsByFrame.get(wasmFrameIndex) || eventMaps.signalsByTick.get(tick) || [];
  const audioEvents: NonNullable<ReplayRingBufferSlot['audioEvents']> = [];
  for (let s = 0; s < signals.length; s++) {
    const cue = resolveReplayAudioCueForSignal(signals[s], false);
    if (cue) {
      audioEvents.push(cue);
    }
  }
  return {
    tick,
    snapshot,
    acknowledgedControls,
    incidents,
    signals,
    audioEvents,
  };
}

export interface GoalReplayWindowOptions {
  goalIncidentTick?: number | null;
  scorerTouchTick?: number;
  lookbackSeconds?: number;
  touchLookbackSeconds?: number;
  postGoalSeconds?: number;
  preGoalTicks?: number | null;
  postGoalTicks?: number | null;
  lastKickoffWillStartTick?: number;
  ringBuffer?: ReplayRingBuffer | null;
  signalLog?: Array<{ signalType?: number; frameId?: number }> | null;
  engine?: WasmReplayBufferReaderPort | null;
  durationTicks?: number;
}

export interface GoalReplayWindowBounds {
  goalIncidentFrame: number;
  scorerTouchFrame: number;
  goalMaxStartFrame: number;
  touchStartFrame: number;
  requestedStartFrame: number;
  lastKickoffWillStartFrame: number;
  effectiveStartFrame: number;
  effectiveEndFrame: number;
  preGoalTicks: number;
  postGoalTicks: number;
  clampedByKickoff: boolean;
}

export function resolveGoalReplayWindowBounds(
  options: GoalReplayWindowOptions = {}
): GoalReplayWindowBounds {
  const {
    goalIncidentTick = null,
    scorerTouchTick = -1,
    lookbackSeconds = DEFAULT_GOAL_LOOKBACK_SECONDS,
    touchLookbackSeconds = DEFAULT_SCORER_TOUCH_LOOKBACK_SECONDS,
    postGoalSeconds = DEFAULT_GOAL_POST_SECONDS,
    preGoalTicks = null,
    postGoalTicks = null,
    lastKickoffWillStartTick = -1,
    ringBuffer = null,
    signalLog = null,
  } = options;

  const resolvedPreTicks =
    typeof preGoalTicks === 'number' && Number.isFinite(preGoalTicks)
      ? Math.round(preGoalTicks)
      : Math.round(Number(lookbackSeconds ?? DEFAULT_GOAL_LOOKBACK_SECONDS) * REPLAY_TICK_RATE);
  const resolvedTouchPreTicks = Math.round(
    Number(touchLookbackSeconds ?? DEFAULT_SCORER_TOUCH_LOOKBACK_SECONDS) * REPLAY_TICK_RATE
  );
  const resolvedPostTicks =
    typeof postGoalTicks === 'number' && Number.isFinite(postGoalTicks)
      ? Math.round(postGoalTicks)
      : Math.round(Number(postGoalSeconds ?? DEFAULT_GOAL_POST_SECONDS) * REPLAY_TICK_RATE);

  let resolvedGoalTick =
    typeof goalIncidentTick === 'number' &&
    Number.isFinite(goalIncidentTick) &&
    goalIncidentTick >= 0
      ? Math.floor(goalIncidentTick)
      : -1;

  if (resolvedGoalTick < 0 && Array.isArray(signalLog)) {
    for (let i = signalLog.length - 1; i >= 0; i--) {
      const sig = signalLog[i];
      if (
        sig &&
        (sig.signalType === MATCH_SIGNALS.GOAL_REPLAY_WILL_START ||
          sig.signalType === MATCH_SIGNALS.SCORE_UPDATED) &&
        typeof sig.frameId === 'number'
      ) {
        resolvedGoalTick = sig.frameId;
        break;
      }
    }
  }

  if (resolvedGoalTick < 0 && ringBuffer && typeof ringBuffer.findLatestSignalTick === 'function') {
    resolvedGoalTick = ringBuffer.findLatestSignalTick(MATCH_SIGNALS.GOAL_REPLAY_WILL_START);
    if (resolvedGoalTick < 0) {
      resolvedGoalTick = ringBuffer.findLatestSignalTick(MATCH_SIGNALS.SCORE_UPDATED);
    }
  }

  if (resolvedGoalTick < 0) {
    const newestTick = ringBuffer?.getNewestFrame?.()?.tick ?? 0;
    resolvedGoalTick = Math.max(0, newestTick - Math.max(0, resolvedPostTicks));
  }

  let resolvedKickoffTick =
    typeof lastKickoffWillStartTick === 'number' &&
    Number.isFinite(lastKickoffWillStartTick) &&
    lastKickoffWillStartTick >= 0 &&
    lastKickoffWillStartTick <= resolvedGoalTick
      ? Math.floor(lastKickoffWillStartTick)
      : -1;

  if (Array.isArray(signalLog)) {
    for (let i = signalLog.length - 1; i >= 0; i--) {
      const sig = signalLog[i];
      if (
        sig &&
        sig.signalType === MATCH_SIGNALS.KICKOFF_WILL_START &&
        typeof sig.frameId === 'number' &&
        sig.frameId <= resolvedGoalTick
      ) {
        resolvedKickoffTick = Math.max(resolvedKickoffTick, sig.frameId);
        break;
      }
    }
  }

  if (ringBuffer && typeof ringBuffer.findLatestSignalTick === 'function') {
    const bufKickoffTick = ringBuffer.findLatestSignalTick(
      MATCH_SIGNALS.KICKOFF_WILL_START,
      resolvedGoalTick
    );
    if (bufKickoffTick >= 0) {
      resolvedKickoffTick = Math.max(resolvedKickoffTick, bufKickoffTick);
    }
  }

  const goalMaxStartFrame = resolvedGoalTick - resolvedPreTicks;
  const hasValidScorerTouch =
    typeof scorerTouchTick === 'number' &&
    Number.isFinite(scorerTouchTick) &&
    scorerTouchTick >= 0 &&
    scorerTouchTick <= resolvedGoalTick;
  const touchStartFrame = hasValidScorerTouch
    ? Math.floor(scorerTouchTick) - resolvedTouchPreTicks
    : goalMaxStartFrame;

  // Use whichever lookback window is shorter (the later start timestamp)
  const requestedStartFrame = hasValidScorerTouch
    ? Math.max(goalMaxStartFrame, touchStartFrame)
    : goalMaxStartFrame;

  const effectiveStartFrame =
    resolvedKickoffTick >= 0
      ? Math.max(requestedStartFrame, resolvedKickoffTick)
      : Math.max(0, requestedStartFrame);
  const effectiveEndFrame = resolvedGoalTick + resolvedPostTicks;
  const clampedByKickoff = resolvedKickoffTick >= 0 && resolvedKickoffTick > requestedStartFrame;

  return {
    goalIncidentFrame: resolvedGoalTick,
    scorerTouchFrame: hasValidScorerTouch ? Math.floor(scorerTouchTick) : -1,
    goalMaxStartFrame,
    touchStartFrame,
    requestedStartFrame,
    lastKickoffWillStartFrame: resolvedKickoffTick,
    effectiveStartFrame,
    effectiveEndFrame,
    preGoalTicks: resolvedGoalTick - requestedStartFrame,
    postGoalTicks: resolvedPostTicks,
    clampedByKickoff,
  };
}

export function extractGoalReplayFrames(
  options: GoalReplayWindowOptions = {}
): ReplayRingBufferSlot[] {
  const {
    ringBuffer = null,
    engine: wasmReader = null,
    durationTicks = DEFAULT_GOAL_REPLAY_TICKS,
    goalIncidentTick = null,
    scorerTouchTick = -1,
    lookbackSeconds = undefined,
    touchLookbackSeconds = undefined,
    postGoalSeconds = undefined,
    preGoalTicks = null,
    postGoalTicks = null,
    lastKickoffWillStartTick = -1,
    signalLog = null,
  } = options;

  const hasExplicitGoalWindow =
    goalIncidentTick !== null ||
    scorerTouchTick >= 0 ||
    lookbackSeconds !== undefined ||
    postGoalSeconds !== undefined ||
    preGoalTicks !== null ||
    postGoalTicks !== null ||
    (ringBuffer &&
      typeof ringBuffer.findLatestSignalTick === 'function' &&
      ringBuffer.findLatestSignalTick(MATCH_SIGNALS.GOAL_REPLAY_WILL_START) >= 0);

  if (hasExplicitGoalWindow) {
    const bounds = resolveGoalReplayWindowBounds({
      goalIncidentTick,
      scorerTouchTick,
      lookbackSeconds: lookbackSeconds ?? DEFAULT_GOAL_LOOKBACK_SECONDS,
      touchLookbackSeconds: touchLookbackSeconds ?? DEFAULT_SCORER_TOUCH_LOOKBACK_SECONDS,
      postGoalSeconds: postGoalSeconds ?? DEFAULT_GOAL_POST_SECONDS,
      preGoalTicks,
      postGoalTicks,
      lastKickoffWillStartTick,
      ringBuffer,
      signalLog,
    });

    if (
      ringBuffer &&
      ringBuffer.size > 0 &&
      typeof ringBuffer.getFramesInTickRange === 'function'
    ) {
      const ranged = ringBuffer.getFramesInTickRange(
        bounds.effectiveStartFrame,
        bounds.effectiveEndFrame
      );
      if (ranged.length > 0) {
        return ranged;
      }
    }

    if (
      wasmReader &&
      typeof wasmReader.getReplayFrameCount === 'function' &&
      typeof wasmReader.getReplayFrameByIndex === 'function'
    ) {
      const totalWasmFrames = wasmReader.getReplayFrameCount();
      const eventMaps = decodeWasmEventTrackMaps(wasmReader);
      const matched: ReplayRingBufferSlot[] = [];
      for (let i = 0; i < totalWasmFrames; i++) {
        const view = wasmReader.getReplayFrameByIndex(i);
        if (!view) continue;
        if (view.length > 302 && Math.abs((view[302] || 0) - 1337.5) <= 0.01) continue;
        const tick = Math.floor(view[0] || 0);
        if (tick >= bounds.effectiveStartFrame && tick <= bounds.effectiveEndFrame) {
          matched.push(buildWasmFrameSlot(wasmReader, i, view, eventMaps));
        }
      }
      if (matched.length > 0) {
        return matched;
      }
    }
  }

  const maxTicks = Math.max(1, Math.floor(durationTicks));

  if (ringBuffer && ringBuffer.size > 0) {
    const recent = ringBuffer
      .getRecentFrames(maxTicks)
      .filter((f): f is ReplayRingBufferSlot => Boolean(f));
    if (recent.length > 0) {
      const newestTick = recent[recent.length - 1].tick;
      const koTick =
        typeof ringBuffer.findLatestSignalTick === 'function'
          ? ringBuffer.findLatestSignalTick(MATCH_SIGNALS.KICKOFF_WILL_START, newestTick)
          : -1;
      const effectiveKoTick = Math.max(koTick, lastKickoffWillStartTick ?? -1);
      if (effectiveKoTick >= 0) {
        const clamped = recent.filter((f) => f.tick >= effectiveKoTick);
        if (clamped.length > 0) return clamped;
      }
      return recent;
    }
  }

  if (
    wasmReader &&
    typeof wasmReader.getReplayFrameCount === 'function' &&
    typeof wasmReader.getReplayFrameByOffset === 'function'
  ) {
    const totalWasmFrames = wasmReader.getReplayFrameCount();
    const eventMaps = decodeWasmEventTrackMaps(wasmReader);
    const count = Math.min(totalWasmFrames, maxTicks);
    const frames: ReplayRingBufferSlot[] = [];
    for (let i = 0; i < count; i++) {
      const ticksAgo = count - 1 - i;
      const wasmIdx = Math.max(0, totalWasmFrames - 1 - ticksAgo);
      const view = wasmReader.getReplayFrameByOffset(ticksAgo);
      if (view && !(view.length > 302 && Math.abs((view[302] || 0) - 1337.5) <= 0.01)) {
        frames.push(buildWasmFrameSlot(wasmReader, wasmIdx, view, eventMaps));
      }
    }
    return frames;
  }

  return [];
}

export function resolveTimelineFrameEntryAt<T extends { snapshot?: Float32Array | null }>(
  activeFrames: T[],
  ringBuffer: ReplayRingBuffer | null,
  index: number
): T | ReplayRingBufferSlot | null {
  if (Array.isArray(activeFrames) && activeFrames.length > 0) {
    return activeFrames[Math.max(0, Math.min(activeFrames.length - 1, Math.floor(index)))] || null;
  }
  if (ringBuffer && ringBuffer.size > 0) {
    return (
      ringBuffer.getFrameAt(Math.max(0, Math.min(ringBuffer.size - 1, Math.floor(index)))) || null
    );
  }
  return null;
}

export function resolveTimelineFrameBufferAt(
  activeFrames: ReadonlyArray<{ snapshot?: Float32Array | null }>,
  wasmReader: {
    getReplayFrameCount?: () => number;
    getReplayFrameByIndex?: (index: number) => Float32Array | null;
  } | null,
  ringBuffer: ReplayRingBuffer | null,
  index: number
): Float32Array | null {
  if (Array.isArray(activeFrames) && activeFrames.length > 0) {
    return (
      activeFrames[Math.max(0, Math.min(activeFrames.length - 1, Math.floor(index)))]?.snapshot ||
      null
    );
  }
  if (wasmReader && typeof wasmReader.getReplayFrameByIndex === 'function') {
    const wasmCount = wasmReader.getReplayFrameCount?.() ?? 0;
    if (wasmCount > 0)
      return wasmReader.getReplayFrameByIndex(
        Math.max(0, Math.min(wasmCount - 1, Math.floor(index)))
      );
  }
  if (ringBuffer && ringBuffer.size > 0) {
    return (
      ringBuffer.getFrameAt(Math.max(0, Math.min(ringBuffer.size - 1, Math.floor(index))))
        ?.snapshot || null
    );
  }
  return null;
}

export function resolveTimelineFrameBufferByOffset(
  activeFrames: ReadonlyArray<{ snapshot?: Float32Array | null }>,
  wasmReader: { getReplayFrameByOffset?: (ticksAgo: number) => Float32Array | null } | null,
  ringBuffer: ReplayRingBuffer | null,
  ticksAgo = 0
): Float32Array | null {
  const safeOffset = Math.max(0, Math.floor(ticksAgo));
  if (Array.isArray(activeFrames) && activeFrames.length > 0) {
    return activeFrames[Math.max(0, activeFrames.length - 1 - safeOffset)]?.snapshot || null;
  }
  if (wasmReader && typeof wasmReader.getReplayFrameByOffset === 'function') {
    const wasmFrame = wasmReader.getReplayFrameByOffset(safeOffset);
    if (wasmFrame) return wasmFrame;
  }
  if (ringBuffer && ringBuffer.size > 0)
    return ringBuffer.getFrameByOffset(safeOffset)?.snapshot || null;
  return null;
}
