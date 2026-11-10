import React from 'react';
import { Crosshair, Layers } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import {
  GOAL_BARRIER_WIDTH_UU,
  GOAL_BARRIER_HEIGHT_UU,
  type NormalizedBarrierRect,
  type GoalBarrierDecomposition,
  type GoalBarrierSelectionMode,
  type GoalBarrierPresetId,
} from './goalBarrierMath';

export const ALPHA_COMPONENT_ID = 'Alpha:GoalBarrierCanvasStage' as const;

export interface GoalBarrierCanvasStageProps {
  isEmbedded: boolean;
  isLight: boolean;
  enabled: boolean;
  opacity: number;
  selectionMode: GoalBarrierSelectionMode;
  goalBoxRef: React.RefObject<HTMLDivElement | null>;
  decomposition: GoalBarrierDecomposition;
  previewRect: NormalizedBarrierRect | null;
  hoverSnapPoint: { u: number; v: number; isClamped: boolean } | null;
  onStageMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onStageMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onStageMouseLeave: () => void;
  onApplyPreset: (preset: GoalBarrierPresetId) => void;
}

export const GoalBarrierCanvasStage: React.FC<GoalBarrierCanvasStageProps> = ({
  isEmbedded,
  isLight,
  enabled,
  opacity,
  selectionMode,
  goalBoxRef,
  decomposition,
  previewRect,
  hoverSnapPoint,
  onStageMouseDown,
  onStageMouseMove,
  onStageMouseLeave,
  onApplyPreset,
}) => {
  return (
    <>
      <div data-alpha-id={ALPHA_COMPONENT_ID} className="flex flex-col gap-1.5">
        <div
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseLeave={onStageMouseLeave}
          className={`relative ${
            isEmbedded ? 'p-5' : 'p-6'
          } ${UI_RADIUS.card} border cursor-crosshair overflow-hidden ${
            isLight
              ? `bg-neutral-100 border-neutral-300`
              : `bg-neutral-950/90 ${UI_THEME.dark.border}`
          }`}
        >
          {!isEmbedded && (
            <div className="absolute top-1.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none text-[9px] font-mono opacity-65">
              <span className="flex items-center gap-1">
                <Crosshair className="h-2.5 w-2.5 text-amber-500" />
                <span>OUTER SNAP ZONE (Drag from outside to snap to goal post/crossbar)</span>
              </span>
              <span>1792 × 644 UU</span>
            </div>
          )}

          <div
            ref={goalBoxRef}
            style={{ aspectRatio: `${GOAL_BARRIER_WIDTH_UU} / ${GOAL_BARRIER_HEIGHT_UU}` }}
            className={`relative w-full ${
              isEmbedded ? '' : 'mt-2'
            } rounded-t-2xl border-2 shadow-inner ${
              isLight
                ? 'bg-neutral-800/95 border-neutral-500/80'
                : 'bg-neutral-900/95 border-neutral-500/80'
            }`}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)',
                backgroundSize: '12.5% 25%',
              }}
            />

            {decomposition.mergedRects.map((r, idx) => (
              <div
                key={`${r.u0}-${r.v0}-${idx}`}
                style={{
                  left: `${r.u0 * 100}%`,
                  top: `${r.v0 * 100}%`,
                  width: `${(r.u1 - r.u0) * 100}%`,
                  height: `${(r.v1 - r.v0) * 100}%`,
                  opacity: enabled ? opacity : 0.2,
                }}
                className="absolute pointer-events-none bg-amber-500/45 border border-amber-400/60"
              />
            ))}

            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {decomposition.contourSegments.map((seg, idx) => (
                <line
                  key={idx}
                  x1={seg.u0 * 100}
                  y1={seg.v0 * 100}
                  x2={seg.u1 * 100}
                  y2={seg.v1 * 100}
                  stroke={enabled ? '#fbbf24' : '#9ca3af'}
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {previewRect && (
              <div
                style={{
                  left: `${previewRect.u0 * 100}%`,
                  top: `${previewRect.v0 * 100}%`,
                  width: `${(previewRect.u1 - previewRect.u0) * 100}%`,
                  height: `${(previewRect.v1 - previewRect.v0) * 100}%`,
                }}
                className={`absolute pointer-events-none border-2 ${
                  selectionMode === 'subtract'
                    ? 'bg-rose-500/35 border-rose-400'
                    : 'bg-emerald-400/35 border-emerald-300'
                }`}
              />
            )}

            {hoverSnapPoint && (
              <div
                style={{
                  left: `${hoverSnapPoint.u * 100}%`,
                  top: `${hoverSnapPoint.v * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
              >
                <div
                  className={`w-3 h-3 rounded-full border-2 ${
                    hoverSnapPoint.isClamped
                      ? 'border-amber-400 bg-amber-400/40 scale-125'
                      : 'border-white/80 bg-white/20'
                  }`}
                />
              </div>
            )}
          </div>

          {!isEmbedded && (
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono opacity-75 pointer-events-none">
              <span>
                {hoverSnapPoint
                  ? `Cursor: X=${Math.round(
                      (0.5 - hoverSnapPoint.u) * GOAL_BARRIER_WIDTH_UU
                    )} Z=${Math.round((1 - hoverSnapPoint.v) * GOAL_BARRIER_HEIGHT_UU)} UU${
                      hoverSnapPoint.isClamped ? ' [SNAPPED]' : ''
                    }`
                  : 'Drag inside or from outer snap zone to sculpt barrier'}
              </span>
              <span>Mode: {selectionMode.toUpperCase()}</span>
            </div>
          )}
        </div>

        {isEmbedded && (
          <div className="px-1 font-mono text-[10px] opacity-75">
            {hoverSnapPoint
              ? `Cursor: X=${Math.round(
                  (0.5 - hoverSnapPoint.u) * GOAL_BARRIER_WIDTH_UU
                )} Z=${Math.round((1 - hoverSnapPoint.v) * GOAL_BARRIER_HEIGHT_UU)} UU${
                  hoverSnapPoint.isClamped ? ' [SNAPPED]' : ''
                }`
              : 'Cursor: not detected'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            { id: 'full', label: isEmbedded ? 'Full' : 'Full Barrier' },
            { id: 'top-corners-open', label: isEmbedded ? 'Top Corner' : 'Top Corners Open' },
            { id: 'bottom-corners-open', label: isEmbedded ? 'Lower Corner' : 'Low Corners Open' },
            { id: 'center-slot', label: isEmbedded ? 'Centre' : 'Center Slot Open' },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onApplyPreset(p.id)}
            className={`py-1.5 px-2 rounded-lg border ${
              isEmbedded ? 'text-[11px]' : 'text-[10px]'
            } font-semibold transition-all cursor-pointer truncate ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800/80 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            {!isEmbedded && <Layers className="inline h-3 w-3 mr-1 text-amber-500" />}
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
};
