export const MAX_TELEMETRY_TICKS = 144000; // 20 minutes @ 120Hz

export const TELEMETRY_EVENT_FLAGS = Object.freeze({
  PACKET_ARRIVED: 0x01,
  STARVATION: 0x02,
  HARD_RESYNC: 0x04,
  STEP_CATCHUP: 0x08,
  STEP_SKIP: 0x10,
  TIER_SWITCH: 0x20,
  TIER3_SNAP: 0x40,
  KICKOFF_MASKED: 0x80,
});

export function numOr(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export interface PacingControllerState {
  initialized?: boolean;
  smoothRttMs?: number;
  jitterMs?: number;
  smoothBuffer?: number;
  prevSmoothBuffer?: number;
  inFlightBiasTicks?: number;
  currentTier?: number;
  dwellTicks?: number;
  currentRateHz?: number;
  lastHardResyncMs?: number;
}

export interface PacingControllerStepInput {
  nowMs?: number;
  rawRttMs?: number;
  rawServerBuffer?: number;
  packetArrived?: boolean;
}

export interface PacingControllerParams {
  rttEwmaAlpha?: number;
  bufferEwmaAlpha?: number;
  targetBufferTicks?: number;
  inFlightCompGain?: number;
  enableAdaptiveJitterBoost?: boolean;
  adaptiveJitterGain?: number;
  maxAdaptiveBoostTicks?: number;
  deadbandCatchupOffset?: number;
  deadbandSkipOffset?: number;
  hardResyncThresholdTicks?: number;
  hardResyncCooldownMs?: number;
  enableHardResync?: boolean;
  rateStepMode?: string;
  tier1Hz?: number;
  tier2Hz?: number;
  tier1EnterError?: number;
  tier1ExitError?: number;
  tier2EnterError?: number;
  tier2ExitError?: number;
  minDwellTicks?: number;
  kpHzPerTick?: number;
  kdHzPerTickVel?: number;
  maxAdjustHz?: number;
}

export interface PacingTraceColumnsLike {
  timeMs?: ArrayLike<number> & { slice?: (start: number, end: number) => ArrayLike<number> };
  rawRttMs?: ArrayLike<number> & { slice?: (start: number, end: number) => ArrayLike<number> };
  serverBuffer?: ArrayLike<number>;
  physicsRateHz?: ArrayLike<number>;
  targetBuffer?: ArrayLike<number>;
  eventFlags?: ArrayLike<number>;
}

export interface PacingTraceSourceLike extends PacingTraceColumnsLike {
  count?: number;
  columns?: PacingTraceColumnsLike;
}

export interface PacingControllerStepResult {
  physicsRateHz: number;
  tierState: number;
  tierSwitched: boolean;
  effectiveBuffer: number;
  activeTarget: number;
  lowerBand: number;
  upperBand: number;
  smoothRttMs: number;
  jitterMs: number;
  requestHardResync: boolean;
  requestStepCatchup: boolean;
  requestStepSkip: boolean;
}

export interface TierAndRateCalcInput {
  mode: string;
  currentTier: number;
  dwellTicks: number;
  bufferError: number;
  effectiveBuffer: number;
  lowerBand: number;
  upperBand: number;
  bufferVelTicksPerSec: number;
  sampleRtt: number;
  smoothRttMs: number;
  jitterMs: number;
  rawBuf: number;
  baseTarget: number;
  params: PacingControllerParams;
}

export function computeTierAndRateStep(
  calcInput: TierAndRateCalcInput
): { nextTier: number; nextRateHz: number; nextDwellTicks: number } {
  const {
    mode,
    currentTier,
    dwellTicks,
    bufferError,
    effectiveBuffer,
    lowerBand,
    upperBand,
    bufferVelTicksPerSec,
    sampleRtt,
    smoothRttMs,
    jitterMs,
    rawBuf,
    baseTarget,
    params,
  } = calcInput;

  const {
    rateStepMode,
    tier1Hz: rawT1Hz,
    tier2Hz: rawT2Hz,
    tier1EnterError,
    tier1ExitError,
    tier2EnterError,
    tier2ExitError,
    minDwellTicks,
    kpHzPerTick,
    kdHzPerTickVel,
    maxAdjustHz,
  } = params;

  const stepMode = mode === "sts" ? "discrete_2tier" : rateStepMode || "continuous_pd";
  const tier1Hz = Math.max(0, numOr(rawT1Hz, 1.0));
  const tier2Hz = Math.max(tier1Hz, numOr(rawT2Hz, 3.0));
  const t1Enter = Math.max(0.2, numOr(tier1EnterError, 1.0));
  const t1Exit = Math.max(0.0, Math.min(t1Enter - 0.05, numOr(tier1ExitError, 0.4)));
  const t2Enter = Math.max(t1Enter + 0.2, numOr(tier2EnterError, 2.5));
  const t2Exit = Math.max(t1Exit, Math.min(t2Enter - 0.1, numOr(tier2ExitError, 1.3)));
  const minDwell = Math.max(0, numOr(minDwellTicks, 18));
  const canRelaxTier = dwellTicks >= minDwell;

  const absErr = Math.abs(bufferError);
  const sign = bufferError < 0 ? 1 : -1;
  let nextTier = currentTier;
  let nextDwellTicks = dwellTicks;

  if (absErr >= t2Enter) {
    nextTier = 2 * sign;
  } else if (Math.abs(currentTier) === 2 && Math.sign(currentTier) === sign) {
    if (absErr <= t2Exit && canRelaxTier) {
      nextTier = absErr <= t1Exit ? 0 : 1 * sign;
    } else {
      nextTier = 2 * sign;
    }
  } else if (absErr >= t1Enter) {
    nextTier = 1 * sign;
  } else if (Math.abs(currentTier) === 1 && Math.sign(currentTier) === sign) {
    if (absErr <= t1Exit && canRelaxTier) {
      nextTier = 0;
    } else {
      nextTier = 1 * sign;
    }
  } else if (canRelaxTier) {
    nextTier = 0;
  }

  if (nextTier !== currentTier) {
    nextDwellTicks = 0;
  }

  const isZeroLatencyLocal =
    sampleRtt === 0 &&
    smoothRttMs < 0.05 &&
    jitterMs < 0.05 &&
    Math.abs(rawBuf - baseTarget) <= 1.5;

  let nextRateHz = 120.0;
  if (isZeroLatencyLocal) {
    nextTier = 0;
    nextRateHz = 120.0;
    nextDwellTicks = 0;
  } else if (stepMode === "discrete_2tier") {
    if (nextTier === 2) nextRateHz = 120.0 + tier2Hz;
    else if (nextTier === 1) nextRateHz = 120.0 + tier1Hz;
    else if (nextTier === -1) nextRateHz = 120.0 - tier1Hz;
    else if (nextTier === -2) nextRateHz = 120.0 - tier2Hz;
    else nextRateHz = 120.0;
  } else if (stepMode === "hybrid" && nextTier === 0) {
    nextRateHz = 120.0;
  } else {
    const kp = Math.max(0.05, numOr(kpHzPerTick, 0.85));
    const kd = Math.max(0.0, numOr(kdHzPerTickVel, 0.35));
    const maxAdj = Math.max(0.5, numOr(maxAdjustHz, 6.0));

    let deadbandExcess = 0;
    let derivativeGate = 1.0;
    if (effectiveBuffer < lowerBand) {
      deadbandExcess = effectiveBuffer - lowerBand;
    } else if (effectiveBuffer > upperBand) {
      deadbandExcess = effectiveBuffer - upperBand;
    } else if (absErr > t1Enter) {
      deadbandExcess = (bufferError - Math.sign(bufferError) * t1Exit) * 0.35;
      derivativeGate = Math.min(1.0, (absErr - t1Enter) / Math.max(0.25, t2Enter - t1Enter));
    } else {
      deadbandExcess = 0;
      derivativeGate = 0;
    }

    if (deadbandExcess === 0 && derivativeGate === 0) {
      nextRateHz = 120.0;
    } else {
      const rawDeltaHz =
        -kp * deadbandExcess - kd * derivativeGate * (bufferVelTicksPerSec * 0.08);
      const clampedDeltaHz = Math.max(-maxAdj, Math.min(maxAdj, rawDeltaHz));
      nextRateHz = Math.round((120.0 + clampedDeltaHz) * 100) / 100;
    }
  }

  return { nextTier, nextRateHz, nextDwellTicks };
}
