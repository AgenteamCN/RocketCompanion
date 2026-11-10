import type { KickoffKeyId } from '../stores/hudTransientTypes';

export const KICKOFF_RHYTHM_KEY_ORDER: KickoffKeyId[] = [
  'Shift',
  'Q',
  'A',
  'W',
  'S',
  'D',
  'E',
  'Boost',
  'Jump',
];

export interface KickoffSpawnPreset {
  id: string;
  index: number;
  key: string;
  shortLabel: string;
  label: string;
}

export const DEFAULT_KICKOFF_SPAWNS: KickoffSpawnPreset[] = [
  { id: 'diag-right', index: 0, key: '1', shortLabel: 'DR', label: 'Diagonal Right' },
  { id: 'diag-left', index: 1, key: '2', shortLabel: 'DL', label: 'Diagonal Left' },
  { id: 'off-right', index: 2, key: '3', shortLabel: 'OR', label: 'Off-Center Right' },
  { id: 'off-left', index: 3, key: '4', shortLabel: 'OL', label: 'Off-Center Left' },
  { id: 'center', index: 4, key: '5', shortLabel: 'C', label: 'Far Back Center' },
];

export interface KickoffNoteBar {
  key: KickoffKeyId;
  startTick: number;
  endTick: number;
}

export const DEFAULT_KICKOFF_NOTE_BARS: KickoffNoteBar[] = [
  { key: 'W', startTick: 0, endTick: 215 },
  { key: 'Boost', startTick: 0, endTick: 48 },
  { key: 'D', startTick: 8, endTick: 22 },
  { key: 'Jump', startTick: 44, endTick: 50 },
  { key: 'W', startTick: 52, endTick: 96 },
  { key: 'Q', startTick: 54, endTick: 86 },
  { key: 'Jump', startTick: 58, endTick: 64 },
  { key: 'Boost', startTick: 66, endTick: 142 },
  { key: 'Shift', startTick: 138, endTick: 158 },
  { key: 'Jump', startTick: 182, endTick: 190 },
  { key: 'E', startTick: 184, endTick: 204 },
];

export type KickoffSubMode = 'easy-learning' | 'instant' | 'realistic';
export type KickoffEpisodePhase =
  | 'countdown'
  | 'waiting-for-input'
  | 'running'
  | 'paused-mismatch'
  | 'completed';

export interface LaneMeta {
  label: string;
  subLabel: string;
  widthPx: number;
  fillHex: string;
  strokeHex: string;
  glowRgba: string;
}

export const LANE_META: Record<KickoffKeyId, LaneMeta> = {
  Shift: {
    label: 'Shift',
    subLabel: 'Slide',
    widthPx: 48,
    fillHex: 'rgba(251, 191, 36, 0.85)',
    strokeHex: '#fcd34d',
    glowRgba: 'rgba(251, 191, 36, 0.45)',
  },
  Q: {
    label: 'Q',
    subLabel: 'Roll L',
    widthPx: 40,
    fillHex: 'rgba(167, 139, 250, 0.85)',
    strokeHex: '#c4b5fd',
    glowRgba: 'rgba(167, 139, 250, 0.45)',
  },
  A: {
    label: 'A',
    subLabel: 'Left',
    widthPx: 40,
    fillHex: 'rgba(56, 189, 248, 0.85)',
    strokeHex: '#7dd3fc',
    glowRgba: 'rgba(56, 189, 248, 0.45)',
  },
  W: {
    label: 'W',
    subLabel: 'Fwd',
    widthPx: 40,
    fillHex: 'rgba(52, 211, 153, 0.90)',
    strokeHex: '#6ee7b7',
    glowRgba: 'rgba(52, 211, 153, 0.50)',
  },
  S: {
    label: 'S',
    subLabel: 'Back',
    widthPx: 40,
    fillHex: 'rgba(251, 113, 133, 0.85)',
    strokeHex: '#fda4af',
    glowRgba: 'rgba(251, 113, 133, 0.45)',
  },
  D: {
    label: 'D',
    subLabel: 'Right',
    widthPx: 40,
    fillHex: 'rgba(56, 189, 248, 0.85)',
    strokeHex: '#7dd3fc',
    glowRgba: 'rgba(56, 189, 248, 0.45)',
  },
  E: {
    label: 'E',
    subLabel: 'Roll R',
    widthPx: 40,
    fillHex: 'rgba(167, 139, 250, 0.85)',
    strokeHex: '#c4b5fd',
    glowRgba: 'rgba(167, 139, 250, 0.45)',
  },
  Boost: {
    label: 'Boost',
    subLabel: 'Nitro',
    widthPx: 52,
    fillHex: 'rgba(251, 146, 60, 0.90)',
    strokeHex: '#fdba74',
    glowRgba: 'rgba(251, 146, 60, 0.50)',
  },
  Jump: {
    label: 'Jump',
    subLabel: 'Flip',
    widthPx: 52,
    fillHex: 'rgba(34, 211, 238, 0.90)',
    strokeHex: '#a5f3fc',
    glowRgba: 'rgba(34, 211, 238, 0.60)',
  },
};

export const LANE_GAP_PX = 6;
export const HIGHWAY_PAD_X = 8;
export const HIGHWAY_HEIGHT_PX = 144;
export const TOTAL_HIGHWAY_WIDTH_PX =
  HIGHWAY_PAD_X * 2 +
  KICKOFF_RHYTHM_KEY_ORDER.reduce((acc, k) => acc + LANE_META[k].widthPx, 0) +
  LANE_GAP_PX * (KICKOFF_RHYTHM_KEY_ORDER.length - 1);

export function paintKickoffHighway(
  ctx: CanvasRenderingContext2D,
  tick: number,
  noteBars: KickoffNoteBar[],
  lookaheadTicks: number,
  isLight: boolean
): void {
  const w = TOTAL_HIGHWAY_WIDTH_PX;
  const h = HIGHWAY_HEIGHT_PX;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (const frac of [0.25, 0.5, 0.75]) {
    const y = Math.round(h * (1 - frac)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  let cursorX = HIGHWAY_PAD_X;
  for (let i = 0; i < KICKOFF_RHYTHM_KEY_ORDER.length; i++) {
    const keyName = KICKOFF_RHYTHM_KEY_ORDER[i];
    const meta = LANE_META[keyName];
    const laneW = meta.widthPx;

    ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.03)' : 'rgba(255, 255, 255, 0.015)';
    ctx.fillRect(cursorX, 0, laneW, h);
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.09)' : 'rgba(255, 255, 255, 0.045)';
    ctx.strokeRect(cursorX + 0.5, 0, laneW - 1, h);

    for (let bIdx = 0; bIdx < noteBars.length; bIdx++) {
      const bar = noteBars[bIdx];
      if (
        bar.key !== keyName ||
        bar.endTick <= tick ||
        bar.startTick >= tick + lookaheadTicks
      ) {
        continue;
      }
      const visibleStart = Math.max(bar.startTick, tick);
      const visibleEnd = Math.min(bar.endTick, tick + lookaheadTicks);
      const bottomRatio = (visibleStart - tick) / lookaheadTicks;
      const heightRatio = Math.max(0.04, (visibleEnd - visibleStart) / lookaheadTicks);

      const barH = Math.max(5, heightRatio * h);
      const barY = h - bottomRatio * h - barH;
      const isHittingNow = bar.startTick <= tick && bar.endTick > tick;

      ctx.fillStyle = meta.fillHex;
      ctx.strokeStyle = isHittingNow
        ? isLight
          ? '#0f172a'
          : '#ffffff'
        : meta.strokeHex;
      ctx.lineWidth = isHittingNow ? 1.5 : 1;

      const bx = cursorX + 4;
      const bw = laneW - 8;
      ctx.beginPath();
      ctx.roundRect(bx, barY, bw, barH, 3);
      ctx.fill();
      ctx.stroke();
    }

    cursorX += laneW + LANE_GAP_PX;
  }

  ctx.fillStyle = isLight ? 'rgba(2, 132, 199, 0.85)' : 'rgba(56, 189, 248, 0.85)';
  ctx.fillRect(0, h - 2, w, 2);
}

export function applyKickoffReceptorRowState(
  keyBoxRefs: Record<KickoffKeyId, HTMLDivElement | null>,
  keyDotRefs: Record<KickoffKeyId, HTMLSpanElement | null>,
  reqMap: Partial<Record<KickoffKeyId, boolean>> | undefined,
  playMap: Partial<Record<KickoffKeyId, boolean>> | undefined,
  isLight: boolean
): void {
  for (let i = 0; i < KICKOFF_RHYTHM_KEY_ORDER.length; i++) {
    const k = KICKOFF_RHYTHM_KEY_ORDER[i];
    const box = keyBoxRefs[k];
    const dot = keyDotRefs[k];
    if (!box) continue;

    const aiActive = Boolean(reqMap?.[k]);
    const playerActive = Boolean(playMap?.[k]);
    const stateKey = `${aiActive ? 1 : 0}-${playerActive ? 1 : 0}-${isLight ? 1 : 0}`;
    if (box.dataset.stateKey !== stateKey) {
      box.dataset.stateKey = stateKey;
      if (aiActive && playerActive) {
        box.style.borderColor = '#10b981';
        box.style.backgroundColor = isLight
          ? 'rgba(16, 185, 129, 0.25)'
          : 'rgba(16, 185, 129, 0.35)';
        box.style.boxShadow = '0 0 0 1px rgba(52, 211, 153, 0.55)';
      } else if (aiActive && !playerActive) {
        box.style.borderColor = LANE_META[k].strokeHex;
        box.style.backgroundColor = isLight
          ? 'rgba(14, 165, 233, 0.2)'
          : 'rgba(56, 189, 248, 0.22)';
        box.style.boxShadow = `0 0 0 1px ${LANE_META[k].strokeHex}`;
      } else if (!aiActive && playerActive) {
        box.style.borderColor = '#f59e0b';
        box.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
        box.style.boxShadow = '0 0 0 1px rgba(251, 191, 36, 0.55)';
      } else {
        box.style.borderColor = '';
        box.style.backgroundColor = '';
        box.style.boxShadow = '';
      }
    }

    if (dot) {
      dot.style.display = playerActive ? 'block' : 'none';
      dot.style.backgroundColor = aiActive ? '#34d399' : '#fbbf24';
    }
  }
}
