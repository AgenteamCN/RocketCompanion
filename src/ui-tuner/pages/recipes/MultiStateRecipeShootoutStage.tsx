import React, { useState, useEffect } from 'react';
import { Columns2, Square } from 'lucide-react';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';
import { AuditTicketHeader } from '../../components/AuditTicketHeader';
import { useReviewLedgerStore } from '../../components/review/reviewLedgerStore';
import type { RecipeStateSnapshotSpec } from './recipeStateMatrixSpecs';

export type RecipeStageDisplayMode = 'matrix' | 'single';

export interface MultiStateRecipeShootoutStageProps<TProps extends object> {
  referenceCode: string;
  states: RecipeStateSnapshotSpec<TProps>[];
  badgeColor?: 'amber' | 'rose' | 'emerald' | 'indigo' | 'sky';
  isLight: boolean;
  defaultMode?: RecipeStageDisplayMode;
  renderStateCard: (state: RecipeStateSnapshotSpec<TProps>, index: number) => React.ReactNode;
}

/**
 * Dual-mode stage for multi-tab / multi-state recipes in Workspace Bravo (Section 6A):
 * - `matrix` (Matrix Shootout): Side-by-side multi-card shootout where each card is wrapped in `<StoreSnapshotScope>`.
 * - `single` (Single Stage): Focused rapid-review stage with inline state/variant pill switcher and zero multi-mount overhead.
 */
export function MultiStateRecipeShootoutStage<TProps extends object>({
  referenceCode,
  states,
  badgeColor = 'amber',
  isLight,
  defaultMode = 'matrix',
  renderStateCard,
}: MultiStateRecipeShootoutStageProps<TProps>) {
  const [mode, setMode] = useState<RecipeStageDisplayMode>(defaultMode);
  const [activeStateId, setActiveStateId] = useState<string>(states[0]?.id ?? '');

  const navigationSeq = useReviewLedgerStore((s) => s.navigationSeq);
  const activeUnitKey = useReviewLedgerStore((s) => s.activeUnitKey);
  useEffect(() => {
    if (navigationSeq === 0) return;
    const [, variantId = 'default'] = activeUnitKey.split('::');
    if (variantId && variantId !== 'default') {
      const matched = states.find((s) => s.id === variantId);
      if (matched) {
        setActiveStateId(matched.id);
        setMode('single');
      }
    }
  }, [navigationSeq]);

  const activeIndex = Math.max(
    0,
    states.findIndex((s) => s.id === activeStateId)
  );
  const activeState = states[activeIndex] ?? states[0];

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Toolbar: Single Stage ⇄ Matrix Shootout Toggle + Variant Pill Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl border text-xs ${
          isLight
            ? 'bg-white/90 border-neutral-200/90 text-neutral-700'
            : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
        }`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 mr-1">
            Stage View:
          </span>
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold border cursor-pointer transition-colors ${
              mode === 'single'
                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <Square className="h-3 w-3" />
            <span>Single Stage (1x)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('matrix')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold border cursor-pointer transition-colors ${
              mode === 'matrix'
                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <Columns2 className="h-3 w-3" />
            <span>Matrix Shootout ({states.length}x)</span>
          </button>
        </div>

        {/* Inline Variant Pill Switcher (Always visible; selects single-stage state or highlights in matrix) */}
        <div className="flex items-center gap-1 flex-wrap">
          {states.map((st, idx) => {
            const isSelected = st.id === activeState?.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setActiveStateId(st.id);
                  if (mode === 'matrix') {
                    setMode('single');
                  }
                }}
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] border cursor-pointer transition-colors ${
                  isSelected && mode === 'single'
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400 font-bold'
                    : isLight
                    ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
                }`}
              >
                {idx + 1}. {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage Body */}
      {mode === 'single' && activeState ? (
        <div className="flex flex-col gap-3 items-center w-full max-w-3xl mx-auto">
          <StoreSnapshotScope
            overrides={{
              onlineRoomStore: activeState.props as Record<string, unknown>,
            }}
          >
            {renderStateCard(activeState, activeIndex)}
          </StoreSnapshotScope>
          <AuditTicketHeader
            index={activeIndex + 1}
            label={activeState.label}
            description={activeState.description}
            referenceCode={referenceCode}
            componentName={activeState.componentName || referenceCode}
            sourceFile={activeState.sourceFile || ''}
            subViewFile={activeState.subViewFile}
            stateId={activeState.id}
            activeProps={activeState.props as Record<string, unknown>}
            badgeColor={badgeColor}
            isLight={isLight}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full items-start">
          {states.map((st, idx) => (
            <div key={st.id} className="flex flex-col gap-2 items-center w-full">
              <StoreSnapshotScope
                overrides={{
                  onlineRoomStore: st.props as Record<string, unknown>,
                }}
              >
                {renderStateCard(st, idx)}
              </StoreSnapshotScope>
              <AuditTicketHeader
                index={idx + 1}
                label={st.label}
                description={st.description}
                referenceCode={referenceCode}
                componentName={st.componentName || referenceCode}
                sourceFile={st.sourceFile || ''}
                subViewFile={st.subViewFile}
                stateId={st.id}
                activeProps={st.props as Record<string, unknown>}
                badgeColor={badgeColor}
                isLight={isLight}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
