import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Square,
  PlusSquare,
  MinusSquare,
  Trash2,
  Shield,
} from 'lucide-react';
import { ToggleSwitch } from '../primitives/ToggleSwitch';
import { SegmentedSwitch } from '../primitives/SegmentedSwitch';
import { SliderControl } from '../primitives/SliderControl';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

import {
  BARRIER_GRID_COLS,
  BARRIER_GRID_ROWS,
  clamp01,
  normalizeRect,
  decomposeBarrierGrid,
  buildPresetBarrierGrid,
  type GoalBarrierSelectionMode,
  type GoalBarrierTargetGoal,
  type GoalBarrierPresetId,
  type NormalizedBarrierRect,
  type GoalBarrierDecomposition,
} from './goalBarrierMath';
import { GoalBarrierCanvasStage } from './GoalBarrierCanvasStage';

export const ALPHA_COMPONENT_ID = 'Alpha:GoalBarrier2DEditor' as const;

const GRID_U = BARRIER_GRID_COLS;
const GRID_V = BARRIER_GRID_ROWS;

export interface GoalBarrier2DEditorProps {
  isLight?: boolean;
  /** Controlled 32x16 barrier grid */
  grid?: Uint8Array;
  onGridChange?: (grid: Uint8Array, decomposition: GoalBarrierDecomposition) => void;
  /** Controlled selection mode ('new' | 'add' | 'subtract') */
  selectionMode?: GoalBarrierSelectionMode;
  onSelectionModeChange?: (mode: GoalBarrierSelectionMode) => void;
  /** Controlled enabled state */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  /** Controlled opacity (0..1) */
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  /** Controlled target goal ('both' | 'orange' | 'blue') */
  targetGoal?: GoalBarrierTargetGoal;
  onTargetGoalChange?: (goal: GoalBarrierTargetGoal) => void;
  /** Visual variant: 'card' (standalone 5B chart card) or 'embedded' (compact inside L6 floating window) */
  variant?: 'card' | 'embedded';
  onApplyPreset?: (presetId: GoalBarrierPresetId, grid: Uint8Array) => void;
  onClear?: () => void;
  className?: string;
}

interface DragState {
  startU: number;
  startV: number;
  currU: number;
  currV: number;
}

/**
 * GoalBarrier2DEditor
 * Pure presentational / self-contained 2D Boolean Goal Mouth Barrier Editor (`1792 × 644 UU`).
 * Supports New / Add / Subtract boolean rectangle operations, Outer Snap Zone clamping,
 * disjoint quad decomposition, and 4 quick templates.
 * Used both standalone in 5B Charts & Curves and embedded inside GoalBarrierFloatingWindow.
 */
export const GoalBarrier2DEditor: React.FC<GoalBarrier2DEditorProps> = React.memo(
  ({
    isLight = true,
    grid: controlledGrid,
    onGridChange,
    selectionMode: controlledSelectionMode,
    onSelectionModeChange,
    enabled: controlledEnabled,
    onEnabledChange,
    opacity: controlledOpacity,
    onOpacityChange,
    targetGoal: controlledTargetGoal,
    onTargetGoalChange,
    variant = 'card',
    onApplyPreset,
    onClear,
    className = '',
  }) => {
    const isEmbedded = variant === 'embedded';
    const [internalEnabled, setInternalEnabled] = useState(true);
    const [internalSelectionMode, setInternalSelectionMode] =
      useState<GoalBarrierSelectionMode>('subtract');
    const [internalTargetGoal, setInternalTargetGoal] =
      useState<GoalBarrierTargetGoal>('both');
    const [internalOpacity, setInternalOpacity] = useState(0.65);
    const [internalGrid, setInternalGrid] = useState<Uint8Array>(() =>
      buildPresetBarrierGrid('top-corners-open')
    );

    const enabled = controlledEnabled ?? internalEnabled;
    const selectionMode = controlledSelectionMode ?? internalSelectionMode;
    const targetGoal = controlledTargetGoal ?? internalTargetGoal;
    const opacity = controlledOpacity ?? internalOpacity;
    const grid = controlledGrid ?? internalGrid;

    const decomposition = useMemo(() => decomposeBarrierGrid(grid), [grid]);

    const updateSelectionMode = useCallback(
      (mode: GoalBarrierSelectionMode) => {
        if (controlledSelectionMode === undefined) {
          setInternalSelectionMode(mode);
        }
        onSelectionModeChange?.(mode);
      },
      [controlledSelectionMode, onSelectionModeChange]
    );

    const updateEnabled = useCallback(
      (next: boolean) => {
        if (controlledEnabled === undefined) {
          setInternalEnabled(next);
        }
        onEnabledChange?.(next);
      },
      [controlledEnabled, onEnabledChange]
    );

    const updateGrid = useCallback(
      (nextGrid: Uint8Array) => {
        if (controlledGrid === undefined) {
          setInternalGrid(nextGrid);
        }
        const nextDecomp = decomposeBarrierGrid(nextGrid);
        onGridChange?.(nextGrid, nextDecomp);
      },
      [controlledGrid, onGridChange]
    );

    const goalBoxRef = useRef<HTMLDivElement | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [hoverSnapPoint, setHoverSnapPoint] = useState<{
      u: number;
      v: number;
      isClamped: boolean;
    } | null>(null);

    const resolveGoalCoords = useCallback((clientX: number, clientY: number) => {
      const el = goalBoxRef.current;
      if (!el) return { u: 0, v: 0, isClamped: false };
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const rawU = (clientX - rect.left) / w;
      const rawV = (clientY - rect.top) / h;
      const isClamped = rawU < 0 || rawU > 1 || rawV < 0 || rawV > 1;
      return { u: clamp01(rawU), v: clamp01(rawV), isClamped };
    }, []);

    const commitRect = useCallback(
      (rect: NormalizedBarrierRect) => {
        const next =
          selectionMode === 'new'
            ? new Uint8Array(GRID_U * GRID_V)
            : new Uint8Array(grid);
        const val: 0 | 1 = selectionMode === 'subtract' ? 0 : 1;
        const c0 = Math.max(0, Math.min(GRID_U - 1, Math.floor(rect.u0 * GRID_U)));
        const c1 = Math.max(0, Math.min(GRID_U, Math.ceil(rect.u1 * GRID_U)));
        const r0 = Math.max(0, Math.min(GRID_V - 1, Math.floor(rect.v0 * GRID_V)));
        const r1 = Math.max(0, Math.min(GRID_V, Math.ceil(rect.v1 * GRID_V)));
        for (let r = r0; r < r1; r++) {
          for (let c = c0; c < c1; c++) {
            next[r * GRID_U + c] = val;
          }
        }
        updateGrid(next);
        updateEnabled(true);
      },
      [selectionMode, grid, updateGrid, updateEnabled]
    );

    const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const pt = resolveGoalCoords(e.clientX, e.clientY);
      setDragState({
        startU: pt.u,
        startV: pt.v,
        currU: pt.u,
        currV: pt.v,
      });
    };

    const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragState) return;
      setHoverSnapPoint(resolveGoalCoords(e.clientX, e.clientY));
    };

    useEffect(() => {
      if (!dragState) return;
      const handleWindowMouseMove = (ev: MouseEvent) => {
        const pt = resolveGoalCoords(ev.clientX, ev.clientY);
        setDragState((prev) => (prev ? { ...prev, currU: pt.u, currV: pt.v } : null));
        setHoverSnapPoint(pt);
      };
      const handleWindowMouseUp = (ev: MouseEvent) => {
        const pt = resolveGoalCoords(ev.clientX, ev.clientY);
        const finalRect = normalizeRect(dragState.startU, dragState.startV, pt.u, pt.v);
        if (finalRect) commitRect(finalRect);
        setDragState(null);
      };
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
    }, [dragState, resolveGoalCoords, commitRect]);

    const previewRect: NormalizedBarrierRect | null = dragState
      ? {
          u0: Math.min(dragState.startU, dragState.currU),
          v0: Math.min(dragState.startV, dragState.currV),
          u1: Math.max(dragState.startU, dragState.currU),
          v1: Math.max(dragState.startV, dragState.currV),
        }
      : null;

    const coveragePct = (decomposition.coverageRatio * 100).toFixed(1);
    const quadCount = decomposition.mergedRects.length;

    const handleApplyPreset = (presetId: GoalBarrierPresetId) => {
      const nextGrid = buildPresetBarrierGrid(presetId);
      updateGrid(nextGrid);
      updateEnabled(true);
      onApplyPreset?.(presetId, nextGrid);
    };

    const handleClear = () => {
      const empty = new Uint8Array(GRID_U * GRID_V);
      updateGrid(empty);
      onClear?.();
    };

    return (
      <div
        data-alpha-id={ALPHA_COMPONENT_ID}
        data-ui-element="chart-goal-barrier-2d-editor"
        className={`flex flex-col gap-3 select-none ${
          isEmbedded
            ? ''
            : `p-4 ${UI_RADIUS.panel} border ${
                isLight
                  ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-xs`
                  : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary} shadow-lg`
              }`
        } ${className}`}
      >
        {/* Top Status & Master Toggle Bar (Card variant only) */}
        {!isEmbedded && (
          <div
            className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
              isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/70 border-neutral-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex flex-col leading-snug min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs truncate">
                    2D Boolean Goal Mouth Barrier Editor
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase font-semibold ${
                      enabled && quadCount > 0
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                        : isLight
                        ? 'bg-neutral-200 border-neutral-300 text-neutral-600'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {enabled && quadCount > 0 ? `${coveragePct}% Blocked` : 'Inactive'}
                  </span>
                </div>
                <span
                  className={`text-[10px] mt-0.5 truncate ${
                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                  }`}
                >
                  {quadCount} Disjoint {quadCount === 1 ? 'Quad' : 'Quads'} · 1792 × 644 UU Aperture
                </span>
              </div>
            </div>

            <ToggleSwitch
              checked={Boolean(enabled && quadCount > 0)}
              onCheckedChange={(checked) => {
                if (checked && quadCount === 0) {
                  updateGrid(buildPresetBarrierGrid('full'));
                }
                updateEnabled(checked);
              }}
              isLight={isLight}
            />
          </div>
        )}

        {/* Boolean Operation Toolbar: New | Add | Subtract | Clear */}
        <div className={isEmbedded ? 'flex items-center gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
          {(
            [
              {
                id: 'new',
                label: 'New Selection',
                icon: <Square className="h-3.5 w-3.5 shrink-0" />,
                activeClass: 'bg-amber-500 border-amber-500 text-neutral-950',
              },
              {
                id: 'add',
                label: isEmbedded ? 'Add' : 'Add (+)',
                icon: <PlusSquare className="h-3.5 w-3.5 shrink-0" />,
                activeClass: 'bg-emerald-500 border-emerald-500 text-neutral-950',
              },
              {
                id: 'subtract',
                label: isEmbedded ? 'Subtract' : 'Subtract (-)',
                icon: <MinusSquare className="h-3.5 w-3.5 shrink-0" />,
                activeClass: 'bg-rose-500 border-rose-500 text-white',
              },
            ] as const
          ).map((btn) => {
            const isSelected = selectionMode === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => updateSelectionMode(btn.id)}
                className={`${
                  isEmbedded ? 'flex-1' : ''
                } flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? btn.activeClass
                    : isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800/80 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
              >
                {btn.icon}
                <span className="truncate">{btn.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleClear}
            disabled={quadCount === 0}
            title="Clear barrier selection"
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-all shrink-0 ${
              quadCount === 0
                ? 'opacity-40 cursor-not-allowed border-neutral-700/40 text-neutral-500'
                : isLight
                ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700 cursor-pointer'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-300 cursor-pointer'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>Clear</span>
          </button>
        </div>

        {/* Interactive 2D Goal Canvas with Outer Snap Margin + Quick Templates */}
        <GoalBarrierCanvasStage
          isEmbedded={isEmbedded}
          isLight={isLight}
          enabled={enabled}
          opacity={opacity}
          selectionMode={selectionMode}
          goalBoxRef={goalBoxRef}
          decomposition={decomposition}
          previewRect={previewRect}
          hoverSnapPoint={hoverSnapPoint}
          onStageMouseDown={handleStageMouseDown}
          onStageMouseMove={handleStageMouseMove}
          onStageMouseLeave={() => !dragState && setHoverSnapPoint(null)}
          onApplyPreset={handleApplyPreset}
        />

        {/* Target Goal & Opacity (Card variant only) */}
        {!isEmbedded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">Target Goal</span>
              <SegmentedSwitch
                value={targetGoal}
                onValueChange={(v) => {
                  const next = v as GoalBarrierTargetGoal;
                  if (controlledTargetGoal === undefined) setInternalTargetGoal(next);
                  onTargetGoalChange?.(next);
                }}
                size="sm"
                isLight={isLight}
                options={[
                  { value: 'both', label: 'Both' },
                  { value: 'orange', label: 'Orange' },
                  { value: 'blue', label: 'Blue' },
                ]}
              />
            </div>
            <SliderControl
              label="Barrier Visual Opacity"
              value={Math.round(opacity * 100)}
              min={10}
              max={100}
              step={5}
              unit="%"
              onChange={(val) => {
                const next = val / 100;
                if (controlledOpacity === undefined) setInternalOpacity(next);
                onOpacityChange?.(next);
              }}
              isLight={isLight}
            />
          </div>
        )}
      </div>
    );
  }
);

GoalBarrier2DEditor.displayName = 'GoalBarrier2DEditor';
