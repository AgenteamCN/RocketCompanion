import React from 'react';
import { MoveVertical, Spline } from 'lucide-react';
import { CubicBezierCurveEditor } from '../../../ui-core/charts/CubicBezierCurveEditor';
import { ParametricTrajectoryChart } from '../../../ui-core/charts/ParametricTrajectoryChart';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { useChartsAndCurvesSyncedState } from './useChartsAndCurvesSyncedState';

export interface ChartsBezierTrajectorySectionProps {
  isLight: boolean;
}

export const ChartsBezierTrajectorySection: React.FC<
  ChartsBezierTrajectorySectionProps
> = ({ isLight }) => {
  const {
    orbBezier,
    setOrbBezier,
    orbDurationMs,
    setOrbDurationMs,
    orbDropDistance,
    setOrbDropDistance,
    glowBezier,
    setGlowBezier,
  } = useChartsAndCurvesSyncedState();

  return (
    <div
      id="chart-5b-3-bezier"
      className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
        isLight
          ? 'bg-white border-neutral-200 shadow-2xs'
          : 'bg-neutral-900/60 border-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Spline className="h-4 w-4 text-amber-500" />
          <span className="font-bold text-sm">
            3 &amp; 4. Interactive cubic Bezier curves and parametric physical trajectory extreme value analysis (CubicBezierCurveEditor &amp; ParametricTrajectoryChart)
          </span>
        </div>
        <Badge size="sm" variant="amber" isLight={isLight}>
          Direct drag control points + Center positive/negative bidirectional slider linkage
        </Badge>
      </div>
      <p className={`text-xs ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
        Left image supports direct SVG Drag on canvas <code className="font-mono text-amber-500">P1</code> and{' '}
        <code className="font-mono text-pink-500">P2</code> Handle (Or click preset button) , Real-time derivative
        analysis of right chart <code className="font-mono">dy/du = 0</code> Calculate the upward peak jump when
        picking up a large speed ball (<code className="font-mono">Peak Lift +uu</code>) and peak time. Bottom
        control bar uses center-outward bidirectional fill <code className="font-mono">variation="centered"</code>{' '}
        Adjust positive/negative control point coordinates:
      </p>
      <div id="chart-5b-4-trajectory" className="scroll-mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CubicBezierCurveEditor
          title="Orb Collect Easing (Drag P1 / P2)"
          p1x={orbBezier.p1x}
          p1y={orbBezier.p1y}
          p2x={orbBezier.p2x}
          p2y={orbBezier.p2y}
          onChange={setOrbBezier}
          isLight={isLight}
        />

        <ParametricTrajectoryChart
          title="Big Boost Orb Vertical Trajectory"
          p1x={orbBezier.p1x}
          p1y={orbBezier.p1y}
          p2x={orbBezier.p2x}
          p2y={orbBezier.p2y}
          durationMs={orbDurationMs}
          dropDistance={orbDropDistance}
          isLight={isLight}
        />
      </div>

      {/* Centered Bipolar Sliders controlling P1.Y, P2.Y, Duration, Drop Distance */}
      <div
        className={`p-4 rounded-xl border grid grid-cols-1 md:grid-cols-2 gap-4 ${
          isLight
            ? 'bg-neutral-50/80 border-neutral-200'
            : 'bg-neutral-950/60 border-neutral-800'
        }`}
      >
        <SliderControl
          label="Orb P1.Y (Negative = Upward Leap)"
          value={orbBezier.p1y}
          min={-4.0}
          max={3.0}
          step={0.05}
          origin={0}
          variation="centered"
          showSign={true}
          colorScheme="amber"
          negativeColorScheme="sky"
          editable={true}
          onChange={(val) => setOrbBezier((prev) => ({ ...prev, p1y: val }))}
          isLight={isLight}
        />

        <SliderControl
          label="Orb P2.Y (Terminal Plunge Tangent)"
          value={orbBezier.p2y}
          min={-4.0}
          max={3.0}
          step={0.05}
          origin={0}
          variation="centered"
          showSign={true}
          colorScheme="amber"
          negativeColorScheme="sky"
          editable={true}
          onChange={(val) => setOrbBezier((prev) => ({ ...prev, p2y: val }))}
          isLight={isLight}
        />

        <SliderControl
          label="Collect Duration"
          value={orbDurationMs}
          min={50}
          max={800}
          step={10}
          unit="ms"
          colorScheme="neutral"
          editable={true}
          onChange={setOrbDurationMs}
          isLight={isLight}
        />

        <SliderControl
          label="Drop Distance"
          value={orbDropDistance}
          min={20}
          max={300}
          step={5}
          unit="uu"
          colorScheme="neutral"
          editable={true}
          onChange={setOrbDropDistance}
          isLight={isLight}
        />
      </div>

      {/* Second Simultaneous Instance Proof (No SVG Gradient ID Collision) */}
      <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-neutral-400 flex items-center gap-1.5">
            <MoveVertical className="h-3.5 w-3.5 text-emerald-500" />
            <span>
              Multi-instance co-existence verification (via{' '}
              <code className="font-mono text-emerald-500">useId()</code> Isolation SVG Gradient ID, No color bleeding) :
            </span>
          </span>
        </div>
        <CubicBezierCurveEditor
          title="Second Coexisting Curve Instance (Hologram Glow Dissolve)"
          p1x={glowBezier.p1x}
          p1y={glowBezier.p1y}
          p2x={glowBezier.p2x}
          p2y={glowBezier.p2y}
          onChange={setGlowBezier}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
