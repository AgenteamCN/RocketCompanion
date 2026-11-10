import React from 'react';
import { Eye, Compass, Crosshair, Radio } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import type {
  SpatialAudioAnchorMode,
  SpatialAudioEmitterTarget,
  SpatialAudioListenerTarget,
  SpatialAudioVisualizerConfig,
  SpatialAudioVisualizerTelemetry,
} from '../../../config/spatialAudioVisualizerConfig';

export interface SpatialAudio3dGizmoControlCardProps {
  isLight: boolean;
  vizConfig: SpatialAudioVisualizerConfig;
  telemetry: SpatialAudioVisualizerTelemetry;
  onUpdateVizConfig: (patch: Partial<SpatialAudioVisualizerConfig>) => void;
}

const ANCHOR_MODES: { id: SpatialAudioAnchorMode; label: string; desc: string }[] = [
  {
    id: 'emitter',
    label: 'Emitter-Centered',
    desc: 'Spheres wrap sound source; drive your car in/out to test',
  },
  {
    id: 'listener',
    label: 'Listener Radar',
    desc: 'Spheres wrap camera/car to show audible range radar',
  },
];

const EMITTER_TARGETS: { id: SpatialAudioEmitterTarget; label: string }[] = [
  { id: 'ball', label: 'Ball' },
  { id: 'bot_car', label: 'Opponent / Bot' },
  { id: 'local_car', label: 'Local Car' },
  { id: 'fixed_point', label: 'Fixed Point' },
];

const LISTENER_TARGETS: { id: SpatialAudioListenerTarget; label: string }[] = [
  { id: 'camera', label: 'Active Camera' },
  { id: 'local_car', label: 'Local Car' },
];

export const SpatialAudio3dGizmoControlCard: React.FC<
  SpatialAudio3dGizmoControlCardProps
> = ({ isLight, vizConfig, telemetry, onUpdateVizConfig }) => {
  const gainPct = (telemetry.gain * 100).toFixed(1);
  const dbText =
    telemetry.gain <= 1e-4 || telemetry.gainDb <= -99
      ? '-∞ dB'
      : `${telemetry.gainDb.toFixed(1)} dB`;

  return (
    <div
      className={`flex flex-col gap-2.5 p-2.5 rounded-xl border ${
        isLight
          ? 'bg-neutral-100/90 border-neutral-200 text-neutral-800'
          : 'bg-neutral-900/80 border-neutral-800 text-neutral-200'
      }`}
    >
      {/* Top Row: 3D Arena Visualizer Master Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="flex flex-col leading-snug truncate">
            <span className="font-semibold text-[11px] truncate">
              3D In-Arena Spatial Attenuation Visualizer
            </span>
            <span
              className={`text-[10px] truncate ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              Concentric R_min / R_max Spheres · 50% Iso-Ring · Live Radial Ruler
            </span>
          </div>
        </div>
        <ToggleSwitch
          checked={vizConfig.enabled}
          onCheckedChange={(enabled) => onUpdateVizConfig({ enabled })}
          isLight={isLight}
          variant="amber"
        />
      </div>

      {/* Live Telemetry Strip */}
      <div
        className={`grid grid-cols-4 gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[10px] ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-700'
            : 'bg-neutral-950/90 border-neutral-800/90 text-neutral-300'
        }`}
      >
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-500">DISTANCE</span>
          <span className="font-bold text-sky-400">{telemetry.distanceUU} UU</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-500">LIVE GAIN</span>
          <span
            className={`font-bold ${
              telemetry.isCulled
                ? 'text-rose-400'
                : telemetry.gain >= 0.999
                  ? 'text-emerald-400'
                  : 'text-amber-400'
            }`}
          >
            {gainPct}% ({dbText})
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-500">50% ISO-RING</span>
          <span className="font-bold text-cyan-400">{telemetry.isoRadius50UU} UU</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-500">VOICE STATE</span>
          <span
            className={`font-bold ${
              telemetry.isCulled ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {telemetry.isCulled ? 'CULLED (0%)' : 'ACTIVE'}
          </span>
        </div>
      </div>

      {/* Anchor Mode Selection */}
      <div className="grid grid-cols-2 gap-1.5">
        {ANCHOR_MODES.map((mode) => {
          const isSelected = vizConfig.anchorMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onUpdateVizConfig({ anchorMode: mode.id })}
              className={`flex flex-col items-start px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                  : isLight
                    ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="text-[10px] font-semibold flex items-center gap-1">
                <Compass className="w-3 h-3 shrink-0" />
                {mode.label}
              </span>
              <span className="text-[9px] opacity-75 truncate w-full">{mode.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Emitter & Listener Target Row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium flex items-center gap-1 text-amber-400">
            <Radio className="w-3 h-3" />
            <span>Emitter Source Target</span>
          </span>
          <div className="grid grid-cols-2 gap-1">
            {EMITTER_TARGETS.map((t) => {
              const selected = vizConfig.emitterTarget === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdateVizConfig({ emitterTarget: t.id })}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer truncate ${
                    selected
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : isLight
                        ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium flex items-center gap-1 text-sky-400">
            <Crosshair className="w-3 h-3" />
            <span>Listener Reference</span>
          </span>
          <div className="grid grid-cols-2 gap-1">
            {LISTENER_TARGETS.map((t) => {
              const selected = vizConfig.listenerTarget === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdateVizConfig({ listenerTarget: t.id })}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer truncate ${
                    selected
                      ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                      : isLight
                        ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {vizConfig.emitterTarget === 'bot_car' && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-neutral-400 shrink-0">Car Slot:</span>
              {[1, 2, 3, 4, 5].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onUpdateVizConfig({ targetCarIndex: idx })}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                    vizConfig.targetCarIndex === idx
                      ? 'bg-amber-500/25 border-amber-500/60 text-amber-300'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                  }`}
                >
                  #{idx}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Optional Fixed Probe Point Sliders */}
      {vizConfig.emitterTarget === 'fixed_point' && (
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="amber"
            label="Probe X"
            unit="UU"
            value={vizConfig.fixedPointUU.x}
            min={-4000}
            max={4000}
            step={50}
            isLight={isLight}
            onChange={(x) =>
              onUpdateVizConfig({
                fixedPointUU: { ...vizConfig.fixedPointUU, x },
              })
            }
          />
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="amber"
            label="Probe Y"
            unit="UU"
            value={vizConfig.fixedPointUU.y}
            min={-5000}
            max={5000}
            step={50}
            isLight={isLight}
            onChange={(y) =>
              onUpdateVizConfig({
                fixedPointUU: { ...vizConfig.fixedPointUU, y },
              })
            }
          />
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="amber"
            label="Probe Z"
            unit="UU"
            value={vizConfig.fixedPointUU.z}
            min={20}
            max={1900}
            step={20}
            isLight={isLight}
            onChange={(z) =>
              onUpdateVizConfig({
                fixedPointUU: { ...vizConfig.fixedPointUU, z },
              })
            }
          />
        </div>
      )}

      {/* Layer Visibility Pills & Wireframe Opacity */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-neutral-700/30">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { key: 'showInnerSphere', label: 'Inner Sphere (R_min)', color: 'emerald' },
              { key: 'showIsoRing50', label: '50% Iso-Ring (R_0.5)', color: 'sky' },
              { key: 'showOuterSphere', label: 'Outer Sphere (R_max)', color: 'rose' },
              { key: 'showRadialRuler', label: 'Radial Ruler', color: 'amber' },
              { key: 'depthTest', label: 'Depth Test', color: 'neutral' },
            ] as const
          ).map((item) => {
            const active = Boolean(vizConfig[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onUpdateVizConfig({ [item.key]: !active })}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : isLight
                      ? 'bg-white border-neutral-200 text-neutral-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-500'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
