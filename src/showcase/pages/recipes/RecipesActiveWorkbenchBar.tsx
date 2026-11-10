import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  Copy,
  Check,
  Code2,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
} from 'lucide-react';
import { CodeBlock } from '../../CodeBlock';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { RECIPES_JUMP_ITEMS } from './LocalPanelSizingTuner';
import { getRelatedRecipeItems } from './recipeRegistry';

export interface RecipesActiveWorkbenchBarProps {
  activeRecipeId: string;
  activeIndex: number;
  isLight: boolean;
  onSelectRecipeId: (nextId: string, scrollStage?: boolean) => void;
}

export const RecipesActiveWorkbenchBar: React.FC<RecipesActiveWorkbenchBarProps> = ({
  activeRecipeId,
  activeIndex,
  isLight,
  onSelectRecipeId,
}) => {
  const { resetTokens, exportConfigCode } = useMenuLayoutStore();
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [showExportBlock, setShowExportBlock] = useState(false);

  const activeItem = RECIPES_JUMP_ITEMS[activeIndex] ?? RECIPES_JUMP_ITEMS[0];
  const prevItem =
    RECIPES_JUMP_ITEMS[
      (activeIndex - 1 + RECIPES_JUMP_ITEMS.length) % RECIPES_JUMP_ITEMS.length
    ];
  const nextItem =
    RECIPES_JUMP_ITEMS[(activeIndex + 1) % RECIPES_JUMP_ITEMS.length];

  const relatedItems = useMemo(
    () => getRelatedRecipeItems(activeRecipeId),
    [activeRecipeId]
  );

  const handleCopyConfig = async () => {
    const code = exportConfigCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  return (
    <div
      id="recipes-active-workbench-bar"
      className={`scroll-mt-4 p-3.5 rounded-2xl border flex flex-col gap-2.5 transition-colors ${
        isLight
          ? 'bg-amber-50/55 border-amber-200/90 shadow-2xs'
          : 'bg-neutral-900/85 border-amber-500/30 shadow-md'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() =>
              onSelectRecipeId(prevItem.id || prevItem.targetId || 'recipe-6a-1-main')
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
            title={`Switch to previous module: [${prevItem.code}] ${prevItem.label}`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Prev (←)</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onSelectRecipeId(nextItem.id || nextItem.targetId || 'recipe-6a-1-main')
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
            title={`Switch to next module: [${nextItem.code}] ${nextItem.label}`}
          >
            <span>Next (→)</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <select
            aria-label="Quick switch 6A Menu recipe"
            value={activeRecipeId}
            onChange={(e) => onSelectRecipeId(e.target.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border outline-none cursor-pointer ${
              isLight
                ? 'bg-white border-neutral-200 text-neutral-800 focus:border-amber-400'
                : 'bg-neutral-950 border-neutral-800 text-neutral-200 focus:border-amber-500'
            }`}
          >
            {RECIPES_JUMP_ITEMS.map((it) => {
              const id = it.id || it.targetId || it.code;
              return (
                <option key={id} value={id}>
                  [{it.code}] {it.label} ({it.name || it.componentName})
                </option>
              );
            })}
          </select>

          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-neutral-950 font-mono font-extrabold text-xs">
            {activeItem.code}
          </span>
          <span className="text-xs font-mono font-bold">
            {activeItem.name || activeItem.componentName}
          </span>
          <span
            className={`text-xs font-semibold ${
              isLight ? 'text-neutral-700' : 'text-neutral-200'
            }`}
          >
            · {activeItem.label}
          </span>
          {activeItem.badge && (
            <Badge variant="neutral" size="sm" isLight={isLight}>
              {activeItem.badge}
            </Badge>
          )}
          <span
            className={`text-[11px] font-mono ${
              isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            (Module {activeIndex + 1} / {RECIPES_JUMP_ITEMS.length})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            isLight={isLight}
            icon={<Code2 className="h-3.5 w-3.5" />}
            onClick={() => setShowExportBlock((prev) => !prev)}
          >
            {showExportBlock ? 'Hide hardcoded code' : 'View hardcoded code'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            isLight={isLight}
            icon={copiedConfig ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={handleCopyConfig}
          >
            {copiedConfig ? 'config copied!' : 'Export / Copy all configs'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isLight={isLight}
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={resetTokens}
          >
            Reset all defaults
          </Button>
        </div>
      </div>

      {relatedItems.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-amber-200/60 dark:border-neutral-800">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-mono ${
              isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            <ArrowRightLeft className="h-3 w-3 text-amber-500" />
            <span>One-click switching for grouped tuners:</span>
          </span>
          {relatedItems.map((rel) => {
            const relId = rel.id || rel.targetId || rel.code;
            return (
              <button
                key={relId}
                type="button"
                onClick={() => onSelectRecipeId(relId)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-white hover:bg-amber-100/70 border-neutral-200/90 hover:border-amber-400 text-neutral-700'
                    : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 hover:border-amber-500/50 text-neutral-300'
                }`}
              >
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  [{rel.code}]
                </span>
                <span>{rel.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {showExportBlock && (
        <CodeBlock
          isLight={isLight}
          title="src/ui-core/stores/menuLayoutStore.ts (Export all panel dimensions and layout configuration)"
          code={exportConfigCode()}
        />
      )}
    </div>
  );
};
