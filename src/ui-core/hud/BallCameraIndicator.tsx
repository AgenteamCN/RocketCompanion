import React, { memo, forwardRef, useRef, useEffect, useImperativeHandle, useCallback } from 'react';
import { KeycapBadge } from '../primitives/KeycapBadge';
import { BallCamTransientListener } from '../stores/hudTransientTypes';

export interface BallCameraIndicatorHandle {
  /** Imperatively toggle or set BallCam active state with zero React re-render */
  setActive: (active: boolean) => void;
}

export interface BallCameraIndicatorProps {
  /** Whether Ball Camera is currently active */
  active?: boolean;
  /** High-frequency transient subscription updating DOM refs with zero React VDOM re-renders */
  subscribeBallCam?: (listener: BallCamTransientListener) => () => void;
  /** Keycap label such as 'SPACE' */
  shortcut?: string | null;
  /** Primary title such as 'BALL CAM' */
  label?: string;
  /** Action suffix such as 'TO TOGGLE' */
  actionText?: string;
  /** Light/Dark adaptive theme */
  isLight?: boolean;
  /** Click callback to toggle Ball Camera */
  onToggle?: () => void;
  /** Optional container className */
  className?: string;
}

/**
 * BallCameraIndicator
 * Rocket League HUD indicator supporting both declarative props and 0-re-render transient ref updates.
 */
export const BallCameraIndicator = memo(
  forwardRef<BallCameraIndicatorHandle, BallCameraIndicatorProps>(
    (
      {
        active = true,
        subscribeBallCam,
        shortcut = 'SPACE',
        label = 'BALL CAM',
        actionText = 'TO TOGGLE',
        isLight = false,
        onToggle,
        className = '',
      },
      ref
    ) => {
      const shellRef = useRef<HTMLDivElement | null>(null);
      const dotRef = useRef<HTMLDivElement | null>(null);
      const pingRef = useRef<HTMLDivElement | null>(null);
      const titleRef = useRef<HTMLSpanElement | null>(null);
      const subRowRef = useRef<HTMLDivElement | null>(null);
      const fallbackTextRef = useRef<HTMLSpanElement | null>(null);

      const getShellClass = useCallback(
        (isActive: boolean) =>
          `flex items-center gap-3 px-4 py-2.5 rounded-2xl border transition-all duration-150 ${
            isLight
              ? isActive
                ? 'bg-white/96 border-neutral-300 text-neutral-900 shadow-md'
                : 'bg-white/85 border-neutral-200 text-neutral-400 shadow-xs opacity-65'
              : isActive
              ? 'bg-neutral-950/95 border-neutral-800 text-white shadow-md'
              : 'bg-neutral-900/80 border-neutral-800/60 text-neutral-500 shadow-none opacity-55'
          }`,
        [isLight]
      );

      const getDotClass = useCallback(
        (isActive: boolean) =>
          `w-5 h-5 rounded-full transition-all duration-150 ${
            isActive
              ? 'bg-red-500 ring-2 ring-red-500/35'
              : isLight
              ? 'bg-neutral-300'
              : 'bg-neutral-700'
          }`,
        [isLight]
      );

      const getTitleClass = useCallback(
        (isActive: boolean) =>
          `text-sm font-black tracking-wider font-mono uppercase transition-colors ${
            isActive
              ? isLight
                ? 'text-neutral-900'
                : 'text-white'
              : isLight
              ? 'text-neutral-500'
              : 'text-neutral-400'
          }`,
        [isLight]
      );

      const applyActiveToDom = useCallback(
        (isActive: boolean) => {
          if (shellRef.current) {
            shellRef.current.className = getShellClass(isActive);
          }
          if (dotRef.current) {
            dotRef.current.className = getDotClass(isActive);
          }
          if (pingRef.current) {
            pingRef.current.style.display = isActive ? 'block' : 'none';
          }
          if (titleRef.current) {
            titleRef.current.className = getTitleClass(isActive);
          }
          if (subRowRef.current) {
            subRowRef.current.style.opacity = isActive ? '0.85' : '0.5';
          }
          if (fallbackTextRef.current) {
            fallbackTextRef.current.style.opacity = isActive ? '0.7' : '0.4';
            fallbackTextRef.current.textContent = isActive
              ? 'CAMERA LOCKED ON BALL'
              : 'FREE COCKPIT VIEW';
          }
        },
        [getShellClass, getDotClass, getTitleClass]
      );

      useImperativeHandle(
        ref,
        () => ({
          setActive: applyActiveToDom,
        }),
        [applyActiveToDom]
      );

      useEffect(() => {
        applyActiveToDom(active);
      }, [active, applyActiveToDom]);

      useEffect(() => {
        if (!subscribeBallCam) return;
        return subscribeBallCam(applyActiveToDom);
      }, [subscribeBallCam, applyActiveToDom]);

      return (
        <div
          data-alpha-id="Alpha:BallCameraIndicator"
          data-ui-element="hud-ball-camera-indicator"
          onClick={onToggle}
          className={`select-none pointer-events-auto transition-all cursor-pointer group active:scale-95 inline-flex ${className}`}
          title="Click or press key to toggle Ball Camera"
        >
          <div ref={shellRef} className={getShellClass(active)}>
            <div className="relative shrink-0 flex items-center justify-center">
              <div ref={dotRef} className={getDotClass(active)} />
              <div
                ref={pingRef}
                style={{ display: active ? 'block' : 'none' }}
                className="absolute w-7 h-7 rounded-full bg-red-500/25 animate-ping pointer-events-none"
              />
            </div>

            <div className="flex flex-col items-start text-left leading-tight">
              <span ref={titleRef} className={getTitleClass(active)}>
                {label}
              </span>

              {/* PRESS [KEY] TO TOGGLE */}
              {shortcut ? (
                <div
                  ref={subRowRef}
                  style={{ opacity: active ? 0.85 : 0.5 }}
                  className={`flex items-center gap-1.5 text-[10px] font-mono tracking-tight mt-0.5 transition-opacity ${
                    isLight ? 'text-neutral-600' : 'text-neutral-400'
                  }`}
                >
                  <span>PRESS</span>
                  <KeycapBadge shortcut={shortcut} size="sm" isLight={isLight} />
                  <span>{actionText}</span>
                </div>
              ) : (
                <span
                  ref={fallbackTextRef}
                  style={{ opacity: active ? 0.7 : 0.4 }}
                  className="text-[10px] font-mono tracking-tight mt-0.5 transition-opacity text-neutral-500"
                >
                  {active ? 'CAMERA LOCKED ON BALL' : 'FREE COCKPIT VIEW'}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
  )
);

BallCameraIndicator.displayName = 'BallCameraIndicator';
