/**
 * RLRCFrameStateSliceWriter.ts
 * Pure 120Hz frame-to-Float32Array slice writers, compact snapshot builder,
 * and team-grouped HUD slotKey mapping pipeline for RLRC Replay playback.
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
  EXTENDED_STATE_OFFSETS,
  MAX_CARS,
  NUM_BOOST_PADS,
} from '../../../physics/RocketSimConstants.ts';
import { assignTeamSlotKeys } from '../../container/RCReplayTimelineParser.ts';
import {
  RLRC_BOOST_PAD_COUNT,
  RLRC_STATE_FLOATS_PER_FRAME,
  type RLRCBallFrameState120Hz,
  type RLRCCarFrameState120Hz,
  type RLRCFrame120Hz,
  type RLRCPlayerSlotMeta,
  type RLRCQuat,
  type RLRCSynthesizedCarControls,
  type RLRCTeamIndex,
  type RLRCVec3,
} from '../RLRCReplayTypes.ts';

export const NEUTRAL_RLRC_CAR_CONTROLS: RLRCSynthesizedCarControls = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export interface RLRCPovSlotResolution {
  readonly slotIndex: number;
  readonly slotKey: 1 | 2 | 3 | 4 | 5 | 6;
  readonly team: RLRCTeamIndex;
  readonly slotKeyToCarIndex: Record<number, number>;
  readonly carIndexToSlotKey: Record<number, number>;
}

export function computeRLRCTeamSlotKeyMapping(
  roster: readonly RLRCPlayerSlotMeta[],
  localTeam: RLRCTeamIndex = 0
): {
  readonly slotKeyToCarIndex: Record<number, number>;
  readonly carIndexToSlotKey: Record<number, number>;
} {
  const blueEntries = roster
    .filter((meta) => meta.team !== 1)
    .map((meta) => ({ carIndex: meta.slotIndex }));
  const orangeEntries = roster
    .filter((meta) => meta.team === 1)
    .map((meta) => ({ carIndex: meta.slotIndex }));
  const leftEntries = localTeam === 1 ? orangeEntries : blueEntries;
  const rightEntries = localTeam === 1 ? blueEntries : orangeEntries;
  const { slotKeyToCarIndex, carIndexToSlotKey } = assignTeamSlotKeys(leftEntries, rightEntries);
  return { slotKeyToCarIndex, carIndexToSlotKey };
}

export function writeQuaternionBasisToSlice(
  quat: RLRCQuat,
  destination: Float32Array,
  baseOffset: number
): void {
  const qx = Number.isFinite(quat.x) ? quat.x : 0;
  const qy = Number.isFinite(quat.y) ? quat.y : 0;
  const qz = Number.isFinite(quat.z) ? quat.z : 0;
  const qw = Number.isFinite(quat.w) ? quat.w : 1;
  const normSq = qx * qx + qy * qy + qz * qz + qw * qw;
  if (normSq < 1e-8) {
    destination[baseOffset] = 1;
    destination[baseOffset + 1] = 0;
    destination[baseOffset + 2] = 0;
    destination[baseOffset + 3] = 0;
    destination[baseOffset + 4] = 1;
    destination[baseOffset + 5] = 0;
    destination[baseOffset + 6] = 0;
    destination[baseOffset + 7] = 0;
    destination[baseOffset + 8] = 1;
    return;
  }
  const invNorm = 1.0 / Math.sqrt(normSq);
  const x = qx * invNorm;
  const y = qy * invNorm;
  const z = qz * invNorm;
  const w = qw * invNorm;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  destination[baseOffset] = 1 - (yy + zz);
  destination[baseOffset + 1] = xy + wz;
  destination[baseOffset + 2] = xz - wy;
  destination[baseOffset + 3] = xy - wz;
  destination[baseOffset + 4] = 1 - (xx + zz);
  destination[baseOffset + 5] = yz + wx;
  destination[baseOffset + 6] = xz + wy;
  destination[baseOffset + 7] = yz - wx;
  destination[baseOffset + 8] = 1 - (xx + yy);
}

function writeVec3ToSlice(
  vector: RLRCVec3,
  destination: Float32Array,
  offset: number,
  fallbackZ = 0
): void {
  destination[offset] = Number.isFinite(vector.x) ? vector.x : 0;
  destination[offset + 1] = Number.isFinite(vector.y) ? vector.y : 0;
  destination[offset + 2] = Number.isFinite(vector.z) ? vector.z : fallbackZ;
}

export function writeBallFrameToSlice(
  ball: RLRCBallFrameState120Hz,
  destination: Float32Array
): void {
  destination.fill(0);
  const rigidBody = ball.rigidBody;
  writeVec3ToSlice(rigidBody.position, destination, BALL_STATE_OFFSETS.POS, 93.15);
  writeQuaternionBasisToSlice(rigidBody.rotation, destination, BALL_STATE_OFFSETS.ROT_MAT);
  if (ball.entityActive && !rigidBody.sleeping) {
    writeVec3ToSlice(rigidBody.linearVelocity, destination, BALL_STATE_OFFSETS.VEL);
    writeVec3ToSlice(rigidBody.angularVelocity, destination, BALL_STATE_OFFSETS.ANG_VEL);
  }
}

export function writeParkedCarSlice(slotIndex: number, destination: Float32Array): void {
  destination.fill(0);
  destination[CAR_STATE_OFFSETS.POS] = -5500;
  destination[CAR_STATE_OFFSETS.POS + 1] = slotIndex * 300;
  destination[CAR_STATE_OFFSETS.POS + 2] = -2000;
  destination[CAR_STATE_OFFSETS.FWD] = 1;
  destination[CAR_STATE_OFFSETS.RIGHT + 1] = 1;
  destination[CAR_STATE_OFFSETS.UP + 2] = 1;
}

export function writeCarFrameToSlice(car: RLRCCarFrameState120Hz, destination: Float32Array): void {
  const rigidBody = car.rigidBody;
  if (!car.entityActive) {
    const pos = rigidBody.position;
    const isParked =
      car.isDemolished === false ||
      (pos.x <= -5000 && pos.z <= -200) ||
      (pos.x === 0 && pos.y === 0 && pos.z === 0);
    if (isParked) {
      writeParkedCarSlice(car.slotIndex, destination);
      return;
    }
    destination.fill(0);
    writeVec3ToSlice(pos, destination, CAR_STATE_OFFSETS.POS, 17.01);
    writeQuaternionBasisToSlice(rigidBody.rotation, destination, CAR_STATE_OFFSETS.FWD);
    destination[CAR_STATE_OFFSETS.DEMOED] = 1;
    destination[CAR_STATE_OFFSETS.GROUND_NORMAL + 2] = 1;
    return;
  }
  destination.fill(0);
  writeVec3ToSlice(rigidBody.position, destination, CAR_STATE_OFFSETS.POS, 17.01);
  writeQuaternionBasisToSlice(rigidBody.rotation, destination, CAR_STATE_OFFSETS.FWD);
  if (!rigidBody.sleeping) {
    writeVec3ToSlice(rigidBody.linearVelocity, destination, CAR_STATE_OFFSETS.VEL);
    writeVec3ToSlice(rigidBody.angularVelocity, destination, CAR_STATE_OFFSETS.ANG_VEL);
  }
  destination[CAR_STATE_OFFSETS.BOOST] = Math.max(0, Math.min(100, Number(car.boostAmount) || 0));
  destination[CAR_STATE_OFFSETS.ON_GROUND] = car.isOnGround ? 1 : 0;
  destination[CAR_STATE_OFFSETS.SUPERSONIC] = car.isSupersonic ? 1 : 0;
  destination[CAR_STATE_OFFSETS.HAS_FLIP_OR_JUMP] = car.hasFlipOrJump ? 1 : 0;
  destination[CAR_STATE_OFFSETS.IS_BOOSTING] =
    car.activeFlags.boostActive || car.controls.boost ? 1 : 0;
  destination[CAR_STATE_OFFSETS.IS_FLIPPING] = car.activeFlags.dodgeActive ? 1 : 0;

  const steerRadians = (Number(car.controls.steer) || 0) * 0.5235988;
  for (let wheelIndex = 0; wheelIndex < 4; wheelIndex++) {
    const wheelBase = CAR_STATE_OFFSETS.WHEELS + wheelIndex * 3;
    destination[wheelBase] = car.isOnGround ? 18.0 : 35.0;
    destination[wheelBase + 1] = wheelIndex < 2 ? steerRadians : 0;
    destination[wheelBase + 2] = car.isOnGround ? 1 : 0;
  }
  destination[CAR_STATE_OFFSETS.GROUND_NORMAL + 2] = 1;
}

export function findRLRCCarBySlot(
  cars: readonly RLRCCarFrameState120Hz[],
  slotIndex: number
): RLRCCarFrameState120Hz | null {
  if (slotIndex >= 0 && slotIndex < cars.length && cars[slotIndex]?.slotIndex === slotIndex) {
    return cars[slotIndex];
  }
  return cars.find((car) => car.slotIndex === slotIndex) ?? null;
}

export function writeBoostPadCooldownsToStateBuffer(
  cooldowns: Float32Array | ArrayLike<number> | undefined,
  stateBuffer: Float32Array
): void {
  const count = Math.min(RLRC_BOOST_PAD_COUNT, cooldowns?.length || 0);
  for (let i = 0; i < RLRC_BOOST_PAD_COUNT; i++) {
    const offset = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    if (offset + 1 >= stateBuffer.length) break;
    const cooldown = i < count ? Math.max(0, Number(cooldowns![i]) || 0) : 0;
    stateBuffer[offset + BOOST_PAD_OFFSETS.IS_ACTIVE] = cooldown <= 1e-4 ? 1 : 0;
    stateBuffer[offset + BOOST_PAD_OFFSETS.COOLDOWN] = cooldown;
  }
}

export function buildCompactSnapshotFromRLRCFrame(
  frame: RLRCFrame120Hz,
  out: Float32Array = new Float32Array(RLRC_STATE_FLOATS_PER_FRAME)
): Float32Array {
  out.fill(0);
  let maxSlotPlusOne = 1;
  for (const car of frame.cars) {
    if (!car || car.slotIndex < 0 || car.slotIndex >= MAX_CARS) continue;
    const pos = car.rigidBody.position;
    const isParked =
      (pos.x <= -5000 && pos.z <= -200) || (pos.x === 0 && pos.y === 0 && pos.z === 0);
    if (car.entityActive || !isParked) {
      maxSlotPlusOne = Math.max(maxSlotPlusOne, car.slotIndex + 1);
    }
  }
  out[SIM_OFFSETS.TICK] = Math.max(16, frame.frameIndex120Hz + 16);
  out[SIM_OFFSETS.NUM_CARS] = maxSlotPlusOne;
  out[SIM_OFFSETS.NUM_PADS] = NUM_BOOST_PADS;

  writeBallFrameToSlice(
    frame.ball,
    out.subarray(SIM_OFFSETS.BALL, SIM_OFFSETS.BALL + BALL_STATE_STRIDE)
  );

  for (let slot = 0; slot < MAX_CARS; slot++) {
    const offset = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
    const slice = out.subarray(offset, offset + CAR_STATE_STRIDE);
    const carFrame = findRLRCCarBySlot(frame.cars, slot);
    if (carFrame) {
      writeCarFrameToSlice(carFrame, slice);
    } else {
      writeParkedCarSlice(slot, slice);
    }
  }

  writeBoostPadCooldownsToStateBuffer(frame.boostPadCooldowns, out);
  out[EXTENDED_STATE_OFFSETS.IS_BALL_SLEEPING] =
    (frame.ball.entityActive ? 0 : 2) | (frame.ball.rigidBody.sleeping ? 1 : 0);
  return out;
}
