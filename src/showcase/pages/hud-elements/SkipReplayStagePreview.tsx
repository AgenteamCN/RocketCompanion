import React from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  Play,
  SkipForward,
} from 'lucide-react';
import { EdgePlayerHudStrip } from '../../../ui-core/hud/EdgePlayerHudStrip';
import {
  type EdgeSkipIndicatorConfig,
  type EdgePlayerSlotState,
  type HudRosterViewMode,
} from '../../../ui-core/stores/hudTransientTypes';
import { ReplaySkipCheckSvg } from '../../../ui-core/primitives/svg/packagedSvgDefinitions';

export interface SkipReplayStagePreviewProps {
  isLight: boolean;
  viewMode: HudRosterViewMode;
  skipCfg: Required<EdgeSkipIndicatorConfig>;
  leftPlayers: EdgePlayerSlotState[];
  rightPlayers: EdgePlayerSlotState[];
  copiedJson: boolean;
  handleSimulateGoalReplayStart: () => void;
  handleSimulateKickoffWillStart: () => void;
  setAllSlotsSkip: (active: boolean) => void;
  toggleSlotSkip: (k: 1 | 2 | 3 | 4 | 5 | 6) => void;
  handleCopyConfigJson: () => void;
}

export const SkipReplayStagePreview: React.FC<SkipReplayStagePreviewProps> = React.memo(
  ({
    isLight,
    viewMode,
    skipCfg,
    leftPlayers,
    rightPlayers,
    copiedJson,
    handleSimulateGoalReplayStart,
    handleSimulateKickoffWillStart,
    setAllSlotsSkip,
    toggleSlotSkip,
    handleCopyConfigJson,
  }) => {
    const innerLine = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)';
    const outerRing = isLight ? 'rgba(115, 115, 115, 0.32)' : 'rgba(113, 113, 122, 0.55)';

    return (
      <div
        className={`lg:col-span-5 p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all ${
          isLight
            ? 'bg-slate-200/80 border-neutral-300 shadow-inner'
            : 'bg-neutral-950 border-neutral-800/90 shadow-inner'
        }`}
      >
        <div className="flex items-center justify-between text-[11px] font-mono flex-wrap gap-2">
          <span className="font-bold text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Extension Drawer Stage ({viewMode})</span>
          </span>
          <span className="opacity-75">
            protrude: <strong>{skipCfg.protrudeWidthPx}px</strong> · tuck:{' '}
            <strong>-{skipCfg.underlapPx}px</strong> · exit: <strong>{skipCfg.exitDurationMs}ms</strong>
          </span>
        </div>

        {/* Quick Choreography Transition & Batch Action Bar */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap font-mono text-[10px]">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={handleSimulateGoalReplayStart}
              title="Switch to goal-replay (1-3 extend 28px inward) and activate Skip Replay cards"
              className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center gap-1 font-bold transition-all ${
                viewMode === 'goal-replay'
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-2xs'
                  : isLight
                  ? 'bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-100'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <Play className="h-3 w-3" />
              <span>1. Goal Replay (Extend)</span>
            </button>
            <button
              type="button"
              onClick={handleSimulateKickoffWillStart}
              title="Dispatch kickoff-will-start: 1-3 retract 28px (300ms) while Skip cards retract faster & reset"
              className={`px-2 py-1 rounded-lg border cursor-pointer flex items-center gap-1 font-bold transition-all ${
                viewMode === 'player-live'
                  ? 'bg-sky-500 text-neutral-950 border-sky-400 shadow-2xs'
                  : isLight
                  ? 'bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-100'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <SkipForward className="h-3 w-3" />
              <span>2. Kickoff Start (Retract + Reset)</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAllSlotsSkip(true)}
              className="px-2 py-1 rounded-lg border border-emerald-500/50 text-emerald-500 font-bold cursor-pointer hover:bg-emerald-500/10"
            >
              Push All Out
            </button>
            <button
              type="button"
              onClick={() => setAllSlotsSkip(false)}
              className="px-2 py-1 rounded-lg border border-neutral-400/40 opacity-80 hover:opacity-100 cursor-pointer"
            >
              Retract All
            </button>
          </div>
        </div>

        {/* Dual-side Strip Preview Stage */}
        <div className="relative h-[168px] rounded-2xl border border-black/15 dark:border-white/10 bg-black/20 overflow-hidden flex items-center justify-between py-2">
          <EdgePlayerHudStrip
            side="left"
            teamColor="#2563EB"
            barColor="#3B82F6"
            isLight={isLight}
            viewMode={viewMode}
            players={leftPlayers}
            skipIndicatorConfig={skipCfg}
            onSelectSlot={toggleSlotSkip}
          />
          <EdgePlayerHudStrip
            side="right"
            teamColor="#EA580C"
            barColor="#F97316"
            isLight={isLight}
            viewMode={viewMode}
            players={rightPlayers}
            skipIndicatorConfig={skipCfg}
            onSelectSlot={toggleSlotSkip}
          />
        </div>

        {/* Close-up Isolated Under-Card Seam & 2x Icon Specimen */}
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 flex-wrap ${
            isLight
              ? 'bg-white/90 border-neutral-200/90 text-neutral-800'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-200'
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-mono font-bold">
              Under-Card Border Tuck & Icon Close-up (1:1 & 1.4x)
            </span>
            <span className="text-[10px] font-mono opacity-65">
              Left border extends {skipCfg.underlapPx}px beneath player card (z-10 under z-20)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 1:1 Actual Seam Specimen */}
            <div className="flex items-center">
              <div
                className="relative z-20 h-[37px] px-3 rounded-r-[9px] flex items-center font-mono text-[11px] text-white font-semibold select-none"
                style={{
                  backgroundColor: '#2563EB',
                  boxShadow:
                    '0 0 0 2px rgba(37, 99, 235, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.32)',
                }}
              >
                Card
              </div>
              <div
                className="relative z-10 flex items-center"
                style={{
                  marginLeft: `-${skipCfg.underlapPx}px`,
                  clipPath: 'inset(-4px -18px -4px 0px)',
                }}
              >
                <div
                  className="h-[37px] flex items-center justify-center"
                  style={{
                    width: `${skipCfg.underlapPx + skipCfg.protrudeWidthPx}px`,
                    paddingLeft: `${skipCfg.underlapPx}px`,
                    borderRadius: `0px ${skipCfg.cardRadiusPx}px ${skipCfg.cardRadiusPx}px 0px`,
                    backgroundColor: isLight
                      ? 'rgba(255, 255, 255, 0.98)'
                      : 'rgba(20, 20, 25, 0.98)',
                    boxShadow: `0 0 0 1.5px ${outerRing}, inset -1px 0 0 0 ${innerLine}, inset 0 1px 0 0 ${innerLine}, inset 0 -1px 0 0 ${innerLine}`,
                  }}
                >
                  <ReplaySkipCheckSvg
                    variant={skipCfg.variant}
                    size={skipCfg.sizePx}
                    color={skipCfg.color}
                    strokeWidth={skipCfg.strokeWidth}
                    glowColor={skipCfg.glowColor}
                    glowBlurPx={skipCfg.glowBlurPx}
                    glowIntensityPct={skipCfg.glowIntensityPct}
                    style={{
                      transform:
                        skipCfg.iconOffsetXPx !== 0 || skipCfg.iconOffsetYPx !== 0
                          ? `translate3d(${skipCfg.iconOffsetXPx}px, ${skipCfg.iconOffsetYPx}px, 0)`
                          : undefined,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Zoomed Specimen */}
            <div
              className="w-11 h-11 rounded-xl bg-[#18181B] border border-white/10 flex items-center justify-center shrink-0"
              title="Zoomed SVG Icon Inspection"
            >
              <ReplaySkipCheckSvg
                variant={skipCfg.variant}
                size={Math.min(34, Math.round(skipCfg.sizePx * 1.25))}
                color={skipCfg.color}
                strokeWidth={skipCfg.strokeWidth}
                glowColor={skipCfg.glowColor}
                glowBlurPx={skipCfg.glowBlurPx}
                glowIntensityPct={skipCfg.glowIntensityPct}
                style={{
                  transform:
                    skipCfg.iconOffsetXPx !== 0 || skipCfg.iconOffsetYPx !== 0
                      ? `translate3d(${skipCfg.iconOffsetXPx}px, ${skipCfg.iconOffsetYPx}px, 0)`
                      : undefined,
                }}
              />
            </div>
          </div>
        </div>

        {/* Copyable Parameter Readout Box */}
        <div
          className={`p-3 rounded-2xl border font-mono text-[10px] flex flex-col gap-1.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
              : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-emerald-500">
              Export / Copy Current Parameters:
            </span>
            <button
              type="button"
              onClick={handleCopyConfigJson}
              className="px-2.5 py-0.5 rounded-lg bg-emerald-500 text-neutral-950 font-bold cursor-pointer hover:bg-emerald-400 flex items-center gap-1 transition-colors"
            >
              {copiedJson ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedJson ? 'Copied JSON!' : 'Copy Parameters JSON'}</span>
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all leading-relaxed opacity-85 select-all">
            {[
              `color: "${skipCfg.color}" | sizePx: ${skipCfg.sizePx} | weight: ${skipCfg.strokeWidth.toFixed(1)}`,
              `glow: ${skipCfg.glowBlurPx}px (${skipCfg.glowIntensityPct}%) | protrude: ${skipCfg.protrudeWidthPx}px`,
              `underlap: ${skipCfg.underlapPx}px | radius: ${skipCfg.cardRadiusPx}px`,
              `offsetX: ${skipCfg.iconOffsetXPx}px | offsetY: ${skipCfg.iconOffsetYPx}px`,
              `enter: ${skipCfg.enterDurationMs}ms | exit: ${skipCfg.exitDurationMs}ms | variant: "${skipCfg.variant}"`,
            ].join(' | ')}
          </pre>
        </div>
      </div>
    );
  }
);

SkipReplayStagePreview.displayName = 'SkipReplayStagePreview';
