import { TELEMETRY_EVENT_FLAGS } from '../config/pacingControllerEvaluator';
import {
  buildSerializableColumnsFromRecorder,
  computeTelemetrySummaryFromBuffers,
  formatRecorderToCsvString,
  type PacingReconcileBreakdown,
  type PacingTelemetryColumns,
  type PacingTelemetryMetadataObject,
  type PacingTelemetrySerializableObject,
  type PacingTelemetrySummaryStats,
  type PacingTelemetryTickSample,
} from './pacingTelemetryFormatPipeline';

export const MAX_TELEMETRY_TICKS = 144000; // 20 minutes @ 120Hz

export type {
  PacingTelemetryTickSample,
  PacingReconcileBreakdown,
  PacingTelemetrySummaryStats,
  PacingTelemetryColumns,
  PacingTelemetryMetadataObject,
  PacingTelemetrySerializableObject,
};

export class PacingTelemetryRecorder {
  maxTicks: number;
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
  count: number;
  sessionStartMs: number;
  isOverflowFrozen: boolean;
  overflowNotified: boolean;
  onCapacityOverflow: ((recorder: PacingTelemetryRecorder) => void) | null;
  starvationCount: number;
  hardResyncCount: number;
  tier3SnapCount: number;
  catchupStepCount: number;
  skipStepCount: number;
  tierSwitchCount: number;
  activeMode: string;
  activePriority: string;
  activeParams: Record<string, any> | null;
  private listeners = new Set<() => void>();

  constructor(maxTicks: number = MAX_TELEMETRY_TICKS) {
    this.maxTicks = maxTicks;
    this.timeMs = new Float32Array(maxTicks);
    this.clientTick = new Int32Array(maxTicks);
    this.serverTick = new Int32Array(maxTicks);
    this.rawRttMs = new Float32Array(maxTicks);
    this.smoothRttMs = new Float32Array(maxTicks);
    this.jitterMs = new Float32Array(maxTicks);
    this.serverBuffer = new Int8Array(maxTicks);
    this.effectiveBuffer = new Float32Array(maxTicks);
    this.targetBuffer = new Float32Array(maxTicks);
    this.physicsRateHz = new Float32Array(maxTicks);
    this.leadTicks = new Int16Array(maxTicks);
    this.posErrorUu = new Float32Array(maxTicks);
    this.localPosErrorUu = new Float32Array(maxTicks);
    this.ballPosErrorUu = new Float32Array(maxTicks);
    this.remotePosErrorUu = new Float32Array(maxTicks);
    this.probePosErrorUu = new Float32Array(maxTicks);
    this.reconcileTier = new Uint8Array(maxTicks);
    this.tierState = new Int8Array(maxTicks);
    this.eventFlags = new Uint8Array(maxTicks);

    this.count = 0;
    this.sessionStartMs = -1;
    this.isOverflowFrozen = false;
    this.overflowNotified = false;
    this.onCapacityOverflow = null;

    this.starvationCount = 0;
    this.hardResyncCount = 0;
    this.tier3SnapCount = 0;
    this.catchupStepCount = 0;
    this.skipStepCount = 0;
    this.tierSwitchCount = 0;

    this.activeMode = 'csts';
    this.activePriority = 'balanced';
    this.activeParams = null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  reset(nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): void {
    this.count = 0;
    this.sessionStartMs = nowMs;
    this.isOverflowFrozen = false;
    this.overflowNotified = false;
    this.starvationCount = 0;
    this.hardResyncCount = 0;
    this.tier3SnapCount = 0;
    this.catchupStepCount = 0;
    this.skipStepCount = 0;
    this.tierSwitchCount = 0;
    this.notifyListeners();
  }

  setSessionMetadata(mode?: string, priority?: string, params?: Record<string, any> | null): void {
    if (mode) this.activeMode = mode;
    if (priority) this.activePriority = priority;
    if (params) this.activeParams = { ...params };
  }

  recordTick(sample: PacingTelemetryTickSample): boolean {
    if (this.isOverflowFrozen) {
      return false;
    }
    if (this.count >= this.maxTicks) {
      this.isOverflowFrozen = true;
      if (!this.overflowNotified) {
        this.overflowNotified = true;
        if (typeof this.onCapacityOverflow === 'function') {
          try {
            this.onCapacityOverflow(this);
          } catch (err) {
            console.warn('[PacingTelemetryRecorder] Error in onCapacityOverflow callback:', err);
          }
        }
        this.notifyListeners();
      }
      return false;
    }

    const nowMs = sample.nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.sessionStartMs < 0) {
      this.sessionStartMs = nowMs;
    }

    const idx = this.count++;
    this.timeMs[idx] = Math.max(0, nowMs - this.sessionStartMs);
    this.clientTick[idx] = (sample.clientTick ?? 0) | 0;
    this.serverTick[idx] = (sample.serverTick ?? 0) | 0;
    this.rawRttMs[idx] = sample.rawRttMs || 0;
    this.smoothRttMs[idx] = sample.smoothRttMs || sample.rawRttMs || 0;
    this.jitterMs[idx] = sample.jitterMs || 0;

    const clampedSrvBuf = Math.max(-64, Math.min(63, Math.round(sample.serverBuffer ?? 0)));
    this.serverBuffer[idx] = clampedSrvBuf;
    this.effectiveBuffer[idx] = sample.effectiveBuffer ?? clampedSrvBuf;
    this.targetBuffer[idx] = sample.targetBuffer ?? 3;
    this.physicsRateHz[idx] = sample.physicsRateHz ?? 120;
    this.leadTicks[idx] = sample.leadTicks ?? 3;
    this.posErrorUu[idx] = sample.posErrorUu ?? 0;
    this.localPosErrorUu[idx] = sample.localPosErrorUu ?? sample.posErrorUu ?? 0;
    this.ballPosErrorUu[idx] = sample.ballPosErrorUu ?? 0;
    this.remotePosErrorUu[idx] = sample.remotePosErrorUu ?? 0;
    this.probePosErrorUu[idx] = sample.probePosErrorUu ?? 0;
    this.reconcileTier[idx] = sample.reconcileTier ?? 1;
    this.tierState[idx] = sample.tierState ?? 0;

    let flags = 0;
    if (sample.packetArrived) flags |= TELEMETRY_EVENT_FLAGS.PACKET_ARRIVED;
    if (
      clampedSrvBuf <= 0 &&
      sample.packetArrived &&
      (sample.serverTick ?? 0) > 0 &&
      !sample.isKickoffMasked
    ) {
      flags |= TELEMETRY_EVENT_FLAGS.STARVATION;
      this.starvationCount++;
    }
    if (sample.hardResync) {
      flags |= TELEMETRY_EVENT_FLAGS.HARD_RESYNC;
      this.hardResyncCount++;
    }
    if (sample.stepCatchup) {
      flags |= TELEMETRY_EVENT_FLAGS.STEP_CATCHUP;
      this.catchupStepCount++;
    }
    if (sample.stepSkip) {
      flags |= TELEMETRY_EVENT_FLAGS.STEP_SKIP;
      this.skipStepCount++;
    }
    if (sample.tierSwitched) {
      flags |= TELEMETRY_EVENT_FLAGS.TIER_SWITCH;
      this.tierSwitchCount++;
    }
    if (sample.tier3Snap || sample.reconcileTier === 3) {
      flags |= TELEMETRY_EVENT_FLAGS.TIER3_SNAP;
      this.tier3SnapCount++;
    }
    if (sample.isKickoffMasked) {
      flags |= TELEMETRY_EVENT_FLAGS.KICKOFF_MASKED;
    }
    this.eventFlags[idx] = flags;
    if (this.count % 24 === 0) {
      this.notifyListeners();
    }
    return true;
  }

  getSummaryStats(): PacingTelemetrySummaryStats {
    return computeTelemetrySummaryFromBuffers(this);
  }

  getRecentWindow(windowSize = 360) {
    const n = this.count;
    const count = Math.min(n, Math.max(10, windowSize));
    const start = Math.max(0, n - count);
    return {
      count,
      start,
      totalCount: n,
      timeMs: this.timeMs.subarray(start, start + count),
      rawRttMs: this.rawRttMs.subarray(start, start + count),
      smoothRttMs: this.smoothRttMs.subarray(start, start + count),
      jitterMs: this.jitterMs.subarray(start, start + count),
      serverBuffer: this.serverBuffer.subarray(start, start + count),
      effectiveBuffer: this.effectiveBuffer.subarray(start, start + count),
      targetBuffer: this.targetBuffer.subarray(start, start + count),
      physicsRateHz: this.physicsRateHz.subarray(start, start + count),
      eventFlags: this.eventFlags.subarray(start, start + count),
    };
  }

  toMetadataObject(): PacingTelemetryMetadataObject {
    return {
      schemaVersion: 'rc-network-telemetry-v2',
      exportedAt: new Date().toISOString(),
      metadata: {
        clockPacingMode: this.activeMode,
        clockPacingPriority: this.activePriority,
        clockPacingParams: this.activeParams,
        maxCapacityTicks: this.maxTicks,
        recordedTicks: this.count,
      },
      summary: this.getSummaryStats(),
    };
  }

  toSerializableObject(): PacingTelemetrySerializableObject {
    return buildSerializableColumnsFromRecorder(this, this.toMetadataObject());
  }

  toCsvString(): string {
    return formatRecorderToCsvString(this);
  }
}

export const globalPacingTelemetryRecorder = new PacingTelemetryRecorder(MAX_TELEMETRY_TICKS);
