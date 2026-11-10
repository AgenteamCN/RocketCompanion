import type {
  NameTagAerialClimbTriggerMode,
  NameTagAerialClimbTriggerReason,
  NameTagAnonymizeMode,
  NameTagBoostBorderAudience,
  NameTagBoostBorderColorMode,
  NameTagBoostBorderOverride,
  NameTagBoostBorderSceneFlags,
  NameTagBoostIndicatorMode,
  NameTagCameraMode,
  NameTagCarEntry,
  NameTagCarOverride,
  NameTagCarTelemetry,
  NameTagCardDisplayMode,
  NameTagCardVariantParams,
  NameTagCircleColorMode,
  NameTagConfig,
  NameTagDepthMetric,
  NameTagFittedParameters,
  NameTagFontFamily,
  NameTagFontWeight,
  NameTagOffscreenAudience,
  NameTagRuntimeState,
  NameTagRuntimeSyncSnapshot,
  NameTagTelemetrySnapshot,
} from './nameTagTypes';

export type {
  NameTagAerialClimbTriggerMode,
  NameTagAerialClimbTriggerReason,
  NameTagAnonymizeMode,
  NameTagBoostBorderAudience,
  NameTagBoostBorderColorMode,
  NameTagBoostBorderOverride,
  NameTagBoostBorderSceneFlags,
  NameTagBoostIndicatorMode,
  NameTagCameraMode,
  NameTagCarEntry,
  NameTagCarOverride,
  NameTagCarTelemetry,
  NameTagCardDisplayMode,
  NameTagCardVariantParams,
  NameTagCircleColorMode,
  NameTagConfig,
  NameTagDepthMetric,
  NameTagFittedParameters,
  NameTagFontFamily,
  NameTagFontWeight,
  NameTagOffscreenAudience,
  NameTagRuntimeState,
  NameTagRuntimeSyncSnapshot,
  NameTagTelemetrySnapshot,
};

export const NAME_TAG_STORAGE_KEY = 'rc_name_tag_config_v11';
export const NAME_TAG_REFERENCE_DEPTH_UU = 3500;
export const NAME_TAG_NEAR_CALIBRATION_DEPTH_UU = 500;
export const NAME_TAG_FAR_CALIBRATION_DEPTH_UU = 9000;
export const KICKOFF_PERMUTATION_COUNT = 5;
export const DEFAULT_NAME_TAG_SLOT_CODES: string[] = ['X', 'W', 'E', 'A', 'M', 'Z'];
export const DEFAULT_NAME_TAG_DISTINCT_COLORS: string[] = ['#0284c7', '#0d9488', '#4f46e5', '#ea580c', '#e11d48', '#d97706'];

export function createDefaultCarOverride(worldOffsetUu = 50, screenOffsetPx = 6): NameTagCarOverride {
  return { enabled: false, scaleMultiplier: 1.0, worldOffsetUu, screenOffsetPx };
}

export const DEFAULT_NAME_TAG_CONFIG: NameTagConfig = {
  enabled: true,
  anonymizePlayerNames: 'disabled',
  cardDisplayMode: 'pill',
  circleColorMode: 'team',
  slotCodes: [...DEFAULT_NAME_TAG_SLOT_CODES],
  distinctCarColors: [...DEFAULT_NAME_TAG_DISTINCT_COLORS],
  pillMinWidth: 80,
  pillMaxWidth: 380,
  pillHeight: 54,
  cornerRadius: 27,
  borderWidth: 4,
  fontSize: 48,
  fontFamily: 'jetbrains-mono',
  fontWeight: 600,
  opacity: 0.7,
  bgOpacity: 0.7,
  verticalOffsetUu: 50,
  screenVerticalOffsetPx: 6,
  cameraScaleFactor: 0.04,
  distanceScaleExponent: 0.86,
  nearScaleMultiplier: 1.0,
  farScaleMultiplier: 1.0,
  depthMetric: 'viewZ',
  singleCharMinWidth: 80,
  singleCharMaxWidth: 380,
  singleCharHeight: 54,
  singleCharCornerRadius: 27,
  singleCharBorderWidth: 4,
  singleCharFontSize: 48,
  singleCharFontFamily: 'jetbrains-mono',
  singleCharFontWeight: 600,
  singleCharOpacity: 0.7,
  singleCharBgOpacity: 0.7,
  singleCharVerticalOffsetUu: 50,
  singleCharScreenVerticalOffsetPx: 6,
  singleCharCameraScaleFactor: 0.04,
  singleCharDistanceScaleExponent: 0.86,
  singleCharNearScaleMultiplier: 1.0,
  singleCharFarScaleMultiplier: 1.0,
  singleCharDepthMetric: 'viewZ',
  cardRenderScale: 100,
  maxChars: 12,
  blueBgColor: '#075985',
  blueBorderColor: '#38bdf8',
  blueTextColor: '#ffffff',
  orangeBgColor: '#9a3412',
  orangeBorderColor: '#fb923c',
  orangeTextColor: '#ffffff',
  boostBorderEnabled: true,
  boostIndicatorMode: 'bottom-up-fill',
  boostFillOpacity: 0.4,
  boostFillColorBlendRatio: 0,
  boostUnfilledBgOpacity: 0.1,
  boostUnfilledDarkenRatio: 0.45,
  boostShowHorizonLine: true,
  boostBorderColorMode: 'shared',
  blueBoostBorderColor: '#ffffff',
  orangeBoostBorderColor: '#ffffff',
  sharedBoostBorderColor: '#ffffff',
  showBoostBorderInMatchPlaying: true,
  boostBorderMatchAudience: 'teammates',
  showBoostBorderInGoalReplay: true,
  boostBorderReplayAudience: 'all',
  ballOcclusionEnabled: true,
  ballOcclusionOpacity: 1.0,
  offscreenIndicatorEnabled: true,
  offscreenAudience: 'teammates',
  offscreenShowBoostCircle: true,
  offscreenShowArrow: true,
  offscreenShowSlotCode: false,
  offscreenCircleRadiusPx: 24,
  offscreenBorderWidthPx: 4,
  offscreenArrowLengthPx: 12,
  offscreenArrowBaseWidthPx: 12,
  offscreenArrowGapPx: 10,
  offscreenDistanceScaleEnabled: true,
  offscreenDistanceMinScale: 0.5,
  offscreenDistanceNearUu: 650,
  offscreenDistanceFarUu: 6000,
  offscreenDistanceCurveExponent: 0.45,
  offscreenDistanceSimEnabled: false,
  offscreenDistanceSimDistanceUu: 2700,
  offscreenDistanceSimAngleDeg: 270,
  offscreenRoiAvoidHud: true,
  offscreenRoiTopInsetPx: 72,
  offscreenRoiBottomInsetPx: 132,
  offscreenRoiSideInsetPx: 60,
  aerialClimbAlertEnabled: true,
  aerialClimbAlertAudience: 'teammates',
  aerialClimbTriggerMode: 'hold-jump-pitch',
  aerialClimbMinAltitudeUu: 110,
  aerialClimbMinVelZUu: 400,
  aerialClimbHoldJumpMinMs: 70,
  aerialClimbMinPitchFwdZ: 0.2,
  aerialClimbGlowColor: '#facc15',
  aerialClimbGlowRadiusPx: 100,
  aerialClimbGlowOpacity: 0.9,
  aerialClimbSimulatePovInTuner: false,
  previewAerialClimbingFlags: [false, true, false, false, true, false],
  previewBoostAmounts: [100, 66, 33, 85, 50, 18],
  showOnLocalCar: false,
  previewNames: ['AlphaStriker', 'Captain Ping', 'Necto', 'K', 'Necto(2)', 'LinLaoGay'],
  carOverrides: Array.from({ length: 6 }, () => createDefaultCarOverride(50, 6)),
  singleCharCarOverrides: Array.from({ length: 6 }, () => createDefaultCarOverride(50, 6)),
};

export const VARIANT_KEY_MAP: Array<[keyof NameTagCardVariantParams, keyof NameTagConfig]> = [
  ['pillMinWidth', 'singleCharMinWidth'],
  ['pillMaxWidth', 'singleCharMaxWidth'],
  ['pillHeight', 'singleCharHeight'],
  ['cornerRadius', 'singleCharCornerRadius'],
  ['borderWidth', 'singleCharBorderWidth'],
  ['fontSize', 'singleCharFontSize'],
  ['fontFamily', 'singleCharFontFamily'],
  ['fontWeight', 'singleCharFontWeight'],
  ['cardRenderScale', 'cardRenderScale'],
  ['maxChars', 'maxChars'],
  ['opacity', 'singleCharOpacity'],
  ['bgOpacity', 'singleCharBgOpacity'],
  ['verticalOffsetUu', 'singleCharVerticalOffsetUu'],
  ['screenVerticalOffsetPx', 'singleCharScreenVerticalOffsetPx'],
  ['cameraScaleFactor', 'singleCharCameraScaleFactor'],
  ['distanceScaleExponent', 'singleCharDistanceScaleExponent'],
  ['nearScaleMultiplier', 'singleCharNearScaleMultiplier'],
  ['farScaleMultiplier', 'singleCharFarScaleMultiplier'],
  ['depthMetric', 'singleCharDepthMetric'],
  ['carOverrides', 'singleCharCarOverrides'],
];

export function resolveNameTagFontFamilyCss(fontFamily: NameTagFontFamily): string {
  if (fontFamily === 'sf-mono') return '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Monaco, Consolas, monospace';
  if (fontFamily === 'archivo') return '"Archivo", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
  return '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace';
}

export function shouldUseSingleCharIndicator(
  config: Pick<NameTagConfig, 'cardDisplayMode' | 'anonymizePlayerNames'>,
  carTeam: 0 | 1,
  povCarTeam: 0 | 1 | null
): boolean {
  if (config.cardDisplayMode === 'single-char') return true;
  const mode = config.anonymizePlayerNames || 'disabled';
  if (mode === 'both') return true;
  if (mode === 'opponents') return carTeam !== (povCarTeam ?? 0);
  if (mode === 'teammates') return carTeam === (povCarTeam ?? 0);
  return false;
}

export function resolveNameTagVariantParams(config: NameTagConfig, isSingleChar: boolean): NameTagCardVariantParams {
  const out = {} as Record<string, unknown>;
  for (const [vKey, scKey] of VARIANT_KEY_MAP) out[vKey] = config[isSingleChar ? scKey : vKey];
  return out as unknown as NameTagCardVariantParams;
}

export function mapVariantPatchToConfigPatch(isSingleChar: boolean, patch: Partial<NameTagCardVariantParams>): Partial<NameTagConfig> {
  if (!isSingleChar) return patch;
  const out = {} as Record<string, unknown>;
  for (const [vKey, scKey] of VARIANT_KEY_MAP) if (patch[vKey] !== undefined) out[scKey] = patch[vKey];
  return out as Partial<NameTagConfig>;
}

export function resolveCarSlotCode(carIndex: number, team: 0 | 1, slotCodes: string[] = DEFAULT_NAME_TAG_SLOT_CODES): string {
  const safe = Array.isArray(slotCodes) && slotCodes.length >= 6 ? slotCodes : DEFAULT_NAME_TAG_SLOT_CODES;
  const n = Math.max(0, Math.floor(Number(carIndex) || 0));
  const idx = n < 6 ? n : (team === 1 ? 3 : 0) + (n % 3);
  return String(safe[idx] || DEFAULT_NAME_TAG_SLOT_CODES[idx] || 'X').trim().slice(0, 3);
}

const finiteOr = (val: unknown, fb: number): number => (Number.isFinite(Number(val)) ? Number(val) : fb);

export function computeOffscreenDistanceScale(
  distanceUu: number,
  config: Pick<NameTagConfig, 'offscreenDistanceScaleEnabled' | 'offscreenDistanceMinScale' | 'offscreenDistanceNearUu' | 'offscreenDistanceFarUu' | 'offscreenDistanceCurveExponent'>
): number {
  if (!config.offscreenDistanceScaleEnabled) return 1.0;
  const D = DEFAULT_NAME_TAG_CONFIG;
  const minScale = finiteOr(config.offscreenDistanceMinScale, D.offscreenDistanceMinScale);
  const nearUu = finiteOr(config.offscreenDistanceNearUu, D.offscreenDistanceNearUu);
  const effFar = Math.max(nearUu + 1, finiteOr(config.offscreenDistanceFarUu, D.offscreenDistanceFarUu));
  const exp = Math.max(0.01, finiteOr(config.offscreenDistanceCurveExponent, D.offscreenDistanceCurveExponent));
  const clamped = Math.max(nearUu, Math.min(effFar, Number(distanceUu) || nearUu));
  return 1.0 - (1.0 - minScale) * Math.pow((clamped - nearUu) / Math.max(1, effFar - nearUu), exp);
}

export function formatNameTagDisplayText(rawName: string, maxChars = DEFAULT_NAME_TAG_CONFIG.maxChars): string {
  const trimmed = String(rawName || 'Player').trim() || 'Player';
  const limit = Math.max(1, Math.round(Number(maxChars) || DEFAULT_NAME_TAG_CONFIG.maxChars));
  const glyphs = Array.from(trimmed);
  return glyphs.length <= limit ? trimmed : `…${glyphs.slice(-Math.max(1, limit - 1)).join('')}`;
}

export function estimateNameTagTextWidthPx(displayText: string, fontSize: number, fontFamily: NameTagFontFamily): number {
  const unitFactor = fontFamily === 'archivo' ? 0.56 : 0.6;
  let units = 0;
  for (const ch of Array.from(displayText || '')) units += (ch.codePointAt(0) || 0) > 0x2e7f ? 1.0 : unitFactor;
  return units * fontSize;
}

export function computeAdaptiveNameTagWidthPx(
  displayText: string,
  config: Pick<NameTagCardVariantParams, 'pillMinWidth' | 'pillMaxWidth' | 'fontSize' | 'fontFamily' | 'borderWidth'> & Partial<Pick<NameTagCardVariantParams, 'maxChars'>>,
  measuredTextWidthPx?: number,
  measuredMaxRefTextWidthPx?: number
): number {
  const D = DEFAULT_NAME_TAG_CONFIG;
  const minW = Math.max(1, finiteOr(config.pillMinWidth, D.pillMinWidth));
  const maxW = Math.max(minW, finiteOr(config.pillMaxWidth, D.pillMaxWidth));
  const fontSize = Math.max(1, finiteOr(config.fontSize, D.fontSize));
  const borderW = Math.max(0, finiteOr(config.borderWidth, D.borderWidth));
  const maxChars = Math.max(1, Math.round(Number(config.maxChars) || D.maxChars));
  const fontFamily = config.fontFamily || D.fontFamily;
  const textW = typeof measuredTextWidthPx === 'number' && Number.isFinite(measuredTextWidthPx) ? measuredTextWidthPx : estimateNameTagTextWidthPx(displayText, fontSize, fontFamily);
  const maxRefW = typeof measuredMaxRefTextWidthPx === 'number' && Number.isFinite(measuredMaxRefTextWidthPx) ? measuredMaxRefTextWidthPx : estimateNameTagTextWidthPx('M'.repeat(maxChars), fontSize, fontFamily);
  const glyphCount = Math.max(1, Array.from(displayText || 'P').length);
  const ratio = Math.max(0, Math.min(1, (glyphCount - 1) / Math.max(1, maxChars - 1)));
  const maxPad = Math.max(16, maxW - maxRefW);
  const minPad = Math.min(maxPad, Math.max(12, fontSize * 0.35 + borderW * 2));
  return Math.max(minW, Math.min(maxW, Math.round(textW + minPad + (maxPad - minPad) * ratio)));
}

export function resolveNameTagCornerRadiusPx(pillWidthPx: number, pillHeightPx: number, cornerRadius: number): number {
  const raw = Math.max(0, finiteOr(cornerRadius, DEFAULT_NAME_TAG_CONFIG.cornerRadius));
  return Math.max(0, Math.min(raw, pillWidthPx * 0.5, pillHeightPx * 0.5));
}

export function resolveNameTagBoostBorderVisible(config: NameTagConfig, boostBorderOverride: NameTagBoostBorderOverride, carTeam: 0 | 1, povCarTeam: 0 | 1 | null): boolean {
  if (!config.boostBorderEnabled) return false;
  if (boostBorderOverride === false || boostBorderOverride === 'none') return false;
  if (boostBorderOverride === true || boostBorderOverride === 'all') return true;
  if (boostBorderOverride === 'teammates') return carTeam === (povCarTeam ?? 0);
  return Boolean(config.showBoostBorderInMatchPlaying && config.boostBorderMatchAudience !== 'none');
}

export const DEFAULT_RUNTIME_SYNC_SNAPSHOT: NameTagRuntimeSyncSnapshot = {
  isTunerArenaActive: false,
  kickoffPermutationIndex: 0,
  activeCameraMode: 'pov',
  focusedCarIndex: 0,
  selectedCalibrationCarIndex: 0,
  boostBorderOverride: null,
};
