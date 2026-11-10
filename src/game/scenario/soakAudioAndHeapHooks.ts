/**
 * soakAudioAndHeapHooks.ts
 * Zero-overhead runtime instrumentation hooks for Web Audio AudioParamTimeline
 * automation event accumulation, 120Hz transient object/vector allocations,
 * V8 JS Heap tracking, and 600-tick real-time NDJSON stream emission (Perf01).
 */

import * as THREE from 'three';
import { getAudioContext } from '../../audio/audioContext.ts';
import { globalHudTransientChannel } from '../runtimeUiPort.ts';
import { PIPELINE_STAGE_NAMES, roundMetric } from './scenarioMetricsPipeline.ts';
import type { PipelineStageName, ScenarioRuntimePort } from './ScenarioTypes.ts';
import {
  buildSoakAutopsyReport,
  buildSoakWindowSample,
  DEFAULT_SOAK_CIRCUIT_BREAKER_CONFIG,
  evaluateSoakCircuitBreaker,
  type CallerAggregateStats,
  type SoakAbortReason,
  type SoakAutopsyReport,
  type SoakCircuitBreakerConfig,
  type SoakWatchdogReportPayload,
  type SoakWindowTelemetrySample,
} from './soakWatchdogAutopsyPipeline.ts';

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface AudioParamTrackerRecord {
  caller: string;
  uncleanedEvents: number;
  totalScheduledEvents: number;
  cancelCount: number;
  directValueWrites: number;
}

const KNOWN_AUDIO_MODULES: readonly string[] = [
  'TurtleModemGranularVoiceGraph',
  'EngineAudioEqualizer',
  'TurtleModemEngineSynth',
  'SpatialAudioSource',
  'VehicleAudioEmitter',
  'BallAudioEmitter',
  'AudioSlotPool',
  'SpatialAudioBusChain',
  'MasterAcousticProcessor',
  'AudioMixer',
  'FlipResetVisual',
  'StadiumSpatialAudioEngine',
];

function resolveAudioCallerFromStack(stack: string | undefined): string {
  if (!stack) return 'UnknownAudioCaller';
  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('soakAudioAndHeapHooks')) continue;
    for (let k = 0; k < KNOWN_AUDIO_MODULES.length; k++) {
      if (line.includes(KNOWN_AUDIO_MODULES[k])) return KNOWN_AUDIO_MODULES[k];
    }
    const match = /\/src\/(?:audio|effects|game)\/(?:[^/]+\/)*([A-Za-z0-9_]+)\.ts/.exec(line);
    if (match?.[1]) return match[1];
  }
  return 'UnknownAudioCaller';
}

function readJsHeapMb(): { usedMb: number; totalMb: number } {
  const mem =
    typeof performance !== 'undefined' ? (performance as PerformanceWithMemory).memory : undefined;
  if (!mem || typeof mem.usedJSHeapSize !== 'number') return { usedMb: 0, totalMb: 0 };
  return {
    usedMb: roundMetric(mem.usedJSHeapSize / (1024 * 1024), 2),
    totalMb: roundMetric(mem.totalJSHeapSize / (1024 * 1024), 2),
  };
}

export class SoakAudioAndHeapHooksController {
  public readonly config: SoakCircuitBreakerConfig;
  private readonly runtime: ScenarioRuntimePort;
  private readonly realNow: () => number;
  private readonly paramRecords = new WeakMap<AudioParam, AudioParamTrackerRecord>();
  private readonly callerStats = new Map<string, CallerAggregateStats>();
  private readonly allocationCounts = new Map<string, number>();
  private readonly windows: SoakWindowTelemetrySample[] = [];
  private readonly windowStageSums: Record<PipelineStageName | 'TotalFrame', number> = {
    InputStage: 0,
    SimulationStage: 0,
    GameplayModeStage: 0,
    PresentationStage: 0,
    AudioStage: 0,
    RenderStage: 0,
    TelemetryStage: 0,
    TotalFrame: 0,
  };
  private windowTickCount = 0;
  private windowStartWallMs = 0;
  private soakStartWallMs = 0;
  private totalUncleanedAudioEvents = 0;
  private totalScheduledAudioEvents = 0;
  private totalDirectAudioValueWrites = 0;
  private abortReason: SoakAbortReason = 'NONE';
  private autopsyReport: SoakAutopsyReport | null = null;
  private restoreHooksFn: (() => void) | null = null;
  private baseAudioTimeSec = 0.05;
  private virtualAudioTimeSec = 0.05;

  private prevHudFlipRef: unknown = null;
  private prevHudDemoRef: unknown = null;
  private prevHudRosterRef: unknown = null;
  private prevAnomalyTailRef: unknown = null;
  private prevReplayCtrlFrameId = -1;

  constructor(
    runtime: ScenarioRuntimePort,
    realNow: () => number,
    configOverride?: Partial<SoakCircuitBreakerConfig>
  ) {
    this.runtime = runtime;
    this.realNow = realNow;
    this.config = { ...DEFAULT_SOAK_CIRCUIT_BREAKER_CONFIG, ...configOverride };
  }

  public install(): void {
    if (this.restoreHooksFn) return;
    const nowMs = this.realNow();
    this.soakStartWallMs = nowMs;
    this.windowStartWallMs = nowMs;
    const cleanups: Array<() => void> = [];

    const audioCtx = getAudioContext();
    if (audioCtx) {
      this.baseAudioTimeSec = Math.max(0.05, audioCtx.currentTime + 0.02);
      this.virtualAudioTimeSec = this.baseAudioTimeSec;
      const origDesc = Object.getOwnPropertyDescriptor(audioCtx, 'currentTime');
      try {
        Object.defineProperty(audioCtx, 'currentTime', {
          get: () => this.virtualAudioTimeSec,
          configurable: true,
        });
        cleanups.push(() => {
          if (origDesc) Object.defineProperty(audioCtx, 'currentTime', origDesc);
          else delete (audioCtx as unknown as Record<string, unknown>).currentTime;
        });
      } catch {
        // Ignore if environment prevents currentTime override
      }
    }

    if (typeof AudioParam !== 'undefined' && AudioParam.prototype) {
      const proto = AudioParam.prototype;
      const origSetTarget = proto.setTargetAtTime;
      const origSetValue = proto.setValueAtTime;
      const origLinearRamp = proto.linearRampToValueAtTime;
      const origExpRamp = proto.exponentialRampToValueAtTime;
      const origValueCurve = proto.setValueCurveAtTime;
      const origCancel = proto.cancelScheduledValues;
      const origCancelHold = proto.cancelAndHoldAtTime;
      const origValueDesc = Object.getOwnPropertyDescriptor(proto, 'value');

      const onSchedule = (param: AudioParam) => {
        const rec = this.getOrCreateParamRecord(param);
        rec.uncleanedEvents++;
        rec.totalScheduledEvents++;
        this.totalUncleanedAudioEvents++;
        this.totalScheduledAudioEvents++;
        const st = this.callerStats.get(rec.caller);
        if (st) {
          st.uncleanedEvents++;
          st.totalScheduledEvents++;
        }
      };

      const onCancel = (param: AudioParam) => {
        const rec = this.getOrCreateParamRecord(param);
        const cleared = rec.uncleanedEvents;
        rec.uncleanedEvents = 0;
        rec.cancelCount++;
        this.totalUncleanedAudioEvents = Math.max(0, this.totalUncleanedAudioEvents - cleared);
        const st = this.callerStats.get(rec.caller);
        if (st) {
          st.uncleanedEvents = Math.max(0, st.uncleanedEvents - cleared);
          st.cancelCount++;
        }
      };

      proto.setTargetAtTime = function (target: number, startTime: number, timeConstant: number) {
        onSchedule(this);
        return origSetTarget.call(this, target, startTime, timeConstant);
      };
      proto.setValueAtTime = function (value: number, startTime: number) {
        onSchedule(this);
        return origSetValue.call(this, value, startTime);
      };
      proto.linearRampToValueAtTime = function (value: number, endTime: number) {
        onSchedule(this);
        return origLinearRamp.call(this, value, endTime);
      };
      proto.exponentialRampToValueAtTime = function (value: number, endTime: number) {
        onSchedule(this);
        return origExpRamp.call(this, value, endTime);
      };
      if (typeof origValueCurve === 'function') {
        proto.setValueCurveAtTime = function (
          values: Iterable<number>,
          startTime: number,
          duration: number
        ) {
          onSchedule(this);
          return origValueCurve.call(this, values, startTime, duration);
        };
      }
      proto.cancelScheduledValues = function (cancelTime: number) {
        onCancel(this);
        return origCancel.call(this, cancelTime);
      };
      if (typeof origCancelHold === 'function') {
        proto.cancelAndHoldAtTime = function (cancelTime: number) {
          onCancel(this);
          return origCancelHold.call(this, cancelTime);
        };
      }
      if (origValueDesc?.set && origValueDesc?.get) {
        const origGet = origValueDesc.get;
        const origSet = origValueDesc.set;
        const self = this;
        try {
          Object.defineProperty(proto, 'value', {
            configurable: true,
            enumerable: origValueDesc.enumerable,
            get() {
              return origGet.call(this);
            },
            set(val: number) {
              const rec = self.getOrCreateParamRecord(this as AudioParam);
              rec.directValueWrites++;
              self.totalDirectAudioValueWrites++;
              const st = self.callerStats.get(rec.caller);
              if (st) st.directValueWrites++;
              origSet.call(this, val);
            },
          });
        } catch {
          // Ignore
        }
      }

      cleanups.push(() => {
        proto.setTargetAtTime = origSetTarget;
        proto.setValueAtTime = origSetValue;
        proto.linearRampToValueAtTime = origLinearRamp;
        proto.exponentialRampToValueAtTime = origExpRamp;
        if (typeof origValueCurve === 'function') proto.setValueCurveAtTime = origValueCurve;
        proto.cancelScheduledValues = origCancel;
        if (typeof origCancelHold === 'function') proto.cancelAndHoldAtTime = origCancelHold;
        if (origValueDesc) {
          try {
            Object.defineProperty(proto, 'value', origValueDesc);
          } catch {
            // Ignore
          }
        }
      });
    }

    const origVec3Clone = THREE.Vector3.prototype.clone;
    const self = this;
    THREE.Vector3.prototype.clone = function () {
      self.incrementAllocation('THREE.Vector3.clone', 1);
      return origVec3Clone.call(this);
    };
    cleanups.push(() => {
      THREE.Vector3.prototype.clone = origVec3Clone;
    });

    const ch = globalHudTransientChannel as {
      setFlip?: (patch: unknown) => void;
      setRespawnTimer?: (patch: unknown) => void;
      setRoster?: (patch: unknown) => void;
    };
    if (typeof ch.setFlip === 'function') {
      const origSetFlip = ch.setFlip.bind(ch);
      ch.setFlip = (patch: unknown) => {
        if (patch && patch !== this.prevHudFlipRef) {
          if (this.prevHudFlipRef !== null) this.incrementAllocation('hudStore.setHasFlip', 1);
          this.prevHudFlipRef = patch;
        }
        origSetFlip(patch);
      };
      cleanups.push(() => {
        ch.setFlip = origSetFlip;
      });
    }
    if (typeof ch.setRespawnTimer === 'function') {
      const origSetRespawn = ch.setRespawnTimer.bind(ch);
      ch.setRespawnTimer = (patch: unknown) => {
        if (patch && patch !== this.prevHudDemoRef) {
          if (this.prevHudDemoRef !== null) {
            this.incrementAllocation('hudStore.setDemoRespawnState', 1);
          }
          this.prevHudDemoRef = patch;
        }
        origSetRespawn(patch);
      };
      cleanups.push(() => {
        ch.setRespawnTimer = origSetRespawn;
      });
    }
    if (typeof ch.setRoster === 'function') {
      const origSetRoster = ch.setRoster.bind(ch);
      ch.setRoster = (patch: unknown) => {
        if (patch && patch !== this.prevHudRosterRef) {
          if (this.prevHudRosterRef !== null) {
            this.incrementAllocation('TelemetryStage._syncEdgeRosterHud', 3);
          }
          this.prevHudRosterRef = patch;
        }
        origSetRoster(patch);
      };
      cleanups.push(() => {
        ch.setRoster = origSetRoster;
      });
    }

    this.restoreHooksFn = () => {
      for (const fn of cleanups) fn();
    };
  }

  public dispose(): void {
    if (this.restoreHooksFn) {
      this.restoreHooksFn();
      this.restoreHooksFn = null;
    }
  }

  private getOrCreateParamRecord(param: AudioParam): AudioParamTrackerRecord {
    let rec = this.paramRecords.get(param);
    if (!rec) {
      const caller = resolveAudioCallerFromStack(new Error().stack);
      rec = {
        caller,
        uncleanedEvents: 0,
        totalScheduledEvents: 0,
        cancelCount: 0,
        directValueWrites: 0,
      };
      this.paramRecords.set(param, rec);
      let st = this.callerStats.get(caller);
      if (!st) {
        st = {
          uncleanedEvents: 0,
          totalScheduledEvents: 0,
          cancelCount: 0,
          directValueWrites: 0,
          activeParamInstances: 0,
        };
        this.callerStats.set(caller, st);
      }
      st.activeParamInstances++;
    }
    return rec;
  }

  private incrementAllocation(source: string, count: number): void {
    this.allocationCounts.set(source, (this.allocationCounts.get(source) ?? 0) + count);
  }

  public onBeforeTick(tick: number): void {
    this.virtualAudioTimeSec = this.baseAudioTimeSec + tick * (1 / 120);
  }

  public recordTick(
    tick: number,
    stageDurationsMs: Record<PipelineStageName, number>,
    totalFrameWallMs: number
  ): boolean {
    for (let i = 0; i < PIPELINE_STAGE_NAMES.length; i++) {
      const st = PIPELINE_STAGE_NAMES[i];
      this.windowStageSums[st] += stageDurationsMs[st] ?? 0;
    }
    this.windowStageSums.TotalFrame += totalFrameWallMs;
    this.windowTickCount++;
    this.probePerTickTransientAllocations();

    if ((tick + 1) % this.config.windowTicks === 0) {
      return this.emitWindowAndCheckCircuitBreaker(tick + 1);
    }
    return false;
  }

  private probePerTickTransientAllocations(): void {
    const hist = this.runtime.ballTrajectoryPredictor?.anomalyRecorder?.tickHistory;
    if (Array.isArray(hist) && hist.length > 0) {
      const tail = hist[hist.length - 1];
      if (tail && tail !== this.prevAnomalyTailRef) {
        if (this.prevAnomalyTailRef !== null) {
          this.incrementAllocation('BallTrajectoryAnomalyDetector.recordTick', 7);
        }
        this.prevAnomalyTailRef = tail;
      }
    }

    const rb = this.runtime.modeManager?.getActiveMode?.()?.replayRingBuffer as
      | {
          _head?: number;
          _size?: number;
          capacityTicks?: number;
          _slots?: Array<{ tick?: number; acknowledgedControls?: unknown } | undefined>;
        }
      | null
      | undefined;
    if (rb && typeof rb._size === 'number' && rb._size > 0 && Array.isArray(rb._slots)) {
      const cap = rb.capacityTicks || rb._slots.length || 1;
      const lastIdx = ((rb._head ?? 1) - 1 + cap) % cap;
      const slot = rb._slots[lastIdx];
      const fid = slot?.tick ?? -1;
      if (fid !== -1 && fid !== this.prevReplayCtrlFrameId) {
        if (this.prevReplayCtrlFrameId !== -1 && Array.isArray(slot?.acknowledgedControls)) {
          this.incrementAllocation('FreeplayGoalAndTouchSubController.recordFrame', 2);
        }
        this.prevReplayCtrlFrameId = fid;
      }
    }
  }

  private emitWindowAndCheckCircuitBreaker(completedTicks: number): boolean {
    const nowWallMs = this.realNow();
    const windowWallMs = Math.max(0.01, nowWallMs - this.windowStartWallMs);
    const totalWallSeconds = roundMetric((nowWallMs - this.soakStartWallMs) / 1000, 2);
    const heap = readJsHeapMb();

    const sample = buildSoakWindowSample({
      completedTicks,
      windowTickCount: this.windowTickCount,
      windowWallMs,
      totalWallSeconds,
      windowStageSums: this.windowStageSums,
      priorWindows: this.windows,
      heapUsedMb: heap.usedMb,
      heapTotalMb: heap.totalMb,
      callerStats: this.callerStats,
      allocationCounts: this.allocationCounts,
      totalUncleanedAudioEvents: this.totalUncleanedAudioEvents,
      totalScheduledAudioEvents: this.totalScheduledAudioEvents,
      totalDirectAudioValueWrites: this.totalDirectAudioValueWrites,
    });

    for (const st of [...PIPELINE_STAGE_NAMES, 'TotalFrame' as const]) {
      this.windowStageSums[st] = 0;
    }
    this.windowTickCount = 0;
    this.windowStartWallMs = nowWallMs;
    this.windows.push(sample);

    console.info(`[SoakStream] ${sample.formattedLine}`);
    this.postStreamEvent({ type: 'window', sample });

    const abortReason = evaluateSoakCircuitBreaker(this.windows, this.config);
    if (abortReason !== 'NONE') {
      this.abortReason = abortReason;
      this.autopsyReport = buildSoakAutopsyReport(this.windows, abortReason, this.config);
      for (const line of this.autopsyReport.formattedAutopsyLines) {
        console.info(`[SoakAutopsy] ${line}`);
      }
      this.postStreamEvent({ type: 'autopsy', autopsy: this.autopsyReport });
      return true;
    }
    return false;
  }

  private postStreamEvent(payload: unknown): void {
    if (typeof fetch !== 'function') return;
    try {
      void fetch('/__rc_soak_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: `${JSON.stringify(payload)}\n`,
      }).catch(() => {});
    } catch {
      // Ignore network stream errors
    }
  }

  public finalizeReport(): SoakWatchdogReportPayload {
    if (!this.autopsyReport) {
      this.autopsyReport = buildSoakAutopsyReport(this.windows, this.abortReason, this.config);
    }
    return { config: this.config, windows: this.windows, autopsy: this.autopsyReport };
  }
}
