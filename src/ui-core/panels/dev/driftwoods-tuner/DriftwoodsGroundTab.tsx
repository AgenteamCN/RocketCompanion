import React from 'react';
import { Link2, Unlink2, RotateCcw } from 'lucide-react';
import { DEFAULT_Q1_LAYER_COLORS, DEFAULT_Q1_LAYER_OPACITIES, GROUND_Q1_MANIFEST, mixDecalOverBaseOklab, oklchToHex, setHexOklchLightness, type DriftwoodsGroundConfig, type DriftwoodsGroundTextureMode, type DriftwoodsQ1LayerColors, type DriftwoodsQ1LayerId, type DriftwoodsQ1LayerOpacities } from '../../../config/driftwoodsConfig';
import { hexToOklch } from '../../../config/driftwoodsColorMath';
import {
  TunerRow,
  TunerColorRow,
  TunerToggleRow,
  TunerSegmentedControl,
} from '../../../compounds/TunerControls';
import { DriftwoodsOklchSyncSection } from './DriftwoodsOklchSyncSection';
import { DriftwoodsGroundSurfaceSection } from './DriftwoodsGroundSurfaceSection';
import { DriftwoodsLegacyGroundSection } from './DriftwoodsLegacyGroundSection';

export interface DriftwoodsGroundTabProps {
  ground: DriftwoodsGroundConfig;
  onChange: (patch: Partial<DriftwoodsGroundConfig>) => void;
  isLight?: boolean;
}

export const DriftwoodsGroundTab: React.FC<DriftwoodsGroundTabProps> = ({
  ground,
  onChange,
  isLight = false,
}) => {
  const activeMode: DriftwoodsGroundTextureMode = ground.textureMode ?? 'q1-7gray';
  const q1Colors: DriftwoodsQ1LayerColors = {
    ...DEFAULT_Q1_LAYER_COLORS,
    ...(ground.q1Colors || {}),
  };
  const q1Opacities: DriftwoodsQ1LayerOpacities = {
    ...DEFAULT_Q1_LAYER_OPACITIES,
    ...(ground.q1Opacities || {}),
  };

  const oklchSyncEnabled = ground.oklchSyncEnabled !== false;
  const markingsL = ground.oklchMarkingsLightness ?? 0.96;
  const teamL = ground.oklchTeamLightness ?? 0.7;
  const teamC = ground.oklchTeamChroma ?? 0.19;
  const blueH = ground.oklchBlueHue ?? 250;
  const orangeH = ground.oklchOrangeHue ?? 45;

  const groundIndCH = Boolean(ground.oklchGroundIndependentCH);
  const groundC = groundIndCH ? (ground.oklchGroundChroma ?? teamC) : teamC;
  const groundBlueH = groundIndCH ? (ground.oklchGroundBlueHue ?? blueH) : blueH;
  const groundOrangeH = groundIndCH ? (ground.oklchGroundOrangeHue ?? orangeH) : orangeH;

  const computedBlueHex = oklchToHex(teamL, groundC, groundBlueH);
  const computedOrangeHex = oklchToHex(teamL, groundC, groundOrangeH);

  const handleLayerColorChange = (layerId: DriftwoodsQ1LayerId, hex: string) => {
    onChange({
      q1Colors: {
        ...q1Colors,
        [layerId]: hex,
      },
    });
  };

  const handleLayerOpacityChange = (layerId: DriftwoodsQ1LayerId, opacity: number) => {
    onChange({
      q1Opacities: {
        ...q1Opacities,
        [layerId]: Math.max(0, Math.min(1, opacity)),
      },
    });
  };

  const resetQ1Palette = () => {
    onChange({
      q1Colors: { ...DEFAULT_Q1_LAYER_COLORS },
      q1Opacities: { ...DEFAULT_Q1_LAYER_OPACITIES },
      l4UseTeamColor: true,
      l5UseTeamColor: true,
      l6UseTeamColor: true,
      oklchSyncEnabled: true,
      oklchMarkingsLightness: 0.96,
      oklchTeamLightness: 0.7,
      oklchGoalLightness: 0.582,
      oklchGoalPostsGlowLightness: 0.65,
      oklchRampsUpperOuterLightness: 0.5,
      oklchHexLightness: 0.65,
      oklchTeamChroma: 0.19,
      oklchBlueHue: 250,
      oklchOrangeHue: 45,
      oklchGroundIndependentCH: false,
      oklchGroundChroma: 0.19,
      oklchGroundBlueHue: 250,
      oklchGroundOrangeHue: 45,
      oklchGoalIndependentCH: false,
      oklchGoalChroma: 0.19,
      oklchGoalBlueHue: 250,
      oklchGoalOrangeHue: 45,
      oklchGoalPostsGlowIndependentCH: false,
      oklchGoalPostsGlowChroma: 0.19,
      oklchGoalPostsGlowBlueHue: 250,
      oklchGoalPostsGlowOrangeHue: 45,
      oklchRampsUpperOuterIndependentCH: true,
      oklchRampsUpperOuterChroma: 0.1,
      oklchRampsUpperOuterBlueHue: 250,
      oklchRampsUpperOuterOrangeHue: 45,
      oklchHexIndependentCH: true,
      oklchHexChroma: 0.32,
      oklchHexBlueHue: 250,
      oklchHexOrangeHue: 45,
      blueTeamLineColor: '#3fa3ff',
      orangeTeamLineColor: '#fa6e1d',
      lineThreshold: 0.35,
      lineSmoothness: 0.15,
      anisotropy: 4,
    });
  };

  const resetQ1UVTransform = () => {
    onChange({
      q1ScaleX: 1.0,
      q1ScaleY: 1.0,
      q1OffsetX: 0.0,
      q1OffsetY: 0.0,
    });
  };

  const handleScaleXChange = (val: number) => {
    if (ground.linkScale) {
      onChange({ scaleX: val, scaleY: val });
    } else {
      onChange({ scaleX: val });
    }
  };

  const handleScaleYChange = (val: number) => {
    if (ground.linkScale) {
      onChange({ scaleX: val, scaleY: val });
    } else {
      onChange({ scaleY: val });
    }
  };

  const resetUVTransform = () => {
    onChange({
      scaleX: 1.015,
      scaleY: 1.037,
      offsetX: -0.0075,
      offsetY: -0.0176,
      originalLineThreshold: 0.0921,
      originalLineSmoothness: 0.0364,
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 0. Ground Texture Source Switch */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 px-1">
          Ground Texture Mode
        </span>

        <TunerSegmentedControl<DriftwoodsGroundTextureMode>
          label="Active Ground Texture"
          description="Switch between Q1 7-Layer RGBA Decal Mask (2048x3000 Mipmap + 16x AF) and Legacy Original Texture"
          value={activeMode}
          options={[
            { value: 'q1-7gray', label: 'Q1 7-Layer Mask (L0-L6)' },
            { value: 'original', label: 'Original Texture (2-Color)' },
          ]}
          onChange={(mode) => onChange({ textureMode: mode })}
          isLight={isLight}
        />
      </div>

      {/* 0B. OKLCH Perceptual Luminance & Symmetric Team Palette */}
      <DriftwoodsOklchSyncSection
        ground={ground}
        onChange={onChange}
        isLight={isLight}
      />

      {activeMode === 'q1-7gray' ? (
        <>
          {/* 1A. Q1 7-Layer Semantic Grayscale Palette + Decal Opacity */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                Q1 7-Layer Decal Palette &amp; Opacity (L0 Turf Base + L1-L6 Overlays)
              </span>
              <button
                type="button"
                onClick={resetQ1Palette}
                title="Reset L0-L6 layer colors, opacities, and OKLCH settings to default palette"
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-neutral-200 hover:bg-neutral-300 text-neutral-700 border border-neutral-300'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700'
                }`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset L0-L6</span>
              </button>
            </div>

            {GROUND_Q1_MANIFEST.layers.map((layer) => {
              const isBaseLayer = layer.id === 'L0';
              const isTeamToggleLayer =
                layer.id === 'L4' || layer.id === 'L5' || layer.id === 'L6';
              const isTeamColorActive =
                layer.id === 'L4'
                  ? Boolean(ground.l4UseTeamColor ?? true)
                  : layer.id === 'L5'
                    ? Boolean(ground.l5UseTeamColor ?? true)
                    : layer.id === 'L6'
                      ? Boolean(ground.l6UseTeamColor ?? true)
                      : false;

              const rawHex = q1Colors[layer.id];
              const layerOp = q1Opacities[layer.id] ?? layer.defaultOpacity ?? 0.85;
              const effectiveHex =
                !isBaseLayer &&
                oklchSyncEnabled &&
                (layer.id === 'L1' ||
                  layer.id === 'L2' ||
                  layer.id === 'L3' ||
                  layer.id === 'L5')
                  ? setHexOklchLightness(rawHex, markingsL)
                  : rawHex;
              const oklchInfo = hexToOklch(effectiveHex);
              const blendedPreview = isBaseLayer
                ? effectiveHex
                : mixDecalOverBaseOklab(q1Colors.L0, effectiveHex, layerOp).hex;

              return (
                <div
                  key={layer.id}
                  className={`p-1.5 rounded-xl border flex flex-col gap-1.5 ${
                    isLight
                      ? 'bg-neutral-100/50 border-neutral-200/80'
                      : 'bg-neutral-900/40 border-neutral-800/80'
                  }`}
                >
                  <TunerColorRow
                    label={`${layer.id} - ${layer.name}`}
                    description={
                      isBaseLayer
                        ? `Global Turf Base | OKLCH(${oklchInfo.l.toFixed(2)}, ${oklchInfo.c.toFixed(2)}, ${oklchInfo.h.toFixed(0)} deg)`
                        : isTeamToggleLayer && isTeamColorActive
                          ? `Half-Field Team Decal (Blue: ${computedBlueHex} | Orange: ${computedOrangeHex}) @ ${(layerOp * 100).toFixed(0)}% Opacity`
                          : `Gray ${layer.centerGray} (${layer.normalizedValue.toFixed(3)}) | Blended on Turf: ${blendedPreview}`
                    }
                    value={rawHex}
                    onChange={(hex) => handleLayerColorChange(layer.id, hex)}
                    isLight={isLight}
                  />

                  {!isBaseLayer && (
                    <div className="grid grid-cols-1 gap-1">
                      <TunerRow
                        label={`${layer.id} Decal Opacity`}
                        description="Oklab decal blend over L0 turf base (lower lets green turf show through)"
                        value={layerOp}
                        sliderMin={0.0}
                        sliderMax={1.0}
                        sliderStep={0.01}
                        onChange={(val) => handleLayerOpacityChange(layer.id, val)}
                        isLight={isLight}
                      />

                      {isTeamToggleLayer && (
                        <TunerToggleRow
                          label={`${layer.id} Use Half-Field Team Color (Blue / Orange)`}
                          checked={isTeamColorActive}
                          onChange={(checked) => {
                            if (layer.id === 'L4') onChange({ l4UseTeamColor: checked });
                            else if (layer.id === 'L5') onChange({ l5UseTeamColor: checked });
                            else if (layer.id === 'L6') onChange({ l6UseTeamColor: checked });
                          }}
                          isLight={isLight}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <TunerRow
                label="Line Smoothness (Edge)"
                description="Close-up anti-aliased transition width; grazing angles automatically use 16x AF integral"
                value={ground.lineSmoothness ?? 0.15}
                sliderMin={0.001}
                sliderMax={0.35}
                sliderStep={0.001}
                onChange={(val) => onChange({ lineSmoothness: val })}
                isLight={isLight}
              />

              <TunerRow
                label="Line Cutoff Threshold"
                description="Normalized coverage cutoff & sub-pixel energy weight (lower expands lines)"
                value={ground.lineThreshold ?? 0.35}
                sliderMin={0.02}
                sliderMax={0.9}
                sliderStep={0.001}
                onChange={(val) => onChange({ lineThreshold: val })}
                isLight={isLight}
              />
            </div>
          </div>

          {/* 2A. Q1 Physical Space & 4-Quadrant Mirrored UV Mapping */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                Q1 Physical Space &amp; Mirrored UV Mapping
              </span>
              <button
                type="button"
                onClick={resetQ1UVTransform}
                title="Reset Q1 UV scale (1.0, 1.0) and offset (0.0, 0.0)"
                className={`p-1 rounded cursor-pointer transition-colors ${
                  isLight
                    ? 'hover:bg-neutral-200 text-neutral-600'
                    : 'hover:bg-neutral-800 text-neutral-400'
                }`}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>

            <div
              className={`p-2 rounded-xl border text-[10px] font-mono leading-relaxed flex flex-col gap-0.5 ${
                isLight
                  ? 'bg-neutral-100/80 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900/60 border-neutral-800 text-neutral-300'
              }`}
            >
              <div>Top-Left (u=0, v=0) -&gt; Center Origin (X=0, Y=0)</div>
              <div>
                Bottom-Right (u=1, v=1) -&gt; (X=4096 UU, Y=6000 UU) [Includes Goal Depth
                5120~6000]
              </div>
              <div>
                Formula: u = worldX / 4096.0, v = worldY / 6000.0 (Hardware MirroredRepeat +
                16x AF)
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Q1 Scale U"
                description="Horizontal Q1 UV multiplier"
                value={ground.q1ScaleX ?? 1.0}
                sliderMin={0.5}
                sliderMax={2.0}
                sliderStep={0.0001}
                onChange={(val) => onChange({ q1ScaleX: val })}
                isLight={isLight}
              />

              <TunerRow
                label="Q1 Scale V"
                description="Vertical Q1 UV multiplier"
                value={ground.q1ScaleY ?? 1.0}
                sliderMin={0.5}
                sliderMax={2.0}
                sliderStep={0.0001}
                onChange={(val) => onChange({ q1ScaleY: val })}
                isLight={isLight}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Q1 Offset U"
                description="Horizontal Q1 UV offset"
                value={ground.q1OffsetX ?? 0.0}
                sliderMin={-1.0}
                sliderMax={1.0}
                sliderStep={0.0001}
                onChange={(val) => onChange({ q1OffsetX: val })}
                isLight={isLight}
              />

              <TunerRow
                label="Q1 Offset V"
                description="Vertical Q1 UV offset"
                value={ground.q1OffsetY ?? 0.0}
                sliderMin={-1.0}
                sliderMax={1.0}
                sliderStep={0.0001}
                onChange={(val) => onChange({ q1OffsetY: val })}
                isLight={isLight}
              />
            </div>
          </div>
        </>
      ) : (
        <DriftwoodsLegacyGroundSection
          ground={ground}
          onChange={onChange}
          resetUVTransform={resetUVTransform}
          handleScaleXChange={handleScaleXChange}
          handleScaleYChange={handleScaleYChange}
          isLight={isLight}
        />
      )}

      <DriftwoodsGroundSurfaceSection
        ground={ground}
        onChange={onChange}
        isLight={isLight}
      />
    </div>
  );
};
