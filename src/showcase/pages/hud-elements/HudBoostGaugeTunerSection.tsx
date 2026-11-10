import React from 'react';
import { useBoostGaugeStore } from '../../../ui-core/stores/boostGaugeStore';
import { Flame, RotateCcw, Moon, Sun, Copy, Check, Code2 } from 'lucide-react';
import { CircularBoostGauge, type BoostThemeOverride } from '../../../ui-core/hud/CircularBoostGauge';
import { getBoostSegmentColor } from '../../../ui-core/hud/boostGaugeConfig';
import { type HudBoostListener } from '../../../ui-core/stores/hudTransientTypes';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import { CodeBlock } from '../../CodeBlock';
import { HudBoostGaugeGeometryControls } from './HudBoostGaugeGeometryControls';
import { HudBoostGaugePaletteAndModeControls } from './HudBoostGaugePaletteAndModeControls';

export interface HudBoostGaugeTunerSectionProps {
  isLight: boolean;
  is120HzLive: boolean;
  setIs120HzLive: (val: boolean) => void;
  boostAmount: number;
  setBoostAmount: (val: number) => void;
  isUnlimitedBoost: boolean;
  setIsUnlimitedBoost: (val: boolean) => void;
  setGaugeSize: (val: number) => void;
  subscribeBoostFn?: (listener: HudBoostListener) => () => void;
}

const THEME_OVERRIDES = [
  { id: 'auto', label: 'Auto (Follow Global)' },
  { id: 'dark', label: 'Force Dark (Dark Overlay)', icon: Moon },
  { id: 'light', label: 'Force Light (Light Overlay)', icon: Sun },
] as const;

export const HudBoostGaugeTunerSection: React.FC<HudBoostGaugeTunerSectionProps> = ({
  isLight,
  is120HzLive,
  setIs120HzLive,
  boostAmount,
  setBoostAmount,
  isUnlimitedBoost,
  setIsUnlimitedBoost,
  setGaugeSize,
  subscribeBoostFn,
}) => {
  const {
    colorScheme,
    colorMode,
    fixedTextColor,
    themeOverride,
    ringInnerPct,
    ringOuterPct,
    lineCap,
    cutoutAngleDeg,
    rotationDeg,
    size: gaugeSize,
    setToken,
    resetTokens,
    exportConfigCode,
  } = useBoostGaugeStore();

  const [showCode, setShowCode] = React.useState(false);
  const [copiedConfig, setCopiedConfig] = React.useState(false);

  const setThemeOverride = (v: BoostThemeOverride) => setToken('themeOverride', v);

  const handleResetBoostGaugeConfig = () => {
    resetTokens();
    setGaugeSize(148);
  };

  const handleCopyConfig = () => {
    const code = exportConfigCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 1800);
  };

  const boostSegment = getBoostSegmentColor(boostAmount, colorScheme);
  const inputCls = isLight
    ? 'bg-neutral-50 border-neutral-300 text-neutral-900'
    : 'bg-neutral-950 border-neutral-700 text-white';

  const modeSummary =
    colorMode === 'inverted'
      ? 'Invert(Dial Color Shift+Fixed Text Color)'
      : colorMode === 'ring-only'
      ? 'Ring Only(Fixed Text Color)'
      : 'standard(Ring+Text Color Change)';

  return (
    <SectionErrorBoundary title="5A.5 · CircularBoostGauge" isLight={isLight}>
      <section id="hud-5a-5-boost-gauge" className="flex flex-col gap-4 scroll-mt-24">
        <div className="flex items-center gap-2 border-b pb-2 border-neutral-200 dark:border-neutral-800 flex-wrap">
          <div className="h-6 w-6 rounded-md bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold text-xs font-mono">
            5A.5
          </div>
          <h2 className="text-base font-bold tracking-tight">
            CircularBoostGauge (high frequency 120Hz · Fully parametric circular progress gauge)
          </h2>
          <Badge variant="amber" size="sm" isLight={isLight}>
            120Hz Transient SVG/DOM Ref
          </Badge>
          <span className="text-xs font-mono text-neutral-500">
            Start/End radius percentage · Invert background mode · Dark Override · Arbitrary crop angle and aperture rotation · 4Color / each12level(9Segment)Dual Color
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div
            className={`lg:col-span-5 p-6 rounded-3xl border flex flex-col items-center justify-between gap-4 transition-all ${
              isLight
                ? 'bg-neutral-100/70 border-neutral-200/90 shadow-inner'
                : 'bg-neutral-950 border-neutral-800/90 shadow-inner'
            }`}
          >
            <div className="w-full flex items-center justify-between text-[11px] font-mono opacity-80">
              <span>
                Ring Radius: <strong>{ringInnerPct}%~{ringOuterPct}%</strong>
              </span>
              <span>
                Crop: <strong>{cutoutAngleDeg}°</strong> · Rotate: <strong>{rotationDeg}°</strong>
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center py-4">
              <CircularBoostGauge
                amount={boostAmount}
                isUnlimited={isUnlimitedBoost}
                subscribeBoost={subscribeBoostFn}
                size={gaugeSize}
                isLight={isLight}
                themeOverride={themeOverride}
                ringInnerPct={ringInnerPct}
                ringOuterPct={ringOuterPct}
                lineCap={lineCap}
                cutoutAngleDeg={cutoutAngleDeg}
                rotationDeg={rotationDeg}
                colorScheme={colorScheme}
                colorMode={colorMode}
                fixedTextColor={fixedTextColor}
              />
            </div>

            <div className="w-full flex items-center justify-between text-[11px] font-mono px-2 py-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
              <span>
                Mode: <strong className="text-amber-500">{modeSummary}</strong>
              </span>
              <span>
                Color Scheme:{' '}
                <strong className="text-sky-500">
                  {colorScheme === 'step-12' ? 'each12level(9Segment)' : 'Classic4Color'}
                </strong>
              </span>
            </div>
          </div>

          <div
            className={`lg:col-span-7 p-6 rounded-3xl border flex flex-col justify-between gap-4 transition-colors shadow-2xs ${
              isLight
                ? 'bg-white border-neutral-200/90 text-neutral-800'
                : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
            }`}
          >
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between border-b pb-2.5 border-neutral-100 dark:border-neutral-800/70 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4" style={{ color: boostSegment.color }} />
                  <span className="text-xs font-bold font-mono tracking-wide">
                    CONFIGURATION PANEL: CIRCULAR BOOST GAUGE (real-time sync 5A.S Top-level Sandbox)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {is120HzLive ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/40">
                      [Boost] 120Hz SVG/Text Ref Direct Drive
                    </span>
                  ) : (
                    <span
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded-md border"
                      style={{
                        color:
                          !isLight && boostSegment.segmentName === 'black'
                            ? '#e4e4e7'
                            : boostSegment.color,
                        borderColor: `${boostSegment.color}66`,
                      }}
                    >
                      {isUnlimitedBoost
                        ? '-- (UNLIMITED)'
                        : `${boostAmount}% · ${boostSegment.rangeLabel}`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCode((v) => !v)}
                    className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono cursor-pointer transition-all flex items-center gap-1 ${
                      showCode
                        ? 'bg-sky-500 text-white border-sky-500 font-bold'
                        : 'border-neutral-400/40 hover:bg-neutral-500/10'
                    }`}
                  >
                    <Code2 className="h-3 w-3" />
                    <span>{showCode ? 'Collapse Code' : 'view config code'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyConfig}
                    className="px-2.5 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-[11px] font-mono cursor-pointer transition-all flex items-center gap-1 shadow-2xs"
                  >
                    {copiedConfig ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>
                      {copiedConfig ? 'config copied (Copied!)' : 'Copy Config (Copy Config)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetBoostGaugeConfig}
                    className="px-2 py-0.5 rounded-lg border border-neutral-400/40 text-[11px] font-mono cursor-pointer hover:bg-neutral-500/10 flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>reset to default</span>
                  </button>
                </div>
              </div>

              {showCode && (
                <div className="pt-1">
                  <CodeBlock
                    title="src/ui-core/stores/boostGaugeStore.ts (DEFAULT_BOOST_GAUGE_TOKENS)"
                    code={exportConfigCode()}
                    isLight={isLight}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <SliderControl
                  label="Advance Value (Dragging slider will pause 120Hz Stream and switch to manual inspection)"
                  value={boostAmount}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  colorScheme="sky"
                  isLight={isLight}
                  onChange={(v) => {
                    setIs120HzLive(false);
                    setBoostAmount(v);
                  }}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Infinite Advance (`--`):</span>
                    <ToggleSwitch
                      checked={isUnlimitedBoost}
                      onCheckedChange={setIsUnlimitedBoost}
                      isLight={isLight}
                    />
                  </div>

                  <div className="flex items-center gap-1 font-mono text-xs">
                    <span className="text-[11px] font-semibold mr-1">Dark Mode Override:</span>
                    {THEME_OVERRIDES.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setThemeOverride(opt.id)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] border cursor-pointer transition-all flex items-center gap-1 ${
                          themeOverride === opt.id
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold border-transparent'
                            : 'border-neutral-400/40 opacity-75 hover:opacity-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <HudBoostGaugePaletteAndModeControls
                is120HzLive={is120HzLive}
                setIs120HzLive={setIs120HzLive}
                boostAmount={boostAmount}
                setBoostAmount={setBoostAmount}
                setIsUnlimitedBoost={setIsUnlimitedBoost}
                onGaugeSizeChange={setGaugeSize}
              />

              <HudBoostGaugeGeometryControls
                isLight={isLight}
                inputCls={inputCls}
                onGaugeSizeChange={setGaugeSize}
              />
            </div>
          </div>
        </div>
      </section>
    </SectionErrorBoundary>
  );
};
