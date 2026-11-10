/**
 * RocketSimStateViews.ts
 * Zero-allocation, high-performance typed state views for RocketSim shared linear memory.
 *
 * Linear Memory Offsets & Stride Contract (must remain synchronized with RocketSimBridge.cpp):
 * - ArenaHeaderPod: 4 floats (offsets 0..3) [tickCount, goalScoredFlag, numCars, numPads]
 * - BallStatePod: 18 floats (offsets 4..21) [pos(3), fwd(3), right(3), up(3), vel(3), angVel(3)]
 * - CarStatePod[8]: 8 * 40 floats (offsets 22..341), per-car stride = 40 floats:
 *   [pos(3), fwd(3), right(3), up(3), vel(3), angVel(3), boost(1), flags(6), wheels(4*3=12), groundNormal(3)]
 *   Wheels start at car base + 25, 3 floats per wheel: [susLength (UU), steerAngle (rad), hasContact (0/1)]
 * - BoostPadStatePod[34]: 34 * 2 floats (offsets 342..409) [isActive, cooldown]
 */

import {
  MAX_CARS,
  CAR_STATE_STRIDE,
  NUM_BOOST_PADS,
  BOOST_PAD_STATES_OFFSET,
  BOOST_PAD_STATE_STRIDE,
  SIM_OFFSETS,
  EXTENDED_STATE_OFFSETS,
  SURFACE_SUBTYPES,
} from './RocketSimConstants.ts';

export type NumericStateBuffer = Float32Array | Float64Array | number[];

export class ArenaHeaderView {
  buffer: NumericStateBuffer | null;
  constructor(buffer: NumericStateBuffer | null = null) {
    this.buffer = buffer;
  }

  attach(buffer: NumericStateBuffer | null) {
    this.buffer = buffer;
    return this;
  }

  get tickCount() {
    return this.buffer ? this.buffer[SIM_OFFSETS.TICK] : 0;
  }
  set tickCount(v: number) {
    if (this.buffer) this.buffer[SIM_OFFSETS.TICK] = v;
  }
  get goalScoredFlag() {
    return this.buffer ? this.buffer[SIM_OFFSETS.GOAL] : 0;
  }
  get numCars() {
    return this.buffer ? this.buffer[SIM_OFFSETS.NUM_CARS] : 0;
  }
  get numPads() {
    return this.buffer ? this.buffer[SIM_OFFSETS.NUM_PADS] : 0;
  }
}

export class CarStateView {
  buffer: NumericStateBuffer | null;
  baseOffset: number;
  constructor(buffer: NumericStateBuffer | null = null, baseOffset = 0) {
    this.buffer = buffer;
    this.baseOffset = baseOffset;
  }

  attach(buffer, baseOffsetOrCarIndex = 0) {
    this.buffer = buffer;
    this.baseOffset =
      baseOffsetOrCarIndex >= 0 && baseOffsetOrCarIndex < MAX_CARS
        ? SIM_OFFSETS.CARS + baseOffsetOrCarIndex * CAR_STATE_STRIDE
        : baseOffsetOrCarIndex;
    return this;
  }

  attachCar(buffer, carIndex = 0) {
    this.buffer = buffer;
    this.baseOffset = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE;
    return this;
  }

  get posX() {
    return this.buffer ? this.buffer[this.baseOffset + 0] : 0;
  }
  get posY() {
    return this.buffer ? this.buffer[this.baseOffset + 1] : 0;
  }
  get posZ() {
    return this.buffer ? this.buffer[this.baseOffset + 2] : 0;
  }

  get fwdX() {
    return this.buffer ? this.buffer[this.baseOffset + 3] : 0;
  }
  get fwdY() {
    return this.buffer ? this.buffer[this.baseOffset + 4] : 0;
  }
  get fwdZ() {
    return this.buffer ? this.buffer[this.baseOffset + 5] : 0;
  }

  get rightX() {
    return this.buffer ? this.buffer[this.baseOffset + 6] : 0;
  }
  get rightY() {
    return this.buffer ? this.buffer[this.baseOffset + 7] : 0;
  }
  get rightZ() {
    return this.buffer ? this.buffer[this.baseOffset + 8] : 0;
  }

  get upX() {
    return this.buffer ? this.buffer[this.baseOffset + 9] : 0;
  }
  get upY() {
    return this.buffer ? this.buffer[this.baseOffset + 10] : 0;
  }
  get upZ() {
    return this.buffer ? this.buffer[this.baseOffset + 11] : 0;
  }

  get velX() {
    return this.buffer ? this.buffer[this.baseOffset + 12] : 0;
  }
  get velY() {
    return this.buffer ? this.buffer[this.baseOffset + 13] : 0;
  }
  get velZ() {
    return this.buffer ? this.buffer[this.baseOffset + 14] : 0;
  }

  get angVelX() {
    return this.buffer ? this.buffer[this.baseOffset + 15] : 0;
  }
  get angVelY() {
    return this.buffer ? this.buffer[this.baseOffset + 16] : 0;
  }
  get angVelZ() {
    return this.buffer ? this.buffer[this.baseOffset + 17] : 0;
  }

  get boost() {
    return this.buffer ? this.buffer[this.baseOffset + 18] : 0;
  }
  set boost(val) {
    if (this.buffer) {
      this.buffer[this.baseOffset + 18] = Number(val) || 0;
    }
  }
  get isOnGround() {
    return this.buffer ? this.buffer[this.baseOffset + 19] >= 0.5 : false;
  }
  get isSupersonic() {
    return this.buffer ? this.buffer[this.baseOffset + 20] >= 0.5 : false;
  }
  get isDemoed() {
    return this.buffer ? this.buffer[this.baseOffset + 21] > 0 : false;
  }
  get demoRespawnTimer() {
    if (!this.buffer) return 0;
    const val = this.buffer[this.baseOffset + 21];
    return val > 0 ? val : 0;
  }
  get hasFlipOrJump() {
    return this.buffer ? Math.round(this.buffer[this.baseOffset + 22]) !== 0 : false;
  }
  get flipsRemaining() {
    return this.buffer ? Math.round(this.buffer[this.baseOffset + 22]) : 0;
  }
  get isBoosting() {
    return this.buffer ? this.buffer[this.baseOffset + 23] >= 0.5 : false;
  }
  get isFlipping() {
    return this.buffer ? this.buffer[this.baseOffset + 24] >= 0.5 : false;
  }

  getWheelSusLength(wheelIndex) {
    return this.buffer ? this.buffer[this.baseOffset + 25 + wheelIndex * 3 + 0] : 0;
  }
  getWheelSteerAngle(wheelIndex) {
    return this.buffer ? this.buffer[this.baseOffset + 25 + wheelIndex * 3 + 1] : 0;
  }
  getWheelContact(wheelIndex) {
    return this.buffer ? this.buffer[this.baseOffset + 25 + wheelIndex * 3 + 2] >= 0.5 : false;
  }

  get groundNormalX() {
    return this.buffer ? this.buffer[this.baseOffset + 37] : 0;
  }
  get groundNormalY() {
    return this.buffer ? this.buffer[this.baseOffset + 38] : 0;
  }
  get groundNormalZ() {
    return this.buffer ? this.buffer[this.baseOffset + 39] : 0;
  }

  get forwardSpeed() {
    return this.velX * this.fwdX + this.velY * this.fwdY + this.velZ * this.fwdZ;
  }

  get carIndex() {
    return Math.round((this.baseOffset - SIM_OFFSETS.CARS) / CAR_STATE_STRIDE);
  }

  get isJumping() {
    const idx = this.carIndex;
    if (idx < 0 || idx >= MAX_CARS) return false;
    const base =
      EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_BASE + idx * EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_STRIDE;
    if (!this.buffer || this.buffer.length < base + 4) return false;
    return this.buffer[base + EXTENDED_STATE_OFFSETS.CAR_IS_JUMPING_OFFSET] > 0.5;
  }

  get airTime() {
    const idx = this.carIndex;
    if (idx < 0 || idx >= MAX_CARS) return 0;
    const base =
      EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_BASE + idx * EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_STRIDE;
    if (!this.buffer || this.buffer.length < base + 4) return 0;
    return this.buffer[base + EXTENDED_STATE_OFFSETS.CAR_AIR_TIME_OFFSET];
  }

  get jumpTime() {
    if (this.isDemoed) return 0;
    const idx = this.carIndex;
    if (idx < 0 || idx >= MAX_CARS) return 0;
    const base =
      EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_BASE + idx * EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_STRIDE;
    if (!this.buffer || this.buffer.length < base + 4) return 0;
    return this.buffer[base + EXTENDED_STATE_OFFSETS.CAR_JUMP_TIME_OFFSET];
  }

  get demoSpawnSelection() {
    if (!this.isDemoed) return -1;
    const idx = this.carIndex;
    if (idx < 0 || idx >= MAX_CARS) return -1;
    const base =
      EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_BASE + idx * EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_STRIDE;
    if (!this.buffer || this.buffer.length < base + 4) return -1;
    const raw = Math.round(this.buffer[base + EXTENDED_STATE_OFFSETS.CAR_JUMP_TIME_OFFSET]);
    return raw >= 0 && raw <= 3 ? raw : -1;
  }

  get airTimeSinceJump() {
    const idx = this.carIndex;
    if (idx < 0 || idx >= MAX_CARS) return 0;
    const base =
      EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_BASE + idx * EXTENDED_STATE_OFFSETS.CAR_JUMP_AIR_STRIDE;
    if (!this.buffer || this.buffer.length < base + 4) return 0;
    return this.buffer[base + EXTENDED_STATE_OFFSETS.CAR_AIR_TIME_SINCE_JUMP_OFFSET];
  }

  get flipRemainingSeconds() {
    if (this.isDemoed || !this.hasFlipOrJump) return 0.0;
    if (this.isOnGround) return 1.25;
    const elapsed = this.airTimeSinceJump;
    if (elapsed <= 0.0001) return 1.25;
    return Math.max(0.0, Math.min(1.25, 1.25 - elapsed));
  }

  get flipStatus() {
    if (this.isDemoed || !this.hasFlipOrJump) return 'expired';
    if (this.isOnGround) return 'grounded';
    if (!this.isJumping && this.airTimeSinceJump <= 0.0001) return 'unlimited';
    return 'countdown';
  }
}

export class BallStateView {
  buffer: NumericStateBuffer | null;
  baseOffset: number;
  constructor(buffer: NumericStateBuffer | null = null, baseOffset = SIM_OFFSETS.BALL) {
    this.buffer = buffer;
    this.baseOffset = baseOffset;
  }

  attach(buffer: NumericStateBuffer | null, baseOffset = SIM_OFFSETS.BALL) {
    this.buffer = buffer;
    this.baseOffset = baseOffset;
    return this;
  }

  get posX() {
    return this.buffer ? this.buffer[this.baseOffset + 0] : 0;
  }
  get posY() {
    return this.buffer ? this.buffer[this.baseOffset + 1] : 0;
  }
  get posZ() {
    return this.buffer ? this.buffer[this.baseOffset + 2] : 0;
  }

  get fwdX() {
    return this.buffer ? this.buffer[this.baseOffset + 3] : 0;
  }
  get fwdY() {
    return this.buffer ? this.buffer[this.baseOffset + 4] : 0;
  }
  get fwdZ() {
    return this.buffer ? this.buffer[this.baseOffset + 5] : 0;
  }

  get rightX() {
    return this.buffer ? this.buffer[this.baseOffset + 6] : 0;
  }
  get rightY() {
    return this.buffer ? this.buffer[this.baseOffset + 7] : 0;
  }
  get rightZ() {
    return this.buffer ? this.buffer[this.baseOffset + 8] : 0;
  }

  get upX() {
    return this.buffer ? this.buffer[this.baseOffset + 9] : 0;
  }
  get upY() {
    return this.buffer ? this.buffer[this.baseOffset + 10] : 0;
  }
  get upZ() {
    return this.buffer ? this.buffer[this.baseOffset + 11] : 0;
  }

  get velX() {
    return this.buffer ? this.buffer[this.baseOffset + 12] : 0;
  }
  get velY() {
    return this.buffer ? this.buffer[this.baseOffset + 13] : 0;
  }
  get velZ() {
    return this.buffer ? this.buffer[this.baseOffset + 14] : 0;
  }

  get angVelX() {
    return this.buffer ? this.buffer[this.baseOffset + 15] : 0;
  }
  get angVelY() {
    return this.buffer ? this.buffer[this.baseOffset + 16] : 0;
  }
  get angVelZ() {
    return this.buffer ? this.buffer[this.baseOffset + 17] : 0;
  }
}

export class BoostPadStateView {
  buffer: NumericStateBuffer | null;
  baseOffset: number;
  constructor(buffer: NumericStateBuffer | null = null, padIndex = 0) {
    this.buffer = buffer;
    this.baseOffset = BOOST_PAD_STATES_OFFSET + padIndex * BOOST_PAD_STATE_STRIDE;
  }

  attach(buffer: NumericStateBuffer | null, padIndex = 0) {
    this.buffer = buffer;
    this.baseOffset = BOOST_PAD_STATES_OFFSET + padIndex * BOOST_PAD_STATE_STRIDE;
    return this;
  }

  get isActive() {
    return this.buffer ? this.buffer[this.baseOffset] > 0.5 : false;
  }
  get cooldown() {
    return this.buffer ? this.buffer[this.baseOffset + 1] : 0;
  }
}

export class GameStateView {
  buffer: NumericStateBuffer | null;
  header: ArenaHeaderView;
  ball: BallStateView;
  cars: CarStateView[];
  pads: BoostPadStateView[];
  constructor(buffer: NumericStateBuffer | null = null) {
    this.buffer = buffer;
    this.header = new ArenaHeaderView(buffer);
    this.ball = new BallStateView(buffer);
    this.cars = Array.from(
      { length: MAX_CARS },
      (_, i) => new CarStateView(buffer, SIM_OFFSETS.CARS + i * CAR_STATE_STRIDE)
    );
    this.pads = Array.from({ length: NUM_BOOST_PADS }, (_, i) => new BoostPadStateView(buffer, i));
  }

  attach(buffer) {
    this.buffer = buffer;
    this.header.attach(buffer);
    this.ball.attach(buffer);
    for (let i = 0; i < MAX_CARS; i++) {
      this.cars[i].attachCar(buffer, i);
    }
    for (let i = 0; i < NUM_BOOST_PADS; i++) {
      this.pads[i].attach(buffer, i);
    }
    return this;
  }

  getCar(index = 0) {
    return this.cars[index];
  }

  getPad(index = 0) {
    return this.pads[index];
  }
}

export function classifyBallHitSurface(
  x,
  y,
  z,
  nx,
  ny,
  nz,
  isGoalpost = false,
  floorNz = 0.8,
  netNz = 0.05
) {
  const isNearGoal = Math.abs(y) >= 4950.0;
  const isCrossbar = Math.abs(z - 642.78) < 95.0 && Math.abs(x) <= 960.0;
  const isUprightPost = Math.abs(Math.abs(x) - 892.755) < 95.0 && z <= 720.0;

  if (isGoalpost || (isNearGoal && (isCrossbar || isUprightPost))) {
    return isCrossbar ? SURFACE_SUBTYPES.CROSSBAR : SURFACE_SUBTYPES.GOALPOST;
  }
  if (nz >= floorNz) return SURFACE_SUBTYPES.FLOOR;
  if (nz <= netNz) return SURFACE_SUBTYPES.SIDE_WALL;
  return SURFACE_SUBTYPES.RAMP_GROUND;
}
