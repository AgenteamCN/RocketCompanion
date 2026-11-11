import React from 'react';
import {
  LAYER1_CONTEXT_GROUPS,
  LAYER1_CONTEXT_VARIATIONS,
  resolveLayer1ContextSpec,
  type CanonicalLayer1ContextVariation,
  type Layer1ContextVariation,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';

export interface Layer1ContextGroupedSelectorProps {
  activeContext: Layer1ContextVariation;
  onSelectContext: (ctx: CanonicalLayer1ContextVariation) => void;
  /** Filter by tier ('user' | 'developer' | 'all'), defaults to 'all' */
  tierFilter?: 'user' | 'developer' | 'all';
  /** Whether the Layer 1 Main Menu route itself is currently active (defaults to true) */
  isRouteActive?: boolean;
  isLight?: boolean;
  compact?: boolean;
}

/**
 * Decoupled, categorized Layer 1 Context Variation selector bar.
 * Organizes Layer 1 menu variations into logical groups:
 * Base (Free Play) -> Singleplayer (Exhibition) -> Online Match (Lobby & Match · Host/Client) ->
 * Online Warmup (Host/Client) -> Training (Kickoff / Play Static / Edit Pack) -> Developer.
 */
export const Layer1ContextGroupedSelector: React.FC<Layer1ContextGroupedSelectorProps> = React.memo(
  ({
    activeContext,
    onSelectContext,
    tierFilter = 'all',
    isRouteActive = true,
    isLight = false,
    compact = false,
  }) => {
    const activeSpec = resolveLayer1ContextSpec(activeContext);
    const visibleGroups = LAYER1_CONTEXT_GROUPS.filter(
      (g) => tierFilter === 'all' || g.tier === tierFilter
    );

    return (
      <div className="flex flex-wrap items-stretch gap-2">
        {visibleGroups.map((group) => {
          const items = LAYER1_CONTEXT_VARIATIONS.filter(
            (v) =>
              v.groupId === group.id &&
              (tierFilter === 'all' || v.tier === tierFilter)
          );
          if (items.length === 0) return null;

          return (
            <div
              key={group.id}
              className={`flex flex-col gap-1 px-2.5 py-1.5 rounded-xl border ${
                isLight
                  ? 'bg-neutral-50/90 border-neutral-200/90'
                  : 'bg-neutral-900/60 border-neutral-800/90'
              }`}
            >
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider select-none ${
                  isLight ? 'text-neutral-500' : 'text-neutral-400'
                }`}
              >
                {group.label}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {items.map((variation) => {
                  const isSelected = isRouteActive && activeSpec.id === variation.id;
                  const roleDot =
                    variation.role === 'host'
                      ? 'bg-sky-400'
                      : variation.role === 'client'
                      ? 'bg-amber-400'
                      : null;

                  return (
                    <button
                      key={variation.id}
                      type="button"
                      onClick={() => onSelectContext(variation.id)}
                      title={variation.description || variation.label}
                      className={`inline-flex items-center gap-1.5 ${
                        compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'
                      } rounded-lg font-mono border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                          : isLight
                          ? 'bg-white hover:bg-amber-50/70 border-neutral-200 text-neutral-700'
                          : 'bg-neutral-950/80 hover:bg-neutral-800 border-neutral-700/80 text-neutral-200'
                      }`}
                    >
                      {roleDot && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            isSelected ? 'bg-white' : roleDot
                          }`}
                        />
                      )}
                      <span>{variation.shortLabel}</span>
                      <span className="text-[9.5px] opacity-75">
                        [{variation.headerTitle}]
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

Layer1ContextGroupedSelector.displayName = 'Layer1ContextGroupedSelector';
