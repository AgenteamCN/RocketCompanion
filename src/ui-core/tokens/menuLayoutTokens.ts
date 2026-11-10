import {
  CANONICAL_PANEL_SIZING as CANONICAL_PANEL_SIZING_PRESETS,
  DEFAULT_PANEL_SIZING as DEFAULT_PANEL_SIZING_PRESETS,
  resolveMenuPanelSizing as resolveMenuPanelSizingPreset,
  type CanonicalMenuPanelId,
  type MenuPanelId,
  type PanelSizingConfig,
  type PanelSizingMode,
} from './menuPanelSizingPresets';

export type {
  CanonicalMenuPanelId,
  MenuPanelId,
  PanelSizingConfig,
  PanelSizingMode,
};

export type PanelHeaderBackBtnRadiusMode =
  | 'auto'
  | 'asymmetric-tl'
  | 'custom'
  | 'per-corner';

export type PanelHeaderBackBtnStyle = 'surface' | 'subtle' | 'ghost';

/**
 * Semantic idle background tone of the Back / Right Action buttons in PanelHeader:
 * - 'match-header': Completely unified with the header bar in idle state (transparent bg, not darker than header; highlights only on hover/active)
 * - 'muted-gray': Subtle gray surface fill in idle state, high-contrast on hover
 * - 'elevated': Distinct card/button surface fill in idle state
 */
export type PanelHeaderBackBtnIdleTone = 'match-header' | 'muted-gray' | 'elevated';

/**
 * Icon transform mode for the Header Right Action button (e.g. Minimize2 icon):
 * - 'none': Default orientation
 * - 'flip-x': Horizontal flip (`scaleX(-1)`)
 * - 'rotate-90': 90-degree clockwise rotation (`rotate(90deg)`)
 */
export type PanelHeaderRightBtnTransform = 'none' | 'flip-x' | 'rotate-90';

export interface BackBtnResolvedGeometry {
  width: number;
  height: number;
  iconSize: number;
  /** Top-left concentric radius R_tl = max(0, min(halfDim, R_outer - max(padX, padY))) */
  concentricRadius: number;
  /** Inner minor radius used for non-corner edges in asymmetric-tl mode */
  innerRadius: number;
  /** CSS borderRadius value string for Left Back Button (e.g., "16px 0px 0px 0px") */
  borderRadiusCss: string;
  /** CSS borderRadius value string mirrored for Right Action Button (e.g., "0px 16px 0px 0px") */
  rightBorderRadiusCss: string;
  /** Numeric summary label for UI badges/inspectors */
  radiusSummary: string;
}

export interface FloatingShellTokens {
  /** Floating window outer border-radius in px (default: 16px) */
  floatingOuterRadius: number;
  /** Stage 1 Floating window header horizontal padding in px (default: 12px) */
  floatingHeaderPaddingX: number;
  /** Stage 1 Floating window header vertical padding in px (default: 8px) */
  floatingHeaderPaddingY: number;
  /** Stage 1 Floating window header title font size in px (default: 14px) */
  floatingHeaderTitleFontSize: number;
  /** Stage 1 Floating window header minimize button width & height in px (default: 22px) */
  floatingHeaderMinimizeBtnSize: number;
  /** Stage 1 Floating window header minimize button corner radius in px (default: 6px) */
  floatingHeaderMinimizeBtnRadius: number;
  /** Stage 2 Floating window fallback content body horizontal padding in px (default: 14px) */
  floatingBodyPaddingX: number;
  /** Stage 2 Floating window fallback content body vertical padding in px (default: 14px) */
  floatingBodyPaddingY: number;
  /** Stage 3 Floating window footer horizontal padding in px (default: 14px) */
  floatingFooterPaddingX: number;
  /** Stage 3 Floating window footer vertical padding in px (default: 6px) */
  floatingFooterPaddingY: number;
  /** Stage 3 Floating window footer right padding when corner resize dragger is visible (default: 24px) */
  floatingFooterCornerReserveRightPx: number;
  /** Stage 3 Floating window footer font size in px (default: 11px) */
  floatingFooterFontSize: number;
}

export interface MenuLayoutTokens extends FloatingShellTokens {
  /** Per-panel independent sizing contracts */
  panels: Record<MenuPanelId, PanelSizingConfig>;
  /** Vertical margin (top & bottom in px) for MenuDivider (default: 2px) */
  dividerMarginY: number;
  /** Vertical flex gap (in px) between items inside MenuContainer (default: 4px) */
  menuItemGap: number;
  /** Vertical padding (top & bottom in px) inside each MenuItem (default: 10px) */
  menuItemPaddingY: number;
  /** Uniform inner padding (in px) of MenuContainer (default: 4px) */
  menuContainerPadding: number;
  /** Vertical padding (top & bottom in px) of Layer 1 PanelContent (default: 14px) */
  panelContentPaddingY: number;
  /** Whether to display the 5th button ("Additional Previews") in Layer 1 Main Menu */
  showAdditionalPreviews: boolean;
  /** Whether Layer 3 recipes display the inline single-line error notice */
  simulateLayer3Error: boolean;

  // ── Layer 2+ 3-Stage Compound Panel Shell Tokens (Decoupled from Layer 1) ──
  /** Whether Header, Tabs, Content, and Footer horizontal paddings (X) are locked together */
  lockPanelPaddingX: boolean;
  /** Header horizontal padding (left & right in px) for Layer 2+ PanelHeader (default: 0px) */
  panelHeaderPaddingX: number;
  /** Header vertical padding (top & bottom in px) for Layer 2+ PanelHeader (default: 0px) */
  panelHeaderPaddingY: number;
  /** Header title font size (in px) for Layer 2+ PanelHeader (default: 16px) */
  panelHeaderTitleFontSize: number;
  /** Whether Back button width and height are locked 1:1 (square) or decoupled (rectangle/pill) */
  lockPanelHeaderBackBtnAspect: boolean;
  /** Header back button width (in px) for Layer 2+ PanelHeader (default: 42px) */
  panelHeaderBackBtnWidth: number;
  /** Header back button height (in px) for Layer 2+ PanelHeader (default: 32px) */
  panelHeaderBackBtnHeight: number;
  /** Legacy alias synced with panelHeaderBackBtnHeight for backward compatibility */
  panelHeaderBackBtnSize: number;
  /** Whether to show the left arrow icon inside the PanelHeader back button (default: true) */
  panelHeaderBackBtnShowArrow: boolean;
  /** Whether to show the "BACK" text label inside the PanelHeader back button (default: false) */
  panelHeaderBackBtnShowLabel: boolean;
  /** Semantic idle color/tone of the back button ('match-header' | 'muted-gray' | 'elevated') */
  panelHeaderBackBtnIdleTone: PanelHeaderBackBtnIdleTone;
  /** Header back button visual style: 'surface' (bordered button), 'subtle' (translucent borderless), 'ghost' (hover-only) */
  panelHeaderBackBtnStyle: PanelHeaderBackBtnStyle;
  /**
   * Header back button border-radius mode:
   * - 'auto': Uniform Concentric (all 4 corners = R_outer - max(padX, padY))
   * - 'asymmetric-tl': Asymmetric Corner-Nested (Top-Left = Concentric, TR/BR/BL = panelHeaderBackBtnInnerRadius)
   * - 'custom': Uniform Custom (all 4 corners = panelHeaderBackBtnRadius)
   * - 'per-corner': Independent 4 corners (TL / TR / BR / BL)
   */
  panelHeaderBackBtnRadiusMode: PanelHeaderBackBtnRadiusMode;
  /** Header back button explicit uniform border-radius in px when mode is 'custom' (default: 7px) */
  panelHeaderBackBtnRadius: number;
  /** Header back button minor inner radius (in px) for TR/BR/BL when mode is 'asymmetric-tl' (default: 0px) */
  panelHeaderBackBtnInnerRadius: number;
  /** Independent Top-Left radius in px when mode is 'per-corner' (default: 10px) */
  panelHeaderBackBtnRadiusTL: number;
  /** Independent Top-Right radius in px when mode is 'per-corner' (default: 6px) */
  panelHeaderBackBtnRadiusTR: number;
  /** Independent Bottom-Right radius in px when mode is 'per-corner' (default: 6px) */
  panelHeaderBackBtnRadiusBR: number;
  /** Independent Bottom-Left radius in px when mode is 'per-corner' (default: 6px) */
  panelHeaderBackBtnRadiusBL: number;
  /** Whether to show the mirrored Right Action Icon button (default icon: Minimize2) on the top-right of PanelHeader */
  panelHeaderShowRightBtn: boolean;
  /** Icon transform for the Header Right Action button ('none' | 'flip-x' | 'rotate-90', default: 'flip-x') */
  panelHeaderRightBtnTransform: PanelHeaderRightBtnTransform;
  /** Whether hovering the Header Right Action button expands its label ("Live Preview") inline */
  panelHeaderRightBtnExpandOnHover: boolean;
  /** Outer PanelContainer border-radius in px used for concentric inner radius calculation (default: 16px) */
  panelOuterRadius: number;
  /** Header gap (in px) between Back button and Title (default: 10px) */
  panelHeaderGap: number;
  /** Content body horizontal padding (left & right in px) for Layer 2+ PanelContent (default: 18px) */
  panelBodyPaddingX: number;
  /** Content body vertical padding (top & bottom in px) for Layer 2+ PanelContent (default: 14px) */
  panelBodyPaddingY: number;
  /** Footer horizontal padding (left & right in px) for Layer 2+ PanelFooter (default: 18px) */
  panelFooterPaddingX: number;
  /** Footer vertical padding (top & bottom in px) for Layer 2+ PanelFooter (default: 8px) */
  panelFooterPaddingY: number;
  /** Footer font size (in px) for Layer 2+ PanelFooter (default: 12px) */
  panelFooterFontSize: number;
  /** Whether PanelFooter splits out a dedicated right-hand capability/shortcut slot (default: true) */
  panelFooterSplitRight: boolean;
  /** Whether the PanelFooter right-hand capability slot renders a vertical divider line (`border-l`, default: true) */
  panelFooterRightDivider: boolean;
  /** Horizontal padding (in px) of the PanelFooter right-hand capability slot (default: 12px) */
  panelFooterRightPaddingX: number;

  // Convenience dimension summaries synced with panels
  layer1Width: number;
  layer1Height: number;
  layer2Width: number;
  layer2Height: number;
  layer3Width: number;
  layer3Height: number;
}

export const CANONICAL_PANEL_SIZING: Record<CanonicalMenuPanelId, PanelSizingConfig> =
  CANONICAL_PANEL_SIZING_PRESETS;
export const DEFAULT_PANEL_SIZING: Record<MenuPanelId, PanelSizingConfig> =
  DEFAULT_PANEL_SIZING_PRESETS;
export const resolveMenuPanelSizing = resolveMenuPanelSizingPreset;

export const DEFAULT_FLOATING_SHELL_TOKENS: FloatingShellTokens = {
  floatingOuterRadius: 16,
  floatingHeaderPaddingX: 12,
  floatingHeaderPaddingY: 8,
  floatingHeaderTitleFontSize: 14,
  floatingHeaderMinimizeBtnSize: 22,
  floatingHeaderMinimizeBtnRadius: 6,
  floatingBodyPaddingX: 14,
  floatingBodyPaddingY: 14,
  floatingFooterPaddingX: 14,
  floatingFooterPaddingY: 6,
  floatingFooterCornerReserveRightPx: 24,
  floatingFooterFontSize: 11,
};

export const DEFAULT_PANEL_SHELL_TOKENS = {
  lockPanelPaddingX: false,
  panelHeaderPaddingX: 0,
  panelHeaderPaddingY: 0,
  panelHeaderTitleFontSize: 16,
  lockPanelHeaderBackBtnAspect: false,
  panelHeaderBackBtnWidth: 42,
  panelHeaderBackBtnHeight: 32,
  panelHeaderBackBtnSize: 32,
  panelHeaderBackBtnShowArrow: true,
  panelHeaderBackBtnShowLabel: false,
  panelHeaderBackBtnIdleTone: 'match-header' as PanelHeaderBackBtnIdleTone,
  panelHeaderBackBtnStyle: 'surface' as PanelHeaderBackBtnStyle,
  panelHeaderBackBtnRadiusMode: 'asymmetric-tl' as PanelHeaderBackBtnRadiusMode,
  panelHeaderBackBtnRadius: 7,
  panelHeaderBackBtnInnerRadius: 0,
  panelHeaderBackBtnRadiusTL: 10,
  panelHeaderBackBtnRadiusTR: 6,
  panelHeaderBackBtnRadiusBR: 6,
  panelHeaderBackBtnRadiusBL: 6,
  panelHeaderShowRightBtn: true,
  panelHeaderRightBtnTransform: 'none' as PanelHeaderRightBtnTransform,
  panelHeaderRightBtnExpandOnHover: false,
  panelOuterRadius: 16,
  panelHeaderGap: 10,
  panelBodyPaddingX: 16,
  panelBodyPaddingY: 14,
  panelFooterPaddingX: 16,
  panelFooterPaddingY: 6,
  panelFooterFontSize: 12,
  panelFooterSplitRight: false,
  panelFooterRightDivider: false,
  panelFooterRightPaddingX: 12,
  ...DEFAULT_FLOATING_SHELL_TOKENS,
};

/**
 * Pure geometry resolver for the Layer 2+ PanelHeader Back & Right Action Buttons.
 * Centralizes width/height, icon sizing, and 4-mode border-radius calculation
 * (including mirrored top-right corner geometry) so PanelHeader (L2) and PanelShellTuner (L7) remain 100% decoupled.
 */
export const resolvePanelHeaderBackBtnGeometry = (
  tokens: Pick<
    MenuLayoutTokens,
    | 'panelHeaderPaddingX'
    | 'panelHeaderPaddingY'
    | 'panelHeaderBackBtnWidth'
    | 'panelHeaderBackBtnHeight'
    | 'panelHeaderBackBtnRadiusMode'
    | 'panelHeaderBackBtnRadius'
    | 'panelHeaderBackBtnInnerRadius'
    | 'panelHeaderBackBtnRadiusTL'
    | 'panelHeaderBackBtnRadiusTR'
    | 'panelHeaderBackBtnRadiusBR'
    | 'panelHeaderBackBtnRadiusBL'
    | 'panelOuterRadius'
  >
): BackBtnResolvedGeometry => {
  const width = Math.max(12, tokens.panelHeaderBackBtnWidth);
  const height = Math.max(12, tokens.panelHeaderBackBtnHeight);
  const minDim = Math.min(width, height);
  const halfMinDim = Math.floor(minDim / 2);
  const iconSize = Math.max(10, Math.round(minDim * 0.54));

  const isFlushTopLeft = tokens.panelHeaderPaddingX === 0 && tokens.panelHeaderPaddingY === 0;
  const concentricRadius = isFlushTopLeft
    ? Math.max(0, Math.min(Math.max(width, height), tokens.panelOuterRadius))
    : Math.max(
        0,
        Math.min(
          halfMinDim,
          tokens.panelOuterRadius - Math.max(tokens.panelHeaderPaddingX, tokens.panelHeaderPaddingY)
        )
      );

  const innerRadius = Math.max(0, Math.min(halfMinDim, tokens.panelHeaderBackBtnInnerRadius));
  const customUniform = Math.max(0, tokens.panelHeaderBackBtnRadius);

  let borderRadiusCss: string;
  let rightBorderRadiusCss: string;
  let radiusSummary: string;

  switch (tokens.panelHeaderBackBtnRadiusMode) {
    case 'auto': {
      borderRadiusCss = `${concentricRadius}px`;
      rightBorderRadiusCss = `${concentricRadius}px`;
      radiusSummary = `${concentricRadius}px (Concentric)`;
      break;
    }
    case 'asymmetric-tl': {
      borderRadiusCss = `${concentricRadius}px ${innerRadius}px ${innerRadius}px ${innerRadius}px`;
      rightBorderRadiusCss = `${innerRadius}px ${concentricRadius}px ${innerRadius}px ${innerRadius}px`;
      radiusSummary =
        concentricRadius === innerRadius
          ? `${concentricRadius}px`
          : `${concentricRadius}/${innerRadius}/${innerRadius}/${innerRadius}px`;
      break;
    }
    case 'per-corner': {
      const tl = Math.max(0, tokens.panelHeaderBackBtnRadiusTL);
      const tr = Math.max(0, tokens.panelHeaderBackBtnRadiusTR);
      const br = Math.max(0, tokens.panelHeaderBackBtnRadiusBR);
      const bl = Math.max(0, tokens.panelHeaderBackBtnRadiusBL);
      borderRadiusCss = `${tl}px ${tr}px ${br}px ${bl}px`;
      rightBorderRadiusCss = `${tr}px ${tl}px ${bl}px ${br}px`;
      radiusSummary = `${tl}/${tr}/${br}/${bl}px`;
      break;
    }
    case 'custom':
    default: {
      borderRadiusCss = `${customUniform}px`;
      rightBorderRadiusCss = `${customUniform}px`;
      radiusSummary = `${customUniform}px (Custom)`;
      break;
    }
  }

  return {
    width,
    height,
    iconSize,
    concentricRadius,
    innerRadius,
    borderRadiusCss,
    rightBorderRadiusCss,
    radiusSummary,
  };
};

export const DEFAULT_MENU_LAYOUT_TOKENS: MenuLayoutTokens = {
  panels: DEFAULT_PANEL_SIZING,
  dividerMarginY: 2,
  menuItemGap: 4,
  menuItemPaddingY: 10,
  menuContainerPadding: 4,
  panelContentPaddingY: 14,
  showAdditionalPreviews: false,
  simulateLayer3Error: false,
  ...DEFAULT_PANEL_SHELL_TOKENS,
  layer1Width: DEFAULT_PANEL_SIZING['layer1-main'].width,
  layer1Height: DEFAULT_PANEL_SIZING['layer1-main'].targetHeight,
  layer2Width: DEFAULT_PANEL_SIZING['layer2-settings'].width,
  layer2Height: DEFAULT_PANEL_SIZING['layer2-settings'].targetHeight,
  layer3Width: DEFAULT_PANEL_SIZING['layer3-host-match'].width,
  layer3Height: DEFAULT_PANEL_SIZING['layer3-host-match'].targetHeight,
};
