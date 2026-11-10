import React from 'react';
import { Palette, MoveVertical } from 'lucide-react';
import { type BoostPadTunerConfig } from '../../../config/uiConfig';
import { TunerRow, TunerColorRow, TunerToggleRow } from '../../../compounds/TunerControls';

export interface BoostPadMaterialsTabProps {
  tuner: BoostPadTunerConfig;
  updateTuner: (patch: Partial<BoostPadTunerConfig>) => void;
  isLight?: boolean;
}

export const BoostPadMaterialsTab: React.FC<BoostPadMaterialsTabProps> = ({
  tuner,
  updateTuner,
  isLight = false,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 1. Pad Elevation / Ground Alignment Offset */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <MoveVertical className="h-3 w-3" />
          <span>Elevation & Ground Alignment</span>
        </div>

        <TunerRow
          label="Pad Vertical Offset (Y-Axis)"
          description="Adjusts all 34 boost pads vertically to eliminate clipping beneath stadium terrain"
          value={tuner.padHeightOffset ?? 7.5}
          sliderMin={-10.0}
          sliderMax={25.0}
          sliderStep={0.5}
          onChange={(val) => updateTuner({ padHeightOffset: val })}
          isLight={isLight}
          unit="uu"
        />

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Big Pad Glow Y-Offset"
            description="Vertical alignment of big pad glow cone relative to base chassis"
            value={tuner.glowHeightOffsetBig ?? -0.01}
            sliderMin={-0.1}
            sliderMax={0.1}
            sliderStep={0.001}
            onChange={(val) => updateTuner({ glowHeightOffsetBig: val })}
            isLight={isLight}
            unit="uu"
          />

          <TunerRow
            label="Small Pad Glow Y-Offset"
            description="Vertical alignment of small pad glow cone relative to base chassis"
            value={tuner.glowHeightOffsetSmall ?? -0.05}
            sliderMin={-0.1}
            sliderMax={0.1}
            sliderStep={0.001}
            onChange={(val) => updateTuner({ glowHeightOffsetSmall: val })}
            isLight={isLight}
            unit="uu"
          />
        </div>
      </div>

      {/* 2. Top Feature Plate Materials */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Palette className="h-3 w-3" />
          <span>Top Feature Plates (Top_Mat)</span>
        </div>

        <TunerColorRow
          label="Active Color (Collectable)"
          description="Color of top feature plates when boost pad is full and able to be collected"
          value={tuner.topColor}
          onChange={(hex) => updateTuner({ topColor: hex })}
          isLight={isLight}
        />

        <TunerColorRow
          label="Inactive Color (Cooldown / Respawning)"
          description="Color of top feature plates while pad is recharging or empty"
          value={tuner.topInactiveColor || '#1c2026'}
          onChange={(hex) => updateTuner({ topInactiveColor: hex })}
          isLight={isLight}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Top Roughness"
            value={tuner.topRoughness ?? 0.3}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.02}
            onChange={(val) => updateTuner({ topRoughness: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Top Metalness"
            value={tuner.topMetalness ?? 0.2}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.02}
            onChange={(val) => updateTuner({ topMetalness: val })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* 3. Base Chassis Material */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Palette className="h-3 w-3" />
          <span>Base Chassis & Mount (Base_Mat)</span>
        </div>

        <TunerColorRow
          label="Base Chassis Color"
          description="Base floor mount material color for all 34 pads"
          value={tuner.baseColor}
          onChange={(hex) => updateTuner({ baseColor: hex })}
          isLight={isLight}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Base Roughness"
            value={tuner.baseRoughness ?? 0.7}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.02}
            onChange={(val) => updateTuner({ baseRoughness: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Base Metalness"
            value={tuner.baseMetalness ?? 0.1}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.02}
            onChange={(val) => updateTuner({ baseMetalness: val })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* 4. Side Bezel Accent Material */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center gap-1.5 px-1 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Palette className="h-3 w-3" />
          <span>Side Bezel Accents (Side_Mat)</span>
        </div>

        <TunerToggleRow
          label="Side Follows Base Material"
          description="When active, side bezel automatically inherits base chassis color and PBR properties"
          checked={tuner.sideFollowsBase}
          onChange={(checked) => updateTuner({ sideFollowsBase: checked })}
          isLight={isLight}
        />

        {!tuner.sideFollowsBase && (
          <>
            <TunerColorRow
              label="Side Bezel Color"
              description="Independent side facet accent coloring"
              value={tuner.sideColor}
              onChange={(hex) => updateTuner({ sideColor: hex })}
              isLight={isLight}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <TunerRow
                label="Side Roughness"
                value={tuner.sideRoughness ?? 0.7}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.02}
                onChange={(val) => updateTuner({ sideRoughness: val })}
                isLight={isLight}
              />

              <TunerRow
                label="Side Metalness"
                value={tuner.sideMetalness ?? 0.1}
                sliderMin={0.0}
                sliderMax={1.0}
                sliderStep={0.02}
                onChange={(val) => updateTuner({ sideMetalness: val })}
                isLight={isLight}
              />
            </div>
          </>
        )}
      </div>

      <div
        className={`p-2 rounded-xl border text-[10px] leading-relaxed transition-colors font-mono ${
          isLight
            ? 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
            : 'bg-neutral-900/40 border-neutral-800 text-neutral-400'
        }`}
      >
        <div>• Discrete DCC primitives split: Zero SDF shader runtime overhead</div>
        <div>• Small Pad: Base (BoostPad_Small_Base_Mat), Top (Top_Mat), Side (Side_Mat)</div>
        <div>• Big Pad: Base (dummy_material_0), Top (Top_mat)</div>
      </div>
    </div>
  );
};
