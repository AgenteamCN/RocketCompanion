/**
 * RLRCBoostTimelineReconstructor.ts
 * Reconstructs continuous 30Hz vehicle boost trajectories by integrating
 * boost consumption (`33.3333%/s` while `boostActive` is true), boost pad pickups
 * (`+100` big / `+12` small) from `boostPadEvents30Hz`, `grant_count` edge changes,
 * and spawn/kickoff resets (`33.333%`), anchored to discrete server `:ReplicatedBoost`
 * updates via `RLRCBoostSegmentSolverPipeline`.
 */

import { STANDARD_BOOST_PADS_34 } from '../catalog/RLRCBoostPadLocationsTable.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCBoostPadPickupEvent,
  type RLRCCarFrameState120Hz,
  type RLRCNetStreamRawFrame,
  type RLRCSourceNetworkFrame,
  type RLRCVec3,
} from '../RLRCReplayTypes.ts';
import {
  clampBoostAmount,
  reconstructSlotBoostTimeline,
  RLRC_BIG_PAD_GRANT_AMOUNT,
  RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC as SOLVER_BOOST_DRAIN_RATE_PCT_PER_SEC,
  RLRC_DEFAULT_SPAWN_BOOST_PCT as SOLVER_DEFAULT_SPAWN_BOOST_PCT,
  RLRC_SMALL_PAD_GRANT_AMOUNT,
  type RLRCSlotFrameBoostSample,
} from './RLRCBoostSegmentSolverPipeline.ts';

export const RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC = SOLVER_BOOST_DRAIN_RATE_PCT_PER_SEC;
export const RLRC_DEFAULT_SPAWN_BOOST_PCT = SOLVER_DEFAULT_SPAWN_BOOST_PCT;

export interface RLRCBoostAnchorMapBySlot {
  readonly anchorsBySlot: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly spawnFramesBySlot: ReadonlyArray<ReadonlySet<number>>;
  readonly grantChangedBySlot?: ReadonlyArray<ReadonlySet<number>>;
  readonly rawFrames?: readonly RLRCNetStreamRawFrame[];
  readonly objects?: readonly string[];
}

export interface RLRCDecodedBoostAttribute {
  readonly boostAmount: number;
  readonly grantCount: number | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function distXY(a: RLRCVec3, b: RLRCVec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extractActorId(raw: unknown): number {
  const outer = asRecord(raw);
  const activeActor = asRecord(outer?.ActiveActor) ?? outer;
  if (!activeActor || activeActor.active === false) return -1;
  const actor = activeActor.actor;
  return typeof actor === 'number' && Number.isFinite(actor) ? Math.trunc(actor) : -1;
}

export function decodeReplicatedBoostAttribute(raw: unknown): RLRCDecodedBoostAttribute | null {
  const outer = asRecord(raw);
  const boostObj = asRecord(outer?.ReplicatedBoost) ?? outer;
  const byteRaw =
    typeof raw === 'number'
      ? raw
      : (boostObj?.boost_amount ?? boostObj?.boostAmount ?? outer?.Byte);
  if (typeof byteRaw !== 'number' || !Number.isFinite(byteRaw)) return null;
  const boostAmount = (clampBoostAmount(byteRaw, 0, 255) / 255) * 100;
  const grantRaw = boostObj?.grant_count ?? boostObj?.grantCount;
  return {
    boostAmount,
    grantCount:
      typeof grantRaw === 'number' && Number.isFinite(grantRaw) ? Math.trunc(grantRaw) : null,
  };
}

/**
 * Extracts per-slot `grant_count` edge changes, out-of-order component-to-car
 * `:ReplicatedBoost` anchors, and pawn re-binding spawn frames from raw NetStream frames.
 */
export function extractRawFrameBoostGrantEdges(
  nfs: readonly RLRCSourceNetworkFrame[],
  rawFrames: readonly RLRCNetStreamRawFrame[] | undefined,
  objects: readonly string[] | undefined,
  baseAnchorsBySlot: ReadonlyArray<ReadonlyMap<number, number>>,
  baseSpawnsBySlot: ReadonlyArray<ReadonlySet<number>>
): {
  readonly mergedAnchorsBySlot: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly mergedSpawnsBySlot: ReadonlyArray<ReadonlySet<number>>;
  readonly grantChangedBySlot: ReadonlyArray<ReadonlySet<number>>;
} {
  const grantChangedBySlot = Array.from({ length: RLRC_MAX_PLAYER_SLOTS }, () => new Set<number>());
  if (!rawFrames || !objects || rawFrames.length === 0 || nfs.length === 0) {
    return {
      mergedAnchorsBySlot: baseAnchorsBySlot,
      mergedSpawnsBySlot: baseSpawnsBySlot,
      grantChangedBySlot,
    };
  }

  const mergedAnchors = Array.from({ length: RLRC_MAX_PLAYER_SLOTS }, (_, s) => {
    const map = new Map<number, number>();
    const src = baseAnchorsBySlot[s];
    if (src) {
      for (const [k, v] of src.entries()) map.set(k, v);
    }
    return map;
  });

  const mergedSpawns = Array.from({ length: RLRC_MAX_PLAYER_SLOTS }, (_, s) => {
    const set = new Set<number>();
    const src = baseSpawnsBySlot[s];
    if (src) {
      for (const k of src.values()) set.add(k);
    }
    return set;
  });

  const compCarById = new Map<number, number>();
  const pendingCompBoost = new Map<
    number,
    { decoded: RLRCDecodedBoostAttribute; frameIndex: number }
  >();
  const lastGrantBySlot = new Int32Array(RLRC_MAX_PLAYER_SLOTS).fill(-1);
  const lastCarIdBySlot = new Int32Array(RLRC_MAX_PLAYER_SLOTS).fill(-1);
  const frameCount = Math.min(nfs.length, rawFrames.length);

  const resolveSlotAtFrame = (fi: number, carActorId: number): number => {
    if (carActorId < 0) return -1;
    const cars = nfs[fi].cars;
    for (let s = 0; s < cars.length; s++) {
      if (cars[s].entityActive && cars[s].actorId === carActorId) return s;
    }
    if (fi + 1 < nfs.length) {
      const nextCars = nfs[fi + 1].cars;
      for (let s = 0; s < nextCars.length; s++) {
        if (nextCars[s].entityActive && nextCars[s].actorId === carActorId) return s;
      }
    }
    return -1;
  };

  const applyBoostToSlot = (slot: number, fi: number, decoded: RLRCDecodedBoostAttribute): void => {
    if (slot < 0 || slot >= RLRC_MAX_PLAYER_SLOTS) return;
    mergedAnchors[slot].set(fi, decoded.boostAmount);
    if (decoded.grantCount !== null) {
      const prevGrant = lastGrantBySlot[slot];
      if (prevGrant >= 0 && decoded.grantCount !== prevGrant) {
        grantChangedBySlot[slot].add(fi);
      }
      lastGrantBySlot[slot] = decoded.grantCount;
    }
  };

  for (let fi = 0; fi < frameCount; fi++) {
    const rf = rawFrames[fi];
    const nf = nfs[fi];
    for (let s = 0; s < RLRC_MAX_PLAYER_SLOTS; s++) {
      const car = nf.cars[s];
      const carId = car?.entityActive ? (car.actorId ?? -1) : -1;
      if (carId !== lastCarIdBySlot[s]) {
        if (carId >= 0) mergedSpawns[s].add(fi);
        lastGrantBySlot[s] = -1;
        lastCarIdBySlot[s] = carId;
      }
    }

    for (const delId of rf.deleted_actors ?? []) {
      compCarById.delete(delId);
      pendingCompBoost.delete(delId);
    }

    for (const ua of rf.updated_actors ?? []) {
      const prop = objects[ua.object_id] ?? '';
      const actorId = ua.actor_id;
      if (prop === 'TAGame.CarComponent_TA:Vehicle') {
        const carId = extractActorId(ua.attribute);
        if (carId >= 0) {
          compCarById.set(actorId, carId);
          const pending = pendingCompBoost.get(actorId);
          if (pending && fi - pending.frameIndex <= 1) {
            const slot = resolveSlotAtFrame(fi, carId);
            applyBoostToSlot(slot, fi, pending.decoded);
          }
        } else {
          compCarById.delete(actorId);
        }
      } else if (prop.includes(':ReplicatedBoost')) {
        const decoded = decodeReplicatedBoostAttribute(ua.attribute);
        if (!decoded) continue;
        pendingCompBoost.set(actorId, { decoded, frameIndex: fi });
        const ownerCarId = compCarById.get(actorId) ?? actorId;
        const slot = resolveSlotAtFrame(fi, ownerCarId);
        applyBoostToSlot(slot, fi, decoded);
      }
    }
  }

  return {
    mergedAnchorsBySlot: mergedAnchors,
    mergedSpawnsBySlot: mergedSpawns,
    grantChangedBySlot,
  };
}

export function buildPadPickupGrantsByFrameAndSlot(
  nfs: readonly RLRCSourceNetworkFrame[],
  boostPadEvents: readonly RLRCBoostPadPickupEvent[] | undefined
): Map<number, number[]> {
  const grantsByFrame = new Map<number, number[]>();
  if (!boostPadEvents || boostPadEvents.length === 0 || nfs.length === 0) {
    return grantsByFrame;
  }

  for (let i = 0; i < boostPadEvents.length; i++) {
    const ev = boostPadEvents[i];
    if (ev.pickedUpState !== 'picked-up') continue;
    const fi = ev.sourceFrame30Hz;
    if (fi < 0 || fi >= nfs.length) continue;

    let slot = ev.instigatorSlotIndex;
    if (slot < 0 || slot >= RLRC_MAX_PLAYER_SLOTS) {
      const padSpec =
        ev.padIndex >= 0 && ev.padIndex < STANDARD_BOOST_PADS_34.length
          ? STANDARD_BOOST_PADS_34[ev.padIndex]
          : null;
      if (padSpec) {
        const cars = nfs[fi].cars;
        let bestSlot = -1;
        let bestDist = 420.0;
        for (let s = 0; s < cars.length; s++) {
          const car = cars[s];
          if (!car.entityActive) continue;
          const d = distXY(car.rigidBody.position, padSpec.position);
          if (d < bestDist) {
            bestDist = d;
            bestSlot = s;
          }
        }
        slot = bestSlot;
      }
    }

    if (slot < 0 || slot >= RLRC_MAX_PLAYER_SLOTS) continue;
    let frameGrants = grantsByFrame.get(fi);
    if (!frameGrants) {
      frameGrants = new Array<number>(RLRC_MAX_PLAYER_SLOTS).fill(0);
      grantsByFrame.set(fi, frameGrants);
    }
    const grant = ev.isBigPad ? RLRC_BIG_PAD_GRANT_AMOUNT : RLRC_SMALL_PAD_GRANT_AMOUNT;
    frameGrants[slot] = Math.min(100, frameGrants[slot] + grant);
  }

  return grantsByFrame;
}

/**
 * Applies continuous edge-integrated boost amounts across all 30Hz source frames in place
 * using `RLRCBoostSegmentSolverPipeline`, fusing `boostPadEvents30Hz` pickup grants,
 * `grant_count` edges, kickoff/spawn resets, and server `:ReplicatedBoost` anchors.
 */
export function reconstructContinuousBoostTimeline30Hz(
  nfs: readonly RLRCSourceNetworkFrame[],
  anchorInfo: RLRCBoostAnchorMapBySlot,
  boostPadEvents?: readonly RLRCBoostPadPickupEvent[]
): void {
  const numFrames = nfs.length;
  if (numFrames === 0) return;

  const grantsByFrame = buildPadPickupGrantsByFrameAndSlot(nfs, boostPadEvents);
  const { mergedAnchorsBySlot, mergedSpawnsBySlot, grantChangedBySlot } =
    extractRawFrameBoostGrantEdges(
      nfs,
      anchorInfo.rawFrames,
      anchorInfo.objects,
      anchorInfo.anchorsBySlot,
      anchorInfo.spawnFramesBySlot
    );

  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    const anchors = mergedAnchorsBySlot[slot];
    const spawns = mergedSpawnsBySlot[slot];
    const explicitGrantChanges = anchorInfo.grantChangedBySlot?.[slot];
    const rawGrantChanges = grantChangedBySlot[slot];
    const samples = new Array<RLRCSlotFrameBoostSample>(numFrames);

    let prevActive = false;
    for (let fi = 0; fi < numFrames; fi++) {
      const nf = nfs[fi];
      const car = nf.cars[slot];
      const entityActive = Boolean(car?.entityActive);
      const spawned = entityActive && (!prevActive || (spawns?.has(fi) ?? false));
      const anchorVal = entityActive ? anchors?.get(fi) : undefined;
      const padGrant = entityActive ? (grantsByFrame.get(fi)?.[slot] ?? 0) : 0;
      const grantChanged =
        entityActive &&
        ((explicitGrantChanges?.has(fi) ?? false) || (rawGrantChanges?.has(fi) ?? false));

      samples[fi] = {
        timeSeconds: nf.timeSeconds,
        deltaSeconds: nf.deltaSeconds,
        entityActive,
        carActorId: entityActive ? (car?.actorId ?? -1) : -1,
        spawned,
        roundCountdownNumber: nf.roundCountdownNumber,
        boostActive: entityActive && Boolean(car?.activeFlags.boostActive),
        anchorBoost: anchorVal !== undefined ? anchorVal : null,
        grantChanged,
        padGrant,
      };
      prevActive = entityActive;
    }

    const solvedTimeline = reconstructSlotBoostTimeline(samples, numFrames);
    for (let fi = 0; fi < numFrames; fi++) {
      const cars = nfs[fi].cars as RLRCCarFrameState120Hz[];
      const car = cars[slot];
      if (!car) continue;
      const newBoost = car.entityActive ? clampBoostAmount(solvedTimeline[fi]) : 0;
      if (Math.abs(car.boostAmount - newBoost) > 1e-4) {
        cars[slot] = {
          ...car,
          boostAmount: newBoost,
        };
      }
    }
  }
}
