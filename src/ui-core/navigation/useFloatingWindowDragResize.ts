import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { FloatingWindowItem } from '../stores/floatingStore';
import { PRESET_WINDOWS } from '../stores/devFloatingPresets';
import { CONTAINER_MARGIN, DEFAULT_MIN_WINDOW_WIDTH, computeInitialDesiredAnchor, resolveAutoFittedDesiredAnchor, resolveClampedWindowGeometry, resolveResizedWindowAnchor, resolveSyncedDesiredSize, resolveWindowSizeLimits, type ContainerBounds, type WindowRect } from './floatingWindowGeometry';
import {
  measureIntrinsicMinWidth,
  SCROLLBAR_GUTTER_RESERVE_PX,
} from './floatingWindowMinWidth';



export interface UseFloatingWindowDragResizeOptions {
  item: FloatingWindowItem;
  index: number;
  batchMinimizeSignal?: number;
  showFooter?: boolean;
  containerBounds: ContainerBounds | null;
  onFocus: () => void;
  onMinimize: () => void;
  onUpdatePosition: (pos: { x: number; y: number }) => void;
  onUpdateSize: (size: { width: number; height: number }, userAdjusted?: boolean) => void;
  onReportIntrinsicMetrics?: (metrics: {
    autoMinWidth?: number;
    scrollbarReservePx?: number;
    intrinsicMaxHeight?: number;
  }) => void;
}

export function useFloatingWindowDragResize({
  item,
  index,
  batchMinimizeSignal,
  showFooter = true,
  containerBounds,
  onFocus,
  onMinimize,
  onUpdatePosition,
  onUpdateSize,
  onReportIntrinsicMetrics,
}: UseFloatingWindowDragResizeOptions) {
  const matchedPreset = React.useMemo(
    () =>
      PRESET_WINDOWS.find(
        (p) => p.id === item.id || item.id.startsWith(p.id)
      ),
    [item.id]
  );

  const initialPresetMinWidth = Math.round(
    item.minWidth ?? matchedPreset?.minWidth ?? DEFAULT_MIN_WINDOW_WIDTH
  );
  const initialResizable = (item.resizable ?? matchedPreset?.resizable ?? true) !== false;

  const headerElRef = useRef<HTMLDivElement | null>(null);
  const contentInnerElRef = useRef<HTMLDivElement | null>(null);
  const footerElRef = useRef<HTMLDivElement | null>(null);

  const [intrinsicMaxHeight, setIntrinsicMaxHeight] = useState<number | null>(null);
  const [intrinsicMinWidth, setIntrinsicMinWidth] = useState<number>(initialPresetMinWidth);
  const [scrollbarReservePx, setScrollbarReservePx] = useState<number>(
    initialResizable ? SCROLLBAR_GUTTER_RESERVE_PX : 0
  );

  const sizeLimits = resolveWindowSizeLimits(
    item,
    matchedPreset,
    intrinsicMinWidth,
    intrinsicMaxHeight
  );
  const {
    isResizable,
    shouldAutoFitHeight,
    presetMinWidth,
    presetMinHeight,
    presetMaxWidth,
    autoMinWidth,
    effectiveMinWidth,
    effectiveMinHeight,
    effectiveMaxHeight,
  } = sizeLimits;

  const [desiredAnchor, setDesiredAnchor] = useState<WindowRect>(() =>
    computeInitialDesiredAnchor(item, matchedPreset, sizeLimits)
  );
  const desiredAnchorRef = useRef<WindowRect>(desiredAnchor);
  desiredAnchorRef.current = desiredAnchor;

  const updateDesiredAnchor = useCallback(
    (updater: WindowRect | ((prev: WindowRect) => WindowRect)): WindowRect => {
      const next =
        typeof updater === 'function' ? updater(desiredAnchorRef.current) : updater;
      desiredAnchorRef.current = next;
      setDesiredAnchor(next);
      return next;
    },
    []
  );

  const userHasResizedRef = useRef<boolean>(Boolean(item.userAdjustedSize));
  const lastMeasuredIntrinsicHRef = useRef<number | null>(null);
  const lastReportedIntrinsicHRef = useRef<number | null>(null);
  const lastMeasuredChildCountRef = useRef<number>(-1);

  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);

  const measureIntrinsicDimensions = useCallback(() => {
    const innerEl = contentInnerElRef.current;
    if (!innerEl) return;

    const headerH = headerElRef.current?.offsetHeight ?? 39;
    const footerH = showFooter ? footerElRef.current?.offsetHeight ?? 29 : 0;
    const contentH = Math.ceil(innerEl.offsetHeight);

    if (contentH > 0) {
      const totalIntrinsicH = Math.round(headerH + contentH + footerH + 2);
      setIntrinsicMaxHeight((prev) =>
        prev !== null && Math.abs(prev - totalIntrinsicH) <= 1 ? prev : totalIntrinsicH
      );
      if (
        lastReportedIntrinsicHRef.current === null ||
        Math.abs(lastReportedIntrinsicHRef.current - totalIntrinsicH) > 1
      ) {
        lastReportedIntrinsicHRef.current = totalIntrinsicH;
        onReportIntrinsicMetrics?.({
          intrinsicMaxHeight: totalIntrinsicH,
        });
      }

      const prevIntrinsicH = lastMeasuredIntrinsicHRef.current;
      lastMeasuredIntrinsicHRef.current = totalIntrinsicH;
      updateDesiredAnchor((prev) =>
        resolveAutoFittedDesiredAnchor(prev, totalIntrinsicH, {
          isResizable,
          shouldAutoFitHeight,
          userHasResized: userHasResizedRef.current,
          prevIntrinsicH,
        })
      );
    }

    if (!isDraggingRef.current && !isResizingRef.current && innerEl.clientWidth > 0) {
      const rootChild = (innerEl.firstElementChild as HTMLElement | null) || innerEl;
      const childCount = rootChild.children.length;
      if (lastMeasuredChildCountRef.current !== childCount) {
        lastMeasuredChildCountRef.current = childCount;
        const result = measureIntrinsicMinWidth(innerEl, {
          isResizable,
          fallbackMinWidth: presetMinWidth,
          tier: matchedPreset?.tier,
        });
        setIntrinsicMinWidth(result.totalMinWidth);
        setScrollbarReservePx(result.scrollbarReservePx);
        onReportIntrinsicMetrics?.({
          autoMinWidth: result.totalMinWidth,
          scrollbarReservePx: result.scrollbarReservePx,
          ...(lastReportedIntrinsicHRef.current !== null
            ? { intrinsicMaxHeight: lastReportedIntrinsicHRef.current }
            : {}),
        });
      }
    }
  }, [
    isResizable,
    matchedPreset?.tier,
    onReportIntrinsicMetrics,
    presetMinWidth,
    shouldAutoFitHeight,
    showFooter,
    updateDesiredAnchor,
  ]);

  useEffect(() => {
    const innerEl = contentInnerElRef.current;
    if (!innerEl) return;
    measureIntrinsicDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          measureIntrinsicDimensions();
        });
      });
      ro.observe(innerEl);
      if (headerElRef.current) ro.observe(headerElRef.current);
      if (footerElRef.current) ro.observe(footerElRef.current);
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }
  }, [measureIntrinsicDimensions]);

  const [minimizePhase, setMinimizePhase] = useState<
    'idle' | 'fading_content' | 'resizing_to_stack'
  >('idle');
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDraggingNow, setIsDraggingNow] = useState(false);
  const [isParkedInSqueezeZone, setIsParkedInSqueezeZone] = useState(false);
  const [isResizingNow, setIsResizingNow] = useState(false);

  useEffect(() => {
    if (isDraggingRef.current || isResizingRef.current) return;
    if (item.position) {
      const rx = Math.round(item.position.x);
      const ry = Math.round(item.position.y);
      updateDesiredAnchor((prev) =>
        prev.x === rx && prev.y === ry ? prev : { ...prev, x: rx, y: ry }
      );
    }
  }, [item.position, updateDesiredAnchor]);

  useEffect(() => {
    userHasResizedRef.current = Boolean(item.userAdjustedSize);
  }, [item.userAdjustedSize]);

  useEffect(() => {
    if (isDraggingRef.current || isResizingRef.current) return;
    if (item.width && item.height) {
      updateDesiredAnchor((prev) =>
        resolveSyncedDesiredSize(
          prev,
          item,
          {
            isResizable,
            shouldAutoFitHeight,
            effectiveMinWidth,
            effectiveMinHeight,
            effectiveMaxHeight,
          },
          intrinsicMaxHeight
        )
      );
    }
  }, [
    item,
    effectiveMinWidth,
    effectiveMinHeight,
    effectiveMaxHeight,
    isResizable,
    shouldAutoFitHeight,
    intrinsicMaxHeight,
    updateDesiredAnchor,
  ]);

  const clampedGeometry = resolveClampedWindowGeometry(
    desiredAnchor,
    containerBounds,
    {
      minWidth: effectiveMinWidth,
      maxWidth: presetMaxWidth,
      minHeight: effectiveMinHeight,
      maxHeight: effectiveMaxHeight,
      resizable: isResizable,
    },
    {
      margin: CONTAINER_MARGIN,
      prioritizePositionSqueeze: isDraggingNow || isParkedInSqueezeZone,
    }
  );

  const latestClampedRef = useRef(clampedGeometry);
  latestClampedRef.current = clampedGeometry;

  const latestConstraintsRef = useRef({
    containerBounds,
    effectiveMinWidth,
    presetMaxWidth,
    effectiveMinHeight,
    effectiveMaxHeight,
    isResizable,
  });
  latestConstraintsRef.current = {
    containerBounds,
    effectiveMinWidth,
    presetMaxWidth,
    effectiveMinHeight,
    effectiveMaxHeight,
    isResizable,
  };

  const handleTriggerMinimize = useCallback(() => {
    if (minimizePhase !== 'idle') return;
    setMinimizePhase('fading_content');
    setTimeout(() => {
      setMinimizePhase('resizing_to_stack');
      setTimeout(() => {
        onMinimize();
      }, 240);
    }, 110);
  }, [minimizePhase, onMinimize]);

  const lastSignalRef = useRef(batchMinimizeSignal);
  useEffect(() => {
    if (batchMinimizeSignal && batchMinimizeSignal !== lastSignalRef.current) {
      lastSignalRef.current = batchMinimizeSignal;
      if (minimizePhase === 'idle') {
        const staggerDelay = Math.max(0, index) * 35;
        const timer = setTimeout(() => {
          handleTriggerMinimize();
        }, staggerDelay);
        return () => clearTimeout(timer);
      }
    }
  }, [batchMinimizeSignal, minimizePhase, index, handleTriggerMinimize]);

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    onFocus();
    isDraggingRef.current = true;
    setIsInteracting(true);
    setIsDraggingNow(true);

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = latestClampedRef.current.x;
    const startY = latestClampedRef.current.y;
    const preservedDesiredW = desiredAnchorRef.current.width;
    const preservedDesiredH = desiredAnchorRef.current.height;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = ev.clientX - startMouseX;
      const deltaY = ev.clientY - startMouseY;

      updateDesiredAnchor({
        x: Math.round(startX + deltaX),
        y: Math.round(startY + deltaY),
        width: preservedDesiredW,
        height: preservedDesiredH,
      });
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsInteracting(false);
        setIsDraggingNow(false);

        const c = latestConstraintsRef.current;
        const latestDesired = desiredAnchorRef.current;
        const settled = resolveClampedWindowGeometry(
          latestDesired,
          c.containerBounds,
          {
            minWidth: c.effectiveMinWidth,
            maxWidth: c.presetMaxWidth,
            minHeight: c.effectiveMinHeight,
            maxHeight: c.effectiveMaxHeight,
            resizable: c.isResizable,
          },
          { margin: CONTAINER_MARGIN, prioritizePositionSqueeze: true }
        );
        const targetW = Math.max(
          c.effectiveMinWidth,
          Math.min(c.presetMaxWidth, Math.round(preservedDesiredW))
        );
        const targetH = Math.max(
          c.effectiveMinHeight,
          Math.min(c.effectiveMaxHeight, Math.round(preservedDesiredH))
        );
        setIsParkedInSqueezeZone(settled.width < targetW || settled.height < targetH);
        updateDesiredAnchor({
          x: settled.x,
          y: settled.y,
          width: preservedDesiredW,
          height: preservedDesiredH,
        });
        onUpdatePosition({ x: settled.x, y: settled.y });
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (!isResizable) return;
    e.stopPropagation();
    e.preventDefault();
    onFocus();
    isResizingRef.current = true;
    userHasResizedRef.current = true;
    setIsParkedInSqueezeZone(false);
    setIsInteracting(true);
    setIsResizingNow(true);

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startRect: WindowRect = {
      x: latestClampedRef.current.x,
      y: latestClampedRef.current.y,
      width: latestClampedRef.current.width,
      height: latestClampedRef.current.height,
    };

    const handleResizeMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaW = ev.clientX - startMouseX;
      const deltaH = ev.clientY - startMouseY;
      const c = latestConstraintsRef.current;

      updateDesiredAnchor(
        resolveResizedWindowAnchor(startRect, deltaW, deltaH, c.containerBounds, c)
      );
    };

    const handleResizeUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsInteracting(false);
        setIsResizingNow(false);
        const latest = desiredAnchorRef.current;
        onUpdatePosition({ x: latest.x, y: latest.y });
        onUpdateSize({ width: latest.width, height: latest.height }, true);
      }
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);
  };

  return {
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
  };
}
