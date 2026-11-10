import { create } from 'zustand';
import { syncBridge } from './syncBridge';
import {
  type JetBrainsMonoFontWeight,
  type PlayCardIconColorToken,
  type PlayCardIconColorValue,
} from '../tokens/colors';

/**
 * Three core visual archetypes for L2 Play Menu Cards:
 * 1. 'icon-badge-top': Row 1 [Left Icon + Right Badge] -> Row 2 [Title] -> Row 3 [Description]
 * 2. 'icon-title-inline': Row 1 [Left Icon + Right Title (No Badge)] -> Row 2 [Description]
 * 3. 'mono-giant-watermark': Large JetBrains Mono title + Giant background watermark icon (~30% opacity)
 */
export type PlayCardStyleVariant =
  | 'icon-badge-top'
  | 'icon-title-inline'
  | 'mono-giant-watermark';

export type InlineHeaderLayoutMode = 'left-pack' | 'space-between';

export type MonoTitleAnchor =
  | 'center-left'
  | 'bottom-left'
  | 'top-left'
  | 'center'
  | 'bottom-right';

export type WatermarkAnchor =
  | 'right-center'
  | 'bottom-right'
  | 'center'
  | 'top-right'
  | 'bottom-left';

export type WatermarkColorMode = 'mode-accent' | 'amber' | 'neutral';

export type PlayModeCardId =
  | 'exhibition'
  | 'host-match'
  | 'join-room'
  | 'self-training'
  | 'host-training'
  | 'advanced';

export const DEFAULT_CARD_ICON_COLORS: Record<PlayModeCardId, PlayCardIconColorValue> = {
  'exhibition': 'rose',
  'host-match': 'neutral',
  'join-room': 'emerald',
  'self-training': 'amber',
  'host-training': 'sky',
  'advanced': 'purple',
};

export interface PlayCardStyleParams {
  /** Active card style variant applied to L2 Play Menu & Preview */
  variant: PlayCardStyleVariant;

  // ── Shared Card Container Geometry ──
  cardPaddingXPx: number;
  cardPaddingYPx: number;
  cardMinHeightPx: number;
  cardRadiusPx: number;
  gridGapPx: number;

  // ── Style 1 & Style 2 Shared Foreground Icon & Text Parameters ──
  iconSizePx: number;
  iconStrokeWidth: number;
  showIconBox: boolean;
  iconBoxPaddingPx: number;
  iconBoxRadiusPx: number;
  titleFontSizePx: number;
  titleFontWeight: JetBrainsMonoFontWeight;
  titleUseMonoFont: boolean;
  style1TopRowMarginBottomPx: number;
  style1TitleMarginBottomPx: number;
  descFontSizePx: number;
  descLineHeight: number;
  descLineClamp: 0 | 1 | 2 | 3;

  // ── Style 2 ('icon-title-inline') Specific Parameters ──
  inlineHeaderLayout: InlineHeaderLayoutMode;
  inlineIconTitleGapPx: number;
  inlineHeaderMarginBottomPx: number;

  // ── Style 3 ('mono-giant-watermark') Specific Parameters ──
  monoTitleSizePx: number;
  monoTitleWeight: JetBrainsMonoFontWeight;
  monoLetterSpacingEm: number;
  monoLineHeight: number;
  monoUppercase: boolean;
  monoTitleAnchor: MonoTitleAnchor;
  monoShowDescription: boolean;
  monoShowBadge: boolean;
  watermarkSizePx: number;
  watermarkOpacityPct: number;
  watermarkHoverOpacityPct: number;
  watermarkStrokeWidth: number;
  watermarkAnchor: WatermarkAnchor;
  watermarkOffsetXPx: number;
  watermarkOffsetYPx: number;
  watermarkRotateDeg: number;
  watermarkHoverScale: number;
  watermarkColorMode: WatermarkColorMode;

  // ── Per-Option Independent Icon Colors (Preset Token or Custom RGB/Hex) ──
  cardIconColors: Record<PlayModeCardId, PlayCardIconColorValue>;
}

export const PLAY_CARD_STYLE_CONFIG: PlayCardStyleParams = {
  variant: 'mono-giant-watermark',
  cardPaddingXPx: 14,
  cardPaddingYPx: 14,
  cardMinHeightPx: 96,
  cardRadiusPx: 12,
  gridGapPx: 12,
  iconSizePx: 20,
  iconStrokeWidth: 2,
  showIconBox: false,
  iconBoxPaddingPx: 8,
  iconBoxRadiusPx: 8,
  titleFontSizePx: 15,
  titleFontWeight: 700,
  titleUseMonoFont: false,
  style1TopRowMarginBottomPx: 10,
  style1TitleMarginBottomPx: 4,
  descFontSizePx: 12,
  descLineHeight: 1.5,
  descLineClamp: 2,
  inlineHeaderLayout: 'left-pack',
  inlineIconTitleGapPx: 8,
  inlineHeaderMarginBottomPx: 6,
  monoTitleSizePx: 19,
  monoTitleWeight: 800,
  monoLetterSpacingEm: -0.02,
  monoLineHeight: 1.15,
  monoUppercase: false,
  monoTitleAnchor: 'center-left',
  monoShowDescription: false,
  monoShowBadge: false,
  watermarkSizePx: 92,
  watermarkOpacityPct: 30,
  watermarkHoverOpacityPct: 48,
  watermarkStrokeWidth: 1.5,
  watermarkAnchor: 'bottom-right',
  watermarkOffsetXPx: 2,
  watermarkOffsetYPx: 0,
  watermarkRotateDeg: -14,
  watermarkHoverScale: 1.08,
  watermarkColorMode: 'mode-accent',
  cardIconColors: {
    'exhibition': 'rose',
    'host-match': 'neutral',
    'join-room': 'emerald',
    'self-training': 'amber',
    'host-training': 'sky',
    'advanced': 'purple',
  },
};

export const DEFAULT_PLAY_CARD_STYLE_PARAMS: PlayCardStyleParams = PLAY_CARD_STYLE_CONFIG;

export interface PlayCardStylePreset {
  id: string;
  label: string;
  subtitle: string;
  params: Partial<PlayCardStyleParams>;
}

export const PLAY_CARD_STYLE_PRESETS: PlayCardStylePreset[] = [
  {
    id: 'preset-style3-calibrated-default',
    label: 'Style 3 (Default) · JetBrains Mono Extra Bold + Bottom-Right 30% Watermark Icon',
    subtitle: '96px height · 19px Extra Bold middle-left aligned · Bottom-right -14 deg 92px watermark icon',
    params: {
      ...PLAY_CARD_STYLE_CONFIG,
      cardIconColors: { ...DEFAULT_CARD_ICON_COLORS },
    },
  },
  {
    id: 'preset-style3-mono-regular',
    label: 'Style 3B · JetBrains Mono Regular Title + Center-Right 30% Watermark Icon',
    subtitle: 'JetBrains Mono Regular weight with a center-right 30% opacity tilted background watermark icon',
    params: {
      variant: 'mono-giant-watermark',
      cardPaddingXPx: 16,
      cardPaddingYPx: 16,
      cardMinHeightPx: 108,
      monoTitleSizePx: 20,
      monoTitleWeight: 400,
      monoLetterSpacingEm: -0.02,
      monoLineHeight: 1.2,
      monoUppercase: false,
      monoTitleAnchor: 'center-left',
      monoShowDescription: false,
      monoShowBadge: false,
      watermarkSizePx: 92,
      watermarkOpacityPct: 30,
      watermarkHoverOpacityPct: 48,
      watermarkStrokeWidth: 1.5,
      watermarkAnchor: 'right-center',
      watermarkOffsetXPx: 8,
      watermarkOffsetYPx: 0,
      watermarkRotateDeg: -10,
      watermarkHoverScale: 1.08,
      watermarkColorMode: 'mode-accent',
    },
  },
  {
    id: 'preset-style3-mono-centered',
    label: 'Style 3C · Centered Large Title + Center 30% Giant Watermark Icon',
    subtitle: 'Co-axial centered title and 30% opacity oversized icon watermark',
    params: {
      variant: 'mono-giant-watermark',
      cardPaddingXPx: 16,
      cardPaddingYPx: 16,
      cardMinHeightPx: 112,
      monoTitleSizePx: 20,
      monoTitleWeight: 600,
      monoLetterSpacingEm: 0,
      monoLineHeight: 1.15,
      monoUppercase: true,
      monoTitleAnchor: 'center',
      monoShowDescription: false,
      monoShowBadge: false,
      watermarkSizePx: 96,
      watermarkOpacityPct: 30,
      watermarkHoverOpacityPct: 45,
      watermarkStrokeWidth: 1.4,
      watermarkAnchor: 'center',
      watermarkOffsetXPx: 0,
      watermarkOffsetYPx: 0,
      watermarkRotateDeg: 0,
      watermarkHoverScale: 1.1,
      watermarkColorMode: 'mode-accent',
    },
  },
  {
    id: 'preset-style2-inline-clean',
    label: 'Style 2A · Top Inline Bare Icon + Title (No Badge)',
    subtitle: 'No icon box or badge; compact top row with left icon and right title above description',
    params: {
      variant: 'icon-title-inline',
      cardPaddingXPx: 14,
      cardPaddingYPx: 14,
      cardMinHeightPx: 96,
      showIconBox: false,
      iconSizePx: 20,
      inlineHeaderLayout: 'left-pack',
      inlineIconTitleGapPx: 8,
      inlineHeaderMarginBottomPx: 6,
      titleFontSizePx: 15,
      titleFontWeight: 700,
      titleUseMonoFont: false,
      descFontSizePx: 12,
      descLineClamp: 2,
    },
  },
  {
    id: 'preset-style2-inline-boxed',
    label: 'Style 2B · Top Framed Icon + Title (No Badge)',
    subtitle: 'Top row with framed left icon and right title without badge, description below',
    params: {
      variant: 'icon-title-inline',
      cardPaddingXPx: 14,
      cardPaddingYPx: 14,
      cardMinHeightPx: 104,
      showIconBox: true,
      iconSizePx: 18,
      iconBoxPaddingPx: 7,
      inlineHeaderLayout: 'left-pack',
      inlineIconTitleGapPx: 10,
      inlineHeaderMarginBottomPx: 8,
      titleFontSizePx: 14,
      titleFontWeight: 700,
      titleUseMonoFont: false,
      descFontSizePx: 12,
      descLineClamp: 2,
    },
  },
  {
    id: 'preset-style1-classic',
    label: 'Style 1 · Classic Four-Part Card (Icon+Badge / Title / Description)',
    subtitle: 'Top row with left icon and right badge, followed by title and description',
    params: {
      variant: 'icon-badge-top',
      cardPaddingXPx: 14,
      cardPaddingYPx: 14,
      cardMinHeightPx: 112,
      showIconBox: true,
      iconSizePx: 20,
      titleFontSizePx: 14,
      titleFontWeight: 700,
      titleUseMonoFont: false,
      descFontSizePx: 12,
      descLineClamp: 2,
    },
  },
];

interface PlayCardStyleStore extends PlayCardStyleParams {
  setParam: <K extends keyof PlayCardStyleParams>(key: K, value: PlayCardStyleParams[K]) => void;
  setVariant: (variant: PlayCardStyleVariant) => void;
  setCardIconColor: (cardId: PlayModeCardId, color: PlayCardIconColorValue) => void;
  applyPreset: (params: Partial<PlayCardStyleParams>) => void;
  resetParams: () => void;
  exportConfigCode: () => string;
}

const SYNC_KEY = 'store:playCardStyle:v3';

let isApplyingRemote = false;

export const usePlayCardStyleStore = create<PlayCardStyleStore>((set, get) => {
  const initialSnapshot = syncBridge.get<Partial<PlayCardStyleParams>>(
    SYNC_KEY,
    DEFAULT_PLAY_CARD_STYLE_PARAMS
  );
  const mergedInitial: PlayCardStyleParams = {
    ...DEFAULT_PLAY_CARD_STYLE_PARAMS,
    ...(initialSnapshot || {}),
    cardIconColors: {
      ...DEFAULT_CARD_ICON_COLORS,
      ...(initialSnapshot?.cardIconColors || {}),
    },
  };

  const broadcastState = (state: PlayCardStyleStore) => {
    if (isApplyingRemote) return;
    const payload: Partial<PlayCardStyleParams> = {};
    (Object.keys(DEFAULT_PLAY_CARD_STYLE_PARAMS) as (keyof PlayCardStyleParams)[]).forEach((k) => {
      (payload as Record<string, unknown>)[k] = state[k];
    });
    syncBridge.set(SYNC_KEY, payload);
  };

  return {
    ...mergedInitial,
    setParam: (key, value) => {
      set({ [key]: value } as Partial<PlayCardStyleStore>);
      broadcastState(get());
    },
    setVariant: (variant) => {
      set({ variant });
      broadcastState(get());
    },
    setCardIconColor: (cardId, color) => {
      set((prev) => ({
        cardIconColors: {
          ...prev.cardIconColors,
          [cardId]: color,
        },
      }));
      broadcastState(get());
    },
    applyPreset: (params) => {
      set((prev) => ({
        ...prev,
        ...params,
        cardIconColors: {
          ...prev.cardIconColors,
          ...(params.cardIconColors || {}),
        },
      }));
      broadcastState(get());
    },
    resetParams: () => {
      set({
        ...DEFAULT_PLAY_CARD_STYLE_PARAMS,
        cardIconColors: { ...DEFAULT_CARD_ICON_COLORS },
      });
      broadcastState(get());
    },
    exportConfigCode: () => {
      const s = get();
      const exported: Record<string, unknown> = {};
      (Object.keys(DEFAULT_PLAY_CARD_STYLE_PARAMS) as (keyof PlayCardStyleParams)[]).forEach((k) => {
        exported[k] = s[k];
      });
      return `// L2 PlayModeCard Style Configuration (stores/playCardStyleStore.ts)\nexport const PLAY_CARD_STYLE_CONFIG: PlayCardStyleParams = ${JSON.stringify(
        exported,
        null,
        2
      )};`;
    },
  };
});

syncBridge.registerDefault(SYNC_KEY, DEFAULT_PLAY_CARD_STYLE_PARAMS);

syncBridge.subscribeKey<Partial<PlayCardStyleParams>>(SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  isApplyingRemote = true;
  try {
    usePlayCardStyleStore.setState((prev) => ({
      ...prev,
      ...remote,
      cardIconColors: {
        ...prev.cardIconColors,
        ...(remote.cardIconColors || {}),
      },
    }));
  } finally {
    isApplyingRemote = false;
  }
});
