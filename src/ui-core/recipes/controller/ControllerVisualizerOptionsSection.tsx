import React from 'react';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../../compounds/SettingToggleRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import {
  ControllerDeadzoneVisualizer,
  type ControllerDeadzoneRenderConfig,
} from './ControllerDeadzoneVisualizer';
import type { DeadzoneAntiAliasing, StickAxisOption } from './deadzoneCanvasRenderer';

export interface ControllerVisualizerInputState {
  stickDeadzone: number;
  dodgeDeadzone: number;
  steerAxisRole: StickAxisOption;
  invertSteerAxis: boolean;
  pitchAxisRole: StickAxisOption;
  invertPitchAxis: boolean;
  selectedGamepadIndex: number | null;
}

export interface ControllerVisualizerOptionsSectionProps {
  controllerState: ControllerVisualizerInputState;
  renderConfig: ControllerDeadzoneRenderConfig;
  onRenderConfigChange: (patch: Partial<ControllerDeadzoneRenderConfig>) => void;
  developerMode?: boolean;
  isLight?: boolean;
  onHoverDesc: (desc: string | null) => void;
  onResetToDefault: () => void;
}

export const ControllerVisualizerOptionsSection: React.FC<
  ControllerVisualizerOptionsSectionProps
> = ({
  controllerState: {
    stickDeadzone,
    dodgeDeadzone,
    steerAxisRole,
    invertSteerAxis,
    pitchAxisRole,
    invertPitchAxis,
    selectedGamepadIndex,
  },
  renderConfig,
  onRenderConfigChange,
  developerMode = false,
  isLight = false,
  onHoverDesc,
  onResetToDefault,
}) => {
  const { showCircularOverlay, maxDiagonal, altArrow, antiAliasing } = renderConfig;

  return (
    <>
      {/* 9. Show Circular Overlay (HalfwayDead Visualizer Option) */}
      <SettingToggleRow
        title="Show Circular Overlay"
        checked={showCircularOverlay}
        onChange={(val) => onRenderConfigChange({ showCircularOverlay: val })}
        bordered={false}
        showDescription={false}
        hoverDescription="Display circular physical thumbstick boundary overlay on the Turning and Dodging diagrams."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      {/* 10. Max. Diagonal Value (HalfwayDead Visualizer Option) */}
      <SettingSliderRow
        title="Max. Diagonal Value"
        min={0.5}
        max={1.0}
        step={0.01}
        value={maxDiagonal}
        onChange={(val) => onRenderConfigChange({ maxDiagonal: val })}
        disabled={!showCircularOverlay}
        layout="inline"
        bordered={false}
        showDescription={false}
        developerMode={developerMode}
        hoverDescription="Maximum diagonal coordinate reached by the physical circular controller gate (default 0.77)."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      {/* 11. Display Alternative Arrow (HalfwayDead Visualizer Option) */}
      <SettingToggleRow
        title="Display Alternative Arrow"
        checked={altArrow}
        onChange={(val) => onRenderConfigChange({ altArrow: val })}
        bordered={false}
        showDescription={false}
        hoverDescription="Anchor the Turning vector arrow at the deadzone offset pointing to the raw cursor position."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      {/* 12. Anti-Aliasing (HalfwayDead Visualizer Option) */}
      <SettingSegmentedRow
        title="Anti-Aliasing"
        value={antiAliasing}
        onChange={(val) =>
          onRenderConfigChange({ antiAliasing: val as DeadzoneAntiAliasing })
        }
        options={[
          { value: 'off', label: 'Off' },
          { value: '4x', label: '4x' },
          { value: '9x', label: '9x' },
          { value: '16x', label: '16x' },
        ]}
        bordered={false}
        showDescription={false}
        hoverDescription="Supersampling anti-aliasing factor for the Turning and Dodging deadzone diagrams."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      {/* 13. Turning & Dodging Deadzone Visualizer + Dual Raw Input Readouts */}
      <ControllerDeadzoneVisualizer
        axisState={{
          deadzone: stickDeadzone,
          dodgeDeadzone,
          steerAxisRole,
          invertSteerAxis,
          pitchAxisRole,
          invertPitchAxis,
          selectedGamepadIndex,
        }}
        renderConfig={renderConfig}
        isLight={isLight}
        onHover={(desc) => onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
      />

      {/* 14. Reset to Default Button */}
      <button
        type="button"
        onClick={onResetToDefault}
        onMouseEnter={() =>
          onHoverDesc(
            'Restore default controller stick axes, deadzones, trigger threshold, and visualizer settings.'
          )
        }
        onMouseLeave={() => onHoverDesc(null)}
        className={`mt-1 w-full py-2 px-3 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
          isLight
            ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
            : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
        }`}
      >
        Reset to Default
      </button>
    </>
  );
};
