import React from 'react';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import {
  PrecisionDigitPicker,
  useTunerPrecision,
} from '../../../primitives/PrecisionDigitPicker';
import { TunerColorRow } from '../../../compounds/TunerControls';
import {
  CubicBezierCurveEditor,
  type CubicBezierPreset,
} from '../../../charts/CubicBezierCurveEditor';
import { DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG } from '../../../config/atmosphereFxConfig';
import { PulseTwoStageGradientSection } from './PulseTwoStageGradientSection';

export const PULSE_EDGE_FADE_BEZIER_PRESETS: CubicBezierPreset[] = [
  { name: 'Default (0.5, 0, 1, 0)', value: { p1x: 0.50, p1y: 0.00, p2x: 1.00, p2y: 0.00 } },
  { name: 'Perceptual Ease', value: { p1x: 0.25, p1y: 0.85, p2x: 0.50, p2y: 1.00 } },
  { name: 'Linear (1:1)', value: { p1x: 0.33, p1y: 0.33, p2x: 0.67, p2y: 0.67 } },
  { name: 'Soft Exponential', value: { p1x: 0.55, p1y: 0.15, p2x: 0.85, p2y: 0.60 } },
];

export interface PulseWaveCardProps {
  wallConfig: typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG;
  applyWallPatch: (patch: Partial<typeof DEFAULT_EXPERIMENTAL_WALL_FX_CONFIG>) => void;
  isLight: boolean;
  cardBg: string;
  mutedText: string;
}

export const PulseWaveCard: React.FC<PulseWaveCardProps> = ({
  wallConfig,
  applyWallPatch,
  isLight,
  cardBg,
  mutedText,
}) => {
  const { step: precisionStep, setStep: setPrecisionStep } = useTunerPrecision();

  const outerRadiusUu = Math.round(wallConfig.pulseSphereRadius || 4000);
  const shrinkPct = Math.round(wallConfig.pulseFadeShrinkPct ?? 50);
  const innerFadeRadiusUu = Math.round(outerRadiusUu * (1 - shrinkPct / 100));
  const direction = wallConfig.pulseDirection || 'inward';
  const isInward = direction === 'inward';
  const steadyMode = wallConfig.pulseSteadyMode || 'wave';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
      <div className="flex flex-col">
        <span className="font-bold text-xs">
          2. Pulse Wave ({isInward ? 'Inward · Outward Fade-In' : 'Outward · Outward Fade-Out'})
        </span>
        <span className={`text-[10px] ${mutedText}`}>
          Target: Woods_Field_Walls_Hexes{' '}
          {wallConfig.pulseApplyToWalls ? '+ Woods_Field_Walls (Full Wall Surface)' : '(Hexes Only)'}
        </span>
      </div>

      <PrecisionDigitPicker
        step={precisionStep}
        onStepChange={setPrecisionStep}
        label="Precision Step"
        subtitle="Select digit & use Up/Down/Left/Right arrows on any focused parameter"
        colorScheme="amber"
        isLight={isLight}
      />

      <ToggleSwitch
        label="Enable Pulse Effect"
        description="Emits a periodic pulse wave or steady highlight inside the 3D Pulse Virtual Sphere"
        checked={wallConfig.pulseEnabled}
        onChange={(checked) => applyWallPatch({ pulseEnabled: checked })}
        isLight={isLight}
      />

      <ToggleSwitch
        label="Override onto Entire Wall Surface (Not Hexes Only)"
        description="Applies the pulse effect across the continuous solid/glass wall mesh (Woods_Field_Walls) in addition to hexes"
        checked={Boolean(wallConfig.pulseApplyToWalls)}
        onChange={(checked) => applyWallPatch({ pulseApplyToWalls: checked })}
        variant="sky"
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <ToggleSwitch
        label="Apply Pulse to Honeycomb Shield Hexes"
        description="Applies the pulse highlight and alpha multiplier to Woods_Field_Walls_Hexes"
        checked={wallConfig.pulseApplyToHexes !== false}
        onChange={(checked) => applyWallPatch({ pulseApplyToHexes: checked })}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <ToggleSwitch
        label="Preview 3D Pulse Virtual Sphere / Spheroid"
        description="Renders a 3D wireframe + translucent mesh showing the exact Pulse Sphere size & vertical elongation"
        checked={Boolean(wallConfig.pulseShowSpherePreview)}
        onChange={(checked) => applyWallPatch({ pulseShowSpherePreview: checked })}
        variant="emerald"
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <ToggleSwitch
        label="Demo Orbit Pulse Virtual Sphere"
        description="Orbits Pulse Sphere B along the side wall independently"
        checked={wallConfig.pulsePreviewOrbit}
        onChange={(checked) => applyWallPatch({ pulsePreviewOrbit: checked })}
        variant="amber"
        isLight={isLight}
      />

      {/* Pulse Propagation Direction */}
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-[11px]">Pulse Propagation Direction</span>
        <SegmentedSwitch
          value={direction}
          onChange={(val) => applyWallPatch({ pulseDirection: val })}
          options={[
            { value: 'inward', label: 'Inward (Outer → Inner · Outward Fade-In)' },
            { value: 'outward', label: 'Outward (Inner → Outer · Outward Fade-Out)' },
          ]}
          size="sm"
          fullWidth
          disabled={!wallConfig.pulseEnabled}
          isLight={isLight}
        />
      </div>

      {/* Pulse Emission / Steady Override Mode */}
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-[11px]">Pulse Emission / Steady Override Mode</span>
        <SegmentedSwitch
          value={steadyMode}
          onChange={(val) => applyWallPatch({ pulseSteadyMode: val })}
          options={[
            { value: 'wave', label: isInward ? 'Inward Pulse Wave' : 'Outward Pulse Wave' },
            { value: 'solid-override', label: 'Solid Color Override' },
            { value: 'static-ring', label: 'Static % Ring' },
          ]}
          size="sm"
          fullWidth
          disabled={!wallConfig.pulseEnabled}
          isLight={isLight}
        />
      </div>

      {steadyMode === 'static-ring' && (
        <SliderControl
          label="Static Pulse Ring Position (% of Sphere Radius)"
          description="Freezes the pulse ring at a fixed radial percentage (0% = center, 100% = outer boundary); band width uses Speed × (Rise + Fall Duration)"
          value={wallConfig.pulseStaticPositionPct ?? 47}
          min={0}
          max={100}
          step={0.5}
          unit="%"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(val) => applyWallPatch({ pulseStaticPositionPct: val })}
          disabled={!wallConfig.pulseEnabled}
          isLight={isLight}
        />
      )}

      {/* 3D Sphere Dimensions & Outer Edge Shrink Fade */}
      <SliderControl
        label="Pulse Virtual Sphere Radius"
        description="3D Virtual Sphere radius (1500–4500+ uu)"
        value={wallConfig.pulseSphereRadius}
        min={1500}
        max={4500}
        step={50}
        unit=" uu"
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(val) => applyWallPatch({ pulseSphereRadius: val })}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <SliderControl
        label="Pulse Vertical Major Axis Elongation (Prolate Spheroid)"
        description="Stretches the vertical Y semi-axis into a tall ellipsoid (R_y = Radius + Elongation)"
        value={wallConfig.pulseVerticalExtendUu ?? 0}
        min={0}
        max={3500}
        step={50}
        unit=" +uu"
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(val) => applyWallPatch({ pulseVerticalExtendUu: val })}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <SliderControl
        label={
          isInward
            ? 'Sphere Outer Boundary Outward Fade-In Shrink (%)'
            : 'Sphere Outer Boundary Outward Fade-Out Shrink (%)'
        }
        description={
          isInward
            ? `Outward Fade-In across outer ${shrinkPct}% of 3D sphere: 0.0 at ${outerRadiusUu} uu (100% rim) → 1.0 at ${innerFadeRadiusUu} uu (${100 - shrinkPct}%)`
            : `Outward Fade-Out across outer ${shrinkPct}% of 3D sphere: 1.0 at ${innerFadeRadiusUu} uu (${100 - shrinkPct}%) → 0.0 at ${outerRadiusUu} uu (100% rim)`
        }
        value={wallConfig.pulseFadeShrinkPct ?? 50}
        min={0}
        max={100}
        step={1}
        unit="%"
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(val) => {
          const clamped = Math.max(0, Math.min(100, val));
          applyWallPatch({
            pulseFadeShrinkPct: clamped,
            pulseFadeRangeUu: -Math.round(((wallConfig.pulseSphereRadius || 4000) * clamped) / 100),
          });
        }}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <CubicBezierCurveEditor
        title={
          isInward
            ? `Outward Fade-In Curve (0.0 @ 100% [${outerRadiusUu}uu] → 1.0 @ ${100 - shrinkPct}% [${innerFadeRadiusUu}uu])`
            : `Outward Fade-Out Curve (0.0 @ 100% [${outerRadiusUu}uu] → 1.0 @ ${100 - shrinkPct}% [${innerFadeRadiusUu}uu])`
        }
        p1x={wallConfig.pulseFadeBezierP1X ?? 0.5}
        p1y={wallConfig.pulseFadeBezierP1Y ?? 0.0}
        p2x={wallConfig.pulseFadeBezierP2X ?? 1.0}
        p2y={wallConfig.pulseFadeBezierP2Y ?? 0.0}
        presets={PULSE_EDGE_FADE_BEZIER_PRESETS}
        isLight={isLight}
        onChange={({ p1x, p1y, p2x, p2y }) =>
          applyWallPatch({
            pulseFadeBezierP1X: p1x,
            pulseFadeBezierP1Y: p1y,
            pulseFadeBezierP2X: p2x,
            pulseFadeBezierP2Y: p2y,
          })
        }
      />

      {steadyMode === 'wave' && (
        <SliderControl
          label="1. Pulse Emit Interval (Seconds per Pulse)"
          description="How many seconds between each emitted pulse wave (Default: 1.0s)"
          value={wallConfig.pulseIntervalSec}
          min={0.25}
          max={8.0}
          step={0.1}
          unit="s"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(val) => applyWallPatch({ pulseIntervalSec: val })}
          disabled={!wallConfig.pulseEnabled}
          isLight={isLight}
        />
      )}

      {(steadyMode === 'wave' || steadyMode === 'static-ring') && (
        <SliderControl
          label={`2. Pulse ${isInward ? 'Inward' : 'Outward'} Speed (% Radius / sec)`}
          description="100%/s traverses the entire Pulse Virtual Sphere Radius in 1.0 second; also determines the physical band width in Static % Ring mode"
          value={wallConfig.pulseSpeedRadiusPct}
          min={10}
          max={300}
          step={5}
          unit="%/s"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(val) => applyWallPatch({ pulseSpeedRadiusPct: val })}
          disabled={!wallConfig.pulseEnabled}
          isLight={isLight}
        />
      )}

      {/* Split 2-Part Pulse Wave Gradient (Part 1: 0 -> 1 Rise, Part 2: 1 -> 0 Fall) */}
      <PulseTwoStageGradientSection
        wallConfig={wallConfig}
        applyWallPatch={applyWallPatch}
        isLight={isLight}
      />

      {/* Pulse Color & Intensity */}
      <ToggleSwitch
        label="Multiply with Field Team Split Color"
        description="Multiplies the pulse color (#ffffff) by the Blue / Orange half-field team tint"
        checked={Boolean(wallConfig.pulseMultiplyTeamColor)}
        onChange={(checked) => applyWallPatch({ pulseMultiplyTeamColor: checked })}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <TunerColorRow
        label="Pulse Base Color (RGB, Default #ffffff)"
        value={wallConfig.pulseColor}
        onChange={(hex) => applyWallPatch({ pulseColor: hex })}
        isLight={isLight}
      />

      <SliderControl
        label="Pulse Intensity (Supports >1 HDR)"
        value={wallConfig.pulseIntensity}
        min={0}
        max={3}
        step={0.05}
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(val) => applyWallPatch({ pulseIntensity: val })}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />

      <SliderControl
        label="Pulse Alpha Multiplier"
        description="Scales the Shield Hexes alpha within the active pulse wave"
        value={wallConfig.pulseOpacity}
        min={0}
        max={1}
        step={0.02}
        editable={true}
        usePrecisionContext={true}
        onChange={(val) => applyWallPatch({ pulseOpacity: val })}
        disabled={!wallConfig.pulseEnabled}
        isLight={isLight}
      />
    </div>
  );
};
