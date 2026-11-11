/**
 * RLRCBallSurfaceImpactKinematics.ts
 * Pure arena surface normal-velocity reversal and vector deflection checks
 * for distinguishing genuine ball-surface bounces from continuous rolling/sliding.
 */

import { BALL_REST_Z, STANDARD_GOAL_VOLUME_BOX } from '../../../physics/RocketSimConstants.ts';
import type { RLRCVec3 } from '../RLRCReplayTypes.ts';

export const RLRC_ARENA_HALF_X = 4096;
export const RLRC_ARENA_HALF_Y = 5120;
export const RLRC_ARENA_CEILING_Z = 2044;
export const RLRC_ARENA_CORNER_SUM = 8064;
export const COS_MIN_WORLD_DEFLECT_RAD = Math.cos((22 * Math.PI) / 180);
export const COS_MIN_POST_DEFLECT_RAD = Math.cos((18 * Math.PI) / 180);

const GOAL_MAX_Z = STANDARD_GOAL_VOLUME_BOX.maxZ;

export interface RLRCSurfaceNormalReversalMetrics {
  readonly nearSurface: boolean;
  readonly maxReversal: number;
  readonly minInwardVel: number;
}

export function isNearGoalPostSurface(p: RLRCVec3): boolean {
  const ax = Math.abs(p.x);
  return Math.abs(p.y) >= 4960 && ax <= 940 && p.z <= 700 && (ax >= 790 || p.z >= GOAL_MAX_Z - 95);
}

export function computeMaxSurfaceNormalReversal(
  pos: RLRCVec3,
  vIn: RLRCVec3,
  vOut: RLRCVec3
): RLRCSurfaceNormalReversalMetrics {
  let nearSurface = false;
  let maxReversal = 0;
  let minInwardVel = 0;
  const checkPlane = (inwardComp: number, outwardComp: number): void => {
    nearSurface = true;
    if (inwardComp < minInwardVel) minInwardVel = inwardComp;
    if (inwardComp < -140 && outwardComp > -25 && outwardComp - inwardComp >= 220) {
      maxReversal = Math.max(maxReversal, outwardComp - inwardComp);
    }
  };
  if (pos.z <= BALL_REST_Z + 38) checkPlane(vIn.z, vOut.z);
  if (pos.z >= RLRC_ARENA_CEILING_Z - BALL_REST_Z - 90) checkPlane(-vIn.z, -vOut.z);
  if (Math.abs(pos.x) >= RLRC_ARENA_HALF_X - BALL_REST_Z - 140) {
    const nx = pos.x >= 0 ? -1 : 1;
    checkPlane(vIn.x * nx, vOut.x * nx);
  }
  if (
    Math.abs(pos.y) >= RLRC_ARENA_HALF_Y - BALL_REST_Z - 140 &&
    (Math.abs(pos.x) >= 820 || pos.z >= GOAL_MAX_Z - 60)
  ) {
    const ny = pos.y >= 0 ? -1 : 1;
    checkPlane(vIn.y * ny, vOut.y * ny);
  }
  if (Math.abs(pos.x) + Math.abs(pos.y) >= RLRC_ARENA_CORNER_SUM - BALL_REST_Z - 160) {
    const nx = (pos.x >= 0 ? -1 : 1) * Math.SQRT1_2;
    const ny = (pos.y >= 0 ? -1 : 1) * Math.SQRT1_2;
    checkPlane(vIn.x * nx + vIn.y * ny, vOut.x * nx + vOut.y * ny);
  }
  return { nearSurface, maxReversal, minInwardVel };
}

export function hasSignificantVectorDeflection(
  vIn: RLRCVec3,
  vOut: RLRCVec3,
  cosThreshold: number,
  minSpeed = 160
): boolean {
  const sIn = Math.hypot(vIn.x, vIn.y, vIn.z);
  const sOut = Math.hypot(vOut.x, vOut.y, vOut.z);
  const dot = vIn.x * vOut.x + vIn.y * vOut.y + vIn.z * vOut.z;
  return sIn >= minSpeed && sOut >= 80 && dot <= cosThreshold * sIn * sOut;
}
