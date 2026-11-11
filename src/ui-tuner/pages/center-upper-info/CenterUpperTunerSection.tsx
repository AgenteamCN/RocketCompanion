import React, { useState, useCallback } from 'react';
import { RotateCcw, Timer, Palette, Layers } from 'lucide-react';
import {
  DEFAULT_RL_COUNTDOWN_GLOW,
  DEFAULT_WINNER_BLUE_TEAM_CONFIG,
  DEFAULT_CENTER_UPPER_TIMING,
} from '../../../ui-core/hud/centerUpperInfoDefaults';
import type {
  CenterUpperGlowConfig,
  CenterUpperTimingConfig,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { ColorSwatchInput } from '../../components/tuner/ColorSwatchInput';
import { TunerConfigExporterBar } from '../../components/tuner/TunerConfigExporterBar';
import { RL_GLOW_SWATCHES } from './CenterUpperStageBackdropBar';
import { CenterUpperBlueTeamColorMenu } from './CenterUpperBlueTeamColorMenu';
import { CenterUpperTypographyCard } from './CenterUpperTypographyCard';
import { useCenterUpperSyncedState } from './useCenterUpperSyncedState';

export interface CenterUpperTunerSectionProps {
  isLight: boolean;
  onActivateBlueWinnerPreview: () => void;
}

export const CenterUpperTunerSection: React.FC<CenterUpperTunerSectionProps> = ({
  isLight,
  onActivateBlueWinnerPreview,
}) => {
  const {
    glowConfig,
    setGlowConfig,
    winnerBlueConfig,
    setWinnerBlueConfig,
    syncGlowWithText,
    setSyncGlowWithText,
    timingConfig,
    setTimingConfig,
    countdownIntervalMs,
    setCountdownIntervalMs,
    upperCenterTopPct,
    setUpperCenterTopPct,
    setIsVisibleOnStage,
    setTriggerNonce,
    build5EExportCode,
    handleReset5EDefaults,
  } = useCenterUpperSyncedState();

  const [copied5EConfig, setCopied5EConfig] = useState<boolean>(false);

  const handleCopy5EConfig = useCallback(() => {
    const code = build5EExportCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied5EConfig(true);
    window.setTimeout(() => setCopied5EConfig(false), 1800);
  }, [build5EExportCode]);

  const patchGlow = (patch: Partial<CenterUpperGlowConfig>) => {
    setGlowConfig((prev) => ({ ...prev, ...patch }));
    setIsVisibleOnStage(true);
  };

  const patchTiming = (patch: Partial<CenterUpperTimingConfig>, replayTrigger = false) => {
    setTimingConfig((prev) => ({ ...prev, ...patch }));
    setIsVisibleOnStage(true);
    if (replayTrigger) {
      setTriggerNonce((n) => n + 1);
    }
  };

  const colCardCls = `p-5 rounded-3xl border flex flex-col gap-4 ${
    isLight
      ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
      : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
  }`;

  const resetBtnCls =
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer';

  return (
    <section id="center-upper-tuner" className="grid grid-cols-1 lg:grid-cols-3 gap-5 scroll-mt-24">
      <TunerConfigExporterBar
        badge="5E-2"
        title="Parameter fine-tuning and export (Tuner & Default Solidifier)"
        subtitle="Includes Winner Blue Team RGB menu, Out Glow, Duration & Typography; One-click copy JSON/TS to solidify as default parameters"
        copyLabel="Export 5E Configuration (Copy 5E Config)"
        codeTitle="current 5E Parameter Snapshot (Paste directly to set as default value)"
        actionId="export-5e-config"
        className="lg:col-span-3"
        isLight={isLight}
        buildExportCode={build5EExportCode}
        onResetDefaults={handleReset5EDefaults}
      />

      {/* Column 1: Winner Blue Team RGB Menu & Rocket League Yellow Outer Glow (`Out Glow`) Parameters */}
      <div className={colCardCls}>
        <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold font-mono">
              1. Winner Blue Team RGB &amp; Out Glow Tuner
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setGlowConfig({ ...DEFAULT_RL_COUNTDOWN_GLOW });
              setWinnerBlueConfig({ ...DEFAULT_WINNER_BLUE_TEAM_CONFIG });
              setIsVisibleOnStage(true);
            }}
            title="Reset to default outer glow and 5G Blue Team preset"
            className={resetBtnCls}
          >
            <RotateCcw className="h-3 w-3" />
            <span>RL Default</span>
          </button>
        </div>

        <CenterUpperBlueTeamColorMenu
          isLight={isLight}
          winnerBlueConfig={winnerBlueConfig}
          setWinnerBlueConfig={setWinnerBlueConfig}
          onActivateBlueWinnerPreview={onActivateBlueWinnerPreview}
          copied5EConfig={copied5EConfig}
          handleCopy5EConfig={handleCopy5EConfig}
          compact={true}
        />

        <ColorSwatchInput
          label="Primary Text Color (Countdown / Orange Team / Custom)"
          description="Rocket League Countdown default yellow #FFE600"
          value={glowConfig.textColor}
          onChange={(hex) =>
            patchGlow({
              textColor: hex,
              ...(syncGlowWithText ? { glowColor: hex, topLabelGlowColor: hex } : {}),
            })
          }
          presets={RL_GLOW_SWATCHES}
          isLight={isLight}
        />

        <div className="flex items-center justify-between px-1">
          <ToggleSwitch
            label="Outer glow color follows main text"
            checked={syncGlowWithText}
            onCheckedChange={(sync) => {
              setSyncGlowWithText(sync);
              if (sync) {
                patchGlow({
                  glowColor: glowConfig.textColor,
                  topLabelGlowColor: glowConfig.textColor,
                });
              } else {
                setIsVisibleOnStage(true);
              }
            }}
            isLight={isLight}
          />
        </div>

        <ColorSwatchInput
          label="Outer Glow Color (Out Glow Color)"
          description="Multi-layer Glow Color (Default Amber Gold #F59E0B)"
          value={glowConfig.glowColor}
          onChange={(hex) => patchGlow({ glowColor: hex, topLabelGlowColor: hex })}
          presets={RL_GLOW_SWATCHES}
          isLight={isLight}
        />

        <ColorSwatchInput
          label="Top Regular Title Color (Top Label)"
          description="Winner / Status Top small text color"
          value={glowConfig.topLabelColor ?? '#FFFFFF'}
          onChange={(hex) => patchGlow({ topLabelColor: hex })}
          presets={['#FFFFFF', '#FEF08A', '#E0F2FE', '#FFEDD5', '#FFE600', '#94A3B8']}
          isLight={isLight}
        />

        <SliderControl
          label="Out Glow Total Glow Intensity (Glow Intensity)"
          value={glowConfig.intensityPct}
          min={0} max={200} step={1} unit="%"
          editable allowOutOfBoundsInput colorScheme="amber"
          onChange={(v) => patchGlow({ intensityPct: v })}
          isLight={isLight}
        />

        <SliderControl
          label="Core close to halo radius (Inner Core Blur)"
          value={glowConfig.innerBlurPx}
          min={0} max={40} step={1} unit="px"
          editable allowOutOfBoundsInput
          onChange={(v) => patchGlow({ innerBlurPx: v })}
          isLight={isLight}
        />

        <SliderControl
          label="Mid-layer glow radius (Outer Glow Blur)"
          value={glowConfig.outerBlurPx}
          min={0} max={80} step={1} unit="px"
          editable allowOutOfBoundsInput
          onChange={(v) => patchGlow({ outerBlurPx: v })}
          isLight={isLight}
        />

        <SliderControl
          label="Distant atmosphere glow radius (Ambient Halo Blur)"
          value={glowConfig.ambientBlurPx}
          min={0} max={120} step={1} unit="px"
          editable allowOutOfBoundsInput
          onChange={(v) => patchGlow({ ambientBlurPx: v })}
          isLight={isLight}
        />

        <SliderControl
          label="Radial soft light background (Backdrop Bloom)"
          value={glowConfig.backdropBloomPct ?? 0}
          min={0} max={100} step={1} unit="%"
          editable allowOutOfBoundsInput
          onChange={(v) => patchGlow({ backdropBloomPct: v })}
          isLight={isLight}
        />

        <SliderControl
          label="Glyph stroke width (Text Stroke Width)"
          value={glowConfig.strokeWidthPx ?? 0}
          min={0} max={3} step={0.1} unit="px"
          editable allowOutOfBoundsInput
          onChange={(v) => patchGlow({ strokeWidthPx: v })}
          isLight={isLight}
        />
      </div>

      {/* Column 2: Duration (2000ms Default) & Animation Envelope Tuner */}
      <div className={colCardCls}>
        <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-sky-500" />
            <h3 className="text-sm font-bold font-mono">
              2. Duration and animation envelope (Duration &amp; Motion)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setTimingConfig((prev) => ({
                ...DEFAULT_CENTER_UPPER_TIMING,
                persistentInspect: prev.persistentInspect,
              }));
              setCountdownIntervalMs(1000);
              setUpperCenterTopPct(40);
              setIsVisibleOnStage(true);
              setTriggerNonce((n) => n + 1);
            }}
            className={resetBtnCls}
          >
            <RotateCcw className="h-3 w-3" />
            <span>2000ms Default</span>
          </button>
        </div>

        <SliderControl
          label="Single display duration (Hold Duration before Exit)"
          description="default 2000ms (>1s); Full Appearance 2000ms Post-entry 400ms Fade Out, Directly overwrite when new data arrives midway"
          value={timingConfig.durationMs}
          min={200} max={5000} step={50} unit="ms"
          editable allowOutOfBoundsInput colorScheme="amber"
          onChange={(v) => patchTiming({ durationMs: v })}
          isLight={isLight}
        />

        {/* Quick Duration Preset Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono opacity-65 mr-1">Quick Hold Duration:</span>
          {[1000, 1500, 2000, 2500, 3000].map((ms) => {
            const active = timingConfig.durationMs === ms;
            return (
              <button
                key={ms}
                type="button"
                onClick={() => patchTiming({ durationMs: ms }, true)}
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] border cursor-pointer transition-all ${
                  active
                    ? 'bg-amber-500 text-neutral-950 font-bold border-amber-400'
                    : isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
              >
                {ms === 2000 ? '2000ms (Default)' : `${ms}ms`}
              </button>
            );
          })}
        </div>

        <SliderControl
          label="Entry zoom impact multiplier (Entry Scale Pop)"
          description="default 1.50x (from 1.50 Scale Retraction 1.00 Times); Support direct numeric input for arbitrary precision"
          value={timingConfig.entryScale}
          min={0.5} max={2.5} step={0.01} unit="x"
          editable allowOutOfBoundsInput
          formatValue={(v) => v.toFixed(2)}
          onChange={(v) => patchTiming({ entryScale: Number(v.toFixed(2)) }, true)}
          isLight={isLight}
        />

        <SliderControl
          label="Entry animation duration (Entry Pop Duration)"
          description="default 400ms, from 1.50x Rapid collapse to 1.00x"
          value={timingConfig.entryDurationMs}
          min={0} max={1000} step={10} unit="ms"
          editable allowOutOfBoundsInput
          onChange={(v) => patchTiming({ entryDurationMs: v }, true)}
          isLight={isLight}
        />

        <SliderControl
          label="Tail fade duration (Exit Fade Duration)"
          description="default 400ms; When no new data, Full Hold 2000ms Execute After 400ms Fade Out"
          value={timingConfig.exitDurationMs}
          min={0} max={1000} step={10} unit="ms"
          editable allowOutOfBoundsInput
          onChange={(v) => patchTiming({ exitDurationMs: v }, true)}
          isLight={isLight}
        />

        <SliderControl
          label="3-2-1-GO Step Overlay Interval (Sequence Step Interval)"
          description="default 1000ms; The entry animation is replayed by the next step before the previous step finishes exiting"
          value={countdownIntervalMs}
          min={200} max={3000} step={50} unit="ms"
          editable allowOutOfBoundsInput
          onChange={(v) => setCountdownIntervalMs(v)}
          isLight={isLight}
        />

        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold font-mono">
              HudAnchorStage Spatial Anchor Position (Upper-Center)
            </span>
          </div>
          <SliderControl
            label="Center anchor position (Upper-Center Top %)"
            description="default 40% (50% To screen center)"
            value={upperCenterTopPct}
            min={15} max={60} step={1} unit="%"
            editable allowOutOfBoundsInput
            onChange={(v) => {
              setUpperCenterTopPct(v);
              setIsVisibleOnStage(true);
            }}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Column 3: Typography Tuner (JetBrains Mono Thin 100 & Regular 400) */}
      <CenterUpperTypographyCard isLight={isLight} />
    </section>
  );
};
