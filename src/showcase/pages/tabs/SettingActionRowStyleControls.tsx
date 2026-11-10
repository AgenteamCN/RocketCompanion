import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { useSettingActionRowStore } from '../../../ui-core/stores/settingRowStore';

export interface SettingActionRowStyleControlsProps {
  isLight: boolean;
}

export const SettingActionRowStyleControls: React.FC<SettingActionRowStyleControlsProps> = ({
  isLight,
}) => {
  const {
    paddingX,
    paddingY,
    rowGap,
    borderRadius,
    iconSize,
    iconGap,
    titleFontSize,
    descriptionFontSize,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
    underDevelopmentTopMargin,
    setToken,
  } = useSettingActionRowStore();

  return (
    <>
      {/* Group 1: Typography & Icon Geometry */}
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
          1 · Unified font and icon size for four pages (Gameplay / Audio / Display / Advanced Global Uniform Title font size)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SliderControl
            label="Unified main title font size (titleFontSize)"
            value={titleFontSize}
            min={11}
            max={22}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('titleFontSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Right button font size (buttonFontSize)"
            value={buttonFontSize}
            min={10}
            max={18}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('buttonFontSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Subtitle Font Size (descriptionFontSize)"
            value={descriptionFontSize}
            min={9}
            max={16}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('descriptionFontSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="left SVG icon size (iconSize)"
            value={iconSize}
            min={12}
            max={36}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('iconSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Icon and title horizontal spacing (iconGap)"
            value={iconGap}
            min={4}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('iconGap', v)}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Group 2: Row & Hover Box Spacing + Concentric Radii */}
      <div className="flex flex-col gap-3 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-500">
            2 · Row Padding, Hover Concentric rounded corners and right-side control alignment boundary (paddingX Determines alignment for all right-side switches)
          </span>
          <span className="text-[11px] font-mono text-neutral-400">
            Tooltip: UI Safe Area and Developer Settings Share Same paddingX ({paddingX}px), Right-side switch perfectly aligned
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SliderControl
            label="Row Horizontal Padding (paddingX · Determine right-side switch alignment)"
            value={paddingX}
            min={0}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => setToken('paddingX', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Row Vertical Padding (paddingY · Element self-spacing)"
            value={paddingY}
            min={-4}
            max={20}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => setToken('paddingY', v)}
            isLight={isLight}
          />
          <SliderControl
            label="External row-to-row spacing (rowGap · 0=No Dead Zone)"
            value={rowGap}
            min={0}
            max={16}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => setToken('rowGap', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Hover Background/Outer Corner Radius (borderRadius)"
            value={borderRadius}
            min={0}
            max={20}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('borderRadius', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Configure Button Corner Radius (buttonRadius)"
            value={buttonRadius}
            min={0}
            max={16}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('buttonRadius', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Configure Button Horizontal Padding (buttonPaddingX)"
            value={buttonPaddingX}
            min={4}
            max={24}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => setToken('buttonPaddingX', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Configure Button Vertical Padding (buttonPaddingY)"
            value={buttonPaddingY}
            min={1}
            max={14}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => setToken('buttonPaddingY', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Under Development Extra Top Spacing (underDevelopmentTopMargin)"
            value={underDevelopmentTopMargin}
            min={0}
            max={24}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="rose"
            onChange={(v) => setToken('underDevelopmentTopMargin', v)}
            isLight={isLight}
          />
        </div>
      </div>
    </>
  );
};
