/**
 * AerialReachabilityMath.ts
 * Zero-allocation aerial kinematics & boost-driven thrust reachability kernels:
 * - Aerial orientation turn latency grounded in RocketSim angular acceleration
 * - Ballistic trajectory center c(t) under gravity (-650 UU/s^2) and 2300 UU/s speed cap
 * - Directional boost thrust displacement s_thrust(t)
 */

import {
  GRAVITY_Z,
  BOOST_ACCEL,
  BOOST_BURN_RATE,
  MAX_CAR_SPEED,
  JUMP_MIN_VELOCITY,
} from './ReachabilityConstants.ts';

/**
 * Computes aerial orientation turn delay (in seconds) required to align car nose (fwd)
 * with a target unit direction (dx, dy, dz), accounting for current angular velocity.
 * Grounded in RocketSim aerial angular acceleration (~10.8 rad/s^2 average pitch/yaw).
 */
export function computeAerialTurnLatency(
  fwdX,
  fwdY,
  fwdZ,
  dx,
  dy,
  dz,
  angVelX = 0,
  angVelY = 0,
  angVelZ = 0
) {
  const cosAlpha = Math.max(-1.0, Math.min(1.0, fwdX * dx + fwdY * dy + fwdZ * dz));
  const alpha = Math.acos(cosAlpha); // [0, pi]
  if (alpha < 0.08) return 0.0;

  // Axis of desired rotation: cross(fwd, d)
  const rx = fwdY * dz - fwdZ * dy;
  const ry = fwdZ * dx - fwdX * dz;
  const rz = fwdX * dy - fwdY * dx;
  const rLen = Math.hypot(rx, ry, rz);
  let omegaToward = 0.0;
  if (rLen > 1e-4) {
    omegaToward = (angVelX * rx + angVelY * ry + angVelZ * rz) / rLen;
  }

  // Effective angular acceleration in RocketSim air (~10.8 rad/s^2)
  const alphaMax = 10.8;
  // Time to rotate angle alpha with initial angular velocity omegaToward:
  // 0.5 * alphaMax * t^2 + omegaToward * t = alpha
  const disc = Math.max(0.0, omegaToward * omegaToward + 2.0 * alphaMax * alpha);
  const tRaw = (-omegaToward + Math.sqrt(disc)) / alphaMax;
  return Math.max(0.0, Math.min(0.42, tRaw * 0.68));
}

/**
 * Computes the ballistic center c(t) in RocketSim coordinates at lookahead time t (seconds),
 * enforcing RocketSim's 2300 UU/s maximum speed cap and minimum single-jump impulse (328.125 UU/s)
 * when on the ground, while clamping Z to the stadium floor (>= 17.0 UU).
 */
export function computeBallisticCenter(
  px,
  py,
  pz,
  vx,
  vy,
  vz,
  upX,
  upY,
  upZ,
  t,
  includeJumpImpulse = true,
  isOnGround = false
) {
  const jumpVel = includeJumpImpulse && isOnGround ? JUMP_MIN_VELOCITY : 0.0;
  const ivx = vx + jumpVel * upX;
  const ivy = vy + jumpVel * upY;
  const ivz = vz + jumpVel * upZ;

  // End velocity at time t under gravity
  const evx = ivx;
  const evy = ivy;
  const evz = ivz + GRAVITY_Z * t;
  const endSpd = Math.hypot(evx, evy, evz);

  let cx = px + ivx * t;
  let cy = py + ivy * t;
  let cz = pz + ivz * t + 0.5 * GRAVITY_Z * t * t;

  if (endSpd > MAX_CAR_SPEED) {
    const scale = MAX_CAR_SPEED / endSpd;
    const avgScale = 0.5 * (1.0 + scale);
    cx = px + (cx - px) * avgScale;
    cy = py + (cy - py) * avgScale;
    cz = pz + (cz - pz) * avgScale;
  }

  // Prevent ballistic center from sinking below the stadium floor (z = 17.0 UU)
  if (cz < 17.0) {
    cz = 17.0;
  }

  return { x: cx, y: cy, z: cz, ivx, ivy, ivz };
}

/**
 * Computes directional thrust displacement s_thrust(t) in UU along unit vector (dx, dy, dz)
 * given available boost (0 - 100), lookahead time t, turn latency tTurn, and initial velocity along d.
 */
export function computeDirectionalBoostReach(t, boostAmount, tTurn, velAlongD = 0.0) {
  const availBurn = Math.max(0.0, Number(boostAmount) || 0.0) / BOOST_BURN_RATE;
  const tActive = Math.max(0.0, t - tTurn);
  const tau = Math.min(tActive, availBurn);
  const tCoast = Math.max(0.0, tActive - tau);

  let sThrust = 0.5 * BOOST_ACCEL * tau * tau + BOOST_ACCEL * tau * tCoast;

  // Respect RocketSim 2300 UU/s speed ceiling along target direction
  if (velAlongD > 0.0) {
    const maxExtraDisp = Math.max(0.0, (MAX_CAR_SPEED - velAlongD) * tActive);
    if (sThrust > maxExtraDisp) {
      sThrust = maxExtraDisp;
    }
  }

  return sThrust;
}
