import React from 'react';
import {
  X,
  Layers,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { Button } from '../../../ui-core/primitives/Button';
import {
  USER_PRESET_WINDOWS,
  type PresetConfig,
  type FloatingWindowVisibilityTier,
} from '../../../ui-core/stores/floatingPresets';
import { DEV_PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import { StageTrackpadScrubResizer } from '../../components/StageTrackpadScrubResizer';

export interface FloatingWindowsBoundaryControls {
  containerPreset: 'full' | '1080p-compact' | 'small-squeeze';
  setContainerPreset: (preset: 'full' | '1080p-compact' | 'small-squeeze') => void;
  boundaryLocked: boolean;
  effectiveBoundaryW: number;
  effectiveBoundaryH: number;
  setManualBoundarySize: (next: { width: number; height: number }) => void;
  handleChangeManualBoundarySize: (next: { width: number; height: number }) => void;
  handleToggleBoundaryLock: () => void;
}

export interface FloatingStageToolbarActions {
  setFwMode: (mode: 'inspector' | 'matrix' | 'stack') => void;
  handleSwitchTier: (tier: FloatingWindowVisibilityTier) => void;
  handleStepWindow: (delta: number) => void;
  clearAll: () => void;
}

export interface FloatingWindowsStageToolbarProps {
  isLight: boolean;
  tier: FloatingWindowVisibilityTier;
  fwMode: 'inspector' | 'matrix' | 'stack';
  currentIndex: number;
  activeTierWindows: PresetConfig[];
  currentPreset: PresetConfig | undefined;
  boundary: FloatingWindowsBoundaryControls;
  totalCount: number;
  actions: FloatingStageToolbarActions;
}

export const FloatingWindowsStageToolbar: React.FC<FloatingWindowsStageToolbarProps> = ({
  isLight,
  tier,
  fwMode,
  currentIndex,
  activeTierWindows,
  currentPreset,
  boundary: {
    containerPreset,
    setContainerPreset,
    boundaryLocked,
    effectiveBoundaryW,
    effectiveBoundaryH,
    handleChangeManualBoundarySize,
    handleToggleBoundaryLock,
  },
  totalCount,
  actions: {
    setFwMode,
    handleSwitchTier,
    handleStepWindow,
    clearAll,
  },
}) => {
  return (
      <div
        className={`flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-2xl border text-xs font-mono ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
            : 'bg-neutral-900/90 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={`inline-flex items-center p-0.5 rounded-lg border ${
              isLight ? 'bg-neutral-100 border-neutral-200' : 'bg-neutral-950 border-neutral-800'
            }`}
          >
            <button
              type="button"
              onClick={() => handleSwitchTier('user')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                tier === 'user'
                  ? 'bg-emerald-500 text-white'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              User ({USER_PRESET_WINDOWS.length})
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTier('developer')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                tier === 'developer'
                  ? 'bg-amber-500 text-neutral-950'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Dev ({DEV_PRESET_WINDOWS.length})
            </button>
          </div>

          {fwMode !== 'matrix' && (
            <>
              <button
                type="button"
                onClick={() => handleStepWindow(-1)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border font-bold cursor-pointer transition-all active:scale-95 ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
                }`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev (←)</span>
              </button>

              <button
                type="button"
                onClick={() => handleStepWindow(1)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border font-bold cursor-pointer transition-all active:scale-95 ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
                }`}
              >
                <span>Next (→)</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold">
                [{currentIndex + 1}/{activeTierWindows.length}] {currentPreset?.title}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {fwMode !== 'matrix' && (
            <StageTrackpadScrubResizer
              isLight={isLight}
              compact={true}
              containerPreset={containerPreset}
              onSelectPreset={setContainerPreset}
              boundaryLocked={boundaryLocked}
              onToggleLock={handleToggleBoundaryLock}
              width={effectiveBoundaryW}
              height={effectiveBoundaryH}
              onChangeSize={handleChangeManualBoundarySize}
            />
          )}

          <div className="flex items-center gap-1 p-1 rounded-xl border bg-neutral-100/80 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-xs font-sans">
            <button
              type="button"
              onClick={() => setFwMode('inspector')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                fwMode === 'inspector'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : isLight
                  ? 'text-neutral-600 hover:text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Direct Inspector</span>
            </button>
            <button
              type="button"
              onClick={() => setFwMode('matrix')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                fwMode === 'matrix'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : isLight
                  ? 'text-neutral-600 hover:text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Flat Matrix Audit Wall</span>
            </button>
            <button
              type="button"
              onClick={() => setFwMode('stack')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                fwMode === 'stack'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : isLight
                  ? 'text-neutral-600 hover:text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Multi-Window Stack</span>
            </button>
          </div>

          {totalCount > 0 && fwMode !== 'matrix' && (
            <Button
              variant="danger"
              size="sm"
              isLight={isLight}
              icon={<X className="h-4 w-4" />}
              onClick={clearAll}
            >
              Clear All Windows ({totalCount})
            </Button>
          )}
        </div>
      </div>
  );
};
