import {
  NetworkStressSimulator,
  type NetworkStressChannelTarget,
} from "../config/networkStressConfig";
import { computeReconcilerMetricsPatch } from "./networkDiagnosticsReconcilerSync";
import type {
  NetworkDiagnosticsState,
  NetworkMetrics,
  ReconcilerDiagnosticsTarget,
  ReconcilerRawMetricsPayload,
  TransportChannelDiagnosticsTarget,
} from "./networkDiagnosticsTypes";

export function buildReconcilerTelemetryPatch(
  m: ReconcilerRawMetricsPayload | null | undefined,
  reconciler: ReconcilerDiagnosticsTarget,
  ch: (TransportChannelDiagnosticsTarget & NetworkStressChannelTarget) | null | undefined,
  stressSim: NetworkStressSimulator,
  state: NetworkDiagnosticsState,
  nowMs: number = typeof performance !== "undefined" ? performance.now() : Date.now()
): Partial<NetworkMetrics> {
  const incomingServerTick = m?.serverTick ?? state.metrics.serverTick;
  if (incomingServerTick !== state.metrics.serverTick) {
    stressSim.recordPacketReceived(nowMs);
  }

  const rawSample = {
    ...m,
    extraUplinkMs: m?.extraUplinkMs ?? ch?.extraUplinkMs ?? stressSim.extraUplinkMs,
    extraDownlinkMs: m?.extraDownlinkMs ?? ch?.extraDownlinkMs ?? stressSim.extraDownlinkMs,
    inputBufferSize: m?.inputBufferSize ?? reconciler.metrics?.inputBufferSize,
    rollbackWindow: m?.rollbackWindow ?? reconciler.history?.length,
    lastCorrectionDelta: m?.lastCorrectionDelta ?? reconciler.metrics?.lastCorrectionDelta,
    maxCorrectionDelta: m?.maxCorrectionDelta ?? reconciler.metrics?.maxCorrectionDelta,
    localCarIndex: reconciler.localCarIndex ?? 0,
    enableSmoothing: m?.enableSmoothing ?? reconciler.enableSmoothing,
  };

  const computedPatch = computeReconcilerMetricsPatch(rawSample, ch, state.metrics);
  const health = stressSim.getHealthSnapshot(
    {
      rttMs: computedPatch.rttMs,
      jitterMs: computedPatch.jitterMs,
      packetLossPct: computedPatch.packetLossPct,
      lastErrorUu: computedPatch.lastErrorUu,
    },
    nowMs
  );

  let probeTelemetry = state.metrics.probeTelemetry;
  if (state.metrics.zeroGFleetEnabled && state.bridge.onSampleZeroGFleetTelemetry) {
    probeTelemetry = state.bridge.onSampleZeroGFleetTelemetry() || [];
  }

  return {
    ...computedPatch,
    stressPresetId: health.presetId,
    impairmentPresetId: health.presetId,
    qualityScore: health.score,
    qualityGrade: health.grade,
    healthState: health.healthState,
    packetAgeMs: health.packetAgeMs,
    neutralFallbackActive: health.neutralFallbackActive,
    disconnectEvicted: health.disconnectEvicted,
    probeTelemetry,
  };
}

export function applyAsymmetricLatencyAndBuildPatch(
  uplinkMs: number,
  downlinkMs: number,
  stressSim: NetworkStressSimulator,
  ch: (TransportChannelDiagnosticsTarget & NetworkStressChannelTarget) | null | undefined,
  reconciler: ReconcilerDiagnosticsTarget | null | undefined,
  currentMetrics: NetworkMetrics
): Partial<NetworkMetrics> {
  const upVal = Math.max(0, Math.min(500, Math.round(uplinkMs)));
  const downVal = Math.max(0, Math.min(500, Math.round(downlinkMs)));
  const extraRttMs = upVal + downVal;
  stressSim.setStress({ extraUplinkMs: upVal, extraDownlinkMs: downVal }, ch);

  let nextLeadTicks = currentMetrics.clientLeadTicks;
  let nextRttMs = ch ? (ch.rttMs ?? extraRttMs) : extraRttMs;
  let nextUplinkMs = upVal;
  let nextDownlinkMs = downVal;

  if (reconciler) {
    const breakdown = reconciler._resolveLatencyBreakdown ? reconciler._resolveLatencyBreakdown() : null;
    const effectiveRtt = breakdown
      ? breakdown.rttMs
      : reconciler._resolveEffectiveRtt
      ? reconciler._resolveEffectiveRtt()
      : nextRttMs;
    nextRttMs = effectiveRtt;
    nextUplinkMs = breakdown
      ? breakdown.uplinkMs
      : Math.max(0, Math.round((effectiveRtt - extraRttMs) * 0.5) + upVal);
    nextDownlinkMs = breakdown ? breakdown.downlinkMs : Math.max(0, effectiveRtt - nextUplinkMs);
    nextLeadTicks = reconciler.calculateLeadTicks
      ? reconciler.calculateLeadTicks(effectiveRtt)
      : nextLeadTicks;
    reconciler.leadTicks = nextLeadTicks;
    if (reconciler.metrics) {
      reconciler.metrics.leadTicks = nextLeadTicks;
      reconciler.metrics.rttMs = effectiveRtt;
      reconciler.metrics.uplinkMs = nextUplinkMs;
      reconciler.metrics.downlinkMs = nextDownlinkMs;
      reconciler.metrics.extraUplinkMs = upVal;
      reconciler.metrics.extraDownlinkMs = downVal;
      reconciler.metrics.extraRttMs = extraRttMs;
    }
    reconciler.notifyMetricsUpdated?.();
  }

  const health = stressSim.getHealthSnapshot({
    rttMs: nextRttMs,
    jitterMs: currentMetrics.jitterMs,
    packetLossPct: currentMetrics.packetLossPct,
    lastErrorUu: currentMetrics.lastErrorUu,
  });

  return {
    extraUplinkMs: upVal,
    extraDownlinkMs: downVal,
    extraRttMs,
    extraLatencyMs: Math.round(extraRttMs * 0.5),
    rttMs: nextRttMs,
    uplinkMs: nextUplinkMs,
    downlinkMs: nextDownlinkMs,
    clientLeadTicks: nextLeadTicks,
    qualityScore: health.score,
    qualityGrade: health.grade,
  };
}

export function applyBurstDropParamsAndBuildPatch(
  enabled: boolean,
  rawPeriodMs: number,
  rawDurationMs: number,
  stressSim: NetworkStressSimulator,
  channel: NetworkStressChannelTarget | null,
  autoDefaultDuration = false
): Partial<NetworkMetrics> {
  const safePeriod = Math.max(1, Math.floor(rawPeriodMs || 2000));
  let safeDuration = Math.max(0, Math.min(safePeriod - 1, Math.floor(rawDurationMs || 0)));
  if (autoDefaultDuration && enabled && safeDuration <= 0) {
    safeDuration = Math.min(safePeriod - 1, Math.max(1, Math.floor(safePeriod * 0.375)));
  }
  const safePct = Math.min(99, Math.floor((safeDuration / safePeriod) * 100));
  stressSim.setStress(
    { burstDropEnabled: enabled, burstPeriodMs: safePeriod, burstDurationMs: safeDuration },
    channel
  );
  return {
    burstDropEnabled: enabled,
    burstPeriodMs: safePeriod,
    burstDurationMs: safeDuration,
    burstDurationPct: safePct,
  };
}
