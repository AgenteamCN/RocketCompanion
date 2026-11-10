/**
 * CarTransientStateReconstructor.ts
 * Reconstructs transient RocketSim::CarState fields (flip torque/time, jump/double-jump/flip flags,
 * boosting hysteresis timer, powerslide ramp, lastControls, and ballHitInfo cooldown ticks)
 * from compact 448-float replay history for deterministic Replay Takeover.
 */

import {
  SIM_OFFSETS,
  CAR_STATE_STRIDE,
  CAR_STATE_OFFSETS,
  MAX_CARS,
} from './RocketSimConstants.ts';
import {
  restoreWasmSnapshotState,
  type RestoreSnapshotOptions,
  type RocketSimSnapshotMemoryViews,
  type RocketSimWasmModule,
} from './RocketSimSnapshotSerializer.ts';
import { writeCarControls } from './RocketSimEntityStateMutator.ts';
import {
  computeDodgeRelTorque,
  extractCarControlsFromFrameList,
  traceStreaksAndHandbrakeFromHistory,
  buildWarmupSnapshotPlan,
  mergeWarmedWheelStateIntoSnapshot,
  type ReplayHistoryControlItem,
  type ReplayHistoryFrameSlot,
  type ReplayFrameSlotAccessor,
  type ReconstructedCarTransientState,
} from './carTransientWarmupPipeline.ts';

export type {
  ReplayHistoryControlItem,
  ReplayHistoryFrameSlot,
  ReplayFrameSlotAccessor,
  ReconstructedCarTransientState,
};

const WASM_CAR_PTR_TABLE_BYTE_OFFSET = 62768;
const WASM_CAR_STATE_OFFSETS = Object.freeze({
  HAS_JUMPED: 1581,
  HAS_DOUBLE_JUMPED: 1582,
  HAS_FLIPPED: 1583,
  FLIP_REL_TORQUE_X: 1584,
  FLIP_REL_TORQUE_Y: 1588,
  FLIP_REL_TORQUE_Z: 1592,
  JUMP_TIME: 1600,
  FLIP_TIME: 1604,
  IS_FLIPPING: 1608,
  IS_JUMPING: 1609,
  AIR_TIME: 1612,
  AIR_TIME_SINCE_JUMP: 1616,
  IS_BOOSTING: 1628,
  BOOSTING_TIME: 1632,
  IS_SUPERSONIC: 1636,
  SUPERSONIC_TIME: 1640,
  HANDBRAKE_VAL: 1644,
  HAS_WORLD_CONTACT: 1664,
  BALL_HIT_INFO_IS_VALID: 1728,
  BALL_HIT_INFO_TICK_HIT: 1792,
  BALL_HIT_INFO_TICK_EXTRA_IMPULSE: 1800,
  LAST_CONTROLS_THROTTLE: 1808,
  LAST_CONTROLS_STEER: 1812,
  LAST_CONTROLS_PITCH: 1816,
  LAST_CONTROLS_YAW: 1820,
  LAST_CONTROLS_ROLL: 1824,
  LAST_CONTROLS_JUMP: 1828,
  LAST_CONTROLS_BOOST: 1829,
  LAST_CONTROLS_HANDBRAKE: 1830,
});

export interface ReconstructablePhysicsEngine extends Partial<RocketSimSnapshotMemoryViews> {
  module?: (RocketSimWasmModule & { HEAPU8?: Uint8Array }) | null;
  state: Float32Array;
  numCars?: number;
  stepSilent?: (ticks?: number) => void;
  clearEvents?: () => void;
  saveState?: () => Float32Array | null;
}

export function reconstructCarTransientStateFromHistory(
  getFrameSlotAt: ReplayFrameSlotAccessor,
  targetFrameIndex: number,
  carIndex: number,
  maxLookback = 300
): ReconstructedCarTransientState | null {
  const targetSlot = getFrameSlotAt(targetFrameIndex);
  const targetSnap = targetSlot?.snapshot;
  if (!targetSnap) return null;

  const carBase = SIM_OFFSETS.CARS + carIndex * CAR_STATE_STRIDE;
  const extBase = 416 + carIndex * 4;
  const isOnGround = (targetSnap[carBase + CAR_STATE_OFFSETS.ON_GROUND] || 0) > 0.5;
  const isSupersonic = (targetSnap[carBase + CAR_STATE_OFFSETS.SUPERSONIC] || 0) > 0.5;
  const hasFlipOrJump = (targetSnap[carBase + CAR_STATE_OFFSETS.HAS_FLIP_OR_JUMP] || 0) > 0.5;
  const isBoosting = (targetSnap[carBase + CAR_STATE_OFFSETS.IS_BOOSTING] || 0) > 0.5;
  const isFlipping = (targetSnap[carBase + CAR_STATE_OFFSETS.IS_FLIPPING] || 0) > 0.5;
  const isJumping = (targetSnap[extBase] || 0) > 0.5;
  const airTime = Number(targetSnap[extBase + 1] || 0);
  const jumpTime = Number(targetSnap[extBase + 2] || 0);
  const airTimeSinceJump = Number(targetSnap[extBase + 3] || 0);

  const dt = 1 / 120;
  const startLookback = Math.max(0, targetFrameIndex - maxLookback);

  let lastGroundFrame = targetFrameIndex;
  if (!isOnGround) {
    lastGroundFrame = startLookback;
    for (let f = targetFrameIndex - 1; f >= startLookback; f--) {
      const s = getFrameSlotAt(f)?.snapshot;
      if (s && (s[carBase + CAR_STATE_OFFSETS.ON_GROUND] || 0) > 0.5) {
        lastGroundFrame = f;
        break;
      }
    }
  }

  let hasJumped = 0;
  let hasDoubleJumped = 0;
  let hasFlipped = 0;
  let flipTime = 0;
  let flipRelTorque: [number, number, number] = [0, 0, 0];

  if (!isOnGround) {
    for (let f = lastGroundFrame + 1; f <= targetFrameIndex; f++) {
      const s = getFrameSlotAt(f)?.snapshot;
      if (s && (s[extBase] || 0) > 0.5) hasJumped = 1;
    }
    if (isJumping || jumpTime > 0 || airTimeSinceJump > 0) hasJumped = 1;

    let flipStartFrame = -1;
    for (let f = lastGroundFrame + 1; f <= targetFrameIndex; f++) {
      const s = getFrameSlotAt(f)?.snapshot;
      const prevS = getFrameSlotAt(f - 1)?.snapshot;
      const curFlip = s && (s[carBase + CAR_STATE_OFFSETS.IS_FLIPPING] || 0) > 0.5;
      const prevFlip = prevS && (prevS[carBase + CAR_STATE_OFFSETS.IS_FLIPPING] || 0) > 0.5;
      if (curFlip && !prevFlip) flipStartFrame = f;
    }

    if (flipStartFrame >= 0) {
      hasFlipped = 1;
      const elapsedFlipTicks = targetFrameIndex - flipStartFrame + 1;
      flipTime = isFlipping ? Math.min(0.65, elapsedFlipTicks * dt) : 0.65;
      const flipCtrl = extractCarControlsFromFrameList(
        getFrameSlotAt(flipStartFrame)?.controls,
        carIndex
      );
      if (flipCtrl)
        flipRelTorque = computeDodgeRelTorque(flipCtrl.pitch, flipCtrl.yaw, flipCtrl.roll);
    } else if (isFlipping) {
      hasFlipped = 1;
      const ctrl = extractCarControlsFromFrameList(targetSlot?.controls, carIndex);
      if (ctrl) flipRelTorque = computeDodgeRelTorque(ctrl.pitch, ctrl.yaw, ctrl.roll);
    }

    if (!hasFlipOrJump && !hasFlipped && (!hasJumped || airTimeSinceJump < 1.25)) {
      hasDoubleJumped = 1;
    }
  }

  const { boostingTime, supersonicTime, handbrakeVal } = traceStreaksAndHandbrakeFromHistory(
    getFrameSlotAt,
    targetFrameIndex,
    startLookback,
    carIndex,
    carBase,
    isBoosting,
    isSupersonic,
    dt
  );

  const lastCtrl = extractCarControlsFromFrameList(targetSlot?.controls, carIndex) || {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: isJumping,
    boost: isBoosting,
    handbrake: false,
  };

  return {
    lastGroundFrame,
    isOnGround,
    isJumping,
    isFlipping,
    isBoosting,
    isSupersonic,
    hasJumped,
    hasDoubleJumped,
    hasFlipped,
    flipRelTorque,
    flipTime,
    jumpTime,
    airTime,
    airTimeSinceJump,
    boostingTime,
    supersonicTime,
    handbrakeVal,
    hasWorldContact: 0,
    lastControls: lastCtrl,
  };
}

function verifyWasmCarStatePointerLayout(
  heapByteLength: number,
  dv: DataView,
  cPtr: number,
  carIndex: number
): boolean {
  if (cPtr <= 0 || cPtr + 1840 > heapByteLength || carIndex < 0 || carIndex >= MAX_CARS) {
    return false;
  }
  return (
    Number.isFinite(dv.getFloat32(cPtr + WASM_CAR_STATE_OFFSETS.AIR_TIME, true)) &&
    Number.isFinite(dv.getFloat32(cPtr + WASM_CAR_STATE_OFFSETS.BOOSTING_TIME, true))
  );
}

export function patchWasmCarTransientState(
  sim: ReconstructablePhysicsEngine | null | undefined,
  carIndex: number,
  rec: ReconstructedCarTransientState | null | undefined,
  resetBallHitInfo = true
): boolean {
  const heapU8 = sim?.module?.HEAPU8;
  if (!heapU8?.buffer || !rec) return false;
  const heapLen = heapU8.byteLength || 0;
  if (WASM_CAR_PTR_TABLE_BYTE_OFFSET + (carIndex + 1) * 4 > heapLen) return false;
  const dv = new DataView(heapU8.buffer);
  const cPtr = dv.getInt32(WASM_CAR_PTR_TABLE_BYTE_OFFSET + carIndex * 4, true);
  if (!cPtr || !verifyWasmCarStatePointerLayout(heapLen, dv, cPtr, carIndex)) return false;

  const O = WASM_CAR_STATE_OFFSETS;
  dv.setUint8(cPtr + O.HAS_JUMPED, rec.hasJumped ? 1 : 0);
  dv.setUint8(cPtr + O.HAS_DOUBLE_JUMPED, rec.hasDoubleJumped ? 1 : 0);
  dv.setUint8(cPtr + O.HAS_FLIPPED, rec.hasFlipped ? 1 : 0);
  dv.setFloat32(cPtr + O.FLIP_REL_TORQUE_X, rec.flipRelTorque[0] || 0, true);
  dv.setFloat32(cPtr + O.FLIP_REL_TORQUE_Y, rec.flipRelTorque[1] || 0, true);
  dv.setFloat32(cPtr + O.FLIP_REL_TORQUE_Z, rec.flipRelTorque[2] || 0, true);
  dv.setFloat32(cPtr + O.JUMP_TIME, rec.jumpTime || 0, true);
  dv.setFloat32(cPtr + O.FLIP_TIME, rec.flipTime || 0, true);
  dv.setUint8(cPtr + O.IS_FLIPPING, rec.isFlipping ? 1 : 0);
  dv.setUint8(cPtr + O.IS_JUMPING, rec.isJumping ? 1 : 0);
  dv.setFloat32(cPtr + O.AIR_TIME, rec.airTime || 0, true);
  dv.setFloat32(cPtr + O.AIR_TIME_SINCE_JUMP, rec.airTimeSinceJump || 0, true);
  dv.setUint8(cPtr + O.IS_BOOSTING, rec.isBoosting ? 1 : 0);
  dv.setFloat32(cPtr + O.BOOSTING_TIME, rec.boostingTime || 0, true);
  dv.setUint8(cPtr + O.IS_SUPERSONIC, rec.isSupersonic ? 1 : 0);
  dv.setFloat32(cPtr + O.SUPERSONIC_TIME, rec.supersonicTime || 0, true);
  dv.setFloat32(cPtr + O.HANDBRAKE_VAL, rec.handbrakeVal || 0, true);
  dv.setUint8(cPtr + O.HAS_WORLD_CONTACT, rec.hasWorldContact ? 1 : 0);

  if (resetBallHitInfo) {
    dv.setUint8(cPtr + O.BALL_HIT_INFO_IS_VALID, 0);
    dv.setBigInt64(cPtr + O.BALL_HIT_INFO_TICK_HIT, -1n, true);
    dv.setBigInt64(cPtr + O.BALL_HIT_INFO_TICK_EXTRA_IMPULSE, -1n, true);
  }

  const lc = rec.lastControls;
  if (lc) {
    dv.setFloat32(cPtr + O.LAST_CONTROLS_THROTTLE, Number(lc.throttle || 0), true);
    dv.setFloat32(cPtr + O.LAST_CONTROLS_STEER, Number(lc.steer || 0), true);
    dv.setFloat32(cPtr + O.LAST_CONTROLS_PITCH, Number(lc.pitch || 0), true);
    dv.setFloat32(cPtr + O.LAST_CONTROLS_YAW, Number(lc.yaw || 0), true);
    dv.setFloat32(cPtr + O.LAST_CONTROLS_ROLL, Number(lc.roll || 0), true);
    dv.setUint8(cPtr + O.LAST_CONTROLS_JUMP, lc.jump ? 1 : 0);
    dv.setUint8(cPtr + O.LAST_CONTROLS_BOOST, lc.boost ? 1 : 0);
    dv.setUint8(cPtr + O.LAST_CONTROLS_HANDBRAKE, lc.handbrake ? 1 : 0);
  }
  return true;
}

export function reconstructAndRestoreReplayFrame(
  sim: ReconstructablePhysicsEngine | null | undefined,
  getFrameSlotAt: ReplayFrameSlotAccessor,
  targetFrameIndex: number,
  restoreOptions: RestoreSnapshotOptions = {}
): boolean {
  const wasmMod = sim?.module;
  if (!wasmMod || typeof getFrameSlotAt !== 'function') return false;
  const targetSnap = getFrameSlotAt(targetFrameIndex)?.snapshot;
  if (!targetSnap) return false;
  const memViews = sim as RocketSimSnapshotMemoryViews;

  const numCars = Math.min(
    MAX_CARS,
    Math.max(1, Math.round(targetSnap[SIM_OFFSETS.NUM_CARS] || sim.numCars || 1))
  );
  const byCar = new Map<number, ReconstructedCarTransientState>();
  for (let c = 0; c < numCars; c++) {
    if (sim.isCarSlotActive && !sim.isCarSlotActive(c)) continue;
    const rec = reconstructCarTransientStateFromHistory(getFrameSlotAt, targetFrameIndex, c, 300);
    if (rec) byCar.set(c, rec);
  }

  let warmedSnap: Float32Array | null = null;
  if (targetFrameIndex > 0 && typeof sim.stepSilent === 'function') {
    const { warmupSnapshot, carInputs } = buildWarmupSnapshotPlan(
      targetSnap,
      targetFrameIndex,
      byCar,
      getFrameSlotAt,
      reconstructCarTransientStateFromHistory
    );
    for (const item of carInputs) {
      if (item.stepControls) writeCarControls(wasmMod, memViews, item.carIndex, item.stepControls);
    }
    restoreWasmSnapshotState(wasmMod, memViews, warmupSnapshot, restoreOptions);
    for (const item of carInputs) {
      if (item.preRec) patchWasmCarTransientState(sim, item.carIndex, item.preRec);
    }
    sim.stepSilent(1);
    sim.clearEvents?.();
    warmedSnap = sim.saveState?.() ?? null;
  }

  const ok = restoreWasmSnapshotState(wasmMod, memViews, targetSnap, restoreOptions);
  const desiredTick = Math.floor(sim.state?.[SIM_OFFSETS.TICK] || 0);
  for (const [c, rec] of byCar.entries()) patchWasmCarTransientState(sim, c, rec);

  const curSnap = warmedSnap && warmedSnap.length >= 4233 ? sim.saveState?.() : null;
  if (curSnap && warmedSnap) {
    mergeWarmedWheelStateIntoSnapshot(curSnap, warmedSnap, byCar);
    restoreWasmSnapshotState(wasmMod, memViews, curSnap);
    if (sim.state && Number.isFinite(desiredTick)) sim.state[SIM_OFFSETS.TICK] = desiredTick;
    for (const [c, rec] of byCar.entries()) patchWasmCarTransientState(sim, c, rec);
  }
  return ok;
}
