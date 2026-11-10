import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, Rewind, FastForward } from 'lucide-react';
import {
  MultiTrackReplayTimeline,
  DEFAULT_REPLAY_INCIDENT_MARKERS,
  DEFAULT_REPLAY_SIGNAL_MARKERS,
  type ReplayIncidentMarker,
  type ReplaySignalMarker,
} from '../../charts/MultiTrackReplayTimeline';
import { KeycapBadge } from '../../primitives/KeycapBadge';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import {
  useReplayViewerStore,
  type ReplayDownCounterOption,
} from '../../stores/replayViewerStore';
import { quickNotification } from '../../stores/quickNotificationStore';
import {
  ReplayViewerTransportBar,
  type PlaybackSpeedPreset,
  type DownCounterOption,
  type ReplayViewerState,
} from './ReplayViewerTransportBar';
import { ReplayViewerLoadActionsHeader } from './replay-viewer/ReplayViewerLoadActionsHeader';

export type {
  PlaybackSpeedPreset,
  DownCounterOption,
  ReplayViewerState,
  ReplayIncidentMarker,
  ReplaySignalMarker,
};

export const SURFACE_META: SurfaceMeta = {
  id: 'replay-viewer',
  title: 'Replay Viewer',
  description:
    'Multi-track replay timeline scrubber, camera mode switcher, and speed flow controls.',
  icon: 'film',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 471,
    height: 456,
    minWidth: 471,
    minHeight: 136,
    mode: 'adaptive',
  },
};

export interface ReplayViewerFloatingWindowProps extends StandardSurfaceProps {}

const RECENT_CLIPS = [
  { name: 'RLCS_GrandFinals_Game7_OT.rcreplay', totalFrames: 1800 },
  { name: 'DoubleTap_Read_04.rcreplay', totalFrames: 1440 },
] as const;

/**
 * 1. [User] Replay Viewer (`replay-viewer`)
 * Standalone L6 Floating Window Panel composing the L5 `<MultiTrackReplayTimeline />`:
 * 1. Top Row: 2 Buttons:
 *    - Left: Black Primary `Load Replay Files` with `Upload` icon
 *    - Right: Secondary `Load Recent` with `ClockCheck` (`clock-check`) icon
 * 2. Rows 2–4: Embedded `<MultiTrackReplayTimeline variant="tracks-only" />` (Replay File Name, Frame readout, and 3 Synchronized Tracks)
 * 3. Row 5: 4 Transport Buttons (`Play`, `Pause`, `Rewind`, `Forward`) with hotkey badges (`O`, `P`, `[`, `]`)
 * 4. Row 6: `Playback Speed` (`snail` icon + Segmented Control `100% | 75% | 50% | 25% | Custom` + Custom Slider)
 * 5. Row 7: `Intervene from here` (Black Primary) + `Back to replay`
 * 6. Row 8: `Down Counter` (`Timer` icon + Segmented Control `3 | 2 | 1 | 0`, default `0`)
 */
export const ReplayViewerFloatingWindow: React.FC<
  ReplayViewerFloatingWindowProps
> = React.memo(({ isLight = false }) => {
  const {
    loadedFileName,
    totalFrames: storeTotalFrames,
    cursorFrame: storeCursorFrame,
    viewerState,
    flowPreset,
    customFlowPct,
    downCounterSec,
    hasRetainedMatch,
    isLoadingReplay,
    incidentMarkers: rawIncidentMarkers,
    signalMarkers: rawSignalMarkers,
    setFlowPreset,
    setCustomFlowPct,
    setDownCounterSec,
    runtimeHandlers,
  } = useScopedStore('replayViewerStore', useReplayViewerStore);

  const hasRuntimeHandlers = Boolean(
    runtimeHandlers && Object.keys(runtimeHandlers).length > 0
  );
  const hasLoadedReplay = Boolean(loadedFileName && storeTotalFrames > 0);

  const mappedIncidentMarkers = useMemo<ReplayIncidentMarker[]>(
    () =>
      rawIncidentMarkers.map((m) => ({
        frameIndex: m.frameIndex,
        type:
          m.type === 0x0e
            ? 'goal'
            : m.type === 0x03
            ? 'demo'
            : m.type === 0x05 || m.type === 0x0f
            ? 'save'
            : 'touch',
        label: m.label,
      })),
    [rawIncidentMarkers]
  );

  const mappedSignalMarkers = useMemo<ReplaySignalMarker[]>(
    () =>
      rawSignalMarkers.map((m) => ({
        frameIndex: m.frameIndex,
        type:
          m.type === 0x88
            ? 'score'
            : m.type === 0x97 || m.type === 0x99 || m.type === 0x8b
            ? 'end'
            : 'kickoff',
        label: m.label,
        synthesized: m.synthesized,
      })),
    [rawSignalMarkers]
  );

  const [clipIndex, setClipIndex] = useState<number>(0);
  const activeClip = RECENT_CLIPS[clipIndex];

  const [internalCursorFrame, setInternalCursorFrame] = useState<number>(420);
  const [internalIsPlaying, setInternalIsPlaying] = useState<boolean>(false);
  const [internalIsIntervening, setInternalIsIntervening] = useState<boolean>(false);

  const fileName = hasRuntimeHandlers
    ? hasLoadedReplay && loadedFileName
      ? loadedFileName
      : 'No replay loaded'
    : loadedFileName ?? activeClip.name;
  const totalFrames = hasRuntimeHandlers
    ? hasLoadedReplay
      ? storeTotalFrames
      : 0
    : storeTotalFrames > 0
    ? storeTotalFrames
    : activeClip.totalFrames;

  const controlsDisabled =
    isLoadingReplay || (hasRuntimeHandlers && !hasLoadedReplay) || totalFrames <= 0;
  const loadRecentDisabled =
    isLoadingReplay || (hasRuntimeHandlers && !hasRetainedMatch);

  const cursorFrame = hasRuntimeHandlers
    ? hasLoadedReplay
      ? storeCursorFrame
      : 0
    : storeCursorFrame > 0
    ? storeCursorFrame
    : internalCursorFrame;
  const isPlaying = hasRuntimeHandlers ? viewerState === 'playing' : internalIsPlaying;
  const isIntervening = hasRuntimeHandlers
    ? viewerState === 'preroll-countdown' || viewerState === 'intervening'
    : internalIsIntervening;

  const playbackPreset: PlaybackSpeedPreset = flowPreset;
  const customSpeedPct = customFlowPct;
  const downCounter = String(downCounterSec) as DownCounterOption;

  const incidentMarkers = hasRuntimeHandlers
    ? hasLoadedReplay
      ? mappedIncidentMarkers
      : []
    : rawIncidentMarkers.length > 0
    ? mappedIncidentMarkers
    : DEFAULT_REPLAY_INCIDENT_MARKERS;
  const signalMarkers = hasRuntimeHandlers
    ? hasLoadedReplay
      ? mappedSignalMarkers
      : []
    : rawSignalMarkers.length > 0
    ? mappedSignalMarkers
    : DEFAULT_REPLAY_SIGNAL_MARKERS;

  const effectiveSpeedPct =
    playbackPreset === 'custom' ? customSpeedPct : Number(playbackPreset);

  useEffect(() => {
    if (controlsDisabled || !isPlaying || hasRuntimeHandlers) return;
    const stepFrames = Math.max(1, Math.round((4 * effectiveSpeedPct) / 100));
    const timer = window.setInterval(() => {
      setInternalCursorFrame((prev) => (prev + stepFrames) % Math.max(1, totalFrames));
    }, 33);
    return () => window.clearInterval(timer);
  }, [controlsDisabled, isPlaying, effectiveSpeedPct, totalFrames, hasRuntimeHandlers]);

  const clampedCursor = controlsDisabled ? 0 : Math.max(0, Math.min(totalFrames, cursorFrame));
  const cursorSec = (clampedCursor / 120).toFixed(2);

  const handleSeek = (nextFrame: number) => {
    if (controlsDisabled) return;
    if (hasRuntimeHandlers) {
      runtimeHandlers.onSeekFrame?.(nextFrame);
      return;
    }
    setInternalCursorFrame(nextFrame);
  };

  const handleStep = (delta: number) => {
    if (controlsDisabled) return;
    const nextFrame = Math.max(0, Math.min(totalFrames, clampedCursor + delta));
    if (hasRuntimeHandlers) {
      runtimeHandlers.onPausePlaying?.();
      runtimeHandlers.onSeekFrame?.(nextFrame);
      return;
    }
    setInternalIsPlaying(false);
    setInternalCursorFrame(nextFrame);
  };

  const compactBtnClass = `flex-1 min-w-0 whitespace-nowrap inline-flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
    controlsDisabled
      ? isLight
        ? 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-45 cursor-not-allowed pointer-events-none'
        : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 opacity-45 cursor-not-allowed pointer-events-none'
      : isLight
      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 cursor-pointer active:scale-95'
      : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-100 cursor-pointer active:scale-95'
  }`;

  const backToReplayDisabled = controlsDisabled || !isIntervening;

  const bindPushHandlers = (startFn?: () => void, stopFn?: () => void) =>
    controlsDisabled || !hasRuntimeHandlers
      ? {}
      : {
          onMouseDown: () => startFn?.(),
          onMouseUp: () => stopFn?.(),
          onMouseLeave: () => stopFn?.(),
          onTouchStart: () => startFn?.(),
          onTouchEnd: () => stopFn?.(),
        };

  return (
    <div className="p-3.5 flex flex-col gap-3 text-xs select-none">
      <ReplayViewerLoadActionsHeader
        isLight={isLight}
        isLoadingReplay={Boolean(isLoadingReplay)}
        loadRecentDisabled={loadRecentDisabled}
        hasRuntimeHandlers={hasRuntimeHandlers}
        onUploadFile={(file) => runtimeHandlers.onUploadReplayFile?.(file)}
        onLoadRecent={() => {
          if (hasRuntimeHandlers) {
            runtimeHandlers.onLoadRetainedMatchReplay?.();
          } else {
            const nextIdx = (clipIndex + 1) % RECENT_CLIPS.length;
            setClipIndex(nextIdx);
            setInternalCursorFrame(360);
            setInternalIsIntervening(false);
            quickNotification.info(`Loaded recent replay: ${RECENT_CLIPS[nextIdx].name}`);
          }
        }}
      />

      {/* 2. L5 MultiTrackReplayTimeline (File Name, Frame Readout & 3 Synchronized Tracks) */}
      <MultiTrackReplayTimeline
        variant="tracks-only"
        disabled={controlsDisabled}
        fileName={fileName}
        totalFrames={totalFrames}
        cursorFrame={clampedCursor}
        isIntervening={isIntervening}
        incidentMarkers={incidentMarkers}
        signalMarkers={signalMarkers}
        onSeekFrame={handleSeek}
        isLight={isLight}
      />

      {/* 3. Four Transport Buttons with Hotkey Badges: Play, Pause, Rewind, Forward */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => {
            if (controlsDisabled) return;
            if (hasRuntimeHandlers) {
              runtimeHandlers.onStartPlaying?.();
            } else {
              setInternalIsPlaying(true);
            }
          }}
          className={compactBtnClass}
          title="Play replay (Hotkey: O)"
        >
          <Play className="h-3 w-3 fill-current text-amber-500 shrink-0" />
          <span>Play</span>
          <KeycapBadge label="O" size="sm" isLight={isLight} />
        </button>

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => {
            if (controlsDisabled) return;
            if (hasRuntimeHandlers) {
              runtimeHandlers.onPausePlaying?.();
            } else {
              setInternalIsPlaying(false);
            }
          }}
          className={compactBtnClass}
          title="Pause replay (Hotkey: P)"
        >
          <Pause className="h-3 w-3 shrink-0" />
          <span>Pause</span>
          <KeycapBadge label="P" size="sm" isLight={isLight} />
        </button>

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={(e) => {
            if (!hasRuntimeHandlers || e.detail === 0) {
              handleStep(-Math.max(1, Math.round(effectiveSpeedPct / 100)));
            }
          }}
          {...bindPushHandlers(
            runtimeHandlers.onPushBackwardStart,
            runtimeHandlers.onPushBackwardStop
          )}
          className={compactBtnClass}
          title="Rewind (Hotkey: [)"
        >
          <Rewind className="h-3 w-3 shrink-0" />
          <span>Rewind</span>
          <KeycapBadge label="[" size="sm" isLight={isLight} />
        </button>

        <button
          type="button"
          disabled={controlsDisabled}
          onClick={(e) => {
            if (!hasRuntimeHandlers || e.detail === 0) {
              handleStep(Math.max(1, Math.round(effectiveSpeedPct / 100)));
            }
          }}
          {...bindPushHandlers(
            runtimeHandlers.onPushForwardStart,
            runtimeHandlers.onPushForwardStop
          )}
          className={compactBtnClass}
          title="Forward (Hotkey: ])"
        >
          <FastForward className="h-3 w-3 shrink-0" />
          <span>Forward</span>
          <KeycapBadge label="]" size="sm" isLight={isLight} />
        </button>
      </div>

      <ReplayViewerTransportBar
        isLight={isLight}
        controlsDisabled={controlsDisabled}
        backToReplayDisabled={backToReplayDisabled}
        playbackPreset={playbackPreset}
        customSpeedPct={customSpeedPct}
        downCounter={downCounter}
        clampedCursor={clampedCursor}
        cursorSec={cursorSec}
        onPresetSelect={(nextPreset) => setFlowPreset(nextPreset)}
        onCustomSpeedSelect={(nextPct) => setCustomFlowPct(nextPct)}
        onInterveneClick={() => {
          if (controlsDisabled) return;
          if (hasRuntimeHandlers) {
            runtimeHandlers.onResumeFromHere?.();
          } else {
            setInternalIsPlaying(false);
            setInternalIsIntervening(true);
            quickNotification.success(
              `Intervening from frame #${clampedCursor} (${cursorSec}s, Down Counter: ${downCounter}s).`
            );
          }
        }}
        onBackToReplayClick={() => {
          if (backToReplayDisabled) return;
          if (hasRuntimeHandlers) {
            (runtimeHandlers.onReturnToReplay ?? runtimeHandlers.onPausePlaying)?.();
          } else {
            setInternalIsIntervening(false);
            quickNotification.info('Returned to replay playback mode.');
          }
        }}
        onDownCounterSelect={(nextDown) => {
          setDownCounterSec((Number(nextDown) || 0) as ReplayDownCounterOption);
        }}
      />
    </div>
  );
});
ReplayViewerFloatingWindow.displayName = 'ReplayViewerFloatingWindow';
export default ReplayViewerFloatingWindow;
