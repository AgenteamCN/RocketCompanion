/**
 * RocketSimPhysicsEngine.ts
 * Clean, modern wrapper for RocketSim WebAssembly simulation core (core.wasm).
 */

import type { RocketSimWasmModuleOptions } from './RocketSimWasm.ts';
import { computeFreeplayBallControlState } from './ballPredictionPipeline.ts';
import type { PhysicsEventDispatchCallback } from './PhysicsEventDispatcher.ts';
import type { PossessionStatsSnapshot } from './PhysicsPossessionTracker.ts';
import {
  saveWasmSnapshotState,
  saveCompactStateSnapshot,
  restoreWasmSnapshotState,
  type CarControlsInput,
  type BallStateObjectInput,
  type CarStateObjectInput,
  type RestoreSnapshotOptions,
  type NumericBufferLike,
} from './RocketSimSnapshotSerializer.ts';
import { writeCarControls, applyBallState, applyCarState } from './RocketSimEntityStateMutator.ts';
import type { GoalBarrierMetadata } from './RocketSimArenaBarrierController.ts';
import { checkPointOnGoalBarrier, evaluateBallScored } from './goalBarrierVolumePipeline.ts';
import { RocketSimCarMutatorController } from './RocketSimCarMutatorController.ts';

export interface RocketSimEngineInitOptions extends RocketSimWasmModuleOptions {
  collisionData?: Uint8Array[] | null;
}

export class RocketSimPhysicsEngine extends RocketSimCarMutatorController {
  async init(opts: RocketSimEngineInitOptions = {}): Promise<void> {
    await this.arenaBarriers.initEngine(this, opts);
  }

  clearEvents(): void {
    const mod = this.module;
    if (mod) {
      mod._physics_clearEvents();
      if (this.eventReader && mod.HEAPU8?.buffer && this.eventReader.buffer !== mod.HEAPU8.buffer) {
        this.eventReader.attach(mod, this.eventBufferPtr);
      }
    }
    if (this.eventReader) {
      this.eventReader.reset();
    }
  }

  isBallSleeping(): boolean {
    const mod = this.module;
    if (mod && typeof mod._physics_isBallSleeping === 'function') {
      return mod._physics_isBallSleeping() !== 0;
    }
    const bv = this.getBallStateView();
    return bv.velX === 0 && bv.velY === 0 && bv.velZ === 0;
  }

  setSimulationFrozen(frozen: boolean, resumeTick = 0, maskInputs = false): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_setSimulationFrozen(frozen ? 1 : 0, Math.trunc(resumeTick), maskInputs ? 1 : 0);
  }

  setPossessionReportingEnabled(enabled: boolean): void {
    const flag = Boolean(enabled);
    this.possessionTracker.setReportingEnabled(this.module, flag);
  }

  resetPossessionStats(): void {
    const currentState = this.module ? this.state : null;
    this.possessionTracker.resetPossessionStats(this.module, currentState);
  }

  getPossessionStats(): PossessionStatsSnapshot {
    const currentState = this.module ? this.state : null;
    return this.possessionTracker.getPossessionStats(currentState);
  }

  pushSignalEvent(...args: [number, number, ...number[]]): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_pushSignalEvent(
      args[0],
      args[1],
      args[2] ?? 0,
      args[3] ?? 0,
      args[4] ?? 0,
      args[5] ?? 0,
      args[6] ?? 0,
      args[7] ?? 0,
      args[8] ?? 0,
      args[9] ?? 0,
      args[10] ?? 0,
      args[11] ?? 0,
      args[12] ?? 0,
      args[13] ?? 0
    );
  }

  resetGoalLatch(): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_resetGoalLatch();
  }

  readEvents(callback?: PhysicsEventDispatchCallback): number {
    if (!this.module || !this.eventReader) return 0;
    return this.eventDispatcher.readEvents(this, callback);
  }

  resetKickoffAtSpawn(spawnIndex = 0, settleTicks = 30): boolean {
    const mod = this.module;
    if (!mod) return false;
    if (this.controlsView) {
      this.controlsView.fill(0);
    }
    const ok = mod._physics_resetKickoffAtSpawn(spawnIndex, settleTicks) === 1;
    this._markBallWrite();
    this.clearEvents();
    return ok;
  }

  setArenaPreset(presetIndex = 0): void {
    const normalized = presetIndex === 1 ? 1 : 0;
    this.arenaPreset = this.arenaBarriers.setArenaPreset(normalized, this.module);
  }

  getArenaPreset(): number {
    const mod = this.module;
    if (mod && typeof mod._physics_getArenaPreset === 'function') {
      return mod._physics_getArenaPreset();
    }
    return this.arenaBarriers.arenaPreset || this.arenaPreset || 0;
  }

  isBallScored(bv = this.getBallStateView()): boolean {
    return evaluateBallScored(
      bv,
      this.getArenaPreset(),
      this.arenaBarriers.goalVolumeBox,
      this.arenaBarriers.goalBarrierMeta
    );
  }

  async reloadMeshes(manifestPath = '/arenamesh/manifest.json'): Promise<boolean> {
    if (!this.module) return false;
    return await this.arenaBarriers.reloadMeshes(this.module, manifestPath);
  }

  setGoalBarrierChunks(
    chunks: Uint8Array[] = [],
    meta: GoalBarrierMetadata | null = null
  ): boolean {
    const normalizedChunks = Array.isArray(chunks) ? chunks : [];
    return this.arenaBarriers.setGoalBarrierChunks(this, normalizedChunks, meta);
  }

  isPointOnGoalBarrier(x: number, y: number, z: number): boolean {
    return checkPointOnGoalBarrier(this.arenaBarriers.goalBarrierMeta, x, y, z);
  }

  configureCars(hitboxType: string | number, isMatch: boolean, defaultPlayerTeam = 0): void {
    if (!this.module) {
      throw new Error('Cannot configure cars before physics WASM module is initialized');
    }
    this.arenaBarriers.configureCars(this, hitboxType, isMatch, defaultPlayerTeam);
  }

  setControls(carIndex: number, controls: CarControlsInput): void {
    if (!this.module) return;
    writeCarControls(this.module, this, carIndex, controls);
  }

  setCarControls(carIndex: number, controls: CarControlsInput): void {
    if (!this.module) return;
    writeCarControls(this.module, this, carIndex, controls);
  }

  setCarState(
    carIndex: number,
    carState: number | ArrayLike<number> | CarStateObjectInput | null | undefined
  ): boolean {
    if (!this.module) return false;
    return applyCarState(this.module, this, carIndex, carState);
  }

  private _markBallWrite(): void {
    this.eventDispatcher.resetFloorTouchLatch();
    this.ballStateWriteRevision = (this.ballStateWriteRevision + 1) | 0;
  }

  setBallState(
    ballState: number | ArrayLike<number> | BallStateObjectInput | null | undefined
  ): boolean {
    if (!this.module) return false;
    this._markBallWrite();
    return applyBallState(this.module, this, ballState);
  }

  step(ticks = 1): void {
    this.eventDispatcher.stepWithPadEdgeDetection(this, ticks);
    this.possessionTracker.applyAccumulatedPossessionToState(
      this.module,
      this.module ? this.state : null
    );
  }

  stepSilent(ticks = 1): void {
    const mod = this.module;
    if (!mod) return;
    this.eventDispatcher.resetFloorTouchLatch();
    mod._physics_stepSilent(ticks);
  }

  saveStateSlot(slot: number): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_saveStateSlot(slot) === 1;
  }

  restoreStateSlot(slot: number): boolean {
    const mod = this.module;
    if (!mod) return false;
    this._markBallWrite();
    return mod._physics_restoreStateSlot(slot) === 1;
  }

  getStateSnapshotSize(): number {
    const mod = this.module;
    if (!mod) return 0;
    return mod._physics_getStateSnapshotSize();
  }

  saveState(targetBuffer: Float32Array | null = null): Float32Array {
    if (!this.module) return targetBuffer ?? new Float32Array(0);
    return saveWasmSnapshotState(this.module, this, targetBuffer);
  }

  saveCompactState(targetBuffer: Float32Array | null = null): Float32Array {
    if (!this.module) return targetBuffer ?? new Float32Array(0);
    return saveCompactStateSnapshot(this, targetBuffer);
  }

  restoreState(
    buffer: NumericBufferLike | null | undefined,
    options: RestoreSnapshotOptions = {}
  ): boolean {
    if (!this.module || !buffer) return false;
    this._markBallWrite();
    return restoreWasmSnapshotState(this.module, this, buffer, options);
  }

  restoreCompactState(
    buffer: NumericBufferLike | null | undefined,
    options: RestoreSnapshotOptions = {}
  ): boolean {
    if (!this.module || !buffer) return false;
    this._markBallWrite();
    return restoreWasmSnapshotState(this.module, this, buffer, options);
  }

  resetKickoff(seed = -1, preservePossessionScore = true): void {
    const mod = this.module;
    if (!mod) return;
    this._markBallWrite();
    if (this.controlsView) {
      if (this.controlsView.buffer === mod.HEAPF32.buffer) {
        this.controlsView.fill(0);
      } else {
        this.controlsView = null;
      }
    }
    this.possessionTracker.preserveBeforeKickoff(this.state, preservePossessionScore);
    mod._physics_resetKickoff(seed);
    this.possessionTracker.applyAccumulatedPossessionToState(mod, this.state);
    this.clearEvents();
  }

  controlBall(carIndex: number, mode: number | string): boolean {
    if (!this.module || !this.isCarSlotActive(carIndex)) return false;
    const cv = this.getCarStateView(carIndex);
    const target = computeFreeplayBallControlState(
      { posX: cv.posX, posY: cv.posY, posZ: cv.posZ, fwdX: cv.fwdX, fwdY: cv.fwdY, fwdZ: cv.fwdZ },
      mode
    );
    return target ? this.setBallState(target) : false;
  }

  pollGoal(): number {
    const mod = this.module;
    if (!mod) return 0;
    const flag = this.getHeaderView().goalScoredFlag;
    if (flag !== 0) {
      mod._physics_clearGoalFlag();
    }
    return flag;
  }

  get ballRadius(): number {
    const mod = this.module;
    return mod ? mod._physics_getBallRadius() : 91.25;
  }

  get ballOnGround(): boolean {
    const mod = this.module;
    const wasmGrounded = mod ? mod._physics_getBallOnGround() === 1 : false;
    return wasmGrounded || Boolean(this.eventDispatcher.ballTouchedFloorInLastStep);
  }

  getBallOnGround(): boolean {
    const mod = this.module;
    const wasmGrounded = mod ? mod._physics_getBallOnGround() === 1 : false;
    return wasmGrounded || Boolean(this.eventDispatcher.ballTouchedFloorInLastStep);
  }

  destroy(): void {
    const mod = this.module;
    if (this.wasmStatePtr && mod && typeof mod._free === 'function') {
      mod._free(this.wasmStatePtr);
      this.wasmStatePtr = 0;
      this.wasmStateSize = 0;
      this.cachedSnapshotBuffer = null;
    }
    this.arenaBarriers.bindWasmModule(null);
    this.module = null;
    this.stateView = null;
    this.controlsView = null;
    this.eventReader = null;
    this.headerViewInstance = null;
    this.ballStateViewInstance = null;
    this.carStateViewInstances = [];
    this.boostPadStateViewInstances = [];
  }
}

export default RocketSimPhysicsEngine;
