import {
  type EdgeDemoIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type EdgePlayerSlotState,
} from '../stores/hudTransientTypes';
import {
  SKIP_ICON_VARIANT_PATHS,
  buildSvgDropShadowFilter,
} from '../primitives/svg/packagedSvgDefinitions';

export const KEY_BADGE_WIDTH_PX = 28;
export const DEMO_EXTEND_PX = 10;
export const CARD_ROW_PITCH_PX = 45;
export const MAX_TEAM_SLOTS = 5;

export function computeSlotRanksForRoster(
  list: EdgePlayerSlotState[],
  slotIndex: number,
  isLiveRightCompact: boolean
): { existingRank: number; demoVisualRank: number } {
  let existingRankCounter = 0;
  let existingRank = slotIndex;
  for (let i = 0; i <= slotIndex; i++) {
    const s = list[i];
    if (s && s.exists !== false) {
      if (i === slotIndex) existingRank = existingRankCounter;
      existingRankCounter++;
    }
  }
  let demoVisualRank = existingRank;
  if (isLiveRightCompact) {
    const demoIndices: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s && s.exists !== false && s.isDemolished) demoIndices.push(i);
    }
    demoIndices.sort((a, b) => {
      const tA = list[a]?.demolishedAtMs ?? 0;
      const tB = list[b]?.demolishedAtMs ?? 0;
      if (tA > 0 && tB > 0 && tA !== tB) return tA - tB;
      const remA = list[a]?.demoRespawnRemainingSec ?? 3.0;
      const remB = list[b]?.demoRespawnRemainingSec ?? 3.0;
      return Math.abs(remA - remB) > 0.001 ? remA - remB : a - b;
    });
    const foundDemoRank = demoIndices.indexOf(slotIndex);
    if (foundDemoRank >= 0) demoVisualRank = foundDemoRank;
  }
  return { existingRank, demoVisualRank };
}

export function updateSkipBadgeDom(
  skipClipWrapEl: HTMLDivElement | null,
  skipBadgeEl: HTMLDivElement | null,
  side: 'left' | 'right',
  isLight: boolean,
  slot: EdgePlayerSlotState,
  resolvedSkipCfg: EdgeSkipIndicatorConfig
): void {
  const showSkipReady = Boolean(slot.replaySkipReady);
  const underlapPx = Math.max(0, Math.round(resolvedSkipCfg.underlapPx ?? 20));
  const protrudeWidthPx = Math.max(20, Math.round(resolvedSkipCfg.protrudeWidthPx ?? 34));
  const cardRadiusPx = Math.max(0, Math.round(resolvedSkipCfg.cardRadiusPx ?? 9));
  const iconOffsetXPx = Number(resolvedSkipCfg.iconOffsetXPx ?? 0);
  const iconOffsetYPx = Number(resolvedSkipCfg.iconOffsetYPx ?? -1);
  const enterMs = Math.max(0, Math.round(resolvedSkipCfg.enterDurationMs ?? 220));
  const exitMs = Math.max(0, Math.round(resolvedSkipCfg.exitDurationMs ?? 160));

  if (skipClipWrapEl) {
    skipClipWrapEl.style.marginLeft = side === 'left' ? `-${underlapPx}px` : '0px';
    skipClipWrapEl.style.marginRight = side === 'right' ? `-${underlapPx}px` : '0px';
    skipClipWrapEl.style.clipPath =
      side === 'left' ? 'inset(-4px -18px -4px 0px)' : 'inset(-4px 0px -4px -18px)';
  }
  if (!skipBadgeEl) return;
  skipBadgeEl.style.display = 'flex';
  skipBadgeEl.style.width = `${underlapPx + protrudeWidthPx}px`;
  skipBadgeEl.style.height = '37px';
  skipBadgeEl.style.paddingLeft = side === 'left' ? `${underlapPx}px` : '0px';
  skipBadgeEl.style.paddingRight = side === 'right' ? `${underlapPx}px` : '0px';
  skipBadgeEl.style.borderRadius =
    side === 'left'
      ? `0px ${cardRadiusPx}px ${cardRadiusPx}px 0px`
      : `${cardRadiusPx}px 0px 0px ${cardRadiusPx}px`;
  skipBadgeEl.style.backgroundColor = isLight
    ? 'rgba(255, 255, 255, 0.98)'
    : 'rgba(20, 20, 25, 0.98)';
  const innerLine = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)';
  const outerRing = isLight ? 'rgba(115, 115, 115, 0.32)' : 'rgba(113, 113, 122, 0.55)';
  const outerSideInset =
    side === 'left' ? `inset -1px 0 0 0 ${innerLine}` : `inset 1px 0 0 0 ${innerLine}`;
  skipBadgeEl.style.boxShadow = `0 0 0 1.5px ${outerRing}, ${outerSideInset}, inset 0 1px 0 0 ${innerLine}, inset 0 -1px 0 0 ${innerLine}`;
  skipBadgeEl.style.transitionDuration = `${showSkipReady ? enterMs : exitMs}ms`;
  skipBadgeEl.style.transform = showSkipReady
    ? 'translate3d(0%, 0, 0)'
    : side === 'left'
    ? 'translate3d(-112%, 0, 0)'
    : 'translate3d(112%, 0, 0)';
  skipBadgeEl.style.pointerEvents = showSkipReady ? 'auto' : 'none';

  const skipSvgEl = skipBadgeEl.querySelector('svg');
  if (!skipSvgEl) return;
  const effectiveVariant = slot.skipIndicatorVariant ?? resolvedSkipCfg.variant ?? 'check';
  const effectiveColor = slot.skipIndicatorColor ?? resolvedSkipCfg.color ?? '#10B981';
  const effectiveGlowColor =
    slot.skipIndicatorColor ?? resolvedSkipCfg.glowColor ?? effectiveColor;
  const pxVal = resolvedSkipCfg.sizePx || 24;
  const sz = `${pxVal}px`;
  const skipGlow = buildSvgDropShadowFilter(
    effectiveGlowColor,
    resolvedSkipCfg.glowBlurPx,
    resolvedSkipCfg.glowIntensityPct
  );
  skipSvgEl.setAttribute('width', String(pxVal));
  skipSvgEl.setAttribute('height', String(pxVal));
  skipSvgEl.style.width = sz;
  skipSvgEl.style.height = sz;
  skipSvgEl.style.color = effectiveColor;
  skipSvgEl.style.filter = skipGlow !== 'none' ? skipGlow : 'none';
  skipSvgEl.style.transform =
    iconOffsetXPx !== 0 || iconOffsetYPx !== 0
      ? `translate3d(${iconOffsetXPx}px, ${iconOffsetYPx}px, 0)`
      : 'none';
  const pathD = SKIP_ICON_VARIANT_PATHS[effectiveVariant] ?? SKIP_ICON_VARIANT_PATHS.check;
  skipSvgEl.querySelectorAll('path').forEach((p) => {
    p.setAttribute('d', pathD);
    p.setAttribute('stroke-width', String(resolvedSkipCfg.strokeWidth || 2.0));
    p.setAttribute('stroke', 'currentColor');
  });
}

export function updateDemolishedReadoutDom(
  isDemo: boolean,
  clampedBoost: number,
  resolvedDemoCfg: EdgeDemoIndicatorConfig,
  boostTextEl: HTMLSpanElement | null,
  demoCrossEl: HTMLSpanElement | null,
  demoBombWrapEl: HTMLSpanElement | null
): void {
  if (!boostTextEl || !demoCrossEl || !demoBombWrapEl) return;

  if (isDemo) {
    boostTextEl.style.display = 'none';
    const glowFilter = buildSvgDropShadowFilter(
      resolvedDemoCfg.glowColor || resolvedDemoCfg.color,
      resolvedDemoCfg.glowBlurPx,
      resolvedDemoCfg.glowIntensityPct
    );
    if (resolvedDemoCfg.variant === 'bomb-svg') {
      demoCrossEl.style.display = 'none';
      demoBombWrapEl.style.display = 'inline-flex';
      demoBombWrapEl.style.color = resolvedDemoCfg.color;
      demoBombWrapEl.style.filter = glowFilter ?? 'none';
      const svgEl = demoBombWrapEl.querySelector('svg');
      if (svgEl) {
        const pxVal = resolvedDemoCfg.sizePx || 16;
        svgEl.setAttribute('width', String(pxVal));
        svgEl.setAttribute('height', String(pxVal));
        svgEl.style.width = `${pxVal}px`;
        svgEl.style.height = `${pxVal}px`;
        svgEl.querySelectorAll('path').forEach((p) => {
          p.setAttribute('stroke-width', String(resolvedDemoCfg.strokeWidth || 1.9));
          p.setAttribute('stroke', resolvedDemoCfg.color || '#EF4444');
        });
      }
    } else {
      demoBombWrapEl.style.display = 'none';
      demoCrossEl.style.display = 'inline-flex';
      demoCrossEl.style.color = resolvedDemoCfg.color || '#EF4444';
      demoCrossEl.style.fontSize = `${Math.max(10, resolvedDemoCfg.sizePx || 16)}px`;
      demoCrossEl.style.filter = glowFilter ?? 'none';
    }
  } else {
    boostTextEl.style.display = 'inline-block';
    demoCrossEl.style.display = 'none';
    demoBombWrapEl.style.display = 'none';
    const nextBoostStr = String(clampedBoost);
    if (boostTextEl.textContent !== nextBoostStr) boostTextEl.textContent = nextBoostStr;
  }
}

export function mergeRosterSidePlayers<T extends EdgePlayerSlotState[]>(
  baseSidePlayers: T,
  overridePlayers?: EdgePlayerSlotState[]
): T {
  if (!overridePlayers || overridePlayers.length === 0) {
    return baseSidePlayers;
  }
  const merged = [...baseSidePlayers] as T;
  for (let i = 0; i < overridePlayers.length; i++) {
    merged[i] = overridePlayers[i];
  }
  return merged;
}

export function updateSlotCardSurfaceAndBarDom(params: {
  rowWrapEl: HTMLDivElement;
  cardEl: HTMLDivElement;
  keyBadgeEl: HTMLDivElement | null;
  barTrackEl: HTMLDivElement | null;
  barFillEl: HTMLDivElement | null;
  slot: EdgePlayerSlotState;
  side: 'left' | 'right';
  isLight: boolean;
  teamColor: string;
  barColor: string;
  isReplayOrSpec: boolean;
  existingRank: number;
  visualRowIndex: number;
  resolvedDemoCfg: EdgeDemoIndicatorConfig;
  clampedBoost: number;
}): void {
  const {
    rowWrapEl,
    cardEl,
    keyBadgeEl,
    barTrackEl,
    barFillEl,
    slot,
    side,
    isLight,
    teamColor,
    barColor,
    isReplayOrSpec,
    existingRank,
    visualRowIndex,
    resolvedDemoCfg,
    clampedBoost,
  } = params;

  const isDemo = Boolean(slot.isDemolished);
  const isFocused = Boolean(slot.isFocusedPov);
  const showSkipReady = Boolean(slot.replaySkipReady);

  if (side === 'left') {
    const baseOffsetPx = isReplayOrSpec ? 0 : -KEY_BADGE_WIDTH_PX;
    const demoOffsetPx = !isReplayOrSpec && isDemo ? DEMO_EXTEND_PX : 0;
    rowWrapEl.style.transform = `translate3d(${baseOffsetPx + demoOffsetPx}px, 0px, 0)`;
    rowWrapEl.style.opacity = '1';
  } else if (!isReplayOrSpec) {
    if (isDemo || showSkipReady) {
      const targetX = isDemo ? KEY_BADGE_WIDTH_PX - DEMO_EXTEND_PX : KEY_BADGE_WIDTH_PX;
      const deltaY = isDemo ? (visualRowIndex - existingRank) * CARD_ROW_PITCH_PX : 0;
      rowWrapEl.style.transform = `translate3d(${targetX}px, ${deltaY}px, 0)`;
      rowWrapEl.style.opacity = '1';
    } else {
      rowWrapEl.style.transform = 'translate3d(105%, 0px, 0)';
      rowWrapEl.style.opacity = '0';
    }
  } else {
    rowWrapEl.style.transform = 'translate3d(0px, 0px, 0)';
    rowWrapEl.style.opacity = '1';
  }

  if (isDemo) {
    cardEl.style.backgroundColor = '#3F3F46';
    cardEl.style.color = '#D4D4D8';
    const borderHex = resolvedDemoCfg.color || '#EF4444';
    cardEl.style.boxShadow = `0 0 0 1px ${borderHex}, inset 0 0 0 1px ${borderHex}BF`;
  } else if (isFocused) {
    cardEl.style.backgroundColor = teamColor;
    cardEl.style.color = '#FFFFFF';
    cardEl.style.boxShadow = `0 0 0 2px ${teamColor}66, inset 0 0 0 1px rgba(255,255,255,0.32)`;
  } else {
    cardEl.style.backgroundColor = isLight
      ? 'rgba(255, 255, 255, 0.98)'
      : 'rgba(20, 20, 25, 0.98)';
    cardEl.style.color = isLight ? '#09090B' : '#F4F4F5';
    cardEl.style.boxShadow = isLight
      ? '0 0 0 2px rgba(115, 115, 115, 0.22), inset 0 0 0 1px rgba(0, 0, 0, 0.14)'
      : '0 0 0 2px rgba(0, 0, 0, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.14)';
  }

  if (keyBadgeEl) {
    const slotKeyStr = String(slot.slotKey);
    if (keyBadgeEl.textContent !== slotKeyStr) keyBadgeEl.textContent = slotKeyStr;
    keyBadgeEl.style.opacity = isReplayOrSpec ? '1' : '0';
    keyBadgeEl.style.borderColor = isReplayOrSpec ? 'rgba(0, 0, 0, 0.10)' : 'transparent';
    if (!isReplayOrSpec) {
      keyBadgeEl.style.backgroundColor = 'transparent';
    } else if (isDemo) {
      keyBadgeEl.style.backgroundColor = 'rgba(239, 68, 68, 0.22)';
      keyBadgeEl.style.color = '#FCA5A5';
    } else if (isFocused) {
      keyBadgeEl.style.backgroundColor = 'rgba(0, 0, 0, 0.25)';
      keyBadgeEl.style.color = '#FFFFFF';
    } else {
      keyBadgeEl.style.backgroundColor = isLight
        ? 'rgba(0, 0, 0, 0.07)'
        : 'rgba(255, 255, 255, 0.08)';
      keyBadgeEl.style.color = isLight ? '#52525B' : '#A1A1AA';
    }
  }

  if (barTrackEl && barFillEl) {
    if (isDemo) {
      barTrackEl.style.backgroundColor = '#27272A';
      const totalSec = Math.max(0.1, slot.demoRespawnTotalSec ?? 3.0);
      const remaining = Math.max(0, Math.min(totalSec, slot.demoRespawnRemainingSec ?? totalSec));
      const ratio = remaining / totalSec;
      barFillEl.style.backgroundColor =
        remaining > (totalSec * 2) / 3
          ? '#FFFFFF'
          : remaining > totalSec / 3
          ? '#FFD60A'
          : '#EF4444';
      barFillEl.style.transform = `scaleX(${ratio.toFixed(4)})`;
    } else {
      barTrackEl.style.backgroundColor = isLight ? '#E4E4E7' : '#09090B';
      barFillEl.style.backgroundColor = isFocused ? '#FFFFFF' : barColor;
      barFillEl.style.transform = `scaleX(${(clampedBoost / 100).toFixed(4)})`;
    }
  }
}
