import React, { useRef, useState, useEffect } from 'react';
import { useViewportStore, viewportStore } from '../../ui-core/stores/viewportStore';
import { SafeAreaHud } from '../../ui-core/viewport/SafeAreaHud';
import { AlertTriangle, ChevronRight } from 'lucide-react';

export interface GameViewportProps {
  children: React.ReactNode;
  isLight?: boolean;
  showTelemetry?: boolean;
  className?: string;
}

export const GameViewport: React.FC<GameViewportProps> = React.memo(({
  children,
  isLight = false,
  showTelemetry = false,
  className = '',
}) => {
  const { metrics, portraitDismissed } = useViewportStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hostSize, setHostSize] = useState<{ width: number; height: number } | null>(null);
  const [localDismissed, setLocalDismissed] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const updateSize = () => {
      if (hostRef.current) {
        const w = hostRef.current.clientWidth;
        const h = hostRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setHostSize({ width: w, height: h });
        }
      }
    };
    updateSize();
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateSize();
      });
    });
    ro.observe(hostRef.current);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Reset local portrait gate dismissal when aspect ratio returns to landscape
  useEffect(() => {
    if (hostSize && hostSize.width >= hostSize.height) {
      setLocalDismissed(false);
    }
  }, [hostSize]);

  // Compute local container clamp metrics if hostSize is available, otherwise fallback to window metrics
  const effectiveW = hostSize ? hostSize.width : metrics.renderWidth;
  const effectiveH = hostSize ? hostSize.height : metrics.renderHeight;
  const maxRenderW = effectiveH * 2.0; // 18:9 clamp
  const clampedW = Math.min(effectiveW, maxRenderW);
  const isPillarboxed = effectiveW > maxRenderW + 1;
  const pillarboxWidth = isPillarboxed ? Math.round((effectiveW - clampedW) / 2) : 0;
  const isPortrait = effectiveW < effectiveH;
  const isGateDismissed = hostSize ? localDismissed : portraitDismissed;

  return (
    <div
      ref={hostRef}
      id="game-ui-viewport-host"
      className={`relative w-full h-full select-none overflow-hidden flex items-center justify-center transition-all ${
        isLight ? 'bg-neutral-900' : 'bg-black'
      } ${className}`}
      style={{
        paddingLeft: isPillarboxed ? `${pillarboxWidth}px` : undefined,
        paddingRight: isPillarboxed ? `${pillarboxWidth}px` : undefined,
      }}
    >
      {/* Left/Right Pillarbox Telemetry Guides when Pillarboxed */}
      {isPillarboxed && showTelemetry && (
        <>
          <div
            style={{ width: `${pillarboxWidth}px` }}
            className="absolute left-0 top-0 bottom-0 z-20 flex flex-col items-center justify-center border-r border-amber-500/40 bg-amber-500/10 text-amber-300 font-mono text-[10px] pointer-events-none select-none"
          >
            <span>PILLARBOX</span>
            <span className="font-bold">{pillarboxWidth}px</span>
          </div>
          <div
            style={{ width: `${pillarboxWidth}px` }}
            className="absolute right-0 top-0 bottom-0 z-20 flex flex-col items-center justify-center border-l border-amber-500/40 bg-amber-500/10 text-amber-300 font-mono text-[10px] pointer-events-none select-none"
          >
            <span>PILLARBOX</span>
            <span className="font-bold">{pillarboxWidth}px</span>
          </div>
        </>
      )}

      {/* 18:9 Clamped Active Canvas Box */}
      <div
        ref={viewportRef}
        id="game-root"
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        style={{
          maxWidth: `${Math.round(clampedW)}px`,
          maxHeight: `${Math.round(effectiveH)}px`,
        }}
      >
        {/* Safe Area HUD Overlay if enabled */}
        <SafeAreaHud isLight={isLight} />

        {/* Dynamic UI Content */}
        <div className="relative w-full h-full flex items-center justify-center pointer-events-auto">
          {children}
        </div>

        {/* 1:1 Portrait Gate (SimpleUI standard warning) */}
        {isPortrait && !isGateDismissed && (
          <div className="absolute inset-0 z-[999] pointer-events-auto bg-neutral-950/95 flex flex-col items-center justify-center p-6 text-center text-white backdrop-blur-md">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-lg">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-white mb-1.5">
              Display Warning (1:1 Ratio Limit)
            </h2>
            <p className="max-w-xs text-xs text-neutral-400 leading-relaxed mb-4">
              RocketSim & SimpleUI canvas are optimized for landscape displays between 1:1 and 18:9 aspect ratios. Portrait layouts ({Math.round(effectiveW)}×{Math.round(effectiveH)}px) may degrade layout ergonomics.
            </p>
            <button
              type="button"
              onClick={() => {
                setLocalDismissed(true);
                viewportStore.dismissPortraitGate();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:scale-95 px-4 py-2 text-xs font-medium text-neutral-200 border border-neutral-700 transition cursor-pointer"
            >
              <span>Proceed Anyway</span>
              <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

GameViewport.displayName = 'GameViewport';

