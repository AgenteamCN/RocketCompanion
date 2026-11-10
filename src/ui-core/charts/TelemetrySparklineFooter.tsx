import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Cpu } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import type { TelemetryComputedStats } from './telemetryRingBuffer';

export const ALPHA_COMPONENT_ID = 'Alpha:TelemetrySparklineFooter' as const;

export interface TelemetryPhaseItem {
  phase: string;
  avgMs: number;
  share: number;
  color?: string;
}

export interface TelemetrySparklineFooterHandle {
  syncStats: (stats: TelemetryComputedStats) => void;
}

const PHASE_COLORS: Record<string, string> = {
  sim: '#f59e0b',
  scene: '#0ea5e9',
  camera: '#6366f1',
  prep: '#10b981',
  render: '#ec4899',
  ui: '#8b5cf6',
};

export interface TelemetrySparklineFooterProps {
  showQuantiles: boolean;
  compact: boolean;
  isEmbedded: boolean;
  isLight: boolean;
  unit: string;
  budgetMs: number;
  initialStats: TelemetryComputedStats;
  phases?: TelemetryPhaseItem[];
}

export const TelemetrySparklineFooter = forwardRef<
  TelemetrySparklineFooterHandle,
  TelemetrySparklineFooterProps
>(
  (
    {
      showQuantiles,
      compact,
      isEmbedded,
      isLight,
      unit,
      budgetMs,
      initialStats,
      phases,
    },
    ref
  ) => {
    const p50ValRef = useRef<HTMLSpanElement | null>(null);
    const p95ValRef = useRef<HTMLSpanElement | null>(null);
    const p99ValRef = useRef<HTMLSpanElement | null>(null);
    const peakValRef = useRef<HTMLSpanElement | null>(null);
    const budgetBoxRef = useRef<HTMLDivElement | null>(null);
    const budgetTextRef = useRef<HTMLSpanElement | null>(null);
    const dirtyRef = useRef({
      p50Str: '',
      p95Str: '',
      p99Str: '',
      peakStr: '',
      budgetStr: '',
      isPeakOver: null as boolean | null,
      isBudgetOver: null as boolean | null,
    });

    useImperativeHandle(
      ref,
      () => ({
        syncStats: (s: TelemetryComputedStats) => {
          const d = dirtyRef.current;
          const p50Str = `${s.p50.toFixed(2)}${unit}`;
          if (d.p50Str !== p50Str && p50ValRef.current) {
            d.p50Str = p50Str;
            p50ValRef.current.textContent = p50Str;
          }
          const p95Str = `${s.p95.toFixed(2)}${unit}`;
          if (d.p95Str !== p95Str && p95ValRef.current) {
            d.p95Str = p95Str;
            p95ValRef.current.textContent = p95Str;
          }
          const p99Str = `${s.p99.toFixed(2)}${unit}`;
          if (d.p99Str !== p99Str && p99ValRef.current) {
            d.p99Str = p99Str;
            p99ValRef.current.textContent = p99Str;
          }
          const peakStr = `${s.worstMs.toFixed(2)}${unit}`;
          if (d.peakStr !== peakStr && peakValRef.current) {
            d.peakStr = peakStr;
            peakValRef.current.textContent = peakStr;
          }
          const isPeakOver = s.worstMs > budgetMs * 1.2;
          if (d.isPeakOver !== isPeakOver && peakValRef.current) {
            d.isPeakOver = isPeakOver;
            peakValRef.current.className = `text-[11px] font-bold tabular-nums ${
              isPeakOver ? 'text-rose-500' : ''
            }`;
          }
          const hasOver = s.overBudgetCount > 0;
          if (d.isBudgetOver !== hasOver && budgetBoxRef.current) {
            d.isBudgetOver = hasOver;
            budgetBoxRef.current.className = `p-1.5 ${UI_RADIUS.button} border ${
              hasOver
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
            }`;
          }
          const budgetStr = hasOver ? `${s.overBudgetPct}% Over` : '100% OK';
          if (d.budgetStr !== budgetStr && budgetTextRef.current) {
            d.budgetStr = budgetStr;
            budgetTextRef.current.textContent = budgetStr;
          }
        },
      }),
      [budgetMs, unit]
    );

    return (
      <>
      {showQuantiles && !compact && !isEmbedded && (
        <div
          data-alpha-id={ALPHA_COMPONENT_ID}
          className="grid grid-cols-5 gap-1.5 text-center font-mono"
        >
          {[
            { label: 'p50', ref: p50ValRef, val: initialStats.p50.toFixed(2) + unit, cls: '' },
            { label: 'p95', ref: p95ValRef, val: initialStats.p95.toFixed(2) + unit, cls: '' },
            {
              label: 'p99',
              ref: p99ValRef,
              val: initialStats.p99.toFixed(2) + unit,
              cls: 'text-amber-500',
            },
            {
              label: 'Peak',
              ref: peakValRef,
              val: initialStats.worstMs.toFixed(2) + unit,
              cls: initialStats.worstMs > budgetMs * 1.2 ? 'text-rose-500' : '',
            },
          ].map((q) => (
            <div
              key={q.label}
              className={`p-1.5 ${UI_RADIUS.button} border ${
                isLight
                  ? `bg-neutral-50 ${UI_THEME.light.border}`
                  : `bg-neutral-950/60 ${UI_THEME.dark.border}`
              }`}
            >
              <span className="text-[9px] text-neutral-400 block">{q.label}</span>
              <span ref={q.ref} className={`text-[11px] font-bold tabular-nums ${q.cls}`}>
                {q.val}
              </span>
            </div>
          ))}
          <div
            ref={budgetBoxRef}
            className={`p-1.5 ${UI_RADIUS.button} border ${
              initialStats.overBudgetCount > 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
            }`}
          >
            <span className="text-[9px] opacity-80 block">Budget</span>
            <span
              ref={budgetTextRef}
              className="text-[11px] font-bold tabular-nums flex items-center justify-center gap-0.5"
            >
              {initialStats.overBudgetCount > 0
                ? `${initialStats.overBudgetPct}% Over`
                : '100% OK'}
            </span>
          </div>
        </div>
      )}

      {phases && phases.length > 0 && !compact && (
        <div
          data-alpha-id={ALPHA_COMPONENT_ID}
          className={`pt-2 border-t flex flex-col gap-1.5 font-mono text-[10px] ${
            isLight ? UI_THEME.light.border : UI_THEME.dark.border
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400">
            <span className="flex items-center gap-1 font-semibold uppercase">
              <Cpu className="h-3 w-3 text-sky-500" />
              <span>CPU Phase Breakdown</span>
            </span>
            <span className="tabular-nums">
              Total {phases.reduce((a, b) => a + b.avgMs, 0).toFixed(2)} {unit}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
            {phases.map((ph) => {
              const pct = Math.round(ph.share * 100);
              const barColor = ph.color || PHASE_COLORS[ph.phase] || '#94a3b8';
              return (
                <div key={ph.phase} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: barColor }}
                  />
                  <span className="uppercase opacity-80 w-12 truncate">{ph.phase}</span>
                  <span className="font-bold tabular-nums">
                    {ph.avgMs.toFixed(2)}
                    {unit}
                  </span>
                  <span className="text-neutral-500 tabular-nums ml-auto">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
});

TelemetrySparklineFooter.displayName = 'TelemetrySparklineFooter';
