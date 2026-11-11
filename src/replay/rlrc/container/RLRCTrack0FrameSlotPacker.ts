/**
 * RLRCTrack0FrameSlotPacker.ts
 * Fixed-stride (1856B/frame) single-frame Track 0 binary slot packer and unpacker.
 */

import {
  BALL_STATE_OFFSETS as B_OFF,
  BOOST_PAD_OFFSETS as P_OFF,
  BOOST_PAD_STATE_STRIDE as P_STRIDE,
  BOOST_PAD_STATES_OFFSET as P_BASE,
  CAR_STATE_OFFSETS as C_OFF,
  CAR_STATE_STRIDE as C_STRIDE,
  EXTENDED_STATE_OFFSETS as EXT,
  SIM_OFFSETS as SIM,
} from '../../../physics/RocketSimConstants.ts';
import {
  packCarControlsToTrack64,
  unpackTrack64ToCarControls,
} from '../../container/RCReplayBinarySchema.ts';
import {
  RLRC_BOOST_PAD_COUNT as N_PADS,
  RLRC_FIXED_DT as DT,
  RLRC_MAX_PLAYER_SLOTS as MAX_SLOTS,
  RLRC_STATE_BYTES_PER_FRAME as STATE_BYTES,
  RLRC_STATE_FLOATS_PER_FRAME as STATE_FLOATS,
  RLRC_TRACK0_FRAME_STRIDE_BYTES as STRIDE,
  type RLRCCarFrameState120Hz,
  type RLRCFrame120Hz,
  type RLRCQuat,
  type RLRCRigidBodySample,
} from '../RLRCReplayTypes.ts';

export const RLRC_TRACK0_META_OFFSETS = Object.freeze({
  SOURCE_FRAME_30HZ: 440,
  SECONDS_REMAINING: 441,
  MATCH_FLAGS: 442,
  TIME_SECONDS: 443,
  BLUE_SCORE: 444,
  ORANGE_SCORE: 445,
  SLOT_ACTION_MASK: 446,
  MAGIC_TAG: 447,
  MAGIC_VALUE: 1205,
});

const SLEEP_RB: RLRCRigidBodySample = Object.freeze({
  sleeping: true,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
});
const ZERO_CTRL = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export function resolveRLRCTrack0FrameByteOffset(frameIndex120Hz: number): number {
  return Math.max(0, Math.trunc(frameIndex120Hz)) * STRIDE;
}

function writeRb(d: Float32Array, p: number, r: number, rb: RLRCRigidBodySample): void {
  const { x, y, z, w } = rb.rotation;
  const [xx, yy, zz, xy, xz, yz, wx, wy, wz] = [
    x * x * 2,
    y * y * 2,
    z * z * 2,
    x * y * 2,
    x * z * 2,
    y * z * 2,
    w * x * 2,
    w * y * 2,
    w * z * 2,
  ];
  const { position: q, linearVelocity: lv, angularVelocity: av } = rb;
  d.set([q.x, q.y, q.z], p);
  d.set(
    [1 - yy - zz, xy + wz, xz - wy, xy - wz, 1 - xx - zz, yz + wx, xz + wy, yz - wx, 1 - xx - yy],
    r
  );
  d.set([lv.x, lv.y, lv.z, av.x, av.y, av.z], p + 12);
}

function readQuat(s: Float32Array, o: number): RLRCQuat {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = s.subarray(o, o + 9);
  if (m00 * m00 + m10 * m10 + m20 * m20 <= 1e-8) return SLEEP_RB.rotation;
  const [x, y, z, w] =
    m00 + m11 + m22 > 0
      ? [m21 - m12, m02 - m20, m10 - m01, 1 + m00 + m11 + m22]
      : m00 > m11 && m00 > m22
        ? [1 + m00 - m11 - m22, m01 + m10, m02 + m20, m21 - m12]
        : m11 > m22
          ? [m01 + m10, 1 + m11 - m00 - m22, m12 + m21, m02 - m20]
          : [m02 + m20, m12 + m21, 1 + m22 - m00 - m11, m10 - m01];
  const l = Math.hypot(x, y, z, w);
  return l <= 1e-8 ? SLEEP_RB.rotation : { x: x / l, y: y / l, z: z / l, w: w / l };
}

function readRb(s: Float32Array, p: number, r: number, sleeping: boolean): RLRCRigidBodySample {
  return {
    sleeping,
    position: { x: s[p], y: s[p + 1], z: s[p + 2] },
    rotation: readQuat(s, r),
    linearVelocity: { x: s[p + 12], y: s[p + 13], z: s[p + 14] },
    angularVelocity: { x: s[p + 15], y: s[p + 16], z: s[p + 17] },
  };
}

export function packRLRCFrameToTrack0Slot(
  f: RLRCFrame120Hz,
  buf: Uint8Array,
  off = resolveRLRCTrack0FrameByteOffset(f.frameIndex120Hz)
): void {
  const dst = new Float32Array(buf.buffer, buf.byteOffset + off, STATE_FLOATS);
  dst.fill(0);
  let active = 0;
  for (let i = 0; i < Math.min(MAX_SLOTS, f.cars.length); i++)
    if (f.cars[i]?.entityActive) active++;
  dst.set([f.frameIndex120Hz, 0, active, N_PADS], SIM.TICK);
  writeRb(dst, SIM.BALL + B_OFF.POS, SIM.BALL + B_OFF.ROT_MAT, f.ball.rigidBody);

  const ctrlSlice = buf.subarray(off + STATE_BYTES, off + STRIDE);
  ctrlSlice.fill(0);
  let mask = 0;

  for (let s = 0; s < MAX_SLOTS; s++) {
    const car = f.cars[s];
    const slot = car && car.slotIndex >= 0 && car.slotIndex < MAX_SLOTS ? car.slotIndex : s;
    const c = SIM.CARS + slot * C_STRIDE;
    if (!car || !car.entityActive) {
      const pos = car?.rigidBody.position;
      const isParked =
        car?.isDemolished === false ||
        !pos ||
        (pos.x <= -5000 && pos.z <= -200) ||
        (pos.x === 0 && pos.y === 0 && pos.z === 0);
      if (isParked) {
        dst.set([-5500, slot * 300, -2000], c + C_OFF.POS);
        dst[c + C_OFF.DEMOED] = 0;
      } else {
        writeRb(dst, c + C_OFF.POS, c + C_OFF.FWD, car.rigidBody);
        dst.fill(0, c + C_OFF.VEL, c + C_OFF.VEL + 6);
        dst[c + C_OFF.DEMOED] = 1;
      }
      dst[c + C_OFF.GROUND_NORMAL + 2] = 1;
      continue;
    }

    writeRb(dst, c + C_OFF.POS, c + C_OFF.FWD, car.rigidBody);
    const fl = car.activeFlags;
    const air = car.isOnGround ? 0 : Math.max(0, car.airTimeSinceJump);
    mask |=
      (1 << slot) |
      (fl.doubleJumpActive ? 1 << (slot + 6) : 0) |
      (fl.dodgeActive ? 1 << (slot + 12) : 0);
    const isBoost = fl.boostActive || car.controls.boost ? 1 : 0;
    const isFlip = fl.dodgeActive || fl.doubleJumpActive ? 1 : 0;
    dst.set(
      [car.boostAmount, +car.isOnGround, +car.isSupersonic, 0, +car.hasFlipOrJump, isBoost, isFlip],
      c + C_OFF.BOOST
    );
    dst[c + C_OFF.GROUND_NORMAL + 2] = 1;
    dst.set(
      [+fl.jumpActive, air, fl.jumpActive ? Math.min(0.2, air) : 0, car.airTimeSinceJump],
      EXT.CAR_JUMP_AIR_BASE + slot * EXT.CAR_JUMP_AIR_STRIDE
    );
    packCarControlsToTrack64(ctrlSlice, slot, { ...car.controls });
  }

  for (let p = 0; p < N_PADS; p++) {
    const cd = Math.max(0, f.boostPadCooldowns[p] ?? 0);
    dst.set([cd <= 1e-4 ? 1 : 0, cd], P_BASE + p * P_STRIDE);
  }

  const M = RLRC_TRACK0_META_OFFSETS;
  const mFlags = (f.isOvertime ? 1 : 0) | ((f.roundCountdownNumber & 0xff) << 1);
  dst[EXT.IS_BALL_SLEEPING] = (f.ball.entityActive ? 0 : 2) | (f.ball.rigidBody.sleeping ? 1 : 0);
  dst.set(
    [
      f.sourceFrame30Hz,
      f.secondsRemaining,
      mFlags,
      f.timeSeconds,
      f.blueScore,
      f.orangeScore,
      mask,
      M.MAGIC_VALUE,
    ],
    M.SOURCE_FRAME_30HZ
  );
}

export function unpackRLRCFrameFromTrack0Slot(
  buf: Uint8Array,
  frameIndex120Hz: number
): RLRCFrame120Hz {
  const off = resolveRLRCTrack0FrameByteOffset(frameIndex120Hz);
  const s = new Float32Array(buf.buffer, buf.byteOffset + off, STATE_FLOATS);
  const ctrls = unpackTrack64ToCarControls(buf.subarray(off + STATE_BYTES, off + STRIDE));
  const M = RLRC_TRACK0_META_OFFSETS;
  const meta = Math.round(s[M.MAGIC_TAG]) === M.MAGIC_VALUE;
  const mask = meta ? Math.round(s[M.SLOT_ACTION_MASK]) : 0;
  const bFl = Math.round(s[EXT.IS_BALL_SLEEPING]);

  const cars: RLRCCarFrameState120Hz[] = new Array(MAX_SLOTS);
  for (let i = 0; i < MAX_SLOTS; i++) {
    const c = SIM.CARS + i * C_STRIDE;
    const j = EXT.CAR_JUMP_AIR_BASE + i * EXT.CAR_JUMP_AIR_STRIDE;
    const isParked = s[c + C_OFF.POS] <= -5000 && s[c + C_OFF.POS + 2] <= -200;
    const isDemolished = !isParked && s[c + C_OFF.DEMOED] >= 0.5;
    const entityActive = meta ? (mask & (1 << i)) !== 0 : !isParked && !isDemolished;
    cars[i] = {
      slotIndex: i,
      entityActive,
      isDemolished: !entityActive && isDemolished,
      rigidBody: isParked ? SLEEP_RB : readRb(s, c + C_OFF.POS, c + C_OFF.FWD, !entityActive),
      boostAmount: s[c + C_OFF.BOOST],
      isOnGround: s[c + C_OFF.ON_GROUND] >= 0.5,
      isSupersonic: s[c + C_OFF.SUPERSONIC] >= 0.5,
      hasFlipOrJump: s[c + C_OFF.HAS_FLIP_OR_JUMP] >= 0.5,
      airTimeSinceJump: s[j + EXT.CAR_AIR_TIME_SINCE_JUMP_OFFSET],
      activeFlags: {
        boostActive: s[c + C_OFF.IS_BOOSTING] >= 0.5,
        jumpActive: s[j + EXT.CAR_IS_JUMPING_OFFSET] >= 0.5,
        doubleJumpActive: meta
          ? (mask & (1 << (i + 6))) !== 0
          : s[j + EXT.CAR_AIR_TIME_OFFSET] >= 0.5,
        dodgeActive: meta ? (mask & (1 << (i + 12))) !== 0 : s[j + EXT.CAR_JUMP_TIME_OFFSET] >= 0.5,
      },
      controls: { ...(ctrls[i] ?? ZERO_CTRL) },
    };
  }

  const boostPadCooldowns = new Float32Array(N_PADS);
  for (let p = 0; p < N_PADS; p++) boostPadCooldowns[p] = s[P_BASE + p * P_STRIDE + P_OFF.COOLDOWN];

  const mFl = Math.round(s[meta ? M.MATCH_FLAGS : EXT.POSSESSION_STATE]);
  const tSec = s[meta ? M.TIME_SECONDS : EXT.POSSESSION_DURATION];
  return {
    frameIndex120Hz,
    sourceFrame30Hz: Math.round(s[meta ? M.SOURCE_FRAME_30HZ : SIM.GOAL]),
    timeSeconds: tSec > 0 ? tSec : frameIndex120Hz * DT,
    secondsRemaining: Math.round(s[meta ? M.SECONDS_REMAINING : EXT.IS_SIMULATION_FROZEN]),
    isOvertime: (mFl & 1) !== 0,
    roundCountdownNumber: (mFl >>> 1) & 0xff,
    blueScore: Math.round(s[meta ? M.BLUE_SCORE : EXT.POSSESSION_BLUE_POINTS]),
    orangeScore: Math.round(s[meta ? M.ORANGE_SCORE : EXT.POSSESSION_ORANGE_POINTS]),
    ball: {
      entityActive: (bFl & 2) === 0,
      rigidBody: readRb(s, SIM.BALL + B_OFF.POS, SIM.BALL + B_OFF.ROT_MAT, (bFl & 1) !== 0),
    },
    cars,
    boostPadCooldowns,
  };
}
