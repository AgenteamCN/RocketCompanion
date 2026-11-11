import React from 'react';
import { Sparkles, AlignRight } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  useCameraSettingsStyleStore,
  CAMERA_SETTINGS_STYLE_PRESETS,
  type CameraSettingsPresetId,
  type CameraLabelTextAlign,
} from '../../../ui-core/stores/cameraSettingsStyleStore';

export interface CameraSettingsPresetBarProps {
  isLight: boolean;
}

export const CameraSettingsPresetBar: React.FC<CameraSettingsPresetBarProps> = ({ isLight }) => {
  const store = useCameraSettingsStyleStore();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Camera Settings Layout Presets (5 Variants):</span>
        </span>
        <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
          active: {CAMERA_SETTINGS_STYLE_PRESETS[store.preset]?.shortLabel ?? store.preset}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {(Object.keys(CAMERA_SETTINGS_STYLE_PRESETS) as CameraSettingsPresetId[]).map((presetKey) => {
          const p = CAMERA_SETTINGS_STYLE_PRESETS[presetKey];
          const isSelected = store.preset === presetKey;
          return (
            <button
              key={presetKey}
              type="button"
              onClick={() => store.applyPreset(presetKey)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                isSelected
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                  : isLight
                  ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-950/70 hover:bg-neutral-900 border-neutral-800 text-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold leading-snug">{p.shortLabel}</span>
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                )}
              </div>
              <span className="text-[10px] opacity-75 line-clamp-2 leading-relaxed">
                {p.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface CameraSettingsSpineAlignmentCardProps {
  isLight: boolean;
  sectionCardClass: string;
}

export const CameraSettingsSpineAlignmentCard: React.FC<
  CameraSettingsSpineAlignmentCardProps
> = ({ isLight, sectionCardClass }) => {
  const store = useCameraSettingsStyleStore();

  return (
    <div className={sectionCardClass}>
      <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <AlignRight className="h-3.5 w-3.5 text-amber-500" />
          <span>1. Central Spine Boundary &amp; Centered Geometry</span>
        </span>
        <Badge variant="amber" size="sm" isLight={isLight}>
          Spine &amp; Centering
        </Badge>
      </div>

      <ToggleSwitch
        checked={store.centerFormBlock}
        onCheckedChange={(v) => store.setParam('centerFormBlock', v)}
        label="Horizontally Center Form Block (Center Spine Block)"
        isLight={isLight}
      />

      <ToggleSwitch
        checked={store.showSpineGuideLine}
        onCheckedChange={(v) => store.setParam('showSpineGuideLine', v)}
        label="Show Left-Aligned Slider Spine Guide Line"
        isLight={isLight}
      />

      <ToggleSwitch
        checked={store.showRowHoverBg}
        onCheckedChange={(v) => store.setParam('showRowHoverBg', v)}
        label="Enable Row Hover Background Highlight"
        isLight={isLight}
      />

      <SliderControl
        label="Horizontal Block Offset (formOffsetX)"
        min={-60}
        max={60}
        step={2}
        value={store.formOffsetXPx}
        unit="px"
        variation="centered"
        origin={0}
        onChange={(v) => store.setParam('formOffsetXPx', v)}
        isLight={isLight}
      />

      <SliderControl
        label="Row Vertical Gap (rowGap)"
        min={0}
        max={12}
        step={1}
        value={store.rowGapPx}
        unit="px"
        onChange={(v) => store.setParam('rowGapPx', v)}
        isLight={isLight}
      />

      <SliderControl
        label="Row Vertical Padding (rowPaddingY)"
        min={2}
        max={14}
        step={1}
        value={store.rowPaddingYPx}
        unit="px"
        onChange={(v) => store.setParam('rowPaddingYPx', v)}
        isLight={isLight}
      />
    </div>
  );
};

export interface CameraSettingsLabelColumnCardProps {
  isLight: boolean;
  sectionCardClass: string;
}

export const CameraSettingsLabelColumnCard: React.FC<
  CameraSettingsLabelColumnCardProps
> = ({ isLight, sectionCardClass }) => {
  const store = useCameraSettingsStyleStore();

  return (
    <div className={sectionCardClass}>
      <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <AlignRight className="h-3.5 w-3.5 text-sky-500" />
          <span>2. Icon-Free Right-Aligned Label Column</span>
        </span>
        <Badge variant="primary" size="sm" isLight={isLight}>
          Right-to-Left Label
        </Badge>
      </div>

      <ToggleSwitch
        checked={store.showRowIcon}
        onCheckedChange={(v) => store.setParam('showRowIcon', v)}
        label="Show Leading Row Icon (Off by Default)"
        isLight={isLight}
      />

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Label Alignment (Right-Align to Slider Spine vs Left-Align)
        </span>
        <SegmentedSwitch
          value={store.labelTextAlign}
          onValueChange={(v) => store.setParam('labelTextAlign', v as CameraLabelTextAlign)}
          options={[
            { value: 'right', label: 'Right-Aligned (Snap to Spine)' },
            { value: 'left', label: 'Left-Aligned (Standard)' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      <SliderControl
        label="Label Column Width (labelColumnWidth)"
        min={110}
        max={210}
        step={2}
        value={store.labelColumnWidthPx}
        unit="px"
        onChange={(v) => store.setParam('labelColumnWidthPx', v)}
        isLight={isLight}
      />

      <SliderControl
        label="Label-to-Slider Gap (labelToControlGap)"
        min={6}
        max={32}
        step={1}
        value={store.labelToControlGapPx}
        unit="px"
        onChange={(v) => store.setParam('labelToControlGapPx', v)}
        isLight={isLight}
      />

      <SliderControl
        label="Label Font Size (labelFontSize)"
        min={11}
        max={16}
        step={1}
        value={store.labelFontSizePx}
        unit="px"
        onChange={(v) => store.setParam('labelFontSizePx', v)}
        isLight={isLight}
      />

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Label Font Weight (labelFontWeight)
        </span>
        <SegmentedSwitch
          value={String(store.labelFontWeight)}
          onValueChange={(v) => store.setParam('labelFontWeight', Number(v))}
          options={[
            { value: '400', label: '400' },
            { value: '500', label: '500' },
            { value: '600', label: '600' },
            { value: '700', label: '700' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>
    </div>
  );
};
