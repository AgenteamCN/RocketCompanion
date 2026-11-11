import React from 'react';
import { Megaphone } from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import {
  CUSTOM_ANNOUNCEMENT_PRESETS,
  type CustomAnnouncementPreset,
} from './CenterUpperStageBackdropBar';
import { useCenterUpperSyncedState } from './useCenterUpperSyncedState';

export interface CenterUpperAnnouncementControlsProps {
  isLight: boolean;
  handleApplyCustomPreset: (preset: CustomAnnouncementPreset) => void;
}

export const CenterUpperAnnouncementControls: React.FC<CenterUpperAnnouncementControlsProps> = ({
  isLight,
  handleApplyCustomPreset,
}) => {
  const {
    customPresetId,
    showCustomTopLine,
    setShowCustomTopLine,
    customTopText,
    setCustomTopText,
    customMainText,
    setCustomMainText,
    customSubText,
    setCustomSubText,
    setIsVisibleOnStage,
  } = useCenterUpperSyncedState();
  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-neutral-200/70 dark:border-neutral-800/80">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-mono font-bold flex items-center gap-1 text-emerald-500 mr-1">
            <Megaphone className="h-3.5 w-3.5" />
            <span>Custom Announcement Presets (Forced Uppercase):</span>
          </span>
          {CUSTOM_ANNOUNCEMENT_PRESETS.map((preset) => {
            const isSelected = customPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyCustomPreset(preset)}
                className={`px-2.5 py-1 rounded-xl text-xs font-mono border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-neutral-950 font-bold border-amber-400 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <Badge variant="success" size="sm" isLight={isLight}>
          Force Uppercase: TOP `ADMIN CONTROL` · MAIN `MATCH PAUSED`
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleSwitch
          label="Show Top Regular(400) Line"
          checked={showCustomTopLine}
          onCheckedChange={(v) => {
            setShowCustomTopLine(v);
            setIsVisibleOnStage(true);
          }}
          isLight={isLight}
        />
        {showCustomTopLine && (
          <label className="flex items-center gap-1.5 text-xs font-mono">
            <span className="opacity-70">Top Regular(400):</span>
            <input type="text" value={customTopText} onChange={(e) => { setCustomTopText(e.target.value.toUpperCase());
              setIsVisibleOnStage(true); }} className={`w-40 px-2 py-1 rounded-lg border font-mono text-xs uppercase ${
              isLight ? 'bg-white border-neutral-300 text-neutral-900'
              : 'bg-neutral-900 border-neutral-700 text-neutral-100' }`} />
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs font-mono">
          <span className="opacity-70">Main Row Thin(100):</span>
          <input type="text" value={customMainText} onChange={(e) => { setCustomMainText(e.target.value.toUpperCase());
            setIsVisibleOnStage(true); }} className={`w-56 px-2 py-1 rounded-lg border font-mono text-xs uppercase ${ isLight
            ? 'bg-white border-neutral-300 text-neutral-900' : 'bg-neutral-900 border-neutral-700 text-neutral-100'
            }`} />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-mono">
          <span className="opacity-70">Bottom Capsule Footer (Leave Blank if Unused):</span>
          <input
            type="text"
            value={customSubText}
            placeholder="Default blank if hidden"
            onChange={(e) => {
              setCustomSubText(e.target.value.toUpperCase());
              setIsVisibleOnStage(true);
            }}
            className={`w-44 px-2 py-1 rounded-lg border font-mono text-xs uppercase ${
              isLight
                ? 'bg-white border-neutral-300 text-neutral-900'
                : 'bg-neutral-900 border-neutral-700 text-neutral-100'
            }`}
          />
        </label>
      </div>
    </div>
  );
};
