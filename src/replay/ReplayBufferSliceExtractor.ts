/**
 * ReplayBufferSliceExtractor.ts
 * Pure helper functions and slot types for ReplayRingBuffer frame slot population,
 * cloning, tick search, chronological slice extraction, and audio/signal range queries.
 */

import { MATCH_SIGNALS } from '../physics/RocketSimConstants.ts';

export interface ReplaySignalEntry {
  [key: string]: unknown;
  signalId?: number;
  signalType?: number;
  type?: number;
  frameId?: number;
  tick?: number;
  param1?: number;
  param2?: number;
  frameIndex?: number;
  synthesized?: boolean;
}

export interface ReplayAudioCue {
  [key: string]: unknown;
  cueId?: string;
  cueName?: string;
  frameId?: number;
  param1?: number;
  blueScore?: number;
  orangeScore?: number;
  remainingSeconds?: number;
  winner?: number;
  winReason?: number;
  volume?: number;
  tick?: number;
}

export interface ReplayCarControlsSnapshot {
  [key: string]: unknown;
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
}

export interface ReplayAcknowledgedControlEntry extends ReplayCarControlsSnapshot {
  carIndex?: number;
  controls?: ReplayCarControlsSnapshot;
}

export interface ReplayRecordedIncident {
  [key: string]: unknown;
  type?: number;
  subType?: number;
  frameIndex?: number;
  tick?: number;
  x?: number;
  y?: number;
  z?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  normalX?: number;
  normalY?: number;
  normalZ?: number;
  normX?: number;
  normY?: number;
  normZ?: number;
  nx?: number;
  ny?: number;
  nz?: number;
  normalRelVel?: number;
  speed?: number;
  speedKph?: number;
  relSpeed?: number;
  impulse?: number;
  intensity?: number;
  primaryId?: number;
  secondaryId?: number;
  carIndex?: number;
  otherCarIndex?: number;
  car1Index?: number;
  car2Index?: number;
  car1Team?: number;
  car2Team?: number;
  team?: number;
  surfaceTag?: number;
  actionSubType?: number;
  isCrossbar?: boolean;
  padIndex?: number;
  isBig?: boolean;
  flags?: number;
  customFloat?: number;
  customInt?: number;
  directionDotNormal?: number;
  dirDot?: number;
  impactAngleDeg?: number;
  isInitialTouch?: boolean;
  isSupersonic?: boolean;
  isFlipping?: boolean;
  isOnGround?: boolean;
  isDemo?: boolean;
  resetSubType?: number;
  resetSubTypeName?: string;
  resetObjectCode?: number;
  resetObjectType?: string;
  resetTargetCarIndex?: number;
  resetSurfaceTag?: number;
  resetWheelCount?: number;
  isBallFlipReset?: boolean;
  carPosX?: number;
  carPosY?: number;
  carPosZ?: number;
  ballX?: number;
  ballY?: number;
  ballZ?: number;
  ballPosX?: number;
  ballPosY?: number;
  ballPosZ?: number;
  carPos?: { x: number; y: number; z: number };
  ballPos?: { x: number; y: number; z: number };
}

export interface ReplayRecordFrameOptions {
  signals?: ReadonlyArray<ReplaySignalEntry | null | undefined> | null;
  audioEvents?: ReadonlyArray<ReplayAudioCue | null | undefined> | null;
  incidents?: ReadonlyArray<ReplayRecordedIncident | null | undefined> | null;
  acknowledgedControls?: ReadonlyArray<ReplayAcknowledgedControlEntry | null | undefined> | null;
}

export type ReplaySignalsOrOptionsArg =
  | ReadonlyArray<ReplaySignalEntry | ReplayAcknowledgedControlEntry | null | undefined>
  | ReplayRecordFrameOptions
  | null;

export interface ReplayRingBufferSlot {
  [key: string]: unknown;
  tick: number;
  snapshot: Float32Array | null;
  signals: ReplaySignalEntry[];
  audioEvents: ReplayAudioCue[];
  incidents: ReplayRecordedIncident[];
  acknowledgedControls: ReplayAcknowledgedControlEntry[];
}

/**
 * Maps an authoritative match signal to a replay audio cue (if applicable).
 */
export function resolveReplayAudioCueForSignal(
  signal: ReplaySignalEntry | null | undefined,
  _isCountUp = false
): ReplayAudioCue | null {
  if (!signal || typeof signal.signalType !== 'number') return null;

  switch (signal.signalType) {
    case MATCH_SIGNALS.KICKOFF_WILL_START:
      return { cueId: 'match_countdown_321', frameId: signal.frameId, param1: signal.param1 };
    case MATCH_SIGNALS.KICKOFF_START:
      return { cueId: 'match_start_go', frameId: signal.frameId, param1: signal.param1 };
    case MATCH_SIGNALS.SCORE_UPDATED:
      if ((signal.param1 || 0) + (signal.param2 || 0) <= 0) {
        return null;
      }
      return {
        cueId: 'sfx_goal_poof',
        frameId: signal.frameId,
        blueScore: signal.param1,
        orangeScore: signal.param2,
      };
    case MATCH_SIGNALS.TIME_ALERT_60S:
      return { cueId: 'match_60_seconds_left', frameId: signal.frameId };
    case MATCH_SIGNALS.TIME_ALERT_30S:
      return { cueId: 'match_30_seconds_left', frameId: signal.frameId };
    case MATCH_SIGNALS.COUNTDOWN_10S:
      return {
        cueId: 'match_countdown_10s',
        frameId: signal.frameId,
        remainingSeconds: signal.param1,
      };
    case MATCH_SIGNALS.OVERTIME_START:
      return { cueId: 'match_overtime', frameId: signal.frameId };
    case MATCH_SIGNALS.MATCH_ENDED:
      return {
        cueId: 'match_end_whistle',
        frameId: signal.frameId,
        winner: signal.param1,
        winReason: signal.param2,
      };
    default:
      return null;
  }
}

/**
 * Deep-clones a single ReplayRingBufferSlot so callers can mutate or retain it safely.
 */
export function cloneReplayRingBufferSlot(slot: ReplayRingBufferSlot): ReplayRingBufferSlot {
  return {
    tick: slot.tick,
    snapshot: slot.snapshot ? new Float32Array(slot.snapshot) : null,
    signals: slot.signals.map((sig) => ({ ...sig })),
    audioEvents: slot.audioEvents.map((cue) => ({ ...cue })),
    incidents: Array.isArray(slot.incidents) ? slot.incidents.map((inc) => ({ ...inc })) : [],
    acknowledgedControls: Array.isArray(slot.acknowledgedControls)
      ? slot.acknowledgedControls.map((entry) =>
          entry.controls ? { ...entry, controls: { ...entry.controls } } : { ...entry }
        )
      : [],
  };
}

/**
 * Finds the recorded frame matching or closest to `targetTick`.
 */
export function findBufferFrameByTick(
  size: number,
  getFrameAt: (logicalIndex: number) => ReplayRingBufferSlot | null,
  targetTick: number
): ReplayRingBufferSlot | null {
  if (size <= 0) return null;
  let bestSlot: ReplayRingBufferSlot | null = null;
  let bestDiff = Infinity;
  for (let i = size - 1; i >= 0; i--) {
    const slot = getFrameAt(i);
    if (!slot) continue;
    if (slot.tick === targetTick) return slot;
    const diff = Math.abs(slot.tick - targetTick);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSlot = slot;
    }
  }
  return bestSlot;
}

/**
 * Extracts up to `maxFrames` most recent frames in chronological (FIFO) order.
 */
export function extractRecentBufferFrames(
  size: number,
  getFrameAt: (logicalIndex: number) => ReplayRingBufferSlot | null,
  maxFrames: number
): Array<ReplayRingBufferSlot | null> {
  const count = Math.max(0, Math.min(size, Math.floor(maxFrames)));
  const startLogical = size - count;
  const result: Array<ReplayRingBufferSlot | null> = new Array(count);
  for (let i = 0; i < count; i++) {
    const slot = getFrameAt(startLogical + i);
    result[i] = slot ? cloneReplayRingBufferSlot(slot) : null;
  }
  return result;
}

/**
 * Collects all replay audio events recorded within [startTick, endTick].
 */
export function collectBufferAudioEventsInRange(
  size: number,
  getFrameAt: (logicalIndex: number) => ReplayRingBufferSlot | null,
  startTick: number,
  endTick: number
): ReplayAudioCue[] {
  const events: ReplayAudioCue[] = [];
  for (let i = 0; i < size; i++) {
    const slot = getFrameAt(i);
    if (!slot || slot.tick < startTick || slot.tick > endTick) continue;
    for (let j = 0; j < slot.audioEvents.length; j++) {
      events.push({ tick: slot.tick, ...slot.audioEvents[j] });
    }
  }
  return events;
}

/**
 * Finds the most recent frame tick <= maxTick where `signalType` was emitted.
 */
export function findLatestBufferSignalTick(
  size: number,
  getFrameAt: (logicalIndex: number) => ReplayRingBufferSlot | null,
  signalType: number,
  maxTick = Infinity
): number {
  for (let i = size - 1; i >= 0; i--) {
    const slot = getFrameAt(i);
    if (!slot || slot.tick > maxTick) continue;
    if (Array.isArray(slot.signals)) {
      for (let j = slot.signals.length - 1; j >= 0; j--) {
        const sig = slot.signals[j];
        if (sig && sig.signalType === signalType) {
          const fId = typeof sig.frameId === 'number' ? sig.frameId : slot.tick;
          if (fId <= maxTick) return fId;
        }
      }
    }
  }
  return -1;
}

/**
 * Extracts all recorded frames whose tick falls within [startTick, endTick] in chronological order.
 */
export function extractBufferFramesInTickRange(
  size: number,
  getFrameAt: (logicalIndex: number) => ReplayRingBufferSlot | null,
  startTick: number,
  endTick: number
): ReplayRingBufferSlot[] {
  const result: ReplayRingBufferSlot[] = [];
  for (let i = 0; i < size; i++) {
    const slot = getFrameAt(i);
    if (!slot) continue;
    if (slot.tick >= startTick && slot.tick <= endTick) {
      result.push(cloneReplayRingBufferSlot(slot));
    }
  }
  return result;
}
