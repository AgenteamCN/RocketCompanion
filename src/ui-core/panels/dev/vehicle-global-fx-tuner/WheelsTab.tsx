import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { DEFAULT_WHEEL_MODIFIER_CONFIG } from '../../../config/vehicleTunerConfig';

export interface WheelsTabProps {
  wheelConfig: typeof DEFAULT_WHEEL_MODIFIER_CONFIG;
  applyWheelPatch: (patch: Partial<typeof DEFAULT_WHEEL_MODIFIER_CONFIG>) => void;
  isLight: boolean;
  cardClass: string;
}

export const WheelsTab: React.FC<WheelsTabProps> = ({
  wheelConfig,
  applyWheelPatch,
  isLight,
  cardClass,
}) => {
  const outerPct = wheelConfig.outerRimRadiusPct ?? 80;
  const innerFollowsOuter = wheelConfig.innerRimFollowsOuter !== false;
  const innerPct = innerFollowsOuter ? outerPct : (wheelConfig.innerRimRadiusPct ?? outerPct);

  return (
    <div className="flex flex-col gap-2.5">
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-bold text-[11px] text-amber-500">
              1. Wheel Mesh Modifier (Default vs Solid 3-Face Cylinder)
            </span>
            <span className="text-[10px] opacity-70">
              Customize cylinder thickness (width), Outer/Inner circular rim faces &amp; cylindrical tire tread
            </span>
          </div>
          <button
            type="button"
            onClick={() => applyWheelPatch({ ...DEFAULT_WHEEL_MODIFIER_CONFIG })}
            className="text-[10px] px-2 py-0.5 rounded border border-neutral-600/50 hover:bg-neutral-500/15 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset</span>
          </button>
        </div>

        <SegmentedSwitch
          value={wheelConfig.mode}
          onValueChange={(mode) => applyWheelPatch({ mode: mode as 'default' | 'solid-cylinder' })}
          options={[
            { value: 'default', label: 'Default Sport Wheel' },
            { value: 'solid-cylinder', label: 'Solid 3-Face Cylinder' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />

        <SliderControl
          label="Wheel Cylinder Thickness / Width"
          description="Width of the wheel cylinder along the axle in Unreal Units (Default: 6.0 uu)"
          value={wheelConfig.width ?? 6.0}
          min={1.5}
          max={26.0}
          step={0.5}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(width) => applyWheelPatch({ width })}
          isLight={isLight}
        />

        <SliderControl
          label="Global Wheel Radius Multiplier"
          value={wheelConfig.radiusScale ?? 1.0}
          min={0.6}
          max={1.6}
          step={0.02}
          unit="x"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(radiusScale) => applyWheelPatch({ radiusScale })}
          isLight={isLight}
        />

        {wheelConfig.mode === 'solid-cylinder' && (
          <>
            <div className="flex flex-col gap-2 pt-2 border-t border-neutral-700/40">
              <span className="font-bold text-[11px] text-amber-400">
                1A. Outer Circular Face (Inside {outerPct}% Boundary - Wheel Rim, Remaining {Math.max(0, 100 - outerPct)}% Follows Tire Tread)
              </span>

              <SliderControl
                label="Outer Rim Boundary (% of Circular Face Radius)"
                description="Inside boundary uses Wheel Rim material; remaining outer ring follows Tire Tread"
                value={outerPct}
                min={0}
                max={100}
                step={1}
                unit="%"
                editable={true}
                allowOutOfBoundsInput={false}
                usePrecisionContext={true}
                onChange={(outerRimRadiusPct) => applyWheelPatch({ outerRimRadiusPct })}
                isLight={isLight}
              />

              <TunerColorRow
                label="Outer Circular Face Color (Inside Boundary %)"
                value={wheelConfig.outerColor || '#737373'}
                onChange={(outerColor) => applyWheelPatch({ outerColor })}
                isLight={isLight}
              />

              <div className="flex flex-col gap-1 pt-0.5">
                <span className="font-semibold text-[11px]">Outer Circular Face Shading Mode</span>
                <SegmentedSwitch
                  value={wheelConfig.sideShaderMode || wheelConfig.shaderMode || 'standard'}
                  onValueChange={(sideShaderMode) =>
                    applyWheelPatch({ sideShaderMode: sideShaderMode as 'standard' | 'toon' | 'basic' })
                  }
                  options={[
                    { value: 'standard', label: 'Standard PBR' },
                    { value: 'toon', label: 'Toon Cel' },
                    { value: 'basic', label: 'Unlit Flat' },
                  ]}
                  size="sm"
                  fullWidth
                  isLight={isLight}
                />
              </div>

              {(wheelConfig.sideShaderMode || wheelConfig.shaderMode || 'standard') === 'standard' && (
                <>
                  <SliderControl
                    label="Outer Circular Face Roughness"
                    value={wheelConfig.sideRoughness ?? 0.5}
                    min={0}
                    max={1}
                    step={0.02}
                    editable={true}
                    usePrecisionContext={true}
                    onChange={(sideRoughness) => applyWheelPatch({ sideRoughness })}
                    isLight={isLight}
                  />
                  <SliderControl
                    label="Outer Circular Face Metalness"
                    value={wheelConfig.sideMetalness ?? 0.7}
                    min={0}
                    max={1}
                    step={0.02}
                    editable={true}
                    usePrecisionContext={true}
                    onChange={(sideMetalness) => applyWheelPatch({ sideMetalness })}
                    isLight={isLight}
                  />
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-neutral-700/40">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[11px] text-sky-400">
                  1B. Inner Circular Face (Inside {innerPct}% Boundary - Wheel Rim)
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium opacity-80">Follow Outer Face</span>
                  <ToggleSwitch
                    checked={innerFollowsOuter}
                    onChange={(checked) => applyWheelPatch({ innerRimFollowsOuter: checked })}
                    isLight={isLight}
                  />
                </div>
              </div>

              {innerFollowsOuter ? (
                <div className="text-[10px] font-mono opacity-70 px-2 py-1 rounded border border-neutral-500/20">
                  Synced with Outer Circular Face ({outerPct}% Rim / Remaining {Math.max(0, 100 - outerPct)}% ring follows Tire Tread)
                </div>
              ) : (
                <>
                  <SliderControl
                    label="Inner Rim Boundary (% of Circular Face Radius)"
                    description="Inside boundary uses Inner Rim material; remaining outer ring follows Tire Tread"
                    value={wheelConfig.innerRimRadiusPct ?? outerPct}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    editable={true}
                    allowOutOfBoundsInput={false}
                    usePrecisionContext={true}
                    onChange={(innerRimRadiusPct) => applyWheelPatch({ innerRimRadiusPct })}
                    isLight={isLight}
                  />

                  <TunerColorRow
                    label="Inner Circular Face Color (Inside Boundary %)"
                    value={wheelConfig.innerRimColor || wheelConfig.outerColor || '#737373'}
                    onChange={(innerRimColor) => applyWheelPatch({ innerRimColor })}
                    isLight={isLight}
                  />

                  <div className="flex flex-col gap-1 pt-0.5">
                    <span className="font-semibold text-[11px]">Inner Circular Face Shading Mode</span>
                    <SegmentedSwitch
                      value={wheelConfig.innerRimShaderMode || wheelConfig.sideShaderMode || 'standard'}
                      onValueChange={(innerRimShaderMode) =>
                        applyWheelPatch({
                          innerRimShaderMode: innerRimShaderMode as 'standard' | 'toon' | 'basic',
                        })
                      }
                      options={[
                        { value: 'standard', label: 'Standard PBR' },
                        { value: 'toon', label: 'Toon Cel' },
                        { value: 'basic', label: 'Unlit Flat' },
                      ]}
                      size="sm"
                      fullWidth
                      isLight={isLight}
                    />
                  </div>

                  {(wheelConfig.innerRimShaderMode || wheelConfig.sideShaderMode || 'standard') === 'standard' && (
                    <>
                      <SliderControl
                        label="Inner Circular Face Roughness"
                        value={wheelConfig.innerRimRoughness ?? wheelConfig.sideRoughness ?? 0.5}
                        min={0}
                        max={1}
                        step={0.02}
                        editable={true}
                        usePrecisionContext={true}
                        onChange={(innerRimRoughness) => applyWheelPatch({ innerRimRoughness })}
                        isLight={isLight}
                      />
                      <SliderControl
                        label="Inner Circular Face Metalness"
                        value={wheelConfig.innerRimMetalness ?? wheelConfig.sideMetalness ?? 0.7}
                        min={0}
                        max={1}
                        step={0.02}
                        editable={true}
                        usePrecisionContext={true}
                        onChange={(innerRimMetalness) => applyWheelPatch({ innerRimMetalness })}
                        isLight={isLight}
                      />
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-neutral-700/40">
              <span className="font-bold text-[11px] text-emerald-400">
                1C. Tire Tread (Cylindrical Barrel Surface &amp; Remaining {Math.max(0, 100 - outerPct)}% Sidewall Ring)
              </span>

              <TunerColorRow
                label="Tire Tread Color"
                value={wheelConfig.treadColor || wheelConfig.innerColor || '#000000'}
                onChange={(treadColor) => applyWheelPatch({ treadColor, innerColor: treadColor })}
                isLight={isLight}
              />

              <div className="flex flex-col gap-1 pt-0.5">
                <span className="font-semibold text-[11px]">Tire Tread Shading Mode</span>
                <SegmentedSwitch
                  value={wheelConfig.treadShaderMode || wheelConfig.innerShaderMode || wheelConfig.shaderMode || 'standard'}
                  onValueChange={(treadShaderMode) => {
                    const mode = treadShaderMode as 'standard' | 'toon' | 'basic';
                    applyWheelPatch({ treadShaderMode: mode, innerShaderMode: mode });
                  }}
                  options={[
                    { value: 'standard', label: 'Standard PBR' },
                    { value: 'toon', label: 'Toon Cel' },
                    { value: 'basic', label: 'Unlit Flat' },
                  ]}
                  size="sm"
                  fullWidth
                  isLight={isLight}
                />
              </div>

              {(wheelConfig.treadShaderMode || wheelConfig.innerShaderMode || wheelConfig.shaderMode || 'standard') === 'standard' && (
                <>
                  <SliderControl
                    label="Tire Tread Roughness"
                    value={wheelConfig.treadRoughness ?? wheelConfig.innerRoughness ?? 1.0}
                    min={0}
                    max={1}
                    step={0.02}
                    editable={true}
                    usePrecisionContext={true}
                    onChange={(treadRoughness) =>
                      applyWheelPatch({ treadRoughness, innerRoughness: treadRoughness })
                    }
                    isLight={isLight}
                  />
                  <SliderControl
                    label="Tire Tread Metalness"
                    value={wheelConfig.treadMetalness ?? wheelConfig.innerMetalness ?? 0.0}
                    min={0}
                    max={1}
                    step={0.02}
                    editable={true}
                    usePrecisionContext={true}
                    onChange={(treadMetalness) =>
                      applyWheelPatch({ treadMetalness, innerMetalness: treadMetalness })
                    }
                    isLight={isLight}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
