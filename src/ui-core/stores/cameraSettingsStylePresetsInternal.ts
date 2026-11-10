export type CameraSettingsPresetId =
  | "spine-aligned-default"
  | "spine-hug-readout"
  | "spine-centered-checkbox-cluster"
  | "spine-detached-checkbox-card"
  | "classic-settings-rows";

export type CameraReadoutContainerMode = "uniform-longest" | "hug-content" | "plain-text";
export type CameraReadoutTextAlign = "left" | "center" | "right";
export type CameraLabelTextAlign = "right" | "left";
export type CameraBooleanControlType = "checkbox" | "toggle-switch";
export type CameraCheckboxPlacement =
  | "spine-left"
  | "spine-center"
  | "centered-cluster"
  | "detached-card";
export type CameraCheckboxColorVariant = "neutral" | "amber" | "orange" | "sky" | "emerald" | "rose";
export type CameraCheckboxIconStyle = "check" | "bold-check" | "dot" | "minus";
export type CameraCheckboxAnimStyle = "spring-scale" | "crisp-fade" | "bounce";
export type CameraSliderColorScheme = "neutral" | "amber" | "orange" | "sky" | "emerald" | "rose";

export type CameraResetButtonMode = "big-button" | "compact-row";
export type CameraResetButtonStyle =
  | "danger-subtle"
  | "danger-solid"
  | "danger-outline"
  | "neutral-hover-danger";
export type CameraResetButtonWidthMode = "spine-width" | "full-width" | "centered-auto";
export type CameraResetConfirmMode = "dialogue" | "inline-two-step";

export interface CameraSettingsStyleConfig {
  preset: CameraSettingsPresetId;
  centerFormBlock: boolean;
  formOffsetXPx: number;
  rowGapPx: number;
  rowPaddingYPx: number;
  rowPaddingXPx: number;
  rowBorderRadiusPx: number;
  showRowHoverBg: boolean;
  showSpineGuideLine: boolean;
  showRowIcon: boolean;
  labelTextAlign: CameraLabelTextAlign;
  labelColumnWidthPx: number;
  labelToControlGapPx: number;
  labelFontSizePx: number;
  labelFontWeight: number;
  sliderTrackWidthPx: number;
  sliderTrackHeightPx: number;
  sliderThumbSizePx: number;
  sliderColorScheme: CameraSliderColorScheme;
  sliderShowStepper: boolean;
  controlToReadoutGapPx: number;
  readoutContainerMode: CameraReadoutContainerMode;
  readoutTextAlign: CameraReadoutTextAlign;
  readoutMinWidthPx: number;
  readoutFontSizePx: number;
  readoutPaddingXPx: number;
  readoutPaddingYPx: number;
  readoutBorderRadiusPx: number;
  booleanControlType: CameraBooleanControlType;
  checkboxPlacement: CameraCheckboxPlacement;
  checkboxSectionTopGapPx: number;
  checkboxSizePx: number;
  checkboxRadiusPx: number;
  checkboxVariant: CameraCheckboxColorVariant;
  checkboxStrokeWidth: number;
  checkboxIconStyle: CameraCheckboxIconStyle;
  checkboxAnimationStyle: CameraCheckboxAnimStyle;
  checkboxHighContrastUnchecked: boolean;
  checkboxShowStatusText: boolean;
  resetButtonMode: CameraResetButtonMode;
  resetButtonStyle: CameraResetButtonStyle;
  resetButtonWidthMode: CameraResetButtonWidthMode;
  resetButtonLabel: string;
  resetButtonShowIcon: boolean;
  resetButtonHeightPx: number;
  resetButtonFontSizePx: number;
  resetButtonRadiusPx: number;
  resetButtonIconSizePx: number;
  resetButtonTopMarginPx: number;
  resetConfirmMode: CameraResetConfirmMode;
  resetDialogueTitle: string;
}

export interface CameraSettingsPresetEntry {
  id: CameraSettingsPresetId;
  label: string;
  shortLabel: string;
  description: string;
  patch: Partial<CameraSettingsStyleConfig>;
}

export function createDefaultCameraSettingsStyleConfig(): CameraSettingsStyleConfig {
  return {
    preset: "spine-aligned-default",
    centerFormBlock: true,
    formOffsetXPx: 0,
    rowGapPx: 2,
    rowPaddingYPx: 6,
    rowPaddingXPx: 10,
    rowBorderRadiusPx: 8,
    showRowHoverBg: true,
    showSpineGuideLine: false,
    showRowIcon: false,
    labelTextAlign: "right",
    labelColumnWidthPx: 152,
    labelToControlGapPx: 14,
    labelFontSizePx: 13,
    labelFontWeight: 600,
    sliderTrackWidthPx: 184,
    sliderTrackHeightPx: 6,
    sliderThumbSizePx: 14,
    sliderColorScheme: "neutral",
    sliderShowStepper: false,
    controlToReadoutGapPx: 12,
    readoutContainerMode: "uniform-longest",
    readoutTextAlign: "left",
    readoutMinWidthPx: 64,
    readoutFontSizePx: 12,
    readoutPaddingXPx: 8,
    readoutPaddingYPx: 2,
    readoutBorderRadiusPx: 6,
    booleanControlType: "checkbox",
    checkboxPlacement: "spine-left",
    checkboxSectionTopGapPx: 4,
    checkboxSizePx: 18,
    checkboxRadiusPx: 5,
    checkboxVariant: "amber",
    checkboxStrokeWidth: 2.75,
    checkboxIconStyle: "check",
    checkboxAnimationStyle: "spring-scale",
    checkboxHighContrastUnchecked: false,
    checkboxShowStatusText: false,
    resetButtonMode: "big-button",
    resetButtonStyle: "danger-subtle",
    resetButtonWidthMode: "spine-width",
    resetButtonLabel: "Reset Camera Defaults",
    resetButtonShowIcon: true,
    resetButtonHeightPx: 38,
    resetButtonFontSizePx: 13,
    resetButtonRadiusPx: 10,
    resetButtonIconSizePx: 15,
    resetButtonTopMarginPx: 10,
    resetConfirmMode: "dialogue",
    resetDialogueTitle: "RESET CAMERA DEFAULTS",
  };
}

export function createCameraSettingsStylePresets(
  baseConfig: CameraSettingsStyleConfig
): Record<CameraSettingsPresetId, CameraSettingsPresetEntry> {
  return {
    "spine-aligned-default": {
      id: "spine-aligned-default",
      label:
        "Option A (Default): Center-Axis Sliders + Right-Aligned Labels + Uniform Left-Aligned Readout + Center Checkboxes + Red Reset Button",
      shortLabel: "Center-Axis + Uniform Readout (Default)",
      description:
        "Removes leading icons and right-aligns labels against a uniform center-axis slider column; " +
        "right readout boxes share uniform width with left-aligned digits; Invert Swivel and Camera Shake use center-aligned checkboxes; Reset uses a confirmation dialogue.",
      patch: {
        ...baseConfig,
        preset: "spine-aligned-default",
      },
    },
    "spine-hug-readout": {
      id: "spine-hug-readout",
      label: "Option B: Center-Axis Sliders + Auto-Width Readout Boxes + Center Checkboxes",
      shortLabel: "Center-Axis + Auto-Width Readout",
      description:
        "Readout boxes sit flush against the right of each slider and size naturally to their character length while keeping digits left-aligned.",
      patch: {
        ...baseConfig,
        preset: "spine-hug-readout",
        readoutContainerMode: "hug-content",
      },
    },
    "spine-centered-checkbox-cluster": {
      id: "spine-centered-checkbox-cluster",
      label: "Option C: Center-Axis Sliders + Centered Dual-Column Checkbox Row",
      shortLabel: "Centered Dual-Column Checkboxes",
      description:
        "Keeps the 7 sliders on a strict center axis while extracting Invert Swivel and Camera Shake into a centered side-by-side checkbox row.",
      patch: {
        ...baseConfig,
        preset: "spine-centered-checkbox-cluster",
        checkboxPlacement: "centered-cluster",
        checkboxSectionTopGapPx: 8,
      },
    },
    "spine-detached-checkbox-card": {
      id: "spine-detached-checkbox-card",
      label: "Option D: Center-Axis Sliders + Grouped Checkbox Card + Full-Width Reset Button",
      shortLabel: "Grouped Checkbox Card + Full-Width Reset",
      description:
        "Places the two checkboxes inside a bordered group card and uses a full-width danger button for Reset Camera Defaults.",
      patch: {
        ...baseConfig,
        preset: "spine-detached-checkbox-card",
        checkboxPlacement: "detached-card",
        checkboxSectionTopGapPx: 8,
        resetButtonWidthMode: "full-width",
      },
    },
    "classic-settings-rows": {
      id: "classic-settings-rows",
      label: "Option E (Legacy Baseline): Left-Aligned Icon Rows + Right ToggleSwitch",
      shortLabel: "Legacy Left-Aligned Icon Rows",
      description:
        "Retains the classic left-aligned icon + title and right slider/toggle layout for A/B comparison against the center-axis layout.",
      patch: {
        ...baseConfig,
        preset: "classic-settings-rows",
        showRowIcon: true,
        labelTextAlign: "left",
        labelColumnWidthPx: 185,
        readoutContainerMode: "uniform-longest",
        readoutTextAlign: "right",
        booleanControlType: "toggle-switch",
        checkboxPlacement: "spine-left",
        resetButtonMode: "compact-row",
      },
    },
  };
}

export function extractCameraSettingsSnapshot(
  s: CameraSettingsStyleConfig,
  baseConfig: CameraSettingsStyleConfig
): CameraSettingsStyleConfig {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(baseConfig) as (keyof CameraSettingsStyleConfig)[]) {
    out[k] = s[k];
  }
  return out as unknown as CameraSettingsStyleConfig;
}
