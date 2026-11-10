import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { UI_RADIUS } from '../../tokens/radius';
import { UI_THEME } from '../../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:EventFilterMatrix' as const;

export interface EventCatalogEntry {
  hex: string;
  id: string;
  name: string;
}

export interface EventFilterMatrixProps {
  title?: string;
  items: EventCatalogEntry[];
  selectedMap: Record<string, boolean>;
  onToggleItem: (hex: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * EventFilterMatrix
 * Hex-code (0x01..0x08) event stream filter grid with bulk Select All / Deselect All actions.
 */
export const EventFilterMatrix: React.FC<EventFilterMatrixProps> = React.memo(({
  title = 'Console Event Filter Catalog',
  items,
  selectedMap,
  onToggleItem,
  onSelectAll,
  onDeselectAll,
  isLight = false,
  className = '',
}) => {
  const activeCount = items.filter((i) => selectedMap[i.hex.toLowerCase()]).length;

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="event-filter-matrix"
      className={`p-3.5 ${UI_RADIUS.card} border flex flex-col gap-2.5 select-none transition-colors ${
        isLight
          ? `${UI_THEME.light.bgSurface} ${UI_THEME.light.border} ${UI_THEME.light.textPrimary}`
          : `bg-neutral-900/60 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              isLight ? 'text-neutral-700' : 'text-neutral-300'
            }`}
          >
            {title}
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 font-bold">
            {activeCount} / {items.length} Active
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSelectAll}
            className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            Deselect All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map((item) => {
          const isChecked = Boolean(selectedMap[item.hex.toLowerCase()]);
          return (
            <div
              key={item.hex}
              onClick={() => onToggleItem(item.hex)}
              className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                isChecked
                  ? isLight
                    ? 'bg-amber-500/10 border-amber-500/40 text-neutral-900 shadow-2xs'
                    : 'bg-amber-500/10 border-amber-500/40 text-neutral-100'
                  : isLight
                  ? 'bg-white/60 border-neutral-200 text-neutral-400 opacity-65'
                  : 'bg-neutral-950/50 border-neutral-800 text-neutral-500 opacity-65'
              }`}
            >
              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                  isChecked
                    ? 'bg-amber-500/20 text-amber-500'
                    : isLight
                    ? 'bg-neutral-200 text-neutral-500'
                    : 'bg-neutral-800 text-neutral-500'
                }`}
              >
                {item.hex}
              </span>
              <div className="flex flex-col min-w-0 flex-1 leading-snug">
                <span className="text-[11px] font-semibold truncate">{item.name}</span>
                <span className="text-[9px] font-mono opacity-60 truncate">{item.id}</span>
              </div>
              {isChecked ? (
                <CheckSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              ) : (
                <Square className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

EventFilterMatrix.displayName = 'EventFilterMatrix';
