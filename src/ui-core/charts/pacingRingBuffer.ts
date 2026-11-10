export const PACING_EVENT_FLAGS = {
  NONE: 0,
  STARVATION: 1 << 0,
  HARD_RESYNC: 1 << 1,
  JITTER_SPIKE: 1 << 2,
} as const;

export interface PacingSampleInput {
  rawRttMs: number;
  smoothRttMs?: number;
  serverBuffer: number;
  effectiveBuffer?: number;
  targetBuffer: number;
  physicsRateHz: number;
  eventFlags?: number;
}

/**
 * PacingRingBuffer
 * Zero-allocation multi-channel Float32Array + Uint8Array circular buffer for 120Hz network clock-pacing streams.
 * Eliminates `Array.prototype.slice` and per-frame object allocations in the 120Hz oscilloscope draw loop.
 */
export class PacingRingBuffer {
  readonly capacity: number;
  readonly rawRttMs: Float32Array;
  readonly smoothRttMs: Float32Array;
  readonly serverBuffer: Float32Array;
  readonly effectiveBuffer: Float32Array;
  readonly targetBuffer: Float32Array;
  readonly physicsRateHz: Float32Array;
  readonly eventFlags: Uint8Array;

  private writeIndex = 0;
  private _count = 0;
  private _version = 0;
  private ewmaRtt = 24;
  private readonly listeners = new Set<(version: number) => void>();

  constructor(capacity = 360) {
    this.capacity = Math.max(16, capacity);
    this.rawRttMs = new Float32Array(this.capacity);
    this.smoothRttMs = new Float32Array(this.capacity);
    this.serverBuffer = new Float32Array(this.capacity);
    this.effectiveBuffer = new Float32Array(this.capacity);
    this.targetBuffer = new Float32Array(this.capacity);
    this.physicsRateHz = new Float32Array(this.capacity);
    this.eventFlags = new Uint8Array(this.capacity);
  }

  get count(): number {
    return this._count;
  }

  get version(): number {
    return this._version;
  }

  push(sample: PacingSampleInput): void {
    const idx = this.writeIndex;
    const raw = Math.max(0, sample.rawRttMs);
    this.ewmaRtt =
      this._count === 0
        ? raw
        : sample.smoothRttMs !== undefined
        ? sample.smoothRttMs
        : this.ewmaRtt * 0.88 + raw * 0.12;

    this.rawRttMs[idx] = raw;
    this.smoothRttMs[idx] = this.ewmaRtt;
    this.serverBuffer[idx] = sample.serverBuffer;
    this.effectiveBuffer[idx] = sample.effectiveBuffer ?? sample.serverBuffer;
    this.targetBuffer[idx] = sample.targetBuffer;
    this.physicsRateHz[idx] = sample.physicsRateHz;
    this.eventFlags[idx] = sample.eventFlags ?? 0;

    this.writeIndex = (idx + 1) % this.capacity;
    if (this._count < this.capacity) {
      this._count++;
    }
    this._version++;
    const v = this._version;
    for (const fn of this.listeners) {
      fn(v);
    }
  }

  /** Convert chronological index (0 = oldest, count - 1 = newest) to physical circular index in O(1) */
  physicalIndex(chronologicalIndex: number): number {
    const oldest = this._count < this.capacity ? 0 : this.writeIndex;
    let idx = oldest + chronologicalIndex;
    if (idx >= this.capacity) idx -= this.capacity;
    return idx;
  }

  clear(): void {
    this.writeIndex = 0;
    this._count = 0;
    this._version++;
    for (const fn of this.listeners) {
      fn(this._version);
    }
  }

  subscribe(listener: (version: number) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
