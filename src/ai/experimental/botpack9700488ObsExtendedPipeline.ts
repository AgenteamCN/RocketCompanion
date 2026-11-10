/**
 * botpack9700488ObsExtendedPipeline.ts
 * Ball prediction trajectory sampling and observation builders for
 * Ducky (295), Fury (318), and Galactus v2 (258).
 *
 * Relative car rotation/velocity feature encoders for Ducky and Fury live in
 * `./botpack9700488RelativeCarFeatures.ts`.
 */

import { CarStateView } from '../../physics/RocketSimStateViews.ts';
import { encodeCarControls } from './experimentalMultiCarObsPipeline.ts';
import type { CarControls } from './botpack9700488Actions.ts';
import {
  POS_COEF,
  VEL_COEF,
  ANG_VEL_COEF,
  FURY_POS_COEF_X,
  FURY_POS_COEF_Y,
  FURY_POS_COEF_Z,
  FURY_VEL_COEF,
  FURY_ANG_VEL_COEF,
  BIG_BOOST_PAD_INDICES,
  CANONICAL_BOOST_LOCATIONS,
  CANONICAL_TO_WASM_PAD_INDEX,
} from './botpack9700488Specs.ts';
import {
  sBallView,
  sPadView,
  sCarViews,
  ensureSharedBallPrediction,
  getCarPhys,
  getBallPhys,
  rotDot,
  collectTeammatesAndOpponents,
  type ActiveCarSlot,
  type BallPredictionEnginePort,
  type BallPhysSnapshot,
  type BuiltBotpackObs,
} from './botpackSharedBallPredPipeline.ts';
import { writeStandardPlayer29, writeBoostPads34 } from './botpack9700488ObsCorePipeline.ts';
import {
  writeDuckyPlayerFeatures,
  writeFuryKickoffContext4,
  writeFuryGoalScalars5,
  writeFuryPlayer39,
} from './botpack9700488RelativeCarFeatures.ts';

export type { BallPredictionEnginePort };

function writeBallHeaderAndPrevAct(
  obs: Float32Array,
  ball: BallPhysSnapshot,
  prevControls: CarControls,
  posCoefX: number,
  posCoefY: number,
  posCoefZ: number,
  velCoef: number,
  angCoef: number
): number {
  let ptr = 0;
  obs[ptr++] = ball.posX * posCoefX;
  obs[ptr++] = ball.posY * posCoefY;
  obs[ptr++] = ball.posZ * posCoefZ;
  obs[ptr++] = ball.velX * velCoef;
  obs[ptr++] = ball.velY * velCoef;
  obs[ptr++] = ball.velZ * velCoef;
  obs[ptr++] = ball.angVelX * angCoef;
  obs[ptr++] = ball.angVelY * angCoef;
  obs[ptr++] = ball.angVelZ * angCoef;
  const actArr = encodeCarControls(prevControls);
  for (let i = 0; i < 8; i++) obs[ptr++] = actArr[i];
  return ptr;
}

/**
 * 3. Ducky Observation Builder (`DuckyObs_V2_01(3)`, 295 floats)
 */
export function buildDuckyObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null,
  physicsEngine: BallPredictionEnginePort | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const ball = getBallPhys(sBallView, inv, false);
  const selfPhys = getCarPhys(selfCv, inv, false);
  const obs = new Float32Array(295);

  let ptr = writeBallHeaderAndPrevAct(
    obs,
    ball,
    prevControls,
    POS_COEF,
    POS_COEF,
    POS_COEF,
    VEL_COEF,
    ANG_VEL_COEF
  );
  ptr = writeBoostPads34(obs, ptr, simState, inv, false, 1.0);
  ptr = writeDuckyPlayerFeatures(obs, ptr, selfPhys, selfPhys, ball, false);

  const { teammates, opponents } = collectTeammatesAndOpponents(
    simState,
    selfCarIndex,
    normSelfTeam,
    activeCars,
    2,
    3
  );
  for (let i = 0; i < 2; i++) {
    ptr =
      i < teammates.length
        ? writeDuckyPlayerFeatures(
            obs,
            ptr,
            getCarPhys(teammates[i].cv, inv, false),
            selfPhys,
            ball,
            true
          )
        : ptr + 35;
  }
  for (let i = 0; i < 3; i++) {
    ptr =
      i < opponents.length
        ? writeDuckyPlayerFeatures(
            obs,
            ptr,
            getCarPhys(opponents[i].cv, inv, false),
            selfPhys,
            ball,
            true
          )
        : ptr + 35;
  }

  // Ball prediction trajectory sampling at 0.3s (36 ticks), 1.0s (120 ticks), 3.0s (360 ticks)
  const predBuf = ensureSharedBallPrediction(simState, physicsEngine, 3.05);
  const s = inv ? -1.0 : 1.0;
  const predTicks = [36, 120, 360];
  for (let i = 0; i < 3; i++) {
    const off = predTicks[i] * 6;
    const pbx = predBuf[off + 0] * s;
    const pby = predBuf[off + 1] * s;
    const pbz = predBuf[off + 2];
    const pvx = predBuf[off + 3] * s;
    const pvy = predBuf[off + 4] * s;
    const pvz = predBuf[off + 5];

    obs[ptr++] = pbx * POS_COEF;
    obs[ptr++] = pby * POS_COEF;
    obs[ptr++] = pbz * POS_COEF;
    obs[ptr++] = pvx * VEL_COEF;
    obs[ptr++] = pvy * VEL_COEF;
    obs[ptr++] = pvz * VEL_COEF;

    const locPos = rotDot(selfPhys, pbx - selfPhys.posX, pby - selfPhys.posY, pbz - selfPhys.posZ);
    obs[ptr++] = locPos[0] * POS_COEF;
    obs[ptr++] = locPos[1] * POS_COEF;
    obs[ptr++] = locPos[2] * POS_COEF;

    const locVel = rotDot(selfPhys, pvx - selfPhys.velX, pvy - selfPhys.velY, pvz - selfPhys.velZ);
    obs[ptr++] = locVel[0] * VEL_COEF;
    obs[ptr++] = locVel[1] * VEL_COEF;
    obs[ptr++] = locVel[2] * VEL_COEF;
  }

  // Velocity-aligned big/small boost pad selection
  const flatSpeed = Math.hypot(selfPhys.velX, selfPhys.velY);
  const velDirX = flatSpeed > 1.0 ? selfPhys.velX / flatSpeed : 0.0;
  const velDirY = flatSpeed > 1.0 ? selfPhys.velY / flatSpeed : 0.0;
  const speedFrac = Math.min(flatSpeed / 2300.0, 1.0);

  for (const wantBig of [true, false]) {
    let bestLoc: readonly [number, number, number] = [0, 0, 0];
    let bestCost = Infinity;
    let closestLoc: readonly [number, number, number] = [0, 0, 0];
    let closestDist = Infinity;

    for (let i = 0; i < 34; i++) {
      const loc = CANONICAL_BOOST_LOCATIONS[i];
      if (loc[2] > 71.0 !== wantBig) continue;

      const dx = loc[0] - selfPhys.posX;
      const dy = loc[1] - selfPhys.posY;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestLoc = loc;
      }

      const rawPadIdx = inv ? 33 - i : i;
      sPadView.attach(simState, CANONICAL_TO_WASM_PAD_INDEX[rawPadIdx]);
      if (!sPadView.isActive && sPadView.cooldown > 3.0) continue;

      const align = dist > 1.0 ? (velDirX * dx + velDirY * dy) / dist : 1.0;
      const cost = dist * (1.0 + speedFrac * (1.0 - align));
      if (cost < bestCost) {
        bestCost = cost;
        bestLoc = loc;
      }
    }

    const chosen = bestCost < Infinity ? bestLoc : closestLoc;
    const locPad = rotDot(
      selfPhys,
      chosen[0] - selfPhys.posX,
      chosen[1] - selfPhys.posY,
      chosen[2] - selfPhys.posZ
    );
    obs[ptr++] = locPad[0] * POS_COEF;
    obs[ptr++] = locPad[1] * POS_COEF;
  }

  return { obs, selfCarView: selfCv };
}

/**
 * 4. Fury Observation Builder (`FuryOBSPadded200B(3)`, 318 floats)
 */
export function buildFuryObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null,
  physicsEngine: BallPredictionEnginePort | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const ball = getBallPhys(sBallView, inv, false);
  const selfPhys = getCarPhys(selfCv, inv, false);
  const obs = new Float32Array(318);

  let ptr = writeBallHeaderAndPrevAct(
    obs,
    ball,
    prevControls,
    FURY_POS_COEF_X,
    FURY_POS_COEF_Y,
    FURY_POS_COEF_Z,
    FURY_VEL_COEF,
    FURY_ANG_VEL_COEF
  );
  ptr = writeBoostPads34(obs, ptr, simState, inv, false, 1.0);

  const { teammates, opponents, roster } = collectTeammatesAndOpponents(
    simState,
    selfCarIndex,
    normSelfTeam,
    activeCars,
    2,
    3
  );

  ptr = writeFuryKickoffContext4(
    obs,
    ptr,
    simState,
    selfCarIndex,
    normSelfTeam,
    selfCv,
    selfPhys,
    teammates,
    opponents,
    roster
  );

  // Ball prediction trajectory sampling at 0.5s, 1.0s, 1.5s, 2.0s (ticks 60, 120, 180, 240)
  const predBuf = ensureSharedBallPrediction(simState, physicsEngine, 2.05);
  const s = inv ? -1.0 : 1.0;
  const furyPredTicks = [60, 120, 180, 240];
  for (let i = 0; i < 4; i++) {
    const off = furyPredTicks[i] * 6;
    obs[ptr++] = predBuf[off + 0] * s * FURY_POS_COEF_X;
    obs[ptr++] = predBuf[off + 1] * s * FURY_POS_COEF_Y;
    obs[ptr++] = predBuf[off + 2] * FURY_POS_COEF_Z;
    obs[ptr++] = predBuf[off + 3] * s * FURY_VEL_COEF;
    obs[ptr++] = predBuf[off + 4] * s * FURY_VEL_COEF;
    obs[ptr++] = predBuf[off + 5] * FURY_VEL_COEF;
  }

  ptr = writeFuryGoalScalars5(obs, ptr, selfPhys, ball);
  ptr = writeFuryPlayer39(
    obs,
    ptr,
    simState,
    selfCarIndex,
    normSelfTeam,
    selfCv,
    inv,
    ball,
    roster
  );
  for (let i = 0; i < 2; i++) {
    if (i < teammates.length) {
      ptr = writeFuryPlayer39(
        obs,
        ptr,
        simState,
        teammates[i].carIndex,
        teammates[i].team,
        teammates[i].cv,
        inv,
        ball,
        roster
      );
    } else {
      ptr += 39;
    }
  }
  for (let i = 0; i < 3; i++) {
    if (i < opponents.length) {
      ptr = writeFuryPlayer39(
        obs,
        ptr,
        simState,
        opponents[i].carIndex,
        opponents[i].team,
        opponents[i].cv,
        inv,
        ball,
        roster
      );
    } else {
      ptr += 39;
    }
  }

  return { obs, selfCarView: selfCv };
}

/**
 * 5. Galactus v2 Observation Builder (`GalactusOBS(3)`, 258 floats)
 */
export function buildGalactusObs(
  simState: Float32Array,
  prevControls: CarControls,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarSlot[] | null = null,
  physicsEngine: BallPredictionEnginePort | null = null
): BuiltBotpackObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const inv = normSelfTeam === 1;
  const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(simState, selfCarIndex);
  sBallView.attach(simState);

  const ball = getBallPhys(sBallView, inv, false);
  const selfPhys = getCarPhys(selfCv, inv, false);
  const obs = new Float32Array(258);

  let ptr = writeBallHeaderAndPrevAct(
    obs,
    ball,
    prevControls,
    POS_COEF,
    POS_COEF,
    POS_COEF,
    VEL_COEF,
    ANG_VEL_COEF
  );
  ptr = writeBoostPads34(obs, ptr, simState, inv, false, 1.0);

  let nearestRelX = 0.0;
  let nearestRelY = 0.0;
  let nearestRelZ = 0.0;
  let nearestDistSq = 1500.0 * 1500.0;
  for (const padIdx of BIG_BOOST_PAD_INDICES) {
    const canonicalPadIdx = inv ? 33 - padIdx : padIdx;
    sPadView.attach(simState, CANONICAL_TO_WASM_PAD_INDEX[canonicalPadIdx]);
    if (!sPadView.isActive) continue;
    const loc = CANONICAL_BOOST_LOCATIONS[padIdx];
    const rx = loc[0] - selfPhys.posX;
    const ry = loc[1] - selfPhys.posY;
    const rz = loc[2] - selfPhys.posZ;
    const distSq2D = rx * rx + ry * ry;
    if (distSq2D <= nearestDistSq) {
      nearestDistSq = distSq2D;
      nearestRelX = rx;
      nearestRelY = ry;
      nearestRelZ = rz;
    }
  }
  obs[ptr++] = nearestRelX * POS_COEF;
  obs[ptr++] = nearestRelY * POS_COEF;
  obs[ptr++] = nearestRelZ * POS_COEF;

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

  // Ball prediction trajectory sampling at 0.25s, 0.5s, 1.0s, 1.5s, 2.0s (ticks 30, 60, 120, 180, 240)
  const predBuf = ensureSharedBallPrediction(simState, physicsEngine, 2.05);
  const s = inv ? -1.0 : 1.0;
  const galPredTicks = [30, 60, 120, 180, 240];
  for (let i = 0; i < 5; i++) {
    const off = galPredTicks[i] * 6;
    obs[ptr++] = predBuf[off + 0] * s * POS_COEF;
    obs[ptr++] = predBuf[off + 1] * s * POS_COEF;
    obs[ptr++] = predBuf[off + 2] * POS_COEF;
    obs[ptr++] = predBuf[off + 3] * s * VEL_COEF;
    obs[ptr++] = predBuf[off + 4] * s * VEL_COEF;
    obs[ptr++] = predBuf[off + 5] * VEL_COEF;
  }

  return { obs, selfCarView: selfCv };
}
