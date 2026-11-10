import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import { preloadKickoffV1BestWeights } from '../../ai/KickoffV2SafeTensorsAgent.ts';
import {
  createIsolatedKickoffGhostSim,
  precomputeKickoffGhostTimeline,
  resetKickoffSpawnInPhysics,
  scheduleKickoffCountdownSignal,
  type KickoffGhostPlacement,
  type KickoffSpawnPoint,
  type KickoffCarControls,
} from './kickoffGhostPrecomputePipeline.ts';
import {
  NEUTRAL_KICKOFF_CONTROLS,
  createKickoffEpisodeState,
  stepKickoffPreTickPhase,
  stepKickoffCountdownTick,
  stepKickoffRunningTick,
  syncKickoffEpisodeResetStoreState,
  syncKickoffMatchAndHudPhase,
  type KickoffEpisodeState,
  type KickoffSubMode,
  type KickoffEpisodePhase,
  type KickoffGhostVisualsPort,
  type KickoffSimPorts,
} from './kickoffEpisodeRuntimePipeline.ts';
import { hudStore, useKickoffTrainingStore } from '../runtimeUiPort.ts';

export type {
  KickoffGhostPlacement,
  KickoffSpawnPoint,
  KickoffCarControls,
  KickoffSubMode,
  KickoffEpisodePhase,
  KickoffGhostVisualsPort,
};

export interface KickoffFrameUpdateContext {
  goalScored?: boolean;
  playerCarView?: { boost: number; isBoosting: boolean } | null;
  dt?: number;
}

export interface KickoffEpisodeConfigSnapshot {
  spawnIndex: number;
  subMode: KickoffSubMode;
  ghostPlacement: KickoffGhostPlacement;
  ghostModeEnabled: boolean;
}

export interface KickoffEpisodeConfigPatch {
  spawnIndex?: number;
  subMode?: KickoffSubMode;
  ghostPlacement?: KickoffGhostPlacement;
  ghostModeEnabled?: boolean;
  ghostVisibility?: { showCar: boolean; showBall: boolean };
}

export interface KickoffEpisodeSubControllerDeps {
  getRuntime: () => any;
  getGhostVisuals: () => KickoffGhostVisualsPort | null;
}

export class KickoffEpisodeSubController {
  private readonly deps: KickoffEpisodeSubControllerDeps;
  private readonly state: KickoffEpisodeState = createKickoffEpisodeState();
  private ghostInitPromise: Promise<RocketSimPhysicsEngine> | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(deps: KickoffEpisodeSubControllerDeps) {
    this.deps = deps;
  }

  public async ensureGhostEngine(): Promise<RocketSimPhysicsEngine> {
    if (this.state.ghostSim?.isInitialized) return this.state.ghostSim;
    if (this.ghostInitPromise) return this.ghostInitPromise;
    this.ghostInitPromise = createIsolatedKickoffGhostSim().then((sim) => {
      this.state.ghostSim = sim;
      this.state.ghostPrevState = sim.state.slice();
      this.state.ghostCurrState = sim.state.slice();
      return sim;
    });
    return this.ghostInitPromise;
  }

  public waitForReady(): Promise<void> {
    return this.readyPromise ?? Promise.resolve();
  }

  public onEnter(initialSpawnIndex = 0): void {
    const r = this.deps.getRuntime();
    this.state.subMode = 'instant';
    this.state.ghostPlacement = 'same';
    this.state.ghostModeEnabled = true;
    this.state.spawnIndex = initialSpawnIndex;
    this.readyPromise = Promise.all([this.ensureGhostEngine(), preloadKickoffV1BestWeights()]).then(
      () => {
        if (r?.match?.state?.mode === 'kickoff-training') this.selectSpawn(this.state.spawnIndex);
      }
    );
  }

  public onExit(): void {
    this.state.countdownTicks = 0;
    this.state.goalResetTicks = 0;
    this.state.latchedSec.clear();
  }

  public getConfigSnapshot(): KickoffEpisodeConfigSnapshot {
    return {
      spawnIndex: this.state.spawnIndex,
      subMode: this.state.subMode,
      ghostPlacement: this.state.ghostPlacement,
      ghostModeEnabled: this.state.ghostModeEnabled,
    };
  }

  public applyConfigPatch(patch: KickoffEpisodeConfigPatch): void {
    if (patch.spawnIndex !== undefined) this.state.spawnIndex = patch.spawnIndex;
    if (patch.subMode !== undefined) {
      this.state.subMode =
        patch.subMode === 'realistic' || patch.subMode === 'easy-learning'
          ? patch.subMode
          : 'instant';
    }
    if (patch.ghostPlacement !== undefined) {
      this.state.ghostPlacement = patch.ghostPlacement === 'opposite' ? 'opposite' : 'same';
    }
    if (patch.ghostModeEnabled !== undefined) {
      this.state.ghostModeEnabled = Boolean(patch.ghostModeEnabled);
    }
    if (patch.ghostVisibility) {
      this.deps
        .getGhostVisuals()
        ?.setEntityVisibility(
          this.state.ghostModeEnabled && Boolean(patch.ghostVisibility.showCar),
          this.state.ghostModeEnabled && Boolean(patch.ghostVisibility.showBall)
        );
    }
  }

  public selectSpawn(spawnIndex = this.state.spawnIndex): void {
    const clamped = Math.max(0, Math.min(4, Math.round(spawnIndex)));
    const store = useKickoffTrainingStore.getState();
    this.state.ghostPlacement = (store.ghostPlacement || 'same') as KickoffGhostPlacement;
    this.state.ghostModeEnabled = store.ghostModeEnabled ?? true;
    if (!this.state.ghostModeEnabled && this.state.ghostPlacement === 'same' && clamped === 2) {
      return;
    }
    this.state.spawnIndex = clamped;
    if (store.spawnIndex !== clamped) useKickoffTrainingStore.setState({ spawnIndex: clamped });
    this.resetEpisode(clamped);
  }

  public getOpponentControls(): KickoffCarControls | null {
    return !this.state.ghostModeEnabled ? this.state.ghostCtrl : null;
  }

  public resetEpisode(spawnIndex = this.state.spawnIndex): void {
    const r = this.deps.getRuntime();
    const ghostVisuals = this.deps.getGhostVisuals();
    const store = useKickoffTrainingStore.getState();
    const s = this.state;
    const neutral = r?.neutralControls || NEUTRAL_KICKOFF_CONTROLS;

    s.subMode = (store.subMode || 'instant') as KickoffSubMode;
    s.ghostPlacement = (store.ghostPlacement || 'same') as KickoffGhostPlacement;
    s.ghostModeEnabled = store.ghostModeEnabled ?? true;
    s.episodeTick = 0;
    s.playerTouchedBall = false;
    s.playerTouchTick = null;
    s.goalResetTicks = 0;
    s.ghostRawCtrl = { ...neutral };
    s.ghostCtrl = { ...neutral };

    if (s.ghostSim?.isInitialized && s.ghostPrevState && s.ghostCurrState) {
      const pre = precomputeKickoffGhostTimeline(
        s.ghostSim,
        s.ghostAgent,
        spawnIndex,
        s.ghostPrevState,
        s.ghostCurrState,
        95
      );
      s.timeline = pre.timeline;
      s.aiTouchTick = pre.aiTouchTick;
    }

    ghostVisuals?.setGhostPlacement(s.ghostPlacement);
    ghostVisuals?.setVisible(s.ghostModeEnabled);
    ghostVisuals?.resetTrail();

    const isRealistic = s.subMode === 'realistic';
    const waitTicks = isRealistic ? store.realisticWaitTicks || 480 : 0;
    s.phase = isRealistic ? 'countdown' : 'waiting-for-input';
    s.countdownTicks = waitTicks;
    s.countdownElapsed = 0;
    s.latchedSec.clear();

    if (r?.physics) {
      s.ghostAgent.reset();
      s.solidAgent.reset();
      const res = resetKickoffSpawnInPhysics({
        physics: r.physics,
        arena: r.arena ?? null,
        spawnIndex,
        playerCarIndex: r.playerCarIndex ?? 0,
        selectedHitbox: r.selectedHitbox || 'default',
        neutralControls: neutral,
        ghostModeEnabled: s.ghostModeEnabled,
        ghostPlacement: s.ghostPlacement,
        settleImmediate: !isRealistic,
      });
      s.aiTeamSign = res.aiTeamSign;
      s.preSettleCar0State = res.preSettleCar0State;
      s.preSettleCar1State = res.preSettleCar1State;
      r.ballTrajectoryPredictor?.clear?.();
      r.audioSubsystem?.resetAudio?.();
      r.arena?.resetBallTrail?.();
      r.camera?.resetView?.();
      r.interpolator?.sync?.();
    }

    if (isRealistic) {
      syncKickoffMatchAndHudPhase(
        r?.match?.state,
        'kickoff',
        scheduleKickoffCountdownSignal(r?.physics, waitTicks)
      );
    } else {
      r?.physics?.setSimulationFrozen?.(true, 0, true);
      syncKickoffMatchAndHudPhase(r?.match?.state, 'playing', 0);
    }

    syncKickoffEpisodeResetStoreState(s);
  }

  public onBeforePhysicsTick(): boolean {
    const r = this.deps.getRuntime();
    if (!r?.physics) return true;
    return stepKickoffPreTickPhase(this.state, r);
  }

  public step(): boolean {
    const r = this.deps.getRuntime();
    if (!r?.physics) return true;

    if (this.state.phase === 'countdown') {
      stepKickoffCountdownTick(this.state, r);
      return true;
    }
    if (this.state.phase === 'waiting-for-input') {
      r.physics.step(1);
      return true;
    }

    stepKickoffRunningTick(this.state, r.physics, this.deps.getGhostVisuals());
    if (this.state.goalResetTicks > 0 && --this.state.goalResetTicks === 0) {
      this.resetEpisode(this.state.spawnIndex);
    }
    return true;
  }

  public updateFrame(context: KickoffFrameUpdateContext): void {
    const r = this.deps.getRuntime();
    const ghostVisuals = this.deps.getGhostVisuals();
    const { goalScored, playerCarView, dt } = context;

    if (goalScored && this.state.goalResetTicks === 0) this.state.goalResetTicks = 54;
    if (playerCarView) {
      hudStore.getState().setBoost(playerCarView.boost, playerCarView.isBoosting, false);
    }
    if (
      this.state.ghostModeEnabled &&
      ghostVisuals &&
      this.state.ghostPrevState &&
      this.state.ghostCurrState
    ) {
      ghostVisuals.update(
        this.state.ghostPrevState,
        this.state.ghostCurrState,
        r?.interpolator?.alpha ?? 0,
        dt ?? 0.016,
        this.state.ghostCtrl
      );
    }
  }
}
