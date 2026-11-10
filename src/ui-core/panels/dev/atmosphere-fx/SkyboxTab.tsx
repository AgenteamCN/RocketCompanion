import React from 'react';
import { RotateCcw, ChevronLeft, ChevronRight, Globe, Compass } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { SkyboxAuxLayersCard } from './SkyboxAuxLayersCard';
import { SkyboxLowerHemisphereSection } from './SkyboxLowerHemisphereSection';
import { DEFAULT_SKYBOX_CONFIG, resolveSkyboxPreset } from '../../../config/skyboxConfig';
import { HEMISPHERE_SKYBOX_PRESETS, FULL_SPHERE_SKYBOX_PRESETS, getPresetsByCategory } from '../../../config/skyboxPresets';

export interface SkyboxTabProps {
  skyboxConfig: typeof DEFAULT_SKYBOX_CONFIG;
  applySkyboxPatch: (patch: Partial<typeof DEFAULT_SKYBOX_CONFIG>) => void;
  isLight: boolean;
  cardBg: string;
  mutedText: string;
}

export const SkyboxTab: React.FC<SkyboxTabProps> = ({
  skyboxConfig,
  applySkyboxPatch,
  isLight,
  cardBg,
  mutedText,
}) => {
  const activePreset = resolveSkyboxPreset(
    skyboxConfig.presetId || skyboxConfig.texturePath,
    skyboxConfig.skyCategory === 'full-sphere' ? 'full-sphere' : 'hemisphere'
  );
  const activeCategory: 'hemisphere' | 'full-sphere' =
    (skyboxConfig.skyCategory || activePreset.category) === 'full-sphere'
      ? 'full-sphere'
      : 'hemisphere';

  const categoryPresets = getPresetsByCategory(activeCategory);
  const activePresetIndex = Math.max(
    0,
    categoryPresets.findIndex((p) => p.id === activePreset.id)
  );

  const switchCategory = (targetCategory: 'hemisphere' | 'full-sphere') => {
    if (targetCategory === activeCategory) return;
    applySkyboxPatch({
      skyCategory: targetCategory,
      useTexture: true,
      mode: 'texture',
    });
  };

  const cyclePreset = (delta: number) => {
    const nextIdx = (activePresetIndex + delta + categoryPresets.length) % categoryPresets.length;
    const nextPreset = categoryPresets[nextIdx];
    applySkyboxPatch({
      skyCategory: activeCategory,
      presetId: nextPreset.id,
      texturePath: nextPreset.path,
      useTexture: true,
      mode: 'texture',
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Card 1: Top-Level Category Segmented Control & Skybox Preset Switcher */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-bold text-xs">Camera-Locked Skybox Architecture</span>
            <span className={`text-[10px] ${mutedText}`}>
              {activeCategory === 'full-sphere'
                ? `Full Sphere 360°×180° · ${activePreset.shortLabel} (${activePreset.resolution})`
                : `Upper Hemisphere · ${activePreset.shortLabel} (${activePreset.resolution})`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => applySkyboxPatch({ ...DEFAULT_SKYBOX_CONFIG })}
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Large Primary Segmented Control: Hemisphere vs Full Sphere */}
        <div
          className={`p-1 rounded-xl border grid grid-cols-2 gap-1 ${
            isLight
              ? 'bg-neutral-200/80 border-neutral-300'
              : 'bg-neutral-950/70 border-neutral-800'
          }`}
        >
          <button
            type="button"
            disabled={skyboxConfig.enabled === false}
            onClick={() => switchCategory('hemisphere')}
            className={`py-2 px-3 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer disabled:opacity-40 ${
              activeCategory === 'hemisphere'
                ? 'bg-sky-500/20 border border-sky-500/80 text-sky-300 shadow-sm'
                : isLight
                  ? 'text-neutral-600 hover:bg-white/60 border border-transparent'
                  : 'text-neutral-400 hover:bg-neutral-800/60 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <Compass className="h-3.5 w-3.5" />
              <span>Hemisphere</span>
            </div>
            <span className="text-[9px] opacity-75">
              Original 5 Presets ({HEMISPHERE_SKYBOX_PRESETS.length}) · Horizon Ring Ground
            </span>
          </button>

          <button
            type="button"
            disabled={skyboxConfig.enabled === false}
            onClick={() => switchCategory('full-sphere')}
            className={`py-2 px-3 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer disabled:opacity-40 ${
              activeCategory === 'full-sphere'
                ? 'bg-emerald-500/20 border border-emerald-500/80 text-emerald-300 shadow-sm'
                : isLight
                  ? 'text-neutral-600 hover:bg-white/60 border border-transparent'
                  : 'text-neutral-400 hover:bg-neutral-800/60 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <Globe className="h-3.5 w-3.5" />
              <span>Full Sphere</span>
            </div>
            <span className="text-[9px] opacity-75">
              CC0 Cloudy Pack ({FULL_SPHERE_SKYBOX_PRESETS.length} WebP) · 360°×180°
            </span>
          </button>
        </div>

        {/* Category-Specific Preset Selector */}
        <div className="p-2 rounded-lg border border-neutral-700/50 bg-neutral-900/30 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-[11px]">
                {activeCategory === 'full-sphere'
                  ? `CC0 Full-Sphere Panorama (${activePresetIndex + 1} / ${categoryPresets.length})`
                  : `Hemisphere Panorama (${activePresetIndex + 1} / ${categoryPresets.length})`}
              </span>
              <span className={`text-[10px] font-mono truncate ${mutedText}`}>
                {activePreset.path}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => cyclePreset(-1)}
                disabled={skyboxConfig.enabled === false}
                className="px-2 py-1 rounded border border-neutral-600/60 hover:bg-neutral-500/20 flex items-center gap-0.5 text-[10px] cursor-pointer disabled:opacity-40"
                title="Previous Skybox"
              >
                <ChevronLeft className="h-3 w-3" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={() => cyclePreset(1)}
                disabled={skyboxConfig.enabled === false}
                className="px-2 py-1 rounded border border-neutral-600/60 hover:bg-neutral-500/20 flex items-center gap-0.5 text-[10px] cursor-pointer disabled:opacity-40"
                title="Next Skybox"
              >
                <span>Next</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 gap-1 ${
              activeCategory === 'full-sphere' ? 'max-h-52 overflow-y-auto pr-1' : ''
            }`}
          >
            {categoryPresets.map((preset, idx) => {
              const isSelected = preset.id === activePreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={skyboxConfig.enabled === false}
                  onClick={() =>
                    applySkyboxPatch({
                      skyCategory: activeCategory,
                      presetId: preset.id,
                      texturePath: preset.path,
                      useTexture: true,
                      mode: 'texture',
                    })
                  }
                  className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? activeCategory === 'full-sphere'
                        ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-300 font-semibold'
                        : 'border-sky-500/80 bg-sky-500/15 text-sky-300 font-semibold'
                      : isLight
                        ? 'border-neutral-300 bg-white/70 hover:bg-neutral-100 text-neutral-700'
                        : 'border-neutral-700/60 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono opacity-60">#{idx + 1}</span>
                    <span className="text-[11px] truncate">{preset.label}</span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-950/40 border border-neutral-700/50 shrink-0">
                    {preset.resolution}
                  </span>
                </button>
              );
            })}
          </div>

          {activeCategory === 'full-sphere' && (
            <div className={`text-[9px] pt-0.5 flex items-center justify-between ${mutedText}`}>
              <span>Author: Screaming Brain Studios (CC0 1.0 Public Domain)</span>
              <span className="font-mono">CREDITS.md included</span>
            </div>
          )}
        </div>

        <ToggleSwitch
          label="Enable Camera-Centered Sky Dome"
          description="Locks the sky dome translation to the camera so you can never fly outside the sphere"
          checked={skyboxConfig.enabled !== false}
          onChange={(checked) => applySkyboxPatch({ enabled: checked })}
          isLight={isLight}
        />

        <ToggleSwitch
          label="Use Panoramic Sky Texture"
          description="Maps the selected panoramic texture onto the sky dome (Off = procedural gradient)"
          checked={
            skyboxConfig.useTexture !== undefined
              ? Boolean(skyboxConfig.useTexture)
              : skyboxConfig.mode === 'texture'
          }
          onChange={(checked) =>
            applySkyboxPatch({ useTexture: checked, mode: checked ? 'texture' : 'procedural' })
          }
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        <SliderControl
          label="Sky Azimuth Rotation"
          value={skyboxConfig.rotationDeg ?? skyboxConfig.textureRotationDeg ?? 0}
          min={0}
          max={360}
          step={5}
          unit="°"
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applySkyboxPatch({ rotationDeg: val, textureRotationDeg: val })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        <SliderControl
          label="Sky Brightness / Exposure"
          value={skyboxConfig.exposure ?? skyboxConfig.textureExposure ?? 0.6}
          min={0.1}
          max={2.5}
          step={0.05}
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applySkyboxPatch({ exposure: val, textureExposure: val })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        <SliderControl
          label="Upper Hemisphere Vertical Stretch"
          description="Adjusts vertical UV mapping compression near the zenith/horizon"
          value={skyboxConfig.upperVerticalStretch ?? 1.0}
          min={0.5}
          max={2.0}
          step={0.05}
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applySkyboxPatch({ upperVerticalStretch: val })}
          disabled={skyboxConfig.enabled === false}
          isLight={isLight}
        />

        <div className="pt-1 border-t border-neutral-700/40 flex flex-col gap-2">
          <span className="font-bold text-[11px]">Azimuthal Light / Dark Contrast Balancer</span>

          <SliderControl
            label="Bright / Dark Hemisphere Contrast Dampening"
            description="Softens the stark bright-sun vs dark-shadow contrast across the two sides of the sky texture"
            value={skyboxConfig.contrastBalance ?? 0.15}
            min={0}
            max={1}
            step={0.05}
            editable={true}
            onChange={(val) => applySkyboxPatch({ contrastBalance: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />

          <SliderControl
            label="Contrast Target Luminance Midpoint"
            description="Anchor luminance that dark clouds are lifted toward and bright sun glare rolls off toward"
            value={skyboxConfig.contrastMidpoint ?? 0.15}
            min={0.15}
            max={0.85}
            step={0.02}
            editable={true}
            onChange={(val) => applySkyboxPatch({ contrastMidpoint: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />
        </div>

        <div className="pt-1 border-t border-neutral-700/40 flex flex-col gap-2">
          <span className="font-bold text-[11px]">Horizon Seam &amp; Transition Band</span>

          <SliderControl
            label="Horizon Elevation Offset (Default 0.0)"
            description="Shifts the horizon line up or down relative to eye level"
            value={skyboxConfig.horizonOffset ?? 0.0}
            min={-0.25}
            max={0.25}
            step={0.01}
            editable={true}
            allowOutOfBoundsInput={true}
            onChange={(val) => applySkyboxPatch({ horizonOffset: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />

          <SliderControl
            label="Horizon Smooth Blend Width"
            description="Softens the seam between the upper sky texture and lower ground hemisphere"
            value={skyboxConfig.horizonBlendWidth ?? 0.03}
            min={0.005}
            max={0.35}
            step={0.005}
            editable={true}
            allowOutOfBoundsInput={true}
            onChange={(val) => applySkyboxPatch({ horizonBlendWidth: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />

          <TunerColorRow
            label="Horizon Haze Color (RGB)"
            value={skyboxConfig.horizonColor || '#1a202c'}
            onChange={(hex) => applySkyboxPatch({ horizonColor: hex })}
            isLight={isLight}
          />

          <SliderControl
            label="Horizon Haze Glow Strength"
            value={skyboxConfig.horizonHazeStrength ?? 0.0}
            min={0}
            max={1}
            step={0.05}
            editable={true}
            onChange={(val) => applySkyboxPatch({ horizonHazeStrength: val })}
            disabled={skyboxConfig.enabled === false}
            isLight={isLight}
          />
        </div>

        {/* Lower Hemisphere Section: Branches based on Hemisphere vs Full-Sphere */}
        <SkyboxLowerHemisphereSection
          activeCategory={activeCategory}
          skyboxConfig={skyboxConfig}
          applySkyboxPatch={applySkyboxPatch}
          isLight={isLight}
          mutedText={mutedText}
        />
      </div>

      {/* Card 2: Auxiliary Skybox FX Textures (Corona Starburst, Sun Glow, Cloud Overlay, OOB Normal) */}
      <SkyboxAuxLayersCard
        skyboxConfig={skyboxConfig}
        applySkyboxPatch={applySkyboxPatch}
        isLight={isLight}
        cardBg={cardBg}
        mutedText={mutedText}
      />
    </div>
  );
};
