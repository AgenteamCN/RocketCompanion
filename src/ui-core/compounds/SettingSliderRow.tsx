import React, { useState, useEffect } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Minus, Plus } from 'lucide-react';
import { type SliderColorScheme } from '../primitives/SliderControl';
import { SettingActionRow } from './SettingActionRow';
import { useSettingActionRowStore, type SliderRowLayout } from '../stores/settingRowStore';
import { getDecimalPlaces } from '../primitives/PrecisionDigitPicker';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:SettingSliderRow' as const;

export interface SettingSliderRowProps {
  label?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  iconName?: string;
  iconColor?: string;
  badge?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  editable?: boolean;
  developerMode?: boolean;
  layout?: SliderRowLayout;
  trackWidth?: number | string;
  showStepper?: boolean;
  colorScheme?: SliderColorScheme;
  bordered?: boolean;
  showDescription?: boolean;
  paddingX?: number;
  paddingY?: number;
  actionSlot?: React.ReactNode;
  onChange: (val: number) => void;
  hoverDescription?: string;
  onHover?: (desc?: string) => void;
  onLeave?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

export const SettingSliderRow: React.FC<SettingSliderRowProps> = React.memo(({
  label,
  title,
  subtitle,
  description,
  icon,
  iconName,
  iconColor,
  badge,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled = false,
  editable: propEditable,
  developerMode = false,
  layout: propLayout,
  trackWidth: propTrackWidth,
  showStepper: propShowStepper,
  colorScheme = 'neutral',
  bordered: propBordered,
  showDescription: propShowDescription,
  paddingX: propPaddingX,
  paddingY: propPaddingY,
  actionSlot,
  onChange,
  hoverDescription,
  onHover,
  onLeave,
  onMouseEnter,
  onMouseLeave,
  isLight = false,
  className = '',
}) => {
  const store = useSettingActionRowStore();

  const resolvedLayout = propLayout ?? store.sliderLayout;
  const resolvedTrackWidth = propTrackWidth ?? store.sliderTrackWidth;
  const resolvedShowStepper = propShowStepper ?? store.sliderShowStepper;
  const resolvedEditable =
    propEditable !== undefined
      ? propEditable
      : developerMode
      ? store.sliderEditableInDevMode
      : store.sliderEditableInUserMode;
  const valueFontSize = store.sliderValueFontSize;

  const handleHover = (desc?: string) => {
    onHover?.(desc);
    onMouseEnter?.();
  };
  const handleLeave = () => {
    onLeave?.();
    onMouseLeave?.();
  };

  const clampedValue = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  const [inputText, setInputText] = useState<string>(() => String(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const skipNextBlurCommitRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setInputText(String(value));
    }
  }, [value, isFocused]);

  const stepByDelta = (delta: number) => {
    const decimals = Math.min(6, Math.max(getDecimalPlaces(value), getDecimalPlaces(step)));
    const next = Number((value + delta).toFixed(decimals));
    const finalVal = resolvedEditable ? next : Math.max(min, Math.min(max, next));
    onChange(finalVal);
    setInputText(String(finalVal));
  };

  const commitInput = () => {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }
    setIsFocused(false);
    const trimmed = inputText.trim();
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      onChange(parsed);
      setInputText(String(parsed));
    } else {
      if (trimmed !== '') {
        console.error(`[SettingSliderRow] Invalid numeric input for "${String(label ?? title ?? '')}": "${inputText}"`);
      }
      setInputText(String(value));
    }
  };

  const resolveRangeColorClass = () => {
    if (colorScheme === 'amber') return 'bg-amber-500';
    if (colorScheme === 'orange') return 'bg-orange-500';
    if (colorScheme === 'sky') return 'bg-sky-500';
    if (colorScheme === 'emerald') return 'bg-emerald-500';
    if (colorScheme === 'rose') return 'bg-rose-500';
    return isLight ? 'bg-neutral-900' : 'bg-white';
  };

  const renderValueReadout = () => {
    if (resolvedEditable) {
      return (
        <div className="flex items-center gap-1 shrink-0 justify-end min-w-[60px]">
          <input
            type="text"
            value={inputText}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={commitInput}
            onChange={(e) => {
              setInputText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitInput();
                skipNextBlurCommitRef.current = true;
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setInputText(String(value));
                setIsFocused(false);
                skipNextBlurCommitRef.current = true;
                e.currentTarget.blur();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                stepByDelta(step);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                stepByDelta(-step);
              }
            }}
            style={{ fontSize: `${valueFontSize}px` }}
            className={`w-14 px-1.5 py-0.5 text-right font-mono ${UI_RADIUS.badge} border outline-none transition-colors ${
              isLight
                ? `${UI_THEME.light.bgSurface} ${UI_THEME.light.textPrimary} ${UI_THEME.light.borderStrong} focus:border-amber-500`
                : `${UI_THEME.dark.bgSurface} ${UI_THEME.dark.textPrimary} ${UI_THEME.dark.borderStrong} focus:border-amber-500`
            }`}
          />
          {unit && (
            <span
              style={{ fontSize: `${Math.max(10, valueFontSize - 1)}px` }}
              className={`font-mono ${isLight ? UI_THEME.light.textMuted : UI_THEME.dark.textSecondary}`}
            >
              {unit}
            </span>
          )}
        </div>
      );
    }

    return (
      <span
        style={{ fontSize: `${valueFontSize}px` }}
        className={`font-mono font-semibold px-2 py-0.5 ${UI_RADIUS.badge} border text-right shrink-0 min-w-[54px] transition-colors ${
          isLight
            ? 'bg-neutral-100/90 text-neutral-800 border-neutral-300/80'
            : 'bg-white/[0.06] text-neutral-200 border-white/[0.10]'
        }`}
      >
        {value}
        {unit}
      </span>
    );
  };

  const renderTrackControl = (widthStyle?: React.CSSProperties) => (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      className="flex items-center gap-2"
      style={widthStyle}
    >
      {resolvedShowStepper && (
        <button
          type="button"
          aria-label="Decrement"
          onClick={() => stepByDelta(-step)}
          className={`inline-flex items-center justify-center h-6 w-6 ${UI_RADIUS.button} border transition-all active:scale-95 cursor-pointer shrink-0 ${
            isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          <Minus className="h-3 w-3" />
        </button>
      )}

      <SliderPrimitive.Root
        value={[clampedValue]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(vals) => {
          const rawVal = vals[0];
          const decimals = getDecimalPlaces(step);
          const rounded =
            decimals > 0 ? parseFloat(rawVal.toFixed(Math.min(6, decimals))) : rawVal;
          onChange(rounded);
          if (!isFocused) {
            setInputText(String(rounded));
          }
        }}
        className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
      >
        <SliderPrimitive.Track
          className={`relative grow ${UI_RADIUS.full} h-1.5 overflow-hidden transition-colors ${
            isLight ? 'bg-neutral-200/90' : 'bg-neutral-800'
          }`}
        >
          <SliderPrimitive.Range
            className={`absolute h-full ${UI_RADIUS.full} transition-colors ${resolveRangeColorClass()}`}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={`block h-3.5 w-3.5 ${UI_RADIUS.full} border shadow-xs transition-transform hover:scale-110 focus:outline-none ${
            isLight
              ? 'bg-white border-neutral-400'
              : 'bg-neutral-100 border-neutral-300'
          }`}
        />
      </SliderPrimitive.Root>

      {resolvedShowStepper && (
        <button
          type="button"
          aria-label="Increment"
          onClick={() => stepByDelta(step)}
          className={`inline-flex items-center justify-center h-6 w-6 ${UI_RADIUS.button} border transition-all active:scale-95 cursor-pointer shrink-0 ${
            isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  if (resolvedLayout === 'stacked') {
    return (
      <SettingActionRow
        icon={icon}
        iconName={iconName}
        iconColor={iconColor}
        title={title ?? label ?? ''}
        badge={badge}
        description={description ?? subtitle}
        bordered={propBordered}
        showDescription={propShowDescription}
        paddingX={propPaddingX}
        paddingY={propPaddingY}
        disabled={disabled}
        hoverDescription={hoverDescription}
        onHover={handleHover}
        onLeave={handleLeave}
        isLight={isLight}
        className={className}
        rightSlot={
          actionSlot ? (
            <div className="flex items-center gap-2">
              {actionSlot}
              {renderValueReadout()}
            </div>
          ) : (
            renderValueReadout()
          )
        }
        bottomSlot={renderTrackControl({ width: '100%' })}
      />
    );
  }

  const isFlexTrack = typeof resolvedTrackWidth === 'string';

  // Default: 'inline' single-row [Icon + Title] ... [ActionSlot + Slider Track + Value Readout/Input]
  return (
    <SettingActionRow
      icon={icon}
      iconName={iconName}
      iconColor={iconColor}
      title={title ?? label ?? ''}
      badge={badge}
      description={description ?? subtitle}
      bordered={propBordered}
      showDescription={propShowDescription}
      paddingX={propPaddingX}
      paddingY={propPaddingY}
      disabled={disabled}
      hoverDescription={hoverDescription}
      onHover={handleHover}
      onLeave={handleLeave}
      isLight={isLight}
      className={className}
      rightSlot={
        <div className="flex items-center gap-2.5">
          {actionSlot}
          {renderTrackControl(
            isFlexTrack
              ? { width: resolvedTrackWidth, minWidth: '108px' }
              : { width: `${Math.max(80, resolvedTrackWidth)}px` }
          )}
          {renderValueReadout()}
        </div>
      }
    />
  );
});

SettingSliderRow.displayName = 'SettingSliderRow';
