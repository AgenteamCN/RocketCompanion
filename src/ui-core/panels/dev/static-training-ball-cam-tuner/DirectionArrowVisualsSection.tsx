import React from 'react';
import { Eye } from 'lucide-react';
import { useStaticTrainingBallCamTunerStore } from '../../../stores/staticTrainingBallCamTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';

export interface DirectionArrowVisualsSectionProps {
  isLight?: boolean;
}

export const DirectionArrowVisualsSection: React.FC<DirectionArrowVisualsSectionProps> = ({
  isLight = false,
}) => {
  const {
    expiredBallOpacity,
    arrowOpacity,
    shadowOpacity,
    shadowScale,
    haloScale,
    coneRadius,
    coneLength,
    tipRadius,
    shaftRadius,
    arrowBaseLength,
    arrowMaxExtraLength,
    arrowHeightOffset,
    arrowForwardOffset,
    updateConfig,
  } = useStaticTrainingBallCamTunerStore();

  return (
    <>
      {/* Expired Ball (0s Landed Boom) Opacity Section */}
      <div
        className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/80 border-neutral-200'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span
                className={`text-[11px] font-semibold ${
                  isLight ? 'text-neutral-800' : 'text-neutral-100'
                }`}
              >
                Timeout Expired Ball Opacity (0s Landed Boom)
              </span>
              <span className="text-[10px] text-neutral-400">
                When timer hits 0s and ball touches ground, ball opacity drops to{' '}
                {Math.round(expiredBallOpacity * 100)}%
              </span>
            </div>
          </div>
        </div>

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="amber"
          label="Expired Ball Opacity (0s Ground Impact)"
          unit=""
          value={expiredBallOpacity}
          min={0.1}
          max={1.0}
          step={0.05}
          isLight={isLight}
          onChange={(v) => updateConfig({ expiredBallOpacity: v })}
        />
      </div>

      {/* 3D Car Speed / Heading Direction Arrow Section */}
      <div
        className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/80 border-neutral-200'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
            3D Direction Arrow Shading, Shadow & Geometry
          </span>
          <span className="text-[10px] font-mono opacity-60">Real-time 3D Preview</span>
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-[340px] overflow-y-auto pr-1">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="sky"
            label="Arrow Body Opacity"
            unit=""
            value={arrowOpacity}
            min={0.15}
            max={1.0}
            step={0.02}
            isLight={isLight}
            onChange={(v) => updateConfig({ arrowOpacity: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="sky"
            label="Silhouette Shadow Opacity"
            unit=""
            value={shadowOpacity}
            min={0.0}
            max={0.95}
            step={0.02}
            isLight={isLight}
            onChange={(v) => updateConfig({ shadowOpacity: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="sky"
            label="Silhouette Shadow Thickness"
            unit="x"
            value={shadowScale}
            min={1.02}
            max={1.6}
            step={0.02}
            isLight={isLight}
            onChange={(v) => updateConfig({ shadowScale: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="sky"
            label="Contrast Halo Backdrop Size"
            unit="UU"
            value={haloScale}
            min={0}
            max={220}
            step={5}
            isLight={isLight}
            onChange={(v) => updateConfig({ haloScale: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Cone Base Radius (Thickness)"
            unit="UU"
            value={coneRadius}
            min={6}
            max={55}
            step={1}
            isLight={isLight}
            onChange={(v) => updateConfig({ coneRadius: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Cone Tip Length"
            unit="UU"
            value={coneLength}
            min={18}
            max={140}
            step={2}
            isLight={isLight}
            onChange={(v) => updateConfig({ coneLength: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Tip Rounding Radius"
            unit="UU"
            value={tipRadius}
            min={0}
            max={15}
            step={0.5}
            isLight={isLight}
            onChange={(v) => updateConfig({ tipRadius: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Shaft Cylinder Radius"
            unit="UU"
            value={shaftRadius}
            min={2}
            max={25}
            step={0.5}
            isLight={isLight}
            onChange={(v) => updateConfig({ shaftRadius: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="sky"
            label="Base Arrow Length (0 Speed)"
            unit="UU"
            value={arrowBaseLength}
            min={60}
            max={320}
            step={5}
            isLight={isLight}
            onChange={(v) => updateConfig({ arrowBaseLength: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="sky"
            label="Max Speed Extra Length"
            unit="UU"
            value={arrowMaxExtraLength}
            min={50}
            max={600}
            step={10}
            isLight={isLight}
            onChange={(v) => updateConfig({ arrowMaxExtraLength: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="sky"
            label="Vertical Height Offset"
            unit="UU"
            value={arrowHeightOffset}
            min={-30}
            max={120}
            step={2}
            isLight={isLight}
            onChange={(v) => updateConfig({ arrowHeightOffset: v })}
          />

          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="sky"
            label="Forward Offset"
            unit="UU"
            value={arrowForwardOffset}
            min={-80}
            max={140}
            step={2}
            isLight={isLight}
            onChange={(v) => updateConfig({ arrowForwardOffset: v })}
          />
        </div>
      </div>
    </>
  );
};
