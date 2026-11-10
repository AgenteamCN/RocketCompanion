import React, { useState, useEffect } from 'react';
import {
  Timer,
  Trash2,
  Upload,
  Download,
  Snail,
} from 'lucide-react';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import {
  useRewinderStore,
  type RewinderDownCounterSec,
} from '../../stores/rewinderStore';
import { quickNotification } from '../../stores/quickNotificationStore';
import { triggerReplayFilePicker } from './replayFilePicker';
import {
  BUFFER_WARMUP_FRAMES,
  RewinderTransportProgressSection,
  type RewinderBadgeState,
} from './rewinder/RewinderTransportProgressSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'rewinder-configurator',
  title: 'Rewinder Configurator',
  description:
    'Free Play state history recorder, timeline scrubber ([ / ]), and countdown takeover.',
  icon: 'history',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 505,
    height: 367,
    minWidth: 505,
    minHeight: 160,
    mode: 'adaptive',
  },
};

export type RewinderDownCounterOption = '3' | '2' | '1' | '0';
export type ShuttleSpeedPreset = '100' | '75' | '50' | '25' | 'custom';

export interface RewinderConfiguratorState {
  status: RewinderBadgeState;
  recordedFrames: number;
  cursorFrame: number;
  releaseMarkerFrame: number;
  downCounter: RewinderDownCounterOption;
  shuttlePreset: ShuttleSpeedPreset;
  customShuttleSpeed: number;
}

export interface RewinderConfiguratorFloatingWindowProps extends StandardSurfaceProps {}

/**
 * 3. [User] Rewinder Configurator (`rewinder-configurator`)
 * Standalone L6 Floating Window Panel — 100% isolated from other panels.
 */
export const RewinderConfiguratorFloatingWindow: React.FC<
  RewinderConfiguratorFloatingWindowProps
> = React.memo(({ isLight = false }) => {
  const {
    rewinderState,
    rewinderRecordedFrames,
    rewinderCursorFrame,
    rewinderTargetFrame,
    rewinderDownCounterSec,
    rewinderFlowPreset,
    rewinderCustomFlowPct,
    setRewinderFlowPreset,
    setRewinderCustomFlowPct,
    setRewinderDownCounterSec,
    runtimeHandlers,
  } = useScopedStore('rewinderStore', useRewinderStore);

  const hasRuntimeHandlers = Boolean(
    runtimeHandlers && Object.keys(runtimeHandlers).length > 0
  );

  const storeStatus: RewinderBadgeState =
    rewinderState === 'recording'
      ? 'recording'
      : rewinderState === 'idle'
      ? 'idle'
      : 'stopped';

  const [internalStatus, setInternalStatus] = useState<RewinderBadgeState>('stopped');
  const [internalRecordedFrames, setInternalRecordedFrames] = useState<number>(600);
  const [internalCursorFrame, setInternalCursorFrame] = useState<number>(360);
  const [internalReleaseMarkerFrame, setInternalReleaseMarkerFrame] = useState<number>(360);

  const status = hasRuntimeHandlers ? storeStatus : internalStatus;
  const recordedFrames = hasRuntimeHandlers
    ? Math.max(1, rewinderRecordedFrames)
    : internalRecordedFrames;
  const cursorFrame = hasRuntimeHandlers ? rewinderCursorFrame : internalCursorFrame;
  const releaseMarkerFrame = hasRuntimeHandlers
    ? rewinderTargetFrame
    : internalReleaseMarkerFrame;
  const downCounter = String(rewinderDownCounterSec) as RewinderDownCounterOption;
  const shuttlePreset: ShuttleSpeedPreset = rewinderFlowPreset;
  const customShuttleSpeed = rewinderCustomFlowPct;

  useEffect(() => {
    if (status !== 'recording' || hasRuntimeHandlers) return;
    const timer = window.setInterval(() => {
      setInternalRecordedFrames((prev) => {
        const next = prev + 6;
        setInternalCursorFrame(next);
        if (next >= BUFFER_WARMUP_FRAMES) {
          setInternalReleaseMarkerFrame(next);
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [status, hasRuntimeHandlers]);

  const isReady = recordedFrames >= BUFFER_WARMUP_FRAMES;

  const effectiveCursorFrame = isReady
    ? Math.max(BUFFER_WARMUP_FRAMES, Math.min(recordedFrames, cursorFrame))
    : recordedFrames;

  const relativeCursorFrames = isReady ? effectiveCursorFrame - BUFFER_WARMUP_FRAMES : 0;
  const cursorRelSec = (relativeCursorFrames / 120).toFixed(2);

  const handleStartNewRecording = () => {
    if (hasRuntimeHandlers) {
      runtimeHandlers.onRewinderStartRecording?.();
      return;
    }
    setInternalRecordedFrames(0);
    setInternalCursorFrame(0);
    setInternalReleaseMarkerFrame(BUFFER_WARMUP_FRAMES);
    setInternalStatus('recording');
  };

  const handleStopRecording = () => {
    if (hasRuntimeHandlers) {
      runtimeHandlers.onRewinderStopRecording?.();
      return;
    }
    setInternalStatus(status === 'idle' ? 'idle' : 'stopped');
  };

  const handleStepFrame = (delta: number) => {
    if (!isReady) return;
    const clamped = Math.max(
      BUFFER_WARMUP_FRAMES,
      Math.min(recordedFrames, Math.max(BUFFER_WARMUP_FRAMES, cursorFrame) + delta)
    );
    if (hasRuntimeHandlers) {
      runtimeHandlers.onRewinderSeekFrame?.(clamped);
      return;
    }
    if (status === 'recording') {
      setInternalStatus('stopped');
    }
    setInternalCursorFrame(clamped);
  };

  const handleScrubBar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const targetFrame =
      BUFFER_WARMUP_FRAMES +
      Math.round(ratio * Math.max(0, recordedFrames - BUFFER_WARMUP_FRAMES));
    if (hasRuntimeHandlers) {
      runtimeHandlers.onRewinderSeekFrame?.(targetFrame);
      return;
    }
    if (status === 'recording') {
      setInternalStatus('stopped');
    }
    setInternalCursorFrame(targetFrame);
  };

  const handleResumeFromHere = () => {
    if (!isReady) {
      quickNotification.warning('Starvation: Record at least 1.0s (120 frames) before resuming.');
      return;
    }
    if (hasRuntimeHandlers) {
      runtimeHandlers.onRewinderResumeFromHere?.();
      return;
    }
    setInternalReleaseMarkerFrame(effectiveCursorFrame);
    setInternalStatus('stopped');
    quickNotification.info(
      `Resume from frame #${effectiveCursorFrame} (+${cursorRelSec}s, Down Counter: ${downCounter}s).`
    );
  };

  const handleClear = () => {
    if (hasRuntimeHandlers) {
      runtimeHandlers.onRewinderClearBuffer?.();
      return;
    }
    setInternalStatus('idle');
    setInternalRecordedFrames(0);
    setInternalCursorFrame(0);
    setInternalReleaseMarkerFrame(BUFFER_WARMUP_FRAMES);
    quickNotification.info('Cleared rewinder buffer.');
  };

  const cycleBadgeStateForPreview = () => {
    const nextStatus: RewinderBadgeState =
      status === 'idle'
        ? 'recording'
        : status === 'recording'
        ? 'stopped'
        : status === 'stopped'
        ? 'error'
        : 'idle';
    setInternalStatus(nextStatus);
  };

  return (
    <div className="p-3.5 flex flex-col gap-3 text-xs select-none">
      <RewinderTransportProgressSection
        isLight={isLight}
        stateOverride={{
          status,
          recordedFrames,
          cursorFrame,
          releaseMarkerFrame,
          onStartNewRecording: handleStartNewRecording,
          onStopRecording: handleStopRecording,
          onStepFrame: handleStepFrame,
          onRewindPressStart: hasRuntimeHandlers
            ? () => runtimeHandlers.onRewinderPushBackwardStart?.()
            : undefined,
          onRewindPressEnd: hasRuntimeHandlers
            ? () => runtimeHandlers.onRewinderPushBackwardStop?.()
            : undefined,
          onForwardPressStart: hasRuntimeHandlers
            ? () => runtimeHandlers.onRewinderPushForwardStart?.()
            : undefined,
          onForwardPressEnd: hasRuntimeHandlers
            ? () => runtimeHandlers.onRewinderPushForwardStop?.()
            : undefined,
          onCycleBadgeState: cycleBadgeStateForPreview,
          onScrubBar: handleScrubBar,
        }}
      />

      {/* 3. Down Counter Row */}
      <SettingActionRow
        icon={Timer}
        title="Down Counter"
        bordered={false}
        showDescription={false}
        paddingX={4}
        paddingY={2}
        isLight={isLight}
        rightSlot={
          <SegmentedSwitch
            value={downCounter}
            size="sm"
            isLight={isLight}
            onValueChange={(v) => {
              const nextDown = v as RewinderDownCounterOption;
              setRewinderDownCounterSec((Number(nextDown) || 0) as RewinderDownCounterSec);
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

      {/* 4. Four Action Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleResumeFromHere}
          className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.985] shadow-xs ${
            isLight
              ? 'bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-900'
              : 'bg-white hover:bg-neutral-200 text-neutral-950 border border-white'
          }`}
        >
          <span>Resume from here</span>
        </button>

        <button
          type="button"
          onClick={handleClear}
          className={`py-2 px-2.5 rounded-xl border font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
            isLight
              ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
              : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-300'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span>Clear</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (hasRuntimeHandlers) {
              triggerReplayFilePicker((file) => {
                runtimeHandlers.onRewinderImportReplay?.(file);
              });
            } else {
              quickNotification.info('Imported rewinder state timeline.');
            }
          }}
          className={`py-2 px-2.5 rounded-xl border font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
            isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          <Upload className="h-3.5 w-3.5 shrink-0" />
          <span>Import</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (hasRuntimeHandlers) {
              runtimeHandlers.onRewinderExportReplay?.();
            } else {
              quickNotification.success('Exported rewinder state timeline.');
            }
          }}
          className={`py-2 px-2.5 rounded-xl border font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 ${
            isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>Export</span>
        </button>
      </div>

      {/* 5. Shuttle Speed Row */}
      <SettingActionRow
        icon={Snail}
        iconName="snail"
        title="Shuttle Speed"
        bordered={false}
        showDescription={false}
        paddingX={4}
        paddingY={2}
        isLight={isLight}
        rightSlot={
          <SegmentedSwitch
            value={shuttlePreset}
            size="sm"
            isLight={isLight}
            onValueChange={(v) => {
              setRewinderFlowPreset(v as ShuttleSpeedPreset);
            }}
            options={[
              { value: '100', label: '100%' },
              { value: '75', label: '75%' },
              { value: '50', label: '50%' },
              { value: '25', label: '25%' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        }
      />

      {shuttlePreset === 'custom' && (
        <SettingSliderRow
          label="Custom"
          value={customShuttleSpeed}
          min={1}
          max={100}
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
          onChange={(nextPct) => {
            setRewinderCustomFlowPct(nextPct);
          }}
          isLight={isLight}
        />
      )}
    </div>
  );
});
RewinderConfiguratorFloatingWindow.displayName = 'RewinderConfiguratorFloatingWindow';
export default RewinderConfiguratorFloatingWindow;
