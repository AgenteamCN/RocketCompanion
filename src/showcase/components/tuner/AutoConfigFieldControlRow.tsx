import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';

export function inferNumericRange(key: string, defaultVal: number): {
  min: number;
  max: number;
  step: number;
} {
  const lower = key.toLowerCase();
  if (
    lower.includes('opacity') ||
    lower.includes('alpha') ||
    (defaultVal >= 0 && defaultVal <= 1 && !Number.isInteger(defaultVal))
  ) {
    return { min: 0, max: 1, step: 0.01 };
  }
  if (lower.includes('deg') || lower.includes('angle') || lower.includes('hue')) {
    return { min: -180, max: 360, step: 1 };
  }
  if (lower.includes('pct') || lower.includes('percent')) {
    return { min: 0, max: 100, step: 1 };
  }
  if (defaultVal === 0) {
    return { min: 0, max: 100, step: 1 };
  }
  const abs = Math.abs(defaultVal);
  const isFloat = !Number.isInteger(defaultVal);
  const min = defaultVal < 0 ? Math.floor(defaultVal * 2) : 0;
  const max = Math.max(1, Math.ceil(abs * 3));
  const step = isFloat ? Number((abs / 50).toFixed(3)) || 0.01 : 1;
  return { min, max, step };
}

export interface AutoConfigFieldControlRowProps {
  fieldKey: string;
  rawDefaultVal: unknown;
  currentVal: unknown;
  onChange: (fieldKey: string, nextValue: unknown) => void;
  isLight: boolean;
}

export const AutoConfigFieldControlRow: React.FC<AutoConfigFieldControlRowProps> = React.memo(
  ({ fieldKey, rawDefaultVal, currentVal, onChange, isLight }) => {
    if (typeof rawDefaultVal === 'number') {
      const range = inferNumericRange(fieldKey, rawDefaultVal);
      return (
        <SliderControl
          label={fieldKey}
          value={Number(currentVal)}
          min={range.min}
          max={range.max}
          step={range.step}
          isLight={isLight}
          onChange={(val) => onChange(fieldKey, val)}
        />
      );
    }

    if (typeof rawDefaultVal === 'boolean') {
      return (
        <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-neutral-200/70 dark:border-neutral-800">
          <span className="text-[11px] truncate">{fieldKey}</span>
          <ToggleSwitch
            checked={Boolean(currentVal)}
            isLight={isLight}
            onChange={(checked) => onChange(fieldKey, checked)}
          />
        </div>
      );
    }

    if (typeof rawDefaultVal === 'string') {
      return (
        <label className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-neutral-200/70 dark:border-neutral-800">
          <span className="text-[11px] truncate">{fieldKey}</span>
          <input
            type="color"
            value={String(currentVal)}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="h-6 w-10 rounded cursor-pointer border-0 bg-transparent"
          />
        </label>
      );
    }

    return null;
  }
);

AutoConfigFieldControlRow.displayName = 'AutoConfigFieldControlRow';
