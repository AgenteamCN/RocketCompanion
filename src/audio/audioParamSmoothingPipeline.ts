/**
 * audioParamSmoothingPipeline.ts
 * Frame-rate independent exponential smoothing and deadband assignment helpers
 * for Web Audio AudioParams. Eliminates per-frame AudioParam timeline event
 * scheduling (setTargetAtTime / setValueAtTime) in high-frequency 120Hz loops.
 */

const MIN_SMOOTHING_TAU_SEC = 1e-4;
const DEFAULT_FRAME_DT_SEC = 1 / 120;
const MAX_FRAME_DT_SEC = 0.25;

/**
 * Normalizes a frame delta-time (in seconds) into a safe, bounded positive step.
 */
export function clampSmoothingDtSec(dtSec: number | undefined): number {
  if (typeof dtSec !== 'number' || !Number.isFinite(dtSec) || dtSec <= 0) {
    return DEFAULT_FRAME_DT_SEC;
  }
  return dtSec > MAX_FRAME_DT_SEC ? MAX_FRAME_DT_SEC : dtSec;
}

/**
 * Computes frame-rate independent 1st-order exponential damping factor:
 * `alpha = 1 - exp(-dt / tau)`.
 */
export function computeExponentialSmoothingAlpha(dtSec: number, tauSec: number): number {
  const safeDt = clampSmoothingDtSec(dtSec);
  if (typeof tauSec !== 'number' || !Number.isFinite(tauSec) || tauSec <= MIN_SMOOTHING_TAU_SEC) {
    return 1;
  }
  const alpha = 1 - Math.exp(-safeDt / tauSec);
  return alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
}

/**
 * Steps a scalar value toward `target` using 1st-order exponential smoothing
 * and snaps to `target` once within `snapEpsilon`.
 */
export function stepExponentialSmoothedValue(
  current: number,
  target: number,
  dtSec: number,
  tauSec: number,
  snapEpsilon: number = 1e-5
): number {
  if (!Number.isFinite(target)) {
    return Number.isFinite(current) ? current : 0;
  }
  if (!Number.isFinite(current)) {
    return target;
  }
  const diff = target - current;
  if (Math.abs(diff) <= snapEpsilon) {
    return target;
  }
  const alpha = computeExponentialSmoothingAlpha(dtSec, tauSec);
  const next = current + diff * alpha;
  return Math.abs(target - next) <= snapEpsilon ? target : next;
}

/**
 * Steps a smoothed scalar state and writes directly to `param.value` only when
 * the change exceeds `deadbandEpsilon` (or when reaching the exact target boundary).
 * Never schedules Web Audio automation timeline events.
 */
export function applySmoothedAudioParamValue(
  param: AudioParam,
  currentSmoothed: number,
  lastWritten: number,
  target: number,
  dtSec: number,
  tauSec: number,
  deadbandEpsilon: number
): { smoothed: number; written: number } {
  const nextSmoothed = stepExponentialSmoothedValue(
    currentSmoothed,
    target,
    dtSec,
    tauSec,
    deadbandEpsilon * 0.25
  );
  const deltaFromWritten = Math.abs(nextSmoothed - lastWritten);
  const snappedToTarget =
    nextSmoothed === target && Math.abs(lastWritten - target) > deadbandEpsilon * 0.1;

  if (!Number.isFinite(lastWritten) || deltaFromWritten > deadbandEpsilon || snappedToTarget) {
    param.value = nextSmoothed;
    return { smoothed: nextSmoothed, written: nextSmoothed };
  }
  return { smoothed: nextSmoothed, written: lastWritten };
}

/**
 * Clears any residual scheduled automation values on an AudioParam and assigns
 * an immediate scalar value.
 */
export function resetAudioParamValueImmediate(
  param: AudioParam | null | undefined,
  value: number,
  nowSec?: number
): void {
  if (!param) return;
  try {
    if (typeof nowSec === 'number' && Number.isFinite(nowSec)) {
      param.cancelScheduledValues(nowSec);
    }
    param.value = value;
  } catch {
    /* ignore AudioParam reset errors on disposed contexts */
  }
}
