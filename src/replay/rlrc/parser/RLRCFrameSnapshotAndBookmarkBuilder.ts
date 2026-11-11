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
  buildSourceFrameCars,
  createParkedCarRigidBody,
  DEFAULT_CAR_RB,
  extractActorIdFromAttr,
  recAttr,
  RLRC_DEFAULT_SPAWN_BOOST,
  type RLRCPlayerSlotTrackingState,
} from './RLRCNetStreamAttributeDecoders.ts';

export const RLRC_POST_GOAL_GAP_THRESHOLD_SECONDS = 0.5;
export const RLRC_NOMINAL_SOURCE_DT_SECONDS = 1 / 30;

const sourceTimelineShiftBySlots = new WeakMap<
  readonly RLRCPlayerSlotTrackingState[],
  {
    lastFrameIdx: number;
    lastRawTimeSeconds: number;
    cumulativeShiftSeconds: number;
    wasRoundTeardown: boolean;
  }
>();

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
  return Array.from({ length: RLRC_MAX_PLAYER_SLOTS }, (_, slotIndex) => ({
    carId: -1,
    entityActive: false,
    isDemolished: false,
    demolishFrameIndex: -1,
    spawnFrameIndex: -2,
    rbUpdated: false,
    rigidBody: createParkedCarRigidBody(slotIndex),
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
    if (initLoc) slotState.rigidBody = { ...DEFAULT_CAR_RB, position: initLoc, rbUpdated: true };
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
}): { readonly victimSlot: number; readonly bookmark: RLRCBookmarkRecord | null } {
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
  const demolishData =
    recAttr(attrRecord?.DemolishExtended ?? attrRecord?.Demolish ?? attrRecord?.DemolishFx) ??
    attrRecord;
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

  const isRoundTeardown = !ballSnapshot.ball.entityActive && !slots.some((s) => s.entityActive);
  if (isRoundTeardown) {
    for (const slotState of slots) {
      slotState.isDemolished = false;
      slotState.demolishFrameIndex = -1;
    }
  }

  let shiftState = sourceTimelineShiftBySlots.get(slots);
  if (!shiftState || frameIdx <= shiftState.lastFrameIdx) {
    shiftState = {
      lastFrameIdx: frameIdx,
      lastRawTimeSeconds: timeSeconds,
      cumulativeShiftSeconds: 0,
      wasRoundTeardown: isRoundTeardown,
    };
    sourceTimelineShiftBySlots.set(slots, shiftState);
  } else {
    const rawStep = timeSeconds - shiftState.lastRawTimeSeconds;
    const prevWasTeardown = shiftState.wasRoundTeardown;
    shiftState.lastFrameIdx = frameIdx;
    shiftState.lastRawTimeSeconds = timeSeconds;
    shiftState.wasRoundTeardown = isRoundTeardown;
    if (rawStep > RLRC_POST_GOAL_GAP_THRESHOLD_SECONDS) {
      const targetStep = isRoundTeardown ? 0 : RLRC_NOMINAL_SOURCE_DT_SECONDS;
      shiftState.cumulativeShiftSeconds += rawStep - targetStep;
    } else if (prevWasTeardown && !isRoundTeardown && rawStep > 0) {
      shiftState.cumulativeShiftSeconds += rawStep - RLRC_NOMINAL_SOURCE_DT_SECONDS;
    }
  }

  const effectiveTimeSeconds = Math.max(0, timeSeconds - shiftState.cumulativeShiftSeconds);
  const effectiveDeltaSeconds =
    deltaSeconds > RLRC_POST_GOAL_GAP_THRESHOLD_SECONDS
      ? RLRC_NOMINAL_SOURCE_DT_SECONDS
      : deltaSeconds;
  const { cars, carRbUpdatedMask } = buildSourceFrameCars(slots, timeSeconds);
  const ballRbUpdated = ballSnapshot.ballRbUpdated;

  return {
    sourceFrame30Hz: frameIdx,
    timeSeconds: effectiveTimeSeconds,
    deltaSeconds: effectiveDeltaSeconds,
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
