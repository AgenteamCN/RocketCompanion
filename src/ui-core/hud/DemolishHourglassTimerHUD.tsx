import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  RespawnTimerTransientState,
  RespawnTimerTransientListener,
} from '../stores/hudTransientTypes';

export interface DemolishHourglassTimerHandle {
  /** Imperatively push respawn timer state at 120Hz with 0 React re-renders */
  setRespawnTimer: (state: RespawnTimerTransientState) => void;
}

export interface DemolishHourglassTimerHUDProps {
  /**
   * Remaining respawn seconds (`3.0` down to `0.0`).
   * - `3.0s -> 2.0s` (Stage 1): `#ffffff` (Dark) / `#0f172a` (Light)
   * - `2.0s -> 1.0s` (Stage 2): `#ffd60a` (Yellow)
   * - `1.0s -> 0.0s` (Stage 3): `#ef4444` (Red)
   */
  remainingSeconds?: number;
  /** Total duration in seconds (default `3.0` seconds in Rocket League) */
  totalSeconds?: number;
  /** Optional 120Hz transient channel subscription (0 React VDOM re-renders) */
  subscribeRespawnTimer?: (listener: RespawnTimerTransientListener) => () => void;
  /** Whether the widget is visible even when at rest / in preview catalog mode */
  alwaysVisible?: boolean;
  /** Bar height in px (default `8px`) */
  barHeightPx?: number;
  /** Bar corner radius in px (default `3px`) */
  barRadiusPx?: number;
  /** Gap between left/right bars and center hourglass in px (default `8px`) */
  barGapPx?: number;
  /** Track background color (default adapts to `isLight`) */
  trackBgColor?: string;
  /** Stage 1 color: 3s -> 2s */
  color3s?: string;
  /** Stage 2 color: 2s -> 1s (default `#f59e0b` in light, `#ffd60a` in dark) */
  color2s?: string;
  /** Stage 3 color: 1s -> 0s (default `#ef4444`) */
  color1s?: string;
  /** Stage 3 hourglass color (default `#ef4444`) */
  hourglassRedColor?: string;
  /** Optional width/height styling */
  width?: number | string;
  height?: number | string;
  /** Light/Dark theme adaptive styling */
  isLight?: boolean;
  className?: string;
}

/**
 * DemolishHourglassTimerHUD (`T5A.2`)
 * 1:1 faithful port of `widget-respawn-timer` from `agrepo1/src/overlay/components/widgets/respawn-timer/respawn-timer.html`.
 * Upgraded to High-Performance Architecture (`React.memo` + `forwardRef` + `subscribeRespawnTimer` + `isLight`).
 */
export const DemolishHourglassTimerHUD = React.memo(
  forwardRef<DemolishHourglassTimerHandle, DemolishHourglassTimerHUDProps>(
    (
      {
        remainingSeconds = 3.0,
        totalSeconds = 3.0,
        subscribeRespawnTimer,
        alwaysVisible = true,
        barHeightPx = 8,
        barRadiusPx = 3,
        barGapPx = 8,
        trackBgColor,
        color3s,
        color2s,
        color1s = '#ef4444',
        hourglassRedColor = '#ef4444',
        width = 220,
        height = 36,
        isLight = false,
        className = '',
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      const leftFillRef = useRef<HTMLDivElement | null>(null);
      const rightFillRef = useRef<HTMLDivElement | null>(null);
      const hourglassWrapRef = useRef<HTMLDivElement | null>(null);

      const resolvedTrackBg =
        trackBgColor ?? (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.16)');
      const resolvedColor3s = color3s ?? (isLight ? '#0f172a' : '#ffffff');
      const resolvedColor2s = color2s ?? (isLight ? '#d97706' : '#ffd60a');

      const applyTimerToDom = useCallback(
        (remSec: number, totSec: number, forceVisible?: boolean) => {
          const safeTotal = totSec > 0 ? totSec : 3.0;
          const clampedRem = Math.max(0, Math.min(safeTotal, remSec));
          const ratio = safeTotal > 0 ? clampedRem / safeTotal : 0;

          let activeBarColor = resolvedColor3s;
          let activeHourglassColor = resolvedColor3s;

          if (ratio <= 0.3334 && ratio > 0) {
            activeBarColor = color1s;
            activeHourglassColor = hourglassRedColor;
          } else if (ratio <= 0.6667 && ratio > 0) {
            activeBarColor = resolvedColor2s;
            activeHourglassColor = resolvedColor2s;
          }

          if (leftFillRef.current) {
            leftFillRef.current.style.transform = `scaleX(${ratio.toFixed(4)})`;
            leftFillRef.current.style.backgroundColor = activeBarColor;
          }
          if (rightFillRef.current) {
            rightFillRef.current.style.transform = `scaleX(${ratio.toFixed(4)})`;
            rightFillRef.current.style.backgroundColor = activeBarColor;
          }
          if (hourglassWrapRef.current) {
            hourglassWrapRef.current.style.color = activeHourglassColor;
          }
          if (containerRef.current) {
            if (alwaysVisible && forceVisible !== false) {
              containerRef.current.style.opacity = '1';
            } else {
              const opacity = clampedRem <= 0 ? 0 : clampedRem < 0.12 ? clampedRem / 0.12 : 1;
              containerRef.current.style.opacity = opacity.toFixed(3);
            }
          }
        },
        [
          alwaysVisible,
          color1s,
          hourglassRedColor,
          resolvedColor2s,
          resolvedColor3s,
        ]
      );

      useImperativeHandle(
        ref,
        () => ({
          setRespawnTimer: (st: RespawnTimerTransientState) => {
            applyTimerToDom(st.remainingSeconds, st.totalSeconds, st.active);
          },
        }),
        [applyTimerToDom]
      );

      useEffect(() => {
        applyTimerToDom(remainingSeconds, totalSeconds);
      }, [remainingSeconds, totalSeconds, applyTimerToDom]);

      useEffect(() => {
        if (!subscribeRespawnTimer) return;
        return subscribeRespawnTimer((st) => {
          applyTimerToDom(st.remainingSeconds, st.totalSeconds, st.active);
        });
      }, [subscribeRespawnTimer, applyTimerToDom]);

      return (
        <div
          ref={containerRef}
          data-alpha-id="Alpha:DemolishHourglassTimerHUD"
          data-ui-element="hud-demolish-hourglass-timer"
          className={`relative flex items-center justify-center box-border pointer-events-none select-none transition-opacity duration-100 ${className}`}
          style={{
            width,
            height,
            gap: `${barGapPx}px`,
          }}
        >
          {/* Left Converging Bar Track (`transform-origin: 100% 50%` so it shrinks inward toward the center hourglass!) */}
          <div
            className="flex-1 overflow-hidden relative box-border"
            style={{
              height: `${barHeightPx}px`,
              backgroundColor: resolvedTrackBg,
              borderRadius: `${barRadiusPx}px`,
            }}
          >
            <div
              ref={leftFillRef}
              className="w-full h-full will-change-[transform,background-color]"
              style={{
                borderRadius: 'inherit',
                backgroundColor: resolvedColor3s,
                transformOrigin: '100% 50%',
                transform: 'scaleX(1)',
              }}
            />
          </div>

          {/* Center SVG Hourglass (`respawn-hourglass-wrapper`) */}
          <div
            ref={hourglassWrapRef}
            className="h-full aspect-square flex items-center justify-center shrink-0 transition-colors duration-100"
            style={{
              color: resolvedColor3s,
            }}
          >
            <svg
              className="w-full h-full block overflow-visible"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6 2h12v6l-4 4 4 4v6H6v-6l4-4-4-4V2zm10 14.5l-4-4-4 4V20h8v-3.5zm-8-9V4h8v3.5l-4 4-4-4z"
                fill="currentColor"
              />
            </svg>
          </div>

          {/* Right Converging Bar Track (`transform-origin: 0% 50%` so it shrinks inward toward the center hourglass!) */}
          <div
            className="flex-1 overflow-hidden relative box-border"
            style={{
              height: `${barHeightPx}px`,
              backgroundColor: resolvedTrackBg,
              borderRadius: `${barRadiusPx}px`,
            }}
          >
            <div
              ref={rightFillRef}
              className="w-full h-full will-change-[transform,background-color]"
              style={{
                borderRadius: 'inherit',
                backgroundColor: resolvedColor3s,
                transformOrigin: '0% 50%',
                transform: 'scaleX(1)',
              }}
            />
          </div>
        </div>
      );
    }
  )
);

DemolishHourglassTimerHUD.displayName = 'DemolishHourglassTimerHUD';
