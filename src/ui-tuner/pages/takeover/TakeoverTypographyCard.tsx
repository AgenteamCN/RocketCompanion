import React from 'react';
import { RotateCcw, Sliders } from 'lucide-react';
import type { CenterUpperTypographyConfig } from '../../../ui-core/hud/CenterUpperInfoHUD';
import { DEFAULT_TAKEOVER_TYPOGRAPHY } from '../../../ui-core/hud/takeoverCountdownDefaults';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';

export interface TakeoverTypographyCardProps {
  isLight: boolean;
  typoConfig: CenterUpperTypographyConfig;
  setTypoConfig: (
    val:
      | CenterUpperTypographyConfig
      | ((prev: CenterUpperTypographyConfig) => CenterUpperTypographyConfig)
  ) => void;
  setIsVisibleOnStage: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const TakeoverTypographyCard: React.FC<TakeoverTypographyCardProps> = ({
  isLight,
  typoConfig,
  setTypoConfig,
  setIsVisibleOnStage,
}) => {
  return (
    <div
      className={`p-5 rounded-3xl border flex flex-col gap-4 ${
        isLight
          ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
          : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-bold font-mono">
            4. Typography Hierarchy (`mainFontSizePx: 56`, `uppercase: false`)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setTypoConfig({ ...DEFAULT_TAKEOVER_TYPOGRAPHY });
            setIsVisibleOnStage(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      <SliderControl
        label="Bottom Countdown Digit Font Size (3 - 2 - 1, Default 56px)"
        value={typoConfig.mainFontSizePx}
        min={36}
        max={136}
        step={1}
        unit="px"
        editable
        allowOutOfBoundsInput
        onChange={(v) => {
          setTypoConfig((prev) => ({ ...prev, mainFontSizePx: v }));
          setIsVisibleOnStage(true);
        }}
        isLight={isLight}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">
          Bottom Countdown Font Weight (Default Thin 100)
        </span>
        <SegmentedSwitch
          size="sm"
          fullWidth
          isLight={isLight}
          value={String(typoConfig.mainFontWeight)}
          onValueChange={(v) => {
            setTypoConfig((prev) => ({
              ...prev,
              mainFontWeight: Number(v) as 100 | 200 | 300 | 400,
            }));
            setIsVisibleOnStage(true);
          }}
          options={[
            { value: '100', label: 'Thin (100)' },
            { value: '200', label: 'ExtraLight (200)' },
            { value: '300', label: 'Light (300)' },
            { value: '400', label: 'Regular (400)' },
          ]}
        />
      </div>

      <SliderControl
        label="Top Stationary Label Font Size (Takeover in..., Default 24px)"
        value={typoConfig.topFontSizePx}
        min={12}
        max={52}
        step={1}
        unit="px"
        editable
        allowOutOfBoundsInput
        onChange={(v) => {
          setTypoConfig((prev) => ({ ...prev, topFontSizePx: v }));
          setIsVisibleOnStage(true);
        }}
        isLight={isLight}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">
          Top Stationary Label Font Weight (Default Regular 400)
        </span>
        <SegmentedSwitch
          size="sm"
          fullWidth
          isLight={isLight}
          value={String(typoConfig.topFontWeight)}
          onValueChange={(v) => {
            setTypoConfig((prev) => ({
              ...prev,
              topFontWeight: Number(v) as 100 | 300 | 400 | 500,
            }));
            setIsVisibleOnStage(true);
          }}
          options={[
            { value: '100', label: 'Thin (100)' },
            { value: '300', label: 'Light (300)' },
            { value: '400', label: 'Regular (400)' },
            { value: '500', label: 'Medium (500)' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SliderControl
          label="Top Letter Spacing"
          value={typoConfig.topLetterSpacingEm}
          min={-0.08}
          max={0.5}
          step={0.01}
          unit="em"
          editable
          allowOutOfBoundsInput
          formatValue={(v) => v.toFixed(2)}
          onChange={(v) => {
            setTypoConfig((prev) => ({
              ...prev,
              topLetterSpacingEm: Number(v.toFixed(2)),
            }));
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
        <SliderControl
          label="Vertical Line Gap"
          value={typoConfig.lineGapPx}
          min={0}
          max={28}
          step={1}
          unit="px"
          editable
          allowOutOfBoundsInput
          onChange={(v) => {
            setTypoConfig((prev) => ({ ...prev, lineGapPx: v }));
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <ToggleSwitch
          label="Force Uppercase (Default OFF for 'Takeover in...')"
          checked={typoConfig.uppercase}
          onCheckedChange={(v) => {
            setTypoConfig((prev) => ({ ...prev, uppercase: v }));
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
        <ToggleSwitch
          label="Italic Motion"
          checked={typoConfig.italic ?? false}
          onCheckedChange={(v) => {
            setTypoConfig((prev) => ({ ...prev, italic: v }));
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
