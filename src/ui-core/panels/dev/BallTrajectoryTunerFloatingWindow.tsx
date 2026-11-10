import React from 'react';
import { Cpu } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import {
  DEFAULT_TRAJECTORY_CONFIG,
  type TrajectoryUpdateMode,
} from '../../config/trainingDefaults';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { SliderControl } from '../../primitives/SliderControl';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { BallTrajectoryPresetIoSection } from './ball-trajectory-tuner/BallTrajectoryPresetIoSection';
import { BallTrajectoryTelemetryCard } from './ball-trajectory-tuner/BallTrajectoryTelemetryCard';
import { BallTrajectoryAnomalyDebugCard } from './ball-trajectory-tuner/BallTrajectoryAnomalyDebugCard';
import { BallTrajectoryTubeStyleSection } from './ball-trajectory-tuner/BallTrajectoryTubeStyleSection';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'ball-trajectory-tuner',
  title: 'Ball Trajectory Prediction Line Tuner',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 480,
    height: 640,
    minHeight: 220,
    mode: 'adaptive',
  },
};

export interface BallTrajectoryTunerFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const BallTrajectoryTunerFloatingWindow: React.FC<
  BallTrajectoryTunerFloatingWindowProps
> = ({ isLight = false }) => {
  const trajectory = useAppStore((s) => s.trajectory);
  const updateTrajectory = useAppStore((s) => s.updateTrajectory);

  const cfg = {
    ...DEFAULT_TRAJECTORY_CONFIG,
    ...trajectory,
  };

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className="flex flex-col gap-2.5 select-none text-xs">
      {/* Header & JSON Preset I/O */}
      <BallTrajectoryPresetIoSection isLight={isLight} />

      {/* Live 120Hz WASM Incremental vs Full Recompute Telemetry */}
      <BallTrajectoryTelemetryCard isLight={isLight} />

      {/* Dual-Space Anomaly Capture & Export (Space A vs Space B + Rolling Buffer) */}
      <BallTrajectoryAnomalyDebugCard isLight={isLight} />

      {/* 1. WASM Incremental Prediction & Trigger Policy */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center gap-2 border-b border-neutral-500/20 pb-1.5">
          <Cpu className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex flex-col">
            <span className="font-bold text-[11px]">
              1. WASM Incremental Prediction &amp; Trigger Policy
            </span>
            <span className={`text-[10px] ${mutedText}`}>
              Floor &amp; wall bounces are pre-simulated in WASM shadow arena without full recompute
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={`text-[10px] font-semibold ${mutedText}`}>Prediction Horizon Mode</span>
          <SegmentedSwitch
            size="sm"
            fullWidth
            value={cfg.updateMode || 'continuous-incremental'}
            onValueChange={(val) =>
              updateTrajectory({ updateMode: val as TrajectoryUpdateMode })
            }
            isLight={isLight}
            options={[
              { value: 'continuous-incremental', label: 'Continuous Incremental (600t Tail)' },
              { value: 'event-snapshot', label: 'Snapshot (Shrinks)' },
              { value: 'full-every-tick', label: 'Full 600t/Tick' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/15 border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">Car-Ball Hit Trigger</span>
              <span className={`text-[9px] ${mutedText}`}>Recompute on 0x01 incident</span>
            </div>
            <ToggleSwitch
              checked={cfg.recomputeOnCarHit !== false}
              onChange={(recomputeOnCarHit) => updateTrajectory({ recomputeOnCarHit })}
              isLight={isLight}
            />
          </div>

          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/15 border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">World Bounce Trigger</span>
              <span className={`text-[9px] ${mutedText}`}>Force full on wall/floor hit</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.recomputeOnWorldBounce)}
              onChange={(recomputeOnWorldBounce) =>
                updateTrajectory({ recomputeOnWorldBounce })
              }
              isLight={isLight}
            />
          </div>
        </div>

        <SliderControl
          label="Position Deviation Threshold"
          value={cfg.deviationThresholdUu ?? 5.0}
          min={1}
          max={50}
          step={0.5}
          unit=" UU"
          onChange={(deviationThresholdUu) => updateTrajectory({ deviationThresholdUu })}
          isLight={isLight}
        />

        <SliderControl
          label="Activation Velocity Threshold"
          value={cfg.velocityThresholdUu ?? 15}
          min={5}
          max={600}
          step={5}
          unit=" UU/s"
          onChange={(velocityThresholdUu) => updateTrajectory({ velocityThresholdUu })}
          isLight={isLight}
        />

        <SliderControl
          label="Catch-Up Step Budget (Ramp After Hit)"
          value={cfg.catchupTicksPerFrame ?? 5}
          min={2}
          max={120}
          step={1}
          unit="t/frame"
          onChange={(catchupTicksPerFrame) => updateTrajectory({ catchupTicksPerFrame })}
          isLight={isLight}
        />
      </div>

      {/* 2. 3D Volumetric Tube & 3. Ribbon Dimensions / User Access Control */}
      <BallTrajectoryTubeStyleSection isLight={isLight} />
    </div>
  );
};

export default BallTrajectoryTunerFloatingWindow;
