import React from 'react';
import { UI_SPACING } from '../tokens/spacing';
import { UI_RADIUS } from '../tokens/radius';

export const ALPHA_COMPONENT_ID = 'Alpha:Badge' as const;

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'amber'
  | 'orange'
  | 'neutral'
  | 'success'
  | 'emerald'
  | 'warning'
  | 'danger'
  | 'outline'
  | 'muted'
  | 'sky'
  | 'info'
  | 'purple'
  | 'violet';

export type BadgeSize = 'sm' | 'md' | 'lg';
export type BadgeShape = 'rounded' | 'pill';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  shape?: BadgeShape;
  dot?: boolean;
  dotColor?: string;
  icon?: React.ReactNode;
  isLight?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { light: string; dark: string }> = {
  default: {
    light: 'bg-neutral-100 text-neutral-800 border-neutral-300 shadow-2xs',
    dark: 'bg-neutral-800 text-neutral-200 border-neutral-700 shadow-2xs',
  },
  // Primary defaults to warm amber/yellow tone, avoiding harsh blue
  primary: {
    light: 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs',
    dark: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-xs',
  },
  amber: {
    light: 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs',
    dark: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-xs',
  },
  orange: {
    light: 'bg-orange-50 text-orange-900 border-orange-300 shadow-2xs',
    dark: 'bg-orange-500/15 text-orange-300 border-orange-500/40 shadow-xs',
  },
  neutral: {
    light: 'bg-neutral-100 text-neutral-900 border-neutral-300 shadow-2xs',
    dark: 'bg-neutral-800 text-neutral-100 border-neutral-600 shadow-2xs',
  },
  success: {
    light: 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs',
    dark: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-xs',
  },
  emerald: {
    light: 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs',
    dark: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-xs',
  },
  warning: {
    light: 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs',
    dark: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-xs',
  },
  danger: {
    light: 'bg-red-50 text-red-800 border-red-300 shadow-2xs',
    dark: 'bg-red-500/15 text-red-300 border-red-500/40 shadow-xs',
  },
  outline: {
    light: 'bg-white text-neutral-700 border-neutral-300 shadow-2xs',
    dark: 'bg-neutral-900/60 text-neutral-200 border-neutral-600',
  },
  muted: {
    light: 'bg-neutral-100/80 text-neutral-500 border-neutral-200',
    dark: 'bg-neutral-800/60 text-neutral-400 border-neutral-700',
  },
  sky: {
    light: 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs',
    dark: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-xs',
  },
  info: {
    light: 'bg-sky-50 text-sky-800 border-sky-300 shadow-2xs',
    dark: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-xs',
  },
  purple: {
    light: 'bg-purple-100 text-purple-800 border-purple-300 shadow-2xs',
    dark: 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-xs',
  },
  violet: {
    light: 'bg-violet-100 text-violet-800 border-violet-300 shadow-2xs',
    dark: 'bg-violet-500/15 text-violet-300 border-violet-500/40 shadow-xs',
  },
};

/**
 * Standard Badge / Status Pill Primitive
 * Displays status badges, telemetry counters, and version labels.
 * Supports warm amber (primary default), neutral, and standard semantic variants.
 */
export const Badge: React.FC<BadgeProps> = React.memo(({
  children,
  variant = 'default',
  size = 'md',
  shape = 'rounded',
  dot = false,
  dotColor,
  icon,
  isLight = false,
  className = '',
  ...props
}) => {
  const currentVariant = variantStyles[variant][isLight ? 'light' : 'dark'];
  const sizeClass = UI_SPACING.badge[size];
  const shapeClass = shape === 'pill' ? UI_RADIUS.full : UI_RADIUS.sm;

  const resolvedDotColor =
    dotColor ||
    (variant === 'success'
      ? 'bg-emerald-500'
      : variant === 'danger'
      ? 'bg-red-500'
      : variant === 'warning' || variant === 'primary' || variant === 'amber'
      ? 'bg-amber-500'
      : variant === 'orange'
      ? 'bg-orange-500'
      : variant === 'sky' || variant === 'info'
      ? 'bg-sky-500'
      : variant === 'purple' || variant === 'violet'
      ? 'bg-purple-500'
      : 'bg-neutral-400');

  return (
    <span
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="badge"
      data-variant={variant}
      data-shape={shape}
      data-size={size}
      className={`inline-flex items-center gap-1.5 font-medium border font-mono tracking-tight select-none transition-colors ${shapeClass} ${sizeClass} ${currentVariant} ${className}`}
      {...props}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 ${UI_RADIUS.full} shrink-0 ${resolvedDotColor}`} />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
});

Badge.displayName = 'Badge';
