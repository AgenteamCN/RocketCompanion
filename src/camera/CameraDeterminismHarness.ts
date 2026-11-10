/**
 * CameraDeterminismHarness.ts
 * Side-by-Side POV Camera Determinism & Equivalence Verification Harness.
 */

import { CleanPovCameraKernel } from './CleanPovCameraKernel.ts';
import {
  PRE_TRIGGER_FRAME_LIMIT,
  POST_TRIGGER_FRAME_LIMIT,
  MAX_CAPTURED_FRAMES,
  CAMERA_CAPTURE_STATES,
  CAMERA_SOURCE_MODES,
} from '../ui-core/config/cameraDefaults.ts';

const CSV_COLUMNS = [
  'frame_index',
  'capture_phase',
  'timestamp_ms',
  'did_reset',
  'in_dt',
  'in_ball_cam',
  'in_car_pos_x',
  'in_car_pos_y',
  'in_car_pos_z',
  'in_car_quat_x',
  'in_car_quat_y',
  'in_car_quat_z',
  'in_car_quat_w',
  'in_ball_pos_x',
  'in_ball_pos_y',
  'in_ball_pos_z',
  'in_flags',
  'in_on_ground',
  'in_ground_normal_x',
  'in_ground_normal_y',
  'in_ground_normal_z',
  'in_vel_x',
  'in_vel_y',
  'in_vel_z',
  'in_supersonic',
  'in_fov',
  'in_distance',
  'in_height',
  'in_angle_deg',
  'in_stiffness',
  'in_transition_speed',
  'in_aspect',
  'in_look_x',
  'in_look_y',
  'in_swivel_speed',
  'in_invert_swivel',
  'wasm_pos_x',
  'wasm_pos_y',
  'wasm_pos_z',
  'wasm_dir_x',
  'wasm_dir_y',
  'wasm_dir_z',
  'wasm_up_x',
  'wasm_up_y',
  'wasm_up_z',
  'wasm_fov',
  'clean_pos_x',
  'clean_pos_y',
  'clean_pos_z',
  'clean_dir_x',
  'clean_dir_y',
  'clean_dir_z',
  'clean_up_x',
  'clean_up_y',
  'clean_up_z',
  'clean_fov',
  'delta_pos',
  'delta_dir',
  'delta_up',
  'delta_fov',
  'max_rel_error',
];

export interface CameraFrameRecord {
  frameIndex: number;
  capturePhase: string;
  timestampMs: number;
  didReset: number;
  input: Float64Array;
  wasmOutput: Float64Array;
  cleanOutput: Float64Array;
  deltaPos: number;
  deltaDir: number;
  deltaUp: number;
  deltaFov: number;
  maxRelError: number;
}

export class CameraDeterminismMetricsState {
  frameIndex = 0;
  activeSource: string = CAMERA_SOURCE_MODES.CLEAN_JS;
  captureState: string = CAMERA_CAPTURE_STATES.MONITORING;
  preBufferCount = 0;
  postBufferCount = 0;
  totalCapturedCount = 0;
  triggerFrameIndex = -1;
  deltaPos = 0;
  deltaDir = 0;
  deltaUp = 0;
  deltaFov = 0;
  maxRelError = 0;
  peakDeltaPos = 0;
  peakDeltaDir = 0;
  peakDeltaUp = 0;
  peakDeltaFov = 0;
  peakRelError = 0;
  divergenceCount = 0;
  isMatching = true;

  resetCaptureAndPeaks(): void {
    this.captureState = CAMERA_CAPTURE_STATES.MONITORING;
    this.preBufferCount = 0;
    this.postBufferCount = 0;
    this.totalCapturedCount = 0;
    this.triggerFrameIndex = -1;
    this.peakDeltaPos = 0;
    this.peakDeltaDir = 0;
    this.peakDeltaUp = 0;
    this.peakDeltaFov = 0;
    this.peakRelError = 0;
    this.divergenceCount = 0;
    this.isMatching = true;
  }

  beginPostCapture(triggerFrameIdx: number, capturedCount: number): void {
    this.captureState = CAMERA_CAPTURE_STATES.CAPTURING_POST;
    this.triggerFrameIndex = triggerFrameIdx;
    this.postBufferCount = 0;
    this.totalCapturedCount = capturedCount;
  }

  recordFrameComparison(
    frameIdx: number,
    deltaPos: number,
    deltaDir: number,
    deltaUp: number,
    deltaFov: number,
    maxRelError: number,
    isDivergent: boolean
  ): boolean {
    this.frameIndex = frameIdx;
    this.deltaPos = deltaPos;
    this.deltaDir = deltaDir;
    this.deltaUp = deltaUp;
    this.deltaFov = deltaFov;
    this.maxRelError = maxRelError;

    if (deltaPos > this.peakDeltaPos) this.peakDeltaPos = deltaPos;
    if (deltaDir > this.peakDeltaDir) this.peakDeltaDir = deltaDir;
    if (deltaUp > this.peakDeltaUp) this.peakDeltaUp = deltaUp;
    if (deltaFov > this.peakDeltaFov) this.peakDeltaFov = deltaFov;
    if (maxRelError > this.peakRelError) this.peakRelError = maxRelError;

    let stateChanged = false;
    if (isDivergent) {
      this.divergenceCount += 1;
      if (this.isMatching) {
        this.isMatching = false;
        stateChanged = true;
      }
    }
    return stateChanged;
  }

  updateBufferCounts(
    preCount: number,
    postCount: number,
    totalCount: number,
    captureState: string
  ): void {
    this.preBufferCount = preCount;
    this.postBufferCount = postCount;
    this.totalCapturedCount = totalCount;
    this.captureState = captureState;
  }
}

export type CameraDeterminismListener = (metrics: CameraDeterminismMetricsState) => void;

export interface CameraStepKernelPort {
  stepView(inputArray?: ArrayLike<number>): Float64Array;
}

function createEmptyFrameRecord(): CameraFrameRecord {
  return {
    frameIndex: 0,
    capturePhase: 'pre_trigger',
    timestampMs: 0,
    didReset: 0,
    input: new Float64Array(32),
    wasmOutput: new Float64Array(10),
    cleanOutput: new Float64Array(10),
    deltaPos: 0,
    deltaDir: 0,
    deltaUp: 0,
    deltaFov: 0,
    maxRelError: 0,
  };
}

function copyFrameRecord(dst: CameraFrameRecord, src: CameraFrameRecord): void {
  dst.frameIndex = src.frameIndex;
  dst.capturePhase = src.capturePhase;
  dst.timestampMs = src.timestampMs;
  dst.didReset = src.didReset;
  dst.input.set(src.input);
  dst.wasmOutput.set(src.wasmOutput);
  dst.cleanOutput.set(src.cleanOutput);
  dst.deltaPos = src.deltaPos;
  dst.deltaDir = src.deltaDir;
  dst.deltaUp = src.deltaUp;
  dst.deltaFov = src.deltaFov;
  dst.maxRelError = src.maxRelError;
}

function populateFrameRecord(
  dst: CameraFrameRecord,
  frameIdx: number,
  phase: string,
  nowMs: number,
  didReset: number,
  inputArray: Float64Array,
  wasmView: Float64Array,
  cleanView: Float64Array,
  deltaPos: number,
  deltaDir: number,
  deltaUp: number,
  deltaFov: number,
  maxRelError: number
): void {
  dst.frameIndex = frameIdx;
  dst.capturePhase = phase;
  dst.timestampMs = nowMs;
  dst.didReset = didReset;
  dst.input.set(inputArray);
  for (let i = 0; i < 10; i++) {
    dst.wasmOutput[i] = wasmView[32 + i];
    dst.cleanOutput[i] = cleanView[32 + i];
  }
  dst.deltaPos = deltaPos;
  dst.deltaDir = deltaDir;
  dst.deltaUp = deltaUp;
  dst.deltaFov = deltaFov;
  dst.maxRelError = maxRelError;
}

function formatPrecision8(val: number): string {
  if (typeof val !== 'number' || !Number.isFinite(val) || val === 0) return '0';
  return Number(val.toPrecision(8)).toString();
}

export class CameraDeterminismHarness {
  _lastNotifyTimeMs = 0;
  _listeners: Set<CameraDeterminismListener> = new Set();
  activeSource: string = CAMERA_SOURCE_MODES.CLEAN_JS;
  autoCaptureEnabled = true;
  captureState: string = CAMERA_CAPTURE_STATES.MONITORING;
  capturedFrameCount = 0;
  capturedFramesBuffer: CameraFrameRecord[];
  cleanKernel = new CleanPovCameraKernel();
  dirTolerance = 1e-4;
  fovTolerance = 1e-3;
  metrics = new CameraDeterminismMetricsState();
  pendingResetFlag = 0;
  posTolerance = 0.01;
  postRemainingFrames = 0;
  preBufferedCount = 0;
  preRingBuffer: CameraFrameRecord[];
  preWriteCursor = 0;
  upTolerance = 1e-4;

  constructor() {
    this.preRingBuffer = Array.from({ length: PRE_TRIGGER_FRAME_LIMIT }, createEmptyFrameRecord);
    this.capturedFramesBuffer = Array.from({ length: MAX_CAPTURED_FRAMES }, createEmptyFrameRecord);
  }

  get capturedFrames(): CameraFrameRecord[] {
    return this.capturedFramesBuffer.slice(0, this.capturedFrameCount);
  }

  subscribe(listener: CameraDeterminismListener): () => void {
    if (typeof listener === 'function') {
      this._listeners.add(listener);
      return () => this._listeners.delete(listener);
    }
    return () => {};
  }

  _notify(): void {
    for (const listener of this._listeners) {
      try {
        listener(this.metrics);
      } catch (err) {
        console.error('[CameraDeterminismHarness] Listener error:', err);
      }
    }
  }

  setActiveSource(source: string): void {
    if (source === CAMERA_SOURCE_MODES.WASM || source === CAMERA_SOURCE_MODES.CLEAN_JS) {
      this.activeSource = source;
      this.metrics.activeSource = source;
      this._notify();
    }
  }

  toggleActiveSource(): string {
    const next =
      this.activeSource === CAMERA_SOURCE_MODES.CLEAN_JS
        ? CAMERA_SOURCE_MODES.WASM
        : CAMERA_SOURCE_MODES.CLEAN_JS;
    this.setActiveSource(next);
    return next;
  }

  setPosTolerance(tolerance: number | string): void {
    const parsed = Number(tolerance);
    if (Number.isFinite(parsed) && parsed >= 0) {
      this.posTolerance = parsed;
      this._notify();
    }
  }

  onResetView(): void {
    this.cleanKernel.resetView();
    this.pendingResetFlag = 1;
  }

  resetCaptureAndPeaks(): void {
    this.preWriteCursor = 0;
    this.preBufferedCount = 0;
    this.capturedFrameCount = 0;
    this.postRemainingFrames = 0;
    this.captureState = CAMERA_CAPTURE_STATES.MONITORING;
    this.metrics.resetCaptureAndPeaks();
    this._notify();
  }

  triggerManualCapture(): void {
    if (this.captureState !== CAMERA_CAPTURE_STATES.MONITORING) return;
    this._lockPreBufferAndStartPostCapture(this.metrics.frameIndex);
    this._notify();
  }

  _lockPreBufferAndStartPostCapture(triggerFrameIdx: number): void {
    const count = this.preBufferedCount;
    const startIdx =
      (this.preWriteCursor - count + PRE_TRIGGER_FRAME_LIMIT) % PRE_TRIGGER_FRAME_LIMIT;
    for (let i = 0; i < count; i++) {
      const slot = (startIdx + i) % PRE_TRIGGER_FRAME_LIMIT;
      const targetRecord = this.capturedFramesBuffer[i];
      copyFrameRecord(targetRecord, this.preRingBuffer[slot]);
      targetRecord.capturePhase = i === count - 1 ? 'trigger_frame' : 'pre_trigger';
    }
    this.capturedFrameCount = count;
    this.captureState = CAMERA_CAPTURE_STATES.CAPTURING_POST;
    this.postRemainingFrames = POST_TRIGGER_FRAME_LIMIT;
    this.metrics.beginPostCapture(triggerFrameIdx, this.capturedFrameCount);
  }

  stepAndCompare(
    wasmKernel: CameraStepKernelPort,
    inputArray: Float64Array,
    preferredSource: string | null = null
  ): Float64Array {
    const wasmView = wasmKernel.stepView(inputArray);
    const cleanView = this.cleanKernel.stepView(inputArray);
    const frameIdx = this.metrics.frameIndex + 1;

    const deltaPos = Math.hypot(
      wasmView[32] - cleanView[32],
      wasmView[33] - cleanView[33],
      wasmView[34] - cleanView[34]
    );
    const deltaDir = Math.hypot(
      wasmView[35] - cleanView[35],
      wasmView[36] - cleanView[36],
      wasmView[37] - cleanView[37]
    );
    const deltaUp = Math.hypot(
      wasmView[38] - cleanView[38],
      wasmView[39] - cleanView[39],
      wasmView[40] - cleanView[40]
    );
    const deltaFov = Math.abs(wasmView[41] - cleanView[41]);

    let maxRelError = 0;
    for (let k = 32; k < 42; k++) {
      const wVal = wasmView[k],
        cVal = cleanView[k];
      const rel = Math.abs(wVal - cVal) / Math.max(1.0, Math.abs(wVal), Math.abs(cVal));
      if (rel > maxRelError) maxRelError = rel;
    }

    const isDivergent =
      deltaPos > this.posTolerance ||
      deltaDir > this.dirTolerance ||
      deltaUp > this.upTolerance ||
      deltaFov > this.fovTolerance;

    let stateChanged = this.metrics.recordFrameComparison(
      frameIdx,
      deltaPos,
      deltaDir,
      deltaUp,
      deltaFov,
      maxRelError,
      isDivergent
    );

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const didReset = this.pendingResetFlag;
    this.pendingResetFlag = 0;

    if (this.captureState === CAMERA_CAPTURE_STATES.MONITORING) {
      populateFrameRecord(
        this.preRingBuffer[this.preWriteCursor],
        frameIdx,
        'pre_trigger',
        nowMs,
        didReset,
        inputArray,
        wasmView,
        cleanView,
        deltaPos,
        deltaDir,
        deltaUp,
        deltaFov,
        maxRelError
      );
      this.preWriteCursor = (this.preWriteCursor + 1) % PRE_TRIGGER_FRAME_LIMIT;
      if (this.preBufferedCount < PRE_TRIGGER_FRAME_LIMIT) this.preBufferedCount += 1;
      this.metrics.updateBufferCounts(
        this.preBufferedCount,
        0,
        this.preBufferedCount,
        this.captureState
      );

      if (isDivergent && this.autoCaptureEnabled) {
        this._lockPreBufferAndStartPostCapture(frameIdx);
        stateChanged = true;
      }
    } else if (this.captureState === CAMERA_CAPTURE_STATES.CAPTURING_POST) {
      if (this.capturedFrameCount < MAX_CAPTURED_FRAMES) {
        populateFrameRecord(
          this.capturedFramesBuffer[this.capturedFrameCount],
          frameIdx,
          'post_trigger',
          nowMs,
          didReset,
          inputArray,
          wasmView,
          cleanView,
          deltaPos,
          deltaDir,
          deltaUp,
          deltaFov,
          maxRelError
        );
        this.capturedFrameCount += 1;
      }
      this.postRemainingFrames -= 1;
      if (this.postRemainingFrames <= 0) {
        this.captureState = CAMERA_CAPTURE_STATES.CAPTURED_READY;
        stateChanged = true;
      }
      this.metrics.updateBufferCounts(
        this.preBufferedCount,
        POST_TRIGGER_FRAME_LIMIT - this.postRemainingFrames,
        this.capturedFrameCount,
        this.captureState
      );
    }

    const effectiveSource = preferredSource || this.activeSource;
    if (stateChanged || nowMs - this._lastNotifyTimeMs >= 60) {
      this._lastNotifyTimeMs = nowMs;
      this._notify();
    }
    return effectiveSource === CAMERA_SOURCE_MODES.CLEAN_JS ? cleanView : wasmView;
  }

  buildCsvString(): string {
    let records: CameraFrameRecord[] = [];
    if (
      this.captureState === CAMERA_CAPTURE_STATES.CAPTURING_POST ||
      this.captureState === CAMERA_CAPTURE_STATES.CAPTURED_READY
    ) {
      records = this.capturedFramesBuffer.slice(0, this.capturedFrameCount);
    } else {
      const count = this.preBufferedCount;
      const startIdx =
        (this.preWriteCursor - count + PRE_TRIGGER_FRAME_LIMIT) % PRE_TRIGGER_FRAME_LIMIT;
      for (let i = 0; i < count; i++) {
        records.push(this.preRingBuffer[(startIdx + i) % PRE_TRIGGER_FRAME_LIMIT]);
      }
    }

    const lines = [CSV_COLUMNS.join(',')];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const row = [
        String(r.frameIndex),
        r.capturePhase,
        formatPrecision8(r.timestampMs),
        String(r.didReset),
      ];
      for (let k = 0; k < 32; k++) row.push(formatPrecision8(r.input[k]));
      for (let k = 0; k < 10; k++) row.push(formatPrecision8(r.wasmOutput[k]));
      for (let k = 0; k < 10; k++) row.push(formatPrecision8(r.cleanOutput[k]));
      row.push(
        formatPrecision8(r.deltaPos),
        formatPrecision8(r.deltaDir),
        formatPrecision8(r.deltaUp),
        formatPrecision8(r.deltaFov),
        formatPrecision8(r.maxRelError)
      );
      lines.push(row.join(','));
    }
    return lines.join('\n');
  }

  exportCsvFile(): string {
    const csvContent = this.buildCsvString();
    if (typeof document === 'undefined') return csvContent;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stateTag = this.metrics.isMatching ? 'matching' : 'diverged';
    link.href = url;
    link.setAttribute('download', `camera_deterministic_${stateTag}_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return csvContent;
  }
}

let singletonCameraHarness: CameraDeterminismHarness | null = null;

export function getCameraDeterminismHarness(): CameraDeterminismHarness {
  if (!singletonCameraHarness) {
    singletonCameraHarness = new CameraDeterminismHarness();
  }
  return singletonCameraHarness;
}

export default CameraDeterminismHarness;
