import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import {
  isGlobalHotkeyBlockedByUi,
  subscribeGlobalKeyDown,
  subscribeGlobalKeyUp,
} from '../../../input/hotkeyInputGuard.ts';
import type { RestoreSnapshotOptions } from '../../../physics/RocketSimSnapshotSerializer.ts';
import {
  MAX_REWINDER_FRAMES,
  exportStateReplayFile,
  parseRCReplayFile,
} from '../../../replay/ReplayFileExporter.ts';
import { useRewinderStore, useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type { LabAudioPort, LabTabContext, LabTabController } from './LabTabTypes.ts';
import {
  computeRewinderPrerollWindow,
  mapParsedReplayToRewinderFrames,
  restoreRewinderFrameToPhysicsAndInterpolator,
  type PrerollCalculationOutput,
  type RewinderFrameEntry,
} from './goalReplayScenariosPipeline.ts';

export type { PrerollCalculationOutput, RewinderFrameEntry };

export class StateReplayLabTab implements LabTabController {
  readonly tabId = 'state-replay' as const;
  private ctx: LabTabContext | null = null;
  private frames: RewinderFrameEntry[] = [];
  private cursor = 0;
  private targetFrame = 0;
  private scrubAccum = 0;
  private lastBeepSec = -1;
  private keyDownHandler: ((evt: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((evt: KeyboardEvent) => void) | null = null;
  private unsubKeyDown: (() => void) | null = null;
  private unsubKeyUp: (() => void) | null = null;

  attachToHost(ctx: LabTabContext): void {
    this.ctx = ctx;
  }
  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
  }
  onDeactivate(): void {
    this.clearBuffer();
  }

  private getAudio(): LabAudioPort | null {
    return this.ctx?.runtime?.options?.gameAudio || (gameAudio as unknown as LabAudioPort);
  }

  bindHotkeys(): void {
    if (typeof window === 'undefined') return;
    this.unbindHotkeys();

    this.keyDownHandler = (evt: KeyboardEvent) => {
      const runtime = this.ctx?.runtime;
      if (runtime?.match?.state?.mode !== 'dev-test-lab') return;
      if (
        isGlobalHotkeyBlockedByUi(evt, runtime) ||
        !Boolean(useRewinderStore.getState().rewinderWindowOpen)
      )
        return;

      const noMods = !evt.ctrlKey && !evt.shiftKey && !evt.altKey && !evt.metaKey;
      const keyLower = evt.key?.toLowerCase();
      if ((evt.code === 'KeyO' || keyLower === 'o') && noMods) {
        if (!evt.repeat) {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          this.startRecording();
        }
        return;
      }
      if ((evt.code === 'KeyP' || keyLower === 'p') && noMods) {
        if (!evt.repeat) {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          this.pauseRecording();
        }
        return;
      }
      if ((evt.code === 'KeyG' || keyLower === 'g') && noMods) {
        if (!evt.repeat) {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          this.resumeFromCursor();
        }
        return;
      }
      if (evt.code === 'BracketLeft' || evt.key === '[') {
        evt.preventDefault();
        if (!evt.repeat) this.beginScrub('rewinding');
        return;
      }
      if (evt.code === 'BracketRight' || evt.key === ']') {
        evt.preventDefault();
        if (!evt.repeat) this.beginScrub('forwarding');
      }
    };

    this.keyUpHandler = (evt: KeyboardEvent) => {
      const runtime = this.ctx?.runtime;
      if (
        runtime?.match?.state?.mode !== 'dev-test-lab' ||
        !Boolean(useRewinderStore.getState().rewinderWindowOpen)
      )
        return;
      if (
        evt.code === 'BracketLeft' ||
        evt.key === '[' ||
        evt.code === 'BracketRight' ||
        evt.key === ']'
      ) {
        evt.preventDefault();
        this.pauseScrub();
      }
    };

    this.unsubKeyDown = subscribeGlobalKeyDown(this.keyDownHandler, true);
    this.unsubKeyUp = subscribeGlobalKeyUp(this.keyUpHandler, true);
  }

  unbindHotkeys(): void {
    this.unsubKeyDown?.();
    this.unsubKeyDown = null;
    this.keyDownHandler = null;
    this.unsubKeyUp?.();
    this.unsubKeyUp = null;
    this.keyUpHandler = null;
  }

  isScrubOrPrerollActive(): boolean {
    const state = useRewinderStore.getState().rewinderState;
    return (
      state === 'rewinding' ||
      state === 'forwarding' ||
      state === 'paused-scrub' ||
      state === 'preroll-countdown'
    );
  }

  private ensureActive(actionName: string): boolean {
    const currentMode = this.ctx?.runtime?.match?.state?.mode || 'dev-test-lab';
    if (currentMode !== 'dev-test-lab') {
      console.warn(
        `[StateReplayLabTab] Cannot execute "${actionName}": active mode is "${currentMode}".`
      );
      return false;
    }
    return true;
  }

  private syncTelemetry(patch: Record<string, unknown>): void {
    useRewinderStore.getState().updateLiveTelemetry(patch);
    useSubsystemIsolationLabStore.getState().updateLiveTelemetry(patch);
  }

  private applyFrameAtCursor(
    smoothStep = false,
    restoreOptions: RestoreSnapshotOptions = { preserveEngineTick: true }
  ): void {
    const r = this.ctx?.runtime;
    restoreRewinderFrameToPhysicsAndInterpolator(
      r?.physics,
      r?.interpolator,
      this.frames,
      this.cursor,
      smoothStep,
      restoreOptions
    );
  }

  startRecording(): void {
    if (!this.ensureActive('startRewinderRecordingSession')) return;
    const r = this.ctx?.runtime;
    if (!r?.physics) {
      console.warn('[StateReplayLabTab] Cannot start recording: physics engine not initialized.');
      return;
    }

    this.frames = [];
    this.cursor = 0;
    this.targetFrame = 0;
    this.scrubAccum = 0;
    this.lastBeepSec = -1;
    r.physics.clearReplayBuffer?.();
    r.physics.clearEvents?.();
    r.physics.resetGoalLatch?.();
    r._clientGoalIncidentLatched = false;
    r.simulationStage?.resetActionStates?.();

    this.syncTelemetry({
      rewinderState: 'recording',
      rewinderRecordedFrames: 0,
      rewinderCursorFrame: 0,
      rewinderTargetFrame: 0,
      rewinderPrerollRemainingSec: 0,
    });
  }

  pauseRecording(): void {
    if (!this.ensureActive('pauseRewinderRecordingSession')) return;
    const store = useRewinderStore.getState();
    if (store.rewinderState === 'recording') {
      const lastFrame = Math.max(0, this.frames.length - 1);
      this.cursor = lastFrame;
      this.targetFrame = lastFrame;
      this.syncTelemetry({
        rewinderState: 'stopped',
        rewinderRecordedFrames: this.frames.length,
        rewinderCursorFrame: lastFrame,
        rewinderTargetFrame: lastFrame,
        rewinderPrerollRemainingSec: 0,
      });
    } else {
      console.warn(`[StateReplayLabTab] Cannot stop recording in state "${store.rewinderState}".`);
    }
  }

  beginScrub(direction: 'rewinding' | 'forwarding' = 'rewinding'): void {
    if (!this.ensureActive(`beginRewinderScrubSession(${direction})`)) return;
    if (this.frames.length === 0) {
      console.warn(`[StateReplayLabTab] Cannot start ${direction}: buffer is empty.`);
      return;
    }
    const store = useRewinderStore.getState();
    if (store.rewinderState === 'recording') {
      this.cursor = this.frames.length - 1;
      this.targetFrame = this.cursor;
    } else if (store.rewinderState === 'preroll-countdown') {
      this.cursor = this.targetFrame;
    }
    this.scrubAccum = 0;
    this.lastBeepSec = -1;
    const rounded = Math.round(this.cursor);
    this.syncTelemetry({
      rewinderState: direction,
      rewinderRecordedFrames: this.frames.length,
      rewinderCursorFrame: rounded,
      rewinderTargetFrame: rounded,
      rewinderPrerollRemainingSec: 0,
    });
  }

  pauseScrub(): void {
    const store = useRewinderStore.getState();
    if (store.rewinderState === 'rewinding' || store.rewinderState === 'forwarding') {
      const clamped = Math.max(0, Math.min(this.frames.length - 1, Math.round(this.cursor)));
      this.cursor = clamped;
      this.targetFrame = clamped;
      this.syncTelemetry({
        rewinderState: 'paused-scrub',
        rewinderCursorFrame: clamped,
        rewinderTargetFrame: clamped,
      });
    }
  }

  seekFrame(frameIndex: number): void {
    if (!this.ensureActive('seekRewinderFrameToIndex')) return;
    if (!this.frames || this.frames.length === 0) {
      console.warn('[StateReplayLabTab] Cannot seek frame: recorded frame buffer is empty.');
      return;
    }
    const clamped = Math.max(0, Math.min(this.frames.length - 1, Math.round(frameIndex)));
    this.cursor = clamped;
    this.targetFrame = clamped;
    this.scrubAccum = 0;
    this.lastBeepSec = -1;
    this.applyFrameAtCursor(false);
    this.syncTelemetry({
      rewinderState: 'paused-scrub',
      rewinderCursorFrame: clamped,
      rewinderTargetFrame: clamped,
      rewinderPrerollRemainingSec: 0,
    });
  }

  resumeFromCursor(): void {
    if (!this.ensureActive('resumeRewinderFromCursorSession')) return;
    const r = this.ctx?.runtime;
    const store = useRewinderStore.getState();
    const downSec = store.rewinderDownCounterSec ?? 3;
    const minRequiredFrames = downSec === 0 ? 120 : 240;
    if (!r?.physics) {
      console.warn('[StateReplayLabTab] Cannot resume: physics engine not initialized.');
      return;
    }
    if (this.frames.length < minRequiredFrames) {
      console.warn(
        `[StateReplayLabTab] Cannot resume: recorded frames (${this.frames.length}) < ${minRequiredFrames}.`
      );
      return;
    }

    const calc = computeRewinderPrerollWindow(
      this.frames.length,
      this.cursor,
      this.targetFrame,
      downSec,
      store.rewinderState
    );
    this.targetFrame = calc.targetIdx;
    this.cursor = calc.startIdx;
    this.lastBeepSec = -1;

    r.physics.setUnlimitedBoost?.(false);
    this.applyFrameAtCursor(false);
    r.simulationStage?.resetActionStates?.();

    const audio = this.getAudio();
    if (downSec === 0) {
      this.lastBeepSec = 1;
      audio?.play?.('training_countdown', 1.0, 200);
    } else if (calc.remSec >= 1 && calc.remSec <= downSec) {
      this.lastBeepSec = calc.remSec;
      audio?.play?.('training_countdown', 1.0, 200);
    }

    this.syncTelemetry({
      rewinderState: 'preroll-countdown',
      rewinderRecordedFrames: this.frames.length,
      rewinderCursorFrame: calc.startIdx,
      rewinderTargetFrame: calc.targetIdx,
      rewinderPrerollRemainingSec: Math.max(1, calc.remSec),
    });
  }

  async exportReplay(): Promise<boolean> {
    if (!this.frames || this.frames.length === 0) {
      console.warn('[StateReplayLabTab] Cannot export state replay: buffer is empty.');
      return false;
    }
    return Boolean(await exportStateReplayFile(this.frames));
  }

  async importReplay(fileOrBuffer: File | Blob | ArrayBuffer | Uint8Array): Promise<boolean> {
    if (!this.ensureActive('importRewinderReplayFile')) return false;
    const r = this.ctx?.runtime;
    if (!r?.physics) {
      console.warn('[StateReplayLabTab] Cannot import replay: physics engine not initialized.');
      return false;
    }
    try {
      const parsed = await parseRCReplayFile(fileOrBuffer);
      if (!parsed || !Array.isArray(parsed.frames) || parsed.frames.length === 0) {
        throw new Error('No valid frames found in replay file.');
      }
      this.ctx?.ensureSinglePlayerCarOnly(false);
      this.frames = mapParsedReplayToRewinderFrames(parsed, r.neutralControls);
      this.cursor = 0;
      this.targetFrame = Math.max(0, this.frames.length - 1);
      this.scrubAccum = 0;
      this.lastBeepSec = -1;

      this.applyFrameAtCursor(false);
      r.simulationStage?.resetActionStates?.();

      this.syncTelemetry({
        rewinderState: 'stopped',
        rewinderRecordedFrames: this.frames.length,
        rewinderCursorFrame: 0,
        rewinderTargetFrame: this.targetFrame,
        rewinderPrerollRemainingSec: 0,
      });
      return true;
    } catch (err) {
      console.error('[StateReplayLabTab] Failed to import replay file:', err);
      return false;
    }
  }

  clearBuffer(): void {
    const r = this.ctx?.runtime;
    this.frames = [];
    this.cursor = 0;
    this.targetFrame = 0;
    this.scrubAccum = 0;
    this.lastBeepSec = -1;
    r?.physics?.clearReplayBuffer?.();
    this.syncTelemetry({
      rewinderState: 'idle',
      rewinderRecordedFrames: 0,
      rewinderCursorFrame: 0,
      rewinderTargetFrame: 0,
      rewinderPrerollRemainingSec: 0,
    });
  }

  recordFrameAfterTick(): void {
    const r = this.ctx?.runtime;
    const store = useRewinderStore.getState();
    if (store.rewinderState !== 'recording' || !r?.physics) return;
    if (this.frames.length < MAX_REWINDER_FRAMES) {
      const compactSnap = r.physics.saveCompactState();
      this.frames.push({
        compactSnap,
        renderState: compactSnap,
        controls: { ...r.playerControls },
      });
      r.physics.recordReplayFrame?.();
      this.cursor = this.frames.length - 1;
      this.targetFrame = this.cursor;
      if (
        this.frames.length % 6 === 0 ||
        this.frames.length === 120 ||
        this.frames.length === 240
      ) {
        this.syncTelemetry({
          rewinderRecordedFrames: this.frames.length,
          rewinderCursorFrame: this.cursor,
          rewinderTargetFrame: this.targetFrame,
        });
      }
    } else {
      this.pauseRecording();
    }
  }

  stepBeforePhysicsTick(): boolean {
    const r = this.ctx?.runtime;
    const store = useRewinderStore.getState();

    if (store.rewinderState === 'preroll-countdown') {
      const targetIdx = Math.max(0, Math.min(this.frames.length - 1, Math.round(this.targetFrame)));
      const nextCursor = Math.min(targetIdx, Math.round(this.cursor) + 1);
      this.cursor = nextCursor;
      this.applyFrameAtCursor(true, { preserveEngineTick: true });

      const remFrames = Math.max(0, targetIdx - nextCursor);
      const downSec = store.rewinderDownCounterSec ?? 3;
      const maxBeepSec = downSec === 0 ? 1 : downSec;
      const audio = this.getAudio();

      if (remFrames <= 0) {
        const prevEngineTick = Math.floor(r?.physics?.getHeaderView?.()?.tickCount ?? 0);
        const liveTick = Math.max(prevEngineTick + 16, targetIdx + 16);
        r?.physics?.setUnlimitedBoost?.(false);
        this.applyFrameAtCursor(false, { overrideTick: liveTick });
        r?.physics?.clearEvents?.();
        r?.physics?.resetGoalLatch?.();
        if (r) r._clientGoalIncidentLatched = false;
        r?.simulationStage?.resetActionStates?.();
        if (r?.playerControls && r.physics) {
          r.physics.setControls(r.playerCarIndex || 0, r.playerControls);
        }
        audio?.play?.('match_start_go', 1.0, 200);
        this.lastBeepSec = -1;
        this.syncTelemetry({
          rewinderState: 'stopped',
          rewinderCursorFrame: targetIdx,
          rewinderTargetFrame: targetIdx,
          rewinderPrerollRemainingSec: 0,
        });
        return false;
      }

      const countdownSec = Math.max(1, Math.ceil(remFrames / 120));
      if (countdownSec >= 1 && countdownSec <= maxBeepSec && countdownSec !== this.lastBeepSec) {
        this.lastBeepSec = countdownSec;
        audio?.play?.('training_countdown', 1.0, 200);
      }

      if (
        remFrames % 6 === 0 ||
        remFrames % 120 === 0 ||
        countdownSec !== store.rewinderPrerollRemainingSec
      ) {
        this.syncTelemetry({
          rewinderCursorFrame: nextCursor,
          rewinderPrerollRemainingSec: countdownSec,
        });
      }
      return false;
    }

    if (
      store.rewinderState === 'rewinding' ||
      store.rewinderState === 'forwarding' ||
      store.rewinderState === 'paused-scrub'
    ) {
      if (store.rewinderState === 'rewinding' || store.rewinderState === 'forwarding') {
        const stepPerTick = (store.rewinderEffectiveFlowPct || 100) / 100;
        const maxIdx = Math.max(0, this.frames.length - 1);
        this.cursor =
          store.rewinderState === 'rewinding'
            ? Math.max(0, this.cursor - stepPerTick)
            : Math.min(maxIdx, this.cursor + stepPerTick);
        this.targetFrame = Math.round(this.cursor);
        this.applyFrameAtCursor(false, { preserveEngineTick: true });
        this.syncTelemetry({
          rewinderCursorFrame: this.targetFrame,
          rewinderTargetFrame: this.targetFrame,
        });
      }
      return false;
    }

    return true;
  }

  onPhysicsTick(_dt: number): boolean {
    return true;
  }
}
