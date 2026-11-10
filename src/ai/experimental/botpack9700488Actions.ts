/**
 * botpack9700488Actions.ts
 * Exact action lookup tables, logit decoders, and state-dependent action masks for the 8 RLBot Botpack#9700488 models:
 *
 * 1. DefaultAction (90 actions) — used by Chronos v2.1 (with X-mirroring), Dice, Ducky, Galactus v2, Kira, Rain
 * 2. AdvancedActionOld (380 actions) — used by Fury (4 throttle, 5 steer, 5 torque subdivisions, 7 flip bins, stalls=true)
 * 3. RippleLookupAction (276 actions) — used by Ripple v1.1 ([-1, 0, 0.5, 1] throttle, 5 steer, 5 aerial, 16 dodge angles)
 */

import { NEXTO_ACTION_TABLE, decodeCarControls } from './experimentalMultiCarObsPipeline.ts';

export interface CarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

/**
 * Decodes Nexto 90-action logits into CarControls.
 */
export function decodeNextoLogits(logits: ArrayLike<number>): CarControls {
  let bestIdx = 0;
  let bestVal = logits[0];
  for (let i = 1; i < logits.length; i++) {
    const v = logits[i];
    if (!Number.isFinite(v)) continue;
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return { ...NEXTO_ACTION_TABLE[bestIdx] };
}

/**
 * Writes a CarControls object into an 8-float array [throttle, steer, pitch, yaw, roll, jump, boost, handbrake].
 */
export function writeControlsToFloat8(ctrl: Partial<CarControls>, out8: Float32Array): void {
  out8[0] = ctrl.throttle || 0;
  out8[1] = ctrl.steer || 0;
  out8[2] = ctrl.pitch || 0;
  out8[3] = ctrl.yaw || 0;
  out8[4] = ctrl.roll || 0;
  out8[5] = ctrl.jump ? 1 : 0;
  out8[6] = ctrl.boost ? 1 : 0;
  out8[7] = ctrl.handbrake ? 1 : 0;
}

/**
 * Decodes Necto 12-dim logits ([3 throttle, 3 steer, 2 jump, 2 boost, 2 handbrake]) into CarControls.
 */
export function decodeNectoLogits(logits12: ArrayLike<number>): CarControls {
  const argmaxRange = (start: number, len: number): number => {
    let best = 0;
    for (let i = 1; i < len; i++) {
      if (logits12[start + i] > logits12[start + best]) best = i;
    }
    return best;
  };
  const throttle = argmaxRange(0, 3);
  const steer = argmaxRange(3, 3);
  const jump = argmaxRange(6, 2);
  const boost = argmaxRange(8, 2);
  const handbrake = argmaxRange(10, 2);

  return decodeCarControls([
    throttle - 1,
    steer - 1,
    throttle - 1,
    (steer - 1) * (1 - handbrake) || 0,
    (steer - 1) * handbrake || 0,
    jump,
    boost,
    handbrake,
  ]);
}

export interface AttachedCarMaskView {
  readonly isDemoed: boolean;
  readonly isOnGround: boolean;
  readonly boost: number;
  readonly groundNormalZ: number;
  readonly upZ: number;
  readonly hasFlipOrJump: boolean;
}

export const DEFAULT_90_ACTIONS: ReadonlyArray<Readonly<CarControls>> = NEXTO_ACTION_TABLE;
const NUM_GROUND_90 = 24; // Indices 0..23 are ground actions, 24..89 are aerial/jump/flip actions

// Precomputed static masks matching GigaLearnCPP DefaultAction::DefaultAction()
const DEFAULT_90_GROUND_MASK = new Uint8Array(90);
const DEFAULT_90_AIR_MASK = new Uint8Array(90);
const DEFAULT_90_JUMP_MASK = new Uint8Array(90);
const DEFAULT_90_BOOST_MASK = new Uint8Array(90);

for (let i = 0; i < 90; i++) {
  const a = DEFAULT_90_ACTIONS[i];
  const isGroundIdx = i < NUM_GROUND_90;
  DEFAULT_90_GROUND_MASK[i] = isGroundIdx ? 1 : 0;
  DEFAULT_90_AIR_MASK[i] =
    (!isGroundIdx && !a.jump) ||
    (isGroundIdx && a.throttle === (a.boost ? 1 : 0) && (a.yaw !== 0) === Boolean(a.handbrake))
      ? 1
      : 0;
  DEFAULT_90_JUMP_MASK[i] = a.jump ? 1 : 0;
  DEFAULT_90_BOOST_MASK[i] = a.boost ? 1 : 0;
}

/**
 * Computes the 90-element action mask for GigaLearn/RocketForge DefaultAction::GetActionMask.
 */
export function computeDefaultAction90Mask(
  carView: AttachedCarMaskView,
  outMask: Uint8Array = new Uint8Array(90)
): Uint8Array {
  if (carView.isDemoed) {
    outMask.fill(0);
    outMask[0] = 1;
    return outMask;
  }

  // 1. Base ground vs air mask
  const baseMask = carView.isOnGround ? DEFAULT_90_GROUND_MASK : DEFAULT_90_AIR_MASK;
  outMask.set(baseMask);

  // 2. Prevent boosting if out of boost
  if (carView.boost <= 0) {
    for (let i = 0; i < 90; i++) {
      if (DEFAULT_90_BOOST_MASK[i]) {
        outMask[i] = 0;
      }
    }
  }

  // 3. Enable jump/flip actions when player has flip/jump OR is turtled on roof
  const isTurtled = carView.groundNormalZ > 0.9 || carView.upZ < -0.9;
  if (carView.hasFlipOrJump || isTurtled) {
    for (let i = 0; i < 90; i++) {
      if (DEFAULT_90_JUMP_MASK[i]) {
        outMask[i] = 1;
      }
    }
  }

  return outMask;
}

/**
 * Mirrors a CarControls object across the X axis (used by Chronos v2.1 when mirrorX is active).
 * Negates steer, yaw, and roll while preserving throttle, pitch, jump, boost, and handbrake.
 */
export function mirrorActionControlsX(c: CarControls): CarControls {
  return {
    throttle: c.throttle,
    steer: c.steer === 0 ? 0 : -c.steer,
    pitch: c.pitch,
    yaw: c.yaw === 0 ? 0 : -c.yaw,
    roll: c.roll === 0 ? 0 : -c.roll,
    jump: Boolean(c.jump),
    boost: Boolean(c.boost),
    handbrake: Boolean(c.handbrake),
  };
}

function linspace(start: number, end: number, n: number): number[] {
  if (n <= 1) return [start];
  const out = new Array<number>(n);
  const step = (end - start) / (n - 1);
  for (let i = 0; i < n; i++) {
    out[i] = start + i * step;
  }
  return out;
}

function parseBin(count: number, endpoint = true): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0.0];
  const start = -1.0;
  const end = 1.0;
  const step = (end - start) / (endpoint ? count - 1 : count);
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    out[i] = Math.fround(start + step * i);
  }
  return out;
}

/**
 * Builds Fury's exact 380-action table (`AdvancedActionOld(4, 5, 5, 7, true)` from `FuryBotpack/src/action/AdvancedActionOld.cpp`).
 */
const FURY_ACTION_META = (() => {
  const thr = parseBin(4, true);
  const str = parseBin(5, true);
  const torqueSubdivisions = 5;
  const flipBins = 7;
  const includeStalls = true;

  const actions: Array<Readonly<CarControls>> = [];

  // 1. Ground (50 actions)
  for (const t of thr) {
    for (const s of str) {
      for (const b of [0, 1]) {
        for (const h of [0, 1]) {
          if (b === 1 && t !== 1.0) continue;
          const yaw = s;
          actions.push(
            Object.freeze({
              throttle: t,
              steer: s,
              pitch: 0.0,
              yaw,
              roll: 0.0,
              jump: false,
              boost: b > 0,
              handbrake: h > 0,
            })
          );
        }
      }
    }
  }
  const numGround = actions.length; // 50

  // 2. Aerial (312 actions)
  const count = 1 + (1 << Math.floor(torqueSubdivisions / 2)); // 5
  const bins = parseBin(count, true);
  const delta = bins[1] - bins[0]; // 0.5
  const face: Array<[number, number]> = [];
  for (const x of bins) {
    for (const y of bins) {
      face.push([x, y]);
    }
  }
  if (torqueSubdivisions % 2 === 1) {
    const db: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      db.push(Math.fround(bins[i] + delta / 2.0));
    }
    for (const x of db) {
      for (const y of db) {
        face.push([x, y]);
      }
    }
  }

  const uniqueCube: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  for (const [fst, snd] of face) {
    for (let axis = 0; axis < 3; axis++) {
      for (const side of [-1.0, 1.0]) {
        const arr: [number, number, number] = [0.0, 0.0, 0.0];
        for (let d = 0; d < 3; d++) {
          arr[d] = d === axis ? side : d === 0 ? fst : snd;
        }
        const key = `${arr[0].toFixed(5)},${arr[1].toFixed(5)},${arr[2].toFixed(5)}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCube.push(arr);
        }
      }
    }
  }

  for (const pt of uniqueCube) {
    const pitch = pt[0];
    const yaw = pt[1];
    const roll = pt[2];
    if (pitch === 0.0 && roll === 0.0 && str.some((v) => Math.abs(v - yaw) < 1e-6)) {
      continue;
    }
    for (const b of [0, 1]) {
      const throttle = b;
      const steer = yaw;
      actions.push(
        Object.freeze({
          throttle,
          steer,
          pitch,
          yaw,
          roll,
          jump: false,
          boost: b > 0,
          handbrake: false,
        })
      );
    }
  }
  const numAerial = actions.length - numGround; // 312

  // 3. Flips and jumps (16 actions)
  const flips = [NaN, ...parseBin(flipBins, false)];
  for (const ang of flips) {
    let pitch = 0.0;
    let roll = 0.0;
    if (!Number.isNaN(ang)) {
      pitch = Math.fround(Math.sin(ang));
      roll = Math.fround(Math.cos(ang));
      const mag = Math.max(Math.abs(pitch), Math.abs(roll));
      pitch = Math.fround(pitch / mag);
      roll = Math.fround(roll / mag);
    }
    for (const b of [0, 1]) {
      const throttle = b;
      actions.push(
        Object.freeze({
          throttle,
          steer: 0.0,
          pitch,
          yaw: 0.0,
          roll,
          jump: true,
          boost: b > 0,
          handbrake: true,
        })
      );
    }
  }
  const numJumpAndDodge = actions.length - numGround - numAerial; // 16

  // 4. Stalls (2 actions)
  if (includeStalls) {
    actions.push(
      Object.freeze({
        throttle: 0.0,
        steer: 0.0,
        pitch: 0.0,
        yaw: 1.0,
        roll: -1.0,
        jump: true,
        boost: false,
        handbrake: true,
      })
    );
    actions.push(
      Object.freeze({
        throttle: 0.0,
        steer: 0.0,
        pitch: 0.0,
        yaw: -1.0,
        roll: 1.0,
        jump: true,
        boost: false,
        handbrake: true,
      })
    );
  }

  return Object.freeze({
    actions: Object.freeze(actions),
    numGround,
    numAerial,
    numJumpAndDodge,
  });
})();

export const FURY_380_ACTIONS: ReadonlyArray<Readonly<CarControls>> = FURY_ACTION_META.actions;

/**
 * Computes the 380-element action mask for Fury (`AdvancedActionOld` inherits `ActionParser::GetActionMask` which returns all 1s).
 */
export function computeFuryAction380Mask(
  _carView: AttachedCarMaskView,
  outMask: Uint8Array = new Uint8Array(380)
): Uint8Array {
  outMask.fill(1);
  return outMask;
}

/**
 * Builds Ripple v1.1's 276-action lookup table (`RippleLookupAction([-1, 0, 0.5, 1], 5, 5, 16)`).
 */
export const RIPPLE_276_ACTIONS: ReadonlyArray<Readonly<CarControls>> = (() => {
  const throttles = [-1.0, 0.0, 0.5, 1.0];
  const steers = linspace(-1.0, 1.0, 5);
  const torqueBins = linspace(-1.0, 1.0, 5);
  const flipBins = 16;

  const round3 = (v: number): number => {
    const r = Math.round(v * 1000) / 1000;
    return r === 0 ? 0 : r;
  };

  const actions: Array<Readonly<CarControls>> = [];

  // 1. Ground (60)
  for (const throttle of throttles) {
    for (const steer of steers) {
      for (const boost of [0, 1]) {
        for (const handbrake of [0, 1]) {
          if (boost === 1 && throttle !== 1.0) continue;
          const yaw = steer;
          actions.push(
            Object.freeze(
              decodeCarControls([
                round3(throttle),
                round3(steer),
                0,
                round3(yaw),
                0,
                0,
                boost,
                handbrake,
              ])
            )
          );
        }
      }
    }
  }

  // 2. Aerial (182)
  for (const pitch of torqueBins) {
    for (const yaw of torqueBins) {
      for (const roll of torqueBins) {
        if (pitch === 0 && roll === 0) continue;
        const mag = Math.max(Math.abs(pitch), Math.abs(yaw), Math.abs(roll));
        if (mag < 1.0) continue;
        for (const boost of [0, 1]) {
          const throttle = boost;
          const steer = yaw;
          actions.push(
            Object.freeze(
              decodeCarControls([
                round3(throttle),
                round3(steer),
                round3(pitch),
                round3(yaw),
                round3(roll),
                0,
                boost,
                0,
              ])
            )
          );
        }
      }
    }
  }

  // 3. Flips & Jumps (34: 1 empty jump + 16 angles x 2 boost, with jump=1, handbrake=1)
  for (let i = -1; i < flipBins; i++) {
    let pitch = 0.0;
    let roll = 0.0;
    if (i >= 0) {
      const angle = (2.0 * Math.PI * i) / flipBins;
      pitch = Math.sin(angle);
      roll = Math.cos(angle);
      const mag = Math.max(Math.abs(pitch), Math.abs(roll));
      pitch /= mag;
      roll /= mag;
    }
    for (const boost of [0, 1]) {
      const throttle = boost;
      actions.push(
        Object.freeze(
          decodeCarControls([round3(throttle), 0, round3(pitch), 0, round3(roll), 1, boost, 1])
        )
      );
    }
  }

  return Object.freeze(actions);
})();
