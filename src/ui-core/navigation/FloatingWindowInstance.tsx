import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { FloatingWindowItem } from '../stores/floatingStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { DEFAULT_FLOATING_SHELL_TOKENS } from '../tokens/menuLayoutTokens';
import {
  FloatingWindowContent,
  FloatingWindowFooter,
  FloatingWindowHeader,
} from '../layout/UniversalThreeStageShell';
import { getFloatingWindowIcon } from './FloatingWindowIcon';
import { CornerCurvedDragger } from './CornerCurvedDragger';
import type { ContainerBounds } from './floatingWindowGeometry';
import { useFloatingWindowDragResize } from './useFloatingWindowDragResize';
import { OUTER_RADIUS } from './floatingWindowGeometry';

export interface FloatingWindowRenderContext {
  isLight: boolean;
  width: number;
  height: number;
  containerBounds: ContainerBounds | null;
  intrinsicMaxHeight: number | null;
  minWidth: number;
  autoMinWidth: number;
  minHeight: number;
  presetMinHeight: number;
  scrollbarReservePx: number;
  hoveredDescription: string | null;
  setHoveredDescription: (desc: string | null) => void;
}

export interface FloatingWindowInstanceProps {
  item: FloatingWindowItem;
  index: number;
  batchMinimizeSignal?: number;
  opacity?: number;
  isLight?: boolean;
  zIndex: number;
  showFooter?: boolean;
  defaultDescription: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  containerBounds: ContainerBounds | null;
  renderWindowContent?: (
    item: FloatingWindowItem,
    ctx: FloatingWindowRenderContext
  ) => React.ReactNode;
  onFocus: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onUpdatePosition: (pos: { x: number; y: number }) => void;
  onUpdateSize: (size: { width: number; height: number }, userAdjusted?: boolean) => void;
  onReportIntrinsicMetrics?: (metrics: {
    autoMinWidth?: number;
    scrollbarReservePx?: number;
    intrinsicMaxHeight?: number;
  }) => void;
}

export const FloatingWindowInstance: React.FC<FloatingWindowInstanceProps> = ({
  item,
  index,
  batchMinimizeSignal,
  opacity = 85,
  isLight = false,
  zIndex,
  showFooter = true,
  defaultDescription,
  containerRef,
  containerBounds,
  renderWindowContent,
  onFocus,
  onMinimize,
  onUpdatePosition,
  onUpdateSize,
  onReportIntrinsicMetrics,
}) => {
  const {
    headerElRef,
    contentInnerElRef,
    footerElRef,
    isResizable,
    intrinsicMaxHeight,
    autoMinWidth,
    effectiveMinWidth,
    presetMinHeight,
    effectiveMinHeight,
    effectiveMaxHeight,
    scrollbarReservePx,
    clampedGeometry,
    minimizePhase,
    isInteracting,
    isResizingNow,
    handleTitleBarMouseDown,
    handleResizeMouseDown,
    handleTriggerMinimize,
  } = useFloatingWindowDragResize({
    item,
    index,
    batchMinimizeSignal,
    showFooter,
    containerBounds,
    onFocus,
    onMinimize,
    onUpdatePosition,
    onUpdateSize,
    onReportIntrinsicMetrics,
  });

  const floatingOuterRadius =
    useMenuLayoutStore((s) => s.floatingOuterRadius) ??
    DEFAULT_FLOATING_SHELL_TOKENS.floatingOuterRadius ??
    OUTER_RADIUS;

  const [cornerGripHovered, setCornerGripHovered] = useState(false);
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const handleContentMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const descEl = target.closest('[data-footer-desc],[title]') as HTMLElement | null;
    if (descEl) {
      const desc =
        descEl.getAttribute('data-footer-desc') || descEl.getAttribute('title');
      if (desc && desc.trim().length > 0) {
        setHoveredDesc(desc.trim());
      }
    }
  };

  const handleContentMouseLeave = () => {
    setHoveredDesc(null);
  };

  const getHeaderIcon = () => getFloatingWindowIcon(item.category, item.id);

  const isResizingToStack = minimizePhase === 'resizing_to_stack';
  const isContentHidden = minimizePhase !== 'idle';
  const showCornerDragger = isResizable && !isContentHidden;

  const stackX = containerBounds
    ? containerBounds.width - 56
    : containerRef?.current
    ? containerRef.current.clientWidth - 56
    : 600;
  const effectiveOpacity = Math.max(0.01, Math.min(1, (opacity ?? 85) / 100));

  const renderCtx: FloatingWindowRenderContext = {
    isLight,
    width: clampedGeometry.width,
    height: clampedGeometry.height,
    containerBounds,
    intrinsicMaxHeight,
    minWidth: effectiveMinWidth,
    autoMinWidth,
    minHeight: effectiveMinHeight,
    presetMinHeight,
    scrollbarReservePx,
    hoveredDescription: hoveredDesc,
    setHoveredDescription: setHoveredDesc,
  };

  const customContent = renderWindowContent?.(item, renderCtx);

  const isVerticallyCompressed =
    intrinsicMaxHeight !== null && clampedGeometry.height < intrinsicMaxHeight - 2;

  return (
    <motion.div
      onMouseDown={onFocus}
      initial={{ opacity: 0 }}
      animate={
        isResizingToStack
          ? {
              x: stackX,
              y: 16,
              width: 40,
              height: 40,
              opacity: 0,
              borderRadius: 12,
            }
          : {
              x: clampedGeometry.x,
              y: clampedGeometry.y,
              width: clampedGeometry.width,
              height: clampedGeometry.height,
              opacity: effectiveOpacity,
              borderRadius: floatingOuterRadius,
            }
      }
      transition={{
        duration: isInteracting ? 0 : isResizingToStack ? 0.24 : 0,
        ease: [0.2, 0.8, 0.25, 1],
      }}
      style={{
        zIndex,
        position: 'absolute',
        top: 0,
        left: 0,
      }}
      data-shell-variant="floating"
      data-alpha-id="Alpha:3StageFloatingShell"
      data-floating-window-id={item.id}
      data-min-width={effectiveMinWidth}
      data-auto-min-width={autoMinWidth}
      data-min-height={effectiveMinHeight}
      data-preset-min-height={presetMinHeight}
      data-scrollbar-reserve={scrollbarReservePx}
      data-max-height={effectiveMaxHeight}
      className={`pointer-events-auto flex flex-col border overflow-hidden select-none outline-none shadow-2xl ${
        isLight
          ? 'bg-neutral-50/98 border-neutral-300/90 text-neutral-900'
          : 'bg-neutral-900/98 border-neutral-700/80 text-neutral-100'
      }`}
    >
      {/* STAGE 1: CALIBRATED CLASSIC FLOATING WINDOW HEADER */}
      <FloatingWindowHeader
        headerRef={headerElRef}
        title={item.title}
        icon={getHeaderIcon()}
        isLight={isLight}
        onMouseDown={handleTitleBarMouseDown}
        onIconHoverChange={(hovered) =>
          setHoveredDesc(
            hovered
              ? `Window Category Icon (${item.category || 'telemetry'}): Drag titlebar to reposition window within container bounds.`
              : null
          )
        }
        onMinimize={handleTriggerMinimize}
        onMinimizeHoverChange={(hovered) =>
          setHoveredDesc(
            hovered
              ? 'Minimize to Stack [-]: Collapse window via 3-phase sequenced transition into top-right Floating Stack Icon.'
              : null
          )
        }
      />

      {/* STAGE 2: CONTENT BODY */}
      <FloatingWindowContent
        contentInnerRef={contentInnerElRef}
        scrollable={isVerticallyCompressed}
        hidden={isContentHidden}
        paddedFallback={!customContent}
        onMouseOver={handleContentMouseOver}
        onMouseLeave={handleContentMouseLeave}
      >
        {customContent ? (
          customContent
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2 rounded-xl border ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-200'
                    : 'bg-neutral-800/60 border-neutral-700/60'
                }`}
              >
                <span className="text-[10px] text-neutral-400 block font-mono">
                  Loop Frequency
                </span>
                <span className="text-sm font-mono font-bold text-amber-500">
                  120.0 Hz
                </span>
              </div>

              <div
                className={`p-2 rounded-xl border ${
                  isLight
                    ? 'bg-neutral-50 border-neutral-200'
                    : 'bg-neutral-800/60 border-neutral-700/60'
                }`}
              >
                <span className="text-[10px] text-neutral-400 block font-mono">
                  Step Latency
                </span>
                <span className="text-sm font-mono font-bold text-emerald-500">
                  0.32 ms
                </span>
              </div>
            </div>

            <div
              className={`p-2.5 rounded-xl border font-mono text-[10px] leading-relaxed ${
                isLight
                  ? 'bg-neutral-100/60 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-950/40 border-neutral-800 text-neutral-300'
              }`}
            >
              <div>• Body: Car[0] Active (SimTick #8192)</div>
              <div>• Ball: Pos [12.4, -180.2, 17.0] Vel [28.5m/s]</div>
              <div>• Hitbox: OBB Contact Normal [0.0, 1.0, 0.0]</div>
              <div>• Telemetry Channel: WASM SharedMemory</div>
            </div>
          </>
        )}
      </FloatingWindowContent>

      {/* STAGE 3: CALIBRATED FOOTER */}
      {showFooter && !isContentHidden && (
        <FloatingWindowFooter
          footerRef={footerElRef}
          defaultDescription={defaultDescription}
          hoveredDescription={hoveredDesc}
          reserveCornerDraggerSpace={showCornerDragger}
          isLight={isLight}
        />
      )}

      {/* BOTTOM-RIGHT CONCENTRIC CORNER ARC DRAGGER */}
      {showCornerDragger && (
        <div
          onMouseDown={handleResizeMouseDown}
          onMouseEnter={() => {
            setCornerGripHovered(true);
            setHoveredDesc(
              `Corner Resize Dragger (${clampedGeometry.width}×${clampedGeometry.height}px · MinWidth ${effectiveMinWidth}px · MinHeight ${effectiveMinHeight}px · MaxHeight ${effectiveMaxHeight}px): Drag to scale window.`
            );
          }}
          onMouseLeave={() => {
            setCornerGripHovered(false);
            setHoveredDesc(null);
          }}
          title={`Drag bottom-right corner arc to resize window (MinW: ${effectiveMinWidth}px, MinH: ${effectiveMinHeight}px, MaxH: ${effectiveMaxHeight}px)`}
          className="absolute bottom-0 right-0 cursor-nwse-resize flex items-end justify-end select-none z-30"
        >
          <CornerCurvedDragger
            styleVariant="corner-arc"
            outerRadius={floatingOuterRadius}
            concentric={true}
            arcRadius={12}
            inset={4}
            sweepDeg={68}
            strokeWidth={2.4}
            idleOpacity={60}
            colorMode="neutral"
            isLight={isLight}
            isActiveOrHovered={cornerGripHovered || isResizingNow}
          />
        </div>
      )}
    </motion.div>
  );
};
