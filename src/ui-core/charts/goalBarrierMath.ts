export const GOAL_BARRIER_WIDTH_UU = 1792;
export const GOAL_BARRIER_HEIGHT_UU = 644;

export type GoalBarrierSelectionMode = 'new' | 'add' | 'subtract';
export type GoalBarrierTargetGoal = 'both' | 'orange' | 'blue';
export type GoalBarrierPresetId =
  | 'full'
  | 'top-corners-open'
  | 'bottom-corners-open'
  | 'center-slot';

export interface NormalizedBarrierRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface BarrierContourSegment {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface GoalBarrierDecomposition {
  mergedRects: NormalizedBarrierRect[];
  contourSegments: BarrierContourSegment[];
  coverageRatio: number;
}

export const BARRIER_GRID_COLS = 32;
export const BARRIER_GRID_ROWS = 16;
const GRID_U = BARRIER_GRID_COLS;
const GRID_V = BARRIER_GRID_ROWS;

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function normalizeRect(
  uA: number,
  vA: number,
  uB: number,
  vB: number
): NormalizedBarrierRect | null {
  const u0 = clamp01(Math.min(uA, uB));
  const u1 = clamp01(Math.max(uA, uB));
  const v0 = clamp01(Math.min(vA, vB));
  const v1 = clamp01(Math.max(vA, vB));
  if (u1 - u0 < 0.015 || v1 - v0 < 0.02) return null;
  return { u0, v0, u1, v1 };
}

/**
 * Pure boolean grid decomposition into maximal disjoint rectangles + perimeter contour segments.
 * Decoupled from external game stores so GoalBarrier2DEditor works standalone or controlled.
 */
export function decomposeBarrierGrid(grid: Uint8Array): GoalBarrierDecomposition {
  let activeCells = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) activeCells++;
  }
  const coverageRatio = activeCells / (GRID_U * GRID_V);

  // Greedy maximal rectangle merging
  const visited = new Uint8Array(GRID_U * GRID_V);
  const mergedRects: NormalizedBarrierRect[] = [];

  for (let r = 0; r < GRID_V; r++) {
    for (let c = 0; c < GRID_U; c++) {
      const idx = r * GRID_U + c;
      if (!grid[idx] || visited[idx]) continue;

      let maxC = c;
      while (maxC + 1 < GRID_U && grid[r * GRID_U + (maxC + 1)] && !visited[r * GRID_U + (maxC + 1)]) {
        maxC++;
      }

      let maxR = r;
      outer: while (maxR + 1 < GRID_V) {
        for (let cc = c; cc <= maxC; cc++) {
          const checkIdx = (maxR + 1) * GRID_U + cc;
          if (!grid[checkIdx] || visited[checkIdx]) break outer;
        }
        maxR++;
      }

      for (let rr = r; rr <= maxR; rr++) {
        for (let cc = c; cc <= maxC; cc++) {
          visited[rr * GRID_U + cc] = 1;
        }
      }

      mergedRects.push({
        u0: c / GRID_U,
        v0: r / GRID_V,
        u1: (maxC + 1) / GRID_U,
        v1: (maxR + 1) / GRID_V,
      });
    }
  }

  // Extract boundary contour segments
  const contourSegments: BarrierContourSegment[] = [];
  for (let r = 0; r < GRID_V; r++) {
    for (let c = 0; c < GRID_U; c++) {
      if (!grid[r * GRID_U + c]) continue;
      const u0 = c / GRID_U;
      const u1 = (c + 1) / GRID_U;
      const v0 = r / GRID_V;
      const v1 = (r + 1) / GRID_V;

      if (r === 0 || !grid[(r - 1) * GRID_U + c]) {
        contourSegments.push({ u0, v0, u1, v1: v0 });
      }
      if (r === GRID_V - 1 || !grid[(r + 1) * GRID_U + c]) {
        contourSegments.push({ u0, v0: v1, u1, v1 });
      }
      if (c === 0 || !grid[r * GRID_U + (c - 1)]) {
        contourSegments.push({ u0, v0, u1: u0, v1 });
      }
      if (c === GRID_U - 1 || !grid[r * GRID_U + (c + 1)]) {
        contourSegments.push({ u0: u1, v0, u1, v1 });
      }
    }
  }

  return { mergedRects, contourSegments, coverageRatio };
}

export function buildPresetBarrierGrid(preset: GoalBarrierPresetId): Uint8Array {
  const g = new Uint8Array(GRID_U * GRID_V);
  const fillRect = (u0: number, v0: number, u1: number, v1: number, val: 0 | 1) => {
    const c0 = Math.max(0, Math.min(GRID_U - 1, Math.floor(u0 * GRID_U)));
    const c1 = Math.max(0, Math.min(GRID_U, Math.ceil(u1 * GRID_U)));
    const r0 = Math.max(0, Math.min(GRID_V - 1, Math.floor(v0 * GRID_V)));
    const r1 = Math.max(0, Math.min(GRID_V, Math.ceil(v1 * GRID_V)));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        g[r * GRID_U + c] = val;
      }
    }
  };

  fillRect(0, 0, 1, 1, 1);
  if (preset === 'top-corners-open') {
    fillRect(0, 0, 0.25, 0.45, 0);
    fillRect(0.75, 0, 1, 0.45, 0);
  } else if (preset === 'bottom-corners-open') {
    fillRect(0, 0.55, 0.25, 1, 0);
    fillRect(0.75, 0.55, 1, 1, 0);
  } else if (preset === 'center-slot') {
    fillRect(0.35, 0.25, 0.65, 0.75, 0);
  }
  return g;
}
