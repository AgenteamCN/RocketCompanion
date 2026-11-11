import React from 'react';
import { Image as ImageIcon, Eye } from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { Layer1MainMenuRecipe } from '../../../ui-core/recipes/Layer1MainMenuRecipe';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';
import { Layer1ContextGroupedSelector } from './Layer1ContextGroupedSelector';
import type {
  Layer1ContextVariation,
  Layer1ContextMeta,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import { useMainMenuStyleStore } from '../../../ui-core/stores/mainMenuStyleStore';

export interface MainMenuStylePreviewShootoutProps {
  isLight: boolean;
  activeCtx: Layer1ContextVariation;
  activeCtxMeta: Layer1ContextMeta;
  handleSelectCtx: (ctx: Layer1ContextVariation) => void;
  showLivePanel: boolean;
  showShootout: boolean;
}

export const MainMenuStylePreviewShootout: React.FC<
  MainMenuStylePreviewShootoutProps
> = ({
  isLight,
  activeCtx,
  activeCtxMeta,
  handleSelectCtx,
  showLivePanel,
  showShootout,
}) => {
  const store = useMainMenuStyleStore();
  const { variant, applyPreset } = store;

  return (
    <>
      {/* Synchronized Layer 1 Context Variation Bar (Synced across 6A.1, 6A.1M & 7A) */}
      <div
        className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
          isLight
            ? 'bg-amber-50/35 border-amber-200/80'
            : 'bg-amber-500/5 border-amber-500/25'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <Eye className="h-4 w-4" />
            <span>
              Preview match mode real-time linkage (Layer 1 Context Variations · and [6A.1] Full menu preview screen 100% Sync)
            </span>
          </div>
          <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
            active:{' '}
            <strong className="text-amber-500">
              {activeCtxMeta.label} [{activeCtxMeta.headerTitle}]
            </strong>
          </span>
        </div>

        <Layer1ContextGroupedSelector
          activeContext={activeCtx}
          onSelectContext={(ctx) => handleSelectCtx(ctx)}
          tierFilter="all"
          isLight={isLight}
        />
      </div>

      {/* Dedicated 1:1 Full-Scale Current Parameters Live Menu Preview (Exact Mirror of 6A.1) */}
      {showLivePanel && (
        <div
          id="main-menu-live-1to1-preview"
          className={`p-5 rounded-xl border flex flex-col gap-4 ${
            isLight
              ? 'bg-neutral-50/80 border-neutral-200/90 shadow-inner'
              : 'bg-neutral-950/70 border-neutral-800 shadow-inner'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                1:1 LIVE
              </span>
              <span className="text-xs font-bold">
                Full under current parameters MENU 1:1 live preview (420px Standard Width · With Another Screen [6A.1] Visuals 100% Consistent)
              </span>
              <Badge variant="success" size="sm" isLight={isLight}>
                {activeCtxMeta.shortLabel} · {store.variant} · {store.titleFontSizePx}px
              </Badge>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">
              Top arbitrary slider, Preset, Font or match mode changes are managed here with [6A.1] Sync Display (Not compressed by three-scheme comparison column width) 
            </span>
          </div>

          <div
            onClickCapture={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="flex justify-center py-2"
          >
            <Layer1MainMenuRecipe isLight={isLight} activeTab={activeCtx} />
          </div>
        </div>
      )}

      {/* 3-Way Side-by-Side Full Panel Comparison (Shootout Matrix) */}
      {showShootout && (
        <div
          className={`p-4 rounded-xl border flex flex-col gap-4 ${
            isLight
              ? 'bg-neutral-50/70 border-neutral-200/80'
              : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
              <ImageIcon className="h-4 w-4" />
              <span>
                Three-scheme side-by-side comparison: Minimalist large text without icon frame vs Minimalist large text with icon frame vs Legacy Includes Description (Used for intuitive comparison of essential structural differences)
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">
              Note: Three-column side-by-side comparison with locked individual[Icon Box/subtitle]Structural Features; See above for full width and real-time parameter effects"1:1 LIVE"or [6A.1]
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            {/* Column 1: Clean Large Title + Bare Icon (No Description) */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-3 ${
                !store.showDescription && !store.showIconBox && variant === 'large-clean-row'
                  ? isLight
                    ? 'bg-amber-50/40 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-amber-500/5 border-amber-500 ring-2 ring-amber-500/25'
                  : isLight
                  ? 'bg-white border-neutral-200'
                  : 'bg-neutral-900/80 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold block">
                    scheme A (Featured) · Minimalist Large Text + Clean Icon
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Resume Short Title · none Description · No Icon Border
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={
                    !store.showDescription && !store.showIconBox && variant === 'large-clean-row'
                      ? 'primary'
                      : 'secondary'
                  }
                  isLight={isLight}
                  onClick={() =>
                    applyPreset({
                      variant: 'large-clean-row',
                      conciseResumeLabel: true,
                      showDescription: false,
                      showIconBox: false,
                    })
                  }
                >
                  Apply Preset A
                </Button>
              </div>
              <div
                onClickCapture={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex justify-center"
              >
                <StoreSnapshotScope
                  overrides={{
                    mainMenuStyleStore: {
                      variant: 'large-clean-row',
                      conciseResumeLabel: true,
                      showDescription: false,
                      showIconBox: false,
                    },
                  }}
                >
                  <Layer1MainMenuRecipe isLight={isLight} activeTab={activeCtx} />
                </StoreSnapshotScope>
              </div>
            </div>

            {/* Column 2: Clean Large Title + Boxed Icon (No Description) */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-3 ${
                !store.showDescription && store.showIconBox && variant === 'large-clean-row'
                  ? isLight
                    ? 'bg-amber-50/40 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-amber-500/5 border-amber-500 ring-2 ring-amber-500/25'
                  : isLight
                  ? 'bg-white border-neutral-200'
                  : 'bg-neutral-900/80 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold block">
                    scheme B · Minimalist Large Text + Independent Icon Box
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Resume Short Title · none Description · Retain 36×36 Icon Border
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={
                    !store.showDescription && store.showIconBox && variant === 'large-clean-row'
                      ? 'primary'
                      : 'secondary'
                  }
                  isLight={isLight}
                  onClick={() =>
                    applyPreset({
                      variant: 'large-clean-row',
                      conciseResumeLabel: true,
                      showDescription: false,
                      showIconBox: true,
                    })
                  }
                >
                  Apply Preset B
                </Button>
              </div>
              <div
                onClickCapture={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex justify-center"
              >
                <StoreSnapshotScope
                  overrides={{
                    mainMenuStyleStore: {
                      variant: 'large-clean-row',
                      conciseResumeLabel: true,
                      showDescription: false,
                      showIconBox: true,
                    },
                  }}
                >
                  <Layer1MainMenuRecipe isLight={isLight} activeTab={activeCtx} />
                </StoreSnapshotScope>
              </div>
            </div>

            {/* Column 3: Previous Descriptive Two-Line Reference */}
            <div
              className={`p-4 rounded-xl border flex flex-col gap-3 ${
                store.showDescription
                  ? isLight
                    ? 'bg-amber-50/40 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-amber-500/5 border-amber-500 ring-2 ring-amber-500/25'
                  : isLight
                  ? 'bg-white border-neutral-200'
                  : 'bg-neutral-900/80 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold block">
                    scheme C (Legacy Comparison) · Include Below Description
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Resume Match + Two-line subtitle description
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={store.showDescription ? 'primary' : 'secondary'}
                  isLight={isLight}
                  onClick={() =>
                    applyPreset({
                      variant: 'classic-descriptive-row',
                      conciseResumeLabel: false,
                      showDescription: true,
                      showIconBox: true,
                      titleFontSizePx: 14,
                    })
                  }
                >
                  Switch to Legacy
                </Button>
              </div>
              <div
                onClickCapture={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex justify-center"
              >
                <StoreSnapshotScope
                  overrides={{
                    mainMenuStyleStore: {
                      variant: 'classic-descriptive-row',
                      conciseResumeLabel: false,
                      showDescription: true,
                      showIconBox: true,
                      titleFontSizePx: 14,
                    },
                  }}
                >
                  <Layer1MainMenuRecipe isLight={isLight} activeTab={activeCtx} />
                </StoreSnapshotScope>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
