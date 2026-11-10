import React from 'react';
import { Crosshair } from 'lucide-react';
import {
  getDemolishLiveAnchors,
  resolveDemolishSimTargetUu,
  setDemolishShockwaveConfig,
  triggerDemolishShockwaveSim,
  type DemolishShockwaveConfig,
  type DemolishShockwaveSimState,
  type DemolishSimAnchorMode,
} from '../../../config/demolishShockwaveConfig';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface DemolishShockwaveArenaCoordCardProps {
  config: DemolishShockwaveConfig;
  sim: DemolishShockwaveSimState;
  isLight: boolean;
}

const COORD_PRESETS: ReadonlyArray<{
  label: string;
  x: number;
  y: number;
  z: number;
}> = [
  { label: 'Center (0, 0, 45)', x: 0, y: 0, z: 45 },
  { label: 'Kickoff (0, -1500, 45)', x: 0, y: -1500, z: 45 },
  { label: 'Blue Box (0, -4200, 60)', x: 0, y: -4200, z: 60 },
  { label: 'Orange Box (0, 4200, 60)', x: 0, y: 4200, z: 60 },
  { label: 'Aerial Mid (0, 0, 450)', x: 0, y: 0, z: 450 },
];

const ANCHOR_OPTIONS: ReadonlyArray<{
  id: DemolishSimAnchorMode;
  label: string;
}> = [
  { id: 'in-front-car', label: 'In Front of Car' },
  { id: 'local-car', label: 'At Local Car' },
  { id: 'ball', label: 'At Ball' },
  { id: 'custom-xyz', label: 'Custom XYZ' },
];

export const DemolishShockwaveArenaCoordCard: React.FC<
  DemolishShockwaveArenaCoordCardProps
> = ({ config, sim, isLight }) => {
  const resolvedUu = resolveDemolishSimTargetUu(config);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const inputCls = isLight
    ? 'bg-white border-neutral-300 text-neutral-900'
    : 'bg-neutral-950 border-neutral-700 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const handleSnapFromCar = () => {
    const a = getDemolishLiveAnchors();
    setDemolishShockwaveConfig({
      simAnchorMode: 'custom-xyz',
      simX: Math.round(a.carX),
      simY: Math.round(a.carY),
      simZ: Math.max(17, Math.round(a.carZ)),
    });
    triggerDemolishShockwaveSim();
  };

  const handleSnapFromBall = () => {
    const a = getDemolishLiveAnchors();
    setDemolishShockwaveConfig({
      simAnchorMode: 'custom-xyz',
      simX: Math.round(a.ballX),
      simY: Math.round(a.ballY),
      simZ: Math.max(40, Math.round(a.ballZ)),
    });
    triggerDemolishShockwaveSim();
  };

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Crosshair className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span className="font-semibold text-[11px]">
            3D Arena Coordinate Simulation (UU)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSnapFromCar}
            className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-[10px] font-medium cursor-pointer"
          >
            Snap Car XYZ
          </button>
          <button
            type="button"
            onClick={handleSnapFromBall}
            className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[10px] font-medium cursor-pointer"
          >
            Snap Ball XYZ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {ANCHOR_OPTIONS.map((opt) => {
          const active = config.simAnchorMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setDemolishShockwaveConfig({ simAnchorMode: opt.id });
                triggerDemolishShockwaveSim();
              }}
              className={`py-1 px-1.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                active
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : 'border-neutral-700/60 text-neutral-400 hover:bg-neutral-800/50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <label className="flex flex-col gap-0.5">
          <span className={`text-[10px] ${mutedText}`}>
            X (Side -4096..4096)
          </span>
          <input
            type="number"
            step={50}
            value={
              config.simAnchorMode === 'custom-xyz' ? config.simX : resolvedUu.x
            }
            onChange={(e) =>
              setDemolishShockwaveConfig({
                simAnchorMode: 'custom-xyz',
                simX: Math.max(
                  -4096,
                  Math.min(4096, Number(e.target.value) || 0)
                ),
              })
            }
            className={`w-full px-1.5 py-1 rounded border font-mono text-[11px] ${inputCls}`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={`text-[10px] ${mutedText}`}>
            Y (Depth -5120..5120)
          </span>
          <input
            type="number"
            step={50}
            value={
              config.simAnchorMode === 'custom-xyz' ? config.simY : resolvedUu.y
            }
            onChange={(e) =>
              setDemolishShockwaveConfig({
                simAnchorMode: 'custom-xyz',
                simY: Math.max(
                  -5120,
                  Math.min(5120, Number(e.target.value) || 0)
                ),
              })
            }
            className={`w-full px-1.5 py-1 rounded border font-mono text-[11px] ${inputCls}`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className={`text-[10px] ${mutedText}`}>
            Z (Height 0..2044)
          </span>
          <input
            type="number"
            step={15}
            value={
              config.simAnchorMode === 'custom-xyz' ? config.simZ : resolvedUu.z
            }
            onChange={(e) =>
              setDemolishShockwaveConfig({
                simAnchorMode: 'custom-xyz',
                simZ: Math.max(0, Math.min(2044, Number(e.target.value) || 0)),
              })
            }
            className={`w-full px-1.5 py-1 rounded border font-mono text-[11px] ${inputCls}`}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1">
        {COORD_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              triggerDemolishShockwaveSim({
                x: preset.x,
                y: preset.y,
                z: preset.z,
              })
            }
            className="px-1.5 py-0.5 rounded border border-neutral-700/70 hover:border-amber-500/50 hover:text-amber-300 text-[10px] font-mono transition-colors cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-neutral-800/80">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px]">Auto-Loop</span>
          <ToggleSwitch
            checked={config.simAutoLoop}
            onChange={(val) => {
              setDemolishShockwaveConfig({ simAutoLoop: val });
              if (val && !sim.isPlaying) {
                triggerDemolishShockwaveSim();
              }
            }}
            isLight={isLight}
          />
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px]">3D Reticle</span>
          <ToggleSwitch
            checked={config.simShowReticle}
            onChange={(val) =>
              setDemolishShockwaveConfig({ simShowReticle: val })
            }
            isLight={isLight}
          />
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px]">Hide Car</span>
          <ToggleSwitch
            checked={config.simHideTargetCar}
            onChange={(val) =>
              setDemolishShockwaveConfig({ simHideTargetCar: val })
            }
            isLight={isLight}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/80 text-[10px]">
        <span className={mutedText}>
          Auto-Loop Delay (0..5s)
          {sim.loopDelayRemainingSec > 0
            ? ` [Wait ${sim.loopDelayRemainingSec.toFixed(1)}s]`
            : ':'}
        </span>
        <div className="flex items-center gap-1.5 flex-1 max-w-[210px]">
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={config.simLoopDelaySec}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setDemolishShockwaveConfig({
                simLoopDelaySec: Number.isFinite(val)
                  ? Math.max(0, Math.min(5, val))
                  : 0,
              });
            }}
            className="flex-1 accent-amber-500 cursor-pointer"
          />
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={config.simLoopDelaySec}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setDemolishShockwaveConfig({
                simLoopDelaySec: Number.isFinite(val)
                  ? Math.max(0, Math.min(5, val))
                  : 0,
              });
            }}
            className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
          />
          <span className={`font-mono ${mutedText}`}>s</span>
        </div>
      </div>
    </div>
  );
};
