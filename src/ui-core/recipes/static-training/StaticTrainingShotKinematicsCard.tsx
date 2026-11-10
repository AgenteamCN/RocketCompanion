import React from 'react';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { CompactNumberSlider } from './CompactNumberSlider';
import type { EditSubMode, StaticTrainingShotItem } from './staticTrainingTypes';

export interface StaticTrainingShotKinematicsCardProps {
  isLight: boolean;
  currentShot: StaticTrainingShotItem;
  editSubMode: EditSubMode;
  showAdvanced: boolean;
  onToggleShowAdvanced: (checked: boolean) => void;
  onChangeSubMode: (mode: EditSubMode) => void;
  onMutateShot: (updater: (draft: StaticTrainingShotItem) => void) => void;
  onHoverDesc: (desc: string | null) => void;
  onFocusCarCamera: (targetMode?: EditSubMode) => void;
  onFocusBallCamera: () => void;
}

export const StaticTrainingShotKinematicsCard: React.FC<
  StaticTrainingShotKinematicsCardProps
> = React.memo(
  ({
    isLight,
    currentShot,
    editSubMode,
    showAdvanced,
    onToggleShowAdvanced,
    onChangeSubMode,
    onMutateShot,
    onHoverDesc,
    onFocusCarCamera,
    onFocusBallCamera,
  }) => {
    const limitBoostAmount = !currentShot.car.unlimitedBoost;
    const hasFlip = currentShot.car.hasFlip !== false;
    const speedFollowsHeading = currentShot.car.speedFollowsHeading !== false;

    const sectionBg = isLight
      ? 'bg-white border-neutral-200/90 text-neutral-900'
      : 'bg-neutral-900/60 border-neutral-800 text-neutral-100';

    const rowHoverClass =
      'flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-neutral-500/10 transition-colors select-none';

    return (
      <div className={`p-2 rounded-xl border flex flex-col gap-1 ${sectionBg}`}>
        {/* (a) Limit Boost Amount */}
        <div
          className={rowHoverClass}
          onMouseEnter={() =>
            onHoverDesc(
              limitBoostAmount
                ? `Limit Boost Amount: ON (${Math.round(currentShot.car.initialBoost)}% initial boost reserve; adjust with [O]/[P]).`
                : 'Limit Boost Amount: OFF — Car spawns with Unlimited Boost (INF).'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <span className="text-[11px] font-semibold">Limit Boost Amount</span>
          <ToggleSwitch
            checked={limitBoostAmount}
            onCheckedChange={(checked) => {
              onFocusCarCamera();
              onMutateShot((d) => {
                d.car.unlimitedBoost = !checked;
              });
            }}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        {limitBoostAmount && (
          <CompactNumberSlider
            label="Boost Amount [O/P]"
            value={Math.round(currentShot.car.initialBoost)}
            min={0}
            max={100}
            step={1}
            unit="%"
            description="Initial Boost Reserve (0% – 100%). Press [O] / [P] in 3D editor to adjust."
            onHoverDesc={onHoverDesc}
            onChange={(b) => {
              onFocusCarCamera();
              onMutateShot((d) => {
                d.car.initialBoost = b;
              });
            }}
            isLight={isLight}
          />
        )}

        {/* (b) Time Limit */}
        <CompactNumberSlider
          label="Time Limit"
          value={currentShot.timeoutSeconds}
          min={1}
          max={60}
          step={1}
          unit="s"
          description="Shot Time Limit (1s – 60s, default 10s) before shot expires."
          onHoverDesc={onHoverDesc}
          onChange={(val) =>
            onMutateShot((d) => {
              d.timeoutSeconds = Math.max(1, Math.min(60, val));
            })
          }
          isLight={isLight}
        />

        {/* (c) Align Speed with Car Nose */}
        <div
          className={rowHoverClass}
          onMouseEnter={() =>
            onHoverDesc(
              speedFollowsHeading
                ? 'Align Speed with Car Nose: ON — Car velocity direction stays aligned with car nose ([ / ] adjusts speed directly in Car Heading mode).'
                : 'Align Speed with Car Nose: OFF — Independent car velocity yaw & pitch (enables 4th Car Speed sub-mode).'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <span className="text-[11px] font-semibold">Align Speed with Car Nose</span>
          <ToggleSwitch
            checked={speedFollowsHeading}
            onCheckedChange={(checked) => {
              onMutateShot((d) => {
                d.car.speedFollowsHeading = checked;
                if (checked) {
                  d.car.speedYaw = d.car.headingYaw;
                  d.car.speedPitch = d.car.snapToGround ? 0 : d.car.headingPitch;
                }
              });
              if (checked && editSubMode === 'car-speed') {
                onChangeSubMode('car-heading');
              } else {
                onFocusCarCamera(checked ? 'car-heading' : 'car-speed');
              }
            }}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        {/* (d) Snap to Ground */}
        <div
          className={rowHoverClass}
          onMouseEnter={() =>
            onHoverDesc(
              'Snap to Ground [V]: When ON, car spawns at ground level (Z=17.05) with 60-frame wheel suspension settle.'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <span className="text-[11px] font-semibold">Snap to Ground</span>
          <ToggleSwitch
            checked={currentShot.car.snapToGround}
            onCheckedChange={(checked) => {
              onFocusCarCamera();
              onMutateShot((d) => {
                d.car.snapToGround = checked;
                if (checked) {
                  d.car.location[2] = 17.05;
                  d.car.headingPitch = 0;
                  d.car.airRoll = 0;
                  d.car.hasFlip = true;
                  if (d.car.speedFollowsHeading !== false) {
                    d.car.speedPitch = 0;
                  }
                } else if (d.car.location[2] < 45) {
                  d.car.location[2] = 120;
                }
              });
            }}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        {/* (e) Has Flip */}
        <div
          className={rowHoverClass}
          onMouseEnter={() =>
            onHoverDesc(
              currentShot.car.snapToGround
                ? 'Has Flip: On Ground (Flip is always available when grounded).'
                : hasFlip
                  ? 'Has Flip: ON — Airborne car spawns with an available dodge/flip.'
                  : 'Has Flip: OFF — Airborne car spawns without a flip (NO FLIP).'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <span className="text-[11px] font-semibold">Has Flip</span>
          <ToggleSwitch
            checked={currentShot.car.snapToGround ? true : hasFlip}
            onCheckedChange={(checked) => {
              onFocusCarCamera();
              onMutateShot((d) => {
                d.car.hasFlip = checked;
                if (!checked && d.car.snapToGround) {
                  d.car.snapToGround = false;
                  if (d.car.location[2] < 45) {
                    d.car.location[2] = 120;
                  }
                }
              });
            }}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        {/* (f) Random Angular Velocity */}
        <div
          className={rowHoverClass}
          onMouseEnter={() =>
            onHoverDesc(
              currentShot.ball.randomAngularVelocity
                ? 'Random Angular Velocity: ON — Ball spin is automatically generated from launch speed.'
                : 'Random Angular Velocity: OFF — Manual 3-axis ball angular velocity (Pitch, Roll, Yaw rad/s).'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <span className="text-[11px] font-semibold">Random Angular Velocity</span>
          <ToggleSwitch
            checked={currentShot.ball.randomAngularVelocity}
            onCheckedChange={(checked) => {
              onFocusBallCamera();
              onMutateShot((d) => {
                d.ball.randomAngularVelocity = checked;
              });
            }}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        {/* Manual Angular Velocity Sliders (when Random Angular Velocity is OFF) */}
        {!currentShot.ball.randomAngularVelocity && (
          <div className="flex flex-col gap-1 pt-1 border-t border-neutral-500/15">
            <CompactNumberSlider
              label="AngVel X (Pitch)"
              value={currentShot.ball.angularVelocity[0]}
              min={-6}
              max={6}
              step={0.1}
              unit=" r/s"
              description="Ball Angular Velocity X-axis (Pitch spin in rad/s, -6 to +6)."
              onHoverDesc={onHoverDesc}
              onChange={(v) => {
                onFocusBallCamera();
                onMutateShot((d) => {
                  d.ball.angularVelocity[0] = Number(v.toFixed(2));
                });
              }}
              isLight={isLight}
            />
            <CompactNumberSlider
              label="AngVel Y (Roll)"
              value={currentShot.ball.angularVelocity[1]}
              min={-6}
              max={6}
              step={0.1}
              unit=" r/s"
              description="Ball Angular Velocity Y-axis (Roll spin in rad/s, -6 to +6)."
              onHoverDesc={onHoverDesc}
              onChange={(v) => {
                onFocusBallCamera();
                onMutateShot((d) => {
                  d.ball.angularVelocity[1] = Number(v.toFixed(2));
                });
              }}
              isLight={isLight}
            />
            <CompactNumberSlider
              label="AngVel Z (Yaw)"
              value={currentShot.ball.angularVelocity[2]}
              min={-6}
              max={6}
              step={0.1}
              unit=" r/s"
              description="Ball Angular Velocity Z-axis (Yaw side-spin in rad/s, -6 to +6)."
              onHoverDesc={onHoverDesc}
              onChange={(v) => {
                onFocusBallCamera();
                onMutateShot((d) => {
                  d.ball.angularVelocity[2] = Number(v.toFixed(2));
                });
              }}
              isLight={isLight}
            />
          </div>
        )}

        {/* (g) Show Advanced */}
        <div
          className={`${rowHoverClass} border-t border-neutral-500/15 pt-1.5 mt-0.5`}
          onMouseEnter={() =>
            onHoverDesc(
              'Show Advanced: Reveal exact 3D coordinates (X/Y/Z), orientation angles, launch speeds, and Kickoff Freeze state.'
            )
          }
          onMouseLeave={() => onHoverDesc(null)}
        >
          <span className="text-[11px] font-semibold">Show Advanced</span>
          <ToggleSwitch
            checked={showAdvanced}
            onCheckedChange={onToggleShowAdvanced}
            isLight={isLight}
            variant="neutral"
          />
        </div>
      </div>
    );
  }
);
StaticTrainingShotKinematicsCard.displayName = 'StaticTrainingShotKinematicsCard';
