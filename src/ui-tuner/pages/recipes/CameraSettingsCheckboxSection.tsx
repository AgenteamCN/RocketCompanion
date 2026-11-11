import React, { useState } from 'react';
import { CheckSquare, Eye } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { Checkbox } from '../../../ui-core/primitives/Checkbox';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  useCameraSettingsStyleStore,
  type CameraBooleanControlType,
  type CameraCheckboxPlacement,
  type CameraCheckboxColorVariant,
  type CameraCheckboxIconStyle,
  type CameraCheckboxAnimStyle,
} from '../../../ui-core/stores/cameraSettingsStyleStore';

export interface CameraSettingsCheckboxSectionProps {
  isLight: boolean;
  sectionCardClass: string;
}

export const CameraSettingsCheckboxSection: React.FC<
  CameraSettingsCheckboxSectionProps
> = ({ isLight, sectionCardClass }) => {
  const store = useCameraSettingsStyleStore();
  const [demoCheckboxA, setDemoCheckboxA] = useState(true);
  const [demoCheckboxB, setDemoCheckboxB] = useState(false);
  const [demoCheckboxC, setDemoCheckboxC] = useState(true);

  return (
    <>
      {/* 4. Checkbox Component & Placement Variations */}
      <div className={sectionCardClass}>
        <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
          <span className="text-xs font-bold flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5 text-amber-500" />
            <span>4. Checkbox Layout and independent effects</span>
          </span>
          <Badge variant="amber" size="sm" isLight={isLight}>
            Checkbox Primitive
          </Badge>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Boolean toggle control type (Invert Swivel / Camera Shake)
          </span>
          <SegmentedSwitch
            value={store.booleanControlType}
            onValueChange={(v) =>
              store.setParam('booleanControlType', v as CameraBooleanControlType)
            }
            options={[
              { value: 'checkbox', label: 'Checkbox (New Checkbox)' },
              { value: 'toggle-switch', label: 'ToggleSwitch (Legacy Switch)' },
            ]}
            size="sm"
            fullWidth
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Checkbox Layout Position (Centered vs Isolate special forms)
          </span>
          <SegmentedSwitch
            value={store.checkboxPlacement}
            onValueChange={(v) =>
              store.setParam('checkboxPlacement', v as CameraCheckboxPlacement)
            }
            options={[
              { value: 'spine-left', label: 'Center Left Aligned' },
              { value: 'spine-center', label: 'Slider Column Centered' },
              { value: 'centered-cluster', label: 'Side-by-Side Centered' },
              { value: 'detached-card', label: 'Independent Group Box' },
            ]}
            size="sm"
            fullWidth
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Checkbox Active Color Scheme (checkboxVariant)
          </span>
          <SegmentedSwitch
            value={store.checkboxVariant}
            onValueChange={(v) =>
              store.setParam('checkboxVariant', v as CameraCheckboxColorVariant)
            }
            options={[
              { value: 'amber', label: 'Amber' },
              { value: 'neutral', label: 'Monochrome' },
              { value: 'sky', label: 'Sky Blue' },
              { value: 'emerald', label: 'Emerald' },
              { value: 'rose', label: 'Rose Pink' },
            ]}
            size="sm"
            fullWidth
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SliderControl
            label="Checkbox size"
            min={14}
            max={26}
            step={1}
            value={store.checkboxSizePx}
            unit="px"
            showStepper={false}
            onChange={(v) => store.setParam('checkboxSizePx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Checkbox corner radius"
            min={0}
            max={12}
            step={1}
            value={store.checkboxRadiusPx}
            unit="px"
            showStepper={false}
            onChange={(v) => store.setParam('checkboxRadiusPx', v)}
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Checkbox Checkbox icon style and animation
          </span>
          <div className="grid grid-cols-2 gap-2">
            <SegmentedSwitch
              value={store.checkboxIconStyle}
              onValueChange={(v) =>
                store.setParam('checkboxIconStyle', v as CameraCheckboxIconStyle)
              }
              options={[
                { value: 'check', label: 'Checkmark' },
                { value: 'bold-check', label: 'Bold Checkmark' },
                { value: 'dot', label: 'Solid Dot' },
              ]}
              size="sm"
              fullWidth
              isLight={isLight}
            />
            <SegmentedSwitch
              value={store.checkboxAnimationStyle}
              onValueChange={(v) =>
                store.setParam('checkboxAnimationStyle', v as CameraCheckboxAnimStyle)
              }
              options={[
                { value: 'spring-scale', label: 'Scale' },
                { value: 'bounce', label: 'Rebound' },
                { value: 'crisp-fade', label: 'Instant Show' },
              ]}
              size="sm"
              fullWidth
              isLight={isLight}
            />
          </div>
        </div>

        <ToggleSwitch
          checked={store.checkboxShowStatusText}
          onCheckedChange={(v) => store.setParam('checkboxShowStatusText', v)}
          label="in Checkbox Display on the right On / Off Status Text"
          isLight={isLight}
        />
      </div>

      {/* 6. Standalone L1 Checkbox Atomic Playground */}
      <div className={sectionCardClass}>
        <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
          <span className="text-xs font-bold flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-emerald-500" />
            <span>6. New Component L1 Checkbox Isolated Interaction Sandbox</span>
          </span>
          <Badge variant="neutral" size="sm" isLight={isLight}>
            src/ui-core/primitives/Checkbox.tsx
          </Badge>
        </div>

        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Real-time display of newly extracted atomic components below <code className="font-mono">Checkbox</code> In Different Sizes, corner radius, Independent representation for outline and semi-selected states: 
        </p>

        <div
          className={`p-3 rounded-xl border flex flex-col gap-3 ${
            isLight
              ? 'bg-white border-neutral-200'
              : 'bg-neutral-900/90 border-neutral-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox
              checked={demoCheckboxA}
              onCheckedChange={setDemoCheckboxA}
              label="Invert Swivel (Current Style)"
              variant={store.checkboxVariant}
              size={store.checkboxSizePx}
              radiusPx={store.checkboxRadiusPx}
              strokeWidth={store.checkboxStrokeWidth}
              iconStyle={store.checkboxIconStyle}
              animationStyle={store.checkboxAnimationStyle}
              isLight={isLight}
            />
            <Badge variant={demoCheckboxA ? 'amber' : 'neutral'} size="sm" isLight={isLight}>
              {demoCheckboxA ? 'Checked' : 'Unchecked'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox
              checked={demoCheckboxB}
              onCheckedChange={setDemoCheckboxB}
              label="Camera Shake (Right-aligned Label)"
              labelPosition="left"
              variant={store.checkboxVariant}
              size={store.checkboxSizePx}
              radiusPx={store.checkboxRadiusPx}
              strokeWidth={store.checkboxStrokeWidth}
              iconStyle={store.checkboxIconStyle}
              animationStyle={store.checkboxAnimationStyle}
              isLight={isLight}
            />
            <Badge variant={demoCheckboxB ? 'amber' : 'neutral'} size="sm" isLight={isLight}>
              labelPosition="left"
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-neutral-200/60 dark:border-neutral-800">
            <Checkbox
              checked={demoCheckboxC}
              onCheckedChange={setDemoCheckboxC}
              variant="emerald"
              size="sm"
              label="16px sm"
              isLight={isLight}
            />
            <Checkbox
              checked={demoCheckboxC}
              onCheckedChange={setDemoCheckboxC}
              variant="sky"
              size="md"
              label="18px md"
              isLight={isLight}
            />
            <Checkbox
              checked={demoCheckboxC}
              onCheckedChange={setDemoCheckboxC}
              variant="rose"
              size="lg"
              label="22px lg"
              isLight={isLight}
            />
            <Checkbox
              checked={true}
              indeterminate={true}
              onCheckedChange={() => {}}
              variant="amber"
              size="md"
              label="Indeterminate"
              isLight={isLight}
            />
          </div>
        </div>
      </div>
    </>
  );
};
