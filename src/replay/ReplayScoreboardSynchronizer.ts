import { SIM_OFFSETS, MAX_CARS } from '../physics/RocketSimConstants.ts';
import {
  dispatchReplayFrameEvents,
  type ReplayDispatchIncidentItem,
  type ReplayDispatchSignalItem,
  type ReplayDispatchAudioCueItem,
} from './ReplayFrameEventDispatcher.ts';
import { hudStore, useReplayToRcsImporterStore } from '../game/runtimeUiPort.ts';
import type {
  ReplayRosterEntry,
  ReplayViewerRosterRuntimePort,
  ReplayViewerRosterModePort,
  ReplayRosterMetadataLike,
  ReplayRosterSignalItem,
} from './ReplayViewerRosterSubController.ts';
import type { ReplayFrameSlotLike, ReplaySnapshotBuffer } from './ReplayCausalHybridEngine.ts';
import type { ReplayTakeoverRuntimePort } from './ReplayTakeoverSubController.ts';
import {
  warmupArenaTrailsFromReplayWindow,
  type ReplayTrailWarmupArenaPort,
} from '../entities/vehicle/supersonic-trail/SupersonicWheelTrailReplaySync.ts';

/**
 * ReplayScoreboardSynchronizer.ts
 * Stateful SubController synchronizing HUD scoreboard, match clock, arena car counts,
 * and Track A/B/C frame state for StandaloneReplayViewerController.
 */

export interface ReplayScoreboardStateInputTimelinePort {
  count?: number;
  getFrameAt?: (frameIndex: number) => ReplayFrameSlotLike | null;
  getControlsAt?: (frameIndex: number) => NonNullable<ReplayFrameSlotLike['controls']> | null;
}

export interface ReplayScoreboardIncidentTimelinePort {
  count?: number;
  getEventsAtFrame?: (frameIndex: number) => ReplayDispatchIncidentItem[] | null;
  getEventsInFrameRange: (startIdx: number, endIdx: number) => ReplayDispatchIncidentItem[];
  getTimelineMarkers?: (maxMarkers: number) => Array<Record<string, unknown>>;
}

export interface ReplayScoreboardSignalEvaluationResult {
  blueScore: number;
  orangeScore: number;
  matchPhase?: string;
  kickoffCountdown?: number;
  remainingSeconds: number | null;
  isOvertime?: boolean;
  overtimeSeconds?: number;
}

export interface ReplayScoreboardSignalTimelinePort {
  count?: number;
  recordedCount?: number;
  synthesizedCount?: number;
  getRecordedSignals?: () => ReplayRosterSignalItem[];
  getEventsInFrameRange: (startIdx: number, endIdx: number) => ReplayDispatchSignalItem[];
  getTimelineMarkers?: (maxMarkers: number) => Array<Record<string, unknown>>;
  evaluateMatchStateAtFrame: (
    idx: number,
    metadata: ReplayRosterMetadataLike
  ) => ReplayScoreboardSignalEvaluationResult;
}

export interface ReplayScoreboardTimelinesBundle {
  incidents?: ReplayDispatchIncidentItem[];
  recordedSignals?: ReplayDispatchSignalItem[];
  synthesizedSignals?: ReplayDispatchSignalItem[];
  signals?: ReplayDispatchSignalItem[];
  stateInputTimeline?: ReplayScoreboardStateInputTimelinePort | null;
  stateInput?: ReplayScoreboardStateInputTimelinePort | null;
  incidentTimeline?: ReplayScoreboardIncidentTimelinePort | null;
  signalTimeline?: ReplayScoreboardSignalTimelinePort | null;
  [key: string]: unknown;
}

export interface ReplayScoreboardModePort extends ReplayViewerRosterModePort {
  id?: string;
  replayController?: { endReplaySession?: () => void } | null;
  goalAndTouch?: {
    goalResetTicks?: number;
    goalIncidentTick?: number;
    frozenGoalBallState?: unknown;
  } | null;
  rewinderController?: {
    isScrubbing?: boolean;
    isBlockingLivePhysics?: boolean;
    exitRewindMode?: () => void;
    stopRecording?: () => void;
  } | null;
}

export interface ReplayScoreboardRuntimePort
  extends ReplayViewerRosterRuntimePort, ReplayTakeoverRuntimePort {
  physics?:
    | (NonNullable<ReplayViewerRosterRuntimePort['physics']> &
        NonNullable<ReplayTakeoverRuntimePort['physics']> & {
          state: Float32Array;
          restoreState: (
            snap: Float32Array,
            restoreOptions?: { preserveEngineTick?: boolean; overrideTick?: number }
          ) => void;
          setControls?: (carIndex: number, controls: Record<string, unknown>) => void;
          setUnlimitedBoost?: (enabled: boolean) => void;
          saveCompactState?: () => Float32Array;
          setBallState?: (ballSlice: Float32Array) => void;
          setCarState?: (carIndex: number, carSlice: Float32Array) => void;
        })
    | null;
  arena?:
    | (NonNullable<ReplayViewerRosterRuntimePort['arena']> & {
        carDemolitions?: Array<{ stop?: () => void } | null | undefined>;
        syncCarsCount?: (numCars: number) => void;
        resetCarBoosts?: (carIndex: number) => void;
        resetBallTrail?: () => void;
        supersonicWheelTrailSystem?: {
          clear?: () => void;
          resetCar?: (carIndex: number) => void;
        } | null;
        lighting?: {
          updateSunIntensities?: (scale?: number) => void;
          update?: (
            carPos: unknown,
            ballPos: unknown,
            dt: number,
            isGoalReplay?: boolean,
            allowShadows?: boolean
          ) => void;
        } | null;
      })
    | null;
  interpolator?: { prevState: Float32Array; currState: Float32Array; alpha: number } | null;
  match?: {
    state?: { mode?: string; phase?: string; paused?: boolean; [key: string]: unknown };
    [key: string]: unknown;
  } | null;
  modeManager?: {
    getActiveMode?: () => ReplayScoreboardModePort | null;
    setMode?: (mode: string) => void;
    modes?: { get?: (modeId: string) => ReplayScoreboardModePort | null | undefined };
    activeMode?: ReplayScoreboardModePort | null;
  } | null;
  teamAssignment?: { playerTeam?: number } | null;
  playerControls?: Record<string, unknown>;
  neutralControls?: Record<string, unknown>;
  _clientGoalIncidentLatched?: boolean;
  switchToFreeplay?: () => void;
  botCoordinator?: { leaveBotMatch?: () => void } | null;
  loadoutCoordinator?: { restoreLocalPlayerFreeplayLoadout?: (carIndex?: number) => void } | null;
  releaseGoalReplayCameraOverride?: () => void;
  changePlayerVehicle?: (preset: string) => void;
  setCarColor?: (carIndex: number, hex: string, persist?: boolean) => void;
  syncPlayerMaterialsLoadout?: () => void;
  simulationStage?: { resetActionStates?: () => void } | null;
  audioSubsystem?: { resetAudio?: () => void } | null;
}

export interface ReplayScoreboardFrameSource {
  readonly runtime: ReplayScoreboardRuntimePort | null;
  readonly mode: ReplayScoreboardModePort | null;
  readonly frames: ArrayLike<ReplaySnapshotBuffer>;
  readonly frameSlots: ReplayFrameSlotLike[];
  readonly timelines: ReplayScoreboardTimelinesBundle | null;
  readonly stateInputTimeline: ReplayScoreboardStateInputTimelinePort | null;
  readonly incidentTimeline: ReplayScoreboardIncidentTimelinePort | null;
  readonly signalTimeline: ReplayScoreboardSignalTimelinePort | null;
  readonly metadata: ReplayRosterMetadataLike | null;
  readonly rosterSubController: {
    readonly resolvedRoster: ReplayRosterEntry[];
    readonly activePovCarIndex: number;
    readonly activePovSlotKey: number;
    readonly activePovTeam: number;
  };
  readonly takeoverSubController: {
    readonly cursor: number;
  };
}

export class ReplayScoreboardSynchronizer {
  public lastDispatchedCursorFrame = -1;
  private _lastHudSyncKey = '';

  public reset(): void {
    this.lastDispatchedCursorFrame = -1;
    this._lastHudSyncKey = '';
  }

  public syncArenaCarCountForFrame(
    runtime: ReplayScoreboardRuntimePort | null,
    resolvedRosterLength: number,
    frame: Float32Array | ArrayLike<number> | null | undefined
  ): void {
    if (!runtime?.physics || !frame) return;
    if (resolvedRosterLength > 0) {
      return;
    }
    const rawNum = Math.round(frame[SIM_OFFSETS.NUM_CARS] || 1);
    const numCars = Math.max(1, Math.min(MAX_CARS, rawNum));

    while (runtime.physics.numCars > numCars && typeof runtime.physics.removeCar === 'function') {
      runtime.physics.removeCar(runtime.physics.numCars - 1);
    }
    while (runtime.physics.numCars < numCars && typeof runtime.physics.addCar === 'function') {
      const idx = runtime.physics.numCars;
      const team = idx % 2;
      runtime.physics.addCar(team, 'default');
    }
    runtime.arena?.syncCarsCount?.(numCars);
  }

  public buildTimelineStorePatch(source: ReplayScoreboardFrameSource): Record<string, unknown> {
    const stateTrackCount = source.stateInputTimeline?.count ?? source.frames.length;
    const incidentTrackCount =
      source.incidentTimeline?.count ??
      (Array.isArray(source.timelines?.incidents) ? source.timelines.incidents.length : 0);
    const recordedSignalCount =
      source.signalTimeline?.recordedCount ??
      (Array.isArray(source.timelines?.recordedSignals)
        ? source.timelines.recordedSignals.length
        : 0);
    const synthesizedSignalCount =
      source.signalTimeline?.synthesizedCount ??
      (Array.isArray(source.timelines?.synthesizedSignals)
        ? source.timelines.synthesizedSignals.length
        : 0);
    const signalTrackCount =
      source.signalTimeline?.count ??
      (Array.isArray(source.timelines?.signals) ? source.timelines.signals.length : 0);
    const incidentMarkers = source.incidentTimeline?.getTimelineMarkers?.(160) || [];
    const signalMarkers = source.signalTimeline?.getTimelineMarkers?.(120) || [];

    return {
      stateTrackCount,
      incidentTrackCount,
      signalTrackCount,
      recordedSignalCount,
      synthesizedSignalCount,
      incidentMarkers,
      signalMarkers,
      activePovCarIndex: source.rosterSubController.activePovCarIndex,
      activePovSlotKey: source.rosterSubController.activePovSlotKey,
      activePovTeam: source.rosterSubController.activePovTeam,
    };
  }

  public syncScoreboardAndClockAtFrame(
    signalTimeline: ReplayScoreboardSignalTimelinePort | null,
    metadata: ReplayRosterMetadataLike | null,
    activePovTeam: number,
    idx: number
  ): void {
    if (!signalTimeline) return;
    const evalState = signalTimeline.evaluateMatchStateAtFrame(idx, metadata || {});
    const isOt = Boolean(evalState.isOvertime);
    const matchPhase = evalState.matchPhase || (isOt ? 'overtime' : 'playing');
    const kickoffCountdown = evalState.kickoffCountdown || 0;
    const remSec = evalState.remainingSeconds;
    const otSec = evalState.overtimeSeconds || 0;
    const syncKey = `${activePovTeam}|${evalState.blueScore}|${evalState.orangeScore}|${matchPhase}|${kickoffCountdown}|${remSec}|${isOt ? 1 : 0}|${otSec}`;
    if (syncKey === this._lastHudSyncKey) {
      return;
    }
    this._lastHudSyncKey = syncKey;
    const hudPatch: Record<string, unknown> = {
      localTeam: activePovTeam,
      blueScore: evalState.blueScore,
      orangeScore: evalState.orangeScore,
      matchPhase,
      kickoffCountdown,
      ...(matchPhase !== 'replay'
        ? {
            replayScorerName: null,
            replayScorerTeam: null,
            replayBallSpeedKph: null,
            replayAssistName: null,
          }
        : {}),
    };
    if (remSec !== null) {
      hudPatch.remainingSeconds = remSec;
      hudPatch.isOvertime = isOt;
      hudPatch.overtimeSeconds = otSec;
    }
    hudStore.getState().setMatchState(hudPatch);
  }

  public applyFrameAtCursor(
    source: ReplayScoreboardFrameSource,
    smoothStep = false,
    dispatchEvents = false,
    restoreOptions: { preserveEngineTick?: boolean; overrideTick?: number } = {
      preserveEngineTick: true,
    }
  ): void {
    const r = source.runtime;
    if (!r?.physics || source.frames.length === 0) return;
    const impSt = useReplayToRcsImporterStore.getState();
    if (impSt.viewerState !== 'idle' && !impSt.isWindowOpen) {
      impSt.updateLiveTelemetry({ viewerState: 'idle', hasHotkeyPriority: false });
    }
    const idx = Math.max(
      0,
      Math.min(source.frames.length - 1, Math.floor(source.takeoverSubController.cursor))
    );

    // 1. Track A (State + Input Timeline)
    const slot = source.stateInputTimeline?.getFrameAt?.(idx) || source.frameSlots?.[idx] || null;
    const snap = (slot?.snapshot || source.frames[idx]) as ReplaySnapshotBuffer | undefined;
    if (!snap) return;

    const roster = source.rosterSubController.resolvedRoster;
    const activePovCarIndex = source.rosterSubController.activePovCarIndex;
    this.syncArenaCarCountForFrame(r, roster?.length ?? 0, snap);

    if (r.playerCarIndex !== activePovCarIndex) {
      r.playerCarIndex = activePovCarIndex;
      if (r.arena) {
        r.arena.playerCarIndex = activePovCarIndex;
      }
    }
    if (r.keyboard && r.keyboard.ballControlEnabled) {
      r.keyboard.ballControlEnabled = false;
    }

    if (smoothStep && r.interpolator) {
      r.interpolator.prevState.set(r.interpolator.currState);
    }

    r.physics.restoreState(snap, restoreOptions);

    for (const e of roster) {
      r.physics.setCarTeam?.(e.carIndex, e.team);
    }

    const controls =
      slot?.acknowledgedControls ||
      slot?.controls ||
      source.stateInputTimeline?.getControlsAt?.(idx) ||
      snap?.controls;
    if (Array.isArray(controls) && typeof r.physics.setControls === 'function') {
      for (let c = 0; c < Math.min(controls.length, MAX_CARS); c++) {
        const item = controls[c];
        if (!item) continue;
        const targetCarIdx = typeof item.carIndex === 'number' ? item.carIndex : c;
        const ctrlPayload = (item.controls || item) as Record<string, unknown>;
        if (ctrlPayload) {
          r.physics.setControls(targetCarIdx, ctrlPayload);
        }
      }
    }

    if (!smoothStep) {
      r.arena?.resetBallTrail?.();
    }
    if (r.interpolator) {
      if (!smoothStep) {
        r.interpolator.prevState.set(r.physics.state);
        r.interpolator.alpha = 0;
      }
      r.interpolator.currState.set(r.physics.state);
    }

    if (!smoothStep && r.arena) {
      warmupArenaTrailsFromReplayWindow(
        r.arena as ReplayTrailWarmupArenaPort,
        (fIdx) =>
          (source.stateInputTimeline?.getFrameAt?.(fIdx)?.snapshot ||
            source.frameSlots?.[fIdx]?.snapshot ||
            source.frames[fIdx]) as Float32Array | null | undefined,
        idx
      );
    }

    // 2. Track B (Incident Timeline) & Track C (Signal Timeline)
    if (dispatchEvents && idx > this.lastDispatchedCursorFrame) {
      const startIdx = Math.max(0, this.lastDispatchedCursorFrame + 1, idx - 8);
      let incidents: ReplayDispatchIncidentItem[] = [];
      let signals: ReplayDispatchSignalItem[] = [];
      const audioEvents: ReplayDispatchAudioCueItem[] = [];

      if (source.incidentTimeline) {
        incidents = source.incidentTimeline.getEventsInFrameRange(startIdx, idx);
      } else {
        for (let f = startIdx; f <= idx; f++) {
          const fSlot = source.frameSlots?.[f] || source.frames?.[f];
          if (Array.isArray(fSlot?.incidents) && fSlot.incidents.length > 0) {
            incidents.push(...(fSlot.incidents as ReplayDispatchIncidentItem[]));
          }
        }
      }

      if (source.signalTimeline) {
        signals = source.signalTimeline.getEventsInFrameRange(startIdx, idx);
      } else {
        for (let f = startIdx; f <= idx; f++) {
          const fSlot = source.frameSlots?.[f] || source.frames?.[f];
          if (Array.isArray(fSlot?.signals) && fSlot.signals.length > 0) {
            signals.push(...(fSlot.signals as ReplayDispatchSignalItem[]));
          }
          if (Array.isArray(fSlot?.audioEvents) && fSlot.audioEvents.length > 0) {
            audioEvents.push(...(fSlot.audioEvents as ReplayDispatchAudioCueItem[]));
          }
        }
      }

      if (incidents.length > 0 || signals.length > 0 || audioEvents.length > 0) {
        dispatchReplayFrameEvents(
          {
            incidents,
            signals,
            audioEvents,
            syncHudFromSignals: true,
          },
          r
        );
      }
    }
    this.syncScoreboardAndClockAtFrame(
      source.signalTimeline,
      source.metadata,
      source.rosterSubController.activePovTeam,
      idx
    );
    this.lastDispatchedCursorFrame = idx;
  }
}
