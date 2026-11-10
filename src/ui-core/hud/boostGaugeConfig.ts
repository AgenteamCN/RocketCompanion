export type BoostColorScheme = 'classic-4' | 'step-12';
export type BoostColorMode = 'standard' | 'inverted' | 'ring-only';
export type BoostThemeOverride = 'auto' | 'dark' | 'light';

export interface BoostSegmentColorInfo {
  color: string;
  segmentName:
    | 'black'
    | 'red-flash'
    | 'red'
    | 'orange'
    | 'yellow'
    | 'lime'
    | 'green'
    | 'emerald'
    | 'sky';
  rangeLabel: string;
  isFlashing: boolean;
  tierIndex: number;
}

const STEP_12_TIERS: (BoostSegmentColorInfo & { maxVal: number })[] = [
  { maxVal: 11, color: '#18181b', segmentName: 'black', rangeLabel: '0-11 (Empty · Black)', isFlashing: false, tierIndex: 0 },
  { maxVal: 23, color: '#ef4444', segmentName: 'red-flash', rangeLabel: '12-23 (Critical · Red Flash)', isFlashing: true, tierIndex: 1 },
  { maxVal: 35, color: '#ef4444', segmentName: 'red', rangeLabel: '24-35 (Low · Red)', isFlashing: false, tierIndex: 2 },
  { maxVal: 47, color: '#f97316', segmentName: 'orange', rangeLabel: '36-47 (Low-Mid · Orange)', isFlashing: false, tierIndex: 3 },
  { maxVal: 59, color: '#eab308', segmentName: 'yellow', rangeLabel: '48-59 (Medium · Yellow)', isFlashing: false, tierIndex: 4 },
  { maxVal: 71, color: '#84cc16', segmentName: 'lime', rangeLabel: '60-71 (Good · Lime)', isFlashing: false, tierIndex: 5 },
  { maxVal: 83, color: '#22c55e', segmentName: 'green', rangeLabel: '72-83 (High · Green)', isFlashing: false, tierIndex: 6 },
  { maxVal: 96, color: '#10b981', segmentName: 'emerald', rangeLabel: '84-96 (Near Full · Emerald)', isFlashing: false, tierIndex: 7 },
  { maxVal: 100, color: '#0ea5e9', segmentName: 'sky', rangeLabel: '97-100 (Full · Sky)', isFlashing: false, tierIndex: 8 },
];

const CLASSIC_4_TIERS: (BoostSegmentColorInfo & { maxVal: number })[] = [
  { maxVal: 24, color: '#ef4444', segmentName: 'red', rangeLabel: '0-24 (Critical · Red)', isFlashing: false, tierIndex: 0 },
  { maxVal: 60, color: '#f59e0b', segmentName: 'yellow', rangeLabel: '25-60 (Caution · Yellow)', isFlashing: false, tierIndex: 1 },
  { maxVal: 96, color: '#10b981', segmentName: 'green', rangeLabel: '61-96 (Sufficient · Green)', isFlashing: false, tierIndex: 2 },
  { maxVal: 100, color: '#0ea5e9', segmentName: 'sky', rangeLabel: '97-100 (Full · Sky)', isFlashing: false, tierIndex: 3 },
];

export const getBoostSegmentColor = (
  amount: number,
  colorScheme: BoostColorScheme = 'classic-4'
): BoostSegmentColorInfo => {
  const val = Math.max(0, Math.min(100, Math.round(amount)));
  const table = colorScheme === 'step-12' ? STEP_12_TIERS : CLASSIC_4_TIERS;
  const found = table.find((t) => val <= t.maxVal) ?? table[table.length - 1];
  const { maxVal: _m, ...info } = found;
  return info;
};

export const STEP_12_TIER_PRESETS: {
  val: number;
  range: string;
  label: string;
  hex: string;
  isFlashing?: boolean;
}[] = [
  { val: 6, range: '0~11', label: 'Black (Tier 0)', hex: '#18181b' },
  { val: 18, range: '12~23', label: 'Red Flash (Tier 1)', hex: '#ef4444', isFlashing: true },
  { val: 30, range: '24~35', label: 'Red (Tier 2)', hex: '#ef4444' },
  { val: 42, range: '36~47', label: 'Orange (Tier 3)', hex: '#f97316' },
  { val: 54, range: '48~59', label: 'Yellow (Tier 4)', hex: '#eab308' },
  { val: 66, range: '60~71', label: 'Lime (Tier 5)', hex: '#84cc16' },
  { val: 78, range: '72~83', label: 'Green (Tier 6)', hex: '#22c55e' },
  { val: 90, range: '84~96', label: 'Emerald (Tier 7)', hex: '#10b981' },
  { val: 100, range: '97~100', label: 'Sky Blue (Full)', hex: '#0ea5e9' },
];

export interface BoostVisualColors {
  dialBg: string;
  dialBorder: string;
  innerDiscFill: string;
  innerDiscStroke: string;
  trackStroke: string;
  arcStroke: string;
  readoutColor: string;
  labelColor: string;
  flashDial: boolean;
  flashArcAndText: boolean;
}

export function resolveBoostVisualColors(
  seg: BoostSegmentColorInfo,
  colorMode: BoostColorMode,
  effectiveIsLight: boolean,
  fixedTextColor: string
): BoostVisualColors {
  const tierColorForStrokeOrText =
    !effectiveIsLight && seg.segmentName === 'black' ? '#52525b' : seg.color;

  if (colorMode === 'inverted') {
    const isLightFixedText =
      fixedTextColor.toUpperCase() === '#FFFFFF' ||
      fixedTextColor.toUpperCase() === '#F8FAFC' ||
      fixedTextColor.toUpperCase() === '#FDE047';
    return {
      dialBg: 'transparent',
      dialBorder: 'transparent',
      innerDiscFill: seg.color,
      innerDiscStroke: isLightFixedText
        ? 'rgba(0, 0, 0, 0.28)'
        : 'rgba(255, 255, 255, 0.28)',
      trackStroke: 'transparent',
      arcStroke: seg.color,
      readoutColor: fixedTextColor,
      labelColor: isLightFixedText
        ? 'rgba(255, 255, 255, 0.82)'
        : 'rgba(9, 9, 11, 0.75)',
      flashDial: seg.isFlashing,
      flashArcAndText: seg.isFlashing,
    };
  }

  const stdDialBg = effectiveIsLight
    ? 'rgba(255, 255, 255, 0.92)'
    : 'rgba(9, 9, 11, 0.88)';
  const stdDialBorder = effectiveIsLight
    ? 'rgba(212, 212, 216, 0.85)'
    : 'rgba(39, 39, 42, 0.85)';
  const stdTrackStroke = effectiveIsLight ? '#e5e5e5' : '#262626';
  const stdLabelColor = effectiveIsLight ? '#737373' : '#a3a3a3';

  if (colorMode === 'ring-only') {
    return {
      dialBg: stdDialBg,
      dialBorder: stdDialBorder,
      innerDiscFill: 'transparent',
      innerDiscStroke: 'transparent',
      trackStroke: stdTrackStroke,
      arcStroke: tierColorForStrokeOrText,
      readoutColor: fixedTextColor || (effectiveIsLight ? '#09090B' : '#FFFFFF'),
      labelColor: stdLabelColor,
      flashDial: false,
      flashArcAndText: seg.isFlashing,
    };
  }

  return {
    dialBg: stdDialBg,
    dialBorder: stdDialBorder,
    innerDiscFill: 'transparent',
    innerDiscStroke: 'transparent',
    trackStroke: stdTrackStroke,
    arcStroke: tierColorForStrokeOrText,
    readoutColor: tierColorForStrokeOrText,
    labelColor: stdLabelColor,
    flashDial: false,
    flashArcAndText: seg.isFlashing,
  };
}
