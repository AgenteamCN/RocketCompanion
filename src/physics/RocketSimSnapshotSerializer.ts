/**
 * RocketSimSnapshotSerializer.ts
 * Pure WASM linear-memory snapshot buffer management, full/compact snapshot save & restore,
 * and boost pad descriptor reader.
 */

import {
  SIM_OFFSETS,
  MAX_CARS,
  CAR_STATE_STRIDE,
  BALL_STATE_STRIDE,
} from './RocketSimConstants.ts';
import {
  sanitizeCarSliceInPlace,
  type RocketSimWasmModule,
  type RocketSimSnapshotMemoryViews,
  type CarControlsInput,
  type Vector3Like,
  type EulerRotationLike,
  type BallStateObjectInput,
  type CarStateObjectInput,
} from './RocketSimEntityStateMutator.ts';

export type {
  RocketSimWasmModule,
  RocketSimSnapshotMemoryViews,
  CarControlsInput,
  Vector3Like,
  EulerRotationLike,
  BallStateObjectInput,
  CarStateObjectInput,
};

export interface RestoreSnapshotOptions {
  overrideTick?: number;
  preserveEngineTick?: boolean;
  suppressBallWriteMark?: boolean;
}

export interface ArenaBoostPadDescriptor {
  pos: [number, number, number];
  isBig: boolean;
}

export type NumericBufferLike = ArrayLike<number> & {
  subarray?: (begin: number, end?: number) => ArrayLike<number>;
  slice?: (begin: number, end?: number) => ArrayLike<number>;
};

export function ensureWasmSnapshotBuffer(
  wasmModule: RocketSimWasmModule,
  memoryViews: RocketSimSnapshotMemoryViews,
  size: number
): void {
  if (!memoryViews.wasmStatePtr || memoryViews.wasmStateSize < size) {
    if (memoryViews.wasmStatePtr && wasmModule && typeof wasmModule._free === 'function') {
      wasmModule._free(memoryViews.wasmStatePtr);
    }
    Object.assign(memoryViews, {
      wasmStatePtr: wasmModule._malloc(size * 4),
      wasmStateSize: size,
      cachedSnapshotBuffer: new Float32Array(size),
    });
  }
}

export function saveWasmSnapshotState(
  wasmModule: RocketSimWasmModule,
  memoryViews: RocketSimSnapshotMemoryViews,
  targetBuffer: Float32Array | null = null
): Float32Array {
  const size =
    typeof wasmModule._physics_getStateSnapshotSize === 'function'
      ? wasmModule._physics_getStateSnapshotSize()
      : 4201;
  ensureWasmSnapshotBuffer(wasmModule, memoryViews, size);

  wasmModule._physics_saveState(memoryViews.wasmStatePtr);

  const offset = memoryViews.wasmStatePtr >> 2;
  const wasmSlice = wasmModule.HEAPF32.subarray(offset, offset + size);

  if (targetBuffer) {
    targetBuffer.set(wasmSlice);
    return targetBuffer;
  }

  const buf = new Float32Array(size);
  buf.set(wasmSlice);
  return buf;
}

export type RocketSimSnapshotContext = RocketSimSnapshotMemoryViews & {
  readonly module?: RocketSimWasmModule | null;
};

export function saveCompactStateSnapshot(
  ctxOrWasm: Pick<RocketSimSnapshotMemoryViews, 'state'> | RocketSimWasmModule,
  targetBufferOrViews: Float32Array | Pick<RocketSimSnapshotMemoryViews, 'state'> | null = null,
  maybeTargetBuffer: Float32Array | null = null
): Float32Array {
  const isTwoArgContext =
    ctxOrWasm &&
    'state' in ctxOrWasm &&
    !(
      targetBufferOrViews &&
      'state' in targetBufferOrViews &&
      !(targetBufferOrViews instanceof Float32Array)
    );
  const memoryViews = isTwoArgContext
    ? (ctxOrWasm as Pick<RocketSimSnapshotMemoryViews, 'state'>)
    : (targetBufferOrViews as Pick<RocketSimSnapshotMemoryViews, 'state'>);
  const targetBuffer = isTwoArgContext
    ? (targetBufferOrViews as Float32Array | null)
    : maybeTargetBuffer;
  const src = memoryViews.state;
  const len = src.length;
  const out = targetBuffer && targetBuffer.length >= len ? targetBuffer : new Float32Array(len);
  out.set(src);
  return out;
}

function isCarSlotActiveInMemory(
  wasmModule: RocketSimWasmModule,
  memoryViews: RocketSimSnapshotMemoryViews,
  carIndex: number,
  fallbackNumCars: number
): boolean {
  const slot = Number(carIndex) | 0;
  if (slot < 0 || slot >= MAX_CARS) return false;
  if (typeof memoryViews.isCarSlotActive === 'function') return memoryViews.isCarSlotActive(slot);
  if (typeof wasmModule._physics_isCarSlotActive === 'function')
    return wasmModule._physics_isCarSlotActive(slot) === 1;
  if (typeof wasmModule._physics_getActiveCarMask === 'function') {
    return (wasmModule._physics_getActiveCarMask() & 0xff & (1 << slot)) !== 0;
  }
  return slot < fallbackNumCars;
}

export function restoreWasmSnapshotState(
  wasmModule: RocketSimWasmModule,
  memoryViews: RocketSimSnapshotMemoryViews,
  buffer: NumericBufferLike | null | undefined,
  options: RestoreSnapshotOptions = {}
): boolean {
  if (!buffer) return false;
  const size = buffer.length;
  const fullSnapSize =
    typeof wasmModule._physics_getStateSnapshotSize === 'function'
      ? wasmModule._physics_getStateSnapshotSize()
      : 4201;

  const state = memoryViews.state;
  const currentNumCars = Math.max(0, Math.round(state?.[SIM_OFFSETS.NUM_CARS] || 0));

  if (size <= memoryViews.stateLen && size < fullSnapSize) {
    const currentEngineTick = Math.floor(state?.[SIM_OFFSETS.TICK] || 0);
    const preservedActiveCars = new Map<number, Float32Array>();
    if (state) {
      for (let c = 0; c < MAX_CARS; c++) {
        if (!isCarSlotActiveInMemory(wasmModule, memoryViews, c, currentNumCars)) continue;
        const carOff = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
        if (carOff + CAR_STATE_STRIDE > size || carOff + CAR_STATE_STRIDE > state.length) continue;
        const bufPx = buffer[carOff],
          bufPy = buffer[carOff + 1],
          bufPz = buffer[carOff + 2];
        const bufIsStagingOrInvalid =
          !Number.isFinite(bufPx) ||
          !Number.isFinite(bufPy) ||
          !Number.isFinite(bufPz) ||
          bufPx <= -5000 ||
          bufPz < -100;
        if (bufIsStagingOrInvalid) {
          const curPx = state[carOff],
            curPy = state[carOff + 1],
            curPz = state[carOff + 2];
          if (
            Number.isFinite(curPx) &&
            Number.isFinite(curPy) &&
            Number.isFinite(curPz) &&
            Math.abs(curPx) <= 4200 &&
            Math.abs(curPy) <= 6100 &&
            curPz >= -50 &&
            curPz <= 2150
          ) {
            preservedActiveCars.set(c, state.slice(carOff, carOff + CAR_STATE_STRIDE));
          }
        }
      }
    }

    const copyLen = Math.min(size, state.length);
    const sourceSlice = buffer.subarray
      ? buffer.subarray(0, copyLen)
      : buffer.slice
        ? buffer.slice(0, copyLen)
        : Array.from(buffer).slice(0, copyLen);
    state.subarray(0, copyLen).set(sourceSlice);
    for (const [c, savedSlice] of preservedActiveCars.entries()) {
      const carOff = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
      state.subarray(carOff, carOff + CAR_STATE_STRIDE).set(savedSlice);
    }
    if (typeof options?.overrideTick === 'number' && Number.isFinite(options.overrideTick)) {
      state[SIM_OFFSETS.TICK] = Math.max(16, Math.floor(options.overrideTick));
    } else if (options?.preserveEngineTick) {
      state[SIM_OFFSETS.TICK] = Math.max(16, currentEngineTick);
    }

    const ballOff = SIM_OFFSETS.BALL;
    const bPx = state[ballOff],
      bPy = state[ballOff + 1],
      bPz = state[ballOff + 2];
    if (
      !Number.isFinite(bPx) ||
      !Number.isFinite(bPy) ||
      !Number.isFinite(bPz) ||
      Math.abs(bPx) > 4200 ||
      Math.abs(bPy) > 6100 ||
      bPz < -50 ||
      bPz > 2150
    ) {
      state[ballOff] = 0;
      state[ballOff + 1] = 0;
      state[ballOff + 2] = 93.15;
      state[ballOff + 3] = 1;
      state[ballOff + 4] = 0;
      state[ballOff + 5] = 0;
      state[ballOff + 6] = 0;
      state[ballOff + 7] = 1;
      state[ballOff + 8] = 0;
      state[ballOff + 9] = 0;
      state[ballOff + 10] = 0;
      state[ballOff + 11] = 1;
      for (let k = 12; k < BALL_STATE_STRIDE; k++) state[ballOff + k] = 0;
    } else {
      const bR0Sq =
        state[ballOff + 3] * state[ballOff + 3] +
        state[ballOff + 4] * state[ballOff + 4] +
        state[ballOff + 5] * state[ballOff + 5];
      if (!Number.isFinite(bR0Sq) || bR0Sq < 0.25 || bR0Sq > 2.5) {
        state[ballOff + 3] = 1;
        state[ballOff + 4] = 0;
        state[ballOff + 5] = 0;
        state[ballOff + 6] = 0;
        state[ballOff + 7] = 1;
        state[ballOff + 8] = 0;
        state[ballOff + 9] = 0;
        state[ballOff + 10] = 0;
        state[ballOff + 11] = 1;
      }
      for (let k = 12; k < BALL_STATE_STRIDE; k++) {
        if (!Number.isFinite(state[ballOff + k]) || Math.abs(state[ballOff + k]) > 1e5) {
          state[ballOff + k] = 0;
        }
      }
    }

    const bufferNumCars = Math.min(
      MAX_CARS,
      Math.max(1, Math.round(buffer[SIM_OFFSETS.NUM_CARS] || currentNumCars || 1))
    );
    const totalSlotsToSanitize = Math.min(MAX_CARS, Math.max(currentNumCars || 1, bufferNumCars));
    const dirTelemetryOff = SIM_OFFSETS.CARS + 7 * CAR_STATE_STRIDE;
    const hasEmbeddedDirectorTelemetry =
      bufferNumCars <= 7 &&
      dirTelemetryOff + 10 <= buffer.length &&
      Math.abs(buffer[dirTelemetryOff] - 1337.5) <= 0.01;
    const endTelemetryOff = Math.min(buffer.length, dirTelemetryOff + 27);
    const savedDirectorTelemetry = hasEmbeddedDirectorTelemetry
      ? buffer.slice
        ? buffer.slice(dirTelemetryOff, endTelemetryOff)
        : buffer.subarray
          ? buffer.subarray(dirTelemetryOff, endTelemetryOff)
          : Array.from(buffer).slice(dirTelemetryOff, endTelemetryOff)
      : null;

    for (let c = 0; c < totalSlotsToSanitize; c++) {
      if (c === 7 && hasEmbeddedDirectorTelemetry) continue;
      const carOff = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
      if (carOff + CAR_STATE_STRIDE <= state.length) {
        const carSlice = state.subarray(carOff, carOff + CAR_STATE_STRIDE);
        const isSlotInactive = !isCarSlotActiveInMemory(wasmModule, memoryViews, c, bufferNumCars);
        sanitizeCarSliceInPlace(carSlice, c, isSlotInactive);
      }
    }

    if (typeof wasmModule?._physics_restoreCompactState === 'function') {
      const ok = wasmModule._physics_restoreCompactState(memoryViews.statePtr, copyLen) === 1;
      if (
        savedDirectorTelemetry &&
        dirTelemetryOff + savedDirectorTelemetry.length <= state.length
      ) {
        state
          .subarray(dirTelemetryOff, dirTelemetryOff + savedDirectorTelemetry.length)
          .set(savedDirectorTelemetry);
      }
      return ok;
    }
    if (savedDirectorTelemetry && dirTelemetryOff + savedDirectorTelemetry.length <= state.length) {
      state
        .subarray(dirTelemetryOff, dirTelemetryOff + savedDirectorTelemetry.length)
        .set(savedDirectorTelemetry);
    }
    return true;
  }

  ensureWasmSnapshotBuffer(wasmModule, memoryViews, size);

  const offset = memoryViews.wasmStatePtr >> 2;
  wasmModule.HEAPF32.subarray(offset, offset + size).set(buffer);
  const res = wasmModule._physics_restoreState(memoryViews.wasmStatePtr);
  return res === 1;
}

export function readArenaPads(
  wasmModule: RocketSimWasmModule,
  memoryViews: Pick<RocketSimSnapshotMemoryViews, 'state'>
): ArenaBoostPadDescriptor[] {
  const numPads = Math.max(0, Math.round(memoryViews.state?.[SIM_OFFSETS.NUM_PADS] || 0));
  const padPtr = wasmModule._physics_getPadInfoPtr();
  const padView = new Float32Array(wasmModule.HEAPF32.buffer, padPtr, numPads * 4);

  return Array.from({ length: numPads }, (_, idx) => ({
    pos: [padView[idx * 4], padView[idx * 4 + 1], padView[idx * 4 + 2]],
    isBig: padView[idx * 4 + 3] === 1,
  }));
}
