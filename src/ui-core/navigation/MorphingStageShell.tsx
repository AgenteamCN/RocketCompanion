import React from 'react';
import { motion } from 'framer-motion';
import { MorphContainerContext } from '../layout/Panel';
import { Eye } from 'lucide-react';
import { KeycapBadge } from '../primitives/KeycapBadge';

export interface LivePreviewDockProps {
  isLight?: boolean;
  isHovered?: boolean;
  isVisible?: boolean;
  isPillHovered?: boolean;
  isPillContentVisible?: boolean;
  onExpand?: () => void;
  shortcut?: string;
}

export const LivePreviewDock: React.FC<LivePreviewDockProps> = ({
  isLight = false,
  isHovered,
  isVisible,
  isPillHovered = false,
  isPillContentVisible = true,
  onExpand,
  shortcut = 'TAB',
}) => {
  const effectiveHovered = isHovered ?? isPillHovered;
  const effectiveVisible = isVisible ?? isPillContentVisible;
  return (
    <button
      type="button"
      onClick={onExpand}
      data-ui-element="live-preview-dock-pill"
      className={`w-full h-full flex flex-col items-center justify-between py-3.5 px-1.5 cursor-pointer select-none transition-opacity duration-150 ${
        effectiveVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      title={`Click or press ${shortcut} to expand inspector`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
          effectiveHovered
            ? isLight
              ? 'bg-sky-500 text-white'
              : 'bg-sky-500 text-white'
            : isLight
            ? 'bg-neutral-200/80 text-neutral-700'
            : 'bg-neutral-800 text-neutral-300'
        }`}
      >
        <Eye className="w-3.5 h-3.5" />
      </div>

      <span
        className={`text-[10px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180 transition-colors ${
          isPillHovered
            ? isLight
              ? 'text-sky-600'
              : 'text-sky-400'
            : isLight
            ? 'text-neutral-600'
            : 'text-neutral-400'
        }`}
      >
        LIVE PREVIEW
      </span>

      <KeycapBadge
        shortcut={shortcut}
        size="sm"
        isLight={isLight}
        className="!px-1 !py-0.5 !text-[9px] !min-w-[28px]"
      />
    </button>
  );
};

export interface MorphingStageShellProps {
  isLight?: boolean;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  targetRadius: number;
  isShaking?: boolean;
  isDockState?: boolean;
  isPillHovered?: boolean;
  onPillHoverChange?: (hovered: boolean) => void;
  isPillContentVisible?: boolean;
  isContentVisible?: boolean;
  onExpandFromDock?: () => void;
  contentWrapperRef?: React.RefObject<HTMLDivElement | null>;
  shellRef?: React.Ref<HTMLDivElement>;
  dataUiElement?: string;
  dataComponent?: string;
  dataSourcePath?: string;
  zIndexClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * [L4 Navigation] MorphingStageShell
 * Absolute-coordinate morphing stage container supporting:
 * 1. Continuous 4-corner geometric interpolation (left, top, width, height, borderRadius)
 * 2. Right-middle LivePreviewDock pill collapse & expand
 * 3. Apple HIG sheet shake feedback when blocked interactions occur
 */
export const MorphingStageShell: React.FC<MorphingStageShellProps> = ({
  isLight = false,
  targetX,
  targetY,
  targetW,
  targetH,
  targetRadius,
  isShaking = false,
  isDockState = false,
  isPillHovered = false,
  onPillHoverChange,
  isPillContentVisible = true,
  isContentVisible = true,
  onExpandFromDock,
  contentWrapperRef,
  shellRef,
  dataUiElement,
  dataComponent,
  dataSourcePath,
  zIndexClassName = 'z-30',
  className = '',
  children,
}) => {
  return (
    <MorphContainerContext.Provider value={true}>
      <motion.div
        key="decoupled-menu-stage-wrapper"
        animate={isShaking ? { x: [0, -10, 10, -7, 7, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
        style={{ transform: isShaking ? undefined : 'none' }}
        className={`absolute inset-0 pointer-events-none ${zIndexClassName}`}
      >
        <motion.div
          ref={shellRef}
          key="decoupled-menu-stage-container"
          data-ui-element={dataUiElement}
          data-morph-container="true"
          data-panel="container"
          data-component={dataComponent}
          data-source-path={dataSourcePath}
          initial={false}
          animate={{
            left: targetX,
            top: targetY,
            width: targetW,
            height: targetH,
            borderRadius: targetRadius,
            opacity: 1,
          }}
          transition={{
            left: { duration: 0.28, ease: [0.2, 0.8, 0.25, 1] },
            top: { duration: 0.28, ease: [0.2, 0.8, 0.25, 1] },
            width: { duration: 0.28, ease: [0.2, 0.8, 0.25, 1] },
            height: { duration: 0.28, ease: [0.2, 0.8, 0.25, 1] },
            borderRadius: { duration: 0.28, ease: [0.2, 0.8, 0.25, 1] },
          }}
          style={{
            position: 'absolute',
            transform: 'none',
          }}
          className={`pointer-events-auto select-none transition-shadow overflow-hidden flex flex-col ${
            isDockState
              ? isLight
                ? 'border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-900 shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_0_16px_rgba(0,0,0,0.15)] cursor-pointer'
                : 'border border-neutral-700 bg-neutral-900 hover:bg-neutral-850 text-neutral-100 shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_18px_rgba(255,255,255,0.08)] cursor-pointer'
              : isLight
              ? 'border border-neutral-300/80 bg-neutral-50/98 text-neutral-900 shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_0_24px_rgba(0,0,0,0.16),0_0_48px_rgba(0,0,0,0.10)]'
              : 'border border-neutral-700/60 bg-neutral-900/98 text-neutral-100 shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_25px_rgba(0,0,0,0.85),0_0_35px_rgba(255,255,255,0.08)]'
          } ${className}`}
          onClick={isDockState ? onExpandFromDock : undefined}
          onMouseEnter={() => isDockState && onPillHoverChange?.(true)}
          onMouseLeave={() => onPillHoverChange?.(false)}
        >
          {isDockState ? (
            <LivePreviewDock
              isLight={isLight}
              isHovered={isPillHovered}
              isVisible={isPillContentVisible}
            />
          ) : (
            <div
              ref={contentWrapperRef}
              className={`w-full h-full flex flex-col transition-opacity ${
                isContentVisible
                  ? 'opacity-100 pointer-events-auto duration-150'
                  : 'opacity-0 pointer-events-none duration-100'
              }`}
            >
              {children}
            </div>
          )}
        </motion.div>
      </motion.div>
    </MorphContainerContext.Provider>
  );
};
