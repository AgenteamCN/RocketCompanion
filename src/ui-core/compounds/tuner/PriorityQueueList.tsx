import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '../../primitives/Badge';
import { UI_RADIUS } from '../../tokens/radius';
import { UI_THEME } from '../../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:PriorityQueueList' as const;

export interface PriorityQueueItem {
  id: string;
  name: string;
  hex: string;
}

export interface PriorityQueueListProps {
  title: string;
  subtitle?: string;
  items: PriorityQueueItem[];
  onReorder: (index: number, direction: 'up' | 'down') => void;
  accentDotColor?: string;
  isLight?: boolean;
  className?: string;
}

/**
 * PriorityQueueList
 * Reorderable team color fallback priority queue (#1 Primary -> Fallback 1 -> Fallback 2).
 */
export const PriorityQueueList: React.FC<PriorityQueueListProps> = React.memo(({
  title,
  subtitle,
  items,
  onReorder,
  accentDotColor = '#3b82f6',
  isLight = false,
  className = '',
}) => (
  <div
    data-alpha-id={ALPHA_COMPONENT_ID}
    data-component="priority-queue-list"
    className={`p-3.5 ${UI_RADIUS.card} border flex flex-col gap-2.5 select-none transition-colors ${
      isLight
        ? `${UI_THEME.light.bgSurface} ${UI_THEME.light.border} ${UI_THEME.light.textPrimary}`
        : `bg-neutral-900/60 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
    } ${className}`}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="font-bold text-xs flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accentDotColor }} />
        <span>{title}</span>
      </span>
      {subtitle && <span className="text-[10px] font-mono opacity-70">{subtitle}</span>}
    </div>

    <div className="flex flex-col gap-1.5">
      {items.map((item, idx) => {
        const isTop = idx === 0;
        const isBottom = idx === items.length - 1;
        return (
          <div
            key={item.id}
            className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/80 border-neutral-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] font-bold text-neutral-400">#{idx + 1}</span>
              <span
                className="h-3.5 w-3.5 rounded-full border border-black/15 dark:border-white/20 shrink-0 shadow-2xs"
                style={{ backgroundColor: item.hex }}
              />
              <span className="font-medium truncate">{item.name}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Badge size="sm" variant={idx === 0 ? 'amber' : 'neutral'} isLight={isLight}>
                {idx === 0 ? 'Primary' : `Fallback ${idx}`}
              </Badge>
              <button
                type="button"
                disabled={isTop}
                onClick={() => onReorder(idx, 'up')}
                className={`p-1 rounded border transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                  isLight
                    ? 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
                    : 'border-neutral-700 hover:bg-neutral-800 text-neutral-300'
                }`}
                title="Move Up"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={isBottom}
                onClick={() => onReorder(idx, 'down')}
                className={`p-1 rounded border transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${
                  isLight
                    ? 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
                    : 'border-neutral-700 hover:bg-neutral-800 text-neutral-300'
                }`}
                title="Move Down"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
));

PriorityQueueList.displayName = 'PriorityQueueList';
