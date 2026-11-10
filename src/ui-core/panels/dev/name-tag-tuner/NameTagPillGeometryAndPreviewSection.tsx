import React from 'react';
import {
  resolveNameTagVariantParams,
  type NameTagFontFamily,
  type NameTagFontWeight,
} from '../../../config/nameTagConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { NameTagPillPreviewCard } from './NameTagPillPreviewCard';
import { NameTagDistanceCurveSection } from './NameTagDistanceCurveSection';

const FONT_FAMILY_OPTIONS: Array<{ id: NameTagFontFamily; label: string }> = [
  { id: 'jetbrains-mono', label: 'JetBrains Mono' },
  { id: 'sf-mono', label: 'SF Mono / UI Mono' },
  { id: 'archivo', label: 'Archivo Sans' },
];

const FONT_WEIGHT_OPTIONS: Array<{ value: NameTagFontWeight; label: string }> = [
  { value: 400, label: '400 Regular' },
  { value: 500, label: '500 Medium' },
  { value: 600, label: '600 SemiBold' },
  { value: 700, label: '700 Bold' },
];

export interface NameTagPillGeometryAndPreviewSectionProps {
  isLight?: boolean;
}

export const NameTagPillGeometryAndPreviewSection: React.FC<
  NameTagPillGeometryAndPreviewSectionProps
> = ({ isLight = false }) => {
  const { config, updateConfig, updateActiveVariant } = useNameTagTunerStore();
  const isSingleChar = config.cardDisplayMode === 'single-char';
  const variant = resolveNameTagVariantParams(config, isSingleChar);

  const cardBackground = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <>
      <NameTagPillPreviewCard isLight={isLight} />

      <NameTagDistanceCurveSection isLight={isLight} />

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBackground}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px]">
            {isSingleChar
              ? 'Single-Char Indicator Geometry, Typography & Opacity'
              : 'Standard Pill Geometry, Typography & Opacity'}
          </span>
          <span className={`text-[10px] font-mono ${mutedText}`}>
            {variant.pillMinWidth}-{variant.pillMaxWidth}x{variant.pillHeight}px
          </span>
        </div>

        <div className="flex flex-col gap-1.5 pt-0.5">
          <div className="flex items-center justify-between gap-1.5 text-[10px]">
            <span className={mutedText}>Font Family:</span>
            <div className="flex items-center gap-1">
              {FONT_FAMILY_OPTIONS.map((opt) => {
                const isSelected = variant.fontFamily === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateActiveVariant({ fontFamily: opt.id })}
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
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5 text-[10px]">
            <span className={mutedText}>Font Weight:</span>
            <div className="grid grid-cols-4 gap-1">
              {FONT_WEIGHT_OPTIONS.map((opt) => {
                const isSelected = variant.fontWeight === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateActiveVariant({ fontWeight: opt.value })}
                    className={`px-1.5 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                      isSelected
                        ? isLight
                          ? 'bg-amber-500/15 border-amber-500 text-amber-800 font-bold'
                          : 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                        : isLight
                          ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                          : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SliderControl
            label="Minimum Width"
            value={variant.pillMinWidth}
            min={40}
            max={460}
            step={2}
            unit="px"
            onChange={(nextValue) => updateActiveVariant({ pillMinWidth: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Maximum Width"
            value={variant.pillMaxWidth}
            min={80}
            max={480}
            step={4}
            unit="px"
            onChange={(nextValue) => updateActiveVariant({ pillMaxWidth: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Card Height"
            value={variant.pillHeight}
            min={28}
            max={120}
            step={2}
            unit="px"
            onChange={(nextValue) => updateActiveVariant({ pillHeight: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Corner Radius"
            value={variant.cornerRadius}
            min={0}
            max={60}
            step={1}
            unit="px"
            onChange={(nextValue) => updateActiveVariant({ cornerRadius: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Font Size"
            value={variant.fontSize}
            min={12}
            max={48}
            step={1}
            unit="px"
            onChange={(nextValue) => updateActiveVariant({ fontSize: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Border Thickness"
            value={variant.borderWidth}
            min={0}
            max={12}
            step={0.5}
            unit="px"
            onChange={(nextValue) => updateActiveVariant({ borderWidth: nextValue })}
            isLight={isLight}
          />
          {!isSingleChar && (
            <SliderControl
              label="Truncation Length (Leading ...)"
              value={config.maxChars}
              min={4}
              max={32}
              step={1}
              unit="chars"
              onChange={(nextValue) => updateConfig({ maxChars: nextValue })}
              isLight={isLight}
            />
          )}
          <SliderControl
            label="Card Opacity"
            value={variant.opacity}
            min={0.1}
            max={1.0}
            step={0.02}
            onChange={(nextValue) => updateActiveVariant({ opacity: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Background Fill Opacity"
            value={variant.bgOpacity}
            min={0.0}
            max={1.0}
            step={0.02}
            onChange={(nextValue) => updateActiveVariant({ bgOpacity: nextValue })}
            isLight={isLight}
          />
        </div>
      </div>
    </>
  );
};
