import React from 'react';
import { Check, Minus } from 'lucide-react';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:Checkbox' as const;

export type CheckboxVariant = 'neutral' | 'amber' | 'orange' | 'sky' | 'emerald' | 'rose';
export type CheckboxIconStyle = 'check' | 'bold-check' | 'dot' | 'minus';
export type CheckboxAnimationStyle = 'spring-scale' | 'crisp-fade' | 'bounce';

export interface CheckboxProps {
  /** Checked state */
  checked: boolean;
  /** Optional indeterminate state (renders horizontal dash) */
  indeterminate?: boolean;
  /** Primary callback when checked state changes */
  onChange?: (checked: boolean) => void;
  /** Alias callback matching ToggleSwitch API */
  onCheckedChange?: (checked: boolean) => void;
  /** Optional inline label rendered beside the checkbox */
  label?: React.ReactNode;
  /** Optional secondary description below label */
  description?: React.ReactNode;
  /** Position of the inline label relative to the checkbox box ('left' | 'right', default: 'right') */
  labelPosition?: 'left' | 'right';
  /** Optional trailing status text next to the checkbox box (e.g. "Enabled" / "Off") */
  statusText?: React.ReactNode;
  /** Color scheme when checked (default: 'amber') */
  variant?: CheckboxVariant;
  /** Box dimension preset ('sm' = 16px, 'md' = 18px, 'lg' = 22px) or exact pixel size */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Corner border radius in px (default: 5px squircle) */
  radiusPx?: number;
  /** Checkmark SVG stroke width (default: 2.75) */
  strokeWidth?: number;
  /** Inner indicator style when checked ('check' | 'bold-check' | 'dot' | 'minus') */
  iconStyle?: CheckboxIconStyle;
  /** Transition feel when toggling ('spring-scale' | 'crisp-fade' | 'bounce') */
  animationStyle?: CheckboxAnimationStyle;
  /** Unchecked border contrast boost */
  highContrastUnchecked?: boolean;
  disabled?: boolean;
  isLight?: boolean;
  className?: string;
  id?: string;
  title?: string;
}

/**
 * [L1 Atomic Primitive] Checkbox
 * Decoupled tactile checkbox control with customizable squircle radius, semantic color variants,
 * stroke weight, and inner indicator style. Designed for zero side-effect integration in
 * spine-aligned forms (such as Layer 3 Camera Settings) and standalone inspector rows.
 */
export const Checkbox: React.FC<CheckboxProps> = React.memo(({
  checked,
  indeterminate = false,
  onChange,
  onCheckedChange,
  label,
  description,
  labelPosition = 'right',
  statusText,
  variant = 'amber',
  size = 'md',
  radiusPx = 5,
  strokeWidth = 2.75,
  iconStyle = 'check',
  animationStyle = 'spring-scale',
  highContrastUnchecked = false,
  disabled = false,
  isLight,
  className = '',
  id,
  title,
}) => {
  const resolvedIsLight =
    isLight !== undefined
      ? isLight
      : typeof document !== 'undefined'
      ? document.documentElement.classList.contains('light') ||
        document.documentElement.dataset.theme === 'light'
      : false;
  const theme = resolvedIsLight ? UI_THEME.light : UI_THEME.dark;

  const boxSizePx =
    typeof size === 'number'
      ? Math.max(12, Math.min(36, size))
      : size === 'sm'
      ? 16
      : size === 'lg'
      ? 22
      : 18;

  const iconSizePx = Math.max(10, Math.round(boxSizePx * 0.72));
  const dotSizePx = Math.max(6, Math.round(boxSizePx * 0.44));
  const effStrokeWidth = iconStyle === 'bold-check' ? Math.max(3.2, strokeWidth + 0.6) : strokeWidth;

  const handleToggle = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (disabled) return;
    e?.stopPropagation();
    const next = !checked;
    onChange?.(next);
    onCheckedChange?.(next);
  };

  const resolveCheckedClasses = (): string => {
    switch (variant) {
      case 'amber':
        return 'bg-amber-500 border-amber-500 text-neutral-950 shadow-[0_0_10px_rgba(245,158,11,0.30)]';
      case 'orange':
        return 'bg-orange-500 border-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.30)]';
      case 'sky':
        return 'bg-sky-500 border-sky-500 text-neutral-950 shadow-[0_0_10px_rgba(14,165,233,0.30)]';
      case 'emerald':
        return 'bg-emerald-500 border-emerald-500 text-neutral-950 shadow-[0_0_10px_rgba(16,185,129,0.30)]';
      case 'rose':
        return 'bg-rose-500 border-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.30)]';
      case 'neutral':
      default:
        return resolvedIsLight
          ? 'bg-neutral-900 border-neutral-900 text-white shadow-2xs'
          : 'bg-neutral-100 border-neutral-100 text-neutral-950 shadow-2xs';
    }
  };

  const resolveUncheckedClasses = (): string => {
    if (resolvedIsLight) {
      return highContrastUnchecked
        ? 'bg-white border-neutral-400 hover:border-neutral-600 text-transparent shadow-2xs'
        : 'bg-neutral-100/90 hover:bg-neutral-200/70 border-neutral-300/90 hover:border-neutral-400 text-transparent';
    }
    return highContrastUnchecked
      ? 'bg-neutral-900 border-neutral-500 hover:border-neutral-300 text-transparent'
      : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.18] hover:border-white/[0.32] text-transparent';
  };

  const isActive = checked || indeterminate;

  const animDurationClass =
    animationStyle === 'crisp-fade'
      ? 'duration-100 ease-out'
      : animationStyle === 'bounce'
      ? 'duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]'
      : 'duration-150 ease-[cubic-bezier(0.2,0.8,0.25,1)]';

  const boxElement = (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      title={title}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleToggle(e);
        }
      }}
      style={{
        width: `${boxSizePx}px`,
        height: `${boxSizePx}px`,
        borderRadius: `${Math.max(0, radiusPx)}px`,
      }}
      className={`relative inline-flex items-center justify-center shrink-0 border select-none transition-all ${animDurationClass} outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-90'
      } ${isActive ? resolveCheckedClasses() : resolveUncheckedClasses()}`}
    >
      <span
        className={`inline-flex items-center justify-center transition-all ${animDurationClass} ${
          isActive
            ? 'opacity-100 scale-100'
            : animationStyle === 'crisp-fade'
            ? 'opacity-0 scale-100'
            : 'opacity-0 scale-50'
        }`}
      >
        {indeterminate || iconStyle === 'minus' ? (
          <Minus
            style={{ width: `${iconSizePx}px`, height: `${iconSizePx}px` }}
            strokeWidth={effStrokeWidth}
          />
        ) : iconStyle === 'dot' ? (
          <span
            style={{
              width: `${dotSizePx}px`,
              height: `${dotSizePx}px`,
              borderRadius: `${Math.max(1, Math.round(radiusPx * 0.5))}px`,
            }}
            className="block bg-current"
          />
        ) : (
          <Check
            style={{ width: `${iconSizePx}px`, height: `${iconSizePx}px` }}
            strokeWidth={effStrokeWidth}
          />
        )}
      </span>
    </button>
  );

  if (!label && !description && !statusText) {
    return (
      <span data-alpha-id={ALPHA_COMPONENT_ID} className={`inline-flex items-center ${className}`}>
        {boxElement}
      </span>
    );
  }

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      onClick={!disabled ? handleToggle : undefined}
      className={`inline-flex items-center gap-2.5 select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      {labelPosition === 'left' && (label || description) && (
        <div className="flex flex-col text-right">
          {label && (
            <span className={`text-xs font-semibold leading-tight ${theme.textPrimary}`}>
              {label}
            </span>
          )}
          {description && (
            <span className={`text-[11px] leading-snug ${theme.textMuted}`}>
              {description}
            </span>
          )}
        </div>
      )}

      {boxElement}

      {statusText && (
        <span
          className={`text-xs font-mono leading-none transition-colors ${
            checked
              ? `${theme.textPrimary} font-semibold`
              : theme.textMuted
          }`}
        >
          {statusText}
        </span>
      )}

      {labelPosition === 'right' && (label || description) && (
        <div className="flex flex-col text-left">
          {label && (
            <span className={`text-xs font-semibold leading-tight ${theme.textPrimary}`}>
              {label}
            </span>
          )}
          {description && (
            <span className={`text-[11px] leading-snug ${theme.textMuted}`}>
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

Checkbox.displayName = 'Checkbox';
