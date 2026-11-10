import React, { useMemo, useState } from 'react';
import { ArrowDownRight, Check, Copy, Search, X } from 'lucide-react';

export interface JumpDirectoryCategory {
  id: string;
  label: string;
  badge?: string;
}

export interface JumpDirectoryItem {
  code: string;
  componentName?: string;
  name?: string;
  label: string;
  targetId?: string;
  id?: string;
  tag?: string;
  badge?: string;
  category?: string;
}

export interface PageJumpDirectoryCardGridProps {
  items: JumpDirectoryItem[];
  categories?: JumpDirectoryCategory[];
  defaultCategory?: string;
  searchable?: boolean;
  activeId?: string;
  onJump: (item: JumpDirectoryItem) => void;
  isLight: boolean;
}

export const PageJumpDirectoryCardGrid: React.FC<PageJumpDirectoryCardGridProps> = React.memo(
  ({
    items,
    categories,
    defaultCategory = 'all',
    searchable = false,
    activeId,
    onJump,
    isLight,
  }) => {
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
    const [searchQuery, setSearchQuery] = useState<string>('');

    const handleCopyRef = (e: React.MouseEvent, item: JumpDirectoryItem) => {
      e.stopPropagation();
      const compName = item.componentName || item.name || item.label;
      const refText = `[${item.code}] ${compName}`;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(refText).catch(() => {});
      }
      setCopiedCode(item.code);
      window.setTimeout(() => {
        setCopiedCode((prev) => (prev === item.code ? null : prev));
      }, 1500);
    };

    const filteredItems = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      return items.filter((item) => {
        if (
          categories &&
          selectedCategory !== 'all' &&
          item.category &&
          item.category !== selectedCategory
        ) {
          return false;
        }
        if (!q) return true;
        const compName = (item.componentName || item.name || '').toLowerCase();
        const code = item.code.toLowerCase();
        const label = item.label.toLowerCase();
        const tag = (item.tag || item.badge || '').toLowerCase();
        return (
          code.includes(q) ||
          compName.includes(q) ||
          label.includes(q) ||
          tag.includes(q)
        );
      });
    }, [items, categories, selectedCategory, searchQuery]);

    const categoryCounts = useMemo(() => {
      if (!categories) return {};
      const counts: Record<string, number> = { all: items.length };
      for (const cat of categories) {
        if (cat.id !== 'all') counts[cat.id] = 0;
      }
      for (const item of items) {
        if (item.category) {
          counts[item.category] = (counts[item.category] || 0) + 1;
        }
      }
      return counts;
    }, [items, categories]);

    return (
      <>
        {(categories || searchable) && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3">
            {categories && categories.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {categories.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const count = categoryCounts[cat.id] ?? 0;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold shadow-2xs'
                          : isLight
                          ? 'bg-white hover:bg-neutral-100 border-neutral-200/90 text-neutral-600'
                          : 'bg-neutral-950/80 hover:bg-neutral-900 border-neutral-800 text-neutral-400'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded ${
                          isSelected
                            ? 'bg-neutral-950/15 text-neutral-950 font-extrabold'
                            : isLight
                            ? 'bg-neutral-100 text-neutral-500'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {searchable && (
              <div className="relative flex items-center min-w-[220px] sm:min-w-[260px]">
                <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Code (e.g. 6A.12) / Component Name / Label..."
                  className={`w-full pl-8 pr-7 py-1 rounded-lg text-xs font-mono border outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-neutral-200 focus:border-amber-400 text-neutral-800 placeholder:text-neutral-400'
                      : 'bg-neutral-950 border-neutral-800 focus:border-amber-500/60 text-neutral-200 placeholder:text-neutral-500'
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                    title="Clear Search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-3">
          {filteredItems.map((item) => {
            const isCopied = copiedCode === item.code;
            const compName = item.componentName || item.name || item.label;
            const tagText = item.tag || item.badge;
            const domId = item.targetId || item.id;
            const isActive =
              Boolean(activeId) && (domId === activeId || item.code === activeId);

            return (
              <div
                key={item.code}
                onClick={() => onJump(item)}
                role="button"
                tabIndex={0}
                aria-current={isActive ? 'true' : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onJump(item);
                  }
                }}
                className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                  isActive
                    ? isLight
                      ? 'bg-amber-50/95 border-amber-500 ring-1 ring-amber-400/70 text-neutral-900 shadow-xs'
                      : 'bg-amber-500/15 border-amber-500/80 ring-1 ring-amber-500/40 text-neutral-100 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-amber-50/60 border-neutral-200/90 hover:border-amber-400/80 text-neutral-800 shadow-2xs'
                    : 'bg-neutral-950/75 hover:bg-neutral-900 border-neutral-800/90 hover:border-amber-500/60 text-neutral-200'
                }`}
              >
                <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-extrabold border shrink-0 ${
                        isActive
                          ? 'bg-amber-500 text-neutral-950 border-amber-400'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {item.code}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold truncate transition-colors ${
                        isActive
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'group-hover:text-amber-500'
                      }`}
                    >
                      {compName}
                    </span>
                    {tagText && (
                      <span
                        className={`text-[9px] font-mono px-1 py-0.2 rounded shrink-0 ${
                          isLight
                            ? 'bg-neutral-100 text-neutral-500'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {tagText}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] truncate ${
                      isActive
                        ? isLight
                          ? 'text-amber-900/80 font-medium'
                          : 'text-amber-200/90 font-medium'
                        : isLight
                        ? 'text-neutral-500'
                        : 'text-neutral-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleCopyRef(e, item)}
                    title={`Copy reference ID: [${item.code}] ${compName}`}
                    className={`p-1 rounded-md border transition-colors cursor-pointer ${
                      isCopied
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                        : isLight
                        ? 'bg-neutral-50 hover:bg-neutral-200/70 border-neutral-200 text-neutral-400 hover:text-neutral-700'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <ArrowDownRight
                    className={`h-3.5 w-3.5 transition-all ${
                      isActive
                        ? 'opacity-100 text-amber-500'
                        : 'opacity-40 group-hover:opacity-100 group-hover:text-amber-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }
);

PageJumpDirectoryCardGrid.displayName = 'PageJumpDirectoryCardGrid';
