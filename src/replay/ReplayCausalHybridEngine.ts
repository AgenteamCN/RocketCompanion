/**
 * ReplayCausalHybridEngine.ts
 * Pure deterministic engine runner for Causal Hybrid Sync during Replay Takeover.
 *
 * Maintains the set of causally perturbed entities (POV car, nearby cars, and ball)
 * and anchors unperturbed entities to their recorded replay trajectory while
 * reconstructing transient RocketSim::CarState fields.
 */

import { SIM_OFFSETS, MAX_CARS, CAR_STATE_STRIDE } from '../physics/RocketSimConstants.ts';
import {
  reconstructCarTransientStateFromHistory,
  patchWasmCarTransientState,
} from '../physics/CarTransientStateReconstructor.ts';
import type {
  DecodedCarControlEntry,
  DecodedIncidentEvent,
  DecodedSignalEvent,
  ReplayAudioCueEvent,
} from './container/RCReplayBinarySchema.ts';

export type CausalControlSlotItem =
  | DecodedCarControlEntry
  | ({ carIndex?: number; controls?: Record<string, unknown> } & Record<string, unknown>);

export type CausalIncidentItem =
  DecodedIncidentEvent | ({ type?: number; carIndex?: number } & Record<string, unknown>);

export type ReplayControlRecord = Record<string, unknown>;
export type ReplayEventRecord = Record<string, unknown>;

export interface ReplaySnapshotBuffer extends Float32Array {
  tick?: number;
  controls?: CausalControlSlotItem[];
  incidents?: CausalIncidentItem[];
  signals?: Array<DecodedSignalEvent | Record<string, unknown>>;
  audioEvents?: Array<ReplayAudioCueEvent | Record<string, unknown>>;
}

export interface ReplayFrameSlotLike {
  snapshot?: ReplaySnapshotBuffer | Float32Array | null;
  acknowledgedControls?: CausalControlSlotItem[] | null;
  controls?: CausalControlSlotItem[] | null;
  incidents?: CausalIncidentItem[] | null;
  signals?: Array<DecodedSignalEvent | Record<string, unknown>> | null;
  audioEvents?: Array<ReplayAudioCueEvent | Record<string, unknown>> | null;
}

export interface ReplayCausalTimelineSource {
  frames: Array<ReplaySnapshotBuffer | Float32Array>;
  frameSlots?: ReplayFrameSlotLike[];
  stateInputTimeline?: {
    getFrameAt?: (frameIndex: number) => ReplayFrameSlotLike | null;
    getControlsAt?: (frameIndex: number) => CausalControlSlotItem[] | null;
  } | null;
  incidentTimeline?: {
    getEventsAtFrame?: (frameIndex: number) => CausalIncidentItem[] | null;
  } | null;
}

export interface NormalizedReplayFrameSlot {
  snapshot: ReplaySnapshotBuffer | Float32Array;
  controls: CausalControlSlotItem[];
  incidents?: CausalIncidentItem[];
}

export interface CausalHybridPhysicsPort {
  state: Float32Array;
  numCars?: number;
  isCarSlotActive?: (carIndex: number) => boolean;
  setBallState?: (ballSlice: Float32Array) => void;
  setCarState?: (carIndex: number, carSlice: Float32Array) => void;
  setControls?: (carIndex: number, controls: Record<string, unknown>) => void;
}

export interface CausalHybridStepParams {
  source: ReplayCausalTimelineSource;
  physics: CausalHybridPhysicsPort | null | undefined;
  currentReplayFrameIndex: number;
  activePovCarIndex: number;
  rosterCount: number;
}

export interface CausalHybridControlsParams {
  source: ReplayCausalTimelineSource;
  physics: CausalHybridPhysicsPort | null | undefined;
  frameIndex: number;
  activePovCarIndex: number;
  rosterCount: number;
  neutralControls: Record<string, unknown>;
}

const CAR_CAR_CAUSAL_RADIUS = 240.0;
const CAR_BALL_CAUSAL_RADIUS = 240.0;

export function getNormalizedReplayFrameSlot(
  source: ReplayCausalTimelineSource,
  frameIndex: number
): NormalizedReplayFrameSlot | null {
  if (!source || source.frames.length === 0) return null;
  const clampedIdx = Math.max(0, Math.min(source.frames.length - 1, Math.floor(frameIndex)));
  const slot =
    source.stateInputTimeline?.getFrameAt?.(clampedIdx) || source.frameSlots?.[clampedIdx] || null;
  const rawFrame = source.frames[clampedIdx] as ReplaySnapshotBuffer | undefined;
  const snapshot = slot?.snapshot || rawFrame;
  if (!snapshot) return null;
  const controls =
    slot?.acknowledgedControls ||
    slot?.controls ||
    source.stateInputTimeline?.getControlsAt?.(clampedIdx) ||
    rawFrame?.controls ||
    [];
  const incidents =
    source.incidentTimeline?.getEventsAtFrame?.(clampedIdx) ||
    slot?.incidents ||
    rawFrame?.incidents ||
    [];
  return { snapshot, controls, incidents };
}

export class ReplayCausalHybridEngine {
  public enabled = true;
  public readonly freeCarSet = new Set<number>();
  public isBallFree = false;

  clear(): void {
    this.freeCarSet.clear();
    this.isBallFree = false;
  }

  beginIntervention(activePovCarIndex: number): void {
    this.freeCarSet.clear();
    this.freeCarSet.add(activePovCarIndex);
    this.isBallFree = false;
  }

  stepBeforePhysics(params: CausalHybridStepParams): void {
    const { source, physics: sim, currentReplayFrameIndex, rosterCount } = params;
    if (!this.enabled || !sim || currentReplayFrameIndex >= source.frames.length) {
      return;
    }

    const slot = getNormalizedReplayFrameSlot(source, currentReplayFrameIndex);
    const snap = slot?.snapshot;
    if (!snap) return;

    const totalCars = Math.min(
      MAX_CARS,
      Math.max(sim.numCars || 1, rosterCount, Math.round(snap[SIM_OFFSETS.NUM_CARS] || 1))
    );

    const st = sim.state;
    const bOff = SIM_OFFSETS.BALL;
    const liveBx = st[bOff] || 0;
    const liveBy = st[bOff + 1] || 0;
    const liveBz = st[bOff + 2] || 0;
    const recBx = snap[bOff] || 0;
    const recBy = snap[bOff + 1] || 0;
    const recBz = snap[bOff + 2] || 0;

    let changed = true;
    while (changed) {
      changed = false;
      for (const freeCarIdx of this.freeCarSet) {
        const fcBase = SIM_OFFSETS.CARS + freeCarIdx * CAR_STATE_STRIDE;
        const fcx = st[fcBase] || 0;
        const fcy = st[fcBase + 1] || 0;
        const fcz = st[fcBase + 2] || 0;

        if (!this.isBallFree) {
          const recFcx = snap[fcBase] || 0;
          const recFcy = snap[fcBase + 1] || 0;
          const recFcz = snap[fcBase + 2] || 0;
          const nearLiveBall =
            Math.hypot(fcx - liveBx, fcy - liveBy, fcz - liveBz) <= CAR_BALL_CAUSAL_RADIUS;
          const nearRecordedBall =
            Math.hypot(recFcx - recBx, recFcy - recBy, recFcz - recBz) <= CAR_BALL_CAUSAL_RADIUS;
          if (nearLiveBall || nearRecordedBall) {
            this.isBallFree = true;
            changed = true;
          }
        }

        for (let c = 0; c < totalCars; c++) {
          if (this.freeCarSet.has(c)) continue;
          if (typeof sim.isCarSlotActive === 'function' && !sim.isCarSlotActive(c)) continue;
          const cBase = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
          const cx = st[cBase] || 0;
          const cy = st[cBase + 1] || 0;
          const cz = st[cBase + 2] || 0;
          if (Math.hypot(fcx - cx, fcy - cy, fcz - cz) <= CAR_CAR_CAUSAL_RADIUS) {
            this.freeCarSet.add(c);
            changed = true;
          }
        }
      }

      if (this.isBallFree) {
        for (let c = 0; c < totalCars; c++) {
          if (this.freeCarSet.has(c)) continue;
          if (typeof sim.isCarSlotActive === 'function' && !sim.isCarSlotActive(c)) continue;
          const cBase = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
          const cx = st[cBase] || 0;
          const cy = st[cBase + 1] || 0;
          const cz = st[cBase + 2] || 0;
          const nearLiveBall =
            Math.hypot(liveBx - cx, liveBy - cy, liveBz - cz) <= CAR_BALL_CAUSAL_RADIUS;
          const nearRecordedBall =
            Math.hypot(recBx - cx, recBy - cy, recBz - cz) <= CAR_BALL_CAUSAL_RADIUS;
          if (nearLiveBall || nearRecordedBall) {
            this.freeCarSet.add(c);
            changed = true;
          }
        }
      }
    }

    const getSlotFn = (frameIdx: number) => getNormalizedReplayFrameSlot(source, frameIdx);
    for (let c = 0; c < totalCars; c++) {
      if (this.freeCarSet.has(c)) continue;
      if (typeof sim.isCarSlotActive === 'function' && !sim.isCarSlotActive(c)) continue;
      const cBase = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
      sim.setCarState?.(c, snap.subarray(cBase, cBase + CAR_STATE_STRIDE));
      const reconstructed = reconstructCarTransientStateFromHistory(
        getSlotFn,
        currentReplayFrameIndex,
        c,
        60
      );
      if (reconstructed) {
        patchWasmCarTransientState(sim, c, reconstructed, false);
      }
    }
  }

  applyNonPovRecordedControls(params: CausalHybridControlsParams): void {
    const {
      source,
      physics: sim,
      frameIndex,
      activePovCarIndex,
      rosterCount,
      neutralControls,
    } = params;
    if (!sim || typeof sim.setControls !== 'function' || source.frames.length === 0) {
      return;
    }

    const clampedIdx = Math.max(0, Math.min(source.frames.length - 1, Math.floor(frameIndex)));
    const slot =
      source.stateInputTimeline?.getFrameAt?.(clampedIdx) ||
      source.frameSlots?.[clampedIdx] ||
      null;
    const rawFrame = source.frames[clampedIdx] as ReplaySnapshotBuffer | undefined;
    const controls =
      slot?.acknowledgedControls ||
      slot?.controls ||
      source.stateInputTimeline?.getControlsAt?.(clampedIdx) ||
      rawFrame?.controls;

    const appliedCars = new Set<number>();
    if (Array.isArray(controls) && frameIndex < source.frames.length) {
      for (let c = 0; c < Math.min(controls.length, MAX_CARS); c++) {
        const item = controls[c];
        if (!item) continue;
        const targetCarIdx = typeof item.carIndex === 'number' ? item.carIndex : c;
        if (targetCarIdx === activePovCarIndex) continue;
        const ctrlPayload = (item.controls || item) as Record<string, unknown>;
        if (ctrlPayload) {
          sim.setControls(targetCarIdx, ctrlPayload);
          appliedCars.add(targetCarIdx);
        }
      }
    }

    const totalCars = Math.min(MAX_CARS, Math.max(sim.numCars || 1, rosterCount));
    for (let c = 0; c < totalCars; c++) {
      if (c !== activePovCarIndex && !appliedCars.has(c)) {
        sim.setControls(c, neutralControls);
      }
    }
  }
}
