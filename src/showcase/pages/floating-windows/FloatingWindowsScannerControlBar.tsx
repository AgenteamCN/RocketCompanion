import React from 'react';
import { ChevronLeft, ChevronRight, User, Terminal } from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import {
  USER_PRESET_WINDOWS,
  type PresetConfig,
  type FloatingWindowVisibilityTier,
} from '../../../ui-core/stores/floatingPresets';
import { DEV_PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import { floatingSandboxStore, useFloatingStore } from '../../../ui-core/stores/floatingStore';
import { FloatingWindowIcon } from '../../../ui-core/navigation/FloatingWindowIcon';
import { FloatingWindowsMinWidthCalibrationBar } from './FloatingWindowsMinWidthCalibrationBar';
import {
  DEV_FLOATING_LINEAR_PLAYLIST,
  USER_FLOATING_LINEAR_PLAYLIST,
  buildFloatingWindowsLinearPlaylist,
  findFloatingPlaylistUnitIndex,
} from './floatingWindowsLinearPlaylists';
import { useFloatingWindowsCalibration } from './useFloatingWindowsCalibration';

export interface FloatingScannerActions {
  setContainerPreset: (next: 'full' | '1080p-compact' | 'small-squeeze') => void;
  setActiveSubTab: (next: string) => void;
  handleSwitchTier: (nextTier: FloatingWindowVisibilityTier) => void;
  handleStepWindow: (delta: number) => void;
  handleSelectPreset: (preset: PresetConfig) => void;
}

export interface FloatingWindowsScannerControlBarProps {
  isLight: boolean;
  tier: FloatingWindowVisibilityTier;
  fwMode: 'inspector' | 'stack' | 'matrix';
  currentIndex: number;
  activeTierWindows: PresetConfig[];
  currentPreset: PresetConfig | undefined;
  containerPreset: 'full' | '1080p-compact' | 'small-squeeze';
  activeSubTab: string;
  actions: FloatingScannerActions;
}

export const FloatingWindowsScannerControlBar: React.FC<
  FloatingWindowsScannerControlBarProps
> = ({
  isLight,
  tier,
  fwMode,
  currentIndex,
  activeTierWindows,
  currentPreset,
  containerPreset,
  activeSubTab,
  actions: {
    setContainerPreset,
    setActiveSubTab,
    handleSwitchTier,
    handleStepWindow,
    handleSelectPreset,
  },
}) => {
  const { windows, opacity, setOpacity } = useFloatingStore(floatingSandboxStore);
  const {
    resolvedEffectiveMinW,
    resolvedAutoMinW,
    resolvedScrollbarReserve,
    resolvedEffectiveMinH,
    resolvedPresetMinH,
    resolvedIntrinsicMaxH,
  } = useFloatingWindowsCalibration(currentPreset);

  const activePlaylist = React.useMemo(
    () => buildFloatingWindowsLinearPlaylist(tier, { presets: activeTierWindows }),
    [tier, activeTierWindows]
  );
  const activePlaylistIdx = React.useMemo(
    () =>
      findFloatingPlaylistUnitIndex(
        activePlaylist,
        currentPreset?.id || '',
        activeSubTab
      ),
    [activePlaylist, currentPreset?.id, activeSubTab]
  );
  const activePlaylistUnit = activePlaylist[activePlaylistIdx] || activePlaylist[0];

  return (
    <div
      className={`p-4 rounded-2xl border flex flex-col gap-3.5 transition-colors ${
        isLight
          ? 'bg-white border-neutral-200 shadow-2xs'
          : 'bg-neutral-900/70 border-neutral-800'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        {/* Strict Tier Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            View isolation (Strict Tier):
          </span>
          <div className="flex items-center gap-1 p-1 rounded-xl border bg-neutral-100/80 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => handleSwitchTier('user')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                tier === 'user'
                  ? 'bg-emerald-500 text-white shadow-2xs'
                  : isLight
                  ? 'text-neutral-600 hover:text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>
                User Only ({USER_PRESET_WINDOWS.length}W · {USER_FLOATING_LINEAR_PLAYLIST.length}U)
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTier('developer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                tier === 'developer'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : isLight
                  ? 'text-neutral-600 hover:text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>
                Developer Only ({DEV_PRESET_WINDOWS.length}W · {DEV_FLOATING_LINEAR_PLAYLIST.length}U)
              </span>
            </button>
          </div>
        </div>

        {/* Linear Prev / Next Flattened Unit Scanner */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleStepWindow(-1)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all active:scale-95 ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Prev Unit</span>
          </button>
          <button
            type="button"
            onClick={() => handleStepWindow(1)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all active:scale-95 ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
            }`}
          >
            <span>Next Unit</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div
            className={`px-3 py-1.5 rounded-xl border font-mono text-xs flex items-center gap-2 ${
              isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
                : 'bg-neutral-950 border-neutral-800 text-neutral-200'
            }`}
          >
            <span className="font-bold text-amber-500">
              [{activePlaylist.length > 0 ? activePlaylistIdx + 1 : currentIndex + 1} /{' '}
              {activePlaylist.length || activeTierWindows.length}]
            </span>
            <span className="font-semibold truncate max-w-[280px]">
              {activePlaylistUnit?.label || currentPreset?.title}
            </span>
          </div>
        </div>
      </div>

      {/* Window Pill Grid for Active Tier */}
      <div className="flex flex-wrap items-center gap-1.5">
        {activeTierWindows.map((preset, idx) => {
          const isSelected = preset.id === currentPreset?.id;
          const isOpen = windows.some(
            (w) => w.id === preset.id || w.id.startsWith(preset.id)
          );
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                  : isLight
                  ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">{idx + 1}.</span>
              <FloatingWindowIcon
                id={preset.id}
                category={preset.category}
                className="h-3.5 w-3.5 shrink-0"
              />
              <span>{preset.title}</span>
              {preset.tabs && preset.tabs.length > 0 && (
                <span className="font-mono text-[10px] opacity-75">
                  ({preset.tabs.length}T)
                </span>
              )}
              {isOpen && !isSelected && fwMode !== 'matrix' && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                  title="Currently Open"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Window Metadata & Sub-Tab Selector + Global Opacity Slider */}
      {currentPreset && fwMode !== 'matrix' && (
        <div
          className={`p-3 rounded-xl border flex flex-col gap-3 text-xs ${
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={tier === 'user' ? 'success' : 'warning'}
                  size="sm"
                  isLight={isLight}
                >
                  {tier === 'user' ? 'USER VISIBLE' : 'DEVELOPER ONLY'}
                </Badge>
                <span className="font-bold text-sm">{currentPreset.title}</span>
                <span className="font-mono text-[11px] opacity-65">
                  (Default {currentPreset.width}×{currentPreset.height}px · Effective MinW{' '}
                  {resolvedEffectiveMinW}px [Auto {resolvedAutoMinW}px
                  {resolvedScrollbarReserve > 0
                    ? `, incl. ${resolvedScrollbarReserve}px scrollbar reserve`
                    : ''}
                  ] · Effective MinH {resolvedEffectiveMinH}px [Preset {resolvedPresetMinH}px · MaxH{' '}
                  {resolvedIntrinsicMaxH}px] ·{' '}
                  {currentPreset.resizable
                    ? 'Auto Intrinsic MaxHeight & 4-Corner Clamped'
                    : 'Auto-Fit Non-Resizable'}
                  )
                </span>
              </div>
              {currentPreset.summary && (
                <span className="text-[11px] opacity-75">{currentPreset.summary}</span>
              )}
              {currentPreset.menuEntryPath && (
                <span className="text-[10px] font-mono text-amber-500">
                  Trigger Path: {currentPreset.menuEntryPath}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono opacity-65 mr-1">
                  Container Boundary/Cross-screen Stress Test:
                </span>
                {(
                  [
                    { id: 'full', label: '1440p Full (100%×700px)' },
                    { id: '1080p-compact', label: '1080p Compact (760×520px)' },
                    { id: 'small-squeeze', label: 'Tight Squeeze (520×380px)' },
                  ] as const
                ).map((mode) => {
                  const active = containerPreset === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setContainerPreset(mode.id)}
                      className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                        active
                          ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                          : isLight
                          ? 'bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              {currentPreset.tabs && currentPreset.tabs.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono opacity-65 mr-1">
                    Internal Sub-tabs:
                  </span>
                  {currentPreset.tabs.map((t) => {
                    const active =
                      (activeSubTab || currentPreset.tabs![0].id) === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveSubTab(t.id)}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                            : isLight
                            ? 'bg-white border-neutral-200 text-neutral-600'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="w-48">
                <SliderControl
                  label="Global Opacity"
                  value={opacity}
                  min={1}
                  max={100}
                  step={1}
                  defaultValue={85}
                  unit="%"
                  onChange={setOpacity}
                  isLight={isLight}
                />
              </div>
            </div>
          </div>
          <FloatingWindowsMinWidthCalibrationBar
            isLight={isLight}
            currentPreset={currentPreset}
          />
        </div>
      )}
    </div>
  );
};
