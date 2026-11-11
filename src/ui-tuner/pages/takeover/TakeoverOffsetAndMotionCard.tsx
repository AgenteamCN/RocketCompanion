import React from 'react';
import { RotateCcw, Timer, Layers } from 'lucide-react';
import { CenterUpperTimingConfig } from '../../../ui-core/hud/CenterUpperInfoHUD';
import { DEFAULT_TAKEOVER_TIMING, DEFAULT_TAKEOVER_LAYOUT } from '../../../ui-core/hud/takeoverCountdownDefaults';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';

export interface TakeoverOffsetAndMotionCardProps {
  isLight: boolean;
  bottomOffsetPx: number;
  setBottomOffsetPx: (val: number | ((prev: number) => number)) => void;
  timingConfig: CenterUpperTimingConfig;
  setTimingConfig: (
    val:
      | CenterUpperTimingConfig
      | ((prev: CenterUpperTimingConfig) => CenterUpperTimingConfig)
  ) => void;
  countdownIntervalMs: number;
  setCountdownIntervalMs: (val: number | ((prev: number) => number)) => void;
  setIsVisibleOnStage: (val: boolean | ((prev: boolean) => boolean)) => void;
  setTriggerNonce: (val: number | ((prev: number) => number)) => void;
}

export const TakeoverOffsetAndMotionCard: React.FC<
  TakeoverOffsetAndMotionCardProps
> = ({
  isLight,
  bottomOffsetPx,
  setBottomOffsetPx,
  timingConfig,
  setTimingConfig,
  countdownIntervalMs,
  setCountdownIntervalMs,
  setIsVisibleOnStage,
  setTriggerNonce,
}) => {
  return (
    <div
      className={`p-5 rounded-3xl border flex flex-col gap-4 ${
        isLight
          ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
          : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold font-mono">
            2. Bottom-Center Upward Offset &amp; Bottom-Only Scale Motion
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setBottomOffsetPx(DEFAULT_TAKEOVER_LAYOUT.bottomOffsetPx);
            setTimingConfig((prev) => ({
              ...DEFAULT_TAKEOVER_TIMING,
              persistentInspect: prev.persistentInspect,
            }));
            setCountdownIntervalMs(1000);
            setIsVisibleOnStage(true);
            setTriggerNonce((n) => n + 1);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Default Offset &amp; Timing</span>
        </button>
      </div>

      <div className="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col gap-2">
        <span className="text-xs font-mono font-bold text-emerald-500">
          Anchor Reference: Bottom-Center Upward Offset (`anchor=&quot;bottom-center&quot;`, Default 0px)
        </span>
        <SliderControl
          label="Upward Offset from Bottom-Center (Bottom Offset px)"
          description="Strictly anchored to bottom-center and shifted upward (NOT global center)"
          value={bottomOffsetPx}
          min={0}
          max={280}
          step={2}
          unit="px"
          editable
          allowOutOfBoundsInput
          colorScheme="amber"
          onChange={(v) => {
            setBottomOffsetPx(v);
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Timer className="h-4 w-4 text-sky-500" />
        <span className="text-xs font-bold font-mono">
          Bottom `3 -&gt; 2 -&gt; 1` Scale Pop Envelope (Top `Takeover in...` Never Moves)
        </span>
      </div>

      <SliderControl
        label="Bottom Digit Scale Pop Multiplier (Entry Scale)"
        description="Applies ONLY to the bottom Thin countdown digit (3, 2, 1); Top Regular label stays 1.0x stationary"
        value={timingConfig.entryScale}
        min={1.0}
        max={2.4}
        step={0.01}
        unit="x"
        editable
        allowOutOfBoundsInput
        formatValue={(v) => v.toFixed(2)}
        onChange={(v) => {
          setTimingConfig((prev) => ({
            ...prev,
            entryScale: Number(v.toFixed(2)),
          }));
          setIsVisibleOnStage(true);
          setTriggerNonce((n) => n + 1);
        }}
        isLight={isLight}
      />

      <SliderControl
        label="Entry Scale Collapse Duration (Entry Duration)"
        description="Default 380ms cubic-bezier(0.16, 1, 0.3, 1) collapse from entryScale to 1.00x"
        value={timingConfig.entryDurationMs}
        min={50}
        max={900}
        step={10}
        unit="ms"
        editable
        allowOutOfBoundsInput
        onChange={(v) => {
          setTimingConfig((prev) => ({ ...prev, entryDurationMs: v }));
          setIsVisibleOnStage(true);
          setTriggerNonce((n) => n + 1);
        }}
        isLight={isLight}
      />

      <SliderControl
        label="3 -> 2 -> 1 Sequence Step Interval"
        description="Default 1000ms per countdown digit before Cockpit HUD deploys"
        value={countdownIntervalMs}
        min={300}
        max={2500}
        step={50}
        unit="ms"
        editable
        allowOutOfBoundsInput
        onChange={(v) => setCountdownIntervalMs(v)}
        isLight={isLight}
      />

      <div className="grid grid-cols-2 gap-3">
        <SliderControl
          label="Single Step Hold Duration"
          value={timingConfig.durationMs}
          min={200}
          max={3000}
          step={50}
          unit="ms"
          editable
          allowOutOfBoundsInput
          onChange={(v) => {
            setTimingConfig((prev) => ({ ...prev, durationMs: v }));
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
        <SliderControl
          label="Step Tail Fade-Out"
          value={timingConfig.exitDurationMs}
          min={0}
          max={800}
          step={10}
          unit="ms"
          editable
          allowOutOfBoundsInput
          onChange={(v) => {
            setTimingConfig((prev) => ({ ...prev, exitDurationMs: v }));
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
