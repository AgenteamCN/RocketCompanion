import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import {
  usePlayCardStyleStore,
  type WatermarkAnchor,
  type WatermarkColorMode,
} from '../../../ui-core/stores/playCardStyleStore';

export interface PlayCardWatermarkGeometrySectionProps {
  isLight: boolean;
}

export const PlayCardWatermarkGeometrySection: React.FC<
  PlayCardWatermarkGeometrySectionProps
> = ({ isLight }) => {
  const store = usePlayCardStyleStore();
  const { setParam } = store;

  return (
    <>
      {/* C3: Giant Watermark Icon Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
        <SliderControl
          label="extra large background Icon opacity (default 30%)"
          value={store.watermarkOpacityPct}
          min={0}
          max={100}
          step={1}
          unit="%"
          editable
          allowOutOfBoundsInput
          colorScheme="emerald"
          onChange={(v) => setParam('watermarkOpacityPct', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Hover On Hover Icon opacity"
          value={store.watermarkHoverOpacityPct}
          min={0}
          max={100}
          step={1}
          unit="%"
          editable
          allowOutOfBoundsInput
          colorScheme="emerald"
          onChange={(v) => setParam('watermarkHoverOpacityPct', v)}
          isLight={isLight}
        />
        <SliderControl
          label="extra large background Icon size (watermarkSize)"
          value={store.watermarkSizePx}
          min={32}
          max={200}
          step={2}
          unit="px"
          editable
          allowOutOfBoundsInput
          colorScheme="amber"
          onChange={(v) => setParam('watermarkSizePx', v)}
          isLight={isLight}
        />
        <SliderControl
          label="extra large background Icon Line Width (strokeWidth)"
          value={store.watermarkStrokeWidth}
          min={0.5}
          max={3.0}
          step={0.1}
          editable
          allowOutOfBoundsInput
          colorScheme="amber"
          onChange={(v) => setParam('watermarkStrokeWidth', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Background Icon Horizontal Offset (offsetX)"
          value={store.watermarkOffsetXPx}
          min={-60}
          max={60}
          step={1}
          unit="px"
          editable
          allowOutOfBoundsInput
          colorScheme="sky"
          onChange={(v) => setParam('watermarkOffsetXPx', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Background Icon Vertical Offset (offsetY)"
          value={store.watermarkOffsetYPx}
          min={-60}
          max={60}
          step={1}
          unit="px"
          editable
          allowOutOfBoundsInput
          colorScheme="sky"
          onChange={(v) => setParam('watermarkOffsetYPx', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Background Icon Rotation Angle (rotateDeg)"
          value={store.watermarkRotateDeg}
          min={-45}
          max={45}
          step={1}
          unit="°"
          editable
          allowOutOfBoundsInput
          colorScheme="sky"
          onChange={(v) => setParam('watermarkRotateDeg', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Hover Hover Scale Factor (hoverScale)"
          value={store.watermarkHoverScale}
          min={1.0}
          max={1.25}
          step={0.01}
          unit="x"
          editable
          allowOutOfBoundsInput
          colorScheme="emerald"
          onChange={(v) => setParam('watermarkHoverScale', v)}
          isLight={isLight}
        />
      </div>

      {/* C4: Watermark Anchor & Color Mode */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
            extra large background Icon Alignment (watermarkAnchor):
          </span>
          {(
            [
              { id: 'bottom-right', label: 'Bottom-right (Bottom-Right)' },
              { id: 'right-center', label: 'Middle Right (Right-Center)' },
              { id: 'center', label: 'Center Overlay (Center)' },
              { id: 'top-right', label: 'Top-right (Top-Right)' },
              { id: 'bottom-left', label: 'Bottom Left Corner (Bottom-Left)' },
            ] as { id: WatermarkAnchor; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setParam('watermarkAnchor', opt.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                store.watermarkAnchor === opt.id
                  ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                  : isLight
                  ? 'bg-white border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
            Global watermark shading mode:
          </span>
          {(
            [
              { id: 'mode-accent', label: 'Follow individual card color schemes (Per-Card)' },
              { id: 'amber', label: 'Global unified warm orange' },
              { id: 'neutral', label: 'Global monochrome dark gray' },
            ] as { id: WatermarkColorMode; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setParam('watermarkColorMode', opt.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                store.watermarkColorMode === opt.id
                  ? 'bg-amber-500 text-white border-amber-500 font-bold'
                  : isLight
                  ? 'bg-white border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
