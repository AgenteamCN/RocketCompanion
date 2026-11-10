import React from 'react';
import { CircleDot, Gauge, Layers } from 'lucide-react';
import type {
  NameTagBoostBorderColorMode,
  NameTagBoostBorderOverride,
  NameTagBoostIndicatorMode,
  NameTagConfig,
} from '../../../config/nameTagConfig';
import { updateBallVisualConfig } from '../../../config/ballVisualConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { NameTagBoostVisibilityAndPreviewSection } from './NameTagBoostVisibilityAndPreviewSection';

export interface NameTagBoostBorderSectionProps {
  isLight?: boolean;
  config?: NameTagConfig;
  boostBorderOverride?: NameTagBoostBorderOverride;
  updateConfig?: (partial: Partial<NameTagConfig>) => void;
  updatePreviewBoostAmount?: (index: number, boostAmount: number) => void;
  setBoostBorderOverride?: (override: NameTagBoostBorderOverride) => void;
}

const BOOST_MODE_OPTIONS: Array<{ id: NameTagBoostIndicatorMode; label: string; shortDesc: string }> = [
  { id: 'bottom-up-fill', label: '1. Bottom-Up Fill', shortDesc: 'Vertical liquid fill (0-100% height)' },
  { id: 'left-right-fill', label: '2. Left-Right Fill', shortDesc: 'Horizontal bar fill + border progress across full pill width' },
  { id: 'sunset-circle', label: '3. Sunset Circle', shortDesc: 'Embedded left circular gauge with bottom-to-top rising fill' },
  { id: 'border-only', label: '4. Border Only', shortDesc: 'Perimeter stroke clip (0-100% left-to-right)' },
];

const COLOR_MODE_OPTIONS: Array<{ id: NameTagBoostBorderColorMode; label: string }> = [
  { id: 'team', label: 'Team Specific' },
  { id: 'shared', label: 'Shared / Unified' },
];

const BALL_OPACITY_PRESETS = [
  { label: '100% Solid', value: 1.0 },
  { label: '70% Translucent', value: 0.7 },
  { label: '40% Ghost', value: 0.4 },
  { label: '0% Off', value: 0.0 },
];

const FILL_MIX_PRESETS = [
  { label: '100% Pure Boost Color', value: 1.0 },
  { label: '65% Tinted', value: 0.65 },
  { label: '38% Legacy Team Mix', value: 0.38 },
  { label: '0% Pure Team Bg', value: 0.0 },
];

export const NameTagBoostBorderSection: React.FC<NameTagBoostBorderSectionProps> = ({
  isLight = false,
  config: propConfig,
  boostBorderOverride: propOverride,
  updateConfig: propUpdateConfig,
  updatePreviewBoostAmount: propUpdatePreviewBoostAmount,
  setBoostBorderOverride: propSetBoostBorderOverride,
}) => {
  const store = useNameTagTunerStore();
  const config = propConfig ?? store.config;
  const boostBorderOverride = propOverride !== undefined ? propOverride : store.boostBorderOverride;
  const updateConfig = propUpdateConfig ?? store.updateConfig;
  const updatePreviewBoostAmount = propUpdatePreviewBoostAmount ?? store.updatePreviewBoostAmount;
  const setBoostBorderOverride = propSetBoostBorderOverride ?? store.setBoostBorderOverride;

  const cardBackground = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const subCardBackground = isLight ? 'border-neutral-200 bg-neutral-100/75' : 'border-neutral-800 bg-neutral-900/50';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';
  const btnInactive = isLight
    ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
    : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800';
  const btnActiveCyan = isLight
    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-800 font-bold'
    : 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold';

  const activeModeMeta = BOOST_MODE_OPTIONS.find((item) => item.id === config.boostIndicatorMode) || BOOST_MODE_OPTIONS[0];

  const handleUpdateBallOcclusionOpacity = (nextOpacity: number) => {
    const clamped = Math.max(0, Math.min(1, Number(nextOpacity) || 0));
    updateConfig({ ballOcclusionOpacity: clamped });
    updateBallVisualConfig({ opacity: clamped });
  };

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBackground}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Gauge className={`h-3.5 w-3.5 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
          <span>Boost Progress Indicator (4 Visual Modes · 0-100%)</span>
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] ${mutedText}`}>Enable Boost Indicator</span>
          <ToggleSwitch
            checked={config.boostBorderEnabled}
            onChange={(nextValue) => updateConfig({ boostBorderEnabled: nextValue })}
            isLight={isLight}
          />
        </div>
      </div>

      <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${subCardBackground}`}>
        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <span className="font-semibold flex items-center gap-1">
            <Layers className="h-3 w-3 opacity-80" />
            <span>Boost Display Mode (4 Candidates):</span>
          </span>
          <span className={`font-mono text-[9px] truncate ${mutedText}`}>{activeModeMeta.shortDesc}</span>
        </div>

        <div className="grid grid-cols-2 gap-1">
          {BOOST_MODE_OPTIONS.map((option) => {
            const isSelected = config.boostIndicatorMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => updateConfig({ boostIndicatorMode: option.id })}
                title={option.shortDesc}
                className={`px-2 py-1 rounded border text-[10px] font-mono cursor-pointer text-left flex items-center justify-between gap-1 transition-colors ${
                  isSelected ? btnActiveCyan : btnInactive
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40 shrink-0">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {(config.boostIndicatorMode === 'bottom-up-fill' ||
          config.boostIndicatorMode === 'left-right-fill' ||
          config.boostIndicatorMode === 'sunset-circle') && (
          <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
            <div className="flex items-center justify-between text-[10px]">
              <span className={mutedText}>Show Crisp Horizon / Edge Line at Boost Level</span>
              <ToggleSwitch
                checked={config.boostShowHorizonLine}
                onChange={(nextValue) => updateConfig({ boostShowHorizonLine: nextValue })}
                isLight={isLight}
              />
            </div>

            {config.boostIndicatorMode !== 'sunset-circle' && (
              <>
                <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
                  <span className={mutedText}>Fill Color Mix Presets:</span>
                  <div className="flex items-center gap-1">
                    {FILL_MIX_PRESETS.map((preset) => {
                      const isPresetActive = Math.abs((config.boostFillColorBlendRatio ?? 1.0) - preset.value) < 0.015;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => updateConfig({ boostFillColorBlendRatio: preset.value })}
                          className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer transition-colors ${
                            isPresetActive ? btnActiveCyan : btnInactive
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <SliderControl
                  label="Active Boost Color Blend"
                  value={Math.round((config.boostFillColorBlendRatio ?? 1.0) * 100)}
                  min={0}
                  max={100}
                  step={2}
                  unit="%"
                  onChange={(nextPct) => updateConfig({ boostFillColorBlendRatio: nextPct / 100 })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Active Boost Fill Opacity"
                  value={config.boostFillOpacity}
                  min={0.0}
                  max={1.0}
                  step={0.02}
                  onChange={(nextValue) => updateConfig({ boostFillOpacity: nextValue })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Unfilled Base Background Opacity"
                  value={config.boostUnfilledBgOpacity}
                  min={0.0}
                  max={1.0}
                  step={0.02}
                  onChange={(nextValue) => updateConfig({ boostUnfilledBgOpacity: nextValue })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Unfilled Base Darken Mix"
                  value={Math.round((config.boostUnfilledDarkenRatio ?? 0.45) * 100)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={(nextPct) => updateConfig({ boostUnfilledDarkenRatio: nextPct / 100 })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Overall Card Master Opacity"
                  value={config.opacity}
                  min={0.1}
                  max={1.0}
                  step={0.02}
                  onChange={(nextValue) => updateConfig({ opacity: nextValue })}
                  isLight={isLight}
                />
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1.5 text-[10px]">
        <span className={mutedText}>Boost Accent / Fill Color Mode:</span>
        <div className="flex items-center gap-1">
          {COLOR_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => updateConfig({ boostBorderColorMode: option.id })}
              className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                config.boostBorderColorMode === option.id ? btnActiveCyan : btnInactive
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {config.boostBorderColorMode === 'team' ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg border border-sky-500/30 bg-sky-500/5 flex items-center justify-between text-[10px]">
            <span className="font-semibold text-sky-400">Blue Boost Accent</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] uppercase opacity-75">{config.blueBoostBorderColor}</span>
              <input
                type="color"
                value={config.blueBoostBorderColor}
                onChange={(e) => updateConfig({ blueBoostBorderColor: e.target.value })}
                className="h-5 w-8 rounded cursor-pointer bg-transparent border-0"
              />
            </div>
          </div>

          <div className="p-2 rounded-lg border border-orange-500/30 bg-orange-500/5 flex items-center justify-between text-[10px]">
            <span className="font-semibold text-orange-400">Orange Boost Accent</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] uppercase opacity-75">{config.orangeBoostBorderColor}</span>
              <input
                type="color"
                value={config.orangeBoostBorderColor}
                onChange={(e) => updateConfig({ orangeBoostBorderColor: e.target.value })}
                className="h-5 w-8 rounded cursor-pointer bg-transparent border-0"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className={`p-2 rounded-lg border flex items-center justify-between text-[10px] ${subCardBackground}`}>
          <span className="font-semibold">Shared Boost Color (All Players)</span>
          <div className="flex items-center gap-1.5">
            {[
              { label: 'Pure White (#FFFFFF)', hex: '#ffffff' },
              { label: 'Pure Black (#000000)', hex: '#000000' },
            ].map((item) => (
              <button
                key={item.hex}
                type="button"
                onClick={() => updateConfig({ sharedBoostBorderColor: item.hex })}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${
                  config.sharedBoostBorderColor.toLowerCase() === item.hex ? btnActiveCyan : btnInactive
                }`}
              >
                {item.label}
              </button>
            ))}
            <span className="font-mono text-[9px] uppercase opacity-75">{config.sharedBoostBorderColor}</span>
            <input
              type="color"
              value={config.sharedBoostBorderColor}
              onChange={(e) => updateConfig({ sharedBoostBorderColor: e.target.value })}
              className="h-5 w-8 rounded cursor-pointer bg-transparent border-0"
            />
          </div>
        </div>
      )}

      <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${subCardBackground}`}>
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold flex items-center gap-1">
            <CircleDot className="h-3 w-3 text-amber-500" />
            <span>Kickoff Ball Entity Occlusion (R=95 UU · Default 100% Solid)</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`font-mono text-[9px] ${mutedText}`}>
              {config.ballOcclusionEnabled ? `Active (${Math.round(config.ballOcclusionOpacity * 100)}% Mask)` : 'Disabled'}
            </span>
            <ToggleSwitch
              checked={config.ballOcclusionEnabled}
              onChange={(nextValue) => updateConfig({ ballOcclusionEnabled: nextValue })}
              isLight={isLight}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <span className={mutedText}>Ball Opacity Presets:</span>
          <div className="flex items-center gap-1">
            {BALL_OPACITY_PRESETS.map((preset) => {
              const isSelected = Math.abs(config.ballOcclusionOpacity - preset.value) < 0.015;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleUpdateBallOcclusionOpacity(preset.value)}
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer transition-colors ${
                    isSelected ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold' : btnInactive
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <SliderControl
          label="Ball Opacity (Occlusion Attenuation on Behind-Ball Tags)"
          value={Math.round(config.ballOcclusionOpacity * 100)}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={(nextPct) => handleUpdateBallOcclusionOpacity(nextPct / 100)}
          isLight={isLight}
        />
      </div>

      <NameTagBoostVisibilityAndPreviewSection
        isLight={isLight}
        config={config}
        boostBorderOverride={boostBorderOverride}
        updateConfig={updateConfig}
        updatePreviewBoostAmount={updatePreviewBoostAmount}
        setBoostBorderOverride={setBoostBorderOverride}
      />
    </div>
  );
};
