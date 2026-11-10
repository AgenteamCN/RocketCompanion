import React from 'react';
import { useViewportStore, viewportStore } from '../stores/viewportStore';
import { EyeOff } from 'lucide-react';

export interface SafeAreaHudProps {
  isLight?: boolean;
}

export const SafeAreaHud: React.FC<SafeAreaHudProps> = React.memo(({ isLight = false }) => {
  const { showSafeAreaHud, safeAreaMargin, metrics, renderScale } = useViewportStore();

  if (!showSafeAreaHud) return null;

  return (
    <div
      data-alpha-id="Alpha:SafeAreaHud"
      data-ui-element="viewport-safe-area-hud"
      className="pointer-events-none fixed inset-0 z-[600] overflow-hidden font-mono text-[11px] select-none"
    >
      {/* Outer bounding safe area dashed outline */}
      <div
        className={`absolute border border-dashed transition-all duration-150 ${
          isLight ? 'border-amber-500/60' : 'border-amber-400/50'
        }`}
        style={{
          top: `${safeAreaMargin}%`,
          bottom: `${safeAreaMargin}%`,
          left: `${safeAreaMargin}%`,
          right: `${safeAreaMargin}%`,
        }}
      />

      {/* Render zone inner solid outline (Clamped to 18:9) */}
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border transition-all duration-150 ${
          isLight ? 'border-emerald-600/70 bg-emerald-500/5' : 'border-emerald-400/60 bg-emerald-500/5'
        }`}
        style={{
          width: `${metrics.renderWidth}px`,
          height: `${metrics.renderHeight}px`,
        }}
      >
        <div
          className={`absolute top-2 left-2 flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] backdrop-blur border shadow-xs ${
            isLight
              ? 'bg-white/95 text-emerald-700 border-emerald-300'
              : 'bg-neutral-950/90 text-emerald-400 border-emerald-500/40'
          }`}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>18:9 Active Canvas ({Math.round(metrics.renderWidth)} × {Math.round(metrics.renderHeight)})</span>
        </div>
      </div>

      {/* Top Telemetry Strip */}
      <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full px-4 py-1.5 backdrop-blur-md border shadow-lg transition-colors">
        <div
          className={`flex items-center gap-3 text-xs ${
            isLight
              ? 'bg-white/95 border border-neutral-300 text-neutral-800 shadow-md rounded-full px-4 py-1'
              : 'bg-neutral-900/95 border border-neutral-700 text-neutral-200 shadow-md rounded-full px-4 py-1'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              const presets = [-5, 0, 5, 10];
              const nextIndex = (presets.indexOf(safeAreaMargin) + 1) % presets.length;
              viewportStore.setSafeAreaMargin(presets[nextIndex]);
            }}
            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-left"
            title="Click to cycle Safe Margin (-5% / 0% / 5% / 10%)"
          >
            Safe Margin:{' '}
            <strong className={safeAreaMargin < 0 ? 'text-amber-500 font-bold' : isLight ? 'text-neutral-900 font-bold' : 'text-white font-bold'}>
              {safeAreaMargin > 0 ? `+${safeAreaMargin}` : safeAreaMargin}%
            </strong>
          </button>
          <span className="text-neutral-400">|</span>
          <span className="text-neutral-500">
            Scale:{' '}
            <strong className="text-amber-500 font-bold">
              {(metrics.scaleFactor * 100).toFixed(0)}% (x{renderScale}%)
            </strong>
          </span>
          <span className="text-neutral-400">|</span>
          <span className="text-neutral-500">
            Pillarbox:{' '}
            <strong className="text-amber-500 font-bold">
              {Math.round(metrics.pillarboxWidth)}px
            </strong>
          </span>
          <button
            type="button"
            onClick={() => viewportStore.setShowSafeAreaHud(false)}
            className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors cursor-pointer"
            title="Close HUD"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});

SafeAreaHud.displayName = 'SafeAreaHud';
