import React from 'react';
import { UI_RADIUS } from '../tokens/radius';
import type {
  ReplayIncidentMarker,
  ReplaySignalMarker,
} from './MultiTrackReplayTracksOnlyView';

export interface ReplayTrackDomRefs {
  trackAFillRef: React.RefObject<HTMLDivElement | null>;
  trackBCursorRef: React.RefObject<HTMLDivElement | null>;
  trackCCursorRef: React.RefObject<HTMLDivElement | null>;
}

export interface ReplayTimelineMarkersAndRulerProps {
  totalFrames: number;
  effectiveInitialFrame: number;
  downCounterSec: 3 | 2 | 1 | 0;
  incidentMarkers: ReplayIncidentMarker[];
  signalMarkers: ReplaySignalMarker[];
  cursorTextRef: React.RefObject<HTMLSpanElement | null>;
  trackRefs: ReplayTrackDomRefs;
  isLight: boolean;
  onTrackSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMarkerSelect: (frameIndex: number) => void;
}

export const ReplayTimelineMarkersAndRuler: React.FC<ReplayTimelineMarkersAndRulerProps> =
  React.memo(
    ({
      totalFrames,
      effectiveInitialFrame,
      downCounterSec,
      incidentMarkers,
      signalMarkers,
      cursorTextRef,
      trackRefs,
      isLight,
      onTrackSeek,
      onMarkerSelect,
    }) => {
      const trackBgClass = isLight ? 'bg-neutral-200/90' : 'bg-neutral-800/95';
      const cursorLineClass = isLight ? 'bg-neutral-900' : 'bg-white';
      const denom = Math.max(1, totalFrames - 1);

      return (
        <div
          className={`p-3 ${UI_RADIUS.card} border font-mono text-[10px] flex flex-col gap-2.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
              : 'bg-neutral-950/80 border-neutral-800 text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span>
              Playhead: <b ref={cursorTextRef}>Frame #{effectiveInitialFrame}</b>
            </span>
            <span className="text-emerald-500 font-semibold">
              Takeover Preroll: -{downCounterSec + 1}s ({(downCounterSec + 1) * 120}f)
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[9.5px] opacity-80">
              <span>Track A · Physics State + Player Input</span>
              <span>{totalFrames} frames (120Hz)</span>
            </div>
            <div
              onClick={onTrackSeek}
              className={`w-full h-3 ${UI_RADIUS.full} overflow-hidden cursor-pointer relative ${trackBgClass}`}
              title="Click anywhere on Track A to seek frame"
            >
              <div
                ref={trackRefs.trackAFillRef}
                className="h-full bg-amber-500"
                style={{ width: `${(effectiveInitialFrame / denom) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[9.5px] opacity-80">
              <span>Track B · Arena Incidents (Touch / Demo / Save / Goal)</span>
              <span>{incidentMarkers.length} events</span>
            </div>
            <div
              onClick={onTrackSeek}
              className={`w-full h-3 ${UI_RADIUS.full} overflow-hidden cursor-pointer relative ${trackBgClass}`}
            >
              {incidentMarkers.map((m, idx) => {
                const leftPct = (m.frameIndex / denom) * 100;
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
                      onMarkerSelect(m.frameIndex);
                    }}
                    className={`absolute top-0 bottom-0 ${colorCls}`}
                    title={`${m.label} @ #${m.frameIndex}`}
                  />
                );
              })}
              <div
                ref={trackRefs.trackBCursorRef}
                className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${cursorLineClass}`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[9.5px] opacity-80">
              <span>Track C · Match Signals (Kickoff / Score / Boundary)</span>
              <span>{signalMarkers.length} signals</span>
            </div>
            <div
              onClick={onTrackSeek}
              className={`w-full h-3 ${UI_RADIUS.full} overflow-hidden cursor-pointer relative ${trackBgClass}`}
            >
              {signalMarkers.map((s, idx) => {
                const leftPct = (s.frameIndex / denom) * 100;
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
                      onMarkerSelect(s.frameIndex);
                    }}
                    className={`absolute top-0 bottom-0 ${colorCls}`}
                    title={`${s.label} @ #${s.frameIndex}`}
                  />
                );
              })}
              <div
                ref={trackRefs.trackCCursorRef}
                className={`absolute top-0 bottom-0 w-0.5 pointer-events-none ${cursorLineClass}`}
              />
            </div>
          </div>
        </div>
      );
    }
  );

ReplayTimelineMarkersAndRuler.displayName = 'ReplayTimelineMarkersAndRuler';
