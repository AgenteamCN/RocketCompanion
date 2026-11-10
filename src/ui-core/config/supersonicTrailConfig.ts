export type SupersonicTrailOrientationMode =
  | 'surface-aligned'
  | 'flat-ground'
  | 'camera-facing';
export type SupersonicTrailBlendingMode = 'additive' | 'normal';

export interface SupersonicTrailConfig {
  enabled: boolean;
  forceActive: boolean;
  startAgeTicks: number;
  endAgeTicks: number;

  // 3-Point Color Gradient (Head White -> Mid Pink -> Tail Purple)
  headColor: string;
  midColor: string;
  tailColor: string;
  midColorPosPct: number;
  headGlowStrength: number;
  colorTransitionCurve: number;

  // Stage 1 Bezier: Head (White) -> Mid (Pink)
  headToMidBezierP1X: number;
  headToMidBezierP1Y: number;
  headToMidBezierP2X: number;
  headToMidBezierP2Y: number;

  // Stage 2 Bezier: Mid (Pink) -> Tail (Purple)
  midToTailBezierP1X: number;
  midToTailBezierP1Y: number;
  midToTailBezierP2X: number;
  midToTailBezierP2Y: number;

  // Ribbon Taper & Opacity
  headWidthUu: number;
  tailWidthUu: number;
  widthTaperCurve: number;
  opacity: number;
  fadeCurve: number;
  surfaceLiftUu: number;

  // Orientation, Ground-Hinge Vertical Stand & POV Rules
  orientationMode: SupersonicTrailOrientationMode;
  cameraTiltStrength: number;
  uprightHeightScale: number;
  uprightGroundHingeLift: number;
  povForceUprightPreview: boolean;

  blendingMode: SupersonicTrailBlendingMode;
  minSampleDistUu: number;
  maxStepBreakDistUu: number;
  requireWheelContact: boolean;
  useSuspensionCompression: boolean;
  maxHistoryTicks: number;
}

export type SupersonicTrailConfigPatch = Partial<SupersonicTrailConfig>;

export const DEFAULT_SUPERSONIC_TRAIL_CONFIG: Readonly<SupersonicTrailConfig> = Object.freeze({
  enabled: true,
  forceActive: false,
  startAgeTicks: 1,
  endAgeTicks: 30,

  headColor: '#ffffff',
  midColor: '#ff4fd8',
  tailColor: '#8300ff',
  midColorPosPct: 24.1,
  headGlowStrength: 1,
  colorTransitionCurve: 0.2,

  headToMidBezierP1X: 0.6,
  headToMidBezierP1Y: 0.25,
  headToMidBezierP2X: 0.62,
  headToMidBezierP2Y: 0.93,

  midToTailBezierP1X: 0.1,
  midToTailBezierP1Y: 0.76,
  midToTailBezierP2X: 0.14,
  midToTailBezierP2Y: 0.63,

  headWidthUu: 15,
  tailWidthUu: 1,
  widthTaperCurve: 1,
  opacity: 0.65,
  fadeCurve: 1,
  surfaceLiftUu: 1,

  orientationMode: 'surface-aligned',
  cameraTiltStrength: 0.8,
  uprightHeightScale: 1.35,
  uprightGroundHingeLift: 1.0,
  povForceUprightPreview: false,

  blendingMode: 'normal',
  minSampleDistUu: 3.5,
  maxStepBreakDistUu: 240,
  requireWheelContact: true,
  useSuspensionCompression: true,
  maxHistoryTicks: 120,
});

export const supersonicTrailRuntimeConfig: SupersonicTrailConfig = {
  ...DEFAULT_SUPERSONIC_TRAIL_CONFIG,
};

export function midPctToAgeTicks(
  midPct: number,
  startAgeTicks: number,
  endAgeTicks: number
): number {
  const span = Math.max(1, endAgeTicks - startAgeTicks);
  const clampedPct = Math.max(1, Math.min(99, Number(midPct) || 24.1));
  return Number((startAgeTicks + (clampedPct / 100) * span).toFixed(2));
}

export function ageTicksToMidPct(
  midAgeTicks: number,
  startAgeTicks: number,
  endAgeTicks: number
): number {
  const span = Math.max(1, endAgeTicks - startAgeTicks);
  const rawPct = ((midAgeTicks - startAgeTicks) / span) * 100;
  return Math.max(1, Math.min(99, Number(rawPct.toFixed(1))));
}

type SupersonicTrailConfigCallback = (snapshot: SupersonicTrailConfig) => void;
const trailConfigCallbacks: SupersonicTrailConfigCallback[] = [];

export function getSupersonicTrailConfig(): SupersonicTrailConfig {
  return { ...supersonicTrailRuntimeConfig };
}

export function subscribeSupersonicTrailConfig(
  listener: SupersonicTrailConfigCallback
): () => void {
  if (typeof listener !== 'function') return () => {};
  if (!trailConfigCallbacks.includes(listener)) {
    trailConfigCallbacks.push(listener);
  }
  return () => {
    const idx = trailConfigCallbacks.indexOf(listener);
    if (idx !== -1) {
      trailConfigCallbacks.splice(idx, 1);
    }
  };
}

function notifySupersonicTrailListeners(): SupersonicTrailConfig {
  const snapshot = getSupersonicTrailConfig();
  for (const listener of trailConfigCallbacks) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  }
  return snapshot;
}

const VALID_TRAIL_KEYS = new Set<string>(Object.keys(DEFAULT_SUPERSONIC_TRAIL_CONFIG));

export function updateSupersonicTrailConfig(
  patch: SupersonicTrailConfigPatch = {}
): SupersonicTrailConfig {
  if (!patch || typeof patch !== 'object') return getSupersonicTrailConfig();
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (VALID_TRAIL_KEYS.has(k) && v !== undefined) {
      sanitized[k] = v;
    }
  }
  Object.assign(supersonicTrailRuntimeConfig, sanitized);
  if (supersonicTrailRuntimeConfig.endAgeTicks <= supersonicTrailRuntimeConfig.startAgeTicks) {
    supersonicTrailRuntimeConfig.endAgeTicks = supersonicTrailRuntimeConfig.startAgeTicks + 1;
  }
  supersonicTrailRuntimeConfig.midColorPosPct = Math.max(
    1,
    Math.min(99, Number(supersonicTrailRuntimeConfig.midColorPosPct) || 24.1)
  );
  return notifySupersonicTrailListeners();
}

export function resetSupersonicTrailConfig(): SupersonicTrailConfig {
  Object.assign(supersonicTrailRuntimeConfig, DEFAULT_SUPERSONIC_TRAIL_CONFIG);
  return notifySupersonicTrailListeners();
}
