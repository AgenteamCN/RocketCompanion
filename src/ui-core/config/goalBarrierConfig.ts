import { safeLocalStorageGet, safeLocalStorageSet } from './storageHelpers';

export type GoalBarrierSelectionMode = 'new' | 'add' | 'subtract';
export type GoalBarrierTargetGoal = 'both' | 'orange' | 'blue';

export interface NormalizedRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface GoalBarrierOperation {
  mode: GoalBarrierSelectionMode;
  rect: NormalizedRect;
}

export interface NormalizedSegment {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface GoalBarrierDecomposition {
  gridUs: number[];
  gridVs: number[];
  activeCells: boolean[][];
  mergedRects: NormalizedRect[];
  contourSegments: NormalizedSegment[];
  coverageRatio: number;
}

export interface GoalBarrierPersistedState {
  enabled: boolean;
  selectionMode: GoalBarrierSelectionMode;
  targetGoal: GoalBarrierTargetGoal;
  opacity: number;
  rects: NormalizedRect[];
}

export const GOAL_BARRIER_HALF_WIDTH_UU = 896.0;
export const GOAL_BARRIER_WIDTH_UU = GOAL_BARRIER_HALF_WIDTH_UU * 2.0;
export const GOAL_BARRIER_HEIGHT_UU = 644.0;
export const GOAL_BARRIER_PLANE_Y_UU = 5120.0;
export const GOAL_BARRIER_CORNER_RADIUS_UU = 92.0;
export const UU_TO_BULLET_SCALE = 0.02;

const STORAGE_KEY = 'rc_goal_barrier_config_v1';
const COORD_EPSILON = 1e-4;
const MIN_RECT_SPAN = 0.005;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeRect(uA: number, vA: number, uB: number, vB: number): NormalizedRect | null {
  const cUA = clamp01(uA);
  const cVA = clamp01(vA);
  const cUB = clamp01(uB);
  const cVB = clamp01(vB);

  const u0 = Math.min(cUA, cUB);
  const u1 = Math.max(cUA, cUB);
  const v0 = Math.min(cVA, cVB);
  const v1 = Math.max(cVA, cVB);

  if (u1 - u0 < MIN_RECT_SPAN || v1 - v0 < MIN_RECT_SPAN) {
    return null;
  }

  return {
    u0: Number(u0.toFixed(4)),
    v0: Number(v0.toFixed(4)),
    u1: Number(u1.toFixed(4)),
    v1: Number(v1.toFixed(4)),
  };
}

function deduplicateSortedCoords(values: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - unique[unique.length - 1] > COORD_EPSILON) {
      unique.push(sorted[i]);
    }
  }
  return unique;
}

export function decomposeGoalBarrierOperations(
  operations: GoalBarrierOperation[]
): GoalBarrierDecomposition {
  if (!operations || operations.length === 0) {
    return {
      gridUs: [],
      gridVs: [],
      activeCells: [],
      mergedRects: [],
      contourSegments: [],
      coverageRatio: 0,
    };
  }

  let startIndex = 0;
  for (let i = operations.length - 1; i >= 0; i--) {
    if (operations[i].mode === 'new') {
      startIndex = i;
      break;
    }
  }
  const effectiveOps = operations.slice(startIndex);

  const rawUs: number[] = [0, 1];
  const rawVs: number[] = [0, 1];
  for (const op of effectiveOps) {
    const r = op.rect;
    if (!r) continue;
    rawUs.push(clamp01(r.u0), clamp01(r.u1));
    rawVs.push(clamp01(r.v0), clamp01(r.v1));
  }

  const gridUs = deduplicateSortedCoords(rawUs);
  const gridVs = deduplicateSortedCoords(rawVs);
  const numCols = Math.max(0, gridUs.length - 1);
  const numRows = Math.max(0, gridVs.length - 1);

  if (numCols === 0 || numRows === 0) {
    return {
      gridUs: [],
      gridVs: [],
      activeCells: [],
      mergedRects: [],
      contourSegments: [],
      coverageRatio: 0,
    };
  }

  const activeCells: boolean[][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => false)
  );

  for (const op of effectiveOps) {
    const r = op.rect;
    if (!r) continue;
    const u0 = clamp01(r.u0);
    const u1 = clamp01(r.u1);
    const v0 = clamp01(r.v0);
    const v1 = clamp01(r.v1);

    if (op.mode === 'new') {
      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          activeCells[row][col] = false;
        }
      }
    }

    const fillValue = op.mode !== 'subtract';
    for (let row = 0; row < numRows; row++) {
      const cellMidV = 0.5 * (gridVs[row] + gridVs[row + 1]);
      if (cellMidV < v0 - COORD_EPSILON || cellMidV > v1 + COORD_EPSILON) continue;
      for (let col = 0; col < numCols; col++) {
        const cellMidU = 0.5 * (gridUs[col] + gridUs[col + 1]);
        if (cellMidU >= u0 - COORD_EPSILON && cellMidU <= u1 + COORD_EPSILON) {
          activeCells[row][col] = fillValue;
        }
      }
    }
  }

  // Coalesce horizontal runs per row, then merge identical horizontal spans vertically
  let activeArea = 0;
  const rowBands: Array<Array<{ u0: number; u1: number; v0: number; v1: number }>> = [];

  for (let row = 0; row < numRows; row++) {
    const v0 = gridVs[row];
    const v1 = gridVs[row + 1];
    const rowHeight = v1 - v0;
    const spans: Array<{ u0: number; u1: number; v0: number; v1: number }> = [];
    let col = 0;
    while (col < numCols) {
      if (!activeCells[row][col]) {
        col++;
        continue;
      }
      const startCol = col;
      while (col + 1 < numCols && activeCells[row][col + 1]) {
        col++;
      }
      const u0 = gridUs[startCol];
      const u1 = gridUs[col + 1];
      activeArea += (u1 - u0) * rowHeight;
      spans.push({ u0, u1, v0, v1 });
      col++;
    }
    rowBands.push(spans);
  }

  const mergedRects: NormalizedRect[] = [];
  let activeVerticalSpans: Array<{ u0: number; u1: number; v0: number; v1: number }> = [];

  for (let row = 0; row < numRows; row++) {
    const currentSpans = rowBands[row];
    const nextVerticalSpans: Array<{ u0: number; u1: number; v0: number; v1: number }> = [];
    const matchedCurrent = new Set<number>();

    for (const prev of activeVerticalSpans) {
      let matchIdx = -1;
      for (let i = 0; i < currentSpans.length; i++) {
        if (matchedCurrent.has(i)) continue;
        const cand = currentSpans[i];
        if (
          Math.abs(cand.u0 - prev.u0) <= COORD_EPSILON &&
          Math.abs(cand.u1 - prev.u1) <= COORD_EPSILON &&
          Math.abs(cand.v0 - prev.v1) <= COORD_EPSILON
        ) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx >= 0) {
        matchedCurrent.add(matchIdx);
        nextVerticalSpans.push({
          u0: prev.u0,
          u1: prev.u1,
          v0: prev.v0,
          v1: currentSpans[matchIdx].v1,
        });
      } else {
        mergedRects.push(prev);
      }
    }

    for (let i = 0; i < currentSpans.length; i++) {
      if (!matchedCurrent.has(i)) {
        nextVerticalSpans.push(currentSpans[i]);
      }
    }
    activeVerticalSpans = nextVerticalSpans;
  }

  for (const rem of activeVerticalSpans) {
    mergedRects.push(rem);
  }

  // Extract exact perimeter & hole contour segments with collinear merging
  const contourSegments: NormalizedSegment[] = [];

  // Horizontal contour edges along each gridV[row]
  for (let row = 0; row <= numRows; row++) {
    const v = gridVs[row];
    let col = 0;
    while (col < numCols) {
      const above = row > 0 ? activeCells[row - 1][col] : false;
      const below = row < numRows ? activeCells[row][col] : false;
      if (above === below) {
        col++;
        continue;
      }
      const startCol = col;
      while (col + 1 < numCols) {
        const nextAbove = row > 0 ? activeCells[row - 1][col + 1] : false;
        const nextBelow = row < numRows ? activeCells[row][col + 1] : false;
        if (nextAbove !== nextBelow) {
          col++;
        } else {
          break;
        }
      }
      contourSegments.push({
        u0: gridUs[startCol],
        v0: v,
        u1: gridUs[col + 1],
        v1: v,
      });
      col++;
    }
  }

  // Vertical contour edges along each gridU[col]
  for (let col = 0; col <= numCols; col++) {
    const u = gridUs[col];
    let row = 0;
    while (row < numRows) {
      const left = col > 0 ? activeCells[row][col - 1] : false;
      const right = col < numCols ? activeCells[row][col] : false;
      if (left === right) {
        row++;
        continue;
      }
      const startRow = row;
      while (row + 1 < numRows) {
        const nextLeft = col > 0 ? activeCells[row + 1][col - 1] : false;
        const nextRight = col < numCols ? activeCells[row + 1][col] : false;
        if (nextLeft !== nextRight) {
          row++;
        } else {
          break;
        }
      }
      contourSegments.push({
        u0: u,
        v0: gridVs[startRow],
        u1: u,
        v1: gridVs[row + 1],
      });
      row++;
    }
  }

  return {
    gridUs,
    gridVs,
    activeCells,
    mergedRects,
    contourSegments,
    coverageRatio: Math.max(0, Math.min(1, activeArea)),
  };
}

export function normalizedUtoWorldX(u: number, goalSignY: 1 | -1 = 1): number {
  return goalSignY * (0.5 - clamp01(u)) * GOAL_BARRIER_WIDTH_UU;
}

export function normalizedVtoWorldZ(v: number): number {
  return (1.0 - clamp01(v)) * GOAL_BARRIER_HEIGHT_UU;
}

export function isPointInGoalBarrier(
  xUu: number,
  yUu: number,
  zUu: number,
  rects: NormalizedRect[],
  targetGoal: GoalBarrierTargetGoal,
  enabled: boolean
): boolean {
  if (!enabled || !rects || rects.length === 0) return false;
  if (Math.abs(Math.abs(yUu) - GOAL_BARRIER_PLANE_Y_UU) > 45.0) return false;
  if (targetGoal === 'orange' && yUu < 0) return false;
  if (targetGoal === 'blue' && yUu > 0) return false;

  const goalSignY: 1 | -1 = yUu >= 0 ? 1 : -1;
  const marginUu = 18.0;
  for (const r of rects) {
    const xA = normalizedUtoWorldX(r.u0, goalSignY);
    const xB = normalizedUtoWorldX(r.u1, goalSignY);
    const xMin = Math.min(xA, xB) - marginUu;
    const xMax = Math.max(xA, xB) + marginUu;
    const zMin = normalizedVtoWorldZ(r.v1) - marginUu;
    const zMax = normalizedVtoWorldZ(r.v0) + marginUu;
    if (xUu >= xMin && xUu <= xMax && zUu >= zMin && zUu <= zMax) {
      return true;
    }
  }
  return false;
}

function buildSingleGoalCmfChunk(
  decomposition: GoalBarrierDecomposition,
  goalSignY: 1 | -1
): Uint8Array | null {
  const { gridUs, gridVs, activeCells } = decomposition;
  const numRows = activeCells.length;
  const numCols = numRows > 0 ? activeCells[0].length : 0;
  if (numRows === 0 || numCols === 0) return null;

  const vertIndexGrid: Int32Array = new Int32Array((numRows + 1) * (numCols + 1)).fill(-1);
  const vertices: Array<[number, number, number]> = [];
  const triangles: Array<[number, number, number]> = [];
  const yBt = (goalSignY * GOAL_BARRIER_PLANE_Y_UU) * UU_TO_BULLET_SCALE;

  const getOrAddVertex = (row: number, col: number): number => {
    const key = row * (numCols + 1) + col;
    if (vertIndexGrid[key] >= 0) return vertIndexGrid[key];
    const xUu = normalizedUtoWorldX(gridUs[col], goalSignY);
    const zUu = normalizedVtoWorldZ(gridVs[row]);
    const idx = vertices.length;
    vertices.push([xUu * UU_TO_BULLET_SCALE, yBt, zUu * UU_TO_BULLET_SCALE]);
    vertIndexGrid[key] = idx;
    return idx;
  };

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      if (!activeCells[row][col]) continue;
      // Top-left (row, col), Top-right (row, col+1), Bottom-right (row+1, col+1), Bottom-left (row+1, col)
      const vTL = getOrAddVertex(row, col);
      const vTR = getOrAddVertex(row, col + 1);
      const vBR = getOrAddVertex(row + 1, col + 1);
      const vBL = getOrAddVertex(row + 1, col);
      triangles.push([vBL, vTL, vTR], [vBL, vTR, vBR]);
    }
  }

  if (triangles.length === 0 || vertices.length === 0) return null;

  const byteLength = 8 + triangles.length * 12 + vertices.length * 12;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, triangles.length, true);
  view.setUint32(4, vertices.length, true);

  let offset = 8;
  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    view.setInt32(offset, tri[0], true);
    view.setInt32(offset + 4, tri[1], true);
    view.setInt32(offset + 8, tri[2], true);
    offset += 12;
  }

  for (let i = 0; i < vertices.length; i++) {
    const vert = vertices[i];
    view.setFloat32(offset, vert[0], true);
    view.setFloat32(offset + 4, vert[1], true);
    view.setFloat32(offset + 8, vert[2], true);
    offset += 12;
  }

  return new Uint8Array(buffer);
}

export function buildGoalBarrierCmfChunks(
  decomposition: GoalBarrierDecomposition,
  targetGoal: GoalBarrierTargetGoal = 'both',
  enabled: boolean = true
): Uint8Array[] {
  if (!enabled || !decomposition || decomposition.mergedRects.length === 0) {
    return [];
  }
  const chunks: Uint8Array[] = [];
  if (targetGoal === 'both' || targetGoal === 'orange') {
    const orangeChunk = buildSingleGoalCmfChunk(decomposition, 1);
    if (orangeChunk) chunks.push(orangeChunk);
  }
  if (targetGoal === 'both' || targetGoal === 'blue') {
    const blueChunk = buildSingleGoalCmfChunk(decomposition, -1);
    if (blueChunk) chunks.push(blueChunk);
  }
  return chunks;
}

export const DEFAULT_GOAL_BARRIER_CONFIG: GoalBarrierPersistedState = {
  enabled: false,
  selectionMode: 'new',
  targetGoal: 'both',
  opacity: 0.55,
  rects: [],
};

export const DEFAULT_GOAL_BARRIER_STATE: GoalBarrierPersistedState = DEFAULT_GOAL_BARRIER_CONFIG;

export function loadGoalBarrierConfig(): GoalBarrierPersistedState {
  try {
    const raw = safeLocalStorageGet(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GOAL_BARRIER_STATE };
    const parsed = JSON.parse(raw);
    const rects = Array.isArray(parsed.rects)
      ? parsed.rects
          .map((r: NormalizedRect) => normalizeRect(r.u0, r.v0, r.u1, r.v1))
          .filter((r: NormalizedRect | null): r is NormalizedRect => Boolean(r))
      : [];
    const selectionMode: GoalBarrierSelectionMode =
      parsed.selectionMode === 'add' || parsed.selectionMode === 'subtract' || parsed.selectionMode === 'new'
        ? parsed.selectionMode
        : 'new';
    const targetGoal: GoalBarrierTargetGoal =
      parsed.targetGoal === 'orange' || parsed.targetGoal === 'blue' || parsed.targetGoal === 'both'
        ? parsed.targetGoal
        : 'both';
    const opacity = Number.isFinite(parsed.opacity)
      ? Math.max(0.1, Math.min(1.0, Number(parsed.opacity)))
      : 0.55;
    return {
      enabled: Boolean(parsed.enabled) && rects.length > 0,
      selectionMode,
      targetGoal,
      opacity,
      rects,
    };
  } catch (err) {
    console.warn('[goalBarrierConfig] Failed to load or parse goal barrier config, falling back to DEFAULT_GOAL_BARRIER_STATE:', err);
    return { ...DEFAULT_GOAL_BARRIER_STATE };
  }
}

export function saveGoalBarrierConfig(state: GoalBarrierPersistedState): void {
  try {
    safeLocalStorageSet(
      STORAGE_KEY,
      JSON.stringify({
        enabled: state.enabled,
        selectionMode: state.selectionMode,
        targetGoal: state.targetGoal,
        opacity: state.opacity,
        rects: state.rects,
      })
    );
  } catch (err) {
    console.warn('[goalBarrierConfig] Failed to persist goal barrier config:', err);
  }
}
