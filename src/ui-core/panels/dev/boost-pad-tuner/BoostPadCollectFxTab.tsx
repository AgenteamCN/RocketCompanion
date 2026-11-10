import React, { useState } from 'react';
import { Zap, Play, Sparkles, Copy, Check, CircleDot, Flame } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { type BoostPadTunerConfig } from '../../../config/uiConfig';
import { TunerRow } from '../../../compounds/TunerControls';
import { CubicBezierCurveEditor } from '../../../charts/CubicBezierCurveEditor';
import { ParametricTrajectoryChart } from '../../../charts/ParametricTrajectoryChart';

export interface BoostPadCollectFxTabProps {
  tuner: BoostPadTunerConfig;
  updateTuner: (patch: Partial<BoostPadTunerConfig>) => void;
  isLight?: boolean;
  onSimulate?: (padIndex?: number | 'all') => void;
}

export const BoostPadCollectFxTab: React.FC<BoostPadCollectFxTabProps> = ({
  tuner,
  updateTuner,
  isLight = false,
  onSimulate,
}) => {
  const [simulatingIndex, setSimulatingIndex] = useState<number | 'all' | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleSimulate = (target: number | 'all') => {
    setSimulatingIndex(target);
    if (typeof onSimulate === 'function') {
      onSimulate(target);
    } else {
      useAppStore.getState().bridge.onSimulateBoostPadCollect?.(target);
    }
    setTimeout(() => setSimulatingIndex(null), 500);
  };

  const handleCopyParams = () => {
    try {
      const json = JSON.stringify(tuner, null, 2);
      navigator.clipboard?.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[BoostPadCollectFxTab] Failed to copy config:', err);
    }
  };

  // Safe defaults
  const orbDuration = tuner.orbCollectDuration ?? 200;
  const orbDrop = tuner.orbDropDistance ?? 175;
  const orbP1X = tuner.orbBezierP1X ?? 0;
  const orbP1Y = tuner.orbBezierP1Y ?? -1.15;
  const orbP2X = tuner.orbBezierP2X ?? 0;
  const orbP2Y = tuner.orbBezierP2Y ?? 1;

  const glowDuration = tuner.collectDuration ?? 300;
  const glowP1X = tuner.bezierP1X ?? 0;
  const glowP1Y = tuner.bezierP1Y ?? -3;
  const glowP2X = tuner.bezierP2X ?? 0;
  const glowP2Y = tuner.bezierP2Y ?? 1;

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Header Toolbar with Simulation Buttons & Copy */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Zap className="h-3 w-3" />
          <span>Collection Feedback & Deformation</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleSimulate(0)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
              simulatingIndex === 0
                ? 'bg-amber-500 text-black border-amber-400'
                : isLight
                ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900 shadow-sm'
                : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
            }`}
            title="Simulate pickup on Big Boost Pad #0 (Sphere Leap & Plunge)"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Big Pad #0</span>
          </button>

          <button
            type="button"
            onClick={() => handleSimulate('all')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
              simulatingIndex === 'all'
                ? 'bg-amber-500 text-black border-amber-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 shadow-sm'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
            title="Trigger instantaneous collect animation on all 34 arena pads simultaneously"
          >
            <Sparkles className="h-3 w-3" />
            <span>All Pads</span>
          </button>

          <button
            type="button"
            onClick={handleCopyParams}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700 shadow-sm'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
            title="Copy complete parameters JSON to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. SECTION A: Big Boost Orb Leap & Plunge Animation */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-2 transition-colors ${
          isLight ? 'bg-neutral-100/40 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-400">
            <CircleDot className="h-3.5 w-3.5 text-amber-500" />
            <span>Big Pad Floating Orb Animation</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400">Independent Cubic-Bezier</span>
        </div>

        {/* Trajectory Visualizer Chart */}
        <ParametricTrajectoryChart
          p1x={orbP1X}
          p1y={orbP1Y}
          p2x={orbP2X}
          p2y={orbP2Y}
          durationMs={orbDuration}
          dropDistance={orbDrop}
          isLight={isLight}
        />

        {/* Orb Animation Controls */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="grid grid-cols-2 gap-1.5">
            <TunerRow
              label="Orb Duration"
              description="Drop execution time"
              value={orbDuration}
              sliderMin={50}
              sliderMax={1000}
              sliderStep={10}
              onChange={(val) => updateTuner({ orbCollectDuration: val })}
              isLight={isLight}
              unit="ms"
            />
            <TunerRow
              label="Drop Distance"
              description="Final underground sink depth"
              value={orbDrop}
              sliderMin={20}
              sliderMax={300}
              sliderStep={5}
              onChange={(val) => updateTuner({ orbDropDistance: val })}
              isLight={isLight}
              unit="uu"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <TunerRow
              label="Orb P1.X"
              value={orbP1X}
              sliderMin={0.0}
              sliderMax={1.0}
              sliderStep={0.01}
              onChange={(val) => updateTuner({ orbBezierP1X: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Orb P1.Y"
              description="Negative Y creates upward anticipation leap"
              value={orbP1Y}
              sliderMin={-5.0}
              sliderMax={3.0}
              sliderStep={0.05}
              onChange={(val) => updateTuner({ orbBezierP1Y: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Orb P2.X"
              value={orbP2X}
              sliderMin={0.0}
              sliderMax={1.0}
              sliderStep={0.01}
              onChange={(val) => updateTuner({ orbBezierP2X: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Orb P2.Y"
              value={orbP2Y}
              sliderMin={-5.0}
              sliderMax={3.0}
              sliderStep={0.05}
              onChange={(val) => updateTuner({ orbBezierP2Y: val })}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* 3. SECTION B: Upward Hologram Glow Dissolve */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-2 transition-colors ${
          isLight ? 'bg-neutral-100/40 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-400">
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span>Upward Hologram Glow Dissolve</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400">Vertical Collapse</span>
        </div>

        {/* Glow Cubic Bezier Curve */}
        <CubicBezierCurveEditor
          title="Glow Collapse Curve"
          p1x={glowP1X}
          p1y={glowP1Y}
          p2x={glowP2X}
          p2y={glowP2Y}
          onChange={(next) =>
            updateTuner({
              bezierP1X: next.p1x,
              bezierP1Y: next.p1y,
              bezierP2X: next.p2x,
              bezierP2Y: next.p2y,
            })
          }
          isLight={isLight}
        />

        {/* Glow Timing & Easing Sliders */}
        <div className="flex flex-col gap-1.5 mt-1">
          <TunerRow
            label="Glow Duration"
            description="Total execution time for the vertical collapse and suck-down"
            value={glowDuration}
            sliderMin={50}
            sliderMax={1000}
            sliderStep={10}
            onChange={(val) => updateTuner({ collectDuration: val })}
            isLight={isLight}
            unit="ms"
          />

          <div className="grid grid-cols-2 gap-1.5">
            <TunerRow
              label="Glow P1.X"
              value={glowP1X}
              sliderMin={0.0}
              sliderMax={1.0}
              sliderStep={0.01}
              onChange={(val) => updateTuner({ bezierP1X: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Glow P1.Y"
              value={glowP1Y}
              sliderMin={-5.0}
              sliderMax={3.0}
              sliderStep={0.05}
              onChange={(val) => updateTuner({ bezierP1Y: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Glow P2.X"
              value={glowP2X}
              sliderMin={0.0}
              sliderMax={1.0}
              sliderStep={0.01}
              onChange={(val) => updateTuner({ bezierP2X: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Glow P2.Y"
              value={glowP2Y}
              sliderMin={-5.0}
              sliderMax={3.0}
              sliderStep={0.05}
              onChange={(val) => updateTuner({ bezierP2Y: val })}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* 4. Information Card */}
      <div
        className={`p-2.5 rounded-xl border text-[11px] leading-relaxed transition-colors font-mono ${
          isLight
            ? 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
            : 'bg-neutral-900/40 border-neutral-800 text-neutral-400'
        }`}
      >
        <div className="font-semibold text-amber-500 mb-0.5">• Decoupled Collect Mechanics</div>
        <div>• Floating orb leaps upward (+ΔY) on negative control point Y before smoothly sinking underground.</div>
        <div>• Upward hologram glow collapses vertically with independent cubic-bezier timing.</div>
        <div>• Both animation curves run simultaneously and synchronize without popping.</div>
      </div>
    </div>
  );
};
