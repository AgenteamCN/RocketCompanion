import React from 'react';
import { Ruler } from 'lucide-react';
import type { ContainerTransitionMode } from '../../../ui-core/tokens/easing';
import type { ActiveMenuRoute } from './menuLayerRouteConfig';
export interface MenuLayerStageActionToolbarProps {
  isLight: boolean;
  currentRoute: ActiveMenuRoute;
  transitionMode: ContainerTransitionMode;
  setTransitionMode: (mode: ContainerTransitionMode) => void;
  showToast: (msg: string) => void;
}

export const MenuLayerStageActionToolbar: React.FC<MenuLayerStageActionToolbarProps> = ({
  isLight,
  currentRoute,
  transitionMode,
  setTransitionMode,
  showToast,
}) => {
  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      <button
        type="button"
        onClick={async () => {
          const previewStage = document.getElementById('rc-ui-tuner-preview-stage');
          if (!previewStage) return;

          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const shellEl = previewStage.querySelector<HTMLElement>(
            '[data-morph-container="true"], [data-panel="container"]'
          );
          const headerEl = previewStage.querySelector<HTMLElement>(
            '[data-ui-element="panel-header"]'
          );
          const tabsEl = previewStage.querySelector<HTMLElement>('[role="tablist"]');
          const tabButtons = Array.from(
            previewStage.querySelectorAll<HTMLElement>('[role="tab"]')
          );
          const contentEl = previewStage.querySelector<HTMLElement>(
            '[data-ui-element="panel-content"]'
          );
          const footerEl = previewStage.querySelector<HTMLElement>(
            '[data-ui-element="panel-footer"]'
          );

          const getPadStr = (cs: CSSStyleDeclaration) =>
            `top=${cs.paddingTop} right=${cs.paddingRight} bottom=${cs.paddingBottom} left=${cs.paddingLeft}`;
          const getRectStr = (r: DOMRect) =>
            `${Math.round(r.width * 10) / 10}px × ${Math.round(r.height * 10) / 10}px (x: ${Math.round(r.x)}, y: ${Math.round(r.y)})`;

          const lines: string[] = [];
          lines.push(
            '========================================================================'
          );
          lines.push(
            ` [RCUITUNER SNAPSHOT] ROUTE: [${currentRoute.toUpperCase()}]`
          );
          lines.push(
            '========================================================================'
          );
          lines.push(`• Window Viewport: ${winW}px × ${winH}px`);

          if (shellEl) {
            const sRect = shellEl.getBoundingClientRect();
            const sCs = window.getComputedStyle(shellEl);
            lines.push('\n[1. MENU CONTAINER (OUTER SHELL)]');
            lines.push(`  • Size:         ${getRectStr(sRect)}`);
            lines.push(`  • Padding:      ${getPadStr(sCs)}`);
          }

          if (headerEl) {
            const hRect = headerEl.getBoundingClientRect();
            lines.push(
              `\n[2. PANEL HEADER] Size: ${getRectStr(hRect)} | Title: "${headerEl.querySelector('h1, h2')?.textContent?.trim() || ''}"`
            );
          }

          if (tabsEl) {
            lines.push(`\n[3. TABS] Total ${tabButtons.length} tab(s)`);
          }

          if (contentEl) {
            const cRect = contentEl.getBoundingClientRect();
            lines.push(
              `\n[4. PANEL CONTENT] Size: ${getRectStr(cRect)} | ScrollH: ${contentEl.scrollHeight}px`
            );
          }

          if (footerEl) {
            lines.push(
              `\n[5. PANEL FOOTER] Content: "${footerEl.textContent?.replace(/\s+/g, ' ').trim() || ''}"`
            );
          }

          lines.push(
            '========================================================================\n'
          );
          const report = lines.join('\n');
          console.log(report);
          if (navigator.clipboard?.writeText) {
            try {
              await navigator.clipboard.writeText(report);
              showToast('[ok] Preview layout data exported to console and copied to clipboard');
            } catch (_) {
              showToast('[ok] Preview layout data output to console');
            }
          }
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono font-medium transition-all active:scale-95 cursor-pointer bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border-neutral-300 dark:border-neutral-700 shadow-2xs"
        title="Print and copy current real-time preview element dimensions, margin, and padding data"
      >
        <Ruler className="h-3.5 w-3.5 text-amber-500" />
        <span>Export current preview layout data</span>
      </button>

      <div className="flex items-center gap-2">
        <span className={`font-medium ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Transition Effect:
        </span>
        <div className="flex items-center gap-1.5 p-1 rounded-xl border bg-neutral-100/70 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setTransitionMode('fluid-morph')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              transitionMode === 'fluid-morph'
                ? 'bg-amber-500 text-white font-bold shadow-2xs'
                : isLight
                ? 'text-neutral-600 hover:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Apple HIG 0.28s Continuous fluid morph"
          >
            FluidMorph (Continuous fluid)
          </button>
          <button
            type="button"
            onClick={() => setTransitionMode('sequenced-step')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              transitionMode === 'sequenced-step'
                ? 'bg-amber-500 text-white font-bold shadow-2xs'
                : isLight
                ? 'text-neutral-600 hover:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="100ms fade out -> 150ms Size Transformation -> 100ms Fade In"
          >
            SequencedStep (Three-step)
          </button>
        </div>
      </div>
    </div>
  );
};
