import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { UI_RADIUS } from '../tokens/radius';
import {
  UI_EASING,
  type ContainerTransitionMode,
  type FluidMorphConfig,
  type SequencedStepConfig,
} from '../tokens/easing';
import { MorphContainerContext } from '../layout/Panel';

export const CONTAINER_TRANSITIONS = UI_EASING.transitions;

export type TransitionPhase = 'idle' | 'fadeOut' | 'resize' | 'fadeIn';

export interface MorphContainerProps {
  /** Key */
  currentKey?: string;
  /** px CSS */
  width?: number | string;
  /** px CSS */
  height?: number | string;
  /** 'fluid-morph' or 'sequenced-step' */
  mode?: ContainerTransitionMode;
  children: React.ReactNode;
  isLight?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** sequenced-step or fluid-morph idle */
  onPhaseChange?: (phase: TransitionPhase) => void;
  fluidConfig?: FluidMorphConfig;
  stepConfig?: SequencedStepConfig;
  /** 0.28s */
  fluidDuration?: number;
  /** 0.10s / 100ms */
  stepFadeDuration?: number;
  /** 0.15s / 150ms */
  stepResizeDuration?: number;
  /** (0.96 -> 1) */
  initialModal?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}


export const MorphContainer = forwardRef<HTMLDivElement, MorphContainerProps>(
  (
    {
      currentKey = 'default',
      width,
      height,
      mode = 'fluid-morph',
      children,
      isLight = false,
      className = '',
      style = {},
      onPhaseChange,
      fluidConfig,
      stepConfig,
      fluidDuration,
      stepFadeDuration,
      stepResizeDuration,
      initialModal = false,
      onClick,
      ...rest
    },
    ref
  ) => {
    const activeFluidDuration =
      fluidDuration ?? fluidConfig?.duration ?? UI_EASING.transitions.fluidMorph.duration;
    const activeFluidEase = fluidConfig?.ease ?? UI_EASING.apple;

    const activeFadeDuration =
      stepFadeDuration ??
      stepConfig?.fadeDuration ??
      UI_EASING.transitions.sequencedStep.fadeOut.duration;
    const activeFadeOutDuration = stepConfig?.fadeOutDuration ?? activeFadeDuration;
    const activeFadeInDuration = stepConfig?.fadeInDuration ?? activeFadeDuration;
    const activeResizeDuration =
      stepResizeDuration ??
      stepConfig?.resizeDuration ??
      UI_EASING.transitions.sequencedStep.resize.duration;
    const activeStepEase = stepConfig?.ease ?? UI_EASING.apple;

    const resolveWidth = (val: number | string | undefined): string | undefined => {
      if (val === undefined) return undefined;
      return typeof val === 'number' ? `${val}px` : val;
    };

    const [displayedContent, setDisplayedContent] = useState<React.ReactNode>(children);
    const [displayedKey, setDisplayedKey] = useState<string>(currentKey);
    const [containerWidth, setContainerWidth] = useState<number | string | undefined>(width);
    const [containerHeight, setContainerHeight] = useState<number | string | undefined>(height);
    const [phase, setPhase] = useState<TransitionPhase>('idle');

    const targetKeyRef = useRef(currentKey);
    const targetContentRef = useRef(children);
    const targetWidthRef = useRef(width);
    const targetHeightRef = useRef(height);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const isFirstMountRef = useRef(true);

    targetKeyRef.current = currentKey;
    targetContentRef.current = children;
    targetWidthRef.current = width;
    targetHeightRef.current = height;

    const clearAllTimers = () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };

    useEffect(() => {
      onPhaseChange?.(phase);
    }, [phase, onPhaseChange]);

    useEffect(() => {
      return () => {
        clearAllTimers();
      };
    }, []);

    useEffect(() => {
      if (isFirstMountRef.current) {
        isFirstMountRef.current = false;
        setDisplayedContent(children);
        setDisplayedKey(currentKey);
        setContainerWidth(width);
        setContainerHeight(height);
        setPhase('idle');
        return;
      }

      if (mode === 'fluid-morph') {
        clearAllTimers();
        setDisplayedContent(children);
        setDisplayedKey(currentKey);
        setContainerWidth(width);
        setContainerHeight(height);
        setPhase('idle');
        return;
      }

      // mode === 'sequenced-step'
      const hasKeyChanged = currentKey !== displayedKey;
      const hasWidthChanged = width !== containerWidth;
      const hasHeightChanged = height !== containerHeight;

      if (hasKeyChanged || hasWidthChanged || hasHeightChanged) {
        clearAllTimers();

        //  1:  100%  0% (Apple Ease)
        setPhase('fadeOut');

        const fadeOutTimer = setTimeout(() => {
          //  2:  (opacity: 0) (Apple Ease)
          setDisplayedKey(targetKeyRef.current);
          setDisplayedContent(targetContentRef.current);
          setContainerWidth(targetWidthRef.current);
          setContainerHeight(targetHeightRef.current);
          setPhase('resize');

          const resizeTimer = setTimeout(() => {
            //  3:  0%  100% (Apple Ease)
            setPhase('fadeIn');

            const fadeInTimer = setTimeout(() => {
              setPhase('idle');
            }, activeFadeInDuration * 1000);

            timersRef.current.push(fadeInTimer);
          }, activeResizeDuration * 1000);

          timersRef.current.push(resizeTimer);
        }, activeFadeOutDuration * 1000);

        timersRef.current.push(fadeOutTimer);
      }
    }, [
      currentKey,
      width,
      height,
      mode,
      activeFadeOutDuration,
      activeResizeDuration,
      activeFadeInDuration,
    ]);

    // ──────────────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────
    const hasCustomBg = className.includes('bg-');
    const hasCustomBorder = className.includes('border');
    const hasCustomRadius = className.includes('rounded-');

    const defaultBgClass = isLight
      ? 'bg-neutral-50/98 text-neutral-900'
      : 'bg-neutral-900/98 text-neutral-100';
    const defaultBorderClass = isLight
      ? 'border border-neutral-300/80 ring-1 ring-black/5'
      : 'border border-neutral-700/60 ring-1 ring-white/10';

    const containerStyleClasses = [
      'relative overflow-hidden',
      !hasCustomRadius && UI_RADIUS.xl,
      !hasCustomBg && defaultBgClass,
      !hasCustomBorder && defaultBorderClass,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // ──────────────────────────────────────────────────────────────────────────
    // 1.  (Fluid Morph)
    //  layout  exit wait MorphingShell 
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === 'fluid-morph') {
      const renderWidth = resolveWidth(width);
      const renderHeight = resolveWidth(height);
      return (
        <MorphContainerContext.Provider value={true}>
          <motion.div
            ref={ref}
            layout
            initial={initialModal ? { opacity: 0, scale: 0.96 } : false}
            animate={{
              opacity: 1,
              scale: 1,
              width: renderWidth,
              ...(renderHeight ? { height: renderHeight } : {}),
            }}
            exit={initialModal ? { opacity: 0, scale: 0.96 } : undefined}
            transition={{
              layout: {
                duration: activeFluidDuration,
                ease: activeFluidEase,
              },
              width: {
                duration: activeFluidDuration,
                ease: activeFluidEase,
              },
              height: {
                duration: activeFluidDuration,
                ease: activeFluidEase,
              },
              opacity: {
                duration: initialModal ? 0.2 : activeFluidDuration,
                ease: activeFluidEase,
              },
              scale: {
                duration: 0.22,
                ease: activeFluidEase,
              },
            }}
            style={style}
            className={containerStyleClasses}
            onClick={onClick}
            {...rest}
          >
            <motion.div
              key={currentKey}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: activeFluidDuration * 0.6,
                ease: activeFluidEase,
              }}
              className="w-full h-full flex flex-col min-h-0"
            >
              {children}
            </motion.div>
          </motion.div>
        </MorphContainerContext.Provider>
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2.  (Sequenced Step)
    // 100ms fadeOut (100% -> 0%) -> 150ms resize (0% ) -> 100ms fadeIn (0% -> 100%)
    //  content 
    // ──────────────────────────────────────────────────────────────────────────
    const renderWidth = resolveWidth(containerWidth);
    const renderHeight = resolveWidth(containerHeight);
    const contentOpacity = phase === 'fadeOut' || phase === 'resize' ? 0 : 1;

    const easeCss = `cubic-bezier(${activeStepEase.join(',')})`;

    return (
      <MorphContainerContext.Provider value={true}>
        <motion.div
          ref={ref}
          layout
          initial={initialModal ? { opacity: 0, scale: 0.96 } : false}
          animate={{
            opacity: 1,
            scale: 1,
            width: renderWidth,
            ...(renderHeight ? { height: renderHeight } : {}),
          }}
          exit={initialModal ? { opacity: 0, scale: 0.96 } : undefined}
          transition={{
            width: {
              duration: activeResizeDuration,
              ease: activeStepEase,
            },
            height: {
              duration: activeResizeDuration,
              ease: activeStepEase,
            },
            layout: {
              duration: activeResizeDuration,
              ease: activeStepEase,
            },
            opacity: {
              duration: 0.18,
              ease: activeStepEase,
            },
            scale: {
              duration: 0.22,
              ease: activeStepEase,
            },
          }}
          style={style}
          className={containerStyleClasses}
          onClick={onClick}
          {...rest}
        >
          {/*  content  */}
          <div
            style={{
              opacity: contentOpacity,
              transition:
                phase === 'fadeOut'
                  ? `opacity ${activeFadeOutDuration}s ${easeCss}`
                  : phase === 'fadeIn'
                  ? `opacity ${activeFadeInDuration}s ${easeCss}`
                  : 'none',
            }}
            className="w-full h-full flex flex-col min-h-0"
          >
            {displayedContent}
          </div>
        </motion.div>
      </MorphContainerContext.Provider>
    );
  }
);

MorphContainer.displayName = 'MorphContainer';

