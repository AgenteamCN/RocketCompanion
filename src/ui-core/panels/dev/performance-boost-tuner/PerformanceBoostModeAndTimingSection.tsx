import React from 'react';
import {
  updatePerformanceBoostConfig,
  type PerformanceBoostConfig,
  type PerformanceBoostMode,
} from '../../../config/performanceBoostConfig';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface PerformanceBoostModeAndTimingSectionProps {
  cfg: PerformanceBoostConfig;
  isLight: boolean;
}

export const PerformanceBoostModeAndTimingSection: React.FC<
  PerformanceBoostModeAndTimingSectionProps
> = ({ cfg, isLight }) => {
  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const startSec = (cfg.startAgeTicks / 120).toFixed(3);
  const endSec = (cfg.endAgeTicks / 120).toFixed(3);
  const visibleSec = (Math.max(1, cfg.endAgeTicks - cfg.startAgeTicks) / 120).toFixed(3);

  return (
    <div className="flex flex-col gap-2.5 shrink-0">
      {/* 1. Architecture Mode & Center Nozzle Merge */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1">
          <span className="font-bold text-[11px] text-amber-400">
            1. Extreme Performance Rendering Mode
          </span>
          <span className="font-mono text-[10px] opacity-80">
            Bloom: OFF · PointLight: OFF
          </span>
        </div>

        <SegmentedSwitch
          value={cfg.mode}
          onValueChange={(val) =>
            updatePerformanceBoostConfig({ mode: val as PerformanceBoostMode })
          }
          options={[
            { value: 'attach', label: '1. Light Beam (Pose-Attached)' },
            { value: 'trail', label: '2. Light Wave (Trajectory Ribbon)' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />

        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-neutral-500/20">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold">
              Merge Dual Exhaust into Single Center Nozzle
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              Renders 1 centered exhaust beam/ribbon per car instead of 2 (cuts draw calls by 50%)
            </span>
          </div>
          <ToggleSwitch
            checked={Boolean(cfg.mergeCenterNozzle)}
            onCheckedChange={(mergeCenterNozzle) =>
              updatePerformanceBoostConfig({ mergeCenterNozzle })
            }
            isLight={isLight}
          />
        </div>
      </div>

      {/* 2. Mode-Specific Timing & Alpha Blend Expire */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1">
          <span className="font-bold text-[11px] text-amber-400">
            {cfg.mode === 'attach'
              ? '2. Pose-Attached Span & Alpha Expire Timing'
              : '2. Trajectory History Window & Alpha Expire'}
          </span>
          <span className="font-mono text-[10px] opacity-80">
            {cfg.mode === 'attach'
              ? `Extend ${cfg.attachStartDurationSec.toFixed(2)}s · Detach ${cfg.attachEndDurationSec.toFixed(2)}s`
              : `-${cfg.startAgeTicks}t (${startSec}s) → -${cfg.endAgeTicks}t (${endSec}s) [${visibleSec}s]`}
          </span>
        </div>

        {cfg.mode === 'attach' ? (
          <>
            <SliderControl
              label="Ignition Extend Duration (Start Time)"
              description="Time for the beam tip to extend from nozzle (0 -> 1) when boost is pressed"
              value={cfg.attachStartDurationSec}
              min={0.02}
              max={0.8}
              step={0.01}
              unit="s"
              editable={true}
              onChange={(attachStartDurationSec) =>
                updatePerformanceBoostConfig({ attachStartDurationSec })
              }
              isLight={isLight}
            />

            <SliderControl
              label="Release Detach & Expire Duration (End Time)"
              description="Time for the base to detach from nozzle and shrink/fade toward the far tip on release"
              value={cfg.attachEndDurationSec}
              min={0.02}
              max={0.8}
              step={0.01}
              unit="s"
              editable={true}
              onChange={(attachEndDurationSec) =>
                updatePerformanceBoostConfig({ attachEndDurationSec })
              }
              isLight={isLight}
            />

            <SliderControl
              label="Max Attached Beam Length"
              description="Full extended length behind the rear exhaust anchor in Unreal Units"
              value={cfg.attachLengthUu}
              min={40}
              max={450}
              step={5}
              unit=" UU"
              editable={true}
              onChange={(attachLengthUu) =>
                updatePerformanceBoostConfig({ attachLengthUu })
              }
              isLight={isLight}
            />
          </>
        ) : (
          <>
            <SliderControl
              label="Start Emission Delay (-startAgeTicks)"
              description="Continuous 120Hz sub-tick interpolated head offset behind exhaust nozzle"
              value={cfg.startAgeTicks}
              min={0}
              max={45}
              step={1}
              unit="t"
              editable={true}
              onChange={(val) =>
                updatePerformanceBoostConfig({
                  startAgeTicks: val,
                  endAgeTicks: Math.max(val + 2, cfg.endAgeTicks),
                })
              }
              isLight={isLight}
            />

            <SliderControl
              label="End Trail Cutoff (-endAgeTicks)"
              description="Continuous 120Hz sub-tick interpolated tail expire age (36t = 0.30s, 60t = 0.50s)"
              value={cfg.endAgeTicks}
              min={4}
              max={120}
              step={1}
              unit="t"
              editable={true}
              onChange={(val) =>
                updatePerformanceBoostConfig({
                  endAgeTicks: Math.max(cfg.startAgeTicks + 2, val),
                })
              }
              isLight={isLight}
            />

            <SliderControl
              label="Minimum Knot Sample Distance"
              description="Distance threshold in UU before committing a new historical trajectory knot"
              value={cfg.minSampleDistUu}
              min={2}
              max={32}
              step={0.5}
              unit=" UU"
              editable={true}
              onChange={(minSampleDistUu) =>
                updatePerformanceBoostConfig({ minSampleDistUu })
              }
              isLight={isLight}
            />
          </>
        )}

        <SliderControl
          label="Overall Boost Opacity"
          value={cfg.opacity}
          min={0.05}
          max={1.0}
          step={0.01}
          editable={true}
          onChange={(opacity) => updatePerformanceBoostConfig({ opacity })}
          isLight={isLight}
        />

        <SliderControl
          label="Alpha Blend Expire Curve"
          description="Controls smooth longitudinal alpha fade-out so the tail never cuts off abruptly"
          value={cfg.fadeCurve}
          min={0.25}
          max={3.5}
          step={0.05}
          editable={true}
          onChange={(fadeCurve) => updatePerformanceBoostConfig({ fadeCurve })}
          isLight={isLight}
        />
      </div>

      {/* 3. Pseudo-3D Tube Cross-Section & Taper Geometry */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
        <span className="font-bold text-[11px] text-amber-400 border-b border-neutral-500/20 pb-1">
          3. Pseudo-3D Cylindrical Tube Geometry &amp; Width Taper
        </span>

        <SliderControl
          label="Nozzle Head Width (Thick Front)"
          value={cfg.headWidthUu}
          min={2.0}
          max={40.0}
          step={0.5}
          unit=" UU"
          editable={true}
          onChange={(headWidthUu) => updatePerformanceBoostConfig({ headWidthUu })}
          isLight={isLight}
        />

        <SliderControl
          label="Far Tail Width (Thin Tip)"
          value={cfg.tailWidthUu}
          min={0.0}
          max={24.0}
          step={0.25}
          unit=" UU"
          editable={true}
          onChange={(tailWidthUu) => updatePerformanceBoostConfig({ tailWidthUu })}
          isLight={isLight}
        />

        <SliderControl
          label="Width Taper Exponent"
          value={cfg.widthTaperCurve}
          min={0.25}
          max={3.0}
          step={0.05}
          editable={true}
          onChange={(widthTaperCurve) =>
            updatePerformanceBoostConfig({ widthTaperCurve })
          }
          isLight={isLight}
        />

        <SliderControl
          label="Cylindrical Core Highlight Sharpness"
          description="Radial tube core brightness width across the camera-facing ribbon cross-section"
          value={cfg.coreSharpness}
          min={0.1}
          max={0.9}
          step={0.02}
          editable={true}
          onChange={(coreSharpness) =>
            updatePerformanceBoostConfig({ coreSharpness })
          }
          isLight={isLight}
        />
      </div>
    </div>
  );
};
