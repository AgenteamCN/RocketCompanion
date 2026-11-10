import React, { useState } from 'react';
import { Badge } from '../primitives/Badge';
import { type PlayCardIconColorValue } from '../tokens/colors';
import {
  type PlayCardStyleParams,
  type PlayCardStyleVariant,
} from '../stores/playCardStyleStore';
import {
  resolvePlayCardVisualState,
  renderClonedPlayCardIcon,
  getPlayCardWatermarkPositionStyle,
  getPlayCardMonoContainerAlignmentClass,
} from './playModeCardHelpers';

export interface PlayModeCardBase {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isLight?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface PlayModeCardProps extends PlayModeCardBase {
  badge?: string;
  badgeVariant?: 'primary' | 'warning' | 'success' | 'neutral' | 'amber';
  /** Optional explicit per-card icon color token or custom RGB/Hex override */
  iconColorToken?: PlayCardIconColorValue;
  /** Style variant override (defaults to styleParams.variant or 'mono-giant-watermark') */
  variant?: PlayCardStyleVariant;
  /** Optional granular style parameters (pure props-driven, zero store coupling) */
  styleParams?: Partial<PlayCardStyleParams>;
  onClick?: (id: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * [L2 Layout] PlayModeCard
 * Pure props-driven mode selection card supporting 3 distinct visual archetypes:
 * 1. 'icon-badge-top': Row 1 [Left Icon + Right Badge] -> Row 2 [Title] -> Row 3 [Description]
 * 2. 'icon-title-inline': Row 1 [Left Icon + Right Title (No Badge)] -> Row 2 [Description]
 * 3. 'mono-giant-watermark': Large JetBrains Mono title + Giant background watermark icon (~30% opacity)
 */
export const PlayModeCard: React.FC<PlayModeCardProps> = React.memo((props) => {
  const {
    id,
    title,
    subtitle,
    badge,
    badgeVariant = 'primary',
    icon,
    iconColorToken,
    isLight = false,
    disabled = false,
    variant: variantOverride,
    styleParams,
    onClick,
    onMouseEnter,
    onMouseLeave,
    className = '',
  } = props;
  const [isHovered, setIsHovered] = useState(false);

  const {
    cfg,
    activeVariant,
    perCardColorClass,
    perCardCustomCssColor,
    clampClass,
    titleFontFamily,
    watermarkColorOverride,
    watermarkCssColorOverride,
  } = resolvePlayCardVisualState(id, iconColorToken, isLight, variantOverride, styleParams);

  return (
    <button
      type="button"
      disabled={disabled}
      data-play-card-id={id}
      data-play-card-variant={activeVariant}
      onClick={() => onClick?.(id)}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
      style={{
        paddingLeft: `${cfg.cardPaddingXPx}px`,
        paddingRight: `${cfg.cardPaddingXPx}px`,
        paddingTop: `${cfg.cardPaddingYPx}px`,
        paddingBottom: `${cfg.cardPaddingYPx}px`,
        minHeight: `${cfg.cardMinHeightPx}px`,
        borderRadius: `${cfg.cardRadiusPx}px`,
      }}
      className={`group relative overflow-hidden flex flex-col w-full text-left transition-all duration-150 border cursor-pointer select-none active:scale-[0.985] ${
        isLight
          ? 'bg-neutral-50/90 hover:bg-white hover:border-amber-400 hover:shadow-xs border-neutral-200/90 text-neutral-900'
          : 'bg-neutral-850/85 hover:bg-neutral-800 hover:border-amber-500/70 hover:shadow-md border-neutral-700/80 text-neutral-100'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {/* ──────────────────────────────────────────────────────────────────────
          STYLE 1: 'icon-badge-top'
          Row 1: Left Icon + Right Badge
          Row 2: Title
          Row 3: Description
         ────────────────────────────────────────────────────────────────────── */}
      {activeVariant === 'icon-badge-top' && (
        <>
          <div
            className="flex items-center justify-between w-full shrink-0"
            style={{ marginBottom: `${cfg.style1TopRowMarginBottomPx}px` }}
          >
            {cfg.showIconBox ? (
              <div
                style={{
                  padding: `${cfg.iconBoxPaddingPx}px`,
                  borderRadius: `${cfg.iconBoxRadiusPx}px`,
                }}
                className={`border transition-colors flex items-center justify-center shrink-0 ${
                  isLight
                    ? 'bg-white border-neutral-200 group-hover:border-amber-300'
                    : 'bg-neutral-900 border-neutral-700/80 group-hover:border-amber-500/50'
                }`}
              >
                {renderClonedPlayCardIcon(
                  icon,
                  cfg.iconSizePx,
                  cfg.iconStrokeWidth,
                  perCardColorClass,
                  perCardCustomCssColor
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center shrink-0">
                {renderClonedPlayCardIcon(
                  icon,
                  cfg.iconSizePx,
                  cfg.iconStrokeWidth,
                  perCardColorClass,
                  perCardCustomCssColor
                )}
              </div>
            )}

            {badge && (
              <Badge variant={badgeVariant} size="sm" isLight={isLight}>
                {badge}
              </Badge>
            )}
          </div>

          <span
            style={{
              fontSize: `${cfg.titleFontSizePx}px`,
              fontWeight: cfg.titleFontWeight,
              fontFamily: titleFontFamily,
              marginBottom: `${cfg.style1TitleMarginBottomPx}px`,
            }}
            className="tracking-tight group-hover:text-amber-500 transition-colors leading-snug"
          >
            {title}
          </span>

          <span
            style={{
              fontSize: `${cfg.descFontSizePx}px`,
              lineHeight: cfg.descLineHeight,
            }}
            className={`${clampClass} ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}
          >
            {subtitle}
          </span>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          STYLE 2: 'icon-title-inline'
          Row 1: Left Icon + Right Title (No Badge)
          Row 2: Description
         ────────────────────────────────────────────────────────────────────── */}
      {activeVariant === 'icon-title-inline' && (
        <>
          <div
            style={{
              gap: `${cfg.inlineIconTitleGapPx}px`,
              marginBottom: `${cfg.inlineHeaderMarginBottomPx}px`,
            }}
            className={`flex items-center w-full shrink-0 ${
              cfg.inlineHeaderLayout === 'space-between' ? 'justify-between' : 'justify-start'
            }`}
          >
            {cfg.showIconBox ? (
              <div
                style={{
                  padding: `${cfg.iconBoxPaddingPx}px`,
                  borderRadius: `${cfg.iconBoxRadiusPx}px`,
                }}
                className={`border transition-colors flex items-center justify-center shrink-0 ${
                  isLight
                    ? 'bg-white border-neutral-200 group-hover:border-amber-300'
                    : 'bg-neutral-900 border-neutral-700/80 group-hover:border-amber-500/50'
                }`}
              >
                {renderClonedPlayCardIcon(
                  icon,
                  cfg.iconSizePx,
                  cfg.iconStrokeWidth,
                  perCardColorClass,
                  perCardCustomCssColor
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center shrink-0">
                {renderClonedPlayCardIcon(
                  icon,
                  cfg.iconSizePx,
                  cfg.iconStrokeWidth,
                  perCardColorClass,
                  perCardCustomCssColor
                )}
              </div>
            )}

            <span
              style={{
                fontSize: `${cfg.titleFontSizePx}px`,
                fontWeight: cfg.titleFontWeight,
                fontFamily: titleFontFamily,
              }}
              className="tracking-tight group-hover:text-amber-500 transition-colors leading-snug truncate"
            >
              {title}
            </span>
          </div>

          <span
            style={{
              fontSize: `${cfg.descFontSizePx}px`,
              lineHeight: cfg.descLineHeight,
            }}
            className={`${clampClass} ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}
          >
            {subtitle}
          </span>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          STYLE 3: 'mono-giant-watermark'
          Background: Giant Watermark Icon (~30% opacity, configurable size/pos/rot/color)
          Foreground: Large JetBrains Mono Title (+ optional badge/desc)
         ────────────────────────────────────────────────────────────────────── */}
      {activeVariant === 'mono-giant-watermark' && (
        <>
          {/* Giant Background Watermark Icon Layer */}
          <div
            aria-hidden="true"
            style={{
              ...getPlayCardWatermarkPositionStyle(cfg, isHovered),
              opacity:
                (isHovered ? cfg.watermarkHoverOpacityPct : cfg.watermarkOpacityPct) / 100,
            }}
            className="absolute pointer-events-none select-none z-0 transition-all duration-200 ease-out"
          >
            {renderClonedPlayCardIcon(
              icon,
              cfg.watermarkSizePx,
              cfg.watermarkStrokeWidth,
              watermarkColorOverride,
              watermarkCssColorOverride
            )}
          </div>

          {/* Optional Corner Badge */}
          {cfg.monoShowBadge && badge && (
            <div className="relative z-10 w-full flex justify-end mb-auto">
              <Badge variant={badgeVariant} size="sm" isLight={isLight}>
                {badge}
              </Badge>
            </div>
          )}

          {/* Foreground Large JetBrains Mono Title & Optional Subtitle */}
          <div
            className={`relative z-10 flex flex-col flex-1 w-full ${getPlayCardMonoContainerAlignmentClass(
              cfg.monoTitleAnchor
            )}`}
          >
            <span
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: `${cfg.monoTitleSizePx}px`,
                fontWeight: cfg.monoTitleWeight,
                letterSpacing: `${cfg.monoLetterSpacingEm}em`,
                lineHeight: cfg.monoLineHeight,
                textTransform: cfg.monoUppercase ? 'uppercase' : 'none',
              }}
              className={`group-hover:text-amber-500 transition-colors ${
                isLight ? 'text-neutral-900' : 'text-neutral-100'
              }`}
            >
              {title}
            </span>

            {cfg.monoShowDescription && (
              <span
                style={{
                  fontSize: `${cfg.descFontSizePx}px`,
                  lineHeight: cfg.descLineHeight,
                }}
                className={`mt-1.5 ${clampClass} ${
                  isLight ? 'text-neutral-600/90' : 'text-neutral-300/85'
                }`}
              >
                {subtitle}
              </span>
            )}
          </div>
        </>
      )}
    </button>
  );
});

PlayModeCard.displayName = 'PlayModeCard';
