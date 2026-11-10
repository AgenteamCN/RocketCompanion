/**
 * PhysicsEventReader.ts
 * Zero-Copy Ring Buffer Consumer for RocketSim WebAssembly Physics Events.
 *
 * Ring Buffer Invariants:
 * - Capacity: N = 256 slots (16,384 bytes) + 16-byte header = 16,400 bytes.
 * - Header (4 uint32 words): [writeSeq, capacity(256), eventSize(64), droppedCount].
 * - Each PhysicsEvent is 64-byte (16 words) cache-line aligned.
 */

import {
  INCIDENT_EVENT_TYPES,
  PHYSICS_EVENT_TYPES,
  SURFACE_SUBTYPES,
  CAR_ACTION_SUBTYPES,
  FLIP_RESET_SUBTYPES,
  FLIP_RESET_SUBTYPE_LABELS,
  getFlipResetObjectCode,
  getFlipResetObjectName,
  PHYSICS_EVENT_FLAGS,
  EVENT_BUFFER_CAPACITY,
  EVENT_SIZE_BYTES,
  EVENT_HEADER_WORDS,
} from './RocketSimConstants.ts';
import { classifyBallHitSurface } from './RocketSimStateViews.ts';

export interface PhysicsEventRecord {
  type: number;
  tick: number;
  x: number;
  y: number;
  z: number;
  carIndex: number;
  team: number;
  relSpeed: number;
  speed: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  normalRelVel?: number;
  impulse: number;
  isDemo: boolean;
  car1Index: number;
  car2Index: number;
  car1Team: number;
  car2Team: number;
  surfaceTag: number;
  isCrossbar: boolean;
  actionSubType: number;
  subType: number;
  padIndex: number;
  isBig: boolean;
  flags: number;
  primaryId?: number;
  secondaryId?: number;
  customFloat?: number;
  customInt?: number;
  directionDotNormal?: number;
  dirDot?: number;
  impactAngleDeg?: number;
  isInitialTouch: boolean;
  isSupersonic: boolean;
  isFlipping: boolean;
  isOnGround: boolean;
  carPosX?: number;
  carPosY?: number;
  carPosZ?: number;
  ballPosX?: number;
  ballPosY?: number;
  ballPosZ?: number;
  carPos?: { x: number; y: number; z: number };
  ballPos?: { x: number; y: number; z: number };
  resetSubType?: number;
  resetSubTypeName?: string;
  resetObjectCode?: number;
  resetObjectType?: string;
  resetTargetCarIndex?: number;
  resetSurfaceTag?: number;
  resetWheelCount?: number;
  isBallFlipReset?: boolean;
  [key: string]: unknown;
}

export interface PhysicsEventBufferSource {
  HEAPU8?: Uint8Array;
  buffer?: ArrayBufferLike;
}

export class PhysicsEventReader {
  buffer: ArrayBufferLike | null = null;
  byteOffset = 0;
  u32View: Uint32Array | null = null;
  f32View: Float32Array | null = null;
  lastReadSeq = 0;
  ballStateProvider: { velX?: number; velY?: number; velZ?: number } | null = null;
  module?: { HEAPU8?: Uint8Array } | null;
  bufferCapacity?: number;
  strideWords?: number;
  currentEvent: PhysicsEventRecord;

  constructor(buffer: ArrayBufferLike | PhysicsEventBufferSource | null = null, byteOffset = 0) {
    this.currentEvent = {
      type: PHYSICS_EVENT_TYPES.NONE,
      tick: 0,
      x: 0,
      y: 0,
      z: 0,
      carIndex: 0,
      team: 0,
      relSpeed: 0,
      speed: 0,
      normalX: 0,
      normalY: 0,
      normalZ: 0,
      impulse: 0,
      isDemo: false,
      car1Index: 0,
      car2Index: 0,
      car1Team: 0,
      car2Team: 0,
      surfaceTag: 0,
      isCrossbar: false,
      actionSubType: 0,
      subType: 0,
      padIndex: 0,
      isBig: false,
      flags: 0,
      isInitialTouch: false,
      isSupersonic: false,
      isFlipping: false,
      isOnGround: false,
    };

    if (buffer) this.attach(buffer, byteOffset);
  }

  attach(
    arrayBufferOrHeap: ArrayBufferLike | PhysicsEventBufferSource | null | undefined,
    byteOffset = 0
  ): this {
    if (
      arrayBufferOrHeap &&
      typeof arrayBufferOrHeap === 'object' &&
      'HEAPU8' in arrayBufferOrHeap
    ) {
      this.module = arrayBufferOrHeap;
    }
    const src = arrayBufferOrHeap as PhysicsEventBufferSource | null | undefined;
    const rawBuffer =
      src?.HEAPU8?.buffer || src?.buffer || (arrayBufferOrHeap as ArrayBufferLike | null);
    if (!rawBuffer) {
      this.buffer = null;
      this.u32View = null;
      this.f32View = null;
      return this;
    }
    this.buffer = rawBuffer;
    this.byteOffset = byteOffset;

    let capacity = EVENT_BUFFER_CAPACITY;
    let eventSize = EVENT_SIZE_BYTES;
    if (rawBuffer.byteLength >= byteOffset + 16) {
      const header = new Uint32Array(rawBuffer, byteOffset, 4);
      if (header[1] >= 16 && header[1] <= 1024) capacity = header[1];
      if (header[2] === 48 || header[2] === 64) eventSize = header[2];
    }
    this.bufferCapacity = capacity;
    this.strideWords = eventSize / 4;

    const totalWords = EVENT_HEADER_WORDS + capacity * this.strideWords;
    this.u32View = new Uint32Array(rawBuffer, byteOffset, totalWords);
    this.f32View = new Float32Array(rawBuffer, byteOffset, totalWords);
    return this;
  }

  _ensureAttached(): void {
    if (this.module?.HEAPU8?.buffer && this.buffer !== this.module.HEAPU8.buffer) {
      this.attach(this.module.HEAPU8.buffer, this.byteOffset);
    }
  }

  get writeSeq(): number {
    this._ensureAttached();
    return this.u32View && this.u32View.byteLength > 0 ? this.u32View[0] : 0;
  }

  get capacity(): number {
    this._ensureAttached();
    return (
      this.bufferCapacity ||
      (this.u32View && this.u32View.byteLength >= 8 ? this.u32View[1] : EVENT_BUFFER_CAPACITY)
    );
  }

  get eventSize(): number {
    this._ensureAttached();
    return (
      (this.strideWords || 0) * 4 ||
      (this.u32View && this.u32View.byteLength >= 12 ? this.u32View[2] : EVENT_SIZE_BYTES)
    );
  }

  reset(): void {
    this._ensureAttached();
    this.lastReadSeq = this.writeSeq || 0;
  }

  private _computeLegacyWorldHitAngle(ev: PhysicsEventRecord): void {
    if (this.ballStateProvider) {
      const vx = this.ballStateProvider.velX || 0;
      const vy = this.ballStateProvider.velY || 0;
      const vz = this.ballStateProvider.velZ || 0;
      const deltaVn = -(vx * ev.normalX + vy * ev.normalY + vz * ev.normalZ);
      ev.normalRelVel = Math.abs(deltaVn) < 1e-6 ? 0 : deltaVn;
    } else {
      ev.normalRelVel = Math.abs(ev.normalZ) > 0.8 ? 0 : ev.speed;
    }
    ev.directionDotNormal =
      ev.speed > 1e-4 ? Math.max(0, Math.min(1, Math.max(0, ev.normalRelVel) / ev.speed)) : 0;
    ev.dirDot = ev.directionDotNormal;
    ev.impactAngleDeg =
      Math.asin(Math.max(0, Math.min(1, ev.directionDotNormal))) * (180 / Math.PI);
  }

  decodeSlot(wordOffset: number): PhysicsEventRecord {
    const u32 = this.u32View!;
    const f32 = this.f32View!;
    const ev = this.currentEvent;

    const type = u32[wordOffset + 0];
    ev.type = type;
    ev.tick = u32[wordOffset + 1];
    ev.x = f32[wordOffset + 2];
    ev.y = f32[wordOffset + 3];
    ev.z = f32[wordOffset + 4];

    ev.carIndex = 0;
    ev.team = 0;
    ev.relSpeed = 0;
    ev.speed = 0;
    ev.normalX = 0;
    ev.normalY = 0;
    ev.normalZ = 0;
    ev.normalRelVel = 0;
    ev.impulse = 0;
    ev.isDemo = false;
    ev.car1Index = 0;
    ev.car2Index = 0;
    ev.car1Team = 0;
    ev.car2Team = 0;
    ev.surfaceTag = 0;
    ev.isCrossbar = false;
    ev.actionSubType = 0;
    ev.subType = 0;
    ev.padIndex = 0;
    ev.isBig = false;
    ev.primaryId = 0;
    ev.secondaryId = 0;
    ev.customFloat = 0;
    ev.customInt = 0;
    ev.carPosX = undefined;
    ev.carPosY = undefined;
    ev.carPosZ = undefined;
    ev.ballPosX = undefined;
    ev.ballPosY = undefined;
    ev.ballPosZ = undefined;
    ev.carPos = undefined;
    ev.ballPos = undefined;
    ev.resetSubType = 0;
    ev.resetSubTypeName = 'none';
    ev.resetObjectCode = 0;
    ev.resetObjectType = 'none';
    ev.resetTargetCarIndex = -1;
    ev.resetSurfaceTag = 0;
    ev.resetWheelCount = 0;
    ev.isBallFlipReset = false;

    const T = INCIDENT_EVENT_TYPES;
    if (this.strideWords === 16) {
      ev.normalX = f32[wordOffset + 5];
      ev.normalY = f32[wordOffset + 6];
      ev.normalZ = f32[wordOffset + 7];
      ev.normalRelVel = f32[wordOffset + 8];
      ev.speed = f32[wordOffset + 9];
      ev.relSpeed = ev.speed;
      ev.impulse = f32[wordOffset + 10];
      const ids = u32[wordOffset + 11];
      ev.primaryId = ids & 0xffff;
      ev.secondaryId = (ids >>> 16) & 0xffff;
      ev.carIndex = ev.primaryId === 65535 ? 0 : ev.primaryId;
      ev.car1Index = ev.carIndex;
      if (type === T.CAR_CAR_BUMP || type === T.CAR_CAR_DEMO) {
        ev.car2Index = ev.secondaryId === 65535 ? 0 : ev.secondaryId;
      } else {
        ev.car2Index = ev.secondaryId;
        ev.team = ev.secondaryId;
      }
      ev.subType = u32[wordOffset + 12];
      if (type === T.BALL_WORLD_HIT || type === T.BALL_GOALPOST_HIT) {
        if (ev.subType === 0) {
          ev.subType = classifyBallHitSurface(
            ev.x,
            ev.y,
            ev.z,
            ev.normalX,
            ev.normalY,
            ev.normalZ,
            type === T.BALL_GOALPOST_HIT
          );
        }
        if (ev.subType === SURFACE_SUBTYPES.CROSSBAR || ev.subType === SURFACE_SUBTYPES.GOALPOST) {
          ev.type = T.BALL_GOALPOST_HIT;
        }
      }
      ev.surfaceTag = ev.subType;
      ev.isCrossbar =
        (ev.type === T.BALL_WORLD_HIT || ev.type === T.BALL_GOALPOST_HIT) &&
        ev.subType === SURFACE_SUBTYPES.CROSSBAR;
      ev.actionSubType = ev.subType;
      ev.padIndex = ev.secondaryId;
      if (type === T.BOOST_PICKUP || type === 0x0a) {
        ev.type = T.BOOST_PICKUP;
        ev.isBig = ev.subType === 1 || ev.padIndex < 6;
      } else if (type === T.BOOST_SPAWN || type === 0x0b) {
        ev.type = T.BOOST_SPAWN;
        ev.isBig = ev.subType === 1 || ev.padIndex < 6;
        ev.carIndex = -1;
      }
      const flags = u32[wordOffset + 13];
      ev.flags = flags;
      const customFloat = f32[wordOffset + 14];
      ev.customFloat = customFloat;
      ev.customInt = u32[wordOffset + 15];

      ev.directionDotNormal =
        customFloat > 0 && customFloat <= 1.0
          ? customFloat
          : ev.speed > 1e-4
            ? Math.max(0, Math.min(1, ev.normalRelVel / ev.speed))
            : 0;
      ev.dirDot = ev.directionDotNormal;
      ev.impactAngleDeg =
        Math.asin(Math.max(0, Math.min(1, ev.directionDotNormal))) * (180 / Math.PI);

      ev.isInitialTouch = (flags & PHYSICS_EVENT_FLAGS.INITIAL_TOUCH) !== 0;
      ev.isSupersonic = (flags & PHYSICS_EVENT_FLAGS.SUPERSONIC) !== 0;
      ev.isFlipping = (flags & PHYSICS_EVENT_FLAGS.FLIP) !== 0;
      ev.isOnGround = (flags & PHYSICS_EVENT_FLAGS.ON_GROUND) !== 0;
      ev.isDemo = type === T.CAR_CAR_DEMO;
      if (type === T.FLIP_RESET_GAINED) {
        ev.carPosX = ev.x;
        ev.carPosY = ev.y;
        ev.carPosZ = ev.z;
        ev.ballPosX = ev.normalX;
        ev.ballPosY = ev.normalY;
        ev.ballPosZ = ev.normalZ;
        ev.carPos = { x: ev.x, y: ev.y, z: ev.z };
        ev.ballPos = { x: ev.normalX, y: ev.normalY, z: ev.normalZ };
        ev.resetSubType = ev.subType;
        ev.resetSubTypeName = FLIP_RESET_SUBTYPE_LABELS[ev.subType] || 'none';
        ev.resetObjectCode = getFlipResetObjectCode(ev.subType, flags);
        ev.resetObjectType = getFlipResetObjectName(ev.subType, flags);
        const targetCar = (flags >>> 8) & 0xff;
        ev.resetTargetCarIndex = targetCar === 0xff ? -1 : targetCar;
        ev.resetSurfaceTag = (flags >>> 16) & 0xff;
        ev.resetWheelCount = Math.round(customFloat) || 4;
        ev.isBallFlipReset = ev.subType === FLIP_RESET_SUBTYPES.BALL;
      }
      return ev;
    }

    if (type === 1) {
      ev.type = T.CAR_BALL_HIT;
      const carAndTeam = u32[wordOffset + 5];
      ev.carIndex = carAndTeam & 0xffff;
      ev.primaryId = ev.carIndex;
      ev.team = (carAndTeam >>> 16) & 0xffff;
      ev.relSpeed = f32[wordOffset + 6];
      ev.speed = ev.relSpeed;
      ev.normalX = f32[wordOffset + 7];
      ev.normalY = f32[wordOffset + 8];
      ev.normalZ = f32[wordOffset + 9];
      ev.impulse = f32[wordOffset + 10];
      ev.normalRelVel = ev.relSpeed;
    } else if (type === 2) {
      const cars = u32[wordOffset + 5];
      const teams = u32[wordOffset + 6];
      ev.car1Index = cars & 0xffff;
      ev.car2Index = (cars >>> 16) & 0xffff;
      ev.carIndex = ev.car1Index;
      ev.primaryId = ev.car1Index;
      ev.secondaryId = ev.car2Index;
      ev.car1Team = teams & 0xffff;
      ev.car2Team = (teams >>> 16) & 0xffff;
      ev.team = ev.car1Team;
      ev.relSpeed = f32[wordOffset + 7];
      ev.speed = ev.relSpeed;
      ev.impulse = f32[wordOffset + 8];
      ev.isDemo = u32[wordOffset + 9] !== 0;
      ev.type = ev.isDemo ? T.CAR_CAR_DEMO : T.CAR_CAR_BUMP;
      ev.subType = ev.isDemo ? 1 : 0;
    } else if (type === 3 || type === 4) {
      const isGoalpost = type === 4;
      ev.type = isGoalpost ? T.BALL_GOALPOST_HIT : T.BALL_WORLD_HIT;
      ev.speed = f32[wordOffset + 5];
      ev.relSpeed = ev.speed;
      ev.normalX = f32[wordOffset + 6];
      ev.normalY = f32[wordOffset + 7];
      ev.normalZ = f32[wordOffset + 8];
      ev.subType = classifyBallHitSurface(
        ev.x,
        ev.y,
        ev.z,
        ev.normalX,
        ev.normalY,
        ev.normalZ,
        isGoalpost
      );
      ev.surfaceTag = ev.subType;
      if (isGoalpost)
        ev.isCrossbar = ev.subType === SURFACE_SUBTYPES.CROSSBAR || u32[wordOffset + 9] !== 0;
      this._computeLegacyWorldHitAngle(ev);
    } else if (type === 5) {
      const carAndTeam = u32[wordOffset + 5];
      ev.carIndex = carAndTeam & 0xffff;
      ev.primaryId = ev.carIndex;
      ev.team = (carAndTeam >>> 16) & 0xffff;
      ev.actionSubType = u32[wordOffset + 6];
      ev.subType = ev.actionSubType;
      ev.type =
        ev.actionSubType === CAR_ACTION_SUBTYPES.DOUBLE_JUMP
          ? T.CAR_DOUBLE_JUMP
          : ev.actionSubType === CAR_ACTION_SUBTYPES.DODGE
            ? T.CAR_DODGE
            : T.CAR_JUMP;
    } else if (type === 6) {
      ev.type = T.CAR_SUPERSONIC_ENTER;
      const carAndTeam = u32[wordOffset + 5];
      ev.carIndex = carAndTeam & 0xffff;
      ev.primaryId = ev.carIndex;
      ev.team = (carAndTeam >>> 16) & 0xffff;
      ev.speed = f32[wordOffset + 6];
      ev.relSpeed = ev.speed;
    } else if (type === 7) {
      ev.type = T.BOOST_PICKUP;
      const carAndTeam = u32[wordOffset + 5];
      ev.carIndex = carAndTeam & 0xffff;
      ev.primaryId = ev.carIndex;
      ev.team = (carAndTeam >>> 16) & 0xffff;
      ev.padIndex = u32[wordOffset + 6];
      ev.secondaryId = ev.padIndex;
      ev.isBig = u32[wordOffset + 7] === 1;
    } else if (type === T.GOAL_SCORED) {
      ev.type = T.GOAL_SCORED;
    } else if (type === T.FLIP_RESET_GAINED) {
      ev.type = T.FLIP_RESET_GAINED;
      ev.carPosX = ev.x;
      ev.carPosY = ev.y;
      ev.carPosZ = ev.z;
      ev.ballPosX = ev.normalX;
      ev.ballPosY = ev.normalY;
      ev.ballPosZ = ev.normalZ;
      ev.carPos = { x: ev.x, y: ev.y, z: ev.z };
      ev.ballPos = { x: ev.normalX, y: ev.normalY, z: ev.normalZ };
    }
    return ev;
  }

  readEvents(callback?: ((event: PhysicsEventRecord) => void) | null): number {
    this._ensureAttached();
    if (!this.u32View || !this.f32View || this.u32View.byteLength === 0) return 0;

    const currentWriteSeq = this.u32View[0];
    const capacity = this.bufferCapacity || EVENT_BUFFER_CAPACITY;
    const stride = this.strideWords || EVENT_SIZE_BYTES / 4;

    if (
      !Number.isFinite(this.lastReadSeq) ||
      this.lastReadSeq < 0 ||
      this.lastReadSeq > currentWriteSeq
    ) {
      this.lastReadSeq = 0;
    }

    const available = currentWriteSeq - this.lastReadSeq;
    if (available <= 0) return 0;
    if (available > capacity) this.lastReadSeq = currentWriteSeq - capacity;

    let processedCount = 0;
    while (this.lastReadSeq < currentWriteSeq) {
      const slot = this.lastReadSeq % capacity;
      const ev = this.decodeSlot(EVENT_HEADER_WORDS + slot * stride);
      this.lastReadSeq++;
      processedCount++;
      if (callback) callback(ev);
    }
    return processedCount;
  }
}
