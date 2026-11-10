import React from 'react';
import { UI_RADIUS } from '../tokens/radius';
import { KeycapBadge } from './KeycapBadge';

export const ALPHA_COMPONENT_ID = 'Alpha:Button' as const;

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'auto';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  shortcut?: string;
  loading?: boolean;
  isLight?: boolean;
  /**
   * Universal Nesting Mode (""):
   * When true (or automatically when `asContainer` is enabled), renders as a focusable interactive
   * surface (`role="button"`) that safely hosts arbitrary nested interactive controls (sliders, charts,
   * dropdowns, panels) without HTML `<button>` nesting violations or single-line text truncation.
   */
  composable?: boolean;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs min-h-[32px] gap-1.5',
  md: 'px-4 py-2 text-sm min-h-[40px] gap-2',
  lg: 'px-5 py-2.5 text-base min-h-[48px] gap-2.5',
  auto: 'p-3 text-xs gap-2.5',
};

/**
 * Standard Accessible & Universally Nestable Button Primitive
 * Includes native keycap shortcut slot, tactile active press, and Universal Nesting (`composable`) support.
 */
export const Button: React.FC<ButtonProps> = React.memo(({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  rightIcon,
  shortcut,
  loading = false,
  isLight = false,
  disabled = false,
  composable = false,
  className = '',
  onClick,
  ...props
}) => {
  const isSimpleLabel = typeof children === 'string' || typeof children === 'number';
  const effectiveSize = composable && size === 'md' ? 'auto' : size;

  const getVariantStyles = () => {
    if (variant === 'primary') {
      return isLight
        ? 'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900 shadow-sm'
        : 'bg-white text-neutral-950 hover:bg-neutral-100 border-white shadow-md';
    }
    if (variant === 'danger') {
      return isLight
        ? 'bg-red-600 text-white hover:bg-red-700 border-red-600 shadow-sm'
        : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border-red-500/40';
    }
    if (variant === 'outline') {
      return isLight
        ? 'bg-transparent text-neutral-800 hover:bg-neutral-100 border-neutral-300'
        : 'bg-transparent text-neutral-200 hover:bg-neutral-800/60 border-neutral-700';
    }
    if (variant === 'ghost') {
      return isLight
        ? 'bg-transparent text-neutral-700 hover:bg-neutral-200/60 border-transparent'
        : 'bg-transparent text-neutral-300 hover:bg-neutral-800/80 border-transparent';
    }
    // secondary (default)
    return isLight
      ? 'bg-white hover:bg-neutral-100 text-neutral-800 border-neutral-200/90 shadow-2xs'
      : 'bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-200 border-neutral-700/60 shadow-2xs';
  };

  const innerContent = (
    <>
      {loading ? (
        <span className={`h-4 w-4 ${UI_RADIUS.full} border-2 border-current border-t-transparent animate-spin shrink-0`} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children !== undefined && children !== null && (
        isSimpleLabel && !composable ? (
          <span className="truncate">{children}</span>
        ) : composable ? (
          <div className="min-w-0 flex-1 text-left">{children}</div>
        ) : (
          <span className="inline-flex items-center gap-1.5 min-w-0 whitespace-nowrap">{children}</span>
        )
      )}
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
      {shortcut && (
        <KeycapBadge
          size="sm"
          shortcut={shortcut}
          isLight={variant === 'primary' ? !isLight : isLight}
          className={`ml-auto shrink-0 ${
            variant === 'primary'
              ? isLight
                ? 'bg-neutral-800 text-neutral-200 border-neutral-700'
                : 'bg-neutral-200 text-neutral-800 border-neutral-300'
              : ''
          }`}
        />
      )}
    </>
  );

  const sharedClasses = `inline-flex items-center justify-center font-medium border select-none transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 ${
    composable ? 'active:scale-[0.995]' : 'active:scale-[0.98]'
  } cursor-pointer ${
    disabled || loading ? 'opacity-40 pointer-events-none' : ''
  } ${UI_RADIUS.lg} ${sizeClasses[effectiveSize]} ${getVariantStyles()} ${className}`;

  if (composable) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || loading}
        data-alpha-id={ALPHA_COMPONENT_ID}
        data-component="button"
        data-variant={variant}
        data-composable="true"
        onClick={(e) => {
          if (disabled || loading) return;
          onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
        }}
        onKeyDown={(e) => {
          if (disabled || loading) return;
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
          }
        }}
        className={sharedClasses}
      >
        {innerContent}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="button"
      data-variant={variant}
      disabled={disabled || loading}
      onClick={onClick}
      className={sharedClasses}
      {...props}
    >
      {innerContent}
    </button>
  );
});

Button.displayName = 'Button';
