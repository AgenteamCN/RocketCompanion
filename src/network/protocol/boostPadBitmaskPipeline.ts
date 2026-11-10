/**
 * src/network/protocol/boostPadBitmaskPipeline.ts
 * Pure binary bitmask packing, unpacking, and edge-tracked cooldown reconstruction
 * for the 34 arena boost pads in sparse global physics snapshots.
 */

import {
  NUM_BOOST_PADS,
  BOOST_PAD_STATES_OFFSET,
  BOOST_PAD_STATE_STRIDE,
  BOOST_PAD_TIMEOUT_BIG,
  BOOST_PAD_TIMEOUT_SMALL,
} from '../../physics/RocketSimConstants.ts';

export const BOOST_PAD_BITMASK_BYTES = 5;

export interface BoostPadBitmask {
  low: number;
  high: number;
}

export interface BoostPadEdgeTracker {
  initialized: boolean;
  lastTick: number;
  prevActive: Uint8Array;
  deactivatedAtTick: Int32Array;
}

export function packBoostPadBitmask(snap?: ArrayLike<number> | null): BoostPadBitmask {
  let low = 0;
  let high = 0;
  if (snap && snap.length >= BOOST_PAD_STATES_OFFSET + NUM_BOOST_PADS * BOOST_PAD_STATE_STRIDE) {
    for (let i = 0; i < 32; i++) {
      if (snap[BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE] > 0.5) low |= 1 << i;
    }
    for (let i = 32; i < NUM_BOOST_PADS; i++) {
      if (snap[BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE] > 0.5) high |= 1 << (i - 32);
    }
  } else {
    low = 0xffffffff;
    high = 0x03;
  }
  return { low: low >>> 0, high: high & 0x03 };
}

export function unpackBoostPadBitmaskIntoSnapshot(
  low: number,
  high: number,
  stateSnapshot: Float32Array | number[]
): void {
  const uLow = low >>> 0;
  const uHigh = high & 0x03;
  for (let i = 0; i < 32; i++) {
    const isActive = (uLow & (1 << i)) !== 0;
    const base = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    stateSnapshot[base] = isActive ? 1.0 : 0.0;
    stateSnapshot[base + 1] = isActive
      ? 0.0
      : i < 6
        ? BOOST_PAD_TIMEOUT_BIG
        : BOOST_PAD_TIMEOUT_SMALL;
  }
  for (let i = 32; i < NUM_BOOST_PADS; i++) {
    const isActive = (uHigh & (1 << (i - 32))) !== 0;
    const base = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    stateSnapshot[base] = isActive ? 1.0 : 0.0;
    stateSnapshot[base + 1] = isActive ? 0.0 : BOOST_PAD_TIMEOUT_SMALL;
  }
}

export function createBoostPadEdgeTracker(): BoostPadEdgeTracker {
  return {
    initialized: false,
    lastTick: -1,
    prevActive: new Uint8Array(NUM_BOOST_PADS),
    deactivatedAtTick: new Int32Array(NUM_BOOST_PADS).fill(-1),
  };
}

export function seedBoostPadEdgeTrackerFromSnapshot(
  tracker: BoostPadEdgeTracker | null | undefined,
  stateSnapshot: Float32Array | number[] | null | undefined,
  tick = 0
): void {
  if (
    !tracker ||
    !stateSnapshot ||
    stateSnapshot.length < BOOST_PAD_STATES_OFFSET + NUM_BOOST_PADS * BOOST_PAD_STATE_STRIDE
  ) {
    return;
  }
  const safeTick = Math.max(0, Math.floor(tick || stateSnapshot[0] || 0));
  for (let i = 0; i < NUM_BOOST_PADS; i++) {
    const base = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    const fullTimeout = i < 6 ? BOOST_PAD_TIMEOUT_BIG : BOOST_PAD_TIMEOUT_SMALL;
    const isActive = stateSnapshot[base] > 0.5 ? 1 : 0;
    tracker.prevActive[i] = isActive;
    if (isActive === 1) {
      tracker.deactivatedAtTick[i] = -1;
      stateSnapshot[base + 1] = 0.0;
    } else {
      const rawCooldown = stateSnapshot[base + 1];
      const clampedCooldown =
        Number.isFinite(rawCooldown) && rawCooldown > 0 && rawCooldown <= fullTimeout
          ? rawCooldown
          : fullTimeout;
      const elapsedTicks = Math.round(Math.max(0, fullTimeout - clampedCooldown) * 120);
      tracker.deactivatedAtTick[i] = safeTick - elapsedTicks;
      stateSnapshot[base + 1] = clampedCooldown;
    }
  }
  tracker.initialized = true;
  tracker.lastTick = safeTick;
}

export function applyBoostPadEdgeCooldowns<T extends Float32Array | number[] | null | undefined>(
  stateSnapshot: T,
  tick = 0,
  tracker: BoostPadEdgeTracker | null = null
): T {
  if (
    !stateSnapshot ||
    stateSnapshot.length < BOOST_PAD_STATES_OFFSET + NUM_BOOST_PADS * BOOST_PAD_STATE_STRIDE ||
    !tracker
  ) {
    return stateSnapshot;
  }
  const safeTick = Math.max(0, Math.floor(tick || stateSnapshot[0] || 0));
  const isResetOrFirst = !tracker.initialized || safeTick < tracker.lastTick;

  for (let i = 0; i < NUM_BOOST_PADS; i++) {
    const base = BOOST_PAD_STATES_OFFSET + i * BOOST_PAD_STATE_STRIDE;
    const fullTimeout = i < 6 ? BOOST_PAD_TIMEOUT_BIG : BOOST_PAD_TIMEOUT_SMALL;
    const isActive = stateSnapshot[base] > 0.5 ? 1 : 0;

    if (isResetOrFirst || isActive === 1) {
      tracker.prevActive[i] = isActive;
      tracker.deactivatedAtTick[i] = isActive === 1 ? -1 : safeTick;
      stateSnapshot[base + 1] = isActive === 1 ? 0.0 : fullTimeout;
    } else if (tracker.prevActive[i] === 1 || tracker.deactivatedAtTick[i] < 0) {
      tracker.prevActive[i] = 0;
      tracker.deactivatedAtTick[i] = safeTick;
      stateSnapshot[base + 1] = fullTimeout;
    } else {
      const timeoutTicks = Math.round(fullTimeout * 120);
      const elapsedTicks = Math.max(0, safeTick - tracker.deactivatedAtTick[i]);
      if (timeoutTicks > 0 && elapsedTicks >= timeoutTicks) {
        const cycleRemainderTicks = elapsedTicks % timeoutTicks;
        tracker.deactivatedAtTick[i] = safeTick - cycleRemainderTicks;
        stateSnapshot[base + 1] = Math.max(0.0, fullTimeout - cycleRemainderTicks / 120.0);
      } else {
        stateSnapshot[base + 1] = Math.max(0.0, fullTimeout - elapsedTicks / 120.0);
      }
    }
  }

  tracker.initialized = true;
  tracker.lastTick = safeTick;
  return stateSnapshot;
}
