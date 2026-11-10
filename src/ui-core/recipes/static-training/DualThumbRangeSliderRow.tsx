import React, { useEffect, useRef, useState } from 'react';

export interface DualThumbRangeSliderRowProps {
  isLight: boolean;
  label: string;
  value: [number, number];
  sliderMin: number;
  sliderMax: number;
  step?: number;
  readOnly?: boolean;
  disabled?: boolean;
  unit?: string;
  onChange: (next: [number, number]) => void;
}

function roundToStep(val: number, step: number): number {
  if (!Number.isFinite(val)) return 0;
  if (step <= 0) return val;
  const inv = 1 / step;
  return Math.round(val * inv) / inv;
}

function formatNum(val: number, step: number): string {
  if (!Number.isFinite(val)) return '0';
  if (step < 1) {
    const decimals = step < 0.1 ? 2 : 1;
    return Number(val.toFixed(decimals)).toString();
  }
  return String(Math.round(val * 100) / 100);
}

/**
 * DualThumbRangeSliderRow
 * - In readOnly (Kevpert Preset) mode: displays a clean, non-editable numeric range summary.
 * - In Custom mode: displays a bidirectional dual-grabber range slider with left/right numeric text inputs
 *   (no spinner arrows), supporting Enter to confirm and values outside the slider's [sliderMin, sliderMax] track range.
 */
export const DualThumbRangeSliderRow: React.FC<DualThumbRangeSliderRowProps> = React.memo(
  ({
    isLight,
    label,
    value,
    sliderMin,
    sliderMax,
    step = 1,
    readOnly = false,
    disabled = false,
    onChange,
  }) => {
    const [minText, setMinText] = useState<string>(() => formatNum(value[0], step));
    const [maxText, setMaxText] = useState<string>(() => formatNum(value[1], step));
    const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      setMinText(formatNum(value[0], step));
    }, [value[0], step]);

    useEffect(() => {
      setMaxText(formatNum(value[1], step));
    }, [value[1], step]);

    const commitMinText = () => {
      const trimmed = minText.trim();
      const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
      if (!Number.isFinite(parsed)) {
        if (trimmed !== '') {
          console.error(`[DualThumbRangeSliderRow] Invalid numeric min input for "${label}": "${minText}"`);
        }
        setMinText(formatNum(value[0], step));
        return;
      }
      const nextMin = parsed;
      const nextMax = Math.max(nextMin, value[1]);
      onChange([nextMin, nextMax]);
      setMinText(formatNum(nextMin, step));
      setMaxText(formatNum(nextMax, step));
    };

    const commitMaxText = () => {
      const trimmed = maxText.trim();
      const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
      if (!Number.isFinite(parsed)) {
        if (trimmed !== '') {
          console.error(`[DualThumbRangeSliderRow] Invalid numeric max input for "${label}": "${maxText}"`);
        }
        setMaxText(formatNum(value[1], step));
        return;
      }
      const nextMax = parsed;
      const nextMin = Math.min(value[0], nextMax);
      onChange([nextMin, nextMax]);
      setMinText(formatNum(nextMin, step));
      setMaxText(formatNum(nextMax, step));
    };

    const span = Math.max(1e-6, sliderMax - sliderMin);
    const minPct = Math.max(0, Math.min(100, ((value[0] - sliderMin) / span) * 100));
    const maxPct = Math.max(0, Math.min(100, ((value[1] - sliderMin) / span) * 100));
    const leftFillPct = Math.min(minPct, maxPct);
    const widthFillPct = Math.max(0, Math.abs(maxPct - minPct));

    const computeValueFromClientX = (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return value[0];
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return value[0];
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = sliderMin + ratio * (sliderMax - sliderMin);
      return roundToStep(raw, step);
    };

    const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly || disabled) return;
      e.preventDefault();
      const clickedVal = computeValueFromClientX(e.clientX);
      const distMin = Math.abs(clickedVal - value[0]);
      const distMax = Math.abs(clickedVal - value[1]);
      const chosen: 'min' | 'max' =
        distMin < distMax
          ? 'min'
          : distMax < distMin
          ? 'max'
          : clickedVal <= value[0]
          ? 'min'
          : 'max';
      setActiveThumb(chosen);
      e.currentTarget.setPointerCapture(e.pointerId);
      if (chosen === 'min') {
        const nextMin = Math.min(clickedVal, value[1]);
        onChange([nextMin, value[1]]);
      } else {
        const nextMax = Math.max(clickedVal, value[0]);
        onChange([value[0], nextMax]);
      }
    };

    const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activeThumb || readOnly || disabled) return;
      const nextVal = computeValueFromClientX(e.clientX);
      if (activeThumb === 'min') {
        const clampedMin = Math.min(nextVal, value[1]);
        onChange([clampedMin, value[1]]);
      } else {
        const clampedMax = Math.max(nextVal, value[0]);
        onChange([value[0], clampedMax]);
      }
    };

    const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activeThumb) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setActiveThumb(null);
    };

    const inputClass = `w-[70px] px-2 py-1 rounded-md border font-mono text-[11px] font-bold text-center outline-hidden transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
      disabled
        ? 'opacity-40 cursor-not-allowed'
        : isLight
        ? 'bg-white border-neutral-300 text-neutral-900 focus:border-cyan-500'
        : 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-cyan-400'
    }`;

    if (readOnly) {
      return (
        <div
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
            disabled ? 'opacity-45' : ''
          } ${
            isLight
              ? 'bg-neutral-100/70 border-neutral-200/90 text-neutral-800'
              : 'bg-neutral-900/55 border-neutral-800/90 text-neutral-200'
          }`}
        >
          <span
            className={`text-[11px] font-medium truncate ${
              isLight ? 'text-neutral-700' : 'text-neutral-300'
            }`}
          >
            {label}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-bold">
            <span
              className={`px-2 py-0.5 rounded border min-w-[58px] text-center ${
                isLight
                  ? 'bg-white/90 border-neutral-200 text-cyan-700'
                  : 'bg-neutral-950/90 border-neutral-800 text-cyan-300'
              }`}
            >
              {formatNum(value[0], step)}
            </span>
            <span className="text-[10px] opacity-40">to</span>
            <span
              className={`px-2 py-0.5 rounded border min-w-[58px] text-center ${
                isLight
                  ? 'bg-white/90 border-neutral-200 text-cyan-700'
                  : 'bg-neutral-950/90 border-neutral-800 text-cyan-300'
              }`}
            >
              {formatNum(value[1], step)}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-lg border ${
          disabled ? 'opacity-45 pointer-events-none' : ''
        } ${
          isLight
            ? 'bg-white/80 border-neutral-200'
            : 'bg-neutral-900/55 border-neutral-800/90'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-semibold truncate ${
              isLight ? 'text-neutral-700' : 'text-neutral-200'
            }`}
          >
            {label}
          </span>
          <span className="text-[10px] font-mono opacity-45">
            Enter to apply • Range [{sliderMin} .. {sliderMax}]
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Left numeric input (Min, no spinner arrows) */}
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={commitMinText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitMinText();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={inputClass}
            title="Minimum value (type any number and press Enter)"
          />

          {/* Bidirectional Dual-Grabber Slider Track */}
          <div
            ref={trackRef}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerCancel={handleTrackPointerUp}
            className="relative flex-1 h-6 flex items-center cursor-pointer select-none touch-none"
          >
            {/* Background Track */}
            <div
              className={`w-full h-1.5 rounded-full overflow-hidden ${
                isLight ? 'bg-neutral-200' : 'bg-neutral-800'
              }`}
            />
            {/* Active Range Highlight */}
            <div
              className={`absolute h-1.5 rounded-full pointer-events-none ${
                isLight ? 'bg-cyan-500' : 'bg-cyan-400'
              }`}
              style={{
                left: `${leftFillPct}%`,
                width: `${widthFillPct}%`,
              }}
            />
            {/* Min Grabber Thumb */}
            <div
              className={`absolute -translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 shadow-md transition-transform ${
                activeThumb === 'min' ? 'scale-125' : 'hover:scale-110'
              } ${
                isLight
                  ? 'bg-white border-cyan-600'
                  : 'bg-neutral-950 border-cyan-400'
              }`}
              style={{ left: `${minPct}%` }}
              title={`Min: ${formatNum(value[0], step)}`}
            />
            {/* Max Grabber Thumb */}
            <div
              className={`absolute -translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 shadow-md transition-transform ${
                activeThumb === 'max' ? 'scale-125' : 'hover:scale-110'
              } ${
                isLight
                  ? 'bg-white border-amber-500'
                  : 'bg-neutral-950 border-amber-400'
              }`}
              style={{ left: `${maxPct}%` }}
              title={`Max: ${formatNum(value[1], step)}`}
            />
          </div>

          {/* Right numeric input (Max, no spinner arrows) */}
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={commitMaxText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitMaxText();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={inputClass}
            title="Maximum value (type any number and press Enter)"
          />
        </div>
      </div>
    );
  }
);

DualThumbRangeSliderRow.displayName = 'DualThumbRangeSliderRow';
