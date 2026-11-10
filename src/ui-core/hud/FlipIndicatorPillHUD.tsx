import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { FlipTransientState, FlipTransientListener } from '../stores/hudTransientTypes';

export interface FlipIndicatorPillHandle {
  /** Imperatively update flip countdown state at 120Hz with zero React re-renders */
  setFlipState: (state: FlipTransientState) => void;
}

export interface FlipIndicatorPillHUDProps {
  hasFlip?: boolean;
  status?: 'grounded' | 'countdown' | 'unlimited' | 'expired' | 'none';
  remainingSeconds?: number;
  /** Default Rocket League dodge window: 1.25 seconds (quantized into 150 discrete 120Hz ticks) */
  maxSeconds?: number;
  /** Optional multi-flip counter (-1 = unlimited, 0 = none, 1 = normal, 2+ = multi-flip e.g. HAS FLIP ×2) */
  flipsRemaining?: number;
  /** Optional 120Hz transient channel subscription (0 React VDOM re-renders) */
  subscribeFlip?: (listener: FlipTransientListener) => () => void;
  isLight?: boolean;
  className?: string;
}

/** 1.25s dodge window quantized into 150 discrete 120Hz physics ticks (1.25 * 120 = 150) */
export const FLIP_WINDOW_SECONDS = 1.25;
export const FLIP_QUANTIZED_STEPS = 150;

/**
 * FlipIndicatorPillHUD (Full-Container Fill Meter)
 * The entire pill container acts as the progress bar (quantized into 150 steps across 1.25s, 1 step = 1 tick at 120Hz):
 * - `grounded` / `countdown`: 100% full on ground (1.25s = 150/150 steps), drains across 150 discrete ticks in air.
 * - `unlimited`: 100% full cyan fill (`UNLIMITED · ∞`, e.g. Flip Reset / aerial fall without jump).
 * - `expired` / `none`: 0% fill (`NO FLIP`).
 * Default placement: Top-left aligned directly above the bottom-center VelocityProgressBar.
 */
export const FlipIndicatorPillHUD = React.memo(
  forwardRef<FlipIndicatorPillHandle, FlipIndicatorPillHUDProps>(
    (
      {
        hasFlip = true,
        status = 'countdown',
        remainingSeconds = FLIP_WINDOW_SECONDS,
        maxSeconds = FLIP_WINDOW_SECONDS,
        flipsRemaining,
        subscribeFlip,
        isLight = true,
        className = '',
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      const barFillRef = useRef<HTMLDivElement | null>(null);
      const dotRef = useRef<HTMLDivElement | null>(null);
      const titleRef = useRef<HTMLSpanElement | null>(null);
      const timerRef = useRef<HTMLSpanElement | null>(null);

      const applyFlipToDom = useCallback(
        (st: FlipTransientState) => {
          const flipsCount = st.flipsRemaining;
          const isExpiredStatus =
            st.status === 'expired' || st.status === 'none' || flipsCount === 0;
          const active = Boolean(st.hasFlip) && !isExpiredStatus;
          const isUnlim = active && (st.status === 'unlimited' || flipsCount === -1);
          const isGrounded = active && st.status === 'grounded';
          const isCounting = active && st.status === 'countdown';

          const maxS = Math.max(0.1, st.maxSeconds ?? maxSeconds ?? FLIP_WINDOW_SECONDS);
          const rem = isGrounded
            ? maxS
            : Math.max(0, Math.min(maxS, st.remainingSeconds ?? 0));

          // Quantize into 150 discrete interval steps (0 .. 150, 1 step = 1 tick at 120Hz)
          const rawRatio = !active
            ? 0
            : isUnlim || isGrounded
            ? 1
            : Math.max(0, Math.min(1, rem / maxS));
          const stepIndex = Math.round(rawRatio * FLIP_QUANTIZED_STEPS);
          const pct = (stepIndex / FLIP_QUANTIZED_STEPS) * 100;

          const isWarn = isCounting && rem > 0 && rem < 0.35;

          // 1. Update Full-Container Fill Bar (entire pill background is the progress meter)
          if (barFillRef.current) {
            barFillRef.current.style.width = `${pct.toFixed(3)}%`;
            if (!active || stepIndex === 0) {
              barFillRef.current.style.backgroundColor = 'transparent';
            } else if (isUnlim) {
              barFillRef.current.style.backgroundColor = isLight
                ? 'rgba(6, 182, 212, 0.32)'
                : 'rgba(6, 182, 212, 0.42)';
            } else if (isWarn) {
              barFillRef.current.style.backgroundColor = isLight
                ? 'rgba(245, 158, 11, 0.38)'
                : 'rgba(245, 158, 11, 0.48)';
            } else {
              barFillRef.current.style.backgroundColor = isLight
                ? 'rgba(16, 185, 129, 0.32)'
                : 'rgba(16, 185, 129, 0.42)';
            }
          }

          // 2. Update Outer Container Border & Surface
          if (containerRef.current) {
            containerRef.current.style.opacity = active ? '1' : '0.68';
            if (!active) {
              containerRef.current.style.borderColor = isLight
                ? 'rgba(163, 163, 163, 0.55)'
                : 'rgba(82, 82, 91, 0.65)';
            } else if (isUnlim) {
              containerRef.current.style.borderColor = isLight
                ? 'rgba(8, 145, 178, 0.85)'
                : 'rgba(34, 211, 238, 0.75)';
            } else if (isWarn) {
              containerRef.current.style.borderColor = isLight
                ? 'rgba(217, 119, 6, 0.85)'
                : 'rgba(251, 191, 36, 0.75)';
            } else {
              containerRef.current.style.borderColor = isLight
                ? 'rgba(16, 185, 129, 0.85)'
                : 'rgba(52, 211, 153, 0.70)';
            }
          }

          // 3. Update Status Dot
          if (dotRef.current) {
            dotRef.current.style.backgroundColor = !active
              ? isLight
                ? '#a3a3a3'
                : '#52525b'
              : isUnlim
              ? '#06b6d4'
              : isWarn
              ? '#f59e0b'
              : '#10b981';
            dotRef.current.style.boxShadow = !active
              ? 'none'
              : isUnlim
              ? '0 0 0 2px rgba(34, 211, 238, 0.35)'
              : isWarn
              ? '0 0 0 2px rgba(245, 158, 11, 0.35)'
              : '0 0 0 2px rgba(16, 185, 129, 0.35)';
          }

          // 4. Update Primary Title (`UNLIMITED` / `HAS FLIP` / `HAS FLIP ×N` / `NO FLIP`)
          if (titleRef.current) {
            const multiSuffix =
              active && !isUnlim && typeof flipsCount === 'number' && flipsCount > 1
                ? ` ×${flipsCount}`
                : '';
            const nextTitle = !active
              ? 'NO FLIP'
              : isUnlim
              ? 'UNLIMITED'
              : `HAS FLIP${multiSuffix}`;
            if (titleRef.current.textContent !== nextTitle) {
              titleRef.current.textContent = nextTitle;
            }
            titleRef.current.style.color = !active
              ? isLight
                ? '#737373'
                : '#a1a1aa'
              : isLight
              ? '#09090b'
              : '#ffffff';
          }

          // 5. Update Right Timer / Step Readout (`1.25s` / `∞` / `0.00s`)
          if (timerRef.current) {
            const quantizedSec = (stepIndex / FLIP_QUANTIZED_STEPS) * maxS;
            const nextTimer = !active
              ? '0.00s'
              : isUnlim
              ? '∞'
              : `${quantizedSec.toFixed(2)}s`;
            if (timerRef.current.textContent !== nextTimer) {
              timerRef.current.textContent = nextTimer;
            }
            timerRef.current.style.color = !active
              ? isLight
                ? '#a3a3a3'
                : '#71717a'
              : isUnlim
              ? isLight
                ? '#0e7490'
                : '#67e8f9'
              : isWarn
              ? isLight
                ? '#b45309'
                : '#fde68a'
              : isLight
              ? '#065f46'
              : '#a7f3d0';
          }
        },
        [isLight, maxSeconds]
      );

      useImperativeHandle(
        ref,
        () => ({
          setFlipState: applyFlipToDom,
        }),
        [applyFlipToDom]
      );

      useEffect(() => {
        applyFlipToDom({
          hasFlip,
          status,
          remainingSeconds,
          maxSeconds,
          flipsRemaining,
        });
      }, [hasFlip, status, remainingSeconds, maxSeconds, flipsRemaining, applyFlipToDom]);

      useEffect(() => {
        if (!subscribeFlip) return;
        return subscribeFlip(applyFlipToDom);
      }, [subscribeFlip, applyFlipToDom]);

      return (
        <div
          ref={containerRef}
          data-alpha-id="Alpha:FlipIndicatorPillHUD"
          data-ui-element="hud-flip-indicator-pill"
          className={`relative overflow-hidden select-none pointer-events-auto inline-flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border shadow-md min-w-[152px] ${
            isLight
              ? 'bg-white/95 text-neutral-900'
              : 'bg-neutral-950/92 text-white'
          } ${className}`}
        >
          {/* Full-Container Progress Fill Layer (150 Quantized Steps across 100% height & width) */}
          <div
            ref={barFillRef}
            className="absolute inset-y-0 left-0 pointer-events-none z-0"
            style={{ width: '100%' }}
          />

          {/* Foreground Content Layer */}
          <div className="relative z-10 flex items-center gap-2">
            <div ref={dotRef} className="w-2.5 h-2.5 rounded-full shrink-0" />
            <span
              ref={titleRef}
              className="text-[11px] font-extrabold tracking-wider font-mono uppercase leading-none"
            >
              {hasFlip
                ? status === 'unlimited' || flipsRemaining === -1
                  ? 'UNLIMITED'
                  : flipsRemaining && flipsRemaining > 1
                  ? `HAS FLIP ×${flipsRemaining}`
                  : 'HAS FLIP'
                : 'NO FLIP'}
            </span>
          </div>

          <span
            ref={timerRef}
            className="relative z-10 text-[11px] font-mono font-bold tabular-nums leading-none"
          >
            {status === 'unlimited' || flipsRemaining === -1
              ? '∞'
              : `${remainingSeconds.toFixed(2)}s`}
          </span>
        </div>
      );
    }
  )
);

FlipIndicatorPillHUD.displayName = 'FlipIndicatorPillHUD';

