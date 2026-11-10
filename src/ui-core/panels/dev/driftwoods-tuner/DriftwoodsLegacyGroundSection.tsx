import React from 'react';
import { Link2, Unlink2, RotateCcw } from 'lucide-react';
import type { DriftwoodsGroundConfig } from '../../../config/driftwoodsConfig';
import { TunerRow, TunerColorRow } from '../../../compounds/TunerControls';

export interface DriftwoodsLegacyGroundSectionProps {
  ground: DriftwoodsGroundConfig;
  onChange: (patch: Partial<DriftwoodsGroundConfig>) => void;
  resetUVTransform: () => void;
  handleScaleXChange: (val: number) => void;
  handleScaleYChange: (val: number) => void;
  isLight?: boolean;
}

export const DriftwoodsLegacyGroundSection: React.FC<DriftwoodsLegacyGroundSectionProps> = ({
  ground,
  onChange,
  resetUVTransform,
  handleScaleXChange,
  handleScaleYChange,
  isLight = false,
}) => {
  return (
    <>
      {/* 1B. Legacy Ground & Marking Tinting */}
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 px-1">
          Ground Shader Dual-Color Decal Mix
        </span>

        <TunerColorRow
          label="Field Turf Color"
          description="Background pitch color (replaced dynamically via fragment shader)"
          value={ground.groundColor}
          onChange={(hex) => onChange({ groundColor: hex })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Marking Lines Color"
          description="Field boundary and circle lines color (blended over turf in Oklab space)"
          value={ground.lineColor}
          onChange={(hex) => onChange({ lineColor: hex })}
          isLight={isLight}
        />

        <TunerRow
          label="Marking Lines Opacity"
          description="Decal opacity over turf color (allows green pitch to show through white lines)"
          value={ground.lineOpacity ?? 0.85}
          sliderMin={0.0}
          sliderMax={1.0}
          sliderStep={0.01}
          onChange={(val) => onChange({ lineOpacity: val })}
          isLight={isLight}
        />
      </div>

      {/* 2B. Legacy Texture UV Transform Matrix */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
            Texture UV Transform (Scale &amp; Offset)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange({ linkScale: !ground.linkScale })}
              title={
                ground.linkScale
                  ? 'Scaling linked (1:1). Click to unlock.'
                  : 'Scaling unlinked. Click to lock aspect ratio.'
              }
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                ground.linkScale
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isLight
                    ? 'bg-neutral-200 text-neutral-600 border border-neutral-300'
                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
              }`}
            >
              {ground.linkScale ? (
                <>
                  <Link2 className="h-3 w-3" />
                  <span>Linked</span>
                </>
              ) : (
                <>
                  <Unlink2 className="h-3 w-3" />
                  <span>Unlinked</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={resetUVTransform}
              title="Reset UV repeat (1.015, 1.037) and offset (-0.0075, -0.0176)"
              className={`p-1 rounded cursor-pointer transition-colors ${
                isLight
                  ? 'hover:bg-neutral-200 text-neutral-600'
                  : 'hover:bg-neutral-800 text-neutral-400'
              }`}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Scale X (Sx)"
            description="Horizontal UV repeat"
            value={ground.scaleX}
            sliderMin={0.5}
            sliderMax={2.0}
            sliderStep={0.0001}
            onChange={handleScaleXChange}
            isLight={isLight}
          />

          <TunerRow
            label="Scale Y (Sy)"
            description="Vertical UV repeat"
            value={ground.scaleY}
            sliderMin={0.5}
            sliderMax={2.0}
            sliderStep={0.0001}
            onChange={handleScaleYChange}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Offset X (Tx)"
            description="Horizontal UV translation"
            value={ground.offsetX}
            sliderMin={-1.0}
            sliderMax={1.0}
            sliderStep={0.0001}
            onChange={(val) => onChange({ offsetX: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Offset Y (Ty)"
            description="Vertical UV translation"
            value={ground.offsetY}
            sliderMin={-1.0}
            sliderMax={1.0}
            sliderStep={0.0001}
            onChange={(val) => onChange({ offsetY: val })}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Line Smoothness (Edge)"
            description="Shader smoothstep width. Smaller values yield razor-sharp line borders."
            value={ground.originalLineSmoothness ?? 0.0364}
            sliderMin={0.001}
            sliderMax={0.15}
            sliderStep={0.001}
            onChange={(val) => onChange({ originalLineSmoothness: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Line Cutoff Threshold"
            description="Luminance threshold separating turf from field boundary markings"
            value={ground.originalLineThreshold ?? 0.0921}
            sliderMin={0.02}
            sliderMax={0.35}
            sliderStep={0.001}
            onChange={(val) => onChange({ originalLineThreshold: val })}
            isLight={isLight}
          />
        </div>
      </div>
    </>
  );
};
