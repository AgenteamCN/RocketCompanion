import React from 'react';
import {
  updatePerformanceBoostConfig,
  type PerformanceBoostConfig,
  type PerformanceBoostColorMode,
  type PerformanceBoostBlendingMode,
} from '../../../config/performanceBoostConfig';
import {
  midPctToAgeTicks,
  ageTicksToMidPct,
} from '../../../config/supersonicTrailConfig';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { TunerColorRow } from '../../../compounds/TunerControls';
import {
  CubicBezierCurveEditor,
  type CubicBezierPreset,
} from '../../../charts/CubicBezierCurveEditor';

const PERFORMANCE_BOOST_CURVE_PRESETS: CubicBezierPreset[] = [
  { name: 'Calibrated Stage 1 (0.55, 0.25, 0.62, 0.92)', value: { p1x: 0.55, p1y: 0.25, p2x: 0.62, p2y: 0.92 } },
  { name: 'Calibrated Stage 2 (0.15, 0.72, 0.25, 0.68)', value: { p1x: 0.15, p1y: 0.72, p2x: 0.25, p2y: 0.68 } },
  { name: 'Supersonic Stage 1 (0.60, 0.25, 0.62, 0.93)', value: { p1x: 0.6, p1y: 0.25, p2x: 0.62, p2y: 0.93 } },
  { name: 'Supersonic Stage 2 (0.10, 0.76, 0.14, 0.63)', value: { p1x: 0.1, p1y: 0.76, p2x: 0.14, p2y: 0.63 } },
  { name: 'Linear (1:1)', value: { p1x: 0.33, p1y: 0.33, p2x: 0.67, p2y: 0.67 } },
];

export interface PerformanceBoostColorSectionProps {
  cfg: PerformanceBoostConfig;
  isLight: boolean;
}

export const PerformanceBoostColorSection: React.FC<
  PerformanceBoostColorSectionProps
> = ({ cfg, isLight }) => {
  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const midPct = Math.max(1, Math.min(99, Number(cfg.midColorPosPct) || 28));
  const midTickId = midPctToAgeTicks(midPct, cfg.startAgeTicks, cfg.endAgeTicks);
  const minMidTick = Number((cfg.startAgeTicks + 0.5).toFixed(1));
  const maxMidTick = Number(Math.max(minMidTick + 0.5, cfg.endAgeTicks - 0.5).toFixed(1));

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
      <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1">
        <span className="font-bold text-[11px] text-amber-400">
          4. Color Variation (Single Monochrome vs 3-Stop Gradient)
        </span>
        <span className="font-mono text-[10px] opacity-80">
          {cfg.colorMode === 'solid'
            ? `Solid ${cfg.solidColor}`
            : `Mid @ ${midPct.toFixed(1)}%`}
        </span>
      </div>

      <SegmentedSwitch
        value={cfg.colorMode}
        onValueChange={(val) =>
          updatePerformanceBoostConfig({
            colorMode: val as PerformanceBoostColorMode,
          })
        }
        options={[
          { value: 'solid', label: 'Single Color (Monochrome)' },
          { value: 'gradient', label: '3-Stop Gradient (Supersonic Style)' },
        ]}
        size="sm"
        fullWidth
        isLight={isLight}
      />

      {cfg.colorMode === 'solid' ? (
        <div className="flex flex-col gap-2">
          <div
            className="h-4 w-full rounded-lg border border-neutral-500/30 shadow-inner"
            style={{
              background: `linear-gradient(90deg, #ffffff 0%, ${cfg.solidColor} 28%, ${cfg.solidColor} 100%)`,
            }}
          />

          <TunerColorRow
            label="Primary Boost Monochrome Color"
            description="Single color used across the entire beam/ribbon with a hot cylindrical core"
            value={cfg.solidColor}
            onChange={(solidColor) => updatePerformanceBoostConfig({ solidColor })}
            isLight={isLight}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
                title={`Mid Color Stop: ${midPct.toFixed(1)}%`}
              />
            </div>
            <div className={`flex items-center justify-between font-mono text-[9px] ${mutedText}`}>
              <span>Head: {cfg.headColor}</span>
              <span>
                Mid: {midPct.toFixed(1)}% ({cfg.midColor})
              </span>
              <span>Tail: {cfg.tailColor}</span>
            </div>
          </div>

          <TunerColorRow
            label="1. Nozzle Head Color (Start)"
            description="Leading color at the exhaust nozzle"
            value={cfg.headColor}
            onChange={(headColor) => updatePerformanceBoostConfig({ headColor })}
            isLight={isLight}
          />

          <TunerColorRow
            label="2. Mid Transition Color"
            description="Intermediate color stop along the boost plume"
            value={cfg.midColor}
            onChange={(midColor) => updatePerformanceBoostConfig({ midColor })}
            isLight={isLight}
          />

          <TunerColorRow
            label="3. Far Tail Color (Expire End)"
            description="Trailing color as the boost fades out"
            value={cfg.tailColor}
            onChange={(tailColor) => updatePerformanceBoostConfig({ tailColor })}
            isLight={isLight}
          />

          <div className="p-2 rounded-lg border border-amber-500/25 bg-amber-500/5 flex flex-col gap-2">
            <SliderControl
              label="Mid Color Stop Position (%)"
              description="Relative position of the middle color stop along the active boost length"
              value={midPct}
              min={1}
              max={99}
              step={0.5}
              unit="%"
              editable={true}
              onChange={(midColorPosPct) =>
                updatePerformanceBoostConfig({ midColorPosPct })
              }
              isLight={isLight}
            />

            {cfg.mode === 'trail' && (
              <SliderControl
                label="Mid Stop Tick Age (-Tick ID)"
                description="Direct 120Hz tick age override for the middle color stop"
                value={midTickId}
                min={minMidTick}
                max={maxMidTick}
                step={0.5}
                unit="t"
                editable={true}
                onChange={(tickVal) => {
                  const nextPct = ageTicksToMidPct(
                    tickVal,
                    cfg.startAgeTicks,
                    cfg.endAgeTicks
                  );
                  updatePerformanceBoostConfig({ midColorPosPct: nextPct });
                }}
                isLight={isLight}
              />
            )}
          </div>

          <CubicBezierCurveEditor
            title="Stage 1 Curve: Head → Mid"
            p1x={cfg.headToMidBezierP1X ?? 0.55}
            p1y={cfg.headToMidBezierP1Y ?? 0.25}
            p2x={cfg.headToMidBezierP2X ?? 0.62}
            p2y={cfg.headToMidBezierP2Y ?? 0.92}
            presets={PERFORMANCE_BOOST_CURVE_PRESETS}
            isLight={isLight}
            onChange={({ p1x, p1y, p2x, p2y }) =>
              updatePerformanceBoostConfig({
                headToMidBezierP1X: p1x,
                headToMidBezierP1Y: p1y,
                headToMidBezierP2X: p2x,
                headToMidBezierP2Y: p2y,
              })
            }
          />

          <CubicBezierCurveEditor
            title="Stage 2 Curve: Mid → Tail"
            p1x={cfg.midToTailBezierP1X ?? 0.15}
            p1y={cfg.midToTailBezierP1Y ?? 0.72}
            p2x={cfg.midToTailBezierP2X ?? 0.25}
            p2y={cfg.midToTailBezierP2Y ?? 0.68}
            presets={PERFORMANCE_BOOST_CURVE_PRESETS}
            isLight={isLight}
            onChange={({ p1x, p1y, p2x, p2y }) =>
              updatePerformanceBoostConfig({
                midToTailBezierP1X: p1x,
                midToTailBezierP1Y: p1y,
                midToTailBezierP2X: p2x,
                midToTailBezierP2Y: p2y,
              })
            }
          />
        </div>
      )}

      <SliderControl
        label="Head Self-Emission Brightness"
        description="Overbright multiplier on the nozzle head and cylindrical core"
        value={cfg.headGlowStrength}
        min={0.5}
        max={4.0}
        step={0.05}
        unit="x"
        editable={true}
        onChange={(headGlowStrength) =>
          updatePerformanceBoostConfig({ headGlowStrength })
        }
        isLight={isLight}
      />

      <div className="flex flex-col gap-1">
        <span className={`text-[10px] font-semibold ${mutedText}`}>Blending Mode</span>
        <SegmentedSwitch
          value={cfg.blendingMode}
          onValueChange={(val) =>
            updatePerformanceBoostConfig({
              blendingMode: val as PerformanceBoostBlendingMode,
            })
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
