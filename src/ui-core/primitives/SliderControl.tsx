import React, { useState, useEffect, useContext, useRef } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { TunerPrecisionContext, getDecimalPlaces } from './PrecisionDigitPicker';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:SliderControl' as const;

export type SliderColorScheme = 'neutral' | 'amber' | 'orange' | 'sky' | 'emerald' | 'rose';
export type SliderVariation = 'default' | 'centered' | 'bipolar';

export interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (val: number) => void;
  description?: string;
  showStepper?: boolean;
  isLight?: boolean;
  disabled?: boolean;
  colorScheme?: SliderColorScheme;
  negativeColorScheme?: SliderColorScheme;
  variation?: SliderVariation;
  variant?: SliderVariation;
  origin?: number;
  showOriginIndicator?: boolean;
  allowOriginReset?: boolean;
  formatValue?: (val: number) => string;
  showSign?: boolean;
  editable?: boolean;
  allowOutOfBoundsInput?: boolean;
  usePrecisionContext?: boolean;
  extraAction?: React.ReactNode;
  className?: string;
}

export const SliderControl: React.FC<SliderControlProps> = React.memo(({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  description,
  showStepper = true,
  isLight,
  disabled = false,
  colorScheme = 'neutral',
  negativeColorScheme,
  variation,
  variant,
  origin,
  showOriginIndicator,
  allowOriginReset,
  formatValue,
  showSign = false,
  editable = true,
  usePrecisionContext = false,
  className = '',
}) => {
  const precisionCtx = useContext(TunerPrecisionContext);
  const activeStep = usePrecisionContext && precisionCtx ? precisionCtx.step : step;

  const resolvedIsLight =
    isLight !== undefined
      ? isLight
      : typeof document !== 'undefined'
      ? document.documentElement.classList.contains('light') || document.documentElement.dataset.theme === 'light'
      : false;
  const theme = resolvedIsLight ? UI_THEME.light : UI_THEME.dark;

  const rawVariation = variation ?? variant ?? (origin !== undefined ? 'centered' : 'default');
  const isCentered = rawVariation === 'centered' || rawVariation === 'bipolar';

  const resolvedOrigin =
    origin !== undefined
      ? origin
      : min <= 0 && max >= 0
      ? 0
      : (min + max) / 2;

  const clampedOrigin = Math.max(min, Math.min(max, resolvedOrigin));
  const clampedValue = Math.max(min, Math.min(max, Number.isFinite(value) ? value : resolvedOrigin));
  const totalRange = max - min;
  const originPct = totalRange > 0 ? ((clampedOrigin - min) / totalRange) * 100 : 50;
  const valuePct = totalRange > 0 ? ((clampedValue - min) / totalRange) * 100 : 50;

  const fillLeft = Math.min(originPct, valuePct);
  const fillWidth = Math.abs(valuePct - originPct);
  const shouldShowOrigin = showOriginIndicator ?? isCentered;
  const canResetOrigin = allowOriginReset ?? isCentered;

  const formatInputValue = (val: number) => {
    if (formatValue) return formatValue(val);
    return String(val);
  };

  const [inputText, setInputText] = useState<string>(() => formatInputValue(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const skipNextBlurCommitRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setInputText(formatInputValue(value));
    }
  }, [value, isFocused]);

  const stepByDelta = (delta: number) => {
    const currentVal = typeof value === 'number' && Number.isFinite(value) ? value : clampedOrigin;
    const existingDecimals = Math.max(getDecimalPlaces(currentVal), getDecimalPlaces(inputText));
    const stepDecimals = getDecimalPlaces(activeStep);
    const targetDecimals = Math.min(8, Math.max(existingDecimals, stepDecimals));
    const nextVal = Number((currentVal + delta).toFixed(targetDecimals));
    onChange(nextVal);
    setInputText(formatInputValue(nextVal));
  };

  const handleDecrement = () => stepByDelta(-activeStep);
  const handleIncrement = () => stepByDelta(activeStep);

  const commitInputText = () => {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }
    setIsFocused(false);
    const trimmed = inputText.trim();
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      onChange(parsed);
      setInputText(formatInputValue(parsed));
    } else {
      if (trimmed !== '') {
        console.error(`[SliderControl] Invalid numeric input for "${label}": "${inputText}"`);
      }
      setInputText(formatInputValue(value));
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitInputText();
      skipNextBlurCommitRef.current = true;
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInputText(formatInputValue(value));
      setIsFocused(false);
      skipNextBlurCommitRef.current = true;
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepByDelta(activeStep);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepByDelta(-activeStep);
    }
  };

  // Format readout badge value
  const displayValue = () => {
    if (formatValue) return formatValue(value);
    if (showSign && value > 0) return `+${value}`;
    return `${value}`;
  };

  // Resolve track active range color
  const resolveSchemeClass = (scheme: SliderColorScheme | string) => {
    if (scheme === 'amber') return 'bg-amber-500';
    if (scheme === 'orange') return 'bg-orange-500';
    if (scheme === 'sky') return 'bg-sky-500';
    if (scheme === 'emerald') return 'bg-emerald-500';
    if (scheme === 'rose') return 'bg-rose-500';
    // 'neutral' (default monochrome black-and-white scheme)
    return resolvedIsLight ? 'bg-neutral-900' : 'bg-white';
  };

  const getRangeColorClass = () => {
    if (isCentered && value < clampedOrigin && negativeColorScheme) {
      return resolveSchemeClass(negativeColorScheme);
    }
    return resolveSchemeClass(colorScheme);
  };

  const isOffOrigin = Math.abs(value - clampedOrigin) > 1e-6;
  const stepperBtnClasses = [
    'inline-flex items-center justify-center h-7 w-7 border transition-all active:scale-95',
    'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
    'dark:focus-visible:ring-neutral-500 shrink-0',
    UI_RADIUS.md,
    resolvedIsLight
      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200',
  ].join(' ');

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="slider-control"
      data-variation={isCentered ? 'centered' : 'default'}
      data-tuner-label={label}
      data-tuner-value={String(value)}
      data-tuner-unit={unit || undefined}
      className={`flex flex-col gap-2 w-full select-none ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            title={label}
            className={`font-semibold truncate ${theme.textPrimary}`}
          >
            {label}
          </span>
          {isCentered && canResetOrigin && isOffOrigin && (
            <button
              type="button"
              onClick={() => {
                onChange(clampedOrigin);
                setInputText(String(clampedOrigin));
              }}
              title={`Reset to origin (${clampedOrigin}${unit})`}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 ${UI_RADIUS.sm} text-[10px] font-mono border transition-colors cursor-pointer ${
                resolvedIsLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border-neutral-700'
              }`}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>{clampedOrigin}{unit}</span>
            </button>
          )}
          {usePrecisionContext && precisionCtx && isFocused && (
            <span className={`text-[9px] px-1 py-0.2 ${UI_RADIUS.sm} bg-emerald-500/20 text-emerald-500 font-mono`}>
              ±{activeStep}
            </span>
          )}
        </div>

        {editable ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="text"
              value={inputText}
              onFocus={() => setIsFocused(true)}
              onBlur={commitInputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleInputKeyDown}
              title={`Step: ±${activeStep}. Press Up/Down arrows to step or Enter to commit.`}
              className={`w-16 px-1.5 py-0.5 text-right font-mono text-[11px] ${UI_RADIUS.sm} border outline-none transition-colors ${
                resolvedIsLight
                  ? 'bg-white text-neutral-800 border-neutral-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40'
              }`}
            />
            {unit && (
              <span className={`font-mono text-[10px] ${theme.textMuted}`}>
                {unit}
              </span>
            )}
          </div>
        ) : (
          <span
            className={`font-mono text-[11px] px-2 py-0.5 ${UI_RADIUS.sm} border transition-colors shrink-0 ${
              resolvedIsLight
                ? 'bg-neutral-100 text-neutral-800 border-neutral-300 shadow-2xs'
                : 'bg-neutral-900 text-neutral-300 border-neutral-700'
            }`}
          >
            {displayValue()}
            {unit}
          </span>
        )}
      </div>

      {description && (
        <span className={`text-[11px] leading-snug ${theme.textMuted}`}>
          {description}
        </span>
      )}

      <div className="flex items-center gap-3">
        {showStepper && (
          <button
            type="button"
            aria-label="Decrement"
            onClick={handleDecrement}
            className={stepperBtnClasses}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}

        <SliderPrimitive.Root
          value={[clampedValue]}
          min={min}
          max={max}
          step={Math.min(step, activeStep)}
          onDoubleClick={() => {
            if (canResetOrigin) {
              onChange(clampedOrigin);
              setInputText(String(clampedOrigin));
            }
          }}
          onValueChange={(vals) => {
            const rawVal = vals[0];
            const effStep = Math.min(step, activeStep);
            const decimals = getDecimalPlaces(effStep);
            const rounded = decimals > 0 ? parseFloat(rawVal.toFixed(Math.min(8, decimals))) : rawVal;
            onChange(rounded);
            if (!isFocused) {
              setInputText(formatInputValue(rounded));
            }
          }}
          className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
        >
          <SliderPrimitive.Track
            className={`relative grow ${UI_RADIUS.full} h-2 overflow-hidden transition-colors ${
              resolvedIsLight ? 'bg-neutral-200' : 'bg-neutral-800'
            }`}
          >
            {isCentered ? (
              <>
                {shouldShowOrigin && (
                  <div
                    className={`absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-10 pointer-events-none transition-colors ${
                      resolvedIsLight ? 'bg-neutral-400' : 'bg-neutral-500'
                    }`}
                    style={{ left: `${originPct}%` }}
                  />
                )}
                <div
                  className={`absolute h-full ${UI_RADIUS.full} transition-colors ${getRangeColorClass()}`}
                  style={{
                    left: `${fillLeft}%`,
                    width: `${fillWidth}%`,
                  }}
                />
              </>
            ) : (
              <SliderPrimitive.Range className={`absolute h-full ${UI_RADIUS.full} transition-colors ${getRangeColorClass()}`} />
            )}
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className={[
              'block h-4 w-4 border shadow-sm transition-transform hover:scale-110',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500',
              UI_RADIUS.full,
              resolvedIsLight ? 'bg-white border-neutral-400 shadow-xs' : 'bg-neutral-100 border-neutral-300',
            ].join(' ')}
          />
        </SliderPrimitive.Root>

        {showStepper && (
          <button
            type="button"
            aria-label="Increment"
            onClick={handleIncrement}
            className={stepperBtnClasses}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

SliderControl.displayName = 'SliderControl';
