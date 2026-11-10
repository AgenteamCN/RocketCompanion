import React from 'react';
import { Sparkles, Layers, Lock } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import {
  DEFAULT_TRAJECTORY_CONFIG,
  type TrajectoryDashCapStyle,
} from '../../../config/trainingDefaults';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';

export interface BallTrajectoryTubeStyleSectionProps {
  isLight?: boolean;
}

export const BallTrajectoryTubeStyleSection: React.FC<
  BallTrajectoryTubeStyleSectionProps
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

  const horizonSeconds = Number(((cfg.predictionTicks || 600) / 120).toFixed(1));
  const shadingPct = Math.round((cfg.shadingStrength ?? 0.75) * 100);
  const taperPct = Math.round((cfg.radiusTaper ?? 0.35) * 100);
  const fadePct = Math.round((cfg.horizonFade ?? 0.3) * 100);
  const opacityPct =
    (cfg.opacity ?? 0.5) <= 1.0
      ? Math.round((cfg.opacity ?? 0.5) * 100)
      : Math.round(cfg.opacity ?? 50);

  return (
    <>
      {/* 2. 3D Volumetric Geometry & Spatial Depth Cues */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center gap-2 border-b border-neutral-500/20 pb-1.5">
          <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex flex-col">
            <span className="font-bold text-[11px]">
              2. 3D Volumetric Tube &amp; Spatial Depth Perception
            </span>
            <span className={`text-[10px] ${mutedText}`}>
              3D parallel-transport cylinder with selectable end caps, normal lighting &amp; depth taper
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={`text-[10px] font-semibold ${mutedText}`}>Dash End Cap Geometry</span>
          <SegmentedSwitch
            size="sm"
            fullWidth
            value={cfg.dashCapStyle || 'round'}
            onValueChange={(val) =>
              updateTrajectory({ dashCapStyle: val as TrajectoryDashCapStyle })
            }
            isLight={isLight}
            options={[
              { value: 'round', label: 'Rounded Capsule Cap (Hemisphere)' },
              { value: 'chamfer', label: 'Chamfered Bevel Cap (45° Cut)' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            label="Tick Sample Stride"
            value={cfg.sampleStride ?? 1}
            min={1}
            max={6}
            step={1}
            unit="x"
            onChange={(sampleStride) => updateTrajectory({ sampleStride })}
            isLight={isLight}
          />
          <SliderControl
            label="Tube Radial Sides"
            value={cfg.tubeRadialSegments ?? 6}
            min={4}
            max={8}
            step={2}
            unit=" sides"
            onChange={(tubeRadialSegments) => updateTrajectory({ tubeRadialSegments })}
            isLight={isLight}
          />
        </div>

        <SliderControl
          label="3D Cylindrical Shading Contrast"
          value={shadingPct}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={(pct) => updateTrajectory({ shadingStrength: pct / 100 })}
          isLight={isLight}
        />

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            label="Horizon Radius Taper"
            value={taperPct}
            min={0}
            max={85}
            step={5}
            unit="%"
            onChange={(pct) => updateTrajectory({ radiusTaper: pct / 100 })}
            isLight={isLight}
          />
          <SliderControl
            label="Horizon Distance Fade"
            value={fadePct}
            min={0}
            max={85}
            step={5}
            unit="%"
            onChange={(pct) => updateTrajectory({ horizonFade: pct / 100 })}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/15 border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">3D Bounce Rings</span>
              <span className={`text-[9px] ${mutedText}`}>Surface-aligned impact discs</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.showBounceMarkers)}
              onChange={(showBounceMarkers) => updateTrajectory({ showBounceMarkers })}
              isLight={isLight}
            />
          </div>

          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/15 border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">Floor Altitude Drop Lines</span>
              <span className={`text-[9px] ${mutedText}`}>Vertical height + floor trace</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.showGroundProjection)}
              onChange={(showGroundProjection) =>
                updateTrajectory({ showGroundProjection })
              }
              isLight={isLight}
            />
          </div>
        </div>

        {cfg.showGroundProjection && (
          <SliderControl
            label="Altitude Drop Line Interval"
            value={cfg.dropLineIntervalTicks ?? 104}
            min={16}
            max={120}
            step={8}
            unit=" ticks"
            onChange={(dropLineIntervalTicks) =>
              updateTrajectory({ dropLineIntervalTicks })
            }
            isLight={isLight}
          />
        )}
      </div>

      {/* 3. Developer Thickness, Dash Styling & User Menu Permissions */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center gap-2 border-b border-neutral-500/20 pb-1.5">
          <Layers className="h-4 w-4 text-sky-400 shrink-0" />
          <div className="flex flex-col">
            <span className="font-bold text-[11px]">
              3. Ribbon Dimensions &amp; User Menu Access Control
            </span>
            <span className={`text-[10px] ${mutedText}`}>
              Calibrate developer baseline thickness/dashes &amp; lock what normal users can modify
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            label="Line Thickness (% Ball)"
            value={cfg.thickness ?? 20}
            min={1}
            max={75}
            step={1}
            unit="%"
            onChange={(thickness) => updateTrajectory({ thickness })}
            isLight={isLight}
          />
          <SliderControl
            label="Line Opacity"
            value={opacityPct}
            min={5}
            max={100}
            step={5}
            unit="%"
            onChange={(pct) => updateTrajectory({ opacity: pct / 100 })}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SliderControl
            label="Horizon"
            value={horizonSeconds}
            min={0.5}
            max={5.0}
            step={0.1}
            unit="s"
            onChange={(duration) =>
              updateTrajectory({
                duration,
                predictionTicks: Math.round(duration * 120),
              })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Solid Dash"
            value={cfg.solidTicks ?? 50}
            min={5}
            max={240}
            step={5}
            unit="t"
            onChange={(solidTicks) => updateTrajectory({ solidTicks })}
            isLight={isLight}
          />
          <SliderControl
            label="Dash Gap"
            value={cfg.transparentTicks ?? 20}
            min={5}
            max={240}
            step={5}
            unit="t"
            onChange={(transparentTicks) => updateTrajectory({ transparentTicks })}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/15 border border-white/5">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-amber-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold">Allow User Thickness Edit</span>
                <span className={`text-[9px] ${mutedText}`}>Default off (Developer-only)</span>
              </div>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.allowUserThicknessEdit)}
              onChange={(allowUserThicknessEdit) =>
                updateTrajectory({ allowUserThicknessEdit })
              }
              isLight={isLight}
            />
          </div>

          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/15 border border-white/5">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-sky-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold">Allow User Dash Edit</span>
                <span className={`text-[9px] ${mutedText}`}>Solid/Gap sliders in User UI</span>
              </div>
            </div>
            <ToggleSwitch
              checked={cfg.allowUserDashEdit !== false}
              onChange={(allowUserDashEdit) => updateTrajectory({ allowUserDashEdit })}
              isLight={isLight}
            />
          </div>
        </div>
      </div>
    </>
  );
};
