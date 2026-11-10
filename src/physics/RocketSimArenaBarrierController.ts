/**
 * RocketSimArenaBarrierController.ts
 * Self-contained domain module (Mode 2) managing arena initialization, preset switching,
 * kickoff resets, goal volume box synchronization, dynamic goal barrier collision mesh
 * reloading, and scoring checks without holding a parent host reference.
 */

import {
  loadRocketSimWasmModule,
  type RocketSimWasmModule,
  type RocketSimWasmModuleOptions,
} from './RocketSimWasm.ts';
import {
  PLAYER_CAR_INDEX,
  BOT_CAR_INDEX,
  getTeamAssignment,
  fetchArenaCollisionMeshes,
  initWasmCollisionMeshes,
} from './RocketSimMeshLoader.ts';
import { SIM_OFFSETS, EVENT_TOTAL_BUFFER_BYTES } from './RocketSimConstants.ts';
import { initWasmBallPrediction } from './ballPredictionPipeline.ts';
import { PhysicsEventReader } from './PhysicsEventReader.ts';
import {
  getGoalVolumeBoxForPreset,
  registerGoalVolumeTunerApplier,
} from '../ui-core/config/goalVolumeTunerConfig.ts';
import {
  syncGoalVolumeBoxToWasm,
  checkPointOnGoalBarrier,
  evaluateBallScored,
  reloadArenaCollisionMeshes,
  applyGoalBarrierChunksToWasmArena,
  type GoalVolumeBoxConfig,
  type GoalBarrierMetadata,
  type CarSpecEntry,
} from './goalBarrierVolumePipeline.ts';

export type { GoalVolumeBoxConfig, GoalBarrierMetadata, CarSpecEntry };

export interface ArenaEngineBootstrapOptions extends RocketSimWasmModuleOptions {
  collisionData?: Uint8Array[] | null;
}

export interface ArenaBarrierSimTarget {
  module: RocketSimWasmModule | null;
  isInitialized: boolean;
  statePtr: number;
  stateLen: number;
  controlsPtr: number;
  eventBufferPtr: number;
  eventBufferSize: number;
  eventReader: PhysicsEventReader | null;
  stateView: Float32Array | null;
  controlsView: Float32Array | null;
  readonly state: Float32Array;
  readonly numCars: number;
  readonly isUnlimitedBoost: boolean;
  _carSpecs: Array<CarSpecEntry | null>;
  arenaPreset: number;
  ballStateWriteRevision: number;
  readonly eventDispatcher: { resetFloorTouchLatch(): void };
  readonly possessionTracker: {
    preserveBeforeKickoff(state: Float32Array | null, preserveScore: boolean): void;
    applyAccumulatedPossessionToState(
      mod: RocketSimWasmModule | null,
      state: Float32Array | null
    ): void;
  };
  getCachedCollisionData(): Uint8Array[] | null;
  setCachedCollisionData(data: Uint8Array[] | null): void;
  getCurrentTick(): number;
  addCar(team: number, hitboxType?: string | number): number;
  setCarThreeWheels(carIndex: number, enabled: boolean): boolean;
  setUnlimitedBoost(unlimited: boolean): void;
  saveState(): Float32Array;
  restoreState(buffer: Float32Array): boolean;
}

export class RocketSimArenaBarrierController {
  public arenaPreset = 0;
  public goalVolumeBox: GoalVolumeBoxConfig = getGoalVolumeBoxForPreset(false);
  public baseCollisionData: Uint8Array[] | null = null;
  public goalBarrierChunks: Uint8Array[] = [];
  public goalBarrierMeta: GoalBarrierMetadata | null = null;
  private wasmMod: RocketSimWasmModule | null = null;

  constructor() {
    const weakThis = new WeakRef(this);
    registerGoalVolumeTunerApplier(() => {
      const self = weakThis.deref();
      if (!self) return;
      self.goalVolumeBox = getGoalVolumeBoxForPreset(self.arenaPreset === 1);
      syncGoalVolumeBoxToWasm(self.wasmMod, self.arenaPreset, self.goalVolumeBox);
    });
  }

  public bindWasmModule(mod: RocketSimWasmModule | null): void {
    this.wasmMod = mod;
  }

  public async initEngine(
    sim: ArenaBarrierSimTarget,
    options: ArenaEngineBootstrapOptions = {}
  ): Promise<void> {
    if (options.collisionData) sim.setCachedCollisionData(options.collisionData);
    const mod = await loadRocketSimWasmModule(options);
    sim.module = mod;
    this.wasmMod = mod;
    sim.isInitialized = true;

    const collisionData = await fetchArenaCollisionMeshes(sim.getCachedCollisionData());
    sim.setCachedCollisionData(collisionData);
    initWasmCollisionMeshes(mod, this.getEffectiveCollisionChunks(collisionData));

    if (mod._physics_createArena() !== 1) throw new Error('Arena creation failed');
    syncGoalVolumeBoxToWasm(mod, this.arenaPreset, this.goalVolumeBox);
    initWasmBallPrediction(mod, 5.0);
    sim._carSpecs = [];

    sim.statePtr = mod._physics_getStatePtr();
    sim.stateLen = mod._physics_getStateSize();
    sim.controlsPtr = mod._physics_getControlsPtr();

    if (typeof mod._physics_getEventBufferPtr === 'function') {
      sim.eventBufferPtr = mod._physics_getEventBufferPtr();
      sim.eventBufferSize = mod._physics_getEventBufferSize?.() ?? EVENT_TOTAL_BUFFER_BYTES;
      sim.eventReader = new PhysicsEventReader(mod, sim.eventBufferPtr);
    } else {
      sim.eventReader = null;
    }

    sim.stateView = null;
    sim.controlsView = null;
    mod._physics_initReplayBuffer?.();
    if (sim.eventReader && mod.HEAPU8?.buffer) {
      sim.eventReader.attach(mod, sim.eventBufferPtr);
    }
  }

  public clearEvents(sim: ArenaBarrierSimTarget): void {
    const mod = sim.module;
    mod?._physics_clearEvents?.();
    if (sim.eventReader && mod?.HEAPU8?.buffer && sim.eventReader.buffer !== mod.HEAPU8.buffer) {
      sim.eventReader.attach(mod, sim.eventBufferPtr);
    }
    sim.eventReader?.reset();
  }

  public configureCars(
    sim: ArenaBarrierSimTarget,
    hitboxType: string | number,
    isMatch: boolean,
    defaultPlayerTeam = 0
  ): void {
    const mod = sim.module!;
    const { playerTeam, botTeam } = getTeamAssignment(hitboxType === 'flat');
    if (mod._physics_createArena() !== 1) throw new Error('Arena creation failed');
    syncGoalVolumeBoxToWasm(mod, this.arenaPreset, this.goalVolumeBox);
    initWasmBallPrediction(mod, 5.0);
    sim._carSpecs = [];
    this.clearEvents(sim);
    if (sim.addCar(isMatch ? playerTeam : defaultPlayerTeam, hitboxType) !== PLAYER_CAR_INDEX) {
      throw new Error('Player creation failed');
    }
    if (isMatch && sim.addCar(botTeam, 'octane') !== BOT_CAR_INDEX) {
      throw new Error('Opponent creation failed');
    }
    this.resetKickoff(sim);
  }

  public resetKickoff(sim: ArenaBarrierSimTarget, seed = -1, preservePossessionScore = true): void {
    const mod = sim.module;
    sim.eventDispatcher.resetFloorTouchLatch();
    sim.ballStateWriteRevision = (sim.ballStateWriteRevision + 1) | 0;
    if (sim.controlsView) {
      if (sim.controlsView.buffer === mod?.HEAPF32?.buffer) sim.controlsView.fill(0);
      else sim.controlsView = null;
    }
    const state = mod ? sim.state : null;
    sim.possessionTracker.preserveBeforeKickoff(state, preservePossessionScore);
    mod!._physics_resetKickoff(seed);
    sim.possessionTracker.applyAccumulatedPossessionToState(mod, mod ? sim.state : null);
    this.clearEvents(sim);
  }

  public resetKickoffAtSpawn(
    sim: ArenaBarrierSimTarget,
    spawnIndex = 0,
    settleTicks = 30
  ): boolean {
    if (sim.controlsView) sim.controlsView.fill(0);
    const ok = sim.module?._physics_resetKickoffAtSpawn?.(spawnIndex, settleTicks) === 1;
    sim.ballStateWriteRevision = (sim.ballStateWriteRevision + 1) | 0;
    this.clearEvents(sim);
    return ok;
  }

  public getEffectiveCollisionChunks(collisionData: Uint8Array[]): Uint8Array[] {
    this.baseCollisionData = collisionData;
    return this.goalBarrierChunks.length > 0
      ? [...collisionData, ...this.goalBarrierChunks]
      : collisionData;
  }

  public setArenaPreset(presetIndex = 0, mod: RocketSimWasmModule | null = this.wasmMod): number {
    this.arenaPreset = presetIndex === 1 ? 1 : 0;
    this.goalVolumeBox = getGoalVolumeBoxForPreset(this.arenaPreset === 1);
    mod?._physics_setArenaPreset?.(this.arenaPreset);
    syncGoalVolumeBoxToWasm(mod, this.arenaPreset, this.goalVolumeBox);
    return this.arenaPreset;
  }

  public getArenaPreset(mod: RocketSimWasmModule | null = this.wasmMod): number {
    const typedMod = mod as { _physics_getArenaPreset?: () => number } | null;
    return typedMod?._physics_getArenaPreset?.() ?? this.arenaPreset ?? 0;
  }

  public isBallScored(
    ballView: { posX: number; posY: number; posZ: number } | null | undefined,
    mod: RocketSimWasmModule | null = this.wasmMod
  ): boolean {
    return evaluateBallScored(
      ballView,
      this.getArenaPreset(mod),
      this.goalVolumeBox,
      this.goalBarrierMeta
    );
  }

  public async reloadMeshes(
    mod: RocketSimWasmModule | null = this.wasmMod,
    manifestPath = '/arenamesh/manifest.json'
  ): Promise<boolean> {
    const collisionData = await reloadArenaCollisionMeshes(
      mod,
      this.goalBarrierChunks,
      manifestPath
    );
    if (!collisionData) return false;
    this.baseCollisionData = collisionData;
    return true;
  }

  public setGoalBarrierChunks(
    sim: ArenaBarrierSimTarget,
    barrierChunks: Uint8Array[] = [],
    barrierMeta: GoalBarrierMetadata | null = null
  ): boolean {
    const nextChunks = Array.isArray(barrierChunks) ? barrierChunks : [];
    const hadChunks = this.goalBarrierChunks.length > 0;
    this.goalBarrierChunks = nextChunks;
    this.goalBarrierMeta = barrierMeta;
    if (!hadChunks && nextChunks.length === 0) return true;

    const mod = sim.module;
    const baseData = this.baseCollisionData || sim.getCachedCollisionData();
    if (!mod || !sim.isInitialized || !baseData || baseData.length === 0) {
      return false;
    }

    const currentTick = sim.getCurrentTick();
    const savedSpecs = sim._carSpecs.map((spec) => (spec ? { ...spec } : null));
    const savedNumCars = Math.max(savedSpecs.length, sim.numCars || 0);
    const savedUnlimited = sim.isUnlimitedBoost;
    const savedPreset = this.getArenaPreset(mod);
    const snap = sim.saveState();

    sim.arenaPreset = this.setArenaPreset(savedPreset, mod);
    if (
      !applyGoalBarrierChunksToWasmArena(
        mod,
        baseData,
        this.goalBarrierChunks,
        this.arenaPreset,
        this.goalVolumeBox
      )
    ) {
      return false;
    }

    initWasmBallPrediction(mod, 5.0);
    sim._carSpecs = [];
    for (let i = 0; i < savedNumCars; i++) {
      const spec = savedSpecs[i] || { team: i % 2, hitboxIndex: 0, threeWheels: false };
      sim.addCar(spec.team, spec.hitboxIndex);
      if (spec.threeWheels) sim.setCarThreeWheels(i, true);
    }
    sim.setUnlimitedBoost(savedUnlimited);
    if (currentTick > 0) sim.state[SIM_OFFSETS.TICK] = currentTick;
    sim.stateView = null;
    sim.controlsView = null;

    if (snap) sim.restoreState(snap);
    return true;
  }

  public isPointOnGoalBarrier(xUu: number, yUu: number, zUu: number): boolean {
    return checkPointOnGoalBarrier(this.goalBarrierMeta, xUu, yUu, zUu);
  }

  public isBallSleeping(
    bv: { velX: number; velY: number; velZ: number },
    mod: RocketSimWasmModule | null = this.wasmMod
  ): boolean {
    if (typeof mod?._physics_isBallSleeping === 'function')
      return mod._physics_isBallSleeping() !== 0;
    return bv.velX === 0 && bv.velY === 0 && bv.velZ === 0;
  }

  public pollGoal(goalScoredFlag: number, mod: RocketSimWasmModule | null = this.wasmMod): number {
    if (goalScoredFlag !== 0) mod!._physics_clearGoalFlag();
    return goalScoredFlag;
  }
}
