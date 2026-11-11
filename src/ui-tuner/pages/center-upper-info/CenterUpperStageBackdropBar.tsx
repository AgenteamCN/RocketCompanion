import React from 'react';
import { Palette } from 'lucide-react';
import { ArenaLightingPreset } from '../../ArenaBackdrop';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { ColorSwatchInput } from '../../components/tuner/ColorSwatchInput';
import { JumpDirectoryItem } from '../../PageJumpDirectory';
import { useCenterUpperSyncedState, type StageBgMode } from './useCenterUpperSyncedState';

export type { StageBgMode };

export interface CustomAnnouncementPreset {
  id: string;
  label: string;
  topText: string;
  mainText: string;
}

export const DIRECTORY_ITEMS: JumpDirectoryItem[] = [
  { id: 'center-upper-stage', code: '5E-1', componentName: 'CenterUpperStageCanvas',
    name: 'HudAnchorStage (upper-center)', label: 'Top-center high-priority live stage + Winner Blue Team RGB menu + ADMIN CONTROL / MATCH PAUSED' },
  {
    id: 'center-upper-tuner',
    code: '5E-2',
    componentName: 'CenterUpperTunerSection',
    name: 'OutGlow, Winner Blue RGB & Duration Tuner',
    label: 'Winner Blue Team Color (5G presets + manual RGB), Out Glow, 400ms 1.5x Entry Impact, 2000ms Duration & 400ms Tail fade tuner',
  },
  {
    id: 'center-upper-archetypes',
    code: '5E-3',
    componentName: 'CenterUpperArchetypesSection',
    name: 'Archetype Gallery & Recipe',
    label: 'Three types of high-priority alert reference cards (Countdown / Winner Blue & Orange / Custom ADMIN CONTROL · MATCH PAUSED)',
  },
];

export const CUSTOM_ANNOUNCEMENT_PRESETS: CustomAnnouncementPreset[] = [
  { id: 'match-paused', label: 'MATCH PAUSED (ADMIN CONTROL)', topText: 'ADMIN CONTROL', mainText: 'MATCH PAUSED' },
  { id: 'overtime', label: 'OVERTIME (Sudden Death)', topText: 'SUDDEN DEATH', mainText: 'OVERTIME' },
  { id: 'goal-scored', label: 'GOAL SCORED (Goal Broadcast)', topText: 'SCORED BY', mainText: 'ZEN_MASTER_RL' },
  { id: 'match-point', label: 'MATCH POINT (Series Alert)', topText: 'SERIES ALERT', mainText: 'MATCH POINT' },
  { id: 'single-line-info', label: 'WAITING FOR PLAYERS (Single Line Thin)', topText: '', mainText: 'WAITING FOR PLAYERS' },
];

export const BG_COLOR_SWATCHES = ['#090D16', '#000000', '#0F172A', '#1E293B', '#18181B', '#0E2218', '#23121B', '#334155', '#CBD5E1', '#F8FAFC'];

export const RL_GLOW_SWATCHES = ['#FFE600', '#FACC15', '#F59E0B', '#FB923C', '#38BDF8', '#22C55E', '#EF4444', '#A855F7', '#FFFFFF'];

export interface CenterUpperStageBackdropBarProps {
  isLight: boolean;
}

export const CenterUpperStageBackdropBar: React.FC<CenterUpperStageBackdropBarProps> = ({
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
  } = useCenterUpperSyncedState();

  return (
    <div
      className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-3 gap-4 ${
        isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
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
            { value: 'solid', label: 'Solid Background (Solid)' },
            { value: 'gradient', label: 'Dual Gradient (Gradient)' },
            { value: 'arena', label: 'Stadium Preset (Arena)' },
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
          description="Toggle Dark/Light/Stadium Color Check Out Glow Contrast"
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
            max={100}
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

