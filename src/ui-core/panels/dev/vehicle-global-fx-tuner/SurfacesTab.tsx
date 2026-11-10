import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import type {
  AnodizedPaintTuning,
  VehicleDescriptor,
  VehicleSurfaceMaterialSlot,
} from '../../../config/vehicleTunerConfig';

export interface SurfacesTabProps {
  descriptor: Pick<VehicleDescriptor, 'surfaceMaterials'>;
  colorOverride: boolean;
  handleSetAllSurfacesMode: (mode: 'standard' | 'toon' | 'pbr') => void;
  handleSurfaceSlotChange: (slotKey: string, patch: Partial<VehicleSurfaceMaterialSlot>) => void;
  carPaintMode: 'cartoon' | 'anodized';
  onCarPaintModeChange: (mode: 'cartoon' | 'anodized') => void;
  paintConfig: AnodizedPaintTuning;
  applyPaintPatch: (patch: Partial<AnodizedPaintTuning>) => void;
  isLight: boolean;
  cardClass: string;
}

export const SurfacesTab: React.FC<SurfacesTabProps> = ({
  descriptor,
  colorOverride,
  handleSetAllSurfacesMode,
  handleSurfaceSlotChange,
  carPaintMode,
  onCarPaintModeChange,
  paintConfig,
  applyPaintPatch,
  isLight,
  cardClass,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Batch Shader Switcher */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px]">Batch Switch All Surfaces Shader</span>
          <span className="text-[10px] font-mono text-amber-500">
            Override: {colorOverride ? 'ACTIVE' : 'OFF'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => handleSetAllSurfacesMode('standard')}
            className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${
              isLight
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
            }`}
          >
            All Standard (1-Layer)
          </button>
          <button
            type="button"
            onClick={() => handleSetAllSurfacesMode('toon')}
            className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
            }`}
          >
            All Toon (Cel-Ramp)
          </button>
          <button
            type="button"
            onClick={() => handleSetAllSurfacesMode('pbr')}
            className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${
              isLight
                ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-900'
                : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 text-sky-300'
            }`}
          >
            All PBR (Multi-Layer)
          </button>
        </div>
      </div>

      {/* Per-Surface Bound Material Slots */}
      {Object.entries(descriptor.surfaceMaterials || {}).map(([slotKey, slotCfg]) => {
        const activeMode =
          slotCfg.mode === 'toon' || slotCfg.mode === 'pbr' ? slotCfg.mode : 'standard';
        return (
          <div key={slotKey} className={cardClass}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] text-amber-500">{slotCfg.label}</span>
              <button
                type="button"
                onClick={() =>
                  handleSurfaceSlotChange(slotKey, {
                    mode: 'standard',
                    metalness: slotCfg.glbDefaultMetalness ?? 0.0,
                    roughness: slotCfg.glbDefaultRoughness ?? 0.5,
                  })
                }
                className={`px-2 py-0.5 rounded border text-[10px] font-mono cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
                title="Reset to single-layer Standard shader with GLB native metallic (0.0) & roughness (0.5)"
              >
                GLB Native (1-Layer M:0 R:0.5)
              </button>
            </div>

            <SegmentedSwitch
              value={activeMode}
              onValueChange={(mode) => handleSurfaceSlotChange(slotKey, { mode })}
              options={[
                { value: 'standard', label: 'Standard (1-Layer)' },
                { value: 'toon', label: 'Toon (Cel-Ramp)' },
                { value: 'pbr', label: 'PBR (Multi-Layer)' },
              ]}
              size="sm"
              fullWidth
              isLight={isLight}
            />

            <TunerColorRow
              label="Surface Color (Direct Override)"
              value={slotCfg.color || '#42a5f5'}
              onChange={(color) => handleSurfaceSlotChange(slotKey, { color })}
              isLight={isLight}
            />

            {activeMode === 'standard' && (
              <>
                <SliderControl
                  label="Metallic (metalness)"
                  value={slotCfg.metalness ?? 0.0}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { metalness: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Roughness (roughness)"
                  value={slotCfg.roughness ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { roughness: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="EnvMap Intensity"
                  value={slotCfg.envMapIntensity ?? 1.0}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { envMapIntensity: v })}
                  isLight={isLight}
                />
              </>
            )}

            {activeMode === 'toon' && (
              <>
                <SliderControl
                  label="Cel Ramp Bands (toonSteps)"
                  value={slotCfg.toonSteps ?? 4}
                  min={2}
                  max={8}
                  step={1}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { toonSteps: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Darkest Shadow Floor"
                  value={slotCfg.toonShadowMin ?? 0.11}
                  min={0}
                  max={0.85}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { toonShadowMin: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Brightest Highlight Max"
                  value={slotCfg.toonHighlightMax ?? 1.0}
                  min={0.4}
                  max={1.3}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { toonHighlightMax: v })}
                  isLight={isLight}
                />
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px]">Smooth Ramp (Linear vs Nearest Crisp)</span>
                  <ToggleSwitch
                    checked={Boolean(slotCfg.toonSmooth)}
                    onChange={(toonSmooth) => handleSurfaceSlotChange(slotKey, { toonSmooth })}
                    isLight={isLight}
                  />
                </div>
              </>
            )}

            {activeMode === 'pbr' && (
              <>
                <TunerColorRow
                  label="Fresnel Pearl Shift Color"
                  value={slotCfg.pearlColor || slotCfg.color || '#ffffff'}
                  onChange={(pearlColor) => handleSurfaceSlotChange(slotKey, { pearlColor })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Metallic (metalness)"
                  value={slotCfg.metalness ?? 0.76}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { metalness: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Roughness (roughness)"
                  value={slotCfg.roughness ?? 0.17}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { roughness: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Clearcoat Layer"
                  value={slotCfg.clearcoat ?? 1.0}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { clearcoat: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Clearcoat Roughness"
                  value={slotCfg.clearcoatRoughness ?? 0.11}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { clearcoatRoughness: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="Sheen Layer"
                  value={slotCfg.sheen ?? 0.7}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { sheen: v })}
                  isLight={isLight}
                />
                <SliderControl
                  label="EnvMap Intensity"
                  value={slotCfg.envMapIntensity ?? 1.4}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(v) => handleSurfaceSlotChange(slotKey, { envMapIntensity: v })}
                  isLight={isLight}
                />
              </>
            )}
          </div>
        );
      })}

      {/* Global Car Paint Mode & Anodized Shader Tuner (Merged from Experimental Lab) */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-bold text-xs text-sky-400">
              Global Car Paint Mode & Anodized Shader
            </span>
            <span className="text-[10px] opacity-70">
              Macro paint preset for procedural / fallback surfaces & bots
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              applyPaintPatch({
                roughness: 0.04,
                metalness: 0.76,
                clearcoat: 1,
                clearcoatRoughness: 0.11,
                sheen: 0.7,
                sheenRoughness: 0.24,
                envMapIntensity: 1.4,
                pearlFresnelPower: 1.35,
                pearlBlendStrength: 0.82,
              })
            }
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset</span>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[11px]">Active Car Paint Mode (Default: Cartoon)</span>
          <SegmentedSwitch
            value={carPaintMode}
            onChange={(val) => onCarPaintModeChange(val as 'cartoon' | 'anodized')}
            options={[
              { value: 'cartoon', label: 'Cartoon (Default)' },
              { value: 'anodized', label: 'Anodized' },
            ]}
            size="sm"
            fullWidth
            isLight={isLight}
          />
        </div>

        <SliderControl
          label="Base Roughness"
          value={paintConfig.roughness}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyPaintPatch({ roughness: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Base Metalness"
          value={paintConfig.metalness}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyPaintPatch({ metalness: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Clearcoat Layer"
          value={paintConfig.clearcoat}
          min={0}
          max={1}
          step={0.05}
          editable={true}
          onChange={(val) => applyPaintPatch({ clearcoat: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Clearcoat Roughness"
          value={paintConfig.clearcoatRoughness}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyPaintPatch({ clearcoatRoughness: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Microfiber Sheen"
          value={paintConfig.sheen}
          min={0}
          max={1}
          step={0.05}
          editable={true}
          onChange={(val) => applyPaintPatch({ sheen: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Environment Reflection Intensity"
          value={paintConfig.envMapIntensity}
          min={0}
          max={3}
          step={0.05}
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyPaintPatch({ envMapIntensity: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Pearl Fresnel Rim Power"
          value={paintConfig.pearlFresnelPower}
          min={0.5}
          max={6}
          step={0.05}
          editable={true}
          allowOutOfBoundsInput={true}
          onChange={(val) => applyPaintPatch({ pearlFresnelPower: val })}
          isLight={isLight}
        />

        <SliderControl
          label="Pearl Color Shift Strength"
          value={paintConfig.pearlBlendStrength}
          min={0}
          max={1}
          step={0.02}
          editable={true}
          onChange={(val) => applyPaintPatch({ pearlBlendStrength: val })}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
