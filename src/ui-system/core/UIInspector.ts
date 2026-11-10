/**
 * UIInspector.ts
 * Real-time layout metrics, DOM hierarchy snapshot and diagnostic inspection engine.
 *
 * Provides functions to inspect DOM element bounding rects, computed styles,
 * padding, margin, font sizes and flex/grid parameters. Supports copying directly
 * to clipboard and printing clean human-readable diagnostic text to console.
 */

import { ViewportMetrics } from '../../ui-core/stores/viewportStore.ts';

export interface InspectorSnapshotOptions {
  route: string;
  theme?: 'dark' | 'light';
  safeAreaMargin?: number;
  renderScale?: number;
  metrics?: ViewportMetrics;
}

function getPadStr(cs: CSSStyleDeclaration): string {
  return `top=${cs.paddingTop} right=${cs.paddingRight} bottom=${cs.paddingBottom} left=${cs.paddingLeft}`;
}

function getMarginStr(cs: CSSStyleDeclaration): string {
  return `top=${cs.marginTop} right=${cs.marginRight} bottom=${cs.marginBottom} left=${cs.marginLeft}`;
}

function getRectStr(rect: DOMRect): string {
  return `${Math.round(rect.width * 10) / 10}px × ${Math.round(rect.height * 10) / 10}px (x: ${Math.round(rect.x)}, y: ${Math.round(rect.y)})`;
}

/**
 * Capture detailed layout snapshot of the current active menu window
 * Returns formatted text report and optionally writes to clipboard.
 */
export function generateLayoutReport(routeLabel = 'ACTIVE_MENU'): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'Window / Document unavailable';
  }

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  const shellEl =
    document.querySelector<HTMLElement>(
      '[data-ui-element="menu-shell"], [data-morph-container="true"]'
    ) ||
    document.querySelector<HTMLElement>(
      '[data-ui-element="edge-inspector-drawer"], [data-panel="container"]'
    );
  const headerEl = shellEl
    ? shellEl.querySelector<HTMLElement>('[data-ui-element="panel-header"]')
    : null;
  const tabsEl = shellEl ? shellEl.querySelector<HTMLElement>('[role="tablist"]') : null;
  const tabButtons = tabsEl ? Array.from(tabsEl.querySelectorAll<HTMLElement>('[role="tab"]')) : [];
  const contentEl = shellEl
    ? shellEl.querySelector<HTMLElement>('[data-ui-element="panel-content"]')
    : null;
  const footerEl = shellEl
    ? shellEl.querySelector<HTMLElement>('[data-ui-element="panel-footer"]')
    : null;
  const cards = shellEl
    ? Array.from(
        shellEl.querySelectorAll<HTMLElement>(
          'button[data-ui-element="car-card"], [data-ui-element="car-card"], [data-ui-element="card"], .grid button'
        )
      )
    : [];
  const colorItems = shellEl
    ? Array.from(
        shellEl.querySelectorAll<HTMLElement>(
          '[data-ui-element="color-order-item"], .grid .rounded-lg'
        )
      )
    : [];

  const lines: string[] = [];
  lines.push('========================================================================');
  lines.push(` [UI STORYBOOK SNAPSHOT] ROUTE: [${routeLabel.toUpperCase()}]`);
  lines.push('========================================================================');
  lines.push(`• Window Viewport: ${winW}px × ${winH}px`);

  if (shellEl) {
    const sRect = shellEl.getBoundingClientRect();
    const sCs = window.getComputedStyle(shellEl);
    const componentName = shellEl.getAttribute('data-component') || '';
    const sourcePath = shellEl.getAttribute('data-source-path') || '';
    lines.push('\n[1. MENU CONTAINER (OUTER SHELL)]');
    if (componentName) lines.push(`  • Component:    ${componentName}`);
    if (sourcePath) lines.push(`  • Source Path:  ${sourcePath}`);
    lines.push(`  • Size:         ${getRectStr(sRect)}`);
    lines.push(`  • Inline/CSS W: ${shellEl.style.width || sCs.width} (Max-W: ${sCs.maxWidth})`);
    lines.push(`  • Padding:      ${getPadStr(sCs)}`);
    lines.push(`  • Overflow:     ${sCs.overflow}`);
  } else {
    lines.push('\n[1. MENU CONTAINER]: NOT FOUND');
  }

  if (headerEl) {
    const hRect = headerEl.getBoundingClientRect();
    const hCs = window.getComputedStyle(headerEl);
    lines.push('\n[2. PANEL HEADER]');
    lines.push(`  • Size:         ${getRectStr(hRect)}`);
    lines.push(`  • Padding:      ${getPadStr(hCs)}`);
    lines.push(`  • Title:        "${headerEl.querySelector('h2')?.textContent?.trim() || ''}"`);
  }

  if (tabsEl) {
    const tRect = tabsEl.getBoundingClientRect();
    const tCs = window.getComputedStyle(tabsEl);
    lines.push('\n[3. UNDERLINE TABS (NAVIGATION HEADER)]');
    lines.push(`  • Tablist Size: ${getRectStr(tRect)}`);
    lines.push(`  • Tablist Pad:  ${getPadStr(tCs)}`);
    lines.push(`  • Tab Count:    ${tabButtons.length} tab(s)`);
    tabButtons.forEach((btn, idx) => {
      const bRect = btn.getBoundingClientRect();
      const bCs = window.getComputedStyle(btn);
      const isSelected = btn.getAttribute('aria-selected') === 'true';
      const label = btn.textContent?.trim() || `Tab ${idx + 1}`;
      lines.push(`    [Tab #${idx + 1}] "${label}" (Active: ${isSelected})`);
      lines.push(
        `      Size: ${getRectStr(bRect)} | Padding: ${getPadStr(bCs)} | Margin: ${getMarginStr(bCs)}`
      );
    });
  }

  if (contentEl) {
    const cRect = contentEl.getBoundingClientRect();
    const cCs = window.getComputedStyle(contentEl);
    lines.push('\n[4. PANEL CONTENT (BODY)]');
    lines.push(`  • Size:         ${getRectStr(cRect)}`);
    lines.push(
      `  • Scroll Size:  scrollWidth=${contentEl.scrollWidth}px, scrollHeight=${contentEl.scrollHeight}px`
    );
    lines.push(`  • Padding:      ${getPadStr(cCs)}`);
    lines.push(`  • Overflow:     X=${cCs.overflowX}, Y=${cCs.overflowY}`);
    lines.push(`  • Max-Height:   ${cCs.maxHeight}`);
  }

  if (cards.length > 0) {
    lines.push(`\n[5. CAR / OPTION CARDS (${cards.length} items)]`);
    cards.slice(0, 8).forEach((card, idx) => {
      const cdRect = card.getBoundingClientRect();
      const cdCs = window.getComputedStyle(card);
      const title = card.querySelector('span')?.textContent?.trim() || `Card ${idx + 1}`;
      lines.push(
        `    [Card #${idx + 1}] "${title}": ${getRectStr(cdRect)} | Pad: ${getPadStr(cdCs)}`
      );
    });
  }

  if (colorItems.length > 0) {
    lines.push(`\n[6. COLOR PALETTE ITEMS (${colorItems.length} items)]`);
    colorItems.slice(0, 12).forEach((item, idx) => {
      const itemRect = item.getBoundingClientRect();
      const itemCs = window.getComputedStyle(item);
      const text = item.textContent?.replace(/\s+/g, ' ').trim() || `Color ${idx + 1}`;
      lines.push(
        `    [Color #${idx + 1}] "${text}": ${getRectStr(itemRect)} | Pad: ${getPadStr(itemCs)}`
      );
    });
  }

  if (footerEl) {
    const fRect = footerEl.getBoundingClientRect();
    const fCs = window.getComputedStyle(footerEl);
    lines.push('\n[7. PANEL FOOTER]');
    lines.push(`  • Size:         ${getRectStr(fRect)}`);
    lines.push(`  • Padding:      ${getPadStr(fCs)}`);
    lines.push(`  • Content:      "${footerEl.textContent?.replace(/\s+/g, ' ').trim() || ''}"`);
  }

  const floatingWindows = Array.from(
    document.querySelectorAll<HTMLElement>('[data-ui-element="floating-window"]')
  );
  if (floatingWindows.length > 0) {
    lines.push(`\n[8. FLOATING WINDOWS (${floatingWindows.length} open)]`);
    floatingWindows.forEach((fw, idx) => {
      const fwRect = fw.getBoundingClientRect();
      const winId = fw.getAttribute('data-window-id') || `window-${idx + 1}`;
      const comp = fw.getAttribute('data-component') || 'UnknownComponent';
      const srcPath = fw.getAttribute('data-source-path') || '';
      lines.push(`    [Window #${idx + 1}] id="${winId}" component=${comp}`);
      if (srcPath) lines.push(`      Source Path: ${srcPath}`);
      lines.push(`      Size:        ${getRectStr(fwRect)}`);
    });
  }

  lines.push('========================================================================\n');
  return lines.join('\n');
}

/**
 * Trigger export: logs formatted text to console and copies to clipboard if available.
 */
export async function copyAndLogLayoutSnapshot(routeLabel = 'ACTIVE_MENU'): Promise<string> {
  const report = generateLayoutReport(routeLabel);
  console.log(report);

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(report);
    } catch (e) {
      console.warn('[UI Inspector] Clipboard copy failed:', e);
    }
  }

  return report;
}

export function logMenuSwitchInspection(options: InspectorSnapshotOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  requestAnimationFrame(() => {
    try {
      const report = generateLayoutReport(options.route);
      console.log(report);
    } catch (err) {
      console.error('[UI Inspector] Error computing layout metrics:', err);
    }
  });
}

if (typeof window !== 'undefined') {
  (window as any).exportLayoutSnapshot = (routeLabel?: string) =>
    copyAndLogLayoutSnapshot(routeLabel);
}
