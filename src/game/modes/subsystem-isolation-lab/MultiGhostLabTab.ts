import { RocketSimPhysicsEngine } from '../../../physics/RocketSimPhysicsEngine.ts';
import {
  type GhostWorldUpdateOptions,
  MultiWorldGhostRenderer,
} from '../MultiWorldGhostRenderer.ts';
import { useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type {
  LabFrameUpdateContext,
  LabPhysicsEnginePort,
  LabTabContext,
  LabTabController,
} from './LabTabTypes.ts';

export const MULTI_WORLD_SPAWN_PRESETS = Object.freeze([
  { pos: [0, -2560, 17.05] as const, rot: [0, Math.PI / 2, 0] as const },
  { pos: [0, 2560, 17.05] as const, rot: [0, -Math.PI / 2, 0] as const },
  { pos: [-1952, -2464, 17.05] as const, rot: [0, Math.PI / 4, 0] as const },
  { pos: [1952, 2464, 17.05] as const, rot: [0, (-3 * Math.PI) / 4, 0] as const },
  { pos: [1952, -2464, 17.05] as const, rot: [0, (3 * Math.PI) / 4, 0] as const },
  { pos: [-1952, 2464, 17.05] as const, rot: [0, -Math.PI / 4, 0] as const },
  { pos: [-256, -3840, 17.05] as const, rot: [0, Math.PI / 2, 0] as const },
  { pos: [256, 3840, 17.05] as const, rot: [0, -Math.PI / 2, 0] as const },
]);

export interface GhostWorldInstance {
  worldId: string;
  worldIndex: number;
  sim: RocketSimPhysicsEngine;
  prevState: Float32Array;
  currState: Float32Array;
}

export interface ExternalGhostWorldFeed {
  worldId: string;
  prevState: Float32Array;
  currState: Float32Array;
  options: GhostWorldUpdateOptions;
}

export function computeMultiWorldCarSpawnState(
  slotIndex: number,
  worldIndex: number,
  xSpreadPerWorld = 160
): {
  pos: [number, number, number];
  vel: [number, number, number];
  angVel: [number, number, number];
  rot: [number, number, number];
  boost: number;
} {
  const preset =
    MULTI_WORLD_SPAWN_PRESETS[(slotIndex + worldIndex) % MULTI_WORLD_SPAWN_PRESETS.length];
  return {
    pos: [
      preset.pos[0] + worldIndex * xSpreadPerWorld * (slotIndex % 2 === 0 ? 1 : -1),
      preset.pos[1],
      preset.pos[2],
    ],
    vel: [0, 0, 0],
    angVel: [0, 0, 0],
    rot: [preset.rot[0], preset.rot[1], preset.rot[2]],
    boost: 100,
  };
}

export class MultiGhostLabTab implements LabTabController {
  readonly tabId = 'multi-ghost' as const;
  private ctx: LabTabContext | null = null;
  private ghostWorlds: GhostWorldInstance[] = [];
  private externalGhostWorlds = new Map<string, ExternalGhostWorldFeed>();
  private ghostWorldsInitPromise: Promise<GhostWorldInstance[]> | null = null;
  private ghostVisuals: MultiWorldGhostRenderer | null = null;
  private currentActiveWorldIdx = 0;

  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
    const runtime = ctx.runtime;
    if (!this.ghostVisuals && runtime?.arena) {
      this.ghostVisuals = new MultiWorldGhostRenderer(runtime.arena);
    }
    this.syncDualWorldConfiguration(true);
  }

  onDeactivate(): void {
    if (this.ghostVisuals) {
      this.ghostVisuals.setVisible(false);
    }
    this.ctx = null;
  }

  onPhysicsTick(_dt: number): boolean {
    const store = useSubsystemIsolationLabStore.getState();
    if (!store.dualWorldEnabled) {
      return true;
    }

    const runtime = this.ctx?.runtime;
    const ghostCount = Math.max(1, Math.min(3, (store.ghostWorldCount || 2) - 1));
    const carsPerWorld = Math.max(1, Math.min(8, store.ghostCarsPerWorld || 1));

    for (let i = 0; i < Math.min(ghostCount, this.ghostWorlds.length); i++) {
      const gw = this.ghostWorlds[i];
      if (!gw?.sim?.isInitialized) continue;
      gw.prevState.set(gw.currState);
      for (let c = 0; c < Math.min(carsPerWorld, gw.sim.numCars); c++) {
        if (runtime?.neutralControls) {
          gw.sim.setControls(c, runtime.neutralControls);
        }
      }
      gw.sim.step(1);
      gw.currState.set(gw.sim.state);
    }
    return true;
  }

  onRenderFrame(frameCtx: LabFrameUpdateContext): void {
    const store = useSubsystemIsolationLabStore.getState();
    if (!store.dualWorldEnabled || !this.ghostVisuals) return;

    const runtime = this.ctx?.runtime;
    const alpha = runtime?.interpolator?.alpha ?? frameCtx.alpha ?? 1.0;
    const frameDt = frameCtx.dt ?? 0.016;
    const ghostCount = Math.max(1, Math.min(3, (store.ghostWorldCount || 2) - 1));

    for (let i = 0; i < Math.min(ghostCount, this.ghostWorlds.length); i++) {
      const gw = this.ghostWorlds[i];
      if (!gw?.sim?.isInitialized) continue;
      this.ghostVisuals.updateWorld(gw.worldId, gw.prevState, gw.currState, alpha, frameDt, {
        paletteIndex: i + 1,
        controls: runtime?.neutralControls ?? null,
        showBall: true,
      });
    }

    for (const ext of this.externalGhostWorlds.values()) {
      this.ghostVisuals.updateWorld(
        ext.worldId,
        ext.prevState,
        ext.currState,
        alpha,
        frameDt,
        ext.options || { showBall: true }
      );
    }
  }

  syncExternalGhostWorld(
    worldId: string,
    prevState: Float32Array | number[],
    currState: Float32Array | number[],
    options: GhostWorldUpdateOptions = {}
  ): void {
    if (!prevState || !currState) return;
    this.externalGhostWorlds.set(worldId, {
      worldId,
      prevState: prevState instanceof Float32Array ? prevState : new Float32Array(prevState),
      currState: currState instanceof Float32Array ? currState : new Float32Array(currState),
      options,
    });
  }

  private configureWorldCarsCount(
    sim: LabPhysicsEnginePort | null | undefined,
    carsPerWorld = 1,
    worldIndex = 0,
    syncArenaVisuals = false,
    forceReset = false
  ): void {
    if (!sim) return;
    const targetCount = Math.max(1, Math.min(8, Math.round(carsPerWorld || 1)));
    if (forceReset && worldIndex === 0) {
      sim.resetGoalLatch?.();
      sim.resetKickoff?.(0, false);
    }
    while (sim.numCars > targetCount && typeof sim.removeCar === 'function') {
      sim.removeCar(sim.numCars - 1);
    }
    const existingCars = sim.numCars;
    while (sim.numCars < targetCount) {
      const slotIdx = sim.numCars;
      const team = slotIdx % 2;
      sim.addCar(team, 'octane');
    }
    sim.setUnlimitedBoost(true);

    const startCarIdx = forceReset ? (worldIndex === 0 ? 1 : 0) : existingCars;
    for (let c = startCarIdx; c < targetCount; c++) {
      sim.setCarLinearFactorAndGravity?.(c, 1, 1, 1, 1);
      sim.setCarCollisionMask?.(c, true, true);
      sim.setCarState(c, computeMultiWorldCarSpawnState(c, worldIndex, 160));
    }

    const runtime = this.ctx?.runtime;
    if (syncArenaVisuals && runtime?.arena) {
      const arena = runtime.arena;
      for (let i = 0; i < targetCount; i++) {
        arena.ensureCar?.(i, i % 2, 'fennec');
        if (arena.cars[i]) arena.cars[i].visible = true;
        if (forceReset || i >= existingCars) {
          arena.resetCarBoosts?.(i);
        }
      }
      for (let i = targetCount; i < arena.cars.length; i++) {
        if (arena.cars[i]) arena.cars[i].visible = false;
        arena.resetCarBoosts?.(i);
        arena.carDemolitions?.[i]?.stop?.();
      }
    }
  }

  private resetSecondaryWorldSpawn(
    sim: LabPhysicsEnginePort | null | undefined,
    worldIndex = 1,
    carsPerWorld = 1
  ): void {
    if (!sim) return;
    sim.resetGoalLatch?.();
    sim.resetKickoff(0, false);
    this.configureWorldCarsCount(sim, carsPerWorld, worldIndex, false, false);
    for (let c = 0; c < Math.min(8, carsPerWorld); c++) {
      sim.setCarState(c, computeMultiWorldCarSpawnState(c, worldIndex, 180));
    }
    sim.setBallState({
      pos: [worldIndex * 220 * (worldIndex % 2 === 1 ? 1 : -1), 0, 93.15],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
    });
    sim.step(1);
  }

  private async ensureGhostWorldEngines(
    ghostEngineCount = 1,
    carsPerWorld = 1,
    forceReset = false
  ): Promise<GhostWorldInstance[]> {
    const needed = Math.max(1, Math.min(7, ghostEngineCount));
    if (this.ghostWorldsInitPromise) {
      await this.ghostWorldsInitPromise;
    }

    this.ghostWorldsInitPromise = (async () => {
      const preCount = this.ghostWorlds.length;
      while (this.ghostWorlds.length < needed) {
        const wIdx = this.ghostWorlds.length + 1;
        const sim = new RocketSimPhysicsEngine();
        await sim.init({
          collisionData: RocketSimPhysicsEngine.cachedCollisionData ?? undefined,
          freshInstance: true,
          isolated: true,
        });
        sim.configureCars('default', false, 0);
        this.resetSecondaryWorldSpawn(sim, wIdx, carsPerWorld);
        this.ghostWorlds.push({
          worldId: `world-${wIdx}`,
          worldIndex: wIdx,
          sim,
          prevState: sim.state.slice(),
          currState: sim.state.slice(),
        });
      }
      for (let i = 0; i < needed; i++) {
        const gw = this.ghostWorlds[i];
        if (forceReset && i < preCount) {
          this.resetSecondaryWorldSpawn(gw.sim, i + 1, carsPerWorld);
        } else {
          this.configureWorldCarsCount(gw.sim, carsPerWorld, i + 1, false, false);
        }
        gw.prevState.set(gw.sim.state);
        gw.currState.set(gw.sim.state);
      }
      return this.ghostWorlds.slice(0, needed);
    })();

    return this.ghostWorldsInitPromise;
  }

  syncDualWorldConfiguration(forceRestart = false): void {
    const runtime = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    const epoch = this.ctx?.getSwitchEpoch() ?? 0;

    if (!this.ghostVisuals && runtime?.arena) {
      this.ghostVisuals = new MultiWorldGhostRenderer(runtime.arena);
    }

    if (store.activeTab === 'multi-ghost' && store.dualWorldEnabled) {
      const totalWorlds = Math.max(2, Math.min(4, store.ghostWorldCount || 2));
      const ghostCount = totalWorlds - 1;
      const carsPerWorld = Math.max(1, Math.min(8, store.ghostCarsPerWorld || 1));

      if (forceRestart) {
        this.currentActiveWorldIdx = 0;
        store.updateLiveTelemetry({ activeWorldIndex: 0 });
      }

      if (runtime?.physics) {
        this.configureWorldCarsCount(runtime.physics, carsPerWorld, 0, true, forceRestart);
        runtime.interpolator?.sync?.();
      }

      this.ensureGhostWorldEngines(ghostCount, carsPerWorld, forceRestart).then((ghostList) => {
        const latestStore = useSubsystemIsolationLabStore.getState();
        if (
          this.ctx?.getSwitchEpoch() !== epoch ||
          latestStore.activeTab !== 'multi-ghost' ||
          !latestStore.dualWorldEnabled ||
          !this.ghostVisuals
        ) {
          return;
        }
        const opacity = latestStore.ghostOpacity;

        for (let i = 0; i < this.ghostWorlds.length; i++) {
          const gw = this.ghostWorlds[i];
          const isActiveGhost = i < ghostList.length;
          this.ghostVisuals.ensureWorld(gw.worldId, {
            paletteIndex: i + 1,
            opacity,
            showCar: true,
            showBall: true,
          });
          this.ghostVisuals.setVisible(isActiveGhost, gw.worldId);
        }
        this.ghostVisuals.setVisible(true);
        this.ghostVisuals.setOpacity(opacity);
      });
    } else if (this.ghostVisuals) {
      this.ghostVisuals.setVisible(false);
    }
  }

  handleSwitchWorld(): void {
    const runtime = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    if (store.activeTab !== 'multi-ghost' || !store.dualWorldEnabled) return;

    const totalWorlds = Math.max(2, Math.min(4, store.ghostWorldCount || 2));
    const ghostCount = totalWorlds - 1;
    const carsPerWorld = Math.max(1, Math.min(8, store.ghostCarsPerWorld || 1));
    if (!runtime?.physics || this.ghostWorlds.length < ghostCount) return;

    const primarySnap = runtime.physics.saveCompactState();
    const ghostSnaps: Float32Array[] = [];
    for (let i = 0; i < ghostCount; i++) {
      ghostSnaps.push(this.ghostWorlds[i].sim.saveCompactState());
    }

    runtime.physics.restoreState(ghostSnaps[0]);
    this.configureWorldCarsCount(runtime.physics, carsPerWorld, 0, true, false);
    runtime.arena?.resetAllCarEffects?.();

    for (let i = 0; i < ghostCount - 1; i++) {
      this.ghostWorlds[i].sim.restoreState(ghostSnaps[i + 1]);
    }
    this.ghostWorlds[ghostCount - 1].sim.restoreState(primarySnap);

    runtime.interpolator?.sync?.();
    for (let i = 0; i < ghostCount; i++) {
      const gw = this.ghostWorlds[i];
      gw.prevState.set(gw.sim.state);
      gw.currState.set(gw.sim.state);
    }
    if (this.ghostVisuals) {
      this.ghostVisuals.setOpacity(store.ghostOpacity);
    }
  }
}
