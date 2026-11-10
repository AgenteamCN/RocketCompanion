import React from 'react';

export type PackagedSvgIconId =
  | 'bomb-emoji'
  | 'replay-skip-check'
  | 'crossbar-outline'
  | 'crossbar-solid'
  | 'bounce-outline'
  | 'bounce-solid'
  | 'high-five'
  | 'tactics'
  | 'tactics-square'
  | 'strategy'
  | 'jet-thrust';

export type PackagedSvgId = PackagedSvgIconId;

export interface BounceSvgOptions {
  /** Render both trajectory and ground platform as solid single lines while ball stays outlined */
  solidTrajectoryAndPlatform?: boolean;
  /** Render the V-shaped bounce trajectory as a solid single line instead of hollow double-outline */
  solidTrajectory?: boolean;
  /** Render the bottom ground platform bar as a solid single line instead of hollow double-outline */
  solidPlatform?: boolean;
  /** Keep false (default) for normal outlined ball, or true for solid ball */
  solidBall?: boolean;
}

export interface HighFiveSvgOptions {
  /** Toggle 1: Show top 3 + bottom 3 = 6 action spark lines (default true) */
  showSparks?: boolean;
  /** Toggle 2: Fill left hand solid (/, default false) */
  fillLeftHand?: boolean;
  /** Toggle 3: Fill right hand solid (/, default false) */
  fillRightHand?: boolean;
}

export interface TacticsSvgOptions {
  /** Use 1:1 square variation with angled diagonal playmaker arrow (default false = original 6112985) */
  squareVariation?: boolean;
  /** Custom arrow tilt angle in degrees when in square variation (default -18) */
  arrowTiltDeg?: number;
}

export interface StrategySvgOptions {
  /** Toggle 1: Convert Top-Left X marker into a Circle O (default false = X) */
  topLeftCircle?: boolean;
  /** Toggle 2: Convert Bottom-Right X marker into a Circle O (default false = X) */
  bottomRightCircle?: boolean;
}

export interface CrossbarSvgOptions {
  /** Variant shorthand ('outline' = 7267515, 'solid' = 7267457) */
  variant?: 'outline' | 'solid';
  /** Use solid goalpost & solid ball (7267457) instead of outlined goalpost & ball (7267515) */
  solidFrame?: boolean;
  /** Show top 3 impact spark lines (default true) */
  showSparks?: boolean;
  /** Show bottom 2 diagonal rebound lines inside goal (default true) */
  showReboundLines?: boolean;
}

export interface PackagedSvgStyleProps {
  /** Icon bounding box width & height in px (default 24) */
  size?: number;
  /** Primary stroke/fill color (default 'currentColor') */
  color?: string;
  /**
   * Stroke width / weight control:
   * - For `bomb-emoji` (24x24 stroke icon): direct SVG `strokeWidth` (default `1.5`, range `0.8` - `3.2`)
   * - For Noun Project 5120x5120 contour icons: `1.5` is native weight (`0` extra stroke), `> 1.5` adds bold contour expansion
   */
  strokeWidth?: number;
  /** Outer glow color (e.g. `#EF4444` or `#FFE600`) */
  glowColor?: string;
  /** Outer glow blur radius in px (default `0` = off) */
  glowBlurPx?: number;
  /** Outer glow intensity percentage (`0` - `200`, default `100`) */
  glowIntensityPct?: number;
  className?: string;
  style?: React.CSSProperties;
}

export interface PackagedSvgIconProps extends PackagedSvgStyleProps {
  name?: PackagedSvgIconId;
  icon?: PackagedSvgIconId;
  bounceOptions?: BounceSvgOptions;
  highFiveOptions?: HighFiveSvgOptions;
  tacticsOptions?: TacticsSvgOptions;
  strategyOptions?: StrategySvgOptions;
  crossbarOptions?: CrossbarSvgOptions;
}

export interface PackagedSvgCatalogEntry {
  id: PackagedSvgIconId;
  title: string;
  subtitle: string;
  sourceUrl: string;
  category: 'match-hud-5a' | 'stats-event-5f';
  defaultEventTitle: string;
  defaultCapsuleText: string;
  defaultFootnoteText: string;
}

export const PACKAGED_SVG_CATALOG: PackagedSvgCatalogEntry[] = [
  {
    id: 'bomb-emoji',
    title: 'Bomb Emoji (528868)',
    subtitle: '5A Match HUD demolished player slot icon with adjustable stroke width, color, and outer glow',
    sourceUrl: 'https://www.svgrepo.com/svg/528868/bomb-emoji',
    category: 'match-hud-5a',
    defaultEventTitle: 'DEMOLITION',
    defaultCapsuleText: '+25 PTS · BOOM',
    defaultFootnoteText: 'SUPERSONIC IMPACT · 3.0S RESPAWN',
  },
  {
    id: 'replay-skip-check',
    title: 'Replay Skip Ready Checkmark',
    subtitle: '5A Match HUD inward half-rounded card checkmark with adjustable stroke width, color, and outer glow',
    sourceUrl: 'https://lucide.dev/icons/check',
    category: 'match-hud-5a',
    defaultEventTitle: 'SKIP REPLAY',
    defaultCapsuleText: 'READY',
    defaultFootnoteText: 'GOAL REPLAY SKIP VOTE CONFIRMED',
  },
  {
    id: 'crossbar-outline',
    title: 'Crossbar Outlined (7267515)',
    subtitle: '5F Stats Event · Outlined crossbar impact and rebound spark icon',
    sourceUrl: 'https://thenounproject.com/icon/crossbar-7267515/',
    category: 'stats-event-5f',
    defaultEventTitle: 'CROSSBAR HIT',
    defaultCapsuleText: '118 KM/H',
    defaultFootnoteText: 'UPPER 90 WOODWORK DEFLECTION',
  },
  {
    id: 'crossbar-solid',
    title: 'Crossbar Solid (7267457)',
    subtitle: '5F Stats Event · Filled crossbar and solid ball impact spark icon',
    sourceUrl: 'https://thenounproject.com/icon/crossbar-7267457/',
    category: 'stats-event-5f',
    defaultEventTitle: 'BAR DOWN',
    defaultCapsuleText: '+10 SHOT',
    defaultFootnoteText: 'CROSSBAR IMPACT DETECTED',
  },
  {
    id: 'bounce-solid',
    title: 'Bounce Solid-Line (7384294 Single-Line Variant)',
    subtitle: '5F Stats Event · Single-line solid trajectory and ground platform with outlined ball',
    sourceUrl: 'https://thenounproject.com/icon/bounce-7384294/',
    category: 'stats-event-5f',
    defaultEventTitle: 'BOUNCE SHOT',
    defaultCapsuleText: '×1.4 APEX',
    defaultFootnoteText: 'SINGLE-BOUNCE HALF-VOLLEY TIMING',
  },
  {
    id: 'bounce-outline',
    title: 'Bounce Outlined (7384294 Original Outlined)',
    subtitle: '5F Stats Event · Original double-line outlined bounce trajectory and platform',
    sourceUrl: 'https://thenounproject.com/icon/bounce-7384294/',
    category: 'stats-event-5f',
    defaultEventTitle: 'SURFACE BOUNCE',
    defaultCapsuleText: 'GROUND CLEAR',
    defaultFootnoteText: 'PITCH BOUNCE TRAJECTORY',
  },
  {
    id: 'high-five',
    title: 'High Five (1154833 · 8 Toggle Combinations)',
    subtitle: '5F Stats Event · Supports 3 toggles (burst lines / solid left hand / solid right hand) for 8 combinations',
    sourceUrl: 'https://thenounproject.com/icon/high-five-1154833/',
    category: 'stats-event-5f',
    defaultEventTitle: 'HIGH FIVE',
    defaultCapsuleText: '+50 TEAMWORK',
    defaultFootnoteText: 'POST-GOAL AERIAL BUMP WITH TEAMMATE',
  },
  {
    id: 'tactics-square',
    title: 'Tactics Playmaker Square (6112985 Square Diagonal Variant)',
    subtitle: '5F Stats Event · 1:1 square symmetric composition with diagonal tactical arrow',
    sourceUrl: 'https://thenounproject.com/icon/tactics-6112985/',
    category: 'stats-event-5f',
    defaultEventTitle: 'PLAYMAKER',
    defaultCapsuleText: '+25 ASSIST',
    defaultFootnoteText: 'KEY TACTICAL PASS · 3RD ASSIST',
  },
  {
    id: 'tactics',
    title: 'Tactics Playmaker Original (6112985 Original)',
    subtitle: '5F Stats Event · Original horizontal S-curve tactical arrow with X/O positioning markers',
    sourceUrl: 'https://thenounproject.com/icon/tactics-6112985/',
    category: 'stats-event-5f',
    defaultEventTitle: 'TACTICAL PASS',
    defaultCapsuleText: 'INFIELD FEED',
    defaultFootnoteText: 'PLAYMAKER SEQUENCE COMPLETED',
  },
  {
    id: 'strategy',
    title: 'Strategy Board (6112585 · 4 Marker Combinations)',
    subtitle: '5F Stats Event · Supports 2 toggles (top-left X-to-O / bottom-right X-to-O) for 4 tactical board states',
    sourceUrl: 'https://thenounproject.com/icon/strategy-6112585/',
    category: 'stats-event-5f',
    defaultEventTitle: 'TACTICAL ROTATION',
    defaultCapsuleText: 'CENTER BALL',
    defaultFootnoteText: 'ZONE COVERAGE & STRATEGIC POSITIONING',
  },
];

function hexToRgbaSafe(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, Number(alpha.toFixed(3))));
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return `rgba(239, 68, 68, ${a})`;
}

/**
 * Builds a single-pass CSS `filter: drop-shadow(...)` string for SVG outer glow
 * (avoids stacked multi-pass drop-shadow filters that cause scroll repaint jank on dense SVG grids).
 */
export function buildSvgDropShadowFilter(
  glowColor?: string,
  glowBlurPx = 0,
  glowIntensityPct = 100
): string {
  if (!glowColor || glowBlurPx <= 0 || glowIntensityPct <= 0) return 'none';
  const mult = glowIntensityPct / 100;
  const alpha = Math.min(1, 0.85 * mult);
  const blur = Math.max(1, Math.round(glowBlurPx * 0.85));
  return `drop-shadow(0 0 ${blur}px ${hexToRgbaSafe(glowColor, alpha)})`;
}

export function computeContourStroke5120(strokeWidth = 1.5): number {
  const delta = strokeWidth - 1.5;
  if (delta <= 0.05) return 0;
  return Math.round(delta * 55);
}

export type SkipIndicatorSvgVariant =
  | 'check'
  | 'disconnect'
  | 'packet-loss'
  | 'latency'
  | 'waiting';

export const SKIP_ICON_VARIANT_PATHS: Record<SkipIndicatorSvgVariant, string> = {
  check: 'M5 12.5L10 17.5L19 6.5',
  disconnect:
    'M2 2L22 22 M16.72 11.06A10.94 10.94 0 0 1 19 12.55 ' +
    'M5 12.55A10.94 10.94 0 0 1 10.17 10.16 ' +
    'M10.71 5.05A16 16 0 0 1 22.58 9 ' +
    'M1.42 9A15.91 15.91 0 0 1 6.12 6.12 ' +
    'M8.53 16.11A6 6 0 0 1 15.48 16.11 M12 20H12.01',
  'packet-loss':
    'M3 5H11V13H3Z M13 11H21V19H13Z ' +
    'M15.5 4.5L19.5 8.5 M19.5 4.5L15.5 8.5 ' +
    'M5.5 15.5L8.5 18.5 M8.5 15.5L5.5 18.5',
  latency: 'M4 19V15 M9 19V11 M14 19V7 M19 6V13 M19 17.5H19.01',
  waiting: 'M12 21A9 9 0 1 1 21 12 M12 7V12L15.5 14 M17.5 16.5L21 16.5L21 20',
};

export interface ReplaySkipCheckSvgProps extends PackagedSvgStyleProps {
  variant?: SkipIndicatorSvgVariant;
}

export const BombEmojiSvg: React.FC<PackagedSvgStyleProps> = React.memo(
  ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.6,
    glowColor,
    glowBlurPx = 0,
    glowIntensityPct = 100,
    className = '',
    style,
  }) => {
    const filterStr = buildSvgDropShadowFilter(glowColor, glowBlurPx, glowIntensityPct);
    const eyeScale = Math.max(0.75, Math.min(1.45, strokeWidth / 1.5));
    const sparkPath =
      'M17.9811 2.35316C18.1668 1.88228 18.8332 1.88228 19.0189 2.35316L19.6733 4.01242' +
      'C19.73 4.15618 19.8438 4.26998 19.9876 4.32668L21.6468 4.98108' +
      'C22.1177 5.16679 22.1177 5.83321 21.6468 6.01892L19.9876 6.67332' +
      'C19.8438 6.73002 19.73 6.84382 19.6733 6.98758L19.0189 8.64684' +
      'C18.8332 9.11772 18.1668 9.11772 17.9811 8.64684L17.3267 6.98758' +
      'C17.27 6.84382 17.1562 6.73002 17.0124 6.67332L15.3532 6.01892' +
      'C14.8823 5.83321 14.8823 5.16679 15.3532 4.98108L17.0124 4.32668' +
      'C17.1562 4.26998 17.27 4.15618 17.3267 4.01242L17.9811 2.35316Z';
    const bodyPath =
      'M5.75 8.00337C6.85315 7.36523 8.13392 7 9.5 7' +
      'C13.6421 7 17 10.3579 17 14.5C17 18.6421 13.6421 22 9.5 22' +
      'C5.35786 22 2 18.6421 2 14.5C2 13.1339 2.36523 11.8532 3.00337 10.75';
    return React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: `shrink-0 select-none ${className}`,
        style: {
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        },
      },
      React.createElement('path', {
        d: 'M10 16L12 16',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
      }),
      React.createElement('ellipse', {
        cx: '13',
        cy: '12.5',
        rx: 1 * eyeScale,
        ry: 1.5 * eyeScale,
        fill: 'currentColor',
      }),
      React.createElement('ellipse', {
        cx: '9',
        cy: '12.5',
        rx: 1 * eyeScale,
        ry: 1.5 * eyeScale,
        fill: 'currentColor',
      }),
      React.createElement('path', {
        d: 'M17 7L15 9',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
      }),
      React.createElement('path', {
        d: sparkPath,
        stroke: 'currentColor',
        strokeWidth,
      }),
      React.createElement('path', {
        d: bodyPath,
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
      })
    );
  }
);
BombEmojiSvg.displayName = 'BombEmojiSvg';

export const ReplaySkipCheckSvg: React.FC<ReplaySkipCheckSvgProps> = React.memo(
  ({
    variant = 'check',
    size = 24,
    color = '#10B981',
    strokeWidth = 2.0,
    glowColor = '#10B981',
    glowBlurPx = 6,
    glowIntensityPct = 110,
    className = '',
    style,
  }) => {
    const filterStr = buildSvgDropShadowFilter(glowColor ?? color, glowBlurPx, glowIntensityPct);
    const pathD = SKIP_ICON_VARIANT_PATHS[variant] ?? SKIP_ICON_VARIANT_PATHS.check;
    return React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        className: `shrink-0 select-none ${className}`,
        style: {
          color,
          filter: filterStr !== 'none' ? filterStr : undefined,
          ...style,
        },
      },
      React.createElement('path', {
        d: pathD,
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      })
    );
  }
);
ReplaySkipCheckSvg.displayName = 'ReplaySkipCheckSvg';

