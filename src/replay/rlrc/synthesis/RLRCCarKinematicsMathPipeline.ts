/**
 * RLRCCarKinematicsMathPipeline.ts
 * Pure mathematical basis, velocity/acceleration finite-difference kinematics,
 * and RocketSim drive/steer/aerial torque curves for RLRC 120Hz control synthesis.
 */

import {
  type RLRCCarComponentActiveFlags,
  type RLRCCarFrameState120Hz,
  type RLRCQuat,
  type RLRCSynthesizedCarControls,
  type RLRCVec3,
} from '../RLRCReplayTypes.ts';

export interface RLRCLocalCarBasis {
  readonly forward: RLRCVec3;
  readonly right: RLRCVec3;
  readonly up: RLRCVec3;
}

export interface FrameKinematicsSample {
  readonly basis: RLRCLocalCarBasis;
  readonly localForwardVel: number;
  readonly localRightVel: number;
  readonly localUpVel: number;
  readonly planarSpeed: number;
  readonly nonGravityForwardAccel: number;
  readonly nonGravityUpAccel: number;
  readonly planarAccelMag: number;
  readonly omegaRoll: number;
  readonly omegaPitch: number;
  readonly omegaYaw: number;
  readonly flipOmegaMag: number;
  readonly alphaRoll: number;
  readonly alphaPitch: number;
  readonly alphaYaw: number;
  readonly angAccelMag: number;
  readonly teleported: boolean;
}

export const GRAVITY_Z_UU = -650.0;
export const BOOST_ACCEL_GROUND_UU = 991.666;
export const BOOST_ACCEL_AIR_UU = 1058.333;
export const THROTTLE_AIR_ACCEL_UU = 66.667;
export const BRAKE_DECEL_GROUND_UU = 3500.0;
export const COAST_DECEL_GROUND_UU = 525.0;

export const AERIAL_TORQUE_ROLL = -36.07956616966136;
export const AERIAL_TORQUE_PITCH = -12.1459978190807;
export const AERIAL_TORQUE_YAW = 8.91962804287785;
export const AERIAL_DAMPING_ROLL = -4.47166302201591;
export const AERIAL_DAMPING_PITCH = -2.798194258050845;
export const AERIAL_DAMPING_YAW = -1.886491900437232;

export const NEUTRAL_SYNTHESIZED_CONTROLS: RLRCSynthesizedCarControls = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export const NEUTRAL_ACTIVE_FLAGS: RLRCCarComponentActiveFlags = Object.freeze({
  boostActive: false,
  jumpActive: false,
  doubleJumpActive: false,
  dodgeActive: false,
});

export const clampUnit = (v: number): number =>
  !Number.isFinite(v) ? 0 : v <= -1 ? -1 : v >= 1 ? 1 : v;

export const applyDeadzone = (v: number, dz: number): number => {
  const c = clampUnit(v);
  return Math.abs(c) < dz ? 0 : c;
};

export const dotVec3 = (a: RLRCVec3, b: RLRCVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const distVec3 = (a: RLRCVec3, b: RLRCVec3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function decodeReplicatedThrottleByte(byteValue: number | null | undefined): number {
  if (typeof byteValue !== 'number' || !Number.isFinite(byteValue)) return 0;
  const b = Math.max(0, Math.min(255, Math.round(byteValue)));
  return b === 128 ? 0 : clampUnit((b - 128) / 127);
}

export function decodeReplicatedSteerByte(byteValue: number | null | undefined): number {
  if (typeof byteValue !== 'number' || !Number.isFinite(byteValue)) return 0;
  const b = Math.max(0, Math.min(255, Math.round(byteValue)));
  return b === 128 ? 0 : clampUnit((b - 128) / 127);
}

export function decodeReplicatedActiveFlagByte(byteValue: number | null | undefined): boolean {
  if (typeof byteValue !== 'number' || !Number.isFinite(byteValue)) return false;
  return (Math.trunc(byteValue) & 1) === 1;
}

export function computeLocalCarBasisFromQuat(rotation: RLRCQuat): RLRCLocalCarBasis {
  const { x, y, z, w } = rotation;
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
    forward: { x: 1 - 2 * (yy + zz), y: 2 * (xy + wz), z: 2 * (xz - wy) },
    right: { x: 2 * (xy - wz), y: 1 - 2 * (xx + zz), z: 2 * (yz + wx) },
    up: { x: 2 * (xz + wy), y: 2 * (yz - wx), z: 1 - 2 * (xx + yy) },
  };
}

export function evaluateGroundThrottleMaxAccel(forwardSpeedAbs: number): number {
  const s = Math.max(0, forwardSpeedAbs);
  if (s >= 1410) return 0;
  if (s >= 1400) return 160 * (1 - (s - 1400) / 10);
  return 1600 - (1440 * s) / 1400;
}

export function evaluateGroundSteerCurvature(speedAbs: number): number {
  const s = Math.max(0, speedAbs);
  if (s < 500) return 0.0069 - (s / 500) * (0.0069 - 0.00398);
  if (s < 1000) return 0.00398 - ((s - 500) / 500) * (0.00398 - 0.00235);
  if (s < 1500) return 0.00235 - ((s - 1000) / 500) * (0.00235 - 0.001375);
  if (s < 1750) return 0.001375 - ((s - 1500) / 250) * (0.001375 - 0.0011);
  if (s < 3000) return 0.0011 - ((s - 1750) / 1250) * (0.0011 - 0.00088);
  return 0.00088;
}

export function solveAerialAxisWithDamping(
  angAccel: number,
  angVel: number,
  torqueScale: number,
  dampingScale: number
): number {
  const netTorque = angAccel - dampingScale * angVel;
  const rawControl = netTorque / torqueScale;
  const denom = torqueScale - (rawControl >= 0 ? 1 : -1) * dampingScale * angVel;
  return Math.abs(denom) < Math.abs(torqueScale) * 0.35
    ? clampUnit(rawControl)
    : clampUnit(netTorque / denom);
}

export function computeFrameKinematics(
  prevCar: RLRCCarFrameState120Hz | null | undefined,
  currCar: RLRCCarFrameState120Hz,
  nextCar: RLRCCarFrameState120Hz | null | undefined,
  dt: number
): FrameKinematicsSample {
  const pOk =
    Boolean(prevCar?.entityActive) &&
    distVec3(prevCar!.rigidBody.position, currCar.rigidBody.position) <= 360;
  const nOk =
    Boolean(nextCar?.entityActive) &&
    distVec3(nextCar!.rigidBody.position, currCar.rigidBody.position) <= 360;
  const teleported = Boolean(prevCar?.entityActive) && !pOk;
  const r0 = (pOk ? prevCar! : currCar).rigidBody;
  const r1 = (nOk ? nextCar! : currCar).rigidBody;
  const ticks = (pOk ? 1 : 0) + (nOk ? 1 : 0);
  const invDt = ticks > 0 ? 1 / (ticks * dt) : 0;

  const basis = computeLocalCarBasisFromQuat(currCar.rigidBody.rotation);
  const v = currCar.rigidBody.linearVelocity;
  const w = currCar.rigidBody.angularVelocity;
  const aLin: RLRCVec3 = {
    x: (r1.linearVelocity.x - r0.linearVelocity.x) * invDt,
    y: (r1.linearVelocity.y - r0.linearVelocity.y) * invDt,
    z: (r1.linearVelocity.z - r0.linearVelocity.z) * invDt,
  };
  const aAng: RLRCVec3 = {
    x: (r1.angularVelocity.x - r0.angularVelocity.x) * invDt,
    y: (r1.angularVelocity.y - r0.angularVelocity.y) * invDt,
    z: (r1.angularVelocity.z - r0.angularVelocity.z) * invDt,
  };

  const localForwardVel = dotVec3(v, basis.forward);
  const localRightVel = dotVec3(v, basis.right);
  const localUpVel = dotVec3(v, basis.up);
  const planarSpeed = Math.hypot(localForwardVel, localRightVel);
  const nonGravityForwardAccel = dotVec3(aLin, basis.forward) - GRAVITY_Z_UU * basis.forward.z;
  const nonGravityUpAccel = dotVec3(aLin, basis.up) - GRAVITY_Z_UU * basis.up.z;
  const planarAccelMag = Math.hypot(aLin.x, aLin.y);

  const omegaRoll = dotVec3(w, basis.forward);
  const omegaPitch = dotVec3(w, basis.right);
  const omegaYaw = dotVec3(w, basis.up);
  const flipOmegaMag = Math.hypot(omegaPitch, omegaRoll, omegaYaw * 0.65);

  const alphaRoll = dotVec3(aAng, basis.forward);
  const alphaPitch = dotVec3(aAng, basis.right);
  const alphaYaw = dotVec3(aAng, basis.up);
  const angAccelMag = Math.hypot(alphaPitch, alphaRoll, alphaYaw);

  return {
    basis,
    localForwardVel,
    localRightVel,
    localUpVel,
    planarSpeed,
    nonGravityForwardAccel,
    nonGravityUpAccel,
    planarAccelMag,
    omegaRoll,
    omegaPitch,
    omegaYaw,
    flipOmegaMag,
    alphaRoll,
    alphaPitch,
    alphaYaw,
    angAccelMag,
    teleported,
  };
}
