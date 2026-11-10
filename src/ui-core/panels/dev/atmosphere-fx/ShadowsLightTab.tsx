import React from 'react';
import { RotateCcw, Compass, Sun, Lightbulb, Globe } from 'lucide-react';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { DEFAULT_SHADOW_CONFIG } from '../../../config/atmosphereFxConfig';

export interface ShadowsLightTabProps {
  shadowConfig: typeof DEFAULT_SHADOW_CONFIG;
  applyShadowPatch: (patch: Partial<typeof DEFAULT_SHADOW_CONFIG>) => void;
  isLight: boolean;
  cardBg: string;
}

export const ShadowsLightTab: React.FC<ShadowsLightTabProps> = ({
  shadowConfig,
  applyShadowPatch,
  isLight,
  cardBg,
}) => {
  const ox = shadowConfig.sunOffsetX ?? DEFAULT_SHADOW_CONFIG.sunOffsetX;
  const oy = shadowConfig.sunOffsetY ?? DEFAULT_SHADOW_CONFIG.sunOffsetY;
  const oz = shadowConfig.sunOffsetZ ?? DEFAULT_SHADOW_CONFIG.sunOffsetZ;
  const az = shadowConfig.sunAzimuthDeg ?? DEFAULT_SHADOW_CONFIG.sunAzimuthDeg;
  const el = shadowConfig.sunElevationDeg ?? DEFAULT_SHADOW_CONFIG.sunElevationDeg;
  const dist = shadowConfig.sunDistance ?? DEFAULT_SHADOW_CONFIG.sunDistance;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Card 1: 3D Light Source Ray & Position Visualizer */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-bold text-xs">3D Light Source Position &amp; Ray Visualizer</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Az {az}° · El {el}°
          </span>
        </div>

        <div className="px-2 py-1.5 rounded-lg border border-neutral-700/50 bg-neutral-900/30 text-[10px] font-mono flex flex-col gap-0.5">
          <div>
            Sun Offset (XYZ): <b className="text-amber-400">({ox}, {oy}, {oz}) uu</b> · Dist:{' '}
            <b className="text-amber-400">{dist} uu</b>
          </div>
          <div className="opacity-75">
            Default Skybox Sun (Woods/CHN_Sky3 @ 0°): Azimuth 0.0° (+X), Elevation ~3.5°
          </div>
        </div>

        <ToggleSwitch
          label="Draw 3D Line & Sun Beacon Toward Primary Sun Light"
          description="Draws a golden ray from your chosen origin through the shadow light out to the sky dome"
          checked={Boolean(shadowConfig.showLightGizmo)}
          onChange={(checked) => applyShadowPatch({ showLightGizmo: checked })}
          isLight={isLight}
        />

        {shadowConfig.showLightGizmo && (
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[11px]">Light Ray Start Anchor (Origin)</span>
            <SegmentedSwitch
              value={shadowConfig.lightRayOrigin || 'car'}
              onChange={(val) => applyShadowPatch({ lightRayOrigin: val })}
              options={[
                { value: 'car', label: 'Player Car' },
                { value: 'camera', label: 'Camera Eye' },
                { value: 'ball', label: 'Ball' },
                { value: 'origin', label: 'Center (0,0,0)' },
              ]}
              size="sm"
              fullWidth
              isLight={isLight}
            />
          </div>
        )}

        <ToggleSwitch
          label="Also Draw Secondary Key Light Ray (Cyan)"
          description="Visualizes the secondary fill/backlight direction from the same origin"
          checked={Boolean(shadowConfig.showKeyLightGizmo)}
          onChange={(checked) => applyShadowPatch({ showKeyLightGizmo: checked })}
          isLight={isLight}
        />

        {(shadowConfig.showLightGizmo || shadowConfig.showKeyLightGizmo) && (
          <ToggleSwitch
            label="Occlude Debug Ray Behind Stadium Walls (Depth Test)"
            description="Off (Default) = X-Ray overlay visible through walls and ceiling"
            checked={Boolean(shadowConfig.lightGizmoDepthTest)}
            onChange={(checked) => applyShadowPatch({ lightGizmoDepthTest: checked })}
            isLight={isLight}
          />
        )}
      </div>

      {/* Card 2: Primary Directional Sun Light Position & Intensity */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-bold text-xs">Primary Sun Directional Light (Shadow Caster)</span>
          </div>
          <button
            type="button"
            onClick={() =>
              applyShadowPatch({
                sunOffsetX: DEFAULT_SHADOW_CONFIG.sunOffsetX,
                sunOffsetY: DEFAULT_SHADOW_CONFIG.sunOffsetY,
                sunOffsetZ: DEFAULT_SHADOW_CONFIG.sunOffsetZ,
                sunAzimuthDeg: DEFAULT_SHADOW_CONFIG.sunAzimuthDeg,
                sunElevationDeg: DEFAULT_SHADOW_CONFIG.sunElevationDeg,
                sunDistance: DEFAULT_SHADOW_CONFIG.sunDistance,
                sunColor: DEFAULT_SHADOW_CONFIG.sunColor,
                sunIntensity: DEFAULT_SHADOW_CONFIG.sunIntensity,
              })
            }
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset Sun</span>
          </button>
        </div>

        <SliderControl
          label="Sun Horizontal Azimuth Angle"
          description="Default: 10.0° (0° = +X axis)"
          value={az}
          min={-180}
          max={180}
          step={1}
          unit="°"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyShadowPatch({ sunAzimuthDeg: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Sun Vertical Elevation Angle"
          description="Default: 52.0° high angle for crisp car/ball ground shadows"
          value={el}
          min={3}
          max={88}
          step={0.5}
          unit="°"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyShadowPatch({ sunElevationDeg: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Sun Shadow Rig Offset Distance"
          description="Distance from shadow focus target to directional light camera (Default: 5002 uu)"
          value={dist}
          min={1500}
          max={12000}
          step={50}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyShadowPatch({ sunDistance: val })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Primary Sun Light Color"
          value={shadowConfig.sunColor || '#ffffff'}
          onChange={(hex) => applyShadowPatch({ sunColor: hex })}
          isLight={isLight}
        />

        <SliderControl
          label="Primary Sun Light Intensity"
          description="Default: 2.0 in Single-Sun / Off modes"
          value={shadowConfig.sunIntensity ?? 2.0}
          min={0}
          max={5}
          step={0.05}
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyShadowPatch({ sunIntensity: val })}
          isLight={isLight}
        />
      </div>

      {/* Card 3: Shadow Camera & Edge Sharpness */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs">Shadow Camera &amp; Edge Sharpness</span>
          <button
            type="button"
            onClick={() => applyShadowPatch({ ...DEFAULT_SHADOW_CONFIG })}
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset All</span>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[11px]">Shadow Rig Mode</span>
          <SegmentedSwitch
            value={shadowConfig.mode}
            onChange={(val) => applyShadowPatch({ mode: val })}
            options={[
              { value: 'off', label: 'Off (0 Passes)' },
              { value: 'single-sun', label: 'Single Sun Focus (1 Pass)' },
              { value: 'multi', label: 'Multi-Entity (3 Passes)' },
            ]}
            size="sm"
            fullWidth
            isLight={isLight}
          />
        </div>

        <ToggleSwitch
          label="Vehicles Receive Shadows (Self-Shadowing)"
          description="Off (Default) = Shadows project onto ground only, preventing shadow acne on vehicle backfaces"
          checked={Boolean(shadowConfig.carsReceiveShadows)}
          onChange={(checked) => applyShadowPatch({ carsReceiveShadows: checked })}
          disabled={shadowConfig.mode === 'off'}
          isLight={isLight}
        />

        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[11px]">Shadow Edge Sharpness (Filter Kernel)</span>
          <SegmentedSwitch
            value={shadowConfig.sharpness}
            onChange={(val) => applyShadowPatch({ sharpness: val })}
            options={[
              { value: 'sharp', label: 'Sharp (1-Tap Basic)' },
              { value: 'pcf', label: 'Medium (PCF)' },
              { value: 'soft', label: 'Soft (PCFSoft)' },
            ]}
            size="sm"
            fullWidth
            disabled={shadowConfig.mode === 'off'}
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[11px]">Shadow Map Resolution (Square Texture)</span>
          <SegmentedSwitch
            value={String(shadowConfig.mapSize)}
            onChange={(val) => applyShadowPatch({ mapSize: Number(val) })}
            options={[
              { value: '1024', label: '1024×1024' },
              { value: '2048', label: '2048×2048' },
              { value: '3072', label: '3072×3072' },
              { value: '4096', label: '4096×4096' },
            ]}
            size="sm"
            fullWidth
            disabled={shadowConfig.mode === 'off'}
            isLight={isLight}
          />
        </div>

        <SliderControl
          label="Single-Sun Focus Box Half-Width"
          description="Orthographic box radius around player car (Default: 1100 uu)"
          value={shadowConfig.singleSunFrustumRadius}
          min={260}
          max={2600}
          step={20}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyShadowPatch({ singleSunFrustumRadius: val })}
          disabled={shadowConfig.mode !== 'single-sun'}
          isLight={isLight}
        />
      </div>

      {/* Card 4: Secondary Key Directional Light & Hemisphere Ambient Light */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-bold text-xs">Secondary Key Fill Light &amp; Hemisphere Ambient</span>
        </div>

        <ToggleSwitch
          label="Enable Secondary Key Fill Directional Light"
          description="Soft cool fill light illuminating dark shadow sides (Default: (-2000, 2000, -2000))"
          checked={shadowConfig.keyLightEnabled !== false}
          onChange={(checked) => applyShadowPatch({ keyLightEnabled: checked })}
          isLight={isLight}
        />

        {shadowConfig.keyLightEnabled !== false && (
          <>
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-[11px]">Key Light Direction Mode</span>
              <SegmentedSwitch
                value={shadowConfig.keyLightMode || 'fixed'}
                onChange={(val) => applyShadowPatch({ keyLightMode: val })}
                options={[
                  { value: 'fixed', label: 'Fixed (-2000,2000,-2000)' },
                  { value: 'opposite-sun', label: 'Opposite to Sun (+180°)' },
                  { value: 'custom', label: 'Custom Angle' },
                ]}
                size="sm"
                fullWidth
                isLight={isLight}
              />
            </div>

            {shadowConfig.keyLightMode === 'custom' && (
              <SliderControl
                label="Key Light Custom Azimuth"
                value={shadowConfig.keyLightAzimuthDeg ?? -135}
                min={-180}
                max={180}
                step={5}
                unit="°"
                editable={true}
                onChange={(val) => applyShadowPatch({ keyLightAzimuthDeg: val })}
                isLight={isLight}
              />
            )}

            {shadowConfig.keyLightMode !== 'fixed' && (
              <SliderControl
                label="Key Light Elevation"
                value={shadowConfig.keyLightElevationDeg ?? 35.3}
                min={5}
                max={85}
                step={1}
                unit="°"
                editable={true}
                onChange={(val) => applyShadowPatch({ keyLightElevationDeg: val })}
                isLight={isLight}
              />
            )}

            <TunerColorRow
              label="Key Fill Light Color (Default #88aadf)"
              value={shadowConfig.keyLightColor || '#88aadf'}
              onChange={(hex) => applyShadowPatch({ keyLightColor: hex })}
              isLight={isLight}
            />

            <SliderControl
              label="Key Fill Light Intensity"
              value={shadowConfig.keyLightIntensity ?? 0.35}
              min={0}
              max={2.5}
              step={0.05}
              editable={true}
              onChange={(val) => applyShadowPatch({ keyLightIntensity: val })}
              isLight={isLight}
            />
          </>
        )}

        <div className="pt-1 border-t border-neutral-700/40 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-bold text-[11px]">Hemisphere Ambient Light (Sky Zenith ↔ Ground Bounce)</span>
          </div>

          <ToggleSwitch
            label="Enable Hemisphere Ambient Light"
            description="Blends upper-normal surfaces toward Sky Color and downward-normal surfaces toward Ground Color"
            checked={shadowConfig.hemiLightEnabled !== false}
            onChange={(checked) => applyShadowPatch({ hemiLightEnabled: checked })}
            isLight={isLight}
          />

          {shadowConfig.hemiLightEnabled !== false && (
            <>
              <TunerColorRow
                label="Hemisphere Sky Color (Default #c8e0ff)"
                value={shadowConfig.hemiSkyColor || '#c8e0ff'}
                onChange={(hex) => applyShadowPatch({ hemiSkyColor: hex })}
                isLight={isLight}
              />

              <TunerColorRow
                label="Hemisphere Ground Bounce Color (Default #2732c8)"
                value={shadowConfig.hemiGroundColor || '#2732c8'}
                onChange={(hex) => applyShadowPatch({ hemiGroundColor: hex })}
                isLight={isLight}
              />

              <SliderControl
                label="Hemisphere Ambient Intensity (Default 1.15)"
                value={shadowConfig.hemiIntensity ?? 1.15}
                min={0}
                max={3.5}
                step={0.05}
                editable={true}
                onChange={(val) => applyShadowPatch({ hemiIntensity: val })}
                isLight={isLight}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
