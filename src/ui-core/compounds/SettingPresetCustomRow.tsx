import React, { useState, useEffect } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { SegmentedSwitch, type SegmentedSwitchOption } from '../primitives/SegmentedSwitch';
import { SettingActionRow } from './SettingActionRow';
import {
  useSettingActionRowStore,
  type PresetCustomVariation,
} from '../stores/settingRowStore';
import { getDecimalPlaces } from '../primitives/PrecisionDigitPicker';
import { UI_RADIUS } from '../tokens/radius';

export const ALPHA_COMPONENT_ID = 'Alpha:SettingPresetCustomRow' as const;

export interface PresetNumberOption {
  value: number;
  label: string;
}

export interface SettingPresetCustomRowProps {
  /** Primary row title */
  label: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  iconName?: string;
  iconColor?: string;
  badge?: React.ReactNode;
  /** Current numeric value (e.g. 100 for UI Scaling, 50 for Render Scale) */
  value: number;
  /** Numeric presets (e.g. [100, 125, 150] or [25, 50, 75]) */
  presets: PresetNumberOption[];
  /** Default numeric value to jump to if user clicks Custom while on a preset (optional) */
  defaultCustomValue?: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Optional variation override */
  variation?: PresetCustomVariation;
  /** Optional custom slider width override in px (defaults to store.presetCustomSliderWidth) */
  customSliderWidth?: number;
  /** Optional custom row label */
  customRowLabel?: string;
  disabled?: boolean;
  bordered?: boolean;
  showDescription?: boolean;
  onChange: (val: number) => void;
  hoverDescription?: string;
  customHoverDescription?: string;
  onHover?: (desc?: string) => void;
  onLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * [L1/L3 Decoupled Primitive] SettingPresetCustomRow
 * Shared component for settings that offer discrete presets plus a continuous `Custom` slider
 * (used by both `UI Scaling` and `Render Scale` in Display Settings so updating one updates both).
 *
 * Uses the `slide-reveal` interaction: clicking `Custom` shifts the segmented control smoothly to the left
 * while a slider + readout emerges from behind on the right and merges into a unified single-row bar.
 */
export const SettingPresetCustomRow: React.FC<SettingPresetCustomRowProps> = React.memo(({
  label,
  title,
  subtitle,
  description,
  icon,
  iconName,
  iconColor,
  badge,
  value,
  presets,
  defaultCustomValue,
  min,
  max,
  step = 1,
  unit = '%',
  customSliderWidth: propSliderWidth,
  disabled = false,
  bordered,
  showDescription,
  onChange,
  hoverDescription,
  customHoverDescription,
  onHover,
  onLeave,
  isLight = false,
  className = '',
}) => {
  const store = useSettingActionRowStore();
  const sliderWidth = propSliderWidth ?? store.presetCustomSliderWidth;
  const animDurationMs = store.presetCustomAnimDuration;
  const valueFontSize = store.sliderValueFontSize;

  const isPresetMatch = presets.some((p) => p.value === value);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(() => !isPresetMatch);
  const [mergedShell, setMergedShell] = useState<boolean>(() => !isPresetMatch);

  // Sync if external value changes to a non-preset
  useEffect(() => {
    if (!presets.some((p) => p.value === value)) {
      setIsCustomMode(true);
    }
  }, [value, presets]);

  // Manage background merge phase for 'slide-reveal':
  // While shifting left, the segmented control keeps its own background, then dissolves into the unified trough
  useEffect(() => {
    if (isCustomMode) {
      const timer = setTimeout(() => {
        setMergedShell(true);
      }, Math.max(120, animDurationMs));
      return () => clearTimeout(timer);
    } else {
      setMergedShell(false);
    }
  }, [isCustomMode, animDurationMs]);

  const activeSegmentValue = isCustomMode || !isPresetMatch ? 'custom' : String(value);

  const handleSegmentSelect = (segVal: string) => {
    if (segVal === 'custom') {
      setIsCustomMode(true);
      if (defaultCustomValue !== undefined && isPresetMatch) {
        onChange(defaultCustomValue);
      }
    } else {
      setIsCustomMode(false);
      setMergedShell(false);
      onChange(Number(segVal));
    }
  };

  const clampedValue = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

  const handleSliderChange = (vals: number[]) => {
    const rawVal = vals[0];
    const decimals = getDecimalPlaces(step);
    const rounded =
      decimals > 0 ? parseFloat(rawVal.toFixed(Math.min(6, decimals))) : rawVal;
    onChange(Math.max(min, Math.min(max, rounded)));
  };

  const segmentedOptions: SegmentedSwitchOption[] = [
    ...presets.map((p) => ({
      value: String(p.value),
      label: p.label,
    })),
    {
      value: 'custom',
      label: 'Custom',
    },
  ];

  const renderInlineSlider = (trackW: number) => (
    <div
      className="flex items-center gap-2 shrink-0"
      style={{ width: `${Math.max(88, trackW)}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <SliderPrimitive.Root
        value={[clampedValue]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={handleSliderChange}
        className="relative flex items-center select-none touch-none grow h-5 cursor-pointer"
      >
        <SliderPrimitive.Track
          className={`relative grow ${UI_RADIUS.full} h-1.5 overflow-hidden transition-colors ${
            isLight ? 'bg-neutral-300/90' : 'bg-neutral-800'
          }`}
        >
          <SliderPrimitive.Range
            className={`absolute h-full ${UI_RADIUS.full} transition-colors ${
              isLight ? 'bg-neutral-900' : 'bg-white'
            }`}
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

      <span
        style={{ fontSize: `${Math.max(10, valueFontSize - 1)}px` }}
        className={`font-mono font-semibold px-1.5 py-0.5 ${UI_RADIUS.sm} border text-right shrink-0 min-w-[44px] ${
          isLight
            ? 'bg-neutral-300/65 text-neutral-700 border-neutral-300/90'
            : 'bg-neutral-800/85 text-neutral-200 border-neutral-700/80'
        }`}
      >
        {clampedValue}
        {unit}
      </span>
    </div>
  );

  // Production implementation: 'slide-reveal'
  // When clicking Custom:
  // A slider is mounted behind on the right; the SegmentedSwitch shifts left with its own background;
  // once it reaches its target offset, because its background matches the unified trough background,
  // they merge seamlessly into a single component with zero extra row height.
  const unifiedTroughClass = isCustomMode
    ? isLight
      ? 'bg-neutral-200/80 border-neutral-300/80'
      : 'bg-neutral-950 border-neutral-800'
    : 'bg-transparent border-transparent';

  return (
    <SettingActionRow
      icon={icon}
      iconName={iconName}
      iconColor={iconColor}
      title={title ?? label}
      badge={badge}
      description={description ?? subtitle}
      bordered={bordered}
      showDescription={showDescription}
      disabled={disabled}
      hoverDescription={isCustomMode ? customHoverDescription ?? hoverDescription : hoverDescription}
      onHover={(desc) => onHover?.(desc)}
      onLeave={onLeave}
      isLight={isLight}
      className={className}
      rightSlot={
        <div
          data-alpha-id={ALPHA_COMPONENT_ID}
          data-variation="slide-reveal"
          style={{ transitionDuration: `${animDurationMs}ms` }}
          className={`relative inline-flex items-center ${UI_RADIUS.md} border transition-all overflow-hidden ${unifiedTroughClass}`}
        >
          {/* Left-shifting SegmentedSwitch: keeps its own background while sliding, then dissolves into the shared trough */}
          <div
            style={{ transitionDuration: `${animDurationMs}ms` }}
            className="relative z-10 shrink-0 transition-transform ease-out"
          >
            <SegmentedSwitch
              value={activeSegmentValue}
              onValueChange={handleSegmentSelect}
              options={segmentedOptions}
              size="sm"
              disabled={disabled}
              isLight={isLight}
              className={
                mergedShell
                  ? '!bg-transparent !border-transparent shadow-none'
                  : 'transition-colors'
              }
            />
          </div>

          {/* Right-side Slider emerging from behind the segmented control */}
          <div
            style={{
              width: isCustomMode ? `${sliderWidth + 16}px` : '0px',
              opacity: isCustomMode ? 1 : 0,
              transitionDuration: `${animDurationMs}ms`,
            }}
            className={`relative z-0 flex items-center overflow-hidden transition-all ease-out ${
              isCustomMode ? ' pl-2 pr-1.5 py-0.5' : 'pointer-events-none'
            }`}
          >
            <div
              className={`h-3.5 w-px mr-2 shrink-0 ${
                isLight ? 'bg-neutral-300/90' : 'bg-neutral-800'
              }`}
            />
            {renderInlineSlider(sliderWidth - 12)}
          </div>
        </div>
      }
    />
  );
});

SettingPresetCustomRow.displayName = 'SettingPresetCustomRow';
