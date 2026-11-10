/**
 * src/replay/container/RCReplaySignalTimeline.ts
 * Timeline 3 (Track C): Authoritative 64B Match Signal Stream with O(log N) range queries & HUD state evaluation.
 */

import { INCIDENT_EVENT_TYPES, MATCH_SIGNALS } from '../../physics/RocketSimConstants.ts';
import { resolveReplayAudioCueForSignal } from '../ReplayBufferSliceExtractor.ts';
import type {
  DecodedIncidentEvent,
  DecodedSignalEvent,
  ReplaySnapshotFloat32Array,
} from './RCReplayBinarySchema.ts';

function lowerBoundByFrameIndex<T extends { frameIndex?: number }>(
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

function upperBoundByFrameIndex<T extends { frameIndex?: number }>(
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

export interface SignalTimelineStateReader {
  readonly count: number;
  getSnapshotAt(frameIndex: number): ReplaySnapshotFloat32Array | null;
}

export interface SignalTimelineIncidentReader {
  getEventsInFrameRange(
    startFrameInclusive: number,
    endFrameInclusive: number
  ): DecodedIncidentEvent[];
}

export const SIGNAL_TYPE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  [MATCH_SIGNALS.MATCH_STARTED]: 'Match Started',
  [MATCH_SIGNALS.KICKOFF_WILL_START]: 'Kickoff Countdown',
  [MATCH_SIGNALS.KICKOFF_START]: 'Kickoff Go',
  [MATCH_SIGNALS.COUNTDOWN_TICK]: 'Countdown Tick',
  [MATCH_SIGNALS.SCORE_UPDATED]: 'Score Updated',
  [MATCH_SIGNALS.GOAL_REPLAY_WILL_START]: 'Goal Replay',
  [MATCH_SIGNALS.GOAL_REPLAY_START]: 'Goal Replay Start',
  [MATCH_SIGNALS.GOAL_REPLAY_WILL_END]: 'Goal Replay Ending',
  [MATCH_SIGNALS.GOAL_REPLAY_END]: 'Goal Replay End',
  [MATCH_SIGNALS.BALL_RESET]: 'Ball Reset',
  [MATCH_SIGNALS.ROUND_STARTED]: 'Round Started',
  [MATCH_SIGNALS.DEMOLITION]: 'Demolition',
  [MATCH_SIGNALS.FORFEIT_VOTE]: 'Forfeit Vote',
  [MATCH_SIGNALS.MATCH_PAUSED]: 'Match Paused',
  [MATCH_SIGNALS.COUNTDOWN_10S]: '10s Countdown',
  [MATCH_SIGNALS.OVERTIME_START]: 'Overtime Start',
  [MATCH_SIGNALS.MATCH_ENDED]: 'Match Ended',
  [MATCH_SIGNALS.PODIUM_START]: 'Podium Start',
  [MATCH_SIGNALS.TIME_ALERT_60S]: '60s Remaining',
  [MATCH_SIGNALS.TIME_ALERT_30S]: '30s Remaining',
  [MATCH_SIGNALS.CLOCK_UPDATED_SECONDS]: 'Clock Tick',
  [MATCH_SIGNALS.MATCH_RESUMED]: 'Match Resumed',
  [MATCH_SIGNALS.MATCH_WILL_RESUME]: 'Resume Countdown',
});

export interface SignalTimelineOptions {
  bytes?: Uint8Array;
  recordedEvents?: DecodedSignalEvent[];
  synthesizedEvents?: DecodedSignalEvent[];
  byFrameMap?: Map<number, DecodedSignalEvent[]>;
  frameCount?: number;
  isCountUp?: boolean;
  stateInputTimeline?: SignalTimelineStateReader | null;
  incidentTimeline?: SignalTimelineIncidentReader | null;
}

export interface SignalTimelineMarker {
  frameIndex: number;
  tick: number;
  type: number;
  param1: number;
  param2: number;
  synthesized: boolean;
  label: string;
}

/**
 * Timeline 3: Chronological 64B Authoritative Match Signal Timeline.
 */
export class SignalTimeline {
  bytes: Uint8Array;
  recordedEvents: DecodedSignalEvent[];
  synthesizedEvents: DecodedSignalEvent[];
  events: DecodedSignalEvent[];
  byFrameMap: Map<number, DecodedSignalEvent[]>;
  frameCount: number;
  isCountUp: boolean;
  stateInputTimeline: SignalTimelineStateReader | null;
  incidentTimeline: SignalTimelineIncidentReader | null;
  _kickoffClockStartCache: Map<number, number>;
  _hasExplicitKickoffSignals: boolean;

  constructor({
    bytes,
    recordedEvents = [],
    synthesizedEvents = [],
    byFrameMap = new Map(),
    frameCount = 0,
    isCountUp = false,
    stateInputTimeline = null,
    incidentTimeline = null,
  }: SignalTimelineOptions) {
    this.bytes = bytes || new Uint8Array(0);
    const sortedRecorded = recordedEvents
      .slice()
      .sort((a, b) => (a.frameIndex ?? 0) - (b.frameIndex ?? 0) || (a.tick ?? 0) - (b.tick ?? 0));
    const hasGoalReplayLifecycle = sortedRecorded.some(
      (s) =>
        s &&
        (s.signalType === MATCH_SIGNALS.GOAL_REPLAY_START ||
          s.signalType === MATCH_SIGNALS.GOAL_REPLAY_WILL_END ||
          s.signalType === MATCH_SIGNALS.GOAL_REPLAY_END)
    );
    this.recordedEvents = hasGoalReplayLifecycle
      ? sortedRecorded
      : sortedRecorded.filter((s) => s && s.signalType !== MATCH_SIGNALS.GOAL_REPLAY_WILL_START);
    this.synthesizedEvents = synthesizedEvents
      .slice()
      .sort((a, b) => (a.frameIndex ?? 0) - (b.frameIndex ?? 0) || (a.tick ?? 0) - (b.tick ?? 0));
    this.events = this.recordedEvents.length > 0 ? this.recordedEvents : this.synthesizedEvents;
    this.byFrameMap = byFrameMap;
    this.frameCount = frameCount;
    this.isCountUp = isCountUp;
    this.stateInputTimeline = stateInputTimeline || null;
    this.incidentTimeline = incidentTimeline || null;
    this._kickoffClockStartCache = new Map();
    this._hasExplicitKickoffSignals = this.events.some(
      (s) =>
        s &&
        (s.signalType === MATCH_SIGNALS.KICKOFF_START ||
          s.signalType === MATCH_SIGNALS.KICKOFF_WILL_START)
    );
  }

  get recordedCount(): number {
    return this.recordedEvents.length;
  }

  get synthesizedCount(): number {
    return this.recordedEvents.length > 0 ? 0 : this.synthesizedEvents.length;
  }

  get count(): number {
    return this.events.length;
  }

  getEventsAtFrame(frameIndex: number): DecodedSignalEvent[] {
    return this.byFrameMap.get(Math.floor(frameIndex)) || [];
  }

  getEventsInFrameRange(
    startFrameInclusive: number,
    endFrameInclusive: number
  ): DecodedSignalEvent[] {
    if (this.events.length === 0) return [];
    const loFrame = Math.min(startFrameInclusive, endFrameInclusive);
    const hiFrame = Math.max(startFrameInclusive, endFrameInclusive);
    const startIdx = lowerBoundByFrameIndex(this.events, loFrame);
    const endIdx = upperBoundByFrameIndex(this.events, hiFrame);
    if (startIdx >= endIdx) return [];
    return this.events.slice(startIdx, endIdx);
  }

  getAudioCuesInFrameRange(
    startFrameInclusive: number,
    endFrameInclusive: number,
    isCountUpOverride: boolean | null = null
  ): any[] {
    const sigs = this.getEventsInFrameRange(startFrameInclusive, endFrameInclusive);
    if (sigs.length === 0) return [];
    const countUp = isCountUpOverride !== null ? isCountUpOverride : this.isCountUp;
    const cues: any[] = [];
    for (let i = 0; i < sigs.length; i++) {
      const cue = resolveReplayAudioCueForSignal(sigs[i], countUp);
      if (cue) cues.push(cue);
    }
    return cues;
  }

  /**
   * Resolves the exact frame after a kickoff GO (`kickoffGoFrame`) when the 5-minute match clock
   * begins ticking: either on the first ball touch / ball movement OR after 5 seconds (600 ticks @ 120Hz)
   * of no ball touch.
   */
  _resolveClockStartFrameAfterKickoff(kickoffGoFrame: number): number {
    const goFrame = Math.max(0, Math.floor(kickoffGoFrame));
    if (this._kickoffClockStartCache.has(goFrame)) {
      return this._kickoffClockStartCache.get(goFrame)!;
    }

    const maxWaitFrame = goFrame + 600; // 5.0s @ 120Hz
    let clockStartFrame = maxWaitFrame;

    if (this.incidentTimeline) {
      const incs = this.incidentTimeline.getEventsInFrameRange(goFrame, maxWaitFrame);
      for (let i = 0; i < incs.length; i++) {
        const ev = incs[i];
        if (ev && ev.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT) {
          const fIdx = Math.max(goFrame, ev.frameIndex ?? goFrame);
          if (fIdx < clockStartFrame) {
            clockStartFrame = fIdx;
          }
          break;
        }
      }
    }

    if (this.stateInputTimeline && this.stateInputTimeline.count > goFrame) {
      const baseSnap = this.stateInputTimeline.getSnapshotAt(goFrame);
      const baseX = baseSnap ? baseSnap[4] : 0;
      const baseY = baseSnap ? baseSnap[5] : 0;
      const searchEnd = Math.min(this.stateInputTimeline.count - 1, clockStartFrame);
      for (let f = goFrame; f <= searchEnd; f++) {
        const snap = this.stateInputTimeline.getSnapshotAt(f);
        if (!snap) continue;
        const bx = snap[4] - baseX;
        const by = snap[5] - baseY;
        const vx = snap[16];
        const vy = snap[17];
        if (bx * bx + by * by > 16.0 || vx * vx + vy * vy > 400.0) {
          clockStartFrame = f;
          break;
        }
      }
    }

    this._kickoffClockStartCache.set(goFrame, clockStartFrame);
    return clockStartFrame;
  }

  evaluateMatchStateAtFrame(frameIndex: number, matchInfo: Record<string, any> = {}) {
    let blueScore = 0;
    let orangeScore = 0;
    const rawDuration =
      typeof matchInfo.durationSeconds === 'number' && matchInfo.durationSeconds >= 0
        ? matchInfo.durationSeconds
        : 300;
    let initialDuration = matchInfo.directorReplayMeta && rawDuration > 300 ? 300 : rawDuration;

    for (let i = 0; i < Math.min(16, this.events.length); i++) {
      const s = this.events[i];
      if (!s) continue;
      if (
        (s.signalType === MATCH_SIGNALS.MATCH_INITIALIZED ||
          s.signalType === MATCH_SIGNALS.MATCH_STARTED) &&
        typeof s.param1 === 'number' &&
        s.param1 > 0
      ) {
        initialDuration = s.param1;
        break;
      }
    }

    let remainingSeconds = initialDuration;
    let overtimeSeconds = 0;
    let isOvertime = initialDuration === 0;
    let clockDirection = isOvertime ? 'up' : 'down';
    let matchPhase = 'playing';
    let kickoffCountdown = 0;
    let kickoffWillStartFrame: number | null = null;
    let clockActiveSinceFrame: number | null = null;

    const hasExplicitKickoffSignals = this._hasExplicitKickoffSignals;

    const advanceClockToFrame = (targetFrame: number) => {
      if (clockActiveSinceFrame === null) return;
      const tFrame = Math.floor(targetFrame);
      if (tFrame < clockActiveSinceFrame) return;
      const deltaFrames = Math.max(0, tFrame - clockActiveSinceFrame);
      const elapsedSec = Math.floor(deltaFrames / 120);
      if (elapsedSec > 0) {
        if (isOvertime || clockDirection === 'up') {
          overtimeSeconds += elapsedSec;
          remainingSeconds = 0;
        } else {
          remainingSeconds = Math.max(0, remainingSeconds - elapsedSec);
        }
        clockActiveSinceFrame += elapsedSec * 120;
      }
    };

    const clampedFrame = Math.max(0, Math.floor(frameIndex));
    const endSigIdx = upperBoundByFrameIndex(this.events, clampedFrame);

    if (!hasExplicitKickoffSignals && this.events.length === 0) {
      clockActiveSinceFrame = this._resolveClockStartFrameAfterKickoff(0);
    }

    for (let i = 0; i < endSigIdx; i++) {
      const sig = this.events[i];
      if (!sig) continue;
      const sigFrame = sig.frameIndex ?? 0;
      switch (sig.signalType) {
        case MATCH_SIGNALS.MATCH_INITIALIZED:
        case MATCH_SIGNALS.MATCH_STARTED: {
          if (typeof sig.param1 === 'number' && sig.param1 > 0) {
            remainingSeconds = sig.param1;
            isOvertime = false;
            clockDirection = 'down';
          } else if (sig.param1 === 0 && matchInfo.durationSeconds === 0) {
            remainingSeconds = 0;
            isOvertime = true;
            clockDirection = 'up';
          }
          overtimeSeconds = 0;
          clockActiveSinceFrame = hasExplicitKickoffSignals
            ? null
            : this._resolveClockStartFrameAfterKickoff(sigFrame);
          break;
        }
        case MATCH_SIGNALS.KICKOFF_WILL_START:
          advanceClockToFrame(sigFrame);
          clockActiveSinceFrame = null;
          kickoffWillStartFrame = sigFrame;
          matchPhase = 'kickoff';
          break;
        case MATCH_SIGNALS.KICKOFF_START:
          kickoffWillStartFrame = null;
          kickoffCountdown = 0;
          clockActiveSinceFrame = this._resolveClockStartFrameAfterKickoff(sigFrame);
          matchPhase = isOvertime ? 'overtime' : 'playing';
          break;
        case MATCH_SIGNALS.SCORE_UPDATED:
          advanceClockToFrame(sigFrame);
          clockActiveSinceFrame = null;
          kickoffWillStartFrame = null;
          kickoffCountdown = 0;
          blueScore = sig.param1 ?? blueScore;
          orangeScore = sig.param2 ?? orangeScore;
          matchPhase = 'goal';
          break;
        case MATCH_SIGNALS.GOAL_REPLAY_WILL_START:
        case MATCH_SIGNALS.GOAL_REPLAY_START:
          advanceClockToFrame(sigFrame);
          clockActiveSinceFrame = null;
          kickoffWillStartFrame = null;
          kickoffCountdown = 0;
          matchPhase = 'replay';
          break;
        case MATCH_SIGNALS.GOAL_REPLAY_WILL_END:
        case MATCH_SIGNALS.GOAL_REPLAY_END:
        case MATCH_SIGNALS.BALL_RESET:
        case MATCH_SIGNALS.ROUND_STARTED:
          kickoffWillStartFrame = null;
          kickoffCountdown = 0;
          matchPhase = isOvertime ? 'overtime' : 'playing';
          break;
        case MATCH_SIGNALS.CLOCK_UPDATED_SECONDS:
          if (sig.param2 === 1) {
            isOvertime = true;
            clockDirection = 'up';
            overtimeSeconds = sig.param1 ?? overtimeSeconds;
            remainingSeconds = 0;
          } else {
            remainingSeconds = sig.param1 ?? remainingSeconds;
          }
          clockActiveSinceFrame = sigFrame;
          break;
        case MATCH_SIGNALS.COUNTDOWN_10S:
        case MATCH_SIGNALS.TIME_ALERT_60S:
        case MATCH_SIGNALS.TIME_ALERT_30S:
          if (!isOvertime && clockDirection === 'down') {
            remainingSeconds = sig.param1 ?? remainingSeconds;
            clockActiveSinceFrame = sigFrame;
          }
          break;
        case MATCH_SIGNALS.OVERTIME_START:
          isOvertime = true;
          clockDirection = 'up';
          remainingSeconds = 0;
          overtimeSeconds = 0;
          clockActiveSinceFrame = null;
          matchPhase = 'overtime';
          break;
        case MATCH_SIGNALS.MATCH_ENDED:
        case MATCH_SIGNALS.PODIUM_START:
          advanceClockToFrame(sigFrame);
          clockActiveSinceFrame = null;
          kickoffWillStartFrame = null;
          kickoffCountdown = 0;
          matchPhase = 'podium';
          break;
        default:
          break;
      }
    }

    if (matchPhase === 'kickoff' && kickoffWillStartFrame !== null) {
      const remTicks = Math.max(0, kickoffWillStartFrame + 360 - clampedFrame);
      kickoffCountdown = Math.min(3, Math.ceil(remTicks / 120));
    }

    advanceClockToFrame(clampedFrame);

    return {
      blueScore,
      orangeScore,
      remainingSeconds: isOvertime ? overtimeSeconds : remainingSeconds,
      overtimeSeconds,
      isOvertime,
      clockDirection,
      matchPhase,
      kickoffCountdown,
      finalBlueScore: matchInfo.blueScore ?? blueScore,
      finalOrangeScore: matchInfo.orangeScore ?? orangeScore,
    };
  }

  getTimelineMarkers(maxMarkers = 120): SignalTimelineMarker[] {
    if (this.events.length === 0) return [];
    const ignoredSignals = new Set<number>([
      MATCH_SIGNALS.CLOCK_UPDATED_SECONDS,
      MATCH_SIGNALS.COMMAND_ACK,
      MATCH_SIGNALS.PLAYER_JOINED,
      MATCH_SIGNALS.PLAYER_LEFT,
      MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED,
      MATCH_SIGNALS.PLAYER_SLOT_UPDATED,
      MATCH_SIGNALS.MATCH_CREATED,
      MATCH_SIGNALS.MATCH_INITIALIZED,
      MATCH_SIGNALS.MATCH_PREPARE,
      MATCH_SIGNALS.MATCH_DESTROYED,
    ]);
    const markers: SignalTimelineMarker[] = [];
    for (let i = 0; i < this.events.length; i++) {
      const sig = this.events[i];
      if (!sig) continue;
      if (ignoredSignals.has(sig.signalType)) {
        continue;
      }
      markers.push({
        frameIndex: sig.frameIndex ?? 0,
        tick: sig.tick ?? sig.frameId ?? 0,
        type: sig.signalType,
        param1: sig.param1 ?? 0,
        param2: sig.param2 ?? 0,
        synthesized: Boolean(sig.synthesized),
        label:
          SIGNAL_TYPE_LABELS[sig.signalType] || `Signal 0x${(sig.signalType || 0).toString(16)}`,
      });
    }
    if (markers.length <= maxMarkers) return markers;
    const step = markers.length / maxMarkers;
    const sampled: SignalTimelineMarker[] = [];
    for (let i = 0; i < maxMarkers; i++) {
      sampled.push(markers[Math.floor(i * step)]);
    }
    return sampled;
  }
}
