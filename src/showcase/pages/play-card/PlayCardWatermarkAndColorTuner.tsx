import React from 'react';
import { Type, Image as ImageIcon } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import {
  usePlayCardStyleStore,
  type MonoTitleAnchor,
  type InlineHeaderLayoutMode,
} from '../../../ui-core/stores/playCardStyleStore';
import { JETBRAINS_MONO_WEIGHT_OPTIONS } from '../../../ui-core/tokens/colors';
import { PlayCardWatermarkGeometrySection } from './PlayCardWatermarkGeometrySection';

export interface PlayCardWatermarkAndColorTunerProps {
  isLight: boolean;
}

export const PlayCardWatermarkAndColorTuner: React.FC<PlayCardWatermarkAndColorTunerProps> = ({
  isLight,
}) => {
  const store = usePlayCardStyleStore();
  const { variant, setVariant, setParam } = store;

  return (
    <>
      {/* Group C: Style 3 Specific - JetBrains Mono + 30% Giant Watermark Icon */}
      <div className={`p-4 rounded-xl border flex flex-col gap-4 ${ variant === 'mono-giant-watermark' ? isLight
        ? 'bg-amber-50/40 border-amber-400/80' : 'bg-amber-500/5 border-amber-500/40' : isLight
        ? 'bg-neutral-50/70 border-neutral-200/80' : 'bg-neutral-950/50 border-neutral-800' }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <ImageIcon className="h-4 w-4" />
            <span>C. Style three exclusive parameters: JetBrains Mono Large heading + Background Large Watermark Icon (default 30% Opacity)</span>
          </div>
          {variant !== 'mono-giant-watermark' && (
            <button
              type="button"
              onClick={() => setVariant('mono-giant-watermark')}
              className="text-[11px] font-mono font-bold text-amber-500 hover:underline cursor-pointer"
            >
              Switch to Style 3 to preview in the main panel below &rarr;
            </button>
          )}
        </div>

        {/* C1: JetBrains Mono Title Typography */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SliderControl label="Mono Header Font Size (monoTitleSize)" value={store.monoTitleSizePx} min={13} max={38} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('monoTitleSizePx', v)} isLight={isLight} />
          <SliderControl label="Mono Letter Spacing (letterSpacing)" value={store.monoLetterSpacingEm} min={-0.08} max={0.15}
            step={0.01} unit="em" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('monoLetterSpacingEm', v)} isLight={isLight} />
          <SliderControl label="Mono Line Height (lineHeight)" value={store.monoLineHeight} min={0.95} max={1.6} step={0.05}
            editable allowOutOfBoundsInput colorScheme="amber" onChange={(v) => setParam('monoLineHeight', v)}
            isLight={isLight} />
        </div>

        {/* Official 8 JetBrains Mono Font Weights */}
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
            JetBrains Mono Official Font Weight (Font Weight):
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            {JETBRAINS_MONO_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.weight}
                type="button"
                onClick={() => setParam('monoTitleWeight', opt.weight)}
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontWeight: opt.weight,
                }}
                className={`py-1.5 px-2 rounded-lg text-xs border cursor-pointer transition-all ${
                  store.monoTitleWeight === opt.weight
                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* C2: Title Anchor & Optional Overlays */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">Large text alignment anchor (monoTitleAnchor):</span>
            {(
              [
                { id: 'center-left', label: 'Middle Left (Center-Left)' },
                { id: 'center', label: 'Center (Center)' },
                { id: 'bottom-left', label: 'Bottom Left (Bottom-Left)' },
                { id: 'top-left', label: 'top left (Top-Left)' },
                { id: 'bottom-right', label: 'bottom right (Bottom-Right)' },
              ] as { id: MonoTitleAnchor; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParam('monoTitleAnchor', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                  store.monoTitleAnchor === opt.id
                    ? 'bg-amber-500 text-white border-amber-500 font-bold'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <ToggleSwitch checked={store.monoUppercase} onCheckedChange={(v) => setParam('monoUppercase', v)}
              label="Uppercase Header (UPPERCASE)" isLight={isLight} />
            <ToggleSwitch checked={store.monoShowDescription}
              onCheckedChange={(v) => setParam('monoShowDescription', v)} label="Additional Display Description"
              isLight={isLight} />
            <ToggleSwitch checked={store.monoShowBadge} onCheckedChange={(v) => setParam('monoShowBadge', v)}
              label="Display top right included Badge" isLight={isLight} />
          </div>
        </div>

        {/* C3 & C4: Giant Watermark Icon Controls, Anchor & Color Mode */}
        <PlayCardWatermarkGeometrySection isLight={isLight} />
      </div>

      {/* Group D: Style 1 & Style 2 Specific Controls */}
      <div className={`p-4 rounded-xl border flex flex-col gap-4 ${ isLight
        ? 'bg-neutral-50/70 border-neutral-200/80' : 'bg-neutral-950/50 border-neutral-800' }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <Type className="h-4 w-4" />
            <span>D. style 1 &amp; Style 2 exclusive parameters: Foreground Icon Container, Inline Title Spacing and Description Typography</span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <ToggleSwitch checked={store.showIconBox} onCheckedChange={(v) => setParam('showIconBox', v)}
              label="Show Foreground Icon Border Box (showIconBox)" isLight={isLight} />
            <ToggleSwitch checked={store.titleUseMonoFont} onCheckedChange={(v) => setParam('titleUseMonoFont', v)}
              label="Title Use JetBrains Mono Font" isLight={isLight} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SliderControl label="Foreground Icon size (iconSize)" value={store.iconSizePx} min={12} max={36} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('iconSizePx', v)} isLight={isLight} />
          <SliderControl label="Foreground Icon Box Padding (boxPad)" value={store.iconBoxPaddingPx} min={0} max={16} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('iconBoxPaddingPx', v)} isLight={isLight} />
          <SliderControl label="Title title font size (titleSize)" value={store.titleFontSizePx} min={11} max={24} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('titleFontSizePx', v)} isLight={isLight} />
          <SliderControl label="Description font size (descSize)" value={store.descFontSizePx} min={10} max={16} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="sky"
            onChange={(v) => setParam('descFontSizePx', v)} isLight={isLight} />
          <SliderControl label="[style 2] Icon and Title Horizontal Spacing" value={store.inlineIconTitleGapPx} min={4} max={24}
            step={1} unit="px" editable allowOutOfBoundsInput colorScheme="emerald"
            onChange={(v) => setParam('inlineIconTitleGapPx', v)} isLight={isLight} />
          <SliderControl label="[style 2] Top Row & Description spacing" value={store.inlineHeaderMarginBottomPx} min={0} max={24}
            step={1} unit="px" editable allowOutOfBoundsInput colorScheme="emerald"
            onChange={(v) => setParam('inlineHeaderMarginBottomPx', v)} isLight={isLight} />
          <SliderControl label="[style 1] Top Row & Title spacing" value={store.style1TopRowMarginBottomPx} min={0} max={24}
            step={1} unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('style1TopRowMarginBottomPx', v)} isLight={isLight} />
          <SliderControl label="[style 1] Title and Description spacing" value={store.style1TitleMarginBottomPx} min={0}
            max={16} step={1} unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('style1TitleMarginBottomPx', v)} isLight={isLight} />
        </div>

        {/* Style 1 & 2 Official Font Weights */}
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
            [style 1 &amp; Two] Title Title Font Weight (Font Weight):
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            {JETBRAINS_MONO_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.weight}
                type="button"
                onClick={() => setParam('titleFontWeight', opt.weight)}
                style={{ fontWeight: opt.weight }}
                className={`py-1.5 px-2 rounded-lg text-xs border cursor-pointer transition-all ${
                  store.titleFontWeight === opt.weight
                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              [style 2] First Line [Icon + Title] Alignment Type:
            </span>
            {(
              [
                { id: 'left-pack', label: 'Left Aligned Adjacent (Left-Pack)' },
                { id: 'space-between', label: 'Justified (Space-Between)' },
              ] as { id: InlineHeaderLayoutMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParam('inlineHeaderLayout', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                  store.inlineHeaderLayout === opt.id
                    ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">Description Max Lines (lineClamp):</span>
            {([1, 2, 3, 0] as const).map((lines) => (
              <button
                key={lines}
                type="button"
                onClick={() => setParam('descLineClamp', lines)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                  store.descLineClamp === lines
                    ? 'bg-amber-500 text-white border-amber-500 font-bold'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                }`}
              >
                {lines === 0 ? 'Unlimited Lines' : `${lines} Row`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
