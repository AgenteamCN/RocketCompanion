/**
 * ReplayTakeoverSubController.ts
 * Stateful SubController for 3-2-1-GO pre-roll countdown, fractional scrub stepping,
 * intervention tick tracking, and unified live Freeplay takeover handoff.
 *
 * Shared by StandaloneReplayViewerController and FreeplayRewinderController.
 */

import {
  SIM_OFFSETS,
  INCIDENT_EVENT_TYPES,
  SYSTEM_CONTROL_SIGNALS,
} from '../physics/RocketSimConstants.ts';
import { reconstructAndRestoreReplayFrame } from '../physics/CarTransientStateReconstructor.ts';
import { gameAudio } from '../audio/GameAudioEngineFacade.ts';
import type { NormalizedReplayFrameSlot } from './ReplayCausalHybridEngine.ts';

export interface ReplayTakeoverAudioPort {
  play?: (soundId: string, volume?: number, cooldownMs?: number) => void;
}

export interface ReplayTakeoverRuntimePort {
  ballTrajectoryPredictor?: {
    clear?: () => void;
    reset?: () => void;
    notifyBallStateReset?: () => void;
    resetAnomalyCapture?: () => void;
    anomalyRecorder?: { clear?: () => void } | null;
  } | null;
  physics?: {
    state: Float32Array;
    getHeaderView?: () => { tick?: number; tickCount?: number; numCars?: number } | null;
    getBallStateView?: () => { velX?: number; velY?: number; velZ?: number } | null;
    saveCompactState?: () => Float32Array | null;
    clearEvents?: () => void;
    resetGoalLatch?: () => void;
  } | null;
  interpolator?: { prevState: Float32Array; currState: Float32Array; alpha: number } | null;
  simulationStage?: { resetActionStates?: () => void } | null;
  authoritativeServer?: {
    sim?: { restoreState?: (snap: Float32Array) => void | Promise<void> } | null;
    enterStateOnlyMode?: (snap: Float32Array | number[] | null, param1: number) => void;
    beginInterveneCountdown?: (seconds: number, snap: Float32Array | number[] | null) => void;
    resumePhysicsFromState?: (snap: Float32Array | number[] | null, param1: number) => void;
  } | null;
  networkReconciler?: {
    replayPlaybackMode?: boolean;
    syncTimeline?: (
      snap: Float32Array | number[] | null,
      tick: number,
      timestampMs?: number
    ) => void;
  } | null;
  lastSystemControlSignal?: number;
  systemControlSignalHistory?: Array<{
    signalType: number;
    tick: number;
    param1: number;
    param2: number;
  }>;
  _clientGoalIncidentLatched?: boolean;
}

export interface ReplayTakeoverFreeplayModePort {
  goalAndTouch?: {
    goalIncidentTick?: number;
    goalResetTicks?: number;
    frozenGoalBallState?: unknown;
    prevBallVelX?: number;
    prevBallVelY?: number;
    prevBallVelZ?: number;
    lastKickoffStartTick?: number;
    lastTouchTick?: number;
  } | null;
  replayRingBuffer?: {
    capacityTicks?: number;
    getRecentFrames?: () => Array<Float32Array | Record<string, unknown> | null>;
    clear?: () => void;
    recordFrame?: (
      tick: number,
      snap: Float32Array,
      options?: {
        acknowledgedControls?: ReadonlyArray<Record<string, unknown> | null | undefined> | null;
      }
    ) => { snapshot?: Float32Array | null } | null;
    appendIncident?: (tick: number, incident: Record<string, unknown>) => void;
  } | null;
}

export interface PrerollWindowBounds {
  minRequiredFrames: number;
  targetIdx: number;
  startIdx: number;
  remFrames: number;
  remSec: number;
  effectiveDownSec: number;
}

export interface ReplayHandoffHistorySlot extends NormalizedReplayFrameSlot {
  incidents?: Array<{ type?: number; [key: string]: unknown }>;
  hadTouch?: boolean;
}

export interface LiveFreeplayHandoffParams {
  runtime: ReplayTakeoverRuntimePort | null | undefined;
  freeplayMode: ReplayTakeoverFreeplayModePort | null | undefined;
  targetIdx: number;
  fallbackLastTouchTick?: 'baseTick' | 'minusOne';
  getHistorySlotAt(frameIndex: number): ReplayHandoffHistorySlot | null;
  beforeReconstruct?(liveTick: number): void;
  afterReconstruct?(liveTick: number): void;
}

export interface TakeoverPrerollStepInput {
  totalFrames: number;
  downCounterSec: number;
  displayedRemainingSec: number;
  audio?: ReplayTakeoverAudioPort | null;
}

export interface TakeoverPrerollStepOutcome {
  appliedCursor: number;
  handoffTargetIdx: number | null;
  telemetryUpdate: { cursorFrame: number; remainingSec: number } | null;
}

export interface TakeoverScrubStepInput {
  direction: 'rewinding' | 'forwarding';
  totalFrames: number;
  effectiveFlowPct: number;
  throttleUiSync?: boolean;
}

export interface TakeoverScrubStepOutcome {
  appliedCursor: number | null;
  isForwarding: boolean;
  telemetryCursor: number | null;
}

export interface TakeoverPlayStepInput {
  totalFrames: number;
  effectiveFlowPct: number;
}

export interface TakeoverPlayStepOutcome {
  appliedCursor: number;
  finishedAtFrame: number | null;
  telemetryCursor: number | null;
}

export function emitSystemControlTransition(
  controlPort: ReplayTakeoverRuntimePort | null | undefined,
  signalType: number,
  param1 = 0,
  param2 = 0,
  stateSnapshot?: Float32Array | number[] | null
): void {
  if (!controlPort) return;
  const tick = Math.floor(controlPort.physics?.getHeaderView?.()?.tickCount ?? 0);
  controlPort.lastSystemControlSignal = signalType;
  const hist = (controlPort.systemControlSignalHistory ??= []);
  hist.push({ signalType, tick, param1, param2 });
  if (hist.length > 64) hist.shift();

  const server = controlPort.authoritativeServer;
  if (!server) return;
  const snap = stateSnapshot ?? controlPort.physics?.saveCompactState?.() ?? null;
  if (signalType === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY) {
    server.enterStateOnlyMode?.(snap, param1);
  } else if (signalType === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME) {
    server.beginInterveneCountdown?.(param2 > 0 ? param2 : 3, snap);
  } else if (signalType === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME) {
    server.resumePhysicsFromState?.(snap, param1);
    if (snap) controlPort.networkReconciler?.syncTimeline?.(snap, param1);
  }
}

export function computePrerollWindowBounds(
  totalFrames: number,
  baseCursor: number,
  downCounterSec: number
): PrerollWindowBounds {
  const downSec = Number(downCounterSec) || 0;
  const minRequiredFrames = downSec === 0 ? 120 : 240;
  const targetIdx = Math.max(
    minRequiredFrames - 1,
    Math.min(totalFrames - 1, Math.round(baseCursor))
  );
  const startIdx = Math.max(0, targetIdx - (downSec === 0 ? 1 : downSec + 1) * 120);
  const remFrames = Math.max(0, targetIdx - startIdx);
  return {
    minRequiredFrames,
    targetIdx,
    startIdx,
    remFrames,
    remSec: Math.max(1, Math.ceil(remFrames / 120)),
    effectiveDownSec: Math.max(1, downSec),
  };
}

export function executeLiveFreeplayHandoff(params: LiveFreeplayHandoffParams): number {
  const {
    runtime: r,
    freeplayMode,
    targetIdx,
    fallbackLastTouchTick = 'baseTick',
    getHistorySlotAt,
  } = params;
  const sim = r?.physics;
  if (!sim || !r) return 0;

  const maxHistory = Math.min(targetIdx + 1, freeplayMode?.replayRingBuffer?.capacityTicks || 3600);
  const firstIdx = Math.max(0, targetIdx + 1 - maxHistory);
  const historySpan = Math.max(0, targetIdx - firstIdx);
  const liveTick = Math.max(
    Math.floor(sim.getHeaderView?.()?.tickCount ?? 0) + 16,
    historySpan + 16
  );

  params.beforeReconstruct?.(liveTick);
  reconstructAndRestoreReplayFrame(sim, (f: number) => getHistorySlotAt(f), targetIdx, {
    overrideTick: liveTick,
  });

  if (r.interpolator) {
    r.interpolator.prevState.set(sim.state);
    r.interpolator.currState.set(sim.state);
    r.interpolator.alpha = 0;
  }

  sim.clearEvents?.();
  sim.resetGoalLatch?.();
  r._clientGoalIncidentLatched = false;
  r.simulationStage?.resetActionStates?.();
  r.ballTrajectoryPredictor?.clear?.();
  r.ballTrajectoryPredictor?.notifyBallStateReset?.();
  r.ballTrajectoryPredictor?.resetAnomalyCapture?.();

  params.afterReconstruct?.(liveTick);

  const resumedSnap = sim.saveCompactState?.() ?? null;
  emitSystemControlTransition(
    r,
    SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME,
    liveTick,
    1,
    resumedSnap
  );
  if (r.networkReconciler) {
    r.networkReconciler.replayPlaybackMode = false;
    if (resumedSnap) r.networkReconciler.syncTimeline?.(resumedSnap, liveTick, performance.now());
  }

  if (freeplayMode) {
    const currentTick = Math.floor(sim.getHeaderView?.()?.tickCount ?? liveTick);
    const bView = sim.getBallStateView?.();
    const goalAndTouch = freeplayMode.goalAndTouch;
    if (goalAndTouch) {
      Object.assign(goalAndTouch, {
        goalIncidentTick: -1,
        goalResetTicks: 0,
        frozenGoalBallState: null,
        prevBallVelX: bView?.velX ?? 0,
        prevBallVelY: bView?.velY ?? 0,
        prevBallVelZ: bView?.velZ ?? 0,
      });
    }

    const ringBuf = freeplayMode.replayRingBuffer;
    if (ringBuf) {
      ringBuf.clear?.();
      const baseTick = currentTick - historySpan;
      let latestTouchTick = -1;

      for (let i = firstIdx; i <= targetIdx; i++) {
        const slot = getHistorySlotAt(i);
        if (!slot?.snapshot) continue;
        const syntheticTick = baseTick + (i - firstIdx);
        const rec = ringBuf.recordFrame?.(syntheticTick, slot.snapshot, {
          acknowledgedControls: slot.controls || [],
        });
        if (rec?.snapshot) rec.snapshot[SIM_OFFSETS.TICK] = syntheticTick;
        for (const inc of slot.incidents || []) {
          ringBuf.appendIncident?.(syntheticTick, { ...inc, tick: syntheticTick });
          if (inc.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT || inc.type === 0x01)
            latestTouchTick = syntheticTick;
        }
        if (slot.hadTouch) latestTouchTick = syntheticTick;
      }

      if (goalAndTouch) {
        Object.assign(goalAndTouch, {
          lastKickoffStartTick: baseTick,
          lastTouchTick:
            latestTouchTick >= 0
              ? latestTouchTick
              : fallbackLastTouchTick === 'baseTick'
                ? baseTick
                : -1,
        });
      }
    }
  }

  return liveTick;
}

export class ReplayTakeoverSubController {
  public cursor = 0;
  public targetFrame = 0;
  public scrubAccumulator = 0;
  public lastCountdownSecBeep = -1;
  public interveneStartFrame = 0;
  public interveneElapsedTicks = 0;
  public uiSyncTick = 0;

  reset(initialCursor = 0, initialTargetFrame = 0): void {
    this.cursor = initialCursor;
    this.targetFrame = initialTargetFrame;
    this.scrubAccumulator = 0;
    this.lastCountdownSecBeep = -1;
    this.interveneStartFrame = 0;
    this.interveneElapsedTicks = 0;
    this.uiSyncTick = 0;
  }

  seekToFrame(frameIndex: number, totalFrames: number): number {
    const clamped = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(frameIndex)));
    this.cursor = clamped;
    this.targetFrame = clamped;
    this.scrubAccumulator = 0;
    this.lastCountdownSecBeep = -1;
    return clamped;
  }

  beginScrub(
    direction: 'rewinding' | 'forwarding',
    totalFrames: number,
    effectiveFlowPct: number,
    baseCursor = this.cursor
  ): number {
    const step = Math.max(1, Math.round((effectiveFlowPct || 100) / 100));
    const cur = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(baseCursor)));
    return this.seekToFrame(direction === 'rewinding' ? cur - step : cur + step, totalFrames);
  }

  beginPrerollCountdown(
    totalFrames: number,
    baseCursor: number,
    downCounterSec: number,
    audio: ReplayTakeoverAudioPort | null = gameAudio
  ): PrerollWindowBounds {
    const bounds = computePrerollWindowBounds(totalFrames, baseCursor, downCounterSec);
    this.reset(bounds.startIdx, bounds.targetIdx);
    if (bounds.remSec <= bounds.effectiveDownSec) {
      this.lastCountdownSecBeep = bounds.remSec;
      audio?.play?.('training_countdown', 1.0, 200);
    }
    return bounds;
  }

  beginIntervention(targetIdx: number): void {
    this.cursor = targetIdx;
    this.interveneStartFrame = targetIdx;
    this.interveneElapsedTicks = 0;
  }

  consumeInterventionReplayFrameIndex(): number {
    return this.interveneStartFrame + this.interveneElapsedTicks++;
  }

  stepPrerollCountdown(input: TakeoverPrerollStepInput): TakeoverPrerollStepOutcome {
    const { totalFrames, downCounterSec, displayedRemainingSec, audio = gameAudio } = input;
    const targetIdx = Math.max(0, Math.min(totalFrames - 1, Math.round(this.targetFrame)));
    const nextCursor = Math.min(targetIdx, Math.round(this.cursor) + 1);
    this.cursor = nextCursor;

    const remFrames = Math.max(0, targetIdx - nextCursor);
    if (remFrames <= 0) {
      this.lastCountdownSecBeep = -1;
      audio?.play?.('match_start_go', 1.0, 200);
      return {
        appliedCursor: nextCursor,
        handoffTargetIdx: targetIdx,
        telemetryUpdate: null,
      };
    }

    const countdownSec = Math.max(1, Math.ceil(remFrames / 120));
    if (
      countdownSec <= Math.max(1, downCounterSec ?? 0) &&
      countdownSec !== this.lastCountdownSecBeep
    ) {
      this.lastCountdownSecBeep = countdownSec;
      audio?.play?.('training_countdown', 1.0, 200);
    }

    const shouldSyncTelemetry =
      remFrames % 6 === 0 || remFrames % 120 === 0 || countdownSec !== displayedRemainingSec;
    return {
      appliedCursor: nextCursor,
      handoffTargetIdx: null,
      telemetryUpdate: shouldSyncTelemetry
        ? { cursorFrame: nextCursor, remainingSec: countdownSec }
        : null,
    };
  }

  stepScrub(input: TakeoverScrubStepInput): TakeoverScrubStepOutcome {
    const { direction, totalFrames, effectiveFlowPct, throttleUiSync = false } = input;
    const isForwarding = direction === 'forwarding';
    const stepPerTick = (effectiveFlowPct || 100) / 100;
    this.scrubAccumulator += direction === 'rewinding' ? -stepPerTick : stepPerTick;
    const wholeSteps = Math.trunc(this.scrubAccumulator);
    if (wholeSteps === 0) {
      return {
        appliedCursor: null,
        isForwarding,
        telemetryCursor: null,
      };
    }

    this.scrubAccumulator -= wholeSteps;
    const nextIdx = Math.max(
      0,
      Math.min(Math.max(0, totalFrames - 1), Math.round(this.cursor) + wholeSteps)
    );
    this.cursor = nextIdx;
    this.targetFrame = nextIdx;

    const shouldSyncTelemetry =
      !throttleUiSync ||
      (this.uiSyncTick = (this.uiSyncTick + 1) & 3) === 0 ||
      Math.abs(wholeSteps) === 1;
    return {
      appliedCursor: nextIdx,
      isForwarding,
      telemetryCursor: shouldSyncTelemetry ? nextIdx : null,
    };
  }

  stepPlaying(input: TakeoverPlayStepInput): TakeoverPlayStepOutcome {
    const { totalFrames, effectiveFlowPct } = input;
    const maxIdx = Math.max(0, totalFrames - 1);
    this.cursor = Math.min(maxIdx, this.cursor + (effectiveFlowPct || 100) / 100);
    const rounded = Math.round(this.cursor);
    this.targetFrame = rounded;

    if (rounded >= maxIdx) {
      return {
        appliedCursor: rounded,
        finishedAtFrame: rounded,
        telemetryCursor: null,
      };
    }
    const shouldSyncTelemetry = (this.uiSyncTick = (this.uiSyncTick + 1) & 3) === 0;
    return {
      appliedCursor: rounded,
      finishedAtFrame: null,
      telemetryCursor: shouldSyncTelemetry ? rounded : null,
    };
  }
}
