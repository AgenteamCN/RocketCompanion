import React from 'react';
import { type EdgeSkipIndicatorConfig } from '../../../ui-core/stores/hudTransientTypes';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';

export const SKIP_COLOR_SWATCHES = [
  { index: 1, hex: '#22C55E', label: '#1 Green' },
  { index: 2, hex: '#10B981', label: '#2 Emerald (Default)' },
  { index: 3, hex: '#84CC16', label: '#3 Lime' },
  { index: 4, hex: '#38BDF8', label: '#4 Sky Cyan' },
  { index: 5, hex: '#F59E0B', label: '#5 Amber Warn' },
  { index: 6, hex: '#EF4444', label: '#6 Crimson Alert' },
  { index: 7, hex: '#FFFFFF', label: '#7 Pure White' },
] as const;

export interface SkipReplayTimingAndPaletteControlsProps {
  isLight: boolean;
  skipCfg: Required<EdgeSkipIndicatorConfig>;
  updateSkipCfg: (patch: Partial<EdgeSkipIndicatorConfig>) => void;
}

export const SkipReplayTimingAndPaletteControls: React.FC<
  SkipReplayTimingAndPaletteControlsProps
> = React.memo(({ isLight, skipCfg, updateSkipCfg }) => {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
        <SliderControl
          label="Icon Horizontal Offset (iconOffsetXPx)"
          description="Horizontal fine-tuning inside protruding drawer"
          value={skipCfg.iconOffsetXPx}
          min={-12}
          max={12}
          step={0.5}
          origin={0}
          defaultValue={0}
          variation="centered"
          unit="px"
          colorScheme="neutral"
          isLight={isLight}
          onChange={(v) => updateSkipCfg({ iconOffsetXPx: v })}
        />

        <SliderControl
          label="Icon Vertical Offset (iconOffsetYPx)"
          description="Optical vs mathematical center balance (negative shifts upward)"
          value={skipCfg.iconOffsetYPx}
          min={-12}
          max={12}
          step={0.5}
          origin={0}
          defaultValue={-1}
          variation="centered"
          unit="px"
          colorScheme="emerald"
          isLight={isLight}
          onChange={(v) => updateSkipCfg({ iconOffsetYPx: v })}
        />
      </div>

      {/* Row 5: Push-Out Enter Duration, Retract Exit Duration, and SVG Glow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
        <SliderControl
          label="Push-Out Enter Speed (enterDurationMs)"
          value={skipCfg.enterDurationMs}
          min={0}
          max={500}
          step={10}
          defaultValue={220}
          unit="ms"
          colorScheme="sky"
          isLight={isLight}
          onChange={(v) => updateSkipCfg({ enterDurationMs: v })}
        />

        <div className="flex flex-col gap-1.5">
          <SliderControl
            label="Retract Exit Speed (exitDurationMs · 1-3 is 300ms)"
            value={skipCfg.exitDurationMs}
            min={0}
            max={500}
            step={10}
            defaultValue={160}
            unit="ms"
            colorScheme="sky"
            isLight={isLight}
            onChange={(v) => updateSkipCfg({ exitDurationMs: v })}
          />
          <div className="flex items-center gap-1 flex-wrap font-mono text-[10px]">
            {[
              { ms: 120, label: '120ms Fast' },
              { ms: 160, label: '160ms Default' },
              { ms: 220, label: '220ms Medium' },
              { ms: 300, label: '300ms (= 1-3)' },
            ].map((p) => (
              <button
                key={p.ms}
                type="button"
                onClick={() => updateSkipCfg({ exitDurationMs: p.ms })}
                className={`px-1.5 py-0.5 rounded border cursor-pointer transition-all ${
                  skipCfg.exitDurationMs === p.ms
                    ? 'bg-sky-500 text-neutral-950 border-sky-500 font-bold'
                    : 'border-neutral-400/40 opacity-75 hover:opacity-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <SliderControl
          label="SVG Glow Blur (glowBlurPx)"
          value={skipCfg.glowBlurPx}
          min={0}
          max={20}
          step={1}
          defaultValue={6}
          unit="px"
          colorScheme="emerald"
          isLight={isLight}
          onChange={(v) => updateSkipCfg({ glowBlurPx: v })}
        />

        <SliderControl
          label="SVG Glow Intensity (glowIntensityPct)"
          value={skipCfg.glowIntensityPct}
          min={0}
          max={200}
          step={5}
          defaultValue={110}
          unit="%"
          colorScheme="emerald"
          isLight={isLight}
          onChange={(v) => updateSkipCfg({ glowIntensityPct: v })}
        />
      </div>

      {/* Row 6: Numbered Color Swatches + Custom Color Picker */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60 flex-wrap">
        <span className="text-xs font-semibold">
          Icon & Glow Color Scheme (Default = #2 Emerald `#10B981`):
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {SKIP_COLOR_SWATCHES.map((sw) => (
            <button
              key={sw.hex}
              type="button"
              onClick={() => updateSkipCfg({ color: sw.hex, glowColor: sw.hex })}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-mono border cursor-pointer flex items-center gap-1.5 transition-all ${
                skipCfg.color.toUpperCase() === sw.hex
                  ? 'ring-2 ring-emerald-500 font-bold'
                  : 'opacity-80 hover:opacity-100'
              }`}
              style={{ borderColor: `${sw.hex}88` }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-black/20"
                style={{ backgroundColor: sw.hex }}
              />
              <span>{sw.label}</span>
            </button>
          ))}
          <input
            type="color"
            value={skipCfg.color}
            onChange={(e) =>
              updateSkipCfg({ color: e.target.value, glowColor: e.target.value })
            }
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
            title="Custom Color"
          />
        </div>
      </div>
    </>
  );
});

SkipReplayTimingAndPaletteControls.displayName = 'SkipReplayTimingAndPaletteControls';
