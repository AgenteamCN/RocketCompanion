import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  useFloatingStore,
  type FloatingWindowItem,
  type FloatingStoreInstance,
} from '../stores/floatingStore';
import type { ContainerBounds } from './floatingWindowGeometry';
import { PRESET_WINDOWS } from '../stores/devFloatingPresets';
import {
  FloatingWindowInstance,
  type FloatingWindowRenderContext,
} from './FloatingWindowInstance';

export interface FloatingWindowManagerProps {
  isLight?: boolean;
  /** Optional isolated store instance (defaults to primary floatingStore) */
  store?: FloatingStoreInstance;
  /** Canvas bounds container ref for drag clamping, dynamic push-inward & stack target positioning */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Whether to display Stage 3 Footer on all managed floating windows (defaults to true) */
  showFooter?: boolean;
  /** Optional resolver for idle Stage 3 Footer description per window */
  defaultDescriptionForWindow?: (item: FloatingWindowItem) => string;
  /** Optional custom content renderer injected from L6/L7 so L4 stays 100% decoupled */
  renderWindowContent?: (
    item: FloatingWindowItem,
    ctx: FloatingWindowRenderContext
  ) => React.ReactNode;
}

export const FloatingWindowManager: React.FC<FloatingWindowManagerProps> = ({
  isLight = false,
  store,
  containerRef,
  showFooter = true,
  defaultDescriptionForWindow,
  renderWindowContent,
}) => {
  const {
    windows,
    windowOrder,
    bringToFront,
    minimizeWindow,
    closeWindow,
    updatePosition,
    updateSize,
    reportIntrinsicMetrics,
    batchMinimizeSignal,
    opacity,
  } = useFloatingStore(store);

  const rootOverlayRef = useRef<HTMLDivElement | null>(null);
  const [containerBounds, setContainerBounds] = useState<ContainerBounds | null>(null);

  const visibleWindows = windows.filter((w) => !w.isMinimized);

  useEffect(() => {
    const targetEl = containerRef?.current || rootOverlayRef.current;
    if (!targetEl) return;

    const measure = () => {
      const rect = targetEl.getBoundingClientRect();
      // Prefer local unzoomed CSS layout dimensions (clientWidth/clientHeight) so CSS `zoom`
      // on `#game-ui-scale-root` does not distort container boundary clamping.
      const w = targetEl.clientWidth > 0 ? Math.floor(targetEl.clientWidth) : Math.floor(rect.width);
      const h = targetEl.clientHeight > 0 ? Math.floor(targetEl.clientHeight) : Math.floor(rect.height);
      if (w > 0 && h > 0) {
        setContainerBounds((prev) => {
          if (prev && prev.width === w && prev.height === h) return prev;
          return { width: w, height: h };
        });
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          measure();
        });
      });
      ro.observe(targetEl);
      window.addEventListener('resize', measure);
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        ro.disconnect();
        window.removeEventListener('resize', measure);
      };
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [containerRef, windows.length, visibleWindows.length]);

  return (
    <div
      ref={rootOverlayRef}
      className="absolute inset-0 pointer-events-none overflow-hidden z-[5]"
    >
      <AnimatePresence>
        {visibleWindows.map((win, idx) => {
          const zIndex = 5 + Math.max(0, windowOrder.indexOf(win.id));
          return (
            <FloatingWindowInstance
              key={win.id}
              item={win}
              index={idx}
              batchMinimizeSignal={batchMinimizeSignal}
              opacity={opacity}
              isLight={isLight}
              zIndex={zIndex}
              showFooter={showFooter}
              defaultDescription={
                defaultDescriptionForWindow?.(win) ??
                win.subtitle ??
                PRESET_WINDOWS.find(
                  (p) => p.id === win.id || win.id.startsWith(p.id)
                )?.summary ??
                `${win.title} · Drag titlebar to move · Drag bottom-right corner arc to resize.`
              }
              containerRef={containerRef}
              containerBounds={containerBounds}
              renderWindowContent={renderWindowContent}
              onFocus={() => bringToFront(win.id)}
              onMinimize={() => minimizeWindow(win.id)}
              onClose={() => closeWindow(win.id)}
              onUpdatePosition={(pos) => updatePosition(win.id, pos)}
              onUpdateSize={(size, userAdjusted) =>
                updateSize(win.id, size, userAdjusted)
              }
              onReportIntrinsicMetrics={(metrics) =>
                reportIntrinsicMetrics(win.id, metrics)
              }
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
};
