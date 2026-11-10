import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { UI_SPACING } from '../tokens/spacing';
import { UI_RADIUS } from '../tokens/radius';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'flat' | 'outlined' | 'elevated';
  isLight?: boolean;
  interactive?: boolean;
  className?: string;
}

const paddingMap = {
  none: 'p-0',
  sm: UI_SPACING.card.sm,
  md: UI_SPACING.card.md,
  lg: UI_SPACING.card.lg,
};

/**
 * Card
 * Standard container widget for grouping related content and telemetry.
 * High-contrast dark mode surface elevation ensures distinct layering from page containers.
 */
export const Card: React.FC<CardProps> = React.memo(({
  children,
  padding = 'md',
  variant = 'default',
  isLight = false,
  interactive = false,
  className = '',
  ...props
}) => {
  const variantClass =
    variant === 'flat'
      ? isLight
        ? 'bg-neutral-100/70 border-neutral-200/50 shadow-none'
        : 'bg-neutral-800/60 border-neutral-700/60 text-neutral-200 shadow-none'
      : variant === 'outlined'
      ? isLight
        ? 'bg-transparent border-neutral-200/90 shadow-none'
        : 'bg-neutral-900/40 border-neutral-700 text-neutral-200 shadow-none'
      : isLight
      ? 'bg-white border-neutral-200/90 shadow-2xs text-neutral-900'
      : 'bg-neutral-800/90 border-neutral-700/80 text-neutral-100 shadow-sm';

  return (
    <div
      data-layout="card"
      className={`relative shrink-0 overflow-hidden border transition-all duration-150 ${UI_RADIUS.xl} ${paddingMap[padding]} ${variantClass} ${
        interactive
          ? isLight
            ? 'hover:border-neutral-300 hover:shadow-xs cursor-pointer'
            : 'hover:border-neutral-600 hover:bg-neutral-800 cursor-pointer'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  isLight?: boolean;
  className?: string;
}> = React.memo(({ title, subtitle, badge, action, isLight = false, className = '' }) => {
  return (
    <div className={`flex items-start justify-between gap-3 mb-2.5 ${className}`}>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm tracking-tight truncate">{title}</h3>
          {badge}
        </div>
        {subtitle && (
          <p className={`text-xs mt-0.5 truncate ${isLight ? 'text-neutral-500' : 'text-neutral-300'}`}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
});

CardHeader.displayName = 'CardHeader';

export const CardBody: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = React.memo(({ children, className = '' }) => {
  return <div className={`w-full ${className}`}>{children}</div>;
});

CardBody.displayName = 'CardBody';

export const CardFooter: React.FC<{
  children: React.ReactNode;
  isLight?: boolean;
  className?: string;
}> = React.memo(({ children, isLight = false, className = '' }) => {
  return (
    <div
      className={`flex items-center justify-between pt-2.5 mt-2.5 border-t text-xs ${
        isLight ? 'border-neutral-100 text-neutral-500' : 'border-neutral-700/80 text-neutral-300'
      } ${className}`}
    >
      {children}
    </div>
  );
});

CardFooter.displayName = 'CardFooter';

export interface SelectableCardProps {
  id: string;
  title: string;
  subtitle?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  preview?: React.ReactNode;
  badge?: React.ReactNode;
  tags?: string[];
  isLight?: boolean;
  className?: string;
}

/**
 * SelectableCard
 * Optimized for Vehicle selection, Game Mode choices, and preset pickers.
 * High contrast active glow in both light and dark surfaces.
 */
export const SelectableCard: React.FC<SelectableCardProps> = React.memo(({
  id,
  title,
  subtitle,
  selected,
  onSelect,
  preview,
  badge,
  tags = [],
  isLight = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      data-card-selectable="true"
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={`group relative flex flex-col text-left w-full p-3.5 border transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 cursor-pointer select-none active:scale-[0.98] ${UI_RADIUS.xl} ${
        selected
          ? isLight
            ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/30 shadow-xs'
            : 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/40 text-white shadow-md'
          : isLight
          ? 'bg-white hover:bg-neutral-50/80 border-neutral-200 text-neutral-800 shadow-2xs'
          : 'bg-neutral-800/90 hover:bg-neutral-750 hover:border-neutral-600 border-neutral-700/90 text-neutral-200 shadow-xs'
      } ${className}`}
    >
      {/* Top row: Title + Selection pill */}
      <div className="flex items-center justify-between w-full mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-sm tracking-tight truncate">{title}</span>
          {badge}
        </div>
        <div
          className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
            selected
              ? 'bg-amber-500 border-amber-500 text-white'
              : isLight
              ? 'border-neutral-300 bg-white'
              : 'border-neutral-600 bg-neutral-900'
          }`}
        >
          {selected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Check className="h-3 w-3 text-white stroke-[3]" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <span
          className={`text-xs block mb-2 line-clamp-1 ${
            selected
              ? isLight
                ? 'text-amber-900 font-medium'
                : 'text-amber-200 font-medium'
              : isLight
              ? 'text-neutral-500'
              : 'text-neutral-300'
          }`}
        >
          {subtitle}
        </span>
      )}

      {/* Center preview slot */}
      {preview && (
        <div
          className={`w-full py-4 my-1 flex items-center justify-center rounded-lg border transition-colors ${
            selected
              ? isLight
                ? 'bg-white/80 border-amber-200'
                : 'bg-neutral-900/80 border-amber-500/30'
              : isLight
              ? 'bg-neutral-50 border-neutral-200/60'
              : 'bg-neutral-900/60 border-neutral-700/60'
          }`}
        >
          {preview}
        </div>
      )}

      {/* Bottom row: Tags */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {tags.map((tag) => (
            <span
              key={tag}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                selected
                  ? isLight
                    ? 'bg-amber-100/60 text-amber-900 border-amber-200'
                    : 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                  : isLight
                  ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-700'
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
});

Card.displayName = 'Card';
