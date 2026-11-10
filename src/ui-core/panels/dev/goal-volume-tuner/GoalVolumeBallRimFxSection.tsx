import React, { useState, useEffect } from 'react';
import { Sparkles, Palette } from 'lucide-react';
import {
  getGoalVolumeTunerConfig,
  subscribeGoalVolumeTunerConfig,
  updateGoalVolumeTunerConfig,
} from '../../../config/goalVolumeTunerConfig';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import {
  CubicBezierCurveEditor,
  type CubicBezierPreset,
} from '../../../charts/CubicBezierCurveEditor';
import { TunerColorRow } from '../../../compounds/TunerControls';

const BALL_RIM_BEZIER_PRESETS: CubicBezierPreset[] = [
  { name: 'Calibrated Default', value: { p1x: 0.75, p1y: 0.01, p2x: 1.0, p2y: 0.24 } },
  { name: 'Sharp Rim', value: { p1x: 0.42, p1y: 0.0, p2x: 0.85, p2y: 0.25 } },
  { name: 'Razor Edge', value: { p1x: 0.65, p1y: 0.0, p2x: 0.92, p2y: 0.1 } },
  { name: 'Smooth Ease', value: { p1x: 0.25, p1y: 0.1, p2x: 0.25, p2y: 1.0 } },
];

export interface GoalVolumeBallRimFxSectionProps {
  isLight?: boolean;
}

export const GoalVolumeBallRimFxSection: React.FC<GoalVolumeBallRimFxSectionProps> = ({
  isLight = false,
}) => {
  const [cfg, setCfg] = useState(() => getGoalVolumeTunerConfig());

  useEffect(() => {
    return subscribeGoalVolumeTunerConfig((next: ReturnType<typeof getGoalVolumeTunerConfig>) => {
      setCfg(next);
    });
  }, []);

  const rimFx = cfg.ballRimFx;
  const applyRimFxPatch = (patch: Partial<typeof rimFx>) => {
    updateGoalVolumeTunerConfig({
      ballRimFx: {
        ...rimFx,
        ...patch,
      },
    });
  };

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const innerPctClamped = Math.max(0, Math.min(99.9, Number(rimFx.innerStartPct) ?? 90));
  const outerPctClamped = Math.max(
    innerPctClamped + 0.1,
    Math.min(100, Number(rimFx.outerEndPct) ?? 100)
  );

  return (
    <>
      {/* Enable In-Goal Ball Rim & Dark Core FX */}
      <div className={`p-2.5 rounded-xl border flex items-center justify-between shrink-0 ${cardBg}`}>
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex flex-col leading-snug min-w-0">
            <span className="font-semibold text-xs truncate">
              Enable In-Goal Dark Core &amp; Outer Rim Glow
            </span>
            <span className={`text-[10px] mt-0.5 truncate ${mutedText}`}>
              Darkens ball inside the goal plane with a curved radial rim outline and 3D jitter
            </span>
          </div>
        </div>
        <ToggleSwitch
          checked={Boolean(rimFx.enabled)}
          onCheckedChange={(checked) => applyRimFxPatch({ enabled: checked })}
          isLight={isLight}
        />
      </div>

      {/* Radial Rim Band Percentage (e.g. 90% -> 100%) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 shrink-0 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wide">
            1. Radial Rim Thickness Band (0% Center -&gt; 100% Edge)
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
            Band: {innerPctClamped.toFixed(1)}% - {outerPctClamped.toFixed(1)}% (
            {(outerPctClamped - innerPctClamped).toFixed(1)}% thick)
          </span>
        </div>

        {/* Live Radial Band Preview Bar */}
        <div
          className="h-4 w-full rounded-lg border border-neutral-600/60 overflow-hidden relative"
          style={{
            background: `linear-gradient(90deg, ${rimFx.coreColor} 0%, ${rimFx.coreColor} ${innerPctClamped}%, ${rimFx.rimColor} ${outerPctClamped}%, ${rimFx.rimColor} 100%)`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-mono font-bold mix-blend-difference text-white pointer-events-none">
            <span>0% Center (Dark Core)</span>
            <span>{innerPctClamped.toFixed(1)}% Start</span>
            <span>{outerPctClamped.toFixed(1)}% Outer Rim</span>
          </div>
        </div>

        <SliderControl
          label="Rim Gradient Inner Start (%)"
          description="Sphere radius percentage where dark core begins transitioning to rim glow (e.g. 90%)"
          value={rimFx.innerStartPct}
          min={0}
          max={99.5}
          step={0.5}
          editable={true}
          onChange={(val) =>
            applyRimFxPatch({
              innerStartPct: Math.min(val, (rimFx.outerEndPct ?? 100) - 0.5),
            })
          }
          isLight={isLight}
        />

        <SliderControl
          label="Rim Gradient Outer End (%)"
          description="Sphere silhouette edge percentage where rim reaches full intensity (default 100%)"
          value={rimFx.outerEndPct}
          min={5}
          max={100}
          step={0.5}
          editable={true}
          onChange={(val) =>
            applyRimFxPatch({
              outerEndPct: Math.max(val, (rimFx.innerStartPct ?? 90) + 0.5),
            })
          }
          isLight={isLight}
        />
      </div>

      {/* Interactive Cubic-Bezier Gradient Curve Controller */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 shrink-0 ${cardBg}`}>
        <CubicBezierCurveEditor
          title="2. Core-to-Rim Gradient Curve (Inner Start % -> Outer Edge %)"
          p1x={rimFx.bezierP1X}
          p1y={rimFx.bezierP1Y}
          p2x={rimFx.bezierP2X}
          p2y={rimFx.bezierP2Y}
          presets={BALL_RIM_BEZIER_PRESETS}
          onChange={(next) =>
            applyRimFxPatch({
              bezierP1X: next.p1x,
              bezierP1Y: next.p1y,
              bezierP2X: next.p2x,
              bezierP2Y: next.p2y,
            })
          }
          isLight={isLight}
        />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <SliderControl
            label="Control Point P1.X"
            value={rimFx.bezierP1X}
            min={0}
            max={1}
            step={0.01}
            editable={true}
            onChange={(val) => applyRimFxPatch({ bezierP1X: val })}
            isLight={isLight}
          />
          <SliderControl
            label="Control Point P1.Y"
            value={rimFx.bezierP1Y}
            min={-1}
            max={2}
            step={0.01}
            editable={true}
            onChange={(val) => applyRimFxPatch({ bezierP1Y: val })}
            isLight={isLight}
          />
          <SliderControl
            label="Control Point P2.X"
            value={rimFx.bezierP2X}
            min={0}
            max={1}
            step={0.01}
            editable={true}
            onChange={(val) => applyRimFxPatch({ bezierP2X: val })}
            isLight={isLight}
          />
          <SliderControl
            label="Control Point P2.Y"
            value={rimFx.bezierP2Y}
            min={-1}
            max={2}
            step={0.01}
            editable={true}
            onChange={(val) => applyRimFxPatch({ bezierP2Y: val })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Dual Color & Brightness Controls (Rim White vs Core Black) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 shrink-0 ${cardBg}`}>
        <div className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-bold text-xs uppercase tracking-wide">
            3. Rim &amp; Core Colors &amp; Brightness
          </span>
        </div>

        <TunerColorRow
          label="Outer Rim Glow Color"
          description="Base color for the outer silhouette rim outline"
          value={rimFx.rimColor}
          onChange={(hex) => applyRimFxPatch({ rimColor: hex })}
          isLight={isLight}
        />

        <SliderControl
          label="Outer Rim Brightness / Intensity"
          description="Controls how bright/white the outer rim glow renders (0.0 - 3.0)"
          value={rimFx.rimIntensity}
          min={0}
          max={3}
          step={0.02}
          editable={true}
          onChange={(val) => applyRimFxPatch({ rimIntensity: val })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Inner Dark Core Color"
          description="Base color for the darkened ball interior inside the goal"
          value={rimFx.coreColor}
          onChange={(hex) => applyRimFxPatch({ coreColor: hex })}
          isLight={isLight}
        />

        <SliderControl
          label="Inner Core Brightness Multiplier"
          description="Controls how dark the core is (0.0 = pure pitch black, 1.0 = exact core hex color)"
          value={rimFx.coreBrightness}
          min={0}
          max={2}
          step={0.02}
          editable={true}
          onChange={(val) => applyRimFxPatch({ coreBrightness: val })}
          isLight={isLight}
        />
      </div>

      {/* Goal Plane Seam & 3D Jitter Controls */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 shrink-0 ${cardBg}`}>
        <span className="font-bold text-xs uppercase tracking-wide">
          4. Goal-Line Intersection Seam &amp; 3D Jitter
        </span>

        <SliderControl
          label="Goal-Plane Seam Glow Width (UU)"
          description="Width of the highlight ring where the ball intersects the goal plane (0 = off)"
          value={rimFx.seamWidthUu}
          min={0}
          max={25}
          step={0.25}
          editable={true}
          onChange={(val) => applyRimFxPatch({ seamWidthUu: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Goal-Plane Seam Glow Intensity"
          description="Opacity of the goal-plane intersection seam (set to 0 to show only outer silhouette rim)"
          value={rimFx.seamIntensity}
          min={0}
          max={1.5}
          step={0.02}
          editable={true}
          onChange={(val) => applyRimFxPatch({ seamIntensity: val })}
          isLight={isLight}
        />

        <SliderControl
          label="In-Goal 3D Jitter Amplitude Multiplier"
          description="Scales the high-frequency 3D vibration amplitude while inside the goal"
          value={rimFx.jitterAmplitude}
          min={0}
          max={3}
          step={0.05}
          editable={true}
          onChange={(val) => applyRimFxPatch({ jitterAmplitude: val })}
          isLight={isLight}
        />
      </div>
    </>
  );
};
