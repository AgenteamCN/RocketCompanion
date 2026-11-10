import React from 'react';
import {
  Sparkles,
  RotateCcw,
  Radio,
} from 'lucide-react';
import type { MatchHudChoreographySignal } from '../../../ui-core/stores/hudTransientTypes';
import { HudChoreographySlotColumn } from './HudChoreographySlotColumn';
import { HudChoreographyTopBandColumn } from './HudChoreographyTopBandColumn';
import { useHudChoreographySandbox } from './HudChoreographySandboxContext';

export interface HudChoreographyControlDeckProps {
  isLight: boolean;
}

const SIGNAL_ITEMS: {
  signal: MatchHudChoreographySignal;
  shortLabel: string;
  desc: string;
}[] = [
  {
    signal: 'goal-replay-will-start',
    shortLabel: '1. Goal Replay Will Start',
    desc: 'Speedometer+Flip Slide Down · Boost Slide Right · BallCam Slide Left',
  },
  {
    signal: 'goal-replay-started',
    shortLabel: '2. Goal Replay Started',
    desc: 'Bottom T5A.1 Replay Footer Expand Up · Left/Right 1-3 & 4-6 Player bar full slide-in',
  },
  {
    signal: 'goal-replay-will-end',
    shortLabel: '3. Goal Replay Will End',
    desc: 'Bottom T5A.1 Replay Footer Push down to collapse',
  },
  {
    signal: 'kickoff-will-start',
    shortLabel: '4. Kickoff Will Start',
    desc: 'Speedometer+Flip+Boost+BallCam Retract · internal1-3Collapse Key Labels · Peer4-6Retract off-screen',
  },
];

export const HudChoreographyControlDeck: React.FC<HudChoreographyControlDeckProps> = React.memo(
  ({ isLight }) => {
    const {
      hudThemeLight,
      setHudThemeLight,
      scorePreset,
      handleScorePresetChange,
      overtimeChinOpen,
      handleTriggerOvertimeKickoff,
      handleToggleOvertimeChin,
      handleResetRegulation,
      bestOf,
      handleBestOfChange,
      leftWins,
      rightWins,
      winsNeededForBo,
      handleAddSeriesWin,
      activeSignal,
      handleDispatchSignal,
      myTeamSide,
    } = useHudChoreographySandbox();

    const isMyTeamOrange = myTeamSide === 'orange';
    const myTeamBadgeClass = isMyTeamOrange
      ? 'bg-orange-600 text-white'
      : 'bg-blue-600 text-white';
    const oppTeamBadgeClass = isMyTeamOrange
      ? 'bg-blue-600 text-white'
      : 'bg-orange-600 text-white';

    return (
      <div
        className={`p-4 rounded-2xl border flex flex-col gap-3.5 ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
            : 'bg-neutral-900/70 border-neutral-800 text-neutral-200'
        }`}
      >
        {/* Top Signal Choreography Bar: 4 Event Signals */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
            isLight
              ? 'bg-white/90 border-neutral-200/90'
              : 'bg-neutral-950/70 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold font-mono flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-rose-500" />
              <span>
                Match HUD Signal Bus · Four-stage event signal orchestration (GPU `translate3d` · persistent DOM zero GC)
              </span>
            </span>
            <span className="text-[11px] font-mono opacity-75">
              Current Signal:{' '}
              <strong className="text-amber-500">
                {SIGNAL_ITEMS.find((s) => s.signal === activeSignal)?.shortLabel}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {SIGNAL_ITEMS.map((item) => {
              const isSelected = activeSignal === item.signal;
              return (
                <button
                  key={item.signal}
                  type="button"
                  onClick={() => handleDispatchSignal(item.signal)}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-300 shadow-xs'
                      : isLight
                      ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
                  }`}
                >
                  <span className="text-[11px] font-mono font-bold flex items-center justify-between">
                    <span>{item.shortLabel}</span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </span>
                  <span className="text-[10px] opacity-75 leading-snug">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main 3-Column Deck */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Column 1: Scorebug + Tiered Sub-Banners (Series Pips Banner & Phase Drop-Banner) */}
          <div className="flex flex-col gap-2.5 pr-0 lg:pr-3 lg:border-r border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>1. Scorebug Scoreboard (`top-0`) &amp; Stacked Sub-Banner</span>
              </span>
              <button
                type="button"
                onClick={() => setHudThemeLight((v) => !v)}
                className="px-2 py-0.5 rounded text-[11px] font-mono border border-neutral-400/40 cursor-pointer hover:bg-neutral-500/10"
              >
                HUD Background Color:{' '}
                {hudThemeLight ? 'Light (Black on White)' : 'Dark (White on Black)'}
              </button>
            </div>

            {/* 1-Digit / 2-Digit / 3-Digit Score Slot Preset Selector */}
            <div className="flex items-center justify-between gap-2 text-xs font-mono">
              <span className="text-[11px] opacity-75">Score Digits:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleScorePresetChange('1digit')}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                    scorePreset === '1digit'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'border border-neutral-400/40 opacity-80'
                  }`}
                >
                  Normal (2 : 2)
                </button>
                <button
                  type="button"
                  onClick={() => handleScorePresetChange('2digit')}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                    scorePreset === '2digit'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'border border-neutral-400/40 opacity-80'
                  }`}
                >
                  Two Digits (12 : 8)
                </button>
                <button
                  type="button"
                  onClick={() => handleScorePresetChange('3digit')}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                    scorePreset === '3digit'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'border border-neutral-400/40 opacity-80'
                  }`}
                >
                  Three Digits (104 : 99)
                </button>
              </div>
            </div>

            {/* Tier 2 Sub-Banner: Phase Drop-Banner (OVERTIME) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleTriggerOvertimeKickoff}
                className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-red-600 text-white cursor-pointer hover:bg-red-500 transition-colors"
              >
                [Boost] trigger OVERTIME (Phase Drop-Banner)
              </button>
              <button
                type="button"
                onClick={handleToggleOvertimeChin}
                className="px-2.5 py-1 rounded-lg text-xs font-mono border border-red-500/40 text-red-500 cursor-pointer hover:bg-red-500/10"
              >
                {overtimeChinOpen ? 'collapse Phase Banner' : 'Pop-up Phase Banner'}
              </button>
              <button
                type="button"
                onClick={handleResetRegulation}
                className="px-2 py-1 rounded-lg text-xs font-mono border border-neutral-400/40 cursor-pointer hover:bg-neutral-500/10"
              >
                <RotateCcw className="h-3 w-3 inline mr-1" />
                Regulation Time
              </button>
            </div>

            {/* Tier 1 Sub-Banner: Series Pips Banner (BO3 / BO5 / BO7) */}
            <div className="flex items-center justify-between gap-2 pt-0.5 text-xs font-mono flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[11px] opacity-75">Series Pips (Match Format Banner):</span>
                {([0, 3, 5, 7] as const).map((bo) => (
                  <button
                    key={bo}
                    type="button"
                    onClick={() => handleBestOfChange(bo)}
                    className={`px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${
                      bestOf === bo
                        ? 'bg-amber-500 text-black font-bold'
                        : 'border border-neutral-400/30 opacity-75'
                    }`}
                  >
                    {bo === 0 ? 'none' : `BO${bo}`}
                  </button>
                ))}
              </div>

              {bestOf > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleAddSeriesWin('left')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${myTeamBadgeClass}`}
                    title="Left side win indicator, Light up one from left to center Pip"
                  >
                    Left Win ({leftWins}/{winsNeededForBo}) →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddSeriesWin('right')}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${oppTeamBadgeClass}`}
                    title="Right side opponent wins a round, Light up one from right to center Pip"
                  >
                    ← Right Win ({rightWins}/{winsNeededForBo})
                  </button>
                </div>
              )}
            </div>
          </div>

          <HudChoreographySlotColumn />

          <HudChoreographyTopBandColumn />
        </div>
      </div>
    );
  }
);

HudChoreographyControlDeck.displayName = 'HudChoreographyControlDeck';
