/**
 * TelemetryRingBuffer
 * Strictly zero-allocation Float32Array circular buffer for 120Hz+ telemetry streams.
 * - Zero heap allocations per frame (no .subarray() wrappers, no object literals, no array copies)
 * - O(1) chronological index lookup via getAt(i) for direct Canvas 2D path drawing
 * - Decouples 120Hz waveform rendering from 10Hz quantile (p50/p95/p99) sorting
 */
export interface TelemetryComputedStats {
  currentMs: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  worstMs: number;
  overBudgetCount: number;
  overBudgetPct: number;
  ceiling: number;
  count: number;
}

export type TelemetryRingBufferListener = (latestValue: number, version: number) => void;

export class TelemetryRingBuffer {
  readonly capacity: number;
  private readonly buffer: Float32Array;
  private readonly sortScratch: Float32Array;
  private writeIndex = 0;
  private _count = 0;
  private _version = 0;
  private readonly listeners = new Set<TelemetryRingBufferListener>();

  // Pre-allocated stats struct mutated in-place to eliminate per-frame heap object allocation
  private readonly cachedStats: TelemetryComputedStats = {
    currentMs: 0,
    fps: 120,
    p50: 0,
    p95: 0,
    p99: 0,
    worstMs: 0,
    overBudgetCount: 0,
    overBudgetPct: 0,
    ceiling: 20,
    count: 0,
  };

  constructor(capacity = 240, initialValues?: ArrayLike<number>) {
    this.capacity = Math.max(8, capacity);
    this.buffer = new Float32Array(this.capacity);
    this.sortScratch = new Float32Array(this.capacity);

    if (initialValues && initialValues.length > 0) {
      const start = Math.max(0, initialValues.length - this.capacity);
      for (let i = start; i < initialValues.length; i++) {
        this.pushSilent(initialValues[i]);
      }
      this._version++;
    }
  }

  get count(): number {
    return this._count;
  }

  get version(): number {
    return this._version;
  }

  private pushSilent(value: number): void {
    this.buffer[this.writeIndex] = Number.isFinite(value) ? value : 0;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this._count < this.capacity) {
      this._count++;
    }
  }

  /**
   * Push a single sample in O(1) with zero heap allocations.
   */
  push(value: number): void {
    this.pushSilent(value);
    this._version++;
    const v = this._version;
    if (this.listeners.size > 0) {
      for (const listener of this.listeners) {
        listener(value, v);
      }
    }
  }

  /**
   * Push multiple samples in a batch (e.g., spike injection).
   */
  pushBatch(values: ArrayLike<number>): void {
    if (!values || values.length === 0) return;
    for (let i = 0; i < values.length; i++) {
      this.pushSilent(values[i]);
    }
    this._version++;
    const latest = values[values.length - 1] ?? 0;
    const v = this._version;
    if (this.listeners.size > 0) {
      for (const listener of this.listeners) {
        listener(latest, v);
      }
    }
  }

  /**
   * Read sample at chronological index `i` (0 = oldest, count - 1 = newest) in O(1) with zero allocation.
   */
  getAt(chronologicalIndex: number): number {
    if (chronologicalIndex < 0 || chronologicalIndex >= this._count) return 0;
    const oldestIdx = this._count < this.capacity ? 0 : this.writeIndex;
    let idx = oldestIdx + chronologicalIndex;
    if (idx >= this.capacity) idx -= this.capacity;
    return this.buffer[idx];
  }

  /**
   * Read the newest sample in O(1).
   */
  getLatest(): number {
    if (this._count === 0) return 0;
    const lastIdx = (this.writeIndex - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIdx];
  }

  /**
   * Clear all recorded samples.
   */
  clear(): void {
    this.writeIndex = 0;
    this._count = 0;
    this._version++;
    if (this.listeners.size > 0) {
      for (const listener of this.listeners) {
        listener(0, this._version);
      }
    }
  }

  /**
   * Subscribe to transient updates without React state.
   */
  subscribe(listener: TelemetryRingBufferListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Creates an immutable Float32Array snapshot ONLY when user explicitly clicks Freeze.
   */
  snapshot(): Float32Array {
    const len = this._count;
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = this.getAt(i);
    }
    return out;
  }

  /**
   * Fast O(N) ceiling & latest value update for 120Hz Canvas draw pass (no sorting, no allocation).
   */
  updateFastBounds(budgetMs = 8.33, refreshHz = 120): TelemetryComputedStats {
    const len = this._count;
    const s = this.cachedStats;
    s.count = len;
    if (len === 0) {
      s.currentMs = 0;
      s.fps = refreshHz;
      s.worstMs = 0;
      s.ceiling = Math.max(20, budgetMs * 2.5);
      return s;
    }

    let worst = 0;
    let overCount = 0;
    const threshold = budgetMs * 1.02;
    const oldestIdx = len < this.capacity ? 0 : this.writeIndex;
    for (let i = 0; i < len; i++) {
      let idx = oldestIdx + i;
      if (idx >= this.capacity) idx -= this.capacity;
      const val = this.buffer[idx];
      if (val > worst) worst = val;
      if (val > threshold) overCount++;
    }

    const currentMs = this.getLatest();
    let ceiling = Math.ceil(budgetMs * 2);
    while (ceiling < worst * 1.1 && ceiling < budgetMs * 12) {
      ceiling += Math.ceil(budgetMs);
    }
    ceiling = Math.max(ceiling, 18);

    s.currentMs = currentMs;
    s.fps = currentMs > 0.1 ? Math.min(999, Math.round(1000 / currentMs)) : refreshHz;
    s.worstMs = worst;
    s.overBudgetCount = overCount;
    s.overBudgetPct = Math.round((overCount / len) * 100);
    s.ceiling = ceiling;
    return s;
  }

  /**
   * Full quantile computation (p50/p95/p99) called only at ~10Hz for numeric DOM labels or when Frozen.
   */
  computeStats(
    budgetMs = 8.33,
    refreshHz = 120,
    frozenOverride?: Float32Array | null
  ): TelemetryComputedStats {
    const s = this.cachedStats;
    const len = frozenOverride ? frozenOverride.length : this._count;
    s.count = len;

    if (len === 0) {
      s.currentMs = 0;
      s.fps = refreshHz;
      s.p50 = 0;
      s.p95 = 0;
      s.p99 = 0;
      s.worstMs = 0;
      s.overBudgetCount = 0;
      s.overBudgetPct = 0;
      s.ceiling = Math.max(20, budgetMs * 2.5);
      return s;
    }

    const sortLen = Math.min(len, this.sortScratch.length);
    let overCount = 0;
    const threshold = budgetMs * 1.02;

    if (frozenOverride) {
      for (let i = 0; i < sortLen; i++) {
        const val = frozenOverride[i];
        this.sortScratch[i] = val;
        if (val > threshold) overCount++;
      }
    } else {
      const oldestIdx = len < this.capacity ? 0 : this.writeIndex;
      for (let i = 0; i < sortLen; i++) {
        let idx = oldestIdx + i;
        if (idx >= this.capacity) idx -= this.capacity;
        const val = this.buffer[idx];
        this.sortScratch[i] = val;
        if (val > threshold) overCount++;
      }
    }

    // Insertion sort on sortScratch[0..sortLen-1] in-place: zero subarray wrapper allocation!
    for (let i = 1; i < sortLen; i++) {
      const key = this.sortScratch[i];
      let j = i - 1;
      while (j >= 0 && this.sortScratch[j] > key) {
        this.sortScratch[j + 1] = this.sortScratch[j];
        j--;
      }
      this.sortScratch[j + 1] = key;
    }

    const currentMs = frozenOverride ? frozenOverride[len - 1] : this.getLatest();
    const worstMs = this.sortScratch[sortLen - 1];
    const p50 = this.sortScratch[Math.floor(sortLen * 0.5)];
    const p95 = this.sortScratch[Math.floor(sortLen * 0.95)];
    const p99 = this.sortScratch[Math.floor(sortLen * 0.99)];

    let ceiling = Math.ceil(budgetMs * 2);
    while (ceiling < worstMs * 1.1 && ceiling < budgetMs * 12) {
      ceiling += Math.ceil(budgetMs);
    }
    ceiling = Math.max(ceiling, 18);

    s.currentMs = currentMs;
    s.fps = currentMs > 0.1 ? Math.min(999, Math.round(1000 / currentMs)) : refreshHz;
    s.p50 = p50;
    s.p95 = p95;
    s.p99 = p99;
    s.worstMs = worstMs;
    s.overBudgetCount = overCount;
    s.overBudgetPct = Math.round((overCount / sortLen) * 100);
    s.ceiling = ceiling;
    return s;
  }
}
