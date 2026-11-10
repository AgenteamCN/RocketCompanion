import React, { useCallback, useMemo } from 'react';
import { BrickWallShield, Cloudy } from 'lucide-react';
import { GoalBarrier2DEditor } from '../../charts/GoalBarrier2DEditor';
import {
  BARRIER_GRID_COLS,
  BARRIER_GRID_ROWS,
  type GoalBarrierSelectionMode,
  type GoalBarrierPresetId,
  type NormalizedBarrierRect,
  type GoalBarrierDecomposition,
} from '../../charts/goalBarrierMath';
import {
  decomposeGoalBarrierOperations,
  saveGoalBarrierConfig,
  type NormalizedRect,
} from '../../config/goalBarrierConfig';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { useGoalBarrierStore } from '../../stores/goalBarrierStore';

export const SURFACE_META: SurfaceMeta = {
  id: 'goal-barrier-configurator',
  title: 'Goal Barrier Configurator',
  description:
    'Interactive 2D goal barrier boolean rectangle designer with Orange/Blue/Both target selection.',
  icon: 'brick-wall-shield',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 418,
    height: 462,
    minWidth: 418,
    minHeight: 240,
    mode: 'adaptive',
  },
};

export type GoalBarrierPlacement = 'none' | 'both' | 'orange' | 'blue';

export interface GoalBarrierConfigState {
  placement: GoalBarrierPlacement;
  selectionMode: GoalBarrierSelectionMode;
  opacityPct: number;
  grid: Uint8Array;
  mergedRects?: NormalizedBarrierRect[];
}

export interface GoalBarrierConfiguratorFloatingWindowProps extends StandardSurfaceProps {}

function rectsToGrid(rects: NormalizedRect[]): Uint8Array {
  const grid = new Uint8Array(BARRIER_GRID_COLS * BARRIER_GRID_ROWS);
  for (const r of rects) {
    const c0 = Math.max(0, Math.min(BARRIER_GRID_COLS - 1, Math.floor(r.u0 * BARRIER_GRID_COLS)));
    const c1 = Math.max(c0 + 1, Math.min(BARRIER_GRID_COLS, Math.ceil(r.u1 * BARRIER_GRID_COLS)));
    const r0 = Math.max(0, Math.min(BARRIER_GRID_ROWS - 1, Math.floor(r.v0 * BARRIER_GRID_ROWS)));
    const r1 = Math.max(r0 + 1, Math.min(BARRIER_GRID_ROWS, Math.ceil(r.v1 * BARRIER_GRID_ROWS)));
    for (let y = r0; y < r1; y++) {
      for (let x = c0; x < c1; x++) {
        grid[y * BARRIER_GRID_COLS + x] = 1;
      }
    }
  }
  return grid;
}

/**
 * 2. [User] Goal Barrier Config (`goal-barrier-configurator`)
 * Standalone L6 Floating Window Panel composing the L5 `<GoalBarrier2DEditor />`:
 * 1. Row 1: `BrickWallShield` (`brick-wall-shield`) icon + `Placement` + Segmented Control (`None`, `Both`, `Orange`, `Blue`).
 * 2. Rows 2–4: Embedded `<GoalBarrier2DEditor variant="embedded" />` (Selection Mode Buttons, 2D Outer-Snap Goal Selector, and 4 Quick Presets).
 * 3. Row 5: `Cloudy` (`cloudy`) icon + `Opacity` + Slider (no `-`/`+` steppers) + editable percentage input (Enter to confirm).
 */
export const GoalBarrierConfiguratorFloatingWindow: React.FC<
  GoalBarrierConfiguratorFloatingWindowProps
> = React.memo(({ isLight = false }) => {
  const {
    enabled,
    targetGoal,
    selectionMode,
    opacity,
    decomposition,
    setEnabled,
    setTargetGoal,
    setSelectionMode,
    setOpacity,
    applyPreset,
    clearBarrier,
  } = useScopedStore('goalBarrierStore', useGoalBarrierStore);

  const placement: GoalBarrierPlacement = !enabled ? 'none' : targetGoal;
  const opacityPct = Math.round(opacity * 100);
  const grid = useMemo(
    () => rectsToGrid(decomposition.mergedRects),
    [decomposition.mergedRects]
  );

  const quadCount = decomposition.mergedRects.length;
  const isBarrierEnabled = placement !== 'none' && quadCount > 0;

  const handlePlacementChange = useCallback(
    (next: GoalBarrierPlacement) => {
      if (next === 'none') {
        setEnabled(false);
      } else {
        setTargetGoal(next);
        setEnabled(true);
      }
    },
    [setEnabled, setTargetGoal]
  );

  const handleOpacityPctChange = useCallback(
    (pct: number) => {
      setOpacity(pct / 100);
    },
    [setOpacity]
  );

  const handleEditorGridChange = useCallback(
    (_nextGrid: Uint8Array, nextDecomp: GoalBarrierDecomposition) => {
      const ops = nextDecomp.mergedRects.map((rect, idx) => ({
        mode: (idx === 0 ? 'new' : 'add') as 'new' | 'add',
        rect,
      }));
      const recomputedDecomp = decomposeGoalBarrierOperations(ops);
      const state = useGoalBarrierStore.getState();
      const nextEnabled = recomputedDecomp.mergedRects.length > 0;
      saveGoalBarrierConfig({
        enabled: nextEnabled,
        selectionMode: state.selectionMode,
        targetGoal: state.targetGoal,
        opacity: state.opacity,
        rects: recomputedDecomp.mergedRects,
      });
      useGoalBarrierStore.setState({
        enabled: nextEnabled,
        operations: ops,
        decomposition: recomputedDecomp,
        revision: state.revision + 1,
      });
    },
    []
  );

  const handleApplyPreset = useCallback(
    (presetId: GoalBarrierPresetId) => {
      applyPreset(presetId);
    },
    [applyPreset]
  );

  return (
    <div className="p-3.5 flex flex-col gap-3 text-xs select-none">
      {/* 1. Row 1: BrickWallShield (`brick-wall-shield`) + Placement + Segmented Control (None, Both, Orange, Blue) */}
      <SettingActionRow
        icon={BrickWallShield}
        iconName="brick-wall-shield"
        title="Placement"
        bordered={false}
        showDescription={false}
        paddingX={4}
        paddingY={2}
        isLight={isLight}
        rightSlot={
          <SegmentedSwitch
            value={placement}
            size="sm"
            isLight={isLight}
            onValueChange={(v) => handlePlacementChange(v as GoalBarrierPlacement)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'both', label: 'Both' },
              { value: 'orange', label: 'Orange' },
              { value: 'blue', label: 'Blue' },
            ]}
          />
        }
      />

      {/* 2–4. L5 GoalBarrier2DEditor (Selection Buttons + 2D Outer-Snap Goal Mouth Canvas + Quick Presets) */}
      <GoalBarrier2DEditor
        variant="embedded"
        isLight={isLight}
        grid={grid}
        onGridChange={handleEditorGridChange}
        selectionMode={selectionMode}
        onSelectionModeChange={setSelectionMode}
        enabled={isBarrierEnabled}
        opacity={opacityPct / 100}
        onApplyPreset={handleApplyPreset}
        onClear={clearBarrier}
      />

      {/* 5. Row 5: Opacity (icon `cloudy`, slider without -/+, editable Enter-confirm percentage on right) */}
      <SettingSliderRow
        icon={Cloudy}
        iconName="cloudy"
        label="Opacity"
        value={opacityPct}
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
        onChange={handleOpacityPctChange}
        isLight={isLight}
      />
    </div>
  );
});
GoalBarrierConfiguratorFloatingWindow.displayName = 'GoalBarrierConfiguratorFloatingWindow';
export default GoalBarrierConfiguratorFloatingWindow;
