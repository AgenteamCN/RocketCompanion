import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { lookupLucideIcon } from '../primitives/iconLookup';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:SettingActionRow' as const;

export interface SettingActionRowProps {
  /** Leading icon component (e.g. NotebookPen, Video, Keyboard) or ReactNode */
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> | React.ReactNode;
  /** Optional icon name resolved via lookupLucideIcon (e.g. 'notebook-pen') */
  iconName?: string;
  /**
   * Optional custom SVG icon color override.
   * - When omitted (recommended default), renders in neutral gray (`text-neutral-500` in light / `text-neutral-400` in dark).
   * - Supports Tailwind text utility classes (e.g. `'text-amber-500'`, `'text-sky-400'`) or CSS color values (`'#f59e0b'`, `'rgb(...)'`).
   */
  iconColor?: string;
  /** Primary row title (alias: label) */
  title?: React.ReactNode;
  /** Alias for title so callers passing label or title work identically */
  label?: React.ReactNode;
  /** Optional inline badge rendered next to the title */
  badge?: React.ReactNode;
  /** Secondary description / subtitle below title */
  description?: React.ReactNode;
  /** Alias for description */
  subtitle?: React.ReactNode;
  /** Override whether description is shown (defaults to useSettingActionRowStore.showDescription) */
  showDescription?: boolean;
  /** Override whether outer border & card surface are shown (defaults to useSettingActionRowStore.bordered) */
  bordered?: boolean;
  /** Override horizontal padding in px (defaults to useSettingActionRowStore.paddingX) */
  paddingX?: number;
  /** Override vertical padding in px (defaults to useSettingActionRowStore.paddingY) */
  paddingY?: number;
  /** Override outer row & hover border radius in px (defaults to useSettingActionRowStore.borderRadius) */
  borderRadius?: number;
  /** Override SVG icon size in px (defaults to useSettingActionRowStore.iconSize) */
  iconSize?: number;
  /** Override gap between icon and text column in px (defaults to useSettingActionRowStore.iconGap) */
  iconGap?: number;
  /** Override title font size in px (defaults to useSettingActionRowStore.titleFontSize) */
  titleFontSize?: number;
  /** Override description font size in px (defaults to useSettingActionRowStore.descriptionFontSize) */
  descriptionFontSize?: number;
  /** Override action button font size in px (defaults to useSettingActionRowStore.buttonFontSize) */
  buttonFontSize?: number;
  /** Override action button horizontal padding in px (defaults to useSettingActionRowStore.buttonPaddingX) */
  buttonPaddingX?: number;
  /** Override action button vertical padding in px (defaults to useSettingActionRowStore.buttonPaddingY) */
  buttonPaddingY?: number;
  /** Override action button border radius in px (defaults to useSettingActionRowStore.buttonRadius) */
  buttonRadius?: number;
  /** Override whether right action button shows ArrowRight (defaults to useSettingActionRowStore.showButtonArrow) */
  showButtonArrow?: boolean;
  /** Label inside the right action button (default: 'Configure') */
  actionLabel?: React.ReactNode;
  /** Callback when the row or right action button is clicked */
  onAction?: () => void;
  /** Optional custom right-side control overriding the default Configure button */
  rightSlot?: React.ReactNode;
  /** Optional second-line full-width slot below the header row (e.g. stacked SegmentedSwitch or Configure button) */
  bottomSlot?: React.ReactNode;
  /** Whether the row is disabled */
  disabled?: boolean;
  /** Footer description string emitted on row hover */
  hoverDescription?: string;
  /** Optional separate footer description string emitted when hovering the action button */
  buttonHoverDescription?: string;
  /** Hover callback receiving description text */
  onHover?: (desc: string) => void;
  /** Mouse leave callback */
  onLeave?: () => void;
  /** Light / Dark theme flag */
  isLight?: boolean;
  /** Optional extra className */
  className?: string;
  /** Optional inline style overrides (e.g. marginTop) */
  style?: React.CSSProperties;
}

/**
 * [L1/L3 Decoupled Primitive] SettingActionRow
 * Apple System Settings inspired navigation & configuration row.
 * - Entire row acts as a unified hoverable hit target (`group`) whose translucent highlight
 *   cleanly wraps both the left `[Icon + Title]` and the right `[Configure ->]` button with concentric radii.
 * - All vertical spacing comes directly from the row's own `paddingY` (with `rowGap: 0` by default),
 *   eliminating dead zones between adjacent rows on hover.
 */
export const SettingActionRow: React.FC<SettingActionRowProps> = React.memo(({
  icon,
  iconName,
  iconColor,
  title,
  label,
  badge,
  description,
  subtitle,
  showDescription: propShowDescription,
  bordered: propBordered,
  paddingX: propPaddingX,
  paddingY: propPaddingY,
  borderRadius: propBorderRadius,
  iconSize: propIconSize,
  iconGap: propIconGap,
  titleFontSize: propTitleFontSize,
  descriptionFontSize: propDescriptionFontSize,
  buttonFontSize: propButtonFontSize,
  buttonPaddingX: propButtonPaddingX,
  buttonPaddingY: propButtonPaddingY,
  buttonRadius: propButtonRadius,
  showButtonArrow: propShowButtonArrow,
  actionLabel = 'Configure',
  onAction,
  rightSlot,
  bottomSlot,
  disabled = false,
  hoverDescription,
  buttonHoverDescription,
  onHover,
  onLeave,
  isLight = false,
  className = '',
  style,
}) => {
  const store = useSettingActionRowStore();

  const isBordered = propBordered ?? store.bordered;
  const shouldShowDesc = propShowDescription ?? store.showDescription;
  const padX = propPaddingX ?? store.paddingX;
  const padY = propPaddingY ?? store.paddingY;
  const radius = propBorderRadius ?? store.borderRadius;
  const resolvedIconSize = propIconSize ?? store.iconSize;
  const resolvedIconGap = propIconGap ?? store.iconGap;
  const resolvedTitleFontSize = propTitleFontSize ?? store.titleFontSize;
  const resolvedDescFontSize = propDescriptionFontSize ?? store.descriptionFontSize;
  const resolvedBtnFontSize = propButtonFontSize ?? store.buttonFontSize;
  const btnPadX = propButtonPaddingX ?? store.buttonPaddingX;
  const btnPadY = propButtonPaddingY ?? store.buttonPaddingY;
  const btnRadius = propButtonRadius ?? store.buttonRadius;
  const showArrow = propShowButtonArrow ?? store.showButtonArrow;

  const resolvedTitle = title ?? label;
  const resolvedDesc = description ?? subtitle;
  const effectiveColor = (iconColor ?? store.defaultIconColor ?? '').trim();

  const isTailwindTextColor = effectiveColor.startsWith('text-');
  const iconColorClass = effectiveColor
    ? isTailwindTextColor
      ? effectiveColor
      : ''
    : isLight
    ? 'text-neutral-500 group-hover:text-neutral-700'
    : 'text-neutral-400 group-hover:text-neutral-200';

  const iconInlineStyle: React.CSSProperties = {
    width: `${resolvedIconSize}px`,
    height: `${resolvedIconSize}px`,
    ...(effectiveColor && !isTailwindTextColor ? { color: effectiveColor } : {}),
  };

  const renderLeadingIcon = () => {
    const namedComp = iconName ? lookupLucideIcon(iconName) : null;
    const IconCandidate = namedComp ?? icon;
    if (!IconCandidate) return null;

    if (
      typeof IconCandidate === 'function' ||
      (typeof IconCandidate === 'object' &&
        IconCandidate !== null &&
        '$$typeof' in IconCandidate &&
        !React.isValidElement(IconCandidate))
    ) {
      const Comp = IconCandidate as React.ComponentType<{
        className?: string;
        style?: React.CSSProperties;
      }>;
      return (
        <Comp
          className={`shrink-0 transition-colors ${iconColorClass}`}
          style={iconInlineStyle}
        />
      );
    }

    if (React.isValidElement(IconCandidate)) {
      return (
        <span
          className={`inline-flex items-center justify-center shrink-0 transition-colors ${iconColorClass}`}
          style={iconInlineStyle}
        >
          {IconCandidate}
        </span>
      );
    }

    return null;
  };

  const verticalSpacingStyle: React.CSSProperties =
    padY >= 0
      ? {
          paddingTop: `${padY}px`,
          paddingBottom: `${padY}px`,
        }
      : {
          paddingTop: '0px',
          paddingBottom: '0px',
          marginTop: `${padY}px`,
          marginBottom: `${padY}px`,
        };

  const theme = isLight ? UI_THEME.light : UI_THEME.dark;

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-ui-element="setting-action-row"
      style={{
        paddingLeft: `${Math.max(0, padX)}px`,
        paddingRight: `${Math.max(0, padX)}px`,
        borderRadius: `${Math.max(0, radius)}px`,
        ...verticalSpacingStyle,
        ...style,
      }}
      onClick={() => {
        if (!disabled && onAction) {
          onAction();
        }
      }}
      className={`group flex flex-col w-full transition-colors duration-150 select-none ${
        disabled ? 'opacity-45 pointer-events-none' : ''
      } ${onAction ? 'cursor-pointer' : ''} ${
        isBordered
          ? isLight
            ? 'border bg-neutral-50/80 hover:bg-neutral-100/90 border-neutral-200/90'
            : 'border bg-neutral-850/80 hover:bg-neutral-800/90 border-neutral-700/80'
          : isLight
          ? 'border border-transparent bg-transparent hover:bg-neutral-900/[0.055] active:bg-neutral-900/[0.085]'
          : 'border border-transparent bg-transparent hover:bg-white/[0.06] active:bg-white/[0.09]'
      } ${className}`}
      onMouseEnter={() => {
        if (onHover) {
          onHover(hoverDescription ?? (typeof resolvedDesc === 'string' ? resolvedDesc : ''));
        }
      }}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center justify-between w-full gap-3">
        <div
          className="flex items-center min-w-0 pr-2 flex-1"
          style={{ gap: `${resolvedIconGap}px` }}
        >
          {renderLeadingIcon()}
          <div className="flex flex-col text-left leading-snug min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                style={{ fontSize: `${resolvedTitleFontSize}px` }}
                className={`font-semibold truncate transition-colors ${
                  isLight
                    ? 'text-neutral-800 group-hover:text-neutral-950'
                    : 'text-neutral-200 group-hover:text-white'
                }`}
              >
                {resolvedTitle}
              </span>
              {badge && <span className="shrink-0 inline-flex items-center">{badge}</span>}
            </div>
            {shouldShowDesc && resolvedDesc && (
              <span
                data-allow-truncate="true"
                style={{ fontSize: `${resolvedDescFontSize}px` }}
                className={`mt-0.5 truncate ${theme.textMuted}`}
              >
                {resolvedDesc}
              </span>
            )}
          </div>
        </div>

        {rightSlot !== undefined ? (
          rightSlot !== null && (
            <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {rightSlot}
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction?.();
            }}
            onMouseEnter={() => {
              if (buttonHoverDescription && onHover) {
                onHover(buttonHoverDescription);
              }
            }}
            onMouseLeave={buttonHoverDescription ? onLeave : undefined}
            style={{
              fontSize: `${resolvedBtnFontSize}px`,
              paddingLeft: `${btnPadX}px`,
              paddingRight: `${btnPadX}px`,
              paddingTop: `${btnPadY}px`,
              paddingBottom: `${btnPadY}px`,
              borderRadius: `${Math.max(0, btnRadius)}px`,
            }}
            className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer flex items-center gap-1.5 leading-tight active:scale-95 ${
              isLight
                ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
                : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
            }`}
          >
            <span>{actionLabel}</span>
            {showArrow && (
              <ArrowRight
                style={{
                  width: `${Math.max(12, resolvedBtnFontSize + 1)}px`,
                  height: `${Math.max(12, resolvedBtnFontSize + 1)}px`,
                }}
                className="opacity-75 transition-transform duration-150 group-hover:translate-x-0.5"
              />
            )}
          </button>
        )}
      </div>

      {bottomSlot && (
        <div className="w-full pt-2" onClick={(e) => e.stopPropagation()}>
          {bottomSlot}
        </div>
      )}
    </div>
  );
});

SettingActionRow.displayName = 'SettingActionRow';
