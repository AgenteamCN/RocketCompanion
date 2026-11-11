import React, { useEffect, useRef, useState } from 'react';
import { Lock, MoveHorizontal, MoveVertical, RotateCcw, Unlock } from 'lucide-react';

export type StageContainerPresetId = 'full' | '1080p-compact' | 'small-squeeze';

export interface StageBoundaryPresetOption {
  id: StageContainerPresetId;
  label: string;
  compactLabel?: string;
  lockedSize?: { width: number; height: number };
}

export const DEFAULT_STAGE_BOUNDARY_PRESETS: readonly StageBoundaryPresetOption[] = [
  { id: 'full', label: 'Full-Width (Auto-Expand)', compactLabel: 'Auto' },
  {
    id: '1080p-compact',
    label: '1080p Compact (760x520)',
    compactLabel: '760x520',
    lockedSize: { width: 760, height: 520 },
  },
  {
    id: 'small-squeeze',
    label: 'Small Squeeze (520x380)',
    compactLabel: '520x380',
    lockedSize: { width: 520, height: 380 },
  },
] as const;

export interface StageBoundarySizeRange {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  presets?: readonly StageBoundaryPresetOption[];
}

export interface StageTrackpadScrubResizerProps {
  isLight?: boolean;
  compact?: boolean;
  label?: string;
  containerPreset: StageContainerPresetId;
  onSelectPreset: (preset: StageContainerPresetId) => void;
  boundaryLocked: boolean;
  onToggleLock: () => void;
  width: number;
  height: number;
  onChangeSize: (next: { width: number; height: number }) => void;
  bounds?: StageBoundarySizeRange;
}

interface ScrubAxisControlProps {
  axis: 'W' | 'H';
  value: number;
  min: number;
  max: number;
  isLight: boolean;
  onCommitValue: (next: number) => void;
}

const clampDimension = (val: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(val)));

const ScrubAxisControl: React.FC<ScrubAxisControlProps> = ({
  axis,
  value,
  min,
  max,
  isLight,
  onCommitValue,
}) => {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draftText, setDraftText] = useState<string>(() => String(Math.round(value)));
  const [isEditing, setIsEditing] = useState(false);
  const scrubRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startValue: number;
    hasMoved: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(String(Math.round(value)));
    }
  }, [value, isEditing]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!isEditing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const primaryDelta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : -e.deltaY;
        if (primaryDelta === 0) return;
        const step = e.shiftKey ? 10 : e.altKey ? 1 : 2;
        const deltaPx = Math.sign(primaryDelta) * Math.max(1, Math.round(Math.abs(primaryDelta) * 0.15)) * step;
        onCommitValue(clampDimension(value + deltaPx, min, max));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isEditing, value, min, max, onCommitValue]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditing || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startValue: Math.round(value),
      hasMoved: false,
    };
    setIsScrubbing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = scrubRef.current;
    if (!st || !st.active || st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = st.startY - e.clientY;
    const dist = Math.hypot(dx, dy);
    if (!st.hasMoved && dist < 2) return;
    st.hasMoved = true;
    const dominantDelta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    const multiplier = e.shiftKey ? 5 : e.altKey ? 0.25 : 1;
    const nextVal = clampDimension(st.startValue + dominantDelta * multiplier, min, max);
    onCommitValue(nextVal);
  };

  const finishScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = scrubRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const wasClickOnly = !st.hasMoved;
    scrubRef.current = null;
    setIsScrubbing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (wasClickOnly) {
      setIsEditing(true);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
    }
  };

  const commitDraft = () => {
    setIsEditing(false);
    const parsed = parseInt(draftText, 10);
    if (Number.isFinite(parsed)) {
      onCommitValue(clampDimension(parsed, min, max));
    } else {
      setDraftText(String(Math.round(value)));
    }
  };

  const cursorClass = axis === 'W' ? 'cursor-ew-resize' : 'cursor-ns-resize';

  return (
    <div
      ref={hostRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishScrub}
      onPointerCancel={finishScrub}
      title={`Press & drag horizontally or vertically to scrub ${
        axis === 'W' ? 'Width' : 'Height'
      } (${min}-${max}px) · Hold Shift for 5x speed, Alt for fine 0.25x · Click to type exact value`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[11px] font-bold select-none transition-colors ${cursorClass} ${
        isScrubbing
          ? 'border-amber-500 bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/40'
          : isLight
          ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-900'
          : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-100'
      }`}
    >
      <span className="text-[10px] font-semibold opacity-65 pointer-events-none flex items-center gap-0.5">
        {axis === 'W' ? (
          <MoveHorizontal className="h-2.5 w-2.5 opacity-75" />
        ) : (
          <MoveVertical className="h-2.5 w-2.5 opacity-75" />
        )}
        {axis}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          min={min}
          max={max}
          step={10}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setDraftText(String(Math.round(value)));
              setIsEditing(false);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const dir = e.key === 'ArrowUp' ? 1 : -1;
              const step = e.shiftKey ? 10 : 1;
              const next = clampDimension(value + dir * step, min, max);
              setDraftText(String(next));
              onCommitValue(next);
            }
          }}
          className="w-12 bg-transparent text-center font-mono text-[11px] font-bold outline-none cursor-text"
        />
      ) : (
        <span className="w-11 text-center tabular-nums pointer-events-none">
          {Math.round(value)}
        </span>
      )}
    </div>
  );
};

export const StageTrackpadScrubResizer: React.FC<StageTrackpadScrubResizerProps> = React.memo(
  ({
    isLight = false,
    compact = false,
    label = 'Canvas Boundary:',
    containerPreset,
    onSelectPreset,
    boundaryLocked,
    onToggleLock,
    width,
    height,
    onChangeSize,
    bounds,
  }) => {
    const minWidth = bounds?.minWidth ?? 320;
    const maxWidth = bounds?.maxWidth ?? 2560;
    const minHeight = bounds?.minHeight ?? 260;
    const maxHeight = bounds?.maxHeight ?? 1600;
    const presets = bounds?.presets ?? DEFAULT_STAGE_BOUNDARY_PRESETS;
    const displayW = Math.round(width);
    const displayH = Math.round(height);
    const unlockedLabel = compact ? 'Lock WxH' : 'Lock Boundary';

    return (
      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
        {label && <span className="text-[11px] text-neutral-400">{label}</span>}

        {presets.map((preset) => {
          const isActive = containerPreset === preset.id && !boundaryLocked;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onSelectPreset(preset.id);
                if (boundaryLocked && preset.lockedSize) {
                  onChangeSize(preset.lockedSize);
                }
              }}
              className={`px-2 ${
                compact ? 'py-0.5' : 'py-1'
              } rounded-lg border text-[11px] cursor-pointer transition-all ${
                isActive
                  ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                  : isLight
                  ? 'bg-neutral-100 border-neutral-200 text-neutral-600 hover:text-neutral-900'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {compact ? preset.compactLabel ?? preset.label : preset.label}
            </button>
          );
        })}

        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xl border transition-colors ${
            boundaryLocked
              ? 'border-sky-500/60 bg-sky-500/10 text-sky-500'
              : isLight
              ? 'border-neutral-200 bg-neutral-50 text-neutral-700'
              : 'border-neutral-800 bg-neutral-950 text-neutral-300'
          }`}
          title="Resolved Canvas Boundary (W x H px). Press & drag on W or H to scrub with mouse/trackpad, click to type exact px, or click Lock to freeze the stage boundary while stepping through pages."
        >
          {!compact && (
            <span className="text-[10px] opacity-70">
              {boundaryLocked ? 'Manual/Locked:' : 'Auto:'}
            </span>
          )}

          <ScrubAxisControl
            axis="W"
            value={displayW}
            min={minWidth}
            max={maxWidth}
            isLight={isLight}
            onCommitValue={(nextW) => onChangeSize({ width: nextW, height: displayH })}
          />

          <span className="opacity-60 select-none">×</span>

          <ScrubAxisControl
            axis="H"
            value={displayH}
            min={minHeight}
            max={maxHeight}
            isLight={isLight}
            onCommitValue={(nextH) => onChangeSize({ width: displayW, height: nextH })}
          />

          <span className="text-[10px] opacity-60 select-none">px</span>

          <button
            type="button"
            onClick={onToggleLock}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border cursor-pointer transition-all ${
              boundaryLocked
                ? 'bg-sky-500 text-white border-sky-400 shadow-2xs'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
            title={
              boundaryLocked
                ? 'Unlock Canvas Boundary (return to auto-adaptive stage bounds)'
                : 'Lock current Canvas Boundary WxH so stepping through pages never resizes the stage'
            }
          >
            {boundaryLocked ? (
              <>
                <Lock className="h-3 w-3" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <Unlock className="h-3 w-3" />
                <span>{unlockedLabel}</span>
              </>
            )}
          </button>

          {boundaryLocked && (
            <button
              type="button"
              onClick={() => {
                onSelectPreset('full');
                onToggleLock();
              }}
              title="Reset to Auto-Adaptive Full-Width boundary"
              className={`p-1 rounded-md border cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-600'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

StageTrackpadScrubResizer.displayName = 'StageTrackpadScrubResizer';
