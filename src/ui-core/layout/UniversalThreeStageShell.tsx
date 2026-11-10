import React from 'react';
import { Info, Minus } from 'lucide-react';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import {
  DEFAULT_FLOATING_SHELL_TOKENS,
  type FloatingShellTokens,
} from '../tokens/menuLayoutTokens';

export type ThreeStageShellVariant = 'menu' | 'floating';

export interface FloatingWindowHeaderProps {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  rightSlot?: React.ReactNode;
  isLight?: boolean;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onIconHoverChange?: (hovered: boolean) => void;
  onMinimize?: () => void;
  onMinimizeHoverChange?: (hovered: boolean) => void;
  headerRef?: React.Ref<HTMLDivElement>;
  tokensOverride?: Partial<FloatingShellTokens>;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Stage 1 · Universal Floating Window Header
 * Driven by `useMenuLayoutStore` floating shell tokens (`floatingHeaderPaddingX`, `floatingHeaderPaddingY`,
 * `floatingHeaderTitleFontSize`, `floatingHeaderMinimizeBtnSize`, `floatingHeaderMinimizeBtnRadius`).
 * Shared across live in-game `FloatingWindowInstance` and RCUITuner audit/matrix stages.
 */
export const FloatingWindowHeader: React.FC<FloatingWindowHeaderProps> = ({
  title,
  icon,
  badge,
  rightSlot,
  isLight = false,
  onMouseDown,
  onIconHoverChange,
  onMinimize,
  onMinimizeHoverChange,
  headerRef,
  tokensOverride,
  className = '',
  style,
}) => {
  const storeHeaderPadX = useMenuLayoutStore((s) => s.floatingHeaderPaddingX);
  const storeHeaderPadY = useMenuLayoutStore((s) => s.floatingHeaderPaddingY);
  const storeTitleFontSize = useMenuLayoutStore((s) => s.floatingHeaderTitleFontSize);
  const storeMinBtnSize = useMenuLayoutStore((s) => s.floatingHeaderMinimizeBtnSize);
  const storeMinBtnRadius = useMenuLayoutStore((s) => s.floatingHeaderMinimizeBtnRadius);

  const headerPadX =
    tokensOverride?.floatingHeaderPaddingX ??
    storeHeaderPadX ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingHeaderPaddingX;
  const headerPadY =
    tokensOverride?.floatingHeaderPaddingY ??
    storeHeaderPadY ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingHeaderPaddingY;
  const titleFontSize =
    tokensOverride?.floatingHeaderTitleFontSize ??
    storeTitleFontSize ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingHeaderTitleFontSize;
  const minBtnSize =
    tokensOverride?.floatingHeaderMinimizeBtnSize ??
    storeMinBtnSize ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingHeaderMinimizeBtnSize;
  const minBtnRadius =
    tokensOverride?.floatingHeaderMinimizeBtnRadius ??
    storeMinBtnRadius ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingHeaderMinimizeBtnRadius;

  return (
    <div
      ref={headerRef}
      onMouseDown={onMouseDown}
      data-ui-element="floating-window-header"
      data-panel-section="header"
      data-floating-stage="header"
      data-alpha-id="Alpha:3StageFloatingShell"
      style={{
        paddingLeft: `${headerPadX}px`,
        paddingRight: `${headerPadX}px`,
        paddingTop: `${headerPadY}px`,
        paddingBottom: `${headerPadY}px`,
        ...style,
      }}
      className={`flex items-center justify-between border-b shrink-0 ${
        onMouseDown ? 'cursor-grab active:cursor-grabbing' : ''
      } transition-colors ${
        isLight
          ? 'border-neutral-200/90 bg-neutral-100/75 text-neutral-900'
          : 'border-neutral-800/90 bg-neutral-950/60 text-white'
      } ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {icon && (
          <div
            onMouseEnter={onIconHoverChange ? () => onIconHoverChange(true) : undefined}
            onMouseLeave={onIconHoverChange ? () => onIconHoverChange(false) : undefined}
            className="inline-flex items-center justify-center shrink-0 pl-0.5"
          >
            {icon}
          </div>
        )}
        <span
          style={{ fontSize: `${titleFontSize}px` }}
          className="font-bold tracking-tight truncate max-w-[360px] leading-snug"
        >
          {title}
        </span>
        {badge}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {rightSlot}
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            onMouseEnter={
              onMinimizeHoverChange ? () => onMinimizeHoverChange(true) : undefined
            }
            onMouseLeave={
              onMinimizeHoverChange ? () => onMinimizeHoverChange(false) : undefined
            }
            title="Minimize to top-right window stack"
            style={{
              width: `${minBtnSize}px`,
              height: `${minBtnSize}px`,
              borderRadius: `${minBtnRadius}px`,
            }}
            className={`border flex items-center justify-center cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300/80 text-neutral-700 hover:text-neutral-950'
                : 'bg-neutral-800/85 hover:bg-neutral-700/90 border-neutral-700/60 text-neutral-200 hover:text-white'
            }`}
          >
            <Minus className="h-3 w-3 stroke-[2.5]" />
          </button>
        )}
      </div>
    </div>
  );
};

export interface FloatingWindowContentProps {
  children: React.ReactNode;
  contentInnerRef?: React.Ref<HTMLDivElement>;
  scrollable?: boolean;
  hidden?: boolean;
  paddedFallback?: boolean;
  onMouseOver?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  tokensOverride?: Partial<FloatingShellTokens>;
  className?: string;
  innerClassName?: string;
  style?: React.CSSProperties;
}

/**
 * Stage 2 · Universal Floating Window Content Body
 * Driven by `useMenuLayoutStore` floating shell tokens (`floatingBodyPaddingX`, `floatingBodyPaddingY`).
 */
export const FloatingWindowContent: React.FC<FloatingWindowContentProps> = ({
  children,
  contentInnerRef,
  scrollable = false,
  hidden = false,
  paddedFallback = false,
  onMouseOver,
  onMouseLeave,
  tokensOverride,
  className = '',
  innerClassName,
  style,
}) => {
  const storeBodyPadX = useMenuLayoutStore((s) => s.floatingBodyPaddingX);
  const storeBodyPadY = useMenuLayoutStore((s) => s.floatingBodyPaddingY);

  const bodyPadX =
    tokensOverride?.floatingBodyPaddingX ??
    storeBodyPadX ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingBodyPaddingX;
  const bodyPadY =
    tokensOverride?.floatingBodyPaddingY ??
    storeBodyPadY ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingBodyPaddingY;

  return (
    <div
      data-ui-element="floating-window-content"
      data-panel-section="content"
      data-floating-stage="content"
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`flex-1 min-h-0 ${
        scrollable ? 'overflow-y-auto' : 'overflow-y-hidden'
      } overflow-x-hidden flex flex-col text-xs transition-opacity duration-100 ${
        hidden ? 'opacity-0' : 'opacity-100'
      } ${className}`}
    >
      <div
        ref={contentInnerRef}
        data-floating-stage="content-inner"
        style={
          paddedFallback
            ? {
                paddingLeft: `${bodyPadX}px`,
                paddingRight: `${bodyPadX}px`,
                paddingTop: `${bodyPadY}px`,
                paddingBottom: `${bodyPadY}px`,
              }
            : undefined
        }
        className={
          innerClassName ??
          (paddedFallback
            ? 'flex flex-col gap-2.5 w-full shrink-0'
            : 'w-full shrink-0')
        }
      >
        {children}
      </div>
    </div>
  );
};

export interface FloatingWindowFooterProps {
  defaultDescription: string;
  hoveredDescription?: string | null;
  reserveCornerDraggerSpace?: boolean;
  isLight?: boolean;
  footerRef?: React.Ref<HTMLDivElement>;
  tokensOverride?: Partial<FloatingShellTokens>;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Stage 3 · Universal Floating Window Footer
 * Driven by `useMenuLayoutStore` floating shell tokens (`floatingFooterPaddingX`, `floatingFooterPaddingY`,
 * `floatingFooterCornerReserveRightPx`, `floatingFooterFontSize`).
 */
export const FloatingWindowFooter: React.FC<FloatingWindowFooterProps> = ({
  defaultDescription,
  hoveredDescription,
  reserveCornerDraggerSpace = false,
  isLight = false,
  footerRef,
  tokensOverride,
  className = '',
  style,
}) => {
  const storeFooterPadX = useMenuLayoutStore((s) => s.floatingFooterPaddingX);
  const storeFooterPadY = useMenuLayoutStore((s) => s.floatingFooterPaddingY);
  const storeCornerReserveRightPx = useMenuLayoutStore(
    (s) => s.floatingFooterCornerReserveRightPx
  );
  const storeFooterFontSize = useMenuLayoutStore((s) => s.floatingFooterFontSize);

  const footerPadX =
    tokensOverride?.floatingFooterPaddingX ??
    storeFooterPadX ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingFooterPaddingX;
  const footerPadY =
    tokensOverride?.floatingFooterPaddingY ??
    storeFooterPadY ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingFooterPaddingY;
  const cornerReserveRightPx =
    tokensOverride?.floatingFooterCornerReserveRightPx ??
    storeCornerReserveRightPx ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingFooterCornerReserveRightPx;
  const footerFontSize =
    tokensOverride?.floatingFooterFontSize ??
    storeFooterFontSize ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingFooterFontSize;

  return (
    <div
      ref={footerRef}
      data-ui-element="floating-window-footer"
      data-panel-section="footer"
      data-floating-stage="footer"
      style={{
        paddingLeft: `${footerPadX}px`,
        paddingRight: reserveCornerDraggerSpace
          ? `${cornerReserveRightPx}px`
          : `${footerPadX}px`,
        paddingTop: `${footerPadY}px`,
        paddingBottom: `${footerPadY}px`,
        fontSize: `${footerFontSize}px`,
        ...style,
      }}
      className={`flex items-center justify-between border-t select-none shrink-0 mt-auto relative z-10 transition-colors duration-150 ${
        isLight
          ? 'border-neutral-200/90 text-neutral-600 bg-neutral-100/70'
          : 'border-neutral-800/90 text-neutral-400 bg-neutral-950/60'
      } ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
        <Info
          className={`h-3.5 w-3.5 shrink-0 transition-colors ${
            hoveredDescription
              ? 'text-amber-500'
              : isLight
              ? 'text-neutral-400'
              : 'text-neutral-500'
          }`}
        />
        <span
          className={`truncate transition-colors duration-150 ${
            hoveredDescription
              ? isLight
                ? 'text-neutral-950 font-semibold'
                : 'text-white font-semibold'
              : isLight
              ? 'text-neutral-500'
              : 'text-neutral-400'
          }`}
        >
          {hoveredDescription || defaultDescription}
        </span>
      </div>
    </div>
  );
};

export interface UniversalThreeStageShellProps {
  variant?: ThreeStageShellVariant;
  isLight?: boolean;
  outerRadius?: number;
  header?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  cornerAccessory?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * UniversalThreeStageShell
 * Unifies Menu (`variant="menu"`) and Floating Window (`variant="floating"`) 3-stage
 * Header -> Content -> Footer layout hierarchy under a single token-driven shell contract.
 */
export const UniversalThreeStageShell: React.FC<UniversalThreeStageShellProps> = ({
  variant = 'menu',
  isLight = false,
  outerRadius,
  header,
  children,
  footer,
  cornerAccessory,
  className = '',
  style,
}) => {
  const panelOuterRadius = useMenuLayoutStore((s) => s.panelOuterRadius);
  const floatingOuterRadius = useMenuLayoutStore((s) => s.floatingOuterRadius);

  const resolvedOuterRadius =
    outerRadius ??
    (variant === 'floating'
      ? floatingOuterRadius ?? DEFAULT_FLOATING_SHELL_TOKENS.floatingOuterRadius
      : panelOuterRadius);

  return (
    <div
      data-shell-variant={variant}
      data-alpha-id={
        variant === 'floating' ? 'Alpha:3StageFloatingShell' : 'Alpha:3StagePanelShell'
      }
      style={{
        borderRadius: `${resolvedOuterRadius}px`,
        ...style,
      }}
      className={`relative flex flex-col border overflow-hidden select-none outline-none shadow-2xl transition-colors ${
        isLight
          ? 'bg-neutral-50/98 border-neutral-300/90 text-neutral-900'
          : 'bg-neutral-900/98 border-neutral-700/80 text-neutral-100'
      } ${className}`}
    >
      {header}
      {children}
      {footer}
      {cornerAccessory}
    </div>
  );
};
