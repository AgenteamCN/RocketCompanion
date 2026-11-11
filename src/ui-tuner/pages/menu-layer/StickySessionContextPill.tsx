import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerUpLeft, Layers, RotateCcw } from 'lucide-react';
import {
  resolveLayer1ContextSpec,
  type CanonicalLayer1ContextVariation,
  type Layer1MenuContextMode,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import { getStickySessionContextOptions } from './menuLayerFreeRoamUtils';
import type { MenuVisibilityTier } from './menuLayerRouteConfig';

export interface StickySessionContextPillProps {
  isLight: boolean;
  visibilityTier: MenuVisibilityTier;
  stickySessionContext: Layer1MenuContextMode;
  onSelectSessionContext: (ctx: CanonicalLayer1ContextVariation) => void;
}

/**
 * Persistent pill in the stage status bar showing the current Sticky Session Context
 * (e.g., Session Context: [Online Match · Client v]), with a dropdown to switch contexts
 * or reset to Freeplay in one click.
 */
export const StickySessionContextPill: React.FC<StickySessionContextPillProps> = React.memo(
  ({ isLight, visibilityTier, stickySessionContext, onSelectSessionContext }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const activeSpec = resolveLayer1ContextSpec(stickySessionContext);
    const options = getStickySessionContextOptions(visibilityTier);

    useEffect(() => {
      if (!open) return;
      const handleOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      window.addEventListener('mousedown', handleOutside);
      return () => window.removeEventListener('mousedown', handleOutside);
    }, [open]);

    const roleDotCls =
      activeSpec.role === 'host'
        ? 'bg-sky-400'
        : activeSpec.role === 'client'
        ? 'bg-amber-400'
        : 'bg-emerald-400';

    return (
      <div ref={containerRef} className="relative inline-flex items-center gap-1">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-mono transition-colors ${
            isLight
              ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
              : 'bg-neutral-950/90 border-neutral-800 text-neutral-200'
          }`}
        >
          <Layers className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="text-neutral-400">Session Context:</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 font-bold text-amber-500 hover:text-amber-400 cursor-pointer"
            title="Sticky Session Context inherited when navigating back to Main Menu. Click to switch."
          >
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${roleDotCls}`} />
            <span>{activeSpec.shortLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-80" />
          </button>

          {activeSpec.id !== 'freeplay' && (
            <button
              type="button"
              onClick={() => {
                onSelectSessionContext('freeplay');
                setOpen(false);
              }}
              className={`ml-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-600'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Reset sticky session context back to Freeplay"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Freeplay</span>
            </button>
          )}
        </div>

        {open && (
          <div
            className={`absolute left-0 top-full mt-1.5 z-50 w-64 max-h-72 overflow-y-auto rounded-xl border p-1.5 shadow-xl font-mono text-xs ${
              isLight
                ? 'bg-white border-neutral-200 text-neutral-800'
                : 'bg-neutral-900 border-neutral-700 text-neutral-100'
            }`}
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-200/70 dark:border-neutral-800 mb-1">
              Sticky Session Context
            </div>
            {options.map((opt) => {
              const selected = opt.id === activeSpec.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSelectSessionContext(opt.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    selected
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : isLight
                      ? 'hover:bg-neutral-100 text-neutral-700'
                      : 'hover:bg-neutral-800 text-neutral-200'
                  }`}
                >
                  <span className="truncate">{opt.shortLabel}</span>
                  <span className="text-[10px] opacity-75 shrink-0">[{opt.headerTitle}]</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

StickySessionContextPill.displayName = 'StickySessionContextPill';

export interface FreeRoamReturnBannerProps {
  isLight: boolean;
  isFreeRoaming: boolean;
  activeViewRoamLabel: string;
  anchorIndex: number;
  anchorLabel: string;
  onReturnToAnchor: () => void;
}

/**
 * Illuminated prompt bar shown during Free Roam when activeViewState !== playlist[anchorIndex]:
 * `Currently viewing: Main Menu · [<- Back to #15 Garage Car]`
 */
export const FreeRoamReturnBanner: React.FC<FreeRoamReturnBannerProps> = React.memo(
  ({
    isLight,
    isFreeRoaming,
    activeViewRoamLabel,
    anchorIndex,
    anchorLabel,
    onReturnToAnchor,
  }) => {
    if (!isFreeRoaming) return null;

    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono transition-all ${
          isLight
            ? 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-2xs'
            : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span className="font-semibold">
            Currently viewing: <strong className="text-amber-600 dark:text-amber-400">{activeViewRoamLabel}</strong>
          </span>
          <span className="text-[11px] opacity-75">
            (Free Roam mode · Press ← / → to step from #{anchorIndex + 1})
          </span>
        </div>

        <button
          type="button"
          onClick={onReturnToAnchor}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 cursor-pointer transition-all active:scale-95 shadow-2xs"
          title={`Return immediately to approval anchor #${anchorIndex + 1} (${anchorLabel})`}
        >
          <CornerUpLeft className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>
            Back to #{anchorIndex + 1} {anchorLabel}
          </span>
        </button>
      </div>
    );
  }
);

FreeRoamReturnBanner.displayName = 'FreeRoamReturnBanner';
