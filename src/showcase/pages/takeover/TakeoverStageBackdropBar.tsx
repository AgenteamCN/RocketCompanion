import React from 'react';
import { Palette } from 'lucide-react';
import { ArenaLightingPreset } from '../../ArenaBackdrop';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { ColorSwatchInput } from '../../components/tuner/ColorSwatchInput';
import {
  BG_COLOR_SWATCHES,
  type StageBgMode,
} from '../center-upper-info/CenterUpperStageBackdropBar';
import { useTakeoverSyncedState } from './useTakeoverSyncedState';

export interface TakeoverStageBackdropBarProps {
  isLight: boolean;
}

export const TakeoverStageBackdropBar: React.FC<TakeoverStageBackdropBarProps> = ({
  isLight,
}) => {
  const {
    stageBgMode,
    setStageBgMode,
    arenaPreset,
    setArenaPreset,
    stageBgColor,
    setStageBgColor,
    stageBgSecondaryColor,
    setStageBgSecondaryColor,
    stageBrightness,
    setStageBrightness,
    showPitchLines,
    setShowPitchLines,
  } = useTakeoverSyncedState();
  return (
    <div
      className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-4 ${
        isLight
          ? 'bg-neutral-50/80 border-neutral-200'
          : 'bg-neutral-950/60 border-neutral-800'
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-amber-500" />
            <span>Preview Background Mode (Stage Backdrop)</span>
          </span>
        </div>
        <SegmentedSwitch
          size="sm"
          fullWidth
          isLight={isLight}
          value={stageBgMode}
          onValueChange={(v) => setStageBgMode(v as StageBgMode)}
          options={[
            { value: 'arena', label: 'Arena' },
            { value: 'flow', label: 'Flow' },
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
        />
        {stageBgMode === 'arena' && (
          <SegmentedSwitch
            size="sm"
            fullWidth
            isLight={isLight}
            value={arenaPreset}
            onValueChange={(v) => setArenaPreset(v as ArenaLightingPreset)}
            options={[
              { value: 'night', label: 'Night' },
              { value: 'twilight', label: 'Twilight' },
              { value: 'daylight', label: 'Daylight' },
              { value: 'flow', label: 'Flow' },
            ]}
          />
        )}
      </div>

      <div>
        <ColorSwatchInput
          label="Preview Background Main Color (Background Color)"
          description="Verify seamless rounded-rect vignette and Out Glow contrast against stadium tones"
          value={stageBgColor}
          onChange={setStageBgColor}
          presets={BG_COLOR_SWATCHES}
          isLight={isLight}
        />
      </div>

      <div className="flex flex-col justify-between gap-2">
        {stageBgMode === 'gradient' ? (
          <ColorSwatchInput
            label="Gradient Center Secondary Color (Radial Core Color)"
            value={stageBgSecondaryColor}
            onChange={setStageBgSecondaryColor}
            presets={['#1E293B', '#0F172A', '#31102F', '#064E3B', '#3B2F13']}
            isLight={isLight}
          />
        ) : (
          <SliderControl
            label="Background Environment Brightness (Backdrop Brightness)"
            value={stageBrightness}
            min={10}
            max={120}
            step={1}
            unit="%"
            onChange={setStageBrightness}
            isLight={isLight}
          />
        )}
        <div className="flex items-center justify-between pt-1">
          <ToggleSwitch
            label="Stadium Midline/Center Circle Texture"
            checked={showPitchLines}
            onCheckedChange={setShowPitchLines}
            isLight={isLight}
          />
          <span className="text-[11px] font-mono opacity-60">16:9 Safe Stage</span>
        </div>
      </div>
    </div>
  );
};
