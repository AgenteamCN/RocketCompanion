/**
 * src/network/server/authoritativePhysicsStepPipeline.ts
 * Pure pipeline operators for authoritative server physics step execution:
 * car entity slot registration on WASM sim, per-tick control sampling,
 * incident collection, goal detection, and post-goal ball freeze latching.
 */

import { NEUTRAL_CONTROLS, type NetworkInputBuffer } from './NetworkInputBuffer.ts';
import type {
  CarControlsInput,
  AcknowledgedCarControlEntry,
  MatchIncidentPayload,
} from '../protocol/GlobalPayloadCodec.ts';
import type { LobbyGhostCarCoordinator } from './LobbyGhostCarCoordinator.ts';

export const POST_GOAL_FREEZE_DELAY_TICKS = 30;

export interface AuthoritativePhysicsSimPort {
  isInitialized?: boolean;
  state?: Float32Array | null;
  numCars: number;
  ballOnGround?: boolean;
  init?(): Promise<unknown>;
  destroy?(): void;
  setGoalBarrierChunks?(chunks: Uint8Array[], meta?: Record<string, unknown> | null): void;
  step(ticks: number): void;
  resetKickoff(seed?: number): void;
  saveState(): Float32Array;
  saveCompactState?(): Float32Array;
  restoreState?(state: Float32Array | number[]): unknown;
  addCar?(team: number, config: string): number;
  addCarAtSlot?(carIndex: number, team: number, config: string): number;
  removeCar?(carIndex: number): void;
  isCarSlotActive?(carIndex: number): boolean;
  setCarHitbox?(carIndex: number, config: string): void;
  setCarTeam?(carIndex: number, team: number): void;
  configureCars?(mode: string, b: boolean, n: number): void;
  setControls?(carIndex: number, controls: CarControlsInput): void;
  setCarControls?(carIndex: number, controls: CarControlsInput): void;
  setCarState?(carIndex: number, state: unknown): unknown;
  getBallState?(): Float32Array;
  setBallState?(state: Float32Array | Record<string, unknown> | number[]): unknown;
  getBallOnGround?(): boolean;
  controlBall?(carIndex: number, mode: number | string): unknown;
  getBallStateView?(): {
    posX: number;
    posY: number;
    posZ: number;
    velX: number;
    velY: number;
    velZ: number;
  };
  isBallScored?(ballView: { posX: number; posY: number; posZ: number }): boolean;
  getHeaderView?(): { tickCount: number; goalScoredFlag?: number; numCars?: number };
  pollGoal?(): number;
  resetGoalLatch?(): void;
  readEvents?(cb: (ev: MatchIncidentPayload) => void): void;
  initReplayBuffer?(): void;
  clearReplayBuffer?(): void;
  setReplayRecordingActive?(active: boolean): void;
  recordReplayFrame?(): void;
  getReplayFrameCount?(): number;
  extractWasmReplayTracks?(): {
    frameCount: number;
    stateStride: number;
    incidentCount: number;
    signalCount: number;
    stateInputBytes?: Uint8Array;
    incidentBytes?: Uint8Array;
    signalBytes?: Uint8Array;
  };
  setPossessionReportingEnabled?(enabled: boolean): void;
  getPossessionStats?(): { team: number; bluePoints: number; orangePoints: number; time: number };
  getActiveCarMask?(): number;
  setCarLinearFactorAndGravity?(
    carIndex: number,
    fx: number,
    fy: number,
    fz: number,
    gravityScale: number
  ): void;
  setSimulationFrozen?(frozen: boolean, mode: number, lockCars: boolean): void;
  setArenaMutators?(mutators: unknown): void;
  setUnlimitedBoost?(enabled: boolean): void;
  setCarUnlimitedBoost?(carIndex: number, enabled: boolean): void;
  setCarBoostCollectable?(carIndex: number, collectable: boolean): void;
  setCarBoostRecharge?(
    carIndex: number,
    enabled: boolean,
    rechargePerSecond: number,
    rechargeDelay: number
  ): void;
  getPads?(): unknown;
  [key: string]: unknown;
}

export interface AuthoritativePhysicsStepOutput {
  tick: number;
  activeCarMask: number;
  acknowledgedControls: AcknowledgedCarControlEntry[];
  stateSnapshot: Float32Array | null;
  incidents: MatchIncidentPayload[];
  goalScored: boolean;
  goalTeam: number;
  scorerCarIndex: number;
  scorerTouchTick?: number | null;
  kickoffTouched: boolean;
}

export function syncCarSlotWithSim(
  sim: AuthoritativePhysicsSimPort | null | undefined,
  carIndex: number,
  team: number,
  config: string,
  wasActive: boolean
): void {
  if (!sim) return;
  if (typeof sim.addCarAtSlot === 'function') {
    const slotAlreadyActive =
      typeof sim.isCarSlotActive === 'function' ? sim.isCarSlotActive(carIndex) : wasActive;
    if (!slotAlreadyActive) {
      sim.addCarAtSlot(carIndex, team, config || 'default');
    } else {
      if (config && typeof sim.setCarHitbox === 'function') {
        sim.setCarHitbox(carIndex, config);
      }
      if (typeof sim.setCarTeam === 'function') {
        sim.setCarTeam(carIndex, team);
      }
    }
  } else if (sim.numCars <= carIndex) {
    if (typeof sim.addCar === 'function') {
      while (sim.numCars <= carIndex) {
        const nextIdx = sim.numCars;
        const t = nextIdx === carIndex ? team : nextIdx === 0 ? 0 : nextIdx % 2;
        sim.addCar(t, config || 'default');
      }
    } else if (typeof sim.configureCars === 'function') {
      sim.configureCars('custom', false, 0);
    }
  } else if (config && typeof sim.setCarHitbox === 'function') {
    sim.setCarHitbox(carIndex, config);
  }

  if (typeof sim.setCarTeam === 'function') {
    sim.setCarTeam(carIndex, team);
  }
}

export function buildPausedPhysicsStepOutput(params: {
  sim: AuthoritativePhysicsSimPort | null | undefined;
  currentTick: number;
  activeCarMask: number;
  activeCarIndices: Iterable<number>;
  lastAcknowledgedControls: Map<number, CarControlsInput>;
  lastBallTouchCarIndex: number | undefined;
}): AuthoritativePhysicsStepOutput {
  const ackList: AcknowledgedCarControlEntry[] = [];
  for (const carIndex of params.activeCarIndices) {
    const last = params.lastAcknowledgedControls.get(carIndex);
    ackList.push({ carIndex, controls: last ? { ...last } : { ...NEUTRAL_CONTROLS } });
  }
  return {
    tick: params.currentTick,
    activeCarMask: params.activeCarMask,
    acknowledgedControls: ackList,
    stateSnapshot: params.sim
      ? typeof params.sim.saveCompactState === 'function'
        ? params.sim.saveCompactState()
        : params.sim.saveState()
      : null,
    incidents: [],
    goalScored: false,
    goalTeam: -1,
    scorerCarIndex: params.lastBallTouchCarIndex ?? 0,
    kickoffTouched: false,
  };
}

export function sampleAuthoritativeCarControlsForTick(params: {
  sim: AuthoritativePhysicsSimPort;
  tick: number;
  mask: boolean;
  activeCarIndices: Iterable<number>;
  directControls: Map<number, CarControlsInput>;
  inputBuffer: NetworkInputBuffer | null;
  lastAcknowledgedControls: Map<number, CarControlsInput>;
  jumpSuppressedCarIndices?: Set<number>;
  lobbyGhostCoordinator: LobbyGhostCarCoordinator;
}): AcknowledgedCarControlEntry[] {
  const {
    sim,
    tick,
    mask,
    activeCarIndices,
    directControls,
    inputBuffer,
    lastAcknowledgedControls,
    jumpSuppressedCarIndices,
    lobbyGhostCoordinator,
  } = params;
  const ackList: AcknowledgedCarControlEntry[] = [];

  for (const carIndex of activeCarIndices) {
    const isLobbyRemoteMasked = lobbyGhostCoordinator.shouldMaskRemoteLobbyInput(carIndex);
    const last = lastAcknowledgedControls.get(carIndex);
    const rawCandidate = directControls.has(carIndex)
      ? directControls.get(carIndex)!
      : inputBuffer
        ? inputBuffer.getControlsForTick(carIndex, tick, last)
        : last
          ? { ...last }
          : { ...NEUTRAL_CONTROLS };

    if (jumpSuppressedCarIndices) {
      if (rawCandidate.jump && (mask || isLobbyRemoteMasked)) {
        jumpSuppressedCarIndices.add(carIndex);
      } else if (!rawCandidate.jump && !mask && !isLobbyRemoteMasked) {
        jumpSuppressedCarIndices.delete(carIndex);
      }
    }

    let effectiveControls: CarControlsInput;
    if (mask || isLobbyRemoteMasked) {
      effectiveControls = { ...NEUTRAL_CONTROLS };
    } else if (jumpSuppressedCarIndices?.has(carIndex) && rawCandidate.jump) {
      effectiveControls = { ...rawCandidate, jump: false };
    } else {
      effectiveControls = { ...rawCandidate };
    }

    if (typeof sim.setControls === 'function') {
      sim.setControls(carIndex, effectiveControls);
    } else if (typeof sim.setCarControls === 'function') {
      sim.setCarControls(carIndex, effectiveControls);
    }
    lastAcknowledgedControls.set(carIndex, effectiveControls);
    ackList.push({ carIndex, controls: effectiveControls });
  }

  if (inputBuffer) {
    inputBuffer.pruneOlderThan(tick);
  }
  return ackList;
}

export function evaluatePostStepIncidentsAndGoalLatch(params: {
  sim: AuthoritativePhysicsSimPort;
  currentTick: number;
  isRecordingFullReplay: boolean;
  goalLatched: boolean;
  goalScoredAtTick: number;
  frozenBallSnapshot: Float32Array | null;
  lastBallTouchCarIndex: number | undefined;
  lastBallTouchTick: number | undefined;
}): {
  frameIncidents: MatchIncidentPayload[];
  goalScored: boolean;
  goalTeam: number;
  kickoffTouched: boolean;
  goalLatched: boolean;
  goalScoredAtTick: number;
  frozenBallSnapshot: Float32Array | null;
  lastBallTouchCarIndex: number | undefined;
  lastBallTouchTick: number | undefined;
} {
  const { sim, isRecordingFullReplay } = params;
  let {
    goalLatched,
    goalScoredAtTick,
    frozenBallSnapshot,
    lastBallTouchCarIndex,
    lastBallTouchTick,
  } = params;

  let goalScored = false;
  let goalTeam = -1;
  let kickoffTouched = false;
  const frameIncidents: MatchIncidentPayload[] = [];

  sim.step(1);
  if (typeof sim.readEvents === 'function') {
    sim.readEvents((ev: MatchIncidentPayload) => {
      if (!ev || typeof ev.type !== 'number' || ev.type <= 0 || ev.type > 0x3f) return;
      const copy: MatchIncidentPayload = { ...ev };
      frameIncidents.push(copy);
      if (copy.type === 0x01) {
        const cIdx =
          typeof copy.carIndex === 'number' && copy.carIndex >= 0
            ? copy.carIndex
            : typeof copy.primaryId === 'number' && copy.primaryId >= 0 && copy.primaryId < 8
              ? copy.primaryId
              : -1;
        if (cIdx >= 0) {
          lastBallTouchCarIndex = cIdx;
          const fallbackTick =
            typeof sim.getHeaderView === 'function'
              ? Math.floor(sim.getHeaderView()?.tickCount || 0)
              : params.currentTick;
          lastBallTouchTick =
            typeof copy.tick === 'number' && copy.tick > 0 ? copy.tick : fallbackTick;
        }
      }
    });
  }
  if (isRecordingFullReplay) {
    sim.recordReplayFrame?.();
  }
  const newTickAfterStep =
    typeof sim?.getHeaderView === 'function'
      ? Math.floor(sim.getHeaderView()?.tickCount || 0)
      : params.currentTick;

  if (!goalLatched) {
    if (typeof sim?.getHeaderView === 'function') {
      const g = sim.getHeaderView()?.goalScoredFlag || 0;
      if (g !== 0) {
        goalScored = true;
        goalTeam = g === 1 ? 0 : 1;
      }
    } else if (typeof sim?.pollGoal === 'function') {
      const g = sim.pollGoal();
      if (g !== 0) {
        goalScored = true;
        goalTeam = g === 1 ? 0 : 1;
      }
    }
    if (!goalScored && typeof sim?.getBallStateView === 'function') {
      const b = sim.getBallStateView();
      const scored =
        typeof sim.isBallScored === 'function'
          ? sim.isBallScored(b)
          : Math.abs(b.posY) > 5120 + 91.25 && Math.abs(b.posX) < 892.755 && b.posZ < 642.775;
      if (scored) {
        goalScored = true;
        goalTeam = b.posY > 0 ? 0 : 1;
      }
    }

    if (goalScored) {
      goalLatched = true;
      goalScoredAtTick = newTickAfterStep;
      frozenBallSnapshot = null;
      if (!frameIncidents.some((inc) => inc && inc.type === 0x0e)) {
        const b = typeof sim?.getBallStateView === 'function' ? sim.getBallStateView() : null;
        frameIncidents.push({
          type: 0x0e,
          tick: newTickAfterStep,
          carIndex: lastBallTouchCarIndex ?? 0,
          team: goalTeam,
          x: b ? b.posX : 0,
          y: b ? b.posY : goalTeam === 0 ? 5120 : -5120,
          z: b ? b.posZ : 250,
        });
      }
    }
  } else if (
    goalScoredAtTick >= 0 &&
    newTickAfterStep >= goalScoredAtTick + POST_GOAL_FREEZE_DELAY_TICKS
  ) {
    if (!frozenBallSnapshot && typeof sim?.getBallState === 'function') {
      const currentBall = new Float32Array(sim.getBallState());
      for (let i = 12; i < 18; i++) currentBall[i] = 0;
      frozenBallSnapshot = currentBall;
    }
    if (frozenBallSnapshot && typeof sim?.setBallState === 'function') {
      sim.setBallState(frozenBallSnapshot);
    }
  }

  if (typeof sim?.getBallStateView === 'function') {
    const b = sim.getBallStateView();
    kickoffTouched = Math.abs(b.posX) + Math.abs(b.posY) > 1.0 || Math.hypot(b.velX, b.velY) > 1.0;
  }

  return {
    frameIncidents,
    goalScored,
    goalTeam,
    kickoffTouched,
    goalLatched,
    goalScoredAtTick,
    frozenBallSnapshot,
    lastBallTouchCarIndex,
    lastBallTouchTick,
  };
}
