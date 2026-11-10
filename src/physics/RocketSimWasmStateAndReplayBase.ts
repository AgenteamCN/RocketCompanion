/**
 * RocketSimWasmStateAndReplayBase.ts
 * Base state-memory view, ball-prediction, and WASM replay-buffer layer for RocketSimPhysicsEngine.
 * Owns WASM linear memory pointers, reusable typed state views, ball trajectory prediction buffers,
 * and ring-buffer replay frame / track extraction without pass-through wrappers.
 */

import type { RocketSimWasmModule } from './RocketSimWasm.ts';
import { SIM_OFFSETS, BALL_STATE_STRIDE, CAR_STATE_STRIDE } from './RocketSimConstants.ts';
import {
  updateWasmBallPrediction,
  updateWasmBallPredictionIncremental,
  getWasmBallPredictionBuffer,
  getWasmBallPredictionStride,
} from './ballPredictionPipeline.ts';
import {
  CarStateView,
  BallStateView,
  ArenaHeaderView,
  BoostPadStateView,
} from './RocketSimStateViews.ts';
import type { PhysicsEventReader } from './PhysicsEventReader.ts';
import { PhysicsEventDispatcher } from './PhysicsEventDispatcher.ts';
import { PhysicsPossessionTracker } from './PhysicsPossessionTracker.ts';
import { readArenaPads, type ArenaBoostPadDescriptor } from './RocketSimSnapshotSerializer.ts';
import {
  getWasmReplayIncidentTrackBytes,
  getWasmReplaySignalTrackBytes,
  extractWasmReplayTracks,
  getWasmReplayFrameByOffset,
  getWasmReplayFrameByIndex,
  getWasmReplayControlsByIndex,
  type ExtractedWasmReplayTracks,
} from './wasmReplayTrackExtractor.ts';
import {
  RocketSimArenaBarrierController,
  type CarSpecEntry,
} from './RocketSimArenaBarrierController.ts';

export class RocketSimWasmStateAndReplayBase {
  static cachedCollisionData: Uint8Array[] | null = null;

  module: RocketSimWasmModule | null = null;
  isInitialized = false;
  statePtr = 0;
  stateLen = 0;
  controlsPtr = 0;
  eventBufferPtr = 0;
  eventBufferSize = 0;
  eventReader: PhysicsEventReader | null = null;
  readonly eventDispatcher = new PhysicsEventDispatcher();
  readonly possessionTracker = new PhysicsPossessionTracker();
  readonly arenaBarriers = new RocketSimArenaBarrierController();
  stateView: Float32Array | null = null;
  controlsView: Float32Array | null = null;
  headerViewInstance: ArenaHeaderView | null = null;
  ballStateViewInstance: BallStateView | null = null;
  carStateViewInstances: CarStateView[] = [];
  boostPadStateViewInstances: BoostPadStateView[] = [];
  wasmStatePtr = 0;
  wasmStateSize = 0;
  cachedSnapshotBuffer: Float32Array | null = null;
  isUnlimitedBoost = false;
  arenaPreset = 0;
  ballStateWriteRevision = 0;
  public carSpecs: Array<CarSpecEntry | null> = [];

  get _carSpecs(): Array<CarSpecEntry | null> {
    return this.carSpecs;
  }

  set _carSpecs(specs: Array<CarSpecEntry | null>) {
    this.carSpecs = Array.isArray(specs) ? specs : [];
  }

  getCachedCollisionData(): Uint8Array[] | null {
    return RocketSimWasmStateAndReplayBase.cachedCollisionData;
  }

  setCachedCollisionData(data: Uint8Array[] | null): void {
    RocketSimWasmStateAndReplayBase.cachedCollisionData = data;
  }

  getCurrentTick(): number {
    if (!this.module) return 0;
    const currentState = this.state;
    return Math.floor(currentState[SIM_OFFSETS.TICK] || 0);
  }

  get state(): Float32Array {
    const buf = this.module!.HEAPF32.buffer;
    if (!this.stateView || this.stateView.buffer !== buf) {
      this.stateView = new Float32Array(buf, this.statePtr, this.stateLen);
    }
    return this.stateView;
  }

  getHeaderView(): ArenaHeaderView {
    return (this.headerViewInstance ??= new ArenaHeaderView()).attach(this.state);
  }

  get numCars(): number {
    return this.module ? this.getHeaderView().numCars : 0;
  }

  get ballState(): BallStateView {
    return (this.ballStateViewInstance ??= new BallStateView()).attach(this.state);
  }

  getBallStateView(): BallStateView {
    return (this.ballStateViewInstance ??= new BallStateView()).attach(this.state);
  }

  getBallState(): Float32Array {
    const off = SIM_OFFSETS.BALL;
    return this.state.subarray(off, off + BALL_STATE_STRIDE);
  }

  getCarStateView(carIndex = 0): CarStateView {
    return (this.carStateViewInstances[carIndex] ??= new CarStateView()).attachCar(
      this.state,
      carIndex
    );
  }

  getBoostPadStateView(padIndex = 0): BoostPadStateView {
    return (this.boostPadStateViewInstances[padIndex] ??= new BoostPadStateView()).attach(
      this.state,
      padIndex
    );
  }

  getCarState(carIndex: number): Float32Array {
    const off = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE;
    return this.state.subarray(off, off + CAR_STATE_STRIDE);
  }

  getPads(): ArenaBoostPadDescriptor[] {
    if (!this.module) return [];
    return readArenaPads(this.module, this);
  }

  updateBallPrediction(seconds = 5.0): number {
    if (!this.module) return 0;
    return updateWasmBallPrediction(this.module, seconds);
  }

  updateBallPredictionIncremental(seconds = 5.0): number {
    if (!this.module) return 0;
    return updateWasmBallPredictionIncremental(this.module, seconds);
  }

  getBallPrediction(): Float32Array | null {
    if (!this.module) return null;
    return getWasmBallPredictionBuffer(this.module);
  }

  getBallPredictionStride(): number {
    if (!this.module) return 6;
    return getWasmBallPredictionStride(this.module);
  }

  initReplayBuffer(): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_initReplayBuffer();
  }

  clearReplayBuffer(): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_clearReplayBuffer();
  }

  recordReplayFrame(): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_recordReplayFrame();
  }

  getReplayFrameCount(): number {
    const mod = this.module;
    if (!mod) return 0;
    return mod._physics_getReplayFrameCount();
  }

  setReplayRecordingActive(active = true): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_setReplayRecordingActive(active ? 1 : 0);
  }

  getReplayRecordingActive(): boolean {
    const mod = this.module;
    if (!mod) return true;
    return mod._physics_getReplayRecordingActive() === 1;
  }

  getReplayFrameByOffset(ticksAgo = 0): Float32Array | null {
    if (!this.module || this.stateLen <= 0) return null;
    return getWasmReplayFrameByOffset(this.module, this.stateLen, ticksAgo);
  }

  getReplayFrameByIndex(frameIndex = 0): Float32Array | null {
    if (!this.module || this.stateLen <= 0) return null;
    return getWasmReplayFrameByIndex(this.module, this.stateLen, frameIndex);
  }

  getReplayControlsByIndex(frameIndex = 0): Uint8Array | null {
    if (!this.module) return null;
    return getWasmReplayControlsByIndex(this.module, frameIndex);
  }

  getReplayIncidentTrackBytes(): Uint8Array {
    if (!this.module) return new Uint8Array(0);
    return getWasmReplayIncidentTrackBytes(this.module);
  }

  getReplaySignalTrackBytes(): Uint8Array {
    if (!this.module) return new Uint8Array(0);
    return getWasmReplaySignalTrackBytes(this.module);
  }

  extractWasmReplayTracks(): ExtractedWasmReplayTracks {
    if (!this.module) {
      return {
        frameCount: 0,
        stateStride: 1856,
        incidentCount: 0,
        signalCount: 0,
        stateInputBytes: new Uint8Array(0),
        incidentBytes: new Uint8Array(0),
        signalBytes: new Uint8Array(0),
      };
    }
    return extractWasmReplayTracks(this.module);
  }
}
