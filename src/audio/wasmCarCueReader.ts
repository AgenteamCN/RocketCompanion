/**
 * wasmCarCueReader.ts
 * Zero-allocation reader for the per-car `CarAcousticLoopPod` slices inside `AudioFrameCuePod`.
 * Rust owns every powertrain/granular decision; TypeScript only forwards these values to WebAudio.
 */

export const AUDIO_CUE_CARS_WORD_OFFSET = 22;
export const AUDIO_CUE_CAR_STRIDE_WORDS = 20;
export const MAX_WASM_CARS = 8;

export interface WasmCarAcousticCue {
  engineRpm: number;
  engineRpmNorm: number;
  engineLoad: number;
  engineGain: number;
  enginePitch: number;
  filterCutoffHz: number;
  idleGain: number;
  lowerSliceGain: number;
  upperSliceGain: number;
  lowerSliceRate: number;
  upperSliceRate: number;
  boostGain: number;
  boostPitch: number;
  supersonicGain: number;
  skidGain: number;
  airRollGain: number;
  spatialPan: number;
  dopplerPitch: number;
  distanceUu: number;
  packedFlags: number;
}

export interface WasmCarCueFrame {
  readonly cueWordBase: number;
  readonly awakeRemoteMask: number;
  readonly cars: WasmCarAcousticCue[];
}

function createCue(): WasmCarAcousticCue {
  return {
    engineRpm: 0,
    engineRpmNorm: 0,
    engineLoad: 0,
    engineGain: 0,
    enginePitch: 1,
    filterCutoffHz: 0,
    idleGain: 0,
    lowerSliceGain: 0,
    upperSliceGain: 0,
    lowerSliceRate: 1,
    upperSliceRate: 1,
    boostGain: 0,
    boostPitch: 1,
    supersonicGain: 0,
    skidGain: 0,
    airRollGain: 0,
    spatialPan: 0,
    dopplerPitch: 1,
    distanceUu: 0,
    packedFlags: 0,
  };
}

const reusableCars: WasmCarAcousticCue[] = Array.from({ length: MAX_WASM_CARS }, createCue);
const reusableFrame = { cueWordBase: 0, awakeRemoteMask: 0, cars: reusableCars };

export function readWasmCarCues(
  f32: Float32Array,
  u32: Uint32Array,
  cueWordBase: number
): WasmCarCueFrame {
  for (let car = 0; car < MAX_WASM_CARS; car++) {
    const off = cueWordBase + AUDIO_CUE_CARS_WORD_OFFSET + car * AUDIO_CUE_CAR_STRIDE_WORDS;
    const cue = reusableCars[car];
    cue.engineRpm = f32[off + 0];
    cue.engineRpmNorm = f32[off + 1];
    cue.engineLoad = f32[off + 2];
    cue.engineGain = f32[off + 3];
    cue.enginePitch = f32[off + 4];
    cue.filterCutoffHz = f32[off + 5];
    cue.idleGain = f32[off + 6];
    cue.lowerSliceGain = f32[off + 7];
    cue.upperSliceGain = f32[off + 8];
    cue.lowerSliceRate = f32[off + 9];
    cue.upperSliceRate = f32[off + 10];
    cue.boostGain = f32[off + 11];
    cue.boostPitch = f32[off + 12];
    cue.supersonicGain = f32[off + 13];
    cue.skidGain = f32[off + 14];
    cue.airRollGain = f32[off + 15];
    cue.spatialPan = f32[off + 16];
    cue.dopplerPitch = f32[off + 17];
    cue.distanceUu = f32[off + 18];
    cue.packedFlags = u32[off + 19];
  }
  reusableFrame.cueWordBase = cueWordBase;
  reusableFrame.awakeRemoteMask = u32[cueWordBase + 3];
  return reusableFrame;
}

export function isCarCueDormant(cue: WasmCarAcousticCue | null | undefined): boolean {
  return !cue || (cue.packedFlags & (1 << 1)) !== 0;
}

export function isCarCuePrimary(cue: WasmCarAcousticCue | null | undefined): boolean {
  return Boolean(cue && (cue.packedFlags & (1 << 2)) !== 0);
}

export function readCarCueGear(cue: WasmCarAcousticCue | null | undefined): number {
  return cue ? (cue.packedFlags >>> 8) & 0xff : 0;
}
