import React from 'react';
import { STEP_12_TIER_PRESETS } from '../../../ui-core/hud/boostGaugeConfig';
import { type BoostColorMode, type BoostColorScheme } from '../../../ui-core/hud/CircularBoostGauge';
import { useBoostGaugeStore } from '../../../ui-core/stores/boostGaugeStore';

export interface HudBoostGaugePaletteAndModeControlsProps {
  is120HzLive: boolean;
  setIs120HzLive: (val: boolean) => void;
  boostAmount: number;
  setBoostAmount: (val: number) => void;
  setIsUnlimitedBoost: (val: boolean) => void;
  onGaugeSizeChange: (val: number) => void;
}

const CALIBRATION_PRESET_BASE = {
  colorScheme: 'step-12' as const,
  fixedTextColor: '#FFFFFF',
  ringInnerPct: 60,
  ringOuterPct: 98,
  lineCap: 'round' as const,
  cutoutAngleDeg: 90,
  rotationDeg: -45,
  size: 148,
};

const CLASSIC_4_TIER_ITEMS = [
  {
    val: 15,
    label: '0~24 (red)',
    cls: 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20',
  },
  {
    val: 45,
    label: '25~60 (Yellow)',
    cls: 'bg-amber-500/10 border-amber-500/40 text-amber-500 hover:bg-amber-500/20',
  },
  {
    val: 80,
    label: '61~96 (green)',
    cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/20',
  },
  {
    val: 100,
    label: '97~100 (Light Blue)',
    cls: 'bg-sky-500/10 border-sky-500/40 text-sky-500 hover:bg-sky-500/20',
  },
] as const;

const FIXED_TEXT_SWATCHES = [
  { hex: '#FFFFFF', label: 'Pure White #FFF' },
  { hex: '#09090B', label: 'Pure Black #09090B' },
  { hex: '#FDE047', label: 'Bright Gold #FDE047' },
  { hex: '#38BDF8', label: 'Ice Blue #38BDF8' },
] as const;

export const HudBoostGaugePaletteAndModeControls: React.FC<
  HudBoostGaugePaletteAndModeControlsProps
> = React.memo(
  ({
    is120HzLive,
    setIs120HzLive,
    boostAmount,
    setBoostAmount,
    setIsUnlimitedBoost,
    onGaugeSizeChange,
  }) => {
    const {
      colorScheme,
      colorMode,
      fixedTextColor,
      ringInnerPct,
      ringOuterPct,
      rotationDeg,
      setToken,
      updateTokens,
    } = useBoostGaugeStore();

    const setColorScheme = (v: BoostColorScheme) => setToken('colorScheme', v);
    const setColorMode = (v: BoostColorMode) => setToken('colorMode', v);
    const setFixedTextColor = (v: string) => setToken('fixedTextColor', v);

    const applyPreset = (mode: 'inverted' | 'ring-only') => {
      updateTokens({ ...CALIBRATION_PRESET_BASE, colorMode: mode });
      onGaugeSizeChange(148);
    };

    const isPresetGeometry =
      colorScheme === 'step-12' &&
      ringInnerPct === 60 &&
      ringOuterPct === 98 &&
      rotationDeg === -45;
    const presetIdleCls = 'border-neutral-400/40 hover:bg-neutral-500/10';

    return (
      <>
        <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/5 font-mono text-[11px]">
          <span className="font-bold text-amber-500">Calibrate preset shortcut comparison:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => applyPreset('inverted')}
              className={`px-2 py-0.5 rounded-lg border cursor-pointer transition-all ${
                colorMode === 'inverted' && isPresetGeometry
                  ? 'bg-amber-500 text-neutral-950 border-amber-500 font-bold'
                  : presetIdleCls
              }`}
            >
              scheme A: Invert Hollow Ring (12Level · Vacant100-X%Transparent · 60%~98% · -45°)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('ring-only')}
              className={`px-2 py-0.5 rounded-lg border cursor-pointer transition-all ${
                colorMode === 'ring-only' && isPresetGeometry
                  ? 'bg-sky-500 text-white border-sky-500 font-bold'
                  : presetIdleCls
              }`}
            >
              scheme B: Ring color change with fixed white text (12Level · Rounded60%~98% · -45°)
            </button>
            <button
              type="button"
              onClick={() => {
                setIs120HzLive(false);
                setIsUnlimitedBoost(false);
                setBoostAmount(35);
              }}
              className={`px-2 py-0.5 rounded-lg border cursor-pointer transition-all ${
                !is120HzLive && boostAmount === 35
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-500 font-bold'
                  : presetIdleCls
              }`}
            >
              Fixed Point 35% Inspect (Compare 65% Transparent Crop &amp; Rounded/Flat Cut)
            </button>
          </div>
        </div>

        {/* 2. Color Scheme (4-Color vs 12-Step 9-Tier) + Quick Tier Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold">Color Palette (Color Scheme):</span>
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <button
                type="button"
                onClick={() => setColorScheme('step-12')}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                  colorScheme === 'step-12'
                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-2xs'
                    : 'border-neutral-400/40 opacity-80 hover:opacity-100'
                }`}
              >
                each 12 level · Nine-segment Seven-color+Red flash (T5A.4 Pie)
              </button>
              <button
                type="button"
                onClick={() => setColorScheme('classic-4')}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                  colorScheme === 'classic-4'
                    ? 'bg-sky-600 text-white border-sky-600 font-bold shadow-2xs'
                    : 'border-neutral-400/40 opacity-80 hover:opacity-100'
                }`}
              >
                Classic Four-Color Mode (0-24/60/96/100)
              </button>
            </div>
          </div>

          {colorScheme === 'step-12' ? (
            <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 font-mono">
              {STEP_12_TIER_PRESETS.map((item) => {
                const isActive =
                  !is120HzLive &&
                  ((item.val === 6 && boostAmount < 12) ||
                    (item.val === 18 && boostAmount >= 12 && boostAmount < 24) ||
                    (item.val === 30 && boostAmount >= 24 && boostAmount < 36) ||
                    (item.val === 42 && boostAmount >= 36 && boostAmount < 48) ||
                    (item.val === 54 && boostAmount >= 48 && boostAmount < 60) ||
                    (item.val === 66 && boostAmount >= 60 && boostAmount < 72) ||
                    (item.val === 78 && boostAmount >= 72 && boostAmount < 84) ||
                    (item.val === 90 && boostAmount >= 84 && boostAmount <= 96) ||
                    (item.val === 100 && boostAmount > 96));
                return (
                  <button
                    key={item.range}
                    type="button"
                    onClick={() => {
                      setIs120HzLive(false);
                      setIsUnlimitedBoost(false);
                      setBoostAmount(item.val);
                    }}
                    className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border text-[10px] cursor-pointer transition-all ${
                      isActive ? 'ring-2 ring-amber-500 font-bold scale-102' : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: `${item.hex}20`,
                      borderColor: `${item.hex}80`,
                    }}
                    title={`Click Test ${item.range} (${item.label})`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full mb-0.5 border border-white/30 ${
                        item.isFlashing ? 'animate-ping' : ''
                      }`}
                      style={{ backgroundColor: item.hex }}
                    />
                    <span className="font-bold leading-tight">{item.range}</span>
                    <span className="text-[9px] opacity-80 leading-tight">
                      {item.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CLASSIC_4_TIER_ITEMS.map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => {
                    setIs120HzLive(false);
                    setIsUnlimitedBoost(false);
                    setBoostAmount(item.val);
                  }}
                  className={`flex flex-col items-center justify-center p-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${item.cls}`}
                >
                  <span>{item.val}%</span>
                  <span className="text-[10px] font-normal opacity-80">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Inverted Color Mode & Fixed Number Color */}
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold">
              Color Mode (standard vs Inverted hollow transparent ring vs Ring Only):
            </span>
            <div className="flex items-center gap-1 font-mono text-xs flex-wrap">
              {(
                [
                  { id: 'inverted', label: 'Invert (Dial Color Shift · Vacant100-X%Hollow Ring Transparency)' },
                  { id: 'ring-only', label: 'Ring Only (Fixed Digit Color)' },
                  { id: 'standard', label: 'standard (Ring+Dynamic Digit Color)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setColorMode(m.id)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] border cursor-pointer transition-all ${
                    colorMode === m.id
                      ? 'bg-amber-500 text-neutral-950 border-amber-500 font-bold shadow-2xs'
                      : 'border-neutral-400/40 opacity-80 hover:opacity-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {colorMode !== 'standard' && (
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-mono bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-1.5">
              <span className="text-[11px] font-semibold">
                Central numeric fixed color (`fixedTextColor`):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {FIXED_TEXT_SWATCHES.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    onClick={() => setFixedTextColor(sw.hex)}
                    className={`px-2 py-0.5 rounded border text-[10px] cursor-pointer flex items-center gap-1 ${
                      fixedTextColor.toUpperCase() === sw.hex
                        ? 'ring-2 ring-amber-500 font-bold'
                        : 'opacity-80'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-neutral-400"
                      style={{ backgroundColor: sw.hex }}
                    />
                    <span>{sw.label}</span>
                  </button>
                ))}
                <input
                  type="color"
                  value={fixedTextColor}
                  onChange={(e) => setFixedTextColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                  title="Custom fixed numeric color"
                />
              </div>
            </div>
          )}
        </div>
      </>
    );
  }
);

HudBoostGaugePaletteAndModeControls.displayName = 'HudBoostGaugePaletteAndModeControls';
