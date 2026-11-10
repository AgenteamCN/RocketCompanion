/**
 * Semantic Color Constants
 * Provides unified theme tokens across Light & Dark surfaces
 */
export type AccentColor = 'amber' | 'neutral' | 'sky';

export interface AccentThemeToken {
  name: string;
  badge: string;
  accent: string;
  accentHover: string;
  text: string;
  ring: string;
  border: string;
  subtle: string;
  activeItemLight: string;
  activeItemDark: string;
}

export const ACCENT_THEMES: Record<AccentColor, AccentThemeToken> = {
  amber: {
    name: 'Warm Amber / Orange',
    badge: 'bg-amber-500 text-white',
    accent: 'bg-amber-500 text-white',
    accentHover: 'hover:bg-amber-600',
    text: 'text-amber-500 dark:text-amber-400',
    ring: 'ring-amber-500/50 focus-visible:ring-amber-500',
    border: 'border-amber-500',
    subtle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    activeItemLight: 'bg-amber-50 text-amber-800 font-semibold shadow-2xs border border-amber-200/80',
    activeItemDark: 'bg-amber-500/15 text-amber-300 font-semibold shadow-xs border border-amber-500/40',
  },
  neutral: {
    name: 'Neutral Monochrome',
    badge: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950',
    accent: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950',
    accentHover: 'hover:bg-neutral-800 dark:hover:bg-neutral-100',
    text: 'text-neutral-900 dark:text-neutral-100',
    ring: 'ring-neutral-400 dark:ring-neutral-500 focus-visible:ring-neutral-400',
    border: 'border-neutral-900 dark:border-white',
    subtle: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700',
    activeItemLight: 'bg-neutral-100 text-neutral-900 font-semibold shadow-2xs border border-neutral-300',
    activeItemDark: 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs border border-neutral-700',
  },
  sky: {
    name: 'Classic Sky',
    badge: 'bg-sky-500 text-white',
    accent: 'bg-sky-500 text-white',
    accentHover: 'hover:bg-sky-600',
    text: 'text-sky-500 dark:text-sky-400',
    ring: 'ring-sky-500/50 focus-visible:ring-sky-500',
    border: 'border-sky-500',
    subtle: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    activeItemLight: 'bg-sky-50 text-sky-700 font-semibold shadow-2xs border border-sky-100',
    activeItemDark: 'bg-sky-500/15 text-sky-300 font-semibold shadow-xs border border-sky-500/40',
  },
};

export const UI_THEME = {
  light: {
    bgApp: 'bg-white',
    bgPanel: 'bg-white',
    bgSurface: 'bg-[#fafafa]',
    bgSubtle: 'bg-neutral-100/60',
    bgMuted: 'bg-neutral-200/50',
    textPrimary: 'text-neutral-900',
    textSecondary: 'text-neutral-600',
    textMuted: 'text-neutral-400',
    border: 'border-neutral-200/80',
    borderStrong: 'border-neutral-300',
    accent: 'bg-amber-500 text-white',
    ring: 'ring-amber-500',
  },
  dark: {
    bgApp: 'bg-neutral-950',
    bgPanel: 'bg-neutral-900',
    bgSurface: 'bg-neutral-900',
    bgSubtle: 'bg-neutral-800/80',
    bgMuted: 'bg-neutral-800',
    textPrimary: 'text-neutral-50',
    textSecondary: 'text-neutral-300',
    textMuted: 'text-neutral-400',
    border: 'border-neutral-700/80',
    borderStrong: 'border-neutral-600',
    accent: 'bg-amber-500 text-white',
    ring: 'ring-amber-400',
  },
} as const;

/**
 * Official 8 weights supported by JetBrains Mono:
 * Thin (100), Extra Light (200), Light (300), Regular (400),
 * Medium (500), Semi Bold (600), Bold (700), Extra Bold (800)
 */
export type JetBrainsMonoFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800;

export const JETBRAINS_MONO_WEIGHT_OPTIONS: {
  weight: JetBrainsMonoFontWeight;
  label: string;
}[] = [
  { weight: 100, label: 'Thin' },
  { weight: 200, label: 'Extra Light' },
  { weight: 300, label: 'Light' },
  { weight: 400, label: 'Regular' },
  { weight: 500, label: 'Medium' },
  { weight: 600, label: 'Semi Bold' },
  { weight: 700, label: 'Bold' },
  { weight: 800, label: 'Extra Bold' },
];

export type PlayCardIconColorToken =
  | 'neutral'
  | 'slate'
  | 'amber'
  | 'emerald'
  | 'sky'
  | 'purple'
  | 'rose'
  | 'indigo'
  | 'cyan';

/**
 * Supports either a preset semantic token ('rose', 'neutral', etc.)
 * or a custom user-selected Hex / RGB color string (e.g. '#f43f5e' or 'rgb(244, 63, 94)')
 */
export type PlayCardIconColorValue = PlayCardIconColorToken | (string & {});

export const PLAY_CARD_ICON_COLOR_OPTIONS: {
  id: PlayCardIconColorToken;
  label: string;
  shortLabel: string;
  lightTextClass: string;
  darkTextClass: string;
  dotClass: string;
  hexLight: string;
  hexDark: string;
}[] = [
  {
    id: 'neutral',
    label: 'Gray',
    shortLabel: 'Gray',
    lightTextClass: 'text-neutral-500',
    darkTextClass: 'text-neutral-400',
    dotClass: 'bg-neutral-500',
    hexLight: '#737373',
    hexDark: '#a3a3a3',
  },
  {
    id: 'slate',
    label: 'Slate',
    shortLabel: 'Slate',
    lightTextClass: 'text-slate-500',
    darkTextClass: 'text-slate-400',
    dotClass: 'bg-slate-500',
    hexLight: '#64748b',
    hexDark: '#94a3b8',
  },
  {
    id: 'amber',
    label: 'Amber',
    shortLabel: 'Amber',
    lightTextClass: 'text-amber-500',
    darkTextClass: 'text-amber-500',
    dotClass: 'bg-amber-500',
    hexLight: '#f59e0b',
    hexDark: '#f59e0b',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    shortLabel: 'Emerald',
    lightTextClass: 'text-emerald-500',
    darkTextClass: 'text-emerald-500',
    dotClass: 'bg-emerald-500',
    hexLight: '#10b981',
    hexDark: '#10b981',
  },
  {
    id: 'sky',
    label: 'Sky',
    shortLabel: 'Sky',
    lightTextClass: 'text-sky-500',
    darkTextClass: 'text-sky-500',
    dotClass: 'bg-sky-500',
    hexLight: '#0ea5e9',
    hexDark: '#0ea5e9',
  },
  {
    id: 'purple',
    label: 'Purple',
    shortLabel: 'Purple',
    lightTextClass: 'text-purple-500',
    darkTextClass: 'text-purple-500',
    dotClass: 'bg-purple-500',
    hexLight: '#a855f7',
    hexDark: '#a855f7',
  },
  {
    id: 'rose',
    label: 'Rose',
    shortLabel: 'Rose',
    lightTextClass: 'text-rose-500',
    darkTextClass: 'text-rose-500',
    dotClass: 'bg-rose-500',
    hexLight: '#f43f5e',
    hexDark: '#f43f5e',
  },
  {
    id: 'indigo',
    label: 'Indigo',
    shortLabel: 'Indigo',
    lightTextClass: 'text-indigo-500',
    darkTextClass: 'text-indigo-500',
    dotClass: 'bg-indigo-500',
    hexLight: '#6366f1',
    hexDark: '#6366f1',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    shortLabel: 'Cyan',
    lightTextClass: 'text-cyan-500',
    darkTextClass: 'text-cyan-500',
    dotClass: 'bg-cyan-500',
    hexLight: '#06b6d4',
    hexDark: '#06b6d4',
  },
];

export const isCustomPlayCardColor = (val: string | undefined): boolean => {
  if (!val) return false;
  return !PLAY_CARD_ICON_COLOR_OPTIONS.some((o) => o.id === val);
};

export const resolvePlayCardIconColorClass = (
  tokenOrColor: PlayCardIconColorValue | undefined,
  isLight: boolean
): string | undefined => {
  if (!tokenOrColor) return undefined;
  const found = PLAY_CARD_ICON_COLOR_OPTIONS.find((o) => o.id === tokenOrColor);
  if (!found) return undefined;
  return isLight ? found.lightTextClass : found.darkTextClass;
};

export const resolvePlayCardIconHex = (
  tokenOrColor: PlayCardIconColorValue | undefined,
  isLight: boolean
): string => {
  if (!tokenOrColor) return '#f59e0b';
  const found = PLAY_CARD_ICON_COLOR_OPTIONS.find((o) => o.id === tokenOrColor);
  if (found) {
    return isLight ? found.hexLight : found.hexDark;
  }
  const trimmed = tokenOrColor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, Number(rgbMatch[1])));
    const g = Math.min(255, Math.max(0, Number(rgbMatch[2])));
    const b = Math.min(255, Math.max(0, Number(rgbMatch[3])));
    return (
      '#' +
      [r, g, b]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return '#f59e0b';
};

export const hexToRgbTuple = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return { r: 245, g: 158, b: 11 };
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return { r: 245, g: 158, b: 11 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

export const rgbTupleToHex = (r: number, g: number, b: number): string => {
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n || 0)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
};
