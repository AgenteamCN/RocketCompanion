/**
 * ballPredictionPipeline.ts
 * Zero-copy / marshaled TypeScript pipeline for RocketSim WebAssembly BallPredTracker C-ABI exports:
 * - _physics_initBallPrediction(maxSeconds)
 * - _physics_updateBallPrediction(maxSeconds)
 * - _physics_updateBallPredictionIncremental(maxSeconds)
 * - _physics_updateBallPredictionManual(maxSeconds, ticksSinceLastUpdate)
 * - _physics_getBallStateForTime(predTime, outSlice9)
 * - _physics_getBallPredictionStride()
 * - _physics_getBallPredictionPtr()
 * - _physics_getBallPredictionCount()
 */

import type { RocketSimWasmModule } from './RocketSimWasm.ts';
import {
  BALL_CONTROL_MODES,
  BALL_PRED_MAX_SECONDS,
  BALL_PRED_STRIDE,
} from './RocketSimConstants.ts';
import type { BallStateObjectInput } from './RocketSimSnapshotSerializer.ts';

export interface FreeplayCarPoseSlice {
  posX: number;
  posY: number;
  posZ: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
}

export interface PredictedBallStateSlice {
  pos: [number, number, number];
  vel: [number, number, number];
  angVel: [number, number, number];
}

/**
 * Compute the desired BallStateObjectInput for a given Freeplay ball control preset index (0..3:
 * takePossession, startDribble, passBall, launchBall).
 */
export function computeFreeplayBallControlState(
  carPose: FreeplayCarPoseSlice,
  mode: number | string
): BallStateObjectInput | null {
  const modeIndex = typeof mode === 'number' ? mode : BALL_CONTROL_MODES.indexOf(mode);
  if (modeIndex < 0 || modeIndex >= BALL_CONTROL_MODES.length) return null;

  switch (modeIndex) {
    case 0: // takePossession
      return {
        pos: [carPose.posX + carPose.fwdX * 215.39, carPose.posY + carPose.fwdY * 215.39, 93.25],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
      };
    case 1: // startDribble
      return {
        pos: [
          carPose.posX + carPose.fwdX * 30.0,
          carPose.posY + carPose.fwdY * 30.0,
          carPose.posZ + carPose.fwdZ * 30.0 + 141.33,
        ],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
      };
    case 2: // passBall
      return {
        pos: [0, 0, 93.15],
        vel: [1735.35, -2169.19, 403.76],
        angVel: [0, 0, 0],
      };
    case 3: // launchBall
      return {
        pos: [0, 0, 93.15],
        vel: [0, 0, 750.0],
        angVel: [0, 0, 0],
      };
    default:
      return null;
  }
}

function clampPredictionSeconds(maxSeconds: number): number {
  const sec = Number.isFinite(maxSeconds) ? maxSeconds : BALL_PRED_MAX_SECONDS;
  return Math.min(BALL_PRED_MAX_SECONDS + 0.05, Math.max(0.05, sec));
}

export function initWasmBallPrediction(
  wasmModule: RocketSimWasmModule | null,
  maxSeconds: number = BALL_PRED_MAX_SECONDS
): boolean {
  if (!wasmModule || typeof wasmModule._physics_initBallPrediction !== 'function') {
    return false;
  }
  wasmModule._physics_initBallPrediction(clampPredictionSeconds(maxSeconds));
  return true;
}

export function getWasmBallPredictionStride(wasmModule: RocketSimWasmModule | null): number {
  if (wasmModule && typeof wasmModule._physics_getBallPredictionStride === 'function') {
    const stride = wasmModule._physics_getBallPredictionStride();
    if (stride > 0) return stride;
  }
  return BALL_PRED_STRIDE;
}

export function getWasmBallPredictionCount(wasmModule: RocketSimWasmModule | null): number {
  return wasmModule?._physics_getBallPredictionCount?.() ?? 0;
}

export function updateWasmBallPrediction(
  wasmModule: RocketSimWasmModule | null,
  maxSeconds: number = BALL_PRED_MAX_SECONDS
): number {
  if (!wasmModule || typeof wasmModule._physics_updateBallPrediction !== 'function') {
    return 0;
  }
  wasmModule._physics_updateBallPrediction(clampPredictionSeconds(maxSeconds));
  return getWasmBallPredictionCount(wasmModule);
}

export function updateWasmBallPredictionIncremental(
  wasmModule: RocketSimWasmModule | null,
  maxSeconds: number = BALL_PRED_MAX_SECONDS
): number {
  if (!wasmModule) return 0;
  const clamped = clampPredictionSeconds(maxSeconds);
  if (typeof wasmModule._physics_updateBallPredictionIncremental === 'function') {
    wasmModule._physics_updateBallPredictionIncremental(clamped);
    return getWasmBallPredictionCount(wasmModule);
  }
  return updateWasmBallPrediction(wasmModule, clamped);
}

export function updateWasmBallPredictionManual(
  wasmModule: RocketSimWasmModule | null,
  maxSeconds: number = BALL_PRED_MAX_SECONDS,
  ticksSinceLastUpdate: number = 1
): number {
  if (!wasmModule) return 0;
  const clamped = clampPredictionSeconds(maxSeconds);
  const deltaTicks = Math.max(0, Math.trunc(ticksSinceLastUpdate));
  if (typeof wasmModule._physics_updateBallPredictionManual === 'function') {
    wasmModule._physics_updateBallPredictionManual(clamped, deltaTicks);
    return getWasmBallPredictionCount(wasmModule);
  }
  return updateWasmBallPredictionIncremental(wasmModule, clamped);
}

export function getWasmBallPredictionBuffer(
  wasmModule: RocketSimWasmModule | null
): Float32Array | null {
  if (!wasmModule) return null;
  const ptr = wasmModule._physics_getBallPredictionPtr?.() || 0;
  const count = getWasmBallPredictionCount(wasmModule);
  if (!ptr || count <= 0) return null;
  const stride = getWasmBallPredictionStride(wasmModule);
  return new Float32Array(wasmModule.HEAPF32.buffer, ptr, count * stride);
}

export function getWasmBallPredictionSlice(
  wasmModule: RocketSimWasmModule | null,
  stepIndex: number
): PredictedBallStateSlice | null {
  const buf = getWasmBallPredictionBuffer(wasmModule);
  if (!buf) return null;
  const stride = getWasmBallPredictionStride(wasmModule);
  const count = Math.floor(buf.length / stride);
  const idx = Math.trunc(stepIndex);
  if (idx < 0 || idx >= count) return null;
  const off = idx * stride;
  return {
    pos: [buf[off], buf[off + 1], buf[off + 2]],
    vel: [buf[off + 3], buf[off + 4], buf[off + 5]],
    angVel: stride >= 9 ? [buf[off + 6], buf[off + 7], buf[off + 8]] : [0, 0, 0],
  };
}

export function queryWasmBallStateForTime(
  wasmModule: RocketSimWasmModule | null,
  predTime: number
): PredictedBallStateSlice | null {
  if (!wasmModule || typeof wasmModule._physics_getBallStateForTime !== 'function') {
    return null;
  }
  const stride = getWasmBallPredictionStride(wasmModule);
  const ptr = wasmModule._malloc(stride * 4);
  if (!ptr) return null;
  try {
    const ok = wasmModule._physics_getBallStateForTime(predTime, ptr) === 1;
    if (!ok) return null;
    const s = new Float32Array(wasmModule.HEAPF32.buffer, ptr, stride);
    return {
      pos: [s[0], s[1], s[2]],
      vel: [s[3], s[4], s[5]],
      angVel: [s[6], s[7], s[8]],
    };
  } finally {
    wasmModule._free(ptr);
  }
}
