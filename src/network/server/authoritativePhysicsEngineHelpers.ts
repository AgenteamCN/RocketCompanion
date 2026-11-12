/**
 * src/network/server/authoritativePhysicsEngineHelpers.ts
 * Pure state accessors, active car bitmask calculators, and kickoff/ball reset helpers
 * for PhysicsEngineManager.
 */

import { BALL_GROUND_CONTACT_MAX_Z, BALL_REST_Z } from '../../physics/RocketSimConstants.ts';
import { NEUTRAL_CONTROLS, type NetworkInputBuffer } from './NetworkInputBuffer.ts';
import type { CarControlsInput } from '../protocol/GlobalPayloadCodec.ts';
import {
  buildPausedPhysicsStepOutput,
  evaluatePostStepIncidentsAndGoalLatch,
  sampleAuthoritativeCarControlsForTick,
  type AuthoritativePhysicsSimPort,
  type AuthoritativePhysicsStepOutput,
} from './authoritativePhysicsStepPipeline.ts';
import type { LobbyGhostCarCoordinator } from './LobbyGhostCarCoordinator.ts';

export function computeActiveCarMask(
  sim: AuthoritativePhysicsSimPort | null | undefined,
  activeCarIndices: ReadonlySet<number>
): number {
  if (sim && typeof sim.getActiveCarMask === 'function') {
    const wasmMask = sim.getActiveCarMask();
    if (typeof wasmMask === 'number' && wasmMask > 0) {
      let combined = 0;
      for (const idx of activeCarIndices) {
        if (idx >= 0 && idx < 8) {
          combined |= 1 << idx;
        }
      }
      return (combined || wasmMask) & 0xff;
    }
  }
  let mask = 0;
  for (const idx of activeCarIndices) {
    if (idx >= 0 && idx < 8) {
      mask |= 1 << idx;
    }
  }
  return mask & 0xff;
}

export function readSimCurrentTick(sim: AuthoritativePhysicsSimPort | null | undefined): number {
  if (!sim) {
    return 0;
  }
  if (typeof sim.getHeaderView === 'function') {
    const header = sim.getHeaderView();
    if (header && typeof header.tickCount === 'number') {
      return Math.floor(header.tickCount);
    }
  }
  return 0;
}

export function writeSimCurrentTick(
  sim: AuthoritativePhysicsSimPort | null | undefined,
  val: number
): void {
  if (sim && typeof sim.getHeaderView === 'function') {
    try {
      const header = sim.getHeaderView();
      if (header && typeof val === 'number' && Number.isFinite(val)) {
        header.tickCount = Math.max(0, Math.floor(val));
      }
    } catch {
      // Read-only view in some mock engines; safe to ignore
    }
  }
}

export function resetSimBallToCenter(sim: AuthoritativePhysicsSimPort | null | undefined): void {
  sim?.setBallState?.(
    new Float32Array([0, 0, BALL_REST_Z, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
  );
}

export function checkSimBallOnGround(sim: AuthoritativePhysicsSimPort | null | undefined): boolean {
  if (!sim) {
    return false;
  }
  if (typeof sim.ballOnGround === 'boolean') {
    return sim.ballOnGround;
  }
  if (typeof sim.getBallOnGround === 'function') {
    return Boolean(sim.getBallOnGround());
  }
  const b = sim.getBallStateView?.();
  return Boolean(b && typeof b.posZ === 'number' && b.posZ <= BALL_GROUND_CONTACT_MAX_Z);
}

export function executeKickoffResetOnSim(params: {
  sim: AuthoritativePhysicsSimPort;
  inputBuffer: NetworkInputBuffer | null;
  lastAcknowledgedControls: Map<number, CarControlsInput>;
  directControls: Map<number, CarControlsInput>;
  jumpSuppressedCarIndices: Set<number>;
  seed: number;
}): void {
  const {
    sim,
    inputBuffer,
    lastAcknowledgedControls,
    directControls,
    jumpSuppressedCarIndices,
    seed,
  } = params;

  for (const [carIdx, ctrl] of lastAcknowledgedControls.entries()) {
    if (ctrl?.jump) {
      jumpSuppressedCarIndices.add(carIdx);
    }
  }
  for (const [carIdx, ctrl] of directControls.entries()) {
    if (ctrl?.jump) {
      jumpSuppressedCarIndices.add(carIdx);
    }
    directControls.set(carIdx, { ...NEUTRAL_CONTROLS });
  }
  lastAcknowledgedControls.clear();
  sim.resetKickoff(seed);
  inputBuffer?.clear();
}

export interface AuthoritativeTickStepMutableState {
  sim: AuthoritativePhysicsSimPort;
  isPaused: boolean;
  currentTick: number;
  activeCarMask: number;
  maskInputs: boolean;
  activeCarIndices: Set<number>;
  directControls: Map<number, CarControlsInput>;
  inputBuffer: NetworkInputBuffer | null;
  lastAcknowledgedControls: Map<number, CarControlsInput>;
  jumpSuppressedCarIndices: Set<number>;
  lobbyGhostCoordinator: LobbyGhostCarCoordinator;
  isRecordingFullReplay: boolean;
  goalLatched: boolean;
  goalScoredAtTick: number;
  frozenBallSnapshot: Float32Array | null;
  lastBallTouchCarIndex?: number;
  lastBallTouchTick?: number;
}

export function executeAuthoritativePhysicsTickStep(state: AuthoritativeTickStepMutableState): {
  output: AuthoritativePhysicsStepOutput;
  goalLatched: boolean;
  goalScoredAtTick: number;
  frozenBallSnapshot: Float32Array | null;
  lastBallTouchCarIndex?: number;
  lastBallTouchTick?: number;
} {
  if (state.isPaused) {
    const output = buildPausedPhysicsStepOutput({
      sim: state.sim,
      currentTick: state.currentTick,
      activeCarMask: state.activeCarMask,
      activeCarIndices: state.activeCarIndices,
      lastAcknowledgedControls: state.lastAcknowledgedControls,
      lastBallTouchCarIndex: state.lastBallTouchCarIndex,
    });
    return {
      output,
      goalLatched: state.goalLatched,
      goalScoredAtTick: state.goalScoredAtTick,
      frozenBallSnapshot: state.frozenBallSnapshot,
      lastBallTouchCarIndex: state.lastBallTouchCarIndex,
      lastBallTouchTick: state.lastBallTouchTick,
    };
  }

  const ackList = sampleAuthoritativeCarControlsForTick({
    sim: state.sim,
    tick: state.currentTick,
    mask: state.maskInputs,
    activeCarIndices: state.activeCarIndices,
    directControls: state.directControls,
    inputBuffer: state.inputBuffer,
    lastAcknowledgedControls: state.lastAcknowledgedControls,
    jumpSuppressedCarIndices: state.jumpSuppressedCarIndices,
    lobbyGhostCoordinator: state.lobbyGhostCoordinator,
  });

  const stepEval = evaluatePostStepIncidentsAndGoalLatch({
    sim: state.sim,
    currentTick: state.currentTick,
    isRecordingFullReplay: state.isRecordingFullReplay,
    goalLatched: state.goalLatched,
    goalScoredAtTick: state.goalScoredAtTick,
    frozenBallSnapshot: state.frozenBallSnapshot,
    lastBallTouchCarIndex: state.lastBallTouchCarIndex,
    lastBallTouchTick: state.lastBallTouchTick,
  });

  const nextTick = readSimCurrentTick(state.sim);
  const output: AuthoritativePhysicsStepOutput = {
    tick: nextTick,
    activeCarMask: computeActiveCarMask(state.sim, state.activeCarIndices),
    acknowledgedControls: ackList,
    stateSnapshot:
      typeof state.sim.saveCompactState === 'function'
        ? state.sim.saveCompactState()
        : state.sim.saveState(),
    incidents: stepEval.frameIncidents,
    goalScored: stepEval.goalScored,
    goalTeam: stepEval.goalTeam,
    scorerCarIndex: stepEval.lastBallTouchCarIndex ?? 0,
    scorerTouchTick: stepEval.lastBallTouchTick ?? null,
    kickoffTouched: stepEval.kickoffTouched,
  };

  return {
    output,
    goalLatched: stepEval.goalLatched,
    goalScoredAtTick: stepEval.goalScoredAtTick,
    frozenBallSnapshot: stepEval.frozenBallSnapshot,
    lastBallTouchCarIndex: stepEval.lastBallTouchCarIndex,
    lastBallTouchTick: stepEval.lastBallTouchTick,
  };
}
