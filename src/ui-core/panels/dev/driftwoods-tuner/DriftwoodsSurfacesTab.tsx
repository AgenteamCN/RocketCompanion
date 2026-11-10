import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DriftwoodsLayerConfig, DriftwoodsTunerConfig } from '../../../config/driftwoodsConfig';
import {
  TunerRow,
  TunerColorRow,
  TunerToggleRow
} from '../../../compounds/TunerControls';
import {
  CubicBezierCurveEditor,
  type CubicBezierPreset
} from '../../../charts/CubicBezierCurveEditor';

const GOAL_MASK_BEZIER_PRESETS: CubicBezierPreset[] = [
  { name: 'Default', value: { p1x: 0.27, p1y: 0.06, p2x: 0.26, p2y: 0.73 } },
  { name: 'Ease-Out', value: { p1x: 0.25, p1y: 0.1, p2x: 0.25, p2y: 1.0 } },
  { name: 'Smooth S', value: { p1x: 0.42, p1y: 0.0, p2x: 0.58, p2y: 1.0 } },
  { name: 'Steep Front', value: { p1x: 0.12, p1y: 0.82, p2x: 0.28, p2y: 1.0 } },
  { name: 'Linear', value: { p1x: 0.33, p1y: 0.33, p2x: 0.67, p2y: 0.67 } }
];

export interface DriftwoodsSurfacesTabProps {
  config: DriftwoodsTunerConfig;
  onChange: (patch: Partial<DriftwoodsTunerConfig>) => void;
  isLight?: boolean;
}

interface PartCardProps {
  id: string;
  name: string;
  description: string;
  layer: DriftwoodsLayerConfig;
  onLayerChange: (patch: Partial<DriftwoodsLayerConfig>) => void;
  showTeamColorToggle?: boolean;
  teamColorDescription?: string;
  showOneWayToggle?: boolean;
  showEmissiveControls?: boolean;
  isLight?: boolean;
  defaultOpen?: boolean;
}

const PartCard: React.FC<PartCardProps> = ({
  name,
  description,
  layer,
  onLayerChange,
  showTeamColorToggle = false,
  teamColorDescription = 'Automatically tints Blue side (z < 0) and Orange side (z >= 0) using unified OKLCH palette',
  showOneWayToggle = false,
  showEmissiveControls = false,
  isLight = false,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-xl border transition-colors overflow-hidden ${
        isLight ? 'bg-neutral-50/60 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
      }`}
    >
      <div
        className="flex items-center justify-between p-2.5 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3.5 h-3.5 rounded-full border border-neutral-600 shrink-0 shadow-xs"
            style={{ backgroundColor: layer.color }}
          />
          <div className="flex flex-col min-w-0">
            <span className={`text-xs font-semibold truncate ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}>
              {name}
            </span>
            <span className={`text-[10px] truncate ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {description}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              layer.visible
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
            }`}
          >
            {layer.visible ? 'Visible' : 'Hidden'}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          )}
        </div>
      </div>

      {open && (
        <div className="p-2.5 pt-0 flex flex-col gap-1.5 border-t border-neutral-700/20">
          {showTeamColorToggle && (
            <TunerToggleRow
              label="Use Half-Field Team Color (Blue / Orange)"
              description={teamColorDescription}
              checked={layer.useTeamColor !== false}
              onChange={(checked) => onLayerChange({ useTeamColor: checked })}
              isLight={isLight}
            />
          )}

          {showOneWayToggle && (
            <TunerToggleRow
              label="One-Way See-Through (Solid Inside -> Transparent Outside)"
              description="Uses front-face culling (FrontSide) so camera outside the arena looking inward sees through walls, while interior views remain solid."
              checked={layer.oneWaySeeThrough !== false}
              onChange={(checked) => onLayerChange({ oneWaySeeThrough: checked })}
              isLight={isLight}
            />
          )}

          <TunerColorRow
            label={showTeamColorToggle && layer.useTeamColor !== false ? 'Fallback Base Color' : 'Base Color'}
            value={layer.color}
            onChange={(hex) => onLayerChange({ color: hex })}
            isLight={isLight}
          />

          {showEmissiveControls && (
            <div className="grid grid-cols-2 gap-1.5">
              <TunerColorRow
                label="Glow Emissive Tint"
                value={layer.emissive || layer.color}
                onChange={(hex) => onLayerChange({ emissive: hex })}
                isLight={isLight}
              />

              <TunerRow
                label="Glow Intensity"
                value={layer.emissiveIntensity ?? 0.35}
                sliderMin={0.0}
                sliderMax={3.0}
                sliderStep={0.05}
                onChange={(val) => onLayerChange({ emissiveIntensity: val })}
                isLight={isLight}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <TunerRow
              label="Roughness"
              value={layer.roughness}
              sliderMin={0.0}
              sliderMax={1.0}
              sliderStep={0.01}
              onChange={(val) => onLayerChange({ roughness: val })}
              isLight={isLight}
            />

            <TunerRow
              label="Metalness"
              value={layer.metalness}
              sliderMin={0.0}
              sliderMax={1.0}
              sliderStep={0.01}
              onChange={(val) => onLayerChange({ metalness: val })}
              isLight={isLight}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <TunerToggleRow
              label="Visible"
              checked={layer.visible}
              onChange={(checked) => onLayerChange({ visible: checked })}
              isLight={isLight}
            />

            <TunerToggleRow
              label="Wireframe"
              checked={layer.wireframe}
              onChange={(checked) => onLayerChange({ wireframe: checked })}
              isLight={isLight}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const DriftwoodsSurfacesTab: React.FC<DriftwoodsSurfacesTabProps> = ({
  config,
  onChange,
  isLight = false,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {/* Geometric Specular AA (Kaplanyan 2016 Normal Variance Roughness Filtering) */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
          isLight ? 'bg-neutral-50/60 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 px-0.5">
          Geometric Specular Anti-Aliasing (PBR Normal Filtering)
        </span>

        <TunerToggleRow
          label="Kaplanyan Geometric Specular AA"
          description="Filters microfacet roughness using screen-space normal variance (dFdx/dFdy of vNormal) to eliminate specular highlight fireflies on curved metallic posts & bevels."
          checked={config.specularAA !== false}
          onChange={(checked) => onChange({ specularAA: checked })}
          isLight={isLight}
        />

        {config.specularAA !== false && (
          <TunerRow
            label="Specular AA Kernel Strength"
            description="Normal variance to roughness expansion multiplier (1.0 = standard)"
            value={config.specularAAStrength ?? 1.0}
            sliderMin={0.1}
            sliderMax={2.0}
            sliderStep={0.05}
            onChange={(val) => onChange({ specularAAStrength: val })}
            isLight={isLight}
          />
        )}
      </div>

      {/* Dynamic Camera & Goal Volumetric Depth Mask */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
          isLight ? 'bg-neutral-50/60 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 px-0.5">
          Dynamic Camera &amp; Goal Volumetric Depth Mask
        </span>

        <TunerRow
          label="Unified Occlusion Opacity"
          description="Target semi-transparent alpha for occluded Ramps Trim, Wall Posts, and Camera-Depth Goal Mask (0.40 default)"
          value={config.occlusionOpacity ?? 0.4}
          sliderMin={0.05}
          sliderMax={1.0}
          sliderStep={0.01}
          onChange={(val) => onChange({ occlusionOpacity: val })}
          isLight={isLight}
        />

        <TunerToggleRow
          label="Exterior Camera Wall Occlusion (Ramps Trim & Wall Posts)"
          description="Fades Ramps Trim and Wall Posts & Columns on the camera's near wall when viewing inward from outside the arena, keeping opposite walls solid."
          checked={config.wallExteriorOcclusion !== false}
          onChange={(checked) => onChange({ wallExteriorOcclusion: checked })}
          isLight={isLight}
        />

        <TunerToggleRow
          label="Camera-Depth Volumetric Goal Mask (Pure Camera Position)"
          description="Dynamically masks Goal Posts, Glow, Goal Frame, Goal Net, and Goal Trim based strictly on the active rendering camera's longitudinal depth (works in Player Cam, Ball Cam, Free Cam, and Spectate POV)."
          checked={config.goalDepthMaskEnabled !== false}
          onChange={(checked) => onChange({ goalDepthMaskEnabled: checked })}
          isLight={isLight}
        />

        {config.goalDepthMaskEnabled !== false && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Longitudinal Offset (UU)"
                description="Shifts the depth reach front (cameraZ + offset) along the goal depth axis"
                value={config.goalMaskOffsetUu ?? 250}
                sliderMin={-1500}
                sliderMax={2000}
                sliderStep={10}
                unit="uu"
                onChange={(val) => onChange({ goalMaskOffsetUu: val })}
                isLight={isLight}
              />

              <TunerRow
                label="Gradient Distance (UU)"
                description="Longitudinal transition band width from unmasked to full occlusion opacity"
                value={config.goalMaskGradientDistanceUu ?? 500}
                sliderMin={10}
                sliderMax={2500}
                sliderStep={10}
                unit="uu"
                onChange={(val) => onChange({ goalMaskGradientDistanceUu: val })}
                isLight={isLight}
              />
            </div>

            <CubicBezierCurveEditor
              title="Goal Depth Mask Non-Linear Gradient Curve"
              p1x={config.goalMaskBezierP1X ?? 0.27}
              p1y={config.goalMaskBezierP1Y ?? 0.06}
              p2x={config.goalMaskBezierP2X ?? 0.26}
              p2y={config.goalMaskBezierP2Y ?? 0.73}
              presets={GOAL_MASK_BEZIER_PRESETS}
              onChange={(next) =>
                onChange({
                  goalMaskBezierP1X: next.p1x,
                  goalMaskBezierP1Y: next.p1y,
                  goalMaskBezierP2X: next.p2x,
                  goalMaskBezierP2Y: next.p2y
                })
              }
              isLight={isLight}
            />
          </>
        )}
      </div>

      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 px-1">
        Solid Stadium Meshes & PBR Materials
      </span>

      <PartCard
        id="ramps"
        name="Woods Field Ramps (Lower Base)"
        description="Perimeter lower slopes & curved banking ramps (2,048 tris)"
        layer={config.ramps}
        onLayerChange={(patch) => onChange({ ramps: { ...config.ramps, ...patch } })}
        isLight={isLight}
        defaultOpen={true}
      />

      <PartCard
        id="rampsUpperOuter"
        name="Ramps Upper & Goal Net Outer (Shared Material)"
        description="Unified one-way see-through team-colored upper ramp wall & goal net outer trim (684 tris)"
        layer={config.rampsUpperOuter}
        onLayerChange={(patch) =>
          onChange({ rampsUpperOuter: { ...config.rampsUpperOuter, ...patch } })
        }
        showTeamColorToggle={true}
        teamColorDescription="Tints Ramps Upper & Goal Net Outer using OKLCH Upper & Outer Lightness (L) and shared/custom C & H"
        showOneWayToggle={true}
        isLight={isLight}
        defaultOpen={true}
      />

      <PartCard
        id="rampsTrim"
        name="Ramps Golden Trim"
        description="Beveled transition edges and metallic accent trim (16,940 tris)"
        layer={config.rampsTrim}
        onLayerChange={(patch) => onChange({ rampsTrim: { ...config.rampsTrim, ...patch } })}
        isLight={isLight}
      />

      <PartCard
        id="wallPosts"
        name="Wall Posts & Columns"
        description="Structural steel pylons around boundary perimeter (11,936 tris)"
        layer={config.wallPosts}
        onLayerChange={(patch) => onChange({ wallPosts: { ...config.wallPosts, ...patch } })}
        isLight={isLight}
      />

      <PartCard
        id="goalFrame"
        name="Goal Mouth Frame"
        description="Outer rectangular goal frame & back casing (2,664 tris)"
        layer={config.goalFrame}
        onLayerChange={(patch) => onChange({ goalFrame: { ...config.goalFrame, ...patch } })}
        showTeamColorToggle={true}
        teamColorDescription="Automatically tints Blue Goal (z < 0) and Orange Goal (z >= 0) using OKLCH Goal Lightness"
        isLight={isLight}
      />

      <PartCard
        id="goalPosts"
        name="Goal Posts & Crossbar (Main)"
        description="High-visibility goal posts & crossbars (4,104 tris)"
        layer={config.goalPosts}
        onLayerChange={(patch) => onChange({ goalPosts: { ...config.goalPosts, ...patch } })}
        showTeamColorToggle={true}
        teamColorDescription="Automatically tints Blue Goal (z < 0) and Orange Goal (z >= 0) using OKLCH Goal Lightness"
        isLight={isLight}
      />

      <PartCard
        id="goalPostsGlow"
        name="Goal Posts Glow (Team Inner Strip)"
        description="Dedicated team-colored inner glow strip along goal posts (320 tris)"
        layer={config.goalPostsGlow}
        onLayerChange={(patch) =>
          onChange({ goalPostsGlow: { ...config.goalPostsGlow, ...patch } })
        }
        showTeamColorToggle={true}
        teamColorDescription="Tints Goal Posts Glow strip with its own OKLCH Goal Glow Lightness (L) and shared/custom C & H"
        showEmissiveControls={true}
        isLight={isLight}
        defaultOpen={true}
      />
    </div>
  );
};
