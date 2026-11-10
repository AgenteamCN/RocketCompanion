/**
 * carTransientWarmupPipeline.ts
 * Pure helper pipeline for dodge torque calculation, control extraction,
 * transient history state reconstruction, 1-tick ground/suspension warmup snapshots,
 * and wheel contact/suspension state merging during Replay Takeover.
 */

import { SIM_OFFSETS, CAR_STATE_STRIDE, CAR_STATE_OFFSETS } from './RocketSimConstants.ts';
import type { CarControlsInput } from './RocketSimSnapshotSerializer.ts';

export interface ReplayHistoryControlItem extends CarControlsInput {
  carIndex?: number;
  controls?: CarControlsInput;
}

export interface ReplayHistoryFrameSlot {
  snapshot?: Float32Array | null;
  controls?: ReplayHistoryControlItem[] | null;
}

export type ReplayFrameSlotAccessor = (
  frameIndex: number
) => ReplayHistoryFrameSlot | null | undefined;

export interface ReconstructedCarTransientState {
  lastGroundFrame: number;
  isOnGround: boolean;
  isJumping: boolean;
  isFlipping: boolean;
  isBoosting: boolean;
  isSupersonic: boolean;
  hasJumped: number;
  hasDoubleJumped: number;
  hasFlipped: number;
  flipRelTorque: [number, number, number];
  flipTime: number;
  jumpTime: number;
  airTime: number;
  airTimeSinceJump: number;
  boostingTime: number;
  supersonicTime: number;
  handbrakeVal: number;
  hasWorldContact: number;
  lastControls: CarControlsInput;
}

export function computeDodgeRelTorque(
  pitch?: number,
  yaw?: number,
  roll?: number
): [number, number, number] {
  const dirX = -Number(pitch || 0);
  const dirY = Number(yaw || 0) + Number(roll || 0);
  const mag = Math.hypot(dirX, dirY);
  if (mag < 0.05) return [0, 0, 0];
  return [-dirY / mag, dirX / mag, 0];
}

export function extractCarControlsFromFrameList(
  controlsList: ReplayHistoryControlItem[] | null | undefined,
  carIndex: number
): CarControlsInput | null {
  if (!Array.isArray(controlsList)) return null;
  for (let i = 0; i < controlsList.length; i++) {
    const item = controlsList[i];
    if (!item) continue;
    const idx = typeof item.carIndex === 'number' ? item.carIndex : i;
    if (idx === carIndex) return item.controls || item;
  }
  return null;
}

export function traceStreaksAndHandbrakeFromHistory(
  getFrameSlotAt: ReplayFrameSlotAccessor,
  targetFrameIndex: number,
  startLookback: number,
  carIndex: number,
  carBase: number,
  isBoosting: boolean,
  isSupersonic: boolean,
  dt: number
): { boostingTime: number; supersonicTime: number; handbrakeVal: number } {
  let boostingTime = 0;
  if (isBoosting) {
    let boostStreak = 0;
    for (let f = targetFrameIndex; f >= startLookback; f--) {
      const s = getFrameSlotAt(f)?.snapshot;
      if (s && (s[carBase + CAR_STATE_OFFSETS.IS_BOOSTING] || 0) > 0.5) boostStreak++;
      else break;
    }
    boostingTime = boostStreak * dt;
  }

  let supersonicTime = 0;
  if (isSupersonic) {
    let ssStreak = 0;
    for (let f = targetFrameIndex; f >= startLookback; f--) {
      const s = getFrameSlotAt(f)?.snapshot;
      if (s && (s[carBase + CAR_STATE_OFFSETS.SUPERSONIC] || 0) > 0.5) ssStreak++;
      else break;
    }
    supersonicTime = ssStreak * dt;
  }

  let handbrakeVal = 0;
  const hbStartFrame = Math.max(startLookback, targetFrameIndex - 60);
  for (let f = hbStartFrame; f <= targetFrameIndex; f++) {
    const ctrl = extractCarControlsFromFrameList(getFrameSlotAt(f)?.controls, carIndex);
    if (ctrl?.handbrake) handbrakeVal = Math.min(1.0, handbrakeVal + 5.0 * dt);
    else handbrakeVal = Math.max(0.0, handbrakeVal - 2.0 * dt);
  }

  return { boostingTime, supersonicTime, handbrakeVal };
}

export interface WarmupCarStepInput {
  carIndex: number;
  preRec: ReconstructedCarTransientState | null;
  stepControls: CarControlsInput | null;
}

export interface WarmupSnapshotPlan {
  warmupSnapshot: Float32Array;
  carInputs: WarmupCarStepInput[];
}

export function buildWarmupSnapshotPlan(
  targetSnap: Float32Array,
  targetFrameIndex: number,
  byCar: ReadonlyMap<number, ReconstructedCarTransientState>,
  getFrameSlotAt: ReplayFrameSlotAccessor,
  reconstructFn: (
    accessor: ReplayFrameSlotAccessor,
    frameIdx: number,
    carIdx: number,
    maxLookback: number
  ) => ReconstructedCarTransientState | null
): WarmupSnapshotPlan {
  const warmupSnapshot = new Float32Array(targetSnap);
  const carInputs: WarmupCarStepInput[] = [];

  for (const [c, rec] of byCar.entries()) {
    const wIdx = Math.max(0, (rec.lastGroundFrame || targetFrameIndex) - 1);
    const wSlot = getFrameSlotAt(wIdx);
    const nextSlot = getFrameSlotAt(wIdx + 1) || wSlot;
    if (wSlot?.snapshot) {
      const cBase = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
      warmupSnapshot
        .subarray(cBase, cBase + CAR_STATE_STRIDE)
        .set(wSlot.snapshot.subarray(cBase, cBase + CAR_STATE_STRIDE));
      const eBase = 416 + c * 4;
      if (wSlot.snapshot.length >= eBase + 4 && warmupSnapshot.length >= eBase + 4) {
        warmupSnapshot.subarray(eBase, eBase + 4).set(wSlot.snapshot.subarray(eBase, eBase + 4));
      }
    }
    const preRec = reconstructFn(getFrameSlotAt, wIdx, c, 180);
    const stepControls = extractCarControlsFromFrameList(nextSlot?.controls, c);
    carInputs.push({ carIndex: c, preRec, stepControls });
  }

  warmupSnapshot[SIM_OFFSETS.BALL + 2] = 1900;
  warmupSnapshot[SIM_OFFSETS.BALL + 12] = 0;
  warmupSnapshot[SIM_OFFSETS.BALL + 13] = 0;
  warmupSnapshot[SIM_OFFSETS.BALL + 14] = 0;

  return { warmupSnapshot, carInputs };
}

export function mergeWarmedWheelStateIntoSnapshot(
  curSnap: Float32Array,
  warmedSnap: Float32Array,
  byCar: ReadonlyMap<number, ReconstructedCarTransientState>
): void {
  for (const [c, rec] of byCar.entries()) {
    const wStart = 169 + c * 508 + 124;
    if (wStart + 384 <= curSnap.length) {
      if (rec.isOnGround) {
        curSnap
          .subarray(wStart, wStart + 384)
          .set(warmedSnap.subarray(wStart, Math.min(warmedSnap.length, wStart + 384)));
      } else {
        for (let w = 0; w < 4; w++) {
          const wOff = wStart + w * 96;
          curSnap[wOff + 84] = warmedSnap[wOff + 84];
          curSnap[wOff + 85] = warmedSnap[wOff + 85];
        }
      }
    }
  }
}
