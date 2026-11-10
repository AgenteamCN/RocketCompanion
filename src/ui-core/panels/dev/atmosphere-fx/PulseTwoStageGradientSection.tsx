import React from 'react';
import { SliderControl } from '../../../primitives/SliderControl';
import {
  CubicBezierCurveEditor,
  type CubicBezierPreset,
} from '../../../charts/CubicBezierCurveEditor';
import { DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG } from '../../../config/atmosphereFxConfig';

export const PULSE_WAVE_HALF_BEZIER_PRESETS: CubicBezierPreset[] = [
  { name: 'Linear (1:1)', value: { p1x: 0.33, p1y: 0.33, p2x: 0.67, p2y: 0.67 } },
  { name: 'Default Fall (0, 0.5, 0, 1.01)', value: { p1x: 0.00, p1y: 0.50, p2x: 0.00, p2y: 1.01 } },
  { name: 'Smooth Ease', value: { p1x: 0.40, p1y: 0.00, p2x: 0.20, p2y: 1.00 } },
  { name: 'Fast Attack / Sharp', value: { p1x: 0.15, p1y: 0.90, p2x: 0.30, p2y: 1.00 } },
  { name: 'Slow Ramp / Exp', value: { p1x: 0.65, p1y: 0.00, p2x: 0.90, p2y: 0.45 } },
];

export interface PulseTwoStageGradientSectionProps {
  wallConfig: typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG;
  applyWallPatch: (patch: Partial<typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG>) => void;
  isLight: boolean;
}

export const PulseTwoStageGradientSection: React.FC<PulseTwoStageGradientSectionProps> = ({
  wallConfig,
  applyWallPatch,
  isLight,
}) => {
  const riseSec = Number(wallConfig.pulseRiseDurationSec ?? 0.01);
  const fallSec = Number(wallConfig.pulseFallDurationSec ?? 0.2);
  const totalWaveSec = Number((riseSec + fallSec).toFixed(4));
  const speedPct = Number(wallConfig.pulseSpeedRadiusPct ?? 50);
  const effectiveBandPct = Number((speedPct * totalWaveSec).toFixed(2));

  return (
    <div className="p-2 rounded-lg border border-amber-500/25 bg-amber-500/5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] text-amber-400">
          Two-Stage Pulse Wave Gradient (0 → 1 Rise &amp; 1 → 0 Fall)
        </span>
        <span className="text-[10px] font-mono opacity-80 shrink-0">
          Band: {totalWaveSec}s (~{effectiveBandPct}% R)
        </span>
      </div>

      {/* Half 1: 0 -> 1 (Dark to Bright) */}
      <SliderControl
        label="Part 1 (0 → 1 Rise / Fade-In) Duration"
        description="Duration of the leading half of the pulse wave (0.0001s – 0.5s, supports manual input)"
        value={riseSec}
        min={0.0001}
        max={0.5}
        step={0.0001}
        unit="s"
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(val) =>
          applyWallPatch({
            pulseRiseDurationSec: Math.max(0.0001, Number(val.toFixed(5))),
          })
        }
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <CubicBezierCurveEditor
        title="Part 1 Curve: 0 → 1 (Dark to Peak Bright)"
        p1x={wallConfig.pulseRiseBezierP1X ?? 0.33}
        p1y={wallConfig.pulseRiseBezierP1Y ?? 0.33}
        p2x={wallConfig.pulseRiseBezierP2X ?? 0.67}
        p2y={wallConfig.pulseRiseBezierP2Y ?? 0.67}
        presets={PULSE_WAVE_HALF_BEZIER_PRESETS}
        isLight={isLight}
        onChange={({ p1x, p1y, p2x, p2y }) =>
          applyWallPatch({
            pulseRiseBezierP1X: p1x,
            pulseRiseBezierP1Y: p1y,
            pulseRiseBezierP2X: p2x,
            pulseRiseBezierP2Y: p2y,
          })
        }
      />

      {/* Half 2: 1 -> 0 (Bright to Dark) */}
      <SliderControl
        label="Part 2 (1 → 0 Fall / Fade-Out) Duration"
        description="Duration of the trailing half of the pulse wave (0.0001s – 0.5s, supports manual input)"
        value={fallSec}
        min={0.0001}
        max={0.5}
        step={0.0001}
        unit="s"
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(val) =>
          applyWallPatch({
            pulseFallDurationSec: Math.max(0.0001, Number(val.toFixed(5))),
          })
        }
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <CubicBezierCurveEditor
        title="Part 2 Curve: 1 → 0 (Peak Bright to Dark, y = 1 - bezier(t))"
        p1x={wallConfig.pulseFallBezierP1X ?? 0.0}
        p1y={wallConfig.pulseFallBezierP1Y ?? 0.5}
        p2x={wallConfig.pulseFallBezierP2X ?? 0.0}
        p2y={wallConfig.pulseFallBezierP2Y ?? 1.01}
        presets={PULSE_WAVE_HALF_BEZIER_PRESETS}
        isLight={isLight}
        onChange={({ p1x, p1y, p2x, p2y }) =>
          applyWallPatch({
            pulseFallBezierP1X: p1x,
            pulseFallBezierP1Y: p1y,
            pulseFallBezierP2X: p2x,
            pulseFallBezierP2Y: p2y,
          })
        }
      />
    </div>
  );
};
