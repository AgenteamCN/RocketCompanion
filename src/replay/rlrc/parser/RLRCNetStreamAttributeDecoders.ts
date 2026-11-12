/**
 * RLRCNetStreamAttributeDecoders.ts
 * Pure attribute decoders and per-frame car state builders for 30Hz NetStream extraction.
 */

import type {
  RLRCBasis3x3,
  RLRCCarComponentActiveFlags,
  RLRCCarFrameState120Hz,
  RLRCQuat,
  RLRCRigidBodySample,
  RLRCSynthesizedCarControls,
  RLRCVec3,
} from '../RLRCReplayTypes.ts';

export const RLRC_DEFAULT_SPAWN_BOOST = (85 / 255) * 100;
export const RLRC_DEFAULT_BALL_REST_Z = 93.15;
export const RLRC_SUPERSONIC_SPEED_UU_S = 2200;
export const RLRC_SUPERSONIC_MAINTAIN_SPEED_UU_S = 2100;
export const RLRC_CAR_MAX_SPEED_UU_S = 2300;
export const RLRC_BALL_MAX_SPEED_UU_S = 4500;
export const RLRC_FLIP_EXPIRATION_SECONDS = 1.25;
export const RLRC_PARKED_CAR_X = -5500;
export const RLRC_PARKED_CAR_Y_STRIDE = 300;
export const RLRC_PARKED_CAR_Z = -2000;

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

export const ZERO_VEC3: RLRCVec3 = { x: 0, y: 0, z: 0 };
export const IDENTITY_QUAT: RLRCQuat = { x: 0, y: 0, z: 0, w: 1 };

export const DEFAULT_CAR_RB: RLRCRigidBodySample = {
  sleeping: true,
  position: ZERO_VEC3,
  rotation: IDENTITY_QUAT,
  linearVelocity: ZERO_VEC3,
  angularVelocity: ZERO_VEC3,
  rbUpdated: false,
};

export function createParkedCarRigidBody(slotIndex: number): RLRCRigidBodySample {
  return {
    ...DEFAULT_CAR_RB,
    position: {
      x: RLRC_PARKED_CAR_X,
      y: slotIndex * RLRC_PARKED_CAR_Y_STRIDE,
      z: RLRC_PARKED_CAR_Z,
    },
  };
}

export const DEFAULT_BALL_RB: RLRCRigidBodySample = {
  ...DEFAULT_CAR_RB,
  position: { x: 0, y: 0, z: RLRC_DEFAULT_BALL_REST_Z },
};

export const DEFAULT_ACTIVE_FLAGS: RLRCCarComponentActiveFlags = {
  boostActive: false,
  jumpActive: false,
  doubleJumpActive: false,
  dodgeActive: false,
};

export const NEUTRAL_CONTROLS: RLRCSynthesizedCarControls = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
};

export function numAttr(v: unknown, fb = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

export function recAttr(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function extractVec3(raw: unknown, fb: RLRCVec3 = ZERO_VEC3): RLRCVec3 {
  const r = recAttr(raw);
  return r
    ? {
        x: numAttr(r.x ?? r.X, fb.x),
        y: numAttr(r.y ?? r.Y, fb.y),
        z: numAttr(r.z ?? r.Z, fb.z),
      }
    : fb;
}

export function normalizeQuat(raw: unknown): RLRCQuat {
  const r = recAttr(raw);
  if (!r) return IDENTITY_QUAT;
  const x = numAttr(r.x ?? r.X);
  const y = numAttr(r.y ?? r.Y);
  const z = numAttr(r.z ?? r.Z);
  const w = numAttr(r.w ?? r.W, 1);
  const len = Math.hypot(x, y, z, w);
  return len < 1e-6 ? IDENTITY_QUAT : { x: x / len, y: y / len, z: z / len, w: w / len };
}

export function quatToBasis3x3({ x, y, z, w }: RLRCQuat): RLRCBasis3x3 {
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return {
    fwd: { x: 1 - 2 * (yy + zz), y: 2 * (xy + wz), z: 2 * (xz - wy) },
    right: { x: 2 * (xy - wz), y: 1 - 2 * (xx + zz), z: 2 * (yz + wx) },
    up: { x: 2 * (xz + wy), y: 2 * (yz - wx), z: 1 - 2 * (xx + yy) },
  };
}

export function extractRigidBodySample(raw: unknown): RLRCRigidBodySample | null {
  const o = recAttr(raw);
  const rb = recAttr(o?.RigidBody) ?? o;
  const loc = rb?.location ?? rb?.position ?? rb?.pos;
  if (!rb || !loc) return null;
  const sleeping = Boolean(rb.sleeping ?? rb.bSleeping);
  const lv = rb.linear_velocity ?? rb.linearVelocity;
  const av = rb.angular_velocity ?? rb.angularVelocity;
  return {
    sleeping,
    position: extractVec3(loc),
    rotation: normalizeQuat(rb.rotation ?? rb.quat),
    linearVelocity: sleeping || !lv ? ZERO_VEC3 : extractVec3(lv),
    angularVelocity: sleeping || !av ? ZERO_VEC3 : extractVec3(av),
  };
}

export function normalizeReplicatedBoostAmount(raw: unknown): number | null {
  const o = recAttr(raw);
  const rp = recAttr(o?.ReplicatedBoost) ?? o;
  const b = typeof raw === 'number' ? raw : (rp?.boost_amount ?? rp?.boostAmount ?? o?.Byte);
  return typeof b === 'number' && Number.isFinite(b) ? (clamp(b, 0, 255) / 255) * 100 : null;
}

export function decodeReplicatedAxisByte(raw: unknown): number | null {
  const b = typeof raw === 'number' ? raw : numAttr(recAttr(raw)?.Byte, Number.NaN);
  return !Number.isFinite(b) ? null : b === 128 ? 0 : clamp((clamp(b, 0, 255) - 128) / 127, -1, 1);
}

export function isComponentActiveByte(raw: unknown): boolean | null {
  const b = typeof raw === 'number' ? raw : numAttr(recAttr(raw)?.Byte, Number.NaN);
  return Number.isFinite(b) ? (Math.trunc(b) & 1) === 1 : null;
}

export function extractActorIdFromAttr(raw: unknown): number {
  const o = recAttr(raw);
  const aa = recAttr(o?.ActiveActor) ?? o;
  return !aa || aa.active === false ? -1 : Math.trunc(numAttr(aa.actor, -1));
}

export function spawnBallRigidBody(il?: RLRCVec3): RLRCRigidBodySample {
  return {
    ...DEFAULT_BALL_RB,
    position:
      !il || (Math.abs(il.x) < 2 && Math.abs(il.y) < 2 && Math.abs(il.z - 93) < 2.5)
        ? DEFAULT_BALL_RB.position
        : { x: il.x, y: il.y, z: il.z > 0 ? il.z : RLRC_DEFAULT_BALL_REST_Z },
    rbUpdated: true,
  };
}

export function buildSourceFrameCars(
  slots: readonly RLRCPlayerSlotTrackingState[],
  timeSeconds: number
): { cars: RLRCCarFrameState120Hz[]; carRbUpdatedMask: number } {
  let carRbUpdatedMask = 0;
  const cars = slots.map((slotState, slotIndex): RLRCCarFrameState120Hz => {
    const rbUpdated = slotState.entityActive && slotState.rbUpdated;
    const isDemolished = !slotState.entityActive && slotState.isDemolished;
    const rigidBody = slotState.entityActive
      ? { ...slotState.rigidBody, rbUpdated }
      : isDemolished
        ? {
            ...DEFAULT_CAR_RB,
            position: slotState.rigidBody.position,
            rotation: slotState.rigidBody.rotation,
          }
        : createParkedCarRigidBody(slotIndex);
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
      isDemolished,
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
