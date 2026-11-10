import { create } from 'zustand';
import {
  type GoalBarrierSelectionMode,
  type GoalBarrierTargetGoal,
  type NormalizedRect,
  type GoalBarrierOperation,
  type GoalBarrierDecomposition,
  decomposeGoalBarrierOperations,
  loadGoalBarrierConfig,
  saveGoalBarrierConfig,
} from '../config/goalBarrierConfig';

export type GoalBarrierPresetId =
  | 'full'
  | 'top-corners-open'
  | 'bottom-corners-open'
  | 'center-slot';

export interface GoalBarrierStoreState {
  enabled: boolean;
  selectionMode: GoalBarrierSelectionMode;
  targetGoal: GoalBarrierTargetGoal;
  opacity: number;
  operations: GoalBarrierOperation[];
  decomposition: GoalBarrierDecomposition;
  revision: number;
  setEnabled: (enabled: boolean) => void;
  setSelectionMode: (mode: GoalBarrierSelectionMode) => void;
  setTargetGoal: (targetGoal: GoalBarrierTargetGoal) => void;
  setOpacity: (opacity: number) => void;
  commitRect: (rect: NormalizedRect, modeOverride?: GoalBarrierSelectionMode) => void;
  applyPreset: (presetId: GoalBarrierPresetId) => void;
  clearBarrier: () => void;
}

const initialPersisted = loadGoalBarrierConfig();
const initialOperations: GoalBarrierOperation[] = initialPersisted.rects.map((rect, idx) => ({
  mode: idx === 0 ? 'new' : 'add',
  rect,
}));
const initialDecomposition = decomposeGoalBarrierOperations(initialOperations);

function canonicalizeOperations(decomposition: GoalBarrierDecomposition): GoalBarrierOperation[] {
  return decomposition.mergedRects.map((rect, idx) => ({
    mode: idx === 0 ? 'new' : 'add',
    rect,
  }));
}

export const useGoalBarrierStore = create<GoalBarrierStoreState>((set, get) => ({
  enabled: initialPersisted.enabled && initialDecomposition.mergedRects.length > 0,
  selectionMode: initialPersisted.selectionMode,
  targetGoal: initialPersisted.targetGoal,
  opacity: initialPersisted.opacity,
  operations: initialOperations,
  decomposition: initialDecomposition,
  revision: 0,

  setEnabled: (enabled) => {
    const state = get();
    const nextEnabled = Boolean(enabled);
    saveGoalBarrierConfig({
      enabled: nextEnabled,
      selectionMode: state.selectionMode,
      targetGoal: state.targetGoal,
      opacity: state.opacity,
      rects: state.decomposition.mergedRects,
    });
    set({ enabled: nextEnabled, revision: state.revision + 1 });
  },

  setSelectionMode: (selectionMode) => {
    const state = get();
    saveGoalBarrierConfig({
      enabled: state.enabled,
      selectionMode,
      targetGoal: state.targetGoal,
      opacity: state.opacity,
      rects: state.decomposition.mergedRects,
    });
    set({ selectionMode });
  },

  setTargetGoal: (targetGoal) => {
    const state = get();
    saveGoalBarrierConfig({
      enabled: state.enabled,
      selectionMode: state.selectionMode,
      targetGoal,
      opacity: state.opacity,
      rects: state.decomposition.mergedRects,
    });
    set({ targetGoal, revision: state.revision + 1 });
  },

  setOpacity: (opacity) => {
    const state = get();
    const clamped = Math.max(0.1, Math.min(1.0, Number(opacity) || 0.55));
    saveGoalBarrierConfig({
      enabled: state.enabled,
      selectionMode: state.selectionMode,
      targetGoal: state.targetGoal,
      opacity: clamped,
      rects: state.decomposition.mergedRects,
    });
    set({ opacity: clamped, revision: state.revision + 1 });
  },

  commitRect: (rect, modeOverride) => {
    const state = get();
    const mode = modeOverride ?? state.selectionMode;
    const rawOps: GoalBarrierOperation[] =
      mode === 'new' || state.operations.length === 0
        ? [{ mode: 'new', rect }]
        : [...state.operations, { mode, rect }];

    const decomposition = decomposeGoalBarrierOperations(rawOps);
    const canonicalOps = canonicalizeOperations(decomposition);
    const nextEnabled = decomposition.mergedRects.length > 0;

    saveGoalBarrierConfig({
      enabled: nextEnabled,
      selectionMode: state.selectionMode,
      targetGoal: state.targetGoal,
      opacity: state.opacity,
      rects: decomposition.mergedRects,
    });

    set({
      enabled: nextEnabled,
      operations: canonicalOps,
      decomposition,
      revision: state.revision + 1,
    });
  },

  applyPreset: (presetId) => {
    const state = get();
    let ops: GoalBarrierOperation[] = [];
    if (presetId === 'full') {
      ops = [{ mode: 'new', rect: { u0: 0, v0: 0, u1: 1, v1: 1 } }];
    } else if (presetId === 'top-corners-open') {
      ops = [
        { mode: 'new', rect: { u0: 0, v0: 0, u1: 1, v1: 1 } },
        { mode: 'subtract', rect: { u0: 0, v0: 0, u1: 0.24, v1: 0.38 } },
        { mode: 'subtract', rect: { u0: 0.76, v0: 0, u1: 1, v1: 0.38 } },
      ];
    } else if (presetId === 'bottom-corners-open') {
      ops = [
        { mode: 'new', rect: { u0: 0, v0: 0, u1: 1, v1: 1 } },
        { mode: 'subtract', rect: { u0: 0, v0: 0.62, u1: 0.24, v1: 1 } },
        { mode: 'subtract', rect: { u0: 0.76, v0: 0.62, u1: 1, v1: 1 } },
      ];
    } else if (presetId === 'center-slot') {
      ops = [
        { mode: 'new', rect: { u0: 0, v0: 0, u1: 1, v1: 1 } },
        { mode: 'subtract', rect: { u0: 0.28, v0: 0.25, u1: 0.72, v1: 0.75 } },
      ];
    }

    const decomposition = decomposeGoalBarrierOperations(ops);
    const canonicalOps = canonicalizeOperations(decomposition);
    const nextEnabled = decomposition.mergedRects.length > 0;

    saveGoalBarrierConfig({
      enabled: nextEnabled,
      selectionMode: state.selectionMode,
      targetGoal: state.targetGoal,
      opacity: state.opacity,
      rects: decomposition.mergedRects,
    });

    set({
      enabled: nextEnabled,
      operations: canonicalOps,
      decomposition,
      revision: state.revision + 1,
    });
  },

  clearBarrier: () => {
    const state = get();
    const emptyDecomp = decomposeGoalBarrierOperations([]);
    saveGoalBarrierConfig({
      enabled: false,
      selectionMode: state.selectionMode,
      targetGoal: state.targetGoal,
      opacity: state.opacity,
      rects: [],
    });
    set({
      enabled: false,
      operations: [],
      decomposition: emptyDecomp,
      revision: state.revision + 1,
    });
  },
}));
