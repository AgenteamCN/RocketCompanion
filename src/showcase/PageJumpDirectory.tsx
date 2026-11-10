import React, { useState, useMemo } from 'react';
import {
  Compass,
  Check,
  Copy,
  Code2,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import {
  PageJumpDirectoryCardGrid,
  type JumpDirectoryCategory,
  type JumpDirectoryItem,
} from './components/PageJumpDirectoryCardGrid';
import { crossClientSync } from './stores/crossClientSync';

export type { JumpDirectoryCategory, JumpDirectoryItem } from './components/PageJumpDirectoryCardGrid';

export interface PageJumpDirectoryProps {
  layerTag?: string; title?: string;
  subtitle?: string;
  items: JumpDirectoryItem[];
  onSelect?: (item: JumpDirectoryItem) => void;
  activeId?: string;
  preventDefaultJump?: boolean;
  categories?: JumpDirectoryCategory[];
  searchable?: boolean;
  collapsible?: boolean;
  headerExtra?: React.ReactNode;
  isLight?: boolean;
}

export const PageJumpDirectory: React.FC<PageJumpDirectoryProps> = React.memo(
  (props) => {
    const {
      layerTag,
      title = 'Quick Jump & Reference Index',
      subtitle = 'Click a card to scroll to the component section or copy its reference ID',
      items,
      onSelect,
      activeId,
      preventDefaultJump = false,
      categories,
      searchable = false,
      collapsible = false,
      headerExtra,
      isLight = true,
    } = props;

    const [copiedAuditTicket, setCopiedAuditTicket] = useState<boolean>(false);
    const [copiedPageParams, setCopiedPageParams] = useState<boolean>(false);
    const [exportedPreviewJson, setExportedPreviewJson] = useState<string | null>(null);
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

    const activeItem = useMemo(() => {
      if (!activeId) return null;
      return (
        items.find(
          (it) => (it.targetId || it.id) === activeId || it.code === activeId
        ) ?? null
      );
    }, [items, activeId]);

    const handleExportPageParams = () => {
      const exported = crossClientSync.exportParameters();
      const json = JSON.stringify(exported, null, 2);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json).catch(() => {});
      }
      setCopiedPageParams(true);
      window.setTimeout(() => setCopiedPageParams(false), 1800);
      if (exportedPreviewJson !== null) {
        setExportedPreviewJson(json);
      }
    };

    const handleCopyAuditTicket = (targetItem?: JumpDirectoryItem | null) => {
      const item = targetItem ?? activeItem ?? items[0];
      const compName = item ? item.componentName || item.name || item.label : title;
      const refCode = item ? item.code : layerTag || 'PAGE';
      const itemTag = item
        ? item.tag || item.badge || item.category || layerTag || 'UI'
        : layerTag || 'UI';
      const itemLabel = item ? item.label : subtitle;
      const exported = crossClientSync.exportParameters();
      const ticketMarkdown = [
        '### [UI Audit Ticket]',
        `- **Reference Code**: \`[${refCode}]\``,
        `- **Component**: \`${compName}\``,
        `- **Layer / Category**: \`${itemTag}\``,
        `- **Module Label**: ${itemLabel}`,
        `- **Theme Mode**: \`${isLight ? 'light' : 'dark'}\``,
        '- **Current Tuned Parameters**:',
        '```json',
        JSON.stringify(exported, null, 2),
        '```',
        '',
      ].join('\n');
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(ticketMarkdown).catch(() => {});
      }
      setCopiedAuditTicket(true);
      window.setTimeout(() => setCopiedAuditTicket(false), 1800);
    };

    const handleTogglePreviewParams = () => {
      if (exportedPreviewJson !== null) {
        setExportedPreviewJson(null);
      } else {
        const exported = crossClientSync.exportParameters();
        setExportedPreviewJson(JSON.stringify(exported, null, 2));
      }
    };

    const handleJump = (item: JumpDirectoryItem) => {
      onSelect?.(item);
      if (preventDefaultJump) return;
      const domId = item.targetId || item.id;
      if (domId) {
        if (typeof window !== 'undefined' && window.history?.pushState) {
          try {
            const url = new URL(window.location.href);
            url.hash = `#${domId}`;
            const nextHref = `${url.pathname}${url.search}${url.hash}`;
            const currHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            if (nextHref !== currHref) {
              window.history.pushState(window.history.state, '', nextHref);
            }
          } catch {
            // ignore
          }
        }
        const el = document.getElementById(domId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    return (
      <nav
        aria-label={title}
        data-ui-element="page-jump-directory"
        className={`p-4 rounded-2xl border transition-colors ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200/90 text-neutral-800 shadow-2xs'
            : 'bg-neutral-900/70 border-neutral-800 text-neutral-200 shadow-md'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-6 w-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <Compass className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold tracking-tight">{title}</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                isLight
                  ? 'bg-white border-neutral-200 text-neutral-600'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-400'
              }`}
            >
              Total {items.length} Individual Modules
            </span>
            {activeItem && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Sparkles className="h-3 w-3" />
                <span>
                  Currently Mounted: [{activeItem.code}]{' '}
                  {activeItem.componentName || activeItem.name}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[11px] hidden xl:inline ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              {subtitle}
            </span>
            {headerExtra}
            <button
              type="button"
              onClick={handleTogglePreviewParams}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                exportedPreviewJson !== null
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-500 font-bold'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
              }`}
              title="Expand/Collapse real-time view of all adjustable parameters on this page JSON Snapshot"
            >
              <Code2 className="h-3 w-3" />
              <span>{exportedPreviewJson !== null ? 'Collapse JSON' : 'View Parameters'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportPageParams}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                copiedPageParams
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400'
              }`}
              title="Copy all adjustable parameters and states on this page"
            >
              {copiedPageParams ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedPageParams ? 'Parameters copied!' : 'Copy Page Params'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopyAuditTicket(null)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                copiedAuditTicket
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
              }`}
              title="Copy structured UI Audit Ticket markdown with component reference and current tuned parameters"
            >
              {copiedAuditTicket ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedAuditTicket ? 'Audit Ticket Copied!' : 'Copy Audit Ticket'}</span>
            </button>
            {collapsible && (
              <button
                type="button"
                onClick={() => setIsCollapsed((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
                }`}
                title={
                  isCollapsed
                    ? 'Expand all menu directory grids'
                    : 'Collapse Directory Grid, Keep only the currently tuned panel'
                }
              >
                {isCollapsed ? (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>Expand Directory ({items.length})</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>Compact Directory</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {exportedPreviewJson !== null && (
          <div
            className={`mt-3 p-3 rounded-xl border font-mono text-[11px] overflow-x-auto max-h-64 overflow-y-auto select-text ${
              isLight
                ? 'bg-neutral-900 text-emerald-300 border-neutral-800'
                : 'bg-black/80 text-emerald-300 border-neutral-800'
            }`}
          >
            <pre className="whitespace-pre-wrap break-all">{exportedPreviewJson}</pre>
          </div>
        )}

        {!isCollapsed && (
          <PageJumpDirectoryCardGrid
            items={items}
            categories={categories}
            searchable={searchable}
            activeId={activeId}
            onJump={handleJump}
            isLight={isLight}
          />
        )}
      </nav>
    );
  }
);

PageJumpDirectory.displayName = 'PageJumpDirectory';
