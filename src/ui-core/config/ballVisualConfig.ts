/**
 * ballVisualConfig.ts
 * Pure ball visual configuration defaults, runtime state, and listener subscription.
 */

export interface BallVisualConfig {
  visible: boolean;
  opacity: number;
  temporaryOpacityOverride: number | null;
  depthWriteWhenTransparent: boolean;
  doubleSideWhenTransparent: boolean;
  wireframe: boolean;
  indicatorRingOpacity: number;
  goalDarkenJitterEnabled: boolean;
  [key: string]: unknown;
}

export const DEFAULT_BALL_VISUAL_CONFIG: BallVisualConfig = {
  visible: true,
  opacity: 1.0,
  temporaryOpacityOverride: null,
  depthWriteWhenTransparent: false,
  doubleSideWhenTransparent: false,
  wireframe: false,
  indicatorRingOpacity: 0.2,
  goalDarkenJitterEnabled: true,
};

export const ballVisualRuntimeConfig: BallVisualConfig = {
  ...DEFAULT_BALL_VISUAL_CONFIG,
};

export type BallVisualListener = (snapshot: BallVisualConfig) => void;
export type BallVisualApplier = (
  config: BallVisualConfig,
  ballRoot: unknown,
  indicatorRings: unknown[]
) => void;

const ballVisualCallbacks: BallVisualListener[] = [];
const ballVisualObjectCallbacks: BallVisualApplier[] = [];

export function normalizeTemporaryBallOpacityOverride(
  opacityOrNull: number | null | undefined
): number | null {
  return typeof opacityOrNull === 'number' && Number.isFinite(opacityOrNull)
    ? Math.max(0.05, Math.min(1.0, opacityOrNull))
    : null;
}

export function sanitizeBallVisualConfig(
  raw: Partial<BallVisualConfig> | null | undefined,
  base: BallVisualConfig = DEFAULT_BALL_VISUAL_CONFIG
): BallVisualConfig {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...base,
    ...source,
    visible: typeof source.visible === 'boolean' ? source.visible : base.visible,
    opacity:
      typeof source.opacity === 'number' && Number.isFinite(source.opacity)
        ? Math.max(0.0, Math.min(1.0, source.opacity))
        : base.opacity,
    temporaryOpacityOverride:
      source.temporaryOpacityOverride !== undefined
        ? normalizeTemporaryBallOpacityOverride(source.temporaryOpacityOverride)
        : base.temporaryOpacityOverride,
    depthWriteWhenTransparent:
      typeof source.depthWriteWhenTransparent === 'boolean'
        ? source.depthWriteWhenTransparent
        : base.depthWriteWhenTransparent,
    doubleSideWhenTransparent:
      typeof source.doubleSideWhenTransparent === 'boolean'
        ? source.doubleSideWhenTransparent
        : base.doubleSideWhenTransparent,
    wireframe: typeof source.wireframe === 'boolean' ? source.wireframe : base.wireframe,
    indicatorRingOpacity:
      typeof source.indicatorRingOpacity === 'number' &&
      Number.isFinite(source.indicatorRingOpacity)
        ? Math.max(0.0, Math.min(1.0, source.indicatorRingOpacity))
        : base.indicatorRingOpacity,
    goalDarkenJitterEnabled:
      typeof source.goalDarkenJitterEnabled === 'boolean'
        ? source.goalDarkenJitterEnabled
        : base.goalDarkenJitterEnabled,
  };
}

export function getBallVisualConfig(): BallVisualConfig {
  return { ...ballVisualRuntimeConfig };
}

export function subscribeBallVisualConfig(listener: BallVisualListener): () => void {
  if (typeof listener !== 'function') return () => {};
  if (!ballVisualCallbacks.includes(listener)) {
    ballVisualCallbacks.push(listener);
  }
  return () => {
    const idx = ballVisualCallbacks.indexOf(listener);
    if (idx !== -1) ballVisualCallbacks.splice(idx, 1);
  };
}

export function registerBallVisualApplier(applier: BallVisualApplier): () => void {
  if (typeof applier !== 'function') return () => {};
  if (!ballVisualObjectCallbacks.includes(applier)) {
    ballVisualObjectCallbacks.push(applier);
  }
  return () => {
    const idx = ballVisualObjectCallbacks.indexOf(applier);
    if (idx !== -1) ballVisualObjectCallbacks.splice(idx, 1);
  };
}

export function updateBallVisualConfig(
  patch: Partial<BallVisualConfig> = {},
  ballRoot: unknown = null,
  indicatorRings: unknown[] = []
): BallVisualConfig {
  if (patch) {
    Object.assign(ballVisualRuntimeConfig, sanitizeBallVisualConfig(patch, ballVisualRuntimeConfig));
  }
  for (const applier of ballVisualObjectCallbacks) {
    try {
      applier(ballVisualRuntimeConfig, ballRoot, indicatorRings);
    } catch (err) {
      console.warn('[ballVisualConfig] Object applier threw an error:', err);
    }
  }
  const snapshot = { ...ballVisualRuntimeConfig };
  for (const listener of ballVisualCallbacks) {
    try {
      listener(snapshot);
    } catch (err) {
      console.warn('[ballVisualConfig] Listener threw an error:', err);
    }
  }
  return snapshot;
}

export function setTemporaryBallOpacityOverride(
  opacityOrNull: number | null = null,
  ballRoot: unknown = null,
  indicatorRings: unknown[] = []
): BallVisualConfig {
  const normalized = normalizeTemporaryBallOpacityOverride(opacityOrNull);
  if (ballVisualRuntimeConfig.temporaryOpacityOverride === normalized && !ballRoot) {
    return { ...ballVisualRuntimeConfig };
  }
  return updateBallVisualConfig({ temporaryOpacityOverride: normalized }, ballRoot, indicatorRings);
}
