/**
 * PerformanceProfiler.ts
 * High-performance circular buffers tracking frame presentation times,
 * CPU render phase breakdowns, 120Hz physics sub-ticks, dropped frames, and refresh rate detection.
 */

export const PROFILER_PHASES = ['sim', 'scene', 'camera', 'prep', 'bloom', 'final'];
export const PROFILER_HISTORY_LENGTH = 10000;
export const DISPLAY_SAMPLE_COUNT = 120;
export const MAX_FRAME_GAP_MS = 1000;
export const KNOWN_REFRESH_RATES = [
  30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 175, 200, 240, 360, 480, 500, 540, 600,
];

export const STATUS_CHART_CONFIG = {
  WIDTH: 260,
  HEIGHT: 54,
  UPDATE_RATE_HZ: 6,
  HISTORY_SECONDS: 10,
};

/**
 * Low-overhead performance sampler and statistical profiler
 */
export interface ProfilerMetricStats {
  avgMs: number;
  p50: number;
  p95: number;
  p99: number;
  worstMs: number;
  fps: number;
}

export interface ProfilerPhaseBreakdown {
  phase: string;
  avgMs: number;
  share: number;
}

export interface ProfilerSimStats {
  ticksPerFrame: number;
  droppedTicks: number;
  clampedFrames: number;
  stalls: number;
}

export interface ProfilerSnapshot {
  count: number;
  windowSeconds: number;
  frame: ProfilerMetricStats;
  cpu: ProfilerMetricStats;
  refreshHz: number;
  budgetMs: number;
  overBudgetPct: number;
  phases: ProfilerPhaseBreakdown[];
  sim: ProfilerSimStats;
  history: Float32Array;
  historySeconds: number;
}

/**
 * Low-overhead performance sampler and statistical profiler
 */
export class PerformanceProfiler {
  frameMs: Float32Array;
  cpuMs: Float32Array;
  stamp: Float64Array;
  phaseMs: Float32Array[];
  ticks: Float32Array;
  scratch: Float32Array;
  write: number;
  count: number;
  activeTimeMs: number;
  resumeWarmupFrames: number;
  frameStartedAt: number;
  previousFrameAt: number;
  lastMarkAt: number;
  phaseIndex: number;
  pending: Float32Array;
  droppedTicks: number;
  clampedFrames: number;
  stalls: number;
  resumes: number;
  displayMs: Float32Array;
  previousDisplayAt: number;
  displayWrite: number;
  displayCount: number;

  constructor() {
    this.frameMs = new Float32Array(PROFILER_HISTORY_LENGTH);
    this.cpuMs = new Float32Array(PROFILER_HISTORY_LENGTH);
    this.stamp = new Float64Array(PROFILER_HISTORY_LENGTH);
    this.phaseMs = PROFILER_PHASES.map(() => new Float32Array(PROFILER_HISTORY_LENGTH));
    this.ticks = new Float32Array(PROFILER_HISTORY_LENGTH);
    this.scratch = new Float32Array(PROFILER_HISTORY_LENGTH);

    this.write = 0;
    this.count = 0;
    this.activeTimeMs = 0;
    this.resumeWarmupFrames = 0;
    this.frameStartedAt = 0;
    this.previousFrameAt = 0;
    this.lastMarkAt = 0;
    this.phaseIndex = 0;
    this.pending = new Float32Array(PROFILER_PHASES.length);

    this.droppedTicks = 0;
    this.clampedFrames = 0;
    this.stalls = 0;
    this.resumes = 0;

    this.displayMs = new Float32Array(DISPLAY_SAMPLE_COUNT);
    this.previousDisplayAt = -1;
    this.displayWrite = 0;
    this.displayCount = 0;
  }

  /**
   * Records a display presentation event from requestAnimationFrame
   * @param {number} timestamp - Performance timestamp
   */
  displayFrame(timestamp: number): void {
    const delta = timestamp - this.previousDisplayAt;
    if (this.previousDisplayAt >= 0 && delta > 0 && delta < MAX_FRAME_GAP_MS) {
      this.displayMs[this.displayWrite] = delta;
      this.displayWrite = (this.displayWrite + 1) % DISPLAY_SAMPLE_COUNT;
      this.displayCount = Math.min(this.displayCount + 1, DISPLAY_SAMPLE_COUNT);
    }
    this.previousDisplayAt = timestamp;
  }

  /**
   * Marks start of a CPU render frame
   */
  frameStart(): void {
    const now = performance.now();
    this.previousFrameAt = this.frameStartedAt;
    this.frameStartedAt = now;
    this.lastMarkAt = now;
    this.phaseIndex = 0;
    this.pending.fill(0);
  }

  /**
   * Marks transition between frame phases (sim -> scene -> camera -> prep -> bloom -> final)
   */
  mark(): void {
    if (this.phaseIndex >= PROFILER_PHASES.length) return;
    const now = performance.now();
    this.pending[this.phaseIndex] = now - this.lastMarkAt;
    this.lastMarkAt = now;
    this.phaseIndex += 1;
  }

  /**
   * Finalizes CPU frame record and commits measurements to circular ring buffers
   * @param {number} ticks - Physics sub-ticks simulated during this frame
   * @param {number} dropped - Sub-ticks dropped to avoid spiral of death
   * @param {boolean} stalled - Whether physical simulation stalled
   * @param {boolean} skipSample - Whether to omit this frame from statistical ring buffers (e.g. during Power Saving mode)
   */
  frameEnd(ticks: number, dropped = 0, stalled = false, skipSample = false): void {
    if (skipSample) {
      this.previousFrameAt = 0;
      this.resumeWarmupFrames = Math.max(this.resumeWarmupFrames, 2);
      return;
    }
    if (this.previousFrameAt === 0) return;
    const cpuDuration = performance.now() - this.frameStartedAt;
    const frameDelta = this.frameStartedAt - this.previousFrameAt;
    if (frameDelta > MAX_FRAME_GAP_MS) {
      this.resumes += 1;
      this.resumeWarmupFrames = Math.max(this.resumeWarmupFrames, 2);
      return;
    }
    if (this.resumeWarmupFrames > 0) {
      this.resumeWarmupFrames -= 1;
      return;
    }

    this.activeTimeMs += frameDelta;
    const writeIdx = this.write;

    this.frameMs[writeIdx] = frameDelta;
    this.cpuMs[writeIdx] = cpuDuration;
    this.stamp[writeIdx] = this.activeTimeMs;

    for (let phaseIndex = 0; phaseIndex < PROFILER_PHASES.length; phaseIndex += 1) {
      this.phaseMs[phaseIndex][writeIdx] = this.pending[phaseIndex];
    }

    this.ticks[writeIdx] = ticks;
    this.write = (this.write + 1) % PROFILER_HISTORY_LENGTH;
    if (this.count < PROFILER_HISTORY_LENGTH) {
      this.count += 1;
    }

    const pruneCutoff = this.activeTimeMs - 15000;
    while (this.count > 1 && this.stamp[this.at(0)] < pruneCutoff) {
      this.count -= 1;
    }

    if (dropped > 0) {
      this.droppedTicks += dropped;
      this.clampedFrames += 1;
    }
    if (stalled) {
      this.stalls += 1;
    }
  }

  /**
   * Resets frame timestamp baseline when transitioning out of Power Saving mode
   * while preserving active-time sample history so pre-pause and post-pause frames stitch seamlessly.
   */
  resetTimingAfterPowerSave() {
    this.frameStartedAt = 0;
    this.previousFrameAt = 0;
    this.previousDisplayAt = -1;
    this.resumeWarmupFrames = Math.max(this.resumeWarmupFrames, 2);
  }

  resetCounters() {
    this.droppedTicks = 0;
    this.clampedFrames = 0;
    this.stalls = 0;
    this.resumes = 0;
  }

  at(offset) {
    return (
      (((this.write - this.count + PROFILER_HISTORY_LENGTH) % PROFILER_HISTORY_LENGTH) + offset) %
      PROFILER_HISTORY_LENGTH
    );
  }

  percentile(sortedArr, len, p) {
    if (len === 0) return 0;
    const idx = Math.min(len - 1, Math.max(0, Math.round(p * (len - 1))));
    return sortedArr[idx];
  }

  statsOf(sourceArr, len) {
    let sum = 0;
    for (let i = 0; i < len; i += 1) {
      const val = sourceArr[this.at(i)];
      this.scratch[i] = val;
      sum += val;
    }
    const sorted = this.scratch.subarray(0, len);
    sorted.sort();
    const avg = sum / len;
    return {
      avgMs: avg,
      p50: this.percentile(sorted, len, 0.5),
      p95: this.percentile(sorted, len, 0.95),
      p99: this.percentile(sorted, len, 0.99),
      worstMs: sorted[len - 1],
      fps: avg > 0 ? 1000 / avg : 0,
    };
  }

  /**
   * Produces a comprehensive statistical snapshot over a rolling time window
   * @param {number} historyBins - Number of sparkline graph columns
   * @param {number} historySeconds - Time window in seconds
   */
  snapshot(historyBins = 240, historySeconds = 10) {
    if (this.count > 0) {
      const cutoff = this.stamp[this.at(this.count - 1)] - historySeconds * 1000;
      while (this.count > 1 && this.stamp[this.at(0)] < cutoff) {
        this.count -= 1;
      }
    }

    const sampleCount = this.count;
    const n = sampleCount;
    const emptyStats = { avgMs: 0, p50: 0, p95: 0, p99: 0, worstMs: 0, fps: 0 };
    if (sampleCount === 0) {
      return {
        count: 0,
        windowSeconds: 0,
        frame: emptyStats,
        cpu: emptyStats,
        refreshHz: 60,
        budgetMs: 1000 / 60,
        overBudgetPct: 0,
        phases: [],
        sim: { ticksPerFrame: 0, droppedTicks: 0, clampedFrames: 0, stalls: 0 },
        history: new Float32Array(0),
        historySeconds: 0,
      };
    }

    const frameStats = this.statsOf(this.frameMs, sampleCount);
    const cpuStats = this.statsOf(this.cpuMs, sampleCount);

    this.scratch.set(this.displayMs.subarray(0, this.displayCount));
    const sortedDisplay = this.scratch.subarray(0, this.displayCount);
    sortedDisplay.sort();
    const p10Display = this.percentile(sortedDisplay, this.displayCount, 0.1);

    let refreshHz = p10Display > 0 ? 1000 / p10Display : 60;
    let snapped = false;
    for (const rate of KNOWN_REFRESH_RATES) {
      if (Math.abs(refreshHz - rate) / rate < 0.08) {
        refreshHz = rate;
        snapped = true;
        break;
      }
    }
    if (!snapped) {
      refreshHz = Math.round(refreshHz);
    }

    const budgetMs = 1000 / refreshHz;
    let overBudgetCount = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      if (this.frameMs[this.at(i)] > budgetMs * 1.02) {
        overBudgetCount += 1;
      }
    }

    const phases: Array<{ phase: string; avgMs: number; share: number }> = [];
    let totalPhasesAvg = 0;
    for (let phaseIndex = 0; phaseIndex < PROFILER_PHASES.length; phaseIndex += 1) {
      let phaseSum = 0;
      for (let i = 0; i < sampleCount; i += 1) {
        phaseSum += this.phaseMs[phaseIndex][this.at(i)];
      }
      const phaseAvg = phaseSum / sampleCount;
      totalPhasesAvg += phaseAvg;
      phases.push({ phase: PROFILER_PHASES[phaseIndex], avgMs: phaseAvg, share: 0 });
    }

    const otherAvg = Math.max(0, cpuStats.avgMs - totalPhasesAvg);
    phases.push({ phase: 'other', avgMs: otherAvg, share: 0 });
    for (const ph of phases) {
      ph.share = cpuStats.avgMs > 0 ? ph.avgMs / cpuStats.avgMs : 0;
    }

    let totalTicks = 0;
    for (let i = 0; i < n; i += 1) {
      totalTicks += this.ticks[this.at(i)];
    }

    const bins = Math.max(1, Math.round(historyBins));
    const history = new Float32Array(bins);
    const newestStamp = this.stamp[this.at(n - 1)];
    const windowMs = historySeconds * 1000;
    const msPerBin = windowMs / bins;
    let oldestStamp = newestStamp;

    for (let i = 0; i < n; i += 1) {
      const idx = this.at(i);
      const ageMs = newestStamp - this.stamp[idx];
      if (ageMs > windowMs) continue;
      if (this.stamp[idx] < oldestStamp) {
        oldestStamp = this.stamp[idx];
      }
      const binIdx = Math.min(bins - 1, bins - 1 - Math.floor(ageMs / msPerBin));
      if (this.frameMs[idx] > history[binIdx]) {
        history[binIdx] = this.frameMs[idx];
      }
    }

    for (let i = 1; i < bins; i += 1) {
      if (history[i] === 0) history[i] = history[i - 1];
    }
    for (let i = bins - 2; i >= 0; i -= 1) {
      if (history[i] === 0) history[i] = history[i + 1];
    }

    return {
      count: n,
      windowSeconds: (newestStamp - oldestStamp) / 1000,
      frame: frameStats,
      cpu: cpuStats,
      refreshHz,
      budgetMs,
      overBudgetPct: (overBudgetCount / n) * 100,
      phases,
      sim: {
        ticksPerFrame: totalTicks / n,
        droppedTicks: this.droppedTicks,
        clampedFrames: this.clampedFrames,
        stalls: this.stalls,
      },
      history,
      historySeconds: Math.min(historySeconds, (newestStamp - oldestStamp) / 1000),
    };
  }
}
