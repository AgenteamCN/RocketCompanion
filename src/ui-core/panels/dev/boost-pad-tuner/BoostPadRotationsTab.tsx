import React, { useState } from 'react';
import { Compass, Copy, Check } from 'lucide-react';
import { type BoostPadTunerConfig } from '../../../config/uiConfig';
import { TunerRow } from '../../../compounds/TunerControls';
import { computeAllPadRotations, exportRotationsAsCode } from '../../../config/boostPadGeometry';

export interface BoostPadRotationsTabProps {
  tuner: BoostPadTunerConfig;
  updateTuner: (patch: Partial<BoostPadTunerConfig>) => void;
  isLight?: boolean;
}

export const BoostPadRotationsTab: React.FC<BoostPadRotationsTabProps> = ({
  tuner,
  updateTuner,
  isLight = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyAngles = () => {
    try {
      const angles = computeAllPadRotations(tuner);
      const code = exportRotationsAsCode(angles);
      navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[BoostPadRotationsTab] Copy error:', err);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header and Export Action */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Compass className="h-3 w-3" />
          <span>Symmetric Orientation Tuner (11 Groups)</span>
        </div>

        <button
          type="button"
          onClick={handleCopyAngles}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
          }`}
          title="Export 34-pad calculated rotation array to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Copied Array</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy 34 Angles</span>
            </>
          )}
        </button>
      </div>

      {/* 1. Big Pads Groups (2 sliders control 6 pads) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase text-neutral-400 px-1">
          Big Boost Pads (6 Pads)
        </span>

        <TunerRow
          label="Midfield Big Pads (2 Pads)"
          description="Pads #0 & #1 at (+-3584, 0). 180° point-symmetric lock"
          value={tuner.rotBigMid}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotBigMid: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Corner Big Pads (4 Pads)"
          description="Pads #2-#5 at (+-3072, +-4096). Quad-axis mirror lock"
          value={tuner.rotBigCorner}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotBigCorner: val })}
          isLight={isLight}
          unit="deg"
        />
      </div>

      {/* 2. Small Pads Symmetry Groups (9 sliders control 28 pads) */}
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-[10px] font-semibold uppercase text-neutral-400 px-1">
          Small Boost Pads (28 Pads)
        </span>

        <TunerRow
          label="Center Y-Axis Goal Outer (0, +-4240)"
          description="Pads #6 & #33 located in front of goal mouths"
          value={tuner.rotSmallAxisY0}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallAxisY0: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Center Y-Axis Mid Near (0, +-2816)"
          description="Pads #11 & #28 between goal and center circle"
          value={tuner.rotSmallAxisY1}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallAxisY1: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Center Y-Axis Inner Circle (0, +-1024)"
          description="Pads #17 & #22 hugging midfield ring"
          value={tuner.rotSmallAxisY2}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallAxisY2: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Midfield X-Axis Cross (+-1024, 0)"
          description="Pads #19 & #20 along horizontal centerline"
          value={tuner.rotSmallAxisX0}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallAxisX0: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Quadrant Group A (+-1792, +-4184)"
          description="Pads #7, #8, #31, #32 goal flank wing pads"
          value={tuner.rotSmallQuadA}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallQuadA: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Quadrant Group B (+-940, +-3308)"
          description="Pads #9, #10, #29, #30 diagonal inner defense"
          value={tuner.rotSmallQuadB}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallQuadB: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Quadrant Group C (+-3584, +-2484)"
          description="Pads #12, #13, #26, #27 outer wall sideline runners"
          value={tuner.rotSmallQuadC}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallQuadC: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Quadrant Group D (+-1788, +-2300)"
          description="Pads #14, #15, #24, #25 mid-wing attack arc"
          value={tuner.rotSmallQuadD}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallQuadD: val })}
          isLight={isLight}
          unit="deg"
        />

        <TunerRow
          label="Quadrant Group E (+-2048, +-1036)"
          description="Pads #16, #18, #21, #23 midfield perimeter diamonds"
          value={tuner.rotSmallQuadE}
          sliderMin={-180}
          sliderMax={180}
          sliderStep={1}
          onChange={(val) => updateTuner({ rotSmallQuadE: val })}
          isLight={isLight}
          unit="deg"
        />
      </div>
    </div>
  );
};
