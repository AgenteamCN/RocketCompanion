import React, { useEffect, useState } from 'react';
import { Copy, Hash, HatGlasses, Palette } from 'lucide-react';
import {
  DEFAULT_NAME_TAG_DISTINCT_COLORS,
  DEFAULT_NAME_TAG_SLOT_CODES,
  type NameTagAnonymizeMode,
  type NameTagCardDisplayMode,
  type NameTagCircleColorMode,
  type NameTagConfig,
} from '../../../config/nameTagConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface NameTagSingleCharIndicatorSectionProps {
  isLight?: boolean;
  config?: NameTagConfig;
  updateConfig?: (partial: Partial<NameTagConfig>) => void;
}

const CARD_DISPLAY_MODES: Array<{
  id: NameTagCardDisplayMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'pill',
    label: 'Standard Pill Tag',
    desc: 'Edit & preview the Standard Pill parameter set (used for full player usernames)',
  },
  {
    id: 'single-char',
    label: 'Single-Char Indicator',
    desc: 'Edit & preview the Single-Char Indicator parameter set (used for anonymized 1-letter slot codes X/W/E · A/M/Z)',
  },
];

const ANONYMIZE_OPTIONS: Array<{
  id: NameTagAnonymizeMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'disabled',
    label: 'Disabled',
    desc: 'Display full player usernames on on-screen name tags',
  },
  {
    id: 'opponents',
    label: 'Opponents Only',
    desc: 'Anonymize opponent names to single-char indicators (using Single-Char Indicator parameters)',
  },
  {
    id: 'teammates',
    label: 'Teammates Only',
    desc: 'Anonymize teammate names to single-char indicators (using Single-Char Indicator parameters)',
  },
  {
    id: 'both',
    label: 'Both',
    desc: 'Anonymize all player names to single-char indicators (X/W/E · A/M/Z)',
  },
];

const CIRCLE_COLOR_MODES: Array<{
  id: NameTagCircleColorMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'team',
    label: 'Team Color (Blue / Orange)',
    desc: 'Use standard Blue / Orange team colors',
  },
  {
    id: 'car-primary',
    label: 'Per-Car Distinct Primary Color',
    desc: 'Assign each of the 6 cars a unique primary color so players are distinguishable by color alone',
  },
];

export const NameTagSingleCharIndicatorSection: React.FC<
  NameTagSingleCharIndicatorSectionProps
> = ({ isLight = false, config: propConfig, updateConfig: propUpdateConfig }) => {
  const store = useNameTagTunerStore();
  const config = propConfig ?? store.config;
  const updateConfig = propUpdateConfig ?? store.updateConfig;
  const copyVariantParameters = store.copyVariantParameters;

  const cardBackground = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const subCardBackground = isLight
    ? 'border-neutral-200 bg-neutral-100/75'
    : 'border-neutral-800 bg-neutral-900/50';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const slotCodes =
    Array.isArray(config.slotCodes) && config.slotCodes.length === 6
      ? config.slotCodes
      : DEFAULT_NAME_TAG_SLOT_CODES;

  const [draftSlotCodes, setDraftSlotCodes] = useState<string[]>(() => [...slotCodes]);

  useEffect(() => {
    setDraftSlotCodes([...slotCodes]);
  }, [slotCodes]);

  const distinctColors =
    Array.isArray(config.distinctCarColors) && config.distinctCarColors.length === 6
      ? config.distinctCarColors
      : DEFAULT_NAME_TAG_DISTINCT_COLORS;

  const commitSlotCode = (index: number) => {
    const rawVal = draftSlotCodes[index] ?? '';
    const cleaned =
      rawVal.trim().toUpperCase().slice(0, 2) || DEFAULT_NAME_TAG_SLOT_CODES[index];
    const next = [...slotCodes];
    next[index] = cleaned;
    setDraftSlotCodes(next);
    if (cleaned !== slotCodes[index]) {
      updateConfig({ slotCodes: next });
    }
  };

  const handleDistinctColorChange = (index: number, hexVal: string) => {
    const next = [...distinctColors];
    next[index] = hexVal;
    updateConfig({ distinctCarColors: next });
  };

  const isSingleCharMode = config.cardDisplayMode === 'single-char';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBackground}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Hash
            className={`h-3.5 w-3.5 ${isLight ? 'text-sky-600' : 'text-sky-400'}`}
          />
          <span>
            On-Screen Single-Char Indicator &amp; Anonymize Player Names (X/W/E · A/M/Z)
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] ${mutedText}`}>
            {isSingleCharMode ? 'Single-Char Active' : 'Standard Pill'}
          </span>
          <ToggleSwitch
            checked={isSingleCharMode}
            onChange={(checked) =>
              updateConfig({ cardDisplayMode: checked ? 'single-char' : 'pill' })
            }
            isLight={isLight}
          />
        </div>
      </div>

      <div className={`p-2 rounded-lg border flex flex-col gap-2 ${subCardBackground}`}>
        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <span className={mutedText}>Active Tuner Parameter Set (In Front of You):</span>
          <div className="flex items-center gap-1">
            {CARD_DISPLAY_MODES.map((mode) => {
              const isSelected = config.cardDisplayMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.desc}
                  onClick={() => updateConfig({ cardDisplayMode: mode.id })}
                  className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                    isSelected
                      ? isLight
                        ? 'bg-sky-500/15 border-sky-500 text-sky-900 font-bold'
                        : 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
                      : isLight
                        ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                        : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
            <button
              type="button"
              title={
                isSingleCharMode
                  ? 'Copy Standard Pill parameters into Single-Char Indicator'
                  : 'Copy Single-Char Indicator parameters into Standard Pill'
              }
              onClick={() =>
                copyVariantParameters(
                  isSingleCharMode ? 'pill' : 'single-char',
                  isSingleCharMode ? 'single-char' : 'pill'
                )
              }
              className={`px-1.5 py-0.5 rounded border font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                  : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              <Copy className="h-2.5 w-2.5" />
              <span>{isSingleCharMode ? 'Copy Pill → 1-Char' : 'Copy 1-Char → Pill'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 text-[10px] pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <span className="font-semibold flex items-center gap-1">
            <HatGlasses className="h-3 w-3 text-sky-500" />
            <span>Anonymize Player Names:</span>
          </span>
          <div className="flex items-center gap-1">
            {ANONYMIZE_OPTIONS.map((option) => {
              const isSelected = (config.anonymizePlayerNames || 'disabled') === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.desc}
                  onClick={() => updateConfig({ anonymizePlayerNames: option.id })}
                  className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                    isSelected
                      ? isLight
                        ? 'bg-sky-500/15 border-sky-500 text-sky-900 font-bold'
                        : 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
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

        <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between text-[10px]">
            <span className={mutedText}>
              Also Render Slot Code Inside Off-Screen Circle (Behind You)
            </span>
            <ToggleSwitch
              checked={config.offscreenShowSlotCode}
              onChange={(nextValue) =>
                updateConfig({ offscreenShowSlotCode: nextValue })
              }
              isLight={isLight}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div className="flex items-center justify-between gap-1 px-2 py-1 rounded border border-sky-500/30 bg-sky-500/5">
              <span className="text-[10px] font-bold text-sky-400">
                Team 1 (Blue):
              </span>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((idx) => (
                  <input
                    key={idx}
                    type="text"
                    maxLength={2}
                    value={draftSlotCodes[idx] ?? DEFAULT_NAME_TAG_SLOT_CODES[idx]}
                    onChange={(e) => {
                      const next = [...draftSlotCodes];
                      next[idx] = e.target.value;
                      setDraftSlotCodes(next);
                    }}
                    onBlur={() => commitSlotCode(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitSlotCode(idx);
                        e.currentTarget.blur();
                      }
                    }}
                    className={`w-7 h-5 text-center font-mono font-bold text-[10px] rounded border ${
                      isLight
                        ? 'bg-white border-sky-300 text-sky-900'
                        : 'bg-neutral-900 border-sky-500/40 text-sky-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-1 px-2 py-1 rounded border border-orange-500/30 bg-orange-500/5">
              <span className="text-[10px] font-bold text-orange-400">
                Team 2 (Orange):
              </span>
              <div className="flex items-center gap-1">
                {[3, 4, 5].map((idx) => (
                  <input
                    key={idx}
                    type="text"
                    maxLength={2}
                    value={draftSlotCodes[idx] ?? DEFAULT_NAME_TAG_SLOT_CODES[idx]}
                    onChange={(e) => {
                      const next = [...draftSlotCodes];
                      next[idx] = e.target.value;
                      setDraftSlotCodes(next);
                    }}
                    onBlur={() => commitSlotCode(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitSlotCode(idx);
                        e.currentTarget.blur();
                      }
                    }}
                    className={`w-7 h-5 text-center font-mono font-bold text-[10px] rounded border ${
                      isLight
                        ? 'bg-white border-orange-300 text-orange-900'
                        : 'bg-neutral-900 border-orange-500/40 text-orange-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-1.5 text-[10px]">
            <span className="font-semibold flex items-center gap-1">
              <Palette className="h-3 w-3 text-amber-500" />
              <span>Color Mode:</span>
            </span>
            <div className="flex items-center gap-1">
              {CIRCLE_COLOR_MODES.map((option) => {
                const isSelected = config.circleColorMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.desc}
                    onClick={() => updateConfig({ circleColorMode: option.id })}
                    className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                      isSelected
                        ? isLight
                          ? 'bg-amber-500/15 border-amber-500 text-amber-900 font-bold'
                          : 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
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

          {config.circleColorMode === 'car-primary' && (
            <div className="grid grid-cols-6 gap-1.5 pt-0.5">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <label
                  key={idx}
                  className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono ${
                    isLight
                      ? 'bg-white border-neutral-300'
                      : 'bg-neutral-900 border-neutral-700'
                  }`}
                >
                  <span>[{slotCodes[idx]}]</span>
                  <input
                    type="color"
                    value={distinctColors[idx]}
                    onChange={(e) => handleDistinctColorChange(idx, e.target.value)}
                    className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
