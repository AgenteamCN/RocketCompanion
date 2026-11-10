import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG } from '../../../config/atmosphereFxConfig';
import { PulseWaveCard } from './PulseWaveCard';

export interface WallPulseTabProps {
  wallConfig: typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG;
  applyWallPatch: (patch: Partial<typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG>) => void;
  isLight: boolean;
  cardBg: string;
  mutedText: string;
}

export const WallPulseTab: React.FC<WallPulseTabProps> = ({
  wallConfig,
  applyWallPatch,
  isLight,
  cardBg,
  mutedText,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Layer 1: 3D Sphere-Wall Intersection Outer Ring (Glass Walls Only) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-bold text-xs">1. Outer Ring Lines (Glass Walls Only)</span>
            <span className={`text-[10px] ${mutedText}`}>Target: Woods_Field_Walls</span>
          </div>
          <button
            type="button"
            onClick={() => applyWallPatch({ ...DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG })}
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset All</span>
          </button>
        </div>

        <ToggleSwitch
          label="Enable Outer Intersection Ring"
          description="Draws the 3D sphere-plane outer ring on the solid/glass walls"
          checked={wallConfig.circleEnabled}
          onChange={(checked) => applyWallPatch({ circleEnabled: checked })}
          isLight={isLight}
        />

        <ToggleSwitch
          label="Preview 3D Ring Virtual Sphere / Spheroid"
          description="Renders a 3D wireframe + translucent mesh showing the exact Ring Sphere size & vertical elongation"
          checked={Boolean(wallConfig.circleShowSpherePreview)}
          onChange={(checked) => applyWallPatch({ circleShowSpherePreview: checked })}
          variant="emerald"
          disabled={!wallConfig.circleEnabled}
          isLight={isLight}
        />

        <ToggleSwitch
          label="Demo Orbit Ring Virtual Sphere"
          description="Orbits Ring Sphere A along the side wall independently"
          checked={wallConfig.circlePreviewOrbit}
          onChange={(checked) => applyWallPatch({ circlePreviewOrbit: checked })}
          variant="amber"
          isLight={isLight}
        />

        <SliderControl
          label="Ring Virtual Sphere Radius"
          value={wallConfig.circleRadius}
          min={100}
          max={2000}
          step={25}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyWallPatch({ circleRadius: val })}
          disabled={!wallConfig.circleEnabled}
          isLight={isLight}
        />

        <SliderControl
          label="Ring Vertical Major Axis Elongation (Prolate Spheroid)"
          description="Stretches the vertical Y semi-axis upward/downward (R_y = Radius + Elongation)"
          value={wallConfig.circleVerticalExtendUu ?? 0}
          min={0}
          max={2500}
          step={25}
          unit=" +uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyWallPatch({ circleVerticalExtendUu: val })}
          disabled={!wallConfig.circleEnabled}
          isLight={isLight}
        />

        <SliderControl
          label="Ring Line Thickness"
          value={wallConfig.circleThickness}
          min={2}
          max={60}
          step={1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyWallPatch({ circleThickness: val })}
          disabled={!wallConfig.circleEnabled}
          isLight={isLight}
        />

        <ToggleSwitch
          label="Follow Half-Field Team Split Color"
          description="Automatically tints the outer ring using the Blue / Orange half-field split at that Z coordinate"
          checked={Boolean(wallConfig.circleUseTeamColor)}
          onChange={(checked) => applyWallPatch({ circleUseTeamColor: checked })}
          disabled={!wallConfig.circleEnabled}
          isLight={isLight}
        />

        {!wallConfig.circleUseTeamColor && (
          <TunerColorRow
            label="Fallback Custom Ring Color (Default #d6d6d6)"
            value={wallConfig.circleColor}
            onChange={(hex) => applyWallPatch({ circleColor: hex })}
            isLight={isLight}
          />
        )}

        <SliderControl
          label="Ring Opacity (Alpha)"
          value={wallConfig.circleOpacity}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyWallPatch({ circleOpacity: val })}
          disabled={!wallConfig.circleEnabled}
          isLight={isLight}
        />
      </div>

      {/* Layer 2: Periodic Pulse Wave (Shield Hexes & Optional Solid Walls) */}
      <PulseWaveCard
        wallConfig={wallConfig}
        applyWallPatch={applyWallPatch}
        isLight={isLight}
        cardBg={cardBg}
        mutedText={mutedText}
      />

      {/* Layer 3: Half-Field Team Color Split (Shield Hexes Only) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex flex-col">
          <span className="font-bold text-xs">3. Half-Field Team Split (Shield Hexes Only)</span>
          <span className={`text-[10px] ${mutedText}`}>Target: Woods_Field_Walls_Hexes</span>
        </div>

        <ToggleSwitch
          label="Enable Blue / Orange Half-Field Hex Split"
          description="Tints Shield Hexes into Blue (Z < 0) and Orange (Z > 0)"
          checked={wallConfig.teamGradientEnabled}
          onChange={(checked) => applyWallPatch({ teamGradientEnabled: checked })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Blue Team Color (RGB, Z < 0, Default #0089ff)"
          value={wallConfig.blueTeamColor}
          onChange={(hex) => applyWallPatch({ blueTeamColor: hex })}
          isLight={isLight}
        />

        <SliderControl
          label="Blue Team Alpha"
          value={wallConfig.blueTeamAlpha}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyWallPatch({ blueTeamAlpha: val })}
          disabled={!wallConfig.teamGradientEnabled}
          isLight={isLight}
        />

        <TunerColorRow
          label="Orange Team Color (RGB, Z > 0, Default #ff5200)"
          value={wallConfig.orangeTeamColor}
          onChange={(hex) => applyWallPatch({ orangeTeamColor: hex })}
          isLight={isLight}
        />

        <SliderControl
          label="Orange Team Alpha"
          value={wallConfig.orangeTeamAlpha}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyWallPatch({ orangeTeamAlpha: val })}
          disabled={!wallConfig.teamGradientEnabled}
          isLight={isLight}
        />

        <TunerColorRow
          label="Center Line Color (RGB, Z = 0, Default #ffffff)"
          value={wallConfig.centerLineColor}
          onChange={(hex) => applyWallPatch({ centerLineColor: hex })}
          isLight={isLight}
        />

        <SliderControl
          label="Center Line Alpha (Default 0)"
          value={wallConfig.centerLineAlpha}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyWallPatch({ centerLineAlpha: val })}
          disabled={!wallConfig.teamGradientEnabled}
          isLight={isLight}
        />

        <SliderControl
          label="Center White Line Half-Width"
          description="Half-width of the solid center stripe at |Z| <= HalfWidth before the team gradient starts"
          value={wallConfig.centerLineWidth}
          min={5}
          max={100}
          step={5}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyWallPatch({ centerLineWidth: val })}
          disabled={!wallConfig.teamGradientEnabled}
          isLight={isLight}
        />

        <SliderControl
          label="Team Color Gradient Transition Width"
          value={wallConfig.teamTransitionWidth}
          min={20}
          max={2000}
          step={20}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyWallPatch({ teamTransitionWidth: val })}
          disabled={!wallConfig.teamGradientEnabled}
          isLight={isLight}
        />

        <SliderControl
          label="Team Tint Strength"
          value={wallConfig.teamColorStrength}
          min={0.05}
          max={3.0}
          step={0.05}
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyWallPatch({ teamColorStrength: val })}
          disabled={!wallConfig.teamGradientEnabled}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
