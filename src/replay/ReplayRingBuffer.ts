/**
 * ReplayRingBuffer.ts
 * First-In-First-Out (FIFO) Circular Ring Buffer for 120Hz Replay & Audio Event Recording.
 *
 * Design Specifications:
 * - Positive Count-Up Mode (Free Play / Online Warmup / Training):
 *   Uses a 60-second (60s @ 120Hz = 7,200 ticks, ~12.9 MB) FIFO circular buffer by default
 *   (configurable to 30s / 60s / 90s / 120s). Only the most recent rolling window is kept in FIFO order,
 *   and countdown-specific audio alerts (30s / 10s countdown) are suppressed.
 * - Countdown Match Mode (Standard / Bot / Online Match):
 *   Uses a 14-minute (7 + 7 min = 840s @ 120Hz = 100,800 ticks) capacity buffer
 *   covering a full 5-minute regulation period (up to ~7 min wall-clock with kickoffs/goals)
 *   plus up to 7 minutes of Overtime before Possession tie-breaker resolves the match.
 * - Zero Three.js / DOM dependencies (safe inside Web Workers and Headless Node.js).
 */

import { isIncidentEvent, isSystemControlSignal } from '../physics/RocketSimConstants.ts';
import {
  resolveReplayAudioCueForSignal,
  populateRingBufferSlot,
  findBufferFrameByTick,
  extractRecentBufferFrames,
  collectBufferAudioEventsInRange,
  findLatestBufferSignalTick,
  extractBufferFramesInTickRange,
  type ReplaySignalEntry,
  type ReplayAudioCue,
  type ReplayCarControlsSnapshot,
  type ReplayAcknowledgedControlEntry,
  type ReplayRecordedIncident,
  type ReplayRecordFrameOptions,
  type ReplaySignalsOrOptionsArg,
  type ReplayRingBufferSlot,
} from './ReplayBufferSliceExtractor.ts';

export type {
  ReplaySignalEntry,
  ReplayAudioCue,
  ReplayCarControlsSnapshot,
  ReplayAcknowledgedControlEntry,
  ReplayRecordedIncident,
  ReplayRecordFrameOptions,
  ReplaySignalsOrOptionsArg,
  ReplayRingBufferSlot,
};

export const CLOCK_MODES = Object.freeze({
  REGULATION_COUNTDOWN: 0,
  OVERTIME_COUNTUP: 1,
  TRAINING_COUNTUP: 2,
});

export const REPLAY_TICK_RATE = 120;

/** 60 seconds @ 120Hz = 7,200 ticks (~12.9 MB @ 448 floats/tick) default for positive count-up FIFO mode */
export const COUNTUP_REPLAY_DURATION_SECONDS = 60;
export const COUNTUP_REPLAY_CAPACITY_TICKS = COUNTUP_REPLAY_DURATION_SECONDS * REPLAY_TICK_RATE; // 7,200

/** 7 + 7 = 14 minutes (840 seconds) @ 120Hz = 100,800 ticks for countdown match mode */
export const REGULATION_MAX_WALL_SECONDS = 420; // 7 minutes (5 min clock + kickoffs/celebrations)
export const OVERTIME_MAX_WALL_SECONDS = 420; // 7 minutes cap before possession tie-breaker
export const COUNTDOWN_REPLAY_DURATION_SECONDS =
  REGULATION_MAX_WALL_SECONDS + OVERTIME_MAX_WALL_SECONDS; // 840s
export const COUNTDOWN_REPLAY_CAPACITY_TICKS = COUNTDOWN_REPLAY_DURATION_SECONDS * REPLAY_TICK_RATE; // 100,800

/** Compact per-frame float count: Header (4) + Ball (18) + 8 Cars (320) + 34 Boost Pads (68) = 410 floats */
export const COMPACT_SNAPSHOT_FLOATS = 410;
/** Full GameStateBufferPod float count including Possession (6) + 8-Car Extended Jump/AirTime (32) = 448 floats */
export const GAME_STATE_BUFFER_FLOATS = 448;

export const REPLAY_BUFFER_MODES = Object.freeze({
  COUNTUP_FIFO: 'countup_fifo',
  COUNTDOWN_MATCH: 'countdown_match',
});

export interface ReplayRingBufferOptions {
  mode?: string;
  isCountUp?: boolean;
  capacityTicks?: number | null;
  snapshotFloatLimit?: number;
  includeSystemControlSignals?: boolean;
}

export class ReplayRingBuffer {
  mode: string;
  _hasExplicitFloatLimit: boolean;
  snapshotFloatLimit: number;
  capacityTicks: number;
  includeSystemControlSignals: boolean;
  _slots: Array<ReplayRingBufferSlot | undefined>;
  _head: number;
  _size: number;
  _totalRecordedFrames: number;

  constructor(options: ReplayRingBufferOptions = {}) {
    const mode =
      options.mode ||
      (options.isCountUp ? REPLAY_BUFFER_MODES.COUNTUP_FIFO : REPLAY_BUFFER_MODES.COUNTDOWN_MATCH);
    this.mode = mode;
    this._hasExplicitFloatLimit =
      typeof options.snapshotFloatLimit === 'number' && options.snapshotFloatLimit > 0;
    this.snapshotFloatLimit = this._hasExplicitFloatLimit
      ? options.snapshotFloatLimit!
      : GAME_STATE_BUFFER_FLOATS;
    const cap = this._resolveCapacityTicks(mode, options.capacityTicks);
    this.capacityTicks = cap;
    this.includeSystemControlSignals = Boolean(options.includeSystemControlSignals);

    this._slots = new Array(cap);
    this._head = 0;
    this._size = 0;
    this._totalRecordedFrames = 0;
  }

  _resolveCapacityTicks(mode: string, explicitCapacity?: number | null): number {
    if (
      typeof explicitCapacity === 'number' &&
      Number.isFinite(explicitCapacity) &&
      explicitCapacity > 0
    ) {
      return Math.floor(explicitCapacity);
    }
    if (mode === REPLAY_BUFFER_MODES.COUNTUP_FIFO) {
      return COUNTUP_REPLAY_CAPACITY_TICKS;
    }
    if (mode === REPLAY_BUFFER_MODES.COUNTDOWN_MATCH) {
      return COUNTDOWN_REPLAY_CAPACITY_TICKS;
    }
    console.warn(
      `[ReplayRingBuffer:Fallback] Unknown mode "${mode}", falling back to COUNTDOWN_MATCH capacity (${COUNTDOWN_REPLAY_CAPACITY_TICKS} ticks).`
    );
    return COUNTDOWN_REPLAY_CAPACITY_TICKS;
  }

  get size(): number {
    return this._size;
  }

  get capacity(): number {
    return this.capacityTicks;
  }

  get totalRecordedFrames(): number {
    return this._totalRecordedFrames;
  }

  get isCountUpMode(): boolean {
    return this.mode === REPLAY_BUFFER_MODES.COUNTUP_FIFO;
  }

  configureMode(mode: string, explicitCapacity: number | null = null): void {
    const nextCapacity = this._resolveCapacityTicks(mode, explicitCapacity);
    this.mode = mode;
    if (nextCapacity !== this.capacityTicks) {
      this.capacityTicks = nextCapacity;
      this._slots = new Array(nextCapacity);
    }
    this.clear();
  }

  clear(): void {
    this._head = 0;
    this._size = 0;
    this._totalRecordedFrames = 0;
  }

  private _resolveTargetSlotForEvent(tick: number): ReplayRingBufferSlot | null {
    if (this._size <= 0) return null;
    const targetTick = typeof tick === 'number' && tick > 0 ? tick >>> 0 : -1;
    let slot = targetTick >= 0 ? this.findFrameByTick(targetTick) : this.getNewestFrame();
    if (!slot || (targetTick >= 0 && Math.abs(slot.tick - targetTick) > 8)) {
      slot = this.getNewestFrame();
    }
    return slot;
  }

  recordFrame(
    tick: number,
    stateSnapshot: Float32Array | number[] | null | undefined,
    signals: ReplaySignalsOrOptionsArg = [],
    audioEvents: ReadonlyArray<ReplayAudioCue | null | undefined> | null = null,
    incidents: ReadonlyArray<ReplayRecordedIncident | null | undefined> | null = null,
    acknowledgedControls: ReadonlyArray<
      ReplayAcknowledgedControlEntry | null | undefined
    > | null = null
  ): ReplayRingBufferSlot {
    const writeIdx = this._head;
    const slot = populateRingBufferSlot({
      existingSlot: this._slots[writeIdx],
      tick,
      stateSnapshot,
      snapshotFloatLimit: this.snapshotFloatLimit,
      includeSystemControlSignals: this.includeSystemControlSignals,
      isCountUpMode: this.isCountUpMode,
      signals,
      audioEvents,
      incidents,
      acknowledgedControls,
    });
    this._slots[writeIdx] = slot;

    this._head = (writeIdx + 1) % this.capacityTicks;
    if (this._size < this.capacityTicks) {
      this._size++;
    }
    this._totalRecordedFrames++;
    return slot;
  }

  appendSignal(tick: number, signal: ReplaySignalEntry | null | undefined): boolean {
    if (!signal || this._size <= 0) return false;
    if (!this.includeSystemControlSignals && isSystemControlSignal(signal.signalType)) return false;
    const slot = this._resolveTargetSlotForEvent(tick);
    if (!slot) return false;
    if (!Array.isArray(slot.signals)) slot.signals = [];
    const normalizedSignal: ReplaySignalEntry = {
      signalId: signal.signalId ?? 0,
      signalType: signal.signalType,
      frameId: signal.frameId ?? slot.tick,
      param1: signal.param1 ?? 0,
      param2: signal.param2 ?? 0,
    };
    slot.signals.push(normalizedSignal);
    const cue = resolveReplayAudioCueForSignal(normalizedSignal, this.isCountUpMode);
    if (cue) {
      if (!Array.isArray(slot.audioEvents)) slot.audioEvents = [];
      slot.audioEvents.push(cue);
    }
    return true;
  }

  appendIncident(tick: number, incident: ReplayRecordedIncident | null | undefined): boolean {
    if (!incident || !isIncidentEvent(incident.type) || this._size <= 0) return false;
    const slot = this._resolveTargetSlotForEvent(tick);
    if (!slot) return false;
    if (!Array.isArray(slot.incidents)) slot.incidents = [];
    slot.incidents.push({ ...incident });
    return true;
  }

  appendAudioEvent(tick: number, cue: ReplayAudioCue | null | undefined): boolean {
    if (!cue || this._size <= 0) return false;
    const slot = this._resolveTargetSlotForEvent(tick);
    if (!slot) return false;
    slot.audioEvents.push({ ...cue });
    return true;
  }

  _oldestPhysicalIndex(): number {
    return this._size < this.capacityTicks ? 0 : this._head;
  }

  getFrameAt(logicalIndex: number): ReplayRingBufferSlot | null {
    if (logicalIndex < 0 || logicalIndex >= this._size) return null;
    const physIdx = (this._oldestPhysicalIndex() + logicalIndex) % this.capacityTicks;
    return this._slots[physIdx] || null;
  }

  getOldestFrame(): ReplayRingBufferSlot | null {
    return this._size > 0 ? this.getFrameAt(0) : null;
  }

  getNewestFrame(): ReplayRingBufferSlot | null {
    return this._size > 0 ? this.getFrameAt(this._size - 1) : null;
  }

  getFrameByOffset(ticksAgo = 0): ReplayRingBufferSlot | null {
    if (this._size <= 0) return null;
    const clampedOffset = Math.max(0, Math.min(this._size - 1, Math.floor(ticksAgo)));
    return this.getFrameAt(this._size - 1 - clampedOffset);
  }

  findFrameByTick(targetTick: number): ReplayRingBufferSlot | null {
    return findBufferFrameByTick(this._size, (idx) => this.getFrameAt(idx), targetTick);
  }

  getRecentFrames(maxFrames = this._size): Array<ReplayRingBufferSlot | null> {
    return extractRecentBufferFrames(this._size, (idx) => this.getFrameAt(idx), maxFrames);
  }

  getAudioEventsInRange(startTick: number, endTick: number): ReplayAudioCue[] {
    return collectBufferAudioEventsInRange(
      this._size,
      (idx) => this.getFrameAt(idx),
      startTick,
      endTick
    );
  }

  findLatestSignalTick(signalType: number, maxTick = Infinity): number {
    return findLatestBufferSignalTick(
      this._size,
      (idx) => this.getFrameAt(idx),
      signalType,
      maxTick
    );
  }

  getFramesInTickRange(startTick: number, endTick: number): ReplayRingBufferSlot[] {
    return extractBufferFramesInTickRange(
      this._size,
      (idx) => this.getFrameAt(idx),
      startTick,
      endTick
    );
  }

  extractRange(startTick: number, endTick: number): ReplayRingBufferSlot[] {
    return this.getFramesInTickRange(startTick, endTick);
  }
}
