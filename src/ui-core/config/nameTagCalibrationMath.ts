import {
  DEFAULT_NAME_TAG_CONFIG,
  DEFAULT_NAME_TAG_DISTINCT_COLORS,
  DEFAULT_NAME_TAG_SLOT_CODES,
  DEFAULT_RUNTIME_SYNC_SNAPSHOT,
  KICKOFF_PERMUTATION_COUNT,
  NAME_TAG_REFERENCE_DEPTH_UU,
  resolveNameTagVariantParams,
  type NameTagAerialClimbTriggerMode,
  type NameTagAnonymizeMode,
  type NameTagBoostBorderAudience,
  type NameTagBoostBorderColorMode,
  type NameTagBoostBorderOverride,
  type NameTagBoostIndicatorMode,
  type NameTagCameraMode,
  type NameTagCarOverride,
  type NameTagCarTelemetry,
  type NameTagCardDisplayMode,
  type NameTagCircleColorMode,
  type NameTagConfig,
  type NameTagFittedParameters,
  type NameTagFontFamily,
  type NameTagFontWeight,
  type NameTagRuntimeSyncSnapshot,
  type NameTagTelemetrySnapshot,
} from './nameTagConfig';

export type {
  NameTagBoostBorderOverride,
  NameTagBoostIndicatorMode,
  NameTagCarTelemetry,
  NameTagConfig,
};

export const sanitizeHexColor = (raw: unknown, fb: string): string =>
  typeof raw === 'string' && raw.startsWith('#') && raw.length >= 4 ? raw : fb;

export const sanitizeBoostBorderAudience = (raw: unknown, fb: NameTagBoostBorderAudience): NameTagBoostBorderAudience =>
  raw === 'teammates' || raw === 'all' || raw === 'none' ? raw : fb;

export const sanitizeBoostIndicatorMode = (raw: unknown, fb: NameTagBoostIndicatorMode): NameTagBoostIndicatorMode =>
  raw === 'bottom-up-fill' || raw === 'left-right-fill' || raw === 'sunset-circle' || raw === 'border-only' ? raw : fb;

export const sanitizeAerialClimbTriggerMode = (raw: unknown, fb: NameTagAerialClimbTriggerMode): NameTagAerialClimbTriggerMode =>
  raw === 'double-jump' || raw === 'hold-jump-pitch' || raw === 'either' || raw === 'both' ? raw : fb;

export const sanitizeAnonymizeMode = (raw: unknown, fb: NameTagAnonymizeMode): NameTagAnonymizeMode =>
  raw === 'disabled' || raw === 'opponents' || raw === 'teammates' || raw === 'both' ? raw : fb;

function num(raw: unknown, fallback: number, round = false): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.error('[NameTagConfig] Invalid numeric value:', raw);
    return fallback;
  }
  return round ? Math.round(parsed) : parsed;
}

const b = (val: unknown, fb: boolean): boolean => (typeof val === 'boolean' ? val : fb);

const sanitizeFontFamily = (raw: unknown, fb: NameTagFontFamily): NameTagFontFamily =>
  raw === 'jetbrains-mono' || raw === 'sf-mono' || raw === 'archivo' ? raw : fb;

const sanitizeFontWeight = (raw: unknown, fb: NameTagFontWeight): NameTagFontWeight => {
  const wNum = Number(raw) as NameTagFontWeight;
  return wNum === 400 || wNum === 500 || wNum === 600 || wNum === 700 ? wNum : fb;
};

export function sanitizeCarOverride(
  raw: Partial<NameTagCarOverride> | null | undefined,
  fbWorld: number,
  fbScreen: number
): NameTagCarOverride {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: Boolean(s.enabled),
    scaleMultiplier: num(s.scaleMultiplier, 1.0),
    worldOffsetUu: num(s.worldOffsetUu, fbWorld),
    screenOffsetPx: num(s.screenOffsetPx, fbScreen),
  };
}

export function sanitizeConfig(raw: Partial<NameTagConfig> | null | undefined): NameTagConfig {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const D = DEFAULT_NAME_TAG_CONFIG;
  const out: Record<string, unknown> = { ...D };

  for (const [k, defVal] of Object.entries(D)) {
    if (typeof defVal === 'number') {
      out[k] = num(s[k], defVal, k === 'maxChars');
    } else if (typeof defVal === 'boolean') {
      out[k] = b(s[k], defVal);
    } else if (typeof defVal === 'string' && defVal.startsWith('#')) {
      out[k] = sanitizeHexColor(s[k], defVal);
    }
  }

  const rawScale = num(s.cardRenderScale, D.cardRenderScale);
  out.cardRenderScale = Math.round(rawScale > 0 && rawScale <= 4 ? rawScale * 100 : rawScale);
  out.fontFamily = sanitizeFontFamily(s.fontFamily, D.fontFamily);
  out.fontWeight = sanitizeFontWeight(s.fontWeight, D.fontWeight);
  out.depthMetric = s.depthMetric === 'euclidean' ? 'euclidean' : 'viewZ';

  out.singleCharFontFamily = sanitizeFontFamily(s.singleCharFontFamily, D.singleCharFontFamily);
  out.singleCharFontWeight = sanitizeFontWeight(s.singleCharFontWeight, D.singleCharFontWeight);
  out.singleCharDepthMetric = s.singleCharDepthMetric === 'euclidean' ? 'euclidean' : 'viewZ';

  out.boostBorderColorMode =
    s.boostBorderColorMode === 'shared' || s.boostBorderColorMode === 'team'
      ? (s.boostBorderColorMode as NameTagBoostBorderColorMode)
      : D.boostBorderColorMode;
  out.boostIndicatorMode = sanitizeBoostIndicatorMode(s.boostIndicatorMode, D.boostIndicatorMode);
  out.boostBorderMatchAudience = sanitizeBoostBorderAudience(s.boostBorderMatchAudience, D.boostBorderMatchAudience);
  out.boostBorderReplayAudience = sanitizeBoostBorderAudience(s.boostBorderReplayAudience, D.boostBorderReplayAudience);
  out.offscreenAudience = sanitizeBoostBorderAudience(s.offscreenAudience, D.offscreenAudience);
  out.aerialClimbAlertAudience = sanitizeBoostBorderAudience(s.aerialClimbAlertAudience, D.aerialClimbAlertAudience);
  out.aerialClimbTriggerMode = sanitizeAerialClimbTriggerMode(s.aerialClimbTriggerMode, D.aerialClimbTriggerMode);

  out.anonymizePlayerNames = sanitizeAnonymizeMode(s.anonymizePlayerNames, D.anonymizePlayerNames);
  const cardDisplayMode: NameTagCardDisplayMode =
    s.cardDisplayMode === 'single-char' || s.cardDisplayMode === 'pill' ? s.cardDisplayMode : D.cardDisplayMode;
  out.cardDisplayMode = cardDisplayMode;
  out.circleColorMode =
    s.circleColorMode === 'car-primary' || s.circleColorMode === 'team'
      ? (s.circleColorMode as NameTagCircleColorMode)
      : D.circleColorMode;

  out.slotCodes = Array.isArray(s.slotCodes) && s.slotCodes.length === 6
    ? s.slotCodes.map((c, i) => String(c || DEFAULT_NAME_TAG_SLOT_CODES[i] || 'X').trim().slice(0, 3))
    : [...DEFAULT_NAME_TAG_SLOT_CODES];
  out.distinctCarColors = Array.isArray(s.distinctCarColors) && s.distinctCarColors.length === 6
    ? s.distinctCarColors.map((h, i) => sanitizeHexColor(h, DEFAULT_NAME_TAG_DISTINCT_COLORS[i] || '#0284c7'))
    : [...DEFAULT_NAME_TAG_DISTINCT_COLORS];
  out.previewNames = Array.isArray(s.previewNames) && s.previewNames.length === 6
    ? s.previewNames.map((n, i) => String(n || D.previewNames[i]))
    : [...D.previewNames];
  out.previewBoostAmounts = Array.isArray(s.previewBoostAmounts) && s.previewBoostAmounts.length === 6
    ? s.previewBoostAmounts.map((v, i) => num(v, D.previewBoostAmounts[i] ?? 100, true))
    : [...D.previewBoostAmounts];
  out.previewAerialClimbingFlags = Array.isArray(s.previewAerialClimbingFlags) && s.previewAerialClimbingFlags.length === 6
    ? s.previewAerialClimbingFlags.map((f, i) => b(f, Boolean(D.previewAerialClimbingFlags[i])))
    : [...D.previewAerialClimbingFlags];
  out.carOverrides = Array.from({ length: 6 }, (_, i) =>
    sanitizeCarOverride(
      Array.isArray(s.carOverrides) ? s.carOverrides[i] : null,
      out.verticalOffsetUu as number,
      out.screenVerticalOffsetPx as number
    )
  );
  out.singleCharCarOverrides = Array.from({ length: 6 }, (_, i) =>
    sanitizeCarOverride(
      Array.isArray(s.singleCharCarOverrides) ? s.singleCharCarOverrides[i] : null,
      out.singleCharVerticalOffsetUu as number,
      out.singleCharScreenVerticalOffsetPx as number
    )
  );

  return out as unknown as NameTagConfig;
}

export function mergeNameTagConfigPatch(currentConfig: NameTagConfig, patch: Partial<NameTagConfig>): NameTagConfig {
  return sanitizeConfig({ ...currentConfig, ...patch });
}

export function sanitizeRuntimeSyncSnapshot(raw: Partial<NameTagRuntimeSyncSnapshot> | null | undefined): NameTagRuntimeSyncSnapshot {
  const s = raw && typeof raw === 'object' ? raw : {};
  const R = DEFAULT_RUNTIME_SYNC_SNAPSHOT;
  const validModes: NameTagCameraMode[] = ['pov', 'wasmPov', 'rearView', 'free', 'director', 'podium'];
  const activeCameraMode: NameTagCameraMode = validModes.includes(s.activeCameraMode as NameTagCameraMode)
    ? (s.activeCameraMode as NameTagCameraMode)
    : R.activeCameraMode;
  const kickoffIndex = Number.isFinite(Number(s.kickoffPermutationIndex))
    ? Math.max(0, Math.round(Number(s.kickoffPermutationIndex))) % KICKOFF_PERMUTATION_COUNT
    : R.kickoffPermutationIndex;
  const focusedCarIndex = Number.isFinite(Number(s.focusedCarIndex))
    ? Math.max(0, Math.min(5, Math.round(Number(s.focusedCarIndex))))
    : R.focusedCarIndex;
  const selectedCalibrationCarIndex = Number.isFinite(Number(s.selectedCalibrationCarIndex))
    ? Math.max(0, Math.min(5, Math.round(Number(s.selectedCalibrationCarIndex))))
    : R.selectedCalibrationCarIndex;
  const boostBorderOverride: NameTagBoostBorderOverride =
    s.boostBorderOverride === 'teammates' || s.boostBorderOverride === 'all' || s.boostBorderOverride === 'none' || typeof s.boostBorderOverride === 'boolean'
      ? s.boostBorderOverride
      : null;

  return {
    isTunerArenaActive: b(s.isTunerArenaActive, R.isTunerArenaActive),
    kickoffPermutationIndex: kickoffIndex,
    activeCameraMode,
    focusedCarIndex,
    selectedCalibrationCarIndex,
    boostBorderOverride,
  };
}

export function computeFittedParametersFromSamples(config: NameTagConfig, snapshot: NameTagTelemetrySnapshot): NameTagFittedParameters {
  const isSingleChar = config.cardDisplayMode === 'single-char';
  const variant = resolveNameTagVariantParams(config, isSingleChar);
  const cars = snapshot.cars || [];
  const enabledSamples = cars.filter((c) => c.visible && c.activeDepthUu > 10 && variant.carOverrides[c.carIndex]?.enabled);
  const samples = enabledSamples.length > 0 ? enabledSamples : cars.filter((c) => c.visible && c.activeDepthUu > 10);

  if (samples.length === 0) {
    return {
      sampleCount: 0,
      cameraScaleFactor: variant.cameraScaleFactor,
      distanceScaleExponent: variant.distanceScaleExponent,
      nearScaleMultiplier: variant.nearScaleMultiplier,
      farScaleMultiplier: variant.farScaleMultiplier,
      verticalOffsetUu: variant.verticalOffsetUu,
      screenVerticalOffsetPx: variant.screenVerticalOffsetPx,
    };
  }
  if (samples.length === 1) {
    const sample = samples[0];
    const override = variant.carOverrides[sample.carIndex];
    const mult = override?.enabled ? override.scaleMultiplier : 1.0;
    return {
      sampleCount: 1,
      cameraScaleFactor: Number((variant.cameraScaleFactor * mult).toFixed(4)),
      distanceScaleExponent: variant.distanceScaleExponent,
      nearScaleMultiplier: variant.nearScaleMultiplier,
      farScaleMultiplier: variant.farScaleMultiplier,
      verticalOffsetUu: Math.round(sample.effectiveWorldOffsetUu),
      screenVerticalOffsetPx: Math.round(sample.effectiveScreenOffsetPx),
    };
  }

  const xs: number[] = [];
  const ys: number[] = [];
  const depthRatios: number[] = [];
  const totalWorldOffsets: number[] = [];
  const tanHalfFov = Math.tan(((snapshot.cameraFovDeg || 80) * (Math.PI / 180)) * 0.5);

  for (const sample of samples) {
    const depth = Math.max(50, sample.activeDepthUu);
    xs.push(Math.log(depth / NAME_TAG_REFERENCE_DEPTH_UU));
    const scaleAtDepth =
      variant.cameraScaleFactor * Math.pow(depth / NAME_TAG_REFERENCE_DEPTH_UU, variant.distanceScaleExponent) * sample.effectiveScaleMultiplier;
    ys.push(Math.log(Math.max(0.001, scaleAtDepth)));
    depthRatios.push((2 * depth * tanHalfFov) / 1080);
    totalWorldOffsets.push(sample.totalWorldVerticalOffsetUu);
  }

  const n = xs.length;
  const meanX = xs.reduce((a, c) => a + c, 0) / n;
  const meanY = ys.reduce((a, c) => a + c, 0) / n;
  let numXY = 0;
  let denXX = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    numXY += dx * (ys[i] - meanY);
    denXX += dx * dx;
  }

  const fittedExponent = denXX > 1e-4 ? numXY / denXX : variant.distanceScaleExponent;
  const fittedScaleFactor = denXX > 1e-4 ? Math.exp(meanY - fittedExponent * meanX) : Math.exp(meanY);
  const meanD = depthRatios.reduce((a, c) => a + c, 0) / n;
  const meanO = totalWorldOffsets.reduce((a, c) => a + c, 0) / n;
  let numDO = 0;
  let denDD = 0;
  for (let i = 0; i < n; i++) {
    const dd = depthRatios[i] - meanD;
    numDO += dd * (totalWorldOffsets[i] - meanO);
    denDD += dd * dd;
  }

  const fittedScreenOffsetPx = denDD > 1e-4 ? Math.round(numDO / denDD) : variant.screenVerticalOffsetPx;
  const fittedWorldOffsetUu = denDD > 1e-4 ? Math.round(meanO - fittedScreenOffsetPx * meanD) : variant.verticalOffsetUu;

  return {
    sampleCount: samples.length,
    cameraScaleFactor: Number(fittedScaleFactor.toFixed(4)),
    distanceScaleExponent: Number(fittedExponent.toFixed(3)),
    nearScaleMultiplier: 1.0,
    farScaleMultiplier: 1.0,
    verticalOffsetUu: fittedWorldOffsetUu,
    screenVerticalOffsetPx: fittedScreenOffsetPx,
  };
}

export function buildNameTagCalibrationExportPayload(
  config: NameTagConfig,
  snapshot: NameTagTelemetrySnapshot,
  kickoffPermutationIndex: number
) {
  const fittedRecommendation = computeFittedParametersFromSamples(config, snapshot);
  const isSingleChar = config.cardDisplayMode === 'single-char';
  const activeOverrides = isSingleChar ? config.singleCharCarOverrides : config.carOverrides;
  const {
    previewNames: _pn,
    previewBoostAmounts: _pb,
    previewAerialClimbingFlags: _pa,
    carOverrides: _co,
    singleCharCarOverrides: _sco,
    enabled: _en,
    ...globalConfig
  } = config;
  return {
    schema: 'rc_name_tag_calibration_v1',
    exportedAt: new Date().toISOString(),
    viewport: {
      widthPx: snapshot.viewportWidthPx,
      heightPx: snapshot.viewportHeightPx,
      aspectRatio: Number(snapshot.aspectRatio.toFixed(4)),
      devicePixelRatio: snapshot.devicePixelRatio,
    },
    camera: {
      mode: snapshot.cameraMode,
      focusedCarIndex: snapshot.focusedCarIndex,
      kickoffPermutationIndex,
      fovDeg: snapshot.cameraFovDeg,
      position: snapshot.cameraPosition,
      forward: snapshot.cameraForward,
      up: snapshot.cameraUp,
    },
    globalConfig,
    fittedRecommendation,
    cars: snapshot.cars.map((car) => ({
      carIndex: car.carIndex,
      slotCode: car.slotCode,
      name: car.name,
      team: car.team,
      visible: car.visible,
      boostAmount: car.boostAmount,
      boostBorderVisible: car.boostBorderVisible,
      isOffscreen: car.isOffscreen ?? false,
      isDoubleJumpedAndClimbing: car.isDoubleJumpedAndClimbing ?? false,
      aerialClimbTriggerReason: car.aerialClimbTriggerReason ?? 'none',
      override: activeOverrides[car.carIndex] || null,
      telemetry: {
        carWorldPos: car.carWorldPos,
        anchorWorldPos: car.anchorWorldPos,
        spriteWorldPos: car.spriteWorldPos,
        euclideanDistanceUu: car.euclideanDistanceUu,
        viewZDepthUu: car.viewZDepthUu,
        activeDepthUu: car.activeDepthUu,
        offAxisAngleDeg: car.offAxisAngleDeg,
        worldScaleWidthUu: car.worldScaleWidthUu,
        worldScaleHeightUu: car.worldScaleHeightUu,
        screenPillWidthPx: car.screenPillWidthPx,
        screenPillHeightPx: car.screenPillHeightPx,
        effectiveScaleMultiplier: car.effectiveScaleMultiplier,
        effectiveWorldOffsetUu: car.effectiveWorldOffsetUu,
        effectiveScreenOffsetPx: car.effectiveScreenOffsetPx,
        totalWorldVerticalOffsetUu: car.totalWorldVerticalOffsetUu,
        carAltitudeUu: car.carAltitudeUu ?? 0,
        carVelZUu: car.carVelZUu ?? 0,
        carPitchFwdZ: car.carPitchFwdZ ?? 0,
        carJumpHoldMs: car.carJumpHoldMs ?? 0,
      },
    })),
  };
}
