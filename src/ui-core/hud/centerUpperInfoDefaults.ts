export type CenterUpperInfoVariant = 'countdown' | 'winner' | 'announcement';
export type WinnerTeamPreset = 'blue' | 'orange' | 'custom';

export interface CenterUpperBlueTeamConfig {
  enabled: boolean;
  textColor: string;
  glowColor: string;
  syncGlowWithText: boolean;
  innerBlurPx: number;
  outerBlurPx: number;
  ambientBlurPx: number;
  intensityPct: number;
  strokeWidthPx: number;
  strokeColor: string;
}

export interface CenterUpperGlowConfig {
  textColor: string;
  glowColor: string;
  innerBlurPx: number;
  outerBlurPx: number;
  ambientBlurPx: number;
  intensityPct: number;
  topLabelColor?: string;
  topLabelGlowColor?: string;
  strokeWidthPx?: number;
  strokeColor?: string;
  backdropBloomPct?: number;
}

export interface CenterUpperTypographyConfig {
  mainFontSizePx: number;
  mainFontWeight: 100 | 200 | 300 | 400;
  mainLetterSpacingEm: number;
  topFontSizePx: number;
  topFontWeight: 100 | 300 | 400 | 500;
  topLetterSpacingEm: number;
  lineGapPx: number;
  uppercase: boolean;
  italic?: boolean;
}

export interface CenterUpperTimingConfig {
  durationMs: number;
  entryScale: number;
  entryDurationMs: number;
  exitDurationMs: number;
  persistentInspect?: boolean;
}

export interface CenterUpperInfoPayload {
  variant: CenterUpperInfoVariant;
  topText?: string;
  mainText: string;
  subText?: string;
  winnerTeam?: WinnerTeamPreset;
  winnerBlueConfig?: Partial<CenterUpperBlueTeamConfig>;
  glow?: Partial<CenterUpperGlowConfig>;
  typography?: Partial<CenterUpperTypographyConfig>;
  timing?: Partial<CenterUpperTimingConfig>;
  triggerKey?: number | string;
}

export type CenterUpperInfoListener = (payload: CenterUpperInfoPayload | null) => void;

export interface CenterUpperInfoHandle {
  triggerInfo: (payload: CenterUpperInfoPayload | null) => void;
}

export interface CenterUpperInfoHUDProps {
  info?: CenterUpperInfoPayload | null;
  glowConfig?: CenterUpperGlowConfig;
  winnerBlueConfig?: CenterUpperBlueTeamConfig;
  typographyConfig?: CenterUpperTypographyConfig;
  timingConfig?: CenterUpperTimingConfig;
  subscribeCenterInfo?: (listener: CenterUpperInfoListener) => () => void;
  onExpire?: () => void;
  className?: string;
}

export const DEFAULT_RL_COUNTDOWN_GLOW: CenterUpperGlowConfig = {
  textColor: '#FFE600',
  glowColor: '#F59E0B',
  innerBlurPx: 0,
  outerBlurPx: 28,
  ambientBlurPx: 0,
  intensityPct: 100,
  topLabelColor: '#FFFFFF',
  topLabelGlowColor: '#F59E0B',
  strokeWidthPx: 0,
  strokeColor: '#FFFBEB',
  backdropBloomPct: 0,
};

export const DEFAULT_WINNER_BLUE_TEAM_CONFIG: CenterUpperBlueTeamConfig = {
  enabled: true,
  textColor: '#38BDF8',
  glowColor: '#38BDF8',
  syncGlowWithText: true,
  innerBlurPx: 0,
  outerBlurPx: 28,
  ambientBlurPx: 0,
  intensityPct: 100,
  strokeWidthPx: 0,
  strokeColor: '#E0F2FE',
};

export const DEFAULT_WINNER_BLUE_GLOW: CenterUpperGlowConfig = {
  textColor: '#38BDF8',
  glowColor: '#38BDF8',
  innerBlurPx: 0,
  outerBlurPx: 28,
  ambientBlurPx: 0,
  intensityPct: 100,
  topLabelColor: '#FFFFFF',
  topLabelGlowColor: '#F59E0B',
  strokeWidthPx: 0,
  strokeColor: '#E0F2FE',
  backdropBloomPct: 0,
};

export const DEFAULT_WINNER_ORANGE_GLOW: CenterUpperGlowConfig = {
  textColor: '#FFE600',
  glowColor: '#F59E0B',
  innerBlurPx: 0,
  outerBlurPx: 28,
  ambientBlurPx: 0,
  intensityPct: 100,
  topLabelColor: '#FFFFFF',
  topLabelGlowColor: '#F59E0B',
  strokeWidthPx: 0,
  strokeColor: '#FFFBEB',
  backdropBloomPct: 0,
};

export const DEFAULT_CENTER_UPPER_TYPOGRAPHY: CenterUpperTypographyConfig = {
  mainFontSizePx: 84,
  mainFontWeight: 100,
  mainLetterSpacingEm: 0,
  topFontSizePx: 24,
  topFontWeight: 400,
  topLetterSpacingEm: 0,
  lineGapPx: 6,
  uppercase: true,
  italic: false,
};

export const DEFAULT_CENTER_UPPER_TIMING: CenterUpperTimingConfig = {
  durationMs: 2000,
  entryScale: 1.5,
  entryDurationMs: 400,
  exitDurationMs: 400,
  persistentInspect: false,
};

export function hexToRgba(hex: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha.toFixed(3))));
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean;
  if (full.length === 6) {
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }
  }
  return `rgba(255, 230, 0, ${clampedAlpha})`;
}

export function buildOuterGlowTextShadow(
  glowColor: string,
  innerBlurPx: number,
  outerBlurPx: number,
  ambientBlurPx: number,
  intensityPct: number
): string {
  if (intensityPct <= 0) return 'none';
  const mult = intensityPct / 100;
  const aCore = Math.min(1, 0.92 * mult);
  const aMid = Math.min(1, 0.68 * mult);
  const aWide = Math.min(1, 0.42 * mult);

  const layers: string[] = [];
  if (innerBlurPx > 0) {
    layers.push(`0 0 ${Math.round(innerBlurPx)}px ${hexToRgba(glowColor, aCore)}`);
  }
  if (outerBlurPx > 0) {
    layers.push(`0 0 ${Math.round(outerBlurPx)}px ${hexToRgba(glowColor, aMid)}`);
  }
  if (ambientBlurPx > 0) {
    layers.push(`0 0 ${Math.round(ambientBlurPx)}px ${hexToRgba(glowColor, aWide)}`);
  }
  return layers.length > 0 ? layers.join(', ') : 'none';
}

export function buildCenterUpperKineticKeyframes(
  resolvedTiming: CenterUpperTimingConfig,
  animateEntry: boolean
): { keyframes: Keyframe[]; totalTimelineMs: number } {
  const entryMs = Math.max(0, resolvedTiming.entryDurationMs);
  const holdMs = Math.max(entryMs, resolvedTiming.durationMs);
  const exitMs = Math.max(0, resolvedTiming.exitDurationMs);
  const totalTimelineMs = Math.max(1, holdMs + exitMs);
  const entryScale = resolvedTiming.entryScale;
  const holdEndOffset = Math.min(1, holdMs / totalTimelineMs);

  if (animateEntry) {
    const keyframes: Keyframe[] = [];
    const entryOffset = entryMs > 0 ? Math.min(1, entryMs / totalTimelineMs) : 0;

    if (entryOffset > 0) {
      keyframes.push({
        offset: 0,
        transform: `scale3d(${entryScale}, ${entryScale}, 1)`,
        opacity: 1,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      });
      keyframes.push({
        offset: entryOffset,
        transform: 'scale3d(1, 1, 1)',
        opacity: 1,
        easing: 'linear',
      });
    } else {
      keyframes.push({
        offset: 0,
        transform: 'scale3d(1, 1, 1)',
        opacity: 1,
        easing: 'linear',
      });
    }

    if (exitMs > 0 && holdEndOffset > entryOffset && holdEndOffset < 1) {
      keyframes.push({
        offset: holdEndOffset,
        transform: 'scale3d(1, 1, 1)',
        opacity: 1,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      });
    }

    if (exitMs > 0) {
      keyframes.push({ offset: 1, transform: 'scale3d(1, 1, 1)', opacity: 0 });
    } else if (entryOffset < 1) {
      keyframes.push({ offset: 1, transform: 'scale3d(1, 1, 1)', opacity: 1 });
    }

    return { keyframes, totalTimelineMs };
  }

  const keyframes: Keyframe[] = [
    { offset: 0, transform: 'scale3d(1, 1, 1)', opacity: 1, easing: 'linear' },
  ];
  if (exitMs > 0 && holdEndOffset > 0 && holdEndOffset < 1) {
    keyframes.push({
      offset: holdEndOffset,
      transform: 'scale3d(1, 1, 1)',
      opacity: 1,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    });
  }
  keyframes.push({
    offset: 1,
    transform: 'scale3d(1, 1, 1)',
    opacity: exitMs > 0 ? 0 : 1,
  });
  return { keyframes, totalTimelineMs };
}
