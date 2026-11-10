import { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import { MAX_INPUT_BUFFER_TICKS, NetworkInputBuffer } from './NetworkInputBuffer.ts';
import type { CarControlsInput } from '../protocol/GlobalPayloadCodec.ts';
import {
  LobbyGhostCarCoordinator,
  evaluatePhysicsSignalTransition,
  type LobbyGhostConfigOptions,
  type PhysicsSignalData,
} from './LobbyGhostCarCoordinator.ts';
import {
  syncCarSlotWithSim,
  type AuthoritativePhysicsSimPort,
  type AuthoritativePhysicsStepOutput,
} from './authoritativePhysicsStepPipeline.ts';
import {
  checkSimBallOnGround,
  computeActiveCarMask,
  executeAuthoritativePhysicsTickStep,
  executeKickoffResetOnSim,
  readSimCurrentTick,
  resetSimBallToCenter,
  writeSimCurrentTick,
} from './authoritativePhysicsEngineHelpers.ts';

export type { PhysicsSignalData };

export type PhysicsOutputCallback = (output: AuthoritativePhysicsStepOutput) => void;

export interface PhysicsEngineManagerOptions {
  sim?: AuthoritativePhysicsSimPort;
  inputBuffer?: NetworkInputBuffer | null;
  maxBufferTicks?: number;
  onPhysicsOutput?: PhysicsOutputCallback | null;
  lobbyGhostCoordinator?: LobbyGhostCarCoordinator;
  lobbyGhostOptions?: LobbyGhostConfigOptions;
  isRecordingFullReplay?: boolean;
}

export class PhysicsEngineManager {
  sim: AuthoritativePhysicsSimPort;
  inputBuffer: NetworkInputBuffer | null;
  maxBufferTicks: number;
  onPhysicsOutput: PhysicsOutputCallback | null;
  activeCarIndices: Set<number>;
  directControls: Map<number, CarControlsInput>;
  lobbyGhostCoordinator: LobbyGhostCarCoordinator;
  isMasked: boolean;
  maskUntilFrame: number;
  private _isPaused: boolean;
  goalLatched: boolean;
  goalScoredAtTick: number;
  frozenBallSnapshot: Float32Array | null;
  isRecordingFullReplay: boolean;
  lastAcknowledgedControls: Map<number, CarControlsInput>;
  jumpSuppressedCarIndices: Set<number>;
  lastBallTouchCarIndex?: number;
  lastBallTouchTick?: number;

  constructor(options: PhysicsEngineManagerOptions = {}) {
    this.sim =
      options.sim || (new RocketSimPhysicsEngine() as unknown as AuthoritativePhysicsSimPort);
    this.inputBuffer = options.inputBuffer || null;
    this.maxBufferTicks = options.maxBufferTicks ?? MAX_INPUT_BUFFER_TICKS;
    this.onPhysicsOutput = options.onPhysicsOutput || null;

    this.activeCarIndices = new Set();
    this.directControls = new Map();
    this.lobbyGhostCoordinator =
      options.lobbyGhostCoordinator || new LobbyGhostCarCoordinator(options.lobbyGhostOptions);

    this.isMasked = false;
    this.maskUntilFrame = -1;
    this._isPaused = false;

    this.goalLatched = false;
    this.goalScoredAtTick = -1;
    this.frozenBallSnapshot = null;
    this.isRecordingFullReplay = Boolean(options.isRecordingFullReplay ?? false);

    this.lastAcknowledgedControls = new Map();
    this.jumpSuppressedCarIndices = new Set();
    if (this.sim?.isInitialized) {
      this.sim.initReplayBuffer?.();
    }
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  set isPaused(val: boolean) {
    this._isPaused = Boolean(val);
    if (this.inputBuffer) {
      this.inputBuffer.isPaused = this._isPaused;
    }
  }

  async init(): Promise<this> {
    if (!this.sim.isInitialized) {
      await this.sim.init?.();
    }
    this.sim.setPossessionReportingEnabled?.(true);
    this.sim.initReplayBuffer?.();
    return this;
  }

  getPossessionStats(): { team: number; bluePoints: number; orangePoints: number; time: number } {
    if (typeof this.sim?.getPossessionStats === 'function') {
      return this.sim.getPossessionStats();
    }
    return { team: 0, bluePoints: 0, orangePoints: 0, time: 0 };
  }

  setCarCollisionMask(
    carIndex: number,
    interactWithBall = true,
    interactWithCars = true,
    opacity: number | undefined = undefined
  ) {
    return this.lobbyGhostCoordinator.applyCarCollisionMask(
      this.sim,
      carIndex,
      interactWithBall,
      interactWithCars,
      opacity
    );
  }

  setLobbyGhostMode(enabled = true, config: LobbyGhostConfigOptions = {}) {
    this.inputBuffer?.setLobbyMode?.(Boolean(enabled));
    return this.lobbyGhostCoordinator.configureLobbyMode(this.sim, this.activeCarIndices, {
      ...config,
      enabled,
    });
  }

  syncLobbyGhostMasks(): void {
    if (this.lobbyGhostCoordinator.lobbyModeActive) {
      this.lobbyGhostCoordinator.configureLobbyMode(this.sim, this.activeCarIndices, {
        enabled: true,
      });
    }
  }

  restoreSolidCollisions() {
    this.inputBuffer?.setLobbyMode?.(false);
    return this.lobbyGhostCoordinator.restoreSolidCollisions(this.sim, this.activeCarIndices);
  }

  getActiveCarMask(): number {
    return computeActiveCarMask(this.sim, this.activeCarIndices);
  }

  registerCarEntity(carIndex: number, team = 0, config = 'octane'): number {
    const wasActive = this.activeCarIndices.has(carIndex);
    this.activeCarIndices.add(carIndex);
    this.inputBuffer?.registerCar(carIndex);

    syncCarSlotWithSim(this.sim, carIndex, team, config, wasActive);

    if (!wasActive && this.sim) {
      this.sim.setCarLinearFactorAndGravity?.(carIndex, 1, 1, 1, 1);
      this.setCarCollisionMask(carIndex, true, true, 1.0);
    }

    if (this.lobbyGhostCoordinator.lobbyModeActive) {
      this.syncLobbyGhostMasks();
    }
    return carIndex;
  }

  unregisterCarEntity(carIndex: number): void {
    this.activeCarIndices.delete(carIndex);
    this.directControls.delete(carIndex);
    this.lastAcknowledgedControls.delete(carIndex);
    this.inputBuffer?.unregisterCar(carIndex);
    this.sim?.removeCar?.(carIndex);
  }

  get currentTick(): number {
    return readSimCurrentTick(this.sim);
  }

  set currentTick(val: number) {
    writeSimCurrentTick(this.sim, val);
  }

  pushInput(carIndex: number, targetTick: number, controls: CarControlsInput): boolean {
    if (!this.activeCarIndices.has(carIndex)) {
      return false;
    }
    if (this.inputBuffer) {
      return this.inputBuffer.pushInput(carIndex, this.currentTick, targetTick, controls);
    }
    this.directControls.set(carIndex, { ...controls });
    return true;
  }

  setDirectCarControls(carIndex: number, controls: CarControlsInput): boolean {
    if (!this.activeCarIndices.has(carIndex)) {
      return false;
    }
    this.directControls.set(carIndex, { ...controls });
    return true;
  }

  pushRedundantInputs(
    carIndex: number,
    inputList: Array<{ tick?: number; targetTick?: number; controls?: CarControlsInput }>
  ): number {
    if (!this.inputBuffer) {
      return 0;
    }
    return this.inputBuffer.pushRedundantInputs(carIndex, this.currentTick, inputList);
  }

  getInputBufferSize(carIndex: number): number {
    if (!this.inputBuffer) {
      return 0;
    }
    return this.inputBuffer.getInputBufferSize(carIndex, this.currentTick);
  }

  setInputMask(isMasked: boolean, untilFrame = -1): void {
    this.isMasked = isMasked;
    this.maskUntilFrame = untilFrame;
  }

  shouldMaskInputs(tick: number): boolean {
    if (this.isPaused) {
      return true;
    }
    if (this.maskUntilFrame >= 0) {
      if (tick < this.maskUntilFrame) {
        return true;
      }
      this.maskUntilFrame = -1;
      this.isMasked = false;
      return false;
    }
    return this.isMasked;
  }

  resetGoalLatch(): void {
    this.goalLatched = false;
    this.goalScoredAtTick = -1;
    this.frozenBallSnapshot = null;
    this.sim?.resetGoalLatch?.();
    this.sim?.pollGoal?.();
  }

  applySignal(signalType: number | string, data: PhysicsSignalData = {}): void {
    const next = evaluatePhysicsSignalTransition(
      signalType,
      data,
      {
        isPaused: this.isPaused,
        isRecordingFullReplay: this.isRecordingFullReplay,
        isMasked: this.isMasked,
        maskUntilFrame: this.maskUntilFrame,
      },
      {
        sim: this.sim,
        lobbyModeActive: Boolean(this.lobbyGhostCoordinator?.lobbyModeActive),
        resetGoalLatch: () => this.resetGoalLatch(),
        restoreSolidCollisions: () => {
          this.restoreSolidCollisions();
        },
        resetKickoff: (seed) => this.resetKickoff(seed),
        resetBallToCenter: () => this.resetBallToCenter(),
        clearInputBuffer: () => {
          this.inputBuffer?.clear();
        },
        setCarCollisionMask: (carIndex, interactWithBall, interactWithCars, opacity) => {
          this.setCarCollisionMask(carIndex, interactWithBall, interactWithCars, opacity);
        },
        setLobbyGhostMode: (enabled, config) => {
          this.setLobbyGhostMode(enabled, config);
        },
      }
    );
    this.isPaused = next.isPaused;
    this.isRecordingFullReplay = next.isRecordingFullReplay;
    this.isMasked = next.isMasked;
    this.maskUntilFrame = next.maskUntilFrame;
  }

  stepAuthoritativeTick(): AuthoritativePhysicsStepOutput {
    const currentTick = this.currentTick;
    const stepResult = executeAuthoritativePhysicsTickStep({
      sim: this.sim,
      isPaused: this.isPaused,
      currentTick,
      activeCarMask: this.getActiveCarMask(),
      maskInputs: this.shouldMaskInputs(currentTick),
      activeCarIndices: this.activeCarIndices,
      directControls: this.directControls,
      inputBuffer: this.inputBuffer,
      lastAcknowledgedControls: this.lastAcknowledgedControls,
      jumpSuppressedCarIndices: this.jumpSuppressedCarIndices,
      lobbyGhostCoordinator: this.lobbyGhostCoordinator,
      isRecordingFullReplay: this.isRecordingFullReplay,
      goalLatched: this.goalLatched,
      goalScoredAtTick: this.goalScoredAtTick,
      frozenBallSnapshot: this.frozenBallSnapshot,
      lastBallTouchCarIndex: this.lastBallTouchCarIndex,
      lastBallTouchTick: this.lastBallTouchTick,
    });
    this.goalLatched = stepResult.goalLatched;
    this.goalScoredAtTick = stepResult.goalScoredAtTick;
    this.frozenBallSnapshot = stepResult.frozenBallSnapshot;
    this.lastBallTouchCarIndex = stepResult.lastBallTouchCarIndex;
    this.lastBallTouchTick = stepResult.lastBallTouchTick;
    this.onPhysicsOutput?.(stepResult.output);
    return stepResult.output;
  }

  resetBallToCenter(): void {
    this.resetGoalLatch();
    resetSimBallToCenter(this.sim);
  }

  isBallOnGround(): boolean {
    return checkSimBallOnGround(this.sim);
  }

  resetKickoff(seed = 0): void {
    this.resetGoalLatch();
    executeKickoffResetOnSim({
      sim: this.sim,
      inputBuffer: this.inputBuffer,
      lastAcknowledgedControls: this.lastAcknowledgedControls,
      directControls: this.directControls,
      jumpSuppressedCarIndices: this.jumpSuppressedCarIndices,
      seed,
    });
  }

  destroy(): void {
    this.resetGoalLatch();
    this.inputBuffer?.clear();
    this.directControls.clear();
    this.activeCarIndices.clear();
    this.lastAcknowledgedControls.clear();
    this.jumpSuppressedCarIndices.clear();
    this.sim?.destroy?.();
  }
}

export default PhysicsEngineManager;
