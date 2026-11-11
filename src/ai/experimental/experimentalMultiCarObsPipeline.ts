/**
 * experimentalMultiCarObsPipeline.ts
 * Dynamic multi-car observation builders for Nexto and Necto EARL Perceiver policies.
 *
 * Supports arbitrary numbers of active cars (1v1, 2v2, 3v3, asymmetric teams, or all-bot matches)
 * by constructing variable-length entity sequences:
 *   N_entities = P (Active Cars) + 1 (Ball) + 34 (Standard Boost Pads)
 */

import { ArenaHeaderView, CarStateView, BallStateView } from '../../physics/RocketSimStateViews.ts';

const sHeaderView = new ArenaHeaderView();
const sBallView = new BallStateView();
const sCarViews = Array.from({ length: 8 }, () => new CarStateView());

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

export interface ActiveCarEntry {
  carIndex: number;
  team: number;
}

/**
 * Default neutral car controls schema.
 */
export const DEFAULT_CAR_CONTROLS: CarControls = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

/**
 * Encodes a controls object into an 8-float array for RocketSim CarControls.
 * [throttle, steer, pitch, yaw, roll, jump, boost, handbrake]
 */
export function encodeCarControls(c: Partial<CarControls>): number[] {
  return [
    c.throttle || 0,
    c.steer || 0,
    c.pitch || 0,
    c.yaw || 0,
    c.roll || 0,
    +(c.jump || false),
    +(c.boost || false),
    +(c.handbrake || false),
  ];
}

/**
 * Decodes an 8-float array into a semantic CarControls object.
 */
export function decodeCarControls(a: ArrayLike<number>): CarControls {
  return {
    throttle: a[0],
    steer: a[1],
    pitch: a[2],
    yaw: a[3],
    roll: a[4],
    jump: a[5] > 0,
    boost: a[6] > 0,
    handbrake: a[7] > 0,
  };
}

/**
 * Precomputed 90-action lookup table for Nexto discrete policy logits.
 */
export const NEXTO_ACTION_TABLE: ReadonlyArray<Readonly<CarControls>> = (() => {
  const actions: CarControls[] = [];
  for (const throttle of [-1, 0, 1]) {
    for (const steer of [-1, 0, 1]) {
      for (const boost of [0, 1]) {
        for (const handbrake of [0, 1]) {
          if (boost === 1 && throttle !== 1) continue;
          actions.push(
            decodeCarControls([throttle || boost, steer, 0, steer, 0, 0, boost, handbrake])
          );
        }
      }
    }
  }
  for (const pitch of [-1, 0, 1]) {
    for (const yaw of [-1, 0, 1]) {
      for (const roll of [-1, 0, 1]) {
        for (const jump of [0, 1]) {
          for (const boost of [0, 1]) {
            if ((jump === 1 && yaw !== 0) || (pitch === 0 && roll === 0 && jump === 0)) continue;
            const handbrake = jump === 1 && (pitch !== 0 || yaw !== 0 || roll !== 0);
            actions.push(
              decodeCarControls([boost, yaw, pitch, yaw, roll, jump, boost, +handbrake])
            );
          }
        }
      }
    }
  }
  return actions.map((a) => Object.freeze(a));
})();

export interface BoostPadDescriptor {
  pos: ArrayLike<number>;
  isBig?: boolean | number;
}

export interface DynamicPerceiverObs {
  query: Float32Array;
  entities: Float32Array;
  numEntities: number;
}

/**
 * Scripted kickoff behavior for Nexto (fast speed-flip kickoff, symmetric for left/right spawns).
 */
export function getNextoKickoffControls(
  simState: Float32Array,
  kickoffTick: number,
  carIndex = 1,
  team = 1
): CarControls | null {
  sBallView.attach(simState);
  if (kickoffTick < 0 || kickoffTick >= 168 || sBallView.posY !== 0) {
    return null;
  }
  const cv = (sCarViews[carIndex] || new CarStateView()).attachCar(simState, carIndex);
  const normX = team === 0 ? cv.posX : -cv.posX;
  const sign = normX < -10 ? -1 : 1;

  if (kickoffTick < 44) return { ...DEFAULT_CAR_CONTROLS, throttle: 1, boost: true };
  if (kickoffTick < 60)
    return { ...DEFAULT_CAR_CONTROLS, throttle: 1, boost: true, steer: -1 * sign };
  if (kickoffTick < 68) return { ...DEFAULT_CAR_CONTROLS, throttle: 1, boost: true, jump: true };
  if (kickoffTick < 72) return { ...DEFAULT_CAR_CONTROLS, throttle: 1, boost: true };
  if (kickoffTick < 76) {
    return {
      ...DEFAULT_CAR_CONTROLS,
      throttle: 1,
      boost: true,
      jump: true,
      yaw: 0.8 * sign,
      pitch: -0.7,
    };
  }
  if (kickoffTick < 128) return { ...DEFAULT_CAR_CONTROLS, throttle: 1, boost: true, pitch: 1 };
  return { ...DEFAULT_CAR_CONTROLS, throttle: 1, roll: 1 * sign, pitch: 0.5 };
}

/**
 * Normalizes activeCars list or derives it from simState if not explicitly passed.
 */
export function resolveActiveCars(
  simState: Float32Array,
  activeCars?: ActiveCarEntry[] | null
): ActiveCarEntry[] {
  if (Array.isArray(activeCars) && activeCars.length > 0) {
    return activeCars.map((c) => ({
      carIndex: c.carIndex,
      team: c.team === 1 ? 1 : c.team === 0 ? 0 : c.carIndex % 2,
    }));
  }
  sHeaderView.attach(simState);
  const count = Math.max(1, Math.min(8, sHeaderView.numCars || 2));
  const list: ActiveCarEntry[] = [];
  for (let i = 0; i < count; i++) {
    list.push({ carIndex: i, team: i % 2 });
  }
  return list;
}
