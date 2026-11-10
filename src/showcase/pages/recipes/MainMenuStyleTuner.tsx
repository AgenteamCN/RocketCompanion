import React, { useState } from 'react';
import {
  Sliders, RotateCcw, Copy, Check,
  Code2, Type, Box, Palette,
  Layers, LayoutTemplate, Sparkles, Image as ImageIcon,
  Eye,
} from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { CodeBlock } from '../../CodeBlock';
import { Layer1MainMenuRecipe } from '../../../ui-core/recipes/Layer1MainMenuRecipe';
import { Layer1ContextGroupedSelector } from './Layer1ContextGroupedSelector';
import {
  resolveLayer1ContextSpec,
  type Layer1ContextVariation,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import {
  useMainMenuStyleStore,
  MAIN_MENU_STYLE_PRESETS,
  type MainMenuStyleVariant,
} from '../../../ui-core/stores/mainMenuStyleStore';
import { MainMenuTypographyAndOutlineSection } from './MainMenuTypographyAndOutlineSection';
import { MainMenuIconAndSpacingSection } from './MainMenuIconAndSpacingSection';
import { MainMenuStylePreviewShootout } from './MainMenuStylePreviewShootout';

export interface MainMenuStyleTunerProps {
  isLight?: boolean;
  codeBadge?: string;
  title?: string;
  /** Compact mode when embedded inside 7A inline tuner drawer */
  compact?: boolean;
  /** Whether to render the dedicated 1:1 full-scale active preview inside the tuner (default: !compact) */
  showLivePreview?: boolean;
  /** Active Layer 1 context mode for preview (defaults to synced store.previewContextMode) */
  contextMode?: Layer1ContextVariation;
  onChangeContextMode?: (ctx: Layer1ContextVariation) => void;
}

export const MainMenuStyleTuner: React.FC<MainMenuStyleTunerProps> = React.memo(({
  isLight = false,
  codeBadge = '6A.1M',
  title = 'Layer 1 MENU Minimalist large-text menu full-parameter tuning workbench (Row Border · icon · Font Size · 8 Font Weight Level · Header/Content/Footer padding)',
  compact = false,
  showLivePreview: propShowLivePreview,
  contextMode: propContextMode,
  onChangeContextMode,
}) => {
  const store = useMainMenuStyleStore();
  const {
    variant,
    previewContextMode,
    setPreviewContextMode,
    setVariant,
    setParam,
    setItemIconColor,
    applyPreset,
    resetParams,
    exportConfigCode,
  } = store;

  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showLivePanel, setShowLivePanel] = useState(propShowLivePreview ?? !compact);
  const [showShootout, setShowShootout] = useState(!compact);

  const activeCtxMeta = resolveLayer1ContextSpec(
    propContextMode ?? (previewContextMode as Layer1ContextVariation) ?? 'freeplay'
  );
  const activeCtx = activeCtxMeta.id;

  const handleSelectCtx = (ctx: Layer1ContextVariation) => {
    setPreviewContextMode(ctx);
    onChangeContextMode?.(ctx);
  };

  const handleCopy = async () => {
    const code = exportConfigCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div id="main-menu-style-tuner"
      className={`scroll-mt-6 p-5 rounded-2xl border flex flex-col gap-5 transition-colors ${ isLight
      ? 'bg-white border-neutral-200/90 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800' }`}>
      {/* Top Header & Copy / Export / Reset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-amber-500/15 text-amber-500 border border-amber-500/30">
            {codeBadge}
          </span>
          <Sliders className="h-4 w-4 text-amber-500 shrink-0" />
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
          <Badge variant="primary" size="sm" isLight={isLight}>
            6A.1 ⇄ 6A.1M ⇄ 7A Multi-screen real-time sync
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {!compact && (
            <>
              <Button
                size="sm"
                variant={showLivePanel ? 'primary' : 'secondary'}
                isLight={isLight}
                icon={<Eye className="h-3.5 w-3.5" />}
                onClick={() => setShowLivePanel((prev) => !prev)}
              >
                {showLivePanel ? 'collapse 1:1 Full menu preview' : 'expand 1:1 Full menu preview'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isLight={isLight}
                icon={<Layers className="h-3.5 w-3.5" />}
                onClick={() => setShowShootout((prev) => !prev)}
              >
                {showShootout ? 'Collapse three-way comparison' : 'Expand three-way comparison'}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="secondary"
            isLight={isLight}
            icon={<Code2 className="h-3.5 w-3.5" />}
            onClick={() => setShowCode((prev) => !prev)}
          >
            {showCode ? 'hide config code' : 'view config code'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            isLight={isLight}
            icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={handleCopy}
          >
            {copied ? 'Parameters copied!' : 'Copy parameter config'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isLight={isLight}
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={resetParams}
          >
            reset to default
          </Button>
        </div>
      </div>

      {showCode && (
        <CodeBlock isLight={isLight}
          title="current Layer 1 Main Menu Export full parameter config (Direct copy or solidify to src/ui-core/stores/mainMenuStyleStore.ts)"
          code={exportConfigCode()} />
      )}

      {/* Quick Core Hypothesis Bar: Concise "Resume", No Description, Bare/Boxed Icon, Font Family */}
      <div className={`p-3.5 rounded-xl border flex flex-col gap-3 ${ isLight
        ? 'bg-amber-50/40 border-amber-200/80' : 'bg-amber-500/5 border-amber-500/30' }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <Sparkles className="h-4 w-4" />
            <span>Core minimalist visual toggle (Experimental Priority: Keep Only [border + icon + Large Title], Remove Bottom Description)</span>
          </div>

          {/* 3 Style Archetype Switcher */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'large-clean-row', label: 'style 1 (default): Minimalist Large Single Line' },
                { id: 'mono-watermark-row', label: 'style 2: Mono Large Text + Background Watermark Icon' },
                { id: 'classic-descriptive-row', label: 'Style 3: Include Below Description' },
              ] as { id: MainMenuStyleVariant; label: string }[]
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                  variant === v.id
                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 pt-1">
          <ToggleSwitch checked={store.conciseResumeLabel}
            onCheckedChange={(v) => setParam('conciseResumeLabel', v)}
            label="Minimalist Resume Title (Resume Replace Resume Match)" isLight={isLight} />
          <ToggleSwitch checked={store.showDescription} onCheckedChange={(v) => setParam('showDescription', v)}
            label="Display Below Description subtitle" isLight={isLight} />
          <ToggleSwitch checked={store.showIconBox} onCheckedChange={(v) => setParam('showIconBox', v)}
            label="Display icon with inner frame (Icon Box)" isLight={isLight} />
          <ToggleSwitch checked={store.showIcon} onCheckedChange={(v) => setParam('showIcon', v)}
            label="Show Left Icon (Icon)" isLight={isLight} />
          <ToggleSwitch checked={store.showShortcutBadge} onCheckedChange={(v) => setParam('showShortcutBadge', v)}
            label="show ESC Keycap" isLight={isLight} />
          <ToggleSwitch checked={store.showRightArrow} onCheckedChange={(v) => setParam('showRightArrow', v)}
            label="Show Right Arrow (>)" isLight={isLight} />
          <ToggleSwitch checked={store.showDividers} onCheckedChange={(v) => setParam('showDividers', v)}
            label="Show group divider" isLight={isLight} />
        </div>
      </div>

      {/* 6 Curated Quick Presets Bar */}
      <div className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${ isLight
        ? 'bg-neutral-50/80 border-neutral-200/80' : 'bg-neutral-950/60 border-neutral-800' }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-amber-500" />
            <span>6 Featured Group MENU One-click visual scheme loading (Curated Menu Style Presets)</span>
          </span>
          <span className="text-[11px] font-mono text-neutral-400">Click any preset to view below A–E Continue fine-tuning parameter groups and copy configuration with one click</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {MAIN_MENU_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.params)}
              className={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-amber-50/50 border-neutral-200 hover:border-amber-400'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 hover:border-amber-500/60'
              }`}
            >
              <span className="text-xs font-bold text-amber-500">{preset.label}</span>
              <span className={`text-[11px] leading-snug ${ isLight ? 'text-neutral-600' : 'text-neutral-400' }`}>
                {preset.subtitle}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Group A: Row Outer Box & List Spacing Geometry */}
      <div className={`p-4 rounded-xl border flex flex-col gap-3.5 ${ isLight
        ? 'bg-neutral-50/70 border-neutral-200/80' : 'bg-neutral-950/50 border-neutral-800' }`}>
        <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
          <Box className="h-4 w-4" />
          <span>A. Row outer frame geometry, Liner and list spacing (Row Outer Frame &amp; List Spacing)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SliderControl label="Horizontal Row Padding (itemPadX)" value={store.itemPaddingXPx} min={6} max={36} step={1} unit="px"
            editable allowOutOfBoundsInput colorScheme="amber" onChange={(v) => setParam('itemPaddingXPx', v)}
            isLight={isLight} />
          <SliderControl label="Row Padding (itemPadY)" value={store.itemPaddingYPx} min={4} max={32} step={1} unit="px"
            editable allowOutOfBoundsInput colorScheme="amber" onChange={(v) => setParam('itemPaddingYPx', v)}
            isLight={isLight} />
          <SliderControl label="Min Row Height (itemMinH)" value={store.itemMinHeightPx} min={36} max={100} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('itemMinHeightPx', v)} isLight={isLight} />
          <SliderControl label="Row Corner Radius (itemRadius)" value={store.itemRadiusPx} min={0} max={28} step={1} unit="px"
            editable allowOutOfBoundsInput colorScheme="sky" onChange={(v) => setParam('itemRadiusPx', v)}
            isLight={isLight} />
          <SliderControl label="Vertical row-to-row spacing (itemGap)" value={store.itemGapPx} min={0} max={24} step={1} unit="px"
            editable allowOutOfBoundsInput colorScheme="emerald" onChange={(v) => setParam('itemGapPx', v)}
            isLight={isLight} />
          <SliderControl label="Divider vertical margins (dividerMarginY)" value={store.dividerMarginYPx} min={-12} max={16}
            step={1} unit="px" editable allowOutOfBoundsInput colorScheme="emerald"
            onChange={(v) => setParam('dividerMarginYPx', v)} isLight={isLight} />
          <SliderControl label="Menu frame buffer padding (containerPad)" value={store.menuContainerPaddingPx} min={0} max={16}
            step={1} unit="px" editable allowOutOfBoundsInput colorScheme="sky"
            onChange={(v) => setParam('menuContainerPaddingPx', v)} isLight={isLight} />
          <SliderControl label="Row Border Width (borderWidth)" value={store.itemBorderWidthPx} min={0} max={3} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="sky"
            onChange={(v) => setParam('itemBorderWidthPx', v)} isLight={isLight} />
        </div>
      </div>

      <MainMenuTypographyAndOutlineSection isLight={isLight} />
      <MainMenuIconAndSpacingSection isLight={isLight} />

      <MainMenuStylePreviewShootout
        isLight={isLight}
        activeCtx={activeCtx}
        activeCtxMeta={activeCtxMeta}
        handleSelectCtx={handleSelectCtx}
        showLivePanel={showLivePanel}
        showShootout={showShootout}
      />
    </div>
  );
});

MainMenuStyleTuner.displayName = 'MainMenuStyleTuner';
