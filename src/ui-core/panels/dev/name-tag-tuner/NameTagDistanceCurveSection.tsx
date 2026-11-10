import React from 'react';
import { RotateCcw } from 'lucide-react';
import { resolveNameTagVariantParams } from '../../../config/nameTagConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';

const DISTANCE_EXPONENT_PRESETS = [
  { label: 'Calibrated (0.86)', value: 0.86 },
  { label: 'Perceptual (0.92)', value: 0.92 },
  { label: 'Pure Screen (1.00)', value: 1.0 },
  { label: 'Pure World (0.00)', value: 0.0 },
];

export interface NameTagDistanceCurveSectionProps {
  isLight?: boolean;
}

export const NameTagDistanceCurveSection: React.FC<
  NameTagDistanceCurveSectionProps
> = ({ isLight = false }) => {
  const { config, updateConfig, updateActiveVariant, resetConfig } = useNameTagTunerStore();
  const isSingleChar = config.cardDisplayMode === 'single-char';
  const variant = resolveNameTagVariantParams(config, isSingleChar);

  const cardBackground = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBackground}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-[11px]">
          {isSingleChar
            ? 'Single-Char Distance Scale Curve & Dual-Space Offsets'
            : 'Standard Pill Distance Scale Curve & Dual-Space Offsets'}
        </span>
        <button
          type="button"
          onClick={resetConfig}
          className={`text-[10px] font-mono hover:underline flex items-center gap-1 cursor-pointer ${
            isLight ? 'text-amber-700' : 'text-amber-400'
          }`}
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset Calibrated Defaults</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-1.5 text-[10px]">
        <span className={mutedText}>Depth Metric (Aspect Ratio / Edge Behavior):</span>
        <div className="flex items-center gap-1">
          {(['viewZ', 'euclidean'] as const).map((metric) => {
            const isSelected = variant.depthMetric === metric;
            return (
              <button
                key={metric}
                type="button"
                onClick={() => updateActiveVariant({ depthMetric: metric })}
                className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                  isSelected
                    ? isLight
                      ? 'bg-sky-500/15 border-sky-500 text-sky-800 font-bold'
                      : 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
                    : isLight
                      ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                      : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                {metric === 'viewZ' ? 'View-Z Plane' : '3D Euclidean'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {DISTANCE_EXPONENT_PRESETS.map((preset) => {
          const isSelected =
            Math.abs(variant.distanceScaleExponent - preset.value) < 0.005;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => updateActiveVariant({ distanceScaleExponent: preset.value })}
              className={`px-1 py-1 rounded border text-[9px] font-mono cursor-pointer truncate transition-colors ${
                isSelected
                  ? isLight
                    ? 'bg-amber-500/15 border-amber-500 text-amber-800 font-bold'
                    : 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                  : isLight
                    ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                    : 'border-neutral-700/70 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <SliderControl
          label="Card Render Scale (Independent of 3D Scene)"
          value={config.cardRenderScale}
          min={50}
          max={200}
          step={10}
          unit="%"
          onChange={(nextValue) => updateConfig({ cardRenderScale: nextValue })}
          isLight={isLight}
        />
        <SliderControl
          label="Camera Relative Scale"
          value={variant.cameraScaleFactor}
          min={0}
          max={0.3}
          step={0.005}
          onChange={(nextValue) => updateActiveVariant({ cameraScaleFactor: nextValue })}
          isLight={isLight}
        />
        <SliderControl
          label="Distance Scale Exponent (gamma)"
          value={variant.distanceScaleExponent}
          min={0.0}
          max={1.5}
          step={0.01}
          onChange={(nextValue) => updateActiveVariant({ distanceScaleExponent: nextValue })}
          isLight={isLight}
        />
        <SliderControl
          label="Near Scale Multiplier (500 UU)"
          value={variant.nearScaleMultiplier}
          min={0.2}
          max={2.5}
          step={0.02}
          unit="x"
          onChange={(nextValue) => updateActiveVariant({ nearScaleMultiplier: nextValue })}
          isLight={isLight}
        />
        <SliderControl
          label="Far Scale Multiplier (9000 UU)"
          value={variant.farScaleMultiplier}
          min={0.2}
          max={2.5}
          step={0.02}
          unit="x"
          onChange={(nextValue) => updateActiveVariant({ farScaleMultiplier: nextValue })}
          isLight={isLight}
        />
        <SliderControl
          label="3D World Offset (Car Roof Relative)"
          value={variant.verticalOffsetUu}
          min={0}
          max={360}
          step={2}
          unit="UU"
          onChange={(nextValue) => updateActiveVariant({ verticalOffsetUu: nextValue })}
          isLight={isLight}
        />
        <SliderControl
          label="2D Screen Offset (Viewport Relative)"
          value={variant.screenVerticalOffsetPx}
          min={-60}
          max={160}
          step={1}
          unit="px"
          onChange={(nextValue) => updateActiveVariant({ screenVerticalOffsetPx: nextValue })}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
