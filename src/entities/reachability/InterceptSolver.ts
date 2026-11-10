/**
 * InterceptSolver.ts
 * Synchronized spacetime optimal intercept solver (earliest reachable ball intercept)
 * with sub-tick interpolation and 3D orthogonal cross axis generation.
 */

import { BOOST_ACCEL, BOOST_BURN_RATE, BALL_CAR_CONTACT_RADIUS } from './ReachabilityConstants.ts';
import {
  computeAerialTurnLatency,
  computeBallisticCenter,
  computeDirectionalBoostReach,
} from './AerialReachabilityMath.ts';

/**
 * Solves for the earliest synchronized spacetime intercept point between the ball's predicted
 * trajectory and the vehicle's 3D reachability envelope.
 *
 * @param {Float32Array} rawBallPredPoints - Flat array [x, y, z, ...] in RocketSim coords (120Hz ticks)
 * @param {number} predCount - Number of valid predicted ticks
 * @param {number} elapsedTicks - Ticks elapsed since ball prediction was anchored
 * @param {Object} carState - Current vehicle state in RocketSim coordinates
 * @param {Object} config - ReachabilityConfig
 * @returns {Object} Intercept result with 3D coordinates, time, min boost, and orthogonal cross axes
 */
export function solveOptimalIntercept(
  rawBallPredPoints,
  predCount,
  elapsedTicks,
  carState,
  config
) {
  const result = {
    status: 'none',
    timeSec: 0,
    distance: 0,
    margin: -99999,
    centrality: 0,
    paceStatus: 'none',
    minBoost: 0,
    rx: 0,
    ry: 0,
    rz: 0, // RocketSim coords
    tx: 0,
    ty: 0,
    tz: 0, // Three.js coords (x, z, y)
    // 3 orthonormal vectors in Three.js space for the 3D Orthogonal Cross
    axis1: [1, 0, 0],
    axis2: [0, 1, 0],
    axis3: [0, 0, 1],
  };

  if (!rawBallPredPoints || predCount <= 1) {
    return result;
  }

  const startIdx = Math.max(1, Math.floor(elapsedTicks));
  const maxLookaheadTicks = Math.min(predCount - 1, startIdx + 360); // Up to 3.0s ahead
  if (startIdx >= maxLookaheadTicks) {
    return result;
  }

  const {
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    fwdX,
    fwdY,
    fwdZ,
    upX,
    upY,
    upZ,
    angVelX,
    angVelY,
    angVelZ,
    boost,
    isOnGround,
  } = carState;

  const includeJump = config.includeJumpImpulse !== false;

  let prevMargin = -1e9;
  let prevT = 0;
  let prevBx = 0,
    prevBy = 0,
    prevBz = 0;

  let bestFallbackMargin = -1e9;
  let bestFallbackTick = -1;
  let bestFallbackDist = 1e9;
  let bestFallbackREnv = 1.0;

  let firstHitTick = -1;
  let hitTick = -1;
  let hitAlpha = 1.0;
  let bestHitDist = 1e9;
  let bestHitREnv = 1.0;
  let bestHitMargin = -1e9;

  // Convergence window (30 ticks = 0.25s) to locate the highest-tolerance core inside the horn pass
  const MAX_CONVERGENCE_TICKS = 30;

  for (let k = startIdx; k <= maxLookaheadTicks; k++) {
    const dtTicks = k - startIdx + 1;
    const t = dtTicks / 120.0;

    const bOffset = k * 3;
    const bx = rawBallPredPoints[bOffset + 0];
    const by = rawBallPredPoints[bOffset + 1];
    const bz = rawBallPredPoints[bOffset + 2];

    const c = computeBallisticCenter(
      posX,
      posY,
      posZ,
      velX,
      velY,
      velZ,
      upX,
      upY,
      upZ,
      t,
      includeJump,
      isOnGround
    );

    const dx = bx - c.x;
    const dy = by - c.y;
    const dz = bz - c.z;
    const dist = Math.hypot(dx, dy, dz);

    let ux = 0,
      uy = 0,
      uz = 1;
    if (dist > 1e-4) {
      ux = dx / dist;
      uy = dy / dist;
      uz = dz / dist;
    }

    const tTurn = computeAerialTurnLatency(fwdX, fwdY, fwdZ, ux, uy, uz, angVelX, angVelY, angVelZ);
    const velAlongD = c.ivx * ux + c.ivy * uy + c.ivz * uz;
    const sThrust = computeDirectionalBoostReach(t, boost, tTurn, velAlongD);

    // Base air throttle + hitbox reach envelope
    const rEnvelope = sThrust + BALL_CAR_CONTACT_RADIUS + 28.0 * t;
    const margin = rEnvelope - dist;

    if (margin > bestFallbackMargin) {
      bestFallbackMargin = margin;
      bestFallbackTick = k;
      bestFallbackDist = dist;
      bestFallbackREnv = rEnvelope;
    }

    if (margin >= 0.0) {
      if (firstHitTick < 0) {
        firstHitTick = k;
        hitTick = k;
        bestHitDist = dist;
        bestHitREnv = rEnvelope;
        bestHitMargin = margin;
        if (k > startIdx && prevMargin < 0.0) {
          const denom = margin - prevMargin;
          hitAlpha = denom > 1e-5 ? Math.max(0.0, Math.min(1.0, -prevMargin / denom)) : 1.0;
        } else {
          hitAlpha = 1.0;
        }
        result.status = 'reachable';
      } else if (k - firstHitTick <= MAX_CONVERGENCE_TICKS && dist < bestHitDist - 0.5) {
        // Ball trajectory and car ballistic center c(t) are actively converging deeper into the horn core
        hitTick = k;
        hitAlpha = 1.0;
        bestHitDist = dist;
        bestHitREnv = rEnvelope;
        bestHitMargin = margin;
      } else {
        // Closest approach to the horn spine c(t) reached
        break;
      }
    } else if (firstHitTick >= 0) {
      // Ball trajectory exited the reachability horn
      break;
    }

    prevMargin = margin;
    prevT = t;
    prevBx = bx;
    prevBy = by;
    prevBz = bz;
  }

  let targetTick = hitTick;
  if (result.status !== 'reachable') {
    result.paceStatus = 'unreachable';
    if (!config.showClosestWhenUnreachable || bestFallbackTick < 0) {
      (solveOptimalIntercept as any)._lastStatus = 'none';
      return result;
    }
    if ((solveOptimalIntercept as any)._lastStatus !== 'closest-fallback') {
      (solveOptimalIntercept as any)._lastStatus = 'closest-fallback';
      console.info(
        `[InterceptSolver] Trajectory is unreachable within horn; falling back to closest-approach point at tick ${bestFallbackTick} (margin=${bestFallbackMargin.toFixed(1)}).`
      );
    }
    result.status = 'closest-fallback';
    result.margin = bestFallbackMargin;
    result.centrality = 0.0;
    targetTick = bestFallbackTick;
    hitAlpha = 1.0;
    bestHitDist = bestFallbackDist;
    bestHitREnv = bestFallbackREnv;
  } else {
    (solveOptimalIntercept as any)._lastStatus = 'reachable';
    result.margin = bestHitMargin;
  }

  const bOff = targetTick * 3;
  const curBx = rawBallPredPoints[bOff + 0];
  const curBy = rawBallPredPoints[bOff + 1];
  const curBz = rawBallPredPoints[bOff + 2];

  const curT = (targetTick - startIdx + 1) / 120.0;
  const rx = hitAlpha < 1.0 ? prevBx + (curBx - prevBx) * hitAlpha : curBx;
  const ry = hitAlpha < 1.0 ? prevBy + (curBy - prevBy) * hitAlpha : curBy;
  const rz = hitAlpha < 1.0 ? prevBz + (curBz - prevBz) * hitAlpha : curBz;
  const tFinal = hitAlpha < 1.0 ? prevT + (curT - prevT) * hitAlpha : curT;

  result.rx = rx;
  result.ry = ry;
  result.rz = rz;
  // Convert RocketSim (x, y, z) -> Three.js (x, z, y)
  result.tx = rx;
  result.ty = rz;
  result.tz = ry;
  result.timeSec = tFinal;
  result.distance = Math.hypot(rx - posX, ry - posY, rz - posZ);

  // Evaluate ballistic center at tFinal for horn centrality & minimum boost
  const cFinal = computeBallisticCenter(
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    upX,
    upY,
    upZ,
    tFinal,
    includeJump,
    isOnGround
  );
  const offX = rx - cFinal.x;
  const offY = ry - cFinal.y;
  const offZ = rz - cFinal.z;
  const dBallistic = Math.hypot(offX, offY, offZ);

  if (result.status === 'reachable') {
    // Core radius where zero-boost ballistic trajectory directly contacts the ball
    const coreRadius = BALL_CAR_CONTACT_RADIUS;
    const reqReach = Math.max(0.0, dBallistic - coreRadius);
    const availReach = Math.max(1.0, bestHitREnv - coreRadius);
    const centrality = Math.max(0.0, Math.min(1.0, 1.0 - reqReach / availReach));
    result.centrality = centrality;

    if (centrality >= 0.72) {
      result.paceStatus = 'sweet-spot';
    } else {
      const ivSpd = Math.hypot(cFinal.ivx, cFinal.ivy, cFinal.ivz);
      const dirX = ivSpd > 50.0 ? cFinal.ivx / ivSpd : fwdX;
      const dirY = ivSpd > 50.0 ? cFinal.ivy / ivSpd : fwdY;
      const dirZ = ivSpd > 50.0 ? cFinal.ivz / ivSpd : fwdZ;
      const longitudinalOffset = offX * dirX + offY * dirY + offZ * dirZ;
      if (ivSpd > 250.0 && longitudinalOffset < 0.0) {
        result.paceStatus = 'overshoot';
      } else {
        result.paceStatus = 'catching';
      }
    }
  }
  const reqThrustDisp = Math.max(0.0, dBallistic - BALL_CAR_CONTACT_RADIUS - 28.0 * tFinal);
  if (reqThrustDisp <= 1.0) {
    result.minBoost = 0.0;
  } else {
    // Solve 0.5 * a * tau^2 + a * tau * (tFinal - tau) >= reqThrustDisp
    // -> a * tFinal * tau - 0.5 * a * tau^2 = reqThrustDisp
    const A = 0.5 * BOOST_ACCEL;
    const B = BOOST_ACCEL * tFinal;
    const disc = B * B - 4.0 * A * reqThrustDisp;
    if (disc >= 0.0) {
      const tauReq = (B - Math.sqrt(disc)) / (2.0 * A);
      result.minBoost = Math.min(100.0, Math.max(0.0, tauReq * BOOST_BURN_RATE));
    } else {
      result.minBoost = 100.0;
    }
  }

  // Compute 3 Orthogonal Axes in Three.js space
  if (config.crossOrientation === 'trajectory' && targetTick < maxLookaheadTicks) {
    const nextOff = Math.min(predCount - 1, targetTick + 1) * 3;
    const prevOff = Math.max(0, targetTick - 1) * 3;
    // Tangent in Three.js space (X=x, Y=z, Z=y)
    let tx1 = rawBallPredPoints[nextOff + 0] - rawBallPredPoints[prevOff + 0];
    let ty1 = rawBallPredPoints[nextOff + 2] - rawBallPredPoints[prevOff + 2];
    let tz1 = rawBallPredPoints[nextOff + 1] - rawBallPredPoints[prevOff + 1];
    const tLen = Math.hypot(tx1, ty1, tz1);
    if (tLen > 1e-4) {
      tx1 /= tLen;
      ty1 /= tLen;
      tz1 /= tLen;
      // Second orthogonal axis: cross(tangent, worldUp(0,1,0))
      let nx = -tz1,
        ny = 0,
        nz = tx1;
      let nLen = Math.hypot(nx, ny, nz);
      if (nLen < 1e-4) {
        nx = 1;
        ny = 0;
        nz = 0;
        nLen = 1;
      }
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;
      // Third orthogonal axis: cross(tangent, normal)
      const bxAxis = ty1 * nz - tz1 * ny;
      const byAxis = tz1 * nx - tx1 * nz;
      const bzAxis = tx1 * ny - ty1 * nx;
      result.axis1 = [tx1, ty1, tz1];
      result.axis2 = [nx, ny, nz];
      result.axis3 = [bxAxis, byAxis, bzAxis];
    }
  }

  return result;
}
