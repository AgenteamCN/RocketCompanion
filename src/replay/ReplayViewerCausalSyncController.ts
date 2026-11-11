/**
 * ReplayViewerCausalSyncController.ts
 * Stateful SubController managing Causal Hybrid physics takeover, live Freeplay handoff,
 * pre-physics tick stepping, runtime session preparation, and arena reset after replay clear
 * for StandaloneReplayViewerController.
 */

import {
  getNormalizedReplayFrameSlot,
  ReplayCausalHybridEngine,
  type ReplayCausalTimelineSource,
  type NormalizedReplayFrameSlot,
  type ReplayFrameSlotLike,
  type ReplaySnapshotBuffer,
} from './ReplayCausalHybridEngine.ts';
import {
  executeLiveFreeplayHandoff,
  emitSystemControlTransition,
  type ReplayTakeoverSubController,
} from './ReplayTakeoverSubController.ts';
import { SYSTEM_CONTROL_SIGNALS } from '../physics/RocketSimConstants.ts';
import type {
  ReplayScoreboardRuntimePort,
  ReplayScoreboardModePort,
  ReplayScoreboardStateInputTimelinePort,
  ReplayScoreboardIncidentTimelinePort,
} from './ReplayScoreboardSynchronizer.ts';
import type { ReplayRosterEntry } from './ReplayViewerRosterSubController.ts';
import {
  hudStore,
  useAppStore,
  useReplayViewerStore,
  setNameTagRuntimeState,
} from '../game/runtimeUiPort.ts';
import { getPreferredColorHex } from '../ui-core/config/vehiclePresets.ts';
import { gameAudio } from '../audio/GameAudioEngineFacade.ts';

export interface ReplayViewerCausalSyncSessionPort {
  readonly runtime: ReplayScoreboardRuntimePort | null;
  readonly mode: ReplayScoreboardModePort | null;
  readonly frames: Array<Float32Array | ReplaySnapshotBuffer>;
  readonly frameSlots: ReplayFrameSlotLike[];
  readonly stateInputTimeline: ReplayScoreboardStateInputTimelinePort | null;
  readonly incidentTimeline: ReplayScoreboardIncidentTimelinePort | null;
  readonly rosterSubController: {
    readonly resolvedRoster: ReplayRosterEntry[];
    readonly activePovCarIndex: number;
    readonly activePovSlotKey: number;
    readonly activePovTeam: number;
  };
  readonly takeoverSubController: ReplayTakeoverSubController;
  _applyUserLoadoutToTakenOverCar(carIndex?: number): void;
  _applyFrameAtCursor(
    smoothStep?: boolean,
    dispatchEvents?: boolean,
    restoreOptions?: { preserveEngineTick?: boolean; overrideTick?: number }
  ): void;
  _silenceContinuousAudio(): void;
}

export class ReplayViewerCausalSyncController {
  public readonly causalHybridEngine = new ReplayCausalHybridEngine();

  public clear(): void {
    this.causalHybridEngine.clear();
  }

  public buildCausalDataSource(
    session: ReplayViewerCausalSyncSessionPort
  ): ReplayCausalTimelineSource {
    return {
      frames: session.frames,
      frameSlots: session.frameSlots,
      stateInputTimeline: session.stateInputTimeline,
      incidentTimeline: session.incidentTimeline,
    };
  }

  public getNormalizedFrameSlotAt(
    session: ReplayViewerCausalSyncSessionPort,
    frameIndex: number
  ): NormalizedReplayFrameSlot | null {
    return getNormalizedReplayFrameSlot(this.buildCausalDataSource(session), frameIndex);
  }

  public applyNonPovRecordedControlsAtFrame(
    session: ReplayViewerCausalSyncSessionPort,
    frameIndex: number
  ): void {
    this.causalHybridEngine.applyNonPovRecordedControls({
      source: this.buildCausalDataSource(session),
      physics: session.runtime?.physics,
      frameIndex,
      activePovCarIndex: session.rosterSubController.activePovCarIndex,
      rosterCount: session.rosterSubController.resolvedRoster.length,
      neutralControls: session.runtime?.neutralControls || {},
    });
  }

  public configureLiveFreeplayViewerHandoff(
    runtime: ReplayScoreboardRuntimePort | null,
    resolvedRoster: ReplayRosterEntry[],
    activePovCarIndex: number,
    activePovTeam: number
  ): void {
    const r = runtime;
    const sim = r?.physics;
    if (!r || !sim) return;
    for (const e of resolvedRoster) sim.setCarTeam?.(e.carIndex, e.team);
    sim.setCarTeam?.(activePovCarIndex, activePovTeam);
    r.playerCarIndex = activePovCarIndex;
    if (r.arena) r.arena.playerCarIndex = activePovCarIndex;
    if (r.keyboard) r.keyboard.ballControlEnabled = false;
    sim.setControls?.(
      activePovCarIndex,
      (r.playerControls || r.neutralControls || {}) as Record<string, unknown>
    );
    hudStore.getState().setMatchState({ localTeam: activePovTeam });
  }

  public executeHandoffToLiveFreeplay(
    session: ReplayViewerCausalSyncSessionPort,
    targetIdx: number
  ): void {
    const r = session.runtime;
    if (!r?.physics || session.frames.length === 0) return;
    const freeplayMode = session.mode || r.modeManager?.modes?.get?.('freeplay') || null;
    const roster = session.rosterSubController;
    const takeover = session.takeoverSubController;
    const self = this;

    executeLiveFreeplayHandoff({
      runtime: r,
      freeplayMode,
      targetIdx,
      fallbackLastTouchTick: 'baseTick',
      getHistorySlotAt(idx: number) {
        return self.getNormalizedFrameSlotAt(session, idx);
      },
      beforeReconstruct(liveTick: number) {
        session._applyUserLoadoutToTakenOverCar(roster.activePovCarIndex);
        takeover.beginIntervention(targetIdx);
        self.causalHybridEngine.beginIntervention(roster.activePovCarIndex);
        r.physics?.setUnlimitedBoost?.(false);
        session._applyFrameAtCursor(false, false, { overrideTick: liveTick });
      },
      afterReconstruct() {
        self.configureLiveFreeplayViewerHandoff(
          r,
          roster.resolvedRoster,
          roster.activePovCarIndex,
          roster.activePovTeam
        );
        self.applyNonPovRecordedControlsAtFrame(session, targetIdx + 1);
      },
    });
  }

  public beginPrerollFromCursor(
    session: ReplayViewerCausalSyncSessionPort,
    prepareRuntime: () => void,
    resetDispatchedCursor: (startIdx: number) => void
  ): void {
    const r = session.runtime;
    const store = useReplayViewerStore.getState();
    const downSec = store.downCounterSec ?? 0;
    const minRequiredFrames = downSec === 0 ? 120 : 240;
    if (!r?.physics || session.frames.length < minRequiredFrames) return;

    prepareRuntime();
    const takeover = session.takeoverSubController;
    const baseCursor =
      store.viewerState === 'intervening' || store.viewerState === 'preroll-countdown'
        ? takeover.targetFrame
        : Math.round(takeover.cursor);
    const audio = r?.options?.gameAudio || gameAudio;
    const { targetIdx, startIdx, remSec } = takeover.beginPrerollCountdown(
      session.frames.length,
      baseCursor,
      downSec,
      audio
    );
    resetDispatchedCursor(startIdx);
    r.physics.setUnlimitedBoost?.(false);
    session._applyFrameAtCursor(false, false);
    r.simulationStage?.resetActionStates?.();
    emitSystemControlTransition(
      r,
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
      targetIdx,
      remSec,
      r.physics?.saveCompactState?.()
    );

    store.updateLiveTelemetry({
      viewerState: 'preroll-countdown',
      cursorFrame: startIdx,
      targetFrame: targetIdx,
      prerollRemainingSec: remSec,
    });
  }

  private _syncAuthoritativeServerState(r: ReplayScoreboardRuntimePort | null): void {
    if (r?.authoritativeServer?.sim?.restoreState) {
      const snap = r?.physics?.saveCompactState?.();
      if (snap) void r.authoritativeServer.sim.restoreState(snap);
    }
  }

  public stepBeforePhysicsTick(session: ReplayViewerCausalSyncSessionPort): boolean {
    const r = session.runtime;
    const store = useReplayViewerStore.getState();
    const state = store.viewerState;
    if (state === 'idle' || session.frames.length === 0) return true;

    const takeover = session.takeoverSubController;
    const roster = session.rosterSubController;

    if (state === 'intervening') {
      if (r?.keyboard && r.keyboard.ballControlEnabled) r.keyboard.ballControlEnabled = false;
      if (r?.physics) {
        const replayFrameIdx = takeover.consumeInterventionReplayFrameIndex();
        this.causalHybridEngine.stepBeforePhysics({
          source: this.buildCausalDataSource(session),
          physics: r.physics,
          currentReplayFrameIndex: replayFrameIdx,
          activePovCarIndex: roster.activePovCarIndex,
          rosterCount: roster.resolvedRoster.length,
        });
        this.applyNonPovRecordedControlsAtFrame(session, replayFrameIdx + 1);
      }
      return true;
    }

    if (state === 'paused') return false;

    if (state === 'playing') {
      const outcome = takeover.stepPlaying({
        totalFrames: session.frames.length,
        effectiveFlowPct: store.effectiveFlowPct || 100,
      });
      const isFinished = outcome.finishedAtFrame !== null;
      session._applyFrameAtCursor(!isFinished, true, { preserveEngineTick: true });
      this._syncAuthoritativeServerState(r);
      if (isFinished) {
        session._silenceContinuousAudio();
        store.updateLiveTelemetry({
          viewerState: 'paused',
          cursorFrame: outcome.finishedAtFrame,
          targetFrame: outcome.finishedAtFrame,
        });
      } else if (outcome.telemetryCursor !== null) {
        store.updateLiveTelemetry({
          cursorFrame: outcome.telemetryCursor,
          targetFrame: outcome.telemetryCursor,
        });
      }
      return false;
    }

    if (state === 'rewinding' || state === 'forwarding') {
      const outcome = takeover.stepScrub({
        direction: state,
        totalFrames: session.frames.length,
        effectiveFlowPct: store.effectiveFlowPct || 100,
        throttleUiSync: true,
      });
      if (outcome.appliedCursor !== null) {
        session._applyFrameAtCursor(false, outcome.isForwarding, { preserveEngineTick: true });
        this._syncAuthoritativeServerState(r);
      }
      if (outcome.telemetryCursor !== null) {
        store.updateLiveTelemetry({
          cursorFrame: outcome.telemetryCursor,
          targetFrame: outcome.telemetryCursor,
        });
      }
      return false;
    }

    if (state === 'preroll-countdown') {
      const outcome = takeover.stepPrerollCountdown({
        totalFrames: session.frames.length,
        downCounterSec: store.downCounterSec ?? 0,
        displayedRemainingSec: store.prerollRemainingSec ?? 0,
        audio: r?.options?.gameAudio || gameAudio,
      });
      session._applyFrameAtCursor(true, true, { preserveEngineTick: true });
      this._syncAuthoritativeServerState(r);

      if (outcome.handoffTargetIdx !== null) {
        this.executeHandoffToLiveFreeplay(session, outcome.handoffTargetIdx);
        store.updateLiveTelemetry({
          viewerState: 'intervening',
          cursorFrame: outcome.handoffTargetIdx,
          targetFrame: outcome.handoffTargetIdx,
          prerollRemainingSec: 0,
        });
      } else if (outcome.telemetryUpdate) {
        store.updateLiveTelemetry({
          cursorFrame: outcome.telemetryUpdate.cursorFrame,
          prerollRemainingSec: outcome.telemetryUpdate.remainingSec,
        });
      }
      return false;
    }

    return true;
  }

  public prepareRuntimeForSession(
    runtime: ReplayScoreboardRuntimePort | null,
    currentMode: ReplayScoreboardModePort | null,
    restoreRecordedLoadouts: () => void
  ): ReplayScoreboardModePort | null {
    const r = runtime;
    if (!r) return currentMode;

    if (
      r.match?.state &&
      r.match.state.mode !== 'freeplay' &&
      r.match.state.mode !== 'replay-viewer'
    ) {
      if (typeof r.switchToFreeplay === 'function') {
        r.switchToFreeplay();
      } else if (
        typeof r.botCoordinator?.leaveBotMatch === 'function' &&
        r.match.state.mode === 'match'
      ) {
        r.botCoordinator.leaveBotMatch();
      }
    }

    if (r.match?.state) {
      r.match.state.mode = 'replay-viewer';
      r.match.state.phase = 'playing';
      r.match.state.paused = false;
    }
    useAppStore.getState().setMatchMode?.('replay-viewer');
    r.modeManager?.setMode?.('replay-viewer');

    const freeplayMode =
      currentMode ||
      r.modeManager?.modes?.get?.('replay-viewer') ||
      r.modeManager?.modes?.get?.('freeplay') ||
      (r.modeManager?.activeMode?.id === 'freeplay' ||
      r.modeManager?.activeMode?.id === 'replay-viewer'
        ? r.modeManager.activeMode
        : null);
    if (freeplayMode) {
      if (
        freeplayMode.directorPreview?.isReplayActive ||
        freeplayMode.isGoalReplayActive?.() ||
        r.match?.state?.phase === 'replay'
      ) {
        freeplayMode.replayController?.endReplaySession?.();
        if (freeplayMode.directorPreview) {
          freeplayMode.directorPreview.isReplayActive = false;
        }
        hudStore.getState().setReplayState({
          replayPaused: false,
          replayPersistent: false,
        });
        hudStore.setState({
          isGoalReplay: false,
          goalReplayScorerName: '',
          goalReplayScoringTeam: 0,
          goalReplaySpeedKph: 0,
          goalReplayProgress: 0,
          goalReplayDurationSec: 0,
          goalReplayElapsedSec: 0,
        });
      }
      if (freeplayMode.goalAndTouch) {
        freeplayMode.goalAndTouch.goalResetTicks = 0;
        freeplayMode.goalAndTouch.goalIncidentTick = -1;
        freeplayMode.goalAndTouch.frozenGoalBallState = null;
      }

      if (freeplayMode.rewinderController?.isBlockingLivePhysics) {
        if (typeof freeplayMode.rewinderController.exitRewindMode === 'function') {
          freeplayMode.rewinderController.exitRewindMode();
        } else {
          freeplayMode.rewinderController.stopRecording?.();
        }
      }
    }

    r.releaseGoalReplayCameraOverride?.();
    r._clientGoalIncidentLatched = false;
    r.ballTrajectoryPredictor?.clear?.();
    if (r.match?.state && r.match.state.phase !== 'playing') {
      r.match.state.phase = 'playing';
    }
    restoreRecordedLoadouts();
    return freeplayMode || null;
  }

  public resetArenaAfterClear(runtime: ReplayScoreboardRuntimePort | null): void {
    const r = runtime;
    setNameTagRuntimeState({
      isMultiplayerOrMultiCarMode: false,
      carEntries: [],
    });
    if (!r) return;
    r.ballTrajectoryPredictor?.clear?.();
    r.playerCarIndex = 0;
    if (r.arena) {
      r.arena.playerCarIndex = 0;
      if (r.arena.cars) {
        if (r.arena.cars[0]) r.arena.cars[0]!.visible = true;
        for (let i = 1; i < r.arena.cars.length; i++) {
          if (r.arena.cars[i]) {
            r.arena.cars[i]!.visible = false;
          }
          r.arena.resetCarBoosts?.(i);
          r.arena.carDemolitions?.[i]?.stop?.();
          r.arena.supersonicWheelTrailSystem?.resetCar?.(i);
        }
      }
      r.arena.lighting?.updateSunIntensities?.(1);
    }
    r.audioSubsystem?.resetAudio?.();
    if (r.physics) {
      while (r.physics.numCars > 1 && typeof r.physics.removeCar === 'function') {
        r.physics.removeCar(r.physics.numCars - 1);
      }
      const playerTeam = r.teamAssignment?.playerTeam ?? 0;
      r.physics.setCarTeam?.(0, playerTeam);
      r.arena?.setCarTeam?.(0, playerTeam);
    }
    if (typeof r.loadoutCoordinator?.restoreLocalPlayerFreeplayLoadout === 'function') {
      r.loadoutCoordinator.restoreLocalPlayerFreeplayLoadout(0);
    } else {
      const appState = useAppStore?.getState?.();
      const targetCar = appState?.activeCar || r.selectedPreset;
      if (targetCar) {
        r.changePlayerVehicle?.(targetCar);
      }
      const playerTeam = (r.teamAssignment?.playerTeam ?? 0) === 1 ? 1 : 0;
      r.setCarColor?.(0, getPreferredColorHex(null, playerTeam), false);
      r.syncPlayerMaterialsLoadout?.();
    }
    if (r.match?.state?.mode === 'replay-viewer') {
      r.match.state.mode = 'freeplay';
      r.match.state.phase = 'playing';
      useAppStore.getState().setMatchMode?.('freeplay');
      r.modeManager?.setMode?.('freeplay');
    }
    if (r.keyboard) {
      r.keyboard.ballControlEnabled = r.match?.state?.mode === 'freeplay';
    }
  }
}
