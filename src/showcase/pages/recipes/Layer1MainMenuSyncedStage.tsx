import React, { Suspense, lazy } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { CodeBlock } from '../../CodeBlock';
import { Badge } from '../../../ui-core/primitives/Badge';
import { AuditTicketHeader } from '../../components/AuditTicketHeader';
import { LocalPanelSizingTuner } from './LocalPanelSizingTuner';
import { Layer1ContextGroupedSelector } from './Layer1ContextGroupedSelector';
import { resolveLayer1ContextSpec } from '../../../ui-core/recipes/layer1MenuContextSpecs';
import { useMainMenuStyleStore } from '../../../ui-core/stores/mainMenuStyleStore';

const Layer1MainMenuRecipe = lazy(() =>
  import('../../../ui-core/recipes/Layer1MainMenuRecipe').then((m) => ({
    default: m.Layer1MainMenuRecipe,
  }))
);

const MainMenuStyleTuner = lazy(() =>
  import('./MainMenuStyleTuner').then((m) => ({
    default: m.MainMenuStyleTuner,
  }))
);

export interface Layer1MainMenuSyncedStageProps {
  isLight: boolean;
  previewWrapClass: string;
  suspenseFallback: React.ReactNode;
  onSelectRecipeId: (itemId: string) => void;
}

/**
 * Isolated Stage for `6A.1` (`recipe-6a-1-main`) so subscribing to `useMainMenuStyleStore`
 * only happens when `6A.1` is mounted, keeping all other 6A recipes 100% decoupled.
 */
export const Layer1MainMenuSyncedStage: React.FC<Layer1MainMenuSyncedStageProps> =
  React.memo(({ isLight, previewWrapClass, suspenseFallback, onSelectRecipeId }) => {
    const {
      previewContextMode,
      setPreviewContextMode,
      variant,
      titleFontSizePx,
      titleFontFamily,
      showDescription,
      showIconBox,
    } = useMainMenuStyleStore();
    const [showInlineStyleTuner, setShowInlineStyleTuner] = React.useState(false);
    const activeCtxMeta = resolveLayer1ContextSpec(previewContextMode);
    const activeCtx = activeCtxMeta.id;

    return (
      <div id="recipe-6a-1-main" className="scroll-mt-6 flex flex-col gap-4">
        <div
          onClickCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={previewWrapClass}
        >
          <Suspense fallback={suspenseFallback}>
            <div className="flex flex-col gap-2 items-center w-full max-w-[460px]">
              <Layer1MainMenuRecipe isLight={isLight} activeTab={activeCtx} />
              <AuditTicketHeader
                label={`${activeCtxMeta.shortLabel} (${activeCtxMeta.headerTitle})`}
                description={activeCtxMeta.description}
                referenceCode="6A.1"
                componentName="Layer1MainMenuRecipe"
                sourceFile="src/ui-core/recipes/Layer1MainMenuRecipe.tsx"
                subViewFile="src/ui-core/recipes/layer1MenuContextSpecs.ts"
                stateId={activeCtx}
                activeProps={{ activeTab: activeCtx }}
                badgeColor="amber"
                isLight={isLight}
              />
            </div>
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 flex items-center justify-center font-mono font-bold text-xs">
              6A.1
            </span>
            <h2 className="text-base font-bold">
              Layer 1 Root pause menu preview (MENU · and [6A.1M] Tuning console and multi-screen match mode 100% real-time sync)
            </h2>
            <Badge variant="success" size="sm" isLight={isLight}>
              {activeCtxMeta.shortLabel} [{activeCtxMeta.headerTitle}] · {titleFontSizePx}px
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowInlineStyleTuner((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                showInlineStyleTuner
                  ? 'bg-amber-500 text-neutral-950 border-amber-500'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {showInlineStyleTuner
                  ? 'Collapse Inline [6A.1M] Adjustment Panel ^'
                  : 'Expand in-place on current page [6A.1M] Adjustment Panel v'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSelectRecipeId('main-menu-style-tuner')}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-pointer transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Open [6A.1M] Style Tuner</span>
            </button>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg border ${
                isLight
                  ? 'bg-amber-50/80 border-amber-200 text-amber-800'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Read-only Preview: Keep Original Hover animation, Click navigation intercepted</span>
            </span>
          </div>
        </div>
        <div
          className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
            isLight ? 'bg-amber-50/40 border-amber-200/80' : 'bg-amber-500/5 border-amber-500/25'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
              <Eye className="h-4 w-4" />
              <span>
                Match mode category switch (Free Play / Exhibition / Match Lobby / Online Match / Online Warmup / Training · and [6A.1M] Bidirectional real-time sync)
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
              Current Style: {variant} · {titleFontFamily === 'mono' ? 'JetBrains Mono' : 'Apple Sans'}{' '}
              {titleFontSizePx}px · {showIconBox ? 'Icon Border' : 'No Icon Border'} ·{' '}
              {showDescription ? 'includes Description' : 'none Description'}
            </span>
          </div>
          <Layer1ContextGroupedSelector
            activeContext={activeCtx}
            onSelectContext={(ctx) => setPreviewContextMode(ctx)}
            tierFilter="all"
            isLight={isLight}
          />
        </div>
        <LocalPanelSizingTuner
          code="6A.1"
          panelId="layer1-main"
          label="Layer 1 Main menu container size contract (MENU Outer Shell)"
          recommendation="recommended Auto-Fit: Switch minimalist large text / show Description / Container height automatically scales based on the number of mode buttons, Never leave bottom white space"
          isLight={isLight}
        />
        {showInlineStyleTuner && (
          <Suspense fallback={suspenseFallback}>
            <MainMenuStyleTuner
              isLight={isLight}
              codeBadge="6A.1M"
              showLivePreview={false}
              contextMode={activeCtx}
              onChangeContextMode={setPreviewContextMode}
            />
          </Suspense>
        )}
        <CodeBlock
          isLight={isLight}
          title="Layer1MainMenuRecipe.tsx (Decoupled MainMenuRow + useMainMenuStyleStore)"
          code={`const { panels } = useMenuLayoutStore();
const sizing = panels['layer1-main']; // default: { mode: 'auto', width: 420, minHeight: 240, maxHeight: 540 }
const menuStyle = useMainMenuStyleStore();
return (
  <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
    <PanelHeader ... />
    <PanelContent scrollable>
      <MenuContainer gapPx={menuStyle.itemGapPx} paddingPx={menuStyle.menuContainerPaddingPx}>
        <MainMenuRow slotId="resume" title={menuStyle.conciseResumeLabel ? 'Resume' : 'Resume Match'} shortcut="ESC" variant="primary" styleParams={menuStyle} />
        <MenuDivider marginYPx={menuStyle.dividerMarginYPx} />
        <MainMenuRow slotId="play" title="Play" hasArrow styleParams={menuStyle} />
        <MainMenuRow slotId="garage" title="Garage" hasArrow styleParams={menuStyle} />
        <MainMenuRow slotId="settings" title="Settings" hasArrow styleParams={menuStyle} />
      </MenuContainer>
    </PanelContent>
    <PanelFooter ... />
  </PanelContainer>
);`}
        />
      </div>
    );
  });

Layer1MainMenuSyncedStage.displayName = 'Layer1MainMenuSyncedStage';
