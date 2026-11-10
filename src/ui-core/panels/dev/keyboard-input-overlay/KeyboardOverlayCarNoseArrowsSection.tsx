import React from 'react';
import { Box, Crosshair } from 'lucide-react';
import {
  TunerColorRow,
  TunerSegmentedControl,
} from '../../../compounds/TunerControls';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import {
  useKeyboardInputOverlayStore,
  type NoseArrowColorSource,
} from '../../../stores/keyboardInputOverlayStore';

export interface KeyboardOverlayCarNoseArrowsSectionProps {
  isLight?: boolean;
}

export const KeyboardOverlayCarNoseArrowsSection: React.FC<
  KeyboardOverlayCarNoseArrowsSectionProps
> = ({ isLight = false }) => {
  const {
    enableNoseArrowRendering,
    noseArrowColorSource,
    noseWCustomColor,
    noseACustomColor,
    noseSCustomColor,
    noseDCustomColor,
    noseForwardOffsetUu,
    noseVerticalOffsetUu,
    noseWArrowTotalLengthUu,
    noseAArrowTotalLengthUu,
    noseSArrowTotalLengthUu,
    noseDArrowTotalLengthUu,
    nosePressScaleMultiplier,
    noseConeLengthUu,
    noseConeRadiusUu,
    noseTipRadiusUu,
    noseShaftRadiusUu,
    noseArrowOpacity,
    noseShadowOpacity,
    noseShadowScale,
    noseHaloScaleUu,
    updateConfig,
  } = useKeyboardInputOverlayStore();

  const cardBg = isLight
    ? 'bg-neutral-100/80 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/70 border-neutral-800 text-neutral-100';

  return (
    <div className="flex flex-col gap-2.5">
      {/* 6. Master Toggle & Color Variation for 3D Car Nose Arrows */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <Box className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[11px] font-bold">
                Enable Arrow Rendering on the Nose of the Car
              </span>
              <span className="text-[10px] text-neutral-400">
                Hard-attach 4 orthogonal 3D arrows at the hitbox front face center (W=Bottom, S=Top, A=Left, D=Right)
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={enableNoseArrowRendering}
            onCheckedChange={(checked) =>
              updateConfig({ enableNoseArrowRendering: checked })
            }
            isLight={isLight}
          />
        </div>

        <TunerSegmentedControl<NoseArrowColorSource>
          label="Nose Arrow Color Synchronization Variation"
          description="Match WASD keycap background colors, match WASD arrow face colors, or specify custom 3D nose arrow colors"
          value={noseArrowColorSource}
          options={[
            { value: 'key-bg', label: 'Match WASD Key BG' },
            { value: 'arrow-color', label: 'Match WASD Arrow' },
            { value: 'custom', label: 'Custom 4-Way' },
          ]}
          onChange={(val) => updateConfig({ noseArrowColorSource: val })}
          isLight={isLight}
        />

        {noseArrowColorSource === 'custom' && (
          <div className="grid grid-cols-1 gap-1.5 pt-0.5">
            <TunerColorRow
              label="Nose W Arrow Color (Pointing to Car Bottom -Z)"
              value={noseWCustomColor}
              onChange={(hex) => updateConfig({ noseWCustomColor: hex })}
              isLight={isLight}
            />
            <TunerColorRow
              label="Nose A Arrow Color (Pointing to Car Left -Y)"
              value={noseACustomColor}
              onChange={(hex) => updateConfig({ noseACustomColor: hex })}
              isLight={isLight}
            />
            <TunerColorRow
              label="Nose S Arrow Color (Pointing to Car Top +Z)"
              value={noseSCustomColor}
              onChange={(hex) => updateConfig({ noseSCustomColor: hex })}
              isLight={isLight}
            />
            <TunerColorRow
              label="Nose D Arrow Color (Pointing to Car Right +Y)"
              value={noseDCustomColor}
              onChange={(hex) => updateConfig({ noseDCustomColor: hex })}
              isLight={isLight}
            />
          </div>
        )}
      </div>

      {/* 7. 3D Car Nose Arrow Geometry & Silhouette Shadow Parameters (Custom Training Pack Style) */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              6. 3D Car Nose Arrow Geometry &amp; Shading
            </span>
          </div>
          <span className="text-[10px] font-mono opacity-60">Hitbox Front Anchor</span>
        </div>

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Nose Anchor Forward Offset (From Hitbox Front Face)"
          unit="UU"
          value={noseForwardOffsetUu}
          min={-60}
          max={120}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseForwardOffsetUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Nose Anchor Vertical Offset (Car Roof +Z / Bottom -Z)"
          unit="UU"
          value={noseVerticalOffsetUu}
          min={-60}
          max={60}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseVerticalOffsetUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="W Arrow Total Length (Car Bottom -Z)"
          unit="UU"
          value={noseWArrowTotalLengthUu}
          min={10}
          max={220}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseWArrowTotalLengthUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="A Arrow Total Length (Car Left -Y)"
          unit="UU"
          value={noseAArrowTotalLengthUu}
          min={10}
          max={220}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseAArrowTotalLengthUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="S Arrow Total Length (Car Top +Z)"
          unit="UU"
          value={noseSArrowTotalLengthUu}
          min={10}
          max={220}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseSArrowTotalLengthUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="D Arrow Total Length (Car Right +Y)"
          unit="UU"
          value={noseDArrowTotalLengthUu}
          min={10}
          max={220}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseDArrowTotalLengthUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="emerald"
          label="Key-Press Scale Multiplier (Cone & Arrow Expansion)"
          unit="x"
          value={nosePressScaleMultiplier}
          min={0.5}
          max={2.5}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ nosePressScaleMultiplier: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Cone Tip Length"
          unit="UU"
          value={noseConeLengthUu}
          min={4}
          max={100}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseConeLengthUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Cone Base Radius (Head Thickness)"
          unit="UU"
          value={noseConeRadiusUu}
          min={1}
          max={40}
          step={0.5}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseConeRadiusUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Tip Rounding Radius"
          unit="UU"
          value={noseTipRadiusUu}
          min={0}
          max={12}
          step={0.25}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseTipRadiusUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Shaft Cylinder Radius (Stem Thickness)"
          unit="UU"
          value={noseShaftRadiusUu}
          min={0.5}
          max={20}
          step={0.25}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseShaftRadiusUu: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Arrow Body Opacity"
          unit=""
          value={noseArrowOpacity}
          min={0.05}
          max={1.0}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseArrowOpacity: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Silhouette Shadow Shell Opacity"
          unit=""
          value={noseShadowOpacity}
          min={0.0}
          max={0.95}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseShadowOpacity: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Silhouette Shadow Shell Thickness"
          unit="x"
          value={noseShadowScale}
          min={1.02}
          max={1.6}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseShadowScale: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Contrast Halo Backdrop Size"
          unit="UU"
          value={noseHaloScaleUu}
          min={0}
          max={140}
          step={2}
          isLight={isLight}
          onChange={(v) => updateConfig({ noseHaloScaleUu: v })}
        />
      </div>
    </div>
  );
};

KeyboardOverlayCarNoseArrowsSection.displayName =
  'KeyboardOverlayCarNoseArrowsSection';
export default KeyboardOverlayCarNoseArrowsSection;
