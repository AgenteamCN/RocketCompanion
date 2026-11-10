import React, { useRef, useState, useEffect, useMemo } from 'react';
import { TelemetrySparklineChart, TelemetryPhaseItem } from '../../charts/TelemetrySparklineChart';
import { TelemetryRingBuffer } from '../../charts/telemetryRingBuffer';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useStoreSnapshotOverride } from '../../stores/storeSnapshotScope';
import { quickNotification } from '../../stores/quickNotificationStore';
import { useTelemetryData } from '../../stores/perfTelemetryStore';
import {
  PerformanceTelemetryBreakdownSection,
  type LiveSystemTelemetrySnapshot,
} from './performance-monitor/PerformanceTelemetryBreakdownSection';

export type { LiveSystemTelemetrySnapshot };

export const SURFACE_META: SurfaceMeta = {
  id: 'performance-monitor',
  title: 'Performance Monitor',
  description:
    'Real-time CPU 6-phase breakdown, physics simulation sub-ticks, and WebGL rendering pipeline metrics.',
  icon: 'cpu',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 441,
    height: 801,
    minWidth: 441,
    minHeight: 130,
    mode: 'adaptive',
  },
};

const INITIAL_FRAME_SAMPLES: number[] = [
  3.18, 3.24, 3.31, 3.22, 3.45, 3.28, 3.19, 3.35, 3.41, 3.26, 3.3, 3.21,
  3.38, 3.52, 3.29, 3.25, 3.33, 3.4, 3.27, 3.18, 3.36, 4.12, 3.48, 3.31,
  3.22, 3.29, 3.34, 3.26, 3.19, 3.32, 3.44, 3.28, 3.23, 3.37, 3.3, 3.25,
  3.41, 3.33, 3.27, 3.21, 3.35, 3.49, 3.31, 3.24, 3.28, 3.39, 3.26, 3.32,
];

const DEFAULT_CPU_PHASES: TelemetryPhaseItem[] = [
  { phase: 'Physics & Collision (Sim)', avgMs: 1.12, share: 0.34, color: '#f59e0b' },
  { phase: 'Scene Graph & Matrices', avgMs: 0.74, share: 0.22, color: '#0ea5e9' },
  { phase: 'Post-FX & Bloom Pass', avgMs: 0.45, share: 0.14, color: '#d946ef' },
  { phase: 'Render Queue Prep', avgMs: 0.42, share: 0.13, color: '#10b981' },
  { phase: 'Camera & Tracking', avgMs: 0.31, share: 0.09, color: '#6366f1' },
  { phase: 'Final Composite & HUD', avgMs: 0.26, share: 0.08, color: '#f43f5e' },
];

export interface PerformanceMonitorFloatingWindowProps extends StandardSurfaceProps {}

/**
 * 5. [User] Performance Monitor (`performance-monitor`)
 * Standalone L6 Floating Window Panel composing the L5 `<TelemetrySparklineChart />`:
 * 1. Top row: 5 quantile/metric cards (`P50`, `P95`, `P99`, `Peak`, `Budget`)
 * 2. Embedded `<TelemetrySparklineChart variant="embedded" />`: `Freeze`, `Reset`, and current window `Average`
 * 3. CPU Breakdown card: Header (`Cpu` icon + `CPU Breakdown` on left, `Total` on right) + vertical multi-color percentage bars
 * 4. Bottom cards: WASM Physics & WebGL2 Pipeline (preserved)
 */
export const PerformanceMonitorFloatingWindow: React.FC<
  PerformanceMonitorFloatingWindowProps
> = React.memo(({ isLight = false }) => {
  const { data: snap } = useTelemetryData(180, true);
  const scopedTelemetryOverride = useStoreSnapshotOverride<LiveSystemTelemetrySnapshot>(
    'perfTelemetryStore'
  );

  const snapshot = useMemo((): LiveSystemTelemetrySnapshot | undefined => {
    if (scopedTelemetryOverride) {
      return scopedTelemetryOverride;
    }
    if (!snap) return undefined;
    const palette = ['#f59e0b', '#0ea5e9', '#d946ef', '#10b981', '#6366f1', '#f43f5e'];
    const liveCpuPhases: TelemetryPhaseItem[] | undefined =
      Array.isArray(snap.phases) && snap.phases.length > 0
        ? snap.phases.map((item, idx) => ({
            phase: item.phase,
            avgMs: Math.max(0, Number(item.avgMs) || 0),
            share: Math.max(0, Number(item.share) || 0),
            color: palette[idx % palette.length],
          }))
        : undefined;
    return {
      frameTimeMs: snap.frameMs || 8.33,
      budgetMs: snap.budgetMs || 8.33,
      refreshHz: snap.refreshHz || 120,
      p50Ms: snap.p50 || 8.3,
      p95Ms: snap.p95 || 8.5,
      p99Ms: snap.p99 || 9.0,
      peakMs: snap.worstMs || 9.5,
      overBudgetPct: snap.overBudgetPct || 0,
      cpuPhases: liveCpuPhases,
      physicsStepHz: snap.sim?.physicsRateHz || 120,
      substepsPerTick: snap.sim?.ticksPerFrame || 1,
      drawCalls: snap.renderer?.drawCalls || 0,
      trianglesLabel: String(snap.renderer?.triangles ?? '0'),
      geometries: snap.renderer?.geometries || 0,
      shaderPrograms: snap.renderer?.textures || 29,
    };
  }, [snap, scopedTelemetryOverride]);

  const budgetMs = snapshot?.budgetMs ?? 8.33;
  const refreshHz = snapshot?.refreshHz ?? 120;

  const ringBufferRef = useRef<TelemetryRingBuffer | null>(null);
  if (!ringBufferRef.current) {
    ringBufferRef.current = new TelemetryRingBuffer(240, INITIAL_FRAME_SAMPLES);
  }
  const ringBuffer = ringBufferRef.current;

  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [frozenSnapshot, setFrozenSnapshot] = useState<Float32Array | null>(null);
  const [, setVersionTick] = useState<number>(0);

  const hasExternalFeed = snapshot !== undefined;

  useEffect(() => {
    if (!snapshot || snapshot.frameTimeMs === undefined || isFrozen) return;
    ringBuffer.push(Number(snapshot.frameTimeMs));
    setVersionTick((v) => (v + 1) % 10000);
  }, [snapshot, isFrozen, ringBuffer]);

  useEffect(() => {
    if (isFrozen || hasExternalFeed) return;
    let phase = 0;
    const id = window.setInterval(() => {
      phase += 0.18;
      const sample = 3.25 + Math.sin(phase) * 0.22 + (Math.random() - 0.5) * 0.18;
      ringBuffer.push(Number(sample.toFixed(2)));
      setVersionTick((v) => (v + 1) % 10000);
    }, 120);
    return () => window.clearInterval(id);
  }, [isFrozen, hasExternalFeed, ringBuffer]);

  const stats = ringBuffer.computeStats(budgetMs, refreshHz, isFrozen ? frozenSnapshot : null);
  const displayP50 = snapshot?.p50Ms ?? stats.p50;
  const displayP95 = snapshot?.p95Ms ?? stats.p95;
  const displayP99 = snapshot?.p99Ms ?? stats.p99;
  const displayPeak = snapshot?.peakMs ?? stats.worstMs;
  const displayOverBudgetPct = snapshot?.overBudgetPct ?? stats.overBudgetPct;
  const isOverBudget =
    snapshot?.overBudgetPct !== undefined
      ? snapshot.overBudgetPct > 0
      : stats.overBudgetCount > 0;

  const handleFreezeChange = (nextFrozen: boolean) => {
    if (nextFrozen) {
      setFrozenSnapshot(ringBuffer.snapshot());
    } else {
      setFrozenSnapshot(null);
    }
    setIsFrozen(nextFrozen);
  };

  const handleReset = () => {
    ringBuffer.clear();
    if (!hasExternalFeed) {
      ringBuffer.pushBatch(INITIAL_FRAME_SAMPLES);
    }
    if (isFrozen) {
      setFrozenSnapshot(ringBuffer.snapshot());
    }
    setVersionTick((v) => v + 1);
    quickNotification.info('Reset frame-time telemetry window.');
  };

  const cpuPhases = snapshot?.cpuPhases ?? DEFAULT_CPU_PHASES;
  const metricTileBg = isLight
    ? 'bg-neutral-50 border-neutral-200'
    : 'bg-neutral-900/70 border-neutral-800';

  return (
    <div className="p-3.5 flex flex-col gap-3 text-xs select-none">
      {/* 1. Top 5 Data Metrics: P50, P95, P99, Peak, Budget */}
      <div className="grid grid-cols-5 gap-1.5 text-center font-mono">
        <div className={`p-2 rounded-xl border ${metricTileBg}`}>
          <span className="text-[9px] text-neutral-400 uppercase block">P50</span>
          <span className="text-[11px] font-bold tabular-nums">{displayP50.toFixed(2)}ms</span>
        </div>

        <div className={`p-2 rounded-xl border ${metricTileBg}`}>
          <span className="text-[9px] text-neutral-400 uppercase block">P95</span>
          <span className="text-[11px] font-bold tabular-nums">{displayP95.toFixed(2)}ms</span>
        </div>

        <div className={`p-2 rounded-xl border ${metricTileBg}`}>
          <span className="text-[9px] text-neutral-400 uppercase block">P99</span>
          <span className="text-[11px] font-bold text-amber-500 tabular-nums">
            {displayP99.toFixed(2)}ms
          </span>
        </div>

        <div className={`p-2 rounded-xl border ${metricTileBg}`}>
          <span className="text-[9px] text-neutral-400 uppercase block">Peak</span>
          <span
            className={`text-[11px] font-bold tabular-nums ${
              displayPeak > budgetMs * 1.2 ? 'text-rose-500' : ''
            }`}
          >
            {displayPeak.toFixed(2)}ms
          </span>
        </div>

        <div
          className={`p-2 rounded-xl border ${
            isOverBudget
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
          }`}
        >
          <span className="text-[9px] opacity-80 uppercase block">Budget</span>
          <span className="text-[11px] font-bold tabular-nums">
            {isOverBudget ? `${displayOverBudgetPct}% Over` : `${budgetMs}ms`}
          </span>
        </div>
      </div>

      {/* 2. L5 TelemetrySparklineChart (Embedded Frame-Time Sparkline Canvas + Freeze / Reset / Average Bar) */}
      <TelemetrySparklineChart
        variant="embedded"
        ringBuffer={ringBuffer}
        budgetMs={budgetMs}
        refreshHz={refreshHz}
        height={124}
        isFrozen={isFrozen}
        onFreezeToggle={handleFreezeChange}
        onReset={handleReset}
        isLight={isLight}
      />

      {/* 3 & 4. CPU Breakdown & WASM/WebGL Pipeline Cards */}
      <PerformanceTelemetryBreakdownSection
        isLight={isLight}
        cpuPhases={cpuPhases}
        snapshot={snapshot}
        displayP50={displayP50}
        displayP95={displayP95}
        displayP99={displayP99}
        displayPeak={displayPeak}
        displayOverBudgetPct={displayOverBudgetPct}
        budgetMs={budgetMs}
        refreshHz={refreshHz}
      />
    </div>
  );
});
PerformanceMonitorFloatingWindow.displayName = 'PerformanceMonitorFloatingWindow';
export default PerformanceMonitorFloatingWindow;
