/**
 * src/replay/container/RCReplayTimelineParser.ts
 * Three-Timeline Replay Parser & Range Cursor Architecture for V2 RC Replays:
 *   - Timeline 1 (Track A): StateInputTimeline (120Hz 448-float State + 64B 8-car Input)
 *   - Timeline 2 (Track B): IncidentTimeline   (64B PhysicsEvent Stream with O(log N) range queries)
 *   - Timeline 3 (Track C): SignalTimeline     (64B Match Signal Stream with O(log N) range queries & HUD state evaluation)
 */

import { INCIDENT_EVENT_TYPES, isBallFlipResetEvent } from '../../physics/RocketSimConstants.ts';
import type {
  ReplayCarControlState,
  DecodedIncidentEvent,
  ReplaySnapshotFloat32Array,
  DecodedReplayFrameSlot,
} from './RCReplayBinarySchema.ts';
import type { SignalTimelineOptions, SignalTimelineMarker } from './RCReplaySignalTimeline.ts';

export type { SignalTimelineOptions, SignalTimelineMarker };

export const INCIDENT_TYPE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  [INCIDENT_EVENT_TYPES.CAR_BALL_HIT]: 'Car-Ball Hit',
  [INCIDENT_EVENT_TYPES.CAR_CAR_BUMP]: 'Car Bump',
  [INCIDENT_EVENT_TYPES.CAR_CAR_DEMO]: 'Demolition',
  [INCIDENT_EVENT_TYPES.BALL_WORLD_HIT]: 'Ball-World Hit',
  [INCIDENT_EVENT_TYPES.BALL_GOALPOST_HIT]: 'Goalpost/Crossbar',
  [INCIDENT_EVENT_TYPES.CAR_JUMP]: 'Jump',
  [INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP]: 'Double Jump',
  [INCIDENT_EVENT_TYPES.CAR_DODGE]: 'Dodge/Flip',
  [INCIDENT_EVENT_TYPES.CAR_SUPERSONIC_ENTER]: 'Supersonic',
  [INCIDENT_EVENT_TYPES.BOOST_PICKUP]: 'Boost Pickup',
  [INCIDENT_EVENT_TYPES.BOOST_SPAWN]: 'Boost Spawn',
  [INCIDENT_EVENT_TYPES.CAR_BOOST_START]: 'Boost Start',
  [INCIDENT_EVENT_TYPES.CAR_BOOST_STOP]: 'Boost Stop',
  [INCIDENT_EVENT_TYPES.GOAL_SCORED]: 'Goal Scored',
  [INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED]: 'Flip Reset',
  [INCIDENT_EVENT_TYPES.BALL_STATE_CHANGE]: 'Ball State',
  [INCIDENT_EVENT_TYPES.POSSESSION_CHANGE]: 'Possession',
});

export function lowerBoundByFrameIndex<T extends { frameIndex?: number }>(
  events: T[],
  targetFrame: number
): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid].frameIndex ?? 0) < targetFrame) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function upperBoundByFrameIndex<T extends { frameIndex?: number }>(
  events: T[],
  targetFrame: number
): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid].frameIndex ?? 0) <= targetFrame) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function lowerBoundByTick<T extends { tick?: number }>(events: T[], targetTick: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid].tick ?? 0) < targetTick) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function upperBoundByTick<T extends { tick?: number }>(events: T[], targetTick: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((events[mid].tick ?? 0) <= targetTick) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export interface StateInputTimelineOptions {
  bytes?: Uint8Array;
  frameCount?: number;
  stride?: number;
  stateBytes?: number;
  tickRate?: number;
  frames?: ReplaySnapshotFloat32Array[];
  frameSlots?: DecodedReplayFrameSlot[];
}

/**
 * Timeline 1: Fixed-Stride 120Hz State (448 floats) + User Input (8-car controls) Timeline.
 */
export class StateInputTimeline {
  bytes: Uint8Array;
  frameCount: number;
  stride: number;
  stateBytes: number;
  tickRate: number;
  frames: ReplaySnapshotFloat32Array[];
  frameSlots: DecodedReplayFrameSlot[];
  startTick: number;
  endTick: number;

  constructor({
    bytes,
    frameCount = 0,
    stride = 1856,
    stateBytes = 1792,
    tickRate = 120,
    frames = [],
    frameSlots = [],
  }: StateInputTimelineOptions) {
    this.bytes = bytes || new Uint8Array(0);
    this.frameCount = frameCount;
    this.stride = stride;
    this.stateBytes = stateBytes;
    this.tickRate = tickRate;
    this.frames = frames;
    this.frameSlots = frameSlots;
    this.startTick = frameCount > 0 ? (frameSlots[0]?.tick ?? 0) : 0;
    this.endTick = frameCount > 0 ? (frameSlots[frameCount - 1]?.tick ?? 0) : 0;
  }

  get count(): number {
    return this.frameCount;
  }

  getSnapshotAt(frameIndex: number): ReplaySnapshotFloat32Array | null {
    if (this.frameCount <= 0) return null;
    const idx = Math.max(0, Math.min(this.frameCount - 1, Math.floor(frameIndex)));
    return this.frames[idx] || null;
  }

  getControlsAt(frameIndex: number): ReplayCarControlState[] {
    if (this.frameCount <= 0) return [];
    const idx = Math.max(0, Math.min(this.frameCount - 1, Math.floor(frameIndex)));
    return this.frameSlots[idx]?.controls || this.frames[idx]?.controls || [];
  }

  getFrameAt(frameIndex: number): DecodedReplayFrameSlot | null {
    if (this.frameCount <= 0) return null;
    const idx = Math.max(0, Math.min(this.frameCount - 1, Math.floor(frameIndex)));
    return this.frameSlots[idx] || null;
  }

  findFrameIndexByTick(targetTick: number): number {
    if (this.frameCount <= 0) return 0;
    let lo = 0;
    let hi = this.frameCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const midTick = this.frameSlots[mid]?.tick ?? mid;
      if (midTick === targetTick) return mid;
      if (midTick < targetTick) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, Math.min(this.frameCount - 1, lo));
  }
}

export interface IncidentTimelineOptions {
  bytes?: Uint8Array;
  events?: DecodedIncidentEvent[];
  byFrameMap?: Map<number, DecodedIncidentEvent[]>;
  frameCount?: number;
}

export interface IncidentTimelineMarker {
  frameIndex: number;
  tick: number;
  type: number;
  carIndex: number;
  team: number;
  label: string;
}

/**
 * Timeline 2: Chronological 64B PhysicsEvent (Incident) Timeline.
 */
export class IncidentTimeline {
  bytes: Uint8Array;
  events: DecodedIncidentEvent[];
  byFrameMap: Map<number, DecodedIncidentEvent[]>;
  frameCount: number;

  constructor({
    bytes,
    events = [],
    byFrameMap = new Map(),
    frameCount = 0,
  }: IncidentTimelineOptions) {
    this.bytes = bytes || new Uint8Array(0);
    this.events = events
      .slice()
      .sort((a, b) => (a.frameIndex ?? 0) - (b.frameIndex ?? 0) || (a.tick ?? 0) - (b.tick ?? 0));
    this.byFrameMap = byFrameMap;
    this.frameCount = frameCount;
  }

  get count(): number {
    return this.events.length;
  }

  getEventsAtFrame(frameIndex: number): DecodedIncidentEvent[] {
    return this.byFrameMap.get(Math.floor(frameIndex)) || [];
  }

  getEventsInFrameRange(
    startFrameInclusive: number,
    endFrameInclusive: number
  ): DecodedIncidentEvent[] {
    if (this.events.length === 0) return [];
    const loFrame = Math.min(startFrameInclusive, endFrameInclusive);
    const hiFrame = Math.max(startFrameInclusive, endFrameInclusive);
    const startIdx = lowerBoundByFrameIndex(this.events, loFrame);
    const endIdx = upperBoundByFrameIndex(this.events, hiFrame);
    if (startIdx >= endIdx) return [];
    return this.events.slice(startIdx, endIdx);
  }

  getEventsInTickRange(
    startTickInclusive: number,
    endTickInclusive: number
  ): DecodedIncidentEvent[] {
    if (this.events.length === 0) return [];
    const loTick = Math.min(startTickInclusive, endTickInclusive);
    const hiTick = Math.max(startTickInclusive, endTickInclusive);
    const startIdx = lowerBoundByTick(this.events, loTick);
    const endIdx = upperBoundByTick(this.events, hiTick);
    if (startIdx >= endIdx) return [];
    return this.events.slice(startIdx, endIdx);
  }

  getEventCountsByType(): Record<number, number> {
    const counts: Record<number, number> = {};
    for (let i = 0; i < this.events.length; i++) {
      const t = this.events[i]?.type ?? 0;
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }

  getTimelineMarkers(maxMarkers = 160): IncidentTimelineMarker[] {
    if (this.events.length === 0) return [];
    const highPriority = new Set<number>([
      INCIDENT_EVENT_TYPES.GOAL_SCORED,
      INCIDENT_EVENT_TYPES.CAR_CAR_DEMO,
      INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED,
      INCIDENT_EVENT_TYPES.BALL_GOALPOST_HIT,
      INCIDENT_EVENT_TYPES.CAR_BALL_HIT,
      INCIDENT_EVENT_TYPES.CAR_CAR_BUMP,
    ]);

    const filtered: IncidentTimelineMarker[] = [];
    const seenFrameType = new Set<string>();
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      if (!ev || !highPriority.has(ev.type)) continue;
      if (ev.type === INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED && !isBallFlipResetEvent(ev)) {
        continue;
      }
      const key = `${ev.frameIndex}:${ev.type}`;
      if (seenFrameType.has(key)) continue;
      seenFrameType.add(key);
      filtered.push({
        frameIndex: ev.frameIndex ?? 0,
        tick: ev.tick ?? 0,
        type: ev.type,
        carIndex: ev.carIndex ?? 0,
        team: ev.team ?? 0,
        label: INCIDENT_TYPE_LABELS[ev.type] || `Incident 0x${ev.type.toString(16)}`,
      });
    }

    if (filtered.length <= maxMarkers) return filtered;
    const step = filtered.length / maxMarkers;
    const sampled: IncidentTimelineMarker[] = [];
    for (let i = 0; i < maxMarkers; i++) {
      sampled.push(filtered[Math.floor(i * step)]);
    }
    return sampled;
  }
}

/**
 * Computes the starting 1-based HUD/POV slot key (1..6) for the Right team
 * given L players on the Left team and R players on the Right team (max 6 total):
 * - Prioritizes starting at 4 (3v3 -> 1,2,3 vs 4,5,6; 1v3 -> 1 vs 4,5,6; 1v1 -> 1 vs 4).
 * - If 4 is occupied by the Left team (L >= 4), shifts forward to L + 1 (4v1 -> 1..4 vs 5; 5v1 -> 1..5 vs 6).
 * - If the Right team has > 3 players (R > 3), shifts backward from 4 to (7 - R) so keys never exceed 6
 *   (1v4 -> 1 vs 3,4,5,6; 2v4 -> 1,2 vs 3,4,5,6; 1v5 -> 1 vs 2,3,4,5,6).
 */
export function computeRightTeamStartSlotKey(leftCount: number, rightCount: number): number {
  const L = Math.max(0, Math.min(6, Math.floor(leftCount || 0)));
  const R = Math.max(0, Math.min(6, Math.floor(rightCount || 0)));
  if (R <= 0) return Math.max(4, L + 1);
  return Math.max(L + 1, Math.min(4, 7 - R));
}

export interface TeamSlotAssignmentResult {
  rightStartKey: number;
  leftSlotKeys: number[];
  rightSlotKeys: number[];
  slotKeyToCarIndex: Record<number, number>;
  carIndexToSlotKey: Record<number, number>;
}

export function assignTeamSlotKeys(
  leftEntries: Array<{ carIndex?: number } | null | undefined> = [],
  rightEntries: Array<{ carIndex?: number } | null | undefined> = []
): TeamSlotAssignmentResult {
  const L = Math.min(5, leftEntries.length);
  const R = Math.min(5, rightEntries.length);
  const rightStartKey = computeRightTeamStartSlotKey(L, R);
  const leftSlotKeys: number[] = [];
  const rightSlotKeys: number[] = [];
  const slotKeyToCarIndex: Record<number, number> = {};
  const carIndexToSlotKey: Record<number, number> = {};

  for (let i = 0; i < L; i++) {
    const slotKey = Math.min(6, i + 1);
    leftSlotKeys.push(slotKey);
    const entry = leftEntries[i];
    if (entry && typeof entry.carIndex === 'number') {
      slotKeyToCarIndex[slotKey] = entry.carIndex;
      carIndexToSlotKey[entry.carIndex] = slotKey;
    }
  }

  for (let j = 0; j < R; j++) {
    const slotKey = Math.min(6, rightStartKey + j);
    rightSlotKeys.push(slotKey);
    const entry = rightEntries[j];
    if (entry && typeof entry.carIndex === 'number') {
      slotKeyToCarIndex[slotKey] = entry.carIndex;
      carIndexToSlotKey[entry.carIndex] = slotKey;
    }
  }

  return {
    rightStartKey,
    leftSlotKeys,
    rightSlotKeys,
    slotKeyToCarIndex,
    carIndexToSlotKey,
  };
}
