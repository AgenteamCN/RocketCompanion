import React from 'react';
import { Plus, Minus, Copy, RotateCcw } from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import type { PresetConfig } from '../../../ui-core/stores/floatingPresets';
import { useFloatingWindowsCalibration } from './useFloatingWindowsCalibration';

export interface FloatingWindowsMinWidthCalibrationBarProps {
  isLight: boolean;
  currentPreset: PresetConfig;
}

export const FloatingWindowsMinWidthCalibrationBar: React.FC<
  FloatingWindowsMinWidthCalibrationBarProps
> = ({ isLight, currentPreset }) => {
  const {
    activeWindowInstance,
    resolvedAutoMinW,
    resolvedScrollbarReserve,
    activeManualMinW,
    resolvedEffectiveMinW,
    resolvedPresetMinH,
    activeManualMinH,
    resolvedEffectiveMinH,
    resolvedIntrinsicMaxH,
    minWidthDraft,
    setMinWidthDraft,
    setIsEditingMinWidth,
    minHeightDraft,
    setMinHeightDraft,
    setIsEditingMinHeight,
    applyManualMinWidth,
    handleResetAutoMinWidth,
    handleSnapToMinWidth,
    applyManualMinHeight,
    handleResetPresetMinHeight,
    handleSnapToMinHeight,
    handleCopyCalibratedParams,
  } = useFloatingWindowsCalibration(currentPreset);

  const stepBtnClass = `flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[11px] font-mono font-bold cursor-pointer transition-colors active:scale-95 ${
    isLight
      ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-100'
  }`;
  const actionBtnClass = `px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
    isLight
      ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
  }`;
  const restoreBtnClass = `flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
    isLight
      ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
      : 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-700/60 text-amber-300'
  }`;
  const inputWrapClass = `flex items-center rounded-lg border px-2 py-0.5 ${
    isLight
      ? 'bg-white border-neutral-300 text-neutral-900'
      : 'bg-neutral-900 border-neutral-700 text-neutral-100'
  }`;

  return (
    <div
      className={`pt-2.5 border-t flex flex-col gap-2.5 ${
        isLight ? 'border-neutral-200/80' : 'border-neutral-800/80'
      }`}
    >
      {/* Row 1: Min Width Calibration */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold">
            Min Width Calibration (MinWidth · 1px Integer Step):
          </span>
          <Badge
            variant={activeManualMinW !== undefined ? 'warning' : 'info'}
            size="sm"
            isLight={isLight}
          >
            {activeManualMinW !== undefined
              ? `MANUAL ${activeManualMinW}px`
              : `AUTO-DETECT ${resolvedAutoMinW}px`}
          </Badge>
          {resolvedScrollbarReserve > 0 && (
            <span className="text-[10px] font-mono opacity-70">
              [Default reserved right scrollbar +{resolvedScrollbarReserve}px]
            </span>
          )}
          {activeWindowInstance && (
            <span className="text-[10px] font-mono text-sky-400">
              Current Window Size: {Math.round(activeWindowInstance.width ?? 0)}×
              {Math.round(activeWindowInstance.height ?? 0)}px
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            title="Decrease MinWidth 1px (Base Unit -1px)"
            onClick={() => applyManualMinWidth(resolvedEffectiveMinW - 1)}
            className={stepBtnClass}
          >
            <Minus className="h-3 w-3" />
            <span>1px</span>
          </button>

          <div className={inputWrapClass}>
            <input
              type="number"
              step={1}
              min={240}
              max={960}
              aria-label="Manual MinWidth in standard 1px integers"
              value={minWidthDraft}
              onFocus={() => setIsEditingMinWidth(true)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setMinWidthDraft(raw);
              }}
              onBlur={() => {
                setIsEditingMinWidth(false);
                const parsed = parseInt(minWidthDraft, 10);
                if (!Number.isNaN(parsed)) {
                  applyManualMinWidth(parsed);
                } else {
                  setMinWidthDraft(String(resolvedEffectiveMinW));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parsed = parseInt(minWidthDraft, 10);
                  if (!Number.isNaN(parsed)) {
                    applyManualMinWidth(parsed);
                  }
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  applyManualMinWidth(resolvedEffectiveMinW + 1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  applyManualMinWidth(resolvedEffectiveMinW - 1);
                }
              }}
              className="w-14 bg-transparent text-center font-mono text-xs font-bold focus:outline-none"
            />
            <span className="text-[10px] font-mono opacity-60 select-none">px</span>
          </div>

          <button
            type="button"
            title="Increase MinWidth 1px (Base Unit +1px)"
            onClick={() => applyManualMinWidth(resolvedEffectiveMinW + 1)}
            className={stepBtnClass}
          >
            <Plus className="h-3 w-3" />
            <span>1px</span>
          </button>

          <button
            type="button"
            onClick={() => handleSnapToMinWidth(false)}
            className={actionBtnClass}
          >
            Collapse to Min Width ({resolvedEffectiveMinW}px)
          </button>

          {currentPreset.resizable && (
            <button
              type="button"
              onClick={() => handleSnapToMinWidth(true)}
              className={actionBtnClass}
            >
              Min Width+Min Height ({resolvedEffectiveMinW}×{resolvedEffectiveMinH}px)
            </button>
          )}

          {activeManualMinW !== undefined && (
            <button
              type="button"
              onClick={handleResetAutoMinWidth}
              className={restoreBtnClass}
            >
              <RotateCcw className="h-3 w-3" />
              <span>Restore Auto ({resolvedAutoMinW}px)</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyCalibratedParams}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
              isLight
                ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                : 'bg-sky-950/50 hover:bg-sky-900/60 border-sky-700/60 text-sky-300'
            }`}
          >
            <Copy className="h-3 w-3" />
            <span>Copy Calibration Parameters</span>
          </button>
        </div>
      </div>

      {/* Row 2: Min Height Calibration */}
      <div
        className={`pt-2 border-t border-dashed flex flex-wrap items-center justify-between gap-2.5 ${
          isLight ? 'border-neutral-200/80' : 'border-neutral-800/80'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold">
            Min Height Calibration (Explicit Per-Window MinHeight · Manual 1px / 10px Step):
          </span>
          <Badge
            variant={activeManualMinH !== undefined ? 'warning' : 'success'}
            size="sm"
            isLight={isLight}
          >
            {activeManualMinH !== undefined
              ? `MANUAL ${activeManualMinH}px`
              : `EXPLICIT PRESET ${resolvedPresetMinH}px`}
          </Badge>
          <span className="text-[10px] font-mono opacity-70">
            [MaxHeight (Full Content): {resolvedIntrinsicMaxH}px ·{' '}
            {currentPreset.resizable ? 'Vertical Resize Range' : 'Auto-Fit Non-Resizable'}]
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            title="Decrease MinHeight 10px (-10px)"
            onClick={() => applyManualMinHeight(resolvedEffectiveMinH - 10)}
            className={stepBtnClass}
          >
            <Minus className="h-3 w-3" />
            <span>10px</span>
          </button>

          <button
            type="button"
            title="Decrease MinHeight 1px (-1px)"
            onClick={() => applyManualMinHeight(resolvedEffectiveMinH - 1)}
            className={stepBtnClass}
          >
            <Minus className="h-3 w-3" />
            <span>1px</span>
          </button>

          <div className={inputWrapClass}>
            <input
              type="number"
              step={1}
              min={100}
              max={Math.max(110, resolvedIntrinsicMaxH)}
              aria-label="Manual MinHeight in standard 1px integers"
              value={minHeightDraft}
              onFocus={() => setIsEditingMinHeight(true)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setMinHeightDraft(raw);
              }}
              onBlur={() => {
                setIsEditingMinHeight(false);
                const parsed = parseInt(minHeightDraft, 10);
                if (!Number.isNaN(parsed)) {
                  applyManualMinHeight(parsed);
                } else {
                  setMinHeightDraft(String(resolvedEffectiveMinH));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const parsed = parseInt(minHeightDraft, 10);
                  if (!Number.isNaN(parsed)) {
                    applyManualMinHeight(parsed);
                  }
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  applyManualMinHeight(resolvedEffectiveMinH + (e.shiftKey ? 10 : 1));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  applyManualMinHeight(resolvedEffectiveMinH - (e.shiftKey ? 10 : 1));
                }
              }}
              className="w-14 bg-transparent text-center font-mono text-xs font-bold focus:outline-none"
            />
            <span className="text-[10px] font-mono opacity-60 select-none">px</span>
          </div>

          <button
            type="button"
            title="Increase MinHeight 1px (+1px)"
            onClick={() => applyManualMinHeight(resolvedEffectiveMinH + 1)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[11px] font-mono font-bold cursor-pointer transition-colors active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-100'
            }`}
          >
            <Plus className="h-3 w-3" />
            <span>1px</span>
          </button>

          <button
            type="button"
            title="Increase MinHeight 10px (+10px)"
            onClick={() => applyManualMinHeight(resolvedEffectiveMinH + 10)}
            className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[11px] font-mono font-bold cursor-pointer transition-colors active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-100'
            }`}
          >
            <Plus className="h-3 w-3" />
            <span>10px</span>
          </button>

          <button
            type="button"
            onClick={() => handleSnapToMinHeight(true)}
            className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
          >
            Collapse to Min Height ({resolvedEffectiveMinH}px)
          </button>

          {currentPreset.resizable && (
            <button
              type="button"
              onClick={() => handleSnapToMinHeight(false)}
              className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
              }`}
            >
              Expand to Full MaxHeight ({resolvedIntrinsicMaxH}px)
            </button>
          )}

          {activeManualMinH !== undefined && (
            <button
              type="button"
              onClick={handleResetPresetMinHeight}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-700/60 text-amber-300'
              }`}
            >
              <RotateCcw className="h-3 w-3" />
              <span>Restore Preset ({resolvedPresetMinH}px)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
