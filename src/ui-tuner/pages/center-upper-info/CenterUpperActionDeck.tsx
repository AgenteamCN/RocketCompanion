import React, { useState, useCallback } from 'react';
import { Sparkles, Play, Square, Trophy, Timer, Repeat, Palette } from 'lucide-react';
import {
  CenterUpperInfoVariant,
  WinnerTeamPreset,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { CenterUpperBlueTeamColorMenu } from './CenterUpperBlueTeamColorMenu';
import { CenterUpperAnnouncementControls } from './CenterUpperAnnouncementControls';
import { type CustomAnnouncementPreset } from './CenterUpperStageBackdropBar';
import { useCenterUpperSyncedState } from './useCenterUpperSyncedState';

export interface CenterUpperActionDeckProps {
  isLight: boolean;
  handleSelectVariant: (variant: CenterUpperInfoVariant) => void;
  stopCountdownSequence: () => void;
  startCountdownSequence: (stepIntervalOverride?: number) => void;
  handleSelectWinnerTeam: (team: WinnerTeamPreset) => void;
  handleActivateBlueWinnerPreview: () => void;
  handleApplyCustomPreset: (preset: CustomAnnouncementPreset) => void;
}

export const CenterUpperActionDeck: React.FC<CenterUpperActionDeckProps> = ({
  isLight,
  handleSelectVariant,
  stopCountdownSequence,
  startCountdownSequence,
  handleSelectWinnerTeam,
  handleActivateBlueWinnerPreview,
  handleApplyCustomPreset,
}) => {
  const {
    activeVariant,
    countdownStep,
    setCountdownStep,
    goLabelText,
    setGoLabelText,
    countdownIntervalMs,
    isSequencePlaying,
    loopSequence,
    setLoopSequence,
    winnerTeam,
    winnerTopText,
    setWinnerTopText,
    winnerMainText,
    setWinnerMainText,
    winnerBlueConfig,
    setWinnerBlueConfig,
    timingConfig,
    setTriggerNonce,
    setIsVisibleOnStage,
    build5EExportCode,
  } = useCenterUpperSyncedState();

  const [showWinnerBlueMenu, setShowWinnerBlueMenu] = useState<boolean>(true);
  const [copied5EConfig, setCopied5EConfig] = useState<boolean>(false);

  const handleCopy5EConfig = useCallback(() => {
    const code = build5EExportCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied5EConfig(true);
    window.setTimeout(() => setCopied5EConfig(false), 1800);
  }, [build5EExportCode]);

  return (
    <div
      className={`p-3.5 rounded-2xl border flex flex-col gap-3.5 ${
        isLight
          ? 'bg-neutral-50/90 border-neutral-200/90'
          : 'bg-neutral-950/70 border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Archetype Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-amber-500 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Critical Alert Type (Toggle Text Only, Do not change bottom params):</span>
          </span>
          <SegmentedSwitch
            size="sm"
            isLight={isLight}
            value={activeVariant}
            onValueChange={(v) => handleSelectVariant(v as CenterUpperInfoVariant)}
            options={[
              { value: 'countdown', label: '1. 3-2-1-GO Countdown' },
              { value: 'winner', label: '2. WINNER Battle Result' },
              { value: 'announcement', label: '3. Custom Announcement' },
            ]}
          />
        </div>
        {/* Replay Trigger Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsVisibleOnStage(true);
              setTriggerNonce((n) => n + 1);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 cursor-pointer transition-all shadow-xs active:scale-95"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>
              Trigger Entry Impact ({timingConfig.entryScale.toFixed(2)}x ·{' '}
              {timingConfig.entryDurationMs}ms Entry · {timingConfig.durationMs}ms After{' '}
              {timingConfig.exitDurationMs}ms fade out)
            </span>
          </button>
        </div>
      </div>

      {/* Context-Sensitive Sub-Controls per Archetype */}
      {activeVariant === 'countdown' && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-200/70 dark:border-neutral-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                isSequencePlaying ? stopCountdownSequence() : startCountdownSequence()
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer transition-all ${
                isSequencePlaying
                  ? 'bg-rose-500 text-white border-rose-400 shadow-sm'
                  : 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-sm hover:bg-emerald-400'
              }`}
            >
              {isSequencePlaying ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop countdown sequence (Stop)</span>
                </>
              ) : (
                <>
                  <Timer className="h-3.5 w-3.5" />
                  <span>
                    Play Sequence: 3 -&gt; 2 -&gt; 1 -&gt; {goLabelText} ({countdownIntervalMs}ms
                    step · {timingConfig.durationMs}ms flash)
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLoopSequence((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono border cursor-pointer transition-all ${
                loopSequence
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-500 font-bold'
                  : isLight
                  ? 'bg-white border-neutral-300 text-neutral-600'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
              <span>Loop: {loopSequence ? 'ON' : 'OFF'}</span>
            </button>
            <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-800 mx-1" />
            <span className="text-[11px] font-mono opacity-70">Single-step trigger override:</span>
            {(['3', '2', '1', 'GO'] as const).map((step) => {
              const active = countdownStep === step;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    stopCountdownSequence();
                    setCountdownStep(step);
                    setIsVisibleOnStage(true);
                    setTriggerNonce((n) => n + 1);
                  }}
                  className={`px-3 py-1 rounded-lg font-mono text-xs font-bold border cursor-pointer transition-all ${
                    active
                      ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-xs'
                      : isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                  }`}
                >
                  {step === 'GO' ? goLabelText : step}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono opacity-75">GO text:</span>
            <SegmentedSwitch
              size="sm"
              isLight={isLight}
              value={goLabelText}
              onValueChange={(v) => {
                setGoLabelText(v);
                setIsVisibleOnStage(true);
                setTriggerNonce((n) => n + 1);
              }}
              options={[
                { value: 'GO', label: 'GO' },
                { value: 'GO!', label: 'GO!' },
              ]}
            />
          </div>
        </div>
      )}

      {activeVariant === 'winner' && (
        <div className="flex flex-col gap-3 pt-2 border-t border-neutral-200/70 dark:border-neutral-800/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold flex items-center gap-1 text-sky-500">
                <Trophy className="h-3.5 w-3.5" />
                <span>Winning Team Preset (`WINNER` Top Color Unchanged):</span>
              </span>
              <button
                type="button"
                onClick={() => handleSelectWinnerTeam('blue')}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer transition-all ${
                  winnerTeam === 'blue'
                    ? 'bg-sky-500 text-neutral-950 border-sky-400 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-sky-50 border-neutral-300 text-sky-700'
                    : 'bg-neutral-900 hover:bg-sky-950/40 border-neutral-700 text-sky-400'
                }`}
              >
                WINNER · BLUE TEAM ({winnerBlueConfig.textColor})
              </button>
              <button
                type="button"
                onClick={() => handleSelectWinnerTeam('orange')}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer transition-all ${
                  winnerTeam === 'orange'
                    ? 'bg-orange-500 text-neutral-950 border-orange-400 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-orange-50 border-neutral-300 text-orange-700'
                    : 'bg-neutral-900 hover:bg-orange-950/40 border-neutral-700 text-orange-400'
                }`}
              >
                WINNER · ORANGE TEAM (Orange Team Wins)
              </button>
              <button
                type="button"
                onClick={() => handleSelectWinnerTeam('custom')}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer transition-all ${
                  winnerTeam === 'custom'
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-amber-50 border-neutral-300 text-amber-700'
                    : 'bg-neutral-900 hover:bg-amber-950/40 border-neutral-700 text-amber-400'
                }`}
              >
                WINNER · CHAMPIONS
              </button>
              <button
                type="button"
                onClick={() => setShowWinnerBlueMenu((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono border cursor-pointer transition-all ${
                  showWinnerBlueMenu
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-400 font-bold'
                    : isLight
                    ? 'bg-white border-neutral-300 text-neutral-700'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                <span>
                  {showWinnerBlueMenu ? 'Hide Blue Team RGB Menu' : 'Blue Team RGB Menu'}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs font-mono">
                <span className="opacity-70">Top Regular(400):</span>
                <input
                  type="text"
                  value={winnerTopText}
                  onChange={(e) => {
                    setWinnerTopText(e.target.value);
                    setIsVisibleOnStage(true);
                  }}
                  className={`w-28 px-2 py-1 rounded-lg border font-mono text-xs ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                  }`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-mono">
                <span className="opacity-70">Bottom Thin(100):</span>
                <input
                  type="text"
                  value={winnerMainText}
                  onChange={(e) => {
                    setWinnerMainText(e.target.value);
                    setIsVisibleOnStage(true);
                  }}
                  className={`w-36 px-2 py-1 rounded-lg border font-mono text-xs ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                  }`}
                />
              </label>
            </div>
          </div>
          {showWinnerBlueMenu && (
            <CenterUpperBlueTeamColorMenu
              isLight={isLight}
              winnerBlueConfig={winnerBlueConfig}
              setWinnerBlueConfig={setWinnerBlueConfig}
              onActivateBlueWinnerPreview={handleActivateBlueWinnerPreview}
              copied5EConfig={copied5EConfig}
              handleCopy5EConfig={handleCopy5EConfig}
            />
          )}
        </div>
      )}

      {activeVariant === 'announcement' && (
        <CenterUpperAnnouncementControls
          isLight={isLight}
          handleApplyCustomPreset={handleApplyCustomPreset}
        />
      )}
    </div>
  );
};
