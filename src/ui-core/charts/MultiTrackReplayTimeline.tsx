import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Film, Play, Pause, Rewind, FastForward, Timer } from 'lucide-react';
import { SegmentedSwitch } from '../primitives/SegmentedSwitch';
import { SliderControl } from '../primitives/SliderControl';
import { Badge } from '../primitives/Badge';
import { KeycapBadge } from '../primitives/KeycapBadge';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import {
  MultiTrackReplayTracksOnlyView,
  type ReplayIncidentMarker,
  type ReplaySignalMarker,
  type ReplayNativeEventMarker,
  type ReplayKeyframeMarker,
} from './MultiTrackReplayTracksOnlyView';
import { ReplayTimelineMarkersAndRuler } from './ReplayTimelineMarkersAndRuler';

export const ALPHA_COMPONENT_ID = 'Alpha:MultiTrackReplayTimeline' as const;

export type {
  ReplayIncidentMarker,
  ReplaySignalMarker,
  ReplayNativeEventMarker,
  ReplayKeyframeMarker,
};

export const DEFAULT_REPLAY_INCIDENT_MARKERS: ReplayIncidentMarker[] = [
  { frameIndex: 145, type: 'touch', label: 'First Touch (Diagonal Kickoff)' },
  { frameIndex: 420, type: 'demo', label: 'Supersonic Demolition' },
  { frameIndex: 790, type: 'save', label: 'Epic Crossbar Save' },
  { frameIndex: 1180, type: 'goal', label: 'Goal Scored (114 KM/H)' },
];

export const DEFAULT_REPLAY_SIGNAL_MARKERS: ReplaySignalMarker[] = [
  { frameIndex: 60, type: 'kickoff', label: 'Kickoff Go Signal' },
  { frameIndex: 1180, type: 'score', label: 'Score Event Signal' },
  { frameIndex: 1400, type: 'end', label: 'Replay Clip Boundary', synthesized: true },
];

export type ReplayDownCounterSec = 3 | 2 | 1 | 0;
export type ReplayFlowPresetId = '100' | '50' | '200' | '500' | 'custom';

export interface MultiTrackReplayTimelineHandle {
  setCursorFrame: (frameIndex: number) => void;
}

export interface MultiTrackReplayTimelineProps {
  fileName?: string;
  totalFrames?: number;
  cursorFrame?: number;
  isIntervening?: boolean;
  incidentMarkers?: ReplayIncidentMarker[];
  signalMarkers?: ReplaySignalMarker[];
  nativeEventMarkers?: ReplayNativeEventMarker[];
  keyframeMarkers?: ReplayKeyframeMarker[];
  showNativeTracks?: boolean;
  variant?: 'card' | 'tracks-only';
  disabled?: boolean;
  onSeekFrame?: (frameIndex: number) => void;
  isLight?: boolean;
  className?: string;
}

export const MultiTrackReplayTimeline = React.memo(
  forwardRef<MultiTrackReplayTimelineHandle, MultiTrackReplayTimelineProps>(
    (props, ref) => {
      const {
        fileName = 'match_2026_finals_ot.rcreplay.gz',
        totalFrames = 1440,
        cursorFrame: controlledCursorFrame,
        isIntervening = false,
        incidentMarkers = DEFAULT_REPLAY_INCIDENT_MARKERS,
        signalMarkers = DEFAULT_REPLAY_SIGNAL_MARKERS,
        nativeEventMarkers = [],
        keyframeMarkers = [],
        showNativeTracks = false,
        variant = 'card',
        disabled = false,
        onSeekFrame,
        isLight = true,
        className = '',
      } = props;
      const initialCursorFrame = 540;

      const [isPlaying, setIsPlaying] = useState(false);
      const [downCounterSec, setDownCounterSec] = useState<ReplayDownCounterSec>(0);
      const [flowPreset, setFlowPreset] = useState<ReplayFlowPresetId>('100');
      const [customFlowPct, setCustomFlowPct] = useState(80);

      const isTrackDisabled = disabled || totalFrames <= 0;
      const effectiveInitialFrame = isTrackDisabled ? 0 : (controlledCursorFrame ?? initialCursorFrame);
      const cursorFrameRef = useRef(effectiveInitialFrame);
      const cursorTextRef = useRef<HTMLSpanElement | null>(null);
      const trackAFillRef = useRef<HTMLDivElement | null>(null);
      const trackBCursorRef = useRef<HTMLDivElement | null>(null);
      const trackCCursorRef = useRef<HTMLDivElement | null>(null);
      const trackDCursorRef = useRef<HTMLDivElement | null>(null);
      const trackECursorRef = useRef<HTMLDivElement | null>(null);

      const effectiveFlowPct = flowPreset === 'custom' ? customFlowPct : Number(flowPreset);
      const isTracksOnly = variant === 'tracks-only';
      const denomFrames = isTracksOnly ? Math.max(1, totalFrames) : Math.max(1, totalFrames - 1);

      const applyCursorToDom = useCallback(
        (frameIdx: number) => {
          if (isTrackDisabled) {
            cursorFrameRef.current = 0;
            if (trackAFillRef.current) trackAFillRef.current.style.width = '0%';
            if (trackBCursorRef.current) trackBCursorRef.current.style.left = '0%';
            if (trackCCursorRef.current) trackCCursorRef.current.style.left = '0%';
            if (trackDCursorRef.current) trackDCursorRef.current.style.left = '0%';
            if (trackECursorRef.current) trackECursorRef.current.style.left = '0%';
            if (cursorTextRef.current) cursorTextRef.current.textContent = 'Frame #0 (0.00s)';
            return;
          }
          const maxF = isTracksOnly ? totalFrames : Math.max(1, totalFrames - 1);
          const clamped = Math.max(0, Math.min(maxF, Math.round(frameIdx)));
          cursorFrameRef.current = clamped;
          const pct = (clamped / denomFrames) * 100;

          if (trackAFillRef.current) trackAFillRef.current.style.width = `${pct}%`;
          if (trackBCursorRef.current) trackBCursorRef.current.style.left = `${pct}%`;
          if (trackCCursorRef.current) trackCCursorRef.current.style.left = `${pct}%`;
          if (trackDCursorRef.current) trackDCursorRef.current.style.left = `${pct}%`;
          if (trackECursorRef.current) trackECursorRef.current.style.left = `${pct}%`;
          if (cursorTextRef.current) {
            const text = `Frame #${clamped} (${(clamped / 120).toFixed(2)}s)`;
            if (cursorTextRef.current.textContent !== text) {
              cursorTextRef.current.textContent = text;
            }
          }
        },
        [totalFrames, denomFrames, isTracksOnly, isTrackDisabled]
      );

      useImperativeHandle(ref, () => ({ setCursorFrame: applyCursorToDom }), [applyCursorToDom]);

      useEffect(() => {
        applyCursorToDom(controlledCursorFrame ?? initialCursorFrame);
      }, [controlledCursorFrame, initialCursorFrame, applyCursorToDom]);

      useEffect(() => {
        if (!isPlaying || isTracksOnly || isTrackDisabled) return;
        const stepFrames = Math.max(1, Math.round((4 * effectiveFlowPct) / 100));
        const id = window.setInterval(() => {
          const next = (cursorFrameRef.current + stepFrames) % Math.max(1, totalFrames);
          applyCursorToDom(next);
        }, 33);
        return () => window.clearInterval(id);
      }, [isPlaying, isTracksOnly, isTrackDisabled, effectiveFlowPct, totalFrames, applyCursorToDom]);

      const handleTrackSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isTrackDisabled) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
        const target = Math.round(ratio * denomFrames);
        applyCursorToDom(target);
        onSeekFrame?.(target);
      };

      const stepRelative = (deltaFrames: number) => {
        if (isTrackDisabled) return;
        const next = Math.max(0, Math.min(denomFrames, cursorFrameRef.current + deltaFrames));
        applyCursorToDom(next);
        onSeekFrame?.(next);
      };

      if (isTracksOnly) {
        return (
          <MultiTrackReplayTracksOnlyView
            fileName={fileName}
            totalFrames={totalFrames}
            denomFrames={denomFrames}
            effectiveInitialFrame={effectiveInitialFrame}
            isIntervening={isIntervening}
            isTrackDisabled={isTrackDisabled}
            isLight={isLight}
            className={className}
            incidentMarkers={incidentMarkers}
            signalMarkers={signalMarkers}
            nativeEventMarkers={nativeEventMarkers}
            keyframeMarkers={keyframeMarkers}
            showNativeTracks={showNativeTracks}
            trackRefs={{
              trackAFillRef,
              trackBCursorRef,
              trackCCursorRef,
              trackDCursorRef,
              trackECursorRef,
            }}
            handleTrackSeek={handleTrackSeek}
            applyCursorToDom={applyCursorToDom}
            onSeekFrame={onSeekFrame}
          />
        );
      }

      return (
        <div
          data-alpha-id={ALPHA_COMPONENT_ID}
          data-ui-element="chart-multitrack-replay-timeline"
          className={`flex flex-col gap-3 p-4 ${UI_RADIUS.panel} border select-none ${
            isLight
              ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-xs`
              : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary} shadow-lg`
          } ${className}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Film className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="font-bold text-xs truncate">
                3-Track Synchronized Replay Timeline ({fileName})
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant={isPlaying ? 'success' : 'neutral'} size="sm" isLight={isLight} className="font-mono">
                {isPlaying ? 'PLAYING 120HZ' : 'PAUSED'}
              </Badge>
              <Badge variant="primary" size="sm" isLight={isLight} className="font-mono">
                {totalFrames}f ({(totalFrames / 120).toFixed(1)}s)
              </Badge>
            </div>
          </div>

          <ReplayTimelineMarkersAndRuler
            totalFrames={totalFrames}
            effectiveInitialFrame={effectiveInitialFrame}
            downCounterSec={downCounterSec}
            incidentMarkers={incidentMarkers}
            signalMarkers={signalMarkers}
            cursorTextRef={cursorTextRef}
            trackRefs={{ trackAFillRef, trackBCursorRef, trackCCursorRef }}
            isLight={isLight}
            onTrackSeek={handleTrackSeek}
            onMarkerSelect={(frameIndex) => {
              applyCursorToDom(frameIndex);
              onSeekFrame?.(frameIndex);
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className={`flex-1 py-1.5 px-3 ${UI_RADIUS.card} font-bold text-xs flex items-center justify-between bg-amber-500 hover:bg-amber-400 text-neutral-950 cursor-pointer transition-colors`}
              >
                <span className="flex items-center gap-1.5">
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </span>
                <KeycapBadge shortcut="P" size="sm" isLight={isLight} />
              </button>

              {([-60, 60] as const).map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => stepRelative(delta)}
                  className={`py-1.5 px-2.5 ${UI_RADIUS.card} border text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                    isLight ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300' : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
                  }`}
                  title={delta < 0 ? 'Step Back 0.5s (-60f)' : 'Step Forward 0.5s (+60f)'}
                >
                  {delta < 0 ? <Rewind className="h-3.5 w-3.5" /> : <FastForward className="h-3.5 w-3.5" />}
                  <span>{delta > 0 ? `+${delta}f` : `${delta}f`}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-xs font-semibold shrink-0">
                <Timer className="h-3.5 w-3.5 text-amber-500" />
                <span>Down Counter</span>
              </span>
              <SegmentedSwitch
                value={String(downCounterSec)}
                size="sm"
                isLight={isLight}
                onValueChange={(v) => setDownCounterSec(Number(v) as ReplayDownCounterSec)}
                options={[
                  { value: '3', label: '3 (-4s)' },
                  { value: '2', label: '2 (-3s)' },
                  { value: '1', label: '1 (-2s)' },
                  { value: '0', label: '0 (-1s)' },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1 border-t border-neutral-500/15">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                Playback Flow Speed ({effectiveFlowPct}% · {Math.round((120 * effectiveFlowPct) / 100)} fps)
              </span>
              <div className="flex items-center gap-2">
                <SegmentedSwitch
                  value={flowPreset}
                  size="sm"
                  isLight={isLight}
                  onValueChange={(v) => setFlowPreset(v as ReplayFlowPresetId)}
                  options={[
                    { value: '100', label: '100%' },
                    { value: '50', label: '50%' },
                    { value: '200', label: '200%' },
                    { value: '500', label: '500%' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
            </div>

            {flowPreset === 'custom' && (
              <SliderControl
                label="Custom Flow Speed"
                value={customFlowPct}
                min={1}
                max={500}
                step={1}
                unit="%"
                isLight={isLight}
                onChange={setCustomFlowPct}
              />
            )}
          </div>
        </div>
      );
    }
  )
);

MultiTrackReplayTimeline.displayName = 'MultiTrackReplayTimeline';
