import React from 'react';
import {
  Play,
  Square,
  Timer,
  Repeat,
  Radio,
  Users,
} from 'lucide-react';
import { TakeoverSignal } from '../../../ui-core/hud/TakeoverCountdownHUD';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { useTakeoverSyncedState } from './useTakeoverSyncedState';

export interface TakeoverSignalControlDeckProps {
  isLight: boolean;
  stopTakeoverSequence: () => void;
  startTakeoverSequence: (stepIntervalOverride?: number) => void;
}

export const TakeoverSignalControlDeck: React.FC<TakeoverSignalControlDeckProps> = ({
  isLight,
  stopTakeoverSequence,
  startTakeoverSequence,
}) => {
  const {
    myTeamSide,
    setMyTeamSide,
    showAnchorGuides,
    setShowAnchorGuides,
    timingConfig,
    setTimingConfig,
    activeSignal,
    setActiveSignal,
    isSequencePlaying,
    loopSequence,
    setLoopSequence,
    countdownStep,
    setCountdownStep,
    handleSetVisibleOnStage: setIsVisibleOnStage,
    setTriggerNonce,
    topLabelText,
    setTopLabelText,
    subCaptionText,
    setSubCaptionText,
  } = useTakeoverSyncedState();

  const handleDispatchSignal = (signal: TakeoverSignal) => {
    stopTakeoverSequence();
    setActiveSignal(signal);
    if (signal === 'replacing-in') {
      setIsVisibleOnStage(true);
      setTriggerNonce((n) => n + 1);
    } else {
      setIsVisibleOnStage(false);
    }
  };
  return (
    <>
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="amber" size="sm" isLight={isLight}>
            5G-1
          </Badge>
          <h2 className="text-base font-bold tracking-tight">
            Takeover Stage (`anchor=&quot;bottom-center&quot;` + Upward Offset) - `replacing-in` Signal &amp; Seamless Vignette
          </h2>
          <Badge variant="primary" size="sm" isLight={isLight}>
            Top Regular: Team Color + Glowing Stroke
          </Badge>
          <Badge variant="success" size="sm" isLight={isLight}>
            No Force Uppercase (`Takeover in...`)
          </Badge>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setMyTeamSide((prev) => (prev === 'blue' ? 'orange' : 'blue'))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-bold border cursor-pointer transition-all ${
              myTeamSide === 'blue'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-orange-600 text-white border-orange-500'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>
              Team Side: {myTeamSide === 'blue' ? 'Blue Team [1-3]' : 'Orange Team [1-3]'}
            </span>
          </button>
          <ToggleSwitch
            label="Anchor Guide Crosshair"
            checked={showAnchorGuides}
            onCheckedChange={setShowAnchorGuides}
            isLight={isLight}
          />
          <ToggleSwitch
            label="Persistent Tuning (Do Not Auto-Dismiss)"
            checked={timingConfig.persistentInspect ?? false}
            onCheckedChange={(v) => {
              setTimingConfig((prev) => ({ ...prev, persistentInspect: v }));
              setIsVisibleOnStage(true);
              setTriggerNonce((n) => n + 1);
            }}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Signal Bus & Sequence Control Deck */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col gap-3.5 ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200/90'
            : 'bg-neutral-950/70 border-neutral-800'
        }`}
      >
        {/* Row 1: Signal Bus Switcher & Sequence Play Button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-rose-500 flex items-center gap-1">
              <Radio className="h-3.5 w-3.5" />
              <span>Takeover Signal Bus:</span>
            </span>
            <SegmentedSwitch
              size="sm"
              isLight={isLight}
              value={activeSignal}
              onValueChange={(v) => handleDispatchSignal(v as TakeoverSignal)}
              options={[
                {
                  value: 'replacing-in',
                  label: '1. Signal: replacing-in (Hide Cockpit HUD + Vignette + 3-2-1)',
                },
                {
                  value: 'takeover-complete',
                  label: '2. Signal: takeover-complete (Slide In BallCam / Speed / Flip / Boost)',
                },
              ]}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                isSequencePlaying ? stopTakeoverSequence() : startTakeoverSequence()
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
                  <span>Stop Takeover Sequence</span>
                </>
              ) : (
                <>
                  <Timer className="h-3.5 w-3.5" />
                  <span>
                    Play Full Takeover: replacing-in (3 -&gt; 2 -&gt; 1) -&gt; Deploy Cockpit HUD
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
          </div>
        </div>

        {/* Row 2: Single-step digit inspection & Top Regular text input */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-200/70 dark:border-neutral-800/80">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono opacity-75">
              Single-step bottom digit trigger (Top Regular stays motionless):
            </span>
            {(['3', '2', '1'] as const).map((step) => {
              const active = countdownStep === step && activeSignal === 'replacing-in';
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    stopTakeoverSequence();
                    setActiveSignal('replacing-in');
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
                  Step {step}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setActiveSignal('replacing-in');
                setIsVisibleOnStage(true);
                setTriggerNonce((n) => n + 1);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border border-amber-500/40 cursor-pointer transition-all"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>Re-Trigger Bottom Scale ({timingConfig.entryScale.toFixed(2)}x)</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-mono">
              <span className="opacity-70">Top Regular (400, Stationary):</span>
              <input
                type="text"
                value={topLabelText}
                onChange={(e) => {
                  setTopLabelText(e.target.value);
                  setIsVisibleOnStage(true);
                }}
                className={`w-36 px-2 py-1 rounded-lg border font-mono text-xs ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                }`}
              />
            </label>

            <label className="flex items-center gap-1.5 text-xs font-mono">
              <span className="opacity-70">Sub-caption (Optional):</span>
              <input
                type="text"
                value={subCaptionText}
                placeholder="Optional pill"
                onChange={(e) => {
                  setSubCaptionText(e.target.value);
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
      </div>
    </>
  );
};
