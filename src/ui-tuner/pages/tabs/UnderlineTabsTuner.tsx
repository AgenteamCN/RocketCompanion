import React, { useState } from 'react';
import {
  Sliders,
  RotateCcw,
  Copy,
  Check,
  Code2,
} from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { CodeBlock } from '../../CodeBlock';
import { useUnderlineTabsStore } from '../../../ui-core/stores/underlineTabsStore';
import {
  UnderlineTabsPresetAndTypographyBar,
  UnderlineTabsStandalonePreviewCard,
} from './UnderlineTabsStandalonePreviewCard';

export interface UnderlineTabsTunerProps {
  isLight?: boolean;
  title?: string;
  codeBadge?: string;
  /** Whether to render the standalone Settings & Garage dual-bar live preview inside the tuner card */
  showStandalonePreview?: boolean;
}

/**
 * [Decoupled Tuner] UnderlineTabsTuner (L1.1)
 * Standalone visual inspector for `UnderlineTabs` (used by Settings 4/5-Tab bar, Garage 5-Tab bar, and Dev floating windows).
 * Syncs across L1.1 (`TabsPage` `#l1-underline-tabs`), L6 (`RecipesPage`), and L7 (`7A Menu Layer Sandbox`).
 */
export const UnderlineTabsTuner: React.FC<UnderlineTabsTunerProps> = React.memo(({
  isLight = false,
  title = 'L1.1 · UnderlineTabs Sliding underline tab bar tuner (font size · icon size · spacing · Font Family · Font Weight)',
  codeBadge = '6A.4T',
  showStandalonePreview = false,
}) => {
  const {
    fontSize,
    iconSize,
    iconGap,
    paddingX,
    paddingY,
    indicatorHeight,
    showIcons,
    fontFamily,
    activeFontWeight,
    inactiveFontWeight,
    setToken,
    resetTokens,
    exportConfigCode,
  } = useUnderlineTabsStore();

  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const handleCopy = async () => {
    const code = exportConfigCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      id="underline-tabs-tuner"
      className={`scroll-mt-6 p-5 md:p-6 rounded-2xl border flex flex-col gap-5 w-full transition-colors ${
        isLight
          ? 'bg-white border-neutral-200/90 shadow-2xs'
          : 'bg-neutral-900/70 border-neutral-800'
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/70 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          {codeBadge && (
            <span className="px-2 h-6 rounded-md bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold font-mono text-xs shrink-0">
              {codeBadge}
            </span>
          )}
          <Sliders className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-xs font-bold">{title}</span>
          <Badge variant="amber" size="sm" isLight={isLight}>
            L1.1 ⇄ L6 ⇄ L7 Real-time Sync
          </Badge>
          <span
            className={`text-[11px] font-mono ${
              isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            Font {fontSize}px ({fontFamily === 'mono' ? 'JetBrains Mono' : 'Inter Sans'} ·{' '}
            {activeFontWeight}/{inactiveFontWeight}) · Icon{' '}
            {showIcons ? `${iconSize}px (gap ${iconGap}px)` : 'Hide'} · Pad {paddingX}×{paddingY}px · Line{' '}
            {indicatorHeight}px
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            isLight={isLight}
            icon={<Code2 className="h-3.5 w-3.5" />}
            onClick={() => setShowCode((v) => !v)}
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
            {copied ? 'Copied Tabs config!' : 'Copy Tabs config'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isLight={isLight}
            icon={<RotateCcw className="h-3 w-3" />}
            onClick={resetTokens}
          >
            reset to default
          </Button>
        </div>
      </div>

      {/* Quick Presets + Toggles + Font Family & Font Weight Switchers */}
      <UnderlineTabsPresetAndTypographyBar isLight={isLight} />

      {/* 3-Column Non-Truncated Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SliderControl
          label="Label Font Size (fontSize)"
          value={fontSize}
          min={11}
          max={22}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="amber"
          onChange={(v) => setToken('fontSize', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Label SVG icon size (iconSize)"
          value={iconSize}
          min={12}
          max={32}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="amber"
          onChange={(v) => setToken('iconSize', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Icon and text spacing (iconGap)"
          value={iconGap}
          min={2}
          max={20}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="amber"
          onChange={(v) => setToken('iconGap', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Label Horizontal Padding (paddingX)"
          value={paddingX}
          min={0}
          max={32}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="sky"
          onChange={(v) => setToken('paddingX', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Label Vertical Padding (paddingY)"
          value={paddingY}
          min={0}
          max={24}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="emerald"
          onChange={(v) => setToken('paddingY', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Bottom underline thickness (indicatorHeight)"
          value={indicatorHeight}
          min={1}
          max={6}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="amber"
          onChange={(v) => setToken('indicatorHeight', v)}
          isLight={isLight}
        />
      </div>

      {/* Standalone Dual Live Preview (Settings 5-Tab & Garage 5-Tab) */}
      {showStandalonePreview && (
        <UnderlineTabsStandalonePreviewCard isLight={isLight} />
      )}

      {showCode && (
        <CodeBlock
          isLight={isLight}
          title="src/ui-core/stores/underlineTabsStore.ts & UnderlineTabs Config Export"
          code={`${exportConfigCode()}

// Use Default Directly <UnderlineTabs /> Auto-sync font size (${fontSize}px) Match Icon Size (${iconSize}px)
<UnderlineTabs
  items={tabs}
  activeId={activeTab}
  onChange={setActiveTab}
  isLight={isLight}
/>`}
        />
      )}
    </div>
  );
});

UnderlineTabsTuner.displayName = 'UnderlineTabsTuner';
