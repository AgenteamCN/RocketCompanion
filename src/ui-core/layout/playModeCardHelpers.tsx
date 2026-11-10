import React from 'react';
import {
  resolvePlayCardIconColorClass,
  resolvePlayCardIconHex,
  isCustomPlayCardColor,
  type PlayCardIconColorValue,
} from '../tokens/colors';
import {
  DEFAULT_PLAY_CARD_STYLE_PARAMS,
  DEFAULT_CARD_ICON_COLORS,
  type PlayCardStyleParams,
  type PlayCardStyleVariant,
  type PlayModeCardId,
} from '../stores/playCardStyleStore';

export interface ResolvedPlayCardVisualState {
  cfg: PlayCardStyleParams;
  activeVariant: PlayCardStyleVariant;
  perCardColorClass: string | undefined;
  perCardCustomCssColor: string | undefined;
  clampClass: string;
  titleFontFamily: string;
  watermarkColorOverride: string | undefined;
  watermarkCssColorOverride: string | undefined;
}

export function resolvePlayCardVisualState(
  id: string,
  iconColorToken: PlayCardIconColorValue | undefined,
  isLight: boolean,
  variantOverride: PlayCardStyleVariant | undefined,
  styleParams: Partial<PlayCardStyleParams> | undefined
): ResolvedPlayCardVisualState {
  const cfg: PlayCardStyleParams = {
    ...DEFAULT_PLAY_CARD_STYLE_PARAMS,
    ...(styleParams || {}),
    cardIconColors: {
      ...DEFAULT_CARD_ICON_COLORS,
      ...(styleParams?.cardIconColors || {}),
    },
  };
  const activeVariant: PlayCardStyleVariant = variantOverride ?? cfg.variant;

  const normalizedCardKey = (id === 'online-training' ? 'host-training' : id) as PlayModeCardId;
  const resolvedCardColorValue: PlayCardIconColorValue | undefined =
    iconColorToken ?? cfg.cardIconColors?.[normalizedCardKey];
  const isCustomColor = isCustomPlayCardColor(resolvedCardColorValue);
  const perCardColorClass = resolvePlayCardIconColorClass(resolvedCardColorValue, isLight);
  const perCardCustomCssColor = isCustomColor
    ? resolvePlayCardIconHex(resolvedCardColorValue, isLight)
    : undefined;

  const clampClass =
    cfg.descLineClamp === 1
      ? 'line-clamp-1'
      : cfg.descLineClamp === 2
      ? 'line-clamp-2'
      : cfg.descLineClamp === 3
      ? 'line-clamp-3'
      : '';

  const titleFontFamily = cfg.titleUseMonoFont ? 'var(--font-jetbrains)' : 'var(--font-apple)';

  const watermarkColorOverride =
    cfg.watermarkColorMode === 'amber'
      ? 'text-amber-500'
      : cfg.watermarkColorMode === 'neutral'
      ? isLight
        ? 'text-neutral-500'
        : 'text-neutral-300'
      : perCardColorClass;

  const watermarkCssColorOverride =
    cfg.watermarkColorMode === 'mode-accent' ? perCardCustomCssColor : undefined;

  return {
    cfg,
    activeVariant,
    perCardColorClass,
    perCardCustomCssColor,
    clampClass,
    titleFontFamily,
    watermarkColorOverride,
    watermarkCssColorOverride,
  };
}

export function renderClonedPlayCardIcon(
  node: React.ReactNode,
  sizePx: number,
  strokeWidth: number,
  overrideColorClass?: string,
  overrideCssColor?: string
): React.ReactNode {
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
  const strippedClass = origClass
    .replace(/\bh-\d+(?:\.\d+)?\b/g, '')
    .replace(/\bw-\d+(?:\.\d+)?\b/g, '')
    .trim();
  const shouldStripColorClasses = Boolean(overrideColorClass || overrideCssColor);
  const colorProcessedClass = shouldStripColorClasses
    ? (
        strippedClass.replace(/\b(?:dark:)?text-[a-z]+-\d+\b/g, '').trim() +
        (overrideColorClass ? ` ${overrideColorClass}` : '')
      ).trim()
    : strippedClass;

  return React.cloneElement(el, {
    size: sizePx,
    width: sizePx,
    height: sizePx,
    strokeWidth,
    className: `shrink-0 transition-transform duration-200 ${colorProcessedClass}`.trim(),
    style: {
      ...(el.props.style || {}),
      width: `${sizePx}px`,
      height: `${sizePx}px`,
      ...(overrideCssColor ? { color: overrideCssColor } : {}),
    },
  });
}

export function getPlayCardWatermarkPositionStyle(
  cfg: PlayCardStyleParams,
  isHovered: boolean
): React.CSSProperties {
  const ox = cfg.watermarkOffsetXPx;
  const oy = cfg.watermarkOffsetYPx;
  const scale = isHovered ? cfg.watermarkHoverScale : 1;
  const rot = cfg.watermarkRotateDeg;

  switch (cfg.watermarkAnchor) {
    case 'center':
      return {
        left: `calc(50% + ${ox}px)`,
        top: `calc(50% + ${oy}px)`,
        transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`,
      };
    case 'right-center':
      return {
        right: `${-ox}px`,
        top: `calc(50% + ${oy}px)`,
        transform: `translateY(-50%) rotate(${rot}deg) scale(${scale})`,
      };
    case 'top-right':
      return {
        right: `${-ox}px`,
        top: `${-oy}px`,
        transform: `rotate(${rot}deg) scale(${scale})`,
      };
    case 'bottom-left':
      return {
        left: `${-ox}px`,
        bottom: `${-oy}px`,
        transform: `rotate(${rot}deg) scale(${scale})`,
      };
    case 'bottom-right':
    default:
      return {
        right: `${-ox}px`,
        bottom: `${-oy}px`,
        transform: `rotate(${rot}deg) scale(${scale})`,
      };
  }
}

export function getPlayCardMonoContainerAlignmentClass(
  anchor: PlayCardStyleParams['monoTitleAnchor']
): string {
  switch (anchor) {
    case 'center':
      return 'items-center justify-center text-center';
    case 'bottom-left':
      return 'items-start justify-end text-left';
    case 'top-left':
      return 'items-start justify-start text-left';
    case 'bottom-right':
      return 'items-end justify-end text-right';
    case 'center-left':
    default:
      return 'items-start justify-center text-left';
  }
}
