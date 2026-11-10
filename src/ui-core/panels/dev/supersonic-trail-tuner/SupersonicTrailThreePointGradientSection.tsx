import React from 'react';
import {
  updateSupersonicTrailConfig,
  midPctToAgeTicks,
  ageTicksToMidPct,
  type SupersonicTrailConfig,
  type SupersonicTrailBlendingMode,
} from '../../../config/supersonicTrailConfig';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { TunerColorRow } from '../../../compounds/TunerControls';
import {
  CubicBezierCurveEditor,
  type CubicBezierPreset,
} from '../../../charts/CubicBezierCurveEditor';

export const SUPERSONIC_COLOR_CURVE_PRESETS: CubicBezierPreset[] = [
  { name: 'Calibrated Stage 1 (0.60, 0.25, 0.62, 0.93)', value: { p1x: 0.6, p1y: 0.25, p2x: 0.62, p2y: 0.93 } },
  { name: 'Calibrated Stage 2 (0.10, 0.76, 0.14, 0.63)', value: { p1x: 0.1, p1y: 0.76, p2x: 0.14, p2y: 0.63 } },
  { name: 'Fast Attack (0.15, 0.85, 0.30, 1.0)', value: { p1x: 0.15, p1y: 0.85, p2x: 0.3, p2y: 1.0 } },
  { name: 'Linear (1:1)', value: { p1x: 0.33, p1y: 0.33, p2x: 0.67, p2y: 0.67 } },
  { name: 'S-Curve', value: { p1x: 0.45, p1y: 0.0, p2x: 0.55, p2y: 1.0 } },
];

export interface SupersonicTrailThreePointGradientSectionProps {
  cfg: SupersonicTrailConfig;
  isLight: boolean;
}

export const SupersonicTrailThreePointGradientSection: React.FC<
  SupersonicTrailThreePointGradientSectionProps
> = ({ cfg, isLight }) => {
  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const midPct = Math.max(1, Math.min(99, Number(cfg.midColorPosPct) || 24.1));
  const midTickId = midPctToAgeTicks(midPct, cfg.startAgeTicks, cfg.endAgeTicks);
  const minMidTick = Number((cfg.startAgeTicks + 0.5).toFixed(1));
  const maxMidTick = Number(Math.max(minMidTick + 0.5, cfg.endAgeTicks - 0.5).toFixed(1));

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
      <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1">
        <span className="font-bold text-[11px] text-purple-400">
          2. Three-Point Gradient (White → Pink → Purple) &amp; Bezier Curves
        </span>
        <span className="font-mono text-[10px] opacity-80">
          Mid @ {midPct.toFixed(1)}% (-{midTickId}t)
        </span>
      </div>

      {/* Live 3-Stop Gradient Preview Strip */}
      <div className="flex flex-col gap-1">
        <div
          className="relative h-4 w-full rounded-lg border border-neutral-500/30 overflow-hidden shadow-inner"
          style={{
            background: `linear-gradient(90deg, ${cfg.headColor} 0%, ${cfg.midColor} ${midPct}%, ${cfg.tailColor} 100%)`,
          }}
        >
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.9)]"
            style={{ left: `${midPct}%` }}
            title={`Mid Color Stop: ${midPct.toFixed(1)}% (-${midTickId}t)`}
          />
        </div>
        <div className={`flex items-center justify-between font-mono text-[9px] ${mutedText}`}>
          <span>Head: -{cfg.startAgeTicks}t ({cfg.headColor})</span>
          <span>
            Mid: {midPct.toFixed(1)}% / -{midTickId}t ({cfg.midColor})
          </span>
          <span>Tail: -{cfg.endAgeTicks}t ({cfg.tailColor})</span>
        </div>
      </div>

      <TunerColorRow
        label="1. Fresh Contact Head Color (-startAge)"
        description="Leading white color at the start of the active trail window"
        value={cfg.headColor}
        onChange={(headColor) => updateSupersonicTrailConfig({ headColor })}
        isLight={isLight}
      />

      <TunerColorRow
        label="2. Mid Transition Color (Pink Anchor)"
        description="Intermediate pink/magenta stop between white head and purple tail"
        value={cfg.midColor}
        onChange={(midColor) => updateSupersonicTrailConfig({ midColor })}
        isLight={isLight}
      />

      <TunerColorRow
        label="3. Aged Trail Tail Color (-endAge)"
        description="Trailing purple color as the trace reaches -endAgeTicks"
        value={cfg.tailColor}
        onChange={(tailColor) => updateSupersonicTrailConfig({ tailColor })}
        isLight={isLight}
      />

      {/* Midpoint Position: Adjustable by both Percentage (%) and Tick ID (-t) */}
      <div className="p-2 rounded-lg border border-pink-500/25 bg-pink-500/5 flex flex-col gap-2">
        <SliderControl
          label="Mid Pink Stop Position (%)"
          description={`Relative position along active window (corresponds to -${midTickId}t)`}
          value={midPct}
          min={1}
          max={99}
          step={0.1}
          unit="%"
          editable={true}
          onChange={(midColorPosPct) => updateSupersonicTrailConfig({ midColorPosPct })}
          isLight={isLight}
        />

        <SliderControl
          label="Mid Pink Stop Tick Age (-Tick ID)"
          description="Direct tick age override for the middle pink color stop"
          value={midTickId}
          min={minMidTick}
          max={maxMidTick}
          step={0.5}
          unit="t"
          editable={true}
          onChange={(tickVal) => {
            const nextPct = ageTicksToMidPct(tickVal, cfg.startAgeTicks, cfg.endAgeTicks);
            updateSupersonicTrailConfig({ midColorPosPct: nextPct });
          }}
          isLight={isLight}
        />
      </div>

      {/* Curve 1: Head (White) -> Mid (Pink) */}
      <CubicBezierCurveEditor
        title="Stage 1 Curve: Head (White) → Mid (Pink)"
        p1x={cfg.headToMidBezierP1X ?? 0.6}
        p1y={cfg.headToMidBezierP1Y ?? 0.25}
        p2x={cfg.headToMidBezierP2X ?? 0.62}
        p2y={cfg.headToMidBezierP2Y ?? 0.93}
        presets={SUPERSONIC_COLOR_CURVE_PRESETS}
        isLight={isLight}
        onChange={({ p1x, p1y, p2x, p2y }) =>
          updateSupersonicTrailConfig({
            headToMidBezierP1X: p1x,
            headToMidBezierP1Y: p1y,
            headToMidBezierP2X: p2x,
            headToMidBezierP2Y: p2y,
          })
        }
      />

      {/* Curve 2: Mid (Pink) -> Tail (Purple) */}
      <CubicBezierCurveEditor
        title="Stage 2 Curve: Mid (Pink) → Tail (Purple)"
        p1x={cfg.midToTailBezierP1X ?? 0.1}
        p1y={cfg.midToTailBezierP1Y ?? 0.76}
        p2x={cfg.midToTailBezierP2X ?? 0.14}
        p2y={cfg.midToTailBezierP2Y ?? 0.63}
        presets={SUPERSONIC_COLOR_CURVE_PRESETS}
        isLight={isLight}
        onChange={({ p1x, p1y, p2x, p2y }) =>
          updateSupersonicTrailConfig({
            midToTailBezierP1X: p1x,
            midToTailBezierP1Y: p1y,
            midToTailBezierP2X: p2x,
            midToTailBezierP2Y: p2y,
          })
        }
      />

      <SliderControl
        label="White Head Self-Emission Brightness"
        description="Overbright multiplier on the fresh head color"
        value={cfg.headGlowStrength}
        min={1.0}
        max={4.0}
        step={0.05}
        unit="x"
        editable={true}
        onChange={(headGlowStrength) => updateSupersonicTrailConfig({ headGlowStrength })}
        isLight={isLight}
      />

      <div className="flex flex-col gap-1">
        <span className={`text-[10px] font-semibold ${mutedText}`}>Blending Mode</span>
        <SegmentedSwitch
          value={cfg.blendingMode}
          onValueChange={(val) =>
            updateSupersonicTrailConfig({ blendingMode: val as SupersonicTrailBlendingMode })
          }
          options={[
            { value: 'normal', label: 'Normal Alpha Blend' },
            { value: 'additive', label: 'Additive Luminous (Glow)' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>
    </div>
  );
};
