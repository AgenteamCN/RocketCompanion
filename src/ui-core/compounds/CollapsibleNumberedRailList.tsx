import React from 'react';
import { motion } from 'framer-motion';
import {
  Copy,
  ArrowUp,
  ArrowDown,
  Download,
  Trash2,
} from 'lucide-react';
import { UI_EASING } from '../tokens/easing';
import { UI_RADIUS } from '../tokens/radius';
import { CollapsibleNumberedRailToolbar } from './CollapsibleNumberedRailToolbar';

export const ALPHA_COMPONENT_ID = 'Alpha:CollapsibleNumberedRailList' as const;

export interface CollapsibleRailItem {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
}

export interface CollapsibleNumberedRailListProps {
  /** Whether an item is currently inspected (true = compressed numbered rail; false = full horizontal list) */
  isCollapsedToRail: boolean;
  /** List of items (#01..#99) */
  items: CollapsibleRailItem[];
  /** Currently active/selected item index */
  selectedIndex: number;
  /** Maximum item capacity (default: 99) */
  maxItems?: number;
  /** Compressed rail width in px when inspecting an item (default: 60px) */
  collapsedRailWidth?: number;
  /** Light or dark theme */
  isLight?: boolean;
  /** Callback when an item is clicked to open or switch inspector target */
  onSelectItem: (index: number) => void;
  /** Callback when New Shot (+) is clicked */
  onAddNew?: () => void;
  /** Callback when Import .JSON is clicked */
  onImport?: () => void;
  /** Callback when Show Help (?) is clicked */
  onShowHelp?: () => void;
  /** Callback when Duplicate is clicked */
  onDuplicate?: (index: number) => void;
  /** Callback when Move Up / Move Down is clicked */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Callback when Export Shot JSON is clicked */
  onExportItem?: (index: number) => void;
  /** Callback when Delete Shot is clicked */
  onDeleteItem?: (index: number) => void;
  /** Callback when hovering any interactive control to display description in PanelFooter */
  onHoverDescription?: (description: string | null) => void;
  /** Detail inspector view rendered on the right when `isCollapsedToRail` is true */
  detailContent?: React.ReactNode;
  className?: string;
}

/**
 * [L3 Compound] CollapsibleNumberedRailList
 * Apple-symmetric horizontal container clipping (`overflow-hidden`) with hidden scrollbars (`.no-scrollbar`):
 * - Every shot row card is `h-[42px]` with `p-1` (`4px` padding on all 4 sides) around a `50px × 32px` `#01` badge.
 * - When `isCollapsedToRail` is `true`, the outer rail narrows to `60px` (`1px + 4px + 50px + 4px + 1px`).
 */
export const CollapsibleNumberedRailList: React.FC<CollapsibleNumberedRailListProps> = React.memo(({
  isCollapsedToRail,
  items,
  selectedIndex,
  maxItems = 99,
  collapsedRailWidth = 60,
  isLight = false,
  onSelectItem,
  onAddNew,
  onImport,
  onShowHelp,
  onDuplicate,
  onReorder,
  onExportItem,
  onDeleteItem,
  onHoverDescription,
  detailContent,
  className = '',
}) => {
  const isAtMax = items.length >= maxItems;
  const safeIndex = Math.max(0, Math.min(Math.max(0, items.length - 1), selectedIndex));
  const rowActionBtnClass = `p-1.5 ${UI_RADIUS.md} border border-neutral-500/30 hover:bg-neutral-500/15 disabled:opacity-30 cursor-pointer`;

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="collapsible-numbered-rail-list"
      data-collapsed={isCollapsedToRail}
      className={`flex items-stretch w-full h-full min-h-0 overflow-hidden select-none ${className}`}
    >
      <motion.div
        data-rail-section="left-container"
        initial={false}
        animate={{
          width: isCollapsedToRail ? collapsedRailWidth : '100%',
        }}
        transition={{
          duration: 0.28,
          ease: UI_EASING.apple,
        }}
        style={{ flexShrink: 0 }}
        className="flex flex-col gap-2 min-h-0 h-full overflow-hidden"
      >
        <CollapsibleNumberedRailToolbar
          isCollapsedToRail={isCollapsedToRail}
          itemCount={items.length}
          maxItems={maxItems}
          safeIndex={safeIndex}
          isLight={isLight}
          onAddNew={onAddNew}
          onDuplicate={onDuplicate}
          onImport={onImport}
          onShowHelp={onShowHelp}
          onHoverDescription={onHoverDescription}
        />

        {/* Shot List / Compressed Rail */}
        <div
          data-rail-section="scroll-list"
          className="flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden no-scrollbar grow min-h-0"
        >
          {items.map((item, idx) => {
            const isSelected = idx === safeIndex;
            const numStr = `#${String(idx + 1).padStart(2, '0')}`;

            return (
              <div
                key={item.id || idx}
                data-rail-item={idx}
                onClick={() => onSelectItem(idx)}
                onMouseEnter={() =>
                  onHoverDescription?.(
                    isCollapsedToRail
                      ? isSelected
                        ? `Click ${numStr} again to expand and return to the full Shot List.`
                        : `Switch to ${numStr} (${item.title}) in detail inspector.`
                      : `Click to inspect & edit ${numStr} (${item.title}).`
                  )
                }
                onMouseLeave={() => onHoverDescription?.(null)}
                className={`h-[42px] shrink-0 w-full p-1 ${UI_RADIUS.lg} border flex items-center gap-2.5 overflow-hidden cursor-pointer transition-colors ${
                  isSelected
                    ? isLight
                      ? 'bg-white border-neutral-900 shadow-2xs'
                      : 'bg-neutral-800/95 border-neutral-200'
                    : isLight
                    ? 'bg-neutral-50/90 hover:bg-white border-neutral-200'
                    : 'bg-neutral-900/60 hover:bg-neutral-850 border-neutral-800'
                }`}
              >
                <span
                  data-rail-badge={idx}
                  className={`font-mono text-xs font-extrabold w-[50px] h-8 ${UI_RADIUS.md} border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? isLight
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-900 border-white'
                      : isLight
                      ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                      : 'bg-neutral-850 text-neutral-300 border-neutral-700'
                  }`}
                >
                  {numStr}
                </span>

                <div
                  className={`flex items-center justify-between gap-2 flex-1 min-w-[320px] shrink-0 pr-1 transition-opacity duration-150 ${
                    isCollapsedToRail ? 'opacity-0 pointer-events-none' : 'opacity-100'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate leading-snug">
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="text-[10px] font-mono opacity-65 truncate leading-snug">
                        {item.subtitle}
                      </span>
                    )}
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onReorder?.(idx, idx - 1)}
                      onMouseEnter={() =>
                        onHoverDescription?.(`Move ${numStr} up in the shot sequence.`)
                      }
                      onMouseLeave={() => onHoverDescription?.(null)}
                      className={rowActionBtnClass}
                      aria-label="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1}
                      onClick={() => onReorder?.(idx, idx + 1)}
                      onMouseEnter={() =>
                        onHoverDescription?.(`Move ${numStr} down in the shot sequence.`)
                      }
                      onMouseLeave={() => onHoverDescription?.(null)}
                      className={rowActionBtnClass}
                      aria-label="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isAtMax}
                      onClick={() => onDuplicate?.(idx)}
                      onMouseEnter={() =>
                        onHoverDescription?.(`Duplicate ${numStr} (${item.title}).`)
                      }
                      onMouseLeave={() => onHoverDescription?.(null)}
                      className={rowActionBtnClass}
                      aria-label="Duplicate Shot"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onExportItem?.(idx)}
                      onMouseEnter={() =>
                        onHoverDescription?.(`Export ${numStr} as a standalone .json file.`)
                      }
                      onMouseLeave={() => onHoverDescription?.(null)}
                      className={`p-1.5 ${UI_RADIUS.md} border border-neutral-500/30 hover:bg-neutral-500/15 cursor-pointer`}
                      aria-label="Export Shot JSON"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={items.length <= 1}
                      onClick={() => onDeleteItem?.(idx)}
                      onMouseEnter={() =>
                        onHoverDescription?.(
                          items.length <= 1
                            ? 'Cannot delete the only remaining shot in the pack.'
                            : `Delete ${numStr} (${item.title}) from this pack.`
                        )
                      }
                      onMouseLeave={() => onHoverDescription?.(null)}
                      className={`p-1.5 ${UI_RADIUS.md} border border-red-500/30 text-red-400 hover:bg-red-500/15 disabled:opacity-30 cursor-pointer`}
                      aria-label="Delete Shot"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      <div
        data-rail-section="detail-wrapper"
        className={`flex-1 min-w-0 h-full min-h-0 overflow-hidden transition-[margin,opacity] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isCollapsedToRail
            ? 'ml-3 opacity-100 pointer-events-auto'
            : 'ml-0 opacity-0 pointer-events-none'
        }`}
      >
        <div
          data-rail-section="detail-scroll"
          className="w-full min-w-[380px] h-full min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col"
        >
          {detailContent}
        </div>
      </div>
    </div>
  );
});

CollapsibleNumberedRailList.displayName = 'CollapsibleNumberedRailList';
