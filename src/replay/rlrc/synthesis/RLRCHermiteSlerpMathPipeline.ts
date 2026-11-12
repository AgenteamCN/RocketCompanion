/**
 * RLRCHermiteSlerpMathPipeline.ts
 * NetStream velocity calibration and Clamped Cubic Hermite rigid-body interpolation
 * for 120Hz RLRC replays.
 */

import {
  RLRC_FIXED_DT,
  type RLRCInterpolationMethod,
  type RLRCRigidBodySample,
  type RLRCSynthesizedCarControls,
  type RLRCVec3,
} from '../RLRCReplayTypes.ts';
import {
  ID_QUAT,
  interpolateQuatHermiteWithAngularVelocity,
  type RLRCOrthonormalBasis,
} from './RLRCQuaternionTrajectoryInterpolator.ts';

export type { RLRCOrthonormalBasis };

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const v3 = (x: number, y: number, z: number): RLRCVec3 => ({ x, y, z });
export const vAxis = (fn: (k: 'x' | 'y' | 'z') => number): RLRCVec3 =>
  v3(fn('x'), fn('y'), fn('z'));
export const vLen = (a: RLRCVec3): number => Math.hypot(a.x, a.y, a.z);
export const vAdd = (a: RLRCVec3, b: RLRCVec3): RLRCVec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const vSub = (a: RLRCVec3, b: RLRCVec3): RLRCVec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const vScale = (a: RLRCVec3, s: number): RLRCVec3 => v3(a.x * s, a.y * s, a.z * s);
export const vDist = (a: RLRCVec3, b: RLRCVec3): number => vLen(vSub(a, b));
export const vLerp = (a: RLRCVec3, b: RLRCVec3, t: number): RLRCVec3 =>
  vAxis((k) => lerp(a[k], b[k], t));

export const ZERO_VEC: RLRCVec3 = Object.freeze(v3(0, 0, 0));
export const SLEEP_RB: RLRCRigidBodySample = Object.freeze({
  sleeping: true,
  position: ZERO_VEC,
  rotation: ID_QUAT,
  linearVelocity: ZERO_VEC,
  angularVelocity: ZERO_VEC,
});
export const ZERO_CTRL: RLRCSynthesizedCarControls = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});
export const ZERO_FLAGS = Object.freeze({
  boostActive: false,
  jumpActive: false,
  doubleJumpActive: false,
  dodgeActive: false,
});

export function isRest(rb: RLRCRigidBodySample): boolean {
  return rb.sleeping || (vLen(rb.linearVelocity) <= 15 && vLen(rb.angularVelocity) <= 0.2);
}

export function toRest(rb: RLRCRigidBodySample): RLRCRigidBodySample {
  return rb.sleeping
    ? rb
    : { ...rb, sleeping: true, linearVelocity: ZERO_VEC, angularVelocity: ZERO_VEC };
}

export function isDupRb(a: RLRCRigidBodySample, b: RLRCRigidBodySample): boolean {
  const qd =
    a.rotation.x * b.rotation.x +
    a.rotation.y * b.rotation.y +
    a.rotation.z * b.rotation.z +
    a.rotation.w * b.rotation.w;
  return (
    a.sleeping === b.sleeping &&
    vDist(a.position, b.position) <= 1e-2 &&
    vDist(a.linearVelocity, b.linearVelocity) <= 1e-2 &&
    Math.abs(qd) > 0.99999
  );
}

export function calibrateNetStreamVel(v: RLRCVec3, _secantSpeed?: number): RLRCVec3 {
  return v;
}

/**
 * Normalizes UE3 NetStream angular velocity into rad/s.
 * Note: UE3 NetStream version >= 7 stores `angular_velocity` scaled by 10x (0.1 rad/s per unit)
 * when uncalibrated, OR already in rad/s (~0..6.0 rad/s). Only values above the physical
 * Rocket League maximum (~7.5 rad/s for ball/car) are 10x-encoded or corrupted spikes.
 */
export function sanitizeAngularVel(av: RLRCVec3): RLRCVec3 {
  const mag = vLen(av);
  if (!Number.isFinite(mag) || mag < 1e-6) return ZERO_VEC;
  if (mag > 85.0 && mag <= 850.0) {
    return vScale(av, 0.01);
  }
  if (mag > 12.0 && mag <= 85.0) {
    return vScale(av, 0.1);
  }
  if (mag > 8.5) {
    return vScale(av, 8.5 / mag);
  }
  return av;
}

function clampTan(vel: RLRCVec3, sec: RLRCVec3, maxSpd: number): RLRCVec3 {
  const scaled = calibrateNetStreamVel(vel, vLen(sec));
  const maxD = 0.35 * vLen(sec) + 90;
  const d = vSub(scaled, sec);
  const dev = vLen(d);
  const t = vAdd(sec, dev > maxD && dev > 1e-5 ? vScale(d, maxD / dev) : d);
  const spd = vLen(t);
  return spd > maxSpd && spd > 1e-5 ? vScale(t, maxSpd / spd) : t;
}

export function resolveEffectivePhysicsDt(
  p0: RLRCVec3,
  p1: RLRCVec3,
  v0Raw: RLRCVec3,
  v1Raw: RLRCVec3,
  dtWallSeconds: number,
  r0: boolean,
  r1: boolean
): number {
  const dtWall = Math.max(RLRC_FIXED_DT, dtWallSeconds);
  if (r0 && r1) return dtWall;
  const dist = vDist(p0, p1);
  if (dist <= 2.0) return dtWall;
  const rawSecSpeed = dist / dtWall;
  const v0 = r0 ? ZERO_VEC : calibrateNetStreamVel(v0Raw, rawSecSpeed);
  const v1 = r1 ? ZERO_VEC : calibrateNetStreamVel(v1Raw, rawSecSpeed);
  const s0Len = vLen(v0);
  const s1Len = vLen(v1);
  const vAvg = vScale(vAdd(v0, v1), 0.5);
  const avgVecSpeed = vLen(vAvg);
  const avgScalarSpeed = 0.5 * (s0Len + s1Len);
  const dp = vSub(p1, p0);
  const projDist =
    avgVecSpeed > 50 ? (dp.x * vAvg.x + dp.y * vAvg.y + dp.z * vAvg.z) / avgVecSpeed : dist;
  const useDirectional = avgVecSpeed > 0.8 * avgScalarSpeed && projDist > 0.75 * dist;
  const refSpeed = useDirectional ? avgVecSpeed : avgScalarSpeed;
  const effDist = useDirectional ? projDist : dist;
  if (refSpeed <= 100) return dtWall;

  const impliedDt = effDist / refSpeed;
  const quantizedTicks = Math.max(1, Math.round(impliedDt / RLRC_FIXED_DT));
  const dtPhys = quantizedTicks * RLRC_FIXED_DT;
  const maxTickJitter = Math.max(4.5 * RLRC_FIXED_DT, 0.85 * dtWall);
  return Math.abs(dtPhys - dtWall) <= maxTickJitter ? dtPhys : dtWall;
}

export function interpolateRigidBodyHermiteSlerp(
  s0: RLRCRigidBodySample,
  s1: RLRCRigidBodySample,
  alpha: number,
  dtSeconds: number,
  method: RLRCInterpolationMethod = 'hermite-clamped',
  maxSpeedUu = 4500
): RLRCRigidBodySample {
  const tau = clamp(alpha, 0, 1);
  const r0 = isRest(s0);
  const r1 = isRest(s1);
  if (dtSeconds <= 1e-6 || (s0.sleeping && s1.sleeping) || isDupRb(s0, s1)) {
    const sRef = tau >= 1 ? s1 : s0;
    const rRef = tau >= 1 ? r1 : r0;
    const rawVel = rRef ? ZERO_VEC : sRef.linearVelocity;
    const spd = vLen(rawVel);
    return {
      sleeping: s0.sleeping && s1.sleeping,
      position: sRef.position,
      rotation: sRef.rotation,
      linearVelocity: spd > maxSpeedUu && spd > 1e-5 ? vScale(rawVel, maxSpeedUu / spd) : rawVel,
      angularVelocity: rRef ? ZERO_VEC : sanitizeAngularVel(sRef.angularVelocity),
    };
  }

  const p0 = s0.position;
  const p1 = s1.position;
  const dt = Math.max(RLRC_FIXED_DT * 0.5, dtSeconds);
  const sec = vScale(vSub(p1, p0), 1 / dt);
  const secSpeed = vLen(sec);
  const v0 = r0 ? ZERO_VEC : calibrateNetStreamVel(s0.linearVelocity, secSpeed);
  const v1 = r1 ? ZERO_VEC : calibrateNetStreamVel(s1.linearVelocity, secSpeed);
  const w0 = r0 ? ZERO_VEC : sanitizeAngularVel(s0.angularVelocity);
  const w1 = r1 ? ZERO_VEC : sanitizeAngularVel(s1.angularVelocity);
  const t0 = clampTan(v0, sec, maxSpeedUu);
  const t1 = clampTan(v1, sec, maxSpeedUu);
  if (tau <= 0) {
    return {
      sleeping: s0.sleeping,
      position: p0,
      rotation: s0.rotation,
      linearVelocity: method === 'linear' ? (vLen(v0) > 1e-3 ? v0 : sec) : t0,
      angularVelocity: w0,
    };
  }
  if (tau >= 1) {
    return {
      sleeping: s1.sleeping,
      position: p1,
      rotation: s1.rotation,
      linearVelocity: method === 'linear' ? (vLen(v1) > 1e-3 ? v1 : sec) : t1,
      angularVelocity: w1,
    };
  }
  const rotation = interpolateQuatHermiteWithAngularVelocity(
    s0.rotation,
    s1.rotation,
    w0,
    w1,
    tau,
    dt,
    method
  );
  const angularVelocity = vLerp(w0, w1, tau);
  const vLin = vLerp(v0, v1, tau);
  if (method === 'linear') {
    return {
      sleeping: false,
      position: vLerp(p0, p1, tau),
      rotation,
      linearVelocity: vLen(vLin) > 1e-3 ? vLin : sec,
      angularVelocity,
    };
  }
  const u2 = tau * tau;
  const u3 = u2 * tau;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = (u3 - 2 * u2 + tau) * dt;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = (u3 - u2) * dt;
  const dh00 = (6 * u2 - 6 * tau) / dt;
  const dh10 = 3 * u2 - 4 * tau + 1;
  const dh11 = 3 * u2 - 2 * tau;
  const minZ = Math.min(p0.z, p1.z) < 25 ? Math.min(p0.z, p1.z) - 1.5 : -Infinity;
  const hasReplicatedVel = !r0 || !r1;

  return {
    sleeping: false,
    position: vAxis((k) =>
      Math.max(k === 'z' ? minZ : -Infinity, h00 * p0[k] + h10 * t0[k] + h01 * p1[k] + h11 * t1[k])
    ),
    rotation,
    linearVelocity: hasReplicatedVel
      ? vLerp(t0, t1, tau)
      : vAxis((k) => dh00 * (p0[k] - p1[k]) + dh10 * t0[k] + dh11 * t1[k]),
    angularVelocity,
  };
}
