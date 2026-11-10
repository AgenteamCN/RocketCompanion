import { BaseGameMode } from './BaseGameMode.ts';
import type { FrameContext } from '../pipeline/FramePipeline.ts';
import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';
import { useExperimentalMultiBotsStore, hudStore } from '../runtimeUiPort.ts';
import type {
  CarControls,
  ExpModeRuntimePort,
} from './experimental-multi-bots/ExperimentalMultiBotsMatchMath.ts';
import { ExperimentalMultiBotsRosterController } from './experimental-multi-bots/ExperimentalMultiBotsRosterController.ts';
import { ExperimentalMultiBotsReplayController } from './experimental-multi-bots/ExperimentalMultiBotsReplayController.ts';
import { ExperimentalMultiBotsMatchLifecycleController } from './experimental-multi-bots/ExperimentalMultiBotsMatchLifecycleController.ts';
import { ExperimentalMultiBotsSimulationController } from './experimental-multi-bots/ExperimentalMultiBotsSimulationController.ts';

export class ExperimentalMultiBotsMode extends BaseGameMode<ExpModeRuntimePort | null> {
  public readonly rosterController: ExperimentalMultiBotsRosterController;
  public readonly replaySession: ExperimentalMultiBotsReplayController;
  public readonly lifecycleController: ExperimentalMultiBotsMatchLifecycleController;
  public readonly simulationController: ExperimentalMultiBotsSimulationController;

  constructor(runtime: ExpModeRuntimePort | null) {
    super('exp-multi-bots', runtime);

    this.rosterController = new ExperimentalMultiBotsRosterController(runtime);
    this.replaySession = new ExperimentalMultiBotsReplayController(runtime);
    this.lifecycleController = new ExperimentalMultiBotsMatchLifecycleController(runtime);
    this.simulationController = new ExperimentalMultiBotsSimulationController(runtime);

    const store = useExperimentalMultiBotsStore.getState();
    const initHandlers: Parameters<typeof store.setRuntimeHandlers>[0] = {};
    initHandlers.onPreloadEngines = () => {
      void this.rosterController.preloadNativeModels();
    };
    store.setRuntimeHandlers(initHandlers);
  }

  private isModeActive(actionName: string): boolean {
    const activeMode = this.runtime?.match?.state?.mode;
    if (activeMode !== 'exp-multi-bots') {
      console.warn(
        `[ExperimentalMultiBotsMode] ${actionName} ignored: active mode is "${activeMode ?? 'none'}", requires "exp-multi-bots".`
      );
      return false;
    }
    return true;
  }

  onEnter(): void {
    const r = this.runtime;
    if (r) {
      r.podiumController = this.lifecycleController.podiumController;
    }
    this.replaySession.attachPhysicsIfNeeded();

    const store = useExperimentalMultiBotsStore.getState();
    const handlers: Parameters<typeof store.setRuntimeHandlers>[0] = {};
    handlers.onApplyRosterAndStart = () => {
      if (this.isModeActive('onApplyRosterAndStart')) void this.applyRosterAndStartMatch();
    };
    handlers.onSelectCameraCar = (carIdx: number) => {
      if (this.isModeActive('onSelectCameraCar')) this._applyCameraCarIndex(carIdx);
    };
    handlers.onSpeedMultiplierChange = (mult: number) => {
      if (this.isModeActive('onSpeedMultiplierChange')) {
        this.rosterController.applySpeedMultiplier(mult);
      }
    };
    handlers.onUnlimitedBoostChange = (unlimited: boolean) => {
      if (this.isModeActive('onUnlimitedBoostChange')) {
        r?.physics?.setUnlimitedBoost?.(Boolean(unlimited));
      }
    };
    handlers.onTriggerAction = (action: string) => {
      if (this.isModeActive('onTriggerAction')) this.triggerSandboxAction(action);
    };
    handlers.onHotSwapSlotBotType = (team: number, slotIndex: number, botType: string) => {
      if (this.isModeActive('onHotSwapSlotBotType')) {
        this._hotSwapSlotBotType(team, slotIndex, botType);
      }
    };
    handlers.onHotSwapSlotColor = () => {
      if (this.isModeActive('onHotSwapSlotColor')) {
        this.rosterController.syncCarColorsFromStore();
      }
    };
    handlers.onPreloadEngines = () => {
      void this.rosterController.preloadNativeModels();
    };
    store.setRuntimeHandlers(handlers);

    void this.applyRosterAndStartMatch();
  }

  onLeave(): void {
    const r = this.runtime;

    if (
      this.lifecycleController.goalResetTicks > 0 &&
      this.lifecycleController.goalTracker.goalIncidentTick > 0
    ) {
      this.replaySession.retainGoalReplayBuffer(
        this.lifecycleController.getGoalIncidentMeta(),
        this.rosterController.spawnedCars
      );
    }

    this.lifecycleController.cancelPendingMatchStart();
    this.lifecycleController.podiumController?.exitPodium?.();
    this.replaySession.replayController?.endReplaySession?.();
    this.replaySession.clearSignalsAndBuffer();
    this.replaySession.isReplayActive = false;
    if (r) {
      r.releaseGoalReplayCameraOverride();
    }

    this.rosterController.cleanupExtraCarsOnLeave();

    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      matchActive: false,
      spawnedCars: [],
      activeCameraCarIndex: 0,
    });
  }

  _applyCameraCarIndex(carIdx = 0): void {
    const clamped = this.rosterController.applyCameraCarIndex(carIdx);
    if (this.replaySession.isReplayActive) {
      this.replaySession.replayPovCarIndex = clamped;
    }
  }

  private _hotSwapSlotBotType(_team: number, _slotIndex: number, botType: string): void {
    if (botType && botType !== 'heuristic') {
      ensureExperimentalEngine(botType);
    }
    void this.applyRosterAndStartMatch();
  }

  _publishSpawnedCarsTelemetry(): void {
    if (this.rosterController.spawnedCars.length === 0) return;
    this.rosterController.publishSpawnedCarsTelemetry();
  }

  getCarControls(carIndex: number): CarControls | null {
    if (carIndex < 0) return null;
    return this.rosterController.getCarControls(carIndex);
  }

  async applyRosterAndStartMatch(): Promise<void> {
    if (!this.runtime?.physics) return;
    return this.lifecycleController.applyRosterAndStartMatch(
      this.rosterController,
      this.replaySession
    );
  }

  triggerSandboxAction(action: string): void {
    if (!action) return;
    this.lifecycleController.triggerSandboxAction(
      action,
      this.rosterController,
      this.replaySession
    );
  }

  isGoalReplayActive(): boolean {
    return Boolean(this.replaySession.isReplayActive);
  }

  skipGoalReplay(): void {
    if (!this.replaySession.isReplayActive && this.lifecycleController.goalResetTicks <= 0) return;
    this.lifecycleController.goalResetTicks = 0;
    this.lifecycleController.completePostGoalOrReplayTransition(
      this.rosterController,
      this.replaySession
    );
  }

  onPhysicsEvent(
    event: Parameters<ExperimentalMultiBotsSimulationController['onPhysicsEvent']>[0]
  ): void {
    if (!event) return;
    this.simulationController.onPhysicsEvent(
      event,
      this.rosterController,
      this.replaySession,
      this.lifecycleController
    );
  }

  onBeforePhysicsTick(): boolean {
    if (!this.runtime?.physics) return true;
    return this.simulationController.stepBeforePhysics(
      this.rosterController,
      this.replaySession,
      this.lifecycleController
    );
  }

  onAfterPhysicsTick(): void {
    if (!this.runtime?.physics) return;
    this.simulationController.stepAfterPhysics(
      this.rosterController,
      this.replaySession,
      this.lifecycleController
    );
  }

  update(context: FrameContext): void {
    const r = this.runtime;
    const unlimited = Boolean(useExperimentalMultiBotsStore.getState().unlimitedBoost);
    const frameRecord = context as unknown as Record<string, unknown>;

    if (
      this.lifecycleController.isMatchEnded &&
      this.lifecycleController.podiumController?.isActive
    ) {
      this.lifecycleController.podiumController.update(frameRecord);
      return;
    }

    if (
      this.replaySession.isReplayActive &&
      this.replaySession.replayController.sessionState.isActive
    ) {
      this.replaySession.stepUpdate(frameRecord, unlimited, this.rosterController, () =>
        this.lifecycleController.completePostGoalOrReplayTransition(
          this.rosterController,
          this.replaySession
        )
      );
      return;
    }

    const playerCarView = context.playerCarView as
      { boost?: number; isBoosting?: number | boolean } | null | undefined;
    if (playerCarView && typeof playerCarView.boost === 'number') {
      const activeCarIdx = context.activeCar ?? r?.playerCarIndex ?? 0;
      const carUnlimited = r?.physics?.getCarUnlimitedBoost?.(activeCarIdx) ?? unlimited;
      hudStore
        .getState()
        .setBoost(playerCarView.boost, Boolean(playerCarView.isBoosting), carUnlimited);
    }
  }

  onResetKickoff(): void {
    void this.applyRosterAndStartMatch();
  }
}
