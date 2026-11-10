import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { KeycapBadge } from '../primitives/KeycapBadge';
import { UI_EASING } from '../tokens/easing';
import { MorphContainerContext } from '../layout/Panel';

export type EdgeDrawerSide = 'right' | 'left';

export interface EdgeInspectorDrawerProps {
  /** Whether the inspector drawer is expanded (true) or collapsed to an edge pill (false) */
  isExpanded: boolean;
  /** Callback when expanded state changes via click or hotkey */
  onExpandedChange: (expanded: boolean) => void;
  /** Dock edge: 'right' (default) or 'left' */
  side?: EdgeDrawerSide;
  /** Expanded drawer width in px (default: 520px) */
  expandedWidth?: number;
  /** Collapsed edge pill width in px (default: 88px) */
  collapsedWidth?: number;
  /** Collapsed edge pill height in px (default: 38px) */
  collapsedHeight?: number;
  /** Top vertical clearance in px (default: 72px — clears topFloating Stack Icon & Notification tray) */
  topOffset?: number;
  /** Bottom vertical clearance in px (default: 184px — clears bottom-right 148px Circular Boost Gauge + 20px margin + 16px gap) */
  bottomOffset?: number;
  /** Horizontal edge margin in px (default: 16px) */
  edgeMargin?: number;
  /** Hotkey label displayed on the collapsed pill and listened on window (default: 'TAB') */
  shortcutKey?: string;
  /** Whether to listen to the keyboard shortcut (default: true) */
  enableHotkey?: boolean;
  /** Positioning mode: 'absolute' inside stage container (default) or 'fixed' to viewport */
  positionMode?: 'absolute' | 'fixed';
  /** Light or dark theme */
  isLight?: boolean;
  /** Optional className applied to the morphing shell */
  className?: string;
  /** Content rendered inside the expanded inspector drawer */
  children: React.ReactNode;
}

export type EdgeDrawerAnimPhase =
  | 'expanded'
  | 'collapsing_content'
  | 'collapsing_resize'
  | 'collapsed'
  | 'expanding_content'
  | 'expanding_resize';

/**
 * [L4 Motion / L6 Pattern] EdgeInspectorDrawer (Apple HIG Zero-Backdrop Edge Inspector)
 *
 * Designed for live in-game 3D editors & training inspectors:
 * - Zero backdrop darkening (never dims or blocks the underlying 3D arena).
 * - Anchored to `'right'` (default) or `'left'` edge with explicit `topOffset` and `bottomOffset`
 *   to avoid colliding with HUD elements like the bottom-right Circular Boost Gauge (148×148px at bottom: 20px).
 * - Sequenced Step Morph between `collapsedWidth` (88×38px edge pill) and `expandedWidth` (520px inspector).
 * - Listens to `TAB` (or custom `shortcutKey`) to toggle between collapsed pill and expanded drawer.
 */
export const EdgeInspectorDrawer: React.FC<EdgeInspectorDrawerProps> = ({
  isExpanded,
  onExpandedChange,
  side = 'right',
  expandedWidth = 520,
  collapsedWidth = 88,
  collapsedHeight = 38,
  topOffset = 72,
  bottomOffset = 184,
  edgeMargin = 16,
  shortcutKey = 'TAB',
  enableHotkey = true,
  positionMode = 'absolute',
  isLight = false,
  className = '',
  children,
}) => {
  const [phase, setPhase] = useState<EdgeDrawerAnimPhase>(
    isExpanded ? 'expanded' : 'collapsed'
  );
  const [isPillHovered, setIsPillHovered] = useState(false);

  // Sync external `isExpanded` prop changes with internal sequenced state machine.
  // Clear both outer and inner timers on cleanup so rapid toggling never leaks stale phase changes.
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;

    if (isExpanded && phase !== 'expanded') {
      setPhase('expanding_content');
      t1 = setTimeout(() => {
        setPhase('expanding_resize');
        t2 = setTimeout(() => {
          setPhase('expanded');
        }, 250);
      }, 70);
    } else if (!isExpanded && phase !== 'collapsed') {
      setPhase('collapsing_content');
      t1 = setTimeout(() => {
        setPhase('collapsing_resize');
        t2 = setTimeout(() => {
          setPhase('collapsed');
        }, 250);
      }, 90);
    }

    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [isExpanded]);

  // Listen for TAB (or custom shortcutKey)
  useEffect(() => {
    if (!enableHotkey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key.toUpperCase() === shortcutKey.toUpperCase()) {
        e.preventDefault();
        e.stopPropagation();
        onExpandedChange(!isExpanded);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableHotkey, shortcutKey, isExpanded, onExpandedChange]);

  const isDockGeometry =
    phase === 'collapsed' ||
    phase === 'collapsing_resize' ||
    phase === 'expanding_content';
  const isContentVisible = phase === 'expanded';
  const isPillVisible = phase === 'collapsed';

  // Position styles anchored to either right or left edge, respecting topOffset & bottomOffset
  const horizontalAnchorStyle: React.CSSProperties =
    side === 'right' ? { right: edgeMargin } : { left: edgeMargin };

  // When expanded, fill available vertical span between topOffset and bottomOffset.
  // When collapsed to pill, vertically center within the safe span [topOffset, 100% - bottomOffset].
  const targetTop = isDockGeometry
    ? `calc(${topOffset}px + (100% - ${topOffset + bottomOffset}px - ${collapsedHeight}px) / 2)`
    : `${topOffset}px`;

  const targetHeight = isDockGeometry
    ? `${collapsedHeight}px`
    : `calc(100% - ${topOffset + bottomOffset}px)`;

  const ExpandChevron = side === 'right' ? ChevronLeft : ChevronRight;
  const hoverNudgeX = side === 'right' ? -2.5 : 2.5;

  return (
    <MorphContainerContext.Provider value={true}>
      <motion.div
        data-ui-element="edge-inspector-drawer"
        data-side={side}
        data-expanded={!isDockGeometry}
        initial={false}
        animate={{
          width: isDockGeometry ? collapsedWidth : expandedWidth,
          top: targetTop,
          height: targetHeight,
          borderRadius: isDockGeometry ? 12 : 16,
        }}
        transition={{
          duration: 0.28,
          ease: UI_EASING.apple,
        }}
        style={{
          position: positionMode,
          ...horizontalAnchorStyle,
        }}
        className={`z-30 pointer-events-auto select-none overflow-hidden flex flex-col transition-shadow duration-280 ${
          isDockGeometry
            ? isLight
              ? 'border border-neutral-300 bg-white/98 hover:bg-white text-neutral-900 shadow-md cursor-pointer'
              : 'border border-neutral-700 bg-neutral-900/98 hover:bg-neutral-850 text-neutral-100 shadow-md cursor-pointer'
            : isLight
            ? 'border border-neutral-300/90 bg-neutral-50/98 text-neutral-900 shadow-2xl'
            : 'border border-neutral-700/70 bg-neutral-900/98 text-neutral-100 shadow-2xl'
        } ${className}`}
        onClick={isDockGeometry ? () => onExpandedChange(true) : undefined}
        onMouseEnter={() => isDockGeometry && setIsPillHovered(true)}
        onMouseLeave={() => setIsPillHovered(false)}
      >
        {/* 1. Collapsed Pill Overlay: rendered inside the morphing shell when in dock geometry */}
        <div
          aria-hidden={!isDockGeometry}
          className={`absolute inset-0 flex items-center justify-between px-3 select-none transition-opacity duration-120 ${
            isDockGeometry
              ? isPillVisible
                ? 'opacity-100 pointer-events-auto cursor-pointer z-20'
                : 'opacity-0 pointer-events-none z-20'
              : 'opacity-0 pointer-events-none -z-10'
          } ${side === 'left' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <motion.div
            animate={{ x: isPillHovered ? hoverNudgeX : 0 }}
            transition={UI_EASING.spring.tactile}
            className={`flex items-center justify-center shrink-0 ${
              isLight ? 'text-neutral-900' : 'text-neutral-100'
            }`}
          >
            <ExpandChevron className="h-4 w-4 stroke-[2.5]" />
          </motion.div>

          <div
            className={`h-3.5 w-px ${
              isLight ? 'bg-neutral-200' : 'bg-neutral-700'
            }`}
          />

          <KeycapBadge shortcut={shortcutKey} size="sm" isLight={isLight} />
        </div>

        {/* 2. Expanded Content Wrapper:
            Permanently mounted at `w-full` with `minWidth: expandedWidth - 2` (accounting for 1px left + 1px right border)
            so children never unmount/remount or overflow the right border by 2px. */}
        <div
          style={{
            minWidth: Math.max(0, expandedWidth - 2),
          }}
          className={`w-full h-full flex flex-col min-h-0 shrink-0 transition-opacity ${
            isContentVisible
              ? 'opacity-100 pointer-events-auto duration-150'
              : 'opacity-0 pointer-events-none duration-90'
          }`}
        >
          {children}
        </div>
      </motion.div>
    </MorphContainerContext.Provider>
  );
};
