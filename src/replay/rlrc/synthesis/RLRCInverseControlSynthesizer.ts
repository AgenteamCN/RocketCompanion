/**
 * RLRCInverseControlSynthesizer.ts
 * 120Hz timeline slot state-machine and in-place inverse control synthesizer for RLRC replays.
 */

import {
  RLRC_FIXED_DT,
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCCarComponentActiveFlags,
  type RLRCFrame120Hz,
  type RLRCSynthesizedCarControls,
} from '../RLRCReplayTypes.ts';
import {
  clampUnit,
  computeFrameKinematics,
  NEUTRAL_ACTIVE_FLAGS,
  NEUTRAL_SYNTHESIZED_CONTROLS,
  type FrameKinematicsSample,
  type RLRCLocalCarBasis,
} from './RLRCCarKinematicsMathPipeline.ts';
import {
  inferBoostStateFromKinematics,
  inferHandbrakeFromKinematics,
  synthesizeCarControlsBetweenFrames,
  type RLRCControlSynthesisOptions,
} from './RLRCInverseControlKinematicsPipeline.ts';
import {
  debounceControlFlagTrack,
  synthesizeSlotJumpAndDodgePulses120Hz,
} from './RLRCSlotJumpAndDodgePulseSynthesizer.ts';

export type { RLRCControlSynthesisOptions, RLRCLocalCarBasis };

function synthesizeSlotTimeline120Hz(
  frames: readonly RLRCFrame120Hz[],
  slot: number,
  options?: RLRCControlSynthesisOptions
) {
  const n = frames.length;
  const dt = Math.max(1e-4, options?.dtSeconds ?? RLRC_FIXED_DT);
  const radius: 0 | 1 | 2 = options?.smoothWindowRadius ?? 1;
  const allowZeroDrainBoost = options?.allowZeroDrainKinematicBoost ?? false;

  const act = new Array<boolean>(n).fill(false);
  const kins = new Array<FrameKinematicsSample | null>(n).fill(null);
  const baseCtrl = new Array<RLRCSynthesizedCarControls>(n).fill(NEUTRAL_SYNTHESIZED_CONTROLS);
  const boostTrk = new Array<boolean>(n).fill(false);
  const repBoost = new Array<boolean>(n).fill(false);
  const hbTrk = new Array<boolean>(n).fill(false);
  const repHb = new Array<boolean>(n).fill(false);

  let sinceLand = 999;
  for (let f = 0; f < n; f++) {
    const cur = frames[f].cars[slot];
    if (!cur || !cur.entityActive) {
      sinceLand = 999;
      continue;
    }
    const prv = f > 0 ? frames[f - 1].cars[slot] : null;
    const nxt = f + 1 < n ? frames[f + 1].cars[slot] : null;
    act[f] = true;

    const kin = computeFrameKinematics(prv, cur, nxt, dt);
    kins[f] = kin;
    if (kin.teleported) {
      sinceLand = 999;
    } else if (cur.isOnGround) {
      sinceLand = prv?.entityActive && !prv.isOnGround ? 0 : sinceLand + 1;
    } else {
      sinceLand = 999;
    }

    const synthesizedControls = synthesizeCarControlsBetweenFrames(prv, cur, nxt, options);
    baseCtrl[f] = synthesizedControls;

    const f0 = Math.max(0, f - 2);
    const f1 = Math.min(n - 1, f + 2);
    const c0 = frames[f0].cars[slot];
    const c1 = frames[f1].cars[slot];
    const drainRate =
      c0?.entityActive && c1?.entityActive && f1 > f0
        ? (c0.boostAmount - c1.boostAmount) / ((f1 - f0) * dt)
        : 0;
    const hasWindowDrain =
      drainRate >= 8.5 && drainRate <= 120.0 && c0.boostAmount - c1.boostAmount <= 12.0;
    const hasExplicitOrDrain =
      Boolean(cur.activeFlags.boostActive && cur.boostAmount > 0.05) || hasWindowDrain;

    let boostOn =
      hasWindowDrain || inferBoostStateFromKinematics(prv, cur, nxt, kin, dt, allowZeroDrainBoost);

    if (boostOn && cur.activeFlags.boostActive && cur.boostAmount < 99.5) {
      const lo = Math.max(0, f - 18);
      const hi = Math.min(n - 1, f + 18);
      const cLo = frames[lo].cars[slot];
      const cHi = frames[hi].cars[slot];
      if (
        hi - lo >= 24 &&
        cLo?.entityActive &&
        cHi?.entityActive &&
        Math.abs(cLo.boostAmount - cHi.boostAmount) < 0.05 &&
        kin.nonGravityForwardAccel < 220
      ) {
        boostOn = false;
      }
    }
    boostTrk[f] = boostOn;
    repBoost[f] = hasExplicitOrDrain;
    hbTrk[f] = inferHandbrakeFromKinematics(prv, cur, kin, synthesizedControls.roll, sinceLand);
    repHb[f] = Boolean(cur.controls.handbrake);
  }

  debounceControlFlagTrack(boostTrk, act, repBoost, 2, 5);
  debounceControlFlagTrack(hbTrk, act, repHb, 2, 2);

  const jumpTracks = synthesizeSlotJumpAndDodgePulses120Hz(
    frames,
    slot,
    kins,
    boostTrk,
    repBoost,
    dt
  );

  debounceControlFlagTrack(boostTrk, act, repBoost, 2, 5);
  let latchPitch = 0;
  let latchYaw = 0;
  let latchRoll = 0;
  for (let f = 0; f < n; f++) {
    if (!act[f]) {
      latchPitch = 0;
      latchYaw = 0;
      latchRoll = 0;
      continue;
    }
    const c = baseCtrl[f];
    const srcCtrl = frames[f].cars[slot].controls;
    if (Math.abs(srcCtrl.pitch) + Math.abs(srcCtrl.yaw) + Math.abs(srcCtrl.roll) >= 0.1) {
      latchPitch = srcCtrl.pitch;
      latchYaw = srcCtrl.yaw;
      latchRoll = srcCtrl.roll;
    } else if (!jumpTracks.dgTrk[f]) {
      latchPitch = 0;
      latchYaw = 0;
      latchRoll = 0;
    }
    let pitch = c.pitch;
    let yaw = c.yaw;
    let roll = c.roll;
    if (jumpTracks.dgTrk[f]) {
      if (Math.abs(latchPitch) + Math.abs(latchYaw) + Math.abs(latchRoll) >= 0.1) {
        const mag = Math.abs(latchPitch) + Math.abs(latchYaw) + Math.abs(latchRoll);
        const scale = mag < 0.55 ? 0.55 / mag : 1.0;
        pitch = clampUnit(latchPitch * scale);
        yaw = clampUnit(latchYaw * scale);
        roll = clampUnit(latchRoll * scale);
      } else if (Math.abs(pitch) + Math.abs(yaw) + Math.abs(roll) < 0.5) {
        const kin = kins[f];
        if (kin && Math.hypot(kin.omegaPitch, kin.omegaYaw, kin.omegaRoll) > 0.2) {
          const domPitch = clampUnit(-kin.omegaPitch / 4.0);
          const domRoll = clampUnit(-kin.omegaRoll / 4.0);
          const domYaw = clampUnit(kin.omegaYaw / 4.0);
          const mag = Math.abs(domPitch) + Math.abs(domYaw) + Math.abs(domRoll);
          const scale = mag > 1e-3 && mag < 0.55 ? 0.55 / mag : 1.0;
          pitch = clampUnit(domPitch * scale);
          yaw = clampUnit(domYaw * scale);
          roll = clampUnit(domRoll * scale);
        } else {
          pitch = -1;
        }
      }
    }
    baseCtrl[f] = {
      throttle: c.throttle,
      steer: c.steer,
      pitch,
      yaw,
      roll,
      jump: jumpTracks.jmpBtn[f],
      boost: boostTrk[f],
      handbrake: hbTrk[f],
    };
  }

  const controls = smoothControlsWindow(baseCtrl, act, jumpTracks.dgTrk, radius);
  const activeFlags: RLRCCarComponentActiveFlags[] = new Array(n);
  for (let f = 0; f < n; f++) {
    activeFlags[f] = !act[f]
      ? NEUTRAL_ACTIVE_FLAGS
      : {
          boostActive: boostTrk[f],
          jumpActive: jumpTracks.jmpTrk[f],
          doubleJumpActive: jumpTracks.djTrk[f],
          dodgeActive: jumpTracks.dgTrk[f],
        };
  }
  return {
    controls,
    activeFlags,
    hasFlipOrJump: jumpTracks.flipTrk,
    airTimeSinceJump: jumpTracks.airTrk,
  };
}

function smoothControlsWindow(
  raw: readonly RLRCSynthesizedCarControls[],
  act: readonly boolean[],
  dgTrk: readonly boolean[],
  radius: 0 | 1 | 2
): RLRCSynthesizedCarControls[] {
  if (radius === 0 || raw.length <= 2) return [...raw];
  const n = raw.length;
  const out: RLRCSynthesizedCarControls[] = new Array(n);

  for (let i = 0; i < n; i++) {
    if (!act[i]) {
      out[i] = NEUTRAL_SYNTHESIZED_CONTROLS;
      continue;
    }
    if (dgTrk[i]) {
      out[i] = raw[i];
      continue;
    }
    let sT = 0;
    let sS = 0;
    let sP = 0;
    let sY = 0;
    let sR = 0;
    let wSum = 0;
    for (let d = -radius; d <= radius; d++) {
      const idx = i + d;
      if (idx < 0 || idx >= n || !act[idx]) continue;
      const w = radius + 1 - Math.abs(d);
      const c = raw[idx];
      sT += c.throttle * w;
      sS += c.steer * w;
      sP += c.pitch * w;
      sY += c.yaw * w;
      sR += c.roll * w;
      wSum += w;
    }
    const b = raw[i];
    out[i] =
      wSum <= 0
        ? b
        : {
            throttle: clampUnit(sT / wSum),
            steer: clampUnit(sS / wSum),
            pitch: clampUnit(sP / wSum),
            yaw: clampUnit(sY / wSum),
            roll: clampUnit(sR / wSum),
            jump: b.jump,
            boost: b.boost,
            handbrake: b.handbrake,
          };
  }
  return out;
}

interface MutableCarFrameState120Hz {
  readonly slotIndex: number;
  readonly entityActive: boolean;
  hasFlipOrJump: boolean;
  airTimeSinceJump: number;
  activeFlags: RLRCCarComponentActiveFlags;
  controls: RLRCSynthesizedCarControls;
}

export function synthesizeControlsForTimeline120Hz(
  frames: readonly RLRCFrame120Hz[],
  options?: RLRCControlSynthesisOptions
): RLRCFrame120Hz[] {
  if (!frames.length) return [];
  const mutableFrames = frames as RLRCFrame120Hz[];
  const n = mutableFrames.length;

  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    const tl = synthesizeSlotTimeline120Hz(mutableFrames, slot, options);
    for (let f = 0; f < n; f++) {
      const cars = mutableFrames[f].cars;
      const rawCar =
        cars[slot]?.slotIndex === slot ? cars[slot] : cars.find((c) => c.slotIndex === slot);
      if (!rawCar) continue;
      const car = rawCar as MutableCarFrameState120Hz;
      if (!car.entityActive) {
        car.activeFlags = NEUTRAL_ACTIVE_FLAGS;
        car.controls = NEUTRAL_SYNTHESIZED_CONTROLS;
      } else {
        car.hasFlipOrJump = tl.hasFlipOrJump[f];
        car.airTimeSinceJump = tl.airTimeSinceJump[f];
        car.activeFlags = tl.activeFlags[f];
        car.controls = tl.controls[f];
      }
    }
  }

  return mutableFrames;
}
