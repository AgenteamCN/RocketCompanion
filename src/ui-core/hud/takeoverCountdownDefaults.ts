import {
  type CenterUpperGlowConfig,
  type CenterUpperTypographyConfig,
  type CenterUpperTimingConfig,
  DEFAULT_RL_COUNTDOWN_GLOW,
  buildOuterGlowTextShadow,
  hexToRgba,
} from './centerUpperInfoDefaults';

export type TakeoverCountdownStep = '3' | '2' | '1' | 'complete';

export type TakeoverSignal = 'replacing-in' | 'takeover-complete';

export type TakeoverTeamSide = 'blue' | 'orange';

export interface TakeoverLayoutConfig {
  /** Upward vertical offset in px relative to bottom-center (default 0) */
  bottomOffsetPx: number;
}

export interface TakeoverTopLabelStyleConfig {
  /** Whether top label (Takeover in...) uses team-specific fill color (Blue vs Orange) */
  useTeamColor?: boolean;
  /** Blue team top label font fill color (default '#38BDF8') */
  blueTeamColor?: string;
  /** Orange team top label font fill color (default '#FB923C') */
  orangeTeamColor?: string;
  /** Top label stroke color (default '#000000') */
  strokeColor?: string;
  /** Top label stroke width in px (default 0.5) */
  strokeWidthPx?: number;
  /** Top label outer glow color (default '#000000') */
  glowColor?: string;
  /** Top label tight core glow blur in px (default 6) */
  innerBlurPx?: number;
  /** Top label outer glow blur in px (default 0) */
  outerBlurPx?: number;
  /** Top label ambient glow blur in px (default 28) */
  ambientBlurPx?: number;
  /** Top label glow intensity percentage (0 - 200, default 100) */
  glowIntensityPct?: number;
}

export interface TakeoverGlowConfig extends CenterUpperGlowConfig {
  /** Team-colored + stroke/glow overrides for the stationary top label (Takeover in...) */
  topLabelStyle?: TakeoverTopLabelStyleConfig;
}

export interface TakeoverHudPayload {
  /** Top static label rendered in JetBrains Mono Regular (400) - e.g. 'Takeover in...' */
  topText: string;
  /** Bottom countdown text rendered in JetBrains Mono Thin (100) - e.g. '3', '2', '1' */
  mainText: string;
  /** Optional secondary sub-caption below countdown */
  subText?: string;
  /** Active player team side ('blue' | 'orange') for team-colored top label */
  teamSide?: TakeoverTeamSide;
  /** Active glow configuration override */
  glow?: Partial<TakeoverGlowConfig>;
  /** Active typography configuration override */
  typography?: Partial<CenterUpperTypographyConfig>;
  /** Active timing configuration override */
  timing?: Partial<CenterUpperTimingConfig>;
  /** Unique trigger key so consecutive steps re-trigger the bottom-only scale pop */
  triggerKey?: number | string;
}

export interface TakeoverCountdownHandle {
  /** Imperatively trigger a countdown step with bottom-only scale pop and static top label */
  triggerTakeoverStep: (payload: TakeoverHudPayload | null) => void;
}

export interface TakeoverCountdownHUDProps {
  /** Active takeover payload (null = hidden) */
  payload?: TakeoverHudPayload | null;
  /** Active team side ('blue' | 'orange', default 'blue') */
  teamSide?: TakeoverTeamSide;
  /** Glow configuration (shared with 5E CenterUpperGlowConfig + topLabelStyle) */
  glowConfig?: TakeoverGlowConfig;
  /** Typography configuration (uppercase: false by default for Takeover) */
  typographyConfig?: CenterUpperTypographyConfig;
  /** Timing configuration (scale pop applies strictly to mainText, leaving topText stationary) */
  timingConfig?: CenterUpperTimingConfig;
  /** Callback fired when an individual step's hold + exit window completes */
  onStepExpire?: () => void;
  className?: string;
}

export const DEFAULT_TAKEOVER_TOP_LABEL_STYLE: Required<TakeoverTopLabelStyleConfig> = {
  useTeamColor: true,
  blueTeamColor: '#38BDF8',
  orangeTeamColor: '#FB923C',
  strokeColor: '#000000',
  strokeWidthPx: 0.5,
  glowColor: '#000000',
  innerBlurPx: 6,
  outerBlurPx: 0,
  ambientBlurPx: 28,
  glowIntensityPct: 100,
};

export const DEFAULT_TAKEOVER_GLOW: TakeoverGlowConfig = {
  ...DEFAULT_RL_COUNTDOWN_GLOW,
  textColor: '#FFE600',
  glowColor: '#FFE600',
  innerBlurPx: 0,
  outerBlurPx: 28,
  ambientBlurPx: 0,
  intensityPct: 100,
  topLabelColor: '#FFFFFF',
  topLabelGlowColor: '#F59E0B',
  strokeWidthPx: 0,
  strokeColor: '#FFFBEB',
  backdropBloomPct: 0,
  topLabelStyle: {
    ...DEFAULT_TAKEOVER_TOP_LABEL_STYLE,
  },
};

export const DEFAULT_TAKEOVER_TYPOGRAPHY: CenterUpperTypographyConfig = {
  mainFontSizePx: 56,
  mainFontWeight: 100,
  mainLetterSpacingEm: 0,
  topFontSizePx: 24,
  topFontWeight: 400,
  topLetterSpacingEm: 0,
  lineGapPx: 8,
  uppercase: false,
  italic: false,
};

export const DEFAULT_TAKEOVER_TIMING: CenterUpperTimingConfig = {
  durationMs: 1000,
  entryScale: 1.5,
  entryDurationMs: 380,
  exitDurationMs: 220,
  persistentInspect: false,
};

export const DEFAULT_TAKEOVER_LAYOUT: TakeoverLayoutConfig = {
  bottomOffsetPx: 0,
};

/**
 * Resolves the top label (Takeover in...) fill color, stroke, and outer glow shadow
 * based on the player's team side ('blue' | 'orange') and TakeoverGlowConfig.
 */
export function resolveTakeoverTopLabelVisuals(
  glow: TakeoverGlowConfig,
  teamSide: TakeoverTeamSide = 'blue'
): {
  fillColor: string;
  strokeCss: string;
  textShadowCss: string;
  strokeColor: string;
  strokeWidthPx: number;
} {
  const style: Required<TakeoverTopLabelStyleConfig> = {
    ...DEFAULT_TAKEOVER_TOP_LABEL_STYLE,
    ...(glow.topLabelStyle ?? {}),
  };

  const fillColor = style.useTeamColor
    ? teamSide === 'orange'
      ? style.orangeTeamColor
      : style.blueTeamColor
    : glow.topLabelColor || '#FFFFFF';

  const strokeWidthPx = style.strokeWidthPx;
  const strokeColor = style.strokeColor || '#000000';
  const strokeCss =
    strokeWidthPx > 0 ? `${strokeWidthPx}px ${strokeColor}` : '0px transparent';

  const glowShadow = buildOuterGlowTextShadow(
    style.glowColor || strokeColor,
    style.innerBlurPx,
    style.outerBlurPx,
    style.ambientBlurPx,
    style.glowIntensityPct
  );

  const crispHalo =
    strokeWidthPx > 0
      ? `0 0 2px ${hexToRgba(strokeColor, 0.95)}, 0 0 5px ${hexToRgba(strokeColor, 0.75)}`
      : '';
  const textShadowCss =
    [crispHalo, glowShadow !== 'none' ? glowShadow : ''].filter(Boolean).join(', ') ||
    'none';

  return {
    fillColor,
    strokeCss,
    textShadowCss,
    strokeColor,
    strokeWidthPx,
  };
}

export function applyTakeoverDomStyles(params: {
  nextPayload: TakeoverHudPayload;
  resolvedGlow: TakeoverGlowConfig;
  resolvedTypo: CenterUpperTypographyConfig;
  resolvedTeamSide: TakeoverTeamSide;
  bloomEl: HTMLDivElement;
  topEl: HTMLDivElement;
  mainEl: HTMLDivElement;
  subEl: HTMLDivElement;
}): void {
  const {
    nextPayload,
    resolvedGlow,
    resolvedTypo,
    resolvedTeamSide,
    bloomEl,
    topEl,
    mainEl,
    subEl,
  } = params;

  const bloomPct = resolvedGlow.backdropBloomPct ?? 0;
  if (bloomPct > 0 && resolvedGlow.intensityPct > 0) {
    const bloomAlpha = Math.min(
      0.65,
      (bloomPct / 100) * (resolvedGlow.intensityPct / 100) * 0.45
    );
    bloomEl.style.background = `radial-gradient(ellipse at center, ${hexToRgba(
      resolvedGlow.glowColor,
      bloomAlpha
    )} 0%, ${hexToRgba(resolvedGlow.glowColor, bloomAlpha * 0.35)} 42%, transparent 74%)`;
    bloomEl.style.opacity = '1';
  } else {
    bloomEl.style.opacity = '0';
  }

  const strokeW = resolvedGlow.strokeWidthPx ?? 0;
  const resolvedStrokeCol =
    resolvedGlow.strokeColor || resolvedGlow.glowColor || resolvedGlow.textColor;

  const hasTopText = Boolean(nextPayload.topText && nextPayload.topText.trim().length > 0);
  if (hasTopText) {
    const topVisuals = resolveTakeoverTopLabelVisuals(resolvedGlow, resolvedTeamSide);
    topEl.style.display = 'block';
    topEl.style.opacity = '1';
    topEl.style.transform = 'none';
    topEl.textContent = resolvedTypo.uppercase
      ? nextPayload.topText.toUpperCase()
      : nextPayload.topText;
    topEl.style.fontSize = `${resolvedTypo.topFontSizePx}px`;
    topEl.style.fontWeight = String(resolvedTypo.topFontWeight);
    topEl.style.letterSpacing = `${resolvedTypo.topLetterSpacingEm}em`;
    topEl.style.paddingLeft =
      resolvedTypo.topLetterSpacingEm > 0 ? `${resolvedTypo.topLetterSpacingEm}em` : '0px';
    topEl.style.color = topVisuals.fillColor;
    topEl.style.webkitTextStroke = topVisuals.strokeCss;
    topEl.style.paintOrder = 'stroke fill';
    topEl.style.textShadow = topVisuals.textShadowCss;
  } else {
    topEl.style.display = 'none';
    topEl.textContent = '';
  }

  mainEl.textContent = resolvedTypo.uppercase
    ? nextPayload.mainText.toUpperCase()
    : nextPayload.mainText;
  mainEl.style.fontSize = `${resolvedTypo.mainFontSizePx}px`;
  mainEl.style.fontWeight = String(resolvedTypo.mainFontWeight);
  mainEl.style.letterSpacing = `${resolvedTypo.mainLetterSpacingEm}em`;
  mainEl.style.paddingLeft =
    resolvedTypo.mainLetterSpacingEm > 0 ? `${resolvedTypo.mainLetterSpacingEm}em` : '0px';
  mainEl.style.fontStyle = resolvedTypo.italic ? 'italic' : 'normal';
  mainEl.style.color = resolvedGlow.textColor;
  mainEl.style.textShadow = buildOuterGlowTextShadow(
    resolvedGlow.glowColor,
    resolvedGlow.innerBlurPx,
    resolvedGlow.outerBlurPx,
    resolvedGlow.ambientBlurPx,
    resolvedGlow.intensityPct
  );
  mainEl.style.webkitTextStroke =
    strokeW > 0 ? `${strokeW}px ${resolvedStrokeCol}` : '0px transparent';

  if (nextPayload.subText && nextPayload.subText.trim().length > 0) {
    subEl.style.display = 'inline-flex';
    subEl.textContent = resolvedTypo.uppercase
      ? nextPayload.subText.toUpperCase()
      : nextPayload.subText;
    subEl.style.color = resolvedGlow.topLabelColor || '#E2E8F0';
    subEl.style.borderColor = hexToRgba(resolvedGlow.glowColor, 0.45);
    subEl.style.boxShadow = `0 0 0 1px ${hexToRgba(resolvedGlow.glowColor, 0.25)}`;
  } else {
    subEl.style.display = 'none';
    subEl.textContent = '';
  }
}

export function buildTakeoverPrerollPayload(params: {
  activePrerollSec: number;
  activeDownSec: number;
  takeoverTeam: TakeoverTeamSide;
  triggerKey: number;
}): TakeoverHudPayload | null {
  const { activePrerollSec, activeDownSec, takeoverTeam, triggerKey } = params;
  const effectiveDownSec = Math.max(1, activeDownSec);
  if (activePrerollSec < 1 || activePrerollSec > effectiveDownSec + 1) {
    return null;
  }
  const displayDigit = Math.min(3, activePrerollSec);
  const isSilentLeadIn = activeDownSec > 0 && activePrerollSec > effectiveDownSec;
  const stepTiming = isSilentLeadIn
    ? {
        ...DEFAULT_TAKEOVER_TIMING,
        entryScale: 1,
        entryDurationMs: 0,
        persistentInspect: true,
      }
    : DEFAULT_TAKEOVER_TIMING;

  return {
    topText: 'Takeover in...',
    mainText: String(displayDigit),
    subText: '',
    teamSide: takeoverTeam,
    glow: DEFAULT_TAKEOVER_GLOW,
    typography: DEFAULT_TAKEOVER_TYPOGRAPHY,
    timing: stepTiming,
    triggerKey,
  };
}
