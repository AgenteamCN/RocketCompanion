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
  RLRCSourceNetworkFrame,
  RLRCSynthesizedCarControls,
  RLRCVec3,
} from '../RLRCReplayTypes.ts';

const RLRC_MAX_PLAYER_SLOTS = 6;

export const RLRC_DEFAULT_SPAWN_BOOST = (85 / 255) * 100;
export const RLRC_DEFAULT_BALL_REST_Z = 93.15;
export const RLRC_SUPERSONIC_SPEED_UU_S = 2200;
export const RLRC_FLIP_EXPIRATION_SECONDS = 1.25;

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

export interface RLRCMutableSlotTracker {
  carId: number;
  on: boolean;
  spFi: number;
  upd: boolean;
  rb: RLRCRigidBodySample;
  boost: number;
  th: number;
  st: number;
  hb: boolean;
  bOn: boolean;
  jOn: boolean;
  dOn: boolean;
  dgOn: boolean;
  jT: number;
  flipped: boolean;
}

export function createMutableSlotTrackers(): RLRCMutableSlotTracker[] {
  return Array.from({ length: RLRC_MAX_PLAYER_SLOTS }, () => ({
    carId: -1,
    on: false,
    spFi: -2,
    upd: false,
    rb: DEFAULT_CAR_RB,
    boost: RLRC_DEFAULT_SPAWN_BOOST,
    th: 0,
    st: 0,
    hb: false,
    bOn: false,
    jOn: false,
    dOn: false,
    dgOn: false,
    jT: -1e9,
    flipped: false,
  }));
}

export function resetMutableSlotTracker(slot: RLRCMutableSlotTracker, clearCarId = false): void {
  if (clearCarId) slot.carId = -1;
  slot.on = false;
  slot.upd = false;
  slot.bOn = false;
  slot.jOn = false;
  slot.dOn = false;
  slot.dgOn = false;
  slot.hb = false;
  slot.th = 0;
  slot.st = 0;
}

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

export function applySlotRigidBodySampleUpdate(params: {
  readonly slot: RLRCMutableSlotTracker;
  readonly slotIndex: number;
  readonly carActorId: number;
  readonly frameIndex: number;
  readonly timeSeconds: number;
  readonly rb: RLRCRigidBodySample;
  readonly updatedRb: RLRCRigidBodySample;
  readonly networkFrames: RLRCSourceNetworkFrame[];
  readonly restingSamples: RLRCRigidBodySample[];
}): void {
  const {
    slot,
    slotIndex,
    carActorId,
    frameIndex,
    timeSeconds,
    rb,
    updatedRb,
    networkFrames,
    restingSamples,
  } = params;
  const pos = rb.position;
  const vel = rb.linearVelocity;
  const q = rb.rotation;
  const upZ = 1 - 2 * (q.x * q.x + q.y * q.y);
  if (
    frameIndex === slot.spFi + 1 &&
    networkFrames[frameIndex - 1]?.cars[slotIndex]?.entityActive &&
    Math.hypot(vel.x, vel.y, vel.z) < 50
  ) {
    (networkFrames[frameIndex - 1].cars as RLRCCarFrameState120Hz[])[slotIndex] = {
      ...networkFrames[frameIndex - 1].cars[slotIndex],
      rigidBody: updatedRb,
      rbUpdated: true,
    };
  }
  slot.carId = carActorId;
  slot.on = true;
  slot.upd = true;
  slot.spFi = -2;
  slot.rb = updatedRb;
  if (pos.z < 21.5 && Math.abs(vel.z) < 25 && upZ >= 0.7) {
    slot.flipped = false;
    slot.jT = timeSeconds;
    if (
      Math.abs(pos.x) < 2500 &&
      Math.abs(pos.y) < 3500 &&
      pos.z > 14.5 &&
      pos.z < 20.5 &&
      Math.abs(vel.z) < 5 &&
      upZ > 0.98
    ) {
      restingSamples.push(rb);
    }
  }
}

export function buildSourceFrameCars(
  slots: readonly RLRCMutableSlotTracker[],
  timeSeconds: number
): { cars: RLRCCarFrameState120Hz[]; carRbUpdatedMask: number } {
  let carRbUpdatedMask = 0;
  const cars = slots.map((s, slotIndex): RLRCCarFrameState120Hz => {
    const u = s.on && s.upd;
    const rb = s.on ? { ...s.rb, rbUpdated: u } : DEFAULT_CAR_RB;
    const q = rb.rotation;
    const v = rb.linearVelocity;
    if (u) carRbUpdatedMask |= 1 << slotIndex;
    const onGnd =
      s.on && rb.position.z < 21.5 && Math.abs(v.z) < 25 && 1 - 2 * (q.x * q.x + q.y * q.y) >= 0.7;
    const el = onGnd ? 0 : Math.max(0, timeSeconds - (s.jT > -1e8 ? s.jT : timeSeconds));
    return {
      slotIndex,
      entityActive: s.on,
      rigidBody: rb,
      rbUpdated: u,
      actorId: s.on ? s.carId : -1,
      boostAmount: s.on ? s.boost : 0,
      isOnGround: onGnd,
      isSupersonic: s.on && Math.hypot(v.x, v.y, v.z) >= RLRC_SUPERSONIC_SPEED_UU_S,
      hasFlipOrJump: s.on && (onGnd || (!s.flipped && el <= RLRC_FLIP_EXPIRATION_SECONDS)),
      airTimeSinceJump: onGnd ? 0 : Math.min(RLRC_FLIP_EXPIRATION_SECONDS, el),
      activeFlags: s.on
        ? { boostActive: s.bOn, jumpActive: s.jOn, doubleJumpActive: s.dOn, dodgeActive: s.dgOn }
        : DEFAULT_ACTIVE_FLAGS,
      controls: s.on
        ? {
            throttle: s.th,
            steer: s.st,
            pitch: 0,
            yaw: 0,
            roll: 0,
            jump: s.jOn || s.dOn || s.dgOn,
            boost: s.bOn,
            handbrake: s.hb,
          }
        : NEUTRAL_CONTROLS,
    };
  });
  return { cars, carRbUpdatedMask };
}
