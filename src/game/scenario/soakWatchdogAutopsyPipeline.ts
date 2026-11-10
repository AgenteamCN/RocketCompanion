/**
 * soakWatchdogAutopsyPipeline.ts
 * Pure rolling-window telemetry aggregators, multi-dimensional soft-limit
 * circuit breaker evaluators, and Autopsy Report formatters for Perf01.
 */

import { PIPELINE_STAGE_NAMES, roundMetric } from './scenarioMetricsPipeline.ts';
import type {
  AudioCallerAttributionEntry,
  PipelineStageName,
  SoakAbortReason,
  SoakAutopsyReport,
  SoakCircuitBreakerConfig,
  SoakStageWindowMetric,
  SoakWatchdogReportPayload,
  SoakWindowTelemetrySample,
  TransientAllocationSourceEntry,
} from './ScenarioTypes.ts';

export type {
  AudioCallerAttributionEntry,
  SoakAbortReason,
  SoakAutopsyReport,
  SoakCircuitBreakerConfig,
  SoakStageWindowMetric,
  SoakWatchdogReportPayload,
  SoakWindowTelemetrySample,
  TransientAllocationSourceEntry,
};

export interface CallerAggregateStats {
  uncleanedEvents: number;
  totalScheduledEvents: number;
  cancelCount: number;
  directValueWrites: number;
  activeParamInstances: number;
}

export const DEFAULT_SOAK_CIRCUIT_BREAKER_CONFIG: Readonly<SoakCircuitBreakerConfig> =
  Object.freeze({
    enabled: true,
    windowTicks: 600,
    minWindowsBeforeTrip: 3,
    maxHeapMb: 512,
    maxUncleanedAudioEvents: 50000,
    maxStageDriftRatio: 3.0,
    minStageAbsoluteDriftMs: 0.25,
    slopeWindowCount: 3,
  });

const BYTES_PER_BLINK_AUDIO_PARAM_EVENT = 80;

export function buildAudioCallerAttributions(
  callerMap: ReadonlyMap<string, CallerAggregateStats>,
  totalUncleaned: number,
  simSeconds: number
): AudioCallerAttributionEntry[] {
  const safeSimSec = Math.max(0.001, simSeconds);
  const entries: AudioCallerAttributionEntry[] = [];
  for (const [caller, stats] of callerMap.entries()) {
    if (
      stats.uncleanedEvents <= 0 &&
      stats.totalScheduledEvents <= 0 &&
      stats.directValueWrites <= 0
    ) {
      continue;
    }
    const sharePercent =
      totalUncleaned > 0 ? roundMetric((stats.uncleanedEvents / totalUncleaned) * 100, 1) : 0;
    entries.push({
      caller,
      uncleanedEvents: stats.uncleanedEvents,
      totalScheduledEvents: stats.totalScheduledEvents,
      cancelCount: stats.cancelCount,
      directValueWrites: stats.directValueWrites,
      activeParamInstances: stats.activeParamInstances,
      sharePercent,
      eventsPerSimSecond: roundMetric(stats.uncleanedEvents / safeSimSec, 1),
      estimatedNativeTimelineKb: roundMetric(
        (stats.uncleanedEvents * BYTES_PER_BLINK_AUDIO_PARAM_EVENT) / 1024,
        1
      ),
    });
  }
  entries.sort(
    (a, b) =>
      b.uncleanedEvents - a.uncleanedEvents || b.totalScheduledEvents - a.totalScheduledEvents
  );
  return entries;
}

export function buildTransientAllocationAttributions(
  allocMap: ReadonlyMap<string, number>,
  simSeconds: number
): { total: number; ratePerSec: number; entries: TransientAllocationSourceEntry[] } {
  const safeSimSec = Math.max(0.001, simSeconds);
  let total = 0;
  for (const count of allocMap.values()) total += count;
  const entries: TransientAllocationSourceEntry[] = [];
  for (const [source, count] of allocMap.entries()) {
    if (count <= 0) continue;
    entries.push({
      source,
      totalAllocations: count,
      allocationsPerSimSecond: roundMetric(count / safeSimSec, 1),
      sharePercent: total > 0 ? roundMetric((count / total) * 100, 1) : 0,
    });
  }
  entries.sort((a, b) => b.totalAllocations - a.totalAllocations);
  return { total, ratePerSec: roundMetric(total / safeSimSec, 1), entries };
}

export function computeLinearSlopePer1000Ticks(
  points: ReadonlyArray<{ tick: number; value: number }>
): number {
  const n = points.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = points[i].tick / 1000;
    const y = points[i].value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) return 0;
  return roundMetric((n * sumXY - sumX * sumY) / denom, 4);
}

export function formatSoakStreamLine(sample: {
  tick: number;
  simSeconds: number;
  wallSeconds: number;
  fpsEquivalentHz: number;
  audioBaselineMs: number;
  audioCurrentMs: number;
  audioDriftPercent: number;
  simCurrentMs: number;
  jsHeapUsedMb: number;
  uncleanedAudioEvents: number;
  topAudioCaller: AudioCallerAttributionEntry | undefined;
  vectorsAllocPerSec: number;
}): string {
  const sign = sample.audioDriftPercent >= 0 ? '+' : '';
  const warnFlag =
    sample.audioDriftPercent >= 100 || sample.uncleanedAudioEvents >= 50000 ? ' \u26a0' : '';
  const topCallerStr = sample.topAudioCaller
    ? `${sample.topAudioCaller.caller}: ${Math.round(sample.topAudioCaller.sharePercent)}%`
    : 'clean: 0%';
  return (
    `[Tick ${sample.tick} | Sim ${sample.simSeconds.toFixed(1)}s | Wall ${sample.wallSeconds.toFixed(1)}s] ` +
    `FPS_eq=${Math.round(sample.fpsEquivalentHz)}Hz | ` +
    `Stage(ms): Audio=${sample.audioBaselineMs.toFixed(2)}->${sample.audioCurrentMs.toFixed(2)}(${sign}${Math.round(sample.audioDriftPercent)}%${warnFlag}) ` +
    `Sim=${sample.simCurrentMs.toFixed(2)} | ` +
    `JSHeap=${sample.jsHeapUsedMb.toFixed(1)}MB | ` +
    `AudioEvents=${sample.uncleanedAudioEvents.toLocaleString('en-US')} (${topCallerStr}) | ` +
    `VectorsAlloc/s=${Math.round(sample.vectorsAllocPerSec).toLocaleString('en-US')}`
  );
}

export function buildSoakWindowSample(input: {
  completedTicks: number;
  windowTickCount: number;
  windowWallMs: number;
  totalWallSeconds: number;
  windowStageSums: Record<PipelineStageName | 'TotalFrame', number>;
  priorWindows: readonly SoakWindowTelemetrySample[];
  heapUsedMb: number;
  heapTotalMb: number;
  callerStats: ReadonlyMap<string, CallerAggregateStats>;
  allocationCounts: ReadonlyMap<string, number>;
  totalUncleanedAudioEvents: number;
  totalScheduledAudioEvents: number;
  totalDirectAudioValueWrites: number;
}): SoakWindowTelemetrySample {
  const {
    completedTicks,
    windowTickCount,
    windowWallMs,
    totalWallSeconds,
    windowStageSums,
    priorWindows,
    heapUsedMb,
    heapTotalMb,
    callerStats,
    allocationCounts,
    totalUncleanedAudioEvents,
    totalScheduledAudioEvents,
    totalDirectAudioValueWrites,
  } = input;

  const simSeconds = roundMetric(completedTicks / 120, 1);
  const count = Math.max(1, windowTickCount);
  const fpsEquivalentHz = roundMetric((count / Math.max(0.01, windowWallMs)) * 1000, 1);
  const firstWin = priorWindows[0];
  const stageMetrics = {} as Record<PipelineStageName | 'TotalFrame', SoakStageWindowMetric>;

  for (const st of [...PIPELINE_STAGE_NAMES, 'TotalFrame' as const]) {
    const currMean = roundMetric(windowStageSums[st] / count, 4);
    const baseMean = firstWin ? firstWin.stageMetrics[st].baselineMeanMs : currMean;
    const safeBase = Math.max(0.005, baseMean);
    const driftRatio = roundMetric(currMean / safeBase, 2);
    const driftPercent = firstWin ? roundMetric(((currMean - baseMean) / safeBase) * 100, 1) : 0;
    const points = priorWindows.map((w) => ({
      tick: w.tick,
      value: w.stageMetrics[st].currentMeanMs,
    }));
    points.push({ tick: completedTicks, value: currMean });
    stageMetrics[st] = {
      stage: st,
      baselineMeanMs: baseMean,
      currentMeanMs: currMean,
      driftPercent,
      driftRatio,
      slopeMsPer1000Ticks: computeLinearSlopePer1000Ticks(points),
    };
  }

  const topAudioCallers = buildAudioCallerAttributions(
    callerStats,
    totalUncleanedAudioEvents,
    simSeconds
  );
  const allocSummary = buildTransientAllocationAttributions(allocationCounts, simSeconds);
  const estimatedAudioNativeKb = roundMetric((totalUncleanedAudioEvents * 80) / 1024, 1);

  const formattedLine = formatSoakStreamLine({
    tick: completedTicks,
    simSeconds,
    wallSeconds: totalWallSeconds,
    fpsEquivalentHz,
    audioBaselineMs: stageMetrics.AudioStage.baselineMeanMs,
    audioCurrentMs: stageMetrics.AudioStage.currentMeanMs,
    audioDriftPercent: stageMetrics.AudioStage.driftPercent,
    simCurrentMs: stageMetrics.SimulationStage.currentMeanMs,
    jsHeapUsedMb: heapUsedMb,
    uncleanedAudioEvents: totalUncleanedAudioEvents,
    topAudioCaller: topAudioCallers[0],
    vectorsAllocPerSec: allocSummary.ratePerSec,
  });

  return {
    windowIndex: priorWindows.length + 1,
    tick: completedTicks,
    simSeconds,
    wallSeconds: totalWallSeconds,
    windowWallMs: roundMetric(windowWallMs, 2),
    fpsEquivalentHz,
    jsHeapUsedMb: heapUsedMb,
    jsHeapTotalMb: heapTotalMb,
    uncleanedAudioEvents: totalUncleanedAudioEvents,
    totalScheduledAudioEvents,
    directAudioValueWrites: totalDirectAudioValueWrites,
    estimatedAudioNativeKb,
    topAudioCallers,
    vectorsAndTransientAllocPerSec: allocSummary.ratePerSec,
    totalTransientAllocations: allocSummary.total,
    topAllocationSources: allocSummary.entries,
    stageMetrics,
    formattedLine,
  };
}

export function evaluateSoakCircuitBreaker(
  windows: readonly SoakWindowTelemetrySample[],
  config: SoakCircuitBreakerConfig
): SoakAbortReason {
  if (!config.enabled || windows.length < config.minWindowsBeforeTrip) {
    return 'NONE';
  }
  const latest = windows[windows.length - 1];

  if (latest.uncleanedAudioEvents >= config.maxUncleanedAudioEvents) {
    const k = Math.min(config.slopeWindowCount, windows.length);
    let strictlyGrowing = true;
    for (let i = windows.length - k + 1; i < windows.length; i++) {
      if (windows[i].uncleanedAudioEvents <= windows[i - 1].uncleanedAudioEvents) {
        strictlyGrowing = false;
        break;
      }
    }
    if (strictlyGrowing) return 'WEB_AUDIO_TIMELINE_UNBOUNDED_GROWTH';
  }

  if (latest.jsHeapUsedMb >= config.maxHeapMb) {
    return 'JS_HEAP_SOFT_LIMIT_EXCEEDED';
  }

  const k = Math.min(config.slopeWindowCount, windows.length);
  const criticalStages: ReadonlyArray<PipelineStageName> = [
    'AudioStage',
    'SimulationStage',
    'GameplayModeStage',
    'TelemetryStage',
  ];
  for (const stage of criticalStages) {
    let sustainedDrift = true;
    for (let i = windows.length - k; i < windows.length; i++) {
      const m = windows[i].stageMetrics[stage];
      const absDelta = m.currentMeanMs - m.baselineMeanMs;
      if (m.driftRatio < config.maxStageDriftRatio || absDelta < config.minStageAbsoluteDriftMs) {
        sustainedDrift = false;
        break;
      }
    }
    if (sustainedDrift) return 'PIPELINE_STAGE_DRIFT_EXCEEDED';
  }

  return 'NONE';
}

export function buildSoakAutopsyReport(
  windows: readonly SoakWindowTelemetrySample[],
  abortReason: SoakAbortReason,
  config: SoakCircuitBreakerConfig
): SoakAutopsyReport {
  const first = windows[0];
  const latest = windows[windows.length - 1];
  const tripped = abortReason !== 'NONE';
  const tick = latest?.tick ?? 0;
  const simSec = latest?.simSeconds ?? 0;
  const wallSec = latest?.wallSeconds ?? 0;
  const initHeap = first?.jsHeapUsedMb ?? 0;
  const finalHeap = latest?.jsHeapUsedMb ?? 0;
  let peakHeap = 0;
  for (const w of windows) {
    if (w.jsHeapUsedMb > peakHeap) peakHeap = w.jsHeapUsedMb;
  }
  const heapSlopePerMin = simSec > 1 ? roundMetric(((finalHeap - initHeap) / simSec) * 60, 2) : 0;

  const finalAudioEvents = latest?.uncleanedAudioEvents ?? 0;
  const finalAudioNativeMb = roundMetric((latest?.estimatedAudioNativeKb ?? 0) / 1024, 2);
  const audioEventsPerSec = simSec > 0 ? roundMetric(finalAudioEvents / simSec, 1) : 0;
  const topAudio = (latest?.topAudioCallers ?? []).slice(0, 5);
  const topAlloc = (latest?.topAllocationSources ?? []).slice(0, 5);

  const stageDriftSummary: SoakStageWindowMetric[] = [];
  if (latest) {
    for (const st of [...PIPELINE_STAGE_NAMES, 'TotalFrame' as const]) {
      stageDriftSummary.push(latest.stageMetrics[st]);
    }
  }

  const hr = '='.repeat(94);
  const thinHr = '-'.repeat(94);
  const lines: string[] = [
    hr,
    tripped
      ? ' SOAK WATCHDOG CIRCUIT BREAKER TRIPPED -- AUTOPSY REPORT'
      : ' SOAK WATCHDOG COMPLETED -- ZERO-LEAK VERIFICATION SUMMARY',
    hr,
    ` Triggered At    : Tick ${tick.toLocaleString('en-US')} (Sim ${simSec.toFixed(1)}s, Wall ${wallSec.toFixed(2)}s)`,
    ` ABORT_REASON    : ${abortReason}`,
    ` JS Heap Status  : ${initHeap.toFixed(1)} MB -> ${finalHeap.toFixed(1)} MB (Peak ${peakHeap.toFixed(1)} MB | Slope ${heapSlopePerMin >= 0 ? '+' : ''}${heapSlopePerMin.toFixed(2)} MB/min | Limit ${config.maxHeapMb} MB)`,
    ` WebAudio Events : ${finalAudioEvents.toLocaleString('en-US')} uncleaned events (~${finalAudioNativeMb.toFixed(2)} MB C++ timeline | +${audioEventsPerSec.toLocaleString('en-US')} ev/s | Limit ${config.maxUncleanedAudioEvents.toLocaleString('en-US')})`,
    thinHr,
    ' TOP WEB AUDIO TIMELINE CULPRITS (AudioParam Uncleaned Automation Events):',
  ];

  if (topAudio.length === 0 || finalAudioEvents === 0) {
    lines.push('   [CLEAN] 0 uncleaned AudioParam timeline automation events.');
  } else {
    for (let i = 0; i < topAudio.length; i++) {
      const c = topAudio[i];
      lines.push(
        `   ${i + 1}. ${c.caller} (${c.sharePercent.toFixed(1)}% / ${c.uncleanedEvents.toLocaleString('en-US')} uncleaned events across ${c.activeParamInstances} AudioParams | +${c.eventsPerSimSecond.toLocaleString('en-US')} ev/s | ~${c.estimatedNativeTimelineKb.toFixed(1)} KB C++)`
      );
    }
  }

  lines.push(thinHr);
  lines.push(' TOP 120HZ HOT-PATH TRANSIENT OBJECT / VECTOR ALLOCATION SOURCES:');
  if (topAlloc.length === 0) {
    lines.push('   [CLEAN] 0 hot-path transient allocations detected.');
  } else {
    for (let i = 0; i < topAlloc.length; i++) {
      const a = topAlloc[i];
      lines.push(
        `   ${i + 1}. ${a.source} (${a.sharePercent.toFixed(1)}% / ${a.totalAllocations.toLocaleString('en-US')} objects | ${a.allocationsPerSimSecond.toLocaleString('en-US')} alloc/s)`
      );
    }
  }

  lines.push(thinHr);
  lines.push(' PIPELINE STAGE WALL-CLOCK DRIFT & SLOPE (Window 1 Baseline -> Final Window):');
  for (const st of stageDriftSummary) {
    const sign = st.driftPercent >= 0 ? '+' : '';
    const slopeSign = st.slopeMsPer1000Ticks >= 0 ? '+' : '';
    lines.push(
      `   ${st.stage.padEnd(18, ' ')} : ${st.baselineMeanMs.toFixed(4)} ms -> ${st.currentMeanMs.toFixed(4)} ms (${sign}${st.driftPercent.toFixed(1)}% | ratio=${st.driftRatio.toFixed(2)}x | slope=${slopeSign}${st.slopeMsPer1000Ticks.toFixed(4)} ms/kTick)`
    );
  }
  lines.push(hr);

  return {
    circuitBreakerTripped: tripped,
    abortReason,
    triggeredAtTick: tick,
    triggeredAtSimSeconds: simSec,
    triggeredAtWallSeconds: wallSec,
    configuredThresholds: config,
    initialJsHeapMb: initHeap,
    finalJsHeapMb: finalHeap,
    peakJsHeapMb: peakHeap,
    heapSlopeMbPerSimMinute: heapSlopePerMin,
    finalUncleanedAudioEvents: finalAudioEvents,
    finalEstimatedAudioNativeMb: finalAudioNativeMb,
    audioEventsPerSimSecond: audioEventsPerSec,
    topAudioCulprits: topAudio,
    topAllocationCulprits: topAlloc,
    stageDriftSummary,
    formattedAutopsyLines: lines,
  };
}
