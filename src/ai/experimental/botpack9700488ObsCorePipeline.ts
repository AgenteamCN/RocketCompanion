/**
 * botpack9700488ObsCorePipeline.ts
 * Standard AdvancedObs builders and player/boost feature writers
 * for Chronos v2.1 (225), Dice (167), Kira (109), and Rain 3v3 (231).
 */

import { CarStateView } from '../../physics/RocketSimStateViews.ts';
import { encodeCarControls } from './experimentalMultiCarObsPipeline.ts';
import { mirrorActionControlsX, type CarControls } from './botpack9700488Actions.ts';
import {
  POS_COEF,
  VEL_COEF,
  ANG_VEL_COEF,
  BLUE_GOAL_BACK,
  ORANGE_GOAL_BACK,
  CANONICAL_TO_WASM_PAD_INDEX,
  MIRROR_X_PAD_INDEX,
} from './botpack9700488Specs.ts';
import {
  sBallView,
  sPadView,
  sCarViews,
  getCarPhys,
  getBallPhys,
  rotDot,
  collectTeammatesAndOpponents,
  type ActiveCarSlot,
  type CarPhysSnapshot,
  type BallPhysSnapshot,
  type BuiltBotpackObs,
} from './botpackSharedBallPredPipeline.ts';

export function writeStandardPlayer29(
  out: Float32Array,
  offset: number,
  p: CarPhysSnapshot,
  ball: BallPhysSnapshot
): number {
  out[offset + 0] = p.posX * POS_COEF;
  out[offset + 1] = p.posY * POS_COEF;
  out[offset + 2] = p.posZ * POS_COEF;

  out[offset + 3] = p.fwdX;
  out[offset + 4] = p.fwdY;
  out[offset + 5] = p.fwdZ;

  out[offset + 6] = p.upX;
  out[offset + 7] = p.upY;
  out[offset + 8] = p.upZ;

  out[offset + 9] = p.velX * VEL_COEF;
  out[offset + 10] = p.velY * VEL_COEF;
  out[offset + 11] = p.velZ * VEL_COEF;

  out[offset + 12] = p.angVelX * ANG_VEL_COEF;
  out[offset + 13] = p.angVelY * ANG_VEL_COEF;
  out[offset + 14] = p.angVelZ * ANG_VEL_COEF;

  const locAng = rotDot(p, p.angVelX, p.angVelY, p.angVelZ);
  out[offset + 15] = locAng[0] * ANG_VEL_COEF;
  out[offset + 16] = locAng[1] * ANG_VEL_COEF;
  out[offset + 17] = locAng[2] * ANG_VEL_COEF;

  const locBallPos = rotDot(p, ball.posX - p.posX, ball.posY - p.posY, ball.posZ - p.posZ);
  out[offset + 18] = locBallPos[0] * POS_COEF;
  out[offset + 19] = locBallPos[1] * POS_COEF;
  out[offset + 20] = locBallPos[2] * POS_COEF;

  const locBallVel = rotDot(p, ball.velX - p.velX, ball.velY - p.velY, ball.velZ - p.velZ);
  out[offset + 21] = locBallVel[0] * VEL_COEF;
  out[offset + 22] = locBallVel[1] * VEL_COEF;
  out[offset + 23] = locBallVel[2] * VEL_COEF;

  out[offset + 24] = Math.max(0, Math.min(1, p.boost / 100.0));
  out[offset + 25] = p.isOnGround ? 1.0 : 0.0;
  out[offset + 26] = p.hasFlipOrJump ? 1.0 : 0.0;
  out[offset + 27] = p.isDemoed ? 1.0 : 0.0;
  out[offset + 28] = p.hasJumped ? 1.0 : 0.0;
  return offset + 29;
}

export function writeBoostPads34(
  out: Float32Array,
  offset: number,
  simState: Float32Array,
  inv: boolean,
  mirrorX = false,
  clampInactiveMax = 1.0
): number {
  for (let i = 0; i < 34; i++) {
    const mapped = mirrorX ? MIRROR_X_PAD_INDEX[i] : i;
    const canonicalPadIdx = inv ? 33 - mapped : mapped;
    const wasmPadIdx = CANONICAL_TO_WASM_PAD_INDEX[canonicalPadIdx];
    sPadView.attach(simState, wasmPadIdx);
    if (sPadView.isActive) {
      out[offset + i] = 1.0;
    } else {
      const t = Math.max(0.0, sPadView.cooldown);
      let v = 1.0 / (1.0 + t);
      if (v > clampInactiveMax) v = clampInactiveMax;
      out[offset + i] = v;
    }
  }
  return offset + 34;
}

/**
 * 1. Chronos v2.1 Observation Builder (225 floats, returns `{ obs, mirrorX, selfCarView }`)
 */
export function buildChronosObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const invSelfPosX = inv ? -selfCv.posX : selfCv.posX;
  const mirrorX = invSelfPosX > 0;

  const ball = getBallPhys(sBallView, inv, mirrorX);
  const selfPhys = getCarPhys(selfCv, inv, mirrorX);
  const obs = new Float32Array(225);
  let ptr = 0;

  obs[ptr++] = ball.posX * POS_COEF;
  obs[ptr++] = ball.posY * POS_COEF;
  obs[ptr++] = ball.posZ * POS_COEF;
  obs[ptr++] = ball.velX * VEL_COEF;
  obs[ptr++] = ball.velY * VEL_COEF;
  obs[ptr++] = ball.velZ * VEL_COEF;
  obs[ptr++] = ball.angVelX * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelY * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelZ * ANG_VEL_COEF;

  const actCtrl = mirrorX ? mirrorActionControlsX(prevControls) : prevControls;
  const actArr = encodeCarControls(actCtrl);
  for (let i = 0; i < 8; i++) obs[ptr++] = actArr[i];

  ptr = writeBoostPads34(obs, ptr, simState, inv, mirrorX, 1.0);
  ptr = writeStandardPlayer29(obs, ptr, selfPhys, ball);

  const { teammates, opponents } = collectTeammatesAndOpponents(
    simState,
    selfCarIndex,
    normSelfTeam,
    activeCars,
    2,
    3
  );

  for (let i = 0; i < 2; i++) {
    if (i < teammates.length) {
      ptr = writeStandardPlayer29(obs, ptr, getCarPhys(teammates[i].cv, inv, mirrorX), ball);
    } else {
      ptr += 29;
    }
  }
  for (let i = 0; i < 3; i++) {
    if (i < opponents.length) {
      ptr = writeStandardPlayer29(obs, ptr, getCarPhys(opponents[i].cv, inv, mirrorX), ball);
    } else {
      ptr += 29;
    }
  }

  return { obs, mirrorX, selfCarView: selfCv };
}

/**
 * 2. Dice Observation Builder (167 floats, maxPlayers = 2: 1 teammate, 2 opponents)
 */
export function buildDiceObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const ball = getBallPhys(sBallView, inv, false);
  const selfPhys = getCarPhys(selfCv, inv, false);
  const obs = new Float32Array(167);
  let ptr = 0;

  obs[ptr++] = ball.posX * POS_COEF;
  obs[ptr++] = ball.posY * POS_COEF;
  obs[ptr++] = ball.posZ * POS_COEF;
  obs[ptr++] = ball.velX * VEL_COEF;
  obs[ptr++] = ball.velY * VEL_COEF;
  obs[ptr++] = ball.velZ * VEL_COEF;
  obs[ptr++] = ball.angVelX * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelY * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelZ * ANG_VEL_COEF;

  const actArr = encodeCarControls(prevControls);
  for (let i = 0; i < 8; i++) obs[ptr++] = actArr[i];

  ptr = writeBoostPads34(obs, ptr, simState, inv, false, 0.999);
  ptr = writeStandardPlayer29(obs, ptr, selfPhys, ball);

  const { teammates, opponents } = collectTeammatesAndOpponents(
    simState,
    selfCarIndex,
    normSelfTeam,
    activeCars,
    1,
    2
  );

  if (teammates.length > 0) {
    ptr = writeStandardPlayer29(obs, ptr, getCarPhys(teammates[0].cv, inv, false), ball);
  } else {
    ptr += 29;
  }
  for (let i = 0; i < 2; i++) {
    if (i < opponents.length) {
      ptr = writeStandardPlayer29(obs, ptr, getCarPhys(opponents[i].cv, inv, false), ball);
    } else {
      ptr += 29;
    }
  }

  return { obs, selfCarView: selfCv };
}

/**
 * 6. Kira Observation Builder (`AdvancedObs` 1v1, 109 floats: 0 teammates, 1 opponent)
 */
export function buildKiraObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const ball = getBallPhys(sBallView, inv, false);
  const selfPhys = getCarPhys(selfCv, inv, false);
  const obs = new Float32Array(109);
  let ptr = 0;

  obs[ptr++] = ball.posX * POS_COEF;
  obs[ptr++] = ball.posY * POS_COEF;
  obs[ptr++] = ball.posZ * POS_COEF;
  obs[ptr++] = ball.velX * VEL_COEF;
  obs[ptr++] = ball.velY * VEL_COEF;
  obs[ptr++] = ball.velZ * VEL_COEF;
  obs[ptr++] = ball.angVelX * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelY * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelZ * ANG_VEL_COEF;

  const actArr = encodeCarControls(prevControls);
  for (let i = 0; i < 8; i++) obs[ptr++] = actArr[i];

  ptr = writeBoostPads34(obs, ptr, simState, inv, false, 1.0);
  ptr = writeStandardPlayer29(obs, ptr, selfPhys, ball);

  const { opponents } = collectTeammatesAndOpponents(
    simState,
    selfCarIndex,
    normSelfTeam,
    activeCars,
    0,
    1
  );
  if (opponents.length > 0) {
    ptr = writeStandardPlayer29(obs, ptr, getCarPhys(opponents[0].cv, inv, false), ball);
  }

  return { obs, selfCarView: selfCv };
}

/**
 * 7. Rain (3v3) Observation Builder (`AdvancedObsPadded(3)` + 6 goal-relative ball floats = 231 floats)
 */
export function buildRainObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const ball = getBallPhys(sBallView, inv, false);
  const selfPhys = getCarPhys(selfCv, inv, false);
  const obs = new Float32Array(231);
  let ptr = 0;

  obs[ptr++] = ball.posX * POS_COEF;
  obs[ptr++] = ball.posY * POS_COEF;
  obs[ptr++] = ball.posZ * POS_COEF;
  obs[ptr++] = ball.velX * VEL_COEF;
  obs[ptr++] = ball.velY * VEL_COEF;
  obs[ptr++] = ball.velZ * VEL_COEF;
  obs[ptr++] = ball.angVelX * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelY * ANG_VEL_COEF;
  obs[ptr++] = ball.angVelZ * ANG_VEL_COEF;

  const ownGoal = inv ? ORANGE_GOAL_BACK : BLUE_GOAL_BACK;
  const enemyGoal = inv ? BLUE_GOAL_BACK : ORANGE_GOAL_BACK;
  obs[ptr++] = (ownGoal[0] - ball.posX) * POS_COEF;
  obs[ptr++] = (ownGoal[1] - ball.posY) * POS_COEF;
  obs[ptr++] = (ownGoal[2] - ball.posZ) * POS_COEF;
  obs[ptr++] = (enemyGoal[0] - ball.posX) * POS_COEF;
  obs[ptr++] = (enemyGoal[1] - ball.posY) * POS_COEF;
  obs[ptr++] = (enemyGoal[2] - ball.posZ) * POS_COEF;

  const actArr = encodeCarControls(prevControls);
  for (let i = 0; i < 8; i++) obs[ptr++] = actArr[i];

  ptr = writeBoostPads34(obs, ptr, simState, inv, false, 1.0);
  ptr = writeStandardPlayer29(obs, ptr, selfPhys, ball);

  const { teammates, opponents } = collectTeammatesAndOpponents(
    simState,
    selfCarIndex,
    normSelfTeam,
    activeCars,
    2,
    3
  );
  for (let i = 0; i < 2; i++) {
    if (i < teammates.length) {
      ptr = writeStandardPlayer29(obs, ptr, getCarPhys(teammates[i].cv, inv, false), ball);
    } else {
      ptr += 29;
    }
  }
  for (let i = 0; i < 3; i++) {
    if (i < opponents.length) {
      ptr = writeStandardPlayer29(obs, ptr, getCarPhys(opponents[i].cv, inv, false), ball);
    } else {
      ptr += 29;
    }
  }

  return { obs, selfCarView: selfCv };
}
