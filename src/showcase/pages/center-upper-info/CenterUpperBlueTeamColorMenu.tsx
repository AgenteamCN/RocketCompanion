import React, { useState, useEffect, useMemo } from 'react';
import { Palette, RotateCcw, Copy, Check, Sliders, Trophy } from 'lucide-react';
import { CenterUpperBlueTeamConfig } from '../../../ui-core/hud/CenterUpperInfoHUD';
import { DEFAULT_WINNER_BLUE_TEAM_CONFIG } from '../../../ui-core/hud/centerUpperInfoDefaults';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import {
  ColorSwatchInput,
  hexToRgbTuple,
  rgbTupleToHex,
  parseColorStringToHex,
  clampRgbChannel,
} from '../../components/tuner/ColorSwatchInput';

export interface BlueColorPreset {
  id: string;
  label: string;
  hex: string;
}

export const WINNER_BLUE_COLOR_PRESETS: BlueColorPreset[] = [
  { id: '5g-sky', label: '5G Sky Blue', hex: '#38BDF8' },
  { id: '5g-royal', label: '5G Royal Blue', hex: '#2563EB' },
  { id: '5g-electric', label: '5G Electric Blue', hex: '#3B82F6' },
  { id: '5g-cerulean', label: '5G Cerulean', hex: '#0284C7' },
  { id: '5g-cobalt', label: '5G Cobalt', hex: '#1D4ED8' },
  { id: '5g-ice', label: '5G Ice Blue', hex: '#60A5FA' },
  { id: 'cyan-pulse', label: 'Cyan Pulse', hex: '#0EA5E9' },
  { id: 'neon-azure', label: 'Neon Azure', hex: '#00A3FF' },
];

export const WINNER_BLUE_SWATCH_HEXES = WINNER_BLUE_COLOR_PRESETS.map((p) => p.hex);

export interface CenterUpperBlueTeamColorMenuProps {
  isLight: boolean;
  winnerBlueConfig: CenterUpperBlueTeamConfig;
  setWinnerBlueConfig: (
    val:
      | CenterUpperBlueTeamConfig
      | ((prev: CenterUpperBlueTeamConfig) => CenterUpperBlueTeamConfig)
  ) => void;
  onActivateBlueWinnerPreview?: () => void;
  copied5EConfig?: boolean;
  handleCopy5EConfig?: () => void;
  compact?: boolean;
}

export const CenterUpperBlueTeamColorMenu: React.FC<CenterUpperBlueTeamColorMenuProps> = ({
  isLight,
  winnerBlueConfig,
  setWinnerBlueConfig,
  onActivateBlueWinnerPreview,
  copied5EConfig = false,
  handleCopy5EConfig,
  compact = false,
}) => {
  const rgb = useMemo(() => hexToRgbTuple(winnerBlueConfig.textColor), [winnerBlueConfig.textColor]);
  const [rgbTupleInput, setRgbTupleInput] = useState<string>(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
  const [showAdvancedGlow, setShowAdvancedGlow] = useState<boolean>(!compact);

  useEffect(() => {
    setRgbTupleInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }, [rgb.r, rgb.g, rgb.b]);

  const updateBlueConfig = (patch: Partial<CenterUpperBlueTeamConfig>) => {
    setWinnerBlueConfig((prev) => {
      const next: CenterUpperBlueTeamConfig = {
        ...DEFAULT_WINNER_BLUE_TEAM_CONFIG,
        ...prev,
        ...patch,
      };
      if (patch.textColor && next.syncGlowWithText && !patch.glowColor) {
        next.glowColor = patch.textColor;
      }
      return next;
    });
    onActivateBlueWinnerPreview?.();
  };

  const handleSetBlueHex = (hex: string) => {
    const normalized = parseColorStringToHex(hex) ?? hex.toUpperCase();
    updateBlueConfig({ textColor: normalized });
  };

  const handleSetRgbChannel = (channel: 'r' | 'g' | 'b', val: number) => {
    const nextRgb = {
      ...rgb,
      [channel]: clampRgbChannel(val),
    };
    const nextHex = rgbTupleToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    updateBlueConfig({ textColor: nextHex });
  };

  const handleRgbTupleTextChange = (raw: string) => {
    setRgbTupleInput(raw);
    const parsed = parseColorStringToHex(raw);
    if (parsed) {
      updateBlueConfig({ textColor: parsed });
    }
  };

  return (
    <div
      data-ui-section="winner-blue-team-color-menu"
      className={`p-3.5 rounded-2xl border border-sky-500/35 bg-sky-500/5 flex flex-col gap-3 ${
        isLight ? 'text-neutral-900' : 'text-neutral-100'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-sky-400 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" />
            <span>Winner Battle Result · Blue Team Color Settings (`BLUE TEAM`)</span>
          </span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            {winnerBlueConfig.textColor.toUpperCase()} · rgb({rgb.r}, {rgb.g}, {rgb.b})
          </span>
          <span className="text-[10px] font-mono opacity-65">
            (`WINNER` top color &amp; `ORANGE TEAM` unchanged)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ToggleSwitch
            label="Enable Blue Color"
            checked={winnerBlueConfig.enabled}
            onCheckedChange={(v) => updateBlueConfig({ enabled: v })}
            isLight={isLight}
          />
          <button
            type="button"
            onClick={() => {
              setWinnerBlueConfig({ ...DEFAULT_WINNER_BLUE_TEAM_CONFIG });
              onActivateBlueWinnerPreview?.();
            }}
            title="Reset Blue Team color to 5G default (#38BDF8 / rgb(56, 189, 248))"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>5G Blue Default</span>
          </button>
          {handleCopy5EConfig && (
            <button
              type="button"
              onClick={handleCopy5EConfig}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border cursor-pointer transition-all ${
                copied5EConfig
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                  : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400'
              }`}
            >
              {copied5EConfig ? (
                <>
                  <Check className="h-3 w-3" />
                  <span>Copied Config!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy 5E Config</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 5G Named Blue Team Presets */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-mono opacity-75">
          5G Reference Blue Presets (Click to select):
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {WINNER_BLUE_COLOR_PRESETS.map((preset) => {
            const pRgb = hexToRgbTuple(preset.hex);
            const active =
              winnerBlueConfig.textColor.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSetBlueHex(preset.hex)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono border cursor-pointer transition-all ${
                  active
                    ? 'bg-sky-500 text-neutral-950 font-bold border-sky-300 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-sky-50 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full border border-white/40 shrink-0"
                  style={{ backgroundColor: preset.hex }}
                />
                <span>{preset.label}</span>
                <span className="opacity-70">
                  ({pRgb.r},{pRgb.g},{pRgb.b})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Color Picker + Hex + Direct RGB (R, G, B) Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ColorSwatchInput
          label="Blue Team Fill Color (`BLUE TEAM` Thin 100)"
          description="Pick visually, enter #RRGGBB, or input R / G / B (0-255)"
          value={winnerBlueConfig.textColor}
          onChange={handleSetBlueHex}
          presets={WINNER_BLUE_SWATCH_HEXES}
          showRgbInputs={true}
          isLight={isLight}
        />

        {/* Manual RGB Tuple Paste & Channel Sliders */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col justify-between gap-2 text-xs ${
            isLight
              ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
              : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold flex items-center gap-1">
              <Palette className="h-3.5 w-3.5 text-sky-400" />
              <span>Manual RGB Tuple / Channel Input</span>
            </span>
            <input
              type="text"
              value={rgbTupleInput}
              onChange={(e) => handleRgbTupleTextChange(e.target.value)}
              placeholder="56, 189, 248 or rgb(56,189,248)"
              aria-label="Manual RGB Tuple Input"
              className={`w-36 px-2 py-0.5 text-center font-mono text-xs rounded border outline-none focus:ring-1 focus:ring-sky-500 ${
                isLight
                  ? 'bg-white border-neutral-300 text-neutral-800'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-100'
              }`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <SliderControl
              label="R (Red)"
              value={rgb.r}
              min={0}
              max={255}
              step={1}
              editable
              onChange={(v) => handleSetRgbChannel('r', v)}
              isLight={isLight}
            />
            <SliderControl
              label="G (Green)"
              value={rgb.g}
              min={0}
              max={255}
              step={1}
              editable
              onChange={(v) => handleSetRgbChannel('g', v)}
              isLight={isLight}
            />
            <SliderControl
              label="B (Blue)"
              value={rgb.b}
              min={0}
              max={255}
              step={1}
              editable
              onChange={(v) => handleSetRgbChannel('b', v)}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* Outer Glow & Stroke Controls for Blue Team */}
      <div className="flex items-center justify-between pt-1 border-t border-sky-500/20 flex-wrap gap-2">
        <ToggleSwitch
          label="Blue Team Outer Glow Follows Blue Fill Color"
          checked={winnerBlueConfig.syncGlowWithText}
          onCheckedChange={(sync) =>
            updateBlueConfig({
              syncGlowWithText: sync,
              ...(sync ? { glowColor: winnerBlueConfig.textColor } : {}),
            })
          }
          isLight={isLight}
        />
        <button
          type="button"
          onClick={() => setShowAdvancedGlow((v) => !v)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono text-sky-400 hover:bg-sky-500/10 border border-sky-500/30 cursor-pointer"
        >
          <Sliders className="h-3 w-3" />
          <span>{showAdvancedGlow ? 'Hide Blue Glow & Stroke Fine-Tuner' : 'Show Blue Glow & Stroke Fine-Tuner'}</span>
        </button>
      </div>

      {showAdvancedGlow && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <ColorSwatchInput
            label="Blue Team Outer Glow Color"
            description="Independent glow color when sync is off"
            value={
              winnerBlueConfig.syncGlowWithText
                ? winnerBlueConfig.textColor
                : winnerBlueConfig.glowColor
            }
            onChange={(hex) => {
              const normalized = parseColorStringToHex(hex) ?? hex.toUpperCase();
              updateBlueConfig({ syncGlowWithText: false, glowColor: normalized });
            }}
            presets={[...WINNER_BLUE_SWATCH_HEXES, '#000000', '#FFFFFF']}
            showRgbInputs={true}
            isLight={isLight}
          />

          <div className="grid grid-cols-2 gap-2">
            <SliderControl
              label="Blue Glow Intensity"
              value={winnerBlueConfig.intensityPct}
              min={0}
              max={200}
              step={1}
              unit="%"
              editable
              allowOutOfBoundsInput
              onChange={(v) => updateBlueConfig({ intensityPct: v })}
              isLight={isLight}
            />
            <SliderControl
              label="Stroke Width"
              value={winnerBlueConfig.strokeWidthPx}
              min={0}
              max={3}
              step={0.1}
              unit="px"
              editable
              allowOutOfBoundsInput
              onChange={(v) => updateBlueConfig({ strokeWidthPx: Number(v.toFixed(1)) })}
              isLight={isLight}
            />
            <SliderControl
              label="Inner Blur"
              value={winnerBlueConfig.innerBlurPx}
              min={0}
              max={40}
              step={1}
              unit="px"
              editable
              allowOutOfBoundsInput
              onChange={(v) => updateBlueConfig({ innerBlurPx: v })}
              isLight={isLight}
            />
            <SliderControl
              label="Outer Blur"
              value={winnerBlueConfig.outerBlurPx}
              min={0}
              max={80}
              step={1}
              unit="px"
              editable
              allowOutOfBoundsInput
              onChange={(v) => updateBlueConfig({ outerBlurPx: v })}
              isLight={isLight}
            />
          </div>
        </div>
      )}
    </div>
  );
};
