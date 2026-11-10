import React from 'react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { DEFAULT_SKYBOX_CONFIG } from '../../../config/skyboxConfig';

export interface SkyboxLowerHemisphereSectionProps {
  activeCategory: 'hemisphere' | 'full-sphere';
  skyboxConfig: typeof DEFAULT_SKYBOX_CONFIG;
  applySkyboxPatch: (patch: Partial<typeof DEFAULT_SKYBOX_CONFIG>) => void;
  isLight: boolean;
  mutedText: string;
}

export const SkyboxLowerHemisphereSection: React.FC<SkyboxLowerHemisphereSectionProps> = ({
  activeCategory,
  skyboxConfig,
  applySkyboxPatch,
  isLight,
  mutedText,
}) => {
  if (activeCategory === 'full-sphere') {
    return (
      <div className="pt-1 border-t border-neutral-700/40 flex flex-col gap-2">
        <span className="font-bold text-[11px] text-emerald-400">
          Full-Sphere Lower Hemisphere (V-Offset Crop &amp; Smooth Ground Cutoff)
        </span>
        <span className={`text-[10px] ${mutedText}`}>
          Crops unwanted water/mirror reflections near the equator via Vertical V-Offset and smoothly fades the lower hemisphere into a grounded bottom color.
        </span>

        <ToggleSwitch
          label="Override Lower Texture with Horizon-Ring Gradient"
          description="Off = Renders the full-sphere lower texture with V-offset & cutoff; On = Uses hemisphere-style horizon ring gradient"
          checked={Boolean(skyboxConfig.fullSphereLowerSampleHorizon)}
          onChange={(checked) => applySkyboxPatch({ fullSphereLowerSampleHorizon: checked })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        {!skyboxConfig.fullSphereLowerSampleHorizon ? (
          <>
            <SliderControl
              label="Lower Hemisphere Vertical V-Offset (Crop Top Reflection)"
              description="Cuts off the top portion of the lower hemisphere (near v=0.5) to skip water/mirror sun glare"
              value={skyboxConfig.fullSphereLowerVOffset ?? 0.04}
              min={0}
              max={0.45}
              step={0.01}
              editable={true}
              onChange={(val) => applySkyboxPatch({ fullSphereLowerVOffset: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />

            <SliderControl
              label="Lower Hemisphere Vertical Stretch"
              description="Compresses or stretches the vertical UV mapping of the lower hemisphere texture"
              value={skyboxConfig.fullSphereLowerVerticalStretch ?? 1.0}
              min={0.3}
              max={2.5}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ fullSphereLowerVerticalStretch: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />

            <SliderControl
              label="Lower Texture Cutoff Start Elevation"
              description="Downward angle (0 = horizon, 1 = nadir) where the lower texture begins smoothing into the solid bottom color"
              value={skyboxConfig.fullSphereLowerCutoffElev ?? 0.18}
              min={0}
              max={0.85}
              step={0.02}
              editable={true}
              onChange={(val) => applySkyboxPatch({ fullSphereLowerCutoffElev: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />

            <SliderControl
              label="Lower Texture Smooth Fade Span"
              description="Vertical transition width over which the lower texture blends into the deep ground color"
              value={skyboxConfig.fullSphereLowerFadeRange ?? 0.45}
              min={0.02}
              max={0.95}
              step={0.02}
              editable={true}
              onChange={(val) => applySkyboxPatch({ fullSphereLowerFadeRange: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />

            <SliderControl
              label="Lower Hemisphere Reflection Dimming"
              description="Darkens the lower hemisphere reflection so it feels like a grounded floor rather than bright water"
              value={skyboxConfig.fullSphereLowerDimming ?? 0.25}
              min={0}
              max={0.95}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ fullSphereLowerDimming: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />
          </>
        ) : (
          <>
            <SliderControl
              label="Horizon-to-Ground Gradient Vertical Span"
              value={skyboxConfig.groundGradientRange ?? 0.95}
              min={0.05}
              max={0.95}
              step={0.02}
              editable={true}
              onChange={(val) => applySkyboxPatch({ groundGradientRange: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />

            <SliderControl
              label="Horizon Ring Sampling Blend Strength"
              value={skyboxConfig.groundHorizonStrength ?? 0.8}
              min={0}
              max={1}
              step={0.05}
              editable={true}
              onChange={(val) => applySkyboxPatch({ groundHorizonStrength: val })}
              disabled={skyboxConfig.enabled === false}
              isLight={isLight}
            />
          </>
        )}

        <TunerColorRow
          label="Deep Lower Ground Nadir Color"
          value={skyboxConfig.groundColor || '#585858'}
          onChange={(hex) => applySkyboxPatch({ groundColor: hex })}
          isLight={isLight}
        />
      </div>
    );
  }

  return (
    <div className="pt-1 border-t border-neutral-700/40 flex flex-col gap-2">
      <span className="font-bold text-[11px] text-sky-400">
        Hemisphere Lower Ground Gradient (Horizon Ring Sampling)
      </span>
      <span className={`text-[10px] ${mutedText}`}>
        Smoothly samples the upper sky dome&apos;s outer horizon ring at each azimuth angle and extends it downward as a vertical gradient into the deep ground color.
      </span>

      <ToggleSwitch
        label="Smoothly Sample Sky Horizon Ring Into Ground Gradient"
        description="Eliminates the flat solid-color ground mismatch against bright/dark sky sides"
        checked={skyboxConfig.groundSampleHorizon !== false}
        onChange={(checked) => applySkyboxPatch({ groundSampleHorizon: checked })}
        disabled={skyboxConfig.enabled === false}
        isLight={isLight}
      />

      {skyboxConfig.groundSampleHorizon !== false && (
        <>
          <SliderControl
            label="Horizon-to-Ground Gradient Vertical Span"
            description="How far down the lower hemisphere the sampled horizon color extends before reaching deep ground color"
            value={skyboxConfig.groundGradientRange ?? 0.95}
            min={0.05}
            max={0.95}
            step={0.02}
            editable={true}
            onChange={(val) => applySkyboxPatch({ groundGradientRange: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />

          <SliderControl
            label="Horizon Ring Sampling Blend Strength"
            value={skyboxConfig.groundHorizonStrength ?? 0.8}
            min={0}
            max={1}
            step={0.05}
            editable={true}
            onChange={(val) => applySkyboxPatch({ groundHorizonStrength: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />
        </>
      )}

      <TunerColorRow
        label="Deep Lower Ground Nadir Color"
        value={skyboxConfig.groundColor || '#585858'}
        onChange={(hex) => applySkyboxPatch({ groundColor: hex })}
        isLight={isLight}
      />
    </div>
  );
};
