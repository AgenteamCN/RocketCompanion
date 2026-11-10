export interface PacingTelemetryTickSample {
  nowMs?: number;
  clientTick?: number;
  serverTick?: number;
  rawRttMs?: number;
  smoothRttMs?: number;
  jitterMs?: number;
  serverBuffer?: number;
  effectiveBuffer?: number;
  targetBuffer?: number;
  physicsRateHz?: number;
  leadTicks?: number;
  posErrorUu?: number;
  localPosErrorUu?: number;
  ballPosErrorUu?: number;
  remotePosErrorUu?: number;
  probePosErrorUu?: number;
  reconcileTier?: number;
  tierState?: number;
  packetArrived?: boolean;
  isKickoffMasked?: boolean;
  hardResync?: boolean;
  stepCatchup?: boolean;
  stepSkip?: boolean;
  tierSwitched?: boolean;
  tier3Snap?: boolean;
}

export interface PacingReconcileBreakdown {
  tier1NoOpCount: number;
  tier2RollbackCount: number;
  tier3HardSnapCount: number;
  localPosErrorMaxUu: number;
  ballPosErrorMaxUu: number;
  remotePosErrorMaxUu: number;
  probePosErrorMaxUu: number;
}

export interface PacingTelemetrySummaryStats {
  recordedTicks: number;
  durationSeconds: number;
  capacityPct: number;
  isOverflowFrozen: boolean;
  starvationCount: number;
  starvationPct: number;
  hardResyncCount: number;
  tier3SnapCount: number;
  catchupStepCount: number;
  skipStepCount: number;
  tierSwitchCount: number;
  rateSwitchesPerMin: number;
  meanRttMs: number;
  maxJitterMs: number;
  meanBufferTicks: number;
  p95BufferAbsError: number;
  stdPhysicsRateHz: number;
  estimated5050LeadPenaltyMs: number;
  reconcileBreakdown: PacingReconcileBreakdown;
  recommendedMode: string;
  recommendedPriority: string;
  recommendationReason: string;
}

export interface PacingTelemetryColumns {
  timeMs: number[];
  clientTick: number[];
  serverTick: number[];
  rawRttMs: number[];
  smoothRttMs: number[];
  jitterMs: number[];
  serverBuffer: number[];
  effectiveBuffer: number[];
  targetBuffer: number[];
  physicsRateHz: number[];
  leadTicks: number[];
  posErrorUu: number[];
  localPosErrorUu: number[];
  ballPosErrorUu: number[];
  remotePosErrorUu: number[];
  probePosErrorUu: number[];
  reconcileTier: number[];
  tierState: number[];
  eventFlags: number[];
}

export interface PacingTelemetryMetadataObject {
  schemaVersion: string;
  exportedAt: string;
  metadata: {
    clockPacingMode: string;
    clockPacingPriority: string;
    clockPacingParams?: Record<string, any> | null;
    maxCapacityTicks?: number;
    recordedTicks: number;
  };
  summary: PacingTelemetrySummaryStats;
}

export interface PacingTelemetrySerializableObject extends PacingTelemetryMetadataObject {
  columns: PacingTelemetryColumns;
}

export interface PacingTelemetryBufferSource {
  count: number;
  maxTicks: number;
  isOverflowFrozen: boolean;
  starvationCount: number;
  hardResyncCount: number;
  tier3SnapCount: number;
  catchupStepCount: number;
  skipStepCount: number;
  tierSwitchCount: number;
  timeMs: Float32Array;
  clientTick: Int32Array;
  serverTick: Int32Array;
  rawRttMs: Float32Array;
  smoothRttMs: Float32Array;
  jitterMs: Float32Array;
  serverBuffer: Int8Array;
  effectiveBuffer: Float32Array;
  targetBuffer: Float32Array;
  physicsRateHz: Float32Array;
  leadTicks: Int16Array;
  posErrorUu: Float32Array;
  localPosErrorUu: Float32Array;
  ballPosErrorUu: Float32Array;
  remotePosErrorUu: Float32Array;
  probePosErrorUu: Float32Array;
  reconcileTier: Uint8Array;
  tierState: Int8Array;
  eventFlags: Uint8Array;
}

export function computeTelemetrySummaryFromBuffers(
  recorder: PacingTelemetryBufferSource
): PacingTelemetrySummaryStats {
  const {
    count: n,
    maxTicks,
    isOverflowFrozen,
    starvationCount,
    hardResyncCount,
    tier3SnapCount,
    catchupStepCount,
    skipStepCount,
    tierSwitchCount,
    timeMs,
    rawRttMs,
    jitterMs,
    serverBuffer,
    targetBuffer,
    physicsRateHz,
    leadTicks,
    reconcileTier,
    localPosErrorUu,
    ballPosErrorUu,
    remotePosErrorUu,
    probePosErrorUu,
  } = recorder;

  if (n <= 0) {
    return {
      recordedTicks: 0,
      durationSeconds: 0,
      capacityPct: 0,
      isOverflowFrozen,
      starvationCount: 0,
      starvationPct: 0,
      hardResyncCount: 0,
      tier3SnapCount: 0,
      catchupStepCount: 0,
      skipStepCount: 0,
      tierSwitchCount: 0,
      rateSwitchesPerMin: 0,
      meanRttMs: 0,
      maxJitterMs: 0,
      meanBufferTicks: 0,
      p95BufferAbsError: 0,
      stdPhysicsRateHz: 0,
      estimated5050LeadPenaltyMs: 0,
      reconcileBreakdown: {
        tier1NoOpCount: 0,
        tier2RollbackCount: 0,
        tier3HardSnapCount: 0,
        localPosErrorMaxUu: 0,
        ballPosErrorMaxUu: 0,
        remotePosErrorMaxUu: 0,
        probePosErrorMaxUu: 0,
      },
      recommendedMode: 'sts',
      recommendedPriority: 'balanced',
      recommendationReason: 'No active match samples recorded yet.',
    };
  }

  const durationSec = Math.max(0.01, (timeMs[n - 1] - timeMs[0]) / 1000.0);
  let sumRtt = 0;
  let maxJitter = 0;
  let sumBuf = 0;
  let sumRate = 0;
  let sumLead = 0;
  let tier1NoOpCount = 0;
  let tier2RollbackCount = 0;
  let tier3HardSnapCount = 0;
  let localPosErrorMaxUu = 0;
  let ballPosErrorMaxUu = 0;
  let remotePosErrorMaxUu = 0;
  let probePosErrorMaxUu = 0;
  for (let i = 0; i < n; i++) {
    sumRtt += rawRttMs[i];
    if (jitterMs[i] > maxJitter) maxJitter = jitterMs[i];
    sumBuf += serverBuffer[i];
    sumRate += physicsRateHz[i];
    sumLead += leadTicks[i];
    const rt = reconcileTier[i] || 1;
    if (rt === 3) tier3HardSnapCount++;
    else if (rt === 2) tier2RollbackCount++;
    else tier1NoOpCount++;
    if (localPosErrorUu[i] > localPosErrorMaxUu) localPosErrorMaxUu = localPosErrorUu[i];
    if (ballPosErrorUu[i] > ballPosErrorMaxUu) ballPosErrorMaxUu = ballPosErrorUu[i];
    if (remotePosErrorUu[i] > remotePosErrorMaxUu) remotePosErrorMaxUu = remotePosErrorUu[i];
    if (probePosErrorUu[i] > probePosErrorMaxUu) probePosErrorMaxUu = probePosErrorUu[i];
  }
  const meanRtt = sumRtt / n;
  const meanBuf = sumBuf / n;
  const meanRate = sumRate / n;
  const meanLead = sumLead / n;

  let sumRateVar = 0;
  const stride = Math.max(1, Math.floor(n / 2000));
  const absErrors: number[] = [];
  for (let i = 0; i < n; i++) {
    const dr = physicsRateHz[i] - meanRate;
    sumRateVar += dr * dr;
    if (i % stride === 0) {
      absErrors.push(Math.abs(serverBuffer[i] - targetBuffer[i]));
    }
  }
  absErrors.sort((a, b) => a - b);
  const p95Idx = Math.min(absErrors.length - 1, Math.floor(absErrors.length * 0.95));
  const p95Err = absErrors.length > 0 ? absErrors[p95Idx] : 0;

  const starvationPct = Math.round((starvationCount / n) * 10000) / 100;
  const roundedMeanRtt = Math.round(meanRtt * 10) / 10;
  const roundedMaxJitter = Math.round(maxJitter * 10) / 10;

  let recommendedMode = 'csts';
  let recommendedPriority = 'balanced';
  let recommendationReason = '';
  if (roundedMaxJitter <= 4.5 && starvationPct < 0.5) {
    recommendedMode = 'sts';
    recommendedPriority = roundedMeanRtt <= 25 ? 'low_latency_5050' : 'rate_stability';
    recommendationReason = `Stable link (RTT ${roundedMeanRtt}ms, max jitter ${roundedMaxJitter}ms): STS 2-tier Schmitt deadband locks clock at 120.00Hz without continuous PD micro-modulation.`;
  } else if (roundedMaxJitter > 12.0 || starvationPct >= 2.0) {
    recommendedMode = 'csts';
    recommendedPriority = 'anti_starvation';
    recommendationReason = `High jitter/loss link (max jitter ${roundedMaxJitter}ms, starvation ${starvationPct}%): CSTS with Anti-Starvation dynamic target boost recommended.`;
  } else {
    recommendedMode = 'csts';
    recommendedPriority = 'balanced';
    recommendationReason = `Moderate jitter link (RTT ${roundedMeanRtt}ms, max jitter ${roundedMaxJitter}ms): CSTS with Balanced deadband damping recommended.`;
  }

  return {
    recordedTicks: n,
    durationSeconds: Math.round(durationSec * 10) / 10,
    capacityPct: Math.round((n / maxTicks) * 1000) / 10,
    isOverflowFrozen,
    starvationCount,
    starvationPct,
    hardResyncCount,
    tier3SnapCount,
    catchupStepCount,
    skipStepCount,
    tierSwitchCount,
    rateSwitchesPerMin: Math.round((tierSwitchCount / (durationSec / 60.0)) * 10) / 10,
    meanRttMs: roundedMeanRtt,
    maxJitterMs: roundedMaxJitter,
    meanBufferTicks: Math.round(meanBuf * 100) / 100,
    p95BufferAbsError: Math.round(p95Err * 100) / 100,
    stdPhysicsRateHz: Math.round(Math.sqrt(sumRateVar / n) * 1000) / 1000,
    estimated5050LeadPenaltyMs: Math.round(meanLead * (1000.0 / 120.0) * 10) / 10,
    reconcileBreakdown: {
      tier1NoOpCount,
      tier2RollbackCount,
      tier3HardSnapCount,
      localPosErrorMaxUu: Math.round(localPosErrorMaxUu * 100) / 100,
      ballPosErrorMaxUu: Math.round(ballPosErrorMaxUu * 100) / 100,
      remotePosErrorMaxUu: Math.round(remotePosErrorMaxUu * 100) / 100,
      probePosErrorMaxUu: Math.round(probePosErrorMaxUu * 100) / 100,
    },
    recommendedMode,
    recommendedPriority,
    recommendationReason,
  };
}

export function buildSerializableColumnsFromRecorder(
  recorder: PacingTelemetryBufferSource,
  meta: PacingTelemetryMetadataObject
): PacingTelemetrySerializableObject {
  const {
    count: n,
    timeMs,
    clientTick,
    serverTick,
    rawRttMs,
    smoothRttMs,
    jitterMs,
    serverBuffer,
    effectiveBuffer,
    targetBuffer,
    physicsRateHz,
    leadTicks,
    posErrorUu,
    localPosErrorUu,
    ballPosErrorUu,
    remotePosErrorUu,
    probePosErrorUu,
    reconcileTier,
    tierState,
    eventFlags,
  } = recorder;

  return {
    ...meta,
    schemaVersion: 'rc-network-telemetry-v2',
    columns: {
      timeMs: Array.from(timeMs.subarray(0, n), (v) => Math.round(v * 10) / 10),
      clientTick: Array.from(clientTick.subarray(0, n)),
      serverTick: Array.from(serverTick.subarray(0, n)),
      rawRttMs: Array.from(rawRttMs.subarray(0, n), (v) => Math.round(v * 100) / 100),
      smoothRttMs: Array.from(smoothRttMs.subarray(0, n), (v) => Math.round(v * 100) / 100),
      jitterMs: Array.from(jitterMs.subarray(0, n), (v) => Math.round(v * 100) / 100),
      serverBuffer: Array.from(serverBuffer.subarray(0, n)),
      effectiveBuffer: Array.from(effectiveBuffer.subarray(0, n), (v) => Math.round(v * 100) / 100),
      targetBuffer: Array.from(targetBuffer.subarray(0, n), (v) => Math.round(v * 100) / 100),
      physicsRateHz: Array.from(physicsRateHz.subarray(0, n), (v) => Math.round(v * 100) / 100),
      leadTicks: Array.from(leadTicks.subarray(0, n)),
      posErrorUu: Array.from(posErrorUu.subarray(0, n), (v) => Math.round(v * 100) / 100),
      localPosErrorUu: Array.from(localPosErrorUu.subarray(0, n), (v) => Math.round(v * 100) / 100),
      ballPosErrorUu: Array.from(ballPosErrorUu.subarray(0, n), (v) => Math.round(v * 100) / 100),
      remotePosErrorUu: Array.from(remotePosErrorUu.subarray(0, n), (v) => Math.round(v * 100) / 100),
      probePosErrorUu: Array.from(probePosErrorUu.subarray(0, n), (v) => Math.round(v * 100) / 100),
      reconcileTier: Array.from(reconcileTier.subarray(0, n)),
      tierState: Array.from(tierState.subarray(0, n)),
      eventFlags: Array.from(eventFlags.subarray(0, n)),
    },
  };
}

export const TELEMETRY_CSV_HEADER = [
  'index,timeMs,clientTick,serverTick,rawRttMs,smoothRttMs,jitterMs,serverBuffer,effectiveBuffer,targetBuffer',
  'physicsRateHz,leadTicks,posErrorUu,tierState,eventFlags,localPosErrorUu,ballPosErrorUu,remotePosErrorUu,probePosErrorUu,reconcileTier',
].join(',');

export function formatRecorderToCsvString(recorder: PacingTelemetryBufferSource): string {
  const {
    count: n,
    timeMs,
    clientTick,
    serverTick,
    rawRttMs,
    smoothRttMs,
    jitterMs,
    serverBuffer,
    effectiveBuffer,
    targetBuffer,
    physicsRateHz,
    leadTicks,
    posErrorUu,
    tierState,
    eventFlags,
    localPosErrorUu,
    ballPosErrorUu,
    remotePosErrorUu,
    probePosErrorUu,
    reconcileTier,
  } = recorder;
  const lines = [TELEMETRY_CSV_HEADER];
  for (let i = 0; i < n; i++) {
    lines.push(
      `${i},${timeMs[i].toFixed(1)},${clientTick[i]},${serverTick[i]},` +
        `${rawRttMs[i].toFixed(2)},${smoothRttMs[i].toFixed(2)},${jitterMs[i].toFixed(2)},` +
        `${serverBuffer[i]},${effectiveBuffer[i].toFixed(2)},${targetBuffer[i].toFixed(2)},` +
        `${physicsRateHz[i].toFixed(2)},${leadTicks[i]},${posErrorUu[i].toFixed(2)},` +
        `${tierState[i]},${eventFlags[i]},` +
        `${localPosErrorUu[i].toFixed(2)},${ballPosErrorUu[i].toFixed(2)},` +
        `${remotePosErrorUu[i].toFixed(2)},${probePosErrorUu[i].toFixed(2)},${reconcileTier[i]}`
    );
  }
  return lines.join('\n');
}

export function buildCsvFromColumns(c: Partial<PacingTelemetryColumns> | undefined): string {
  const n = c?.timeMs?.length || 0;
  if (n <= 0 || !c || !c.timeMs) return '';
  const {
    timeMs,
    clientTick,
    serverTick,
    rawRttMs,
    smoothRttMs,
    jitterMs,
    serverBuffer,
    effectiveBuffer,
    targetBuffer,
    physicsRateHz,
    leadTicks,
    posErrorUu,
    tierState,
    eventFlags,
    localPosErrorUu,
    ballPosErrorUu,
    remotePosErrorUu,
    probePosErrorUu,
    reconcileTier,
  } = c;
  const lines = [TELEMETRY_CSV_HEADER];
  for (let i = 0; i < n; i++) {
    lines.push(
      `${i},${timeMs[i]},${clientTick?.[i] ?? 0},${serverTick?.[i] ?? 0},${rawRttMs?.[i] ?? 0},${smoothRttMs?.[i] ?? 0},` +
        `${jitterMs?.[i] ?? 0},${serverBuffer?.[i] ?? 0},${effectiveBuffer?.[i] ?? 0},${targetBuffer?.[i] ?? 3},` +
        `${physicsRateHz?.[i] ?? 120},${leadTicks?.[i] ?? 3},${posErrorUu?.[i] ?? 0},${tierState?.[i] ?? 0},${eventFlags?.[i] ?? 0},` +
        `${localPosErrorUu?.[i] ?? 0},${ballPosErrorUu?.[i] ?? 0},${remotePosErrorUu?.[i] ?? 0},` +
        `${probePosErrorUu?.[i] ?? 0},${reconcileTier?.[i] ?? 1}`
    );
  }
  return lines.join('\n');
}
