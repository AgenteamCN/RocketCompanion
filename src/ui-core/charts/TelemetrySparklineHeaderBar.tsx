import React from 'react';
import { Activity, Pause, Play, RotateCcw } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import type { TelemetryComputedStats } from './telemetryRingBuffer';

export interface TelemetrySparklineHeaderBarBase {
  title: string;
  budgetMs: number;
  unit: string;
  isLight: boolean;
}

export interface TelemetrySparklineHeaderBarProps extends TelemetrySparklineHeaderBarBase {
  isFrozen: boolean;
  inspectedValue: number | null;
  hoverIndex: number | null;
  showFpsReadout: boolean;
  initialStats: TelemetryComputedStats;
  currentValRef: React.RefObject<HTMLSpanElement | null>;
  fpsValRef: React.RefObject<HTMLSpanElement | null>;
  onToggleFreeze: (e: React.MouseEvent) => void;
}

export const TelemetrySparklineHeaderBar: React.FC<TelemetrySparklineHeaderBarProps> =
  React.memo((props) => {
    const {
      title,
      isFrozen,
      inspectedValue,
      hoverIndex,
      budgetMs,
      unit,
      showFpsReadout,
      initialStats,
      currentValRef,
      fpsValRef,
      isLight,
      onToggleFreeze,
    } = props;
    const inspectedDelta = inspectedValue !== null ? inspectedValue - budgetMs : null;

    return (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
          <Activity className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>{title}</span>
          {isFrozen && (
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase">
              Snapshot Frozen
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono">
          {inspectedValue !== null ? (
            <div
              className={`px-2 py-0.5 ${UI_RADIUS.badge} border text-[11px] flex items-center gap-1.5 ${
                inspectedValue > budgetMs * 1.02
                  ? 'bg-rose-500/15 text-rose-500 border-rose-500/30 font-bold'
                  : isLight
                  ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                  : 'bg-neutral-800 text-neutral-200 border-neutral-700'
              }`}
            >
              <span>Sample #{hoverIndex}:</span>
              <strong>
                {inspectedValue.toFixed(2)}
                {unit}
              </strong>
              <span className="text-[10px] opacity-80">
                ({inspectedDelta! >= 0 ? `+${inspectedDelta!.toFixed(2)}` : inspectedDelta!.toFixed(2)}
                {unit})
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span
                ref={currentValRef}
                className="text-sm font-bold text-amber-500 tabular-nums"
              >
                {initialStats.currentMs.toFixed(2)}
              </span>
              <span className="text-[10px] text-neutral-400">{unit}</span>
              {showFpsReadout && (
                <span ref={fpsValRef} className="text-[10px] text-neutral-500 tabular-nums">
                  ({initialStats.fps} fps)
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleFreeze}
            title={isFrozen ? 'Resume live telemetry stream' : 'Freeze frame history to inspect spikes'}
            className={`inline-flex items-center gap-1 px-2 py-0.5 ${UI_RADIUS.button} border text-[10px] font-semibold cursor-pointer transition-colors ${
              isFrozen
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            {isFrozen ? (
              <Play className="h-2.5 w-2.5 fill-current" />
            ) : (
              <Pause className="h-2.5 w-2.5" />
            )}
            <span>{isFrozen ? 'Resume' : 'Freeze'}</span>
          </button>
        </div>
      </div>
    );
  });

TelemetrySparklineHeaderBar.displayName = 'TelemetrySparklineHeaderBar';

export interface TelemetrySparklineEmbeddedControlBarProps {
  isFrozen: boolean;
  avgMs: number;
  unit: string;
  refreshHz: number;
  isLight: boolean;
  onToggleFreeze: (e: React.MouseEvent) => void;
  onReset: () => void;
}

export const TelemetrySparklineEmbeddedControlBar: React.FC<
  TelemetrySparklineEmbeddedControlBarProps
> = React.memo(
  ({ isFrozen, avgMs, unit, refreshHz, isLight, onToggleFreeze, onReset }) => {
    return (
      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleFreeze}
            className={`inline-flex items-center gap-1 px-2.5 py-1 ${UI_RADIUS.button} border text-[10px] font-semibold cursor-pointer transition-colors ${
              isFrozen
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            {isFrozen ? (
              <Play className="h-3 w-3 fill-current" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
            <span>{isFrozen ? 'Resume' : 'Freeze'}</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className={`inline-flex items-center gap-1 px-2.5 py-1 ${UI_RADIUS.button} border text-[10px] font-semibold cursor-pointer transition-colors ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-400">Average:</span>
          <span className="font-bold text-amber-500 tabular-nums">
            {avgMs.toFixed(2)} {unit}
          </span>
          <span className="text-[10px] opacity-65 tabular-nums">
            ({avgMs > 0.1 ? Math.min(999, Math.round(1000 / avgMs)) : refreshHz} fps)
          </span>
        </div>
      </div>
    );
  }
);

TelemetrySparklineEmbeddedControlBar.displayName = 'TelemetrySparklineEmbeddedControlBar';
