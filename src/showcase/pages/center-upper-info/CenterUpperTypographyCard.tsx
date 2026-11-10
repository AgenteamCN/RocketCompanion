import React from 'react';
import { RotateCcw, Sliders } from 'lucide-react';
import { DEFAULT_CENTER_UPPER_TYPOGRAPHY } from '../../../ui-core/hud/centerUpperInfoDefaults';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { useCenterUpperSyncedState } from './useCenterUpperSyncedState';

export interface CenterUpperTypographyCardProps {
  isLight: boolean;
}

export const CenterUpperTypographyCard: React.FC<CenterUpperTypographyCardProps> = ({
  isLight,
}) => {
  const { typoConfig, setTypoConfig, setIsVisibleOnStage } = useCenterUpperSyncedState();

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
            3. Font hierarchy tuning (JetBrains Mono)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setTypoConfig({ ...DEFAULT_CENTER_UPPER_TYPOGRAPHY });
            setIsVisibleOnStage(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      <SliderControl
        label="Primary Font Size (Main Thin Font Size)"
        description="For 3-2-1-GO, BLUE/ORANGE TEAM, WAITING FOR PLAYERS"
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
          Primary Font Weight (Main Font Weight · default Thin 100)
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
        label="Main text letter spacing (Main Letter Spacing · default 0)"
        value={typoConfig.mainLetterSpacingEm}
        min={-0.1}
        max={0.36}
        step={0.01}
        unit="em"
        editable
        allowOutOfBoundsInput
        formatValue={(v) => v.toFixed(2)}
        onChange={(v) => {
          setTypoConfig((prev) => ({
            ...prev,
            mainLetterSpacingEm: Number(v.toFixed(2)),
          }));
          setIsVisibleOnStage(true);
        }}
        isLight={isLight}
      />

      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3 flex flex-col gap-3">
        <SliderControl
          label="Top title font size (Top Regular Font Size)"
          description="For WINNER Or match status prefix"
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
            Top title font weight (Top Font Weight · default Regular 400)
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

        <SliderControl
          label="Top header letter spacing (Top Letter Spacing · default 0)"
          value={typoConfig.topLetterSpacingEm}
          min={-0.1}
          max={0.6}
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
          label="Vertical line spacing (Line Gap)"
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

        <div className="flex items-center justify-between pt-1">
          <ToggleSwitch
            label="Force Uppercase (Uppercase)"
            checked={typoConfig.uppercase}
            onCheckedChange={(v) => {
              setTypoConfig((prev) => ({ ...prev, uppercase: v }));
              setIsVisibleOnStage(true);
            }}
            isLight={isLight}
          />
          <ToggleSwitch
            label="Italic Motion (Italic)"
            checked={typoConfig.italic ?? false}
            onCheckedChange={(v) => {
              setTypoConfig((prev) => ({ ...prev, italic: v }));
              setIsVisibleOnStage(true);
            }}
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
};
