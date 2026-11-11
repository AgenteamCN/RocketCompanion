import type { EdgeDrawerSide } from '../../../ui-core/navigation/EdgeInspectorDrawer';

export interface EdgeInspectorLayoutSnapshotParams {
  isDrawerExpanded: boolean;
  isInspectingShot: boolean;
  drawerSide: EdgeDrawerSide;
  topOffset: number;
  bottomOffset: number;
  showToast: (msg: string) => void;
}

export async function exportEdgeInspectorLayoutSnapshot({
  isDrawerExpanded,
  isInspectingShot,
  drawerSide,
  topOffset,
  bottomOffset,
  showToast,
}: EdgeInspectorLayoutSnapshotParams): Promise<void> {
  const stageEl = document.getElementById('edge-inspector-simulation-stage');
  if (!stageEl) return;

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const fmtRect = (r: DOMRect) =>
    `${r1(r.width)}px × ${r1(r.height)}px (x: ${r1(r.x)}, y: ${r1(r.y)})`;
  const fmtPad = (cs: CSSStyleDeclaration) =>
    `top=${cs.paddingTop} right=${cs.paddingRight} bottom=${cs.paddingBottom} left=${cs.paddingLeft}`;

  const drawerEl = stageEl.querySelector<HTMLElement>('[data-ui-element="edge-inspector-drawer"]');
  const headerEl = stageEl.querySelector<HTMLElement>('[data-ui-element="panel-header"]');
  const contentEl = stageEl.querySelector<HTMLElement>('[data-ui-element="panel-content"]');
  const footerEl = stageEl.querySelector<HTMLElement>('[data-ui-element="panel-footer"]');
  const railContainerEl = stageEl.querySelector<HTMLElement>('[data-rail-section="left-container"]');
  const topToolbarEl = stageEl.querySelector<HTMLElement>('[data-rail-section="top-toolbar"]');
  const plusBtnEl = stageEl.querySelector<HTMLElement>('[data-rail-button="new-shot"]');
  const helpBtnEl = stageEl.querySelector<HTMLElement>('[data-rail-button="show-help"]');
  const scrollListEl = stageEl.querySelector<HTMLElement>('[data-rail-section="scroll-list"]');
  const firstItemEl = stageEl.querySelector<HTMLElement>('[data-rail-item="0"]');
  const firstBadgeEl = stageEl.querySelector<HTMLElement>('[data-rail-badge="0"]');
  const detailWrapperEl = stageEl.querySelector<HTMLElement>('[data-rail-section="detail-wrapper"]');
  const detailScrollEl = stageEl.querySelector<HTMLElement>('[data-rail-section="detail-scroll"]');

  const lines: string[] = [];
  lines.push('========================================================================');
  lines.push(
    ` [EDGE INSPECTOR SNAPSHOT] STATE: [DRAWER=${isDrawerExpanded ? 'EXPANDED' : 'COLLAPSED'}] [VIEW=${isInspectingShot ? 'RAIL_EDIT_SHOT' : 'FULL_SHOT_LIST'}]`
  );
  lines.push('========================================================================');

  if (drawerEl) {
    const dRect = drawerEl.getBoundingClientRect();
    const dCs = window.getComputedStyle(drawerEl);
    lines.push('\n[1. EDGE INSPECTOR DRAWER (OUTER SHELL)]');
    lines.push(`  • Size:          ${fmtRect(dRect)}`);
    lines.push(`  • Side / ZIndex: side=${drawerSide} | zIndex=${dCs.zIndex}`);
    lines.push(`  • Offsets:       topOffset=${topOffset}px | bottomOffset=${bottomOffset}px`);
  }

  if (headerEl) {
    const hRect = headerEl.getBoundingClientRect();
    const hCs = window.getComputedStyle(headerEl);
    const collapseBtn = headerEl.querySelector<HTMLButtonElement>(
      '[data-header-button="collapse-tab"]'
    );
    lines.push('\n[2. PANEL HEADER]');
    lines.push(`  • Size:          ${fmtRect(hRect)}`);
    lines.push(`  • Padding:       ${fmtPad(hCs)}`);
    if (collapseBtn) {
      const cbRect = collapseBtn.getBoundingClientRect();
      const topGap = r1(cbRect.top - hRect.top);
      const rightGap = r1(hRect.right - cbRect.right);
      const bottomGap = r1(hRect.bottom - cbRect.bottom);
      lines.push(
        `  • Collapse Btn:  ${fmtRect(cbRect)} | Header Insets: top=${topGap}px right=${rightGap}px bottom=${bottomGap}px`
      );
      const tabKbd = collapseBtn.querySelector<HTMLElement>('[data-component="keycap-badge"]');
      if (tabKbd) {
        const kRect = tabKbd.getBoundingClientRect();
        const kTop = r1(kRect.top - cbRect.top);
        const kRight = r1(cbRect.right - kRect.right);
        const kBottom = r1(cbRect.bottom - kRect.bottom);
        lines.push(
          `  • TAB Keycap:    ${fmtRect(kRect)} | 3-Side Gap (Btn Border -> TAB Border): top=${kTop}px right=${kRight}px bottom=${kBottom}px`
        );
      }
    }
  }

  if (contentEl && drawerEl) {
    const cRect = contentEl.getBoundingClientRect();
    const dRect = drawerEl.getBoundingClientRect();
    const cCs = window.getComputedStyle(contentEl);
    lines.push('\n[3. PANEL CONTENT]');
    lines.push(`  • Size:          ${fmtRect(cRect)}`);
    lines.push(`  • Padding:       ${fmtPad(cCs)}`);
    if (railContainerEl) {
      const rRect = railContainerEl.getBoundingClientRect();
      const leftOuterGap = r1(rRect.left - dRect.left);
      const rightTargetEl =
        isInspectingShot && detailWrapperEl ? detailWrapperEl : railContainerEl;
      const rtRect = rightTargetEl.getBoundingClientRect();
      const rightOuterGap = r1(dRect.right - rtRect.right);
      lines.push(
        `  • Outer Insets:  leftEdgeToContent=${leftOuterGap}px | rightContentToRightEdge=${rightOuterGap}px`
      );
    }
  }

  if (railContainerEl) {
    const rRect = railContainerEl.getBoundingClientRect();
    lines.push('\n[4. LEFT RAIL / SHOT LIST CONTAINER]');
    lines.push(`  • Container:     ${fmtRect(rRect)}`);
    if (scrollListEl) {
      lines.push(
        `  • Scroll List:   clientWidth=${scrollListEl.clientWidth}px | offsetWidth=${scrollListEl.offsetWidth}px | scrollbarWidth=${scrollListEl.offsetWidth - scrollListEl.clientWidth}px`
      );
    }
    if (topToolbarEl && plusBtnEl && helpBtnEl) {
      const tRect = topToolbarEl.getBoundingClientRect();
      const pRect = plusBtnEl.getBoundingClientRect();
      const qRect = helpBtnEl.getBoundingClientRect();
      const pCs = window.getComputedStyle(plusBtnEl);
      const qCs = window.getComputedStyle(helpBtnEl);
      lines.push(
        `  • Row 1 Toolbar: ${fmtRect(tRect)} | Left(+)=${r1(pRect.width)}×${r1(pRect.height)}px (padX=${pCs.paddingLeft}/${pCs.paddingRight}) | Right(?)=${r1(qRect.width)}×${r1(qRect.height)}px (padX=${qCs.paddingLeft}/${qCs.paddingRight}) | Gap=${r1(qRect.left - pRect.right)}px`
      );
      lines.push(
        `  • Row 1 Align:   leftInset=${r1(pRect.left - rRect.left)}px | rightInset=${r1(rRect.right - qRect.right)}px`
      );
    }
    if (firstItemEl && firstBadgeEl) {
      const cardRect = firstItemEl.getBoundingClientRect();
      const badgeRect = firstBadgeEl.getBoundingClientRect();
      const topGap = r1(badgeRect.top - cardRect.top);
      const bottomGap = r1(cardRect.bottom - badgeRect.bottom);
      const leftGap = r1(badgeRect.left - cardRect.left);
      const rightGap = r1(cardRect.right - badgeRect.right);
      lines.push(`  • Row #01 Card:  ${fmtRect(cardRect)}`);
      lines.push(`  • #01 Badge:     ${fmtRect(badgeRect)}`);
      lines.push(
        `  • #01 4-Side Gap (Card Border -> Badge Border): top=${topGap}px | right=${rightGap}px | bottom=${bottomGap}px | left=${leftGap}px`
      );
    }
  }

  if (detailWrapperEl && detailScrollEl) {
    const dwRect = detailWrapperEl.getBoundingClientRect();
    lines.push('\n[5. RIGHT DETAIL INSPECTOR PANE]');
    lines.push(`  • Wrapper Size:  ${fmtRect(dwRect)}`);
    lines.push(
      `  • Detail Scroll: clientWidth=${detailScrollEl.clientWidth}px | offsetWidth=${detailScrollEl.offsetWidth}px | scrollbarWidth=${detailScrollEl.offsetWidth - detailScrollEl.clientWidth}px`
    );
  }

  if (footerEl) {
    const fRect = footerEl.getBoundingClientRect();
    lines.push(
      `\n[6. PANEL FOOTER] Size: ${fmtRect(fRect)} | Text: "${footerEl.textContent?.replace(/\s+/g, ' ').trim() || ''}"`
    );
  }

  lines.push('========================================================================\n');
  const report = lines.join('\n');
  console.log(report);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(report);
      showToast('[ok] Preview layout properties exported to console and copied to clipboard');
    } catch {
      showToast('[ok] Preview layout properties output to console');
    }
  }
}
