import React from 'react';
import { Hammer } from 'lucide-react';
import { Badge } from './Badge';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:UnderConstructionPlaceholder' as const;

export interface UnderConstructionPlaceholderProps {
  title?: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  isLight?: boolean;
  className?: string;
}

/**
 * UnderConstructionPlaceholder
 * Apple-style minimalist placeholder state for unfinished modules/pages:
 * - Neutral, zero-saturation palette
 * - Perfectly centered within parent flex/grid container
 * - Reusable across any tab, dialog or view
 */
export const UnderConstructionPlaceholder: React.FC<UnderConstructionPlaceholderProps> = React.memo(({
  title = 'Under Construction',
  description = 'This section is currently in development and will be available in an upcoming update.',
  badge = 'IN DEVELOPMENT',
  icon,
  isLight = false,
  className = '',
}) => {
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      className={`h-full w-full flex flex-col items-center justify-center text-center p-8 select-none ${className}`}
    >
      <div className="flex flex-col items-center max-w-sm gap-3">
        {/* Minimalist Icon Badge Container */}
        <div
          className={`h-12 w-12 ${UI_RADIUS.xl} border flex items-center justify-center transition-colors ${
            isLight
              ? 'bg-neutral-100 border-neutral-300 text-neutral-600 shadow-2xs'
              : 'bg-neutral-800 border-neutral-700 text-neutral-300 shadow-sm'
          }`}
        >
          {icon ?? <Hammer className="h-5 w-5 stroke-[2]" />}
        </div>

        {/* Status Badge */}
        {badge && (
          <Badge variant="neutral" size="sm" isLight={isLight}>
            {badge}
          </Badge>
        )}

        {/* Title */}
        <h3 className={`text-sm font-semibold tracking-tight ${theme.textPrimary}`}>
          {title}
        </h3>

        {/* Description */}
        <p className={`text-xs leading-relaxed ${theme.textMuted}`}>
          {description}
        </p>
      </div>
    </div>
  );
});

UnderConstructionPlaceholder.displayName = 'UnderConstructionPlaceholder';
