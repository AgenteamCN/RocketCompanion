import React, { createContext, useContext, useState } from 'react';
import { ArrowLeft, LogOut, Minimize2 } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { getSurfaceCalibrationOverride } from '../manifest/surfaceCalibration';
import { useCloudProfileSyncStore } from '../stores/cloudProfileSyncStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { resolvePanelHeaderBackBtnGeometry, type PanelSizingConfig, type PanelSizingMode } from '../tokens/menuLayoutTokens';
import { resolvePanelHeaderBtnSurfaceClasses, resolvePanelContainerSizingAndStyle } from './PanelFooter';

export const MorphContainerContext = createContext<boolean>(false);
export const useInMorphContainer = () => useContext(MorphContainerContext);

const PanelSizingModeContext = createContext<PanelSizingMode>('fixed');

export interface PanelHeaderProps {
  title: string;
  onBack?: () => void;
  backDisabled?: boolean;
  rightElement?: React.ReactNode;
  onRightAction?: () => void;
  showRightAction?: boolean;
  rightActionIcon?: React.ReactNode;
  rightActionLabel?: string;
  onRightActionHoverChange?: (hovered: boolean) => void;
  isLight?: boolean;
  className?: string;
  titleClassName?: string;
  style?: React.CSSProperties;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  onBack,
  backDisabled = false,
  rightElement,
  onRightAction,
  showRightAction,
  rightActionIcon,
  rightActionLabel = 'Live Preview',
  onRightActionHoverChange,
  isLight = false,
  className = '',
  titleClassName = '',
  style,
}) => {
  const headerPadX = useMenuLayoutStore((s) => s.panelHeaderPaddingX);
  const headerPadY = useMenuLayoutStore((s) => s.panelHeaderPaddingY);
  const titleFontSize = useMenuLayoutStore((s) => s.panelHeaderTitleFontSize);
  const backBtnWidth = useMenuLayoutStore((s) => s.panelHeaderBackBtnWidth);
  const backBtnHeight = useMenuLayoutStore((s) => s.panelHeaderBackBtnHeight);
  const backBtnShowArrow = useMenuLayoutStore((s) => s.panelHeaderBackBtnShowArrow);
  const backBtnShowLabel = useMenuLayoutStore((s) => s.panelHeaderBackBtnShowLabel);
  const backBtnIdleTone = useMenuLayoutStore((s) => s.panelHeaderBackBtnIdleTone);
  const backBtnStyle = useMenuLayoutStore((s) => s.panelHeaderBackBtnStyle);
  const backBtnRadiusMode = useMenuLayoutStore((s) => s.panelHeaderBackBtnRadiusMode);
  const backBtnCustomRadius = useMenuLayoutStore((s) => s.panelHeaderBackBtnRadius);
  const backBtnInnerRadius = useMenuLayoutStore((s) => s.panelHeaderBackBtnInnerRadius);
  const backBtnRadiusTL = useMenuLayoutStore((s) => s.panelHeaderBackBtnRadiusTL);
  const backBtnRadiusTR = useMenuLayoutStore((s) => s.panelHeaderBackBtnRadiusTR);
  const backBtnRadiusBR = useMenuLayoutStore((s) => s.panelHeaderBackBtnRadiusBR);
  const backBtnRadiusBL = useMenuLayoutStore((s) => s.panelHeaderBackBtnRadiusBL);
  const showRightBtnToken = useMenuLayoutStore((s) => s.panelHeaderShowRightBtn);
  const rightBtnTransform = useMenuLayoutStore((s) => s.panelHeaderRightBtnTransform);
  const rightBtnExpandOnHover = useMenuLayoutStore((s) => s.panelHeaderRightBtnExpandOnHover);
  const panelOuterRadius = useMenuLayoutStore((s) => s.panelOuterRadius);

  const activeRemoteSession = useCloudProfileSyncStore((s) => s.activeRemoteSession);
  const exitRemoteTuningSession = useCloudProfileSyncStore((s) => s.exitRemoteTuningSession);

  const [rightHovered, setRightHovered] = useState(false);

  const btnGeom = resolvePanelHeaderBackBtnGeometry({
    panelHeaderPaddingX: headerPadX, panelHeaderPaddingY: headerPadY,
    panelHeaderBackBtnWidth: backBtnWidth, panelHeaderBackBtnHeight: backBtnHeight,
    panelHeaderBackBtnRadiusMode: backBtnRadiusMode, panelHeaderBackBtnRadius: backBtnCustomRadius,
    panelHeaderBackBtnInnerRadius: backBtnInnerRadius, panelHeaderBackBtnRadiusTL: backBtnRadiusTL,
    panelHeaderBackBtnRadiusTR: backBtnRadiusTR, panelHeaderBackBtnRadiusBR: backBtnRadiusBR,
    panelHeaderBackBtnRadiusBL: backBtnRadiusBL, panelOuterRadius,
  });

  const effectiveShowArrow = backBtnShowArrow || !backBtnShowLabel;
  const effectiveShowLabel = backBtnShowLabel;

  const isFlushDividerMode = headerPadX === 0 && headerPadY === 0 && btnGeom.innerRadius === 0;
  const leftBorderStructureClass =
    backBtnStyle === 'surface' ? (isFlushDividerMode ? 'border-0 border-r' : 'border') : 'border-0';
  const rightBorderStructureClass =
    backBtnStyle === 'surface' ? (isFlushDividerMode ? 'border-0 border-l' : 'border') : 'border-0';

  const getBtnSurfaceClasses = (disabled = false) =>
    resolvePanelHeaderBtnSurfaceClasses({
      isLight,
      disabled,
      backBtnIdleTone,
      backBtnStyle,
      isFlushDividerMode,
    });

  const minHeaderHeight = btnGeom.height + headerPadY * 2;
  const labelFontSize = Math.max(10, Math.min(13, Math.round(btnGeom.height * 0.36)));

  const isRemoteSessionActive = Boolean(activeRemoteSession);
  const shouldRenderRightAction =
    isRemoteSessionActive || (showRightBtnToken && Boolean(showRightAction ?? onRightAction));

  const rightIconTransformStyle: React.CSSProperties =
    isRemoteSessionActive
      ? {}
      : rightBtnTransform === 'flip-x'
        ? { transform: 'scaleX(-1)' }
        : rightBtnTransform === 'rotate-90'
          ? { transform: 'rotate(90deg)' }
          : {};

  const isRightExpanded = rightHovered && rightBtnExpandOnHover;

  const remoteLogoutSurfaceClasses =
    'bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/35 border-rose-500/35 hover:border-rose-500/50 cursor-pointer ' +
    (isLight ? 'text-rose-600 hover:text-rose-700' : 'text-rose-400 hover:text-rose-300');

  const effectiveRightLabel = isRemoteSessionActive
    ? `Exit #${activeRemoteSession?.alias || activeRemoteSession?.userId}`
    : rightActionLabel;

  return (
    <div
      data-ui-element="panel-header"
      data-panel-section="header"
      data-alpha-id="Alpha:3StagePanelShell"
      style={{
        paddingLeft: `${headerPadX}px`,
        paddingRight: shouldRenderRightAction ? `${headerPadX}px` : `${headerPadX || 12}px`,
        paddingTop: `${headerPadY}px`,
        paddingBottom: `${headerPadY}px`,
        minHeight: `${minHeaderHeight}px`,
        ...style,
      }}
      className={`relative flex items-center justify-between border-b select-none shrink-0 transition-colors duration-150 ${
        isLight
          ? 'border-neutral-200/90 bg-neutral-100/50 text-neutral-900'
          : 'border-neutral-800/80 bg-neutral-950/40 text-white'
      } ${className}`}
    >
      {/* Layer 1: Container-Centered Title (centered across the full header width first; if title is too long, the left/right buttons naturally overlap it) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden px-3">
        <h2
          style={{ fontSize: `${titleFontSize}px` }}
          className={`font-bold tracking-wider uppercase whitespace-nowrap leading-snug text-center ${titleClassName}`}
        >
          {activeRemoteSession ? (
            <>
              <span className={isLight ? 'text-neutral-400 font-semibold' : 'text-neutral-500 font-semibold'}>
                {title}
              </span>
              <span
                className={`ml-2 font-extrabold normal-case ${
                  isLight ? 'text-black' : 'text-white'
                }`}
              >
                # {activeRemoteSession.alias || activeRemoteSession.userId}
              </span>
            </>
          ) : (
            title
          )}
        </h2>
      </div>

      {/* Layer 2 (Left): Fixed carved space on the far left for Back Button */}
      <div className="relative z-10 flex items-center shrink-0">
        {onBack && (
          <button
            type="button"
            disabled={backDisabled}
            onClick={backDisabled ? undefined : onBack}
            style={{
              minWidth: `${btnGeom.width}px`,
              width: effectiveShowLabel ? 'auto' : `${btnGeom.width}px`,
              height: `${btnGeom.height}px`,
              borderRadius: btnGeom.borderRadiusCss,
              paddingLeft: effectiveShowLabel ? '10px' : undefined,
              paddingRight: effectiveShowLabel ? '10px' : undefined,
            }}
            className={`inline-flex items-center justify-center gap-1.5 shrink-0 ${leftBorderStructureClass} transition-all outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 ${getBtnSurfaceClasses(backDisabled)}`}
            aria-label="Back"
          >
            {effectiveShowArrow && (
              <ArrowLeft
                className="shrink-0"
                style={{ width: `${btnGeom.iconSize}px`, height: `${btnGeom.iconSize}px` }}
              />
            )}
            {effectiveShowLabel && (
              <span
                style={{ fontSize: `${labelFontSize}px` }}
                className="font-bold tracking-wider uppercase leading-none select-none"
              >
                BACK
              </span>
            )}
          </button>
        )}
      </div>

      {/* Layer 2 (Right): Forced Red LogOut button during Remote Profile Tuning, or Standardized Right Action Button */}
      {shouldRenderRightAction ? (
        <div className="relative z-10 flex items-center shrink-0 ml-auto">
          <button
            type="button"
            data-testid={isRemoteSessionActive ? 'remote-profile-logout-btn' : undefined}
            onClick={
              isRemoteSessionActive
                ? () => {
                    void exitRemoteTuningSession();
                  }
                : onRightAction
            }
            onMouseEnter={() => {
              setRightHovered(true);
              if (!isRemoteSessionActive) {
                onRightActionHoverChange?.(true);
              }
            }}
            onMouseLeave={() => {
              setRightHovered(false);
              if (!isRemoteSessionActive) {
                onRightActionHoverChange?.(false);
              }
            }}
            style={{
              minWidth: `${btnGeom.width}px`,
              width: isRightExpanded ? 'auto' : `${btnGeom.width}px`,
              height: `${btnGeom.height}px`,
              borderRadius: btnGeom.rightBorderRadiusCss,
              paddingLeft: isRightExpanded ? '10px' : undefined,
              paddingRight: isRightExpanded ? '10px' : undefined,
            }}
            className={`inline-flex items-center justify-center gap-1.5 shrink-0 ${
              isRemoteSessionActive
                ? isFlushDividerMode
                  ? 'border-0 border-l'
                  : 'border'
                : rightBorderStructureClass
            } transition-all outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
              isRemoteSessionActive ? remoteLogoutSurfaceClasses : getBtnSurfaceClasses(false)
            }`}
            aria-label={effectiveRightLabel}
            title={
              isRemoteSessionActive
                ? `Exit remote profile tuning (#${activeRemoteSession?.alias || activeRemoteSession?.userId}) and restore local settings`
                : `${rightActionLabel} [TAB]`
            }
          >
            {isRightExpanded && (
              <span
                style={{ fontSize: `${labelFontSize}px` }}
                className="font-bold tracking-wider uppercase leading-none whitespace-nowrap select-none"
              >
                {effectiveRightLabel}
              </span>
            )}
            <span
              className="inline-flex items-center justify-center shrink-0 transition-transform duration-150"
              style={rightIconTransformStyle}
            >
              {isRemoteSessionActive ? (
                <LogOut
                  className="shrink-0"
                  style={{ width: `${btnGeom.iconSize}px`, height: `${btnGeom.iconSize}px` }}
                />
              ) : (
                rightActionIcon ?? (
                  <Minimize2
                    className="shrink-0"
                    style={{ width: `${btnGeom.iconSize}px`, height: `${btnGeom.iconSize}px` }}
                  />
                )
              )}
            </span>
          </button>
        </div>
      ) : rightElement ? (
        <div className="relative z-10 flex items-center gap-2 shrink-0 ml-auto">
          {rightElement}
        </div>
      ) : null}
    </div>
  );
};

export interface PanelContentProps {
  children: React.ReactNode;
  className?: string;
  scrollable?: boolean;
  style?: React.CSSProperties;
}

/**
 * 3-Stage Compound Panel Content Body (Layer 2+ Standard Shell)
 * Driven by L0 `useMenuLayoutStore` tokens (`panelBodyPaddingX`, `panelBodyPaddingY`).
 * - In 'fixed' sizing mode: `flex-1 min-h-0` fills the locked container height.
 * - In 'auto' sizing mode: `flex-initial min-h-0` fits natural content height while shrinking to scroll when hitting maxHeight/availH.
 */
export const PanelContent: React.FC<PanelContentProps> = ({
  children,
  className = '',
  scrollable = true,
  style,
}) => {
  const sizingMode = useContext(PanelSizingModeContext);
  const bodyPadX = useMenuLayoutStore((s) => s.panelBodyPaddingX);
  const bodyPadY = useMenuLayoutStore((s) => s.panelBodyPaddingY);
  const flexClass = sizingMode === 'auto' ? 'flex-initial min-h-0' : 'flex-1 min-h-0';

  return (
    <div
      data-ui-element="panel-content"
      data-panel-section="content"
      style={{
        paddingLeft: `${bodyPadX}px`,
        paddingRight: `${bodyPadX}px`,
        paddingTop: `${bodyPadY}px`,
        paddingBottom: `${bodyPadY}px`,
        ...style,
      }}
      className={`flex flex-col ${flexClass} w-full box-border ${
        scrollable ? 'overflow-y-auto [&>*]:shrink-0' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

export interface PanelContainerProps {
  children: React.ReactNode;
  isLight?: boolean;
  className?: string;
  transparent?: boolean;
  surfaceId?: string;
  sizing?: PanelSizingConfig;
  height?: number | string;
  width?: number | string;
  style?: React.CSSProperties;
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  children,
  isLight = false,
  className = '',
  transparent,
  surfaceId,
  sizing,
  height,
  width,
  style,
}) => {
  const inMorphContainer = useInMorphContainer();
  const isTransparent = transparent ?? inMorphContainer;

  const calibratedOverride = surfaceId
    ? getSurfaceCalibrationOverride(surfaceId) ??
      getSurfaceCalibrationOverride(`recipe:${surfaceId}`)
    : undefined;

  const {
    effectiveSizing,
    effectiveClassName,
    resolvedMaxWidth,
    sizingMode,
    standaloneSizingStyle,
  } = resolvePanelContainerSizingAndStyle({
    inMorphContainer,
    isTransparent,
    className,
    surfaceId,
    sizing,
    height,
    width,
    calibratedOverride,
  });

  const panelOuterRadius = useMenuLayoutStore((s) => s.panelOuterRadius);

  return (
    <PanelSizingModeContext.Provider value={sizingMode}>
      <div
        data-panel="container"
        data-shell-variant="menu"
        data-alpha-id="Alpha:3StagePanelShell"
        data-sizing-mode={sizingMode}
        style={{
          ...standaloneSizingStyle,
          ...(resolvedMaxWidth ? { maxWidth: resolvedMaxWidth } : {}),
          ...(!isTransparent ? { borderRadius: `${panelOuterRadius}px` } : {}),
          ...style,
        }}
        className={`flex flex-col ${
          inMorphContainer ? 'h-full' : effectiveSizing?.mode === 'auto' ? 'h-auto' : 'h-full'
        } w-full overflow-hidden transition-colors ${
          isTransparent
            ? 'bg-transparent border-0 ring-0 shadow-none'
            : `${UI_RADIUS.xl} border shadow-2xl ${
                isLight
                  ? 'bg-neutral-50/98 border-neutral-300/80 text-neutral-900 ring-1 ring-black/5'
                  : 'bg-neutral-900/98 border-neutral-700/60 text-neutral-100 ring-1 ring-white/10'
              }`
        } ${effectiveClassName}`}
      >
        {children}
      </div>
    </PanelSizingModeContext.Provider>
  );
};

