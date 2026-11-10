import React from 'react';
import { ToggleSwitch, type ToggleVariant } from '../primitives/ToggleSwitch';
import { SettingActionRow } from './SettingActionRow';

export const ALPHA_COMPONENT_ID = 'Alpha:SettingToggleRow' as const;

export interface SettingToggleRowProps {
  /** Primary row title (alias: title) */
  label?: React.ReactNode;
  title?: React.ReactNode;
  /** Optional subtitle / description (alias: description) */
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  /** Optional leading icon component or ReactNode */
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  iconName?: string;
  iconColor?: string;
  /** Optional badge next to title */
  badge?: React.ReactNode;
  /** Checked state */
  checked: boolean;
  /** Change callback (alias: onCheckedChange) */
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
  /** Optional ToggleSwitch color variant (default: 'neutral') */
  variant?: ToggleVariant;
  /** Optional extra control placed to the left of the ToggleSwitch (e.g. Configure button) */
  extraRightSlot?: React.ReactNode;
  /** Optional bottom slot (e.g. stacked full-width Configure button) */
  bottomSlot?: React.ReactNode;
  /** Override whether outer border is rendered */
  bordered?: boolean;
  /** Override whether subtitle/description is shown */
  showDescription?: boolean;
  disabled?: boolean;
  hoverDescription?: string;
  onHover?: (desc?: string) => void;
  onLeave?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * [L1/L3 Decoupled Primitive] SettingToggleRow
 * Unified Apple-style toggle switch row sharing `useSettingActionRowStore` typography,
 * padding, concentric hover box, and right-edge alignment so all switches across
 * Gameplay, Audio, Display, and Advanced align on the exact same vertical axis.
 */
export const SettingToggleRow: React.FC<SettingToggleRowProps> = React.memo(({
  label,
  title,
  subtitle,
  description,
  icon,
  iconName,
  iconColor,
  badge,
  checked,
  onChange,
  onCheckedChange,
  variant = 'neutral',
  extraRightSlot,
  bottomSlot,
  bordered,
  showDescription,
  disabled = false,
  hoverDescription,
  onHover,
  onLeave,
  onMouseEnter,
  onMouseLeave,
  isLight = false,
  className = '',
}) => {
  const resolvedTitle = title ?? label ?? '';
  const resolvedDesc = description ?? subtitle;
  const handleToggle = (next: boolean) => {
    onChange?.(next);
    onCheckedChange?.(next);
  };
  const handleHover = (desc?: string) => {
    onHover?.(desc);
    onMouseEnter?.();
  };
  const handleLeave = () => {
    onLeave?.();
    onMouseLeave?.();
  };

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
      onAction={() => handleToggle(!checked)}
      hoverDescription={hoverDescription}
      onHover={handleHover}
      onLeave={handleLeave}
      isLight={isLight}
      className={className}
      bottomSlot={bottomSlot}
      rightSlot={
        <div data-alpha-id={ALPHA_COMPONENT_ID} className="flex items-center gap-2">
          {extraRightSlot}
          <ToggleSwitch
            checked={checked}
            onCheckedChange={handleToggle}
            disabled={disabled}
            isLight={isLight}
            variant={variant}
          />
        </div>
      }
    />
  );
});

SettingToggleRow.displayName = 'SettingToggleRow';
