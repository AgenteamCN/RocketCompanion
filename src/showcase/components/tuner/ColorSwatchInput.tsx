import React, { useState, useEffect, useMemo } from 'react';

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface ColorSwatchInputProps {
  label: string;
  description?: string;
  value: string;
  onChange: (hex: string) => void;
  presets?: string[];
  /** Show manual R / G / B (0-255) numeric inputs (default true) */
  showRgbInputs?: boolean;
  isLight?: boolean;
  className?: string;
}

export function clampRgbChannel(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(255, Math.round(val)));
}

export function hexToRgbTuple(hex: string): RgbTuple {
  const clean = (hex || '').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean;
  if (/^[0-9a-fA-F]{6}$/.test(full)) {
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  return { r: 56, g: 189, b: 248 };
}

export function rgbTupleToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clampRgbChannel(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function parseColorStringToHex(raw: string): string | null {
  const trimmed = raw.trim();
  const hexMatch = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    return `#${full.toUpperCase()}`;
  }
  const rgbMatch = trimmed.match(
    /^(?:rgba?\s*\(\s*)?(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)?$/i
  );
  if (rgbMatch) {
    return rgbTupleToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }
  return null;
}

/**
 * ColorSwatchInput (TunerColorRow)
 * Combines native color picker swatch, direct #RRGGBB / rgb(r,g,b) text input,
 * manual R / G / B (0-255) channel inputs, and optional quick palette dots.
 */
export const ColorSwatchInput: React.FC<ColorSwatchInputProps> = React.memo(({
  label,
  description,
  value,
  onChange,
  presets,
  showRgbInputs = true,
  isLight = false,
  className = '',
}) => {
  const [text, setText] = useState<string>(value);
  const rgb = useMemo(() => hexToRgbTuple(value), [value]);

  useEffect(() => {
    setText(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const parsed = parseColorStringToHex(raw);
    if (parsed) {
      onChange(parsed);
    } else if (raw.startsWith('#') && raw.length === 7) {
      onChange(raw);
    }
  };

  const handleRgbChannelChange = (channel: 'r' | 'g' | 'b', rawValue: string) => {
    const num = rawValue === '' ? 0 : Number(rawValue);
    if (Number.isNaN(num)) return;
    const nextRgb: RgbTuple = {
      ...rgb,
      [channel]: clampRgbChannel(num),
    };
    const nextHex = rgbTupleToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    setText(nextHex);
    onChange(nextHex);
  };

  const normalizedPickerHex =
    value && value.startsWith('#') && value.length === 7
      ? value
      : rgbTupleToHex(rgb.r, rgb.g, rgb.b);

  return (
    <div
      data-component="color-swatch-input"
      data-tuner-label={label}
      data-tuner-value={value}
      className={`p-2.5 rounded-xl border flex flex-col gap-2 text-xs select-none transition-colors ${
        isLight
          ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
          : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
          <span className={`font-semibold truncate ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}>
            {label}
          </span>
          {description && (
            <span className={`text-[10px] leading-tight ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="color"
            value={normalizedPickerHex}
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              setText(next);
              onChange(next);
            }}
            title="Click to manually pick color"
            className="w-6 h-6 rounded border border-neutral-500/60 cursor-pointer p-0 bg-transparent"
          />
          <input
            type="text"
            value={text}
            onChange={handleInputChange}
            placeholder="#RRGGBB or R,G,B"
            className={`w-24 px-2 py-0.5 text-center font-mono text-xs rounded border transition-colors outline-none focus:ring-1 focus:ring-amber-500 ${
              isLight
                ? 'bg-white border-neutral-300 text-neutral-800'
                : 'bg-neutral-900 border-neutral-700 text-neutral-100'
            }`}
          />
        </div>
      </div>

      {showRgbInputs && (
        <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <span className="text-[10px] font-mono opacity-65 shrink-0">
            RGB ({rgb.r}, {rgb.g}, {rgb.b}):
          </span>
          <div className="flex items-center gap-1.5">
            {(['r', 'g', 'b'] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-1 text-[10px] font-mono">
                <span className="uppercase font-bold opacity-75">{ch}:</span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  step={1}
                  value={rgb[ch]}
                  onChange={(e) => handleRgbChannelChange(ch, e.target.value)}
                  className={`w-13 px-1.5 py-0.5 text-center font-mono text-[11px] rounded border outline-none focus:ring-1 focus:ring-sky-500 ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-800'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                  }`}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60 flex-wrap">
          <span className="text-[10px] font-mono text-neutral-400 mr-1">Swatches:</span>
          {presets.map((hex) => {
            const isActive = value.toLowerCase() === hex.toLowerCase();
            const presetRgb = hexToRgbTuple(hex);
            return (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  const upper = hex.toUpperCase();
                  setText(upper);
                  onChange(upper);
                }}
                title={`${hex.toUpperCase()} · rgb(${presetRgb.r}, ${presetRgb.g}, ${presetRgb.b})`}
                className={`h-4 w-4 rounded-full border transition-transform cursor-pointer ${
                  isActive
                    ? 'scale-125 ring-2 ring-amber-500 border-white'
                    : 'border-black/20 dark:border-white/20 hover:scale-110'
                }`}
                style={{ backgroundColor: hex }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

ColorSwatchInput.displayName = 'ColorSwatchInput';

