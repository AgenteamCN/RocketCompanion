import React from 'react';
import { RotateCcw, CircleDot } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { DEFAULT_BALL_VISUAL_CONFIG } from '../../../config/ballVisualConfig';

export interface BallTabProps {
  ballConfig: typeof DEFAULT_BALL_VISUAL_CONFIG;
  applyBallPatch: (patch: Partial<typeof DEFAULT_BALL_VISUAL_CONFIG>) => void;
  isLight: boolean;
  cardBg: string;
  mutedText: string;
}

export const BallTab: React.FC<BallTabProps> = ({
  ballConfig,
  applyBallPatch,
  isLight,
  cardBg,
  mutedText,
}) => {
  const opacityVal = ballConfig.opacity ?? 1.0;
  const isTransparent = opacityVal < 0.999;

  return (
    <div className="flex flex-col gap-2.5">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <CircleDot className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-bold text-xs">Ball Opacity &amp; Mesh Diagnostics</span>
            </div>
            <span className={`text-[10px] ${mutedText}`}>
              Applies to Procedural Geodesic Ball (12 Pentagons + 20 Hexagons)
            </span>
          </div>
          <button
            type="button"
            onClick={() => applyBallPatch({ ...DEFAULT_BALL_VISUAL_CONFIG })}
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset</span>
          </button>
        </div>

        <ToggleSwitch
          label="Show Ball Mesh"
          description="Quickly toggle ball visibility while keeping physics simulation active"
          checked={ballConfig.visible !== false}
          onChange={(checked) => applyBallPatch({ visible: checked })}
          isLight={isLight}
        />

        <SliderControl
          label="Ball Opacity"
          description="1.00 = Solid opaque · Lower values let you see through the ball during dribbling & contact checks"
          value={opacityVal}
          min={0.0}
          max={1.0}
          step={0.05}
          editable={true}
          onChange={(val) => applyBallPatch({ opacity: val })}
          disabled={ballConfig.visible === false}
          isLight={isLight}
        />

        {isTransparent && (
          <>
            <ToggleSwitch
              label="Write Depth Buffer When Translucent (Depth Write)"
              description="Off (Default) = See vehicles and arena behind the ball · On = Occlude objects behind the front shell"
              checked={Boolean(ballConfig.depthWriteWhenTransparent)}
              onChange={(checked) => applyBallPatch({ depthWriteWhenTransparent: checked })}
              isLight={isLight}
            />

            <ToggleSwitch
              label="Render Backfaces When Translucent (Double-Sided)"
              description="Renders the interior back hemisphere of the geodesic panels when translucent"
              checked={Boolean(ballConfig.doubleSideWhenTransparent)}
              onChange={(checked) => applyBallPatch({ doubleSideWhenTransparent: checked })}
              isLight={isLight}
            />
          </>
        )}

        <ToggleSwitch
          label="Geodesic / GLTF Wireframe Overlay Mode"
          description="Inspect the truncated icosahedron rings and rounded seam topology"
          checked={Boolean(ballConfig.wireframe)}
          onChange={(checked) => applyBallPatch({ wireframe: checked })}
          disabled={ballConfig.visible === false}
          isLight={isLight}
        />

        <ToggleSwitch
          label="In-Goal Dark Core & White Rim Jitter Effect"
          description="Turns the portion of the ball inside the goal plane dark with a white inner rim glow and 3D jitter"
          checked={ballConfig.goalDarkenJitterEnabled !== false}
          onChange={(checked) => applyBallPatch({ goalDarkenJitterEnabled: checked })}
          disabled={ballConfig.visible === false}
          isLight={isLight}
        />

        <div className="pt-1 border-t border-neutral-700/40 flex flex-col gap-2">
          <span className="font-bold text-[11px]">Ground Projection Indicator Rings</span>
          <SliderControl
            label="Ground Indicator Ring Opacity (Default 0.20)"
            description="Controls the white ground circle and height-contracting inner ring beneath the ball"
            value={ballConfig.indicatorRingOpacity ?? 0.2}
            min={0.0}
            max={1.0}
            step={0.05}
            editable={true}
            onChange={(val) => applyBallPatch({ indicatorRingOpacity: val })}
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
};
