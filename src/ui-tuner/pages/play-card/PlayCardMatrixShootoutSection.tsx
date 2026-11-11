import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Layer2PlayRecipe } from '../../../ui-core/recipes/Layer2PlayRecipe';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';
import { LocalPanelSizingTuner } from '../recipes/LocalPanelSizingTuner';
import type { PlayCardStyleVariant } from '../../../ui-core/stores/playCardStyleStore';

export interface PlayCardVariantMetaItem {
  id: PlayCardStyleVariant;
  code: string;
  title: string;
  formula: string;
  desc: string;
}

export interface PlayCardMatrixShootoutSectionProps {
  isLight: boolean;
  variant: PlayCardStyleVariant;
  setVariant: (v: PlayCardStyleVariant) => void;
  variantMeta: PlayCardVariantMetaItem[];
  onNavigateToSandboxPlay?: () => void;
}

export const PlayCardMatrixShootoutSection: React.FC<PlayCardMatrixShootoutSectionProps> = ({
  isLight,
  variant,
  setVariant,
  variantMeta,
  onNavigateToSandboxPlay,
}) => {
  return (
    <>
      {/* ──────────────────────────────────────────────────────────────────────
          Section 3 (2B.3): Live L2 Play Panel Preview (Synced with 7A)
         ────────────────────────────────────────────────────────────────────── */}
      <section id="play-card-2b-3-panel" className="scroll-mt-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-sky-500/15 text-sky-500 border border-sky-500/30">
              2B.3
            </span>
            <h2 className="text-base font-bold">L2 Play Full Menu 2×3 Live Panel Preview (Active style: {variant})</h2>
          </div>

          {onNavigateToSandboxPlay && (
            <button type="button" onClick={onNavigateToSandboxPlay}
              className="inline-flex items-center gap-1 text-xs font-mono font-bold text-amber-500 hover:text-amber-400 cursor-pointer">
              <span>Preview in 7A Menu Sandbox</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <LocalPanelSizingTuner
          panelId="layer2-play"
          label="Layer 2 Play Mode Selection Panel Frame Size"
          recommendation="Recommended Auto-Fit: panel height adapts smoothly when switching card styles or adjusting minimum card height"
          isLight={isLight}
        />

        <div className={`flex justify-center p-6 rounded-2xl border transition-colors ${ isLight
          ? 'bg-neutral-100/70 border-neutral-200/80 shadow-inner'
          : 'border-neutral-800 bg-neutral-950/70 shadow-inner' }`}>
          <Layer2PlayRecipe isLight={isLight} onBack={() => {}} />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────────
          Section 4 (2B.4): Full 2x3 Panel 3-Way Shootout Matrix
         ────────────────────────────────────────────────────────────────────── */}
      <section id="play-card-2b-4-matrix" className="scroll-mt-6 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-rose-500/15 text-rose-500 border border-rose-500/30">
              2B.4
            </span>
            <h2 className="text-base font-bold">Full 2×3 Menu Panel Three-Style Shootout Matrix</h2>
          </div>
          <span className="text-xs font-mono text-neutral-400">All three Play panels below share the 2B.2 tuning parameters for side-by-side visual comparison</span>
        </div>

        <div className="flex flex-col gap-6">
          {variantMeta.map((v) => {
            const isCurrent = variant === v.id;
            return (
              <div key={v.id} className={`p-5 rounded-2xl border flex flex-col gap-4 transition-all ${ isCurrent
                ? isLight ? 'bg-amber-50/25 border-amber-500/80 shadow-xs' : 'bg-amber-500/5 border-amber-500/60'
                : isLight ? 'bg-white border-neutral-200/90' : 'bg-neutral-900/50 border-neutral-800' }`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={isCurrent ? 'amber' : 'neutral'} size="sm" isLight={isLight}>
                      {v.code}
                    </Badge>
                    <span className="font-bold text-sm">{v.title}</span>
                    <code className="text-[11px] font-mono text-neutral-400 hidden sm:inline">({v.formula})</code>
                  </div>

                  <Button size="sm" variant={isCurrent ? 'primary' : 'secondary'} isLight={isLight}
                    onClick={() => setVariant(v.id)} > {isCurrent ? '[ok] Applied to 7A Play Menu' : 'Apply Style to 7A Play Menu'}
                    </Button> </div> <div className={`flex justify-center p-5 rounded-xl border ${ isLight
                    ? 'bg-neutral-100/60 border-neutral-200/70' : 'bg-neutral-950/60 border-neutral-800/80' }`} >
                    <StoreSnapshotScope overrides={{ playCardStyleStore: { variant: v.id } }}>
                      <Layer2PlayRecipe isLight={isLight} onBack={() => {}} />
                    </StoreSnapshotScope>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
};
