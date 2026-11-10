import React from 'react';
import { Compass, Maximize2 } from 'lucide-react';
import type {
  NameTagConfig,
  NameTagOffscreenAudience,
} from '../../../config/nameTagConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { NameTagAerialClimbAlertSection } from './NameTagAerialClimbAlertSection';
import { NameTagOffscreenCurveTunerSection } from './NameTagOffscreenCurveTunerSection';

export interface NameTagOffscreenAndAerialAlertSectionProps {
  isLight?: boolean;
  config?: NameTagConfig;
  updateConfig?: (partial: Partial<NameTagConfig>) => void;
  updatePreviewAerialClimbingFlag?: (index: number, climbing: boolean) => void;
}

const OFFSCREEN_AUDIENCE_OPTIONS: Array<{
  id: NameTagOffscreenAudience;
  label: string;
  desc: string;
}> = [
  {
    id: 'teammates',
    label: 'Teammates Only (Default)',
    desc: 'Show off-screen circle + arrow for teammates behind/outside FOV; hide opponents',
  },
  {
    id: 'all',
    label: 'All Cars (Blue + Orange)',
    desc: 'Show off-screen directional circle + arrow for both teammates and opponents',
  },
  {
    id: 'none',
    label: 'Hidden / Disabled',
    desc: 'Suppress all off-screen edge indicators',
  },
];

export const NameTagOffscreenAndAerialAlertSection: React.FC<
  NameTagOffscreenAndAerialAlertSectionProps
> = ({
  isLight = false,
  config: propConfig,
  updateConfig: propUpdateConfig,
  updatePreviewAerialClimbingFlag: propUpdateClimbingFlag,
}) => {
  const store = useNameTagTunerStore();
  const config = propConfig ?? store.config;
  const updateConfig = propUpdateConfig ?? store.updateConfig;
  const updatePreviewAerialClimbingFlag =
    propUpdateClimbingFlag ?? store.updatePreviewAerialClimbingFlag;

  const cardBackground = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const subCardBackground = isLight
    ? 'border-neutral-200 bg-neutral-100/75'
    : 'border-neutral-800 bg-neutral-900/50';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBackground}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Compass
            className={`h-3.5 w-3.5 ${isLight ? 'text-teal-600' : 'text-teal-400'}`}
          />
          <span>
            Off-Screen Edge Indicator (Pure Boost Circle + Isosceles Arrow · No Name)
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] ${mutedText}`}>Enable Off-Screen</span>
          <ToggleSwitch
            checked={config.offscreenIndicatorEnabled}
            onChange={(nextValue) =>
              updateConfig({ offscreenIndicatorEnabled: nextValue })
            }
            isLight={isLight}
          />
        </div>
      </div>

      <div className={`p-2 rounded-lg border flex flex-col gap-2 ${subCardBackground}`}>
        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <span className={mutedText}>Target Audience (Behind / Out of FOV):</span>
          <div className="flex items-center gap-1">
            {OFFSCREEN_AUDIENCE_OPTIONS.map((option) => {
              const isSelected = config.offscreenAudience === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.desc}
                  onClick={() => updateConfig({ offscreenAudience: option.id })}
                  className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                    isSelected
                      ? isLight
                        ? 'bg-teal-500/15 border-teal-500 text-teal-900 font-bold'
                        : 'bg-teal-500/20 border-teal-400 text-teal-300 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                        : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between text-[10px]">
            <span className={mutedText}>Show Pure Boost Circle</span>
            <ToggleSwitch
              checked={config.offscreenShowBoostCircle}
              onChange={(nextValue) =>
                updateConfig({ offscreenShowBoostCircle: nextValue })
              }
              isLight={isLight}
            />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className={mutedText}>Show Isosceles Direction Arrow</span>
            <ToggleSwitch
              checked={config.offscreenShowArrow}
              onChange={(nextValue) => updateConfig({ offscreenShowArrow: nextValue })}
              isLight={isLight}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            label="Boost Circle Radius"
            value={config.offscreenCircleRadiusPx}
            min={4}
            max={42}
            step={1}
            unit="px"
            onChange={(nextValue) =>
              updateConfig({ offscreenCircleRadiusPx: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Off-Screen Border Thickness"
            value={config.offscreenBorderWidthPx}
            min={0}
            max={12}
            step={0.5}
            unit="px"
            onChange={(nextValue) =>
              updateConfig({ offscreenBorderWidthPx: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Circle-to-Arrow Gap"
            value={config.offscreenArrowGapPx}
            min={0}
            max={18}
            step={1}
            unit="px"
            onChange={(nextValue) => updateConfig({ offscreenArrowGapPx: nextValue })}
            isLight={isLight}
          />
          <SliderControl
            label="Triangle Arrow Length"
            value={config.offscreenArrowLengthPx}
            min={4}
            max={36}
            step={1}
            unit="px"
            onChange={(nextValue) =>
              updateConfig({ offscreenArrowLengthPx: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Triangle Base Width"
            value={config.offscreenArrowBaseWidthPx}
            min={4}
            max={36}
            step={1}
            unit="px"
            onChange={(nextValue) =>
              updateConfig({ offscreenArrowBaseWidthPx: nextValue })
            }
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold flex items-center gap-1">
              <Maximize2 className="h-3 w-3 text-teal-500" />
              <span>
                ROI Effective Zone &amp; HUD Safe Margin Avoidance (Top/Bottom/Side Insets)
              </span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`font-mono text-[9px] ${mutedText}`}>
                {config.offscreenRoiAvoidHud
                  ? 'HUD Safe Zone Active'
                  : 'Custom ROI Margins'}
              </span>
              <ToggleSwitch
                checked={config.offscreenRoiAvoidHud}
                onChange={(nextValue) =>
                  updateConfig({ offscreenRoiAvoidHud: nextValue })
                }
                isLight={isLight}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <SliderControl
              label="Top ROI Inset"
              value={config.offscreenRoiTopInsetPx}
              min={12}
              max={260}
              step={4}
              unit="px"
              onChange={(nextValue) =>
                updateConfig({ offscreenRoiTopInsetPx: nextValue })
              }
              isLight={isLight}
            />
            <SliderControl
              label="Bottom ROI Inset"
              value={config.offscreenRoiBottomInsetPx}
              min={12}
              max={260}
              step={4}
              unit="px"
              onChange={(nextValue) =>
                updateConfig({ offscreenRoiBottomInsetPx: nextValue })
              }
              isLight={isLight}
            />
            <SliderControl
              label="Side ROI Inset"
              value={config.offscreenRoiSideInsetPx}
              min={12}
              max={260}
              step={4}
              unit="px"
              onChange={(nextValue) =>
                updateConfig({ offscreenRoiSideInsetPx: nextValue })
              }
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      <NameTagOffscreenCurveTunerSection
        isLight={isLight}
        config={config}
        updateConfig={updateConfig}
      />

      <NameTagAerialClimbAlertSection
        isLight={isLight}
        config={config}
        updateConfig={updateConfig}
        updatePreviewAerialClimbingFlag={updatePreviewAerialClimbingFlag}
      />
    </div>
  );
};
