import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { lookupLucideIcon } from './iconLookup';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:DualGrabberSlider' as const;

export type DualGrabberColorScheme = 'neutral' | 'amber' | 'orange' | 'emerald' | 'sky' | 'rose';
export type DualGrabberMode = 'centered-deadband' | 'free-range';

export interface DualGrabberSliderProps {
  label: string;
  subtitle?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  iconName?: string;
  iconColor?: string;
  value: [number, number];
  defaultValue?: [number, number];
  onChange: (val: [number, number]) => void;
  target?: number;
  min?: number;
  max?: number;
  step?: number;
  origin?: number;
  unit?: string;
  mode?: DualGrabberMode;
  colorScheme?: DualGrabberColorScheme;
  showTicks?: boolean;
  domainBadge?: string;
  showDomainBadge?: boolean;
  bordered?: boolean;
  showDescription?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  formatWindowBadge?: (val: [number, number], origin: number) => string | null;
  onHover?: () => void;
  onLeave?: () => void;
  isLight?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DualGrabberSlider: React.FC<DualGrabberSliderProps> = React.memo(({
  label,
  subtitle,
  description,
  icon,
  iconName,
  iconColor,
  value,
  onChange,
  target,
  min: propMin,
  max: propMax,
  step = 1,
  origin: propOrigin,
  unit = '',
  mode = 'centered-deadband',
  colorScheme = 'amber',
  showTicks = true,
  domainBadge,
  showDomainBadge: propShowDomainBadge,
  bordered: propBordered,
  showDescription: propShowDescription,
  leftLabel = 'Catch-up',
  rightLabel = 'Skip',
  formatWindowBadge,
  onHover,
  onLeave,
  isLight = false,
  disabled = false,
  className = '',
}) => {
  const store = useSettingActionRowStore();
  const isBordered = propBordered ?? (store.bordered || store.advancedBordered);
  const shouldShowDesc = propShowDescription ?? store.showDescription;
  const shouldShowDomainBadge = propShowDomainBadge ?? store.advancedShowBadges;
  const padX = store.paddingX;
  const padY = store.paddingY;
  const radius = store.borderRadius;
  const resolvedIconSize = store.iconSize;
  const resolvedIconGap = store.iconGap;
  const resolvedTitleFontSize = store.titleFontSize;
  const resolvedDescFontSize = store.descriptionFontSize;
  const effectiveColor = (iconColor ?? store.defaultIconColor ?? '').trim();
  const isTailwindTextColor = effectiveColor.startsWith('text-');
  const iconColorClass = effectiveColor
    ? isTailwindTextColor
      ? effectiveColor
      : ''
    : isLight
    ? 'text-neutral-500 group-hover:text-neutral-700'
    : 'text-neutral-400 group-hover:text-neutral-200';
  const iconInlineStyle: React.CSSProperties = {
    width: `${resolvedIconSize}px`,
    height: `${resolvedIconSize}px`,
    ...(effectiveColor && !isTailwindTextColor ? { color: effectiveColor } : {}),
  };

  const renderLeadingIcon = () => {
    const namedComp = iconName ? lookupLucideIcon(iconName) : null;
    const IconCandidate = namedComp ?? icon;
    if (!IconCandidate) return null;
    if (
      typeof IconCandidate === 'function' ||
      (typeof IconCandidate === 'object' &&
        IconCandidate !== null &&
        '$$typeof' in IconCandidate &&
        !React.isValidElement(IconCandidate))
    ) {
      const Comp = IconCandidate as React.ComponentType<{
        className?: string;
        style?: React.CSSProperties;
      }>;
      return (
        <Comp
          className={`shrink-0 transition-colors ${iconColorClass}`}
          style={iconInlineStyle}
        />
      );
    }
    if (React.isValidElement(IconCandidate)) {
      return (
        <span
          className={`inline-flex items-center justify-center shrink-0 transition-colors ${iconColorClass}`}
          style={iconInlineStyle}
        >
          {IconCandidate}
        </span>
      );
    }
    return null;
  };

  const alpha = target !== undefined ? Math.max(1, Math.round(target)) : undefined;
  const min = alpha !== undefined ? -alpha : (propMin ?? -5);
  const max = alpha !== undefined ? alpha : (propMax ?? 5);
  const origin = propOrigin !== undefined ? propOrigin : min <= 0 && max >= 0 ? 0 : (min + max) / 2;

  const stepDecimals = (String(step).split('.')[1] || '').length;
  const roundStep = (v: number) => {
    const snapped = Math.round((v - min) / step) * step + min;
    return stepDecimals > 0 ? parseFloat(snapped.toFixed(stepDecimals)) : Math.round(snapped);
  };

  const leftVal =
    mode === 'centered-deadband'
      ? Math.max(min, Math.min(origin, roundStep(value[0])))
      : Math.max(min, Math.min(max, roundStep(Math.min(value[0], value[1]))));

  const rightVal =
    mode === 'centered-deadband'
      ? Math.max(origin, Math.min(max, roundStep(value[1])))
      : Math.max(min, Math.min(max, roundStep(Math.max(value[0], value[1]))));

  const handleSliderChange = (vals: number[]) => {
    if (!Array.isArray(vals) || vals.length < 2) return;
    if (mode === 'centered-deadband') {
      const nextLeft = Math.max(min, Math.min(origin, roundStep(vals[0])));
      const nextRight = Math.max(origin, Math.min(max, roundStep(vals[1])));
      onChange([nextLeft, nextRight]);
    } else {
      const nextLeft = Math.max(min, Math.min(max, roundStep(Math.min(vals[0], vals[1]))));
      const nextRight = Math.max(min, Math.min(max, roundStep(Math.max(vals[0], vals[1]))));
      onChange([nextLeft, nextRight]);
    }
  };

  // Generate tick markers
  const ticks: number[] = [];
  if (showTicks) {
    const totalSteps = Math.round((max - min) / step);
    const tickStride = totalSteps > 12 ? Math.ceil(totalSteps / 8) * step : step;
    for (let t = min; t <= max + 1e-7; t += tickStride) {
      ticks.push(stepDecimals > 0 ? parseFloat(t.toFixed(stepDecimals)) : Math.round(t));
    }
    if (mode === 'centered-deadband' && !ticks.includes(origin)) {
      ticks.push(origin);
      ticks.sort((a, b) => a - b);
    }
  }

  const totalRange = Math.max(1e-6, max - min);
  const originPct = ((origin - min) / totalRange) * 100;

  const getRangeColorClass = () => {
    if (colorScheme === 'neutral') return isLight ? 'bg-neutral-900' : 'bg-white';
    if (colorScheme === 'orange') return 'bg-orange-500';
    if (colorScheme === 'sky') return 'bg-sky-500';
    if (colorScheme === 'emerald') return 'bg-emerald-500';
    return 'bg-amber-500';
  };

  const getAccentTextClass = () => {
    if (colorScheme === 'neutral') return isLight ? 'text-neutral-900' : 'text-white';
    if (colorScheme === 'orange') return 'text-orange-500';
    if (colorScheme === 'sky') return 'text-sky-500';
    if (colorScheme === 'emerald') return 'text-emerald-500';
    return 'text-amber-500';
  };

  const resolvedDomainBadge =
    domainBadge !== undefined
      ? domainBadge
      : alpha !== undefined
      ? '[-α .. +α]'
      : mode === 'centered-deadband'
      ? `[${min}${unit} .. +${max}${unit}]`
      : undefined;

  const resolvedWindowBadge =
    formatWindowBadge !== undefined
      ? formatWindowBadge([leftVal, rightVal], origin)
      : alpha !== undefined
      ? `Window: [${alpha + leftVal}..${alpha + rightVal}]`
      : `Span: ${(rightVal - leftVal).toFixed(stepDecimals)}${unit}`;

  const formatSigned = (v: number, isPositiveSide: boolean) => {
    if (mode === 'centered-deadband') {
      if (v === origin) return isPositiveSide ? `+${origin}${unit}` : `-${origin}${unit}`;
      return v > 0 ? `+${v}${unit}` : `${v}${unit}`;
    }
    return `${v}${unit}`;
  };

  const resolvedSubtitle = subtitle ?? description;
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="dual-grabber-slider"
      style={{
        paddingLeft: `${Math.max(0, padX)}px`,
        paddingRight: `${Math.max(0, padX)}px`,
        paddingTop: `${Math.max(4, padY)}px`,
        paddingBottom: `${Math.max(4, padY)}px`,
        borderRadius: `${Math.max(0, radius)}px`,
      }}
      className={`group flex flex-col gap-2 w-full select-none transition-colors duration-150 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${
        isBordered
          ? isLight
            ? 'border bg-neutral-50/90 border-neutral-200 hover:bg-neutral-100/80 shadow-2xs'
            : 'border bg-neutral-850/80 hover:bg-neutral-800/90 border-neutral-700/80'
          : isLight
          ? 'border border-transparent bg-transparent hover:bg-neutral-900/[0.055]'
          : 'border border-transparent bg-transparent hover:bg-white/[0.06]'
      } ${className}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Header with Title and Readout Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div
          className="flex items-center min-w-0 pr-2 flex-1"
          style={{ gap: `${resolvedIconGap}px` }}
        >
          {renderLeadingIcon()}
          <div className="flex flex-col text-left leading-snug min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={{ fontSize: `${resolvedTitleFontSize}px` }}
                className={`font-semibold transition-colors ${
                  isLight
                    ? 'text-neutral-800 group-hover:text-neutral-950'
                    : 'text-neutral-200 group-hover:text-white'
                }`}
              >
                {label}
              </span>
              {shouldShowDomainBadge && resolvedDomainBadge && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 ${UI_RADIUS.sm} border uppercase tracking-wider font-semibold bg-amber-500/15 border-amber-500/30 text-amber-500`}>
                  {resolvedDomainBadge}
                </span>
              )}
            </div>
            {shouldShowDesc && resolvedSubtitle && (
              <span
                style={{ fontSize: `${resolvedDescFontSize}px` }}
                className={`mt-0.5 truncate ${theme.textMuted}`}
              >
                {resolvedSubtitle}
              </span>
            )}
          </div>
        </div>

        {/* Readout Badges */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0 self-start sm:self-center">
          <span
            className={`font-mono text-[11px] px-2 py-0.5 ${UI_RADIUS.sm} border ${
              isLight
                ? 'bg-white text-neutral-800 border-neutral-300'
                : 'bg-neutral-950 text-neutral-200 border-neutral-700'
            }`}
          >
            {leftLabel}: <strong className={getAccentTextClass()}>{formatSigned(leftVal, false)}</strong>
          </span>
          <span
            className={`font-mono text-[11px] px-2 py-0.5 ${UI_RADIUS.sm} border ${
              isLight
                ? 'bg-white text-neutral-800 border-neutral-300'
                : 'bg-neutral-950 text-neutral-200 border-neutral-700'
            }`}
          >
            {rightLabel}: <strong className={getAccentTextClass()}>{formatSigned(rightVal, true)}</strong>
          </span>
          {resolvedWindowBadge && (
            <span
              className={`font-mono text-[11px] px-2 py-0.5 ${UI_RADIUS.sm} border font-semibold ${
                isLight
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-amber-950/40 text-amber-300 border-amber-700/50'
              }`}
            >
              {resolvedWindowBadge}
            </span>
          )}
        </div>
      </div>

      {/* Slider Track with Dual Thumbs */}
      <div className="flex flex-col gap-1 w-full pt-1 px-1">
        <SliderPrimitive.Root
          value={[leftVal, rightVal]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValueChange={handleSliderChange}
          className="relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
        >
          {/* Base Track */}
          <SliderPrimitive.Track
            className={`relative grow ${UI_RADIUS.full} h-2 overflow-hidden ${
              isLight ? 'bg-neutral-200' : 'bg-neutral-800'
            }`}
          >
            {/* Center Origin Notch */}
            {mode === 'centered-deadband' && (
              <div
                className={`absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-10 pointer-events-none ${
                  isLight ? 'bg-neutral-500' : 'bg-neutral-400'
                }`}
                style={{ left: `${originPct}%` }}
              />
            )}

            {/* Active Range (Deadband / Interval Zone) */}
            <SliderPrimitive.Range
              className={`absolute h-full ${UI_RADIUS.full} transition-colors ${getRangeColorClass()}`}
            />
          </SliderPrimitive.Track>

          {/* Left Thumb */}
          <SliderPrimitive.Thumb
            aria-label={`${leftLabel} thumb`}
            className={`block h-4 w-4 ${UI_RADIUS.full} border shadow-sm transition-transform hover:scale-110 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-grab active:cursor-grabbing ${
              isLight ? 'bg-white border-neutral-400' : 'bg-neutral-100 border-neutral-300'
            }`}
          />

          {/* Right Thumb */}
          <SliderPrimitive.Thumb
            aria-label={`${rightLabel} thumb`}
            className={`block h-4 w-4 ${UI_RADIUS.full} border shadow-sm transition-transform hover:scale-110 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-grab active:cursor-grabbing ${
              isLight ? 'bg-white border-neutral-400' : 'bg-neutral-100 border-neutral-300'
            }`}
          />
        </SliderPrimitive.Root>

        {/* Axis Ticks and Labels */}
        {showTicks && ticks.length > 0 && (
          <div className="flex items-center justify-between text-[10px] font-mono px-0.5 text-neutral-400 select-none">
            {ticks.map((t) => {
              const isOrigin = Math.abs(t - origin) < 1e-6;
              const isSelected = Math.abs(t - leftVal) < 1e-6 || Math.abs(t - rightVal) < 1e-6;
              return (
                <span
                  key={t}
                  className={`transition-colors ${
                    isOrigin
                      ? `font-bold ${getAccentTextClass()} scale-105`
                      : isSelected
                      ? isLight
                        ? 'font-bold text-neutral-900'
                        : 'font-bold text-neutral-100'
                      : 'opacity-60'
                  }`}
                >
                  {isOrigin && mode === 'centered-deadband'
                    ? `${t} (Target)`
                    : t > 0 && mode === 'centered-deadband'
                    ? `+${t}`
                    : t}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

DualGrabberSlider.displayName = 'DualGrabberSlider';
