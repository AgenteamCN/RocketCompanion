/**
 * src/physics/DeterminismHarness.ts
 * Dual-Arena Side-by-Side Determinism Verification Harness.
 *
 * Runs two independent RocketSim physics engines simultaneously:
 * - Arena A (Ground Truth): Standard 120Hz continuous forward stepping.
 * - Arena B (Reconciliation): Applies identical inputs, but continuously triggers periodic
 *   or manual rollbacks (10-60 ticks) and resimulates via stepSilent() to catch up to present.
 *
 * Compares Float-by-Float / Vector positions & velocities every frame to guarantee 100% bit-exact determinism.
 */

import { RocketSimPhysicsEngine } from './RocketSimPhysicsEngine.ts';
import type { CarControlsInput } from './RocketSimSnapshotSerializer.ts';
import {
  createInitialDeterminismMetrics,
  primeAllSimStateSlots,
  pruneControlsHistoryBeforeTick,
  recordTickCarControls,
  ensureTickControlsMap,
  evaluateDualArenaStateDelta,
  type DeterminismMetrics,
  type DeterminismTickHistorySlot,
} from './determinismEvaluationPipeline.ts';

export type { DeterminismMetrics, DeterminismTickHistorySlot };

export class DeterminismHarness {
  simA: RocketSimPhysicsEngine;
  simB: RocketSimPhysicsEngine | null = null;
  options: Record<string, unknown>;
  active = false;
  periodicRollback = true;
  rollbackInterval = 30;
  rollbackDepth = 15;
  totalRollbacks = 0;
  historyCapacity = 2048;
  historyMask = 2047;
  controlsHistory: Array<DeterminismTickHistorySlot | null | undefined>;
  lastKnownControls = new Map<number, CarControlsInput>();
  lastResetTick = 0;
  metrics: DeterminismMetrics = createInitialDeterminismMetrics();
  onMetricsUpdated: ((metrics: DeterminismMetrics) => void) | null = null;
  _metricsListeners = new Set<(metrics: DeterminismMetrics) => void>();
  _originalMethods: Record<string, (...args: never[]) => unknown> = {};

  constructor(primarySim: RocketSimPhysicsEngine, options: Record<string, unknown> = {}) {
    this.simA = primarySim;
    this.options = options;
    this.controlsHistory = Array.from({ length: this.historyCapacity });
  }

  private _patchMetrics(patch: Partial<DeterminismMetrics>): void {
    Object.assign(this.metrics, patch);
  }

  addMetricsListener(fn: (metrics: DeterminismMetrics) => void): () => void {
    if (typeof fn === 'function') {
      this._metricsListeners.add(fn);
      return () => this._metricsListeners.delete(fn);
    }
    return () => {};
  }

  notifyMetricsUpdated(): void {
    if (this.onMetricsUpdated) {
      try {
        this.onMetricsUpdated(this.metrics);
      } catch (err) {
        console.error('[DeterminismHarness] Error in onMetricsUpdated callback:', err);
      }
    }
    for (const listener of this._metricsListeners) {
      try {
        listener(this.metrics);
      } catch (err) {
        console.error('[DeterminismHarness] Error in metrics listener:', err);
      }
    }
  }

  async init(): Promise<this> {
    const secondarySim = new RocketSimPhysicsEngine();
    await secondarySim.init({ freshInstance: true, isolated: true });
    this.simB = secondarySim;

    const numCarsA = this.simA.numCars;
    for (let i = 0; i < numCarsA; i++) {
      secondarySim.addCar(0, 0);
    }

    secondarySim.setUnlimitedBoost(this.simA.isUnlimitedBoost);
    secondarySim.restoreState(this.simA.saveState());
    primeAllSimStateSlots(secondarySim);

    this._interceptSimA();
    this.active = true;
    return this;
  }

  _interceptSimA(): void {
    const origSetControls = this.simA.setControls.bind(this.simA);
    this._originalMethods.setControls = origSetControls as (...args: never[]) => unknown;
    this.simA.setControls = (carIndex, controls) => {
      origSetControls(carIndex, controls);
      this.recordControls(carIndex, controls);
    };

    const origStep = this.simA.step.bind(this.simA);
    this._originalMethods.step = origStep as (...args: never[]) => unknown;
    this.simA.step = (ticks = 1) => {
      for (let i = 0; i < ticks; i++) {
        origStep(1);
        this.onPhysicsTickOneStep();
      }
      this.compareStates();
    };

    const origSetUnlimitedBoost = this.simA.setUnlimitedBoost.bind(this.simA);
    this._originalMethods.setUnlimitedBoost = origSetUnlimitedBoost as (
      ...args: never[]
    ) => unknown;
    this.simA.setUnlimitedBoost = (unlimited) => {
      origSetUnlimitedBoost(unlimited);
      this.simB?.setUnlimitedBoost(unlimited);
    };

    const origResetKickoff = this.simA.resetKickoff.bind(this.simA);
    this._originalMethods.resetKickoff = origResetKickoff as (...args: never[]) => unknown;
    this.simA.resetKickoff = (seed = -1) => {
      origResetKickoff(seed);
      this.syncResetKickoff(seed);
    };

    const origControlBall = this.simA.controlBall.bind(this.simA);
    this._originalMethods.controlBall = origControlBall as (...args: never[]) => unknown;
    this.simA.controlBall = (carIndex, modeIndex) => {
      const res = origControlBall(carIndex, modeIndex);
      this.syncControlBall(carIndex, modeIndex);
      return res;
    };

    const origAddCar = this.simA.addCar.bind(this.simA);
    this._originalMethods.addCar = origAddCar as (...args: never[]) => unknown;
    this.simA.addCar = (team, hitboxType) => {
      const carIdx = origAddCar(team, hitboxType);
      this.simB?.addCar(team, hitboxType);
      return carIdx;
    };

    if (typeof this.simA.setCarState === 'function') {
      const origSetCarState = this.simA.setCarState.bind(this.simA);
      this._originalMethods.setCarState = origSetCarState as (...args: never[]) => unknown;
      this.simA.setCarState = (carIndex, stateObj) => {
        const res = origSetCarState(carIndex, stateObj);
        const secondarySim = this.simB;
        if (secondarySim && typeof secondarySim.setCarState === 'function') {
          secondarySim.setCarState(carIndex, stateObj);
          this.lastResetTick = Math.floor(this.simA.getHeaderView().tickCount);
          primeAllSimStateSlots(secondarySim);
        }
        return res;
      };
    }

    if (typeof this.simA.setCarLinearFactorAndGravity === 'function') {
      const origSetLinear = this.simA.setCarLinearFactorAndGravity.bind(this.simA);
      this._originalMethods.setCarLinearFactorAndGravity = origSetLinear as (
        ...args: never[]
      ) => unknown;
      this.simA.setCarLinearFactorAndGravity = (carIndex, fx, fy, fz, gravityScale) => {
        const res = origSetLinear(carIndex, fx, fy, fz, gravityScale);
        this.simB?.setCarLinearFactorAndGravity?.(carIndex, fx, fy, fz, gravityScale);
        return res;
      };
    }

    if (typeof this.simA.setCarCollisionMask === 'function') {
      const origSetCollision = this.simA.setCarCollisionMask.bind(this.simA);
      this._originalMethods.setCarCollisionMask = origSetCollision as (...args: never[]) => unknown;
      this.simA.setCarCollisionMask = (carIndex, interactWithBall, interactWithCars) => {
        const res = origSetCollision(carIndex, interactWithBall, interactWithCars);
        this.simB?.setCarCollisionMask?.(carIndex, interactWithBall, interactWithCars);
        return res;
      };
    }
  }

  setRollbackDepth(depth: number): void {
    this.rollbackDepth = Math.max(1, Math.min(240, Math.floor(Number(depth) || 15)));
  }

  setRollbackInterval(interval: number): void {
    this.rollbackInterval = Math.max(1, Math.min(600, Math.floor(Number(interval) || 30)));
  }

  recordControls(carIndex: number, controls: CarControlsInput): void {
    if (!this.active) return;
    const currentTick = Math.floor(this.simA.getHeaderView().tickCount);
    recordTickCarControls(
      this.controlsHistory,
      this.historyMask,
      this.lastKnownControls,
      currentTick,
      carIndex,
      controls
    );
  }

  _ensureTickControls(tick: number): Record<number, CarControlsInput> {
    return ensureTickControlsMap(
      this.controlsHistory,
      this.historyMask,
      this.lastKnownControls,
      tick
    );
  }

  onPhysicsTickOneStep(): void {
    const secondarySim = this.simB;
    if (!this.active || !secondarySim) return;

    const preTick = Math.floor(secondarySim.getHeaderView().tickCount);
    const controlsMap = this._ensureTickControls(preTick);

    for (const [carIdxStr, ctrl] of Object.entries(controlsMap)) {
      secondarySim.setControls(Number(carIdxStr), ctrl);
    }

    secondarySim.saveStateSlot(preTick % 256);
    secondarySim.step(1);

    const postTick = preTick + 1;
    if (
      this.periodicRollback &&
      postTick > this.rollbackDepth &&
      postTick % this.rollbackInterval === 0
    ) {
      this.executeRollback(this.rollbackDepth);
    }
  }

  executeRollback(depth = 15): void {
    const secondarySim = this.simB;
    if (!this.active || !secondarySim) return;

    const currentTick = Math.floor(this.simA.getHeaderView().tickCount);
    const targetRollbackTick = Math.max(this.lastResetTick, currentTick - Math.min(depth, 250));
    const actualDepth = currentTick - targetRollbackTick;
    if (actualDepth <= 0) return;

    const startTime = performance.now();
    secondarySim.restoreStateSlot(targetRollbackTick % 256);

    for (let t = targetRollbackTick; t < currentTick; t++) {
      const entry = this.controlsHistory[t & this.historyMask];
      const controlsMap = entry && entry.tick === t ? entry.controls : {};
      for (const [carIdxStr, ctrl] of Object.entries(controlsMap)) {
        secondarySim.setControls(Number(carIdxStr), ctrl);
      }
      secondarySim.stepSilent(1);
    }

    const duration = performance.now() - startTime;
    this.totalRollbacks++;
    this._patchMetrics({
      totalRollbacks: this.totalRollbacks,
      currentDepth: actualDepth,
      lastRollbackDurationMs: duration,
    });
    this.compareStates();
  }

  triggerManualRollback(depth = this.rollbackDepth): void {
    this.executeRollback(depth);
    this.compareStates();
  }

  private _resyncSecondaryArenaFromPrimary(currentTick: number): void {
    const secondarySim = this.simB;
    if (!secondarySim) return;
    this.lastResetTick = currentTick;
    secondarySim.restoreState(this.simA.saveState());
    primeAllSimStateSlots(secondarySim);
    pruneControlsHistoryBeforeTick(this.controlsHistory, currentTick);
    this.compareStates();
  }

  syncResetKickoff(seed = -1): void {
    const secondarySim = this.simB;
    if (!this.active || !secondarySim) return;
    const currentTick = Math.floor(this.simA.getHeaderView().tickCount);
    secondarySim.resetKickoff(seed);
    this._resyncSecondaryArenaFromPrimary(currentTick);
  }

  syncControlBall(carIndex: number, modeIndex: number | string): void {
    const secondarySim = this.simB;
    if (!this.active || !secondarySim) return;
    const currentTick = Math.floor(this.simA.getHeaderView().tickCount);
    secondarySim.controlBall(carIndex, modeIndex);
    this._resyncSecondaryArenaFromPrimary(currentTick);
  }

  compareStates(): void {
    const secondarySim = this.simB;
    if (!this.active || !secondarySim) return;
    this._patchMetrics(evaluateDualArenaStateDelta(this.simA, secondarySim, this.metrics));
    this.notifyMetricsUpdated();
  }

  resetStats(): void {
    this.totalRollbacks = 0;
    this._patchMetrics({
      totalRollbacks: 0,
      maxDeltaPos: 0,
      maxDeltaVel: 0,
      maxDeltaBall: 0,
      isBitExact: true,
    });
    this.notifyMetricsUpdated();
  }

  resetMaxDeltas(): void {
    this._patchMetrics({
      maxDeltaPos: 0,
      maxDeltaVel: 0,
      maxDeltaBall: 0,
      isBitExact: this.metrics.carDeltaPos === 0 && this.metrics.ballDeltaPos === 0,
    });
    this.notifyMetricsUpdated();
  }

  destroy(): void {
    this.active = false;
    const simTarget = this.simA as unknown as Record<string, unknown>;
    for (const [key, origFn] of Object.entries(this._originalMethods)) {
      simTarget[key] = origFn;
    }
    this._originalMethods = {};

    const secondarySim = this.simB;
    if (secondarySim) {
      secondarySim.destroy();
      this.simB = null;
    }
    this.controlsHistory = [];
    this.lastKnownControls.clear();
  }
}

export default DeterminismHarness;
