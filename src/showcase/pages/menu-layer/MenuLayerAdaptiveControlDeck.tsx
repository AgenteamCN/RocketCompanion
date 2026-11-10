import React from 'react';
import { StageTrackpadScrubResizer } from '../../components/StageTrackpadScrubResizer';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';
import { MenuLayerInlineNodeTunerDrawer } from './MenuLayerInlineNodeTunerDrawer';

export interface MenuLayerAdaptiveControlDeckProps {
  isLight: boolean;
}

export const MenuLayerAdaptiveControlDeck: React.FC<
  MenuLayerAdaptiveControlDeckProps
> = ({ isLight }) => {
  const {
    currentRoute,
    widthMode,
    setWidthMode,
    isDockState,
    targetW,
    targetH,
    activeRouteSize,
    minWidthDraft,
    setMinWidthDraft,
    setIsEditingMinWidth,
    hasManualMinOverride,
    applyManualMinWidth,
    handleResetAutoMinWidth,
    containerPreset,
    setContainerPreset,
    effectiveStageW = 900,
    effectiveStageH = 620,
    boundaryLocked = false,
    handleToggleBoundaryLock,
    manualBoundarySize,
    handleChangeManualBoundarySize,
  } = useMenuLayerSandbox();
  const displayBoundaryW = Math.round(
    boundaryLocked && manualBoundarySize ? manualBoundarySize.width : effectiveStageW
  );
  const displayBoundaryH = Math.round(
    boundaryLocked && manualBoundarySize ? manualBoundarySize.height : effectiveStageH
  );

  return (
    <>
      <MenuLayerInlineNodeTunerDrawer isLight={isLight} />

      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border text-xs transition-colors ${
          isLight
            ? 'bg-white/90 border-neutral-200/90 text-neutral-700 shadow-2xs'
            : 'bg-neutral-900/90 border-neutral-800 text-neutral-300'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-amber-500">
              6D→7A Adaptive Engine:
            </span>
            <div
              className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                isLight
                  ? 'bg-neutral-100 border-neutral-200'
                  : 'bg-neutral-950 border-neutral-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setWidthMode('design-auto-expand')}
                className={`px-2 py-1 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${
                  widthMode === 'design-auto-expand'
                    ? 'bg-amber-500 text-white font-bold'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
                title="Design width as comfort baseline, Auto-expand if content is wider, Auto-compress if screen is smaller"
              >
                Design Baseline+Auto Expand/Collapse
              </button>
              <button
                type="button"
                onClick={() => setWidthMode('intrinsic-min')}
                className={`px-2 py-1 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${
                  widthMode === 'intrinsic-min'
                    ? 'bg-amber-500 text-white font-bold'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
                title="Like 6D Floating Window: Width fully fitted DOM Detected non-truncated minimum width (+16px Scrollbar Reserved Space)"
              >
                6D Compact adaptive content only
              </button>
            </div>
          </div>

          {currentRoute !== 'layer-0' && !isDockState && (
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <span className="text-neutral-400">Actual Panel:</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                {targetW}×{targetH}px
              </span>
              <span className="text-neutral-400">Total Content Height:</span>
              <span className="font-semibold">{activeRouteSize.intrinsicHeight}px</span>
              <span className="text-neutral-400 ml-1">MinW:</span>
              <button
                type="button"
                onClick={() =>
                  applyManualMinWidth(activeRouteSize.effectiveMinWidth - 1)
                }
                className={`px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
                title="Min Width -1px"
              >
                -1
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={minWidthDraft}
                onFocus={() => setIsEditingMinWidth(true)}
                onChange={(e) => setMinWidthDraft(e.target.value)}
                onBlur={() => {
                  setIsEditingMinWidth(false);
                  const parsed = parseInt(minWidthDraft, 10);
                  if (Number.isFinite(parsed)) {
                    applyManualMinWidth(parsed);
                  } else {
                    setMinWidthDraft(
                      String(Math.round(activeRouteSize.effectiveMinWidth))
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    applyManualMinWidth(
                      activeRouteSize.effectiveMinWidth + (e.shiftKey ? 10 : 1)
                    );
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    applyManualMinWidth(
                      activeRouteSize.effectiveMinWidth - (e.shiftKey ? 10 : 1)
                    );
                  }
                }}
                className={`w-14 px-1.5 py-0.5 text-center rounded border font-mono text-[11px] font-bold ${
                  hasManualMinOverride
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : isLight
                    ? 'border-neutral-300 bg-white text-neutral-800'
                    : 'border-neutral-700 bg-neutral-950 text-neutral-100'
                }`}
                title="Input integer for min width (Enter confirm, Up/Down Arrow Keys ±1px, Shift+Arrow Keys ±10px)"
              />
              <button
                type="button"
                onClick={() =>
                  applyManualMinWidth(activeRouteSize.effectiveMinWidth + 1)
                }
                className={`px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
                title="Min Width +1px"
              >
                +1
              </button>
              <span
                className="text-[10px] text-emerald-600 dark:text-emerald-400"
                title="Automatically Reserved 16px Vertical scrollbar safe slot, Prevent horizontal text compression when vertical scrollbars trigger on small screens"
              >
                [+{activeRouteSize.scrollbarReservePx}px Scrollbar]
              </span>
              {hasManualMinOverride && (
                <button
                  type="button"
                  onClick={handleResetAutoMinWidth}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-200/80 dark:bg-neutral-800 hover:text-amber-500 cursor-pointer"
                  title={`restore DOM Auto-Detected Value (${activeRouteSize.autoMinWidth}px)`}
                >
                  reset Auto({activeRouteSize.autoMinWidth})
                </button>
              )}
              {(activeRouteSize.isWidthSqueezed ||
                activeRouteSize.isHeightSqueezed) && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 font-bold">
                  Canvas auto-compressing (Ideal {activeRouteSize.desiredWidth}×
                  {activeRouteSize.desiredHeight}px)
                </span>
              )}
            </div>
          )}
        </div>

        <StageTrackpadScrubResizer
          isLight={isLight}
          compact={false}
          containerPreset={containerPreset}
          onSelectPreset={setContainerPreset}
          boundaryLocked={boundaryLocked}
          onToggleLock={handleToggleBoundaryLock}
          width={displayBoundaryW}
          height={displayBoundaryH}
          onChangeSize={handleChangeManualBoundarySize}
        />
      </div>
    </>
  );
};
