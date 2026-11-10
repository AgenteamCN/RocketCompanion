import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, X } from 'lucide-react';
import {
  useFloatingStore,
  type FloatingWindowItem,
  type FloatingStoreInstance,
} from '../stores/floatingStore';
import { PRESET_WINDOWS } from '../stores/devFloatingPresets';
import { UI_EASING } from '../tokens/easing';
import { getFloatingWindowIcon } from './FloatingWindowIcon';
import {
  FloatingStackFlightPortals,
  type RestoringWindowState,
} from './FlyingGhostElement';
import {
  resolveClampedWindowGeometry,
  resolveWindowSizeLimits,
} from './floatingWindowGeometry';

export interface FloatingStackIconProps {
  isLight?: boolean;
  className?: string;
  /** Optional isolated store instance (defaults to primary floatingStore) */
  store?: FloatingStoreInstance;
  /** Whether positioning is absolute inside active canvas (default: true) or fixed */
  absolute?: boolean;
  /** Ref to the active canvas container for computing relative coordinates */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** Whether an active menu/settings modal is currently open, blocking stack expansion */
  isMenuOpen?: boolean;
  /** Custom tooltip message when hover-blocked */
  blockedTooltipText?: string;
  /** Callback fired when user clicks the stack icon while blocked by an active menu */
  onBlockedClick?: () => void;
  /** Optional custom close interceptor injected from L7 shell */
  onCloseWindowItem?: (win: FloatingWindowItem, defaultClose: () => void) => void;
}

const getWindowIcon = (category?: string, id?: string) =>
  getFloatingWindowIcon(category, id, 'h-4 w-4 shrink-0');

/**
 * FloatingStackIcon
 * Renders the top-right rounded-square stack icon and dropdown tray for minimized diagnostic windows.
 */
export const FloatingStackIcon: React.FC<FloatingStackIconProps> = ({
  isLight = false,
  className = '',
  store,
  absolute = true,
  containerRef,
  isMenuOpen = false,
  blockedTooltipText,
  onBlockedClick,
  onCloseWindowItem,
}) => {
  const {
    windows,
    isStackTrayOpen,
    isStackDismissed,
    minimizedCount,
    activeFlight,
    completeFlight,
    toggleStackTray,
    setStackTrayOpen,
    restoreWindow,
    closeWindow,
    dismissStack,
  } = useFloatingStore(store);

  const [isStackHovered, setIsStackHovered] = useState(false);
  const [hoveredWindowId, setHoveredWindowId] = useState<string | null>(null);
  const [bounceTrigger, setBounceTrigger] = useState(0);

  // Restoring state: tracks clicked item start rect in canvas space and destination window rect
  const [restoringWindow, setRestoringWindow] =
    useState<RestoringWindowState | null>(null);

  useEffect(() => {
    if (isMenuOpen && isStackTrayOpen) {
      setStackTrayOpen(false);
    }
  }, [isMenuOpen, isStackTrayOpen, setStackTrayOpen]);

  const isStackVisible = !(isStackDismissed && minimizedCount === 0);

  // If stack is dismissed and has no minimized windows, AND no active flight, do not show
  if (!isStackVisible && !activeFlight) {
    return null;
  }

  // If no windows exist at all and stack is dismissed, AND no active flight, hide
  if (windows.length === 0 && isStackDismissed && !activeFlight) {
    return null;
  }

  const minimizedWindows = windows.filter((w) => w.isMinimized);
  const portalContainer =
    containerRef?.current ||
    (typeof document !== 'undefined'
      ? (document.getElementById('game-ui-scale-root') as HTMLDivElement | null) ||
        (document.getElementById('game-ui-viewport-host') as HTMLDivElement | null) ||
        document.body
      : null);

  // Handle clicking a minimized item in the stack list to trigger 4-corner expand transition
  const handleRestoreClick = (win: FloatingWindowItem, e: React.MouseEvent<HTMLButtonElement>) => {
    const btnEl = e.currentTarget;
    const containerEl = portalContainer;
    if (!containerEl) {
      restoreWindow(win.id);
      return;
    }

    const bRect = btnEl.getBoundingClientRect();
    const cRect = containerEl.getBoundingClientRect();
    const localW =
      containerEl.clientWidth > 0 ? Math.floor(containerEl.clientWidth) : Math.floor(cRect.width);
    const localH =
      containerEl.clientHeight > 0 ? Math.floor(containerEl.clientHeight) : Math.floor(cRect.height);
    const scaleX = localW > 0 && cRect.width > 0 ? cRect.width / localW : 1;
    const scaleY = localH > 0 && cRect.height > 0 ? cRect.height / localH : 1;

    const startX = Math.round((bRect.left - cRect.left) / scaleX);
    const startY = Math.round((bRect.top - cRect.top) / scaleY);
    const startW = Math.round(bRect.width / scaleX);
    const startH = Math.round(bRect.height / scaleY);

    const matchedPreset = PRESET_WINDOWS.find(
      (p) => p.id === win.id || win.id.startsWith(p.id)
    );
    const rawAnchor = {
      x: win.position?.x ?? 40,
      y: win.position?.y ?? 40,
      width: win.width ?? matchedPreset?.width ?? 440,
      height: win.height ?? matchedPreset?.height ?? 300,
    };
    const limits = resolveWindowSizeLimits(
      win,
      matchedPreset,
      win.autoMinWidth ?? 240,
      win.intrinsicMaxHeight ?? null
    );
    const clampedTarget = resolveClampedWindowGeometry(
      rawAnchor,
      localW > 0 && localH > 0 ? { width: localW, height: localH } : null,
      {
        minWidth: limits.effectiveMinWidth,
        maxWidth: limits.presetMaxWidth,
        minHeight: limits.effectiveMinHeight,
        maxHeight: limits.effectiveMaxHeight,
        resizable: limits.isResizable,
      },
      { prioritizePositionSqueeze: false }
    );

    // Step 1: Set restoring state - all other items immediately disappear, this item's content disappears
    setRestoringWindow({
      id: win.id,
      startRect: { x: startX, y: startY, width: startW, height: startH },
      targetRect: clampedTarget,
    });

    // Step 2 & 3: After 240ms 4-corner resize completes, restore window and close tray
    setTimeout(() => {
      restoreWindow(win.id);
      setRestoringWindow(null);
    }, 240);
  };

  return (
    <>
      {isStackVisible && (
        <div
          data-ui-element="stack-icon-wrapper"
          className={`${
            absolute ? 'absolute top-4 right-4' : 'fixed top-4 right-6'
          } z-50 pointer-events-auto select-none flex flex-col items-end ${className}`}
        >
          {/* 1. Main Stack Square Button (Neutral Monochrome) */}
          <div
            className="relative"
            onMouseEnter={() => setIsStackHovered(true)}
            onMouseLeave={() => setIsStackHovered(false)}
          >
            <motion.button
              data-ui-element="stack-icon"
              key={`stack-btn-${bounceTrigger}`}
              animate={bounceTrigger > 0 ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
              type="button"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                if (isMenuOpen) {
                  onBlockedClick?.();
                  return;
                }
                toggleStackTray();
              }}
              aria-label="Floating Diagnostic Window Stack"
              className={`relative h-10 w-10 flex items-center justify-center rounded-xl border transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 active:scale-95 shadow-md ${
                isMenuOpen ? 'opacity-85' : ''
              } ${
                isLight
                  ? 'bg-white hover:bg-neutral-50 border-neutral-300 text-neutral-900'
                  : 'bg-neutral-900 hover:bg-neutral-850 border-neutral-700 text-neutral-100'
              }`}
            >
              <Layers className="h-5 w-5 text-neutral-900 dark:text-neutral-100" />
            </motion.button>

          {/* 2. Top-Right Bubble Counter (Strictly Neutral Monochrome: White/Black) */}
          <AnimatePresence>
            {minimizedCount > 0 && (
              <motion.div
                key={`stack-bubble-${minimizedCount}`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 1.25, 1], opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full border flex items-center justify-center font-mono font-bold text-[11px] pointer-events-none select-none ${
                  isLight
                    ? 'bg-white text-black border-black shadow-xs'
                    : 'bg-black text-white border-white shadow-xs'
                }`}
              >
                {minimizedCount}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 3. Dismiss button 'X': exact same spring animation and dimensions as counter bubble */}
          <AnimatePresence>
            {minimizedCount === 0 && isStackHovered && !isMenuOpen && (
              <motion.button
                key="dismiss-stack-btn"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 1.25, 1], opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                type="button"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  dismissStack();
                }}
                title="Close Stack Icon"
                className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full border border-red-600 bg-red-500 text-white flex items-center justify-center shadow-xs cursor-pointer z-10 outline-none select-none"
              >
                <X className="h-3 w-3 stroke-[3]" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* 4. Blocked Tooltip when Hovering Stack with Open Menu */}
          <AnimatePresence>
            {isMenuOpen && isStackHovered && (
              <motion.div
                key="blocked-menu-tooltip"
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 2, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={`absolute top-full mt-2.5 right-0 px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap shadow-xl pointer-events-none select-none z-50 flex items-center gap-1.5 font-medium ${
                  isLight
                    ? 'bg-neutral-900/98 text-neutral-100 border-neutral-700'
                    : 'bg-neutral-850/98 text-neutral-100 border-neutral-650'
                }`}
              >
                <span className="text-amber-400 text-xs font-mono font-bold shrink-0">[!]</span>
                <span>{blockedTooltipText || 'Please close settings window first'}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 4. Minimized List Tray (Right-aligned under Stack Icon, ample left space to prevent cutoff) */}
        <AnimatePresence>
          {isStackTrayOpen && !isMenuOpen && (
            <motion.div
              key="stack-tray-list"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={UI_EASING.spring.tactile}
              className="mt-2 flex flex-col items-end gap-1.5 z-50 max-h-80 overflow-y-auto pl-12 pr-1 py-1"
            >
              {minimizedWindows.length === 0 ? null : (
                minimizedWindows.map((win) => {
                  // If restoring, all other items disappear immediately
                  if (restoringWindow && win.id !== restoringWindow.id) {
                    return null;
                  }

                  const isThisItemRestoring = restoringWindow?.id === win.id;
                  const isHovered = hoveredWindowId === win.id && !restoringWindow;

                  return (
                    <div
                      key={win.id}
                      onMouseEnter={() => !restoringWindow && setHoveredWindowId(win.id)}
                      onMouseLeave={() => setHoveredWindowId(null)}
                      className={`relative flex items-center justify-end w-full pl-10 ${
                        isThisItemRestoring ? 'opacity-0 pointer-events-none' : ''
                      }`}
                      style={{ minHeight: '34px' }}
                    >
                      {/* Main Pill: shifts left by 34px on hover, equal-width 4-sided shadow */}
                      <motion.button
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleRestoreClick(win, e)}
                        animate={{ x: isHovered ? -34 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer select-none transition-colors shadow-md ${
                          isLight
                            ? 'bg-white/98 hover:bg-neutral-50 border-neutral-300 text-neutral-900'
                            : 'bg-neutral-900/98 hover:bg-neutral-850 border-neutral-700 text-neutral-100'
                        }`}
                        title="Restore window"
                      >
                        {/* Left: category icon */}
                        {getWindowIcon(win.category, win.id)}

                        {/* Right: pure title */}
                        <span className="text-xs font-semibold whitespace-nowrap">
                          {win.title}
                        </span>
                      </motion.button>

                      {/* 
                        Independent Red Close 'X' Button on Right:
                        - Clean fade-in ONLY (no scale up / no circle)
                        - Rounded rectangle with light-red background on hover
                        - Red X icon with transparent background when idle
                        - Rendered ONLY when row is hovered
                      */}
                      <AnimatePresence>
                        {isHovered && (
                          <motion.button
                            type="button"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              if (onCloseWindowItem) {
                                onCloseWindowItem(win, () => closeWindow(win.id));
                                return;
                              }
                              closeWindow(win.id);
                            }}
                            title="Close window"
                            className="absolute right-0 h-6 w-6 rounded-md bg-transparent hover:bg-red-500/15 text-red-500 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                          >
                            <X className="h-3.5 w-3.5 stroke-[2.5]" />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      <FloatingStackFlightPortals
        activeFlight={activeFlight}
        restoringWindow={restoringWindow}
        portalContainer={portalContainer}
        isLight={isLight}
        onFlightComplete={() => {
          if (activeFlight?.targetHadStack) {
            setBounceTrigger((k) => k + 1);
          }
          completeFlight();
        }}
      />
    </>
  );
};
