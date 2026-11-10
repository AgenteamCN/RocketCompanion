import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ShieldAlert, Sparkles } from 'lucide-react';
import type { DriftwoodsLayerConfig, DriftwoodsTunerConfig } from '../../../config/driftwoodsConfig';
import {
  TunerRow,
  TunerColorRow,
  TunerToggleRow
} from '../../../compounds/TunerControls';

export interface DriftwoodsTransparentTabProps {
  config: DriftwoodsTunerConfig;
  onChange: (patch: Partial<DriftwoodsTunerConfig>) => void;
  isLight?: boolean;
}

export const DriftwoodsTransparentTab: React.FC<DriftwoodsTransparentTabProps> = ({
  config,
  onChange,
  isLight = false,
}) => {
  const [wallsOpen, setWallsOpen] = useState(true);
  const [netOpen, setNetOpen] = useState(true);
  const [hexesOpen, setHexesOpen] = useState(true);

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. Boundary Glass Walls */}
      <div
        className={`rounded-xl border transition-colors overflow-hidden ${
          isLight ? 'bg-neutral-50/60 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <div
          className="flex items-center justify-between p-2.5 cursor-pointer select-none"
          onClick={() => setWallsOpen(!wallsOpen)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3.5 h-3.5 rounded-full border border-neutral-600 shrink-0"
              style={{ backgroundColor: config.walls.color, opacity: config.walls.opacity ?? 0.25 }}
            />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-semibold truncate ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}>
                Boundary Glass Walls
              </span>
              <span className={`text-[10px] truncate ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Transparent perimeter containment glass (4,816 tris)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {wallsOpen ? (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            )}
          </div>
        </div>

        {wallsOpen && (
          <div className="p-2.5 pt-0 flex flex-col gap-1.5 border-t border-neutral-700/20">
            <TunerColorRow
              label="Glass Tint Color"
              value={config.walls.color}
              onChange={(hex) => onChange({ walls: { ...config.walls, color: hex } })}
              isLight={isLight}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Opacity (Alpha)"
                value={config.walls.opacity ?? 0.25}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.01}
                onChange={(val) => onChange({ walls: { ...config.walls, opacity: val } })}
                isLight={isLight}
              />

              <TunerRow
                label="Roughness"
                value={config.walls.roughness}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.01}
                onChange={(val) => onChange({ walls: { ...config.walls, roughness: val } })}
                isLight={isLight}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <TunerToggleRow
                label="Walls Visible"
                checked={config.walls.visible}
                onChange={(checked) => onChange({ walls: { ...config.walls, visible: checked } })}
                isLight={isLight}
              />

              <TunerToggleRow
                label="Wireframe"
                checked={config.walls.wireframe}
                onChange={(checked) => onChange({ walls: { ...config.walls, wireframe: checked } })}
                isLight={isLight}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Goal Netting */}
      <div
        className={`rounded-xl border transition-colors overflow-hidden ${
          isLight ? 'bg-neutral-50/60 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <div
          className="flex items-center justify-between p-2.5 cursor-pointer select-none"
          onClick={() => setNetOpen(!netOpen)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3.5 h-3.5 rounded-full border border-neutral-600 shrink-0"
              style={{ backgroundColor: config.goalNet.color, opacity: config.goalNet.opacity ?? 0.6 }}
            />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-semibold truncate ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}>
                Goal Netting
              </span>
              <span className={`text-[10px] truncate ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Lightweight back-of-goal net mesh (140 tris)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {netOpen ? (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            )}
          </div>
        </div>

        {netOpen && (
          <div className="p-2.5 pt-0 flex flex-col gap-1.5 border-t border-neutral-700/20">
            <TunerColorRow
              label="Net Tint Color"
              value={config.goalNet.color}
              onChange={(hex) => onChange({ goalNet: { ...config.goalNet, color: hex } })}
              isLight={isLight}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Net Opacity"
                value={config.goalNet.opacity ?? 0.6}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.01}
                onChange={(val) => onChange({ goalNet: { ...config.goalNet, opacity: val } })}
                isLight={isLight}
              />

              <TunerRow
                label="Roughness"
                value={config.goalNet.roughness}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.01}
                onChange={(val) => onChange({ goalNet: { ...config.goalNet, roughness: val } })}
                isLight={isLight}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <TunerToggleRow
                label="Net Visible"
                checked={config.goalNet.visible}
                onChange={(checked) => onChange({ goalNet: { ...config.goalNet, visible: checked } })}
                isLight={isLight}
              />

              <TunerToggleRow
                label="Wireframe"
                checked={config.goalNet.wireframe}
                onChange={(checked) => onChange({ goalNet: { ...config.goalNet, wireframe: checked } })}
                isLight={isLight}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Shield Hex Grid (3D GLB Mesh) */}
      <div
        className={`rounded-xl border transition-colors overflow-hidden ${
          isLight ? 'bg-neutral-50/60 border-neutral-200' : 'bg-neutral-900/40 border-neutral-800'
        }`}
      >
        <div
          className="flex items-center justify-between p-2.5 cursor-pointer select-none"
          onClick={() => setHexesOpen(!hexesOpen)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-pink-500 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-semibold truncate ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}>
                Shield Hex Grid (Honeycomb Energy)
              </span>
              <span className={`text-[10px] truncate ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
                3D GLB honeycomb mesh (8,048 tris, anti-shimmer &amp; Bloom emissive glow)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                config.hexes.visible
                  ? 'bg-pink-500/10 text-pink-400 border-pink-500/20'
                  : 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
              }`}
            >
              {config.hexes.visible ? '3D Mesh' : 'Off'}
            </span>
            {hexesOpen ? (
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            )}
          </div>
        </div>

        {hexesOpen && (
          <div className="p-2.5 pt-0 flex flex-col gap-1.5 border-t border-neutral-700/20">
            <TunerToggleRow
              label="Enable Shield Hexes"
              description="Turn on 3D GLB honeycomb energy wall & ceiling grid."
              checked={config.hexes.visible}
              onChange={(checked) => onChange({ hexes: { ...config.hexes, visible: checked } })}
              isLight={isLight}
            />

            <TunerColorRow
              label="Emissive Glow Color"
              description="High-energy neon glow tint channeled to Bloom pass"
              value={config.hexes.emissive || config.hexes.color}
              onChange={(hex) => onChange({ hexes: { ...config.hexes, emissive: hex, color: hex } })}
              isLight={isLight}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Glow Radiance"
                description="Bloom brightness factor"
                value={config.hexes.emissiveIntensity ?? 0}
                sliderMin={0.0}
                sliderMax={5.0}
                sliderStep={0.05}
                onChange={(val) => onChange({ hexes: { ...config.hexes, emissiveIntensity: val } })}
                isLight={isLight}
              />

              <TunerRow
                label="Alpha Opacity"
                value={config.hexes.opacity ?? 0.22}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.005}
                onChange={(val) => onChange({ hexes: { ...config.hexes, opacity: val } })}
                isLight={isLight}
              />
            </div>

            <TunerToggleRow
              label="Hex Wireframe"
              checked={config.hexes.wireframe}
              onChange={(checked) => onChange({ hexes: { ...config.hexes, wireframe: checked } })}
              isLight={isLight}
            />
          </div>
        )}
      </div>
    </div>
  );
};
