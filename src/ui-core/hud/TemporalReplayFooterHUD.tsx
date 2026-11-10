import React, { useEffect, useId, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  ReplayFooterTransientState,
  ReplayFooterTransientListener,
} from '../stores/hudTransientTypes';
import {
  hexToRgbTuple,
  buildReplayBorderPath,
  buildReplayClipPolygon,
  ReplayScorerIconSvg,
  ReplaySpeedGaugeIconSvg,
  ReplayAssisterIconSvg,
} from './temporalReplayFooterIcons';

export interface TemporalReplayData {
  scorerName: string;
  /** e.g. `118KPH` or number `118` */
  goalSpeed: string | number;
  /** Optional assister name; if null or empty, the Assister block is hidden automatically */
  assisterName?: string | null;
  /** Team accent color for the center glow & SVG top border gradient mid-stop (default: `#edce0b`) */
  teamAccentColor?: string;
}

export interface TemporalReplayFooterHandle {
  /** Imperatively push replay footer state at 120Hz with 0 React re-renders */
  setReplayFooter: (state: ReplayFooterTransientState) => void;
}

export interface TemporalReplayFooterHUDProps {
  /** Controls bottom-up slide-in (`visible=true`) and slide-out (`visible=false`) animation */
  visible?: boolean;
  data?: TemporalReplayData;
  /** Optional transient channel subscription (0 React VDOM re-renders) */
  subscribeReplayFooter?: (listener: ReplayFooterTransientListener) => () => void;
  /** Slide-in transition duration in seconds (default 0.75s, matching `replay-controller.ts`) */
  enterDurationSec?: number;
  /** Slide-out transition duration in seconds (default 0.65s, matching `scene-replay-viewer.html`) */
  exitDurationSec?: number;
  /** Side wing vertical offset in px (default -16px) */
  sideY?: number;
  /** Center dip vertical offset in px (default 47px) */
  centerY?: number;
  /** Wing flat width % (default 7%) */
  wingWidthPct?: number;
  /** Slope transition width % (default 15%) */
  slopeWidthPct?: number;
  /** Footer content height in px (default 98px) */
  footerHeightPx?: number;
  /** Light/Dark theme adaptive styling */
  isLight?: boolean;
  className?: string;
}

/**
 * TemporalReplayFooterHUD (`T5A.1`)
 * 1:1 faithful port of `RLoverlay_debug_v1` / `agrepo1` (`scene-replay-viewer.html` + `replay-controller.ts`).
 * Upgraded to High-Performance Architecture (`React.memo` + `forwardRef` + `subscribeReplayFooter` + `isLight`).
 */
export const TemporalReplayFooterHUD = React.memo(
  forwardRef<TemporalReplayFooterHandle, TemporalReplayFooterHUDProps>(
    (
      {
        visible = true,
        data = {
          scorerName: 'Vatira_KC',
          goalSpeed: '118KPH',
          assisterName: 'Atow.',
          teamAccentColor: '#edce0b',
        },
        subscribeReplayFooter,
        enterDurationSec = 0.75,
        exitDurationSec = 0.65,
        sideY = -16,
        centerY = 47,
        wingWidthPct = 7,
        slopeWidthPct = 15,
        footerHeightPx = 98,
        isLight = true,
        className = '',
      },
      ref
    ) => {
      const footerRef = useRef<HTMLElement | null>(null);
      const bgRef = useRef<HTMLDivElement | null>(null);
      const svgPathRef = useRef<SVGPathElement | null>(null);
      const stopMid1Ref = useRef<SVGStopElement | null>(null);
      const stopMid2Ref = useRef<SVGStopElement | null>(null);
      const scorerTextRef = useRef<HTMLSpanElement | null>(null);
      const speedTextRef = useRef<HTMLSpanElement | null>(null);
      const assisterBlockRef = useRef<HTMLDivElement | null>(null);
      const assisterTextRef = useRef<HTMLSpanElement | null>(null);
      const gradId = useId().replace(/:/g, '');

      const baseTop = 120;
      const totalHeightPx = footerHeightPx + baseTop;
      const midColor = data.teamAccentColor || '#edce0b';
      const [midR, midG, midB] = hexToRgbTuple(midColor);

      const formatSpeed = useCallback((gs: string | number) => {
        if (gs === '' || gs === null || gs === undefined) return '';
        if (typeof gs === 'number') return Number.isFinite(gs) ? `${Math.floor(gs)}KPH` : '';
        return gs.endsWith('KPH') ? gs : `${gs}KPH`;
      }, []);

      const applyStateToDom = useCallback(
        (st: ReplayFooterTransientState) => {
          if (footerRef.current) {
            footerRef.current.style.transform = st.visible
              ? 'translate3d(0, 0%, 0)'
              : 'translate3d(0, 100%, 0)';
            footerRef.current.style.transition = st.visible
              ? `transform ${enterDurationSec}s cubic-bezier(0.16, 1, 0.3, 1)`
              : `transform ${exitDurationSec}s cubic-bezier(0.7, 0, 0.84, 0)`;
          }
          if (scorerTextRef.current) {
            const nextScorer = st.scorerName || '';
            if (scorerTextRef.current.textContent !== nextScorer) {
              scorerTextRef.current.textContent = nextScorer;
            }
          }
          if (speedTextRef.current) {
            const nextSpd = formatSpeed(st.goalSpeed);
            if (speedTextRef.current.textContent !== nextSpd) {
              speedTextRef.current.textContent = nextSpd;
            }
          }
          const hasAssister = Boolean(st.assisterName && st.assisterName.trim().length > 0);
          if (assisterBlockRef.current) {
            assisterBlockRef.current.style.display = hasAssister ? 'flex' : 'none';
          }
          if (assisterTextRef.current && hasAssister) {
            const nextAst = st.assisterName || '';
            if (assisterTextRef.current.textContent !== nextAst) {
              assisterTextRef.current.textContent = nextAst;
            }
          }
          const accent = st.teamAccentColor || '#edce0b';
          const [r, g, b] = hexToRgbTuple(accent);
          if (stopMid1Ref.current) stopMid1Ref.current.setAttribute('stop-color', accent);
          if (stopMid2Ref.current) stopMid2Ref.current.setAttribute('stop-color', accent);
          if (bgRef.current) {
            const wingRgb = isLight ? '20, 24, 38' : '35, 30, 25';
            const wingAlpha = isLight ? 0.52 : 0.35;
            bgRef.current.style.background = `linear-gradient(
              90deg,
              rgba(160, 20, 45, 0.32) 0%,
              rgba(${wingRgb}, ${wingAlpha}) 18%,
              rgba(${r}, ${g}, ${b}, 0.42) 50%,
              rgba(${wingRgb}, ${wingAlpha}) 82%,
              rgba(160, 20, 45, 0.32) 100%
            )`;
          }
        },
        [enterDurationSec, exitDurationSec, formatSpeed, isLight]
      );

      useImperativeHandle(
        ref,
        () => ({
          setReplayFooter: applyStateToDom,
        }),
        [applyStateToDom]
      );

      useEffect(() => {
        applyStateToDom({
          visible,
          scorerName: data.scorerName,
          goalSpeed: data.goalSpeed,
          assisterName: data.assisterName,
          teamAccentColor: data.teamAccentColor || '#edce0b',
        });
      }, [visible, data, applyStateToDom]);

      useEffect(() => {
        if (!subscribeReplayFooter) return;
        return subscribeReplayFooter(applyStateToDom);
      }, [subscribeReplayFooter, applyStateToDom]);

      useEffect(() => {
        const footerEl = footerRef.current;
        const pathEl = svgPathRef.current;
        if (!footerEl || !pathEl) return;

        const updateBorderPath = () => {
          const winW = footerEl.clientWidth || window.innerWidth || 1280;
          pathEl.setAttribute(
            'd',
            buildReplayBorderPath(winW, baseTop, sideY, centerY, wingWidthPct, slopeWidthPct)
          );
        };

        updateBorderPath();
        let rafId = 0;
        const ro = new ResizeObserver(() => {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            updateBorderPath();
          });
        });
        ro.observe(footerEl);
        return () => {
          if (rafId) cancelAnimationFrame(rafId);
          ro.disconnect();
        };
      }, [sideY, centerY, wingWidthPct, slopeWidthPct]);

      const clipPolygon = buildReplayClipPolygon(
        baseTop,
        sideY,
        centerY,
        wingWidthPct,
        slopeWidthPct
      );
      const formattedSpeed = formatSpeed(data.goalSpeed);
      const hasAssister = Boolean(data.assisterName && data.assisterName.trim().length > 0);
      const wingRgb = isLight ? '20, 24, 38' : '35, 30, 25';

      return (
        <footer
          ref={footerRef}
          data-ui-element="hud-temporal-replay-footer"
          data-alpha-id="Alpha:TemporalReplayFooterHUD"
          className={`absolute bottom-0 left-0 w-full z-40 pointer-events-none select-none will-change-transform ${className}`}
          style={{
            height: `${totalHeightPx}px`,
            transform: visible ? 'translate3d(0, 0%, 0)' : 'translate3d(0, 100%, 0)',
            transition: visible
              ? `transform ${enterDurationSec}s cubic-bezier(0.16, 1, 0.3, 1)`
              : `transform ${exitDurationSec}s cubic-bezier(0.7, 0, 0.84, 0)`,
            fontFamily: "'Chakra Petch', var(--font-jetbrains), system-ui, sans-serif",
          }}
        >
          <style>{`
            @keyframes rlReplayPulseDot {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.25; transform: scale(0.7); }
            }
          `}</style>

          {/* 1. Semi-transparent Polygon Solid-Gradient Background Layer (0 backdrop-filter) */}
          <div
            ref={bgRef}
            className="absolute inset-0 w-full h-full pointer-events-auto"
            style={{
              clipPath: clipPolygon,
              background: `linear-gradient(
                90deg,
                rgba(160, 20, 45, 0.65) 0%,
                rgba(${wingRgb}, 0.85) 18%,
                rgba(${midR}, ${midG}, ${midB}, 0.68) 50%,
                rgba(${wingRgb}, 0.85) 82%,
                rgba(160, 20, 45, 0.65) 100%
              )`,
            }}
          />

          {/* 2. Top Highlight Gradient Glowing SVG Line */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            width="100%"
            height="100%"
          >
            <defs>
              <linearGradient id={`lineGrad-${gradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff2a4b" />
                <stop offset="16%" stopColor="#ff2a4b" />
                <stop ref={stopMid1Ref} offset="28%" stopColor={midColor} />
                <stop ref={stopMid2Ref} offset="72%" stopColor={midColor} />
                <stop offset="84%" stopColor="#ff2a4b" />
                <stop offset="100%" stopColor="#ff2a4b" />
              </linearGradient>
            </defs>
            <path
              ref={svgPathRef}
              d=""
              fill="none"
              stroke={`url(#lineGrad-${gradId})`}
              strokeWidth="3"
            />
          </svg>

          {/* 3. Foreground Content Grid */}
          <div
            className="absolute bottom-0 left-0 z-20 w-full grid items-center px-6 md:px-8 pointer-events-auto"
            style={{
              height: `${footerHeightPx}px`,
              gridTemplateColumns: 'minmax(130px, 220px) 1fr minmax(130px, 220px)',
            }}
          >
            {/* Left REPLAY Wing Indicator */}
            <div
              className="flex items-center gap-2.5 text-[#ff2a4b] font-extrabold italic tracking-[3px] text-base md:text-xl"
              style={{ transform: `translateY(${sideY * 0.5}px)` }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full bg-[#ff2a4b] shrink-0"
                style={{
                  boxShadow: '0 0 0 2px rgba(255, 42, 75, 0.35)',
                  animation: 'rlReplayPulseDot 1.2s infinite ease-in-out',
                }}
              />
              <span>REPLAY</span>
            </div>

            {/* Center Scorer / Goal Speed / Assister Stats */}
            <div
              className="flex items-center justify-center gap-6 md:gap-11 text-white font-extrabold italic tracking-[1.5px] text-base md:text-[21px]"
              style={{
                WebkitTextStroke: '0.6px rgba(0, 0, 0, 0.65)',
                transform: `translateY(${centerY * 0.5}px)`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <ReplayScorerIconSvg />
                <span ref={scorerTextRef} className="truncate max-w-[180px]">
                  {data.scorerName || 'Player'}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <ReplaySpeedGaugeIconSvg />
                <span
                  ref={speedTextRef}
                  className="text-[#f1f5f9] text-base md:text-xl tabular-nums"
                >
                  {formattedSpeed}
                </span>
              </div>

              <div
                ref={assisterBlockRef}
                className="flex items-center gap-2.5"
                style={{ display: hasAssister ? 'flex' : 'none' }}
              >
                <ReplayAssisterIconSvg />
                <span ref={assisterTextRef} className="truncate max-w-[160px]">
                  {data.assisterName}
                </span>
              </div>
            </div>

            {/* Right REPLAY Wing Indicator */}
            <div
              className="flex items-center justify-end gap-2.5 text-[#ff2a4b] font-extrabold italic tracking-[3px] text-base md:text-xl"
              style={{ transform: `translateY(${sideY * 0.5}px)` }}
            >
              <span>REPLAY</span>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full bg-[#ff2a4b] shrink-0"
                style={{
                  boxShadow: '0 0 0 2px rgba(255, 42, 75, 0.35)',
                  animation: 'rlReplayPulseDot 1.2s infinite ease-in-out',
                }}
              />
            </div>
          </div>
        </footer>
      );
    }
  )
);

TemporalReplayFooterHUD.displayName = 'TemporalReplayFooterHUD';
