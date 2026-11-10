/**
 * wasmReplayTrackExtractor.ts
 * Pure WASM memory view extractor for replay state, incident, and signal byte tracks.
 */

export interface ExtractedWasmReplayTracks {
  frameCount: number;
  stateStride: number;
  incidentCount: number;
  signalCount: number;
  stateInputBytes: Uint8Array;
  incidentBytes: Uint8Array;
  signalBytes: Uint8Array;
}

export interface WasmReplayTrackModule {
  HEAPF32?: Float32Array;
  HEAPU8?: Uint8Array;
  _physics_getReplayFrameCount?(): number;
  _physics_getReplayStateStride?(): number;
  _physics_getReplayIncidentCount?(): number;
  _physics_getReplaySignalCount?(): number;
  _physics_getReplayFramePtr?(ticksAgo: number): number;
  _physics_getReplayFramePtrByIndex?(frameIndex: number): number;
  _physics_getReplayControlsPtrByIndex?(frameIndex: number): number;
  _physics_getReplayStateTrackPtr?(): number;
  _physics_getReplayIncidentTrackPtr?(): number;
  _physics_getReplaySignalTrackPtr?(): number;
}

export function getWasmReplayFrameByOffset(
  wasmModule: WasmReplayTrackModule | null | undefined,
  stateLen: number,
  ticksAgo = 0
): Float32Array | null {
  const ptr = wasmModule?._physics_getReplayFramePtr?.(ticksAgo) || 0;
  if (!ptr || !wasmModule?.HEAPF32?.buffer) return null;
  return new Float32Array(wasmModule.HEAPF32.buffer, ptr, stateLen);
}

export function getWasmReplayFrameByIndex(
  wasmModule: WasmReplayTrackModule | null | undefined,
  stateLen: number,
  frameIndex = 0
): Float32Array | null {
  const ptr = wasmModule?._physics_getReplayFramePtrByIndex?.(frameIndex) || 0;
  if (!ptr || !wasmModule?.HEAPF32?.buffer) return null;
  return new Float32Array(wasmModule.HEAPF32.buffer, ptr, stateLen);
}

export function getWasmReplayControlsByIndex(
  wasmModule: WasmReplayTrackModule | null | undefined,
  frameIndex = 0
): Uint8Array | null {
  const ptr = wasmModule?._physics_getReplayControlsPtrByIndex?.(frameIndex) || 0;
  if (!ptr || !wasmModule?.HEAPU8?.buffer) return null;
  return new Uint8Array(wasmModule.HEAPU8.buffer, ptr, 64);
}

export function getWasmReplayStateTrackBytes(
  wasmModule: WasmReplayTrackModule | null | undefined,
  frameCount = wasmModule?._physics_getReplayFrameCount?.() ?? 0,
  stateStride = wasmModule?._physics_getReplayStateStride?.() ?? 1856
): Uint8Array {
  const ptr = wasmModule?._physics_getReplayStateTrackPtr?.() || 0;
  if (!ptr || frameCount <= 0 || stateStride <= 0 || !wasmModule?.HEAPU8?.buffer) {
    return new Uint8Array(0);
  }
  return new Uint8Array(wasmModule.HEAPU8.buffer, ptr, frameCount * stateStride);
}

export function getWasmReplayIncidentTrackBytes(
  wasmModule: WasmReplayTrackModule | null | undefined,
  incidentCount = wasmModule?._physics_getReplayIncidentCount?.() ?? 0
): Uint8Array {
  const ptr = wasmModule?._physics_getReplayIncidentTrackPtr?.() || 0;
  if (!ptr || incidentCount <= 0 || !wasmModule?.HEAPU8?.buffer) {
    return new Uint8Array(0);
  }
  return new Uint8Array(wasmModule.HEAPU8.buffer, ptr, incidentCount * 64);
}

export function getWasmReplaySignalTrackBytes(
  wasmModule: WasmReplayTrackModule | null | undefined,
  signalCount = wasmModule?._physics_getReplaySignalCount?.() ?? 0
): Uint8Array {
  const ptr = wasmModule?._physics_getReplaySignalTrackPtr?.() || 0;
  if (!ptr || signalCount <= 0 || !wasmModule?.HEAPU8?.buffer) {
    return new Uint8Array(0);
  }
  return new Uint8Array(wasmModule.HEAPU8.buffer, ptr, signalCount * 64);
}

export function extractWasmReplayTracks(
  wasmModule: WasmReplayTrackModule | null | undefined,
  frameCount = wasmModule?._physics_getReplayFrameCount?.() ?? 0,
  stateStride = wasmModule?._physics_getReplayStateStride?.() ?? 1856,
  incidentCount = wasmModule?._physics_getReplayIncidentCount?.() ?? 0,
  signalCount = wasmModule?._physics_getReplaySignalCount?.() ?? 0
): ExtractedWasmReplayTracks {
  const stateView = getWasmReplayStateTrackBytes(wasmModule, frameCount, stateStride);
  const incidentView = getWasmReplayIncidentTrackBytes(wasmModule, incidentCount);
  const signalView = getWasmReplaySignalTrackBytes(wasmModule, signalCount);

  const stateInputBytes = new Uint8Array(stateView.byteLength);
  if (stateView.byteLength > 0) stateInputBytes.set(stateView);

  const incidentBytes = new Uint8Array(incidentView.byteLength);
  if (incidentView.byteLength > 0) incidentBytes.set(incidentView);

  const signalBytes = new Uint8Array(signalView.byteLength);
  if (signalView.byteLength > 0) signalBytes.set(signalView);

  return {
    frameCount,
    stateStride,
    incidentCount,
    signalCount,
    stateInputBytes,
    incidentBytes,
    signalBytes,
  };
}
