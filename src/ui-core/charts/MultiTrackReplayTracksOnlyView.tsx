import React, { useMemo } from 'react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:MultiTrackReplayTracksOnlyView' as const;

export interface ReplayIncidentMarker {
  frameIndex: number;
  type: 'goal' | 'demo' | 'touch' | 'save';
  label: string;
}

export interface ReplaySignalMarker {
  frameIndex: number;
  type: 'score' | 'kickoff' | 'end';
  label: string;
  synthesized?: boolean;
}

export interface ReplayNativeEventMarker {
  frameIndex: number;
  kind: 'goal' | 'save' | 'demolish' | 'user-mark';
  label: string;
}

export interface ReplayKeyframeMarker {
  frameIndex: number;
  kind: 'ue-keyframe' | 'kickoff';
  label: string;
}

export interface MultiTrackReplayDomRefs {
  trackAFillRef: React.RefObject<HTMLDivElement | null>;
  trackBCursorRef: React.RefObject<HTMLDivElement | null>;
  trackCCursorRef: React.RefObject<HTMLDivElement | null>;
  trackDCursorRef?: React.RefObject<HTMLDivElement | null>;
  trackECursorRef?: React.RefObject<HTMLDivElement | null>;
}

export interface MultiTrackReplayTracksOnlyViewProps {
  fileName: string;
  totalFrames: number;
  denomFrames: number;
  effectiveInitialFrame: number;
  isIntervening: boolean;
  isTrackDisabled: boolean;
  isLight: boolean;
  className: string;
  incidentMarkers: ReplayIncidentMarker[];
  signalMarkers: ReplaySignalMarker[];
  nativeEventMarkers?: ReplayNativeEventMarker[];
  keyframeMarkers?: ReplayKeyframeMarker[];
  showNativeTracks?: boolean;
  trackRefs: MultiTrackReplayDomRefs;
  handleTrackSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  applyCursorToDom: (frameIndex: number) => void;
  onSeekFrame?: (frameIndex: number) => void;
}

export const MultiTrackReplayTracksOnlyView: React.FC<MultiTrackReplayTracksOnlyViewProps> = React.memo(({
  fileName,
  totalFrames,
  denomFrames,
  effectiveInitialFrame,
  isIntervening,
  isTrackDisabled,
  isLight,
  className,
  incidentMarkers,
  signalMarkers,
  nativeEventMarkers = [],
  keyframeMarkers = [],
  showNativeTracks = false,
  trackRefs: { trackAFillRef, trackBCursorRef, trackCCursorRef, trackDCursorRef, trackECursorRef },
  handleTrackSeek,
  applyCursorToDom,
  onSeekFrame,
}) => {
  const trackBgClass = isLight ? 'bg-neutral-200/90' : 'bg-neutral-800/95';
  const cursorLineClass = isLight ? 'bg-neutral-900' : 'bg-white';
  const clampedCursor = isTrackDisabled ? 0 : Math.max(0, Math.min(totalFrames, effectiveInitialFrame));
  const cursorSec = (clampedCursor / 120).toFixed(2);
  const totalSec = (Math.max(0, totalFrames) / 120).toFixed(2);
  const cursorPct = isTrackDisabled ? 0 : (clampedCursor / denomFrames) * 100;
  const trackInteractiveCls = isTrackDisabled
    ? 'cursor-not-allowed pointer-events-none opacity-50'
    : 'cursor-pointer';

  const renderedIncidentMarkers = useMemo(() => {
    if (isTrackDisabled) return null;
    return incidentMarkers.map((m, idx) => {
      const leftPct = (m.frameIndex / denomFrames) * 100;
      const colorCls =
        m.type === 'goal'
          ? 'bg-emerald-500 w-1.5 z-10'
          : m.type === 'demo'
          ? 'bg-rose-500 w-1'
          : m.type === 'save'
          ? 'bg-sky-500 w-1'
          : 'bg-amber-500 w-0.5';
      return (
        <div
          key={`${m.frameIndex}-${idx}`}
          style={{ left: `${leftPct}%` }}
          onClick={(e) => {
            e.stopPropagation();
            applyCursorToDom(m.frameIndex);
            onSeekFrame?.(m.frameIndex);
          }}
          className={`absolute top-0 bottom-0 ${colorCls}`}
          title={`${m.label} @ #${m.frameIndex}`}
        />
      );
    });
  }, [isTrackDisabled, incidentMarkers, denomFrames, applyCursorToDom, onSeekFrame]);

  const renderedSignalMarkers = useMemo(() => {
    if (isTrackDisabled) return null;
    return signalMarkers.map((s, idx) => {
      const leftPct = (s.frameIndex / denomFrames) * 100;
      const colorCls =
        s.type === 'score'
          ? 'bg-emerald-500 w-1.5'
          : s.type === 'end'
          ? 'bg-violet-500 w-1'
          : 'bg-sky-500 w-1';
      return (
        <div
          key={`${s.frameIndex}-${idx}`}
          style={{ left: `${leftPct}%` }}
          onClick={(e) => {
            e.stopPropagation();
            applyCursorToDom(s.frameIndex);
            onSeekFrame?.(s.frameIndex);
          }}
          className={`absolute top-0 bottom-0 ${colorCls}`}
          title={`${s.label} @ #${s.frameIndex}`}
        />
      );
    });
  }, [isTrackDisabled, signalMarkers, denomFrames, applyCursorToDom, onSeekFrame]);

  const renderedNativeEventMarkers = useMemo(() => {
    if (isTrackDisabled || !showNativeTracks) return null;
    return nativeEventMarkers.map((n, idx) => {
      const leftPct = (n.frameIndex / denomFrames) * 100;
      const colorCls =
        n.kind === 'goal'
          ? 'bg-amber-400 w-1.5 z-10'
          : n.kind === 'save'
          ? 'bg-emerald-400 w-1'
          : n.kind === 'demolish'
          ? 'bg-rose-500 w-1'
          : 'bg-fuchsia-400 w-1';
      return (
        <div
          key={`native-${n.frameIndex}-${idx}`}
          style={{ left: `${leftPct}%` }}
          onClick={(e) => {
            e.stopPropagation();
            applyCursorToDom(n.frameIndex);
            onSeekFrame?.(n.frameIndex);
          }}
          className={`absolute top-0 bottom-0 ${colorCls}`}
          title={`${n.label} @ #${n.frameIndex}`}
        />
      );
    });
  }, [isTrackDisabled, showNativeTracks, nativeEventMarkers, denomFrames, applyCursorToDom, onSeekFrame]);

  const renderedKeyframeMarkers = useMemo(() => {
    if (isTrackDisabled || !showNativeTracks) return null;
    return keyframeMarkers.map((k, idx) => {
      const leftPct = (k.frameIndex / denomFrames) * 100;
      const colorCls = k.kind === 'kickoff' ? 'bg-sky-400 w-1 z-10' : 'bg-cyan-500/80 w-0.5';
      return (
        <div
          key={`kf-${k.frameIndex}-${idx}`}
          style={{ left: `${leftPct}%` }}
          onClick={(e) => {
            e.stopPropagation();
            applyCursorToDom(k.frameIndex);
            onSeekFrame?.(k.frameIndex);
          }}
          className={`absolute top-0 bottom-0 ${colorCls}`}
          title={`${k.label} @ #${k.frameIndex}`}
        />
      );
    });
  }, [isTrackDisabled, showNativeTracks, keyframeMarkers, denomFrames, applyCursorToDom, onSeekFrame]);

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-ui-element="chart-multitrack-replay-timeline"
      aria-disabled={isTrackDisabled}
      className={`p-3 ${UI_RADIUS.card} border flex flex-col gap-2 font-mono select-none ${
        isLight
          ? `bg-neutral-50 ${UI_THEME.light.border} ${UI_THEME.light.textPrimary}`
          : `bg-neutral-900/70 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
      } ${isTrackDisabled ? 'opacity-60' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span data-allow-truncate="true" className="font-bold text-xs truncate">
          {fileName}
        </span>
        {isIntervening && !isTrackDisabled && (
          <span className="text-[10px] font-bold uppercase text-amber-500 shrink-0">
            Live Intervention
          </span>
        )}
      </div>

      <div className="text-[11px] tabular-nums opacity-90">
        Frame <strong>{clampedCursor}</strong> ({cursorSec}s) /{' '}
        <strong>{totalFrames}</strong> ({totalSec}s)
      </div>

      <div className="flex flex-col gap-1.5 pt-0.5">
        <div
          onClick={handleTrackSeek}
          title="Track 1 · Physics State & Player Input (Click to seek)"
          className={`w-full h-3 rounded-full overflow-hidden relative ${trackInteractiveCls} ${trackBgClass}`}
        >
          <div
            ref={trackAFillRef}
            className="h-full bg-amber-500"
            style={{ width: `${cursorPct}%` }}
          />
        </div>

        <div
          onClick={handleTrackSeek}
          title="Track 2 · Arena Incidents (Touch / Demo / Save / Goal)"
          className={`w-full h-3 rounded-full overflow-hidden relative ${trackInteractiveCls} ${trackBgClass}`}
        >
          {renderedIncidentMarkers}
          {!isTrackDisabled && (
            <div
              ref={trackBCursorRef}
              style={{ left: `${cursorPct}%` }}
              className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${cursorLineClass}`}
            />
          )}
        </div>

        <div
          onClick={handleTrackSeek}
          title="Track 3 · Match Signals (Kickoff / Score / Boundary)"
          className={`w-full h-3 rounded-full overflow-hidden relative ${trackInteractiveCls} ${trackBgClass}`}
        >
          {renderedSignalMarkers}
          {!isTrackDisabled && (
            <div
              ref={trackCCursorRef}
              style={{ left: `${cursorPct}%` }}
              className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${cursorLineClass}`}
            />
          )}
        </div>

        {showNativeTracks && (
          <>
            <div
              onClick={handleTrackSeek}
              title="Track 4 · Native Replay Events (Goal / Save / Demolish / User Mark)"
              className={`w-full h-3 rounded-full overflow-hidden relative ${trackInteractiveCls} ${trackBgClass}`}
            >
              {renderedNativeEventMarkers}
              {!isTrackDisabled && (
                <div
                  ref={trackDCursorRef}
                  style={{ left: `${cursorPct}%` }}
                  className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${cursorLineClass}`}
                />
              )}
            </div>

            <div
              onClick={handleTrackSeek}
              title="Track 5 · Native UE KeyFrames & Kickoff Bookmarks"
              className={`w-full h-3 rounded-full overflow-hidden relative ${trackInteractiveCls} ${trackBgClass}`}
            >
              {renderedKeyframeMarkers}
              {!isTrackDisabled && (
                <div
                  ref={trackECursorRef}
                  style={{ left: `${cursorPct}%` }}
                  className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${cursorLineClass}`}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

