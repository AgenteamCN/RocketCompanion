import React from 'react';
import { Eye, ShieldAlert } from 'lucide-react';
import type {
  NameTagBoostBorderAudience,
  NameTagBoostBorderOverride,
  NameTagConfig,
} from '../../../config/nameTagConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { CAR_SLOT_BADGES } from './NameTagCalibrationSection';

const AUDIENCE_OPTIONS: Array<{
  id: NameTagBoostBorderAudience;
  label: string;
}> = [
  { id: 'teammates', label: 'Teammates Only' },
  { id: 'all', label: 'All Cars' },
  { id: 'none', label: 'Hidden' },
];

const OVERRIDE_OPTIONS: Array<{
  label: string;
  value: NameTagBoostBorderOverride;
}> = [
  { label: 'Default (Scene Rules)', value: null },
  { label: 'Force Teammates', value: 'teammates' },
  { label: 'Force All Cars', value: 'all' },
  { label: 'Force Hidden', value: false },
];

export interface NameTagBoostVisibilityAndPreviewSectionProps {
  isLight?: boolean;
  config?: NameTagConfig;
  boostBorderOverride?: NameTagBoostBorderOverride;
  updateConfig?: (partial: Partial<NameTagConfig>) => void;
  updatePreviewBoostAmount?: (index: number, boostAmount: number) => void;
  setBoostBorderOverride?: (override: NameTagBoostBorderOverride) => void;
}

export const NameTagBoostVisibilityAndPreviewSection: React.FC<
  NameTagBoostVisibilityAndPreviewSectionProps
> = ({
  isLight = false,
  config: propConfig,
  boostBorderOverride: propOverride,
  updateConfig: propUpdateConfig,
  updatePreviewBoostAmount: propUpdatePreviewBoostAmount,
  setBoostBorderOverride: propSetBoostBorderOverride,
}) => {
  const store = useNameTagTunerStore();
  const config = propConfig ?? store.config;
  const boostBorderOverride =
    propOverride !== undefined ? propOverride : store.boostBorderOverride;
  const updateConfig = propUpdateConfig ?? store.updateConfig;
  const updatePreviewBoostAmount =
    propUpdatePreviewBoostAmount ?? store.updatePreviewBoostAmount;
  const setBoostBorderOverride =
    propSetBoostBorderOverride ?? store.setBoostBorderOverride;

  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <>
      <div
        className={`p-2 rounded-lg border flex flex-col gap-1.5 ${
          isLight
            ? 'border-neutral-200 bg-neutral-100/70'
            : 'border-neutral-800 bg-neutral-900/40'
        }`}
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold flex items-center gap-1">
            <Eye className="h-3 w-3 opacity-80" />
            <span>Scene &amp; Audience Visibility Flags</span>
          </span>
          <span className={`font-mono text-[9px] ${mutedText}`}>
            Exhibition / Replay Flag Policy
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <ToggleSwitch
              checked={config.showBoostBorderInMatchPlaying}
              onChange={(nextValue) =>
                updateConfig({ showBoostBorderInMatchPlaying: nextValue })
              }
              isLight={isLight}
            />
            <span>During Match Playing:</span>
          </div>
          <div className="flex items-center gap-1">
            {AUDIENCE_OPTIONS.map((option) => {
              const isSelected = config.boostBorderMatchAudience === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!config.showBoostBorderInMatchPlaying}
                  onClick={() => updateConfig({ boostBorderMatchAudience: option.id })}
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer transition-colors disabled:opacity-40 ${
                    isSelected
                      ? isLight
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 font-bold'
                        : 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-600'
                        : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <ToggleSwitch
              checked={config.showBoostBorderInGoalReplay}
              onChange={(nextValue) =>
                updateConfig({ showBoostBorderInGoalReplay: nextValue })
              }
              isLight={isLight}
            />
            <span>Goal Replay / Cinematic:</span>
          </div>
          <div className="flex items-center gap-1">
            {AUDIENCE_OPTIONS.map((option) => {
              const isSelected = config.boostBorderReplayAudience === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!config.showBoostBorderInGoalReplay}
                  onClick={() => updateConfig({ boostBorderReplayAudience: option.id })}
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer transition-colors disabled:opacity-40 ${
                    isSelected
                      ? isLight
                        ? 'bg-amber-500/15 border-amber-500 text-amber-800 font-bold'
                        : 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-600'
                        : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-0.5 text-[10px]">
          <span className={`flex items-center gap-1 ${mutedText}`}>
            <ShieldAlert className="h-3 w-3" />
            <span>Runtime Flag Override:</span>
          </span>
          <div className="grid grid-cols-4 gap-1">
            {OVERRIDE_OPTIONS.map((option) => {
              const isSelected = boostBorderOverride === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setBoostBorderOverride(option.value)}
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer truncate transition-colors ${
                    isSelected
                      ? isLight
                        ? 'bg-sky-500/15 border-sky-500 text-sky-800 font-bold'
                        : 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-600'
                        : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className={`font-semibold ${mutedText}`}>
            6-Car Sample Boost Amounts (0-100%):
          </span>
          <div className="flex items-center gap-1">
            {[
              { label: '0%', values: [0, 0, 0, 0, 0, 0] },
              { label: '33%', values: [33, 33, 33, 33, 33, 33] },
              { label: 'Mixed', values: [100, 66, 33, 85, 50, 18] },
              { label: '100%', values: [100, 100, 100, 100, 100, 100] },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => updateConfig({ previewBoostAmounts: preset.values })}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                    : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const slotMeta = CAR_SLOT_BADGES[index];
            const isOrange = index >= 3;
            const boostVal = config.previewBoostAmounts[index] ?? 100;
            return (
              <div
                key={index}
                className={`px-2 py-1 rounded border flex flex-col gap-0.5 ${
                  isOrange
                    ? 'border-orange-500/25 bg-orange-500/5'
                    : 'border-sky-500/25 bg-sky-500/5'
                }`}
              >
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span
                    className={`font-bold ${
                      isOrange
                        ? isLight
                          ? 'text-orange-700'
                          : 'text-orange-300'
                        : isLight
                          ? 'text-sky-700'
                          : 'text-sky-300'
                    }`}
                  >
                    {slotMeta.slotCode}
                  </span>
                  <span>{boostVal}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={boostVal}
                  onChange={(event) =>
                    updatePreviewBoostAmount(index, Number(event.target.value))
                  }
                  className="w-full h-1.5 accent-cyan-400 cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
