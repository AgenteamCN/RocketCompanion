import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Zap, Volume2, Pause, Play, Trash2 } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:EventImpulseScatterChart' as const;

export type CollisionEventType = 'car-ball' | 'car-world' | 'goalpost';

export interface CollisionImpulseEvent {
  id: string;
  /**
   * Relative age in seconds (`0` = now, `timeWindowSec` = oldest edge) OR timestamp in ms.
   */
  ageSec: number;
  value: number;
  type: CollisionEventType;
  label?: string;
}

export interface EventImpulseScatterChartProps {
  events: CollisionImpulseEvent[];
  threshold: number;
  onThresholdChange?: (val: number) => void;
  minY?: number;
  maxY?: number;
  timeWindowSec?: number;
  unit?: string;
  title?: string;
  height?: number;
  onClear?: () => void;
  isLight?: boolean;
  className?: string;
}

const TYPE_META: Record<CollisionEventType, { label: string; color: string }> = {
  'car-ball': { label: 'Car-Ball', color: '#38bdf8' },
  'car-world': { label: 'Car-World', color: '#a855f7' },
  goalpost: { label: 'Goalpost', color: '#f59e0b' },
};

/**
 * EventImpulseScatterChart
 * High-Clarity, High-Performance DPR-Aware Canvas Collision Impulse & Audio Threshold Visualizer.
 * High-frequency event impulse scatter chart features:
 * - Replaces 120Hz React DOM `<circle>` re-renders & oval-distorted SVG with crisp 1:1 DPR Canvas
 * - Draws vertical lollipop impulse stems + threshold pass/suppress visual coding
 * - Interactive Nearest-Event Reticle lock to inspect exact impulse magnitude & trigger status
 */
export const EventImpulseScatterChart: React.FC<EventImpulseScatterChartProps> = React.memo(({
  events,
  threshold,
  onThresholdChange,
  minY = 0,
  maxY = 2500,
  timeWindowSec = 5.0,
  unit = 'N·s',
  title = 'Collision Impulse Stream & Threshold',
  height = 148,
  onClear,
  isLight = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(360);
  const [filter, setFilter] = useState<'all' | CollisionEventType>('all');
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [frozenEvents, setFrozenEvents] = useState<CollisionImpulseEvent[] | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const activeEvents = isFrozen && frozenEvents ? frozenEvents : events;

  const filteredEvents = useMemo(() => {
    return activeEvents.filter((ev) => {
      if (ev.ageSec < 0 || ev.ageSec > timeWindowSec) return false;
      if (filter !== 'all' && ev.type !== filter) return false;
      return true;
    });
  }, [activeEvents, filter, timeWindowSec]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(Math.max(180, Math.floor(entry.contentRect.width)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stats = useMemo(() => {
    let triggered = 0;
    let peak = 0;
    for (const e of filteredEvents) {
      if (e.value >= threshold) triggered++;
      if (e.value > peak) peak = e.value;
    }
    return {
      total: filteredEvents.length,
      triggered,
      suppressed: filteredEvents.length - triggered,
      peak,
    };
  }, [filteredEvents, threshold]);

  // High-DPI Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const targetW = Math.round(canvasWidth * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padLeft = 42;
    const padRight = 12;
    const padTop = 12;
    const padBottom = 20;
    const plotW = Math.max(10, canvasWidth - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);
    const rangeY = Math.max(1, maxY - minY);

    ctx.clearRect(0, 0, canvasWidth, height);

    const mapX = (ageSec: number) =>
      padLeft + (1 - Math.min(1, Math.max(0, ageSec / Math.max(0.1, timeWindowSec)))) * plotW;
    const mapY = (val: number) =>
      padTop + (1 - Math.min(1, Math.max(0, (val - minY) / rangeY))) * plotH;

    // 1. Shaded Suppressed Zone below threshold
    const threshY = mapY(threshold);
    const baseY = mapY(minY);
    ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.025)' : 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(padLeft, threshY, plotW, Math.max(0, baseY - threshY));

    // 2. Grid lines
    ctx.font = '10px "SF Mono", "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yTicks = [minY, Math.round((minY + maxY) / 2), maxY];
    for (const tickVal of yTicks) {
      const y = Math.round(mapY(tickVal)) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.moveTo(padLeft, y);
      ctx.lineTo(canvasWidth - padRight, y);
      ctx.stroke();

      ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
      ctx.fillText(`${tickVal}`, padLeft - 6, y);
    }

    // 3. Threshold Horizontal Line
    ctx.beginPath();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.4;
    ctx.moveTo(padLeft, threshY);
    ctx.lineTo(canvasWidth - padRight, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText(`Thresh: ${Math.round(threshold)}`, padLeft + 6, Math.max(padTop + 7, threshY - 8));

    // 4. Draw Events (Impulse Stems + Crisp Circles)
    for (const ev of filteredEvents) {
      const x = mapX(ev.ageSec);
      const y = mapY(ev.value);
      const passed = ev.value >= threshold;
      const color = TYPE_META[ev.type]?.color || '#38bdf8';
      const isHovered = ev.id === hoveredEventId;

      // Vertical impulse stem
      ctx.beginPath();
      ctx.strokeStyle = passed
        ? isLight
          ? `${color}66`
          : `${color}55`
        : isLight
        ? 'rgba(148, 163, 184, 0.3)'
        : 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = isHovered ? 2 : 1.2;
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Scatter point
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 5.5 : passed ? 3.8 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = passed ? color : isLight ? '#94a3b8' : '#475569';
      ctx.fill();

      if (passed || isHovered) {
        ctx.lineWidth = isHovered ? 2 : 1.2;
        ctx.strokeStyle = isHovered ? '#f59e0b' : isLight ? '#ffffff' : '#09090b';
        ctx.stroke();
      }

      if (isHovered) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // 5. X-Axis Time Labels
    ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
    ctx.font = '9px "SF Mono", "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`-${timeWindowSec.toFixed(1)}s`, padLeft, height - 6);
    ctx.textAlign = 'center';
    ctx.fillText(`-${(timeWindowSec / 2).toFixed(1)}s`, padLeft + plotW / 2, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText(isFrozen ? 'FROZEN' : '0.0s (Now)', canvasWidth - padRight, height - 6);
  }, [filteredEvents, threshold, minY, maxY, timeWindowSec, canvasWidth, height, isLight, hoveredEventId, isFrozen]);

  // Nearest point hit-testing on mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const padLeft = 42;
    const padRight = 12;
    const padTop = 12;
    const padBottom = 20;
    const plotW = Math.max(10, rect.width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);
    const rangeY = Math.max(1, maxY - minY);

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let bestId: string | null = null;
    let bestDistSq = 28 * 28; // 28px snap radius

    for (const ev of filteredEvents) {
      const ex = padLeft + (1 - Math.min(1, Math.max(0, ev.ageSec / Math.max(0.1, timeWindowSec)))) * plotW;
      const ey = padTop + (1 - Math.min(1, Math.max(0, (ev.value - minY) / rangeY))) * plotH;
      const dx = mx - ex;
      const dy = my - ey;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestId = ev.id;
      }
    }
    setHoveredEventId(bestId);
  };

  const inspectedEvent = useMemo(
    () => filteredEvents.find((e) => e.id === hoveredEventId) || null,
    [filteredEvents, hoveredEventId]
  );

  return (
    <div
      ref={containerRef}
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="event-impulse-scatter-chart"
      className={`p-3 ${UI_RADIUS.card} border flex flex-col gap-2.5 select-none transition-colors ${
        isLight
          ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-2xs`
          : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
      } ${className}`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>{title}</span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'car-ball', 'car-world', 'goalpost'] as const).map((cat) => {
            const isActive = filter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-neutral-950 font-bold'
                    : isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
                }`}
              >
                {cat === 'all' ? 'All' : TYPE_META[cat].label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              if (!isFrozen) {
                setFrozenEvents([...events]);
                setIsFrozen(true);
              } else {
                setFrozenEvents(null);
                setIsFrozen(false);
              }
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
              isFrozen
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            {isFrozen ? <Play className="h-2.5 w-2.5 fill-current" /> : <Pause className="h-2.5 w-2.5" />}
            <span>{isFrozen ? 'Resume' : 'Freeze'}</span>
          </button>

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              title="Clear events"
              className={`p-1 rounded border cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-600'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-400'
              }`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Inspected Event Callout Bar */}
      <div
        className={`px-2.5 py-1.5 rounded-lg border font-mono text-[11px] flex items-center justify-between gap-2 ${
          isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/70 border-neutral-800'
        }`}
      >
        {inspectedEvent ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_META[inspectedEvent.type].color }}
              />
              <span className="font-bold">{TYPE_META[inspectedEvent.type].label}</span>
              <span className="text-neutral-400">at -{inspectedEvent.ageSec.toFixed(2)}s</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-amber-500 tabular-nums">
                {inspectedEvent.value.toFixed(0)} {unit}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                  inspectedEvent.value >= threshold
                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                    : 'bg-neutral-500/20 text-neutral-400 border border-neutral-500/30'
                }`}
              >
                {inspectedEvent.value >= threshold ? 'AUDIO TRIGGERED' : 'SUPPRESSED'}
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="text-neutral-400 text-[10px]">
              Hover over any impulse stem/dot to lock & inspect event metrics
            </span>
            <div className="flex items-center gap-3 text-[10px] shrink-0">
              <span>
                Triggered: <strong className="text-emerald-500">{stats.triggered}</strong>
              </span>
              <span>
                Muted: <strong className="text-neutral-400">{stats.suppressed}</strong>
              </span>
              <span>
                Peak: <strong className="text-amber-500">{stats.peak.toFixed(0)} {unit}</strong>
              </span>
            </div>
          </>
        )}
      </div>

      {/* High-DPI Canvas Plot */}
      <div
        className={`relative rounded-lg border overflow-hidden ${
          isLight ? 'bg-neutral-50/90 border-neutral-200/90' : 'bg-neutral-950/90 border-neutral-800'
        }`}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px`, display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredEventId(null)}
          className="cursor-crosshair"
        />
      </div>

      {/* Interactive Threshold Slider Footer */}
      {onThresholdChange && (
        <div className="flex items-center gap-3 pt-0.5 font-mono text-[11px]">
          <div className="flex items-center gap-1.5 text-neutral-400 shrink-0">
            <Volume2 className="h-3.5 w-3.5 text-amber-500" />
            <span>Audio Gate Threshold:</span>
          </div>
          <input
            type="range"
            min={minY}
            max={maxY}
            step={Math.max(1, Math.round((maxY - minY) / 100))}
            value={threshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            className="flex-1 h-1.5 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <span className="w-16 text-right font-bold text-amber-500 tabular-nums">
            {Math.round(threshold)} {unit}
          </span>
        </div>
      )}
    </div>
  );
});

EventImpulseScatterChart.displayName = 'EventImpulseScatterChart';
