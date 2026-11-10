/**
 * rippleObsHistoryAndPadEncoder.ts
 * BoostPad state encoding, player/pad/demo timer tracking, and 6-step delayed
 * action ring buffer for Ripple v1.1 (`rolv/ripple/1.1`).
 */

import { CarStateView, BoostPadStateView } from '../../physics/RocketSimStateViews.ts';
import {
  DEFAULT_CAR_CONTROLS,
  encodeCarControls,
  decodeCarControls,
} from './experimentalMultiCarObsPipeline.ts';
import { RIPPLE_276_ACTIONS, type CarControls } from './botpack9700488Actions.ts';
import { CANONICAL_BOOST_LOCATIONS, CANONICAL_TO_WASM_PAD_INDEX } from './botpack9700488Specs.ts';
import type { ActiveCarSlot } from './botpackSharedBallPredPipeline.ts';

export const TICK_SKIP = 4;
export const TICKS_PER_SECOND = 120;
export const ACTION_QUEUE_LEN = 6;
export const NUM_BOOST_PADS = 34;

export const INVERT_SIDE_ACTIONS_8 = new Float32Array([1, -1, 1, -1, -1, 1, 1, 1]);

const sPadView = new BoostPadStateView();
const sCarViews: CarStateView[] = Array.from({ length: 8 }, () => new CarStateView());

/**
 * Multiplies a 3D world vector `[vx, vy, vz]` by the car's rotation matrix `[fwd, right, up]`:
 *   `[vx*fwdX + vy*fwdY + vz*fwdZ, vx*rightX + vy*rightY + vz*rightZ, vx*upX + vy*upY + vz*upZ]`
 */
export function matMulRot3(
  vx: number,
  vy: number,
  vz: number,
  cv: CarStateView
): [number, number, number] {
  return [
    vx * cv.fwdX + vy * cv.fwdY + vz * cv.fwdZ,
    vx * cv.rightX + vy * cv.rightY + vz * cv.rightZ,
    vx * cv.upX + vy * cv.upY + vz * cv.upZ,
  ];
}

/**
 * Encapsulates the 6-step delayed action ring buffer, BoostPad state encoder,
 * and per-car action/demo/boost/jump/flip timers for Ripple v1.1.
 */
export class RippleHistoryAndPadTracker {
  public readonly actions = new Float32Array(ACTION_QUEUE_LEN * 8);
  public readonly boosts = new Float32Array(NUM_BOOST_PADS * 5);

  // 6-step action queue [6, 8], newest action at row 0, oldest at row 5
  public readonly actionQueue = new Float32Array(ACTION_QUEUE_LEN * 8);
  public isQueueReset = true;
  public readonly prevExecutedAction = new Float32Array(8);
  public readonly prevPrevAction = new Float32Array(8);

  // Per-car timers tracked across steps
  public readonly demoTimers = new Float32Array(8);
  public readonly boostTimers = new Float32Array(NUM_BOOST_PADS);
  public readonly boostTimes = new Float32Array(8);
  public readonly prevOnGrounds = new Uint8Array(8);
  public readonly isJumpings = new Uint8Array(8);
  public readonly hasJumpeds = new Uint8Array(8);
  public readonly jumpTimes = new Float32Array(8);
  public readonly airTimes = new Float32Array(8);
  public readonly hasDoubleJumpeds = new Uint8Array(8);
  public readonly hasFlippeds = new Uint8Array(8);
  public readonly flipTimes = new Float32Array(8);
  public readonly flipDirs = new Float32Array(8 * 2);
  public readonly handbrakes = new Float32Array(8);

  reset(isKickoff = true): void {
    this.actionQueue.fill(0);
    // On kickoff, Ripple starts with 6 zero actions in queue (`action_queue[:] = 0`).
    // Mid-play resets set `isQueueReset = true` so the first chosen action fills all 6 slots.
    this.isQueueReset = !isKickoff;
    this.prevExecutedAction.fill(0);
    this.prevPrevAction.fill(0);

    this.demoTimers.fill(0);
    this.boostTimers.fill(0);
    this.boostTimes.fill(0);
    this.prevOnGrounds.fill(1);
    this.isJumpings.fill(0);
    this.hasJumpeds.fill(0);
    this.jumpTimes.fill(0);
    this.airTimes.fill(0);
    this.hasDoubleJumpeds.fill(0);
    this.hasFlippeds.fill(0);
    this.flipTimes.fill(0);
    this.flipDirs.fill(0);
    this.handbrakes.fill(0);
  }

  /**
   * Updates boost pad timers, demo timers, and self player timers for one 4-tick step.
   */
  updateTimers(simState: Float32Array, selfCarIndex: number, roster: ActiveCarSlot[]): void {
    const dtSec = TICK_SKIP / TICKS_PER_SECOND;

    // 1. Boost pad timers
    for (let p = 0; p < NUM_BOOST_PADS; p++) {
      sPadView.attach(simState, CANONICAL_TO_WASM_PAD_INDEX[p]);
      if (sPadView.isActive) {
        this.boostTimers[p] = 0.0;
      } else {
        const cooldown = sPadView.cooldown;
        if (cooldown > 0) {
          this.boostTimers[p] = Math.min(10.0, cooldown);
        } else {
          let t = this.boostTimers[p] - dtSec;
          if (t <= 0) {
            t = CANONICAL_BOOST_LOCATIONS[p][2] > 72.0 ? 10.0 : 4.0;
          }
          this.boostTimers[p] = Math.max(0.0, Math.min(10.0, t));
        }
      }
    }

    // 2. Demo timers for all cars in roster
    for (let i = 0; i < roster.length; i++) {
      const cIdx = roster[i].carIndex;
      const cv = (sCarViews[cIdx] || new CarStateView()).attachCar(simState, cIdx);
      if (cv.isDemoed) {
        const rem = cv.demoRespawnTimer;
        if (rem > 0) {
          this.demoTimers[cIdx] = rem;
        } else if (this.demoTimers[cIdx] <= 0) {
          this.demoTimers[cIdx] = 3.0;
        } else {
          this.demoTimers[cIdx] = Math.max(0.0, this.demoTimers[cIdx] - dtSec);
        }
      } else {
        this.demoTimers[cIdx] = 0.0;
      }
    }

    // 3. Self player action-driven timers (exact match to RippleObs.update_player_timers)
    const cIdx = selfCarIndex;
    const cv = (sCarViews[cIdx] || new CarStateView()).attachCar(simState, cIdx);
    const onGround = cv.isOnGround;
    const lastActOff = (ACTION_QUEUE_LEN - 1) * 8;
    const lastPitch = this.isQueueReset ? 0 : this.actionQueue[lastActOff + 2];
    const lastYaw = this.isQueueReset ? 0 : this.actionQueue[lastActOff + 3];
    const lastRoll = this.isQueueReset ? 0 : this.actionQueue[lastActOff + 4];
    const lastJump = this.isQueueReset ? 0 : this.actionQueue[lastActOff + 5];
    const lastBoost = this.isQueueReset ? 0 : this.actionQueue[lastActOff + 6];
    const lastHandbrake = this.isQueueReset ? 0 : this.actionQueue[lastActOff + 7];
    const prevJump = this.prevPrevAction[5];

    // Boost time (0..12 ticks)
    if (!lastBoost && this.boostTimes[cIdx] === 12.0) {
      this.boostTimes[cIdx] = 0.0;
    } else if (this.boostTimes[cIdx] !== 0.0 || lastBoost) {
      this.boostTimes[cIdx] = Math.min(12.0, this.boostTimes[cIdx] + TICK_SKIP);
    } else {
      this.boostTimes[cIdx] = 0.0;
    }

    // Jump time (0..24 ticks)
    if (this.prevOnGrounds[cIdx] && !this.isJumpings[cIdx]) {
      this.hasJumpeds[cIdx] = 0;
    }
    if (this.isJumpings[cIdx]) {
      this.isJumpings[cIdx] =
        this.jumpTimes[cIdx] < 3.0 || (lastJump > 0 && this.jumpTimes[cIdx] < 24.0) ? 1 : 0;
    } else if (lastJump > 0 && !(prevJump > 0) && this.prevOnGrounds[cIdx]) {
      this.isJumpings[cIdx] = 1;
      this.jumpTimes[cIdx] = 0.0;
    }

    if (this.isJumpings[cIdx]) {
      this.hasJumpeds[cIdx] = 1;
      this.jumpTimes[cIdx] = Math.min(24.0, this.jumpTimes[cIdx] + TICK_SKIP);
    } else {
      this.jumpTimes[cIdx] = 0.0;
    }

    // Air time (0..150 ticks) and flip time (0..120 ticks)
    if (onGround) {
      this.hasDoubleJumpeds[cIdx] = 0;
      this.hasFlippeds[cIdx] = 0;
      this.airTimes[cIdx] = 0.0;
      this.flipTimes[cIdx] = 0.0;
      this.flipDirs[cIdx * 2 + 0] = 0.0;
      this.flipDirs[cIdx * 2 + 1] = 0.0;
    } else {
      if (this.hasJumpeds[cIdx] && !this.isJumpings[cIdx]) {
        this.airTimes[cIdx] = Math.min(150.0, this.airTimes[cIdx] + TICK_SKIP);
      } else {
        this.airTimes[cIdx] = 0.0;
      }

      if (
        this.hasJumpeds[cIdx] &&
        lastJump > 0 &&
        !(prevJump > 0) &&
        this.airTimes[cIdx] < 150.0 &&
        !this.hasDoubleJumpeds[cIdx] &&
        !this.hasFlippeds[cIdx]
      ) {
        const mag = Math.abs(lastPitch) + Math.abs(lastYaw) + Math.abs(lastRoll);
        if (mag >= 0.5) {
          this.flipTimes[cIdx] = 0.0;
          this.hasFlippeds[cIdx] = 1;
          let fx = -lastPitch;
          let fy = lastYaw + lastRoll;
          const flen = Math.hypot(fx, fy);
          if (flen > 1e-6) {
            fx /= flen;
            fy /= flen;
          }
          this.flipDirs[cIdx * 2 + 0] = fx;
          this.flipDirs[cIdx * 2 + 1] = fy;
        } else {
          this.hasDoubleJumpeds[cIdx] = 1;
        }
      }
    }

    if (this.hasFlippeds[cIdx]) {
      this.flipTimes[cIdx] = Math.min(120.0, this.flipTimes[cIdx] + TICK_SKIP);
    }

    // Handbrake (0..1)
    if (lastHandbrake > 0) {
      this.handbrakes[cIdx] = Math.min(1.0, this.handbrakes[cIdx] + 5.0 * dtSec);
    } else {
      this.handbrakes[cIdx] = Math.max(0.0, this.handbrakes[cIdx] - 2.0 * dtSec);
    }

    this.prevOnGrounds[cIdx] = onGround ? 1 : 0;
  }

  /**
   * Encodes the 6-step action queue (`[6 * 8]`) and 34 boost pads (`[34 * 5]`) in local car frame.
   */
  encodeActionsAndBoostPads(selfCv: CarStateView): void {
    if (this.isQueueReset) {
      this.actions.fill(0);
    } else {
      this.actions.set(this.actionQueue);
    }

    const boosts = this.boosts;
    for (let p = 0; p < NUM_BOOST_PADS; p++) {
      const loc = CANONICAL_BOOST_LOCATIONS[p];
      const relPos = matMulRot3(
        loc[0] - selfCv.posX,
        loc[1] - selfCv.posY,
        loc[2] - selfCv.posZ,
        selfCv
      );
      const dst = p * 5;
      boosts[dst + 0] = relPos[0];
      boosts[dst + 1] = relPos[1];
      boosts[dst + 2] = relPos[2];
      boosts[dst + 3] = loc[2] > 72.0 ? 1.0 : 0.12;
      boosts[dst + 4] = this.boostTimers[p] / 10.0;
    }
  }

  /**
   * Pushes the newly selected action index (0..275) into the 6-step delayed queue
   * and returns the action at the tail of the queue (`actionQueue[5]`) as `CarControls`.
   * Matches `DelayedAction.parse_actions` in `src/act.py`.
   */
  stepDelayedActionQueue(actionIdx: number): CarControls {
    const newControls = RIPPLE_276_ACTIONS[actionIdx] || DEFAULT_CAR_CONTROLS;
    const newArr = encodeCarControls(newControls);

    if (this.isQueueReset) {
      for (let q = 0; q < ACTION_QUEUE_LEN; q++) {
        this.actionQueue.set(newArr, q * 8);
      }
      this.isQueueReset = false;
    }

    // Extract oldest action at index 5 before shifting
    const tailOff = (ACTION_QUEUE_LEN - 1) * 8;
    for (let d = 0; d < 8; d++) {
      this.prevExecutedAction[d] = this.actionQueue[tailOff + d];
    }

    // Shift queue down: actionQueue[1..5] = actionQueue[0..4]
    for (let q = ACTION_QUEUE_LEN - 1; q >= 1; q--) {
      const dst = q * 8;
      const src = (q - 1) * 8;
      for (let d = 0; d < 8; d++) {
        this.actionQueue[dst + d] = this.actionQueue[src + d];
      }
    }

    // Insert newest action at index 0
    for (let d = 0; d < 8; d++) {
      this.actionQueue[d] = newArr[d];
    }

    return decodeCarControls(this.prevExecutedAction);
  }
}
