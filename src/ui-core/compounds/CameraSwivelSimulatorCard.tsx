import React from 'react';
import { Eye } from 'lucide-react';
import { SegmentedSwitch } from '../primitives/SegmentedSwitch';
import { SliderControl } from '../primitives/SliderControl';
import {
  useReferenceOverlayStore,
  type CameraLookOverridePreset,
} from '../stores/referenceOverlayStore';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:CameraSwivelSimulatorCard' as const;

export type { CameraLookOverridePreset };

export interface CameraSwivelSimulatorCardProps {
  preset?: CameraLookOverridePreset;
  strength?: number;
  lookX?: number;
  lookY?: number;
  onChangePreset?: (preset: CameraLookOverridePreset) => void;
  onChangeStrength?: (strength: number) => void;
  onChangeAxes?: (lookX: number, lookY: number) => void;
  isLight?: boolean;
  className?: string;
  cardClass?: string;
}

/**
 * [L3 Compound] CameraSwivelSimulatorCard
 * Hands-Free Camera Swivel & Rear-View Override Simulator Card.
 * Supports controlled props or falls back to useReferenceOverlayStore when omitted.
 */
export const CameraSwivelSimulatorCard: React.FC<CameraSwivelSimulatorCardProps> = React.memo(
  ({
    preset: controlledPreset,
    strength: controlledStrength,
    lookX: controlledLookX,
    lookY: controlledLookY,
    onChangePreset,
    onChangeStrength,
    onChangeAxes,
    isLight = true,
    className = '',
    cardClass,
  }) => {
    const storePreset = useReferenceOverlayStore((s) => s.cameraLookPreset);
    const storeStrength = useReferenceOverlayStore((s) => s.cameraLookStrength);
    const storeLookX = useReferenceOverlayStore((s) => s.cameraLookXOverride);
    const storeLookY = useReferenceOverlayStore((s) => s.cameraLookYOverride);
    const setCameraLookPreset = useReferenceOverlayStore((s) => s.setCameraLookPreset);
    const setCameraLookStrength = useReferenceOverlayStore((s) => s.setCameraLookStrength);
    const setCameraLookAxes = useReferenceOverlayStore((s) => s.setCameraLookAxes);

    const preset = controlledPreset ?? storePreset;
    const strength = controlledStrength ?? storeStrength;
    const lookX = controlledLookX ?? storeLookX;
    const lookY = controlledLookY ?? storeLookY;
    const handlePresetChange = onChangePreset ?? setCameraLookPreset;
    const handleStrengthChange = onChangeStrength ?? setCameraLookStrength;
    const handleAxesChange = onChangeAxes ?? setCameraLookAxes;
    const theme = isLight ? UI_THEME.light : UI_THEME.dark;

    const containerClass =
      cardClass ??
      `p-3 ${UI_RADIUS.lg} border flex flex-col gap-2.5 select-none ${
        isLight
          ? `bg-neutral-50 border-neutral-200 ${theme.textPrimary}`
          : `bg-neutral-900/70 border-neutral-800 ${theme.textPrimary}`
      } ${className}`;

    return (
      <div
        data-alpha-id={ALPHA_COMPONENT_ID}
        data-ui-element="compound-camera-swivel-simulator-card"
        className={containerClass}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs text-amber-500 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            <span>Camera Swivel & Rear View Simulator</span>
          </span>
          <span className="text-[10px] font-mono opacity-75">Hands-Free Input Override</span>
        </div>

        <SegmentedSwitch
          value={preset}
          onValueChange={(val) => handlePresetChange(val as CameraLookOverridePreset)}
          options={[
            { value: 'none', label: 'None' },
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
            { value: 'up', label: 'Up' },
            { value: 'down', label: 'Down' },
            { value: 'rearView', label: 'Rear' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />

        {preset !== 'none' && preset !== 'rearView' && (
          <SliderControl
            label={
              preset === 'left' || preset === 'right'
                ? 'Simulated Analog Swivel Magnitude (Default Left/Right: 0.95)'
                : 'Simulated Analog Swivel Magnitude (Default Up/Down: 0.81)'
            }
            value={strength}
            min={0}
            max={1}
            step={0.01}
            editable={true}
            usePrecisionContext={true}
            onChange={(val) => handleStrengthChange(val)}
            isLight={isLight}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
          <SliderControl
            label="Manual Look X (Left / Right)"
            value={lookX}
            min={-1}
            max={1}
            step={0.01}
            variation="centered"
            origin={0}
            editable={true}
            usePrecisionContext={true}
            onChange={(val) => handleAxesChange(val, lookY)}
            isLight={isLight}
          />
          <SliderControl
            label="Manual Look Y (Up / Down)"
            value={lookY}
            min={-1}
            max={1}
            step={0.01}
            variation="centered"
            origin={0}
            editable={true}
            usePrecisionContext={true}
            onChange={(val) => handleAxesChange(lookX, val)}
            isLight={isLight}
          />
        </div>
      </div>
    );
  }
);

CameraSwivelSimulatorCard.displayName = 'CameraSwivelSimulatorCard';
