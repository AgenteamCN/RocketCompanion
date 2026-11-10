/**
 * RLRCSlotJumpAndDodgePulseSynthesizer.ts
 * 120Hz timeline state-machine for jump hold, double-jump pulse, dodge impulse,
 * flip expiry window, and boolean track debouncing per car slot.
 */

import { type RLRCFrame120Hz } from '../RLRCReplayTypes.ts';
import {
  BOOST_ACCEL_AIR_UU,
  distVec3,
  GRAVITY_Z_UU,
  type FrameKinematicsSample,
} from './RLRCCarKinematicsMathPipeline.ts';

const JUMP_MIN_HOLD = 3;
const JUMP_MAX_HOLD = 24;
const DJ_PULSE_FRAMES = 18;
const DODGE_MAX_FRAMES = 78;
const DODGE_MIN_FRAMES = 18;
const SECOND_JUMP_BTN_FRAMES = 6;
const FLIP_EXPIRY_SEC = 1.25;

export interface SlotJumpAndDodgeTracks120Hz {
  readonly jmpTrk: boolean[];
  readonly djTrk: boolean[];
  readonly dgTrk: boolean[];
  readonly jmpBtn: boolean[];
  readonly flipTrk: boolean[];
  readonly airTrk: number[];
}

export function debounceControlFlagTrack(
  flags: boolean[],
  act: readonly boolean[],
  explicitPulse: readonly boolean[],
  maxGap = 2,
  minRun = 1
): void {
  const n = flags.length;
  for (let i = 1; i + 1 < n; i++) {
    if (!act[i]) continue;
    if (!flags[i] && flags[i - 1] && flags[i + 1]) {
      flags[i] = true;
    } else if (
      maxGap >= 2 &&
      i + 2 < n &&
      !flags[i] &&
      !flags[i + 1] &&
      flags[i - 1] &&
      flags[i + 2] &&
      act[i + 1]
    ) {
      flags[i] = true;
      flags[i + 1] = true;
    }
  }
  if (minRun <= 1) {
    for (let i = 1; i + 1 < n; i++) {
      if (flags[i] && !flags[i - 1] && !flags[i + 1] && !explicitPulse[i]) {
        flags[i] = false;
      }
    }
    return;
  }
  let f = 0;
  while (f < n) {
    if (!flags[f]) {
      f++;
      continue;
    }
    let end = f;
    let hasExplicit = false;
    while (end < n && flags[end]) {
      if (explicitPulse[end]) hasExplicit = true;
      end++;
    }
    if (!hasExplicit && end - f < minRun) {
      for (let k = f; k < end; k++) {
        flags[k] = false;
      }
    }
    f = end;
  }
}

export function synthesizeSlotJumpAndDodgePulses120Hz(
  frames: readonly RLRCFrame120Hz[],
  slot: number,
  kins: readonly (FrameKinematicsSample | null)[],
  boostTrk: boolean[],
  repBoost: readonly boolean[],
  dt: number
): SlotJumpAndDodgeTracks120Hz {
  const n = frames.length;
  const jmpTrk = new Array<boolean>(n).fill(false);
  const djTrk = new Array<boolean>(n).fill(false);
  const dgTrk = new Array<boolean>(n).fill(false);
  const jmpBtn = new Array<boolean>(n).fill(false);
  const flipTrk = new Array<boolean>(n).fill(false);
  const airTrk = new Array<number>(n).fill(0);

  let hasReplicatedAirComponents = false;
  for (let f = 0; f < n; f++) {
    const af = frames[f].cars[slot]?.activeFlags;
    if (af && (af.dodgeActive || af.doubleJumpActive)) {
      hasReplicatedAirComponents = true;
      break;
    }
  }

  let gndStreak = 0;
  let jL = false;
  let djL = false;
  let dgL = false;
  let jRem = 0;
  let jTot = 0;
  let djRem = 0;
  let dgRem = 0;
  let dgElap = 0;
  let b2Rem = 0;
  let used2 = false;
  let airF = 0;
  let jmpGnd = false;

  for (let f = 0; f < n; f++) {
    const cur = frames[f].cars[slot];
    const kin = kins[f];
    if (!cur || !cur.entityActive || !kin) {
      gndStreak = 0;
      jL = false;
      djL = false;
      dgL = false;
      jRem = 0;
      jTot = 0;
      djRem = 0;
      dgRem = 0;
      dgElap = 0;
      b2Rem = 0;
      used2 = false;
      jmpGnd = false;
      airF = 0;
      continue;
    }
    if (kin.teleported || frames[f].roundCountdownNumber > 0) {
      jRem = 0;
      jTot = 0;
      djRem = 0;
      dgRem = 0;
      dgElap = 0;
      b2Rem = 0;
      used2 = false;
      jmpGnd = false;
      airF = 0;
    }

    const rf = cur.activeFlags;
    if (!rf.jumpActive) jL = false;
    if (!rf.doubleJumpActive) djL = false;
    if (!rf.dodgeActive) dgL = false;

    const jRise = rf.jumpActive && !jL;
    const djRise = rf.doubleJumpActive && !djL;
    const dgRise = rf.dodgeActive && !dgL;
    const prv = f > 0 ? frames[f - 1].cars[slot] : null;
    const wasGnd = Boolean(prv?.entityActive && prv.isOnGround);

    if (cur.isOnGround && !rf.dodgeActive && !rf.doubleJumpActive) {
      gndStreak = rf.jumpActive ? gndStreak + 1 : 0;
      djRem = 0;
      dgRem = 0;
      dgElap = 0;
      b2Rem = 0;
      used2 = false;
      jmpGnd = false;
      airF = 0;

      let lifts = false;
      for (let k = 1; k <= 6 && f + k < n; k++) {
        const fc = frames[f + k].cars[slot];
        const fk = kins[f + k];
        if (!fc?.entityActive || !fk || fk.teleported) break;
        if (!fc.isOnGround && (fk.localUpVel > 95 || fk.nonGravityUpAccel > 420)) {
          lifts = true;
          break;
        }
      }
      if (jRise && lifts && kin.basis.up.z > 0.25) {
        jL = true;
        jRem = JUMP_MAX_HOLD;
        jTot = 1;
        jmpGnd = true;
        jmpTrk[f] = true;
        jmpBtn[f] = true;
      } else if (jRem > 0 && jTot <= 3 && lifts) {
        jRem--;
        jTot++;
        jmpTrk[f] = true;
        jmpBtn[f] = true;
      } else {
        jRem = 0;
        jTot = 0;
        if (gndStreak > 6 && rf.jumpActive) jL = true;
      }
      flipTrk[f] = true;
      airTrk[f] = 0;
      continue;
    }

    airF++;
    const airSec = airF * dt;
    if (wasGnd && jTot === 0) {
      let pkUp = kin.localUpVel;
      for (let k = 1; k <= 6 && f + k < n; k++) {
        const fk = kins[f + k];
        const fc = frames[f + k].cars[slot];
        if (!fc?.entityActive || !fk || fk.teleported || fc.isOnGround) break;
        if (fk.localUpVel > pkUp) pkUp = fk.localUpVel;
      }
      if (
        (rf.jumpActive && gndStreak <= 6) ||
        (kin.basis.up.z > 0.25 &&
          pkUp > 125 &&
          (kin.localUpVel > 90 || kin.nonGravityUpAccel > 450))
      ) {
        jL = rf.jumpActive;
        jRem = JUMP_MAX_HOLD;
        jTot = 0;
        jmpGnd = true;
      }
    } else if (jRise && airF <= 8 && jTot === 0 && !used2) {
      jL = true;
      jRem = Math.max(JUMP_MIN_HOLD, JUMP_MAX_HOLD - airF);
      jTot = 0;
      jmpGnd = true;
    }

    const ball = frames[f].ball;
    const nearBall =
      ball.entityActive && distVec3(cur.rigidBody.position, ball.rigidBody.position) < 205;
    const inWin = !jmpGnd || airSec <= FLIP_EXPIRY_SEC + Math.min(0.2, jTot * dt) + 0.05;

    let trigDg = false;
    let trigDj = false;
    if (dgRise && (dgRem === 0 || dgElap >= 6)) {
      trigDg = true;
      dgL = true;
      if (dgRem > 0 && f > 0) dgTrk[f - 1] = false;
    } else if (djRise && (djRem === 0 || airF >= 1)) {
      trigDj = true;
      djL = true;
      if (djRem > 0 && f > 0) djTrk[f - 1] = false;
    } else if (
      !hasReplicatedAirComponents &&
      airF >= 4 &&
      dgRem === 0 &&
      djRem === 0 &&
      !used2 &&
      inWin &&
      !nearBall
    ) {
      let pkOmg = kin.flipOmegaMag;
      let sumOmg = 0;
      let cnt = 0;
      for (let k = 1; k <= 8 && f + k < n; k++) {
        const fc = frames[f + k].cars[slot];
        const fk = kins[f + k];
        if (!fc?.entityActive || !fk || fk.teleported || fc.isOnGround) break;
        if (fk.flipOmegaMag > pkOmg) pkOmg = fk.flipOmegaMag;
        sumOmg += fk.flipOmegaMag;
        cnt++;
      }
      const meanOmg = cnt > 0 ? sumOmg / cnt : kin.flipOmegaMag;
      const prvVz = prv?.entityActive ? prv.rigidBody.linearVelocity.z : 0;
      const vzDamp =
        Math.abs(prvVz) > 130 &&
        Math.abs(cur.rigidBody.linearVelocity.z) < Math.abs(prvVz) * 0.82;

      if (
        kin.angAccelMag > 18.0 &&
        pkOmg >= 3.7 &&
        meanOmg >= 2.6 &&
        (kin.planarAccelMag > 1350 || vzDamp || kin.angAccelMag > 26.0)
      ) {
        trigDg = true;
        dgL = rf.dodgeActive;
      } else if (airF >= 5 && jRem <= 16) {
        const bstUp = boostTrk[f] ? BOOST_ACCEL_AIR_UU * Math.max(0, kin.basis.forward.z) : 0;
        const netUp = kin.nonGravityUpAccel - bstUp;
        const fP = Math.max(0, f - 1);
        const fN = Math.min(n - 1, f + 3);
        const kP = kins[fP];
        const kN = kins[fN];
        const spSec = Math.max(dt, (fN - fP) * dt);
        const upGain =
          kP && kN
            ? kN.localUpVel - kP.localUpVel - (GRAVITY_Z_UU * kin.basis.up.z + bstUp) * spSec
            : 0;
        if (netUp > 1050 && upGain > 155 && pkOmg < 3.4) {
          trigDj = true;
          djL = rf.doubleJumpActive;
        }
      }
    }

    if (trigDg) {
      if (jTot === 0 && f >= 2 && frames[f - 2].cars[slot]?.entityActive && !jmpTrk[f - 2]) {
        jmpTrk[f - 2] = true;
        jmpBtn[f - 2] = true;
      }
      jRem = 0;
      djRem = 0;
      dgRem = DODGE_MAX_FRAMES;
      dgElap = 0;
      b2Rem = SECOND_JUMP_BTN_FRAMES;
      used2 = true;
      if (f > 0) jmpBtn[f - 1] = false;
    } else if (trigDj) {
      if (jTot === 0 && f >= 2 && frames[f - 2].cars[slot]?.entityActive && !jmpTrk[f - 2]) {
        jmpTrk[f - 2] = true;
        jmpBtn[f - 2] = true;
      }
      jRem = 0;
      dgRem = 0;
      djRem = DJ_PULSE_FRAMES;
      b2Rem = SECOND_JUMP_BTN_FRAMES;
      used2 = true;
      if (f > 0) jmpBtn[f - 1] = false;
    }

    if (dgRem > 0) {
      dgElap++;
      dgRem--;
      dgTrk[f] = true;
      if (!repBoost[f]) boostTrk[f] = false;
      if (
        (dgElap >= DODGE_MIN_FRAMES && !rf.dodgeActive && kin.flipOmegaMag < 1.8) ||
        (dgElap >= 30 && !rf.dodgeActive)
      ) {
        dgRem = 0;
      }
    } else if (djRem > 0) {
      djRem--;
      djTrk[f] = true;
    } else if (jRem > 0) {
      jTot++;
      jRem--;
      const netUpHold =
        kin.nonGravityUpAccel -
        (boostTrk[f] ? BOOST_ACCEL_AIR_UU * Math.max(0, kin.basis.forward.z) : 0);
      if (jTot <= JUMP_MIN_HOLD || (rf.jumpActive && gndStreak <= 6) || netUpHold > 450) {
        jmpTrk[f] = true;
        jmpBtn[f] = true;
      } else {
        jRem = 0;
      }
    }

    if (b2Rem > 0) {
      b2Rem--;
      jmpBtn[f] = true;
    }
    airTrk[f] = Math.min(FLIP_EXPIRY_SEC, airSec);
    flipTrk[f] = !used2 && inWin;
  }

  return { jmpTrk, djTrk, dgTrk, jmpBtn, flipTrk, airTrk };
}
