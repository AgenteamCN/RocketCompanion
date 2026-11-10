import {
  BaseGameMode,
  type GameModePhysicsEvent,
  type GameModeRuntimePort,
} from '../BaseGameMode.ts';
import type { FrameContext } from '../../pipeline/FramePipeline.ts';
import { StaticTrainingVisuals } from './StaticTrainingVisuals.ts';
import { useStaticTrainingPackStore, hudStore } from '../../runtimeUiPort.ts';
import { type StaticTrainingEditSubMode, type StaticTrainingShotConfig } from './ShotGizmoMath.ts';
import { StaticTrainingArenaController } from './StaticTrainingArenaController.ts';
import { StaticTrainingReplayController } from './StaticTrainingReplayController.ts';
import {
  StaticTrainingShotEditor,
  type StaticTrainingEditorCommand,
} from './StaticTrainingShotEditor.ts';
import { StaticTrainingSimulationController } from './StaticTrainingSimulationController.ts';
import {
  buildEffectiveStaticTrainingShot,
  initStaticTrainingStoreAndReload,
  resetStaticTrainingHudToPlaying,
  resolveActiveStaticTrainingShot,
  stepStaticTrainingNonReplayFrame,
  syncReloadedShotLiveTelemetry,
  teardownRuntimeNetworkForStaticTraining,
} from './staticTrainingSessionPipeline.ts';

export class StaticTrainingPackMode extends BaseGameMode {
  public readonly arenaController: StaticTrainingArenaController;
  public readonly replaySession: StaticTrainingReplayController;
  public readonly editor: StaticTrainingShotEditor;
  public readonly simulationController: StaticTrainingSimulationController;

  public visuals: StaticTrainingVisuals | null = null;
  public isFreeCamTrajectoryTesting = false;
  public isTestingSingleShot = false;

  constructor(runtime: GameModeRuntimePort | null) {
    super('static-training-pack', runtime);

    this.arenaController = new StaticTrainingArenaController(runtime);
    this.replaySession = new StaticTrainingReplayController(runtime);
    this.simulationController = new StaticTrainingSimulationController(runtime);
    this.editor = new StaticTrainingShotEditor((command) => this.handleEditorCommand(command));
  }

  get replayRingBuffer() {
    return this.replaySession.replayRingBuffer;
  }
  get replayController() {
    return this.replaySession.replayController;
  }
  get isReplayActive(): boolean {
    return this.replaySession.isReplayActive;
  }
  set isReplayActive(val: boolean) {
    this.replaySession.isReplayActive = val;
  }
  get replayCameraMode() {
    return this.replaySession.replayCameraMode;
  }
  set replayCameraMode(val: 'director' | 'pov') {
    this.replaySession.replayCameraMode = val;
  }
  get playPhase() {
    return this.simulationController.playPhase;
  }
  get stagedShot(): StaticTrainingShotConfig | null {
    return this.arenaController.stagedShot;
  }

  onEnter(): void {
    const r = this.runtime;
    teardownRuntimeNetworkForStaticTraining(r);
    this.replaySession.attachPhysicsIfNeeded();
    if (!this.visuals && r?.arena?.scene) {
      this.visuals = new StaticTrainingVisuals(r.arena.scene as never);
    }

    this.arenaController.ensureSinglePlayerCar();
    this.editor.bindSessionEvents();
    this._bindStoreRuntimeHandlers();
    initStaticTrainingStoreAndReload(() => {
      if (this.runtime?.match?.state?.mode === 'static-training-pack') this.reloadCurrentShot();
    });
  }

  onLeave(): void {
    this.editor.unbindSessionEvents();
    this.editor.resetInputState();
    this.replaySession.abortSession();
    this.replaySession.clearBuffer();
    this.visuals?.setVisible(false);
    this.arenaController.teardownRuntimeModeExit();
    resetStaticTrainingHudToPlaying();
  }

  private handleEditorCommand(command: StaticTrainingEditorCommand): void {
    if (!this._ensureActiveMode(command)) return;
    switch (command) {
      case 'reload-shot':
        this.reloadCurrentShot();
        break;
      case 'toggle-single-shot-test':
        this.toggleSingleShotTest();
        break;
      case 'toggle-trajectory-test':
        this.toggleFreeCamTrajectoryTest();
        break;
      case 'stop-trajectory-test':
        this.stopFreeCamTrajectoryTest();
        break;
      case 'toggle-replay-pause': {
        if (!this.replaySession.isReplayActive) break;
        const replayCtrl = this.replaySession.replayController;
        const paused = replayCtrl.togglePause();
        hudStore.getState().setReplayState({
          replayPaused: paused,
          replayPersistent: replayCtrl.sessionState.isPersistent,
        });
        break;
      }
    }
  }

  private _ensureActiveMode(actionName: string): boolean {
    const activeMode = this.runtime?.match?.state?.mode;
    if (activeMode !== 'static-training-pack') {
      console.warn(
        `[StaticTrainingPackMode] ${actionName} ignored (mode="${activeMode ?? 'none'}")`
      );
      return false;
    }
    return true;
  }

  private _setTestFlags(testingSingleShot: boolean, trajectoryTesting: boolean): void {
    this.isTestingSingleShot = testingSingleShot;
    this.isFreeCamTrajectoryTesting = trajectoryTesting;
    const s = useStaticTrainingPackStore.getState();
    if (s.isTestingSingleShot !== testingSingleShot) s.setTestingSingleShot(testingSingleShot);
    if (s.isFreeCamTrajectoryTesting !== trajectoryTesting) {
      s.setFreeCamTrajectoryTesting(trajectoryTesting);
    }
  }

  private _resetTestFlagsAndReload(actionName: string): void {
    if (!this._ensureActiveMode(actionName)) return;
    this._setTestFlags(false, false);
    this.reloadCurrentShot();
  }

  private _onStoreEditSubModeChanged(subMode: StaticTrainingEditSubMode): void {
    if (!this._ensureActiveMode('onEditSubModeChanged')) return;
    if (this.isFreeCamTrajectoryTesting) this.stopFreeCamTrajectoryTest();
    this.editor.applyEditSubModeCamera(subMode, this.runtime?.camera, () =>
      this.runtime?.releaseGoalReplayCameraOverride()
    );
  }

  private _onStoreEditVariableMutated(item: StaticTrainingShotConfig): void {
    if (!this._ensureActiveMode('onEditVariableMutated')) return;
    const s = useStaticTrainingPackStore.getState();
    if (this.isFreeCamTrajectoryTesting) {
      this._setTestFlags(this.isTestingSingleShot, false);
    }
    const timeoutSec = Math.max(1, Math.min(60, Number(item?.timeoutSeconds) || 10));
    this.simulationController.setTimeoutSeconds(timeoutSec);
    if (s.remainingTimeoutSec !== timeoutSec) {
      s.updateLiveTelemetry({ remainingTimeoutSec: timeoutSec });
    }
    this.arenaController.applyStagedShot(
      item,
      true,
      this.editor.isLeftMouseDragging,
      this.replaySession.replayRingBuffer
    );
  }

  private _bindStoreRuntimeHandlers(): void {
    useStaticTrainingPackStore.getState().setRuntimeHandlers({
      onShotChanged: () => this._resetTestFlagsAndReload('onShotChanged'),
      onSessionModeChanged: () => this._resetTestFlagsAndReload('onSessionModeChanged'),
      onEditSubModeChanged: (subMode) => this._onStoreEditSubModeChanged(subMode),
      onEditVariableMutated: (item) => this._onStoreEditVariableMutated(item),
      onResetShotRequested: () => {
        if (this._ensureActiveMode('onResetShotRequested')) this.reloadCurrentShot();
      },
    });
  }

  toggleFreeCamTrajectoryTest(): void {
    if (this.isFreeCamTrajectoryTesting) {
      this.stopFreeCamTrajectoryTest();
      return;
    }
    this._setTestFlags(false, true);
    this.arenaController.launchFreeCamTrajectoryPreview(
      this.editor.isLeftMouseDragging,
      this.replaySession.replayRingBuffer
    );
  }

  stopFreeCamTrajectoryTest(): void {
    if (!this.isFreeCamTrajectoryTesting) return;
    this._setTestFlags(this.isTestingSingleShot, false);
    const shot = this._getCurrentShotConfig();
    if (!shot) return;
    this.arenaController.applyStagedShot(
      shot,
      true,
      this.editor.isLeftMouseDragging,
      this.replaySession.replayRingBuffer
    );
  }

  toggleSingleShotTest(): void {
    this._setTestFlags(!this.isTestingSingleShot, false);
    this.reloadCurrentShot();
  }

  _getCurrentShotConfig(): StaticTrainingShotConfig | null {
    return resolveActiveStaticTrainingShot();
  }

  reloadCurrentShot(): void {
    const r = this.runtime;
    if (!r?.physics) return;

    this.replaySession.abortSession();
    this._setTestFlags(this.isTestingSingleShot, false);
    this.replaySession.clearBuffer();
    r.camera?.setEditorOverride?.(false);
    r.releaseGoalReplayCameraOverride();

    const store = useStaticTrainingPackStore.getState();
    this.arenaController.syncEditBallOpacityOverride(
      this.isTestingSingleShot,
      this.replaySession.isReplayActive,
      true
    );
    const shot = this._getCurrentShotConfig();
    if (!shot) return;

    const isPlayableSession = store.sessionMode === 'play' || this.isTestingSingleShot;
    this.arenaController.ensureSinglePlayerCar();
    const effectiveShot = buildEffectiveStaticTrainingShot(shot, isPlayableSession);

    this.arenaController.applyStagedShot(
      effectiveShot,
      false,
      this.editor.isLeftMouseDragging,
      this.replaySession.replayRingBuffer
    );

    const timeoutSec = Math.max(1, Math.min(60, Number(effectiveShot.timeoutSeconds) || 10));
    this.simulationController.configureShotSession(
      timeoutSec,
      isPlayableSession,
      Boolean(store.downCounterEnabled),
      Number(store.downCounterValue) || 1
    );

    if (!isPlayableSession) {
      const editSubMode = store.editSubMode as StaticTrainingEditSubMode;
      this.editor.applyEditSubModeCamera(editSubMode, r.camera, () =>
        r.releaseGoalReplayCameraOverride()
      );
    } else {
      if (r.camera?.isFreeCam) r.camera.setFreeCam(false);
      r.camera?.resetView?.();
    }

    syncReloadedShotLiveTelemetry(timeoutSec, isPlayableSession);
    resetStaticTrainingHudToPlaying(r.match?.state);
  }

  private _completeReplayAndAdvance = (): void => {
    this.replaySession.completeSessionAndAdvance(this.isTestingSingleShot, () =>
      this.reloadCurrentShot()
    );
  };

  onPhysicsEvent(event: GameModePhysicsEvent | null | undefined): void {
    this.simulationController.onPhysicsEvent(event, this.arenaController, this.replaySession);
  }

  onBeforePhysicsTick(): boolean {
    return this.simulationController.stepBeforePhysics(
      this.arenaController,
      this.replaySession,
      this.isTestingSingleShot,
      this.isFreeCamTrajectoryTesting
    );
  }

  onAfterPhysicsTick(): void {
    this.simulationController.stepAfterPhysics(
      this.arenaController,
      this.replaySession,
      this.isTestingSingleShot,
      this.isFreeCamTrajectoryTesting,
      this._completeReplayAndAdvance
    );
  }

  skipGoalReplay(): void {
    if (!this.replaySession.isReplayActive && this.simulationController.goalResetTicks <= 0) return;
    this.simulationController.goalResetTicks = 0;
    this._completeReplayAndAdvance();
  }

  update(context: FrameContext): void {
    const dt = context.dt ?? 0.016;
    const arenaCtrl = this.arenaController;
    arenaCtrl.syncEditBallOpacityOverride(
      this.isTestingSingleShot,
      this.replaySession.isReplayActive
    );

    if (
      this.replaySession.isReplayActive &&
      this.replaySession.replayController.sessionState.isActive
    ) {
      this.replaySession.stepUpdate(
        context as unknown as Record<string, unknown>,
        dt,
        arenaCtrl.stagedShot,
        this.visuals,
        this._completeReplayAndAdvance
      );
      return;
    }

    stepStaticTrainingNonReplayFrame({
      context,
      dt,
      isTestingSingleShot: this.isTestingSingleShot,
      isFreeCamTrajectoryTesting: this.isFreeCamTrajectoryTesting,
      playPhase: this.simulationController.playPhase,
      arenaController: arenaCtrl,
      editor: this.editor,
      camera: this.runtime?.camera,
      visuals: this.visuals,
    });
  }

  onResetKickoff(): void {
    this.reloadCurrentShot();
  }
}
