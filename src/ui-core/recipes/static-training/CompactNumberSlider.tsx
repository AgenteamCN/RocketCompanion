import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

export interface CompactNumberSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayValue?: string | number;
  description?: string;
  onHoverDesc?: (desc: string | null) => void;
  onChange: (val: number) => void;
  isLight?: boolean;
}

export const CompactNumberSlider: React.FC<CompactNumberSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  displayValue,
  description,
  onHoverDesc,
  onChange,
  isLight = false,
}) => (
  <div
    onMouseEnter={() => description && onHoverDesc?.(description)}
    onMouseLeave={() => description && onHoverDesc?.(null)}
    className="flex items-center gap-2 w-full py-0.5 px-1.5 rounded-lg hover:bg-neutral-500/10 select-none transition-colors"
  >
    <span
      className={`w-28 shrink-0 text-[11px] font-semibold truncate ${
        isLight ? 'text-neutral-800' : 'text-neutral-200'
      }`}
    >
      {label}
    </span>
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(vals) => onChange(vals[0])}
      className="relative flex items-center select-none touch-none grow h-4 cursor-pointer"
    >
      <SliderPrimitive.Track
        className={`relative grow rounded-full h-1.5 overflow-hidden ${
          isLight ? 'bg-neutral-200' : 'bg-neutral-800'
        }`}
      >
        <SliderPrimitive.Range
          className={`absolute h-full rounded-full ${
            isLight ? 'bg-neutral-900' : 'bg-white'
          }`}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={`block h-3 w-3 rounded-full border shadow-xs transition-transform hover:scale-110 outline-none ${
          isLight ? 'bg-white border-neutral-400' : 'bg-neutral-100 border-neutral-400'
        }`}
      />
    </SliderPrimitive.Root>
    <span
      className={`font-mono text-[10px] w-14 shrink-0 text-center py-0.5 rounded border select-none ${
        isLight
          ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
          : 'bg-neutral-800 text-neutral-300 border-neutral-700'
      }`}
    >
      {displayValue !== undefined ? displayValue : value}
      {unit}
    </span>
  </div>
);
