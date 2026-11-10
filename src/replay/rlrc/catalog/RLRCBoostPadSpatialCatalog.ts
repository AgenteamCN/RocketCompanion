/**
 * RLRCBoostPadSpatialCatalog.ts
 * Spatial catalog for the 34 standard arena boost pads (6 big + 28 small),
 * nearest-neighbor lookup, 120Hz cooldown timeline synthesis, and GameStateBuffer serialization.
 */

import {
  BOOST_PAD_OFFSETS,
  BOOST_PAD_STATE_STRIDE,
  BOOST_PAD_STATES_OFFSET,
  NUM_BOOST_PADS,
  SIM_OFFSETS,
} from '../../../physics/RocketSimConstants.ts';
import { RLRC_BOOST_PAD_COUNT, type RLRCBoostPadPickupEvent } from '../RLRCReplayTypes.ts';
import {
  buildStandardBoostPadSpecs,
  getBoostPadCooldownDuration,
  RLRC_MAX_PICKUP_MATCH_DISTANCE_UU,
  type RLRCBoostPadNearestMatch,
  type RLRCBoostPadSpec,
} from './RLRCBoostPadLocationsTable.ts';

export type { RLRCBoostPadNearestMatch, RLRCBoostPadSpec };

export const STANDARD_BOOST_PADS_34: readonly RLRCBoostPadSpec[] = buildStandardBoostPadSpecs();

export function getBoostPadSpec(padIndex: number): RLRCBoostPadSpec | null {
  if (padIndex < 0 || padIndex >= STANDARD_BOOST_PADS_34.length) {
    return null;
  }
  return STANDARD_BOOST_PADS_34[padIndex];
}

/**
 * Finds the nearest standard boost pad (0..33) to the given `(x, y)` coordinates.
 * Optionally excludes already-bound pad indices if an unbound pad lies within `RLRC_MAX_PICKUP_MATCH_DISTANCE_UU`.
 */
export function findNearestBoostPad(
  x: number,
  y: number,
  excludedPadIndices?: ReadonlySet<number> | null
): RLRCBoostPadNearestMatch {
  let bestUnboundIndex = -1;
  let bestUnboundDistSq = Number.POSITIVE_INFINITY;
  let bestOverallIndex = 0;
  let bestOverallDistSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < STANDARD_BOOST_PADS_34.length; i++) {
    const pad = STANDARD_BOOST_PADS_34[i];
    const dx = x - pad.position.x;
    const dy = y - pad.position.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestOverallDistSq) {
      bestOverallDistSq = distSq;
      bestOverallIndex = i;
    }
    if (!excludedPadIndices || !excludedPadIndices.has(i)) {
      if (distSq < bestUnboundDistSq) {
        bestUnboundDistSq = distSq;
        bestUnboundIndex = i;
      }
    }
  }

  const maxDistSq = RLRC_MAX_PICKUP_MATCH_DISTANCE_UU * RLRC_MAX_PICKUP_MATCH_DISTANCE_UU;
  const chosenIndex =
    bestUnboundIndex >= 0 && bestUnboundDistSq <= maxDistSq ? bestUnboundIndex : bestOverallIndex;
  const chosenDistSq = chosenIndex === bestUnboundIndex ? bestUnboundDistSq : bestOverallDistSq;
  const chosenPad = STANDARD_BOOST_PADS_34[chosenIndex];

  return {
    padIndex: chosenIndex,
    isBigPad: chosenPad.isBigPad,
    distanceXY: Math.sqrt(chosenDistSq),
    pad: chosenPad,
  };
}

/**
 * Evaluates the exact 34 boost pad cooldowns (in seconds remaining) at any timestamp `timeSeconds`
 * from a chronological list of `RLRCBoostPadPickupEvent` records.
 */
export function evaluateBoostPadCooldownsAtTime(
  events: readonly RLRCBoostPadPickupEvent[],
  timeSeconds: number,
  out?: Float32Array
): Float32Array {
  const dst =
    out && out.length >= RLRC_BOOST_PAD_COUNT ? out : new Float32Array(RLRC_BOOST_PAD_COUNT);
  dst.fill(0);

  const lastPickTime = new Float64Array(RLRC_BOOST_PAD_COUNT).fill(Number.NEGATIVE_INFINITY);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.timeSeconds > timeSeconds + 1e-6) {
      break;
    }
    if (ev.pickedUpState === 'kickoff-reset') {
      lastPickTime.fill(Number.NEGATIVE_INFINITY);
      continue;
    }
    if (ev.padIndex < 0 || ev.padIndex >= RLRC_BOOST_PAD_COUNT) {
      continue;
    }
    if (ev.pickedUpState === 'picked-up') {
      lastPickTime[ev.padIndex] = ev.timeSeconds;
    } else if (ev.pickedUpState === 'respawned') {
      lastPickTime[ev.padIndex] = Number.NEGATIVE_INFINITY;
    }
  }

  for (let p = 0; p < RLRC_BOOST_PAD_COUNT; p++) {
    const pickTime = lastPickTime[p];
    if (Number.isFinite(pickTime)) {
      const duration = getBoostPadCooldownDuration(p);
      const remaining = duration - Math.max(0, timeSeconds - pickTime);
      dst[p] = remaining > 1e-5 ? remaining : 0;
    }
  }

  return dst;
}

/**
 * Sweeps a sorted `RLRCBoostPadPickupEvent` timeline in O(N_frames + N_events) time
 * to synthesize 120Hz `Float32Array(34)` boost pad cooldown snapshots for every frame.
 */
export function buildBoostPadCooldownTimeline120Hz(
  events: readonly RLRCBoostPadPickupEvent[],
  frameTimestampsSeconds: ArrayLike<number>
): Float32Array[] {
  const frameCount = frameTimestampsSeconds.length;
  const result: Float32Array[] = new Array(frameCount);
  const lastPickTime = new Float64Array(RLRC_BOOST_PAD_COUNT).fill(Number.NEGATIVE_INFINITY);
  let eventCursor = 0;

  for (let f = 0; f < frameCount; f++) {
    const frameTime = frameTimestampsSeconds[f];
    while (eventCursor < events.length && events[eventCursor].timeSeconds <= frameTime + 1e-6) {
      const ev = events[eventCursor++];
      if (ev.pickedUpState === 'kickoff-reset') {
        lastPickTime.fill(Number.NEGATIVE_INFINITY);
      } else if (ev.padIndex >= 0 && ev.padIndex < RLRC_BOOST_PAD_COUNT) {
        if (ev.pickedUpState === 'picked-up') {
          lastPickTime[ev.padIndex] = ev.timeSeconds;
        } else if (ev.pickedUpState === 'respawned') {
          lastPickTime[ev.padIndex] = Number.NEGATIVE_INFINITY;
        }
      }
    }

    const frameCooldowns = new Float32Array(RLRC_BOOST_PAD_COUNT);
    for (let p = 0; p < RLRC_BOOST_PAD_COUNT; p++) {
      const pickTime = lastPickTime[p];
      if (Number.isFinite(pickTime)) {
        const duration = getBoostPadCooldownDuration(p);
        const remaining = duration - Math.max(0, frameTime - pickTime);
        frameCooldowns[p] = remaining > 1e-5 ? remaining : 0;
      }
    }
    result[f] = frameCooldowns;
  }

  return result;
}

/**
 * Writes the 34 boost pad `(isActive, cooldown)` pairs into a 448-float `GameStateBuffer`
 * at `BOOST_PAD_STATES_OFFSET` (floats 342..409) and updates `SIM_OFFSETS.NUM_PADS`.
 */
export function applyBoostPadCooldownsToSimStateBuffer(
  out: Float32Array,
  cooldowns: ArrayLike<number>
): void {
  if (out.length < BOOST_PAD_STATES_OFFSET + NUM_BOOST_PADS * BOOST_PAD_STATE_STRIDE) {
    return;
  }
  out[SIM_OFFSETS.NUM_PADS] = NUM_BOOST_PADS;
  for (let i = 0; i < NUM_BOOST_PADS; i++) {
    const rawCooldown = i < cooldowns.length ? Number(cooldowns[i]) : 0;
    const cooldown = Number.isFinite(rawCooldown) && rawCooldown > 1e-5 ? rawCooldown : 0;
    const base = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    out[base + BOOST_PAD_OFFSETS.IS_ACTIVE] = cooldown === 0 ? 1.0 : 0.0;
    out[base + BOOST_PAD_OFFSETS.COOLDOWN] = cooldown;
  }
}

/**
 * Extracts the 34 boost pad remaining cooldown seconds from a 448-float `GameStateBuffer`.
 */
export function extractBoostPadCooldownsFromSimStateBuffer(
  stateBuffer: ArrayLike<number>,
  out?: Float32Array
): Float32Array {
  const dst =
    out && out.length >= RLRC_BOOST_PAD_COUNT ? out : new Float32Array(RLRC_BOOST_PAD_COUNT);
  if (stateBuffer.length < BOOST_PAD_STATES_OFFSET + NUM_BOOST_PADS * BOOST_PAD_STATE_STRIDE) {
    dst.fill(0);
    return dst;
  }
  for (let i = 0; i < RLRC_BOOST_PAD_COUNT; i++) {
    const base = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    const isActive = stateBuffer[base + BOOST_PAD_OFFSETS.IS_ACTIVE] > 0.5;
    const rawCooldown = stateBuffer[base + BOOST_PAD_OFFSETS.COOLDOWN];
    dst[i] = isActive ? 0 : Math.max(0, Number(rawCooldown) || 0);
  }
  return dst;
}
