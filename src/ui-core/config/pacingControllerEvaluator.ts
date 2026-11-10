/**
 * pacingControllerEvaluator.ts
 * High-performance, zero-allocation 20-minute (144,000 ticks @ 120Hz) telemetry evaluator
 * and counterfactual What-If offline pacing simulator.
 */
import {
  type PacingControllerState,
  type PacingControllerStepInput,
  type PacingControllerParams,
  type PacingTraceColumnsLike,
  type PacingTraceSourceLike,
  type PacingControllerStepResult,
  numOr,
  computeTierAndRateStep,
} from "./pacingControllerStepMath";

export type {
  PacingControllerState,
  PacingControllerStepInput,
  PacingControllerParams,
  PacingTraceColumnsLike,
  PacingTraceSourceLike,
  PacingControllerStepResult,
};

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

export function evaluatePacingControllerStep(
  state: PacingControllerState,
  input: PacingControllerStepInput,
  mode: string,
  params: PacingControllerParams = {}
): PacingControllerStepResult {
  const tickDtSec = 1.0 / 120.0;
  const rttAlpha = Math.max(0.01, Math.min(0.8, numOr(params.rttEwmaAlpha, 0.12)));
  const bufAlpha = Math.max(0.02, Math.min(1.0, numOr(params.bufferEwmaAlpha, 0.25)));

  const sampleRtt = Math.max(0, numOr(input.rawRttMs, 0));
  if (!state.initialized) {
    state.smoothRttMs = sampleRtt;
    state.jitterMs = 0;
    state.smoothBuffer = Number.isFinite(input.rawServerBuffer)
      ? (input.rawServerBuffer as number)
      : numOr(params.targetBufferTicks, 3);
    state.prevSmoothBuffer = state.smoothBuffer;
    state.inFlightBiasTicks = 0;
    state.currentTier = 0;
    state.dwellTicks = 0;
    state.currentRateHz = 120.0;
    state.lastHardResyncMs = -100000;
    state.initialized = true;
  } else if (input.packetArrived) {
    const prevSmoothRtt = state.smoothRttMs ?? sampleRtt;
    const prevJitter = state.jitterMs ?? 0;
    const rttDelta = Math.abs(sampleRtt - prevSmoothRtt);
    state.smoothRttMs = prevSmoothRtt * (1 - rttAlpha) + sampleRtt * rttAlpha;
    state.jitterMs = prevJitter * (1 - rttAlpha) + rttDelta * rttAlpha;
  }

  const smoothRttMs = state.smoothRttMs ?? sampleRtt;
  const jitterMs = state.jitterMs ?? 0;

  const rttSec = Math.max(0.008333, smoothRttMs / 1000.0);
  const decayFactor = Math.exp(-tickDtSec / Math.max(0.016, rttSec));
  const rateDevHz = (state.currentRateHz || 120.0) - 120.0;
  state.inFlightBiasTicks = (state.inFlightBiasTicks ?? 0) * decayFactor + rateDevHz * tickDtSec;

  const rawBuf = Number.isFinite(input.rawServerBuffer)
    ? (input.rawServerBuffer as number)
    : (state.smoothBuffer ?? 3);
  state.prevSmoothBuffer = state.smoothBuffer ?? rawBuf;
  if (input.packetArrived) {
    state.smoothBuffer = (state.smoothBuffer ?? rawBuf) * (1 - bufAlpha) + rawBuf * bufAlpha;
  }

  const smoothBuffer = state.smoothBuffer ?? rawBuf;
  const prevSmoothBuffer = state.prevSmoothBuffer ?? smoothBuffer;

  const inFlightCompGain = Math.max(0, Math.min(1.2, numOr(params.inFlightCompGain, 0.85)));
  const effectiveBuffer = smoothBuffer + state.inFlightBiasTicks * inFlightCompGain;
  const bufferVelTicksPerSec = (smoothBuffer - prevSmoothBuffer) * 120.0;

  const baseTarget = Math.max(1, Math.min(12, numOr(params.targetBufferTicks, 3)));
  let adaptiveBoost = 0;
  if (params.enableAdaptiveJitterBoost && mode !== "legacy" && mode !== "sts") {
    const jitterTicks = jitterMs / (1000.0 / 120.0);
    const gain = Math.max(0, numOr(params.adaptiveJitterGain, 1.25));
    const maxBoost = Math.max(0, numOr(params.maxAdaptiveBoostTicks, 4.0));
    adaptiveBoost = Math.min(maxBoost, jitterTicks * gain * 0.5);
  }
  const activeTarget = baseTarget + adaptiveBoost;

  const catchupOffset = Math.min(0, numOr(params.deadbandCatchupOffset, -2));
  const skipOffset = Math.max(0, numOr(params.deadbandSkipOffset, 2));
  const lowerBand = activeTarget + catchupOffset;
  const upperBand = activeTarget + skipOffset;
  const bufferError = effectiveBuffer - activeTarget;

  let nextRateHz = 120.0;
  let nextTier = state.currentTier ?? 0;
  let requestHardResync = false;
  let requestStepCatchup = false;
  let requestStepSkip = false;

  const nowMs = numOr(input.nowMs, 0);
  const hardThresh = Math.max(4, numOr(params.hardResyncThresholdTicks, 10));
  const hardCooldown = Math.max(100, numOr(params.hardResyncCooldownMs, 1000));
  if (
    params.enableHardResync !== false &&
    Math.abs(rawBuf - activeTarget) >= hardThresh &&
    nowMs - (state.lastHardResyncMs ?? -100000) >= hardCooldown
  ) {
    requestHardResync = true;
    state.lastHardResyncMs = nowMs;
    state.inFlightBiasTicks = 0;
    state.smoothBuffer = activeTarget;
    nextTier = 0;
    state.dwellTicks = 0;
  }

  state.dwellTicks = (state.dwellTicks || 0) + 1;

  if (mode === "legacy") {
    nextRateHz = 120.0;
    nextTier = 0;
    if (input.packetArrived && !requestHardResync) {
      if (rawBuf < lowerBand) requestStepCatchup = true;
      else if (rawBuf > upperBand) requestStepSkip = true;
    }
  } else {
    const stepCalc = computeTierAndRateStep({
      mode,
      currentTier: state.currentTier ?? 0,
      dwellTicks: state.dwellTicks,
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
    });
    nextTier = stepCalc.nextTier;
    nextRateHz = stepCalc.nextRateHz;
    state.dwellTicks = stepCalc.nextDwellTicks;

    if (input.packetArrived && !requestHardResync && rawBuf <= -2 && effectiveBuffer < lowerBand - 1.5) {
      requestStepCatchup = true;
      state.inFlightBiasTicks = 0;
    } else if (input.packetArrived && !requestHardResync && rawBuf > upperBand + 4) {
      requestStepSkip = true;
      state.inFlightBiasTicks = 0;
    }
  }

  const tierSwitched = nextTier !== state.currentTier;
  state.currentTier = nextTier;
  state.currentRateHz = nextRateHz;

  return {
    physicsRateHz: nextRateHz,
    tierState: nextTier,
    tierSwitched,
    effectiveBuffer,
    activeTarget,
    lowerBand,
    upperBand,
    smoothRttMs: state.smoothRttMs ?? sampleRtt,
    jitterMs: state.jitterMs ?? 0,
    requestHardResync,
    requestStepCatchup,
    requestStepSkip,
  };
}

export function simulatePacingOnRecordedTrace(
  traceSource: PacingTraceSourceLike | null | undefined,
  candidateModeOrParams?: string | PacingControllerParams,
  candidateParamsOrMode?: PacingControllerParams | string,
  maxPreviewSamples = 360
) {
  let candidateMode = "custom";
  let candidateParams: PacingControllerParams = {};
  if (typeof candidateModeOrParams === "string") {
    candidateMode = candidateModeOrParams;
    candidateParams =
      typeof candidateParamsOrMode === "object" && candidateParamsOrMode
        ? candidateParamsOrMode
        : {};
  } else if (candidateModeOrParams && typeof candidateModeOrParams === "object") {
    candidateParams = candidateModeOrParams;
    if (typeof candidateParamsOrMode === "string") {
      candidateMode = candidateParamsOrMode;
    }
  }
  const cols = traceSource?.columns || traceSource;
  const n = traceSource?.count ?? cols?.timeMs?.length ?? 0;
  if (!cols || !cols.timeMs || !cols.rawRttMs || n <= 0) {
    return null;
  }

  const timeMs = cols.timeMs;
  const rawRttMs = cols.rawRttMs;
  const recServerBuffer = cols.serverBuffer;
  const recPhysicsRateHz = cols.physicsRateHz;
  const recTargetBuffer = cols.targetBuffer;
  const recEventFlags = cols.eventFlags;

  const simBufferSeries = new Float32Array(n);
  const simTargetSeries = new Float32Array(n);
  const simRateSeries = new Float32Array(n);
  const simFlagsSeries = new Uint8Array(n);

  const ctrlState: PacingControllerState = { initialized: false };
  const tickDtSec = 1.0 / 120.0;

  let cumulativeRecTicks = 0;
  let cumulativeSimTicks = 0;
  const initialTargetDiff = (Number(candidateParams?.targetBufferTicks) || 3) - (recTargetBuffer?.[0] || 3);

  let starvationTicks = 0;
  let hardResyncCount = 0;
  let catchupStepCount = 0;
  let skipStepCount = 0;
  let rateSwitchCount = 0;
  let sumRate = 0;
  let sumBuf = 0;
  let sumLeadTicks = 0;

  for (let i = 0; i < n; i++) {
    const recFlags = recEventFlags ? recEventFlags[i] : 1;
    const packetArrived = Boolean(recFlags & TELEMETRY_EVENT_FLAGS.PACKET_ARRIVED) || i % 2 === 0;

    const recRateDev = (recPhysicsRateHz ? recPhysicsRateHz[i] : 120.0) - 120.0;
    cumulativeRecTicks += recRateDev * tickDtSec;

    const netBaselineBuffer =
      (recServerBuffer ? recServerBuffer[i] : 3) - cumulativeRecTicks + initialTargetDiff;
    const simulatedRawServerBuffer = Math.max(
      -64,
      Math.min(63, Math.round(netBaselineBuffer + cumulativeSimTicks))
    );

    const stepOut = evaluatePacingControllerStep(
      ctrlState,
      {
        nowMs: timeMs[i],
        rawRttMs: rawRttMs[i],
        rawServerBuffer: simulatedRawServerBuffer,
        packetArrived,
      },
      candidateMode,
      candidateParams
    );

    const simRateDev = stepOut.physicsRateHz - 120.0;
    cumulativeSimTicks += simRateDev * tickDtSec;

    if (stepOut.requestHardResync) {
      cumulativeSimTicks = stepOut.activeTarget - netBaselineBuffer;
      hardResyncCount++;
    } else if (stepOut.requestStepCatchup) {
      cumulativeSimTicks += Math.max(1, stepOut.activeTarget - simulatedRawServerBuffer);
      catchupStepCount++;
    } else if (stepOut.requestStepSkip) {
      cumulativeSimTicks -= Math.max(1, simulatedRawServerBuffer - stepOut.activeTarget);
      skipStepCount++;
    }

    const finalSimBuf = Math.max(-64, Math.min(63, netBaselineBuffer + cumulativeSimTicks));
    simBufferSeries[i] = finalSimBuf;
    simTargetSeries[i] = stepOut.activeTarget;
    simRateSeries[i] = stepOut.physicsRateHz;

    let flags = packetArrived ? TELEMETRY_EVENT_FLAGS.PACKET_ARRIVED : 0;
    if (finalSimBuf <= 0 && packetArrived) {
      flags |= TELEMETRY_EVENT_FLAGS.STARVATION;
      starvationTicks++;
    }
    if (stepOut.requestHardResync) flags |= TELEMETRY_EVENT_FLAGS.HARD_RESYNC;
    if (stepOut.requestStepCatchup) flags |= TELEMETRY_EVENT_FLAGS.STEP_CATCHUP;
    if (stepOut.requestStepSkip) flags |= TELEMETRY_EVENT_FLAGS.STEP_SKIP;
    if (stepOut.tierSwitched) {
      flags |= TELEMETRY_EVENT_FLAGS.TIER_SWITCH;
      rateSwitchCount++;
    }
    simFlagsSeries[i] = flags;

    sumRate += stepOut.physicsRateHz;
    sumBuf += finalSimBuf;
    const oneWayTicks = Math.ceil((rawRttMs[i] * 0.5) / (1000.0 / 120.0));
    sumLeadTicks += Math.max(1, oneWayTicks + Math.max(0, finalSimBuf));
  }

  const durationSec = Math.max(0.01, (timeMs[n - 1] - timeMs[0]) / 1000.0);
  const meanRate = sumRate / n;
  const meanBuf = sumBuf / n;
  const meanLead = sumLeadTicks / n;

  let sumRateVar = 0;
  const stride = Math.max(1, Math.floor(n / 2000));
  const absErrors: number[] = [];
  for (let i = 0; i < n; i++) {
    const dr = simRateSeries[i] - meanRate;
    sumRateVar += dr * dr;
    if (i % stride === 0) {
      absErrors.push(Math.abs(simBufferSeries[i] - simTargetSeries[i]));
    }
  }
  absErrors.sort((a, b) => a - b);
  const p95Idx = Math.min(absErrors.length - 1, Math.floor(absErrors.length * 0.95));
  const p95Err = absErrors.length > 0 ? absErrors[p95Idx] : 0;

  const previewCount = Math.min(n, Math.max(10, maxPreviewSamples));
  const previewStart = Math.max(0, n - previewCount);

  return {
    summary: {
      evaluatedTicks: n,
      durationSeconds: Math.round(durationSec * 10) / 10,
      starvationCount: starvationTicks,
      starvationPct: Math.round((starvationTicks / n) * 10000) / 100,
      hardResyncCount,
      catchupStepCount,
      skipStepCount,
      rateSwitchCount,
      rateSwitchesPerMin: Math.round((rateSwitchCount / (durationSec / 60.0)) * 10) / 10,
      meanBufferTicks: Math.round(meanBuf * 100) / 100,
      p95BufferAbsError: Math.round(p95Err * 100) / 100,
      stdPhysicsRateHz: Math.round(Math.sqrt(sumRateVar / n) * 1000) / 1000,
      estimated5050LeadPenaltyMs: Math.round(meanLead * (1000.0 / 120.0) * 10) / 10,
    },
    previewWindow: {
      count: previewCount,
      start: previewStart,
      totalCount: n,
      timeMs: timeMs.slice ? timeMs.slice(previewStart, previewStart + previewCount) : timeMs,
      rawRttMs: rawRttMs.slice ? rawRttMs.slice(previewStart, previewStart + previewCount) : rawRttMs,
      simBuffer: simBufferSeries.subarray(previewStart, previewStart + previewCount),
      simTarget: simTargetSeries.subarray(previewStart, previewStart + previewCount),
      simRateHz: simRateSeries.subarray(previewStart, previewStart + previewCount),
      simFlags: simFlagsSeries.subarray(previewStart, previewStart + previewCount),
    },
  };
}
