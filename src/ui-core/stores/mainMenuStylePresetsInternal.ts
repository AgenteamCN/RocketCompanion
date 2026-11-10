import type {
  JetBrainsMonoFontWeight,
  PlayCardIconColorToken,
  PlayCardIconColorValue,
} from "../tokens/colors";

export type MainMenuIconColorToken = PlayCardIconColorToken;
export type MainMenuIconColorValue = PlayCardIconColorValue;

export type MainMenuStyleVariant =
  | "large-clean-row"
  | "mono-watermark-row"
  | "classic-descriptive-row";

export type MainMenuFontFamilyMode = "sans" | "mono";

export type MainMenuRowAlignMode = "left" | "center" | "space-between";

export type MainMenuResumeHighlightStyle =
  | "solid-primary"
  | "surface-card"
  | "amber-accent";

export type MainMenuItemSlotId =
  | "resume"
  | "play"
  | "garage"
  | "settings"
  | "configure"
  | "restart"
  | "leave";

export interface MainMenuStyleParams {
  variant: MainMenuStyleVariant;
  conciseResumeLabel: boolean;
  showDescription: boolean;
  itemPaddingXPx: number;
  itemPaddingYPx: number;
  itemMinHeightPx: number;
  itemRadiusPx: number;
  itemBorderWidthPx: number;
  itemGapPx: number;
  showDividers: boolean;
  dividerMarginYPx: number;
  menuContainerPaddingPx: number;
  titleFontFamily: MainMenuFontFamilyMode;
  titleFontSizePx: number;
  titleFontWeight: JetBrainsMonoFontWeight;
  titleLetterSpacingEm: number;
  titleLineHeight: number;
  titleUppercase: boolean;
  descFontSizePx: number;
  descLineHeight: number;
  titleDescGapPx: number;
  showIcon: boolean;
  iconSizePx: number;
  iconStrokeWidth: number;
  showIconBox: boolean;
  iconBoxSizePx: number;
  iconBoxRadiusPx: number;
  iconTitleGapPx: number;
  rowContentAlign: MainMenuRowAlignMode;
  resumeHighlightStyle: MainMenuResumeHighlightStyle;
  showShortcutBadge: boolean;
  showRightArrow: boolean;
  rightArrowSizePx: number;
  headerFontFamily: MainMenuFontFamilyMode;
  headerFontSizePx: number;
  headerFontWeight: JetBrainsMonoFontWeight;
  headerLetterSpacingEm: number;
  headerPaddingXPx: number;
  headerPaddingTopPx: number;
  headerPaddingBottomPx: number;
  contentPaddingXPx: number;
  contentPaddingYPx: number;
  showFooter: boolean;
  footerPaddingXPx: number;
  footerPaddingYPx: number;
  footerFontSizePx: number;
  watermarkSizePx: number;
  watermarkOpacityPct: number;
  watermarkHoverOpacityPct: number;
  watermarkStrokeWidth: number;
  watermarkRotateDeg: number;
  watermarkOffsetXPx: number;
  watermarkOffsetYPx: number;
  usePerItemIconColors: boolean;
  itemIconColors: Record<MainMenuItemSlotId, MainMenuIconColorValue>;
}

export type MainMenuPlatformPreviewMode = "auto" | "apple" | "non-apple-fallback";

export type MainMenuPreviewContextMode =
  | "freeplay" | "replay-viewer" | "exhibition" | "match-lobby-host" | "match-lobby-client"
  | "online-match-host" | "online-match-client" | "online-warmup-host" | "online-warmup-client"
  | "kickoff-training" | "static-training-play" | "static-training-edit" | "dev-test-lab"
  | "exp-multi-bots" | "match" | "custom-match-host" | "custom-match-client";

export interface ResolvedMainMenuTypography {
  fontFamily: string;
  fontWeight: JetBrainsMonoFontWeight;
  isUsingMonoFallback: boolean;
}

export interface MainMenuStylePreset {
  id: string;
  label: string;
  subtitle: string;
  params: Partial<MainMenuStyleParams>;
}

const VALID_MAIN_MENU_CONTEXT_MODES = [
  "freeplay", "replay-viewer", "exhibition", "match-lobby-host", "match-lobby-client",
  "online-match-host", "online-match-client", "online-warmup-host", "online-warmup-client",
  "kickoff-training", "static-training-play", "static-training-edit", "dev-test-lab", "exp-multi-bots",
] as const;

export function normalizeMainMenuContextModeImpl(
  raw?: string | null
): Exclude<MainMenuPreviewContextMode, "match" | "custom-match-host" | "custom-match-client"> {
  if (!raw) return "freeplay";
  if (raw === "match") return "exhibition";
  if (raw === "custom-match-host") return "online-match-host";
  if (raw === "custom-match-client") return "online-match-client";
  if (raw === "online-warmup") return "online-warmup-host";
  if (raw === "static-training-pack") return "static-training-play";
  return (VALID_MAIN_MENU_CONTEXT_MODES as readonly string[]).includes(raw) ? (raw as any) : "freeplay";
}

export function detectIsAppleDeviceImpl(): boolean {
  if (typeof navigator === "undefined") return true;
  const navWithUAData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = navWithUAData.userAgentData?.platform || navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /(Mac|iPhone|iPod|iPad)/i.test(platform) || /(Macintosh|Mac OS X|iPhone|iPad|iPod)/i.test(ua);
}

export function createMainMenuStylePresets(
  baseConfig: MainMenuStyleParams
): MainMenuStylePreset[] {
  return [
    {
      id: "preset-clean-large-bare-icon",
      label: "Preset 1 (Default) · Minimal Large Title + Pure Icon + Single-Border Row (No Description)",
      subtitle: "Short Resume title · 24px Apple Sans Extra Bold (JetBrains Mono fallback) · No inner icon box",
      params: { ...baseConfig },
    },
    {
      id: "preset-clean-large-boxed-icon",
      label: "Preset 2 · Minimal Large Title + Framed Icon Box (No Description)",
      subtitle: "Short Resume title · 18px Bold title · 36x36 framed icon box · No description subtitle",
      params: {
        variant: "large-clean-row", conciseResumeLabel: true, showDescription: false,
        showIconBox: true, iconBoxSizePx: 36, iconBoxRadiusPx: 9,
        titleFontFamily: "sans", titleFontSizePx: 18, titleFontWeight: 700,
        iconSizePx: 20, iconTitleGapPx: 12, itemMinHeightPx: 56, itemPaddingXPx: 16, itemPaddingYPx: 10,
        resumeHighlightStyle: "solid-primary",
      },
    },
    {
      id: "preset-clean-mono-bold",
      label: "Preset 3 · JetBrains Mono Industrial Row (Mono 19px Extra Bold · No Description)",
      subtitle: "Matches Play menu industrial typography: JetBrains Mono 19px Extra Bold + pure icon + semantic accent tint",
      params: {
        variant: "large-clean-row", conciseResumeLabel: true, showDescription: false,
        showIconBox: false, titleFontFamily: "mono", titleFontSizePx: 19, titleFontWeight: 800,
        titleLetterSpacingEm: -0.02, iconSizePx: 21, iconTitleGapPx: 14,
        itemMinHeightPx: 56, itemPaddingXPx: 18, itemPaddingYPx: 14,
        usePerItemIconColors: true, resumeHighlightStyle: "solid-primary",
      },
    },
    {
      id: "preset-clean-unified-surface",
      label: "Preset 4 · Uniform Surface Card Row (Non-Inverted Resume · 20px Title)",
      subtitle: "All rows share a uniform surface card background with 20px titles and semantic icon accents",
      params: {
        variant: "large-clean-row", conciseResumeLabel: true, showDescription: false,
        showIconBox: false, titleFontFamily: "sans", titleFontSizePx: 20, titleFontWeight: 700,
        iconSizePx: 22, iconTitleGapPx: 14, itemMinHeightPx: 56, itemPaddingXPx: 18, itemPaddingYPx: 14,
        resumeHighlightStyle: "surface-card", usePerItemIconColors: true,
      },
    },
    {
      id: "preset-mono-watermark-row",
      label: "Preset 5 · Style 2: JetBrains Mono Title + Right 26% Watermark Icon",
      subtitle: "Extends Play Card Style 3 to horizontal rows: left-aligned Mono title with a 68px tilted watermark icon on the right",
      params: {
        variant: "mono-watermark-row", conciseResumeLabel: true, showDescription: false,
        titleFontFamily: "mono", titleFontSizePx: 19, titleFontWeight: 800, titleLetterSpacingEm: -0.02,
        itemMinHeightPx: 58, itemPaddingXPx: 20, itemPaddingYPx: 14,
        watermarkSizePx: 68, watermarkOpacityPct: 26, watermarkHoverOpacityPct: 45, watermarkRotateDeg: -12,
        usePerItemIconColors: true, resumeHighlightStyle: "surface-card",
      },
    },
    {
      id: "preset-classic-with-description",
      label: "Preset 6 · Style 3 (Legacy Reference): Includes Description Subtitle + Resume Match",
      subtitle: "Retains the two-line layout with description subtitles and framed icon boxes for baseline comparison",
      params: {
        variant: "classic-descriptive-row", conciseResumeLabel: false, showDescription: true,
        showIconBox: true, iconBoxSizePx: 36, iconBoxRadiusPx: 8,
        titleFontFamily: "sans", titleFontSizePx: 14, titleFontWeight: 600, descFontSizePx: 12,
        iconSizePx: 20, iconTitleGapPx: 12, itemMinHeightPx: 52, itemPaddingXPx: 16, itemPaddingYPx: 10,
        itemGapPx: 4, dividerMarginYPx: 2, usePerItemIconColors: false, resumeHighlightStyle: "solid-primary",
      },
    },
  ];
}
