import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import type {
  CarControlsInput,
  RestoreSnapshotOptions,
} from '../../../physics/RocketSimSnapshotSerializer.ts';
import type {
  DecodedIncidentEvent,
  DecodedSignalEvent,
  ReplaySnapshotFloat32Array,
} from '../../../replay/container/RCReplayBinarySchema.ts';
import type { ReplayAudioCue } from '../../../replay/ReplayRingBuffer.ts';
import { MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import type { ReplayRingBuffer, ReplaySignalEntry } from '../../../replay/ReplayRingBuffer.ts';
import type { LabPhysicsEnginePort } from './LabTabTypes.ts';

export type GoalReplayBenchScenario =
  | 'instant_kickoff_goal'
  | 'normal_play_goal'
  | 'trigger_goal_now'
  | 'emit_kickoff_signal'
  | 'start_replay_now'
  | 'stop_replay'
  | 'clear_replay_buffer'
  | 'export_replay_json'
  | string;

export interface GoalReplayStoreConfigSnapshot {
  goalReplayLookbackSec?: number;
  goalReplayPostGoalSec?: number;
  goalReplayLastKickoffFrameId?: number;
  goalReplayIncidentFrameId?: number;
  goalReplayRequestedStartFrameId?: number;
  goalReplayEffectiveStartFrameId?: number;
  goalReplayEffectiveEndFrameId?: number;
  goalReplayClampedByKickoff?: boolean;
}

export interface ReplayExportPayload {
  schema: string;
  exportedAt: string;
  tickRate: number;
  ringBufferFramesRecorded: number;
  wasmReplayBufferFramesRecorded: number;
  goalReplayConfig: {
    lookbackSeconds: number;
    postGoalSeconds: number;
    lastKickoffWillStartFrameId: number;
    lastGoalIncidentFrameId: number;
    requestedStartFrameId: number;
    effectiveStartFrameId: number;
    effectiveEndFrameId: number;
    clampedByKickoff: boolean;
  };
  signals: ReplaySignalEntry[];
  frames: Array<{
    tick: number;
    ballPos: [number, number, number];
    car0Pos: [number, number, number];
  }>;
}

export function buildMatchReplayExportPayload(
  ringBuffer: ReplayRingBuffer | null | undefined,
  wasmFramesCount: number,
  storeState: GoalReplayStoreConfigSnapshot,
  exportedAtIso = new Date().toISOString()
): ReplayExportPayload {
  const framesCount = ringBuffer?.size || 0;
  const sampleFrames: Array<{
    tick: number;
    ballPos: [number, number, number];
    car0Pos: [number, number, number];
  }> = [];
  const collectedSignals: ReplaySignalEntry[] = [];

  if (ringBuffer && framesCount > 0) {
    const allFrames = ringBuffer.getRecentFrames(Math.min(framesCount, 1800));
    for (let i = 0; i < allFrames.length; i++) {
      const f = allFrames[i];
      if (!f) continue;
      if (Array.isArray(f.signals) && f.signals.length > 0) {
        for (const s of f.signals) {
          collectedSignals.push(s);
        }
      }
      const snap = f.snapshot;
      sampleFrames.push({
        tick: f.tick,
        ballPos: snap
          ? [
              Number((snap[4] || 0).toFixed(2)),
              Number((snap[5] || 0).toFixed(2)),
              Number((snap[6] || 0).toFixed(2)),
            ]
          : [0, 0, 0],
        car0Pos: snap
          ? [
              Number((snap[22] || 0).toFixed(2)),
              Number((snap[23] || 0).toFixed(2)),
              Number((snap[24] || 0).toFixed(2)),
            ]
          : [0, 0, 0],
      });
    }
  }

  return {
    schema: 'RLCleanWASM.MatchReplayExport.v1',
    exportedAt: exportedAtIso,
    tickRate: 120,
    ringBufferFramesRecorded: framesCount,
    wasmReplayBufferFramesRecorded: wasmFramesCount,
    goalReplayConfig: {
      lookbackSeconds: storeState.goalReplayLookbackSec ?? 10,
      postGoalSeconds: storeState.goalReplayPostGoalSec ?? 3,
      lastKickoffWillStartFrameId: storeState.goalReplayLastKickoffFrameId ?? 0,
      lastGoalIncidentFrameId: storeState.goalReplayIncidentFrameId ?? 0,
      requestedStartFrameId: storeState.goalReplayRequestedStartFrameId ?? 0,
      effectiveStartFrameId: storeState.goalReplayEffectiveStartFrameId ?? 0,
      effectiveEndFrameId: storeState.goalReplayEffectiveEndFrameId ?? 0,
      clampedByKickoff: Boolean(storeState.goalReplayClampedByKickoff),
    },
    signals: collectedSignals,
    frames: sampleFrames,
  };
}

export function applyInstantKickoffGoalScenario(
  physics: LabPhysicsEnginePort,
  ringBuffer: ReplayRingBuffer | null | undefined
): number {
  physics.resetGoalLatch?.();
  physics.resetKickoff(0, false);
  const currentTick = Math.floor(physics.getHeaderView?.()?.tickCount || 0);
  ringBuffer?.recordFrame(currentTick, physics.state, [
    {
      signalType: MATCH_SIGNALS.KICKOFF_WILL_START,
      frameId: currentTick,
      param1: 0,
      param2: 0,
    },
  ]);
  physics.setCarState(0, {
    pos: [0, 4200, 17.05],
    vel: [0, 1800, 0],
    angVel: [0, 0, 0],
    rot: [0, Math.PI / 2, 0],
    boost: 100,
  });
  if (physics.numCars > 1) {
    physics.setCarState(1, {
      pos: [1600, 3200, 17.05],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      rot: [0, -Math.PI / 2, 0],
      boost: 100,
    });
  }
  physics.setBallState({
    pos: [0, 4550, 110],
    vel: [0, 2100, 40],
    angVel: [0, 0, 0],
  });
  return currentTick;
}

export function applyNormalPlayGoalScenario(
  physics: LabPhysicsEnginePort,
  ringBuffer: ReplayRingBuffer | null | undefined,
  lastKickoffFrame: number
): void {
  physics.resetGoalLatch?.();
  const startTick = Math.floor(physics.getHeaderView?.()?.tickCount || 0);
  const elapsedSinceKickoff = startTick - (lastKickoffFrame || 0);
  const neededTicks = Math.max(0, 720 - elapsedSinceKickoff);
  if (neededTicks > 0) {
    physics.setBallState({
      pos: [0, 0, 93.15],
      vel: [0, 620, 120],
      angVel: [0, 0, 0],
    });
    physics.setCarState(0, {
      pos: [0, -1800, 17.05],
      vel: [0, 950, 0],
      angVel: [0, 0, 0],
      rot: [0, Math.PI / 2, 0],
      boost: 100,
    });
    for (let i = 0; i < neededTicks; i++) {
      physics.setControls(0, {
        throttle: 1.0,
        steer: Math.sin(i * 0.03) * 0.15,
        pitch: 0,
        yaw: 0,
        roll: 0,
        jump: false,
        boost: i % 3 === 0,
        handbrake: false,
      });
      physics.step(1);
      const t = Math.floor(physics.getHeaderView?.()?.tickCount || 0);
      ringBuffer?.recordFrame(t, physics.state);
      physics.recordReplayFrame?.();
    }
  }
  physics.setCarState(0, {
    pos: [0, 4100, 17.05],
    vel: [0, 1600, 0],
    angVel: [0, 0, 0],
    rot: [0, Math.PI / 2, 0],
    boost: 100,
  });
  physics.setBallState({
    pos: [0, 4550, 120],
    vel: [0, 2100, 30],
    angVel: [0, 0, 0],
  });
}

export interface RewinderFrameEntry {
  [key: string]: unknown;
  compactSnap: Float32Array;
  renderState: Float32Array;
  arenaSnap?: Float32Array;
  controls: CarControlsInput;
  acknowledgedControls?: CarControlsInput[];
  incidents?: DecodedIncidentEvent[];
  signals?: DecodedSignalEvent[];
  audioEvents?: ReplayAudioCue[];
}

export interface PrerollCalculationOutput {
  startIdx: number;
  targetIdx: number;
  remFrames: number;
  remSec: number;
}

export function computeRewinderPrerollWindow(
  totalFrames: number,
  rawCursor: number,
  rawTargetFrame: number,
  downCounterSec: number,
  currentRewinderState: string
): PrerollCalculationOutput {
  const minRequiredFrames = downCounterSec === 0 ? 120 : 240;
  const lastFrame = Math.max(0, totalFrames - 1);
  const effectiveCursor = currentRewinderState === 'recording' ? lastFrame : rawCursor;
  const effectiveTarget = currentRewinderState === 'recording' ? lastFrame : rawTargetFrame;
  const baseTarget =
    currentRewinderState === 'preroll-countdown' || currentRewinderState === 'stopped'
      ? effectiveTarget || effectiveCursor
      : effectiveCursor;
  const targetIdx = Math.max(minRequiredFrames - 1, Math.min(lastFrame, Math.round(baseTarget)));
  const lookbackFrames = (downCounterSec === 0 ? 1 : downCounterSec + 1) * 120;
  const startIdx = Math.max(0, targetIdx - lookbackFrames);
  const remFrames = Math.max(0, targetIdx - startIdx);
  const remSec = Math.ceil(remFrames / 120);
  return { startIdx, targetIdx, remFrames, remSec };
}

export function mapParsedReplayToRewinderFrames(
  parsed: {
    frames: ReplaySnapshotFloat32Array[];
    frameSlots?: Array<{
      acknowledgedControls?: CarControlsInput[];
      incidents?: DecodedIncidentEvent[];
      signals?: DecodedSignalEvent[];
      audioEvents?: ReplayAudioCue[];
    } | null>;
  },
  fallbackControls?: CarControlsInput | null
): RewinderFrameEntry[] {
  return parsed.frames.map((snap: ReplaySnapshotFloat32Array, idx: number): RewinderFrameEntry => {
    const slot = parsed.frameSlots?.[idx] || null;
    const car0Ctrl: CarControlsInput =
      slot?.acknowledgedControls?.[0] ||
      snap?.controls?.[0] ||
      fallbackControls ||
      DEFAULT_CAR_CONTROLS;
    return {
      compactSnap: snap,
      renderState: snap,
      controls: { ...car0Ctrl },
      acknowledgedControls: slot?.acknowledgedControls || snap?.controls || [{ ...car0Ctrl }],
      incidents: slot?.incidents || snap?.incidents || [],
      signals: slot?.signals || snap?.signals || [],
      audioEvents: slot?.audioEvents || snap?.audioEvents || [],
    };
  });
}

export function restoreRewinderFrameToPhysicsAndInterpolator(
  physics:
    | {
        state: Float32Array;
        restoreState: (snap: Float32Array, opts?: RestoreSnapshotOptions) => void;
      }
    | null
    | undefined,
  interpolator:
    { prevState: Float32Array; currState: Float32Array; alpha: number } | null | undefined,
  frames: RewinderFrameEntry[],
  cursor: number,
  smoothStep = false,
  restoreOptions: RestoreSnapshotOptions = { preserveEngineTick: true }
): void {
  if (!physics || frames.length === 0) return;
  const idx = Math.max(0, Math.min(frames.length - 1, Math.floor(cursor)));
  const entry = frames[idx];
  if (!entry) return;
  if (smoothStep && interpolator) {
    interpolator.prevState.set(interpolator.currState);
  }
  const compactSnap = entry.compactSnap || entry.renderState || entry.arenaSnap;
  if (compactSnap) {
    physics.restoreState(compactSnap, restoreOptions);
  }
  if (interpolator) {
    if (!smoothStep) {
      interpolator.prevState.set(physics.state);
      interpolator.alpha = 0;
    }
    interpolator.currState.set(physics.state);
  }
}

export function isGoalBallScoredInLab(
  sim: { isBallScored?: (b: unknown) => boolean },
  bView: { posX: number; posY: number; posZ: number }
): boolean {
  if (typeof sim.isBallScored === 'function') return sim.isBallScored(bView);
  return (
    Math.abs(bView.posY) > 5120 + 91.25 && Math.abs(bView.posX) < 892.755 && bView.posZ < 642.775
  );
}
