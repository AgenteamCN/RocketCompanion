import React from 'react';
import { Info } from 'lucide-react';
import { KeycapBadge } from '../primitives/KeycapBadge';
import { useCloudProfileSyncStore } from '../stores/cloudProfileSyncStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import type { PanelSizingConfig, PanelSizingMode } from '../tokens/menuLayoutTokens';

export interface PanelFooterProps {
  children?: React.ReactNode;
  /** Default page description shown in muted gray when no item is hovered */
  defaultDescription?: string;
  /** Active hovered item description shown in high-contrast black/white when present */
  hoveredDescription?: string | null;
  /** Optional right-side capability / status slot (e.g. Live Preview [TAB] or custom node) */
  rightSlot?: React.ReactNode;
  /** Convenience label for the right-side capability slot (e.g. "Live Preview") */
  rightLabel?: string;
  /** Convenience keyboard shortcut badge for the right-side capability slot (e.g. "TAB") */
  rightShortcut?: string;
  /** Optional click handler for the right-side capability slot */
  onRightClick?: () => void;
  /** Optional custom leading icon for the left description compartment */
  icon?: React.ReactNode;
  isLight?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 3-Stage Compound Panel Footer (Layer 2+ Standard Shell)
 * Driven by L0 `useMenuLayoutStore` tokens (`panelFooterPaddingX`, `panelFooterPaddingY`, `panelFooterFontSize`,
 * `panelFooterSplitRight`, `panelFooterRightDivider`, `panelFooterRightPaddingX`):
 * - Left compartment: Info icon + idle muted gray / hover high-contrast description.
 * - Right compartment (when split is enabled and `rightSlot` / `rightLabel` / `rightShortcut` is provided):
 *   carved right capability slot with optional vertical divider (`border-l`).
 */
export const PanelFooter: React.FC<PanelFooterProps> = ({
  children,
  defaultDescription,
  hoveredDescription,
  rightSlot,
  rightLabel,
  rightShortcut,
  onRightClick,
  isLight = false,
  className = '',
  style,
}) => {
  const footerPadX = useMenuLayoutStore((s) => s.panelFooterPaddingX);
  const footerPadY = useMenuLayoutStore((s) => s.panelFooterPaddingY);
  const footerFontSize = useMenuLayoutStore((s) => s.panelFooterFontSize);
  const footerSplitRight = useMenuLayoutStore((s) => s.panelFooterSplitRight);
  const footerRightDivider = useMenuLayoutStore((s) => s.panelFooterRightDivider);
  const footerRightPadX = useMenuLayoutStore((s) => s.panelFooterRightPaddingX);
  const activeRemoteSession = useCloudProfileSyncStore((s) => s.activeRemoteSession);

  const hasUnifiedDesc =
    defaultDescription !== undefined || hoveredDescription !== undefined;
  const activeText = hoveredDescription || defaultDescription || '';
  const isHoveredActive = Boolean(hoveredDescription);

  const hasRightCompartment =
    !activeRemoteSession &&
    footerSplitRight &&
    Boolean(rightSlot || rightLabel || rightShortcut);

  return (
    <div
      data-ui-element="panel-footer"
      data-panel-section="footer"
      data-alpha-id="Alpha:3StagePanelShell"
      style={{
        paddingLeft: hasRightCompartment ? '0px' : `${footerPadX}px`,
        paddingRight: hasRightCompartment ? '0px' : `${footerPadX}px`,
        paddingTop: hasRightCompartment ? '0px' : `${footerPadY}px`,
        paddingBottom: hasRightCompartment ? '0px' : `${footerPadY}px`,
        fontSize: `${footerFontSize}px`,
        ...style,
      }}
      className={`flex items-stretch justify-between border-t select-none shrink-0 mt-auto relative z-10 transition-colors duration-150 ${
        isLight
          ? 'border-neutral-200/90 text-neutral-600 bg-neutral-100/60'
          : 'border-neutral-800/80 text-neutral-400 bg-neutral-950/50'
      } ${className}`}
    >
      {/* Left Compartment: Info Description */}
      <div
        style={
          hasRightCompartment
            ? {
                paddingLeft: `${footerPadX}px`,
                paddingRight: '12px',
                paddingTop: `${footerPadY}px`,
                paddingBottom: `${footerPadY}px`,
              }
            : undefined
        }
        className="flex items-center gap-2 min-w-0 flex-1 truncate"
      >
        {hasUnifiedDesc ? (
          <>
            <Info
              className={`h-3.5 w-3.5 shrink-0 ${
                isLight ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            />
            <span
              className={`truncate transition-colors duration-150 ${
                isHoveredActive
                  ? isLight
                    ? 'text-neutral-900 font-medium'
                    : 'text-neutral-100 font-medium'
                  : isLight
                  ? 'text-neutral-400'
                  : 'text-neutral-500'
              }`}
            >
              {activeText}
            </span>
          </>
        ) : (
          children
        )}
      </div>

      {/* Right Compartment: Split Capability / Shortcut Indicator */}
      {hasRightCompartment && (
        <div
          onClick={onRightClick}
          style={{
            paddingLeft: `${footerRightPadX}px`,
            paddingRight: `${footerRightPadX}px`,
            paddingTop: `${footerPadY}px`,
            paddingBottom: `${footerPadY}px`,
          }}
          className={`flex items-center gap-1.5 shrink-0 transition-colors ${
            footerRightDivider
              ? isLight
                ? 'border-l border-neutral-200/90'
                : 'border-l border-neutral-800/80'
              : ''
          } ${
            onRightClick
              ? isLight
                ? 'hover:bg-neutral-200/75 text-neutral-600 hover:text-neutral-950 cursor-pointer'
                : 'hover:bg-neutral-800/80 text-neutral-400 hover:text-white cursor-pointer'
              : isLight
              ? 'text-neutral-500'
              : 'text-neutral-400'
          }`}
        >
          {rightSlot ?? (
            <>
              {rightLabel && (
                <span className="font-medium tracking-tight whitespace-nowrap leading-none">
                  {rightLabel}
                </span>
              )}
              {rightShortcut && (
                <KeycapBadge shortcut={rightShortcut} size="sm" isLight={isLight} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export interface PanelHeaderBtnSurfaceParams {
  isLight: boolean;
  disabled: boolean;
  backBtnIdleTone: string;
  backBtnStyle: string;
  isFlushDividerMode: boolean;
}

export function resolvePanelHeaderBtnSurfaceClasses({
  isLight,
  disabled,
  backBtnIdleTone,
  backBtnStyle,
  isFlushDividerMode,
}: PanelHeaderBtnSurfaceParams): string {
  const borderColorClass = isLight
    ? 'border-neutral-200/90 hover:border-neutral-300'
    : 'border-neutral-800/80 hover:border-neutral-700';

  if (disabled) {
    if (backBtnIdleTone === 'match-header' || backBtnStyle === 'ghost') {
      return `${isLight ? 'text-neutral-300' : 'text-neutral-600'} bg-transparent ${borderColorClass} opacity-50 cursor-not-allowed`;
    }
    if (backBtnIdleTone === 'muted-gray' || backBtnStyle === 'subtle') {
      return `${isLight ? 'bg-neutral-200/40 text-neutral-300' : 'bg-neutral-900/50 text-neutral-600'} ${borderColorClass} opacity-50 cursor-not-allowed`;
    }
    return `${isLight ? 'bg-white/70 text-neutral-300' : 'bg-neutral-800/50 text-neutral-600'} ${borderColorClass} opacity-50 cursor-not-allowed`;
  }

  if (backBtnIdleTone === 'match-header') {
    return isLight
      ? `bg-transparent hover:bg-neutral-200/80 active:bg-neutral-300/75 ${borderColorClass} text-neutral-500 hover:text-neutral-950 cursor-pointer`
      : `bg-transparent hover:bg-neutral-800/85 active:bg-neutral-700/80 ${borderColorClass} text-neutral-400 hover:text-white cursor-pointer`;
  }

  if (backBtnIdleTone === 'muted-gray') {
    if (isFlushDividerMode) {
      return isLight
        ? `bg-neutral-200/50 hover:bg-neutral-200/95 active:bg-neutral-300/80 ${borderColorClass} text-neutral-500 hover:text-neutral-950 cursor-pointer`
        : `bg-neutral-900/65 hover:bg-neutral-800/90 active:bg-neutral-700/85 ${borderColorClass} text-neutral-400 hover:text-white cursor-pointer`;
    }
    return isLight
      ? 'bg-neutral-200/55 hover:bg-white border-neutral-300/75 hover:border-neutral-300 text-neutral-500 hover:text-neutral-950 shadow-2xs active:scale-95 cursor-pointer'
      : 'bg-neutral-800/55 hover:bg-neutral-700/90 border-neutral-700/50 hover:border-neutral-600 text-neutral-400 hover:text-white shadow-2xs active:scale-95 cursor-pointer';
  }

  if (isFlushDividerMode) {
    return isLight
      ? `bg-white/90 hover:bg-neutral-200/90 active:bg-neutral-300/80 ${borderColorClass} text-neutral-700 hover:text-neutral-950 cursor-pointer`
      : `bg-neutral-800/80 hover:bg-neutral-700/90 active:bg-neutral-600/80 ${borderColorClass} text-neutral-200 hover:text-white cursor-pointer`;
  }
  return isLight
    ? 'bg-white hover:bg-neutral-100 border-neutral-300/80 text-neutral-700 hover:text-neutral-950 shadow-2xs active:scale-95 cursor-pointer'
    : 'bg-neutral-800/85 hover:bg-neutral-700/90 border-neutral-700/60 text-neutral-200 hover:text-white shadow-2xs active:scale-95 cursor-pointer';
}

export function resolvePanelContainerSizingAndStyle(params: {
  inMorphContainer: boolean;
  isTransparent: boolean;
  className: string;
  surfaceId?: string;
  sizing?: PanelSizingConfig;
  height?: number | string;
  width?: number | string;
  calibratedOverride?: {
    width?: number;
    height?: number | string;
    minHeight?: number;
    maxHeight?: number;
    mode?: string;
  };
}): {
  effectiveSizing?: PanelSizingConfig;
  effectiveClassName: string;
  resolvedMaxWidth?: string;
  sizingMode: PanelSizingMode;
  standaloneSizingStyle: React.CSSProperties;
} {
  const {
    inMorphContainer,
    isTransparent,
    className,
    sizing,
    height,
    width,
    calibratedOverride,
  } = params;

  const effectiveSizing: PanelSizingConfig | undefined =
    sizing && calibratedOverride
      ? {
          ...sizing,
          ...(calibratedOverride.width !== undefined ? { width: calibratedOverride.width } : {}),
          ...(typeof calibratedOverride.height === 'number' ? { targetHeight: calibratedOverride.height } : {}),
          ...(calibratedOverride.minHeight !== undefined ? { minHeight: calibratedOverride.minHeight } : {}),
          ...(calibratedOverride.maxHeight !== undefined ? { maxHeight: calibratedOverride.maxHeight } : {}),
          ...(calibratedOverride.mode !== undefined
            ? { mode: calibratedOverride.mode === 'adaptive' ? 'auto' : 'fixed' }
            : {}),
        }
      : sizing;

  const effectiveClassName = isTransparent
    ? className.replace(/shadow-\[[^\]]+\]/g, '').replace(/\bshadow(-\w+)?\b/g, '').trim()
    : className;

  const effectiveWidth = effectiveSizing?.width ?? calibratedOverride?.width ?? width;
  const resolvedMaxWidth =
    !inMorphContainer && effectiveWidth !== undefined
      ? typeof effectiveWidth === 'number'
        ? `${effectiveWidth}px`
        : effectiveWidth
      : undefined;

  const sizingMode: PanelSizingMode = effectiveSizing?.mode ?? 'fixed';

  const standaloneSizingStyle: React.CSSProperties = {};
  if (!inMorphContainer) {
    if (effectiveSizing) {
      if (effectiveSizing.mode === 'auto') {
        standaloneSizingStyle.height = 'auto';
        standaloneSizingStyle.minHeight = `min(${effectiveSizing.minHeight}px, var(--avail-h, 100vh))`;
        standaloneSizingStyle.maxHeight = `min(${effectiveSizing.maxHeight}px, var(--avail-h, 100vh))`;
      } else {
        standaloneSizingStyle.height = `min(${effectiveSizing.targetHeight}px, var(--avail-h, 100vh))`;
        standaloneSizingStyle.maxHeight = `min(${effectiveSizing.targetHeight}px, var(--avail-h, 100vh))`;
      }
    } else if (height !== undefined) {
      const hStr = typeof height === 'number' ? `${height}px` : height;
      standaloneSizingStyle.height = `min(${hStr}, var(--avail-h, 100vh))`;
      standaloneSizingStyle.maxHeight = `min(${hStr}, var(--avail-h, 100vh))`;
    }
  }

  return {
    effectiveSizing,
    effectiveClassName,
    resolvedMaxWidth,
    sizingMode,
    standaloneSizingStyle,
  };
}


