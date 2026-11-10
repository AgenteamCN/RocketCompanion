import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import { TelemetryRingBuffer, TelemetryComputedStats } from './telemetryRingBuffer';
import { CanvasRenderCache, drawTelemetryCanvas } from './telemetrySparklinePainter';
import {
  TelemetrySparklineFooter,
  type TelemetryPhaseItem,
  type TelemetrySparklineFooterHandle,
} from './TelemetrySparklineFooter';
import {
  TelemetrySparklineEmbeddedControlBar,
  TelemetrySparklineHeaderBar,
} from './TelemetrySparklineHeaderBar';

export const ALPHA_COMPONENT_ID = 'Alpha:TelemetrySparklineChart' as const;

export type { TelemetryPhaseItem };

export interface TelemetrySparklineChartHandle {
  pushSample: (value: number) => void;
  pushBatch: (values: ArrayLike<number>) => void;
  getRingBuffer: () => TelemetryRingBuffer;
}

export interface TelemetryChartSurfaceBase {
  isLight?: boolean;
  className?: string;
  variant?: 'card' | 'embedded';
}

export interface TelemetrySparklineChartProps extends TelemetryChartSurfaceBase {
  ringBuffer?: TelemetryRingBuffer;
  budgetMs?: number;
  refreshHz?: number;
  unit?: string;
  showFpsReadout?: boolean;
  phases?: TelemetryPhaseItem[];
  title?: string;
  height?: number;
  isFrozen?: boolean;
  onFreezeToggle?: (isFrozen: boolean) => void;
  onReset?: () => void;
}

export const TelemetrySparklineChart = React.memo(
  forwardRef<TelemetrySparklineChartHandle, TelemetrySparklineChartProps>(
    (props, ref) => {
      const {
        ringBuffer: externalRingBuffer,
        budgetMs = 8.33,
        refreshHz = 120,
        unit = 'ms',
        showFpsReadout = true,
        phases,
        title = 'Frame Time Telemetry',
        height = 112,
        isFrozen: controlledIsFrozen,
        onFreezeToggle,
        onReset,
        variant = 'card',
        isLight = false,
        className = '',
      } = props;

      const compact = variant === 'embedded';
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const containerRef = useRef<HTMLDivElement | null>(null);
      const renderCacheRef = useRef<CanvasRenderCache>({
        ctx: null,
        grad: null,
        gradHeight: 0,
        gradIsLight: null,
      });

      const [canvasWidth, setCanvasWidth] = useState<number>(360);
      const [internalIsFrozen, setInternalIsFrozen] = useState<boolean>(false);
      const isFrozen = controlledIsFrozen ?? internalIsFrozen;
      const [frozenSnapshot, setFrozenSnapshot] = useState<Float32Array | null>(null);
      const [hoverIndex, setHoverIndex] = useState<number | null>(null);

      const internalRingBufferRef = useRef<TelemetryRingBuffer | null>(null);
      if (!internalRingBufferRef.current) {
        internalRingBufferRef.current = new TelemetryRingBuffer(240);
      }
      const activeRingBuffer = externalRingBuffer ?? internalRingBufferRef.current;

      useEffect(() => {
        if (controlledIsFrozen === undefined) return;
        setFrozenSnapshot(controlledIsFrozen ? activeRingBuffer.snapshot() : null);
      }, [controlledIsFrozen, activeRingBuffer]);

      const currentValRef = useRef<HTMLSpanElement | null>(null);
      const fpsValRef = useRef<HTMLSpanElement | null>(null);
      const footerRef = useRef<TelemetrySparklineFooterHandle | null>(null);
      const headerDirtyRef = useRef({ currentStr: '', fpsStr: '' });

      useImperativeHandle(
        ref,
        () => ({
          pushSample: (val: number) => activeRingBuffer.push(val),
          pushBatch: (vals: ArrayLike<number>) => activeRingBuffer.pushBatch(vals),
          getRingBuffer: () => activeRingBuffer,
        }),
        [activeRingBuffer]
      );

      const toggleFreeze = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextFrozen = !isFrozen;
        setFrozenSnapshot(nextFrozen ? activeRingBuffer.snapshot() : null);
        if (controlledIsFrozen === undefined) {
          setInternalIsFrozen(nextFrozen);
        }
        onFreezeToggle?.(nextFrozen);
      };

      useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = Math.max(160, Math.floor(entry.contentRect.width));
            setCanvasWidth((prev) => (prev !== w ? w : prev));
          }
        });
        ro.observe(el);
        return () => ro.disconnect();
      }, []);

      const syncDomReadouts = useCallback(
        (s: TelemetryComputedStats) => {
          const d = headerDirtyRef.current;
          const curStr = s.currentMs.toFixed(2);
          if (d.currentStr !== curStr && currentValRef.current) {
            d.currentStr = curStr;
            currentValRef.current.textContent = curStr;
          }
          if (showFpsReadout && fpsValRef.current) {
            const fStr = `(${s.fps} fps)`;
            if (d.fpsStr !== fStr) {
              d.fpsStr = fStr;
              fpsValRef.current.textContent = fStr;
            }
          }
          footerRef.current?.syncStats(s);
        },
        [showFpsReadout]
      );

      const getSampleCount = useCallback(() => {
        return isFrozen && frozenSnapshot ? frozenSnapshot.length : activeRingBuffer.count;
      }, [isFrozen, frozenSnapshot, activeRingBuffer]);

      const getSampleAt = useCallback(
        (idx: number) => {
          if (isFrozen && frozenSnapshot) {
            return frozenSnapshot[idx] ?? 0;
          }
          return activeRingBuffer.getAt(idx);
        },
        [isFrozen, frozenSnapshot, activeRingBuffer]
      );

      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const stats = activeRingBuffer.computeStats(
          budgetMs,
          refreshHz,
          isFrozen ? frozenSnapshot : null
        );
        drawTelemetryCanvas(canvas, renderCacheRef.current, getSampleCount(), getSampleAt, stats.ceiling, {
          canvasWidth, height, budgetMs, refreshHz, unit, isLight, hoverIndex, isFrozen,
        });
        syncDomReadouts(stats);
      }, [
        activeRingBuffer, frozenSnapshot, getSampleCount, getSampleAt,
        canvasWidth, height, budgetMs, refreshHz, unit, isLight, hoverIndex, isFrozen, syncDomReadouts,
      ]);

      const liveOptsRef = useRef({ canvasWidth, height, budgetMs, refreshHz, unit, isLight, hoverIndex, isFrozen });
      liveOptsRef.current = { canvasWidth, height, budgetMs, refreshHz, unit, isLight, hoverIndex, isFrozen };

      useEffect(() => {
        let rafId = 0;
        let scheduled = false;
        let quantileFrameCounter = 0;
        const getAtLive = (idx: number) => activeRingBuffer.getAt(idx);

        const flushFrame = () => {
          scheduled = false;
          const opts = liveOptsRef.current;
          if (opts.isFrozen) return;
          const canvas = canvasRef.current;
          if (!canvas) return;

          quantileFrameCounter = (quantileFrameCounter + 1) % 10;
          if (quantileFrameCounter === 0 && opts.hoverIndex === null) {
            const fullStats = activeRingBuffer.computeStats(opts.budgetMs, opts.refreshHz);
            drawTelemetryCanvas(
              canvas,
              renderCacheRef.current,
              activeRingBuffer.count,
              getAtLive,
              fullStats.ceiling,
              opts
            );
            syncDomReadouts(fullStats);
          } else {
            const fastStats = activeRingBuffer.updateFastBounds(opts.budgetMs, opts.refreshHz);
            drawTelemetryCanvas(
              canvas,
              renderCacheRef.current,
              activeRingBuffer.count,
              getAtLive,
              fastStats.ceiling,
              opts
            );
          }
        };

        const unsub = activeRingBuffer.subscribe(() => {
          if (!scheduled && !liveOptsRef.current.isFrozen) {
            scheduled = true;
            rafId = requestAnimationFrame(flushFrame);
          }
        });

        return () => {
          unsub();
          if (scheduled) cancelAnimationFrame(rafId);
        };
      }, [activeRingBuffer, syncDomReadouts]);

      const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const padLeft = 36;
        const padRight = 10;
        const plotW = Math.max(10, rect.width - padLeft - padRight);
        const relX = e.clientX - rect.left - padLeft;
        const ratio = Math.max(0, Math.min(1, relX / plotW));
        const count = getSampleCount();
        if (count > 0) {
          const idx = Math.round(ratio * (count - 1));
          setHoverIndex((prev) => (prev !== idx ? idx : prev));
        }
      };

      const count = getSampleCount();
      const inspectedValue =
        hoverIndex !== null && hoverIndex >= 0 && hoverIndex < count
          ? getSampleAt(hoverIndex)
          : null;
      const initialStats = activeRingBuffer.computeStats(
        budgetMs,
        refreshHz,
        isFrozen ? frozenSnapshot : null
      );

      const isEmbedded = variant === 'embedded';
      let sumMs = 0;
      if (isEmbedded && count > 0) {
        for (let i = 0; i < count; i++) {
          sumMs += getSampleAt(i);
        }
      }
      const avgMs = count > 0 ? sumMs / count : 0;

      const handleReset = () => {
        if (onReset) {
          onReset();
        } else {
          activeRingBuffer.clear();
        }
        if (isFrozen) {
          setFrozenSnapshot(activeRingBuffer.snapshot());
        }
      };

      return (
        <div
          ref={containerRef}
          data-alpha-id={ALPHA_COMPONENT_ID}
          data-component="telemetry-sparkline-chart"
          className={`${
            isEmbedded ? 'p-2.5 gap-2' : 'p-3 gap-2.5'
          } ${UI_RADIUS.card} border flex flex-col select-none transition-colors ${
            isLight
              ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-2xs`
              : isEmbedded
              ? `bg-neutral-900/75 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
              : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
          } ${className}`}
        >
          {!isEmbedded && (
            <TelemetrySparklineHeaderBar
              title={title}
              isFrozen={isFrozen}
              inspectedValue={inspectedValue}
              hoverIndex={hoverIndex}
              budgetMs={budgetMs}
              unit={unit}
              showFpsReadout={showFpsReadout}
              initialStats={initialStats}
              currentValRef={currentValRef}
              fpsValRef={fpsValRef}
              isLight={isLight}
              onToggleFreeze={toggleFreeze}
            />
          )}

          <div
            className={`relative ${UI_RADIUS.button} border overflow-hidden ${
              isLight
                ? 'bg-neutral-50/90 border-neutral-200/90'
                : 'bg-neutral-950/90 border-neutral-800'
            }`}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: `${height}px`, display: 'block' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
              className="cursor-crosshair"
            />
          </div>

          {isEmbedded && (
            <TelemetrySparklineEmbeddedControlBar
              isFrozen={isFrozen}
              avgMs={avgMs}
              unit={unit}
              refreshHz={refreshHz}
              isLight={isLight}
              onToggleFreeze={toggleFreeze}
              onReset={handleReset}
            />
          )}

          <TelemetrySparklineFooter
            ref={footerRef}
            showQuantiles
            compact={compact}
            isEmbedded={isEmbedded}
            isLight={isLight}
            unit={unit}
            budgetMs={budgetMs}
            initialStats={initialStats}
            phases={phases}
          />
        </div>
      );
    }
  )
);

TelemetrySparklineChart.displayName = 'TelemetrySparklineChart';
