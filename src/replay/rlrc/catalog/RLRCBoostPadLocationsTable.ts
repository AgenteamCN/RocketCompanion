/**
 * RLRCBoostPadLocationsTable.ts
 * Pure static coordinates, specifications, and cooldown durations
 * for the 34 standard arena boost pads (6 big + 28 small).
 */

import {
  BOOST_PAD_TIMEOUT_BIG,
  BOOST_PAD_TIMEOUT_SMALL,
} from '../../../physics/RocketSimConstants.ts';
import type { RLRCVec3 } from '../RLRCReplayTypes.ts';

export interface RLRCBoostPadSpec {
  readonly padIndex: number;
  readonly isBigPad: boolean;
  readonly cooldownSeconds: number;
  readonly boostGrantAmount: number;
  readonly position: RLRCVec3;
}

export interface RLRCBoostPadNearestMatch {
  readonly padIndex: number;
  readonly isBigPad: boolean;
  readonly distanceXY: number;
  readonly pad: RLRCBoostPadSpec;
}

export const RLRC_BIG_BOOST_PAD_COUNT = 6;
export const RLRC_SMALL_BOOST_PAD_COUNT = 28;
export const RLRC_BIG_BOOST_COOLDOWN_SECONDS: number = BOOST_PAD_TIMEOUT_BIG;
export const RLRC_SMALL_BOOST_COOLDOWN_SECONDS: number = BOOST_PAD_TIMEOUT_SMALL;
export const RLRC_MAX_PICKUP_MATCH_DISTANCE_UU = 450.0;

export const RAW_STANDARD_BOOST_PADS_34: ReadonlyArray<readonly [number, number, number, boolean]> =
  Object.freeze([
    // 0..5: 6 Big Boost Pads (100 boost, 10.0s cooldown)
    [-3584, 0, 73, true],
    [3584, 0, 73, true],
    [-3072, 4096, 73, true],
    [3072, 4096, 73, true],
    [-3072, -4096, 73, true],
    [3072, -4096, 73, true],
    // 6..33: 28 Small Boost Pads (12 boost, 4.0s cooldown)
    [0, -4240, 70, false],
    [-1792, -4184, 70, false],
    [1792, -4184, 70, false],
    [-940, -3308, 70, false],
    [940, -3308, 70, false],
    [0, -2816, 70, false],
    [-3584, -2484, 70, false],
    [3584, -2484, 70, false],
    [-1788, -2300, 70, false],
    [1788, -2300, 70, false],
    [-2048, -1036, 70, false],
    [0, -1024, 70, false],
    [2048, -1036, 70, false],
    [-1024, 0, 70, false],
    [1024, 0, 70, false],
    [-2048, 1036, 70, false],
    [0, 1024, 70, false],
    [2048, 1036, 70, false],
    [-1788, 2300, 70, false],
    [1788, 2300, 70, false],
    [-3584, 2484, 70, false],
    [3584, 2484, 70, false],
    [0, 2816, 70, false],
    [-940, 3308, 70, false],
    [940, 3308, 70, false],
    [-1792, 4184, 70, false],
    [1792, 4184, 70, false],
    [0, 4240, 70, false],
  ]);

export function buildStandardBoostPadSpecs(): readonly RLRCBoostPadSpec[] {
  return Object.freeze(
    RAW_STANDARD_BOOST_PADS_34.map(([x, y, z, isBigPad], padIndex) =>
      Object.freeze({
        padIndex,
        isBigPad,
        cooldownSeconds: isBigPad
          ? RLRC_BIG_BOOST_COOLDOWN_SECONDS
          : RLRC_SMALL_BOOST_COOLDOWN_SECONDS,
        boostGrantAmount: isBigPad ? 100 : 12,
        position: Object.freeze({ x, y, z }),
      })
    )
  );
}

export const STANDARD_BOOST_PADS_34: readonly RLRCBoostPadSpec[] = buildStandardBoostPadSpecs();

export function isBigBoostPadIndex(padIndex: number): boolean {
  return padIndex >= 0 && padIndex < RLRC_BIG_BOOST_PAD_COUNT;
}

export function getBoostPadCooldownDuration(padIndex: number): number {
  return isBigBoostPadIndex(padIndex)
    ? RLRC_BIG_BOOST_COOLDOWN_SECONDS
    : RLRC_SMALL_BOOST_COOLDOWN_SECONDS;
}
