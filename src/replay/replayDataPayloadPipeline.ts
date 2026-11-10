/**
 * replayDataPayloadPipeline.ts
 * Pure narrow-input pipeline for cloning retained match replay frames and metadata,
 * materializing parsed RCReplay payloads into Freeplay Rewinder frame entries,
 * and applying/recording rewinder physics frame snapshots.
 */

import { SIM_OFFSETS, MAX_CARS, INCIDENT_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import { DEFAULT_CAR_CONTROLS } from '../ai/experimental/experimentalMultiCarObsPipeline.ts';

export type ReplayAnnotatedFloat32Frame = Float32Array & {
  tick?: number;
  controls?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  signals?: Array<Record<string, unknown>>;
  audioEvents?: Array<Record<string, unknown>>;
};

export interface RewinderCarControlsRecord {
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
  controls?: RewinderCarControlsRecord;
  [key: string]: unknown;
}

export interface RewinderIncidentRecord {
  type?: number;
  tick?: number;
  [key: string]: unknown;
}

export interface RewinderFrameEntry {
  [key: string]: unknown;
  compactSnap: Float32Array;
  renderState: Float32Array;
  controls: RewinderCarControlsRecord;
  acknowledgedControls?: Array<
    { carIndex?: number; controls?: RewinderCarControlsRecord } & RewinderCarControlsRecord
  >;
  incidents: RewinderIncidentRecord[];
  signals?: Array<Record<string, unknown>>;
  audioEvents?: Array<Record<string, unknown>>;
  hadTouch: boolean;
  lastTouchTick: number;
}

export interface ClonedRetainedReplayPayload {
  frames: ReplayAnnotatedFloat32Frame[];
  frameSlots: Array<Record<string, unknown>>;
  timelines: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  loadedFileName: string;
}

export interface RetainedMatchReplayInput {
  frames: ReplayAnnotatedFloat32Frame[];
  frameSlots?: Array<Record<string, unknown>>;
  timelines?: Record<string, unknown> | null;
  metadata?: {
    roster?: unknown;
    loadouts?: unknown;
    [key: string]: unknown;
  } | null;
  mode?: string;
  arenaPreset?: number;
  durationSeconds?: number;
  winner?: string;
  blueScore?: number;
  orangeScore?: number;
  winReason?: number;
  roster?: unknown;
  loadouts?: unknown;
  [key: string]: unknown;
}

export interface ParsedReplayTimelineInput {
  frames: ReplayAnnotatedFloat32Frame[];
  frameSlots?: Array<{
    acknowledgedControls?: RewinderFrameEntry['acknowledgedControls'];
    controls?: RewinderFrameEntry['acknowledgedControls'];
    incidents?: RewinderIncidentRecord[];
    signals?: Array<Record<string, unknown>>;
    audioEvents?: Array<Record<string, unknown>>;
  }>;
  timelines?: {
    stateInputTimeline?: {
      getFrameAt?: (idx: number) => {
        acknowledgedControls?: RewinderFrameEntry['acknowledgedControls'];
        controls?: RewinderFrameEntry['acknowledgedControls'];
        incidents?: RewinderIncidentRecord[];
        signals?: Array<Record<string, unknown>>;
        audioEvents?: Array<Record<string, unknown>>;
      } | null;
    } | null;
    incidentTimeline?: {
      getEventsAtFrame?: (idx: number) => RewinderIncidentRecord[] | null;
    } | null;
    signalTimeline?: {
      getEventsAtFrame?: (idx: number) => Array<Record<string, unknown>> | null;
    } | null;
  } | null;
  [key: string]: unknown;
}

export interface RewinderPhysicsPort {
  numCars: number;
  state: Float32Array;
  removeCar?: (carIndex: number) => void;
  addCar?: (team: number, preset: string) => void;
  restoreState: (
    state: Float32Array,
    options?: { preserveEngineTick?: boolean; overrideTick?: number }
  ) => void;
  setUnlimitedBoost?: (enabled: boolean) => void;
  resetKickoff?: () => void;
  setControls?: (carIndex: number, controls: Record<string, unknown>) => void;
  clearEvents?: () => void;
  resetGoalLatch?: () => void;
  clearReplayBuffer?: () => void;
  saveCompactState?: () => Float32Array;
  getHeaderView?: () => { tick?: number; tickCount?: number; numCars: number };
  recordReplayFrame?: (controls?: unknown) => void;
  setCarHitbox?: (carIndex: number, hitboxId: string) => void;
}

export interface RewinderInterpolatorPort {
  prevState: Float32Array;
  currState: Float32Array;
  alpha: number;
  sync?: () => void;
}

export interface RewinderArenaPort {
  syncCarsCount?: (count: number) => void;
  resetBallTrail?: () => void;
  setCarLoadout?: (carIndex: number, loadout: Record<string, unknown>) => void;
}

export interface ApplyRewinderFrameInput {
  physics: RewinderPhysicsPort | null | undefined;
  interpolator: RewinderInterpolatorPort | null | undefined;
  arena: RewinderArenaPort | null | undefined;
  rewinderFrames: ReadonlyArray<RewinderFrameEntry>;
  rewinderCursor: number;
  smoothStep: boolean;
  restoreOptions: { preserveEngineTick?: boolean; overrideTick?: number };
}

export interface RewinderResetRuntimePort {
  physics?: RewinderPhysicsPort | null;
  interpolator?: RewinderInterpolatorPort | null;
  arena?: RewinderArenaPort | null;
  camera?: { resetView?: () => void } | null;
  trainingOptions?: { boostOption?: string } | null;
  match?: { state?: { mode?: string; phase?: string } } | null;
}

export interface RewinderResetModePort {
  standaloneReplayViewer?: { hasLoadedReplay?: boolean } | null;
  nameTagTunerController?: { isActive?: boolean } | null;
}

export type RewinderRuntimePort = RewinderResetRuntimePort;
export type RewinderModePort = RewinderResetModePort;

export function cloneRetainedMatchReplayPayload(
  retained: RetainedMatchReplayInput
): ClonedRetainedReplayPayload {
  const frames: ReplayAnnotatedFloat32Frame[] = retained.frames.map(
    (f: ReplayAnnotatedFloat32Frame) => {
      const out: ReplayAnnotatedFloat32Frame = new Float32Array(f);
      Object.assign(out, {
        ...(f.tick !== undefined ? { tick: f.tick } : {}),
        ...(f.controls !== undefined ? { controls: f.controls } : {}),
        ...(f.incidents !== undefined ? { incidents: f.incidents } : {}),
        ...(f.signals !== undefined ? { signals: f.signals } : {}),
        ...(f.audioEvents !== undefined ? { audioEvents: f.audioEvents } : {}),
      });
      return out;
    }
  );
  const frameSlots = Array.isArray(retained.frameSlots) ? retained.frameSlots : [];
  const metadata: Record<string, unknown> = {
    ...(retained.metadata && typeof retained.metadata === 'object' ? retained.metadata : {}),
    mode: retained.mode,
    arenaPreset: retained.arenaPreset,
    durationSeconds: retained.durationSeconds,
    winner: retained.winner,
    blueScore: retained.blueScore,
    orangeScore: retained.orangeScore,
    winReason: retained.winReason,
    roster: retained.roster || retained.metadata?.roster || null,
    loadouts: retained.loadouts || retained.metadata?.loadouts || null,
  };
  return {
    frames,
    frameSlots,
    timelines: retained.timelines || null,
    metadata,
    loadedFileName: `Last Match (${retained.blueScore}–${retained.orangeScore})`,
  };
}

export function buildRewinderFramesFromParsedReplay(
  parsed: ParsedReplayTimelineInput,
  neutralControls: RewinderCarControlsRecord | null | undefined
): RewinderFrameEntry[] {
  const stateInputTimeline = parsed.timelines?.stateInputTimeline || null;
  const incidentTimeline = parsed.timelines?.incidentTimeline || null;
  const signalTimeline = parsed.timelines?.signalTimeline || null;
  const fallbackCtrl = neutralControls || DEFAULT_CAR_CONTROLS;

  return parsed.frames.map((snap: ReplayAnnotatedFloat32Frame, idx: number) => {
    const slot = stateInputTimeline?.getFrameAt?.(idx) || parsed.frameSlots?.[idx] || null;
    const ackControls = slot?.acknowledgedControls || slot?.controls || snap?.controls || [];
    const car0Ctrl = ackControls[0]?.controls || ackControls[0] || fallbackCtrl;
    const frameIncidents =
      incidentTimeline?.getEventsAtFrame?.(idx) || slot?.incidents || snap?.incidents || [];
    const frameSignals =
      signalTimeline?.getEventsAtFrame?.(idx) || slot?.signals || snap?.signals || [];
    const frameAudioEvents = slot?.audioEvents || snap?.audioEvents || [];
    const hadTouch = frameIncidents.some(
      (inc: RewinderIncidentRecord) =>
        inc?.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT || inc?.type === 0x01
    );
    return {
      compactSnap: snap,
      renderState: snap,
      controls: { ...car0Ctrl },
      acknowledgedControls: ackControls,
      incidents: frameIncidents,
      signals: frameSignals,
      audioEvents: frameAudioEvents,
      hadTouch,
      lastTouchTick: hadTouch ? Math.floor(snap[0] || idx) : -1,
    };
  });
}

export function applyRewinderFrameToPhysics({
  physics,
  interpolator,
  arena,
  rewinderFrames,
  rewinderCursor,
  smoothStep,
  restoreOptions,
}: ApplyRewinderFrameInput): RewinderFrameEntry | null {
  if (!physics || rewinderFrames.length === 0) return null;
  const idx = Math.max(0, Math.min(rewinderFrames.length - 1, Math.floor(rewinderCursor)));
  const entry = rewinderFrames[idx];
  if (!entry) return null;

  const compactSnap = entry.compactSnap || entry.renderState;
  if (!compactSnap) return null;

  const rawNum = Math.round(compactSnap[SIM_OFFSETS.NUM_CARS] || 1);
  const numCars = Math.max(1, Math.min(MAX_CARS, rawNum));
  while (physics.numCars > numCars && typeof physics.removeCar === 'function') {
    physics.removeCar(physics.numCars - 1);
  }
  while (physics.numCars < numCars && typeof physics.addCar === 'function') {
    const cIdx = physics.numCars;
    physics.addCar(cIdx % 2, 'octane');
  }
  arena?.syncCarsCount?.(numCars);

  if (smoothStep && interpolator) {
    interpolator.prevState.set(interpolator.currState);
  }
  physics.restoreState(compactSnap, restoreOptions);
  if (interpolator) {
    if (!smoothStep) {
      interpolator.prevState.set(physics.state);
      interpolator.alpha = 0;
    }
    interpolator.currState.set(physics.state);
  }
  return entry;
}

export function buildRewinderHistorySlotAt(
  rewinderFrames: ReadonlyArray<RewinderFrameEntry>,
  frameIdx: number,
  playerCarIndex: number
) {
  const clamped = Math.max(0, Math.min(rewinderFrames.length - 1, Math.floor(frameIdx)));
  const entry = rewinderFrames[clamped];
  const snapshot = entry?.compactSnap || entry?.renderState;
  if (!entry || !snapshot) return null;
  const controls = Array.isArray(entry.acknowledgedControls)
    ? entry.acknowledgedControls
    : entry.controls
      ? [{ carIndex: playerCarIndex, controls: { ...entry.controls } }]
      : [];
  return {
    snapshot,
    controls,
    incidents: Array.isArray(entry.incidents) ? entry.incidents : [],
    hadTouch: Boolean(entry.hadTouch),
  };
}

export function recordPhysicsEventIntoRewinderFrames(
  rewinderFrames: RewinderFrameEntry[],
  pendingFrameIncidents: RewinderIncidentRecord[],
  event: RewinderIncidentRecord,
  headerTickCount: number | undefined
): void {
  if (rewinderFrames.length > 0) {
    const latestFrame = rewinderFrames[rewinderFrames.length - 1];
    if (!Array.isArray(latestFrame.incidents)) latestFrame.incidents = [];
    latestFrame.incidents.push({ ...event });
    if (event.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT || event.type === 0x01) {
      Object.assign(latestFrame, {
        hadTouch: true,
        lastTouchTick: Math.floor(
          headerTickCount ?? event.tick ?? latestFrame.compactSnap?.[0] ?? 0
        ),
      });
    }
  } else {
    pendingFrameIncidents.push({ ...event });
  }
}

export function resetRewinderArenaCarsIfAllowed(
  runtime: RewinderResetRuntimePort | null,
  mode: RewinderResetModePort | null,
  wasBlocking: boolean
): boolean {
  const canResetArena =
    !mode?.standaloneReplayViewer?.hasLoadedReplay && !mode?.nameTagTunerController?.isActive;
  if (runtime?.physics && canResetArena) {
    while (runtime.physics.numCars > 1 && typeof runtime.physics.removeCar === 'function') {
      runtime.physics.removeCar(runtime.physics.numCars - 1);
    }
    runtime.arena?.syncCarsCount?.(1);
    if (wasBlocking) {
      runtime.physics.setUnlimitedBoost?.(runtime?.trainingOptions?.boostOption === 'unlimited');
      runtime.physics.resetKickoff?.();
      runtime.interpolator?.sync?.();
      runtime.arena?.resetBallTrail?.();
      runtime.camera?.resetView?.();
    }
  }
  return canResetArena;
}
