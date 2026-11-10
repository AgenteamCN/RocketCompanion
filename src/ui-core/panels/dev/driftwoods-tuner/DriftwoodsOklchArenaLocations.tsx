import React from 'react';
import {
  oklchToHex,
  type DriftwoodsGroundConfig,
} from '../../../config/driftwoodsConfig';
import {
  TunerRow,
  TunerToggleRow,
} from '../../../compounds/TunerControls';

export interface DriftwoodsOklchArenaLocationsProps {
  ground: DriftwoodsGroundConfig;
  onChange: (patch: Partial<DriftwoodsGroundConfig>) => void;
  teamC: number;
  blueH: number;
  orangeH: number;
  markingsL: number;
  isLight?: boolean;
}

export const DriftwoodsOklchArenaLocations: React.FC<DriftwoodsOklchArenaLocationsProps> = ({
  ground,
  onChange,
  teamC,
  blueH,
  orangeH,
  markingsL,
  isLight = false,
}) => {
  const goalGlowL = ground.oklchGoalPostsGlowLightness ?? 0.65;
  const rampsUpperOuterL = ground.oklchRampsUpperOuterLightness ?? 0.5;
  const hexL = ground.oklchHexLightness ?? 0.65;

  const goalGlowIndCH = Boolean(ground.oklchGoalPostsGlowIndependentCH);
  const goalGlowC = goalGlowIndCH ? (ground.oklchGoalPostsGlowChroma ?? teamC) : teamC;
  const goalGlowBlueH = goalGlowIndCH ? (ground.oklchGoalPostsGlowBlueHue ?? blueH) : blueH;
  const goalGlowOrangeH = goalGlowIndCH
    ? (ground.oklchGoalPostsGlowOrangeHue ?? orangeH)
    : orangeH;

  const rampsUpperOuterIndCH = ground.oklchRampsUpperOuterIndependentCH !== false;
  const rampsUpperOuterC = rampsUpperOuterIndCH
    ? (ground.oklchRampsUpperOuterChroma ?? 0.1)
    : teamC;
  const rampsUpperOuterBlueH = rampsUpperOuterIndCH
    ? (ground.oklchRampsUpperOuterBlueHue ?? blueH)
    : blueH;
  const rampsUpperOuterOrangeH = rampsUpperOuterIndCH
    ? (ground.oklchRampsUpperOuterOrangeHue ?? orangeH)
    : orangeH;

  const hexIndCH = ground.oklchHexIndependentCH !== false;
  const hexC = hexIndCH ? (ground.oklchHexChroma ?? 0.32) : teamC;
  const hexBlueH = hexIndCH ? (ground.oklchHexBlueHue ?? blueH) : blueH;
  const hexOrangeH = hexIndCH ? (ground.oklchHexOrangeHue ?? orangeH) : orangeH;

  const computedGoalGlowBlueHex = oklchToHex(goalGlowL, goalGlowC, goalGlowBlueH);
  const computedGoalGlowOrangeHex = oklchToHex(goalGlowL, goalGlowC, goalGlowOrangeH);
  const computedRampsUpperOuterBlueHex = oklchToHex(
    rampsUpperOuterL,
    rampsUpperOuterC,
    rampsUpperOuterBlueH
  );
  const computedRampsUpperOuterOrangeHex = oklchToHex(
    rampsUpperOuterL,
    rampsUpperOuterC,
    rampsUpperOuterOrangeH
  );
  const computedHexBlueHex = oklchToHex(hexL, hexC, hexBlueH);
  const computedHexOrangeHex = oklchToHex(hexL, hexC, hexOrangeH);

  const cardClass = `p-1.5 rounded-xl border flex flex-col gap-1.5 ${
    isLight
      ? 'bg-neutral-100/50 border-neutral-200/80'
      : 'bg-neutral-900/40 border-neutral-800/80'
  }`;

  return (
    <>
      {/* 3. Goal Posts Glow */}
      <div className={cardClass}>
        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Goal Posts Glow Lightness (L)"
            description={`Goal Posts Glow (${computedGoalGlowBlueHex} | ${computedGoalGlowOrangeHex})`}
            value={goalGlowL}
            sliderMin={0.2}
            sliderMax={1.0}
            sliderStep={0.005}
            onChange={(val) => onChange({ oklchGoalPostsGlowLightness: val })}
            isLight={isLight}
          />

          <TunerToggleRow
            label="Unlink Goal Glow Chroma & Hue"
            description="Allow Goal Posts Glow to override shared C & H"
            checked={goalGlowIndCH}
            onChange={(checked) =>
              onChange({
                oklchGoalPostsGlowIndependentCH: checked,
                oklchGoalPostsGlowChroma: ground.oklchGoalPostsGlowChroma ?? teamC,
                oklchGoalPostsGlowBlueHue: ground.oklchGoalPostsGlowBlueHue ?? blueH,
                oklchGoalPostsGlowOrangeHue:
                  ground.oklchGoalPostsGlowOrangeHue ?? orangeH,
              })
            }
            isLight={isLight}
          />
        </div>

        {goalGlowIndCH && (
          <div className="grid grid-cols-3 gap-1.5">
            <TunerRow
              label="Goal Glow Chroma (C)"
              value={goalGlowC}
              sliderMin={0.02}
              sliderMax={0.32}
              sliderStep={0.005}
              onChange={(val) => onChange({ oklchGoalPostsGlowChroma: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Goal Glow Blue Hue (H)"
              value={goalGlowBlueH}
              sliderMin={180}
              sliderMax={290}
              sliderStep={1}
              unit="deg"
              onChange={(val) => onChange({ oklchGoalPostsGlowBlueHue: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Goal Glow Orange Hue (H)"
              value={goalGlowOrangeH}
              sliderMin={15}
              sliderMax={85}
              sliderStep={1}
              unit="deg"
              onChange={(val) => onChange({ oklchGoalPostsGlowOrangeHue: val })}
              isLight={isLight}
            />
          </div>
        )}
      </div>

      {/* 4. Ramps Upper & Goal Net Outer */}
      <div className={cardClass}>
        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Ramps Upper & Net Outer Lightness (L)"
            description={`Shared Upper & Outer (${computedRampsUpperOuterBlueHex} | ${computedRampsUpperOuterOrangeHex})`}
            value={rampsUpperOuterL}
            sliderMin={0.2}
            sliderMax={0.98}
            sliderStep={0.005}
            onChange={(val) => onChange({ oklchRampsUpperOuterLightness: val })}
            isLight={isLight}
          />

          <TunerToggleRow
            label="Unlink Upper & Outer Chroma & Hue"
            description="Allow Ramps Upper & Net Outer to override shared C & H"
            checked={rampsUpperOuterIndCH}
            onChange={(checked) =>
              onChange({
                oklchRampsUpperOuterIndependentCH: checked,
                oklchRampsUpperOuterChroma:
                  ground.oklchRampsUpperOuterChroma ?? teamC,
                oklchRampsUpperOuterBlueHue:
                  ground.oklchRampsUpperOuterBlueHue ?? blueH,
                oklchRampsUpperOuterOrangeHue:
                  ground.oklchRampsUpperOuterOrangeHue ?? orangeH,
              })
            }
            isLight={isLight}
          />
        </div>

        {rampsUpperOuterIndCH && (
          <div className="grid grid-cols-3 gap-1.5">
            <TunerRow
              label="Upper & Outer Chroma (C)"
              value={rampsUpperOuterC}
              sliderMin={0.02}
              sliderMax={0.32}
              sliderStep={0.005}
              onChange={(val) => onChange({ oklchRampsUpperOuterChroma: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Upper & Outer Blue Hue (H)"
              value={rampsUpperOuterBlueH}
              sliderMin={180}
              sliderMax={290}
              sliderStep={1}
              unit="deg"
              onChange={(val) => onChange({ oklchRampsUpperOuterBlueHue: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Upper & Outer Orange Hue (H)"
              value={rampsUpperOuterOrangeH}
              sliderMin={15}
              sliderMax={85}
              sliderStep={1}
              unit="deg"
              onChange={(val) => onChange({ oklchRampsUpperOuterOrangeHue: val })}
              isLight={isLight}
            />
          </div>
        )}
      </div>

      {/* 5. Hexagon Grid & Neutral Markings */}
      <div className={cardClass}>
        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Hexagon Grid Lightness (L)"
            description={`Wall Hexes (${computedHexBlueHex} | ${computedHexOrangeHex})`}
            value={hexL}
            sliderMin={0.25}
            sliderMax={0.98}
            sliderStep={0.005}
            onChange={(val) => onChange({ oklchHexLightness: val })}
            isLight={isLight}
          />

          <TunerToggleRow
            label="Unlink Hex Grid Chroma & Hue"
            description="Allow Wall Hexes to override shared C & H"
            checked={hexIndCH}
            onChange={(checked) =>
              onChange({
                oklchHexIndependentCH: checked,
                oklchHexChroma: ground.oklchHexChroma ?? teamC,
                oklchHexBlueHue: ground.oklchHexBlueHue ?? blueH,
                oklchHexOrangeHue: ground.oklchHexOrangeHue ?? orangeH,
              })
            }
            isLight={isLight}
          />
        </div>

        {hexIndCH && (
          <div className="grid grid-cols-3 gap-1.5">
            <TunerRow
              label="Hex Chroma (C)"
              value={hexC}
              sliderMin={0.02}
              sliderMax={0.32}
              sliderStep={0.005}
              onChange={(val) => onChange({ oklchHexChroma: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Hex Blue Hue (H)"
              value={hexBlueH}
              sliderMin={180}
              sliderMax={290}
              sliderStep={1}
              unit="deg"
              onChange={(val) => onChange({ oklchHexBlueHue: val })}
              isLight={isLight}
            />
            <TunerRow
              label="Hex Orange Hue (H)"
              value={hexOrangeH}
              sliderMin={15}
              sliderMax={85}
              sliderStep={1}
              unit="deg"
              onChange={(val) => onChange({ oklchHexOrangeHue: val })}
              isLight={isLight}
            />
          </div>
        )}

        <TunerRow
          label="Neutral Markings Lightness (L)"
          description="Perceptual OKLCH lightness for neutral field markings (L1, L2, L3, L5)"
          value={markingsL}
          sliderMin={0.25}
          sliderMax={1.0}
          sliderStep={0.005}
          onChange={(val) => onChange({ oklchMarkingsLightness: val })}
          isLight={isLight}
        />
      </div>
    </>
  );
};
