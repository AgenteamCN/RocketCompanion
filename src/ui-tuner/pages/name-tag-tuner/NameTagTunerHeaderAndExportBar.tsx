import React from 'react';
import { RotateCcw, Shuffle, Eye, Activity } from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import type { ArenaLightingPreset } from '../../ArenaBackdrop';
import { TunerConfigExporterBar } from '../../components/tuner/TunerConfigExporterBar';
import type { KickoffCarSpawn } from './nameTagArenaProjectionMath';
import type { NameTagSlotLayoutMode } from './useNameTagSyncedState';

const ARENA_PRESETS: ArenaLightingPreset[] = ['night', 'twilight', 'daylight', 'flow'];

export interface NameTagStageControlsBag {
  animateBoostWave: boolean;
  setAnimateBoostWave: React.Dispatch<React.SetStateAction<boolean>>;
  ballHeightOffset: number;
  setBallHeightOffset: (val: number) => void;
  cameraFovDeg: number;
  setCameraFovDeg: (val: number) => void;
  stageHeight: number;
  setStageHeight: (val: number) => void;
  arenaPreset: ArenaLightingPreset;
  setArenaPreset: (preset: ArenaLightingPreset) => void;
  resetStageControls: () => void;
}

export interface NameTagStageHeaderAndDeckProps {
  isLight: boolean;
  comboIndex: number;
  slotSummary: string;
  cars: KickoffCarSpawn[];
  effectiveFocusedCarIndex: number | null;
  focusFreeCamOverview: () => void;
  selectPovCar: (carIndex: number) => void;
  reshuffleKickoffPositions: () => void;
  stageControls: NameTagStageControlsBag;
}

export const NameTagStageHeaderAndDeck: React.FC<NameTagStageHeaderAndDeckProps> = React.memo(
  ({
    isLight,
    comboIndex,
    slotSummary,
    cars,
    effectiveFocusedCarIndex,
    focusFreeCamOverview,
    selectPovCar,
    reshuffleKickoffPositions,
    stageControls,
  }) => {
    const {
      animateBoostWave,
      setAnimateBoostWave,
      ballHeightOffset,
      setBallHeightOffset,
      cameraFovDeg,
      setCameraFovDeg,
      stageHeight,
      setStageHeight,
      arenaPreset,
      setArenaPreset,
      resetStageControls,
    } = stageControls;

    const btnIdleCls = isLight
      ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100'
      : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800';

    return (
      <>
        <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="amber" size="sm" isLight={isLight}>
              5H.0
            </Badge>
            <h2 className="text-base font-bold tracking-tight">
              6-Car Kickoff Arena Stage · Formation #{comboIndex + 1} ({slotSummary})
            </h2>
            <Badge variant="success" size="sm" isLight={isLight}>
              Multi-Window Synced
            </Badge>
          </div>

          <button
            type="button"
            onClick={resetStageControls}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono cursor-pointer transition-colors ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800/80 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Stage View</span>
          </button>
        </div>

        <div
          className={`p-3.5 rounded-2xl border flex flex-col gap-3.5 ${
            isLight
              ? 'bg-neutral-50/90 border-neutral-200/90'
              : 'bg-neutral-950/70 border-neutral-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-teal-500 flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                <span>Camera POV (Keys 0–6):</span>
              </span>

              <button
                type="button"
                onClick={focusFreeCamOverview}
                className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors ${
                  effectiveFocusedCarIndex === null
                    ? 'bg-teal-500/20 border-teal-400 text-teal-400'
                    : btnIdleCls
                }`}
              >
                [0] FreeCam
              </button>

              {cars.map((car) => {
                const isSelected = effectiveFocusedCarIndex === car.carIndex;
                const activeCls =
                  car.team === 0
                    ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                    : 'bg-orange-500/20 border-orange-400 text-orange-400';
                return (
                  <button
                    key={car.carIndex}
                    type="button"
                    onClick={() => selectPovCar(car.carIndex)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors ${
                      isSelected ? activeCls : btnIdleCls
                    }`}
                  >
                    [{car.carIndex + 1}] {car.slotCode}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={reshuffleKickoffPositions}
                title={`Active Slots: ${slotSummary}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors ${btnIdleCls}`}
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Reshuffle Kickoff</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAnimateBoostWave((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors ${
                animateBoostWave
                  ? 'bg-teal-500/20 border-teal-400 text-teal-400'
                  : btnIdleCls
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>{animateBoostWave ? 'Boost Wave: LIVE' : 'Boost Wave: Static'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2.5 border-t border-neutral-200/70 dark:border-neutral-800/80 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono opacity-75">Ball Z-Offset</span>
                <input
                  type="range"
                  min={-25}
                  max={140}
                  value={ballHeightOffset}
                  onChange={(e) => setBallHeightOffset(Number(e.target.value))}
                  className="w-24 accent-teal-400 cursor-pointer"
                />
                <span className="font-mono font-bold w-12">{ballHeightOffset} UU</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono opacity-75">Cam FOV</span>
                <input
                  type="range"
                  min={70}
                  max={125}
                  value={cameraFovDeg}
                  onChange={(e) => setCameraFovDeg(Number(e.target.value))}
                  className="w-24 accent-teal-400 cursor-pointer"
                />
                <span className="font-mono font-bold w-12">{cameraFovDeg} deg</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono opacity-75">Stage H</span>
                <input
                  type="range"
                  min={240}
                  max={480}
                  value={stageHeight}
                  onChange={(e) => setStageHeight(Number(e.target.value))}
                  className="w-24 accent-teal-400 cursor-pointer"
                />
                <span className="font-mono font-bold w-12">{stageHeight}px</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-mono opacity-75 mr-1">Backdrop:</span>
              {ARENA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setArenaPreset(preset)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold uppercase cursor-pointer transition-colors ${
                    arenaPreset === preset
                      ? 'bg-teal-500/20 border-teal-400 text-teal-400'
                      : btnIdleCls
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }
);

NameTagStageHeaderAndDeck.displayName = 'NameTagStageHeaderAndDeck';

export interface NameTagTunerExportAndSlotHeaderProps {
  isLight: boolean;
  build5HExportCode: () => string;
  handleReset5HDefaults: () => void;
  customNameOverride: string;
  setCustomNameOverride: (val: string) => void;
  slotLayoutMode: NameTagSlotLayoutMode;
  setSlotLayoutMode: (mode: NameTagSlotLayoutMode) => void;
  children: React.ReactNode;
}

export const NameTagTunerHeaderAndExportBar: React.FC<NameTagTunerExportAndSlotHeaderProps> =
  React.memo(
    ({
      isLight,
      build5HExportCode,
      handleReset5HDefaults,
      customNameOverride,
      setCustomNameOverride,
      slotLayoutMode,
      setSlotLayoutMode,
      children,
    }) => {
      const modeIdleCls = isLight
        ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
        : 'bg-neutral-900 border-neutral-700 text-neutral-400';

      return (
        <>
          <TunerConfigExporterBar
            badge="5H-EXPORT"
            title="Name Tag & Boost Parameter Tuner & One-Click Config Exporter"
            subtitle="Exports only 5H NameTagConfig (Boost fill/unfilled opacity, pure black boost colors, 100% solid ball occlusion & pill geometry)"
            copyLabel="Copy 5H Name Tag Config (Export Snapshot)"
            codeTitle="Current 5H Name Tag Parameter Snapshot (Paste directly into DEFAULT_NAME_TAG_CONFIG)"
            actionId="export-5h-config"
            isLight={isLight}
            buildExportCode={build5HExportCode}
            onResetDefaults={handleReset5HDefaults}
          />

          <section
            id="sec-nametag-shared-slot"
            className={`rounded-2xl border p-6 flex flex-col gap-4 scroll-mt-24 ${
              isLight
                ? 'bg-white border-neutral-200/90 shadow-xs'
                : 'bg-neutral-900/75 border-neutral-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-500/20 pb-3">
              <div>
                <div className="text-xs font-mono font-bold text-teal-500">
                  5H.2 · DIRECT COMPONENT SLOT REUSE
                </div>
                <h2 className="text-base font-bold">
                  Shared NameTagTunerFloatingWindow Control Slot (Zero Code Duplication)
                </h2>
                <p className="text-xs opacity-70">
                  Mounts{' '}
                  <code className="font-mono">
                    src/ui-core/panels/dev/NameTagTunerFloatingWindow.tsx
                  </code>{' '}
                  directly. Any adjustment updates both this standalone workbench and the 6D floating
                  window in real time across all open tabs.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Custom name override..."
                  value={customNameOverride}
                  onChange={(e) => setCustomNameOverride(e.target.value)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono outline-none w-44 ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-800 focus:border-teal-500'
                      : 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-teal-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setSlotLayoutMode('grid')}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors ${
                    slotLayoutMode === 'grid'
                      ? 'bg-teal-500/20 border-teal-500 text-teal-500'
                      : modeIdleCls
                  }`}
                >
                  2-Column Workbench
                </button>
                <button
                  type="button"
                  onClick={() => setSlotLayoutMode('floating-width')}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold cursor-pointer transition-colors ${
                    slotLayoutMode === 'floating-width'
                      ? 'bg-teal-500/20 border-teal-500 text-teal-500'
                      : modeIdleCls
                  }`}
                >
                  480px Floating Slot Width
                </button>
              </div>
            </div>

            <div
              style={{
                maxWidth: slotLayoutMode === 'floating-width' ? 480 : '100%',
                margin: slotLayoutMode === 'floating-width' ? '0 auto' : undefined,
                padding: slotLayoutMode === 'floating-width' ? 14 : 4,
                borderRadius: 12,
                border:
                  slotLayoutMode === 'floating-width'
                    ? '1px dashed rgba(20, 184, 166, 0.45)'
                    : 'none',
                transition: 'max-width 180ms ease',
              }}
            >
              {children}
            </div>
          </section>
        </>
      );
    }
  );

NameTagTunerHeaderAndExportBar.displayName = 'NameTagTunerHeaderAndExportBar';
