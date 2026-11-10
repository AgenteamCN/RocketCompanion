import React, { useMemo } from 'react';
import {
  Activity,
  Bot,
  FastForward,
  Pause,
  Play,
  Rewind,
} from 'lucide-react';
import {
  MultiTrackReplayTimeline,
  type ReplayIncidentMarker as ChartIncidentMarker,
  type ReplaySignalMarker as ChartSignalMarker,
} from '../../charts/MultiTrackReplayTimeline';
import { KeycapBadge } from '../../primitives/KeycapBadge';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import {
  ReplayViewerTransportBar,
  type DownCounterOption,
  type PlaybackSpeedPreset,
} from '../user/ReplayViewerTransportBar';
import {
  useReplayToRcsImporterStore,
  type RLReplayInterpolationMethod,
  type RLReplayNonPovInterventionMode,
} from '../../stores/replayToRcsImporterStore';
import type { ReplayDownCounterOption } from '../../stores/replayViewerStore';
import { ReplayToRcsHeaderAndDeltaSection } from './replay-to-rcs-importer/ReplayToRcsHeaderAndDeltaSection';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'replay-to-rcs-importer',
  title: 'Replay to RCS Replay Importer',
  layer: 'floating-dev',
  menuGroup: 'sandboxes',
  defaultSizing: {
    width: 495,
    height: 660,
    minHeight: 220,
    mode: 'adaptive',
  },
};

export interface ReplayToRcsImporterFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

/**
 * [Developer Sandbox] Replay to RCS Replay Importer (`replay-to-rcs-importer`)
 * Dedicated floating window panel adapted from ReplayViewerFloatingWindow.
 * Supports importing raw Rocket League `.replay` files, upsampling 30Hz -> 120Hz via
 * StateInterpolationPipeline, inspecting Track Delta (native telemetry & unmapped properties),
 * intervening with selectable non-POV car behavior (Disappear | Trajectory | Nexto | Necto),
 * and exporting the converted session as an RCS Replay Pack (`.rcreplay.gz`).
 */
export const ReplayToRcsImporterFloatingWindow: React.FC<ReplayToRcsImporterFloatingWindowProps> =
  React.memo(({ isLight = false }) => {
    const {
      viewerState,
      loadedFileName,
      totalFrames,
      cursorFrame,
      incidentMarkers,
      signalMarkers,
      nativeEventMarkers,
      keyframeMarkers,
      interpolationMethod,
      nonPovInterventionMode,
      downCounterSec,
      flowPreset,
      customFlowPct,
      effectiveFlowPct,
      isLoadingReplay,
      setDownCounterSec,
      setFlowPreset,
      setCustomFlowPct,
      setInterpolationMethod,
      setNonPovInterventionMode,
      runtimeHandlers,
    } = useReplayToRcsImporterStore();

    const hasLoadedReplay = Boolean(loadedFileName && totalFrames > 0);
    const controlsDisabled = isLoadingReplay || !hasLoadedReplay || totalFrames <= 0;
    const isIntervening =
      viewerState === 'preroll-countdown' || viewerState === 'intervening';
    const backToReplayDisabled = controlsDisabled || !isIntervening;

    const clampedCursor = controlsDisabled ? 0 : Math.max(0, Math.min(totalFrames, cursorFrame));
    const cursorSec = (clampedCursor / 120).toFixed(2);

    const mappedIncidentMarkers = useMemo<ChartIncidentMarker[]>(
      () =>
        incidentMarkers.map((m) => ({
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
      [incidentMarkers]
    );

    const mappedSignalMarkers = useMemo<ChartSignalMarker[]>(
      () =>
        signalMarkers.map((m) => ({
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
      [signalMarkers]
    );

    const compactBtnClass = `flex-1 min-w-0 whitespace-nowrap inline-flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
      controlsDisabled
        ? isLight
          ? 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-45 cursor-not-allowed pointer-events-none'
          : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 opacity-45 cursor-not-allowed pointer-events-none'
        : isLight
        ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 cursor-pointer active:scale-95'
        : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-100 cursor-pointer active:scale-95'
    }`;

    const handleStep = (delta: number) => {
      if (controlsDisabled) return;
      runtimeHandlers.onPausePlaying?.();
      const nextFrame = Math.max(0, Math.min(totalFrames, clampedCursor + delta));
      runtimeHandlers.onSeekFrame?.(nextFrame);
    };

    return (
      <div className="p-3.5 flex flex-col gap-3 text-xs select-none">
        <ReplayToRcsHeaderAndDeltaSection
          isLight={isLight}
          controlsDisabled={controlsDisabled}
        />

        {/* 2. L5 MultiTrackReplayTimeline (5-Track Importer View) */}
        <MultiTrackReplayTimeline
          variant="tracks-only"
          showNativeTracks
          disabled={controlsDisabled}
          fileName={hasLoadedReplay && loadedFileName ? loadedFileName : 'No .replay file imported'}
          totalFrames={hasLoadedReplay ? totalFrames : 0}
          cursorFrame={clampedCursor}
          isIntervening={isIntervening}
          incidentMarkers={hasLoadedReplay ? mappedIncidentMarkers : []}
          signalMarkers={hasLoadedReplay ? mappedSignalMarkers : []}
          nativeEventMarkers={hasLoadedReplay ? nativeEventMarkers : []}
          keyframeMarkers={hasLoadedReplay ? keyframeMarkers : []}
          onSeekFrame={(nextFrame) => runtimeHandlers.onSeekFrame?.(nextFrame)}
          isLight={isLight}
        />

        {/* 4. Four Transport Buttons with Hotkey Badges: Play, Pause, Rewind, Forward */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={() => runtimeHandlers.onStartPlaying?.()}
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
            onClick={() => runtimeHandlers.onPausePlaying?.()}
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
              if (e.detail === 0) {
                handleStep(-Math.max(1, Math.round(effectiveFlowPct / 100)));
              }
            }}
            onMouseDown={controlsDisabled ? undefined : () => runtimeHandlers.onPushBackwardStart?.()}
            onMouseUp={controlsDisabled ? undefined : () => runtimeHandlers.onPushBackwardStop?.()}
            onMouseLeave={controlsDisabled ? undefined : () => runtimeHandlers.onPushBackwardStop?.()}
            onTouchStart={controlsDisabled ? undefined : () => runtimeHandlers.onPushBackwardStart?.()}
            onTouchEnd={controlsDisabled ? undefined : () => runtimeHandlers.onPushBackwardStop?.()}
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
              if (e.detail === 0) {
                handleStep(Math.max(1, Math.round(effectiveFlowPct / 100)));
              }
            }}
            onMouseDown={controlsDisabled ? undefined : () => runtimeHandlers.onPushForwardStart?.()}
            onMouseUp={controlsDisabled ? undefined : () => runtimeHandlers.onPushForwardStop?.()}
            onMouseLeave={controlsDisabled ? undefined : () => runtimeHandlers.onPushForwardStop?.()}
            onTouchStart={controlsDisabled ? undefined : () => runtimeHandlers.onPushForwardStart?.()}
            onTouchEnd={controlsDisabled ? undefined : () => runtimeHandlers.onPushForwardStop?.()}
            className={compactBtnClass}
            title="Forward (Hotkey: ])"
          >
            <FastForward className="h-3 w-3 shrink-0" />
            <span>Forward</span>
            <KeycapBadge label="]" size="sm" isLight={isLight} />
          </button>
        </div>

        {/* 5. 30Hz -> 120Hz Interpolation Algorithm Selector */}
        <SettingActionRow
          icon={Activity}
          title="30Hz -> 120Hz Interpolation"
          bordered={false}
          showDescription={false}
          paddingX={4}
          paddingY={2}
          disabled={isLoadingReplay}
          isLight={isLight}
          rightSlot={
            <SegmentedSwitch
              value={interpolationMethod}
              size="sm"
              disabled={isLoadingReplay}
              isLight={isLight}
              onValueChange={(v) => setInterpolationMethod(v as RLReplayInterpolationMethod)}
              options={[
                { value: 'hermite-clamped', label: 'Hermite + SLERP' },
                { value: 'linear', label: 'Linear + SLERP' },
              ]}
            />
          }
        />

        {/* 6. Non-POV Vehicles Behavior on Intervene */}
        <SettingActionRow
          icon={Bot}
          title="Non-POV Cars on Intervene"
          bordered={false}
          showDescription={false}
          paddingX={4}
          paddingY={2}
          disabled={controlsDisabled}
          isLight={isLight}
          rightSlot={
            <SegmentedSwitch
              value={nonPovInterventionMode}
              size="sm"
              disabled={controlsDisabled}
              isLight={isLight}
              onValueChange={(v) =>
                setNonPovInterventionMode(v as RLReplayNonPovInterventionMode)
              }
              options={[
                { value: 'disappear', label: 'Disappear' },
                { value: 'trajectory', label: 'Trajectory' },
                { value: 'nexto', label: 'Nexto' },
                { value: 'necto', label: 'Necto' },
              ]}
            />
          }
        />

        {/* 7. Shared Transport Bar (Playback Speed, Intervene from here / Back to replay, Down Counter) */}
        <ReplayViewerTransportBar
          isLight={isLight}
          controlsDisabled={controlsDisabled}
          backToReplayDisabled={backToReplayDisabled}
          playbackPreset={flowPreset as PlaybackSpeedPreset}
          customSpeedPct={customFlowPct}
          downCounter={String(downCounterSec) as DownCounterOption}
          clampedCursor={clampedCursor}
          cursorSec={cursorSec}
          onPresetSelect={(nextPreset) => setFlowPreset(nextPreset)}
          onCustomSpeedSelect={(nextPct) => setCustomFlowPct(nextPct)}
          onInterveneClick={() => {
            if (controlsDisabled) return;
            runtimeHandlers.onResumeFromHere?.();
          }}
          onBackToReplayClick={() => {
            if (backToReplayDisabled) return;
            runtimeHandlers.onReturnToReplay?.();
          }}
          onDownCounterSelect={(nextDown) =>
            setDownCounterSec((Number(nextDown) || 0) as ReplayDownCounterOption)
          }
        />
      </div>
    );
  });
ReplayToRcsImporterFloatingWindow.displayName = 'ReplayToRcsImporterFloatingWindow';

export default ReplayToRcsImporterFloatingWindow;
