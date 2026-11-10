import React from 'react';
import { Plus, Upload, HelpCircle, Copy } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';

export interface CollapsibleNumberedRailToolbarProps {
  isCollapsedToRail: boolean;
  itemCount: number;
  maxItems: number;
  safeIndex: number;
  isLight: boolean;
  onAddNew?: () => void;
  onDuplicate?: (index: number) => void;
  onImport?: () => void;
  onShowHelp?: () => void;
  onHoverDescription?: (description: string | null) => void;
}

export const CollapsibleNumberedRailToolbar: React.FC<CollapsibleNumberedRailToolbarProps> = React.memo(({
  isCollapsedToRail,
  itemCount,
  maxItems,
  safeIndex,
  isLight,
  onAddNew,
  onDuplicate,
  onImport,
  onShowHelp,
  onHoverDescription,
}) => {
  const isAtMax = itemCount >= maxItems;

  return (
    <div
      data-rail-section="top-toolbar"
      className="flex items-center justify-between h-8 shrink-0 w-full overflow-hidden"
    >
      <button
        type="button"
        data-rail-button="new-shot"
        disabled={isAtMax}
        onClick={onAddNew}
        onMouseEnter={() =>
          onHoverDescription?.(
            isAtMax
              ? `Maximum limit of ${maxItems} shots per pack reached.`
              : `New Shot: Append a new default shot to this pack (${itemCount}/${maxItems}).`
          )
        }
        onMouseLeave={() => onHoverDescription?.(null)}
        style={{
          width: isCollapsedToRail ? 28 : 142,
          paddingLeft: isCollapsedToRail ? 6 : 10,
          paddingRight: isCollapsedToRail ? 6 : 10,
        }}
        className={[
          'h-8 border flex items-center gap-1.5 text-xs font-bold overflow-hidden shrink-0',
          'transition-[width,padding,background-color,border-color] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]',
          UI_RADIUS.md,
          isAtMax
            ? 'opacity-40 cursor-not-allowed border-neutral-500/30'
            : isLight
            ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-900 text-white cursor-pointer shadow-2xs'
            : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-700 text-white cursor-pointer shadow-2xs',
        ].join(' ')}
        aria-label="New Shot"
      >
        <Plus className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
        <span
          className={`whitespace-nowrap transition-opacity duration-150 ${
            isCollapsedToRail ? 'opacity-0' : 'opacity-100'
          }`}
        >
          New Shot ({itemCount}/{maxItems})
        </span>
      </button>

      <div className="flex items-center justify-end shrink-0 overflow-hidden">
        <div
          className={`flex items-center gap-1.5 overflow-hidden transition-[max-width,opacity,margin-right] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isCollapsedToRail
              ? 'max-w-0 opacity-0 mr-0 pointer-events-none'
              : 'max-w-[260px] opacity-100 mr-1.5'
          }`}
        >
          <button
            type="button"
            disabled={isAtMax}
            onClick={() => onDuplicate?.(safeIndex)}
            onMouseEnter={() =>
              onHoverDescription?.(
                isAtMax
                  ? `Maximum limit of ${maxItems} shots reached.`
                  : `Duplicate highlighted shot #${String(safeIndex + 1).padStart(2, '0')}.`
              )
            }
            onMouseLeave={() => onHoverDescription?.(null)}
            className={`h-8 flex items-center gap-1 px-2.5 ${UI_RADIUS.md} border text-xs font-semibold transition-colors shrink-0 whitespace-nowrap ${
              isAtMax
                ? 'opacity-40 cursor-not-allowed border-neutral-500/30'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 cursor-pointer'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200 cursor-pointer'
            }`}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" />
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            onClick={onImport}
            onMouseEnter={() =>
              onHoverDescription?.(
                'Import a single shot configuration from a .json file into the current slot.'
              )
            }
            onMouseLeave={() => onHoverDescription?.(null)}
            className={`h-8 flex items-center gap-1 px-2.5 ${UI_RADIUS.md} border text-[11px] font-semibold cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span>Import .JSON</span>
          </button>
        </div>

        <button
          type="button"
          data-rail-button="show-help"
          onClick={onShowHelp}
          onMouseEnter={() =>
            onHoverDescription?.(
              'Show Help: Open 3D editor keyboard & mouse controls reference dialogue.'
            )
          }
          onMouseLeave={() => onHoverDescription?.(null)}
          style={{
            width: isCollapsedToRail ? 28 : 96,
            paddingLeft: isCollapsedToRail ? 6 : 10,
            paddingRight: isCollapsedToRail ? 6 : 10,
          }}
          className={[
            'h-8 border flex items-center gap-1 text-[11px] font-bold cursor-pointer',
            'overflow-hidden shrink-0 whitespace-nowrap',
            'transition-[width,padding,background-color,border-color] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]',
            UI_RADIUS.md,
            isLight
              ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-600'
              : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-400',
          ].join(' ')}
          aria-label="Show Help"
        >
          <HelpCircle className="h-3.5 w-3.5 stroke-[2.25] shrink-0" />
          <span
            className={`whitespace-nowrap transition-opacity duration-150 ${
              isCollapsedToRail ? 'opacity-0' : 'opacity-100'
            }`}
          >
            Show Help
          </span>
        </button>
      </div>
    </div>
  );
});

CollapsibleNumberedRailToolbar.displayName = 'CollapsibleNumberedRailToolbar';
