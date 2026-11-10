/**
 * RLRCInterveneTargetFrameApplier.ts
 * Narrow-waist physics and arena entity applier for t0 target frame, pre-roll countdown frames,
 * and car transient state reconstruction during RLRC intervention takeover.
 */

import {
  SIM_OFFSETS,
  BALL_STATE_OFFSETS,
  BALL_STATE_STRIDE,
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  BOOST_PAD_STATES_OFFSET,
  BOOST_PAD_STATE_STRIDE,
  BOOST_PAD_OFFSETS,
} from '../../../physics/RocketSimConstants.ts';
import {
  patchWasmCarTransientState,
  type ReconstructablePhysicsEngine,
  type ReconstructedCarTransientState,
} from '../../../physics/CarTransientStateReconstructor.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  RLRC_BOOST_PAD_COUNT,
  type RLRCBookmarkRecord,
  type RLRCCarFrameState120Hz,
  type RLRCFrame120Hz,
  type RLRCHitboxId,
  type RLRCInterveneLaunchConfig,
  type RLRCPlayerSlotMeta,
  type RLRCQuat,
  type RLRCSessionPhase,
  type RLRCSynthesizedCarControls,
  type RLRCTeamIndex,
  type RLRCVec3,
  type RLRCVisualId,
} from '../RLRCReplayTypes.ts';
import {
  DEFAULT_NEUTRAL_CAR_CONTROLS,
  clampCarPositionZForHitbox,
  quatToBasisAxes,
  type RLRCGoalAndTouchTrackerPort,
  type RLRCInterveneBallStateWritePayload,
  type RLRCInterveneCarStateWritePayload,
  type RLRCIntervenePhysicsPort,
  type RLRCPrerollRingBufferPort,
  type RLRCUserInterveneLoadout,
} from './RLRCInterveneFrameStateBuilder.ts';

export type {
  RLRCInterveneBallStateWritePayload,
  RLRCInterveneCarStateWritePayload,
  RLRCIntervenePhysicsPort,
};

export interface RLRCInterveneInterpolatorPort {
  prevState: Float32Array;
  currState: Float32Array;
  alpha?: number;
}

export interface RLRCInterveneArenaPort {
  interpolator?: RLRCInterveneInterpolatorPort | null;
  rebuildSlotVehicle?: (
    slotIndex: number,
    team: RLRCTeamIndex,
    hitboxId: RLRCHitboxId,
    visualId: RLRCVisualId,
    colorHex?: string
  ) => void;
  setSlotEntityVisible?: (slotIndex: number, visible: boolean) => void;
  setBallVisible?: (visible: boolean) => void;
  spinBallInPlace?: (angularVelocity: RLRCVec3, dt: number) => void;
  syncInterpolatorToState?: (state: Float32Array, prevState?: Float32Array) => void;
  focusCameraOnSlot?: (slotIndex: number, exitDirectorMode: boolean) => void;
}

export interface RLRCInterveneBotDecisionPort {
  resetAllBots?: () => void;
  decideControlsForSlot?: (
    slotIndex: number,
    team: RLRCTeamIndex,
    state: Float32Array,
    dt: number
  ) => RLRCSynthesizedCarControls | null | undefined;
}

export interface RLRCInterveneEnvironmentPort {
  readonly getFrames120Hz: () => readonly RLRCFrame120Hz[];
  readonly getRoster: () => readonly RLRCPlayerSlotMeta[];
  readonly getBookmarks?: () => readonly RLRCBookmarkRecord[];
  readonly getPhysics: () => RLRCIntervenePhysicsPort | null | undefined;
  readonly getArena?: () => RLRCInterveneArenaPort | null | undefined;
  readonly getRingBuffer?: () => RLRCPrerollRingBufferPort | null | undefined;
  readonly getGoalAndTouch?: () => RLRCGoalAndTouchTrackerPort | null | undefined;
  readonly getBotPort?: () => RLRCInterveneBotDecisionPort | null | undefined;
  readonly getUserLoadoutPreset?: (
    team: RLRCTeamIndex
  ) => Partial<RLRCUserInterveneLoadout> | null | undefined;
  readonly playSound?: (soundId: string, volume?: number, cooldownMs?: number) => void;
  readonly emitSystemSignal?: (signalType: number, tick: number, param2?: number) => void;
  readonly onPhaseChanged?: (phase: RLRCSessionPhase, countdownSec: number) => void;
}

const vec3Tuple = (v: RLRCVec3): [number, number, number] => [v.x, v.y, v.z];
const quatTuple = (q: RLRCQuat): [number, number, number, number] => [q.x, q.y, q.z, q.w];

export function applySlotControls(
  sim: RLRCIntervenePhysicsPort,
  slot: number,
  controls: RLRCSynthesizedCarControls
): void {
  if (typeof sim.setControls === 'function') sim.setControls(slot, controls);
  else sim.setCarControls?.(slot, controls);
}

export function writeCarRigidBodyState(
  sim: RLRCIntervenePhysicsPort,
  slot: number,
  car: RLRCCarFrameState120Hz,
  pos: RLRCVec3
): void {
  const axes = quatToBasisAxes(car.rigidBody.rotation);
  const cOff = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
  if (sim.state && cOff + CAR_STATE_STRIDE <= sim.state.length) {
    const steerRad = (Number(car.controls.steer) || 0) * 0.5235988;
    for (let w = 0; w < 4; w++) {
      const wBase = cOff + CAR_STATE_OFFSETS.WHEELS + w * 3;
      sim.state[wBase] = car.isOnGround ? 18.0 : 35.0;
      sim.state[wBase + 1] = w < 2 ? steerRad : 0;
      sim.state[wBase + 2] = car.isOnGround ? 1 : 0;
    }
    sim.state[cOff + CAR_STATE_OFFSETS.GROUND_NORMAL + 2] = 1;
  }
  sim.setCarState?.(slot, {
    pos: vec3Tuple(pos),
    vel: vec3Tuple(car.rigidBody.linearVelocity),
    angVel: vec3Tuple(car.rigidBody.angularVelocity),
    rotQuat: quatTuple(car.rigidBody.rotation),
    fwd: axes.fwd,
    right: axes.right,
    up: axes.up,
    boost: car.boostAmount,
    isOnGround: car.isOnGround,
    isSupersonic: car.isSupersonic,
    hasFlipOrJump: car.hasFlipOrJump,
    isBoosting: car.activeFlags.boostActive || car.controls.boost,
    isFlipping: car.activeFlags.dodgeActive || car.activeFlags.doubleJumpActive,
  });
}

export function buildReconstructedCarTransientState(
  car: RLRCCarFrameState120Hz
): ReconstructedCarTransientState {
  const isOnGround = car.isOnGround;
  const isBoosting = car.activeFlags.boostActive || car.controls.boost;
  const isFlipping = car.activeFlags.dodgeActive;
  const isJumping = car.activeFlags.jumpActive;
  const hasFlip = !isOnGround && car.hasFlipOrJump;
  const airTime = isOnGround ? 0 : Math.max(0.02, car.airTimeSinceJump || 0.15);
  const airTimeSinceJump = isOnGround
    ? 0
    : hasFlip
      ? Math.min(1.15, Math.max(0.05, car.airTimeSinceJump || 0.2))
      : Math.max(1.3, car.airTimeSinceJump || 1.3);

  return {
    lastGroundFrame: 0,
    isOnGround,
    isJumping,
    isFlipping,
    isBoosting,
    isSupersonic: car.isSupersonic,
    hasJumped: isOnGround ? 0 : 1,
    hasDoubleJumped: isOnGround || hasFlip ? 0 : 1,
    hasFlipped: !isOnGround && isFlipping ? 1 : 0,
    flipRelTorque: [0, 0, 0],
    flipTime: isFlipping ? 0.15 : 0,
    jumpTime: isJumping ? 0.1 : 0,
    airTime,
    airTimeSinceJump,
    boostingTime: isBoosting ? 0.1 : 0,
    supersonicTime: car.isSupersonic ? 0.25 : 0,
    handbrakeVal: car.controls.handbrake ? 0.85 : 0,
    hasWorldContact: isOnGround ? 1 : 0,
    lastControls: {
      ...car.controls,
      jump: hasFlip ? false : car.controls.jump,
    },
  };
}

export function ensureInterveneSlotEntityActive(
  sim: RLRCIntervenePhysicsPort,
  arena: RLRCInterveneArenaPort | null | undefined,
  slotActiveTracker: Uint8Array,
  slotIndex: number,
  team: RLRCTeamIndex,
  hitboxId: RLRCHitboxId
): void {
  const isPhysActive = sim.isCarSlotActive ? sim.isCarSlotActive(slotIndex) : false;
  if (!isPhysActive || slotActiveTracker[slotIndex] === 0) {
    sim.addCarAtSlot?.(slotIndex, team, hitboxId);
  }
  slotActiveTracker[slotIndex] = 1;
  arena?.setSlotEntityVisible?.(slotIndex, true);
}

export function deactivateInterveneSlotEntity(
  sim: RLRCIntervenePhysicsPort,
  arena: RLRCInterveneArenaPort | null | undefined,
  slotActiveTracker: Uint8Array,
  slotIndex: number
): void {
  sim.removeCar?.(slotIndex);
  slotActiveTracker[slotIndex] = 0;
  arena?.setSlotEntityVisible?.(slotIndex, false);
}

export function applyTargetFrameToPhysicsAndArena(params: {
  readonly frame: RLRCFrame120Hz;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly config: RLRCInterveneLaunchConfig;
  readonly sim: RLRCIntervenePhysicsPort;
  readonly arena: RLRCInterveneArenaPort | null | undefined;
  readonly slotActiveTracker: Uint8Array;
  readonly rebuildMeshes: boolean;
}): void {
  const { frame, roster, config, sim, arena, slotActiveTracker, rebuildMeshes } = params;
  sim.setUnlimitedBoost?.(false);
  arena?.setBallVisible?.(true);

  const bRb = frame.ball.rigidBody;
  const bAxes = quatToBasisAxes(bRb.rotation);
  if (sim.state && sim.state.length >= SIM_OFFSETS.BALL + BALL_STATE_STRIDE) {
    sim.state.set(bAxes.fwd, SIM_OFFSETS.BALL + BALL_STATE_OFFSETS.FWD);
    sim.state.set(bAxes.right, SIM_OFFSETS.BALL + BALL_STATE_OFFSETS.RIGHT);
    sim.state.set(bAxes.up, SIM_OFFSETS.BALL + BALL_STATE_OFFSETS.UP);
  }
  sim.setBallState?.({
    pos: vec3Tuple(bRb.position),
    vel: vec3Tuple(bRb.linearVelocity),
    angVel: vec3Tuple(bRb.angularVelocity),
    rotQuat: quatTuple(bRb.rotation),
    fwd: bAxes.fwd,
    right: bAxes.right,
    up: bAxes.up,
  });

  if (sim.state && frame.boostPadCooldowns) {
    for (let p = 0; p < RLRC_BOOST_PAD_COUNT; p++) {
      const pBase = BOOST_PAD_STATES_OFFSET + p * BOOST_PAD_STATE_STRIDE;
      const cd = Math.max(0, frame.boostPadCooldowns[p] || 0);
      sim.state[pBase + BOOST_PAD_OFFSETS.IS_ACTIVE] = cd <= 0.0001 ? 1 : 0;
      sim.state[pBase + BOOST_PAD_OFFSETS.COOLDOWN] = cd;
    }
  }

  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    const car = frame.cars[slot];
    const meta = roster.find((r) => r.slotIndex === slot);
    const team: RLRCTeamIndex = meta?.team ?? (slot < 3 ? 0 : 1);
    const isPov = slot === config.povSlotIndex;

    if (!car || (!isPov && (config.nonPovMode === 'disappear' || !car.entityActive))) {
      deactivateInterveneSlotEntity(sim, arena, slotActiveTracker, slot);
      continue;
    }

    const hitboxId: RLRCHitboxId = isPov
      ? config.playerHitboxId
      : (meta?.hitboxId ?? 'hitbox-octane');
    const visualId: RLRCVisualId = isPov ? config.playerVisualId : (meta?.visualId ?? 'fennec');
    const colorHex = isPov ? config.playerColorHex : meta?.primaryColorHex;

    if (rebuildMeshes) arena?.rebuildSlotVehicle?.(slot, team, hitboxId, visualId, colorHex);
    ensureInterveneSlotEntityActive(sim, arena, slotActiveTracker, slot, team, hitboxId);

    const safePos = clampCarPositionZForHitbox(car.rigidBody.position, car.isOnGround, hitboxId);
    writeCarRigidBodyState(sim, slot, car, safePos);
    applySlotControls(sim, slot, car.controls || DEFAULT_NEUTRAL_CAR_CONTROLS);
    patchWasmCarTransientState(sim, slot, buildReconstructedCarTransientState(car), true);
  }

  arena?.focusCameraOnSlot?.(config.povSlotIndex, true);
  if (sim.state) {
    if (arena?.interpolator) {
      arena.interpolator.prevState.set(sim.state);
      arena.interpolator.currState.set(sim.state);
      arena.interpolator.alpha = 0;
    } else {
      arena?.syncInterpolatorToState?.(sim.state, sim.state);
    }
  }
}

export function applyPrerollFrameToRuntimeState(params: {
  readonly env: RLRCInterveneEnvironmentPort;
  readonly frame: RLRCFrame120Hz;
  readonly config: RLRCInterveneLaunchConfig;
  readonly slotActiveTracker: Uint8Array;
  readonly rebuildMeshes: boolean;
  readonly countdownRemainingTicks: number;
  readonly finalPrerollTick: number;
  readonly prevStepStateBuffer: Float32Array | null;
}): Float32Array | null {
  const { env, frame, config, slotActiveTracker, rebuildMeshes } = params;
  const sim = env.getPhysics();
  const arena = env.getArena?.();
  let prevBuf = params.prevStepStateBuffer;
  if (!sim) return prevBuf;

  const state = sim.state;
  const hadPrevStep =
    !rebuildMeshes &&
    params.countdownRemainingTicks > 0 &&
    Boolean(state && prevBuf?.length === state.length);
  if (state) {
    if (!prevBuf || prevBuf.length !== state.length) prevBuf = new Float32Array(state.length);
    prevBuf.set(state);
  }

  applyTargetFrameToPhysicsAndArena({
    frame,
    roster: env.getRoster(),
    config,
    sim,
    arena,
    slotActiveTracker,
    rebuildMeshes,
  });

  if (state && prevBuf) {
    state[SIM_OFFSETS.TICK] = Math.max(1, params.finalPrerollTick - params.countdownRemainingTicks);
    state[SIM_OFFSETS.GOAL] = 0;
    if (!hadPrevStep) prevBuf.set(state);
    if (arena?.interpolator && hadPrevStep) {
      arena.interpolator.prevState.set(prevBuf);
      arena.interpolator.currState.set(state);
    } else {
      arena?.syncInterpolatorToState?.(state, prevBuf);
    }
  }
  return prevBuf;
}
