import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  useCameraSettingsStyleStore,
  type CameraResetButtonMode,
  type CameraResetButtonStyle,
  type CameraResetButtonWidthMode,
  type CameraResetConfirmMode,
} from '../../../ui-core/stores/cameraSettingsStyleStore';

export interface CameraSettingsResetSectionProps {
  isLight: boolean;
  sectionCardClass: string;
}

export const CameraSettingsResetSection: React.FC<
  CameraSettingsResetSectionProps
> = ({ isLight, sectionCardClass }) => {
  const store = useCameraSettingsStyleStore();

  return (
    <div className={sectionCardClass}>
      <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <RotateCcw className="h-3.5 w-3.5 text-rose-500" />
          <span>5. Bottom Reset Large button and red Dialogue</span>
        </span>
        <Badge variant="danger" size="sm" isLight={isLight}>
          Double-Check Reset
        </Badge>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Reset Button Style (With Icon Large Button vs Traditional inline small button)
        </span>
        <SegmentedSwitch
          value={store.resetButtonMode}
          onValueChange={(v) => store.setParam('resetButtonMode', v as CameraResetButtonMode)}
          options={[
            { value: 'big-button', label: 'With Icon Standalone Large Button' },
            { value: 'compact-row', label: 'Traditional inline small button' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Red warning color scheme (resetButtonStyle)
        </span>
        <SegmentedSwitch
          value={store.resetButtonStyle}
          onValueChange={(v) =>
            store.setParam('resetButtonStyle', v as CameraResetButtonStyle)
          }
          options={[
            { value: 'danger-subtle', label: 'Soft Red Background' },
            { value: 'danger-solid', label: 'Solid Red Background' },
            { value: 'danger-outline', label: 'Red Outline' },
            { value: 'neutral-hover-danger', label: 'Red on Hover' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Large button horizontal width mode (resetButtonWidthMode)
        </span>
        <SegmentedSwitch
          value={store.resetButtonWidthMode}
          onValueChange={(v) =>
            store.setParam('resetButtonWidthMode', v as CameraResetButtonWidthMode)
          }
          options={[
            { value: 'spine-width', label: 'Align center axis width' },
            { value: 'full-width', label: '100% Full-width Large Button' },
            { value: 'centered-auto', label: 'Centered compact large button' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          Double-Check Confirmation method (Recommended Pop-up Red Dialogue)
        </span>
        <SegmentedSwitch
          value={store.resetConfirmMode}
          onValueChange={(v) =>
            store.setParam('resetConfirmMode', v as CameraResetConfirmMode)
          }
          options={[
            { value: 'dialogue', label: 'Pop-up Red Dialogue (recommended)' },
            { value: 'inline-two-step', label: 'Secondary click confirmation' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SliderControl
          label="Large Button Height"
          min={30}
          max={52}
          step={2}
          value={store.resetButtonHeightPx}
          unit="px"
          showStepper={false}
          onChange={(v) => store.setParam('resetButtonHeightPx', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Large Button Corner Radius"
          min={4}
          max={20}
          step={1}
          value={store.resetButtonRadiusPx}
          unit="px"
          showStepper={false}
          onChange={(v) => store.setParam('resetButtonRadiusPx', v)}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
