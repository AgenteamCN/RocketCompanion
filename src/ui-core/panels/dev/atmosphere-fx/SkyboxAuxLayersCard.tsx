import React from 'react';
import { Sparkles, Cloud, Waves } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { DEFAULT_SKYBOX_CONFIG } from '../../../config/skyboxConfig';

export interface SkyboxAuxLayersCardProps {
  skyboxConfig: typeof DEFAULT_SKYBOX_CONFIG;
  applySkyboxPatch: (patch: Partial<typeof DEFAULT_SKYBOX_CONFIG>) => void;
  isLight: boolean;
  cardBg: string;
  mutedText: string;
}

export const SkyboxAuxLayersCard: React.FC<SkyboxAuxLayersCardProps> = ({
  skyboxConfig,
  applySkyboxPatch,
  isLight,
  cardBg,
  mutedText,
}) => {
  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
      <div className="flex flex-col">
        <span className="font-bold text-xs">Auxiliary Skybox FX Layers (Optional Overlays)</span>
        <span className={`text-[10px] ${mutedText}`}>
          Zero GPU cost when disabled. Toggle to composite Farmstead Sun Corona/Glow or Forbidden Temple Cloud &amp; Normal maps.
        </span>
      </div>

      {/* Layer 1: Sun Corona & Radial Glow */}
      <div className="p-2 rounded-lg border border-neutral-700/40 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-bold text-[11px]">
            1. Sun Corona Starburst &amp; Glow (Corona_Sun01_D + Sun_Glow_001_D)
          </span>
        </div>

        <ToggleSwitch
          label="Enable Sun Corona & Halo Glow Layer"
          description="Composites 6-ray corona starburst and radial atmospheric glow onto the sky dome"
          checked={Boolean(skyboxConfig.coronaEnabled)}
          onChange={(checked) => applySkyboxPatch({ coronaEnabled: checked })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        {skyboxConfig.coronaEnabled && (
          <>
            <ToggleSwitch
              label="Lock Corona to Scene Directional Sun Light"
              description="On = Places corona at the actual 3D directional light position; Off = Custom sky azimuth/elevation"
              checked={Boolean(skyboxConfig.coronaFollowSceneSun)}
              onChange={(checked) => applySkyboxPatch({ coronaFollowSceneSun: checked })}
              isLight={isLight}
            />

            {!skyboxConfig.coronaFollowSceneSun && (
              <>
                <SliderControl
                  label="Corona Sun Azimuth"
                  description="0° aligns with the painted sun in Woods_Sky_D / CHN_Sky3"
                  value={skyboxConfig.coronaAzimuthDeg ?? 0}
                  min={-180}
                  max={180}
                  step={1}
                  unit="°"
                  editable={true}
                  allowOutOfBoundsInput={true}
                  onChange={(val) => applySkyboxPatch({ coronaAzimuthDeg: val })}
                  isLight={isLight}
                />

                <SliderControl
                  label="Corona Sun Elevation"
                  value={skyboxConfig.coronaElevationDeg ?? 3.5}
                  min={-10}
                  max={85}
                  step={0.5}
                  unit="°"
                  editable={true}
                  allowOutOfBoundsInput={true}
                  onChange={(val) => applySkyboxPatch({ coronaElevationDeg: val })}
                  isLight={isLight}
                />
              </>
            )}

            <TunerColorRow
              label="Sun Glow & Corona Tint Color"
              value={skyboxConfig.sunGlowColor || '#ffaa44'}
              onChange={(hex) => applySkyboxPatch({ sunGlowColor: hex })}
              isLight={isLight}
            />

            <SliderControl
              label="Corona 6-Ray Starburst Intensity"
              value={skyboxConfig.coronaIntensity ?? 1.25}
              min={0}
              max={4}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ coronaIntensity: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Corona Starburst Angular Size"
              value={skyboxConfig.coronaSize ?? 0.16}
              min={0.03}
              max={0.6}
              step={0.01}
              editable={true}
              onChange={(val) => applySkyboxPatch({ coronaSize: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Corona Ray Roll Angle"
              value={skyboxConfig.coronaRotationDeg ?? 0}
              min={0}
              max={180}
              step={2}
              unit="°"
              editable={true}
              onChange={(val) => applySkyboxPatch({ coronaRotationDeg: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Sun Radial Halo Glow Intensity"
              value={skyboxConfig.sunGlowIntensity ?? 0.65}
              min={0}
              max={3}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ sunGlowIntensity: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Sun Radial Halo Glow Size"
              value={skyboxConfig.sunGlowSize ?? 0.42}
              min={0.08}
              max={1.2}
              step={0.02}
              editable={true}
              onChange={(val) => applySkyboxPatch({ sunGlowSize: val })}
              isLight={isLight}
            />
          </>
        )}
      </div>

      {/* Layer 2: Horizon Cumulus Cloud Overlay */}
      <div className="p-2 rounded-lg border border-neutral-700/40 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Cloud className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-bold text-[11px]">
            2. Horizon Cumulus Cloud Belt Overlay (ForbiddenTemple_Beach_Clouds_01.webp)
          </span>
        </div>

        <ToggleSwitch
          label="Enable Drifting Horizon Cumulus Cloud Overlay"
          description="Extracts the cumulus cloud belt from Forbidden Temple and drifts it across the active skybox"
          checked={Boolean(skyboxConfig.cloudOverlayEnabled)}
          onChange={(checked) => applySkyboxPatch({ cloudOverlayEnabled: checked })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        {skyboxConfig.cloudOverlayEnabled && (
          <>
            <SliderControl
              label="Cloud Overlay Opacity"
              value={skyboxConfig.cloudOverlayOpacity ?? 0.45}
              min={0.05}
              max={1}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ cloudOverlayOpacity: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Cloud Azimuth Drift Speed"
              value={skyboxConfig.cloudOverlayScrollSpeed ?? 1.5}
              min={-15}
              max={15}
              step={0.25}
              unit=" °/s"
              editable={true}
              onChange={(val) => applySkyboxPatch({ cloudOverlayScrollSpeed: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Cloud Belt Elevation Offset"
              value={skyboxConfig.cloudOverlayElevationOffset ?? 0.0}
              min={-0.15}
              max={0.25}
              step={0.01}
              editable={true}
              onChange={(val) => applySkyboxPatch({ cloudOverlayElevationOffset: val })}
              isLight={isLight}
            />
          </>
        )}
      </div>

      {/* Layer 3: Lower-Hemisphere OOB Cloud-Sea Normal Map */}
      <div className="p-2 rounded-lg border border-neutral-700/40 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Waves className="h-3.5 w-3.5 text-indigo-400" />
          <span className="font-bold text-[11px]">
            3. Lower-Hemisphere Cloud-Sea Normal Map (OOB_PlanetClouds_N3.png)
          </span>
        </div>

        <ToggleSwitch
          label="Enable OOB Cloud-Sea Normal Perturbation"
          description="Applies dual-scrolling tangent normal ripples to the lower ground hemisphere"
          checked={Boolean(skyboxConfig.oobNormalEnabled)}
          onChange={(checked) => applySkyboxPatch({ oobNormalEnabled: checked })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        {skyboxConfig.oobNormalEnabled && (
          <>
            <SliderControl
              label="Normal Ripple Highlight Strength"
              value={skyboxConfig.oobNormalStrength ?? 0.35}
              min={0.05}
              max={1}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ oobNormalStrength: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Cloud-Sea Tile Scale"
              value={skyboxConfig.oobNormalTileScale ?? 6.0}
              min={1}
              max={20}
              step={0.5}
              editable={true}
              onChange={(val) => applySkyboxPatch({ oobNormalTileScale: val })}
              isLight={isLight}
            />

            <SliderControl
              label="Cloud-Sea Drift Speed"
              value={skyboxConfig.oobNormalScrollSpeed ?? 0.06}
              min={0}
              max={0.5}
              step={0.01}
              editable={true}
              onChange={(val) => applySkyboxPatch({ oobNormalScrollSpeed: val })}
              isLight={isLight}
            />
          </>
        )}
      </div>
    </div>
  );
};
