import React, { useState } from 'react';
import {
  NotebookPen,
  Video,
  Crosshair,
  Volume2,
  SmilePlus,
  Palette,
} from 'lucide-react';
import { BounceSolidSvg } from '../../../ui-core/primitives/packagedSvgIcons';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { SettingActionRow } from '../../../ui-core/compounds/SettingActionRow';
import { SettingToggleRow } from '../../../ui-core/compounds/SettingToggleRow';
import { SettingSliderRow } from '../../../ui-core/compounds/SettingSliderRow';
import { SettingSegmentedRow } from '../../../ui-core/compounds/SettingSegmentedRow';
import { SettingPresetCustomRow } from '../../../ui-core/compounds/SettingPresetCustomRow';
import { SettingDeveloperStatusRow } from '../../../ui-core/compounds/SettingDeveloperStatusRow';
import { useSettingActionRowStore } from '../../../ui-core/stores/settingRowStore';

export interface SettingActionRowStandalonePreviewCardProps {
  isLight: boolean;
}

export const SettingActionRowStandalonePreviewCard: React.FC<
  SettingActionRowStandalonePreviewCardProps
> = ({ isLight }) => {
  const {
    paddingX,
    rowGap,
    titleFontSize,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
    trajectoryRowLayout,
    pacingPriorityControl,
  } = useSettingActionRowStore();

  const [perRowColorDemo, setPerRowColorDemo] = useState<string>('');
  const [demoBallCam, setDemoBallCam] = useState(true);
  const [demoTrajectory, setDemoTrajectory] = useState(true);
  const [demoVolume, setDemoVolume] = useState(80);
  const [demoPacing, setDemoPacing] = useState<
    'competitive' | 'balanced' | 'motion' | 'input-consistency'
  >('balanced');
  const [demoUiScaleVal, setDemoUiScaleVal] = useState(115);
  const [demoDevMode, setDemoDevMode] = useState(false);

  return (
    <div
      className={`p-4 rounded-xl border flex flex-col ${
        isLight
          ? 'bg-neutral-100/60 border-neutral-200/80'
          : 'bg-neutral-950/70 border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2 border-b border-neutral-200/60 dark:border-neutral-800/60">
        <span className="text-[11px] font-mono font-bold text-amber-500">
          live preview (Include All 5 Unified setting row prototype · Title Uniform {titleFontSize}
          px · Uniform right edge {paddingX}px)
        </span>
        <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
          <ToggleSwitch
            checked={demoDevMode}
            onCheckedChange={setDemoDevMode}
            label={demoDevMode ? 'Preview Mode: Developer Mode' : 'Preview Mode: User Mode'}
            variant="amber"
            isLight={isLight}
          />
          <span className="text-neutral-400">No.1Row iconColor:</span>
          {[
            { val: '', label: 'Default Gray' },
            { val: 'text-amber-500', label: 'amber' },
            { val: '#10b981', label: '#10b981' },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setPerRowColorDemo(opt.val)}
              className={`px-2 py-0.5 rounded border cursor-pointer ${
                perRowColorDemo === opt.val
                  ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                  : isLight
                  ? 'bg-white border-neutral-200 text-neutral-600'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col w-full" style={{ gap: `${rowGap}px` }}>
        <SettingActionRow
          icon={NotebookPen}
          iconColor={perRowColorDemo || undefined}
          title="Training Mode Configuration"
          description="Boost mode, goal barrier & car hitbox collision overlay"
          isLight={isLight}
        />
        <SettingActionRow
          icon={Video}
          title="Camera Settings"
          description="Field of view, distance, height, angle & tracking stiffness"
          isLight={isLight}
        />
        <SettingToggleRow
          icon={Crosshair}
          title="Ball Cam Indicator"
          description="Show directional indicator arrow when the ball is off-screen"
          checked={demoBallCam}
          onCheckedChange={setDemoBallCam}
          isLight={isLight}
        />
        <SettingActionRow
          icon={BounceSolidSvg}
          title="Ball Trajectory Predictor"
          description="Real-time physics path & bounce arc visualization in training"
          isLight={isLight}
          rightSlot={
            <div className="flex items-center gap-2.5">
              {trajectoryRowLayout === 'inline' && (
                <button
                  type="button"
                  disabled={!demoTrajectory}
                  style={{
                    fontSize: `${buttonFontSize}px`,
                    paddingLeft: `${buttonPaddingX}px`,
                    paddingRight: `${buttonPaddingX}px`,
                    paddingTop: `${buttonPaddingY}px`,
                    paddingBottom: `${buttonPaddingY}px`,
                    borderRadius: `${buttonRadius}px`,
                  }}
                  className={`inline-flex items-center font-semibold border transition-all ${
                    demoTrajectory
                      ? isLight
                        ? 'bg-white border-neutral-200/90 text-neutral-700 shadow-2xs cursor-pointer'
                        : 'bg-neutral-900 border-neutral-700/80 text-neutral-200 cursor-pointer'
                      : 'opacity-40 cursor-not-allowed border-transparent'
                  }`}
                >
                  Configure
                </button>
              )}
              <ToggleSwitch
                checked={demoTrajectory}
                onCheckedChange={setDemoTrajectory}
                variant="amber"
                isLight={isLight}
              />
            </div>
          }
        />
        <SettingSliderRow
          icon={Volume2}
          label="Master Volume"
          description="Overall game sound output level across all audio buses."
          value={demoVolume}
          min={0}
          max={100}
          step={1}
          unit="%"
          developerMode={demoDevMode}
          onChange={setDemoVolume}
          isLight={isLight}
        />
        <SettingSegmentedRow
          icon={SmilePlus}
          label="Experience Priority"
          description="Balance competitive responsiveness, frame motion, and input consistency."
          value={demoPacing}
          onChange={setDemoPacing}
          controlType={pacingPriorityControl === 'dropdown' ? 'dropdown' : 'segmented'}
          layout={pacingPriorityControl === 'segmented-stacked' ? 'stacked' : 'inline'}
          options={[
            { value: 'competitive', label: 'Competitive' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'motion', label: 'Motion' },
            { value: 'input-consistency', label: 'Input Consistency' },
            { value: 'custom', label: 'Custom' },
          ]}
          isLight={isLight}
        />
        <SettingPresetCustomRow
          icon={Palette}
          label="UI Scaling"
          description="Preset scales or smooth slide-reveal custom scale factor."
          value={demoUiScaleVal}
          presets={[
            { value: 100, label: '100%' },
            { value: 125, label: '125%' },
            { value: 150, label: '150%' },
          ]}
          defaultCustomValue={115}
          min={75}
          max={150}
          step={1}
          unit="%"
          onChange={setDemoUiScaleVal}
          isLight={isLight}
        />
        <SettingDeveloperStatusRow
          developerMode={demoDevMode}
          onDeveloperModeChange={setDemoDevMode}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
