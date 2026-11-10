import React, { useMemo } from 'react';
import { SliderControl } from '../../primitives/SliderControl';
import { useSpatialAudioStore } from '../../stores/spatialAudioStore';
import {
  solveCubicBezier,
  type SpatialAudioTunerConfig,
} from '../../config/spatialAudioConfig';

export interface SpatialAudioCurveCardProps {
  isLight: boolean;
}

const OVERRIDE_MODES: {
  id: SpatialAudioTunerConfig['overrideMode'];
  label: string;
}[] = [
  { id: 'auto', label: 'Auto (Game State)' },
  { id: 'normal', label: 'Normal (0.0)' },
  { id: 'spatial', label: 'Spatial (1.0)' },
  { id: 'manual', label: 'Manual Scrub' },
];

export const SpatialAudioCurveCard: React.FC<SpatialAudioCurveCardProps> = ({
  isLight,
}) => {
  const tunerConfig = useSpatialAudioStore((s) => s.tunerConfig);
  const updateTunerConfig = useSpatialAudioStore((s) => s.updateTunerConfig);
  const activeGoalAnthemId = useSpatialAudioStore((s) => s.activeGoalAnthemId);
  const previewingAnthemId = useSpatialAudioStore((s) => s.previewingAnthemId);
  const anthemLinearPhase = useSpatialAudioStore((s) => s.anthemLinearPhase);
  const anthemBlend = useSpatialAudioStore((s) => s.anthemBlend);
  const bgmLinearPhase = useSpatialAudioStore((s) => s.bgmLinearPhase);
  const bgmBlend = useSpatialAudioStore((s) => s.bgmBlend);
  const bgmIsPlaying = useSpatialAudioStore((s) => s.bgmIsPlaying);

  const curveSvgPath = useMemo(() => {
    const pts: string[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const b = solveCubicBezier(
        u,
        tunerConfig.bzX1,
        tunerConfig.bzY1,
        tunerConfig.bzX2,
        tunerConfig.bzY2
      );
      const x = (u * 100).toFixed(2);
      const y = ((1 - b) * 100).toFixed(2);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
    }
    return pts.join(' ');
  }, [
    tunerConfig.bzX1,
    tunerConfig.bzY1,
    tunerConfig.bzX2,
    tunerConfig.bzY2,
  ]);

  return (
    <div
      className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
        isLight
          ? 'bg-neutral-100/80 border-neutral-200'
          : 'bg-neutral-900/70 border-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>
          CURVE: cubic-bezier({tunerConfig.bzX1.toFixed(2)},{' '}
          {tunerConfig.bzY1.toFixed(2)}, {tunerConfig.bzX2.toFixed(2)},{' '}
          {tunerConfig.bzY2.toFixed(2)})
        </span>
        <span className="text-amber-400 font-semibold">
          T = {tunerConfig.transitionDurationSec.toFixed(2)}s
        </span>
      </div>

      <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
        {/* SVG Curve Plot */}
        <div
          className={`relative h-24 w-full rounded-lg border overflow-hidden ${
            isLight
              ? 'bg-white border-neutral-200'
              : 'bg-neutral-950 border-neutral-800'
          }`}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
          >
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="0"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <path
              d={curveSvgPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* Anthem Live Phase Marker */}
            <circle
              cx={anthemLinearPhase * 100}
              cy={(1 - anthemBlend) * 100}
              r="4"
              fill="#f59e0b"
            />
            {/* BGM Live Phase Marker */}
            <circle
              cx={bgmLinearPhase * 100}
              cy={(1 - bgmBlend) * 100}
              r="3.5"
              fill="#38bdf8"
            />
          </svg>
          <span className="absolute bottom-1 left-1.5 text-[9px] font-mono text-neutral-500">
            0.0 Normal
          </span>
          <span className="absolute top-1 right-1.5 text-[9px] font-mono text-amber-400">
            1.0 Spatial
          </span>
        </div>

        {/* Live Readouts & Override Mode */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-amber-400 font-semibold">
              Anthem Blend ({activeGoalAnthemId || previewingAnthemId ? 'ACTIVE' : 'IDLE'})
            </span>
            <span>
              u={anthemLinearPhase.toFixed(2)} {'->'} B={(anthemBlend * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-none"
              style={{ width: `${Math.round(anthemBlend * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono mt-0.5">
            <span className="text-sky-400 font-semibold">
              BGM Blend ({bgmIsPlaying ? 'PLAYING' : 'PAUSED'})
            </span>
            <span>
              u={bgmLinearPhase.toFixed(2)} {'->'} B={(bgmBlend * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-none"
              style={{ width: `${Math.round(bgmBlend * 100)}%` }}
            />
          </div>

          {/* Override Mode Selector */}
          <div className="grid grid-cols-2 gap-1 mt-1">
            {OVERRIDE_MODES.map((mode) => {
              const isSelected = tunerConfig.overrideMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => updateTunerConfig({ overrideMode: mode.id })}
                  className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : isLight
                      ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tunerConfig.overrideMode === 'manual' && (
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="amber"
          label="Manual Spatial Blend Override"
          unit=""
          value={tunerConfig.manualBlend}
          min={0}
          max={1}
          step={0.01}
          isLight={isLight}
          onChange={(v) => updateTunerConfig({ manualBlend: v })}
        />
      )}
    </div>
  );
};
