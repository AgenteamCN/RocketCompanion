import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { UI_EASING } from '../tokens/easing';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:SegmentedSwitch' as const;

export interface SegmentedSwitchOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export type SegmentedDistribution = 'auto' | 'equal' | 'justify' | 'proportional';
export type SegmentedRadius = 'sm' | 'md' | 'lg' | 'none';

export interface SegmentedSwitchProps {
  value: string;
  onValueChange?: (val: string) => void;
  onChange?: (val: string) => void;
  options: SegmentedSwitchOption[];
  id?: string;
  ariaLabel?: string;
  isLight?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Width & layout distribution mode:
   * - 'auto': Left-aligned, adapts to content width (longer items occupy more space, shorter items less)
   * - 'equal': Equal width distribution (all items occupy equal width regardless of label length)
   * - 'justify': Equal spacing distribution (items have natural width, spaced evenly across container)
   * - 'proportional': Stretches to fill container while keeping content-proportional widths
   */
  distribution?: SegmentedDistribution;
  /**
   * Convenience flag for 100% width container (defaults to 'equal' distribution if not specified)
   */
  fullWidth?: boolean;
  /**
   * Border radius style. Defaults to rounded rectangle ('md') instead of capsule pill shape.
   */
  radius?: SegmentedRadius;
  className?: string;
}

/**
 * SegmentedSwitch
 * Apple HIG tactile segmented control with animated spring thumb and recessed trough:
 * - Scoped layoutId via useId() allows multiple segmented switches to coexist without thumb stealing.
 * - Rounded rectangle geometry (not capsule pill shape).
 * - Supports 'auto' (left-aligned/content-width), 'equal' (even spacing), and 'proportional' distributions.
 * - Neutral styling with no harsh blue accents.
 */
export const SegmentedSwitch: React.FC<SegmentedSwitchProps> = React.memo(({
  value,
  onValueChange,
  onChange,
  options,
  id,
  ariaLabel = 'Segmented Switch',
  isLight = false,
  disabled = false,
  size = 'md',
  distribution,
  fullWidth = false,
  radius = 'md',
  className = '',
}) => {
  const reactId = useId();
  const instanceId = id || reactId;
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;

  // Determine actual distribution
  const resolvedDistribution: SegmentedDistribution =
    distribution || (fullWidth ? 'equal' : 'auto');

  // Size styling
  const sizeClass =
    size === 'sm'
      ? 'p-0.5 text-xs'
      : size === 'lg'
      ? 'p-1.5 text-sm'
      : 'p-1 text-xs';

  const itemPadding =
    size === 'sm'
      ? 'px-2.5 py-1'
      : size === 'lg'
      ? 'px-4 py-2'
      : 'px-3 py-1.5';

  // Rounded rectangle geometry tokens (explicitly avoiding capsule pill shapes)
  const radiusMap: Record<SegmentedRadius, { container: string; item: string }> = {
    none: { container: UI_RADIUS.none, item: UI_RADIUS.none },
    sm: { container: 'rounded-md', item: UI_RADIUS.sm },
    md: { container: UI_RADIUS.md, item: 'rounded-md' },
    lg: { container: UI_RADIUS.lg, item: UI_RADIUS.md },
  };

  const { container: containerRadius, item: itemRadius } = radiusMap[radius] || radiusMap.md;

  // Distribution container styles
  const containerLayout =
    resolvedDistribution === 'auto'
      ? 'inline-flex items-center'
      : resolvedDistribution === 'justify'
      ? 'flex w-full items-center justify-between'
      : 'flex w-full items-center';

  // Distribution item styles
  const getItemLayout = () => {
    switch (resolvedDistribution) {
      case 'equal':
        return 'flex-1 basis-0 min-w-0';
      case 'proportional':
        return 'flex-auto min-w-fit';
      case 'justify':
        return 'w-auto shrink-0';
      case 'auto':
      default:
        return 'w-auto shrink-0';
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      data-alpha-id={ALPHA_COMPONENT_ID}
      className={`${containerLayout} border ${containerRadius} ${sizeClass} select-none ${
        isLight ? 'bg-neutral-200/80 border-neutral-300/80' : 'bg-neutral-950 border-neutral-800'
      } ${disabled ? 'opacity-45 pointer-events-none cursor-not-allowed' : ''} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        const isOptDisabled = Boolean(disabled || opt.disabled);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            disabled={isOptDisabled}
            aria-checked={isSelected}
            onClick={() => {
              if (isOptDisabled) return;
              (onValueChange ?? onChange)?.(opt.value);
            }}
            className={[
              'group relative inline-flex items-center justify-center gap-1.5 transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500',
              itemPadding,
              itemRadius,
              getItemLayout(),
              isOptDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              isSelected
                ? theme.textPrimary
                : isLight
                ? 'text-neutral-500 hover:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200',
            ].join(' ')}
          >
            {isSelected && (
              <motion.div
                layoutId={`segmented-thumb-${instanceId}`}
                layoutDependency={value}
                className={`absolute inset-0 ${itemRadius} ${
                  isLight
                    ? 'bg-white shadow-xs border border-black/5'
                    : 'bg-neutral-800 shadow-xs border border-white/10'
                }`}
                transition={UI_EASING.spring.tactile}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 min-w-0 truncate">
              {opt.icon && <span className="shrink-0">{opt.icon}</span>}
              {/* Zero-shift text cell: permanent bold strut locks exact glyph width regardless of selection state */}
              <span className="inline-grid items-center justify-items-center min-w-0 truncate">
                <span
                  className={`col-start-1 row-start-1 truncate transition-colors ${
                    isSelected ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {opt.label}
                </span>
                <span
                  aria-hidden="true"
                  className="col-start-1 row-start-1 invisible font-semibold select-none pointer-events-none truncate"
                >
                  {opt.label}
                </span>
              </span>
              {opt.badge && <span className="shrink-0">{opt.badge}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
});

SegmentedSwitch.displayName = 'SegmentedSwitch';
