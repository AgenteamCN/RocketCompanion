import React from 'react';
import {
  Tv, UserCheck, Play, Video,
  ArrowLeftRight,
  CheckSquare, Square,
} from 'lucide-react';
import { ReplaySkipCheckSvg } from '../../../ui-core/primitives/svg/packagedSvgDefinitions';
import { useHudChoreographySandbox } from './HudChoreographySandboxContext';
import { HudChoreographyDemoAndPovControls } from './HudChoreographyTopBandColumn';

export const HudChoreographySlotColumn: React.FC = () => {
  const {
    myTeamSide,
    handleToggleTeamSide,
    viewMode,
    handleModeChange,
    slotExists,
    handleToggleSlotExists,
    replaySkipReady,
    handleToggleReplaySkipReady,
    skipIndicatorConfig,
    onUpdateSkipIndicatorConfig,
    handleApplyTeamSizePreset,
  } = useHudChoreographySandbox();

  const isMyTeamOrange = myTeamSide === 'orange';

  return (
    <div className="flex flex-col gap-2 pr-0 lg:pr-3 lg:border-r border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <span className="text-xs font-bold font-mono flex items-center gap-1.5">
          <Tv className="h-3.5 w-3.5 text-sky-500" />
          <span>2. Player Bar (internal1-3 / Peer4-6) &amp; Faction/Player Count</span>
        </span>

        {/* Switch Side Button */}
        <button type="button" onClick={handleToggleTeamSide}
          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold cursor-pointer flex items-center gap-1 transition-all shadow-2xs ${
          isMyTeamOrange ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white' }`}
          title="Toggle friendly team color (Switch Side): Player always on the left 1-2-3, Opponent always on the right 4-5-6">
          <ArrowLeftRight className="h-3 w-3" />
          <span>Switch Side: internal{isMyTeamOrange ? 'Orange Team(1-3)' : 'Blue Team(1-3)'}</span>
        </button>
      </div>

      {/* View Mode Switcher */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => handleModeChange('player-live')}
          className={`px-2 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
            viewMode === 'player-live'
              ? 'bg-blue-600 text-white font-bold shadow-xs'
              : 'border border-neutral-400/40 hover:bg-neutral-500/10'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5 inline mr-1" />
          Player Live (hidden1-3Key Hint &amp; 4-6)
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('goal-replay')}
          className={`px-2 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
            viewMode === 'goal-replay'
              ? 'bg-amber-500 text-neutral-950 font-bold shadow-xs'
              : 'border border-neutral-400/40 hover:bg-neutral-500/10'
          }`}
        >
          <Play className="h-3.5 w-3.5 inline mr-1" />
          Goal Replay (Visible1-6)
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('spectator')}
          className={`px-2 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
            viewMode === 'spectator'
              ? 'bg-purple-600 text-white font-bold shadow-xs'
              : 'border border-neutral-400/40 hover:bg-neutral-500/10'
          }`}
        >
          <Video className="h-3.5 w-3.5 inline mr-1" />
          Spectator (Spectate1-6)
        </button>
      </div>

      {/* 6 Checkboxes for Player Exist (My Team 1-2-3 & Opponent Team 4-5-6) + Quick Format Presets */}
      <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-white/50 dark:bg-neutral-950/40 text-xs font-mono">
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <span className="text-[10px] opacity-75">Player Exist (Home (Left) 1-3 · Away (Right) 4-6):</span>
          <div className="flex items-center gap-1">
            {(
              [
                { label: '1v1', l: 1, r: 1 },
                { label: '2v2', l: 2, r: 2 },
                { label: '1v3', l: 1, r: 3 },
                { label: '2v1', l: 2, r: 1 },
                { label: '3v3', l: 3, r: 3 },
              ] as const
            ).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleApplyTeamSizePreset(preset.l, preset.r)}
                className="px-1.5 py-0.2 rounded text-[10px] border border-neutral-400/40 hover:bg-neutral-500/15 cursor-pointer"
                title={`Quick match player count ${preset.label}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* My Team 1-3 Checkboxes */}
          <div className="flex items-center gap-1">
            <span className={`text-[10px] font-bold px-1 rounded ${
              isMyTeamOrange ? 'text-orange-500' : 'text-blue-500' }`}>
              internal:
            </span>
            {([1, 2, 3] as const).map((k) => {
              const checked = slotExists[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleToggleSlotExists(k)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer border transition-all ${
                    checked
                      ? isMyTeamOrange
                        ? 'bg-orange-500/15 border-orange-500/60 text-orange-600 dark:text-orange-400'
                        : 'bg-blue-500/15 border-blue-500/60 text-blue-600 dark:text-blue-400'
                      : 'border-neutral-400/30 opacity-45'
                  }`}
                >
                  {checked ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                  <span>#{k}</span>
                </button>
              );
            })}
          </div>

          {/* Opponent Team 4-6 Checkboxes */}
          <div className="flex items-center gap-1">
            <span className={`text-[10px] font-bold px-1 rounded ${
              isMyTeamOrange ? 'text-blue-500' : 'text-orange-500' }`}>
              Peer:
            </span>
            {([4, 5, 6] as const).map((k) => {
              const checked = slotExists[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleToggleSlotExists(k)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer border transition-all ${
                    checked
                      ? isMyTeamOrange
                        ? 'bg-blue-500/15 border-blue-500/60 text-blue-600 dark:text-blue-400'
                        : 'bg-orange-500/15 border-orange-500/60 text-orange-600 dark:text-orange-400'
                      : 'border-neutral-400/30 opacity-45'
                  }`}
                >
                  {checked ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                  <span>#{k}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 6 Checkboxes for Skip Replay / Ready (Half-Rounded Check Card) */}
        <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
              <ReplaySkipCheckSvg
                variant={skipIndicatorConfig.variant}
                size={Math.min(16, Math.max(11, skipIndicatorConfig.sizePx || 16))}
                color={skipIndicatorConfig.color}
                strokeWidth={skipIndicatorConfig.strokeWidth}
                glowColor={skipIndicatorConfig.glowColor}
                glowBlurPx={skipIndicatorConfig.glowBlurPx}
                glowIntensityPct={skipIndicatorConfig.glowIntensityPct}
              />
              <span>Skip Replay / Ready (Under-Card Push Drawer):</span>
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {([1, 2, 3, 4, 5, 6] as const).map((k) => {
                const checked = Boolean(replaySkipReady?.[k]);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleToggleReplaySkipReady(k)}
                    title={`Toggle Skip Goal Replay / Ready indicator for Player #${k}`}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer border transition-all ${
                      checked
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-2xs'
                        : 'border-neutral-400/30 opacity-55 hover:opacity-100'
                    }`}
                  >
                    {checked ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                    <span>#{k}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
            <label
              className="flex items-center gap-1"
              title="Adjust Skip Icon SVG size (10px ~ 32px, default 24px)"
              data-tuner-label="5A.S Skip Icon Size"
              data-tuner-value={String(skipIndicatorConfig.sizePx)}
            >
              <span className="opacity-75">size:</span>
              <input type="range" min={10} max={32} step={1} value={skipIndicatorConfig.sizePx}
                onChange={(e) => onUpdateSkipIndicatorConfig({ sizePx: Number(e.target.value) })}
                className="w-11 accent-emerald-500 cursor-pointer" />
              <span className="tabular-nums font-bold">{skipIndicatorConfig.sizePx}px</span>
            </label>
            <label
              className="flex items-center gap-1"
              data-tuner-label="5A.S Skip Icon Weight"
              data-tuner-value={String(skipIndicatorConfig.strokeWidth)}
            >
              <span className="opacity-75">weight:</span>
              <input type="range" min={1.0} max={3.8} step={0.1} value={skipIndicatorConfig.strokeWidth}
                onChange={(e) => onUpdateSkipIndicatorConfig({ strokeWidth: Number(e.target.value) })}
                className="w-11 accent-emerald-500 cursor-pointer" />
              <span className="tabular-nums font-bold">{skipIndicatorConfig.strokeWidth.toFixed(1)}</span>
            </label>
            <label
              className="flex items-center gap-1"
              data-tuner-label="5A.S Skip Glow Blur"
              data-tuner-value={String(skipIndicatorConfig.glowBlurPx)}
            >
              <span className="opacity-75">Glow:</span>
              <input type="range" min={0} max={16} step={1} value={skipIndicatorConfig.glowBlurPx}
                onChange={(e) => onUpdateSkipIndicatorConfig({ glowBlurPx: Number(e.target.value) })}
                className="w-10 accent-emerald-500 cursor-pointer" />
              <span className="tabular-nums font-bold">{skipIndicatorConfig.glowBlurPx}px</span>
            </label>
            <label
              className="flex items-center gap-1"
              title="Protrude length past player card (24px ~ 64px)"
              data-tuner-label="5A.S Skip Protrude Width"
              data-tuner-value={String(skipIndicatorConfig.protrudeWidthPx)}
            >
              <span className="opacity-75">ext:</span>
              <input type="range" min={24} max={64} step={1} value={skipIndicatorConfig.protrudeWidthPx}
                onChange={(e) => onUpdateSkipIndicatorConfig({ protrudeWidthPx: Number(e.target.value) })}
                className="w-10 accent-emerald-500 cursor-pointer" />
              <span className="tabular-nums font-bold">{skipIndicatorConfig.protrudeWidthPx}px</span>
            </label>
            <div className="flex items-center gap-1">
              {(['#22C55E', '#10B981', '#84CC16', '#38BDF8', '#FFFFFF'] as const).map((hex, i) => (
                <button key={hex} type="button" onClick={() => onUpdateSkipIndicatorConfig({ color: hex, glowColor: hex })}
                  title={`#${i + 1} Color & Glow: ${hex}`}
                  className={`w-3.5 h-3.5 rounded-full cursor-pointer border transition-transform ${
                    skipIndicatorConfig.color.toUpperCase() === hex ? 'scale-125 border-white ring-1 ring-emerald-500' : 'border-black/30 opacity-80 hover:opacity-100'
                  }`} style={{ backgroundColor: hex }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <HudChoreographyDemoAndPovControls />
    </div>
  );
};
