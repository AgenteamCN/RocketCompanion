/**
 * experimentalMultiCarObsPipeline.ts
 * Dynamic multi-car observation builders for Nexto and Necto EARL Perceiver policies.
 *
 * Supports arbitrary numbers of active cars (1v1, 2v2, 3v3, asymmetric teams, or all-bot matches)
 * by constructing variable-length entity sequences:
 *   N_entities = P (Active Cars) + 1 (Ball) + 34 (Standard Boost Pads)
 */

import {
  ArenaHeaderView,
  CarStateView,
  BallStateView,
  BoostPadStateView,
} from '../../physics/RocketSimStateViews.ts';

const ENTITY_DIMS = 24;
const NUM_BOOST_PADS = 34;
const DEFAULT_TICK_SKIP = 8;

const sHeaderView = new ArenaHeaderView();
const sBallView = new BallStateView();
const sPadView = new BoostPadStateView();
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

function buildOrderedRoster(
  simState: Float32Array,
  selfCarIndex: number,
  normSelfTeam: number,
  activeCars: ActiveCarEntry[] | null
): ActiveCarEntry[] {
  const roster = resolveActiveCars(simState, activeCars);
  const ordered: ActiveCarEntry[] = [{ carIndex: selfCarIndex, team: normSelfTeam }];
  for (let i = 0; i < roster.length; i++) {
    if (roster[i].carIndex !== selfCarIndex) {
      ordered.push(roster[i]);
    }
  }
  return ordered;
}

function writeCarEntityBase(
  entities: Float64Array,
  eOff: number,
  carView: CarStateView,
  isSelf: boolean,
  isMate: boolean
): void {
  entities[eOff + 0] = isSelf ? 1 : 0;
  entities[eOff + 1] = isMate ? 1 : 0;
  entities[eOff + 2] = isMate ? 0 : 1;
  entities[eOff + 5] = carView.posX;
  entities[eOff + 6] = carView.posY;
  entities[eOff + 7] = carView.posZ;
  entities[eOff + 8] = carView.velX;
  entities[eOff + 9] = carView.velY;
  entities[eOff + 10] = carView.velZ;
  entities[eOff + 11] = carView.fwdX;
  entities[eOff + 12] = carView.fwdY;
  entities[eOff + 13] = carView.fwdZ;
  entities[eOff + 14] = carView.upX;
  entities[eOff + 15] = carView.upY;
  entities[eOff + 16] = carView.upZ;
  entities[eOff + 17] = carView.angVelX;
  entities[eOff + 18] = carView.angVelY;
  entities[eOff + 19] = carView.angVelZ;
  entities[eOff + 20] = carView.boost / 100;
  entities[eOff + 22] = carView.isOnGround ? 1 : 0;
  entities[eOff + 23] = carView.hasFlipOrJump ? 1 : 0;
}

function writeBallEntity(entities: Float64Array, bOff: number, simState: Float32Array): void {
  sBallView.attach(simState);
  entities[bOff + 3] = 1; // IS_BALL
  entities[bOff + 5] = sBallView.posX;
  entities[bOff + 6] = sBallView.posY;
  entities[bOff + 7] = sBallView.posZ;
  entities[bOff + 8] = sBallView.velX;
  entities[bOff + 9] = sBallView.velY;
  entities[bOff + 10] = sBallView.velZ;
  entities[bOff + 17] = sBallView.angVelX;
  entities[bOff + 18] = sBallView.angVelY;
  entities[bOff + 19] = sBallView.angVelZ;
}

function normalizeAndReflectEntities(
  entities: Float64Array,
  numEntities: number,
  normSelfTeam: number
): void {
  for (let u = 0; u < numEntities; u++) {
    const p = u * ENTITY_DIMS;
    for (let v = 5; v < 20; v++) {
      if (normSelfTeam === 1 && (v - 5) % 3 !== 2) {
        entities[p + v] *= -1;
      }
      if (v < 11) {
        entities[p + v] /= 2300;
      }
      if (v >= 17) {
        entities[p + v] /= 5.5;
      }
    }
  }
}

/**
 * Builds the dynamic N-car observation tensors for Nexto.
 * Entity order: [selfCar, ...otherActiveCars, ball, ...34 boostPads]
 */
export function buildDynamicNextoObs(
  simState: Float32Array,
  boostPads: ReadonlyArray<BoostPadDescriptor> | null | undefined,
  currentControls: Partial<CarControls>,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarEntry[] | null = null
): DynamicPerceiverObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const orderedCars = buildOrderedRoster(simState, selfCarIndex, normSelfTeam, activeCars);

  const numCars = orderedCars.length;
  const numPads = Math.min(NUM_BOOST_PADS, boostPads?.length || 0);
  const numEntities = numCars + 1 + numPads;
  const entities = new Float64Array(numEntities * ENTITY_DIMS);

  // 1. Cars (self first at index 0, followed by teammates and opponents)
  for (let i = 0; i < numCars; i++) {
    const entry = orderedCars[i];
    const carView = (sCarViews[entry.carIndex] || new CarStateView()).attachCar(
      simState,
      entry.carIndex
    );
    const eOff = i * ENTITY_DIMS;
    writeCarEntityBase(entities, eOff, carView, i === 0, entry.team === normSelfTeam);
    entities[eOff + 21] = carView.isDemoed ? 1 : 0;
  }

  // 2. Ball entity
  writeBallEntity(entities, numCars * ENTITY_DIMS, simState);

  // 3. Boost pad entities
  for (let p = 0; p < numPads; p++) {
    const pad = boostPads![p];
    const pOff = (numCars + 1 + p) * ENTITY_DIMS;
    sPadView.attach(simState, p);
    entities[pOff + 4] = 1; // IS_BOOST
    entities[pOff + 5] = pad.pos[0];
    entities[pOff + 6] = pad.pos[1];
    entities[pOff + 7] = pad.pos[2];
    entities[pOff + 20] = pad.isBig ? 1 : 0.12;
    entities[pOff + 21] = sPadView.isActive ? 1 : 0;
  }

  // 4. Normalization and Orange team coordinate reflection
  normalizeAndReflectEntities(entities, numEntities, normSelfTeam);

  // 5. Query vector [32] = selfCar features [0..23] + previous action controls [24..31]
  const query = new Float32Array(32);
  for (let j = 0; j < ENTITY_DIMS; j++) {
    query[j] = entities[j];
  }
  query.set(encodeCarControls(currentControls), ENTITY_DIMS);

  // 6. Translate positions relative to selfCar and rotate into selfCar's local yaw frame
  const yaw = Math.atan2(entities[11], entities[12]);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const originX = entities[5];
  const originY = entities[6];
  const originZ = entities[7];

  for (let u = 0; u < numEntities; u++) {
    const p = u * ENTITY_DIMS;
    entities[p + 5] -= originX;
    entities[p + 6] -= originY;
    entities[p + 7] -= originZ;

    for (let v = 5; v < 20; v += 3) {
      const gx = entities[p + v];
      const gy = entities[p + v + 1];
      entities[p + v] = cosY * gx - sinY * gy;
      entities[p + v + 1] = sinY * gx + cosY * gy;
    }
  }

  return {
    query,
    entities: new Float32Array(entities),
    numEntities,
  };
}

/**
 * Builds the dynamic N-car observation tensors for Necto.
 * Entity order: [ball, selfCar, ...otherActiveCars, ...34 boostPads]
 */
export function buildDynamicNectoObs(
  simState: Float32Array,
  boostPads: ReadonlyArray<BoostPadDescriptor> | null | undefined,
  currentControls: Partial<CarControls>,
  selfCarIndex: number,
  selfTeam: number,
  activeCars: ActiveCarEntry[] | null = null,
  demoTimers: Float64Array | Float32Array | null = null,
  boostTimers: Float64Array | Float32Array | null = null
): DynamicPerceiverObs {
  const normSelfTeam = selfTeam === 1 ? 1 : selfTeam === 0 ? 0 : selfCarIndex % 2;
  const orderedCars = buildOrderedRoster(simState, selfCarIndex, normSelfTeam, activeCars);

  const numCars = orderedCars.length;
  const numPads = Math.min(NUM_BOOST_PADS, boostPads?.length || 0);
  const numEntities = 1 + numCars + numPads;
  const entities = new Float64Array(numEntities * ENTITY_DIMS);

  // 1. Ball at entity 0
  writeBallEntity(entities, 0, simState);

  // 2. Cars at entities 1 .. numCars (entity 1 is always selfCar)
  for (let c = 0; c < numCars; c++) {
    const entry = orderedCars[c];
    const cIdx = entry.carIndex;
    const carView = (sCarViews[cIdx] || new CarStateView()).attachCar(simState, cIdx);
    const d = (c + 1) * ENTITY_DIMS;

    writeCarEntityBase(entities, d, carView, c === 0, entry.team === normSelfTeam);

    if (carView.isDemoed) {
      const nativeTimer = carView.demoRespawnTimer;
      if (nativeTimer > 0) {
        if (demoTimers && cIdx < demoTimers.length) {
          demoTimers[cIdx] = nativeTimer;
        }
        entities[d + 21] = nativeTimer / 10;
      } else if (demoTimers && cIdx < demoTimers.length) {
        demoTimers[cIdx] =
          demoTimers[cIdx] <= 0 ? 3 : Math.max(demoTimers[cIdx] - DEFAULT_TICK_SKIP / 120, 0);
        entities[d + 21] = demoTimers[cIdx] / 10;
      } else {
        entities[d + 21] = 0.3;
      }
    } else {
      if (demoTimers && cIdx < demoTimers.length) {
        demoTimers[cIdx] = 0;
      }
      entities[d + 21] = 0;
    }
  }

  // 3. Boost Pads at entities (1 + numCars) .. (numEntities - 1)
  for (let p = 0; p < numPads; p++) {
    const pad = boostPads![p];
    const h = (1 + numCars + p) * ENTITY_DIMS;
    sPadView.attach(simState, p);
    const isActive = sPadView.isActive ? 1 : 0;

    entities[h + 4] = 1; // IS_BOOST
    entities[h + 5] = pad.pos[0];
    entities[h + 6] = pad.pos[1];
    entities[h + 7] = pad.pos[2];
    entities[h + 20] = 0.12 + 0.88 * +(pad.isBig ?? false);

    if (boostTimers && p < boostTimers.length) {
      if (isActive === 1 && boostTimers[p] === 0) {
        boostTimers[p] = 0.4 + 0.6 * +(pad.pos[2] > 72);
      }
      boostTimers[p] *= isActive;
      entities[h + 21] = boostTimers[p];
      boostTimers[p] = Math.max(boostTimers[p] - DEFAULT_TICK_SKIP / 1200, 0);
    } else {
      entities[h + 21] = isActive;
    }
  }

  // 4. Normalization and Orange team coordinate reflection
  normalizeAndReflectEntities(entities, numEntities, normSelfTeam);

  // 5. Query vector [32] = selfCar entity (at index 1) + previous action controls
  const selfEntity = entities.slice(ENTITY_DIMS, 2 * ENTITY_DIMS);
  const query = new Float32Array(32);
  query.set(selfEntity);
  query.set(encodeCarControls(currentControls), ENTITY_DIMS);

  // 6. Relative position & linear velocity subtraction (Necto convention)
  for (let l = 0; l < numEntities; l++) {
    const base = l * ENTITY_DIMS;
    for (let c = 5; c < 11; c++) {
      entities[base + c] -= selfEntity[c];
    }
  }

  return {
    query,
    entities: new Float32Array(entities),
    numEntities,
  };
}
