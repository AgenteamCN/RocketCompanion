import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { type ContainerTransitionMode, type FluidMorphConfig, type SequencedStepConfig } from '../tokens/easing';
import { type TransitionPhase } from './transitions';
import { MorphingStageShell } from './MorphingStageShell';
import { measureMenuPanelIntrinsicDimensions } from './menuPanelAdaptive';
import { type PanelSizingConfig } from '../tokens/menuLayoutTokens';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';

export interface MorphingShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
  height?: number;
  sizing?: PanelSizingConfig;
  currentKey?: string;
  children: React.ReactNode;
  isLight?: boolean;
  onBack?: () => void;
  isLayer1?: boolean;
  isDockState?: boolean;
  isContentVisible?: boolean;
  isPillContentVisible?: boolean;
  onExpandDock?: () => void;
  isShaking?: boolean;
  backdropDuration?: number;
  inspectorSlot?: React.ReactNode;
  className?: string;
  uiScale?: number;
  safeAreaMargin?: number;
  maxSafeScale?: number;
  hasExtraMainMenuItem?: boolean;
  developerMode?: boolean;
  enableDiagnostics?: boolean;
  transitionMode?: ContainerTransitionMode;
  onPhaseChange?: (phase: TransitionPhase) => void;
  fluidDuration?: number;
  stepFadeDuration?: number;
  stepResizeDuration?: number;
  fluidConfig?: FluidMorphConfig;
  stepConfig?: SequencedStepConfig;
}

/**
 * MorphingShell
 * Single-Container Decoupled Stage Architecture with Per-Panel Auto-Fit / Fixed Sizing Contracts.
 */
export const MorphingShell: React.FC<MorphingShellProps> = ({
  open,
  onOpenChange,
  width = 460,
  height,
  sizing,
  currentKey = 'default',
  children,
  isLight = false,
  onBack: _onBack,
  isLayer1 = false,
  isDockState = false,
  isContentVisible = true,
  isPillContentVisible = false,
  onExpandDock,
  isShaking = false,
  backdropDuration = 250,
  inspectorSlot,
  className = '',
  uiScale = 100,
  safeAreaMargin = 0,
  maxSafeScale,
  hasExtraMainMenuItem = false,
  developerMode = false,
}) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement | null>(null);
  const [isPillHovered, setIsPillHovered] = useState(false);

  const panelOuterRadius = useMenuLayoutStore((s) => s.panelOuterRadius ?? 16);

  const [stageSize, setStageSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });

  useEffect(() => {
    const handleResize = () => {
      setStageSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [intrinsicHeightByRoute, setIntrinsicHeightByRoute] = useState<Record<string, number>>({});

  const routeMetricKey =
    currentKey === 'main-menu'
      ? hasExtraMainMenuItem
        ? 'main-menu:extra'
        : 'main-menu:base'
      : currentKey === 'settings'
      ? developerMode
        ? 'settings:dev'
        : 'settings:user'
      : currentKey;

  useLayoutEffect(() => {
    if (!open || isDockState || sizing?.mode === 'fixed') return;
    const wrapper = contentWrapperRef.current;
    if (!wrapper) return;
    const panelEl = wrapper.querySelector<HTMLElement>('[data-panel="container"]');
    if (!panelEl) return;

    const measure = () => {
      const { intrinsicHeight } = measureMenuPanelIntrinsicDimensions(panelEl, {
        measureWidth: false,
      });
      if (intrinsicHeight > 40) {
        setIntrinsicHeightByRoute((prev) => {
          const prevH = prev[routeMetricKey];
          if (prevH !== undefined && Math.abs(prevH - intrinsicHeight) <= 1) {
            return prev;
          }
          return { ...prev, [routeMetricKey]: intrinsicHeight };
        });
      }
    };

    measure();
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measure();
      });
    });
    ro.observe(panelEl);
    Array.from(panelEl.children).forEach((rawChild) => {
      const child = rawChild as HTMLElement;
      ro.observe(child);
      if (child.getAttribute('data-panel-section') === 'content') {
        Array.from(child.children).forEach((grandChild) => {
          ro.observe(grandChild as HTMLElement);
        });
      }
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [
    open,
    isDockState,
    sizing?.mode,
    currentKey,
    routeMetricKey,
    hasExtraMainMenuItem,
    developerMode,
    stageSize.width,
    stageSize.height,
  ]);

  const marginW = stageSize.width * (safeAreaMargin / 100);
  const marginH = stageSize.height * (safeAreaMargin / 100);
  const Wsafe = Math.max(100, stageSize.width - marginW * 2);
  const Hsafe = Math.max(100, stageSize.height - marginH * 2);

  const computedMaxSafeScale =
    maxSafeScale ??
    Math.min(
      140,
      Math.max(
        60,
        Math.floor(Math.min(Wsafe / 820, Hsafe / 600) * 100)
      )
    );
  const isSettings = currentKey === 'settings';
  const effectiveScale = isSettings && uiScale > computedMaxSafeScale ? computedMaxSafeScale : uiScale;
  const currentZoom = (effectiveScale || 100) / 100;

  const localWidth = Wsafe / currentZoom;
  const localHeight = Hsafe / currentZoom;

  const availStageW = Math.max(320, localWidth - 32);
  const availStageH = Math.max(240, localHeight - 32);

  const resolveExpandedDimensions = (): { width: number; height: number } => {
    if (!sizing) {
      const w = Math.min(width, availStageW);
      const h = Math.min(height || (isLayer1 ? 377 : 457), availStageH);
      return { width: w, height: h };
    }
    const w = Math.min(sizing.width, availStageW);
    if (sizing.mode === 'fixed') {
      const h = Math.min(sizing.targetHeight, availStageH);
      return { width: w, height: h };
    }
    const maxAllowed = Math.min(sizing.maxHeight, availStageH);
    const minAllowed = Math.min(sizing.minHeight, maxAllowed);
    const fallbackIntrinsic =
      currentKey === 'main-menu'
        ? hasExtraMainMenuItem
          ? 444
          : sizing.targetHeight
        : sizing.targetHeight;
    const naturalH = intrinsicHeightByRoute[routeMetricKey] ?? fallbackIntrinsic;
    const h = Math.max(minAllowed, Math.min(naturalH, maxAllowed));
    return { width: w, height: Math.round(h) };
  };

  const dockW = 88;
  const dockH = 38;
  const { width: expandedW, height: expandedH } = resolveExpandedDimensions();

  const xExpanded = Math.max(16, Math.round((localWidth - expandedW) / 2));
  const yExpanded = Math.max(16, Math.round((localHeight - expandedH) / 2));

  const xDock = Math.max(16, Math.round(localWidth - 16 - dockW));
  const yDock = Math.max(16, Math.round((localHeight - dockH) / 2));

  const targetX = isDockState ? xDock : xExpanded;
  const targetY = isDockState ? yDock : yExpanded;
  const targetW = isDockState ? dockW : expandedW;
  const targetH = isDockState ? dockH : expandedH;
  const targetRadius = isDockState ? 12 : panelOuterRadius;

  if (!open && !isDockState) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none backdrop-blur-none z-40"
        style={{
          backgroundColor:
            isLayer1 || isDockState ? 'transparent' : 'rgba(0, 0, 0, 0.65)',
          transition: `background-color ${backdropDuration}ms cubic-bezier(0.2, 0.8, 0.25, 1)`,
        }}
      />

      {isLayer1 && !isDockState && (
        <div
          className="fixed inset-0 z-[45] pointer-events-auto cursor-pointer"
          onClick={() => onOpenChange(false)}
        />
      )}

      <MorphingStageShell
        shellRef={shellRef}
        contentWrapperRef={contentWrapperRef}
        isLight={isLight}
        targetX={targetX}
        targetY={targetY}
        targetW={targetW}
        targetH={targetH}
        targetRadius={targetRadius}
        isShaking={isShaking}
        isDockState={isDockState}
        isPillHovered={isPillHovered}
        onPillHoverChange={setIsPillHovered}
        isPillContentVisible={isPillContentVisible}
        isContentVisible={isContentVisible}
        onExpandFromDock={onExpandDock}
        dataUiElement="menu-shell"
        dataComponent={sizing?.component || currentKey}
        dataSourcePath={sizing?.sourcePath || ''}
        zIndexClassName="z-50"
        className={className}
      >
        <motion.div
          key={currentKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.25, 1] }}
          className="w-full h-full flex flex-col min-h-0"
        >
          {children}
        </motion.div>
      </MorphingStageShell>

      {!isDockState && inspectorSlot}
    </>
  );
};
