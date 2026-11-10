/**
 * Pure DOM intrinsic width measurement helpers for Menu Panels (L4 Navigation).
 * Separated from `menuPanelAdaptive.ts` to keep each module focused and compact.
 */

export function getExplicitVerticalMargin(el: HTMLElement, style: CSSStyleDeclaration): number {
  const isTopAuto =
    el.classList.contains('mt-auto') ||
    el.getAttribute('data-panel-section') === 'footer';
  const isBottomAuto = el.classList.contains('mb-auto');
  const mt = isTopAuto ? 0 : parseFloat(style.marginTop) || 0;
  const mb = isBottomAuto ? 0 : parseFloat(style.marginBottom) || 0;
  return mt + mb;
}

export function getVerticalPaddingAndBorder(style: CSSStyleDeclaration): number {
  return (
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0) +
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0)
  );
}

export function measureTextContentWidth(el: HTMLElement): number {
  if (typeof document !== 'undefined' && document.createRange) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0) return Math.ceil(rect.width);
  }
  return Math.ceil(el.scrollWidth);
}

/**
 * Measures the minimum non-overlapping width required by PanelHeader and UnderlineTabs
 * without being fooled by block-level `<h1>` widths or `flex-1` stretched tab buttons.
 */
export function measureChromeMinWidth(panelEl: HTMLElement): number {
  let minW = 300;

  const headerEl = panelEl.querySelector<HTMLElement>('[data-panel-section="header"]');
  if (headerEl) {
    const hStyle = window.getComputedStyle(headerEl);
    const padX =
      (parseFloat(hStyle.paddingLeft) || 0) + (parseFloat(hStyle.paddingRight) || 0);
    const titleEl = headerEl.querySelector<HTMLElement>('h1, h2');
    const titleW = titleEl ? measureTextContentWidth(titleEl) : 120;
    const buttons = headerEl.querySelectorAll<HTMLElement>('button');
    let maxBtnW = 0;
    buttons.forEach((btn) => {
      const bw = Math.ceil(btn.getBoundingClientRect().width);
      if (bw > maxBtnW) maxBtnW = bw;
    });
    const sideBtnReserve = buttons.length > 0 ? (maxBtnW + 12) * 2 : 0;
    const headerNeeded = titleW + sideBtnReserve + padX + 8;
    if (headerNeeded > minW) minW = headerNeeded;
  }

  const tablistEl = panelEl.querySelector<HTMLElement>('[role="tablist"]');
  if (tablistEl) {
    const parentStyle = tablistEl.parentElement
      ? window.getComputedStyle(tablistEl.parentElement)
      : null;
    const padX = parentStyle
      ? (parseFloat(parentStyle.paddingLeft) || 0) +
        (parseFloat(parentStyle.paddingRight) || 0)
      : 32;
    const tabs = tablistEl.querySelectorAll<HTMLElement>('[role="tab"]');
    let tabsSumW = 0;
    tabs.forEach((tab) => {
      const tabStyle = window.getComputedStyle(tab);
      const tabPadX =
        (parseFloat(tabStyle.paddingLeft) || 0) +
        (parseFloat(tabStyle.paddingRight) || 0);
      const tabGap = parseFloat(tabStyle.columnGap) || parseFloat(tabStyle.gap) || 4;
      let innerW = 0;
      let visibleSubCount = 0;
      for (let i = 0; i < tab.children.length; i++) {
        const sub = tab.children[i] as HTMLElement;
        const subStyle = window.getComputedStyle(sub);
        if (
          subStyle.display === 'none' ||
          subStyle.position === 'absolute' ||
          subStyle.position === 'fixed'
        ) {
          continue;
        }
        innerW += Math.ceil(sub.scrollWidth || sub.getBoundingClientRect().width);
        visibleSubCount++;
      }
      const naturalTabW =
        innerW + Math.max(0, visibleSubCount - 1) * tabGap + tabPadX + 4;
      tabsSumW += naturalTabW;
    });
    const tStyle = window.getComputedStyle(tablistEl);
    const gap = parseFloat(tStyle.columnGap) || parseFloat(tStyle.gap) || 0;
    const tabsNeeded =
      tabsSumW + Math.max(0, tabs.length - 1) * gap + padX + 8;
    if (tabsNeeded > minW) minW = tabsNeeded;
  }

  return Math.round(minW);
}

export function measureTabEnvelopeMinWidth(contentEl: HTMLElement): number {
  const envelopeGrid = contentEl.querySelector<HTMLElement>(
    '[data-tab-envelope-grid="true"]'
  );
  if (!envelopeGrid) return 0;

  const cStyle = window.getComputedStyle(contentEl);
  const contentPadX =
    (parseFloat(cStyle.paddingLeft) || 0) + (parseFloat(cStyle.paddingRight) || 0);

  let maxInnerW = 0;

  for (let i = 0; i < envelopeGrid.children.length; i++) {
    const tabWrapper = envelopeGrid.children[i] as HTMLElement;
    if (tabWrapper.getAttribute('data-envelope-exclude') === 'true') {
      continue;
    }

    const rows = tabWrapper.querySelectorAll<HTMLElement>(
      '[data-ui-element="setting-action-row"]'
    );
    rows.forEach((row) => {
      const rStyle = window.getComputedStyle(row);
      const rowPadX =
        (parseFloat(rStyle.paddingLeft) || 0) +
        (parseFloat(rStyle.paddingRight) || 0) +
        (parseFloat(rStyle.borderLeftWidth) || 0) +
        (parseFloat(rStyle.borderRightWidth) || 0);
      const topLine = row.firstElementChild as HTMLElement | null;
      if (topLine && topLine.children.length >= 2) {
        const leftEl = topLine.children[0] as HTMLElement;
        const rightEl = topLine.children[topLine.children.length - 1] as HTMLElement;
        const titleSpan = leftEl.querySelector<HTMLElement>('span.font-semibold');
        const titleW = titleSpan ? measureTextContentWidth(titleSpan) : 110;
        const leftW = 26 + titleW + 8;
        const rightW = Math.ceil(
          rightEl.scrollWidth || rightEl.getBoundingClientRect().width
        );
        const rowNeeded = rowPadX + leftW + 12 + rightW;
        if (rowNeeded > maxInnerW) maxInnerW = rowNeeded;
      }
    });

    const queueLists = tabWrapper.querySelectorAll<HTMLElement>(
      '[data-component="priority-queue-list"]'
    );
    if (queueLists.length >= 2) {
      let maxCardW = 0;
      queueLists.forEach((card) => {
        const cardStyle = window.getComputedStyle(card);
        const cardPadX =
          (parseFloat(cardStyle.paddingLeft) || 0) +
          (parseFloat(cardStyle.paddingRight) || 0) +
          2;
        const listContainer = card.children[1] as HTMLElement | undefined;
        if (listContainer) {
          for (let j = 0; j < listContainer.children.length; j++) {
            const itemRow = listContainer.children[j] as HTMLElement;
            const leftGroup = itemRow.children[0] as HTMLElement | undefined;
            const rightGroup = itemRow.children[1] as HTMLElement | undefined;
            const nameSpan = leftGroup?.querySelector<HTMLElement>('span.truncate');
            const nameW = nameSpan ? measureTextContentWidth(nameSpan) : 72;
            const leftW = 46 + nameW;
            const rightW = rightGroup
              ? Math.ceil(rightGroup.getBoundingClientRect().width)
              : 118;
            const cardNeeded = cardPadX + 26 + leftW + 8 + rightW;
            if (cardNeeded > maxCardW) maxCardW = cardNeeded;
          }
        }
      });
      const twoColNeeded = maxCardW * 2 + 14;
      if (twoColNeeded > maxInnerW) maxInnerW = twoColNeeded;
    }

    const carGrid = tabWrapper.querySelector<HTMLElement>(
      '[data-ui-element="garage-tab-car"]'
    );
    if (carGrid) {
      let maxCarCardW = 0;
      for (let j = 0; j < carGrid.children.length; j++) {
        const btn = carGrid.children[j] as HTMLElement;
        const nameSpan = btn.querySelector<HTMLElement>('span.font-bold');
        const nameW = nameSpan ? measureTextContentWidth(nameSpan) : 64;
        const cardW = nameW + 32;
        if (cardW > maxCarCardW) maxCarCardW = cardW;
      }
      const fourColNeeded = maxCarCardW * 4 + 36;
      if (fourColNeeded > maxInnerW) maxInnerW = fourColNeeded;
    }
  }

  if (maxInnerW <= 0) return 0;
  return Math.min(640, Math.ceil(maxInnerW + contentPadX + 2));
}
