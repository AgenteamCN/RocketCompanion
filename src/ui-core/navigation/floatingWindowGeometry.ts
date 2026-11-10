import { getSurfaceCalibrationOverride } from '../manifest/surfaceCalibration';
import type { FloatingWindowItem } from '../stores/floatingStore';
import { PRESET_WINDOWS } from '../stores/devFloatingPresets';

export type FloatingPresetConfig = (typeof PRESET_WINDOWS)[number];

export const DEFAULT_MIN_WINDOW_WIDTH = 340;
export const DEFAULT_MIN_WINDOW_HEIGHT = 200;
export const MIN_NON_RESIZABLE_HEIGHT = 92;
export const OUTER_RADIUS = 16;
export const CONTAINER_MARGIN = 8;

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContainerBounds {
  width: number;
  height: number;
}

export interface WindowSizeConstraints {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  resizable: boolean;
}

export interface ClampedWindowGeometry extends WindowRect {
  /** Whether X or Y position was pushed inward by container boundaries */
  isPositionClamped: boolean;
  /** Whether Width or Height was squeezed smaller than desired by container or maxHeight bounds */
  isSizeClamped: boolean;
  /** Effective maxHeight ceiling at the current state */
  effectiveMaxHeight: number;
  /** Effective minWidth floor at the current state */
  effectiveMinWidth: number;
}

export interface ResolvedWindowSizeLimits {
  isResizable: boolean;
  shouldAutoFitHeight: boolean;
  presetMinWidth: number;
  presetMinHeight: number;
  presetMaxWidth: number;
  presetMaxHeight: number | undefined;
  autoMinWidth: number;
  effectiveMinWidth: number;
  rawMinHeight: number;
  effectiveMinHeight: number;
  effectiveMaxHeight: number;
}

function resolveFloatingCalibration(itemId: string) {
  return (
    getSurfaceCalibrationOverride(itemId) ??
    getSurfaceCalibrationOverride(`floating:${itemId}`)
  );
}

/**
 * Pure helper to resolve preset + calibration override + manual + intrinsic size limits for a floating window.
 */
export function resolveWindowSizeLimits(
  item: FloatingWindowItem,
  matchedPreset: FloatingPresetConfig | undefined,
  intrinsicMinWidth: number,
  intrinsicMaxHeight: number | null
): ResolvedWindowSizeLimits {
  const calibrated = resolveFloatingCalibration(item.id);
  const isResizable = (item.resizable ?? matchedPreset?.resizable ?? true) !== false;
  const calibratedAutoFit =
    calibrated?.mode !== undefined ? calibrated.mode === 'adaptive' : undefined;
  const shouldAutoFitHeight =
    calibratedAutoFit !== undefined
      ? calibratedAutoFit
      : matchedPreset?.tier === 'developer'
      ? Boolean(matchedPreset.autoFitHeight)
      : item.autoFitHeight ??
        matchedPreset?.autoFitHeight ??
        (!isResizable || matchedPreset?.tier === 'user');

  const presetMinWidth = Math.round(
    item.minWidth ??
      calibrated?.minWidth ??
      matchedPreset?.minWidth ??
      DEFAULT_MIN_WINDOW_WIDTH
  );
  const presetMinHeight = Math.round(
    item.minHeight ??
      calibrated?.minHeight ??
      matchedPreset?.minHeight ??
      (isResizable ? DEFAULT_MIN_WINDOW_HEIGHT : MIN_NON_RESIZABLE_HEIGHT)
  );
  const presetMaxWidth = item.maxWidth ?? matchedPreset?.maxWidth ?? Infinity;
  const presetMaxHeight =
    item.maxHeight ?? calibrated?.maxHeight ?? matchedPreset?.maxHeight;

  const autoMinWidth = Math.max(presetMinWidth, intrinsicMinWidth);
  const effectiveMinWidth =
    item.manualMinWidth !== undefined && Number.isFinite(item.manualMinWidth)
      ? Math.max(240, Math.round(item.manualMinWidth))
      : autoMinWidth;

  const rawMinHeight =
    item.manualMinHeight !== undefined && Number.isFinite(item.manualMinHeight)
      ? Math.max(72, Math.round(item.manualMinHeight))
      : presetMinHeight;

  const effectiveMinHeight =
    !isResizable && item.manualMinHeight === undefined && intrinsicMaxHeight !== null
      ? intrinsicMaxHeight
      : intrinsicMaxHeight !== null
      ? Math.min(rawMinHeight, intrinsicMaxHeight)
      : rawMinHeight;

  const effectiveMaxHeight =
    presetMaxHeight !== undefined
      ? presetMaxHeight
      : intrinsicMaxHeight !== null
      ? Math.max(effectiveMinHeight, Math.min(5000, intrinsicMaxHeight))
      : 5000;

  return {
    isResizable,
    shouldAutoFitHeight,
    presetMinWidth,
    presetMinHeight,
    presetMaxWidth,
    presetMaxHeight,
    autoMinWidth,
    effectiveMinWidth,
    rawMinHeight,
    effectiveMinHeight,
    effectiveMaxHeight,
  };
}

/**
 * Pure helper to compute initial desired anchor rect for a floating window.
 */
export function computeInitialDesiredAnchor(
  item: FloatingWindowItem,
  matchedPreset: FloatingPresetConfig | undefined,
  limits: Pick<
    ResolvedWindowSizeLimits,
    'shouldAutoFitHeight' | 'effectiveMinWidth' | 'rawMinHeight'
  >
): WindowRect {
  const calibrated = resolveFloatingCalibration(item.id);
  const calibratedHeight =
    typeof calibrated?.height === 'number' ? calibrated.height : undefined;
  const defaultPresetHeight = calibratedHeight ?? matchedPreset?.height;
  const defaultPresetWidth = calibrated?.width ?? matchedPreset?.width;

  const baseHeight =
    !item.userAdjustedSize &&
    !limits.shouldAutoFitHeight &&
    defaultPresetHeight !== undefined
      ? defaultPresetHeight
      : item.height ?? defaultPresetHeight ?? 360;

  return {
    x: Math.round(item.position?.x ?? 40),
    y: Math.round(item.position?.y ?? 40),
    width: Math.round(
      limits.shouldAutoFitHeight && !item.userAdjustedSize
        ? limits.effectiveMinWidth
        : Math.max(
            limits.effectiveMinWidth,
            item.width ?? defaultPresetWidth ?? 440
          )
    ),
    height: Math.round(Math.max(limits.rawMinHeight, baseHeight)),
  };
}

/**
 * Pure helper to adjust desired anchor height when intrinsic content height changes.
 */
export function resolveAutoFittedDesiredAnchor(
  prev: WindowRect,
  totalIntrinsicH: number,
  options: {
    isResizable: boolean;
    shouldAutoFitHeight: boolean;
    userHasResized: boolean;
    prevIntrinsicH: number | null;
  }
): WindowRect {
  if (!options.isResizable) {
    return Math.abs(prev.height - totalIntrinsicH) <= 1
      ? prev
      : { ...prev, height: totalIntrinsicH };
  }
  if (!options.shouldAutoFitHeight) {
    return prev;
  }
  if (!options.userHasResized) {
    return Math.abs(prev.height - totalIntrinsicH) <= 1
      ? prev
      : { ...prev, height: totalIntrinsicH };
  }
  if (
    options.prevIntrinsicH !== null &&
    Math.abs(prev.height - options.prevIntrinsicH) <= 4 &&
    Math.abs(totalIntrinsicH - options.prevIntrinsicH) > 2
  ) {
    return { ...prev, height: totalIntrinsicH };
  }
  if (prev.height > totalIntrinsicH) {
    return { ...prev, height: totalIntrinsicH };
  }
  return prev;
}

/**
 * Pure helper to sync external item width/height changes into the desired anchor rect.
 */
export function resolveSyncedDesiredSize(
  prev: WindowRect,
  item: FloatingWindowItem,
  limits: Pick<
    ResolvedWindowSizeLimits,
    | 'isResizable'
    | 'shouldAutoFitHeight'
    | 'effectiveMinWidth'
    | 'effectiveMinHeight'
    | 'effectiveMaxHeight'
  >,
  intrinsicMaxHeight: number | null
): WindowRect {
  if (!item.width || !item.height) return prev;
  const nextW =
    limits.shouldAutoFitHeight && !item.userAdjustedSize
      ? limits.effectiveMinWidth
      : Math.max(limits.effectiveMinWidth, Math.round(item.width));
  const nextH =
    !limits.isResizable &&
    item.manualMinHeight === undefined &&
    intrinsicMaxHeight !== null
      ? intrinsicMaxHeight
      : limits.shouldAutoFitHeight &&
        !item.userAdjustedSize &&
        intrinsicMaxHeight !== null
      ? intrinsicMaxHeight
      : Math.max(
          limits.effectiveMinHeight,
          Math.min(limits.effectiveMaxHeight, Math.round(item.height))
        );
  if (prev.width === nextW && prev.height === nextH) return prev;
  return { ...prev, width: nextW, height: nextH };
}

/**
 * Pure helper to compute clamped resize rect during active bottom-right corner dragging.
 */
export function resolveResizedWindowAnchor(
  startRect: WindowRect,
  deltaW: number,
  deltaH: number,
  containerBounds: ContainerBounds | null,
  constraints: {
    effectiveMinWidth: number;
    presetMaxWidth: number;
    effectiveMinHeight: number;
    effectiveMaxHeight: number;
  },
  margin = CONTAINER_MARGIN
): WindowRect {
  const maxWInContainer = containerBounds
    ? Math.max(
        constraints.effectiveMinWidth,
        containerBounds.width - margin - startRect.x
      )
    : constraints.presetMaxWidth;
  const maxHInContainer = containerBounds
    ? Math.max(
        constraints.effectiveMinHeight,
        Math.min(
          constraints.effectiveMaxHeight,
          containerBounds.height - margin - startRect.y
        )
      )
    : constraints.effectiveMaxHeight;

  const nextWidth = Math.max(
    constraints.effectiveMinWidth,
    Math.min(maxWInContainer, Math.round(startRect.width + deltaW))
  );
  const nextHeight = Math.max(
    constraints.effectiveMinHeight,
    Math.min(maxHInContainer, Math.round(startRect.height + deltaH))
  );

  return {
    x: startRect.x,
    y: startRect.y,
    width: nextWidth,
    height: nextHeight,
  };
}

/**
 * Pure, zero-coupling spatial constraint solver for floating windows.
 *
 * Guarantees:
 * 1. All 4 corners (`(x, y)`, `(x+w, y)`, `(x, y+h)`, `(x+w, y+h)`) stay strictly inside
 *    the container bounds `[margin, container.width - margin] × [margin, container.height - margin]`.
 * 2. Preserves the user's desired anchor (`desiredRect`) whenever sufficient space exists:
 *    - First tries to keep `desiredRect.width` and `desiredRect.height` (clamped to `[minWidth, maxWidth]`
 *      and `[minHeight, maxHeight]`), shifting `x` / `y` inward if the window overflows the right/bottom edge.
 *    - If the container itself is smaller than the desired width/height, squeezes the effective width/height
 *      to fit the container.
 * 3. When `prioritizePositionSqueeze` is true (e.g. while actively dragging the window downward in an arc
 *    near the bottom edge), allows squeezing height down toward `minHeight` before pushing `y` back up,
 *    and restores the desired height automatically when dragged back to open space.
 */
export function resolveClampedWindowGeometry(
  desiredRect: WindowRect,
  container: ContainerBounds | null,
  constraints: WindowSizeConstraints,
  options?: {
    margin?: number;
    prioritizePositionSqueeze?: boolean;
  }
): ClampedWindowGeometry {
  const margin = options?.margin ?? CONTAINER_MARGIN;
  const minW = Math.max(160, Math.round(constraints.minWidth));
  const maxW = Number.isFinite(constraints.maxWidth)
    ? Math.max(minW, Math.round(constraints.maxWidth))
    : Infinity;
  const minH = Math.max(72, Math.round(constraints.minHeight));
  const maxH = Number.isFinite(constraints.maxHeight)
    ? Math.max(minH, Math.round(constraints.maxHeight))
    : Infinity;

  // Base target size within intrinsic/preset constraints
  const targetW = Math.max(minW, Math.min(maxW, Math.round(desiredRect.width)));
  const targetH = Math.max(minH, Math.min(maxH, Math.round(desiredRect.height)));

  if (!container || container.width <= 0 || container.height <= 0) {
    const x = Math.max(margin, Math.round(desiredRect.x));
    const y = Math.max(margin, Math.round(desiredRect.y));
    return {
      x,
      y,
      width: targetW,
      height: targetH,
      isPositionClamped: x !== Math.round(desiredRect.x) || y !== Math.round(desiredRect.y),
      isSizeClamped:
        targetW !== Math.round(desiredRect.width) ||
        targetH !== Math.round(desiredRect.height),
      effectiveMaxHeight: maxH,
      effectiveMinWidth: minW,
    };
  }

  const availW = Math.max(120, Math.floor(container.width - margin * 2));
  const availH = Math.max(72, Math.floor(container.height - margin * 2));

  const effectiveMinW = Math.min(minW, availW);
  const effectiveMinH = Math.min(minH, availH);
  const effectiveMaxW = Math.min(maxW, availW);
  const effectiveMaxH = Math.min(maxH, availH);

  let width = Math.max(effectiveMinW, Math.min(effectiveMaxW, targetW));
  let height = Math.max(effectiveMinH, Math.min(effectiveMaxH, targetH));

  let x = Math.round(desiredRect.x);
  let y = Math.round(desiredRect.y);

  // Clamp top-left first so top-left corner never leaves container
  x = Math.max(margin, x);
  y = Math.max(margin, y);

  if (options?.prioritizePositionSqueeze && constraints.resizable) {
    // When dragging along an arc toward bottom/right, keep cursor position as long as size >= minSize,
    // and only clamp x/y once window is already squeezed to effectiveMinW / effectiveMinH.
    const maxAllowedXAtMinW = Math.max(margin, container.width - margin - effectiveMinW);
    const maxAllowedYAtMinH = Math.max(margin, container.height - margin - effectiveMinH);

    x = Math.min(x, Math.floor(maxAllowedXAtMinW));
    y = Math.min(y, Math.floor(maxAllowedYAtMinH));

    const maxWAtX = Math.max(effectiveMinW, Math.floor(container.width - margin - x));
    const maxHAtY = Math.max(effectiveMinH, Math.floor(container.height - margin - y));

    width = Math.max(effectiveMinW, Math.min(width, maxWAtX));
    height = Math.max(effectiveMinH, Math.min(height, maxHAtY));
  } else {
    // Default / Container-Resize push-inward mode:
    // Push X and Y inward so the window stays on screen at its desired width/height;
    // if container is narrower/shorter than width/height, x/y hits `margin` and width/height is squeezed.
    const maxAllowedX = Math.max(margin, Math.floor(container.width - margin - width));
    const maxAllowedY = Math.max(margin, Math.floor(container.height - margin - height));

    x = Math.min(x, maxAllowedX);
    y = Math.min(y, maxAllowedY);

    // Final guarantee that right and bottom edges never exceed container - margin
    width = Math.min(width, Math.max(effectiveMinW, Math.floor(container.width - margin - x)));
    height = Math.min(height, Math.max(effectiveMinH, Math.floor(container.height - margin - y)));
  }

  const isPositionClamped =
    x !== Math.round(desiredRect.x) || y !== Math.round(desiredRect.y);
  const isSizeClamped =
    width !== Math.round(desiredRect.width) ||
    height !== Math.round(desiredRect.height);

  return {
    x,
    y,
    width,
    height,
    isPositionClamped,
    isSizeClamped,
    effectiveMaxHeight: effectiveMaxH,
    effectiveMinWidth: effectiveMinW,
  };
}
