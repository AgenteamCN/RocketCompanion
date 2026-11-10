/**
 * RippleObsBuilder.ts
 * Self-contained per-agent observation builder for Ripple v1.1 (`rolv/ripple/1.1`).
 *
 * BoostPad state encoding, player timers, and the 6-step delayed action ring buffer
 * are encapsulated in `RippleHistoryAndPadTracker` (`./rippleObsHistoryAndPadEncoder.ts`).
 *
 * Matches `src/obs.py` (`RippleObs`) and `src/act.py` (`DelayedAction` + `RippleLookupAction`):
 * - 5 observation inputs:
 *   1. `main` [32]: self player features (first 30 into `main_player_processor`, index 30 is `is_flipped`)
 *   2. `others` [5 * 21]: up to 5 other players in local car frame (slot[15] == +1 mate, -1 opp, 0 empty)
 *   3. `ball` [6 * 9]: 6 ball prediction slices at 0s, 1s, 2s, 3s, 4s, 5s in local car frame
 *   4. `actions` [6 * 8]: 6-step delayed action queue (newest at index 0, oldest executed at index 5)
 *   5. `boosts` [34 * 5]: 34 boost pads in local car frame (`[rx, ry, rz, amount, timer/10]`)
 */

import { CarStateView, BallStateView } from '../../physics/RocketSimStateViews.ts';
import { resolveActiveCars } from './experimentalMultiCarObsPipeline.ts';
import type { CarControls } from './botpack9700488Actions.ts';
import {
  ensureSharedBallPrediction,
  type ActiveCarSlot,
  type BallPredictionEnginePort,
} from './botpackSharedBallPredPipeline.ts';
import {
  ACTION_QUEUE_LEN,
  NUM_BOOST_PADS,
  INVERT_SIDE_ACTIONS_8,
  matMulRot3,
  RippleHistoryAndPadTracker,
} from './rippleObsHistoryAndPadEncoder.ts';

export interface RippleObservationTensors {
  main: Float32Array;
  others: Float32Array;
  ball: Float32Array;
  actions: Float32Array;
  boosts: Float32Array;
  isKickoff: boolean;
}

const NUM_OTHER_SLOTS = 5;
const NUM_BALL_SLICES = 6; // t = 0, 1s, 2s, 3s, 4s, 5s

// Normalization constants from src/obs.py:
// NORM = [2300]*6 + [6]*3 + [1]*6 + [1, 3, 1, 1, 1, 1, 12, 24, 150, 120, 1, 1, 1, 1, 1, 1, 1]
const NORM_32 = new Float32Array([
  2300, 2300, 2300, 2300, 2300, 2300, 6, 6, 6, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 12, 24, 150, 120,
  1, 1, 1, 1, 1, 1, 1,
]);

// INVERT_TEAM = [-1, -1, 1]*5 + [-1] + [1]*16
const INVERT_TEAM_32 = new Float32Array([
  -1, -1, 1, -1, -1, 1, -1, -1, 1, -1, -1, 1, -1, -1, 1, -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1,
]);

// INVERT_SIDE = [-1, 1, 1]*2 + [1, -1, -1] + [-1, 1, 1]*2 + [1]*17
const INVERT_SIDE_32 = new Float32Array([
  -1, 1, 1, -1, 1, 1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1,
]);

// INVERT_SIDE_RELATIVE = [1, -1, 1]*2 + [-1, 1, -1] + [1, -1, 1]*2 + [1]*12 + [-1] + [1]*4
const INVERT_SIDE_RELATIVE_32 = new Float32Array([
  1, -1, 1, 1, -1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1,
  1, 1,
]);

const sBallView = new BallStateView();
const sCarViews: CarStateView[] = Array.from({ length: 8 }, () => new CarStateView());

export class RippleAgentState {
  public readonly main = new Float32Array(32);
  public readonly others = new Float32Array(NUM_OTHER_SLOTS * 21);
  public readonly ball = new Float32Array(NUM_BALL_SLICES * 9);
  public readonly historyTracker = new RippleHistoryAndPadTracker();
  private lastBallX = 0;
  private lastBallY = 0;

  get actions(): Float32Array {
    return this.historyTracker.actions;
  }

  get boosts(): Float32Array {
    return this.historyTracker.boosts;
  }

  get actionQueue(): Float32Array {
    return this.historyTracker.actionQueue;
  }

  get isQueueReset(): boolean {
    return this.historyTracker.isQueueReset;
  }

  set isQueueReset(val: boolean) {
    this.historyTracker.isQueueReset = val;
  }

  get prevExecutedAction(): Float32Array {
    return this.historyTracker.prevExecutedAction;
  }

  get prevPrevAction(): Float32Array {
    return this.historyTracker.prevPrevAction;
  }

  reset(isKickoff = true): void {
    this.historyTracker.reset(isKickoff);
  }

  /**
   * Builds the 5 observation tensors (`main`, `others`, `ball`, `actions`, `boosts`) for this car.
   */
  buildObs(
    simState: Float32Array,
    selfCarIndex: number,
    selfTeam: number,
    activeCars: ActiveCarSlot[] | null = null,
    physicsEngine: BallPredictionEnginePort | null = null
  ): RippleObservationTensors {
    const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
    const roster = resolveActiveCars(simState, activeCars ?? undefined) as ActiveCarSlot[];
    sBallView.attach(simState);

    const isKickoff =
      Math.abs(sBallView.posX) < 1.0 &&
      Math.abs(sBallView.posY) < 1.0 &&
      Math.hypot(sBallView.velX, sBallView.velY) < 5.0;

    // Detect transition into kickoff to zero the queue (`action_queue[:] = 0`)
    const wasKickoff = Math.abs(this.lastBallX) < 1.0 && Math.abs(this.lastBallY) < 1.0;
    if (isKickoff && !wasKickoff) {
      this.reset(true);
    }
    this.lastBallX = sBallView.posX;
    this.lastBallY = sBallView.posY;

    const tracker = this.historyTracker;
    tracker.updateTimers(simState, selfCarIndex, roster);
    tracker.prevPrevAction.set(tracker.prevExecutedAction);

    const selfCv = (sCarViews[selfCarIndex] || new CarStateView()).attachCar(
      simState,
      selfCarIndex
    );

    // 1. Populate self player features [32]
    const main = this.main;
    main.fill(0);
    main[0] = selfCv.posX;
    main[1] = selfCv.posY;
    main[2] = selfCv.posZ;
    main[3] = selfCv.velX;
    main[4] = selfCv.velY;
    main[5] = selfCv.velZ;
    main[6] = selfCv.angVelX;
    main[7] = selfCv.angVelY;
    main[8] = selfCv.angVelZ;
    main[9] = selfCv.fwdX;
    main[10] = selfCv.fwdY;
    main[11] = selfCv.fwdZ;
    main[12] = selfCv.upX;
    main[13] = selfCv.upY;
    main[14] = selfCv.upZ;
    main[15] = 2 * normSelfTeam - 1;
    main[16] = tracker.demoTimers[selfCarIndex];
    main[17] = selfCv.isOnGround ? 1.0 : 0.0;
    main[18] = selfCv.isOnGround ? 1.0 : 0.0;
    main[19] = selfCv.hasFlipOrJump ? 1.0 : 0.0;
    main[20] = Math.min(selfCv.boost / 100.0, 2.0);
    main[21] = tracker.boostTimes[selfCarIndex];
    main[22] = tracker.jumpTimes[selfCarIndex];
    main[23] = tracker.airTimes[selfCarIndex];
    main[24] = tracker.flipTimes[selfCarIndex];
    main[25] = tracker.handbrakes[selfCarIndex];
    main[26] = tracker.flipDirs[selfCarIndex * 2 + 0];
    main[27] = tracker.flipDirs[selfCarIndex * 2 + 1];
    main[28] = tracker.isQueueReset ? 1.0 : 0.0;
    main[29] = isKickoff ? 1.0 : 0.0;
    main[30] = 0.0; // is_flipped (set below if main[0] < 0)
    main[31] = 0.0; // is_swapped

    // 2. Populate other players [5 * 21] in local self frame
    const others = this.others;
    others.fill(0);

    // Collect other cars (up to 5; if >5, keep closest 5 to ball)
    const otherList: Array<{ carIndex: number; team: number; distSq: number; cv: CarStateView }> =
      [];
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i];
      if (entry.carIndex === selfCarIndex) continue;
      const cv = (sCarViews[entry.carIndex] || new CarStateView()).attachCar(
        simState,
        entry.carIndex
      );
      const distSq = (cv.posX - sBallView.posX) ** 2 + (cv.posY - sBallView.posY) ** 2;
      otherList.push({ carIndex: entry.carIndex, team: entry.team === 1 ? 1 : 0, distSq, cv });
    }
    if (otherList.length > NUM_OTHER_SLOTS) {
      otherList.sort((a, b) => a.distSq - b.distSq);
      otherList.length = NUM_OTHER_SLOTS;
    }

    for (let s = 0; s < otherList.length; s++) {
      const o = otherList[s];
      const ocv = o.cv;
      const base = s * 21;

      const relPos = matMulRot3(
        ocv.posX - selfCv.posX,
        ocv.posY - selfCv.posY,
        ocv.posZ - selfCv.posZ,
        selfCv
      );
      const relVel = matMulRot3(
        ocv.velX - selfCv.velX,
        ocv.velY - selfCv.velY,
        ocv.velZ - selfCv.velZ,
        selfCv
      );
      const relAng = matMulRot3(ocv.angVelX, ocv.angVelY, ocv.angVelZ, selfCv);
      const relFwd = matMulRot3(ocv.fwdX, ocv.fwdY, ocv.fwdZ, selfCv);
      const relUp = matMulRot3(ocv.upX, ocv.upY, ocv.upZ, selfCv);

      others[base + 0] = relPos[0];
      others[base + 1] = relPos[1];
      others[base + 2] = relPos[2];
      others[base + 3] = relVel[0];
      others[base + 4] = relVel[1];
      others[base + 5] = relVel[2];
      others[base + 6] = relAng[0];
      others[base + 7] = relAng[1];
      others[base + 8] = relAng[2];
      others[base + 9] = relFwd[0];
      others[base + 10] = relFwd[1];
      others[base + 11] = relFwd[2];
      others[base + 12] = relUp[0];
      others[base + 13] = relUp[1];
      others[base + 14] = relUp[2];
      others[base + 15] = 2 * o.team - 1;
      others[base + 16] = tracker.demoTimers[o.carIndex];
      others[base + 17] = ocv.isOnGround ? 1.0 : 0.0;
      others[base + 18] = ocv.isOnGround ? 1.0 : 0.0;
      others[base + 19] = ocv.hasFlipOrJump ? 1.0 : 0.0;
      others[base + 20] = Math.min(ocv.boost / 100.0, 2.0);
    }

    // 3. Populate 6 ball prediction slices (0s, 1s, 2s, 3s, 4s, 5s = ticks 0, 120, 240, 360, 480, 600)
    const predBuf = ensureSharedBallPrediction(simState, physicsEngine);
    const ball = this.ball;
    const rawAng = [sBallView.angVelX, sBallView.angVelY, sBallView.angVelZ];
    for (let step = 0; step < NUM_BALL_SLICES; step++) {
      const tickOff = step * 120 * 6;
      const bpx = predBuf[tickOff + 0];
      const bpy = predBuf[tickOff + 1];
      const bpz = predBuf[tickOff + 2];
      const bvx = predBuf[tickOff + 3];
      const bvy = predBuf[tickOff + 4];
      const bvz = predBuf[tickOff + 5];

      const relPos = matMulRot3(bpx - selfCv.posX, bpy - selfCv.posY, bpz - selfCv.posZ, selfCv);
      const relVel = matMulRot3(bvx - selfCv.velX, bvy - selfCv.velY, bvz - selfCv.velZ, selfCv);
      const relAng = matMulRot3(rawAng[0], rawAng[1], rawAng[2], selfCv);

      const dst = step * 9;
      ball[dst + 0] = relPos[0];
      ball[dst + 1] = relPos[1];
      ball[dst + 2] = relPos[2];
      ball[dst + 3] = relVel[0];
      ball[dst + 4] = relVel[1];
      ball[dst + 5] = relVel[2];
      ball[dst + 6] = relAng[0];
      ball[dst + 7] = relAng[1];
      ball[dst + 8] = relAng[2];
    }

    // 4 & 5. Populate action queue [6 * 8] and boost pads [34 * 5]
    tracker.encodeActionsAndBoostPads(selfCv);
    const actions = tracker.actions;
    const boosts = tracker.boosts;

    // 6. Orange team inversion
    if (normSelfTeam === 1) {
      for (let d = 0; d < 32; d++) {
        main[d] *= INVERT_TEAM_32[d];
      }
      for (let s = 0; s < otherList.length; s++) {
        const base = s * 21;
        for (let d = 15; d < 21; d++) {
          others[base + d] *= INVERT_TEAM_32[d];
        }
      }
      main[31] = 1.0; // is_swapped
    }

    // 7. Left-only X-side mirroring when `main[0] < 0`
    if (main[0] < 0) {
      for (let step = 0; step < NUM_BALL_SLICES; step++) {
        const dst = step * 9;
        for (let d = 0; d < 9; d++) {
          ball[dst + d] *= INVERT_SIDE_RELATIVE_32[d];
        }
      }
      for (let d = 0; d < 32; d++) {
        main[d] *= INVERT_SIDE_32[d];
      }
      for (let s = 0; s < otherList.length; s++) {
        const base = s * 21;
        for (let d = 0; d < 21; d++) {
          others[base + d] *= INVERT_SIDE_RELATIVE_32[d];
        }
      }
      for (let p = 0; p < NUM_BOOST_PADS; p++) {
        const dst = p * 5;
        boosts[dst + 0] *= INVERT_SIDE_RELATIVE_32[0];
        boosts[dst + 1] *= INVERT_SIDE_RELATIVE_32[1];
        boosts[dst + 2] *= INVERT_SIDE_RELATIVE_32[2];
      }
      for (let q = 0; q < ACTION_QUEUE_LEN; q++) {
        const dst = q * 8;
        for (let d = 0; d < 8; d++) {
          actions[dst + d] *= INVERT_SIDE_ACTIONS_8[d];
        }
      }
      main[29] *= -1.0;
      main[30] = 1.0; // is_flipped
    }

    // 8. Normalize all features by NORM_32
    for (let step = 0; step < NUM_BALL_SLICES; step++) {
      const dst = step * 9;
      for (let d = 0; d < 9; d++) {
        ball[dst + d] /= NORM_32[d];
      }
    }
    for (let d = 0; d < 32; d++) {
      main[d] /= NORM_32[d];
    }
    for (let s = 0; s < otherList.length; s++) {
      const base = s * 21;
      for (let d = 0; d < 21; d++) {
        others[base + d] /= NORM_32[d];
      }
    }
    for (let p = 0; p < NUM_BOOST_PADS; p++) {
      const dst = p * 5;
      boosts[dst + 0] /= NORM_32[0];
      boosts[dst + 1] /= NORM_32[1];
      boosts[dst + 2] /= NORM_32[2];
    }

    return {
      main,
      others,
      ball,
      actions,
      boosts,
      isKickoff,
    };
  }

  /**
   * Pushes the newly selected action index (0..275) into the 6-step delayed queue
   * and returns the action at the tail of the queue (`actionQueue[5]`) as `CarControls`.
   */
  stepDelayedActionQueue(actionIdx: number): CarControls {
    return this.historyTracker.stepDelayedActionQueue(actionIdx);
  }
}
