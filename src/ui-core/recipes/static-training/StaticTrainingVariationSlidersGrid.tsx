import React, { useEffect, useState } from 'react';
import type {
  StaticTrainingQuickVariationToggles,
  StaticTrainingVariationConfig,
} from '../../config/staticTrainingVariationTypes';
import { DualThumbRangeSliderRow } from './DualThumbRangeSliderRow';

export interface StaticTrainingVariationSlidersGridProps {
  isLight: boolean;
  isCustomEditable: boolean;
  toggles: StaticTrainingQuickVariationToggles;
  activeDisplayVar: StaticTrainingVariationConfig;
  onUpdateCustomVariation: (patch: Partial<StaticTrainingVariationConfig>) => void;
}

export const StaticTrainingVariationSlidersGrid: React.FC<
  StaticTrainingVariationSlidersGridProps
> = React.memo(
  ({
    isLight,
    isCustomEditable,
    toggles,
    activeDisplayVar,
    onUpdateCustomVariation,
  }) => {
    const [boostLimitText, setBoostLimitText] = useState<string>(() =>
      String(activeDisplayVar.boostLimitOverride ?? 100)
    );

    useEffect(() => {
      setBoostLimitText(String(activeDisplayVar.boostLimitOverride ?? 100));
    }, [activeDisplayVar.boostLimitOverride]);

    const commitBoostLimitText = () => {
      const parsed = Number.parseFloat(boostLimitText.trim());
      if (!Number.isFinite(parsed)) {
        setBoostLimitText(String(activeDisplayVar.boostLimitOverride ?? 100));
        return;
      }
      const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
      onUpdateCustomVariation({ boostLimitOverride: clamped });
      setBoostLimitText(String(clamped));
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 px-1">
            Ball Variance Modifiers {isCustomEditable ? '(Custom Sliders)' : '(Read-Only)'}
          </span>
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Ball Speed Modifier (%)"
            unit="%"
            step={0.1}
            sliderMin={-25}
            sliderMax={25}
            readOnly={!isCustomEditable}
            disabled={toggles.disableBallVariance}
            value={activeDisplayVar.ballSpeedModifierPct}
            onChange={(val) =>
              onUpdateCustomVariation({ ballSpeedModifierPct: val })
            }
          />
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Ball Location Modifier (XY, UU)"
            unit="UU"
            step={5}
            sliderMin={-500}
            sliderMax={500}
            readOnly={!isCustomEditable}
            disabled={toggles.disableBallVariance}
            value={activeDisplayVar.ballLocationModifierXY}
            onChange={(val) =>
              onUpdateCustomVariation({ ballLocationModifierXY: val })
            }
          />
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Ball Height Modifier (Z, UU)"
            unit="UU"
            step={5}
            sliderMin={-500}
            sliderMax={500}
            readOnly={!isCustomEditable}
            disabled={toggles.disableBallVariance}
            value={activeDisplayVar.ballHeightModifierZ}
            onChange={(val) =>
              onUpdateCustomVariation({ ballHeightModifierZ: val })
            }
          />
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Ball Trajectory Rotation (deg)"
            unit="deg"
            step={0.1}
            sliderMin={-20}
            sliderMax={20}
            readOnly={!isCustomEditable}
            disabled={toggles.disableBallVariance}
            value={activeDisplayVar.ballRotationModifierDeg}
            onChange={(val) =>
              onUpdateCustomVariation({ ballRotationModifierDeg: val })
            }
          />
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Ball Spin Modifier (rad/s)"
            unit="rad/s"
            step={0.1}
            sliderMin={-6}
            sliderMax={6}
            readOnly={!isCustomEditable}
            disabled={toggles.disableBallVariance}
            value={activeDisplayVar.ballSpinModifier}
            onChange={(val) =>
              onUpdateCustomVariation({ ballSpinModifier: val })
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 px-1">
            Vehicle & Boost Modifiers {isCustomEditable ? '(Custom Sliders)' : '(Read-Only)'}
          </span>
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Vehicle Starting Velocity (UU/s)"
            unit="UU/s"
            step={25}
            sliderMin={0}
            sliderMax={2300}
            readOnly={!isCustomEditable}
            disabled={toggles.disableVehicleVariance}
            value={activeDisplayVar.vehicleSpeedRange || [0, 0]}
            onChange={(val) =>
              onUpdateCustomVariation({
                vehicleSpeedRange: val[0] === 0 && val[1] === 0 ? null : val,
              })
            }
          />
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Vehicle Location Modifier (UU)"
            unit="UU"
            step={5}
            sliderMin={-600}
            sliderMax={600}
            readOnly={!isCustomEditable}
            disabled={toggles.disableVehicleVariance}
            value={activeDisplayVar.vehicleLocationModifier}
            onChange={(val) =>
              onUpdateCustomVariation({ vehicleLocationModifier: val })
            }
          />
          <DualThumbRangeSliderRow
            isLight={isLight}
            label="Vehicle Rotation Modifier (deg)"
            unit="deg"
            step={0.5}
            sliderMin={-45}
            sliderMax={45}
            readOnly={!isCustomEditable}
            disabled={toggles.disableVehicleVariance}
            value={activeDisplayVar.vehicleRotationModifierDeg}
            onChange={(val) =>
              onUpdateCustomVariation({ vehicleRotationModifierDeg: val })
            }
          />

          {/* Boost Limit Override */}
          {!isCustomEditable ? (
            <div
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                isLight
                  ? 'bg-neutral-100/70 border-neutral-200/90 text-neutral-800'
                  : 'bg-neutral-900/55 border-neutral-800/90 text-neutral-200'
              }`}
            >
              <span
                className={`text-[11px] font-medium ${
                  isLight ? 'text-neutral-700' : 'text-neutral-300'
                }`}
              >
                Boost Limit Override (0..100)
              </span>
              <span
                className={`px-2.5 py-0.5 rounded border font-mono text-[11px] font-bold ${
                  isLight
                    ? 'bg-white/90 border-neutral-200 text-amber-700'
                    : 'bg-neutral-950/90 border-neutral-800 text-amber-300'
                }`}
              >
                {activeDisplayVar.boostLimitOverride ?? 100}
              </span>
            </div>
          ) : (
            <div
              className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-lg border ${
                isLight
                  ? 'bg-white/80 border-neutral-200'
                  : 'bg-neutral-900/55 border-neutral-800/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold">
                  Boost Limit Override (sv_training_limitboost)
                </span>
                <span className="text-[10px] font-mono opacity-45">0 .. 100</span>
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={activeDisplayVar.boostLimitOverride ?? 100}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    onUpdateCustomVariation({ boostLimitOverride: v });
                  }}
                  className="flex-1 accent-cyan-400 cursor-pointer"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={boostLimitText}
                  onChange={(e) => setBoostLimitText(e.target.value)}
                  onBlur={commitBoostLimitText}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitBoostLimitText();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className={`w-[70px] px-2 py-1 rounded-md border font-mono text-[11px] font-bold text-center outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900 focus:border-cyan-500'
                      : 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-cyan-400'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Checkboxes: Force Spawn Vehicle on Ground & Force Unlimited Boost */}
          <div
            className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-lg border ${
              !isCustomEditable ? 'opacity-70 pointer-events-none' : ''
            } ${
              isLight
                ? 'bg-neutral-50 border-neutral-200/80'
                : 'bg-neutral-850/70 border-neutral-800'
            }`}
          >
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[11px] font-semibold">
                Force Spawn Vehicle on Ground
              </span>
              <input
                type="checkbox"
                disabled={!isCustomEditable}
                checked={activeDisplayVar.forceSpawnVehicleOnGround}
                onChange={(e) =>
                  onUpdateCustomVariation({
                    forceSpawnVehicleOnGround: e.target.checked,
                  })
                }
                className="h-3.5 w-3.5 accent-cyan-400 cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[11px] font-semibold">
                Force Unlimited Boost
              </span>
              <input
                type="checkbox"
                disabled={!isCustomEditable}
                checked={activeDisplayVar.forceUnlimitedBoost}
                onChange={(e) =>
                  onUpdateCustomVariation({
                    forceUnlimitedBoost: e.target.checked,
                  })
                }
                className="h-3.5 w-3.5 accent-cyan-400 cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }
);

StaticTrainingVariationSlidersGrid.displayName = 'StaticTrainingVariationSlidersGrid';
