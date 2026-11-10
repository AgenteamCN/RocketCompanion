/**
 * RewinderHandoffAndMarkerController.ts
 * Stateful SubController for Freeplay Rewinder frame history recording, incident marker
 * capture, RCReplay file import/export, pre-roll countdown transitions, and live Free Play handoff.
 */

import { hudStore, useRewinderStore } from '../game/runtimeUiPort.ts';
import {
  parseRCReplayFile,
  exportStateReplayFile,
  MAX_REWINDER_FRAMES,
} from './ReplayFileExporter.ts';
import {
  executeLiveFreeplayHandoff,
  emitSystemControlTransition,
  type ReplayTakeoverSubController,
} from './ReplayTakeoverSubController.ts';
import { SYSTEM_CONTROL_SIGNALS } from '../physics/RocketSimConstants.ts';
import {
  buildRewinderFramesFromParsedReplay,
  applyRewinderFrameToPhysics,
  buildRewinderHistorySlotAt,
  recordPhysicsEventIntoRewinderFrames,
  resetRewinderArenaCarsIfAllowed,
  type RewinderFrameEntry,
  type RewinderIncidentRecord,
  type RewinderRuntimePort,
  type RewinderModePort,
} from './replayDataPayloadPipeline.ts';
import { DEFAULT_CAR_CONTROLS } from '../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { dispatchReplayFrameEvents } from './ReplayFrameEventDispatcher.ts';
import { gameAudio } from '../audio/GameAudioEngineFacade.ts';

export type { RewinderFrameEntry, RewinderIncidentRecord };

export interface FreeplayRewinderRuntimePort extends RewinderRuntimePort {
  isBotMatch?: boolean;
  botCoordinator?: { isBotMatch?: boolean } | null;
  audioSubsystem?: { resetAudio?: () => void } | null;
  options?: {
    gameAudio?: { silenceAll?: () => void; play?: (cue: string, volume?: number) => void } | null;
  } | null;
  releaseGoalReplayCameraOverride?: () => void;
  keyboard?: { ballControlEnabled?: boolean } | null;
  playerCarIndex?: number;
  playerControls?: Record<string, unknown>;
  playerThrottle?: number;
  neutralControls?: Record<string, unknown>;
  _clientGoalIncidentLatched?: boolean;
  simulationStage?: { resetActionStates?: () => void } | null;
  [key: string]: unknown;
}

export interface FreeplayRewinderModePort extends RewinderModePort {
  directorPreview?: { isReplayActive?: boolean } | null;
  isGoalReplayActive?: () => boolean;
  goalAndTouch?: {
    getEffectiveGoalResetTicks?: () => number;
    goalResetTicks?: number;
    frozenGoalBallState?: unknown;
    goalIncidentTick?: number;
    lastTouchTick?: number;
  } | null;
  replayController?: { endReplaySession?: () => void } | null;
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
  lastTouchTick?: number;
}

export class RewinderHandoffAndMarkerController {
  public frames: RewinderFrameEntry[] = [];
  public timelines: Record<string, unknown> | null = null;
  private _pendingFrameIncidents: RewinderIncidentRecord[] = [];

  public clearPendingIncidents(): void {
    this._pendingFrameIncidents.length = 0;
  }

  public clearAll(): void {
    this.frames = [];
    this.timelines = null;
    this._pendingFrameIncidents.length = 0;
  }

  public exitGoalOrReplayIfNeeded(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null
  ): void {
    if (!runtime || !mode) return;
    const { directorPreview, goalAndTouch, replayController } = mode;
    const matchState = runtime.match?.state ?? null;
    const isReplayActive = Boolean(directorPreview?.isReplayActive || mode.isGoalReplayActive?.());
    const goalResetTicks =
      goalAndTouch?.getEffectiveGoalResetTicks?.() ?? goalAndTouch?.goalResetTicks ?? 0;

    if (isReplayActive || goalResetTicks > 0 || matchState?.phase !== 'playing') {
      replayController?.endReplaySession?.();
      if (directorPreview) directorPreview.isReplayActive = false;
      if (goalAndTouch) {
        Object.assign(goalAndTouch, {
          goalResetTicks: 0,
          frozenGoalBallState: null,
          goalIncidentTick: -1,
        });
      }
      runtime.releaseGoalReplayCameraOverride?.();
      if (matchState) matchState.phase = 'playing';
      hudStore.getState().setReplayState({ replayPaused: false, replayPersistent: false });
      hudStore.getState().setMatchState({
        matchPhase: 'playing',
        replayScorerName: null,
        replayScorerTeam: null,
        replayBallSpeedKph: null,
        replayAssistName: null,
      });
    }
  }

  public applyFrameAtCursor(
    runtime: FreeplayRewinderRuntimePort | null,
    rewinderFrames: ReadonlyArray<RewinderFrameEntry>,
    cursor: number,
    smoothStep: boolean = false,
    restoreOptions: { preserveEngineTick?: boolean; overrideTick?: number } = {
      preserveEngineTick: true,
    }
  ): RewinderFrameEntry | null {
    const { physics, interpolator, arena } = runtime ?? {};
    return applyRewinderFrameToPhysics({
      physics,
      interpolator,
      arena,
      rewinderFrames,
      rewinderCursor: cursor,
      smoothStep,
      restoreOptions,
    });
  }

  public applyFrameAndEmitStateOnly(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    rewinderFrames: ReadonlyArray<RewinderFrameEntry>,
    frameIdx: number,
    disableBallControl = true
  ): RewinderFrameEntry | null {
    const { keyboard, physics } = runtime ?? {};
    if (disableBallControl) {
      this.exitGoalOrReplayIfNeeded(runtime, mode);
      if (keyboard) keyboard.ballControlEnabled = false;
    }
    const entry = this.applyFrameAtCursor(runtime, rewinderFrames, frameIdx, false, {
      preserveEngineTick: true,
    });
    emitSystemControlTransition(
      runtime,
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY,
      frameIdx,
      0,
      entry?.compactSnap || physics?.saveCompactState?.()
    );
    return entry;
  }

  public executeHandoffToLiveFreeplay(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    rewinderFrames: ReadonlyArray<RewinderFrameEntry>,
    targetIdx: number,
    cursor: number
  ): void {
    const { physics, keyboard, playerControls, playerCarIndex } = runtime ?? {};
    if (!runtime || !physics || rewinderFrames.length === 0) return;
    const carIdx = playerCarIndex ?? 0;
    const prepareBeforeReconstruct = (liveTick: number): void => {
      this.exitGoalOrReplayIfNeeded(runtime, mode);
      this.applyFrameAtCursor(runtime, rewinderFrames, cursor, false, { overrideTick: liveTick });
    };
    const restoreControlsAfterReconstruct = (): void => {
      if (keyboard) keyboard.ballControlEnabled = true;
      if (playerControls) {
        physics.setControls?.(carIdx, playerControls);
      }
    };
    executeLiveFreeplayHandoff({
      runtime,
      freeplayMode: mode,
      targetIdx,
      fallbackLastTouchTick: 'minusOne',
      getHistorySlotAt: (idx: number) => buildRewinderHistorySlotAt(rewinderFrames, idx, carIdx),
      beforeReconstruct: prepareBeforeReconstruct,
      afterReconstruct: restoreControlsAfterReconstruct,
    });
  }

  public beginResumePreroll(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    rewinderFrames: ReadonlyArray<RewinderFrameEntry>,
    takeoverSubController: ReplayTakeoverSubController
  ): void {
    const store = useRewinderStore.getState();
    const downSec = store.rewinderDownCounterSec ?? 0;
    const minRequiredFrames = downSec === 0 ? 120 : 240;
    const { physics, keyboard, options, simulationStage } = runtime ?? {};
    if (!runtime || !physics || rewinderFrames.length < minRequiredFrames) return;

    this.exitGoalOrReplayIfNeeded(runtime, mode);
    if (keyboard) keyboard.ballControlEnabled = false;

    if (store.rewinderState === 'recording') {
      const lastFrame = Math.max(0, rewinderFrames.length - 1);
      takeoverSubController.reset(lastFrame, lastFrame);
    }

    const baseTarget =
      store.rewinderState === 'preroll-countdown' || store.rewinderState === 'stopped'
        ? takeoverSubController.targetFrame || takeoverSubController.cursor
        : takeoverSubController.cursor;

    const audio = options?.gameAudio || gameAudio;
    const { targetIdx, startIdx, remSec } = takeoverSubController.beginPrerollCountdown(
      rewinderFrames.length,
      baseTarget,
      downSec,
      audio
    );

    physics.setUnlimitedBoost?.(false);
    const entry = this.applyFrameAtCursor(runtime, rewinderFrames, startIdx, false, {
      preserveEngineTick: true,
    });
    simulationStage?.resetActionStates?.();
    emitSystemControlTransition(
      runtime,
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
      targetIdx,
      remSec,
      entry?.compactSnap || physics.saveCompactState?.()
    );

    store.updateLiveTelemetry({
      rewinderState: 'preroll-countdown',
      rewinderRecordedFrames: rewinderFrames.length,
      rewinderCursorFrame: startIdx,
      rewinderTargetFrame: targetIdx,
      rewinderPrerollRemainingSec: remSec,
    });
  }

  public stepPrerollCountdownTick(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    rewinderFrames: ReadonlyArray<RewinderFrameEntry>,
    takeoverSubController: ReplayTakeoverSubController
  ): boolean {
    const store = useRewinderStore.getState();
    const { physics, options } = runtime ?? {};
    const outcome = takeoverSubController.stepPrerollCountdown({
      totalFrames: rewinderFrames.length,
      downCounterSec: store.rewinderDownCounterSec ?? 0,
      displayedRemainingSec: store.rewinderPrerollRemainingSec ?? 0,
      audio: options?.gameAudio || gameAudio,
    });

    const entry = this.applyFrameAtCursor(runtime, rewinderFrames, outcome.appliedCursor, true, {
      preserveEngineTick: true,
    });
    if (entry?.controls && runtime) {
      runtime.playerThrottle = Number(entry.controls.throttle ?? 0);
      runtime.playerControls = { ...entry.controls };
    }
    if (entry?.incidents?.length || entry?.signals?.length || entry?.audioEvents?.length) {
      dispatchReplayFrameEvents(
        {
          incidents: entry.incidents || [],
          signals: entry.signals || [],
          audioEvents: entry.audioEvents || [],
        },
        runtime
      );
    }

    if (outcome.handoffTargetIdx !== null) {
      const targetIdx = outcome.handoffTargetIdx;
      physics?.setUnlimitedBoost?.(false);
      this.executeHandoffToLiveFreeplay(
        runtime,
        mode,
        rewinderFrames,
        targetIdx,
        takeoverSubController.cursor
      );
      store.updateLiveTelemetry({
        rewinderState: 'stopped',
        rewinderCursorFrame: targetIdx,
        rewinderTargetFrame: targetIdx,
        rewinderPrerollRemainingSec: 0,
      });
      return false;
    }

    if (outcome.telemetryUpdate) {
      store.updateLiveTelemetry({
        rewinderCursorFrame: outcome.telemetryUpdate.cursorFrame,
        rewinderPrerollRemainingSec: outcome.telemetryUpdate.remainingSec,
      });
    }
    return false;
  }

  public recordPhysicsEvent(
    rewinderFrames: RewinderFrameEntry[],
    event: RewinderIncidentRecord | null | undefined,
    runtime: FreeplayRewinderRuntimePort | null
  ): void {
    if (!event || useRewinderStore.getState().rewinderState !== 'recording') return;
    const physics = runtime?.physics ?? null;
    recordPhysicsEventIntoRewinderFrames(
      rewinderFrames,
      this._pendingFrameIncidents,
      event,
      physics?.getHeaderView?.()?.tickCount
    );
  }

  public recordTickFrame(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    rewinderFrames: RewinderFrameEntry[],
    takeoverSubController: ReplayTakeoverSubController
  ): void {
    const store = useRewinderStore.getState();
    const { physics, playerControls } = runtime ?? {};
    if (store.rewinderState !== 'recording' || !physics) {
      this._pendingFrameIncidents.length = 0;
      return;
    }

    const compactSnap = physics.saveCompactState?.() ?? physics.state.slice();
    const currentTick = Math.floor(physics.getHeaderView?.()?.tickCount ?? 0);
    const incidents =
      this._pendingFrameIncidents.length > 0 ? this._pendingFrameIncidents.slice() : [];
    this._pendingFrameIncidents.length = 0;

    if (rewinderFrames.length >= MAX_REWINDER_FRAMES) {
      rewinderFrames.shift();
    }
    const goalAndTouch = mode?.goalAndTouch ?? null;
    const lastTouchTick = goalAndTouch?.lastTouchTick ?? -1;
    rewinderFrames.push({
      compactSnap,
      renderState: compactSnap,
      controls: { ...(playerControls || DEFAULT_CAR_CONTROLS) },
      incidents,
      hadTouch: Boolean(mode && lastTouchTick === currentTick),
      lastTouchTick,
    });
    physics.recordReplayFrame?.();
    const lastIdx = rewinderFrames.length - 1;
    takeoverSubController.cursor = lastIdx;
    takeoverSubController.targetFrame = lastIdx;

    if (
      rewinderFrames.length % 6 === 0 ||
      rewinderFrames.length === 120 ||
      rewinderFrames.length === 240
    ) {
      store.updateLiveTelemetry({
        rewinderRecordedFrames: rewinderFrames.length,
        rewinderCursorFrame: lastIdx,
        rewinderTargetFrame: lastIdx,
      });
    }
  }

  public async exportReplay(
    rewinderFrames: RewinderFrameEntry[],
    mode: FreeplayRewinderModePort | null,
    runtime?: FreeplayRewinderRuntimePort | null
  ): Promise<boolean> {
    if (rewinderFrames.length > 0) {
      return exportStateReplayFile(rewinderFrames);
    }
    const serverRing = (
      runtime as
        | {
            authoritativeServer?: {
              hostReplayRingBuffer?: {
                getRecentFrames?(): Array<RewinderFrameEntry | null>;
              } | null;
            } | null;
          }
        | null
        | undefined
    )?.authoritativeServer?.hostReplayRingBuffer;
    const modeRingBuffer = mode?.replayRingBuffer ?? null;
    const ringFrames = serverRing?.getRecentFrames?.() ?? modeRingBuffer?.getRecentFrames?.();
    if (Array.isArray(ringFrames) && ringFrames.length > 0) {
      return exportStateReplayFile(
        ringFrames.filter((f): f is NonNullable<typeof f> => f !== null)
      );
    }
    return false;
  }

  public async importReplay(
    fileOrBuffer: unknown,
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    takeoverSubController: ReplayTakeoverSubController
  ): Promise<{ frames: RewinderFrameEntry[]; timelines: Record<string, unknown> | null } | null> {
    const { physics, neutralControls, simulationStage } = runtime ?? {};
    if (!physics) return null;
    try {
      const parsed = await parseRCReplayFile(fileOrBuffer);
      if (!parsed || !Array.isArray(parsed.frames) || parsed.frames.length === 0) {
        throw new Error('No valid frames found in replay file.');
      }
      const timelines = parsed.timelines || null;
      const frames = buildRewinderFramesFromParsedReplay(parsed, neutralControls);
      this.frames = frames;
      this.timelines = timelines;
      const lastIdx = Math.max(0, frames.length - 1);
      takeoverSubController.reset(0, lastIdx);
      this.applyFrameAndEmitStateOnly(runtime, mode, frames, 0, true);
      simulationStage?.resetActionStates?.();

      useRewinderStore.getState().updateLiveTelemetry({
        rewinderState: 'paused-scrub',
        rewinderRecordedFrames: frames.length,
        rewinderCursorFrame: 0,
        rewinderTargetFrame: lastIdx,
        rewinderPrerollRemainingSec: 0,
      });
      return { frames, timelines };
    } catch (err) {
      console.error('[FreeplayRewinderController] Failed to import replay file:', err);
      return null;
    }
  }

  public resetArenaCarsIfAllowed(
    runtime: FreeplayRewinderRuntimePort | null,
    mode: FreeplayRewinderModePort | null,
    wasBlocking: boolean
  ): boolean {
    return resetRewinderArenaCarsIfAllowed(runtime, mode, wasBlocking);
  }
}
