/**
 * Pure, zero-coupling Adaptive Intrinsic Measurement & Canvas Clamping Engine for Menu Panels (L4 Navigation).
 *
 * Migrates the 3-stage adaptive architecture from 6D Floating Windows (`FloatingWindowManager`,
 * `floatingWindowMinWidth`, `floatingWindowGeometry`) to 7A Menu Layer (`PanelContainer`):
 * 1. Intrinsic Content Height Detection (`measureNaturalElementHeight`)
 * 2. Intrinsic Minimum-Width Probing (`measureMenuPanelIntrinsicDimensions`)
 * 3. Canvas Boundary Clamping & Dual-State Memory (`resolveClampedMenuPanelGeometry`)
 */

import type { PanelSizingConfig } from '../tokens/menuLayoutTokens';
import type { ContainerBounds } from './floatingWindowGeometry';
import {
  measureIntrinsicMinWidth,
  SCROLLBAR_GUTTER_RESERVE_PX,
} from './floatingWindowMinWidth';
import {
  getExplicitVerticalMargin,
  getVerticalPaddingAndBorder,
  measureChromeMinWidth,
  measureTabEnvelopeMinWidth,
} from './menuPanelIntrinsicDomMeasurer';

export type MenuPanelWidthAdaptiveMode = 'design-auto-expand' | 'intrinsic-min';

export interface MenuPanelIntrinsicMetrics {
  /** Exact natural non-scrolling total height of the menu panel (integer px) */
  intrinsicHeight: number;
  /** Exact minimum non-truncating, non-wrapping width of the menu panel incl. 16px scrollbar reserve (integer px) */
  autoMinWidth: number;
  /** Minimum width required by the content stage alone incl. scrollbar reserve (integer px) */
  contentMinWidth: number;
  /** Minimum width required by the header + tabs bars (integer px) */
  chromeMinWidth: number;
  /** Vertical scrollbar gutter reserved in autoMinWidth (integer px, default 16px) */
  scrollbarReservePx: number;
}

export interface ClampedMenuPanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  desiredWidth: number;
  desiredHeight: number;
  effectiveMinWidth: number;
  autoMinWidth: number;
  intrinsicHeight: number;
  scrollbarReservePx: number;
  isWidthSqueezed: boolean;
  isHeightSqueezed: boolean;
  modeLabel: string;
}

/**
 * Measures the natural un-stretched height of a flex/grid container's children
 * without being fooled by `flex-1` stretching, `mt-auto`, or `justify-between` empty space.
 */
export function measureNaturalElementHeight(el: HTMLElement, depth = 0): number {
  if (typeof window === 'undefined') return el.offsetHeight;
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return 0;

  const padBorderY = getVerticalPaddingAndBorder(style);
  const visibleChildren: HTMLElement[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i] as HTMLElement;
    const cStyle = window.getComputedStyle(child);
    if (
      cStyle.display === 'none' ||
      cStyle.position === 'absolute' ||
      cStyle.position === 'fixed'
    ) {
      continue;
    }
    visibleChildren.push(child);
  }

  if (visibleChildren.length === 0) {
    return Math.max(el.getBoundingClientRect().height, el.scrollHeight);
  }

  // Multi-column CSS Grid (e.g. Layer 4 .RCSPack Browser 12-col split view or Layer 2 Play 3-col grid)
  if (style.display === 'grid') {
    if (el.getAttribute('data-tab-envelope-grid') === 'true') {
      let maxTabH = 0;
      for (let i = 0; i < el.children.length; i++) {
        const tabWrapper = el.children[i] as HTMLElement;
        if (tabWrapper.getAttribute('data-envelope-exclude') === 'true') {
          continue;
        }
        const inner = tabWrapper.firstElementChild as HTMLElement | null;
        const rawTabH = inner
          ? measureNaturalElementHeight(inner, depth + 1)
          : tabWrapper.scrollHeight;
        const effectiveTabH = Math.min(rawTabH, 360);
        if (effectiveTabH > maxTabH) {
          maxTabH = effectiveTabH;
        }
      }
      if (maxTabH > 0) {
        el.style.setProperty('--tab-envelope-h', `${Math.floor(maxTabH)}px`);
        return padBorderY + maxTabH;
      }
    }

    const cols = style.gridTemplateColumns
      ? style.gridTemplateColumns.trim().split(/\s+/).length
      : 1;
    const isStretchedSplitGrid =
      depth <= 2 &&
      (parseFloat(style.flexGrow) > 0 || el.classList.contains('grow')) &&
      visibleChildren.length === 2 &&
      cols >= 2;

    if (isStretchedSplitGrid) {
      let maxColH = 0;
      for (const col of visibleChildren) {
        const colStyle = window.getComputedStyle(col);
        const colH =
          measureNaturalElementHeight(col, depth + 1) +
          getExplicitVerticalMargin(col, colStyle);
        if (colH > maxColH) maxColH = colH;
      }
      return padBorderY + maxColH;
    }

    // Standard auto-sizing grid (e.g. PlayModeCard grid):
    return el.getBoundingClientRect().height;
  }

  const gapY = parseFloat(style.rowGap) || parseFloat(style.gap) || 0;
  let sumChildrenH = 0;

  for (const child of visibleChildren) {
    const cStyle = window.getComputedStyle(child);
    const marginY = getExplicitVerticalMargin(child, cStyle);
    const isFlexStretched =
      child.getAttribute('data-tab-envelope-grid') === 'true' ||
      parseFloat(cStyle.flexGrow) > 0 ||
      child.classList.contains('grow') ||
      child.classList.contains('flex-1') ||
      cStyle.overflowY === 'auto' ||
      cStyle.overflowY === 'scroll';

    if (depth < 3 && isFlexStretched && child.children.length > 0) {
      sumChildrenH += measureNaturalElementHeight(child, depth + 1) + marginY;
    } else {
      sumChildrenH += child.getBoundingClientRect().height + marginY;
    }
  }

  sumChildrenH += Math.max(0, visibleChildren.length - 1) * gapY;
  return padBorderY + sumChildrenH;
}

/**
 * Synchronously measures both the natural non-scrolling height (`intrinsicHeight`) and
 * minimum non-truncating width (`autoMinWidth` + `16px` scrollbar reserve) of a rendered Menu Panel.
 */
export function measureMenuPanelIntrinsicDimensions(
  panelEl: HTMLElement,
  options?: {
    fallbackMinWidth?: number;
    tier?: 'user' | 'developer';
    measureWidth?: boolean;
  }
): MenuPanelIntrinsicMetrics {
  const fallbackMinW = Math.round(options?.fallbackMinWidth ?? 360);
  if (typeof window === 'undefined') {
    return {
      intrinsicHeight: 420,
      autoMinWidth: fallbackMinW,
      contentMinWidth: fallbackMinW,
      chromeMinWidth: 320,
      scrollbarReservePx: SCROLLBAR_GUTTER_RESERVE_PX,
    };
  }

  let totalH = 2; // +2px for top & bottom 1px outer border
  let contentEl: HTMLElement | null = null;

  for (let i = 0; i < panelEl.children.length; i++) {
    const child = panelEl.children[i] as HTMLElement;
    const cStyle = window.getComputedStyle(child);
    if (
      cStyle.display === 'none' ||
      cStyle.position === 'absolute' ||
      cStyle.position === 'fixed'
    ) {
      continue;
    }
    const marginY = getExplicitVerticalMargin(child, cStyle);
    if (child.getAttribute('data-panel-section') === 'content') {
      contentEl = child;
      totalH += measureNaturalElementHeight(child, 0) + marginY;
    } else {
      totalH += child.getBoundingClientRect().height + marginY;
    }
  }

  const intrinsicHeight = Math.max(120, Math.round(totalH));
  const chromeMinWidth = measureChromeMinWidth(panelEl);

  if (options?.measureWidth === false || !contentEl || contentEl.clientWidth <= 0) {
    const envelopeMinW = contentEl ? measureTabEnvelopeMinWidth(contentEl) : 0;
    const autoMinW = Math.max(fallbackMinW, chromeMinWidth, envelopeMinW);
    return {
      intrinsicHeight,
      autoMinWidth: autoMinW,
      contentMinWidth: Math.max(fallbackMinW, envelopeMinW),
      chromeMinWidth,
      scrollbarReservePx: SCROLLBAR_GUTTER_RESERVE_PX,
    };
  }

  const envelopeMinW = measureTabEnvelopeMinWidth(contentEl);
  const widthResult = measureIntrinsicMinWidth(contentEl, {
    isResizable: true,
    fallbackMinWidth: Math.max(Math.min(fallbackMinW, 340), envelopeMinW),
    tier: options?.tier,
    maxProbeWidth: 680,
  });

  const effectiveContentMinW = Math.max(widthResult.totalMinWidth, envelopeMinW);
  const autoMinWidth = Math.round(
    Math.max(chromeMinWidth, effectiveContentMinW)
  );

  return {
    intrinsicHeight,
    autoMinWidth,
    contentMinWidth: effectiveContentMinW,
    chromeMinWidth,
    scrollbarReservePx: widthResult.scrollbarReservePx,
  };
}

/**
 * Pure spatial constraint solver for 7A Menu Layer panels (with Dual-State Memory).
 */
export function resolveClampedMenuPanelGeometry(params: {
  sizing: PanelSizingConfig;
  intrinsicHeight?: number;
  autoMinWidth?: number;
  manualMinWidth?: number;
  widthMode?: MenuPanelWidthAdaptiveMode;
  stageBounds: ContainerBounds;
  margin?: number;
}): ClampedMenuPanelGeometry {
  const margin = params.margin ?? 16;
  const { sizing, stageBounds } = params;
  const widthMode = params.widthMode ?? 'design-auto-expand';

  const autoMinW = Math.round(
    params.autoMinWidth ?? Math.min(sizing.width, 400)
  );
  const effectiveMinWidth =
    params.manualMinWidth !== undefined && Number.isFinite(params.manualMinWidth)
      ? Math.max(260, Math.round(params.manualMinWidth))
      : autoMinW;

  const desiredWidth =
    params.manualMinWidth !== undefined || widthMode === 'intrinsic-min'
      ? effectiveMinWidth
      : Math.max(Math.round(sizing.width), effectiveMinWidth);

  const naturalH = Math.round(params.intrinsicHeight ?? sizing.targetHeight);
  const desiredHeight =
    sizing.mode === 'fixed'
      ? Math.round(sizing.targetHeight)
      : Math.max(
          Math.round(sizing.minHeight),
          Math.min(naturalH, Math.round(sizing.maxHeight))
        );

  const availW = Math.max(260, Math.floor(stageBounds.width - margin * 2));
  const availH = Math.max(180, Math.floor(stageBounds.height - margin * 2));

  const width = Math.min(desiredWidth, availW);
  const height = Math.min(desiredHeight, availH);

  const x = Math.max(margin, Math.round((stageBounds.width - width) / 2));
  const y = Math.max(margin, Math.round((stageBounds.height - height) / 2));

  const isWidthSqueezed = width < desiredWidth - 1;
  const isHeightSqueezed = height < naturalH - 2;

  const squeezeTag =
    isWidthSqueezed || isHeightSqueezed ? ' · Canvas-Squeezed' : '';
  const modeTag =
    sizing.mode === 'fixed'
      ? 'Fixed'
      : widthMode === 'intrinsic-min'
      ? 'Intrinsic Auto-Fit'
      : 'Auto-Fit';

  return {
    x,
    y,
    width,
    height,
    desiredWidth,
    desiredHeight,
    effectiveMinWidth,
    autoMinWidth: autoMinW,
    intrinsicHeight: naturalH,
    scrollbarReservePx: SCROLLBAR_GUTTER_RESERVE_PX,
    isWidthSqueezed,
    isHeightSqueezed,
    modeLabel: `${width}×${height}px (${modeTag}${squeezeTag})`,
  };
}
