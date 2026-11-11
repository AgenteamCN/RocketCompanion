import React, { useState, useRef, useEffect } from 'react';
import { useViewportStore, viewportStore } from '../ui-core/stores/viewportStore';
import { useCrossClientSyncStatus } from './stores/crossClientSync';
import { useCrossTabTargetFollow } from './stores/crossTabTargetFollow';
import {
  Sliders,
  Shield,
  Eye,
  EyeOff,
  Radio,
  RotateCcw,
  Copy,
  Check,
  Link2,
  Unlink,
} from 'lucide-react';
import { Badge } from '../ui-core/primitives/Badge';

export interface ViewportControlsProps {
  isLight?: boolean;
}

export const ViewportControls: React.FC<ViewportControlsProps> = ({ isLight = true }) => {
  const { renderScale, safeAreaMargin, showSafeAreaHud, metrics } = useViewportStore();
  const { connected, paused, togglePaused, transport, resetAll, exportParameters } =
    useCrossClientSyncStatus();
  const { activeTarget, isFollowingStage, toggleFollowingStage } = useCrossTabTargetFollow();
  const [showMarginPopover, setShowMarginPopover] = useState(false);
  const [justReset, setJustReset] = useState(false);
  const [justCopiedParams, setJustCopiedParams] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleRestartDefault = () => {
    resetAll();
    setJustReset(true);
    window.setTimeout(() => setJustReset(false), 1200);
  };

  const handleExportCurrentParams = () => {
    const payload = exportParameters();
    const jsonText = JSON.stringify(payload, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonText).catch(() => {});
    }
    setJustCopiedParams(true);
    window.setTimeout(() => setJustCopiedParams(false), 1500);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowMarginPopover(false);
      }
    };
    if (showMarginPopover) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMarginPopover]);

  const presetMargins = [-5, -2.5, 0, 2.5, 5, 7.5, 10];

  return (
    <div className="flex items-center gap-2">

      {/* 1. UI Scaling Slider Control */}
      <div
        className={`hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/80 border-neutral-800'
        }`}
      >
        <Sliders className={`h-3.5 w-3.5 shrink-0 ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`} />
        <span className={`text-[11px] font-mono shrink-0 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Scale
        </span>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={renderScale}
          onChange={(e) => viewportStore.setRenderScale(Number(e.target.value))}
          className="w-16 xl:w-24 h-1.5 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-800 dark:accent-neutral-200"
          title={`Current Device/Window UI Scale: ${renderScale}% (Actual Factor: ${(metrics.scaleFactor * 100).toFixed(0)}% · Effective only for this window, No Cross-Platform Sync)`}
        />
        <button
          type="button"
          onClick={() => viewportStore.setRenderScale(100)}
          className={`font-mono text-[11px] px-1.5 py-0.5 rounded transition-colors cursor-pointer font-bold ${
            isLight
              ? 'bg-neutral-200/70 hover:bg-neutral-300/80 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
          }`}
          title="Click to reset current window zoom to 100%"
        >
          {renderScale}%
        </button>
      </div>

      {/* 2. Safe Area Margin Button with Popover (-5% to +10%) */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowMarginPopover((prev) => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
            showMarginPopover
              ? isLight
                ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs'
                : 'bg-amber-950/50 border-amber-600 text-amber-300'
              : isLight
              ? 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-800 shadow-2xs'
              : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-200'
          }`}
          title="Adjust screen safe area edges Safe Area Margin (-5% ~ +10%)"
        >
          <Shield className={`h-3.5 w-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
          <span className="hidden xl:inline">Safe Area:</span>
          <span className="font-mono font-bold text-amber-500">
            {safeAreaMargin > 0 ? `+${safeAreaMargin}` : safeAreaMargin}%
          </span>
        </button>

        {showMarginPopover && (
          <div
            className={`absolute right-0 top-full mt-2 w-64 p-3.5 rounded-2xl border shadow-xl z-50 flex flex-col gap-3 transition-colors ${
              isLight
                ? 'bg-white border-neutral-200 text-neutral-800'
                : 'bg-neutral-900 border-neutral-800 text-neutral-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-tight">Safe Area Margin</span>
              <Badge size="sm" variant="primary" isLight={isLight}>
                -5% ~ +10%
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-5}
                max={10}
                step={0.5}
                value={safeAreaMargin}
                onChange={(e) => viewportStore.setSafeAreaMargin(Number(e.target.value))}
                className="flex-1 h-1.5 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="font-mono text-xs font-bold text-emerald-500 w-9 text-right">
                {safeAreaMargin > 0 ? `+${safeAreaMargin}` : safeAreaMargin}%
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {presetMargins.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => viewportStore.setSafeAreaMargin(p)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-colors cursor-pointer border ${
                    safeAreaMargin === p
                      ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                      : isLight
                      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {p > 0 ? `+${p}` : p}%
                </button>
              ))}
            </div>

            <p className={`text-[10px] leading-relaxed ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Width-based percentage offset matching Rocket Companion fullscreen safe area rules.
            </p>
          </div>
        )}
      </div>

      {/* 3. Safe Area HUD Overlay Toggle */}
      <button
        type="button"
        onClick={() => viewportStore.setShowSafeAreaHud(!showSafeAreaHud)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
          showSafeAreaHud
            ? isLight
              ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
              : 'bg-emerald-950/50 border-emerald-600 text-emerald-300'
            : isLight
            ? 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-700 shadow-2xs'
            : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
        }`}
        title="On/Off Safe Area & 18:9 Viewport guides and telemetry bar"
      >
        {showSafeAreaHud ? (
          <Eye className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 text-neutral-400" />
        )}
        <span className="hidden sm:inline">HUD</span>
      </button>

      {/* 4. Unified Cross-Window Sync & Target Follow Pill */}
      <div
        className={`inline-flex items-center rounded-xl border overflow-hidden text-xs font-mono ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/80 border-neutral-800'
        }`}
      >
        <button
          type="button"
          onClick={toggleFollowingStage}
          data-ui-action="toggle-follow-stage"
          className={`flex items-center gap-1 px-2 py-1.5 border-r transition-colors cursor-pointer ${
            isFollowingStage
              ? isLight
                ? 'bg-sky-50/90 hover:bg-sky-100/80 border-neutral-200 text-sky-700 font-semibold'
                : 'bg-sky-950/60 hover:bg-sky-900/60 border-neutral-800 text-sky-300 font-semibold'
              : isLight
              ? 'hover:bg-neutral-50 border-neutral-200 text-neutral-400'
              : 'hover:bg-neutral-800 border-neutral-800 text-neutral-500'
          }`}
          title={
            isFollowingStage
              ? `Following Stage Active Target (${activeTarget.label} -> ${activeTarget.targetId}) · Click to unlink`
              : 'Unlinked from Stage Target Follow · Click to follow active stage target across tabs'
          }
        >
          {isFollowingStage ? (
            <Link2 className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          ) : (
            <Unlink className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="hidden xl:inline">
            {isFollowingStage ? 'Follow' : 'Unlinked'}
          </span>
        </button>

        <button
          type="button"
          onClick={togglePaused}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 font-medium transition-colors cursor-pointer ${
            !paused && connected
              ? isLight
                ? 'hover:bg-neutral-100 text-neutral-900'
                : 'hover:bg-neutral-800 text-neutral-100'
              : isLight
              ? 'hover:bg-neutral-50 text-neutral-400'
              : 'hover:bg-neutral-800 text-neutral-500'
          }`}
          title={
            paused
              ? 'Cross-screen parameter sync paused for current window (Click to restore real-time sync)'
              : `Real-time parameter & target sync enabled (${transport}) · Click to pause`
          }
        >
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              !paused && connected
                ? 'bg-emerald-500 animate-pulse'
                : paused
                ? 'bg-amber-500'
                : 'bg-neutral-400'
            }`}
          />
          <Radio className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="hidden md:inline">{paused ? 'Sync Off' : 'Sync'}</span>
        </button>
      </div>

      {/* 5. Export Current Layer Parameters (Copy JSON) */}
      <button
        type="button"
        onClick={handleExportCurrentParams}
        data-ui-action="export-layer-params"
        className={`h-8 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-mono font-medium transition-all cursor-pointer active:scale-95 ${
          justCopiedParams
            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-500'
            : isLight
            ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700 shadow-2xs'
            : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-200'
        }`}
        title="Export/Copy all adjustable parameters and states of the current page (Copy Current Layer Params JSON)"
      >
        {justCopiedParams ? (
          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 opacity-80" />
        )}
        <span className="hidden xl:inline">{justCopiedParams ? 'Copied' : 'Export'}</span>
      </button>

      {/* 6. Square Icon-Only Restart Default Button */}
      <button
        type="button"
        onClick={handleRestartDefault}
        data-ui-action="restart-default"
        aria-label="Restart Default"
        title="Restart Default · Reset all layer parameters and multi-device sync cache to initial defaults"
        className={`h-8 w-8 rounded-xl border flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-95 ${
          justReset
            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-500'
            : isLight
            ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700 shadow-2xs'
            : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-200'
        }`}
      >
        <RotateCcw className={`h-3.5 w-3.5 transition-transform duration-300 ${justReset ? '-rotate-180 text-emerald-500' : ''}`} />
      </button>
    </div>
  );
};
