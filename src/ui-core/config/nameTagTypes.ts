export type NameTagDepthMetric = 'viewZ' | 'euclidean';
export type NameTagFontFamily = 'jetbrains-mono' | 'sf-mono' | 'archivo';
export type NameTagFontWeight = 400 | 500 | 600 | 700;
export type NameTagBoostBorderColorMode = 'team' | 'shared';
export type NameTagBoostBorderAudience = 'teammates' | 'all' | 'none';
export type NameTagOffscreenAudience = NameTagBoostBorderAudience;
export type NameTagBoostIndicatorMode = 'bottom-up-fill' | 'left-right-fill' | 'sunset-circle' | 'border-only';
export type NameTagCardDisplayMode = 'pill' | 'single-char';
export type NameTagAnonymizeMode = 'disabled' | 'opponents' | 'teammates' | 'both';
export type NameTagCircleColorMode = 'team' | 'car-primary';
export type NameTagAerialClimbTriggerMode = 'double-jump' | 'hold-jump-pitch' | 'either' | 'both';
export type NameTagAerialClimbTriggerReason = 'none' | 'double-jump' | 'hold-jump-pitch' | 'preview' | 'manual-override';
export type NameTagCameraMode = 'pov' | 'wasmPov' | 'rearView' | 'free' | 'director' | 'podium';

export interface NameTagBoostBorderSceneFlags {
  matchPlaying?: boolean | NameTagBoostBorderAudience;
  goalReplay?: boolean | NameTagBoostBorderAudience;
  cinematicCamera?: boolean | NameTagBoostBorderAudience;
}
export type NameTagBoostBorderOverride = boolean | NameTagBoostBorderAudience | NameTagBoostBorderSceneFlags | null;

export interface NameTagCarOverride {
  enabled: boolean;
  scaleMultiplier: number;
  worldOffsetUu: number;
  screenOffsetPx: number;
}

export interface NameTagCardGeometrySpec {
  pillMinWidth: number;
  pillMaxWidth: number;
  pillHeight: number;
  cornerRadius: number;
  borderWidth: number;
  fontSize: number;
  fontFamily: NameTagFontFamily;
  fontWeight: NameTagFontWeight;
  cardRenderScale: number;
  maxChars: number;
}

export interface NameTagCardDistanceSpec {
  opacity: number;
  bgOpacity: number;
  verticalOffsetUu: number;
  screenVerticalOffsetPx: number;
  cameraScaleFactor: number;
  distanceScaleExponent: number;
  nearScaleMultiplier: number;
  farScaleMultiplier: number;
  depthMetric: NameTagDepthMetric;
  carOverrides: NameTagCarOverride[];
}

export type NameTagCardVariantParams = NameTagCardGeometrySpec & NameTagCardDistanceSpec;

export interface NameTagConfig extends NameTagCardGeometrySpec, NameTagCardDistanceSpec {
  enabled: boolean;
  anonymizePlayerNames: NameTagAnonymizeMode;
  cardDisplayMode: NameTagCardDisplayMode;
  circleColorMode: NameTagCircleColorMode;
  slotCodes: string[];
  distinctCarColors: string[];
  singleCharMinWidth: number;
  singleCharMaxWidth: number;
  singleCharHeight: number;
  singleCharCornerRadius: number;
  singleCharBorderWidth: number;
  singleCharFontSize: number;
  singleCharFontFamily: NameTagFontFamily;
  singleCharFontWeight: NameTagFontWeight;
  singleCharOpacity: number;
  singleCharBgOpacity: number;
  singleCharVerticalOffsetUu: number;
  singleCharScreenVerticalOffsetPx: number;
  singleCharCameraScaleFactor: number;
  singleCharDistanceScaleExponent: number;
  singleCharNearScaleMultiplier: number;
  singleCharFarScaleMultiplier: number;
  singleCharDepthMetric: NameTagDepthMetric;
  singleCharCarOverrides: NameTagCarOverride[];
  blueBgColor: string;
  blueBorderColor: string;
  blueTextColor: string;
  orangeBgColor: string;
  orangeBorderColor: string;
  orangeTextColor: string;
  boostBorderEnabled: boolean;
  boostIndicatorMode: NameTagBoostIndicatorMode;
  boostFillOpacity: number;
  boostFillColorBlendRatio: number;
  boostUnfilledBgOpacity: number;
  boostUnfilledDarkenRatio: number;
  boostShowHorizonLine: boolean;
  boostBorderColorMode: NameTagBoostBorderColorMode;
  blueBoostBorderColor: string;
  orangeBoostBorderColor: string;
  sharedBoostBorderColor: string;
  showBoostBorderInMatchPlaying: boolean;
  boostBorderMatchAudience: NameTagBoostBorderAudience;
  showBoostBorderInGoalReplay: boolean;
  boostBorderReplayAudience: NameTagBoostBorderAudience;
  ballOcclusionEnabled: boolean;
  ballOcclusionOpacity: number;
  offscreenIndicatorEnabled: boolean;
  offscreenAudience: NameTagBoostBorderAudience;
  offscreenShowBoostCircle: boolean;
  offscreenShowArrow: boolean;
  offscreenShowSlotCode: boolean;
  offscreenCircleRadiusPx: number;
  offscreenBorderWidthPx: number;
  offscreenArrowLengthPx: number;
  offscreenArrowBaseWidthPx: number;
  offscreenArrowGapPx: number;
  offscreenDistanceScaleEnabled: boolean;
  offscreenDistanceMinScale: number;
  offscreenDistanceNearUu: number;
  offscreenDistanceFarUu: number;
  offscreenDistanceCurveExponent: number;
  offscreenDistanceSimEnabled: boolean;
  offscreenDistanceSimDistanceUu: number;
  offscreenDistanceSimAngleDeg: number;
  offscreenRoiAvoidHud: boolean;
  offscreenRoiTopInsetPx: number;
  offscreenRoiBottomInsetPx: number;
  offscreenRoiSideInsetPx: number;
  aerialClimbAlertEnabled: boolean;
  aerialClimbAlertAudience: NameTagBoostBorderAudience;
  aerialClimbTriggerMode: NameTagAerialClimbTriggerMode;
  aerialClimbMinAltitudeUu: number;
  aerialClimbMinVelZUu: number;
  aerialClimbHoldJumpMinMs: number;
  aerialClimbMinPitchFwdZ: number;
  aerialClimbGlowColor: string;
  aerialClimbGlowRadiusPx: number;
  aerialClimbGlowOpacity: number;
  aerialClimbSimulatePovInTuner: boolean;
  previewAerialClimbingFlags: boolean[];
  previewBoostAmounts: number[];
  showOnLocalCar: boolean;
  previewNames: string[];
}

export interface NameTagCarEntry {
  carIndex: number;
  name: string;
  team: 0 | 1 | number;
  boostAmount?: number;
  showBoostBorder?: boolean | null;
  isDoubleJumpedAndClimbing?: boolean;
  aerialClimbTriggerReason?: NameTagAerialClimbTriggerReason;
}

export interface NameTagCarTelemetry {
  carIndex: number;
  slotCode: string;
  name: string;
  team: 0 | 1;
  visible: boolean;
  boostAmount?: number;
  boostBorderVisible?: boolean;
  isOffscreen?: boolean;
  isDoubleJumpedAndClimbing?: boolean;
  aerialClimbTriggerReason?: string;
  carAltitudeUu?: number;
  carVelZUu?: number;
  carPitchFwdZ?: number;
  carJumpHoldMs?: number;
  carWorldPos: [number, number, number];
  anchorWorldPos: [number, number, number];
  spriteWorldPos: [number, number, number];
  euclideanDistanceUu: number;
  viewZDepthUu: number;
  activeDepthUu: number;
  offAxisAngleDeg: number;
  worldScaleWidthUu: number;
  worldScaleHeightUu: number;
  screenPillWidthPx: number;
  screenPillHeightPx: number;
  effectiveScaleMultiplier: number;
  effectiveWorldOffsetUu: number;
  effectiveScreenOffsetPx: number;
  totalWorldVerticalOffsetUu: number;
}

export interface NameTagTelemetrySnapshot {
  updatedAtMs: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  aspectRatio: number;
  devicePixelRatio: number;
  cameraMode: string;
  focusedCarIndex: number;
  cameraFovDeg: number;
  cameraPosition: [number, number, number];
  cameraForward: [number, number, number];
  cameraUp: [number, number, number];
  cars: NameTagCarTelemetry[];
}

export interface NameTagRuntimeSyncSnapshot {
  isTunerArenaActive: boolean;
  kickoffPermutationIndex: number;
  activeCameraMode: NameTagCameraMode;
  focusedCarIndex: number;
  selectedCalibrationCarIndex: number;
  boostBorderOverride: NameTagBoostBorderOverride;
}

export interface NameTagRuntimeState extends NameTagRuntimeSyncSnapshot {
  isMultiplayerOrMultiCarMode: boolean;
  carEntries: NameTagCarEntry[];
  onEnterTunerArena: (() => void) | null;
  onExitTunerArena: (() => void) | null;
  onReshuffleKickoffPositions: (() => void) | null;
  onSelectPovCar: ((carIndex: number) => void) | null;
  onFocusFreeCamOverview: (() => void) | null;
}

export interface NameTagFittedParameters {
  sampleCount: number;
  cameraScaleFactor: number;
  distanceScaleExponent: number;
  nearScaleMultiplier: number;
  farScaleMultiplier: number;
  verticalOffsetUu: number;
  screenVerticalOffsetPx: number;
}
