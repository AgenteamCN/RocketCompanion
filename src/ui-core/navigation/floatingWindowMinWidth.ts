/**
 * Pure, zero-reflow minimum-width resolver for Floating Windows.
 *
 * Designed with zero Layout Thrashing (no DOM style writes, no `querySelectorAll('*')` loops):
 * 1. Trusts the static preset `fallbackMinWidth` from `floatingPresets.ts` as the baseline.
 * 2. Performs a single O(1) read-only check on the top-level stage container (`scrollWidth` vs `clientWidth`)
 *    without mutating inline styles or forcing synchronous browser reflows.
 * 3. Reserves vertical scrollbar gutter space (`SCROLLBAR_GUTTER_RESERVE_PX = 16`) for resizable windows.
 */

export const SCROLLBAR_GUTTER_RESERVE_PX = 16;
export const WINDOW_BORDER_RESERVE_PX = 2;

export interface MinWidthMeasurementOptions {
  /** Whether the floating window is resizable (if true, reserves 16px for vertical scrollbar) */
  isResizable: boolean;
  /** Baseline fallback minWidth from preset configuration (integer px) */
  fallbackMinWidth: number;
  /** Visibility tier ('user' | 'developer') */
  tier?: 'user' | 'developer';
  /** Optional custom upper ceiling for probe width (defaults to 560 for developer, 600 for user) */
  maxProbeWidth?: number;
}

export interface MinWidthMeasurementResult {
  /** Exact minimum inner content width (integer px) */
  innerMinWidth: number;
  /** Reserved width (integer px) for vertical scrollbar when height is shrunk */
  scrollbarReservePx: number;
  /** Total window minWidth (integer px) = innerMinWidth + scrollbarReservePx + borderReservePx */
  totalMinWidth: number;
}

/**
 * Computes the minimum width of a floating window's content stage in O(1) time
 * with zero DOM style mutations and zero forced synchronous layout reflows.
 */
export function measureIntrinsicMinWidth(
  innerEl: HTMLElement | null | undefined,
  options: MinWidthMeasurementOptions
): MinWidthMeasurementResult {
  const scrollbarReservePx = options.isResizable ? SCROLLBAR_GUTTER_RESERVE_PX : 0;
  const fallbackTotal = Math.round(options.fallbackMinWidth);
  const fallbackInner = Math.max(
    240,
    fallbackTotal - scrollbarReservePx - WINDOW_BORDER_RESERVE_PX
  );

  if (typeof window === 'undefined' || !innerEl || innerEl.clientWidth <= 0) {
    return {
      innerMinWidth: fallbackInner,
      scrollbarReservePx,
      totalMinWidth: fallbackTotal,
    };
  }

  const maxCeilingInner =
    options.maxProbeWidth ?? (options.tier === 'developer' ? 560 : 600);

  const rootChild =
    innerEl.children.length === 1 && innerEl.firstElementChild
      ? (innerEl.firstElementChild as HTMLElement)
      : innerEl;

  // Single read-only pass on top-level container scrollWidth (zero style writes, zero layout thrashing)
  const currentClientW = innerEl.clientWidth;
  const currentScrollW = Math.max(innerEl.scrollWidth, rootChild.scrollWidth);
  const overflowDelta = Math.max(0, currentScrollW - currentClientW);

  const innerMinWidth = Math.min(
    maxCeilingInner,
    Math.max(
      fallbackInner,
      overflowDelta > 0 ? Math.ceil(currentClientW + overflowDelta) : fallbackInner
    )
  );

  const computedTotal = innerMinWidth + scrollbarReservePx + WINDOW_BORDER_RESERVE_PX;
  const totalMinWidth = Math.max(fallbackTotal, computedTotal);

  return {
    innerMinWidth,
    scrollbarReservePx,
    totalMinWidth,
  };
}
