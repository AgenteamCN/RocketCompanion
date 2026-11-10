/**
 * PhysicsStateInterpolator.ts
 * 120Hz deterministic physics state accumulator and linear interpolator.
 *
 * Provides smooth rendering at any monitor refresh rate (60Hz, 120Hz, 144Hz, 240Hz, etc.)
 * by interpolating between prevState and currState using alpha = accumulator / timestep.
 * Prevents spiral-of-death by capping max simulated substeps to 12 ticks (100ms) per frame.
 */

import {
  SIM_OFFSETS,
  CAR_STATE_STRIDE,
  BALL_STATE_STRIDE,
  FIXED_TIMESTEP,
  MAX_PHYSICS_SUBSTEPS,
} from './RocketSimConstants.ts';
import {
  ArenaHeaderView,
  CarStateView,
  BallStateView,
  BoostPadStateView,
} from './RocketSimStateViews.ts';

export class PhysicsStateInterpolator {
  sim: any;
  prevState: Float32Array;
  currState: Float32Array;
  alpha: number;
  lastTicks: number;
  lastDropped: number;
  lastStalled: boolean;
  accumulator: number;
  lastTime: number;
  _physicsRate: number;
  currHeaderView: ArenaHeaderView | null;
  prevHeaderView: ArenaHeaderView | null;
  currBallView: BallStateView | null;
  prevBallView: BallStateView | null;
  currCarViews: CarStateView[];
  prevCarViews: CarStateView[];
  currPadViews: BoostPadStateView[];
  prevPadViews: BoostPadStateView[];
  onPhysicsRateChange?: ((rate: number) => void) | null;

  constructor(sim: any) {
    this.sim = sim;
    this.prevState = sim.state.slice();
    this.currState = sim.state.slice();

    this.alpha = 0;
    this.lastTicks = 0;
    this.lastDropped = 0;
    this.lastStalled = false;
    this.accumulator = 0;
    this.lastTime = -1;
    this._physicsRate = 120;

    this.currHeaderView = null;
    this.prevHeaderView = null;
    this.currBallView = null;
    this.prevBallView = null;
    this.currCarViews = [];
    this.prevCarViews = [];
    this.currPadViews = [];
    this.prevPadViews = [];
  }

  /**
   * Get zero-allocation ArenaHeaderView attached to currState
   * @returns {ArenaHeaderView}
   */
  getCurrHeaderView() {
    if (!this.currHeaderView) {
      this.currHeaderView = new ArenaHeaderView();
    }
    return this.currHeaderView.attach(this.currState);
  }

  /**
   * Get zero-allocation ArenaHeaderView attached to prevState
   * @returns {ArenaHeaderView}
   */
  getPrevHeaderView() {
    if (!this.prevHeaderView) {
      this.prevHeaderView = new ArenaHeaderView();
    }
    return this.prevHeaderView.attach(this.prevState);
  }

  /**
   * Number of active cars in current physics state
   * @returns {number}
   */
  get numCars() {
    return this.currState ? this.getCurrHeaderView().numCars : 0;
  }

  /**
   * Get zero-allocation BallStateView attached to currState
   * @returns {BallStateView}
   */
  getCurrBallStateView() {
    if (!this.currBallView) {
      this.currBallView = new BallStateView();
    }
    this.currBallView.attach(this.currState);
    return this.currBallView;
  }

  /**
   * Get zero-allocation BallStateView attached to prevState
   * @returns {BallStateView}
   */
  getPrevBallStateView() {
    if (!this.prevBallView) {
      this.prevBallView = new BallStateView();
    }
    this.prevBallView.attach(this.prevState);
    return this.prevBallView;
  }

  /**
   * Get zero-allocation CarStateView attached to currState
   * @param {number} carIndex
   * @returns {CarStateView}
   */
  getCurrCarStateView(carIndex = 0) {
    if (!this.currCarViews[carIndex]) {
      this.currCarViews[carIndex] = new CarStateView();
    }
    this.currCarViews[carIndex].attachCar(this.currState, carIndex);
    return this.currCarViews[carIndex];
  }

  /**
   * Get zero-allocation CarStateView attached to prevState
   * @param {number} carIndex
   * @returns {CarStateView}
   */
  getPrevCarStateView(carIndex = 0) {
    if (!this.prevCarViews[carIndex]) {
      this.prevCarViews[carIndex] = new CarStateView();
    }
    this.prevCarViews[carIndex].attachCar(this.prevState, carIndex);
    return this.prevCarViews[carIndex];
  }

  /**
   * Get zero-allocation BoostPadStateView attached to currState
   * @param {number} padIndex
   * @returns {BoostPadStateView}
   */
  getCurrBoostPadStateView(padIndex = 0) {
    if (!this.currPadViews[padIndex]) {
      this.currPadViews[padIndex] = new BoostPadStateView();
    }
    return this.currPadViews[padIndex].attach(this.currState, padIndex);
  }

  /**
   * Get zero-allocation BoostPadStateView attached to prevState
   * @param {number} padIndex
   * @returns {BoostPadStateView}
   */
  getPrevBoostPadStateView(padIndex = 0) {
    if (!this.prevPadViews[padIndex]) {
      this.prevPadViews[padIndex] = new BoostPadStateView();
    }
    return this.prevPadViews[padIndex].attach(this.prevState, padIndex);
  }

  /**
   * Synchronize ball state immediately without resetting car states
   */
  syncBall() {
    const ballSlice = this.sim.state.subarray(
      SIM_OFFSETS.BALL,
      SIM_OFFSETS.BALL + BALL_STATE_STRIDE
    );
    this.prevState.set(ballSlice, SIM_OFFSETS.BALL);
    this.currState.set(ballSlice, SIM_OFFSETS.BALL);
  }

  /**
   * Synchronize both previous and current states to the simulation state and reset accumulator
   * @param {number} time timestamp (ms)
   */
  sync(time = performance.now()) {
    this.prevState.set(this.sim.state);
    this.currState.set(this.sim.state);
    this.accumulator = 0;
    this.alpha = 0;
    this.lastTime = time;
    this.lastTicks = 0;
  }

  /**
   * Client physics clock rate in Hz (nominal: 120Hz).
   * Pacing adjusts accumulator flow rate: speedFactor = physicsRate / 120.
   * Supports fractional Hz for STS / CSTS / Adaptive clock-pacing algorithms.
   */
  get physicsRate() {
    return this._physicsRate ?? 120;
  }

  set physicsRate(rate) {
    this.setPhysicsRate(rate);
  }

  getPhysicsRate() {
    return this.physicsRate;
  }

  /**
   * Set client physics clock rate in Hz.
   * @param {number} rate Target frequency in Hz (nominal 120)
   * @param {{ min?: number, max?: number, round?: boolean }} [options]
   * @returns {number} Applied physics rate in Hz
   */
  setPhysicsRate(rate: number, options: { min?: number; max?: number; round?: boolean } = {}) {
    const num = Number(rate);
    if (!Number.isFinite(num)) return this.physicsRate;
    const min = Number.isFinite(options.min) ? options.min! : 108;
    const max = Number.isFinite(options.max) ? options.max! : 132;
    const normalized = options.round ? Math.round(num) : Math.round(num * 100) / 100;
    const nextRate = Math.max(min, Math.min(max, normalized));
    const prevRate = this._physicsRate;
    this._physicsRate = nextRate;
    if (prevRate !== nextRate && typeof this.onPhysicsRateChange === 'function') {
      this.onPhysicsRateChange(nextRate);
    }
    return this._physicsRate;
  }

  /**
   * Adjust client physics clock rate by a delta in Hz.
   * @param {number} deltaHz Delta in Hz (can be fractional, e.g. -0.5 or +1)
   * @param {{ min?: number, max?: number, round?: boolean }} [options]
   * @returns {number} Applied physics rate in Hz
   */
  adjustPhysicsRate(deltaHz, options = {}) {
    const delta = Number(deltaHz);
    if (!Number.isFinite(delta)) return this.physicsRate;
    return this.setPhysicsRate(this.physicsRate + delta, options);
  }

  /**
   * Set physics clock scale multiplier relative to nominal 120Hz (e.g. 0.99 -> 118.8Hz, 1.01 -> 121.2Hz).
   * Designed for STS / CSTS / Adaptive time-dilation controllers.
   * @param {number} scale Multiplier relative to 120Hz
   * @param {{ min?: number, max?: number, round?: boolean }} [options]
   * @returns {number} Applied physics rate in Hz
   */
  setPhysicsTickScale(scale, options = {}) {
    const num = Number(scale);
    if (!Number.isFinite(num) || num <= 0) return this.physicsRate;
    return this.setPhysicsRate(120 * num, options);
  }

  /**
   * Get current physics clock scale multiplier relative to nominal 120Hz.
   * @returns {number}
   */
  getPhysicsTickScale() {
    return this.physicsRate / 120;
  }

  /**
   * Reset client physics clock rate to nominal 120Hz.
   * @returns {number}
   */
  resetPhysicsRate() {
    return this.setPhysicsRate(120);
  }

  /**
   * Set exact N/120 physics flow rate (N in [1, 600]) for Kickoff Training & DevTestLab speed control (up to 500%).
   */
  setTrainingPhysicsRate(rate) {
    return this.setPhysicsRate(rate, { min: 1, max: 600, round: true });
  }

  /**
   * Advance the physics accumulator and execute 120Hz physics ticks
   * @param {number} currentTime performance.now() timestamp (ms)
   * @param {() => void} beforeStepCallback Callback to read & apply player controls before stepping
   * @param {(() => boolean) | undefined} stepCallback Optional tick callback (used in Match mode to evaluate AI bot)
   */
  update(currentTime, beforeStepCallback, stepCallback) {
    if (this.lastTime < 0) {
      this.lastTime = currentTime;
    }

    const rawDeltaSec = (currentTime - this.lastTime) / 1000;
    this.lastStalled = rawDeltaSec > 0.25;
    const speedFactor = (this._physicsRate || 120) / 120;
    const deltaSec = rawDeltaSec * speedFactor;
    const maxAccumSec = 0.25 * Math.max(1, speedFactor);
    const maxSubsteps = Math.round(MAX_PHYSICS_SUBSTEPS * Math.max(1, speedFactor));
    this.accumulator += Math.min(deltaSec, maxAccumSec);
    this.lastTime = currentTime;

    let ticksToRun = Math.floor(this.accumulator / FIXED_TIMESTEP);
    this.accumulator = Math.max(0, this.accumulator - ticksToRun * FIXED_TIMESTEP);
    this.lastDropped = Math.max(0, ticksToRun - maxSubsteps);

    if (ticksToRun > maxSubsteps) {
      ticksToRun = maxSubsteps;
      this.accumulator = 0;
    }
    this.lastTicks = 0;

    if (ticksToRun > 0) {
      const loopStartMs = typeof performance !== 'undefined' ? performance.now() : 0;
      const maxWallBudgetMs = 28 * Math.max(1, Math.min(2, speedFactor));

      for (let i = 0; i < ticksToRun; i++) {
        if (beforeStepCallback) {
          const shouldProceed = beforeStepCallback();
          if (shouldProceed === false) {
            continue;
          }
        }

        this.prevState.set(this.currState);

        if (stepCallback) {
          if (!stepCallback()) {
            this.accumulator = 0;
            break;
          }
        } else {
          this.sim.step(1);
        }

        this.currState.set(this.sim.state);
        this.lastTicks++;

        if (
          i + 1 < ticksToRun &&
          loopStartMs > 0 &&
          performance.now() - loopStartMs > maxWallBudgetMs
        ) {
          this.lastDropped += ticksToRun - (i + 1);
          this.accumulator = 0;
          break;
        }
      }
      this.alpha = this.accumulator / FIXED_TIMESTEP;
    } else {
      this.alpha = Math.min(this.accumulator / FIXED_TIMESTEP, 1);
    }
  }
}

export default PhysicsStateInterpolator;
