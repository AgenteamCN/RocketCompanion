import React, { useRef, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { KeycapBadge } from '../primitives/KeycapBadge';
import {
  isCustomPlayCardColor,
  resolvePlayCardIconColorClass,
  resolvePlayCardIconHex,
} from '../tokens/colors';
import {
  DEFAULT_MAIN_MENU_STYLE_PARAMS,
  DEFAULT_MAIN_MENU_ITEM_COLORS,
  resolveMainMenuTitleTypography,
  type MainMenuStyleParams,
  type MainMenuStyleVariant,
  type MainMenuItemSlotId,
  type MainMenuIconColorValue,
  type MainMenuPlatformPreviewMode,
} from '../stores/mainMenuStyleStore';

export interface MainMenuRowProps {
  slotId?: MainMenuItemSlotId;
  icon?: React.ReactNode;
  iconColorToken?: MainMenuIconColorValue;
  title: string;
  subtitle?: string;
  shortcut?: string;
  hasArrow?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  /** Visual archetype override ('large-clean-row' | 'mono-watermark-row' | 'classic-descriptive-row') */
  styleVariant?: MainMenuStyleVariant;
  /** Decoupled style parameters (pure props-driven, zero store coupling) */
  styleParams?: Partial<MainMenuStyleParams> & {
    platformPreviewMode?: MainMenuPlatformPreviewMode;
    titleOffsetYPx?: number;
  };
  isLight?: boolean;
  onClick?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * [L2 Layout] MainMenuRow
 * Pure props-driven row component dedicated to Layer 1 Main Menu (`Layer1MainMenuRecipe`).
 * Decoupled from generic `MenuItem` so tuning Layer 1 Main Menu never causes side effects on other menus.
 */
export const MainMenuRow: React.FC<MainMenuRowProps> = React.memo(({
  slotId = 'play',
  icon,
  iconColorToken,
  title,
  subtitle,
  shortcut,
  hasArrow = false,
  disabled = false,
  variant = 'secondary',
  styleVariant,
  styleParams,
  isLight = false,
  onClick,
  autoFocus = false,
  className = '',
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (autoFocus && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [autoFocus]);

  const cfg: MainMenuStyleParams = {
    ...DEFAULT_MAIN_MENU_STYLE_PARAMS,
    ...(styleParams || {}),
    itemIconColors: {
      ...DEFAULT_MAIN_MENU_ITEM_COLORS,
      ...(styleParams?.itemIconColors || {}),
    },
  };

  const activePlatformPreviewMode: MainMenuPlatformPreviewMode =
    styleParams?.platformPreviewMode ?? 'auto';
  const activeTitleOffsetYPx: number =
    styleParams?.titleOffsetYPx ?? 0;

  const activeStyleVariant: MainMenuStyleVariant = styleVariant ?? cfg.variant;
  const isPrimaryRole = variant === 'primary';
  const isSolidPrimary = isPrimaryRole && cfg.resumeHighlightStyle === 'solid-primary';
  const isAmberPrimary = isPrimaryRole && cfg.resumeHighlightStyle === 'amber-accent';

  // Resolve per-item icon color when enabled or explicitly overridden
  const rawColorValue: MainMenuIconColorValue | undefined =
    iconColorToken ?? (cfg.usePerItemIconColors ? cfg.itemIconColors?.[slotId] : undefined);
  const isCustomColor = isCustomPlayCardColor(rawColorValue);
  const resolvedColorClass = resolvePlayCardIconColorClass(rawColorValue, isLight);
  const resolvedCustomHex = isCustomColor
    ? resolvePlayCardIconHex(rawColorValue, isLight)
    : undefined;

  const renderClonedIcon = (
    node: React.ReactNode,
    sizePx: number,
    strokeWidth: number,
    overrideColorClass?: string,
    overrideCssColor?: string
  ) => {
    if (!React.isValidElement(node)) return node;
    const el = node as React.ReactElement<{
      className?: string;
      size?: number;
      width?: number;
      height?: number;
      strokeWidth?: number;
      style?: React.CSSProperties;
    }>;
    const origClass = el.props.className || '';
    const strippedSizeClass = origClass
      .replace(/\bh-\d+(?:\.\d+)?\b/g, '')
      .replace(/\bw-\d+(?:\.\d+)?\b/g, '')
      .trim();

    const shouldOverrideColor = Boolean(overrideColorClass || overrideCssColor);
    const finalClass = shouldOverrideColor
      ? (
          strippedSizeClass.replace(/\b(?:dark:)?text-[a-z]+-\d+\b/g, '').trim() +
          (overrideColorClass ? ` ${overrideColorClass}` : '')
        ).trim()
      : strippedSizeClass;

    return React.cloneElement(el, {
      size: sizePx,
      width: sizePx,
      height: sizePx,
      strokeWidth,
      className: `shrink-0 transition-transform duration-150 ${finalClass}`.trim(),
      style: {
        ...(el.props.style || {}),
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        ...(overrideCssColor ? { color: overrideCssColor } : {}),
      },
    });
  };

  const getRowSurfaceClasses = () => {
    if (variant === 'danger') {
      return isLight
        ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
        : 'bg-red-950/40 hover:bg-red-900/50 text-red-300 border-red-900/60';
    }
    if (isSolidPrimary) {
      return isLight
        ? 'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900 shadow-sm'
        : 'bg-white text-neutral-950 hover:bg-neutral-100 border-white shadow-md';
    }
    if (isAmberPrimary) {
      return isLight
        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-950 border-amber-500/50 shadow-2xs'
        : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 border-amber-500/45 shadow-2xs';
    }
    // Secondary or 'surface-card' primary
    return isLight
      ? 'bg-white hover:bg-neutral-100/90 hover:border-amber-400/70 text-neutral-800 border-neutral-200/90 shadow-2xs'
      : 'bg-neutral-900/65 hover:bg-neutral-800/85 hover:border-amber-500/50 text-neutral-100 border-neutral-800/90 shadow-2xs';
  };

  const resolvedTitleTypography = resolveMainMenuTitleTypography(
    cfg.titleFontFamily,
    cfg.titleFontWeight,
    activePlatformPreviewMode
  );

  const shouldShowDescription = Boolean(cfg.showDescription && subtitle);

  const leftGroupLayoutClass =
    cfg.rowContentAlign === 'center'
      ? 'justify-center text-center flex-1'
      : cfg.rowContentAlign === 'space-between'
      ? 'justify-between flex-1'
      : 'justify-start text-left';

  return (
    <button
      ref={buttonRef}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-ui-element="menu-item"
      data-menu-item="true"
      data-menu-slot={slotId}
      data-menu-variant={activeStyleVariant}
      style={{
        paddingLeft: `${cfg.itemPaddingXPx}px`,
        paddingRight: `${cfg.itemPaddingXPx}px`,
        paddingTop: `${cfg.itemPaddingYPx}px`,
        paddingBottom: `${cfg.itemPaddingYPx}px`,
        minHeight: `${cfg.itemMinHeightPx}px`,
        borderRadius: `${cfg.itemRadiusPx}px`,
        borderWidth: `${cfg.itemBorderWidthPx}px`,
      }}
      className={`group relative overflow-hidden flex items-center justify-between w-full shrink-0 border transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 active:scale-[0.985] cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none ${getRowSurfaceClasses()} ${className}`}
    >
      {/* Background Watermark Icon when activeStyleVariant === 'mono-watermark-row' */}
      {activeStyleVariant === 'mono-watermark-row' && icon && (
        <div
          aria-hidden="true"
          style={{
            right: `${-cfg.watermarkOffsetXPx}px`,
            top: `calc(50% + ${cfg.watermarkOffsetYPx}px)`,
            transform: `translateY(-50%) rotate(${cfg.watermarkRotateDeg}deg) scale(${
              isHovered ? 1.08 : 1
            })`,
            opacity:
              (isHovered ? cfg.watermarkHoverOpacityPct : cfg.watermarkOpacityPct) / 100,
          }}
          className="absolute pointer-events-none select-none z-0 transition-all duration-200 ease-out"
        >
          {renderClonedIcon(
            icon,
            cfg.watermarkSizePx,
            cfg.watermarkStrokeWidth,
            resolvedColorClass,
            resolvedCustomHex
          )}
        </div>
      )}

      {/* Foreground Left Grouping: [Optional Leading Icon + Large Title (+ Optional Subtitle)] */}
      <div
        style={{ gap: `${cfg.iconTitleGapPx}px` }}
        className={`relative z-10 flex items-center min-w-0 ${leftGroupLayoutClass}`}
      >
        {cfg.showIcon && icon && activeStyleVariant !== 'mono-watermark-row' && (
          cfg.showIconBox ? (
            <div
              style={{
                width: `${cfg.iconBoxSizePx}px`,
                height: `${cfg.iconBoxSizePx}px`,
                borderRadius: `${cfg.iconBoxRadiusPx}px`,
              }}
              className={`flex shrink-0 items-center justify-center transition-colors ${
                isSolidPrimary
                  ? isLight
                    ? 'bg-white/15 text-white'
                    : 'bg-neutral-900/15 text-neutral-950'
                  : isAmberPrimary
                  ? 'bg-amber-500/20 text-amber-500'
                  : isLight
                  ? 'bg-neutral-100 text-neutral-700 group-hover:bg-neutral-200/80'
                  : 'bg-neutral-800/90 text-neutral-200 group-hover:bg-neutral-700/80'
              }`}
            >
              {renderClonedIcon(
                icon,
                cfg.iconSizePx,
                cfg.iconStrokeWidth,
                resolvedColorClass,
                resolvedCustomHex
              )}
            </div>
          ) : (
            <div
              className={`flex shrink-0 items-center justify-center transition-colors ${
                isSolidPrimary
                  ? isLight
                    ? 'text-white'
                    : 'text-neutral-950'
                  : isAmberPrimary
                  ? 'text-amber-500'
                  : isLight
                  ? 'text-neutral-700 group-hover:text-amber-600'
                  : 'text-neutral-200 group-hover:text-amber-400'
              }`}
            >
              {renderClonedIcon(
                icon,
                cfg.iconSizePx,
                cfg.iconStrokeWidth,
                resolvedColorClass,
                resolvedCustomHex
              )}
            </div>
          )
        )}

        <div
          style={{ gap: shouldShowDescription ? `${cfg.titleDescGapPx}px` : undefined }}
          className={`flex flex-col min-w-0 overflow-visible ${
            cfg.rowContentAlign === 'center' ? 'items-center text-center' : 'items-start text-left'
          }`}
        >
          <span
            style={{
              fontFamily: resolvedTitleTypography.fontFamily,
              fontSize: `${cfg.titleFontSizePx}px`,
              fontWeight: resolvedTitleTypography.fontWeight,
              letterSpacing: `${cfg.titleLetterSpacingEm}em`,
              lineHeight: cfg.titleLineHeight,
              textTransform: cfg.titleUppercase ? 'uppercase' : 'none',
              paddingTop: '0.22em',
              paddingBottom: '0.28em',
              marginTop: '-0.22em',
              marginBottom: '-0.28em',
              overflowX: 'clip',
              overflowY: 'visible',
              transform:
                activeTitleOffsetYPx !== 0 ? `translateY(${activeTitleOffsetYPx}px)` : undefined,
            }}
            className="whitespace-nowrap text-ellipsis overflow-visible block w-full transition-colors"
          >
            {title}
          </span>

          {shouldShowDescription && (
            <span
              style={{
                fontSize: `${cfg.descFontSizePx}px`,
                lineHeight: cfg.descLineHeight,
                paddingTop: '0.15em',
                paddingBottom: '0.2em',
                marginTop: '-0.15em',
                marginBottom: '-0.2em',
                overflowX: 'clip',
                overflowY: 'visible',
              }}
              className={`font-normal whitespace-nowrap text-ellipsis overflow-visible block w-full ${
                isSolidPrimary
                  ? isLight
                    ? 'text-neutral-300'
                    : 'text-neutral-600'
                  : isLight
                  ? 'text-neutral-500'
                  : 'text-neutral-400'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Foreground Right Grouping: [Shortcut / Arrow] */}
      {((cfg.showShortcutBadge && shortcut) ||
        (cfg.showRightArrow && hasArrow)) && (
        <div className="relative z-10 flex items-center gap-2 shrink-0 ml-3">
          {cfg.showShortcutBadge && shortcut && (
            <KeycapBadge
              size="sm"
              shortcut={shortcut}
              isLight={isSolidPrimary ? !isLight : isLight}
            />
          )}
          {cfg.showRightArrow && hasArrow && (
            <ChevronRight
              style={{
                width: `${cfg.rightArrowSizePx}px`,
                height: `${cfg.rightArrowSizePx}px`,
              }}
              className={`transition-transform group-hover:translate-x-0.5 ${
                isSolidPrimary
                  ? isLight
                    ? 'text-neutral-300'
                    : 'text-neutral-600'
                  : isLight
                  ? 'text-neutral-400 group-hover:text-neutral-700'
                  : 'text-neutral-500 group-hover:text-neutral-300'
              }`}
            />
          )}
        </div>
      )}
    </button>
  );
});

MainMenuRow.displayName = 'MainMenuRow';
