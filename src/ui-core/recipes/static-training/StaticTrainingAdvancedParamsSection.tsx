import React from 'react';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { CompactNumberSlider } from './CompactNumberSlider';
import type { EditSubMode, StaticTrainingShotItem } from './staticTrainingTypes';

const radToDeg = (r: number) => Math.round((r * 180) / Math.PI);
const degToRad = (d: number) => Number(((d * Math.PI) / 180).toFixed(4));

export interface StaticTrainingAdvancedParamsSectionProps {
  isLight: boolean;
  currentShot: StaticTrainingShotItem;
  speedFollowsHeading: boolean;
  sectionBg: string;
  rowHoverClass: string;
  onMutateShot: (updater: (draft: StaticTrainingShotItem) => void) => void;
  onHoverDesc: (desc: string | null) => void;
  onFocusCarCamera?: (targetMode?: EditSubMode) => void;
  onFocusBallCamera?: () => void;
}

export const StaticTrainingAdvancedParamsSection: React.FC<
  StaticTrainingAdvancedParamsSectionProps
> = React.memo(({
  isLight,
  currentShot,
  speedFollowsHeading,
  sectionBg,
  rowHoverClass,
  onMutateShot,
  onHoverDesc,
  onFocusCarCamera,
  onFocusBallCamera,
}) => (
  <div className={`p-2 rounded-xl border flex flex-col gap-1 ${sectionBg}`}>
    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500 px-1">
      Advanced Car Parameters
    </span>

    <CompactNumberSlider
      label="Car Pos X"
      value={Math.round(currentShot.car.location[0])}
      min={-3900}
      max={3900}
      step={10}
      unit=" UU"
      description="Car Spawn X Coordinate (-3900 to +3900 UU)."
      onHoverDesc={onHoverDesc}
      onChange={(val) => {
        onFocusCarCamera?.();
        onMutateShot((d) => {
          d.car.location[0] = val;
        });
      }}
      isLight={isLight}
    />
    <CompactNumberSlider
      label="Car Pos Y"
      value={Math.round(currentShot.car.location[1])}
      min={-5000}
      max={5000}
      step={10}
      unit=" UU"
      description="Car Spawn Y Coordinate (-5000 Blue Goal to +5000 Orange Goal UU)."
      onHoverDesc={onHoverDesc}
      onChange={(val) => {
        onFocusCarCamera?.();
        onMutateShot((d) => {
          d.car.location[1] = val;
        });
      }}
      isLight={isLight}
    />
    <CompactNumberSlider
      label="Car Pos Z"
      value={Math.round(currentShot.car.location[2])}
      min={17}
      max={1980}
      step={5}
      unit=" UU"
      description="Car Spawn Z Elevation (17 UU Ground to 1980 UU Ceiling)."
      onHoverDesc={onHoverDesc}
      onChange={(val) => {
        onFocusCarCamera?.();
        onMutateShot((d) => {
          d.car.location[2] = val;
          if (val > 22) d.car.snapToGround = false;
        });
      }}
      isLight={isLight}
    />

    <CompactNumberSlider
      label="Car Heading Yaw"
      value={radToDeg(currentShot.car.headingYaw)}
      min={-180}
      max={180}
      step={1}
      unit="°"
      description="Car Nose Heading Yaw Angle (-180° to +180°)."
      onHoverDesc={onHoverDesc}
      onChange={(deg) => {
        onFocusCarCamera?.('car-heading');
        onMutateShot((d) => {
          d.car.headingYaw = degToRad(deg);
          if (d.car.speedFollowsHeading !== false) {
            d.car.speedYaw = d.car.headingYaw;
          }
        });
      }}
      isLight={isLight}
    />
    <CompactNumberSlider
      label="Car Heading Pitch"
      value={radToDeg(currentShot.car.headingPitch)}
      min={-85}
      max={85}
      step={1}
      unit="°"
      description="Car Nose Pitch Angle (-85° dive to +85° nose up)."
      onHoverDesc={onHoverDesc}
      onChange={(deg) => {
        onFocusCarCamera?.('car-heading');
        onMutateShot((d) => {
          d.car.headingPitch = degToRad(deg);
          if (deg !== 0) d.car.snapToGround = false;
          if (d.car.speedFollowsHeading !== false) {
            d.car.speedPitch = d.car.headingPitch;
          }
        });
      }}
      isLight={isLight}
    />
    <CompactNumberSlider
      label="Car Air Roll [Q/E]"
      value={radToDeg(currentShot.car.airRoll)}
      min={-180}
      max={180}
      step={1}
      unit="°"
      description="Car Air Roll Bank Angle (-180° to +180°, shortcut [Q]/[E])."
      onHoverDesc={onHoverDesc}
      onChange={(deg) => {
        onFocusCarCamera?.('car-heading');
        onMutateShot((d) => {
          d.car.airRoll = degToRad(deg);
          if (deg !== 0) d.car.snapToGround = false;
        });
      }}
      isLight={isLight}
    />

    <CompactNumberSlider
      label="Car Speed [ / ]"
      value={Math.round(currentShot.car.speed)}
      min={0}
      max={2300}
      step={10}
      unit=" UU"
      description="Car Initial Launch Speed (0 to 2300 UU/s supersonic, shortcut [[] / []])."
      onHoverDesc={onHoverDesc}
      onChange={(spd) => {
        onFocusCarCamera?.();
        onMutateShot((d) => {
          d.car.speed = spd;
        });
      }}
      isLight={isLight}
    />
    {!speedFollowsHeading && (
      <>
        <CompactNumberSlider
          label="Car Speed Yaw"
          value={radToDeg(currentShot.car.speedYaw)}
          min={-180}
          max={180}
          step={1}
          unit="°"
          description="Independent Car Linear Velocity Yaw Angle (-180° to +180°)."
          onHoverDesc={onHoverDesc}
          onChange={(deg) => {
            onFocusCarCamera?.('car-speed');
            onMutateShot((d) => {
              d.car.speedYaw = degToRad(deg);
            });
          }}
          isLight={isLight}
        />
        <CompactNumberSlider
          label="Car Speed Pitch"
          value={radToDeg(currentShot.car.speedPitch)}
          min={-85}
          max={85}
          step={1}
          unit="°"
          description="Independent Car Linear Velocity Pitch Angle (-85° to +85°)."
          onHoverDesc={onHoverDesc}
          onChange={(deg) => {
            onFocusCarCamera?.('car-speed');
            onMutateShot((d) => {
              d.car.speedPitch = degToRad(deg);
            });
          }}
          isLight={isLight}
        />
      </>
    )}

    <div className="pt-1.5 mt-0.5 border-t border-neutral-500/15 flex flex-col gap-1">
      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-500 px-1">
        Advanced Ball Parameters
      </span>

      <div
        className={rowHoverClass}
        onMouseEnter={() =>
          onHoverDesc(
            "Kickoff Freeze State: Ball stays suspended stationary in mid-air until touched (or press '[' at 0 speed)."
          )
        }
        onMouseLeave={() => onHoverDesc(null)}
      >
        <span className="text-[11px] font-semibold">Kickoff Freeze State</span>
        <ToggleSwitch
          checked={currentShot.ball.kickoffState}
          onCheckedChange={(checked) => {
            onFocusBallCamera?.();
            onMutateShot((d) => {
              d.ball.kickoffState = checked;
              if (checked) d.ball.speed = 0;
            });
          }}
          isLight={isLight}
          variant="neutral"
        />
      </div>

      <CompactNumberSlider
        label="Ball Pos X"
        value={Math.round(currentShot.ball.location[0])}
        min={-3900}
        max={3900}
        step={10}
        unit=" UU"
        description="Ball Spawn X Coordinate (-3900 to +3900 UU)."
        onHoverDesc={onHoverDesc}
        onChange={(val) => {
          onFocusBallCamera?.();
          onMutateShot((d) => {
            d.ball.location[0] = val;
          });
        }}
        isLight={isLight}
      />
      <CompactNumberSlider
        label="Ball Pos Y"
        value={Math.round(currentShot.ball.location[1])}
        min={-5000}
        max={5000}
        step={10}
        unit=" UU"
        description="Ball Spawn Y Coordinate (-5000 to +5000 UU)."
        onHoverDesc={onHoverDesc}
        onChange={(val) => {
          onFocusBallCamera?.();
          onMutateShot((d) => {
            d.ball.location[1] = val;
          });
        }}
        isLight={isLight}
      />
      <CompactNumberSlider
        label="Ball Pos Z"
        value={Math.round(currentShot.ball.location[2])}
        min={94}
        max={1940}
        step={5}
        unit=" UU"
        description="Ball Spawn Z Elevation (94 UU Floor to 1940 UU Ceiling)."
        onHoverDesc={onHoverDesc}
        onChange={(val) => {
          onFocusBallCamera?.();
          onMutateShot((d) => {
            d.ball.location[2] = val;
          });
        }}
        isLight={isLight}
      />

      {!currentShot.ball.kickoffState && (
        <>
          <CompactNumberSlider
            label="Ball Speed [ / ]"
            value={Math.round(currentShot.ball.speed)}
            min={0}
            max={4000}
            step={10}
            unit=" UU"
            description="Ball Launch Speed (0 to 4000 UU/s, shortcut [[] / []])."
            onHoverDesc={onHoverDesc}
            onChange={(spd) => {
              onFocusBallCamera?.();
              onMutateShot((d) => {
                d.ball.speed = spd;
              });
            }}
            isLight={isLight}
          />
          <CompactNumberSlider
            label="Ball Speed Yaw"
            value={radToDeg(currentShot.ball.speedYaw)}
            min={-180}
            max={180}
            step={1}
            unit="°"
            description="Ball Velocity Horizontal Aim Yaw (-180° to +180°)."
            onHoverDesc={onHoverDesc}
            onChange={(deg) => {
              onFocusBallCamera?.();
              onMutateShot((d) => {
                d.ball.speedYaw = degToRad(deg);
              });
            }}
            isLight={isLight}
          />
          <CompactNumberSlider
            label="Ball Speed Pitch"
            value={radToDeg(currentShot.ball.speedPitch)}
            min={-85}
            max={85}
            step={1}
            unit="°"
            description="Ball Velocity Vertical Trajectory Pitch (-85° to +85°)."
            onHoverDesc={onHoverDesc}
            onChange={(deg) => {
              onFocusBallCamera?.();
              onMutateShot((d) => {
                d.ball.speedPitch = degToRad(deg);
              });
            }}
            isLight={isLight}
          />
        </>
      )}
    </div>
  </div>
));

StaticTrainingAdvancedParamsSection.displayName = 'StaticTrainingAdvancedParamsSection';
