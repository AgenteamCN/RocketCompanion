import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { SpeedTransientListener } from '../stores/hudTransientTypes';

export interface VelocityProgressBarHandle {
  /** Imperatively update velocity (0 ~ 2300 uu/s) at 120Hz+ with zero React re-renders */
  setSpeed: (speed: number) => void;
}

export interface VelocityProgressBarProps {
  /** Current car speed (0 ~ 2300 Unreal Units/s) */
  speed?: number;
  /** High-frequency 120Hz transient listener updating DOM refs with zero React VDOM re-renders */
  subscribeSpeed?: (listener: SpeedTransientListener) => () => void;
  /** Bar width (default '100%') */
  width?: string | number;
  /** Bar height (default 20px) */
  height?: string | number;
  /** Optional container className */
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

/**
 * Computes piecewise velocity progress bar fill color and percentage:
 * - Normal speed (<= 1410 uu/s): #d4af37 (Gold)
 * - Boost speed (1410 ~ 2200 uu/s): #77ca7a to #59f168 (Green gradient)
 * - Supersonic (>= 2200 uu/s): #a020f0 (Purple + heartbeat)
 */
export const getVelocityBarColor = (v: number): {
  color: string;
  isSupersonic: boolean;
  percent: number;
} => {
  const speed = Math.max(0, Math.min(2300, Math.round(v)));

  let percent = 0;
  if (speed <= 1410) {
    percent = (speed / 1410) * 40;
  } else if (speed <= 2200) {
    percent = 40 + ((speed - 1410) / (2200 - 1410)) * 45;
  } else {
    percent = 85 + ((speed - 2200) / (2300 - 2200)) * 15;
  }
  percent = Math.min(100, Math.max(0, percent));

  if (speed >= 2200) {
    return { color: '#a020f0', isSupersonic: true, percent };
  }

  if (speed <= 1410) {
    return { color: '#d4af37', isSupersonic: false, percent };
  }

  const ratio = (speed - 1410) / (2200 - 1410);
  const rgbStart = hexToRgb('#77ca7a');
  const rgbEnd = hexToRgb('#59f168');
  const r = Math.round(rgbStart[0] + (rgbEnd[0] - rgbStart[0]) * ratio);
  const g = Math.round(rgbStart[1] + (rgbEnd[1] - rgbStart[1]) * ratio);
  const b = Math.round(rgbStart[2] + (rgbEnd[2] - rgbStart[2]) * ratio);
  return { color: `rgb(${r}, ${g}, ${b})`, isSupersonic: false, percent };
};

/**
 * VelocityProgressBar
 * High-frequency 120Hz car velocity progress bar with 85% supersonic threshold tick.
 */
export const VelocityProgressBar = React.memo(
  forwardRef<VelocityProgressBarHandle, VelocityProgressBarProps>(
    ({ speed = 0, subscribeSpeed, width = '100%', height = 20, className = '' }, ref) => {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const initial = getVelocityBarColor(speed);

  const applySpeedToDom = useCallback((rawSpeed: number) => {
    const el = fillRef.current;
    if (!el) return;
    const { color, isSupersonic, percent } = getVelocityBarColor(rawSpeed);
    el.style.width = `${percent}%`;
    el.style.backgroundColor = color;
    el.classList.toggle('supersonic-heartbeat', isSupersonic);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setSpeed: applySpeedToDom,
    }),
    [applySpeedToDom]
  );

  // Sync when declarative `speed` prop changes
  useEffect(() => {
    applySpeedToDom(speed);
  }, [speed, applySpeedToDom]);

  // Subscribe to 120Hz transient channel if provided (0 React re-renders)
  useEffect(() => {
    if (!subscribeSpeed) return;
    return subscribeSpeed(applySpeedToDom);
  }, [subscribeSpeed, applySpeedToDom]);

  const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      data-alpha-id="Alpha:VelocityProgressBar"
      data-ui-element="hud-velocity-progress-bar"
      className={`relative select-none pointer-events-auto overflow-hidden bg-[#333333]/80 ${className}`}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        borderRadius: 0,
      }}
    >
      {/* 85% Supersonic Threshold Marker */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none z-10"
        style={{
          left: '85%',
          width: '2px',
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
        }}
        title="Supersonic Threshold (2200 uu/s)"
      />

      {/* Zero-latency progress fill */}
      <div
        ref={fillRef}
        className={`h-full ${initial.isSupersonic ? 'supersonic-heartbeat' : ''}`}
        style={{
          width: `${initial.percent}%`,
          backgroundColor: initial.color,
          borderRadius: 0,
          transition: 'none',
        }}
      />

      {/* Compositor-friendly opacity pulse */}
      <style>{`
        @keyframes supersonicHeartbeat {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.72; }
        }
        .supersonic-heartbeat {
          animation: supersonicHeartbeat 1.2s infinite ease-in-out;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
        }
      `}</style>
      </div>
    );
  })
);

VelocityProgressBar.displayName = 'VelocityProgressBar';
