import React, { createContext, useContext } from 'react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:PrecisionDigitPicker' as const;

export interface TunerPrecisionContextValue {
  step: number;
  setStep: (step: number) => void;
}

export const TunerPrecisionContext = createContext<TunerPrecisionContextValue | null>(null);

export const useTunerPrecision = (fallbackStep = 0.001): TunerPrecisionContextValue => {
  const ctx = useContext(TunerPrecisionContext);
  if (!ctx) {
    return {
      step: fallbackStep,
      setStep: () => {},
    };
  }
  return ctx;
};

export function getDecimalPlaces(v: number | string): number {
  const s = String(v);
  if (s.includes('e-')) {
    const parts = s.split('e-');
    return parseInt(parts[1], 10) || 0;
  }
  const parts = s.split('.');
  return parts.length > 1 ? parts[1].length : 0;
}

export interface PrecisionDigitOption {
  val: number;
  digit: string;
  name: string;
  delta: string;
}

export const PRECISION_DIGITS: PrecisionDigitOption[] = [
  { val: 1.0, digit: '1', name: 'Units', delta: '±1.0' },
  { val: 0.1, digit: '0', name: 'Tenths', delta: '±0.1' },
  { val: 0.01, digit: '0', name: 'Hundredths', delta: '±0.01' },
  { val: 0.001, digit: '0', name: 'Thousandths', delta: '±0.001' },
  { val: 0.0001, digit: '0', name: 'Ten-Thousandths', delta: '±0.0001' },
  { val: 0.00001, digit: '0', name: 'Hundred-Thousandths', delta: '±0.00001' },
];

export type PrecisionAccentColor = 'emerald' | 'amber' | 'neutral' | 'sky';

export interface PrecisionDigitPickerProps {
  step: number;
  onStepChange: (step: number) => void;
  label?: string;
  subtitle?: string;
  digits?: PrecisionDigitOption[];
  colorScheme?: PrecisionAccentColor;
  compact?: boolean;
  isLight?: boolean;
  className?: string;
}

/**
 * PrecisionDigitPicker
 * Modularized from legacy DriftwoodsTunerControls:
 * Interactive "1 . 0 0 0 0 0" digital strip that lets users or developers pick exact
 * decimal step granularity (±1.0 down to ±0.00001) without floating-point truncation.
 */
export const PrecisionDigitPicker: React.FC<PrecisionDigitPickerProps> = React.memo(({
  step,
  onStepChange,
  label = 'Precision Step',
  subtitle = 'Select target digit to adjust step precision',
  digits = PRECISION_DIGITS,
  colorScheme = 'emerald',
  compact = false,
  isLight = false,
  className = '',
}) => {
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;
  const currentItem =
    digits.find((d) => Math.abs(d.val - step) < 0.0000001) || digits[Math.min(3, digits.length - 1)];

  const getAccentClasses = () => {
    if (colorScheme === 'amber') {
      return {
        title: 'text-amber-500',
        badge: isLight
          ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
          : 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        activeBtn: 'bg-amber-500 text-neutral-950 shadow-sm ring-2 ring-amber-400/80 scale-105',
        dot: 'text-amber-500',
      };
    }
    if (colorScheme === 'sky') {
      return {
        title: 'text-sky-500',
        badge: isLight
          ? 'bg-sky-500/15 text-sky-700 border-sky-500/30'
          : 'bg-sky-500/20 text-sky-400 border-sky-500/30',
        activeBtn: 'bg-sky-500 text-white shadow-sm ring-2 ring-sky-400/80 scale-105',
        dot: 'text-sky-500',
      };
    }
    if (colorScheme === 'neutral') {
      return {
        title: isLight ? 'text-neutral-900' : 'text-neutral-100',
        badge: isLight
          ? 'bg-neutral-200 text-neutral-800 border-neutral-300'
          : 'bg-neutral-800 text-neutral-200 border-neutral-700',
        activeBtn: isLight
          ? 'bg-neutral-900 text-white shadow-sm ring-2 ring-neutral-400 scale-105'
          : 'bg-white text-neutral-950 shadow-sm ring-2 ring-neutral-400 scale-105',
        dot: isLight ? 'text-neutral-900' : 'text-white',
      };
    }
    // default 'emerald'
    return {
      title: 'text-emerald-500',
      badge: isLight
        ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      activeBtn: 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-400/80 scale-105',
      dot: 'text-emerald-500',
    };
  };

  const accent = getAccentClasses();
  const unitDigit = digits[0];
  const fractionalDigits = digits.slice(1);

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="precision-digit-picker"
      className={`p-2.5 ${UI_RADIUS.lg} border flex flex-col gap-1.5 select-none transition-colors ${
        isLight
          ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
          : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
      } ${className}`}
    >
      {!compact && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`font-bold text-[10px] uppercase tracking-wider shrink-0 ${accent.title}`}>
              {label}
            </span>
            {subtitle && (
              <span className={`text-[10px] truncate ${theme.textMuted}`}>
                {subtitle}
              </span>
            )}
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 ${UI_RADIUS.sm} font-mono font-bold border shrink-0 ${accent.badge}`}>
            {currentItem.delta} ({currentItem.name})
          </span>
        </div>
      )}

      {/* 1 . 0 0 0 0 0 interactive digital strip */}
      <div
        className={`flex items-center justify-center p-1.5 ${UI_RADIUS.md} border gap-1 ${
          isLight ? 'bg-neutral-200/60 border-neutral-300/80' : 'bg-neutral-950/80 border-neutral-800'
        }`}
      >
        {/* Integer button: 1 */}
        {unitDigit && (
          <button
            type="button"
            onClick={() => onStepChange(unitDigit.val)}
            title={`${unitDigit.name} (Step ${unitDigit.delta})`}
            className={`h-7 px-3 ${UI_RADIUS.sm} text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center outline-none ${
              Math.abs(step - unitDigit.val) < 0.0000001
                ? accent.activeBtn
                : isLight
                ? 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200/80'
                : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <span>{unitDigit.digit}</span>
          </button>
        )}

        {/* Decimal point */}
        <span className={`font-mono font-black text-base px-0.5 leading-none ${accent.dot}`}>.</span>

        {/* Fractional zero buttons: 0 0 0 0 0 */}
        {fractionalDigits.map((d, idx) => {
          const isSelected = Math.abs(step - d.val) < 0.0000001;
          return (
            <button
              key={d.val}
              type="button"
              onClick={() => onStepChange(d.val)}
              title={`Digit ${idx + 1}: ${d.name} (Step ${d.delta})`}
              className={`h-7 px-3 ${UI_RADIUS.sm} text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center outline-none ${
                isSelected
                  ? accent.activeBtn
                  : isLight
                  ? 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200/80'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
              }`}
            >
              <span>{d.digit}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

PrecisionDigitPicker.displayName = 'PrecisionDigitPicker';
