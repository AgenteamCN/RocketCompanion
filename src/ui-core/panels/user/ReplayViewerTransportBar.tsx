import React from 'react';
import { RotateCcw, Snail, Timer } from 'lucide-react';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import { quickNotification } from '../../stores/quickNotificationStore';
export type PlaybackSpeedPreset = '100' | '50' | '200' | '500' | 'custom';
export type DownCounterOption = '3' | '2' | '1' | '0';

export interface ReplayViewerState {
  fileName: string;
  cursorFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  isIntervening: boolean;
  playbackPreset: PlaybackSpeedPreset;
  customSpeedPct: number;
  downCounter: DownCounterOption;
}

export interface ReplayViewerTransportBarProps {
  isLight: boolean;
  controlsDisabled: boolean;
  backToReplayDisabled: boolean;
  playbackPreset: PlaybackSpeedPreset;
  customSpeedPct: number;
  downCounter: DownCounterOption;
  clampedCursor: number;
  cursorSec: string;
  onPresetSelect: (nextPreset: PlaybackSpeedPreset) => void;
  onCustomSpeedSelect: (nextPct: number) => void;
  onInterveneClick: () => void;
  onBackToReplayClick: () => void;
  onDownCounterSelect: (nextDown: DownCounterOption) => void;
  emitStateChange?: (patch?: Partial<ReplayViewerState>) => void;
}

export const ReplayViewerTransportBar: React.FC<ReplayViewerTransportBarProps> = ({
  isLight,
  controlsDisabled,
  backToReplayDisabled,
  playbackPreset,
  customSpeedPct,
  downCounter,
  onPresetSelect,
  onCustomSpeedSelect,
  onInterveneClick,
  onBackToReplayClick,
  onDownCounterSelect,
}) => {
  void quickNotification;
  return (
    <>
      {/* 4. Playback Speed (Consistent with Rewinder: Snail icon + 5-way Segmented Control + Custom Slider) */}
      <SettingActionRow
        icon={Snail}
        iconName="snail"
        title="Playback Speed"
        bordered={false}
        showDescription={false}
        paddingX={4}
        paddingY={2}
        disabled={controlsDisabled}
        isLight={isLight}
        rightSlot={
          <SegmentedSwitch
            value={playbackPreset}
            size="sm"
            disabled={controlsDisabled}
            isLight={isLight}
            onValueChange={(v) => {
              if (controlsDisabled) return;
              onPresetSelect(v as PlaybackSpeedPreset);
            }}
            options={[
              { value: '100', label: '100%' },
              { value: '50', label: '50%' },
              { value: '200', label: '200%' },
              { value: '500', label: '500%' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        }
      />

      {playbackPreset === 'custom' && (
        <SettingSliderRow
          label="Custom"
          value={customSpeedPct}
          min={1}
          max={500}
          step={1}
          unit="%"
          layout="inline"
          trackWidth={148}
          showStepper={false}
          editable={true}
          bordered={false}
          showDescription={false}
          paddingX={4}
          paddingY={2}
          disabled={controlsDisabled}
          onChange={(nextPct) => {
            if (controlsDisabled) return;
            onCustomSpeedSelect(nextPct);
          }}
          isLight={isLight}
        />
      )}

      {/* 5. Intervene from here + Back to replay */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={onInterveneClick}
          className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
            controlsDisabled
              ? isLight
                ? 'bg-neutral-200 text-neutral-400 border border-neutral-200 opacity-45 cursor-not-allowed pointer-events-none'
                : 'bg-neutral-800 text-neutral-500 border border-neutral-800 opacity-45 cursor-not-allowed pointer-events-none'
              : isLight
              ? 'bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-900 cursor-pointer active:scale-[0.985]'
              : 'bg-white hover:bg-neutral-200 text-neutral-950 border border-white cursor-pointer active:scale-[0.985]'
          }`}
        >
          <span>Intervene from here</span>
        </button>

        <button
          type="button"
          disabled={backToReplayDisabled}
          onClick={onBackToReplayClick}
          className={`py-2 px-3 rounded-xl border font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-all ${
            backToReplayDisabled
              ? isLight
                ? 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-45 cursor-not-allowed pointer-events-none'
                : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 opacity-45 cursor-not-allowed pointer-events-none'
              : isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 cursor-pointer active:scale-95'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200 cursor-pointer active:scale-95'
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          <span>Back to replay</span>
        </button>
      </div>

      {/* 6. Down Counter (4-way Segmented Control: 3, 2, 1, 0) */}
      <SettingActionRow
        icon={Timer}
        title="Down Counter"
        bordered={false}
        showDescription={false}
        paddingX={4}
        paddingY={2}
        disabled={controlsDisabled}
        isLight={isLight}
        rightSlot={
          <SegmentedSwitch
            value={downCounter}
            size="sm"
            disabled={controlsDisabled}
            isLight={isLight}
            onValueChange={(v) => {
              if (controlsDisabled) return;
              onDownCounterSelect(v as DownCounterOption);
            }}
            options={[
              { value: '3', label: '3' },
              { value: '2', label: '2' },
              { value: '1', label: '1' },
              { value: '0', label: '0' },
            ]}
          />
        }
      />
    </>
  );
};
