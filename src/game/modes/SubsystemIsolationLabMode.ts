import { BaseGameMode } from './BaseGameMode.ts';
import type { FrameContext } from '../pipeline/FramePipeline.ts';
import type { GhostWorldUpdateOptions } from './MultiWorldGhostRenderer.ts';
import { hudStore, useSubsystemIsolationLabStore } from '../runtimeUiPort.ts';
import type {
  IsolationLabTabId,
  LabFrameUpdateContext,
  LabRuntimePort,
  LabTabContext,
  LabTabController,
} from './subsystem-isolation-lab/LabTabTypes.ts';
import {
  bindIsolationLabStoreHandlers,
  resetIsolationLabRuntimeBaseline,
  resetIsolationLabTelemetryAndHud,
} from './subsystem-isolation-lab/isolationLabSessionPipeline.ts';
import { resetSinglePlayerLabBaseline } from './subsystem-isolation-lab/probeArenaSetupPipeline.ts';
import { ProbesLabTab } from './subsystem-isolation-lab/ProbesLabTab.ts';
import { MultiGhostLabTab } from './subsystem-isolation-lab/MultiGhostLabTab.ts';
import { StateReplayLabTab } from './subsystem-isolation-lab/StateReplayLabTab.ts';
import { NinetySecMatchLabTab } from './subsystem-isolation-lab/NinetySecMatchLabTab.ts';
import { GoalReplayLabTab } from './subsystem-isolation-lab/GoalReplayLabTab.ts';
import { KickoffDuelLabTab } from './subsystem-isolation-lab/KickoffDuelLabTab.ts';
import { DemolishRespawnLabTab } from './subsystem-isolation-lab/DemolishRespawnLabTab.ts';

export class SubsystemIsolationLabMode extends BaseGameMode {
  declare runtime: LabRuntimePort;
  private tabSwitchEpoch = 0;
  private activeTabCtrl: LabTabController | null = null;

  private readonly probesTab = new ProbesLabTab();
  private readonly multiGhostTab = new MultiGhostLabTab();
  private readonly stateReplayTab = new StateReplayLabTab();
  private readonly ninetySecMatchTab = new NinetySecMatchLabTab();
  private readonly goalReplayTab = new GoalReplayLabTab();
  private readonly kickoffDuelTab = new KickoffDuelLabTab();
  private readonly demolishRespawnTab = new DemolishRespawnLabTab();

  private readonly tabControllers = new Map<IsolationLabTabId, LabTabController>();
  private readonly tabContext: LabTabContext;

  constructor(runtime: LabRuntimePort) {
    super('dev-test-lab', runtime);

    this.tabControllers.set('probes', this.probesTab);
    this.tabControllers.set('multi-ghost', this.multiGhostTab);
    this.tabControllers.set('state-replay', this.stateReplayTab);
    this.tabControllers.set('90s-match', this.ninetySecMatchTab);
    this.tabControllers.set('goal-replay', this.goalReplayTab);
    this.tabControllers.set('kickoff-duel', this.kickoffDuelTab);
    this.tabControllers.set('demolish-respawn', this.demolishRespawnTab);

    this.tabContext = {
      get runtime() {
        return runtime;
      },
      getSwitchEpoch: () => this.tabSwitchEpoch,
      ensureSinglePlayerCarOnly: (resetKickoffState = true) =>
        resetSinglePlayerLabBaseline(this.runtime, resetKickoffState),
      enterPodiumShowcase: (winningTeam = 0) => this.goalReplayTab.enterPodiumShowcase(winningTeam),
      exitPodiumShowcase: () => this.goalReplayTab.exitPodiumShowcase(),
      isPodiumActive: () => this.goalReplayTab.isPodiumActive(),
    };

    this.stateReplayTab.attachToHost(this.tabContext);
    this.goalReplayTab.attachToHost(this.tabContext);
  }

  syncExternalGhostWorld(
    worldId: string,
    prevState: Float32Array | number[],
    currState: Float32Array | number[],
    options: GhostWorldUpdateOptions = {}
  ): void {
    this.multiGhostTab.syncExternalGhostWorld(worldId, prevState, currState, options);
  }

  private resetLabArenaBaseline(): void {
    this.tabSwitchEpoch++;
    if (this.activeTabCtrl) {
      this.activeTabCtrl.onDeactivate();
      this.activeTabCtrl = null;
    }
    this.goalReplayTab.exitPodiumShowcase();
    this.stateReplayTab.clearBuffer();
    resetIsolationLabRuntimeBaseline(this.runtime);
    resetIsolationLabTelemetryAndHud();
  }

  private ensureTabActive(tab: IsolationLabTabId): boolean {
    const store = useSubsystemIsolationLabStore.getState();
    if (store.activeTab !== tab) {
      store.applyAndRestartLab(tab);
      return true;
    }
    return false;
  }

  private bindStoreHandlers(): void {
    bindIsolationLabStoreHandlers({
      probesTab: this.probesTab,
      multiGhostTab: this.multiGhostTab,
      stateReplayTab: this.stateReplayTab,
      ninetySecMatchTab: this.ninetySecMatchTab,
      goalReplayTab: this.goalReplayTab,
      kickoffDuelTab: this.kickoffDuelTab,
      demolishRespawnTab: this.demolishRespawnTab,
      switchTab: (tab) => this.handleTabSwitch(tab),
      ensureTabActive: (tab) => this.ensureTabActive(tab),
    });
  }

  onEnter(): void {
    const { keyboard, physics } = this.runtime;
    const store = useSubsystemIsolationLabStore.getState();

    const targetTab: IsolationLabTabId =
      (store.selectedTab as IsolationLabTabId) ||
      (store.activeTab as IsolationLabTabId) ||
      'probes';

    useSubsystemIsolationLabStore.setState({
      activeTab: targetTab,
      selectedTab: targetTab,
      probesEnabled: targetTab === 'probes',
      dualWorldEnabled: targetTab === 'multi-ghost',
      incidentMatchActive: targetTab === '90s-match',
      probeCameraTarget: 'player',
      rewinderState: 'idle',
      rewinderPrerollRemainingSec: 0,
      podiumActive: false,
      goalReplayPhase: 'live',
    });

    this.bindStoreHandlers();
    this.stateReplayTab.bindHotkeys();
    if (keyboard) {
      keyboard.ballControlEnabled = true;
    }
    physics?.setUnlimitedBoost(true);
    this.handleTabSwitch(targetTab);
  }

  onLeave(): void {
    this.stateReplayTab.unbindHotkeys();
    this.resetLabArenaBaseline();
    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      rewinderState: 'idle',
      rewinderPrerollRemainingSec: 0,
      incidentMatchActive: false,
      dualWorldEnabled: false,
      probesEnabled: false,
      probeCameraTarget: 'player',
      podiumActive: false,
      goalReplayPhase: 'live',
    });
    const modeManager = this.runtime.modeManager ?? this.runtime.gameModeManager;
    const freeplayMode = modeManager?.modes?.get('freeplay');
    freeplayMode?.rewinderController?.attach?.();
  }

  private handleTabSwitch(tab: IsolationLabTabId): void {
    this.resetLabArenaBaseline();
    const nextController = this.tabControllers.get(tab) ?? null;
    this.activeTabCtrl = nextController;
    if (this.activeTabCtrl) {
      this.activeTabCtrl.onActivate(this.tabContext);
    }
  }

  onBeforePhysicsTick(): boolean {
    if (this.goalReplayTab.isPodiumActive()) {
      return false;
    }

    if (!this.stateReplayTab.stepBeforePhysicsTick()) {
      return false;
    }

    const result = this.activeTabCtrl?.onPhysicsTick(1 / 120);
    return result !== false;
  }

  onAfterPhysicsTick(): void {
    this.stateReplayTab.recordFrameAfterTick();
    this.activeTabCtrl?.onAfterPhysicsTick?.();
  }

  update(context: FrameContext): void {
    const ctx = context as unknown as LabFrameUpdateContext;
    const { playerCarView } = ctx;
    const store = useSubsystemIsolationLabStore.getState();

    if (this.goalReplayTab.isPodiumActive() && this.activeTabCtrl !== this.goalReplayTab) {
      this.goalReplayTab.updatePresentation(ctx);
    }
    this.activeTabCtrl?.onRenderFrame?.(ctx);

    if (playerCarView) {
      const { physics } = this.runtime;
      const activeCarIdx = ctx.activeCar ?? ctx.activeCarIndex ?? 0;
      const isRewinderScrubOrPreroll = this.stateReplayTab.isScrubOrPrerollActive();
      const defaultUnlimited =
        store.activeTab !== '90s-match' && store.activeTab !== 'kickoff-duel';
      const unlimitedHud = isRewinderScrubOrPreroll
        ? false
        : (physics?.getCarUnlimitedBoost?.(activeCarIdx) ?? defaultUnlimited);
      hudStore.getState().setBoost(playerCarView.boost, playerCarView.isBoosting, unlimitedHud);
    }
  }

  onResetKickoff(seed = -1): void {
    const { physics, interpolator, arena, camera } = this.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    const defaultUnlimited = store.activeTab !== '90s-match' && store.activeTab !== 'kickoff-duel';
    physics?.setUnlimitedBoost(defaultUnlimited);
    physics?.resetKickoff(seed);
    interpolator?.sync();
    arena?.resetBallTrail?.();
    camera?.resetView();
  }
}
