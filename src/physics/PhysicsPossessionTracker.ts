/**
 * src/physics/PhysicsPossessionTracker.ts
 * Stateful Sub-Controller managing ball possession reporting, cumulative blue/orange
 * possession points across kickoffs, and WASM state array read/write synchronization.
 */

import { EXTENDED_STATE_OFFSETS } from './RocketSimConstants.ts';
import type { RocketSimWasmModule } from './RocketSimWasm.ts';

export interface PossessionStatsSnapshot {
  team: number;
  bluePoints: number;
  orangePoints: number;
  time: number;
}

export class PhysicsPossessionTracker {
  public possessionEnabled = false;
  public possessionBluePoints = 0;
  public possessionOrangePoints = 0;
  public lastRawBluePossessionPts = 0;
  public lastRawOrangePossessionPts = 0;

  public setReportingEnabled(
    wasmModule: RocketSimWasmModule | null | undefined,
    enabled: boolean
  ): void {
    this.possessionEnabled = Boolean(enabled);
    wasmModule?._physics_setPossessionReportingEnabled?.(this.possessionEnabled ? 1 : 0);
  }

  public resetPossessionStats(
    wasmModule: RocketSimWasmModule | null | undefined,
    state: Float32Array | null | undefined
  ): void {
    this.possessionBluePoints = 0;
    this.possessionOrangePoints = 0;
    this.lastRawBluePossessionPts = 0;
    this.lastRawOrangePossessionPts = 0;
    if (wasmModule && state && state.length >= 416) {
      state[EXTENDED_STATE_OFFSETS.POSSESSION_STATE] = 0;
      state[EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS] = 0;
      state[EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS] = 0;
      state[EXTENDED_STATE_OFFSETS.POSSESSION_DURATION] = 0;
    }
  }

  public preserveBeforeKickoff(
    state: Float32Array | null | undefined,
    preservePossessionScore: boolean
  ): void {
    if (preservePossessionScore && state && state.length >= 416) {
      this.possessionBluePoints = Math.max(
        this.possessionBluePoints,
        Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS] || 0)
      );
      this.possessionOrangePoints = Math.max(
        this.possessionOrangePoints,
        Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS] || 0)
      );
    } else if (!preservePossessionScore) {
      this.possessionBluePoints = 0;
      this.possessionOrangePoints = 0;
    }
  }

  public applyAccumulatedPossessionToState(
    wasmModule: RocketSimWasmModule | null | undefined,
    state: Float32Array | null | undefined
  ): void {
    if (!wasmModule || !state || state.length < 416) return;
    const rawBlue = Math.max(
      0,
      Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS] || 0)
    );
    const rawOrange = Math.max(
      0,
      Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS] || 0)
    );
    this.lastRawBluePossessionPts = rawBlue;
    this.lastRawOrangePossessionPts = rawOrange;
    if (this.possessionBluePoints > 0) {
      state[EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS] = rawBlue + this.possessionBluePoints;
    }
    if (this.possessionOrangePoints > 0) {
      state[EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS] =
        rawOrange + this.possessionOrangePoints;
    }
  }

  public getPossessionStats(state: Float32Array | null | undefined): PossessionStatsSnapshot {
    if (state && state.length >= 416) {
      return {
        team: Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_STATE]),
        bluePoints: Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS]),
        orangePoints: Math.round(state[EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS]),
        time: state[EXTENDED_STATE_OFFSETS.POSSESSION_DURATION],
      };
    }
    return { team: 0, bluePoints: 0, orangePoints: 0, time: 0 };
  }
}

export default PhysicsPossessionTracker;
