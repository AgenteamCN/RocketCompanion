import React from 'react';
import { SegmentedSwitch } from '../primitives/SegmentedSwitch';
import { DropdownMenu } from './DropdownMenu';
import { SettingActionRow } from './SettingActionRow';
import { useSettingActionRowStore, type SegmentedRowLayout } from '../stores/settingRowStore';

export const ALPHA_COMPONENT_ID = 'Alpha:SettingSegmentedRow' as const;

export interface SettingSegmentedOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface SettingSegmentedRowProps {
  /** Primary row title (alias: title) */
  label?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  iconName?: string;
  iconColor?: string;
  badge?: React.ReactNode;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (val: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onValueChange?: (val: any) => void;
  options: SettingSegmentedOption[];
  /**
   * Optional secondary segmented control rendered to the left of the primary control
   * (e.g. `Simple | Advanced` detail toggle beside `Off | On Demand | Always On` on Network Latency)
   */
  secondaryValue?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSecondaryChange?: (val: any) => void;
  secondaryOptions?: SettingSegmentedOption[];
  /**
   * Control rendering mode:
   * - 'segmented': Apple-style SegmentedSwitch (default)
   * - 'dropdown': Compact DropdownMenu trigger + popover (ideal for long option labels like Pacing Trade-Off Priority)
   */
  controlType?: 'segmented' | 'dropdown';
  /**
   * Row layout when `controlType === 'segmented'`:
   * - 'inline': Title on left, SegmentedSwitch on right (default)
   * - 'stacked': Title on top row, full-width SegmentedSwitch on second row
   */
  layout?: SegmentedRowLayout;
  /** SegmentedSwitch size (default: 'sm') */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  bordered?: boolean;
  showDescription?: boolean;
  hoverDescription?: string;
  onHover?: (desc?: string) => void;
  onLeave?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * [L1/L3 Decoupled Primitive] SettingSegmentedRow
 * Unified segmented / dropdown selection row sharing `useSettingActionRowStore`
 * typography (`titleFontSize`), padding, hover box, and concentric radii.
 */
export const SettingSegmentedRow: React.FC<SettingSegmentedRowProps> = React.memo(({
  label,
  title,
  subtitle,
  description,
  icon,
  iconName,
  iconColor,
  badge,
  value,
  onChange,
  onValueChange,
  options,
  secondaryValue,
  onSecondaryChange,
  secondaryOptions,
  controlType = 'segmented',
  layout: propLayout,
  size = 'sm',
  disabled = false,
  bordered,
  showDescription,
  hoverDescription,
  onHover,
  onLeave,
  onMouseEnter,
  onMouseLeave,
  isLight = false,
  className = '',
}) => {
  const store = useSettingActionRowStore();
  const resolvedLayout = propLayout ?? store.segmentedLayout;
  const resolvedTitle = title ?? label ?? '';
  const resolvedDesc = description ?? subtitle;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelect = (val: any) => {
    onChange?.(val);
    onValueChange?.(val);
  };
  const handleHover = (desc?: string) => {
    onHover?.(desc);
    onMouseEnter?.();
  };
  const handleLeave = () => {
    onLeave?.();
    onMouseLeave?.();
  };
  const hasSecondarySegmented =
    Boolean(secondaryOptions && secondaryOptions.length > 0 && secondaryValue !== undefined);

  if (controlType === 'dropdown') {
    return (
      <SettingActionRow
        icon={icon}
        iconName={iconName}
        iconColor={iconColor}
        title={resolvedTitle}
        badge={badge}
        description={resolvedDesc}
        bordered={bordered}
        showDescription={showDescription}
        disabled={disabled}
        hoverDescription={hoverDescription}
        onHover={handleHover}
        onLeave={handleLeave}
        isLight={isLight}
        className={className}
        rightSlot={
          <div data-alpha-id={ALPHA_COMPONENT_ID} className="inline-flex items-center">
            <DropdownMenu
              value={value}
              options={options}
              onChange={(val) => handleSelect(String(val))}
              align="right"
              menuWidthClass="w-64"
              disabled={disabled}
              isLight={isLight}
              className="min-w-[168px]"
            />
          </div>
        }
      />
    );
  }

  if (resolvedLayout === 'stacked') {
    return (
      <SettingActionRow
        icon={icon}
        iconName={iconName}
        iconColor={iconColor}
        title={resolvedTitle}
        badge={badge}
        description={resolvedDesc}
        bordered={bordered}
        showDescription={showDescription}
        disabled={disabled}
        hoverDescription={hoverDescription}
        onHover={handleHover}
        onLeave={handleLeave}
        isLight={isLight}
        className={className}
        rightSlot={
          hasSecondarySegmented ? (
            <SegmentedSwitch
              value={secondaryValue!}
              onValueChange={(val) => onSecondaryChange?.(val)}
              options={secondaryOptions!}
              size={size}
              disabled={disabled}
              isLight={isLight}
            />
          ) : null
        }
        bottomSlot={
          <div data-alpha-id={ALPHA_COMPONENT_ID} className="w-full">
            <SegmentedSwitch
              value={value}
              onValueChange={handleSelect}
              options={options}
              size={size}
              fullWidth
              disabled={disabled}
              isLight={isLight}
            />
          </div>
        }
      />
    );
  }

  return (
    <SettingActionRow
      icon={icon}
      iconName={iconName}
      iconColor={iconColor}
      title={resolvedTitle}
      badge={badge}
      description={resolvedDesc}
      bordered={bordered}
      showDescription={showDescription}
      disabled={disabled}
      hoverDescription={hoverDescription}
      onHover={handleHover}
      onLeave={handleLeave}
      isLight={isLight}
      className={className}
      rightSlot={
        hasSecondarySegmented ? (
          <div data-alpha-id={ALPHA_COMPONENT_ID} className="inline-flex items-center gap-2 shrink-0">
            <SegmentedSwitch
              value={secondaryValue!}
              onValueChange={(val) => onSecondaryChange?.(val)}
              options={secondaryOptions!}
              size={size}
              disabled={disabled}
              isLight={isLight}
            />
            <SegmentedSwitch
              value={value}
              onValueChange={handleSelect}
              options={options}
              size={size}
              disabled={disabled}
              isLight={isLight}
            />
          </div>
        ) : (
          <div data-alpha-id={ALPHA_COMPONENT_ID} className="inline-flex items-center shrink-0">
            <SegmentedSwitch
              value={value}
              onValueChange={handleSelect}
              options={options}
              size={size}
              disabled={disabled}
              isLight={isLight}
            />
          </div>
        )
      }
    />
  );
});

SettingSegmentedRow.displayName = 'SettingSegmentedRow';
