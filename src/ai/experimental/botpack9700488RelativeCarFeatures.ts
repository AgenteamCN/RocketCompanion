/**
 * botpack9700488RelativeCarFeatures.ts
 * Relative car rotation, local-frame velocity/position projections, kickoff context,
 * and player feature encoders for Ducky (295) and Fury (318).
 */

import { CarStateView } from '../../physics/RocketSimStateViews.ts';
import { KICKOFF_SPAWN_PRESETS } from '../../physics/RocketSimConstants.ts';
import {
  POS_COEF,
  VEL_COEF,
  ANG_VEL_COEF,
  FURY_POS_COEF_X,
  FURY_POS_COEF_Y,
  FURY_POS_COEF_Z,
  FURY_VEL_COEF,
  FURY_ANG_VEL_COEF,
  BLUE_GOAL_BACK,
  ORANGE_GOAL_BACK,
} from './botpack9700488Specs.ts';
import {
  sBallView,
  sCarViews,
  getCarPhys,
  rotDot,
  type ActiveCarSlot,
  type BallPhysSnapshot,
  type CarPhysSnapshot,
} from './botpackSharedBallPredPipeline.ts';

export function safeUnit3(x: number, y: number, z: number): [number, number, number] {
  const lenSq = x * x + y * y + z * z;
  if (!Number.isFinite(lenSq) || lenSq <= 1e-6) return [0.0, 0.0, 0.0];
  const invLen = 1.0 / Math.sqrt(lenSq);
  return [x * invLen, y * invLen, z * invLen];
}

/**
 * Writes a single player feature block for Ducky (`DuckyObs_V2_01(3)`):
 * - 29 floats for `selfPhys` (`includeOwnerRel = false`)
 * - 35 floats for teammates/opponents (`includeOwnerRel = true`, adding 6 local-frame relative pos/vel floats)
 */
export function writeDuckyPlayerFeatures(
  obs: Float32Array,
  ptr: number,
  p: CarPhysSnapshot,
  selfPhys: CarPhysSnapshot,
  ball: BallPhysSnapshot,
  includeOwnerRel: boolean
): number {
  obs[ptr++] = p.posX * POS_COEF;
  obs[ptr++] = p.posY * POS_COEF;
  obs[ptr++] = p.posZ * POS_COEF;
  obs[ptr++] = p.fwdX;
  obs[ptr++] = p.fwdY;
  obs[ptr++] = p.fwdZ;
  obs[ptr++] = p.upX;
  obs[ptr++] = p.upY;
  obs[ptr++] = p.upZ;
  obs[ptr++] = p.velX * VEL_COEF;
  obs[ptr++] = p.velY * VEL_COEF;
  obs[ptr++] = p.velZ * VEL_COEF;

  const locAng = rotDot(p, p.angVelX, p.angVelY, p.angVelZ);
  obs[ptr++] = locAng[0] * ANG_VEL_COEF;
  obs[ptr++] = locAng[1] * ANG_VEL_COEF;
  obs[ptr++] = locAng[2] * ANG_VEL_COEF;

  const locBallPos = rotDot(p, ball.posX - p.posX, ball.posY - p.posY, ball.posZ - p.posZ);
  obs[ptr++] = locBallPos[0] * POS_COEF;
  obs[ptr++] = locBallPos[1] * POS_COEF;
  obs[ptr++] = locBallPos[2] * POS_COEF;

  const locBallVel = rotDot(p, ball.velX - p.velX, ball.velY - p.velY, ball.velZ - p.velZ);
  obs[ptr++] = locBallVel[0] * VEL_COEF;
  obs[ptr++] = locBallVel[1] * VEL_COEF;
  obs[ptr++] = locBallVel[2] * VEL_COEF;

  if (includeOwnerRel) {
    const relPos = rotDot(
      selfPhys,
      p.posX - selfPhys.posX,
      p.posY - selfPhys.posY,
      p.posZ - selfPhys.posZ
    );
    obs[ptr++] = relPos[0] * POS_COEF;
    obs[ptr++] = relPos[1] * POS_COEF;
    obs[ptr++] = relPos[2] * POS_COEF;

    const relVel = rotDot(
      selfPhys,
      p.velX - selfPhys.velX,
      p.velY - selfPhys.velY,
      p.velZ - selfPhys.velZ
    );
    obs[ptr++] = relVel[0] * VEL_COEF;
    obs[ptr++] = relVel[1] * VEL_COEF;
    obs[ptr++] = relVel[2] * VEL_COEF;
  }

  obs[ptr++] = Math.max(0, Math.min(1, p.boost / 100.0));
  obs[ptr++] = p.isOnGround ? 1.0 : 0.0;
  obs[ptr++] = p.hasFlipOrJump ? 1.0 : 0.0;
  obs[ptr++] = p.isDemoed ? 1.0 : 0.0;
  obs[ptr++] = p.hasJumped ? 1.0 : 0.0;
  obs[ptr++] = 1.0 / (1.0 + Math.max(0.0, p.demoRespawnTimer));
  obs[ptr++] = p.isOnGround
    ? 1.0
    : !p.hasFlipOrJump
      ? 0.0
      : Math.max(0.0, 1.0 - p.airTimeSinceJump / 1.25);
  obs[ptr++] = p.isSupersonic ? 1.0 : 0.0;
  return ptr;
}

/**
 * Writes Fury's 4 kickoff context scalars:
 * `[koStateNorm, distToBall * FURY_POS_COEF_X, roleInt / 3.0, minSpawnDist * FURY_POS_COEF_X]`
 */
export function writeFuryKickoffContext4(
  obs: Float32Array,
  ptr: number,
  simState: Float32Array,
  selfCarIndex: number,
  normSelfTeam: number,
  selfCv: CarStateView,
  selfPhys: CarPhysSnapshot,
  teammates: Array<{ carIndex: number; team: number; cv: CarStateView }>,
  opponents: Array<{ carIndex: number; team: number; cv: CarStateView }>,
  roster: ActiveCarSlot[]
): number {
  const ballCentered =
    Math.abs(sBallView.posX) <= 10.0 &&
    Math.abs(sBallView.posY) <= 10.0 &&
    Math.abs(sBallView.posZ - 93.15) <= 25.0;
  const ballStationary =
    sBallView.velX * sBallView.velX +
      sBallView.velY * sBallView.velY +
      sBallView.velZ * sBallView.velZ <=
    25.0;
  const isKickoffActive = ballCentered && ballStationary;

  let anyCarMoving = false;
  for (let i = 0; i < roster.length; i++) {
    const cv = (sCarViews[roster[i].carIndex] || new CarStateView()).attachCar(
      simState,
      roster[i].carIndex
    );
    if (cv.velX * cv.velX + cv.velY * cv.velY + cv.velZ * cv.velZ > 225.0) {
      anyCarMoving = true;
      break;
    }
  }
  obs[ptr++] = isKickoffActive ? (anyCarMoving ? 2.0 / 3.0 : 1.0 / 3.0) : 0.0;

  const distToBall = Math.hypot(
    selfCv.posX - sBallView.posX,
    selfCv.posY - sBallView.posY,
    selfCv.posZ - sBallView.posZ
  );
  obs[ptr++] = distToBall * FURY_POS_COEF_X;

  let roleInt = 0;
  if (isKickoffActive) {
    const myTeamSize = 1 + teammates.length;
    const oppTeamSize = opponents.length;
    if (!(myTeamSize === 1 && oppTeamSize >= 2)) {
      const teamCars = [{ carIndex: selfCarIndex, cv: selfCv }, ...teammates];
      const tFlip = normSelfTeam === 1 ? -1.0 : 1.0;
      const sortEntries = teamCars.map((tc) => {
        let bestSpawnDist = Infinity;
        let bestSpawnY = 0.0;
        for (let sIdx = 0; sIdx < KICKOFF_SPAWN_PRESETS.length; sIdx++) {
          const sp = KICKOFF_SPAWN_PRESETS[sIdx].team0;
          const sx = sp.x * tFlip;
          const sy = sp.y * tFlip;
          const d = (tc.cv.posX - sx) ** 2 + (tc.cv.posY - sy) ** 2;
          if (d < bestSpawnDist) {
            bestSpawnDist = d;
            bestSpawnY = Math.abs(sy);
          }
        }
        return { carIndex: tc.carIndex, absCenterDist: bestSpawnY, teamLocalX: tc.cv.posX * tFlip };
      });
      sortEntries.sort((a, b) =>
        Math.abs(a.absCenterDist - b.absCenterDist) > 40.0
          ? a.absCenterDist - b.absCenterDist
          : b.teamLocalX - a.teamLocalX
      );
      const rank = sortEntries.findIndex((e) => e.carIndex === selfCarIndex);
      roleInt = rank <= 0 ? 1 : rank === 1 ? 2 : 3;
    }
  }
  obs[ptr++] = roleInt / 3.0;

  let minSpawnDist = Infinity;
  for (let sIdx = 0; sIdx < KICKOFF_SPAWN_PRESETS.length; sIdx++) {
    const sp = KICKOFF_SPAWN_PRESETS[sIdx].team0;
    const d = Math.hypot(selfPhys.posX - sp.x, selfPhys.posY - sp.y, selfPhys.posZ - 17.0);
    if (d < minSpawnDist) minSpawnDist = d;
  }
  obs[ptr++] = minSpawnDist * FURY_POS_COEF_X;

  return ptr;
}

/**
 * Writes Fury's 5 goal-distance and ball-to-goal speed scalars.
 */
export function writeFuryGoalScalars5(
  obs: Float32Array,
  ptr: number,
  selfPhys: CarPhysSnapshot,
  ball: BallPhysSnapshot
): number {
  const distToOwnGoal = Math.hypot(
    selfPhys.posX - BLUE_GOAL_BACK[0],
    selfPhys.posY - BLUE_GOAL_BACK[1],
    selfPhys.posZ - BLUE_GOAL_BACK[2]
  );
  const distToEnemyGoal = Math.hypot(
    selfPhys.posX - ORANGE_GOAL_BACK[0],
    selfPhys.posY - ORANGE_GOAL_BACK[1],
    selfPhys.posZ - ORANGE_GOAL_BACK[2]
  );
  const ballDistToEnemyGoal = Math.hypot(
    ball.posX - ORANGE_GOAL_BACK[0],
    ball.posY - ORANGE_GOAL_BACK[1],
    ball.posZ - ORANGE_GOAL_BACK[2]
  );
  const bToEnemyUnit = safeUnit3(
    ORANGE_GOAL_BACK[0] - ball.posX,
    ORANGE_GOAL_BACK[1] - ball.posY,
    ORANGE_GOAL_BACK[2] - ball.posZ
  );
  const bToOwnUnit = safeUnit3(
    BLUE_GOAL_BACK[0] - ball.posX,
    BLUE_GOAL_BACK[1] - ball.posY,
    BLUE_GOAL_BACK[2] - ball.posZ
  );
  const ballSpdEnemy =
    ball.velX * bToEnemyUnit[0] + ball.velY * bToEnemyUnit[1] + ball.velZ * bToEnemyUnit[2];
  const ballSpdOwn =
    ball.velX * bToOwnUnit[0] + ball.velY * bToOwnUnit[1] + ball.velZ * bToOwnUnit[2];

  obs[ptr++] = distToOwnGoal * FURY_POS_COEF_X;
  obs[ptr++] = distToEnemyGoal * FURY_POS_COEF_X;
  obs[ptr++] = ballDistToEnemyGoal * FURY_POS_COEF_X;
  obs[ptr++] = ballSpdEnemy * FURY_VEL_COEF;
  obs[ptr++] = ballSpdOwn * FURY_VEL_COEF;
  return ptr;
}

/**
 * Writes Fury's 39-float per-player feature block (world + local angular/ball kinematics + goal/mate unit vectors).
 */
export function writeFuryPlayer39(
  obs: Float32Array,
  ptr: number,
  simState: Float32Array,
  carIndex: number,
  carTeam: number,
  cv: CarStateView,
  inv: boolean,
  ball: BallPhysSnapshot,
  roster: ActiveCarSlot[]
): number {
  const s = inv ? -1.0 : 1.0;
  const p = getCarPhys(cv, inv, false);
  obs[ptr++] = p.posX * FURY_POS_COEF_X;
  obs[ptr++] = p.posY * FURY_POS_COEF_Y;
  obs[ptr++] = p.posZ * FURY_POS_COEF_Z;
  obs[ptr++] = p.fwdX;
  obs[ptr++] = p.fwdY;
  obs[ptr++] = p.fwdZ;
  obs[ptr++] = p.upX;
  obs[ptr++] = p.upY;
  obs[ptr++] = p.upZ;
  obs[ptr++] = p.velX * FURY_VEL_COEF;
  obs[ptr++] = p.velY * FURY_VEL_COEF;
  obs[ptr++] = p.velZ * FURY_VEL_COEF;
  obs[ptr++] = p.angVelX * FURY_ANG_VEL_COEF;
  obs[ptr++] = p.angVelY * FURY_ANG_VEL_COEF;
  obs[ptr++] = p.angVelZ * FURY_ANG_VEL_COEF;

  const locAng = rotDot(p, p.angVelX, p.angVelY, p.angVelZ);
  obs[ptr++] = locAng[0] * FURY_ANG_VEL_COEF;
  obs[ptr++] = locAng[1] * FURY_ANG_VEL_COEF;
  obs[ptr++] = locAng[2] * FURY_ANG_VEL_COEF;

  const locBallPos = rotDot(p, ball.posX - p.posX, ball.posY - p.posY, ball.posZ - p.posZ);
  obs[ptr++] = locBallPos[0] * FURY_POS_COEF_X;
  obs[ptr++] = locBallPos[1] * FURY_POS_COEF_Y;
  obs[ptr++] = locBallPos[2] * FURY_POS_COEF_Z;

  const locBallVel = rotDot(p, ball.velX - p.velX, ball.velY - p.velY, ball.velZ - p.velZ);
  obs[ptr++] = locBallVel[0] * FURY_VEL_COEF;
  obs[ptr++] = locBallVel[1] * FURY_VEL_COEF;
  obs[ptr++] = locBallVel[2] * FURY_VEL_COEF;

  obs[ptr++] = Math.max(0, Math.min(1, p.boost / 100.0));
  obs[ptr++] = p.isOnGround ? 1.0 : 0.0;
  obs[ptr++] = p.hasFlipOrJump ? 1.0 : 0.0;
  obs[ptr++] = p.hasFlipReset ? 1.0 : 0.0;
  obs[ptr++] = p.isDemoed ? 1.0 : 0.0;
  obs[ptr++] = p.hasJumped ? 1.0 : 0.0;

  const toOwnUnit = safeUnit3(
    BLUE_GOAL_BACK[0] - p.posX,
    BLUE_GOAL_BACK[1] - p.posY,
    BLUE_GOAL_BACK[2] - p.posZ
  );
  const toEnemyUnit = safeUnit3(
    ORANGE_GOAL_BACK[0] - p.posX,
    ORANGE_GOAL_BACK[1] - p.posY,
    ORANGE_GOAL_BACK[2] - p.posZ
  );
  obs[ptr++] = toOwnUnit[0];
  obs[ptr++] = toOwnUnit[1];
  obs[ptr++] = toOwnUnit[2];
  obs[ptr++] = toEnemyUnit[0];
  obs[ptr++] = toEnemyUnit[1];
  obs[ptr++] = toEnemyUnit[2];

  let minMateDistSq = Infinity;
  let mateDx = 0.0;
  let mateDy = 0.0;
  let mateDz = 0.0;
  for (let rIdx = 0; rIdx < roster.length; rIdx++) {
    const other = roster[rIdx];
    const otherTeam = other.team === 1 ? 1 : 0;
    if (other.carIndex === carIndex || otherTeam !== carTeam) continue;
    const ocv = (sCarViews[other.carIndex] || new CarStateView()).attachCar(
      simState,
      other.carIndex
    );
    const dx = ocv.posX - cv.posX;
    const dy = ocv.posY - cv.posY;
    const dz = ocv.posZ - cv.posZ;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq < minMateDistSq) {
      minMateDistSq = dSq;
      mateDx = dx;
      mateDy = dy;
      mateDz = dz;
    }
  }
  const mateUnit = safeUnit3(mateDx * s, mateDy * s, mateDz);
  obs[ptr++] = mateUnit[0];
  obs[ptr++] = mateUnit[1];
  obs[ptr++] = mateUnit[2];
  return ptr;
}
