import React from 'react';
import { Zap, Cpu, CheckCircle2, Trash2 } from 'lucide-react';
import type { DriftwoodsTunerConfig } from '../../../config/driftwoodsConfig';
import { TunerToggleRow } from '../../../compounds/TunerControls';

export interface DriftwoodsPerformanceTabProps {
  config: DriftwoodsTunerConfig;
  onChange: (patch: Partial<DriftwoodsTunerConfig>) => void;
  isLight?: boolean;
}

export const DriftwoodsPerformanceTab: React.FC<DriftwoodsPerformanceTabProps> = ({
  config,
  onChange,
  isLight = false,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 1. Fast Diffuse Lambert Toggle */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 px-1 font-bold text-[10px] text-amber-500 uppercase tracking-wider">
          <Zap className="h-3.5 w-3.5" />
          <span>Lite / Low-End Hardware Mode</span>
        </div>

        <TunerToggleRow
          label="Fast Diffuse Mode (MeshLambertMaterial)"
          description="Bypasses Cook-Torrance PBR formulas, microfacet specular, and environment IBL convolutions. Reduces GPU fragment shader instructions by ~70%."
          checked={config.fastDiffuse}
          onChange={(checked) => onChange({ fastDiffuse: checked })}
          isLight={isLight}
        />

        <TunerToggleRow
          label="Geometric Specular AA (Kaplanyan Normal Filtering)"
          description="Eliminates sub-pixel specular fireflies on metallic goal posts & bevels via screen-space normal variance roughness filtering."
          checked={config.specularAA !== false}
          onChange={(checked) => onChange({ specularAA: checked })}
          isLight={isLight}
        />
      </div>

      {/* 2. Pruning & Optimization Summary */}
      <div
        className={`p-3 rounded-xl border flex flex-col gap-2 ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>BoostPads Pruned &amp; Stadium Fast Diffuse Enabled</span>
        </div>
        <p className={`text-[11px] leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-300'}`}>
          <code className="font-mono text-emerald-400">BoostPads_Combined_Base</code> (31,248 tris)
          is purged, stadium meshes default to{' '}
          <code className="font-mono text-emerald-400">Fast Diffuse</code> (while car bodies retain
          full PBR metallic/clearcoat), and{' '}
          <code className="font-mono text-emerald-400">Woods_Field_Walls_Hexes</code> (8,048 tris)
          uses 3D GLB geometry with derivative anti-shimmer.
        </p>
      </div>

      {/* 3. Geometry Budget Breakdown */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 px-1 font-bold text-[10px] text-neutral-400 uppercase tracking-wider">
          <Cpu className="h-3.5 w-3.5" />
          <span>Geometry Budget Breakdown (9 Meshes)</span>
        </div>

        <div
          className={`rounded-xl border overflow-hidden text-[11px] font-mono ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/80 border-neutral-800'
          }`}
        >
          <div
            className={`grid grid-cols-12 py-1.5 px-3 font-semibold border-b ${
              isLight ? 'bg-neutral-100 border-neutral-200 text-neutral-700' : 'bg-neutral-900 border-neutral-800 text-neutral-300'
            }`}
          >
            <span className="col-span-6">Mesh Layer</span>
            <span className="col-span-3 text-right">Triangles</span>
            <span className="col-span-3 text-right">Status</span>
          </div>

          <div className="divide-y divide-neutral-800/40">
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Ground</span>
              <span className="col-span-3 text-right text-emerald-400">408</span>
              <span className="col-span-3 text-right text-neutral-400">{config.ground.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Ramps (Base)</span>
              <span className="col-span-3 text-right">2,048</span>
              <span className="col-span-3 text-right text-neutral-400">{config.ramps.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Ramps Upper &amp; Net Outer</span>
              <span className="col-span-3 text-right">684</span>
              <span className="col-span-3 text-right text-neutral-400">{config.rampsUpperOuter?.visible !== false ? 'One-Way' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Ramps_Trim</span>
              <span className="col-span-3 text-right">16,940</span>
              <span className="col-span-3 text-right text-neutral-400">{config.rampsTrim.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Walls</span>
              <span className="col-span-3 text-right">4,816</span>
              <span className="col-span-3 text-right text-neutral-400">{config.walls.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Walls_Hexes</span>
              <span className="col-span-3 text-right">8,048</span>
              <span
                className={`col-span-3 text-right ${
                  !config.hexes.visible ? 'text-neutral-500' : 'text-pink-400'
                }`}
              >
                {!config.hexes.visible ? 'Off (Saved)' : '3D Mesh'}
              </span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Wall_Posts</span>
              <span className="col-span-3 text-right">11,936</span>
              <span className="col-span-3 text-right text-neutral-400">{config.wallPosts.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Goal</span>
              <span className="col-span-3 text-right">2,664</span>
              <span className="col-span-3 text-right text-neutral-400">{config.goalFrame.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Goal_Posts</span>
              <span className="col-span-3 text-right">4,104</span>
              <span className="col-span-3 text-right text-neutral-400">{config.goalPosts.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Goal_Posts_Glow</span>
              <span className="col-span-3 text-right">320</span>
              <span className="col-span-3 text-right text-neutral-400">{config.goalPostsGlow?.visible !== false ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3">
              <span className="col-span-6 truncate">Woods_Field_Goal_Net</span>
              <span className="col-span-3 text-right">140</span>
              <span className="col-span-3 text-right text-neutral-400">{config.goalNet.visible ? 'Rendered' : 'Hidden'}</span>
            </div>
            <div className="grid grid-cols-12 py-1 px-3 bg-red-950/20 text-neutral-500 line-through">
              <span className="col-span-6 truncate flex items-center gap-1">
                <Trash2 className="h-3 w-3 text-red-500" />
                <span>BoostPads_Combined_Base</span>
              </span>
              <span className="col-span-3 text-right">31,248</span>
              <span className="col-span-3 text-right text-red-400">Purged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
