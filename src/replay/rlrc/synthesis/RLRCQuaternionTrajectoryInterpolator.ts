/**
 * RLRCQuaternionTrajectoryInterpolator.ts
 * Angular-velocity-aware cubic Hermite quaternion interpolation on SO(3) and
 * shortest-arc SLERP primitives for 120Hz vehicle dodge/flip resampling.
 */

import type { RLRCInterpolationMethod, RLRCQuat, RLRCVec3 } from '../RLRCReplayTypes.ts';

export interface RLRCOrthonormalBasis {
  readonly fwd: RLRCVec3;
  readonly right: RLRCVec3;
  readonly up: RLRCVec3;
}

export const ID_QUAT: RLRCQuat = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function normalizeQuat(q: RLRCQuat): RLRCQuat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  return Number.isFinite(len) && len >= 1e-7
    ? { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
    : ID_QUAT;
}

function mulQuat(a: RLRCQuat, b: RLRCQuat): RLRCQuat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function expQuatDelta(halfThetaVec: RLRCVec3): RLRCQuat {
  const theta = Math.hypot(halfThetaVec.x, halfThetaVec.y, halfThetaVec.z);
  if (theta < 1e-6) {
    return normalizeQuat({
      x: halfThetaVec.x,
      y: halfThetaVec.y,
      z: halfThetaVec.z,
      w: 1,
    });
  }
  const s = Math.sin(theta) / theta;
  return {
    x: halfThetaVec.x * s,
    y: halfThetaVec.y * s,
    z: halfThetaVec.z * s,
    w: Math.cos(theta),
  };
}

function slerpAlignedQuat(a: RLRCQuat, b: RLRCQuat, t: number): RLRCQuat {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const rawDot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const dot = Math.max(-1, Math.min(1, rawDot));
  if (dot > 0.9995) {
    const s0 = 1 - t;
    return normalizeQuat({
      x: s0 * a.x + t * b.x,
      y: s0 * a.y + t * b.y,
      z: s0 * a.z + t * b.z,
      w: s0 * a.w + t * b.w,
    });
  }
  const theta = Math.acos(Math.abs(dot));
  const sinTheta = Math.sin(theta);
  if (Math.abs(sinTheta) < 1e-6) return a;
  const sgn = dot < 0 ? -1 : 1;
  const s0 = Math.sin((1 - t) * theta) / sinTheta;
  const s1 = (Math.sin(t * theta) / sinTheta) * sgn;
  return normalizeQuat({
    x: s0 * a.x + s1 * b.x,
    y: s0 * a.y + s1 * b.y,
    z: s0 * a.z + s1 * b.z,
    w: s0 * a.w + s1 * b.w,
  });
}

export function slerpShortestArcQuat(q0: RLRCQuat, q1: RLRCQuat, alpha: number): RLRCQuat {
  const t = clamp01(alpha);
  const a = normalizeQuat(q0);
  const b = normalizeQuat(q1);
  if (t <= 0) return a;
  if (t >= 1) return b;
  const raw = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const bAligned = raw < 0 ? { x: -b.x, y: -b.y, z: -b.z, w: -b.w } : b;
  return slerpAlignedQuat(a, bAligned, t);
}

/**
 * Cubic Bezier / Hermite quaternion interpolation using world-space angular velocities
 * `w0` and `w1` (rad/s) to construct interior control orientations:
 *   `c0 = exp(w0 * dt / 6) * q0`
 *   `c1 = exp(-w1 * dt / 6) * q1`
 * Also uses the forward-predicted quaternion `exp(0.5 * (w0 + w1) * dt) * q0` to disambiguate
 * hemisphere sign when high-rate dodges rotate near or past 90..180 degrees across a replication gap.
 */
export function interpolateQuatHermiteWithAngularVelocity(
  q0: RLRCQuat,
  q1: RLRCQuat,
  w0: RLRCVec3,
  w1: RLRCVec3,
  alpha: number,
  dtSeconds: number,
  method: RLRCInterpolationMethod = 'hermite-clamped'
): RLRCQuat {
  const t = clamp01(alpha);
  const a = normalizeQuat(q0);
  const bRaw = normalizeQuat(q1);
  if (t <= 0 || dtSeconds <= 1e-6) return a;
  if (t >= 1) return bRaw;

  const wMag0 = Math.hypot(w0.x, w0.y, w0.z);
  const wMag1 = Math.hypot(w1.x, w1.y, w1.z);
  if (method === 'linear' || (wMag0 < 0.15 && wMag1 < 0.15) || dtSeconds > 0.25) {
    return slerpShortestArcQuat(a, bRaw, t);
  }

  // Predict midpoint/endpoint hemisphere using average angular velocity
  const avgHalfAngle: RLRCVec3 = {
    x: 0.25 * (w0.x + w1.x) * dtSeconds,
    y: 0.25 * (w0.y + w1.y) * dtSeconds,
    z: 0.25 * (w0.z + w1.z) * dtSeconds,
  };
  const qPred = normalizeQuat(mulQuat(expQuatDelta(avgHalfAngle), a));
  const predDot = qPred.x * bRaw.x + qPred.y * bRaw.y + qPred.z * bRaw.z + qPred.w * bRaw.w;
  const directDot = a.x * bRaw.x + a.y * bRaw.y + a.z * bRaw.z + a.w * bRaw.w;
  const sgn = (Math.abs(directDot) < 0.35 ? predDot : directDot) < 0 ? -1 : 1;
  const b: RLRCQuat = sgn < 0 ? { x: -bRaw.x, y: -bRaw.y, z: -bRaw.z, w: -bRaw.w } : bRaw;

  const sixthDt = Math.min(dtSeconds, 0.18) / 6.0;
  const d0 = expQuatDelta({
    x: 0.5 * w0.x * sixthDt,
    y: 0.5 * w0.y * sixthDt,
    z: 0.5 * w0.z * sixthDt,
  });
  const d1 = expQuatDelta({
    x: -0.5 * w1.x * sixthDt,
    y: -0.5 * w1.y * sixthDt,
    z: -0.5 * w1.z * sixthDt,
  });
  const c0 = normalizeQuat(mulQuat(d0, a));
  const c1 = normalizeQuat(mulQuat(d1, b));

  // De Casteljau cubic evaluation on S^3
  const p01 = slerpShortestArcQuat(a, c0, t);
  const p12 = slerpShortestArcQuat(c0, c1, t);
  const p23 = slerpShortestArcQuat(c1, b, t);
  const p012 = slerpShortestArcQuat(p01, p12, t);
  const p123 = slerpShortestArcQuat(p12, p23, t);
  return slerpShortestArcQuat(p012, p123, t);
}

export function quatToBasisVectors(rotation: RLRCQuat): RLRCOrthonormalBasis {
  const { x, y, z, w } = normalizeQuat(rotation);
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
