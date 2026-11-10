/**
 * KickoffPPOAgent.ts
 * Pure-Web Float32 PPO Actor inference & 75-dim Ego-Frame Observation (obs_v3) builder.
 */

import {
  KICKOFF_SETTLE_TICKS,
  TICKS_PER_DECISION,
  OBS_V3_DIM,
  getActorWeights,
  CarJumpAirTimeTracker,
  resetEngineToKickoffSpawn,
  multiDiscreteToControls,
  multiDiscreteToOverlayKeys,
  multiDiscreteToKeyString,
  buildKickoffTimelineNoteBars,
} from './kickoffEpisodePrimitives.ts';

const FIELD_X = 4096.0;
const FIELD_Y = 5120.0;
const FIELD_Z = 2000.0;

const S_FACE = 5120.0;
const S_CAR_ANG = 5.5;
const S_CAR_VEL = 2300.0;
const S_BALL_POS = 5000.0;
const S_BALL_VEL = 2500.0;
const S_BALL_ANG = 6.0;
const S_CLOSING = 5000.0;

const BIG_PAD_INDICES = [4, 5, 0, 1, 2, 3];
const BIG_PAD_INDICES_ORANGE = [3, 2, 1, 0, 5, 4];
const BIG_PAD_COOLDOWN = 10.0;

const OPP_GOAL_X = 0.0;
const OPP_GOAL_Y = 5120.0;
const OPP_GOAL_Z = 320.0;

const OWN_GOAL_X = 0.0;
const OWN_GOAL_Y = -5120.0;
const OWN_GOAL_Z = 320.0;

export class KickoffPPOAgent {
  weights: any;
  obsBuffer: Float32Array;
  h1Buffer: Float32Array;
  h2Buffer: Float32Array;
  logitsBuffer: Float32Array;
  tracker: CarJumpAirTimeTracker;
  cachedPadPositions: any[] | null;

  constructor() {
    this.weights = getActorWeights();
    this.obsBuffer = new Float32Array(OBS_V3_DIM);
    this.h1Buffer = new Float32Array(256);
    this.h2Buffer = new Float32Array(256);
    this.logitsBuffer = new Float32Array(15);
    this.tracker = new CarJumpAirTimeTracker();
    this.cachedPadPositions = null;
  }

  resetTracker() {
    this.tracker.reset();
  }

  _ensurePadPositions(engine) {
    if (!this.cachedPadPositions && engine && typeof engine.getPads === 'function') {
      const pads = engine.getPads();
      if (pads && pads.length >= 31) {
        this.cachedPadPositions = pads.map((p) => p.pos);
      }
    }
    return this.cachedPadPositions;
  }

  buildObsV3(engine, carIndex = 0, outObs = this.obsBuffer, teamSign = 1) {
    const cs = engine.getCarStateView(carIndex);
    const bs = engine.getBallStateView();
    const padPositions = this._ensurePadPositions(engine);
    const s = teamSign < 0 ? -1.0 : 1.0;

    const carX = cs.posX * s,
      carY = cs.posY * s,
      carZ = cs.posZ;
    const velX = cs.velX * s,
      velY = cs.velY * s,
      velZ = cs.velZ;
    const angX = cs.angVelX * s,
      angY = cs.angVelY * s,
      angZ = cs.angVelZ;

    const fwdX = cs.fwdX * s,
      fwdY = cs.fwdY * s,
      fwdZ = cs.fwdZ;
    const rightX = cs.rightX * s,
      rightY = cs.rightY * s,
      rightZ = cs.rightZ;
    const upX = cs.upX * s,
      upY = cs.upY * s,
      upZ = cs.upZ;

    outObs[0] = (carX + FIELD_X) / S_FACE;
    outObs[1] = (FIELD_X - carX) / S_FACE;
    outObs[2] = (carY + FIELD_Y) / S_FACE;
    outObs[3] = (FIELD_Y - carY) / S_FACE;
    outObs[4] = carZ / S_FACE;
    outObs[5] = (FIELD_Z - carZ) / S_FACE;

    outObs[6] = (angX * rightX + angY * rightY + angZ * rightZ) / S_CAR_ANG;
    outObs[7] = (angX * upX + angY * upY + angZ * upZ) / S_CAR_ANG;
    outObs[8] = (angX * fwdX + angY * fwdY + angZ * fwdZ) / S_CAR_ANG;

    const vFwd = velX * fwdX + velY * fwdY + velZ * fwdZ;
    const vRight = velX * rightX + velY * rightY + velZ * rightZ;
    const vUp = velX * upX + velY * upY + velZ * upZ;
    const vMag = Math.hypot(velX, velY, velZ);
    outObs[9] = vFwd / S_CAR_VEL;
    outObs[10] = vRight / S_CAR_VEL;
    outObs[11] = vUp / S_CAR_VEL;
    outObs[12] = vMag / S_CAR_VEL;

    const ballX = bs.posX * s,
      ballY = bs.posY * s,
      ballZ = bs.posZ;
    const bVelX = bs.velX * s,
      bVelY = bs.velY * s,
      bVelZ = bs.velZ;
    const bAngX = bs.angVelX * s,
      bAngY = bs.angVelY * s,
      bAngZ = bs.angVelZ;

    const relX = ballX - carX;
    const relY = ballY - carY;
    const relZ = ballZ - carZ;
    const ballDist = Math.hypot(relX, relY, relZ);

    outObs[13] = (relX * fwdX + relY * fwdY + relZ * fwdZ) / S_BALL_POS;
    outObs[14] = (relX * rightX + relY * rightY + relZ * rightZ) / S_BALL_POS;
    outObs[15] = (relX * upX + relY * upY + relZ * upZ) / S_BALL_POS;
    outObs[16] = ballDist / S_BALL_POS;

    const rvX = bVelX - velX;
    const rvY = bVelY - velY;
    const rvZ = bVelZ - velZ;
    const rvMag = Math.hypot(rvX, rvY, rvZ);

    outObs[17] = (rvX * fwdX + rvY * fwdY + rvZ * fwdZ) / S_BALL_VEL;
    outObs[18] = (rvX * rightX + rvY * rightY + rvZ * rightZ) / S_BALL_VEL;
    outObs[19] = (rvX * upX + rvY * upY + rvZ * upZ) / S_BALL_VEL;
    outObs[20] = rvMag / S_BALL_VEL;

    outObs[21] = (bAngX * rightX + bAngY * rightY + bAngZ * rightZ) / S_BALL_ANG;
    outObs[22] = (bAngX * upX + bAngY * upY + bAngZ * upZ) / S_BALL_ANG;
    outObs[23] = (bAngX * fwdX + bAngY * fwdY + bAngZ * fwdZ) / S_BALL_ANG;

    const isJumping = typeof cs.isJumping === 'boolean' ? cs.isJumping : this.tracker.isJumping;
    const airTime = typeof cs.airTime === 'number' ? cs.airTime : this.tracker.airTime;

    outObs[24] = cs.isOnGround ? 1.0 : 0.0;
    outObs[25] = cs.hasFlipOrJump ? 1.0 : 0.0;
    outObs[26] = cs.isFlipping ? 1.0 : 0.0;
    outObs[27] = isJumping ? 1.0 : 0.0;
    outObs[28] = Math.min(airTime, 2.0) / 2.0;
    outObs[29] = cs.boost / 100.0;

    const closingSpeed = ballDist > 1e-6 ? -(relX * rvX + relY * rvY + relZ * rvZ) / ballDist : 0.0;
    outObs[30] = closingSpeed / S_CLOSING;

    outObs[31] = fwdZ;
    outObs[32] = rightZ;
    outObs[33] = upZ;

    outObs[34] = (ballX + FIELD_X) / S_FACE;
    outObs[35] = (FIELD_X - ballX) / S_FACE;
    outObs[36] = (ballY + FIELD_Y) / S_FACE;
    outObs[37] = (FIELD_Y - ballY) / S_FACE;
    outObs[38] = ballZ / S_FACE;
    outObs[39] = (FIELD_Z - ballZ) / S_FACE;

    const rogX = OPP_GOAL_X - carX,
      rogY = OPP_GOAL_Y - carY,
      rogZ = OPP_GOAL_Z - carZ;
    const rwgX = OWN_GOAL_X - carX,
      rwgY = OWN_GOAL_Y - carY,
      rwgZ = OWN_GOAL_Z - carZ;
    outObs[40] = (rogX * fwdX + rogY * fwdY + rogZ * fwdZ) / S_BALL_POS;
    outObs[41] = (rogX * rightX + rogY * rightY + rogZ * rightZ) / S_BALL_POS;
    outObs[42] = (rogX * upX + rogY * upY + rogZ * upZ) / S_BALL_POS;
    outObs[43] = (rwgX * fwdX + rwgY * fwdY + rwgZ * fwdZ) / S_BALL_POS;
    outObs[44] = (rwgX * rightX + rwgY * rightY + rwgZ * rightZ) / S_BALL_POS;
    outObs[45] = (rwgX * upX + rwgY * upY + rwgZ * upZ) / S_BALL_POS;

    const padIdxList = s < 0 ? BIG_PAD_INDICES_ORANGE : BIG_PAD_INDICES;
    for (let k = 0; k < 6; k++) {
      const padIdx = padIdxList[k];
      const base = 46 + k * 4;
      const ps = engine.getBoostPadStateView(padIdx);
      const pPos = padPositions ? padPositions[padIdx] : null;
      if (pPos) {
        const rpX = pPos[0] * s - carX;
        const rpY = pPos[1] * s - carY;
        const rpZ = pPos[2] - carZ;
        outObs[base + 0] = (rpX * fwdX + rpY * fwdY + rpZ * fwdZ) / S_FACE;
        outObs[base + 1] = (rpX * rightX + rpY * rightY + rpZ * rightZ) / S_FACE;
      } else {
        outObs[base + 0] = 0.0;
        outObs[base + 1] = 0.0;
      }
      outObs[base + 2] = ps.isActive ? 1.0 : 0.0;
      outObs[base + 3] = ps.cooldown / BIG_PAD_COOLDOWN;
    }

    const b2gX = OPP_GOAL_X - ballX;
    const b2gY = OPP_GOAL_Y - ballY;
    const b2gZ = OPP_GOAL_Z - ballZ;
    const b2gDist = Math.hypot(b2gX, b2gY, b2gZ) + 1e-6;
    const b2gDirX = b2gX / b2gDist;
    const b2gDirY = b2gY / b2gDist;
    const b2gDirZ = b2gZ / b2gDist;

    const idealHitX = ballX - b2gDirX * 95.0;
    const idealHitY = ballY - b2gDirY * 95.0;
    const idealHitZ = ballZ - b2gDirZ * 95.0;

    const rtX = idealHitX - carX;
    const rtY = idealHitY - carY;
    const rtZ = idealHitZ - carZ;

    const targetFwd = (rtX * fwdX + rtY * fwdY + rtZ * fwdZ) / S_BALL_POS;
    const targetRight = (rtX * rightX + rtY * rightY + rtZ * rightZ) / S_BALL_POS;

    const kickDirFwd = b2gDirX * fwdX + b2gDirY * fwdY + b2gDirZ * fwdZ;
    const kickDirRight = b2gDirX * rightX + b2gDirY * rightY + b2gDirZ * rightZ;

    outObs[70] = 1.0;
    outObs[71] = Math.max(-2.0, Math.min(2.0, targetFwd));
    outObs[72] = Math.max(-2.0, Math.min(2.0, targetRight));
    outObs[73] = kickDirFwd;
    outObs[74] = kickDirRight;

    return outObs;
  }

  actDeterministic(obs) {
    if (!this.weights || this.weights.isFallback) {
      this.weights = getActorWeights();
    }
    const { w0, b0, w2, b2, w4, b4 } = this.weights;
    const h1 = this.h1Buffer;
    const h2 = this.h2Buffer;
    const logits = this.logitsBuffer;

    for (let i = 0; i < 256; i++) {
      let sum = b0[i];
      const rowOffset = i * 75;
      for (let j = 0; j < 75; j++) {
        sum += w0[rowOffset + j] * obs[j];
      }
      h1[i] = Math.tanh(sum);
    }

    for (let i = 0; i < 256; i++) {
      let sum = b2[i];
      const rowOffset = i * 256;
      for (let j = 0; j < 256; j++) {
        sum += w2[rowOffset + j] * h1[j];
      }
      h2[i] = Math.tanh(sum);
    }

    for (let i = 0; i < 15; i++) {
      let sum = b4[i];
      const rowOffset = i * 256;
      for (let j = 0; j < 256; j++) {
        sum += w4[rowOffset + j] * h2[j];
      }
      logits[i] = sum;
    }

    const slices = [
      [0, 3],
      [3, 6],
      [6, 9],
      [9, 11],
      [11, 13],
      [13, 15],
    ];
    const act = [0, 0, 0, 0, 0, 0];
    for (let ch = 0; ch < 6; ch++) {
      const [s, e] = slices[ch];
      let bestIdx = 0;
      let bestVal = logits[s];
      for (let k = s + 1; k < e; k++) {
        if (logits[k] > bestVal) {
          bestVal = logits[k];
          bestIdx = k - s;
        }
      }
      act[ch] = bestIdx;
    }
    return act;
  }

  precomputeTimeline(ghostEngine, spawnIndex = 0, maxSteps = 95) {
    resetEngineToKickoffSpawn(ghostEngine, spawnIndex, {
      settleTicks: KICKOFF_SETTLE_TICKS,
      recreateArena: false,
    });
    this.resetTracker();

    const steps: any[] = [];
    let touchTick = -1;
    let touchStep = -1;

    for (let step = 0; step < maxSteps; step++) {
      const obs = this.buildObsV3(ghostEngine, 0);
      const action = this.actDeterministic(obs);
      const controls = multiDiscreteToControls(action);
      const keys = multiDiscreteToOverlayKeys(action);
      const keyStr = multiDiscreteToKeyString(action);
      const startTick = step * TICKS_PER_DECISION;
      const endTick = startTick + TICKS_PER_DECISION;

      steps.push({ step, startTick, endTick, action, controls, keys, keyStr });

      ghostEngine.setControls(0, controls);
      for (let t = 0; t < TICKS_PER_DECISION; t++) {
        ghostEngine.stepSilent(1);
        const cs = ghostEngine.getCarStateView(0);
        this.tracker.stepTick(controls.jump, cs.isOnGround);

        const bs = ghostEngine.getBallStateView();
        const ballSpeed = Math.hypot(bs.velX, bs.velY, bs.velZ);
        if (ballSpeed > 1.0 && touchTick < 0) {
          touchTick = startTick + t + 1;
          touchStep = step + 1;
        }
      }

      if (touchStep > 0 && step >= touchStep + 2) {
        break;
      }
    }

    const noteBars = buildKickoffTimelineNoteBars(steps);

    resetEngineToKickoffSpawn(ghostEngine, spawnIndex, {
      settleTicks: KICKOFF_SETTLE_TICKS,
      recreateArena: false,
    });
    this.resetTracker();

    return {
      spawnIndex,
      steps,
      noteBars,
      touchTick: touchTick > 0 ? touchTick : steps.length * TICKS_PER_DECISION,
      touchStep: touchStep > 0 ? touchStep : steps.length,
    };
  }
}
