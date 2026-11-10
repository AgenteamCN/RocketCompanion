import React from 'react';
import { Sliders, Circle, Moon } from 'lucide-react';
import { type BoostPadTunerConfig } from '../../../config/uiConfig';
import { TunerRow, TunerColorRow, TunerToggleRow } from '../../../compounds/TunerControls';

export interface BoostPadShaderTabProps {
  tuner: BoostPadTunerConfig;
  updateTuner: (patch: Partial<BoostPadTunerConfig>) => void;
  isLight?: boolean;
}

export const BoostPadShaderTab: React.FC<BoostPadShaderTabProps> = ({
  tuner,
  updateTuner,
  isLight = false,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 1. Section: Upward Gradient Opacity Shader */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Sliders className="h-3 w-3" />
          <span>Upward Opacity Gradient Mask</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <TunerRow
            label="Bottom Opacity"
            description="Normalized opacity at pad floor contact (height ratio 0.0)"
            value={tuner.bottomOpacity}
            sliderMin={0.0}
            sliderMax={2.0}
            sliderStep={0.01}
            onChange={(val) => updateTuner({ bottomOpacity: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Top Opacity"
            description="Normalized opacity at pad apex tip (height ratio 1.0)"
            value={tuner.topOpacity}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.01}
            onChange={(val) => updateTuner({ topOpacity: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Midpoint Ratio"
            description="Relative height position (0.0 - 1.0) where 50% opacity transition occurs"
            value={tuner.midpoint}
            sliderMin={0.001}
            sliderMax={1.0}
            sliderStep={0.005}
            onChange={(val) => updateTuner({ midpoint: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Top Cutoff Limit"
            description="Normalized vertical height limit (0.05 - 1.0) where apex top opacity is reached"
            value={tuner.topCutoff ?? 1.0}
            sliderMin={0.05}
            sliderMax={1.0}
            sliderStep={0.01}
            onChange={(val) => updateTuner({ topCutoff: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Curve Power"
            description="Sharpness exponent of the upward opacity falloff curve"
            value={tuner.power}
            sliderMin={0.1}
            sliderMax={30.0}
            sliderStep={0.5}
            onChange={(val) => updateTuner({ power: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Luminance Intensity"
            description="Glow radiance multiplier for the upward active hologram"
            value={tuner.glowIntensity}
            sliderMin={0.0}
            sliderMax={10.0}
            sliderStep={0.1}
            onChange={(val) => updateTuner({ glowIntensity: val })}
            isLight={isLight}
          />

          <TunerColorRow
            label="Glow Tint Color"
            description="Outer hologram ambient gradient color"
            value={tuner.glowColor}
            onChange={(hex) => updateTuner({ glowColor: hex })}
            isLight={isLight}
          />

          <TunerColorRow
            label="Core Hot Color"
            description="High-energy internal core color near pad base"
            value={tuner.coreColor}
            onChange={(hex) => updateTuner({ coreColor: hex })}
            isLight={isLight}
          />

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <TunerRow
              label="Big Pad Glow Y-Offset"
              description="Vertical alignment of big pad glow cone relative to base chassis"
              value={tuner.glowHeightOffsetBig ?? -0.01}
              sliderMin={-0.1}
              sliderMax={0.1}
              sliderStep={0.001}
              onChange={(val) => updateTuner({ glowHeightOffsetBig: val })}
              isLight={isLight}
              unit="uu"
            />

            <TunerRow
              label="Small Pad Glow Y-Offset"
              description="Vertical alignment of small pad glow cone relative to base chassis"
              value={tuner.glowHeightOffsetSmall ?? -0.05}
              sliderMin={-0.1}
              sliderMax={0.1}
              sliderStep={0.001}
              onChange={(val) => updateTuner({ glowHeightOffsetSmall: val })}
              isLight={isLight}
              unit="uu"
            />
          </div>
        </div>
      </div>

      {/* 2. Section: Big Boost Pad Floating Orb */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Circle className="h-3 w-3" />
          <span>Big Boost Pad Floating Orb</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <TunerRow
            label="Orb Radius"
            description="Radius of the single-layer static sphere (Unreal Units)"
            value={tuner.orbRadius}
            sliderMin={0.0}
            sliderMax={30.0}
            sliderStep={0.05}
            onChange={(val) => updateTuner({ orbRadius: val })}
            isLight={isLight}
            unit="uu"
          />

          <TunerRow
            label="Vertical Height Offset"
            description="Vertical elevation above pad mesh peak height (Unreal Units)"
            value={tuner.orbHeightOffset}
            sliderMin={-20.0}
            sliderMax={160.0}
            sliderStep={0.5}
            onChange={(val) => updateTuner({ orbHeightOffset: val })}
            isLight={isLight}
            unit="uu"
          />

          <TunerRow
            label="Emissive Intensity"
            description="PBR standard material emissive luminance"
            value={tuner.orbEmissiveIntensity}
            sliderMin={0.0}
            sliderMax={12.0}
            sliderStep={0.1}
            onChange={(val) => updateTuner({ orbEmissiveIntensity: val })}
            isLight={isLight}
          />

          <TunerColorRow
            label="Orb Glow Color"
            description="Base diffuse and emissive color of the static sphere"
            value={tuner.orbColor}
            onChange={(hex) => updateTuner({ orbColor: hex })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* 3. Section: Big Pad Camera-Relative Black Out-Glow Shadow */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Moon className="h-3 w-3" />
          <span>Big Pad Black Out-Glow Silhouette</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <TunerToggleRow
            label="Enable Black Out-Glow"
            description="Camera-facing soft billboard behind yellow sphere for high contrast"
            checked={tuner.shadowEnabled}
            onChange={(checked) => updateTuner({ shadowEnabled: checked })}
            isLight={isLight}
          />

          <TunerRow
            label="Shadow Radius"
            description="Base radius of the black silhouette billboard"
            value={tuner.shadowRadius}
            sliderMin={10.0}
            sliderMax={200.0}
            sliderStep={1.0}
            onChange={(val) => updateTuner({ shadowRadius: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Shadow Opacity"
            description="Peak blackness density at center with soft exponential falloff"
            value={tuner.shadowIntensity}
            sliderMin={0.0}
            sliderMax={2.0}
            sliderStep={0.05}
            onChange={(val) => updateTuner({ shadowIntensity: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Distance Scale Factor"
            description="Compensates billboard size with camera distance (subtle near, sharp far)"
            value={tuner.shadowDistanceScale}
            sliderMin={0.0}
            sliderMax={0.05}
            sliderStep={0.001}
            onChange={(val) => updateTuner({ shadowDistanceScale: val })}
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
};
