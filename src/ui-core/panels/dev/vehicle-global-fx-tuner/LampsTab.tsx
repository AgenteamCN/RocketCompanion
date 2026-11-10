import React from 'react';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import type {
  VehicleDescriptor,
  VehicleLampsConfig,
  VehicleTunerRuntimeFlags,
} from '../../../config/vehicleTunerConfig';

export interface LampsTabProps {
  descriptor: Pick<VehicleDescriptor, 'lampsConfig'>;
  runtimeFlags: VehicleTunerRuntimeFlags;
  handleLampsChange: (patch: Partial<VehicleLampsConfig>) => void;
  handleToggleRuntimeFlag: (patch: Partial<VehicleTunerRuntimeFlags>) => void;
  isLight: boolean;
  cardClass: string;
}

export const LampsTab: React.FC<LampsTabProps> = ({
  descriptor,
  runtimeFlags,
  handleLampsChange,
  handleToggleRuntimeFlag,
  isLight,
  cardClass,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Front Headlights */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px] text-sky-400">Front Headlights (FrontBulb)</span>
          <span className="text-[10px] font-mono opacity-75">Self-Luminous Emissive</span>
        </div>
        <TunerColorRow
          label="Front Lamp Color"
          value={descriptor.lampsConfig.frontColor}
          onChange={(frontColor) => handleLampsChange({ frontColor })}
          isLight={isLight}
        />
        <SliderControl
          label="Front Emissive Intensity"
          value={descriptor.lampsConfig.frontIntensity}
          min={0}
          max={10}
          step={0.1}
          unit="x"
          onChange={(frontIntensity) => handleLampsChange({ frontIntensity })}
          isLight={isLight}
        />
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px]">Tone Mapped (Disable for HDR Glow)</span>
          <ToggleSwitch
            checked={Boolean(descriptor.lampsConfig.frontToneMapped)}
            onChange={(frontToneMapped) => handleLampsChange({ frontToneMapped })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Rear Tail & Ground/Throttle Brake Lamps */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px] text-rose-400">
            Rear Brake Light (BackBulb · Ground &amp; No Powerslide)
          </span>
          <span className="text-[10px] font-mono opacity-75">
            (v&gt;0 &amp;&amp; thr&le;0) || (v&lt;0 &amp;&amp; thr&ge;0) || (|v|&le;min &amp;&amp; thr=0)
          </span>
        </div>

        <SegmentedSwitch
          value={runtimeFlags.brakePreviewMode || 'auto'}
          onValueChange={(mode) =>
            handleToggleRuntimeFlag({
              brakePreviewMode: mode as 'auto' | 'force-on' | 'force-off',
              forceBrakeLightPreview: mode === 'force-on',
            })
          }
          options={[
            { value: 'auto', label: 'Auto (Ground + Throttle)' },
            { value: 'force-on', label: 'Preview Lit (ON)' },
            { value: 'force-off', label: 'Preview Dim (OFF)' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />

        <SliderControl
          label="Min Forward/Reverse Speed (|v_fwd| > X)"
          value={descriptor.lampsConfig.brakeMinSpeed ?? 30}
          min={0}
          max={1500}
          step={5}
          unit=" uu/s"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(brakeMinSpeed) => handleLampsChange({ brakeMinSpeed })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Brake ON Bright Color (Lit)"
          value={descriptor.lampsConfig.brakeColor}
          onChange={(brakeColor) => handleLampsChange({ brakeColor })}
          isLight={isLight}
        />
        <SliderControl
          label="Brake ON Intensity (Lit HDR)"
          value={descriptor.lampsConfig.brakeIntensity}
          min={0.5}
          max={15}
          step={0.1}
          unit="x"
          onChange={(brakeIntensity) => handleLampsChange({ brakeIntensity })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Brake OFF Dim Color (Idle)"
          value={descriptor.lampsConfig.tailIdleColor}
          onChange={(tailIdleColor) => handleLampsChange({ tailIdleColor })}
          isLight={isLight}
        />
        <SliderControl
          label="Brake OFF Dim Intensity (Idle)"
          value={descriptor.lampsConfig.tailIdleIntensity}
          min={0}
          max={5}
          step={0.05}
          unit="x"
          onChange={(tailIdleIntensity) => handleLampsChange({ tailIdleIntensity })}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
