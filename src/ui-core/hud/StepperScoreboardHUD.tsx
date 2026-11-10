import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  ScoreboardTransientListener,
  SeriesSlotWinner,
  StepperScoreboardState,
} from '../stores/hudTransientTypes';

export interface StepperScoreboardHandle {
  /** Imperatively push scoreboard state to DOM refs with zero React re-renders */
  setScoreboard: (state: StepperScoreboardState) => void;
}

export interface StepperScoreboardHUDProps {
  leftScore?: number;
  rightScore?: number;
  scoreDigits?: 2 | 3;
  seconds?: number;
  isOvertime?: boolean;
  overtimeChinOpen?: boolean;
  overtimeChinText?: string;
  overtimeChinColor?: string;
  bestOf?: 0 | 3 | 5 | 7;
  seriesTitle?: string;
  leftSeriesWins?: number;
  rightSeriesWins?: number;
  seriesResults?: SeriesSlotWinner[];
  leftTeamColor?: string;
  rightTeamColor?: string;
  leftLabel?: string;
  rightLabel?: string;
  isLight?: boolean;
  subscribeScoreboard?: (listener: ScoreboardTransientListener) => () => void;
  className?: string;
}

/**
 * Formats regulation time as 5 chars `00:00` (e.g. `04:59`)
 * and Overtime as 5 chars `+0:00` (e.g. `+1:24`, or `+9:59`).
 */
export function formatFiveCharTimer(totalSeconds: number, isOvertime: boolean): string {
  const clamped = Math.max(0, Math.floor(Math.abs(totalSeconds) || 0));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;

  if (isOvertime) {
    const mDigit = Math.min(9, mins);
    return `+${mDigit}:${ss}`;
  }

  const mm = mins < 10 ? `0${mins}` : `${Math.min(99, mins)}`;
  return `${mm}:${ss}`;
}

/**
 * StepperScoreboardHUD
 * Top-flush unfolded-box 3-segment scoreboard with Single Chin & Double Chin sub-banners
 * and zero-React-rerender transient channel subscription (`subscribeScoreboard`).
 */
const StepperScoreboardHUDInner = forwardRef<StepperScoreboardHandle, StepperScoreboardHUDProps>(
  (
    {
      leftScore = 2,
      rightScore = 2,
      scoreDigits = 2,
      seconds = 164,
      isOvertime = false,
      overtimeChinOpen = false,
      overtimeChinText = 'OVERTIME',
      overtimeChinColor,
      bestOf = 5,
      seriesTitle,
      leftSeriesWins = 2,
      rightSeriesWins = 1,
      seriesResults = ['left', 'right', 'left', 'none', 'none'],
      leftTeamColor = '#2563EB',
      rightTeamColor = '#EA580C',
      leftLabel,
      rightLabel,
      isLight = true,
      subscribeScoreboard,
      className = '',
    },
    ref
  ) => {
    const leftWingRef = useRef<HTMLDivElement | null>(null);
    const rightWingRef = useRef<HTMLDivElement | null>(null);
    const leftScoreRef = useRef<HTMLSpanElement | null>(null);
    const rightScoreRef = useRef<HTMLSpanElement | null>(null);
    const timerTextRef = useRef<HTMLSpanElement | null>(null);
    const singleChinWrapRef = useRef<HTMLDivElement | null>(null);
    const singleChinTitleRef = useRef<HTMLSpanElement | null>(null);
    const leftPillsRef = useRef<(HTMLSpanElement | null)[]>([]);
    const rightPillsRef = useRef<(HTMLSpanElement | null)[]>([]);
    const doubleChinOuterRef = useRef<HTMLDivElement | null>(null);
    const doubleChinInnerRef = useRef<HTMLDivElement | null>(null);
    const doubleChinTextRef = useRef<HTMLSpanElement | null>(null);

    const emptySlotColor = isLight ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.22)';

    const applyState = useCallback(
      (state: StepperScoreboardState) => {
        if (leftWingRef.current) {
          leftWingRef.current.style.backgroundColor = leftTeamColor;
        }
        if (rightWingRef.current) {
          rightWingRef.current.style.backgroundColor = rightTeamColor;
        }

        const digits =
          state.scoreDigits === 3 || state.leftScore >= 100 || state.rightScore >= 100
            ? 3
            : 2;
        const maxScore = digits === 3 ? 999 : 99;
        const slotWidthCh = `${digits}ch`;

        if (leftScoreRef.current) {
          const nextLeft = String(
            Math.max(0, Math.min(maxScore, Math.floor(state.leftScore)))
          );
          if (leftScoreRef.current.textContent !== nextLeft) {
            leftScoreRef.current.textContent = nextLeft;
          }
          if (leftScoreRef.current.style.width !== slotWidthCh) {
            leftScoreRef.current.style.width = slotWidthCh;
          }
        }
        if (rightScoreRef.current) {
          const nextRight = String(
            Math.max(0, Math.min(maxScore, Math.floor(state.rightScore)))
          );
          if (rightScoreRef.current.textContent !== nextRight) {
            rightScoreRef.current.textContent = nextRight;
          }
          if (rightScoreRef.current.style.width !== slotWidthCh) {
            rightScoreRef.current.style.width = slotWidthCh;
          }
        }

        if (timerTextRef.current) {
          const formatted = formatFiveCharTimer(state.seconds, state.isOvertime);
          if (timerTextRef.current.textContent !== formatted) {
            timerTextRef.current.textContent = formatted;
          }
        }

        if (singleChinWrapRef.current) {
          const showSingleChin = state.bestOf > 0;
          singleChinWrapRef.current.style.maxHeight = showSingleChin ? '30px' : '0px';
          singleChinWrapRef.current.style.marginTop = showSingleChin ? '-6px' : '0px';
          singleChinWrapRef.current.style.borderBottomWidth = showSingleChin
            ? '1px'
            : '0px';
          singleChinWrapRef.current.style.opacity = showSingleChin ? '1' : '0';

          const winsNeeded = showSingleChin ? Math.ceil(state.bestOf / 2) : 0;
          const lWins = Math.max(0, Math.min(winsNeeded, state.leftSeriesWins ?? 0));
          const rWins = Math.max(0, Math.min(winsNeeded, state.rightSeriesWins ?? 0));

          if (singleChinTitleRef.current) {
            const nextTitle = state.seriesTitle || `BO${state.bestOf || 5}`;
            if (singleChinTitleRef.current.textContent !== nextTitle) {
              singleChinTitleRef.current.textContent = nextTitle;
            }
          }

          for (let i = 0; i < 4; i++) {
            const pillEl = leftPillsRef.current[i];
            if (!pillEl) continue;
            if (i >= winsNeeded) {
              pillEl.style.display = 'none';
            } else {
              pillEl.style.display = 'block';
              const isWon = i < lWins;
              pillEl.style.backgroundColor = isWon ? leftTeamColor : emptySlotColor;
            }
          }

          for (let i = 0; i < 4; i++) {
            const pillEl = rightPillsRef.current[i];
            if (!pillEl) continue;
            if (i >= winsNeeded) {
              pillEl.style.display = 'none';
            } else {
              pillEl.style.display = 'block';
              const isWon = i < rWins;
              pillEl.style.backgroundColor = isWon ? rightTeamColor : emptySlotColor;
            }
          }
        }

        if (doubleChinOuterRef.current && doubleChinInnerRef.current) {
          const open = Boolean(state.overtimeChinOpen);
          doubleChinOuterRef.current.style.maxHeight = open ? '38px' : '0px';
          doubleChinInnerRef.current.style.transform = open
            ? 'translate3d(0, 0%, 0)'
            : 'translate3d(0, -105%, 0)';
          doubleChinInnerRef.current.style.opacity = open ? '1' : '0';
          const chinBg =
            state.overtimeChinColor ||
            (state.overtimeChinText === 'LOBBY' ? '#52525B' : '#DC2626');
          const chinBorder = state.overtimeChinColor
            ? state.overtimeChinColor
            : state.overtimeChinText === 'LOBBY'
            ? '#3F3F46'
            : '#B91C1C';
          doubleChinInnerRef.current.style.backgroundColor = chinBg;
          doubleChinInnerRef.current.style.borderColor = chinBorder;
        }
        if (doubleChinTextRef.current && state.overtimeChinText) {
          if (doubleChinTextRef.current.textContent !== state.overtimeChinText) {
            doubleChinTextRef.current.textContent = state.overtimeChinText;
          }
        }
      },
      [leftTeamColor, rightTeamColor, emptySlotColor]
    );

    useImperativeHandle(
      ref,
      () => ({
        setScoreboard: applyState,
      }),
      [applyState]
    );

    useEffect(() => {
      if (subscribeScoreboard) {
        return subscribeScoreboard(applyState);
      }

      applyState({
        leftScore,
        rightScore,
        scoreDigits,
        seconds,
        isOvertime,
        overtimeChinOpen,
        overtimeChinText,
        overtimeChinColor,
        bestOf,
        seriesTitle,
        leftSeriesWins,
        rightSeriesWins,
        seriesResults,
      });
    }, [
      subscribeScoreboard,
      applyState,
      leftScore,
      rightScore,
      scoreDigits,
      seconds,
      isOvertime,
      overtimeChinOpen,
      overtimeChinText,
      overtimeChinColor,
      bestOf,
      seriesTitle,
      leftSeriesWins,
      rightSeriesWins,
      seriesResults,
    ]);

    const centerBgClass = isLight ? 'bg-white text-[#09090B]' : 'bg-[#09090B] text-white';
    const outerBorderClass = isLight ? 'border-[#D4D4D8]' : 'border-[#3F3F46]';
    const dividerColorClass = isLight ? 'bg-[#D4D4D8]' : 'bg-[#3F3F46]';
    const singleChinBgClass = isLight
      ? 'bg-[#F4F4F5] border-x border-b border-[#D4D4D8] text-neutral-800'
      : 'bg-[#141418] border-x border-b border-[#3F3F46] text-neutral-200';

    const initialWinsNeeded = bestOf > 0 ? Math.ceil(bestOf / 2) : 3;

    return (
      <div
        data-ui-element="hud-stepper-scoreboard"
        data-alpha-id="Alpha:StepperScoreboardHUD"
        className={`inline-flex flex-col items-center select-none pointer-events-auto ${className}`}
        style={{ fontFamily: 'var(--font-jetbrains)' }}
      >
        {/* TOP UNFOLDED-BOX STEPPER (z-30) */}
        <div
          className={`relative z-30 flex items-stretch rounded-t-none rounded-b-[6px] overflow-hidden border-x border-b shadow-none ${outerBorderClass} ${dividerColorClass}`}
        >
          {/* Left Team Score Wing */}
          <div
            ref={leftWingRef}
            className="relative flex items-center justify-center px-3.5 py-1.5 text-white transition-colors duration-200"
            style={{ backgroundColor: leftTeamColor }}
          >
            {leftLabel && (
              <span className="mr-2 text-[10px] font-normal uppercase tracking-widest opacity-85">
                {leftLabel}
              </span>
            )}
            <span
              ref={leftScoreRef}
              className="inline-flex items-center justify-center text-center text-[28px] leading-none font-thin tabular-nums tracking-tight"
              style={{ width: `${scoreDigits}ch`, fontWeight: 100 }}
            >
              {leftScore}
            </span>
          </div>

          <div className={`w-[1px] shrink-0 ${dividerColorClass}`} />

          {/* Center 5-Character Countdown / Overtime Block */}
          <div
            className={`flex items-center justify-center px-4 py-1.5 transition-colors duration-200 ${centerBgClass}`}
          >
            <span
              ref={timerTextRef}
              className="inline-flex items-center justify-center w-[5ch] text-center text-[26px] leading-none font-thin tabular-nums tracking-tight"
              style={{ fontWeight: 100 }}
            >
              {formatFiveCharTimer(seconds, isOvertime)}
            </span>
          </div>

          <div className={`w-[1px] shrink-0 ${dividerColorClass}`} />

          {/* Right Team Score Wing */}
          <div
            ref={rightWingRef}
            className="relative flex items-center justify-center px-3.5 py-1.5 text-white transition-colors duration-200"
            style={{ backgroundColor: rightTeamColor }}
          >
            <span
              ref={rightScoreRef}
              className="inline-flex items-center justify-center text-center text-[28px] leading-none font-thin tabular-nums tracking-tight"
              style={{ width: `${scoreDigits}ch`, fontWeight: 100 }}
            >
              {rightScore}
            </span>
            {rightLabel && (
              <span className="ml-2 text-[10px] font-normal uppercase tracking-widest opacity-85">
                {rightLabel}
              </span>
            )}
          </div>
        </div>

        {/* TIER 1 SUB-BANNER: SERIES PIPS BANNER (z-20) */}
        <div
          ref={singleChinWrapRef}
          className={`relative z-20 w-full overflow-hidden rounded-t-none rounded-b-[6px] transition-all duration-300 ease-out ${singleChinBgClass}`}
          style={{
            maxHeight: bestOf > 0 ? '30px' : '0px',
            marginTop: bestOf > 0 ? '-6px' : '0px',
            borderBottomWidth: bestOf > 0 ? '1px' : '0px',
            opacity: bestOf > 0 ? 1 : 0,
          }}
        >
          <div className="flex items-center justify-between gap-2 px-2.5 pt-[9px] pb-[4px] w-full">
            <div className="flex items-center justify-start gap-1 flex-1">
              {[0, 1, 2, 3].map((idx) => {
                const isWon = idx < leftSeriesWins;
                return (
                  <span
                    key={`left-pill-${idx}`}
                    ref={(el) => {
                      leftPillsRef.current[idx] = el;
                    }}
                    className="h-[6px] flex-1 rounded-[2px] transition-colors duration-200"
                    style={{
                      display: idx < initialWinsNeeded ? 'block' : 'none',
                      backgroundColor: isWon ? leftTeamColor : emptySlotColor,
                    }}
                  />
                );
              })}
            </div>

            <span
              ref={singleChinTitleRef}
              className="text-[9px] uppercase tracking-[0.16em] opacity-75 shrink-0 px-1 text-center"
              style={{ fontWeight: 400 }}
            >
              {seriesTitle || `BO${bestOf || 5}`}
            </span>

            <div className="flex flex-row-reverse items-center justify-start gap-1 flex-1">
              {[0, 1, 2, 3].map((idx) => {
                const isWon = idx < rightSeriesWins;
                return (
                  <span
                    key={`right-pill-${idx}`}
                    ref={(el) => {
                      rightPillsRef.current[idx] = el;
                    }}
                    className="h-[6px] flex-1 rounded-[2px] transition-colors duration-200"
                    style={{
                      display: idx < initialWinsNeeded ? 'block' : 'none',
                      backgroundColor: isWon ? rightTeamColor : emptySlotColor,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* TIER 2 SUB-BANNER: PHASE DROP-BANNER (z-10) */}
        <div
          ref={doubleChinOuterRef}
          className="relative z-10 -mt-[6px] w-full overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            maxHeight: overtimeChinOpen ? '38px' : '0px',
          }}
        >
          <div
            ref={doubleChinInnerRef}
            className={
              'w-full flex items-center justify-center bg-[#DC2626] text-white px-3 pt-[11px] pb-[4px] ' +
              'rounded-t-none rounded-b-[6px] border-x border-b border-red-700 will-change-transform ' +
              'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
            }
            style={{
              transform: overtimeChinOpen
                ? 'translate3d(0, 0%, 0)'
                : 'translate3d(0, -105%, 0)',
              opacity: overtimeChinOpen ? 1 : 0,
            }}
          >
            <span
              ref={doubleChinTextRef}
              className="text-[10px] uppercase tracking-[0.24em] leading-none"
              style={{ fontWeight: 500 }}
            >
              {overtimeChinText}
            </span>
          </div>
        </div>
      </div>
    );
  }
);

StepperScoreboardHUDInner.displayName = 'StepperScoreboardHUD';

export const StepperScoreboardHUD = React.memo(StepperScoreboardHUDInner);
