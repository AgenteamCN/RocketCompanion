import React, { useState } from 'react';
import {
  Sliders,
  RotateCcw,
  Copy,
  Check,
  Code2,
  Sparkles,
  Palette,
} from 'lucide-react';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { useSettingActionRowStore } from '../../../ui-core/stores/settingRowStore';
import { SettingActionRowArchetypeSections } from './SettingActionRowArchetypeSections';
import { SettingActionRowStyleControls } from './SettingActionRowStyleControls';

export interface SettingActionRowTunerProps {
  isLight?: boolean;
  title?: string;
  codeBadge?: string;
  /** Whether to render the standalone interactive preview inside the tuner card (default: false when co-located above Settings recipe) */
  showStandalonePreview?: boolean;
}

const ICON_COLOR_SWATCHES: { value: string; label: string; dotClass: string }[] = [
  { value: '', label: 'Default Neutral Gray (Neutral Gray)', dotClass: 'bg-neutral-400' },
  { value: 'text-amber-500', label: 'warm orange (Amber)', dotClass: 'bg-amber-500' },
  { value: 'text-emerald-500', label: 'Emerald (Emerald)', dotClass: 'bg-emerald-500' },
  { value: 'text-sky-400', label: 'Sky Blue (Sky)', dotClass: 'bg-sky-400' },
  { value: 'text-rose-400', label: 'Rose Pink (Rose)', dotClass: 'bg-rose-400' },
];

/**
 * [Decoupled Tuner] SettingActionRowTuner
 * Unified visual inspector for all Settings row archetypes across Gameplay, Audio, Display, and Advanced:
 * 1. `SettingActionRow` (Icon + Title + Configure Button)
 * 2. `SettingToggleRow` (Icon + Title + ToggleSwitch - including `Ball Cam Indicator` Crosshair & `Ball Trajectory Predictor` composite row)
 * 3. `SettingSliderRow` (Icon + Title + Inline/Stacked Progress Bar + Drag-Only Readout)
 * 4. `SettingSegmentedRow` (Icon + Title + SegmentedSwitch or DropdownMenu)
 * 5. `SettingPresetCustomRow` (UI Scaling & Render Scale shared preset + custom slide-reveal component)
 * 6. `SettingDeveloperStatusRow` (Developer Settings Disabled/Active status badge row)
 * Syncs across L1 (`TabsPage`), L6 (`RecipesPage` #recipe-6a-4-settings), and L7 (`7A Menu Layer Sandbox`).
 */
export const SettingActionRowTuner: React.FC<SettingActionRowTunerProps> = React.memo(({
  isLight = false,
  title = 'Settings Unified setting row tuner (Action · Toggle · Slider Read-only Drag · Preset+Custom · Dev Status · Telemetry)',
  codeBadge = '6A.4S',
  showStandalonePreview = false,
}) => {
  const {
    bordered,
    showDescription,
    paddingX,
    paddingY,
    titleFontSize,
    showButtonArrow,
    defaultIconColor,
    sliderLayout,
    sliderTrackWidth,
    setToken,
    updateTokens,
    resetTokens,
    exportConfigCode,
  } = useSettingActionRowStore();

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

  const applyPreset = (
    preset: 'apple-inline' | 'ultra-tight' | 'standard-card' | 'borderless-desc'
  ) => {
    if (preset === 'apple-inline') {
      updateTokens({
        bordered: false,
        showDescription: false,
        paddingX: 10,
        paddingY: 6,
        rowGap: 0,
        borderRadius: 8,
        iconSize: 22,
        iconGap: 14,
        titleFontSize: 14,
        buttonFontSize: 12,
        buttonPaddingX: 10,
        buttonPaddingY: 5,
        buttonRadius: 6,
        trajectoryRowLayout: 'inline',
        sliderLayout: 'inline',
        sliderTrackWidth: 200,
        sliderEditableInUserMode: false,
        sliderEditableInDevMode: false,
        segmentedLayout: 'inline',
        pacingPriorityControl: 'segmented-inline',
        advancedBordered: false,
        advancedShowBadges: false,
      });
    } else if (preset === 'ultra-tight') {
      updateTokens({
        bordered: false,
        showDescription: false,
        paddingX: 8,
        paddingY: 3,
        rowGap: 0,
        borderRadius: 7,
        iconSize: 20,
        iconGap: 12,
        titleFontSize: 13,
        buttonFontSize: 11,
        buttonPaddingX: 9,
        buttonPaddingY: 3,
        buttonRadius: 5,
        trajectoryRowLayout: 'inline',
        sliderLayout: 'inline',
        sliderTrackWidth: 180,
        sliderEditableInUserMode: false,
        sliderEditableInDevMode: false,
        segmentedLayout: 'inline',
        pacingPriorityControl: 'segmented-inline',
        advancedBordered: false,
        advancedShowBadges: false,
      });
    } else if (preset === 'standard-card') {
      updateTokens({
        bordered: true,
        showDescription: true,
        paddingX: 12,
        paddingY: 8,
        rowGap: 6,
        borderRadius: 10,
        iconSize: 20,
        iconGap: 12,
        titleFontSize: 13,
        descriptionFontSize: 11,
        buttonFontSize: 12,
        buttonPaddingX: 10,
        buttonPaddingY: 5,
        buttonRadius: 7,
        trajectoryRowLayout: 'stacked',
        sliderLayout: 'stacked',
        segmentedLayout: 'stacked',
        pacingPriorityControl: 'segmented-stacked',
        advancedBordered: true,
        advancedShowBadges: true,
      });
    } else if (preset === 'borderless-desc') {
      updateTokens({
        bordered: false,
        showDescription: true,
        paddingX: 10,
        paddingY: 6,
        rowGap: 0,
        borderRadius: 8,
        iconSize: 22,
        iconGap: 14,
        titleFontSize: 14,
        descriptionFontSize: 11,
        buttonFontSize: 12,
        buttonPaddingX: 10,
        buttonPaddingY: 5,
        buttonRadius: 6,
      });
    }
  };

  return (
    <div id="setting-action-row-tuner"
      className={`scroll-mt-6 p-5 md:p-6 rounded-2xl border flex flex-col gap-5 w-full transition-colors ${ isLight
      ? 'bg-white border-neutral-200/90 shadow-2xs' : 'bg-neutral-900/70 border-neutral-800' }`}>
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/70 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          {codeBadge && (
            <span className="px-2 h-6 rounded-md bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold font-mono text-xs shrink-0">
              {codeBadge}
            </span>
          )}
          <Sliders className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-xs font-bold">{title}</span>
          <Badge variant="amber" size="sm" isLight={isLight}>
            4 Global sub-page consistency · L1 ⇄ L6 ⇄ L7 Real-time Sync
          </Badge>
          <span className={`text-[11px] font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            {bordered ? 'Has Border' : 'No Border(Apple Hover)'} ·{' '}
            {showDescription ? 'With Subtitle' : 'Hide Inline Description(Hover Footer Tip)'} · Title{' '}
            {titleFontSize}px · Slider {sliderLayout}({sliderTrackWidth}px) · Pad {paddingX}×{paddingY}px
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
            {copied ? 'config copied!' : 'Copy Row Config'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isLight={isLight}
            icon={<RotateCcw className="h-3 w-3" />}
            onClick={() => resetTokens()}
          >
            reset to default
          </Button>
        </div>
      </div>

      {/* Quick Presets + Structural Toggles */}
      <div className={`p-3.5 rounded-xl border flex flex-col gap-3 ${ isLight
        ? 'bg-neutral-50/80 border-neutral-200/80' : 'bg-neutral-950/50 border-neutral-800/80' }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-400 flex items-center gap-1 font-semibold">
              <Sparkles className="h-3 w-3 text-amber-500" /> One-click shape preset:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('apple-inline')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                !bordered && !showDescription && paddingY >= 5 && sliderLayout === 'inline'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Apple System Settings Style: No Border + No Inline Description + Single-line Slider + Single-line trajectory toggle + Dropdown Long Option"
            >
              1. Apple Borderless single-line preset (default recommendation · 4Page Font Size14px Align · Single line Slider)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('ultra-tight')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                !bordered && !showDescription && paddingY < 5
                  ? 'bg-amber-500 text-white border-amber-500'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Ultra-compact frameless single line: padY=3px, btnPadY=3px, rowGap=0px"
            >
              2. Ultra-compact high-density single line (padY=3px · 0Dead Zone)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('borderless-desc')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                !bordered && showDescription
                  ? 'bg-amber-500 text-white border-amber-500'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Remove Outer Frame, Keep Bottom Description, Hover Overall Wrap"
            >
              3. Apple Frameless with Subtitle (No Border + Display Inline Description)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('standard-card')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                bordered && showDescription
                  ? 'bg-amber-500 text-white border-amber-500'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
              title="Traditional standalone framed card + Double-line Slider + Bottom Description subtitle"
            >
              4. Traditional framed grid card (Has Border + Double-row Stack + includes Badge)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <div className="flex items-center gap-5 flex-wrap">
            <ToggleSwitch checked={bordered} onCheckedChange={(v) => setToken('bordered', v)}
              label="Display persistent frame and base (bordered)" variant="neutral" isLight={isLight} />
            <ToggleSwitch checked={showDescription} onCheckedChange={(v) => setToken('showDescription', v)}
              label="Display Inline Description (Default Off: Hover at Bottom Footer show)" variant="neutral" isLight={isLight} />
            <ToggleSwitch checked={showButtonArrow} onCheckedChange={(v) => setToken('showButtonArrow', v)}
              label="Display button right arrow (showButtonArrow)" variant="neutral" isLight={isLight} />
          </div>

          {/* Global Default Icon Color Swatch Picker */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
              <Palette className="h-3 w-3" /> Global default icon color:
            </span>
            {ICON_COLOR_SWATCHES.map((sw) => {
              const active = defaultIconColor === sw.value;
              return (
                <button
                  key={sw.label}
                  type="button"
                  onClick={() => setToken('defaultIconColor', sw.value)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border transition-all cursor-pointer ${
                    active
                      ? isLight
                        ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
                        : 'bg-neutral-100 text-neutral-950 border-neutral-100 font-bold'
                      : isLight
                      ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  }`}
                  title={`Set Global Default SVG Icon Color: ${sw.label} (Single line still passable iconColor Independent Override)`}
                >
                  <span className={`h-2 w-2 rounded-full ${sw.dotClass}`} />
                  <span>{sw.value === '' ? 'Default Gray' : sw.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <SettingActionRowStyleControls isLight={isLight} />

      <SettingActionRowArchetypeSections
        isLight={isLight}
        showStandalonePreview={showStandalonePreview}
        showCode={showCode}
      />
    </div>
  );
});

SettingActionRowTuner.displayName = 'SettingActionRowTuner';
