/**
 * KickoffTrainingMode.ts
 * Dedicated Kickoff Training game mode powered by the optimal PPO model from RLRL101.
 * Delegates episode physics, dual-world ghost simulation, spawn settling, and timeline
 * comparison to KickoffEpisodeSubController.ts.
 */

import { BaseGameMode } from './BaseGameMode.ts';
import {
  KickoffEpisodeSubController,
  type KickoffSubMode,
  type KickoffGhostPlacement,
  type KickoffFrameUpdateContext,
} from './KickoffEpisodeSubController.ts';
import { KickoffGhostVisuals } from './KickoffGhostVisuals.ts';
import { useKickoffTrainingStore, hudStore } from '../runtimeUiPort.ts';
import { getPreferredFreeplayTeam } from '../../ui-core/config/vehiclePresets.ts';

export class KickoffTrainingMode extends BaseGameMode {
  public ghostVisuals: KickoffGhostVisuals | null = null;
  public readonly episodeController: KickoffEpisodeSubController;

  constructor(runtime: Record<string, any> | null) {
    super('kickoff-training', runtime);
    this.episodeController = new KickoffEpisodeSubController({
      getRuntime: () => this.runtime,
      getGhostVisuals: () => this.ghostVisuals,
    });
  }

  public get spawnIndex(): number {
    return this.episodeController.getConfigSnapshot().spawnIndex;
  }

  public set spawnIndex(val: number) {
    this.episodeController.applyConfigPatch({ spawnIndex: val });
  }

  public get subMode(): KickoffSubMode {
    return this.episodeController.getConfigSnapshot().subMode;
  }

  public set subMode(val: KickoffSubMode) {
    this.episodeController.applyConfigPatch({ subMode: val });
  }

  public get ghostPlacement(): KickoffGhostPlacement {
    return this.episodeController.getConfigSnapshot().ghostPlacement;
  }

  public set ghostPlacement(val: KickoffGhostPlacement) {
    this.episodeController.applyConfigPatch({ ghostPlacement: val });
  }

  public get ghostModeEnabled(): boolean {
    return this.episodeController.getConfigSnapshot().ghostModeEnabled;
  }

  public set ghostModeEnabled(val: boolean) {
    this.episodeController.applyConfigPatch({ ghostModeEnabled: Boolean(val) });
  }

  private isModeActive(actionName: string): boolean {
    const activeMode = this.runtime?.match?.state?.mode;
    if (activeMode !== 'kickoff-training') {
      console.warn(
        `[KickoffTrainingMode] ${actionName} ignored: active mode is "${activeMode ?? 'none'}", requires "kickoff-training".`
      );
      return false;
    }
    return true;
  }

  public override onEnter(): void {
    const r = this.runtime;
    if (r?.keyboard) {
      r.keyboard.ballControlEnabled = false;
    }

    const store = useKickoffTrainingStore.getState();
    store.resetToEntryDefaults?.();

    const handlers: Parameters<typeof store.setRuntimeHandlers>[0] = {};
    handlers.onSelectSpawn = (idx: number) => {
      if (this.isModeActive('onSelectSpawn')) this.episodeController.selectSpawn(idx);
    };
    handlers.onResetSpawn = () => {
      if (this.isModeActive('onResetSpawn')) this.episodeController.selectSpawn(this.spawnIndex);
    };
    handlers.onSubModeChange = (nextSubMode: KickoffSubMode) => {
      this.episodeController.applyConfigPatch({ subMode: nextSubMode });
      if (this.isModeActive('onSubModeChange')) this.episodeController.selectSpawn(this.spawnIndex);
    };
    handlers.onSpeedChange = (physicsRate: number) => {
      if (this.isModeActive('onSpeedChange')) {
        r?.interpolator?.setTrainingPhysicsRate?.(physicsRate);
      }
    };
    handlers.onRealisticWaitChange = () => {
      if (this.isModeActive('onRealisticWaitChange') && this.subMode === 'realistic') {
        this.episodeController.selectSpawn(this.spawnIndex);
      }
    };
    handlers.onGhostPlacementChange = (placement: KickoffGhostPlacement) => {
      this.episodeController.applyConfigPatch({ ghostPlacement: placement });
      if (this.isModeActive('onGhostPlacementChange') && !this.ghostModeEnabled) {
        this.episodeController.selectSpawn(useKickoffTrainingStore.getState().spawnIndex);
      }
    };
    handlers.onGhostModeChange = (enabled: boolean) => {
      this.episodeController.applyConfigPatch({ ghostModeEnabled: enabled });
      if (this.isModeActive('onGhostModeChange')) {
        this.episodeController.selectSpawn(useKickoffTrainingStore.getState().spawnIndex);
      }
    };
    handlers.onGhostVisibilityChange = (showCar: boolean, showBall: boolean) => {
      this.episodeController.applyConfigPatch({ ghostVisibility: { showCar, showBall } });
    };
    store.setRuntimeHandlers(handlers);

    if (r?.arena && !this.ghostVisuals) {
      this.ghostVisuals = new KickoffGhostVisuals(r.arena);
    }
    this.ghostVisuals?.ensureBuilt?.();

    r?.arena?.ensureOpponent?.();
    r?.physics?.setUnlimitedBoost(false);
    r?.interpolator?.setTrainingPhysicsRate?.(120);

    this.episodeController.onEnter(useKickoffTrainingStore.getState().spawnIndex || 0);
  }

  public override onLeave(): void {
    const r = this.runtime;
    useKickoffTrainingStore.getState().setRuntimeHandlers({
      onSelectSpawn: undefined,
      onResetSpawn: undefined,
      onSubModeChange: undefined,
      onSpeedChange: undefined,
      onRealisticWaitChange: undefined,
      onGhostPlacementChange: undefined,
      onGhostModeChange: undefined,
      onGhostVisibilityChange: undefined,
    });

    this.ghostVisuals?.setVisible(false);
    if (r?.arena?.cars?.[1]) {
      r.arena.cars[1].visible = false;
    }
    if (r?.physics) {
      r.physics.setSimulationFrozen?.(false, 0, false);
      const isTrainingUnlimited = r?.trainingOptions?.boostOption === 'unlimited';
      r.physics.setUnlimitedBoost(isTrainingUnlimited);
      r.physics.configureCars(
        r.arena?.carVisual || 'octane',
        false,
        r.teamAssignment?.playerTeam ?? 0
      );
    }
    if (r?.interpolator) {
      r.interpolator.setTrainingPhysicsRate?.(r?.trainingOptions?.gameSpeed || 120);
      r.interpolator.sync();
    }
    if (r?.match?.state) {
      r.match.state.phase = 'playing';
      r.match.state.countdownValue = 0;
    }
    hudStore.getState().setMatchState({
      matchPhase: 'playing',
      countdownText: undefined,
      localTeam: getPreferredFreeplayTeam(),
    });
    this.episodeController.onExit();
  }

  public selectSpawn(spawnIndex?: number): void {
    const targetSpawn = typeof spawnIndex === 'number' ? spawnIndex : this.spawnIndex;
    this.episodeController.selectSpawn(targetSpawn);
  }

  public override onResetKickoff(): void {
    const targetSpawn = this.episodeController.getConfigSnapshot().spawnIndex;
    this.episodeController.resetEpisode(targetSpawn);
  }

  public onBeforePhysicsTick(): boolean {
    if (!this.runtime?.physics) return true;
    return this.episodeController.onBeforePhysicsTick();
  }

  public onStepPhysicsTick(): boolean {
    if (!this.runtime?.physics) return true;
    return this.episodeController.step();
  }

  public override getCarControls(carIndex: number): Record<string, unknown> | null {
    return carIndex === 1
      ? (this.episodeController.getOpponentControls() as unknown as Record<string, unknown> | null)
      : null;
  }

  public override update(context: KickoffFrameUpdateContext): void {
    if (!context) return;
    this.episodeController.updateFrame(context);
  }
}
