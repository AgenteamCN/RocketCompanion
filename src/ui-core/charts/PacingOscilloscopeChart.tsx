import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import { PACING_EVENT_FLAGS, type PacingSampleInput, PacingRingBuffer } from './pacingRingBuffer';
import {
  drawPacingOscilloscopeCanvas,
  type OscilloscopeRenderCache,
} from './pacingOscilloscopePainter';
import {
  createSeededPacingRingBuffer,
  PacingOscilloscopeFooterBar,
  PacingOscilloscopeHeaderBar,
} from './PacingOscilloscopeHeaderAndControls';

export const ALPHA_COMPONENT_ID = 'Alpha:PacingOscilloscopeChart' as const;

export interface PacingOscilloscopeHandle {
  /** Push a single 120Hz pacing frame into the pre-allocated ring buffer with zero React re-renders */
  pushSample: (sample: PacingSampleInput) => void;
  /** Access underlying zero-allocation ring buffer */
  getRingBuffer: () => PacingRingBuffer;
}

export interface PacingOscilloscopeSurfaceBase {
  variant?: 'card' | 'embedded';
  isLight?: boolean;
  className?: string;
  defaultIsFrozen?: boolean;
}

export interface PacingOscilloscopeChartProps extends PacingOscilloscopeSurfaceBase {
  /** Optional external pre-allocated PacingRingBuffer for 120Hz zero-React-rerender streaming */
  ringBuffer?: PacingRingBuffer;
  /** Height of the 3-pane oscilloscope canvas in px (default: 240) */
  height?: number;
  /** Deadband corridor offsets around target buffer in ticks (default: [-2, 2]) */
  deadbandOffsets?: [number, number];
  /** Optional counterfactual What-If overlay trajectory */
  whatIfOverlay?: {
    simBuffer: ArrayLike<number>;
    simRateHz: ArrayLike<number>;
    targetBuffer?: number;
  } | null;
  /** Whether to run built-in 120Hz self-simulation when no external caller pushes samples */
  autoSimulate?: boolean;
  /** Whether to show the top title & EWMA/Buf/Rate header bar (default: true) */
  showHeader?: boolean;
  /** Whether to show the developer Inject Starvation + Resync button (default: true) */
  showInjectStarvation?: boolean;
  /** Whether to draw inside-pane text labels on the left of each sub-pane (default: true) */
  showPaneLabels?: boolean;
  /** Controlled freeze state (optional) */
  isFrozen?: boolean;
  /** Callback when freeze state is toggled */
  onFreezeToggle?: (frozen: boolean) => void;
  /** Callback when buffer is cleared */
  onClear?: () => void;
}

/**
 * PacingOscilloscopeChart
 * 3-Pane Synchronized 120Hz Network Clock-Pacing & Buffer Deadband Oscilloscope.
 */
export const PacingOscilloscopeChart = React.memo(
  forwardRef<PacingOscilloscopeHandle, PacingOscilloscopeChartProps>(
    (props, ref) => {
      const {
        ringBuffer: externalBuffer,
        height = 240,
        deadbandOffsets = [-2, 2],
        whatIfOverlay = null,
        autoSimulate = true,
        showHeader = true,
        showInjectStarvation = true,
        showPaneLabels = true,
        isFrozen: controlledIsFrozen,
        defaultIsFrozen = false,
        onFreezeToggle,
        onClear,
        variant = 'card',
        isLight = true,
        className = '',
      } = props;

      const internalBufferRef = useRef<PacingRingBuffer | null>(null);
      if (!internalBufferRef.current) {
        internalBufferRef.current = createSeededPacingRingBuffer(360);
      }

      const activeBuffer = externalBuffer ?? internalBufferRef.current;

      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const renderCacheRef = useRef<OscilloscopeRenderCache>({
        canvas: null,
        ctx: null,
        cssW: 520,
        cssH: height,
        isLight: false,
      });

      const rttBadgeRef = useRef<HTMLSpanElement | null>(null);
      const bufBadgeRef = useRef<HTMLSpanElement | null>(null);
      const rateBadgeRef = useRef<HTMLSpanElement | null>(null);

      const [internalIsFrozen, setInternalIsFrozen] = useState(defaultIsFrozen);
      const isFrozen = controlledIsFrozen ?? internalIsFrozen;
      const isFrozenRef = useRef(isFrozen);
      isFrozenRef.current = isFrozen;
      const hoverIndexRef = useRef<number | null>(null);

      const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        drawPacingOscilloscopeCanvas(canvas, renderCacheRef.current, activeBuffer, {
          height,
          deadbandOffsets,
          whatIfOverlay,
          showPaneLabels,
          isLight,
          hoverIndex: hoverIndexRef.current,
        });
      }, [activeBuffer, height, deadbandOffsets, whatIfOverlay, showPaneLabels, isLight]);

      const updateHeaderBadges = useCallback(() => {
        const count = activeBuffer.count;
        if (count === 0) return;
        const pIdx = activeBuffer.physicalIndex(count - 1);
        if (rttBadgeRef.current) {
          rttBadgeRef.current.textContent = `${activeBuffer.smoothRttMs[pIdx].toFixed(1)} ms`;
        }
        if (bufBadgeRef.current) {
          bufBadgeRef.current.textContent = `${activeBuffer.effectiveBuffer[pIdx].toFixed(1)} ticks`;
        }
        if (rateBadgeRef.current) {
          rateBadgeRef.current.textContent = `${activeBuffer.physicsRateHz[pIdx].toFixed(1)} Hz`;
        }
      }, [activeBuffer]);

      useImperativeHandle(
        ref,
        () => ({
          pushSample: (sample: PacingSampleInput) => {
            activeBuffer.push(sample);
          },
          getRingBuffer: () => activeBuffer,
        }),
        [activeBuffer]
      );

      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || typeof ResizeObserver === 'undefined') return;
        renderCacheRef.current.cssW = canvas.clientWidth || 520;
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = Math.max(200, Math.floor(entry.contentRect.width));
            if (renderCacheRef.current.cssW !== w) {
              renderCacheRef.current.cssW = w;
              drawCanvas();
            }
          }
        });
        ro.observe(canvas);
        return () => ro.disconnect();
      }, [drawCanvas]);

      useEffect(() => {
        let tickCounter = 0;
        let rafId = 0;
        let scheduled = false;

        const flush = () => {
          scheduled = false;
          if (isFrozenRef.current) return;
          drawCanvas();
          tickCounter++;
          if (tickCounter % 6 === 0) {
            updateHeaderBadges();
          }
        };

        const unsub = activeBuffer.subscribe(() => {
          if (!scheduled && !isFrozenRef.current) {
            scheduled = true;
            rafId = requestAnimationFrame(flush);
          }
        });

        return () => {
          unsub();
          if (scheduled) cancelAnimationFrame(rafId);
        };
      }, [activeBuffer, drawCanvas, updateHeaderBadges]);

      useEffect(() => {
        drawCanvas();
        updateHeaderBadges();
      }, [drawCanvas, updateHeaderBadges]);

      useEffect(() => {
        if (!autoSimulate || externalBuffer) return;
        let phase = 0;
        const timer = window.setInterval(() => {
          if (isFrozenRef.current) return;
          phase += 0.12;
          const rawRtt = 25 + Math.sin(phase) * 3.8 + (Math.random() - 0.5) * 2.5;
          const tgt = 3.0;
          const srv = 3.0 + Math.cos(phase * 0.7) * 1.1 + (Math.random() - 0.5) * 0.4;
          const eff = srv * 0.9 + 0.3;
          const rate = 120 - (eff - tgt) * 0.75;
          activeBuffer.push({
            rawRttMs: rawRtt,
            serverBuffer: srv,
            effectiveBuffer: eff,
            targetBuffer: tgt,
            physicsRateHz: rate,
            eventFlags: 0,
          });
        }, 33);
        return () => window.clearInterval(timer);
      }, [autoSimulate, externalBuffer, activeBuffer]);

      const handleInjectStarvationBurst = () => {
        for (let i = 0; i < 12; i++) {
          const isResync = i === 11;
          activeBuffer.push({
            rawRttMs: 74 + Math.random() * 18,
            serverBuffer: -1.8 + i * 0.25,
            effectiveBuffer: -1.2 + i * 0.2,
            targetBuffer: 3.0,
            physicsRateHz: 124.2,
            eventFlags: isResync
              ? PACING_EVENT_FLAGS.HARD_RESYNC
              : PACING_EVENT_FLAGS.STARVATION,
          });
        }
        drawCanvas();
        updateHeaderBadges();
      };

      const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const cssW = renderCacheRef.current.cssW || 520;
        const padX = 8;
        const plotW = Math.max(20, cssW - padX * 2);
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - padX) / plotW));
        const idx = Math.round(ratio * Math.max(0, activeBuffer.count - 1));
        if (hoverIndexRef.current !== idx) {
          hoverIndexRef.current = idx;
          drawCanvas();
        }
      };

      const handleMouseLeave = () => {
        if (hoverIndexRef.current !== null) {
          hoverIndexRef.current = null;
          drawCanvas();
        }
      };

      const handleToggleFreeze = () => {
        const next = !isFrozen;
        if (controlledIsFrozen === undefined) {
          setInternalIsFrozen(next);
        }
        onFreezeToggle?.(next);
      };

      const handleClearBuffer = () => {
        if (onClear) {
          onClear();
        } else {
          activeBuffer.clear();
        }
        drawCanvas();
        updateHeaderBadges();
      };

      const isEmbedded = variant === 'embedded';

      return (
        <div
          data-alpha-id={ALPHA_COMPONENT_ID}
          data-ui-element="chart-pacing-oscilloscope"
          className={`flex flex-col ${
            isEmbedded
              ? `gap-2 p-2.5 ${UI_RADIUS.card} border ${
                  isLight ? `bg-white ${UI_THEME.light.border}` : `bg-neutral-900/75 ${UI_THEME.dark.border}`
                }`
              : `gap-2.5 p-4 ${UI_RADIUS.panel} border ${
                  isLight
                    ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-xs`
                    : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary} shadow-lg`
                }`
          } select-none ${className}`}
        >
          {showHeader && (
            <PacingOscilloscopeHeaderBar
              isLight={isLight}
              rttBadgeRef={rttBadgeRef}
              bufBadgeRef={bufBadgeRef}
              rateBadgeRef={rateBadgeRef}
            />
          )}

          <div
            className={`relative ${
              isEmbedded ? 'rounded-lg' : 'rounded-xl'
            } overflow-hidden border ${
              isLight ? 'border-neutral-300' : 'border-neutral-800'
            }`}
            style={{ height: `${height}px` }}
          >
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="block w-full h-full cursor-crosshair"
            />
          </div>

          <PacingOscilloscopeFooterBar
            isEmbedded={isEmbedded}
            isLight={isLight}
            isFrozen={isFrozen}
            showInjectStarvation={showInjectStarvation}
            onInjectStarvation={handleInjectStarvationBurst}
            onToggleFreeze={handleToggleFreeze}
            onClearBuffer={handleClearBuffer}
          />
        </div>
      );
    }
  )
);

PacingOscilloscopeChart.displayName = 'PacingOscilloscopeChart';
