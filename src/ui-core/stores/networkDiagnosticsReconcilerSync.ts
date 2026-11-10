import { evaluateConnectionQuality } from '../config/networkStressConfig';
import type {
  NetworkMetrics,
  ReconcilerRawMetricsPayload,
  TransportChannelDiagnosticsTarget,
} from './networkDiagnosticsTypes';

function assertFiniteMetric(val: number, name: string) {
  if (val !== undefined && !Number.isFinite(val)) {
    throw new Error(`[networkDiagnosticsStore] Non-finite ${name} encountered: ${val}`);
  }
}

export function computeReconcilerMetricsPatch(
  rawSample: ReconcilerRawMetricsPayload | null | undefined,
  channelSample: TransportChannelDiagnosticsTarget | null | undefined,
  prevMetrics: NetworkMetrics
): Partial<NetworkMetrics> {
  const m = rawSample || {};
  const ch = channelSample || null;

  const extraUplinkMs = Math.max(
    0,
    Math.round(Number(m.extraUplinkMs ?? ch?.extraUplinkMs ?? prevMetrics.extraUplinkMs) || 0)
  );
  const extraDownlinkMs = Math.max(
    0,
    Math.round(Number(m.extraDownlinkMs ?? ch?.extraDownlinkMs ?? prevMetrics.extraDownlinkMs) || 0)
  );
  const extraRttMs = extraUplinkMs + extraDownlinkMs;
  const effectiveRtt = m.rttMs ?? ch?.rttMs ?? extraRttMs;
  const uplinkMs =
    m.uplinkMs ?? Math.max(0, Math.round((effectiveRtt - extraRttMs) * 0.5) + extraUplinkMs);
  const downlinkMs = m.downlinkMs ?? Math.max(0, effectiveRtt - uplinkMs);
  const leadTicks = m.leadTicks ?? m.clientLeadTicks ?? prevMetrics.clientLeadTicks ?? 0;
  const corrections = m.totalCorrections ?? m.corrections ?? prevMetrics.corrections ?? 0;
  const serverTick = m.serverTick ?? prevMetrics.serverTick;
  const clientTick = m.clientTick ?? prevMetrics.clientTick;
  const deltaTicks = Math.abs(clientTick - serverTick);

  assertFiniteMetric(effectiveRtt, 'effectiveRtt');
  assertFiniteMetric(leadTicks, 'leadTicks');
  assertFiniteMetric(corrections, 'corrections');
  assertFiniteMetric(serverTick, 'serverTick');
  assertFiniteMetric(clientTick, 'clientTick');
  assertFiniteMetric(deltaTicks, 'deltaTicks');

  const packetLossPct =
    ch?.packetLossRate !== undefined
      ? Math.round(ch.packetLossRate * 100)
      : (ch?.simulatedPacketLossPct ?? prevMetrics.packetLossPct);
  const jitterMs = ch?.jitterMs ?? ch?.measuredJitterMs ?? prevMetrics.jitterMs;
  const inputBufferDepth = m.inputBufferSize ?? m.inputBufferDepth ?? prevMetrics.inputBufferDepth ?? 0;
  const rollbackWindow = m.rollbackWindow ?? prevMetrics.rollbackWindow ?? 0;
  const lastErrorUu = m.lastCorrectionDelta ?? m.lastErrorUu ?? prevMetrics.lastErrorUu ?? 0;
  const maxErrorUu = m.maxCorrectionDelta ?? m.maxErrorUu ?? prevMetrics.maxErrorUu ?? 0;
  const localCarIdx = m.localCarIndex ?? prevMetrics.diagnosticBuffers?.localPlayerCarIndex ?? 0;

  const rttPlayers = Array.isArray(m.allUserRtt)
    ? m.allUserRtt
    : Array.isArray(m.allUserRtt?.players)
      ? m.allUserRtt.players
      : [];
  const peerRttEntry = rttPlayers.find((entry) =>
    typeof entry === 'object' && entry !== null
      ? entry.carIndex !== localCarIdx && (entry.rtt ?? 0) > 0
      : false
  );
  const rawPeerRtt =
    typeof peerRttEntry === 'object' && peerRttEntry !== null
      ? peerRttEntry.rtt
      : typeof rttPlayers[1] === 'number'
        ? rttPlayers[1]
        : typeof ch?.peerRttMs === 'number'
          ? ch.peerRttMs
          : 0;
  const opponentRttMs = Math.round(Number(rawPeerRtt) || 0);
  const visualSmoothing = Boolean(m.enableSmoothing ?? m.visualSmoothing ?? prevMetrics.visualSmoothing);

  const safeJitterMs = Number.isFinite(jitterMs) ? jitterMs : 0;
  const safeLastErrorUu = Number.isFinite(lastErrorUu) ? lastErrorUu : 0;
  const packetAgeMs = m.packetAgeMs ?? prevMetrics.packetAgeMs ?? 0;

  const quality = evaluateConnectionQuality({
    rttMs: effectiveRtt,
    jitterMs: safeJitterMs,
    packetLossPct,
    lastErrorUu: safeLastErrorUu,
    packetAgeMs,
  });

  return {
    ...m,
    rttMs: effectiveRtt,
    uplinkMs,
    downlinkMs,
    jitterMs: safeJitterMs,
    clientLeadTicks: leadTicks,
    corrections,
    serverTick,
    clientTick,
    deltaTicks,
    extraUplinkMs,
    extraDownlinkMs,
    extraRttMs,
    extraLatencyMs: Math.round(extraRttMs * 0.5),
    packetLossPct,
    connected: Boolean(ch),
    inputBufferDepth: Number.isFinite(inputBufferDepth) ? inputBufferDepth : 0,
    rollbackWindow: Number.isFinite(rollbackWindow) ? rollbackWindow : 0,
    lastErrorUu: safeLastErrorUu,
    maxErrorUu: Number.isFinite(maxErrorUu) ? maxErrorUu : 0,
    opponentRttMs: Number.isFinite(opponentRttMs) ? opponentRttMs : 0,
    visualSmoothing,
    reportRates: 'S: 120Hz / C: 120Hz',
    stressPresetId: m.stressPresetId ?? prevMetrics.stressPresetId,
    impairmentPresetId: m.impairmentPresetId ?? prevMetrics.impairmentPresetId,
    qualityScore: quality.score,
    qualityGrade: quality.grade,
    healthState: quality.healthState,
    packetAgeMs,
    neutralFallbackActive: quality.neutralFallbackActive,
    disconnectEvicted: quality.disconnectEvicted,
  };
}
