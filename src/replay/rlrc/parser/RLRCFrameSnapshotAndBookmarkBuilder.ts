/**
 * RLRCFrameSnapshotAndBookmarkBuilder.ts
 * Pure pipeline functions for constructing 30Hz RLRC source network frames,
 * car state snapshots, and demolish bookmark records from tracked slot states.
 */

import {
  RLRC_MAX_PLAYER_SLOTS,
  RLRC_TICK_RATE,
  type RLRCBookmarkRecord,
  type RLRCCarFrameState120Hz,
  type RLRCRigidBodySample,
  type RLRCSourceNetworkFrame,
  type RLRCTeamIndex,
  type RLRCVec3,
} from '../RLRCReplayTypes.ts';
import type { RLRCBallFrameSnapshot30Hz } from './RLRCBallLifecycleExtractor.ts';
import {
  DEFAULT_ACTIVE_FLAGS,
  DEFAULT_CAR_RB,
  extractActorIdFromAttr,
  NEUTRAL_CONTROLS,
  recAttr,
  RLRC_DEFAULT_SPAWN_BOOST,
  RLRC_FLIP_EXPIRATION_SECONDS,
  RLRC_SUPERSONIC_SPEED_UU_S,
} from './RLRCNetStreamAttributeDecoders.ts';

export interface RLRCPlayerSlotTrackingState {
  carId: number;
  entityActive: boolean;
  isDemolished: boolean;
  demolishFrameIndex: number;
  spawnFrameIndex: number;
  rbUpdated: boolean;
  rigidBody: RLRCRigidBodySample;
  boostAmount: number;
  throttle: number;
  steer: number;
  handbrake: boolean;
  boostActive: boolean;
  jumpActive: boolean;
  doubleJumpActive: boolean;
  dodgeActive: boolean;
  lastJumpByte: number;
  lastDoubleJumpByte: number;
  lastDodgeByte: number;
  jumpOneShotFrame: number;
  doubleJumpOneShotFrame: number;
  dodgeOneShotFrame: number;
  dodgePitch: number;
  dodgeYaw: number;
  dodgeRoll: number;
  lastJumpTimeSeconds: number;
  flippedInAir: boolean;
}

function resetSlotActionState(s: RLRCPlayerSlotTrackingState): void {
  s.boostActive = false;
  s.jumpActive = false;
  s.doubleJumpActive = false;
  s.dodgeActive = false;
  s.lastJumpByte = -1;
  s.lastDoubleJumpByte = -1;
  s.lastDodgeByte = -1;
  s.jumpOneShotFrame = -1;
  s.doubleJumpOneShotFrame = -1;
  s.dodgeOneShotFrame = -1;
  s.dodgePitch = 0;
  s.dodgeYaw = 0;
  s.dodgeRoll = 0;
}

export function createInitialPlayerSlotTrackingStates(): RLRCPlayerSlotTrackingState[] {
  return Array.from({ length: RLRC_MAX_PLAYER_SLOTS }, (): RLRCPlayerSlotTrackingState => ({
    carId: -1,
    entityActive: false,
    isDemolished: false,
    demolishFrameIndex: -1,
    spawnFrameIndex: -2,
    rbUpdated: false,
    rigidBody: DEFAULT_CAR_RB,
    boostAmount: RLRC_DEFAULT_SPAWN_BOOST,
    throttle: 0,
    steer: 0,
    handbrake: false,
    boostActive: false,
    jumpActive: false,
    doubleJumpActive: false,
    dodgeActive: false,
    lastJumpByte: -1,
    lastDoubleJumpByte: -1,
    lastDodgeByte: -1,
    jumpOneShotFrame: -1,
    doubleJumpOneShotFrame: -1,
    dodgeOneShotFrame: -1,
    dodgePitch: 0,
    dodgeYaw: 0,
    dodgeRoll: 0,
    lastJumpTimeSeconds: -1e9,
    flippedInAir: false,
  }));
}

export function deactivatePlayerSlotState(
  slotState: RLRCPlayerSlotTrackingState,
  clearCarId = false,
  demolishedAtFrame = -1
): void {
  if (clearCarId) slotState.carId = -1;
  slotState.entityActive = false;
  if (demolishedAtFrame >= 0) {
    slotState.isDemolished = true;
    slotState.demolishFrameIndex = demolishedAtFrame;
  }
  slotState.rbUpdated = false;
  resetSlotActionState(slotState);
  slotState.handbrake = false;
  slotState.throttle = 0;
  slotState.steer = 0;
}

export function bindCarPawnToSlotState(params: {
  readonly slotState: RLRCPlayerSlotTrackingState;
  readonly actorId: number;
  readonly frameIdx: number;
  readonly isHidden: boolean;
  readonly sameFrameRb: RLRCRigidBodySample | undefined;
  readonly initLoc: RLRCVec3 | undefined;
}): boolean {
  const { slotState, actorId, frameIdx, isHidden, sameFrameRb, initLoc } = params;
  const isNewCarBinding = slotState.carId !== actorId;
  slotState.carId = actorId;
  slotState.entityActive = !isHidden;
  if (!isHidden) {
    slotState.isDemolished = false;
    slotState.demolishFrameIndex = -1;
  }
  if (!isNewCarBinding || isHidden) return false;

  if (sameFrameRb) {
    slotState.rigidBody = sameFrameRb;
    slotState.spawnFrameIndex = -2;
  } else {
    if (initLoc) {
      slotState.rigidBody = { ...DEFAULT_CAR_RB, position: initLoc, rbUpdated: true };
    }
    slotState.spawnFrameIndex = frameIdx;
  }
  slotState.rbUpdated = true;
  slotState.boostAmount = RLRC_DEFAULT_SPAWN_BOOST;
  resetSlotActionState(slotState);
  slotState.flippedInAir = false;
  return true;
}

export function applyCarRigidBodySampleToSlot(params: {
  readonly slotState: RLRCPlayerSlotTrackingState;
  readonly slotIdx: number;
  readonly actorId: number;
  readonly frameIdx: number;
  readonly timeSeconds: number;
  readonly rbSample: RLRCRigidBodySample;
  readonly updatedRb: RLRCRigidBodySample;
  readonly networkFrames: RLRCSourceNetworkFrame[];
  readonly restingSamples: RLRCRigidBodySample[];
}): void {
  const {
    slotState,
    slotIdx,
    actorId,
    frameIdx,
    timeSeconds,
    rbSample,
    updatedRb,
    networkFrames,
    restingSamples,
  } = params;
  const pos = rbSample.position;
  const vel = rbSample.linearVelocity;
  const quat = rbSample.rotation;
  const upZ = 1 - 2 * (quat.x * quat.x + quat.y * quat.y);
  if (
    frameIdx === slotState.spawnFrameIndex + 1 &&
    networkFrames[frameIdx - 1]?.cars[slotIdx]?.entityActive &&
    Math.hypot(vel.x, vel.y, vel.z) < 50
  ) {
    (networkFrames[frameIdx - 1].cars as RLRCCarFrameState120Hz[])[slotIdx] = {
      ...networkFrames[frameIdx - 1].cars[slotIdx],
      rigidBody: updatedRb,
      rbUpdated: true,
    };
  }
  slotState.carId = actorId;
  slotState.entityActive = true;
  slotState.isDemolished = false;
  slotState.demolishFrameIndex = -1;
  slotState.rbUpdated = true;
  slotState.spawnFrameIndex = -2;
  slotState.rigidBody = updatedRb;
  if (pos.z < 21.5 && Math.abs(vel.z) < 25 && upZ >= 0.7) {
    slotState.flippedInAir = false;
    slotState.lastJumpTimeSeconds = timeSeconds;
    if (
      Math.abs(pos.x) < 2500 &&
      Math.abs(pos.y) < 3500 &&
      pos.z > 14.5 &&
      pos.z < 20.5 &&
      Math.abs(vel.z) < 5 &&
      upZ > 0.98
    ) {
      restingSamples.push(rbSample);
    }
  }
}

export function buildDemolishBookmarkRecord(params: {
  readonly attrRecord: Record<string, unknown> | null;
  readonly actorId: number;
  readonly frameIdx: number;
  readonly timeSeconds: number;
  readonly startTimeSeconds: number;
  readonly isKeyframe: boolean;
  readonly lastDemolishSlot: number;
  readonly lastDemolishTime: number;
  readonly carPriById: ReadonlyMap<number, number>;
  readonly lastPriByCarId: ReadonlyMap<number, number>;
  readonly slotByPriId: ReadonlyMap<number, number>;
  readonly playerNameByPriId: ReadonlyMap<number, string>;
  readonly playerTeamByPriId: ReadonlyMap<number, RLRCTeamIndex>;
  readonly resolveSlotForCar: (carId: number) => number;
}): {
  readonly victimSlot: number;
  readonly bookmark: RLRCBookmarkRecord | null;
} {
  const {
    attrRecord,
    actorId,
    frameIdx,
    timeSeconds,
    startTimeSeconds,
    isKeyframe,
    lastDemolishSlot,
    lastDemolishTime,
    carPriById,
    lastPriByCarId,
    slotByPriId,
    playerNameByPriId,
    playerTeamByPriId,
    resolveSlotForCar,
  } = params;

  const demolishData = recAttr(attrRecord?.DemolishExtended ?? attrRecord?.Demolish) ?? attrRecord;
  const victimCar = demolishData ? extractActorIdFromAttr(demolishData.victim) : actorId;
  const targetCarId = victimCar >= 0 ? victimCar : actorId;
  const victimPriId = carPriById.get(targetCarId) ?? lastPriByCarId.get(targetCarId) ?? -1;
  const directCarSlot = resolveSlotForCar(targetCarId);
  const victimSlot = directCarSlot >= 0 ? directCarSlot : (slotByPriId.get(victimPriId) ?? -1);

  if (
    isKeyframe ||
    (victimSlot === lastDemolishSlot && Math.abs(timeSeconds - lastDemolishTime) <= 0.5)
  ) {
    return { victimSlot, bookmark: null };
  }

  const attackerPriId = demolishData
    ? extractActorIdFromAttr(demolishData.attacker_pri ?? demolishData.attacker)
    : -1;
  const attackerName = playerNameByPriId.get(attackerPriId) ?? 'Player';
  const victimName = playerNameByPriId.get(victimPriId) ?? `Slot ${Math.max(0, victimSlot)}`;

  return {
    victimSlot,
    bookmark: {
      kind: 'demolish',
      frameIndex120Hz: Math.max(0, Math.round((timeSeconds - startTimeSeconds) * RLRC_TICK_RATE)),
      sourceFrame30Hz: frameIdx,
      timeSeconds,
      label: `Demolish: ${attackerName} -> ${victimName}`,
      slotIndex: victimSlot,
      team: playerTeamByPriId.get(victimPriId) ?? -1,
    },
  };
}

export function buildSourceFrameCars(
  slots: readonly RLRCPlayerSlotTrackingState[],
  timeSeconds: number
): { cars: RLRCCarFrameState120Hz[]; carRbUpdatedMask: number } {
  let carRbUpdatedMask = 0;
  const cars = slots.map((slotState, slotIndex): RLRCCarFrameState120Hz => {
    const rbUpdated = slotState.entityActive && slotState.rbUpdated;
    const rigidBody = slotState.entityActive
      ? { ...slotState.rigidBody, rbUpdated }
      : slotState.isDemolished
        ? {
            ...DEFAULT_CAR_RB,
            position: slotState.rigidBody.position,
            rotation: slotState.rigidBody.rotation,
          }
        : DEFAULT_CAR_RB;
    const quat = rigidBody.rotation;
    const vel = rigidBody.linearVelocity;
    if (rbUpdated) carRbUpdatedMask |= 1 << slotIndex;
    const isOnGround =
      slotState.entityActive &&
      rigidBody.position.z < 21.5 &&
      Math.abs(vel.z) < 25 &&
      1 - 2 * (quat.x * quat.x + quat.y * quat.y) >= 0.7;
    const elapsedSinceJump = isOnGround
      ? 0
      : Math.max(
          0,
          timeSeconds -
            (slotState.lastJumpTimeSeconds > -1e8 ? slotState.lastJumpTimeSeconds : timeSeconds)
        );
    return {
      slotIndex,
      entityActive: slotState.entityActive,
      rigidBody,
      rbUpdated,
      actorId: slotState.entityActive ? slotState.carId : -1,
      boostAmount: slotState.entityActive ? slotState.boostAmount : 0,
      isOnGround,
      isSupersonic:
        slotState.entityActive && Math.hypot(vel.x, vel.y, vel.z) >= RLRC_SUPERSONIC_SPEED_UU_S,
      hasFlipOrJump:
        slotState.entityActive &&
        (isOnGround ||
          (!slotState.flippedInAir && elapsedSinceJump <= RLRC_FLIP_EXPIRATION_SECONDS)),
      airTimeSinceJump: isOnGround ? 0 : Math.min(RLRC_FLIP_EXPIRATION_SECONDS, elapsedSinceJump),
      activeFlags: slotState.entityActive
        ? {
            boostActive: slotState.boostActive,
            jumpActive: slotState.jumpActive,
            doubleJumpActive: slotState.doubleJumpActive,
            dodgeActive: slotState.dodgeActive,
          }
        : DEFAULT_ACTIVE_FLAGS,
      controls: slotState.entityActive
        ? {
            throttle: slotState.throttle,
            steer: slotState.steer,
            pitch: slotState.dodgeActive ? slotState.dodgePitch : 0,
            yaw: slotState.dodgeActive ? slotState.dodgeYaw : 0,
            roll: slotState.dodgeActive ? slotState.dodgeRoll : 0,
            jump: slotState.jumpActive || slotState.doubleJumpActive || slotState.dodgeActive,
            boost: slotState.boostActive,
            handbrake: slotState.handbrake,
          }
        : NEUTRAL_CONTROLS,
    };
  });
  return { cars, carRbUpdatedMask };
}

export function buildSourceNetworkFrameSnapshot(params: {
  readonly frameIdx: number;
  readonly timeSeconds: number;
  readonly deltaSeconds: number;
  readonly secondsRemaining: number;
  readonly isOvertime: boolean;
  readonly roundCountdownNumber: number;
  readonly blueScore: number;
  readonly orangeScore: number;
  readonly ballSnapshot: RLRCBallFrameSnapshot30Hz;
  readonly slots: readonly RLRCPlayerSlotTrackingState[];
}): RLRCSourceNetworkFrame {
  const {
    frameIdx,
    timeSeconds,
    deltaSeconds,
    secondsRemaining,
    isOvertime,
    roundCountdownNumber,
    blueScore,
    orangeScore,
    ballSnapshot,
    slots,
  } = params;

  const { cars, carRbUpdatedMask } = buildSourceFrameCars(slots, timeSeconds);
  const ballRbUpdated = ballSnapshot.ballRbUpdated;

  return {
    sourceFrame30Hz: frameIdx,
    timeSeconds,
    deltaSeconds,
    secondsRemaining,
    isOvertime,
    roundCountdownNumber,
    blueScore,
    orangeScore,
    ball: ballSnapshot.ball,
    cars,
    ballRbUpdated,
    carRbUpdatedMask,
    rbUpdatedMask: carRbUpdatedMask | (ballRbUpdated ? 1 << RLRC_MAX_PLAYER_SLOTS : 0),
    activeBallActorId: ballSnapshot.activeBallActorId,
  };
}
