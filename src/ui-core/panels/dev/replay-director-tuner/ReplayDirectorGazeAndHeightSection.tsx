import React from 'react';
import { Camera, Sliders } from 'lucide-react';
import {
  type ReplayDirectorConfigState,
  DEFAULT_REPLAY_DIRECTOR_CONFIG,
  DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
} from '../../../config/replayDirectorConfig';
import { SliderControl } from '../../../primitives/SliderControl';

export interface ReplayDirectorGazeAndHeightSectionProps {
  isLight: boolean;
  mutedText: string;
  cfg: ReplayDirectorConfigState;
  onParamChange: (key: keyof ReplayDirectorConfigState, val: number) => void;
}

export const ReplayDirectorGazeAndHeightSection: React.FC<
  ReplayDirectorGazeAndHeightSectionProps
> = ({ isLight, mutedText, cfg, onParamChange }) => {
  return (
    <>
      <div className="flex items-center justify-between border-b border-neutral-700/30 pb-1">
        <span className="text-[11px] font-semibold flex items-center gap-1.5 text-emerald-400">
          <Camera className="h-3.5 w-3.5" />
          <span>Suffix Safe-Zone &amp; Low Camera Elevation</span>
        </span>
        <span className={`text-[10px] font-mono ${mutedText}`}>Single-Sweep Plan</span>
      </div>

      <SliderControl
        label={`Director Camera FOV (${Math.round(cfg.cameraFovDeg ?? DEFAULT_REPLAY_DIRECTOR_FOV_DEG)}°)`}
        description={`Horizontal field of view (16:9 standard) for Goal Replay Cinematic Camera (default ${DEFAULT_REPLAY_DIRECTOR_CONFIG.cameraFovDeg}°)`}
        value={cfg.cameraFovDeg ?? DEFAULT_REPLAY_DIRECTOR_FOV_DEG}
        min={30}
        max={150}
        step={1}
        unit="°"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('cameraFovDeg', v)}
      />

      <SliderControl
        label={`Base Camera Height (${Math.round(cfg.cameraBaseHeightUu ?? 195)} UU)`}
        description={`Low-angle cinematic camera floor elevation (default ${DEFAULT_REPLAY_DIRECTOR_CONFIG.cameraBaseHeightUu} UU)`}
        value={cfg.cameraBaseHeightUu ?? 195}
        min={110}
        max={420}
        step={5}
        unit="UU"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('cameraBaseHeightUu', v)}
      />

      <SliderControl
        label={`Aerial Height Follow Slope (${Math.round((cfg.cameraAerialHeightSlope ?? 0.36) * 100)}%)`}
        description="How much camera Z rises with aerial plays (lower = stays lower to the pitch)"
        value={cfg.cameraAerialHeightSlope ?? 0.36}
        min={0.1}
        max={0.85}
        step={0.02}
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('cameraAerialHeightSlope', v)}
      />

      <SliderControl
        label={`Suffix Time-Decay Release (${(cfg.suffixTimeDecayRate ?? 1.4).toFixed(2)})`}
        description="Progressive expansion rate as past points are eliminated from the remaining suffix safe-zone"
        value={cfg.suffixTimeDecayRate ?? 1.4}
        min={0.4}
        max={3.0}
        step={0.05}
        editable={true}
        showStepper={true}
        colorScheme="neutral"
        isLight={isLight}
        onChange={(v) => onParamChange('suffixTimeDecayRate', v)}
      />

      <SliderControl
        label={`Backward-Forward Smooth Passes (${Math.round(cfg.trajectorySmoothPasses ?? 4)})`}
        description="Zero-phase trajectory smoothing passes deduced backward from final free space"
        value={cfg.trajectorySmoothPasses ?? 4}
        min={1}
        max={8}
        step={1}
        editable={true}
        showStepper={true}
        colorScheme="neutral"
        isLight={isLight}
        onChange={(v) => onParamChange('trajectorySmoothPasses', v)}
      />

      <SliderControl
        label={`Total Yaw Rotation Budget (${Math.round(cfg.maxTotalYawBudgetDeg ?? 320)}°)`}
        description="Maximum total cumulative yaw rotation path allowed across the entire replay (< 360°)"
        value={cfg.maxTotalYawBudgetDeg ?? 320}
        min={90}
        max={355}
        step={5}
        unit="°"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('maxTotalYawBudgetDeg', v)}
      />

      <div className="flex items-center justify-between border-b border-neutral-700/30 pb-1 pt-1">
        <span className="text-[11px] font-semibold flex items-center gap-1.5 text-amber-400">
          <Sliders className="h-3.5 w-3.5" />
          <span>Smoothing &amp; Transition Damping</span>
        </span>
        <span className={`text-[10px] font-mono ${mutedText}`}>1/s exp decay</span>
      </div>

      <SliderControl
        label={`Eye Translation Damping (${cfg.eyeDampingRate.toFixed(1)} /s)`}
        description={`Camera position smoothing rate (default ${DEFAULT_REPLAY_DIRECTOR_CONFIG.eyeDampingRate})`}
        value={cfg.eyeDampingRate}
        min={0.5}
        max={15.0}
        step={0.1}
        unit="/s"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('eyeDampingRate', v)}
      />

      <SliderControl
        label={`Gaze LookAt Damping (${cfg.gazeDampingRate.toFixed(1)} /s)`}
        description={`Camera pan/tilt aim smoothing rate (default ${DEFAULT_REPLAY_DIRECTOR_CONFIG.gazeDampingRate})`}
        value={cfg.gazeDampingRate}
        min={1.0}
        max={20.0}
        step={0.25}
        unit="/s"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('gazeDampingRate', v)}
      />

      <SliderControl
        label={`Striker Switch Cross-Fade (${(cfg.strikerSwitchDampingRate ?? 4.2).toFixed(1)} /s)`}
        description="Smooths target & standoff transition when active touch car switches (lower = gentler switch)"
        value={cfg.strikerSwitchDampingRate ?? 4.2}
        min={0.5}
        max={15.0}
        step={0.2}
        unit="/s"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => onParamChange('strikerSwitchDampingRate', v)}
      />
    </>
  );
};
