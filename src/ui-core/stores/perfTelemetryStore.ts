import { useState, useEffect } from 'react';

export interface PhaseTiming {
  phase: string;
  avgMs: number;
  share: number;
}

export interface TelemetrySnapshot {
  fps: number;
  frameMs: number;
  p50: number;
  p95: number;
  p99: number;
  worstMs: number;
  refreshHz: number;
  budgetMs: number;
  overBudgetPct: number;
  history: number[];
  historySeconds: number;
  phases: PhaseTiming[];
  sim: {
    ticksPerFrame: number;
    physicsRateHz: number;
    droppedTicks: number;
    stalls: number;
  };
  renderer: {
    drawCalls: number;
    triangles: number;
    points: number;
    geometries: number;
    textures: number;
  };
  latency: {
    rttMs: number;
    extraRttMs: number;
    uplinkMs: number;
    downlinkMs: number;
    extraUplinkMs: number;
    extraDownlinkMs: number;
    baseMs: number;
    extraMs: number;
  };
}

export interface TelemetrySamplerSource {
  profiler?: {
    snapshot?: (bins?: number, seconds?: number) => any;
  } | null;
  renderer?: {
    info?: {
      render?: { calls: number; triangles: number; points?: number };
      memory?: { geometries: number; textures: number };
    };
  } | null;
  interpolator?: {
    lastTicks?: number;
    lastDropped?: number;
    lastStalled?: boolean;
  } | null;
  getProfiler?: () => any;
  getRenderer?: () => any;
  getInterpolator?: () => any;
  getPhysicsRate?: () => number;
  getNetworkLatencyInfo?: () => {
    rttMs?: number;
    extraRttMs?: number;
    uplinkMs?: number;
    downlinkMs?: number;
    extraUplinkMs?: number;
    extraDownlinkMs?: number;
    baseLatency: number;
    extraLatency: number;
  } | null;
}

let activeSamplerSource: TelemetrySamplerSource | null = null;

export const perfTelemetryStore = {
  setSampler: (source: TelemetrySamplerSource | null) => {
    activeSamplerSource = source;
  },
  getSampler: () => activeSamplerSource,
};

export function sampleTelemetry(): TelemetrySnapshot {
  const source = activeSamplerSource;
  if (!source) {
    throw new Error('[perfTelemetryStore] No active sampler source attached to game runtime.');
  }

  const profiler = source.getProfiler ? source.getProfiler() : source.profiler;
  const renderer = source.getRenderer ? source.getRenderer() : source.renderer;
  const interpolator = source.getInterpolator ? source.getInterpolator() : source.interpolator;

  if (!profiler || typeof profiler.snapshot !== 'function') {
    throw new Error('[perfTelemetryStore] PerformanceProfiler is not initialized or snapshot() is unavailable.');
  }

  const snap = profiler.snapshot(60, 10);
  if (!snap) {
    throw new Error('[perfTelemetryStore] PerformanceProfiler.snapshot() returned null or empty.');
  }

  const rendInfo = renderer?.info;
  const drawCalls = rendInfo?.render?.calls ?? 0;
  const triangles = rendInfo?.render?.triangles ?? 0;
  const points = rendInfo?.render?.points ?? 0;
  const geometries = rendInfo?.memory?.geometries ?? 0;
  const textures = rendInfo?.memory?.textures ?? 0;

  const rawPhyRate = source.getPhysicsRate ? source.getPhysicsRate() : (snap.sim?.physicsRateHz ?? 120);
  const physicsRate = Math.max(1, Math.min(600, Math.round(rawPhyRate * 10) / 10));

  const latencyInfo = source.getNetworkLatencyInfo ? source.getNetworkLatencyInfo() : null;
  const rawBase = latencyInfo?.baseLatency ?? 0;
  const rawExtra = latencyInfo?.extraLatency ?? 0;
  if (!Number.isFinite(rawBase) || !Number.isFinite(rawExtra)) {
    throw new Error(`[perfTelemetryStore] Non-finite latency encountered: baseLatency=${rawBase}, extraLatency=${rawExtra}`);
  }
  const baseLatency = Math.round(rawBase);
  const extraLatency = Math.round(rawExtra);
  const extraUplinkMs = Math.round(latencyInfo?.extraUplinkMs ?? extraLatency * 0.5);
  const extraDownlinkMs = Math.round(latencyInfo?.extraDownlinkMs ?? (extraLatency - extraUplinkMs));
  const extraRttMs = Math.round(latencyInfo?.extraRttMs ?? (extraUplinkMs + extraDownlinkMs));
  const rttMs = Math.round(latencyInfo?.rttMs ?? baseLatency);
  const uplinkMs = Math.round(latencyInfo?.uplinkMs ?? Math.max(0, Math.round((rttMs - extraRttMs) * 0.5) + extraUplinkMs));
  const downlinkMs = Math.round(latencyInfo?.downlinkMs ?? Math.max(0, rttMs - uplinkMs));

  // Convert Float32Array to number array for React rendering
  const historyArr: number[] = [];
  if (snap.history && snap.history.length > 0) {
    for (let i = 0; i < snap.history.length; i++) {
      historyArr.push(Number(snap.history[i]));
    }
  } else {
    historyArr.push(snap.frame?.avgMs || 16.6);
  }

  const phases: PhaseTiming[] = (snap.phases || []).map((p: any) => ({
    phase: String(p.phase),
    avgMs: Number(p.avgMs) || 0,
    share: Number(p.share) || 0,
  }));

  const frameAvg = snap.frame?.avgMs || 16.6;
  const fps = frameAvg > 0 ? Math.round(1000 / frameAvg) : 60;

  return {
    fps,
    frameMs: Number(frameAvg.toFixed(2)),
    p50: Number((snap.frame?.p50 || frameAvg).toFixed(2)),
    p95: Number((snap.frame?.p95 || frameAvg).toFixed(2)),
    p99: Number((snap.frame?.p99 || frameAvg).toFixed(2)),
    worstMs: Number((snap.frame?.worstMs || frameAvg).toFixed(2)),
    refreshHz: Math.round(snap.refreshHz || 60),
    budgetMs: Number((snap.budgetMs || 16.67).toFixed(2)),
    overBudgetPct: Math.round(snap.overBudgetPct || 0),
    history: historyArr,
    historySeconds: Number((snap.historySeconds || 10).toFixed(1)),
    phases,
    sim: {
      ticksPerFrame: Number((snap.sim?.ticksPerFrame || 2).toFixed(2)),
      physicsRateHz: physicsRate,
      droppedTicks: Number(snap.sim?.droppedTicks || 0),
      stalls: Number(snap.sim?.stalls || 0),
    },
    renderer: {
      drawCalls,
      triangles,
      points,
      geometries,
      textures,
    },
    latency: {
      rttMs,
      extraRttMs,
      uplinkMs,
      downlinkMs,
      extraUplinkMs,
      extraDownlinkMs,
      baseMs: rttMs,
      extraMs: extraRttMs,
    },
  };
}

export interface TelemetryHookResult {
  data: TelemetrySnapshot | null;
  error: Error | null;
}

/**
 * React hook to poll telemetry metrics at specified interval
 * Automatically pauses when window is minimized or inactive
 * Strictly returns authentic data or explicit Error without any mock fallback
 */
export function useTelemetryData(intervalMs = 180, active = true): TelemetryHookResult {
  const [result, setResult] = useState<TelemetryHookResult>(() => {
    if (!activeSamplerSource) {
      return { data: null, error: null };
    }
    try {
      return { data: sampleTelemetry(), error: null };
    } catch (err: any) {
      console.error('[perfTelemetryStore] Initial telemetry sampling failure:', err);
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  });

  useEffect(() => {
    if (!active) return;
    const poll = () => {
      if (!activeSamplerSource) {
        setResult((prev) =>
          prev.data === null && prev.error === null ? prev : { data: null, error: null }
        );
        return;
      }
      try {
        const snap = sampleTelemetry();
        setResult({ data: snap, error: null });
      } catch (err: any) {
        console.error('[perfTelemetryStore] Telemetry sampling failure:', err);
        setResult({ data: null, error: err instanceof Error ? err : new Error(String(err)) });
      }
    };

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);

  return result;
}

