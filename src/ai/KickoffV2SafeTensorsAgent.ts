/**
 * KickoffV2SafeTensorsAgent.ts
 * Clean-room SafeTensors inference agent for RLRL101 (commit a9a52e7) `ko_v1_best.pt`
 * (42D -> 128 -> 128 -> 15 Tanh MLP, Action Repeat 4).
 *
 * Exact observation layout matching RLRL101/core/obs.py and action mask matching RLRL101/core/policy_net.py:
 * - [0..5]   (6): A.face_dists / 5120.0 ([tx + 4096, 4096 - tx, ty + 5120, 5120 - ty, tz, 2000 - tz] / 5120.0)
 * - [6..8]   (3): B.car_ang_b / 5.5 ([dot(ang, right), dot(ang, up), dot(ang, fwd)] / 5.5)
 * - [9..12]  (4): C.car_vel_b / 2300.0 ([dot(vel, fwd), dot(vel, right), dot(vel, up), |vel|] / 2300.0)
 * - [13..19] (7): D.ball_rel_b ([dir_fwd, dir_right, dir_up, b_fwd / 5000, b_right / 5000, b_up / 5000, ball_dist / 5000])
 * - [20..25] (6): E.flags ([on_ground, has_flip_or_jump, is_flipping, is_jumping, min(air_time, 2.0) / 2.0, boost / 100.0])
 * - [26]     (1): F.closing (dot(rel, vel) / ball_dist / 2300.0)
 * - [27..32] (6): G.prev_act ([thr_or_pitch, steer_or_yaw, roll, jump, boost, slide])
 * - [33..35] (3): H.car_orient ([fwd_z, right_z, up_z])
 * - [36..41] (6): I.opp_rel_b (Note: actor_mlp.0.weight columns 36..41 are 0.0000 in RLRL101 a9a52e7; model is Blind)
 *
 * Key Channel & Keyboard Properties:
 * 1. No forced keyboard W override (`force_w` is omitted; the policy naturally outputs W when boosting on ground).
 * 2. `prevActionVec[0]` (`obs[27]`) follows `throttle` when `isOnGround` and `-pitch` when airborne
 *    (`cs.isOnGround ? ctrl.throttle : -ctrl.pitch`).
 * 3. Supports two channel modes for verification & kickoff training:
 *    - `'keyboard_coupled'` (default): Unseparated standard keyboard output (`multiDiscreteToControls`),
 *      where `W/S` sets `throttle = thrVal` and `pitch = -thrVal`. Produces 100% deterministic 257.80f
 *      average (`232, 232, 262, 262, 301`) with 0.00e+0 difference vs keyboard replay.
 *    - `'ground_air_separated'`: Separates `throttle` (ground only) and `pitch` (air only) in the
 *      emitted CarControls (`265.20f` average due to omitted airborne throttle acceleration).
 */

import { DEFAULT_CAR_CONTROLS } from './experimental/experimentalMultiCarObsPipeline.ts';
import {
  getCachedSafeTensors,
  loadExperimentalPolicySafeTensors,
} from './experimental/SafeTensorsLoader.ts';
import {
  TICKS_PER_DECISION,
  resetEngineToKickoffSpawn,
  multiDiscreteToControls,
  controlsToMultiDiscrete,
  multiDiscreteToOverlayKeys,
  multiDiscreteToKeyString,
  buildKickoffTimelineNoteBars,
  type KickoffTimelineNoteBar,
} from './kickoffEpisodePrimitives.ts';

import type { CarControls } from './experimental/experimentalMultiCarObsPipeline.ts';
import type { ParsedSafeTensorsModel } from './experimental/SafeTensorsLoader.ts';

export type { KickoffTimelineNoteBar };
export const KICKOFF_V1_SETTLE_TICKS = 60;

export interface KickoffTimelineStep {
  step: number;
  startTick: number;
  endTick: number;
  action: number[];
  controls: CarControls;
  keys: Record<string, boolean>;
  keyStr: string;
}

export interface KickoffPrecomputedTimeline {
  spawnIndex: number;
  steps: KickoffTimelineStep[];
  noteBars: KickoffTimelineNoteBar[];
  touchTick: number;
  touchStep: number;
}

export function preloadKickoffV1BestWeights(): Promise<ParsedSafeTensorsModel | null> {
  return loadExperimentalPolicySafeTensors('ko_v2');
}

export function formatDiscreteActionKeys(
  act?: ArrayLike<number> | null,
  ctrl?: Partial<CarControls> | null
): string {
  const resolved = act && act.length >= 5 ? act : ctrl ? controlsToMultiDiscrete(ctrl) : null;
  if (!resolved) return 'Coast';
  const keys: string[] = [];
  if (resolved[0] === 2) keys.push('W');
  else if (resolved[0] === 0) keys.push('S');
  if (resolved[1] === 0) keys.push('A');
  else if (resolved[1] === 2) keys.push('D');
  if (resolved[2] === 0) keys.push('Q');
  else if (resolved[2] === 2) keys.push('E');
  if (resolved[3] === 1) keys.push('Jump');
  if (resolved[4] === 1) keys.push('Boost');
  if (resolved[5] === 1) keys.push('Drift');
  return keys.length > 0 ? keys.join('+') : 'Coast';
}

export class KickoffV2SafeTensorsAgent {
  obs: Float32Array;
  prevActionVec: Float32Array;
  h1: Float32Array;
  h2: Float32Array;
  logits: Float32Array;
  act: number[];
  channelMode: string;

  constructor(options: { channelMode?: string } = {}) {
    this.obs = new Float32Array(42);
    this.prevActionVec = new Float32Array(6);
    this.h1 = new Float32Array(128);
    this.h2 = new Float32Array(128);
    this.logits = new Float32Array(15);
    this.act = [1, 1, 1, 0, 0, 0];
    this.channelMode = options.channelMode || 'keyboard_coupled';
  }

  reset() {
    this.prevActionVec.fill(0);
    this.act = [1, 1, 1, 0, 0, 0];
  }

  buildObs42(sim, carIndex = 0, isOrange = false) {
    const cs = sim.getCarStateView(carIndex);
    const bs = sim.getBallStateView();
    const o = this.obs;

    const fx = cs.fwdX;
    const fy = cs.fwdY;
    const fz = cs.fwdZ;
    const rx = cs.rightX;
    const ry = cs.rightY;
    const rz = cs.rightZ;
    const ux = cs.upX;
    const uy = cs.upY;
    const uz = cs.upZ;

    const px = cs.posX;
    const py = cs.posY;
    const pz = cs.posZ;
    const vx = cs.velX;
    const vy = cs.velY;
    const vz = cs.velZ;
    const wx = cs.angVelX;
    const wy = cs.angVelY;
    const wz = cs.angVelZ;

    const teamSign = isOrange ? -1.0 : 1.0;
    const tx = teamSign * px;
    const ty = teamSign * py;
    const tz = pz;

    // A.face_dists [0..5] (6)
    o[0] = (tx + 4096.0) / 5120.0;
    o[1] = (4096.0 - tx) / 5120.0;
    o[2] = (ty + 5120.0) / 5120.0;
    o[3] = (5120.0 - ty) / 5120.0;
    o[4] = tz / 5120.0;
    o[5] = (2000.0 - tz) / 5120.0;

    // B.car_ang_b [6..8] (3)
    o[6] = (wx * rx + wy * ry + wz * rz) / 5.5;
    o[7] = (wx * ux + wy * uy + wz * uz) / 5.5;
    o[8] = (wx * fx + wy * fy + wz * fz) / 5.5;

    // C.car_vel_b [9..12] (4)
    o[9] = (vx * fx + vy * fy + vz * fz) / 2300.0;
    o[10] = (vx * rx + vy * ry + vz * rz) / 2300.0;
    o[11] = (vx * ux + vy * uy + vz * uz) / 2300.0;
    o[12] = Math.hypot(vx, vy, vz) / 2300.0;

    // D.ball_rel_b [13..19] (7)
    const relx = bs.posX - px;
    const rely = bs.posY - py;
    const relz = bs.posZ - pz;
    const bFwd = relx * fx + rely * fy + relz * fz;
    const bRight = relx * rx + rely * ry + relz * rz;
    const bUp = relx * ux + rely * uy + relz * uz;
    const ballDist = Math.hypot(relx, rely, relz);
    const invDist = 1.0 / Math.max(ballDist, 1e-6);
    o[13] = bFwd * invDist;
    o[14] = bRight * invDist;
    o[15] = bUp * invDist;
    o[16] = bFwd / 5000.0;
    o[17] = bRight / 5000.0;
    o[18] = bUp / 5000.0;
    o[19] = ballDist / 5000.0;

    // E.flags [20..25] (6)
    o[20] = cs.isOnGround ? 1.0 : 0.0;
    o[21] = cs.hasFlipOrJump ? 1.0 : 0.0;
    o[22] = cs.isFlipping ? 1.0 : 0.0;
    o[23] = cs.isJumping ? 1.0 : 0.0;
    o[24] = Math.min(cs.airTime || 0.0, 2.0) / 2.0;
    o[25] = cs.boost / 100.0;

    // F.closing [26] (1)
    const closingSpeed = ballDist > 1e-6 ? (relx * vx + rely * vy + relz * vz) * invDist : 0.0;
    o[26] = closingSpeed / 2300.0;

    // G.prev_act [27..32] (6)
    o[27] = this.prevActionVec[0];
    o[28] = this.prevActionVec[1];
    o[29] = this.prevActionVec[2];
    o[30] = this.prevActionVec[3];
    o[31] = this.prevActionVec[4];
    o[32] = this.prevActionVec[5];

    // H.car_orient [33..35] (3)
    o[33] = fz;
    o[34] = rz;
    o[35] = uz;

    // I.opp_rel_b [36..41] (6)
    const oppPosX = -px;
    const oppPosY = -py;
    const oppPosZ = pz;
    const oppVelX = -vx;
    const oppVelY = -vy;
    const oppVelZ = vz;
    const oppx = oppPosX - px;
    const oppy = oppPosY - py;
    const oppz = oppPosZ - pz;
    const oppFwd = oppx * fx + oppy * fy + oppz * fz;
    const oppRight = oppx * rx + oppy * ry + oppz * rz;
    const oppUp = oppx * ux + oppy * uy + oppz * uz;
    const oppDist = Math.hypot(oppx, oppy, oppz);
    const oppVfwd = oppVelX * fx + oppVelY * fy + oppVelZ * fz;
    const otbx = bs.posX - oppPosX;
    const otby = bs.posY - oppPosY;
    const otbz = bs.posZ - oppPosZ;
    const otbDist = Math.hypot(otbx, otby, otbz);
    const oppClosing =
      otbDist > 1e-6 ? (otbx * oppVelX + otby * oppVelY + otbz * oppVelZ) / otbDist : 0.0;
    o[36] = oppFwd / 5000.0;
    o[37] = oppRight / 5000.0;
    o[38] = oppUp / 5000.0;
    o[39] = oppDist / 5000.0;
    o[40] = oppVfwd / 2300.0;
    o[41] = oppClosing / 2300.0;

    return o;
  }

  actDeterministic(sim, carIndex = 0, isOrange = false) {
    const parsed = getCachedSafeTensors('ko_v2');
    if (!parsed || !parsed.tensors) {
      return { ...DEFAULT_CAR_CONTROLS };
    }
    const t = parsed.tensors;
    const w0 = (t['actor_mlp.0.weight'] || t['actor.0.weight'])?.data;
    const b0 = (t['actor_mlp.0.bias'] || t['actor.0.bias'])?.data;
    const w2 = (t['actor_mlp.2.weight'] || t['actor.2.weight'])?.data;
    const b2 = (t['actor_mlp.2.bias'] || t['actor.2.bias'])?.data;
    const w4 = (t['actor_mlp.4.weight'] || t['actor.4.weight'])?.data;
    const b4 = (t['actor_mlp.4.bias'] || t['actor.4.bias'])?.data;
    if (!w0 || !b0 || !w2 || !b2 || !w4 || !b4) {
      return { ...DEFAULT_CAR_CONTROLS };
    }

    const obs = this.buildObs42(sim, carIndex, isOrange);

    for (let i = 0; i < 128; i++) {
      let s = b0[i];
      const off = i * 42;
      for (let j = 0; j < 42; j++) s += w0[off + j] * obs[j];
      this.h1[i] = Math.tanh(s);
    }
    for (let i = 0; i < 128; i++) {
      let s = b2[i];
      const off = i * 128;
      for (let j = 0; j < 128; j++) s += w2[off + j] * this.h1[j];
      this.h2[i] = Math.tanh(s);
    }
    for (let i = 0; i < 15; i++) {
      let s = b4[i];
      const off = i * 128;
      for (let j = 0; j < 128; j++) s += w4[off + j] * this.h2[j];
      this.logits[i] = s;
    }

    // Apply physical action masks (`_compute_action_masks` in RLRL101/core/policy_net.py)
    // Note: No forced keyboard W override (`force_w` omitted; policy naturally outputs W on ground).
    const onGround = obs[20] > 0.5;
    const hasFlipOrJump = obs[21] > 0.5;
    const isFlipping = obs[22] > 0.5;
    const isJumping = obs[23] > 0.5;
    const hasNitro = obs[25] > 1e-4;
    const prevJump = obs[30] > 0.5;
    const cz = obs[4] * 5120.0;
    const bUp = obs[18] * 5000.0;
    const dirFwd = obs[13];
    const NEG = -1e9;

    if (!hasNitro || (isFlipping && dirFwd < 0.25)) {
      this.logits[12] = NEG;
    }
    if (onGround) {
      this.logits[6] = NEG;
      this.logits[8] = NEG;
      if (isJumping && prevJump && cz > 34.0 && bUp < 95.0) {
        this.logits[10] = NEG;
      }
    } else {
      this.logits[14] = NEG;
      if (
        (!hasFlipOrJump && !isJumping) ||
        (!isJumping && prevJump) ||
        (isJumping && prevJump && cz > 34.0 && bUp < 95.0)
      ) {
        this.logits[10] = NEG;
      }
    }

    const argmaxRange = (start, end) => {
      let bi = 0;
      let bv = this.logits[start];
      for (let k = start + 1; k < end; k++) {
        if (this.logits[k] > bv) {
          bv = this.logits[k];
          bi = k - start;
        }
      }
      return bi;
    };

    this.act[0] = argmaxRange(0, 3);
    this.act[1] = argmaxRange(3, 6);
    this.act[2] = argmaxRange(6, 9);
    this.act[3] = argmaxRange(9, 11);
    this.act[4] = argmaxRange(11, 13);
    this.act[5] = argmaxRange(13, 15);

    return multiDiscreteToControls(this.act);
  }

  sanitizeAndRecordTickControls(sim, carIndex, rawCtrl) {
    const cs = sim.getCarStateView(carIndex);
    const bs = sim.getBallStateView();
    const ctrl = { ...rawCtrl };

    if (!cs.isOnGround) {
      ctrl.handbrake = false;
      if (this.channelMode === 'ground_air_separated') {
        ctrl.throttle = 0;
      }
    }

    if (cs.isFlipping && ctrl.boost) {
      const dx = bs.posX - cs.posX;
      const dy = bs.posY - cs.posY;
      const dz = bs.posZ - cs.posZ;
      const dist = Math.hypot(dx, dy, dz) + 1e-6;
      const align = (dx * cs.fwdX + dy * cs.fwdY + dz * cs.fwdZ) / dist;
      if (align < 0.25) {
        ctrl.boost = false;
      }
    }

    // Follow throttle when on ground, follow -pitch when airborne
    this.prevActionVec[0] = cs.isOnGround ? rawCtrl.throttle : -rawCtrl.pitch;
    this.prevActionVec[1] = cs.isOnGround ? rawCtrl.steer : rawCtrl.yaw;
    this.prevActionVec[2] = cs.isOnGround ? 0.0 : ctrl.roll;
    this.prevActionVec[3] = ctrl.jump ? 1.0 : 0.0;
    this.prevActionVec[4] = ctrl.boost ? 1.0 : 0.0;
    this.prevActionVec[5] = cs.isOnGround && ctrl.handbrake ? 1.0 : 0.0;

    return ctrl;
  }

  resetTracker() {
    this.reset();
  }

  precomputeTimeline(ghostEngine, spawnIndex = 0, maxSteps = 95) {
    resetEngineToKickoffSpawn(ghostEngine, spawnIndex, {
      settleTicks: KICKOFF_V1_SETTLE_TICKS,
      recreateArena: false,
    });
    this.reset();

    const steps: KickoffTimelineStep[] = [];
    let touchTick = -1;
    let touchStep = -1;

    for (let step = 0; step < maxSteps; step++) {
      const rawCtrl = this.actDeterministic(ghostEngine, 0, false);
      const action = [...this.act];
      const controls = { ...rawCtrl };
      const keys = multiDiscreteToOverlayKeys(action);
      const keyStr = multiDiscreteToKeyString(action);
      const startTick = step * TICKS_PER_DECISION;
      const endTick = startTick + TICKS_PER_DECISION;

      steps.push({ step, startTick, endTick, action, controls, keys, keyStr });

      for (let t = 0; t < TICKS_PER_DECISION; t++) {
        const tickCtrl = this.sanitizeAndRecordTickControls(ghostEngine, 0, rawCtrl);
        ghostEngine.setControls(0, tickCtrl);
        ghostEngine.stepSilent(1);

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
      settleTicks: KICKOFF_V1_SETTLE_TICKS,
      recreateArena: false,
    });
    this.reset();

    return {
      spawnIndex,
      steps,
      noteBars,
      touchTick: touchTick > 0 ? touchTick : steps.length * TICKS_PER_DECISION,
      touchStep: touchStep > 0 ? touchStep : steps.length,
    };
  }
}

export function classifyBallOutcome(ballX, ballY, ballVx, ballVy) {
  if (ballY >= 5100) return 'ORANGE GOAL (+Y)';
  if (ballY <= -5100) return 'BLUE GOAL (-Y)';
  const speed = Math.hypot(ballVx, ballVy);
  if (speed < 40 && Math.abs(ballY) < 80) {
    if (Math.abs(ballX) > 150) {
      return ballX > 0 ? 'Side Pinch (+X)' : 'Side Pinch (-X)';
    }
    return 'Dead-Ball Neutral (0,0)';
  }
  if (ballVy > 180 || ballY > 120) {
    return 'Toward Orange (+Y)';
  }
  if (ballVy < -180 || ballY < -120) {
    return 'Toward Blue (-Y)';
  }
  if (Math.abs(ballVx) > 200) {
    return ballVx > 0 ? 'Lateral Right (+X)' : 'Lateral Left (-X)';
  }
  return 'Midfield Neutral';
}
