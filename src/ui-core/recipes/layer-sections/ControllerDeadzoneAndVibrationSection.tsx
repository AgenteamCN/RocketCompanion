import React, { useState, useCallback } from 'react';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../../compounds/SettingToggleRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import type { StickAxisOption } from '../controller/deadzoneCanvasRenderer';
import type { ControllerDeadzoneRenderConfig } from '../controller/ControllerDeadzoneVisualizer';
import { ControllerVisualizerOptionsSection } from '../controller/ControllerVisualizerOptionsSection';

export interface ControllerAxesConfig {
  steer: { axis: number; invert: boolean };
  pitch: { axis: number; invert: boolean };
  deadzone: number;          // 0.00..0.50, step 0.01, default 0.12
  dodgeDeadzone?: number;    // 0.10..0.95, step 0.01, default 0.70
  triggerThreshold: number;  // 0.05..0.95, step 0.05, default 0.15
}

const AXIS_INDEX_TO_ROLE: Record<number, StickAxisOption> = {
  0: 'left-x',
  1: 'left-y',
  2: 'right-x',
  3: 'right-y',
};

const ROLE_TO_AXIS_INDEX: Record<StickAxisOption, number> = {
  'left-x': 0,
  'left-y': 1,
  'right-x': 2,
  'right-y': 3,
};

const STICK_AXIS_OPTIONS: Array<{ value: StickAxisOption; label: string }> = [
  { value: 'left-x', label: 'Left Stick X' },
  { value: 'left-y', label: 'Left Stick Y' },
  { value: 'right-x', label: 'Right Stick X' },
  { value: 'right-y', label: 'Right Stick Y' },
];

export interface ControllerDeadzoneAndVibrationSectionProps {
  resolvedConfig: ControllerAxesConfig;
  updateConfig: (patch: Partial<ControllerAxesConfig>) => void;
  selectedGamepadIndex: number | null;
  developerMode: boolean;
  isLight: boolean;
  onHoverDesc: (desc: string | null) => void;
  onResetAxesToDefault: () => void;
}

export const ControllerDeadzoneAndVibrationSection: React.FC<
  ControllerDeadzoneAndVibrationSectionProps
> = ({
  resolvedConfig,
  updateConfig,
  selectedGamepadIndex,
  developerMode,
  isLight,
  onHoverDesc,
  onResetAxesToDefault,
}) => {
  const steerAxisRole: StickAxisOption =
    AXIS_INDEX_TO_ROLE[resolvedConfig.steer.axis] ?? 'left-x';
  const invertSteerAxis = resolvedConfig.steer.invert;
  const pitchAxisRole: StickAxisOption =
    AXIS_INDEX_TO_ROLE[resolvedConfig.pitch.axis] ?? 'left-y';
  const invertPitchAxis = resolvedConfig.pitch.invert;
  const stickDeadzone = resolvedConfig.deadzone;
  const dodgeDeadzone = resolvedConfig.dodgeDeadzone ?? 0.70;
  const triggerThreshold = resolvedConfig.triggerThreshold;

  const [renderConfig, setRenderConfig] = useState<ControllerDeadzoneRenderConfig>({
    showCircularOverlay: true,
    maxDiagonal: 0.77,
    altArrow: false,
    antiAliasing: '4x',
  });

  const handleRenderConfigChange = useCallback(
    (patch: Partial<ControllerDeadzoneRenderConfig>) => {
      setRenderConfig((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleResetAll = () => {
    setRenderConfig({
      showCircularOverlay: true,
      maxDiagonal: 0.77,
      altArrow: false,
      antiAliasing: '4x',
    });
    onResetAxesToDefault();
  };

  return (
    <>
      <SettingSegmentedRow
        title="Steer / Yaw Axis"
        controlType="dropdown"
        value={steerAxisRole}
        onChange={(val) =>
          updateConfig({
            steer: {
              ...resolvedConfig.steer,
              axis: ROLE_TO_AXIS_INDEX[val as StickAxisOption] ?? 0,
            },
          })
        }
        options={STICK_AXIS_OPTIONS}
        bordered={false}
        showDescription={false}
        hoverDescription="Select which analog stick axis controls horizontal vehicle steering and aerial yaw."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingToggleRow
        title="Invert Steer Axis"
        checked={invertSteerAxis}
        onChange={(invert) =>
          updateConfig({
            steer: { ...resolvedConfig.steer, invert },
          })
        }
        bordered={false}
        showDescription={false}
        hoverDescription="Reverse horizontal steering and yaw axis polarity."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSegmentedRow
        title="Pitch (Tilt) Axis"
        controlType="dropdown"
        value={pitchAxisRole}
        onChange={(val) =>
          updateConfig({
            pitch: {
              ...resolvedConfig.pitch,
              axis: ROLE_TO_AXIS_INDEX[val as StickAxisOption] ?? 1,
            },
          })
        }
        options={STICK_AXIS_OPTIONS}
        bordered={false}
        showDescription={false}
        hoverDescription="Select which analog stick axis controls vertical aerial pitch (tilt) and dodge forward/back."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingToggleRow
        title="Invert Pitch Axis"
        checked={invertPitchAxis}
        onChange={(invert) =>
          updateConfig({
            pitch: { ...resolvedConfig.pitch, invert },
          })
        }
        bordered={false}
        showDescription={false}
        hoverDescription="Reverse vertical aerial pitch (tilt) axis polarity."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        title="Deadzone"
        min={0.0}
        max={0.5}
        step={0.01}
        value={stickDeadzone}
        onChange={(deadzone) => updateConfig({ deadzone })}
        layout="inline"
        bordered={false}
        showDescription={false}
        developerMode={developerMode}
        hoverDescription="Axial cross deadzone threshold (0.00 to 0.50) filtering center thumbstick drift."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        title="Dodge Deadzone"
        min={0.1}
        max={0.95}
        step={0.01}
        value={dodgeDeadzone}
        onChange={(nextDodgeDeadzone) => updateConfig({ dodgeDeadzone: nextDodgeDeadzone })}
        layout="inline"
        bordered={false}
        showDescription={false}
        developerMode={developerMode}
        hoverDescription="Minimum stick deflection required to trigger a directional dodge instead of a double jump (0.10 to 0.95)."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        title="Trigger Threshold"
        min={0.05}
        max={0.95}
        step={0.05}
        value={triggerThreshold}
        onChange={(nextTriggerThreshold) =>
          updateConfig({ triggerThreshold: nextTriggerThreshold })
        }
        layout="inline"
        bordered={false}
        showDescription={false}
        developerMode={developerMode}
        hoverDescription="Minimum L2/R2 analog trigger depression required to register throttle or reverse input (0.05 to 0.95)."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <ControllerVisualizerOptionsSection
        controllerState={{
          stickDeadzone,
          dodgeDeadzone,
          steerAxisRole,
          invertSteerAxis,
          pitchAxisRole,
          invertPitchAxis,
          selectedGamepadIndex,
        }}
        renderConfig={renderConfig}
        onRenderConfigChange={handleRenderConfigChange}
        developerMode={developerMode}
        isLight={isLight}
        onHoverDesc={onHoverDesc}
        onResetToDefault={handleResetAll}
      />
    </>
  );
};
