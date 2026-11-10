import React from 'react';
import { Palette, Type } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import {
  PLAY_CARD_ICON_COLOR_OPTIONS,
  JETBRAINS_MONO_WEIGHT_OPTIONS,
  isCustomPlayCardColor,
  resolvePlayCardIconHex,
  hexToRgbTuple,
} from '../../../ui-core/tokens/colors';
import {
  useMainMenuStyleStore,
  MAIN_MENU_ITEM_SLOTS,
  resolveMainMenuTitleTypography,
  detectIsAppleDevice,
  type MainMenuFontFamilyMode,
  type MainMenuItemSlotId,
  type MainMenuPlatformPreviewMode,
} from '../../../ui-core/stores/mainMenuStyleStore';

export interface MainMenuTypographyAndOutlineSectionProps {
  isLight: boolean;
}

export const MainMenuTypographyAndOutlineSection: React.FC<MainMenuTypographyAndOutlineSectionProps> = ({
  isLight,
}) => {
  const store = useMainMenuStyleStore();
  const { variant, setParam, setItemIconColor } = store;
  const cardCls = `p-4 rounded-xl border flex flex-col gap-4 ${
    isLight ? 'bg-neutral-50/70 border-neutral-200/80' : 'bg-neutral-950/50 border-neutral-800'
  }`;
  const chipIdleCls = isLight
    ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
    : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800';

  return (
    <>
      {/* Group B: Title Typography & 8 Official Font Weights */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <Type className="h-4 w-4" />
            <span>B. Header Font, font size, Official Spacing 8 Font Weight Level (Title Typography &amp; Font Weight)</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">Title Font (Font Family):</span>
              {(
                [
                  { id: 'sans', label: 'Apple Sans (Non Apple Auto Fallback To JetBrains Mono)' },
                  { id: 'mono', label: 'JetBrains Mono (Full-platform forced monospace)' },
                ] as { id: MainMenuFontFamilyMode; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setParam('titleFontFamily', f.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                    store.titleFontFamily === f.id
                      ? 'bg-amber-500 text-white border-amber-500 font-bold'
                      : chipIdleCls
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <ToggleSwitch checked={store.titleUppercase} onCheckedChange={(v) => setParam('titleUppercase', v)}
              label="All Caps Title (UPPERCASE)" isLight={isLight} />
          </div>
        </div>

        {store.titleFontFamily === 'sans' && (
          <div
            className={`px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs font-mono ${
            isLight ? 'bg-amber-50/50 border-amber-200/80 text-neutral-700'
            : 'bg-amber-500/5 border-amber-500/25 text-neutral-300' }`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-500">Cross-platform font and weight auto-scaling Fallback Strategy:</span>
              <span>
                Apple Device Usage <strong className="text-amber-500">Apple Sans ({store.titleFontWeight})</strong>
                {' · '}Non Apple Device Auto Fallback To{' '}
                <strong className="text-emerald-500">JetBrains Mono Regular (400)</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-neutral-400">Preview Simulation:</span>
              {(
                [
                  {
                    id: 'auto',
                    label: `Auto Detect (${detectIsAppleDevice() ? 'current Apple' : 'Currently Not Apple'})`,
                  },
                  { id: 'apple', label: `Apple Sans (${store.titleFontWeight})` },
                  { id: 'non-apple-fallback', label: 'Non Apple Fallback (Mono Regular 400)' },
                ] as { id: MainMenuPlatformPreviewMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => store.setPlatformPreviewMode(m.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer transition-all ${
                    store.platformPreviewMode === m.id
                      ? 'bg-amber-500 text-white border-amber-500 font-bold'
                      : chipIdleCls
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SliderControl label="Header Font Size (titleFontSize)" value={store.titleFontSizePx} min={12} max={34} step={1}
            unit="px" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('titleFontSizePx', v)} isLight={isLight} />
          <SliderControl label="Title Letter Spacing (letterSpacing)" value={store.titleLetterSpacingEm} min={-0.08} max={0.18}
            step={0.01} unit="em" editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('titleLetterSpacingEm', v)} isLight={isLight} />
          <SliderControl label="Title Line Height (lineHeight · Descender not clipped)" value={store.titleLineHeight} min={0.95} max={1.6}
            step={0.05} editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => setParam('titleLineHeight', v)} isLight={isLight} />
          <SliderControl label="Vertical title visual fine-tuning (titleOffsetY)" value={store.titleOffsetYPx} min={-6} max={6} step={0.5}
            unit="px" editable allowOutOfBoundsInput colorScheme="emerald"
            onChange={(v) => store.setTitleOffsetYPx(v)} isLight={isLight} />
        </div>

        {/* 8 Font Weights */}
        <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              Title Font Weight (100 Thin ~ 800 Extra Bold · Non Apple Device Fallback To JetBrains Mono Auto Fallback to 400 Regular):
            </span>
            {resolveMainMenuTitleTypography(
              store.titleFontFamily,
              store.titleFontWeight,
              store.platformPreviewMode
            ).isUsingMonoFallback && (
              <span className="text-[11px] font-mono text-emerald-500 font-bold">
                Currently Active: JetBrains Mono Regular (400) Fallback
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            {JETBRAINS_MONO_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.weight}
                type="button"
                onClick={() => setParam('titleFontWeight', opt.weight)}
                style={{
                  fontFamily:
                    store.titleFontFamily === 'mono'
                      ? 'var(--font-jetbrains)'
                      : 'var(--font-apple)',
                  fontWeight: opt.weight,
                }}
                className={`py-1.5 px-2 rounded-lg text-xs border cursor-pointer transition-all ${
                  store.titleFontWeight === opt.weight
                    ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                    : chipIdleCls
                }`}
              >
                {opt.label} ({opt.weight})
              </button>
            ))}
          </div>
        </div>

        {store.showDescription && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
            <SliderControl label="Description font size (descSize)" value={store.descFontSizePx} min={10} max={16}
              step={1} unit="px" editable allowOutOfBoundsInput colorScheme="sky"
              onChange={(v) => setParam('descFontSizePx', v)} isLight={isLight} />
            <SliderControl label="Description Line Height (descLineHeight)" value={store.descLineHeight} min={1.0} max={1.8}
              step={0.05} editable allowOutOfBoundsInput colorScheme="sky"
              onChange={(v) => setParam('descLineHeight', v)} isLight={isLight} />
            <SliderControl label="Title and Description spacing" value={store.titleDescGapPx} min={0} max={12} step={1}
              unit="px" editable allowOutOfBoundsInput colorScheme="sky"
              onChange={(v) => setParam('titleDescGapPx', v)} isLight={isLight} />
          </div>
        )}
      </div>

      {/* Group E: Per-Item Independent Icon Colors & Style 2 Watermark */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <Palette className="h-4 w-4" />
            <span>
              E. Independent menu items Icon Color and style watermark parameters (Per-Item Icon Colors &amp; Watermark)
            </span>
          </div>

          <ToggleSwitch
            checked={store.usePerItemIconColors}
            onCheckedChange={(v) => setParam('usePerItemIconColors', v)}
            label="Enable independent color for menu items Icon (Keep default monochrome icon if disabled)"
            isLight={isLight}
          />
        </div>

        {store.usePerItemIconColors && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {MAIN_MENU_ITEM_SLOTS.map((slot) => {
              const slotId = slot.id as MainMenuItemSlotId;
              const currentColor = store.itemIconColors?.[slotId] || 'neutral';
              const isCustom = isCustomPlayCardColor(currentColor);
              const resolvedHex = resolvePlayCardIconHex(currentColor, isLight);
              const rgb = hexToRgbTuple(resolvedHex);
              const presetLabel = PLAY_CARD_ICON_COLOR_OPTIONS.find((c) => c.id === currentColor)?.label;
              const swatchActiveCls = isLight
                ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
                : 'bg-white text-neutral-950 border-white font-bold';
              const swatchIdleCls = isLight
                ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-600'
                : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700/80 text-neutral-300';

              return (
                <div
                  key={slot.id}
                  className={`p-3 rounded-xl border flex flex-col gap-2 ${
                    isLight ? 'bg-white border-neutral-200/90' : 'bg-neutral-900 border-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold font-mono">{slot.label}</span>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {presetLabel || `RGB(${rgb.r},${rgb.g},${rgb.b})`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {PLAY_CARD_ICON_COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setItemIconColor(slotId, opt.id)}
                        title={opt.label}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono border transition-all cursor-pointer ${
                          currentColor === opt.id ? swatchActiveCls : swatchIdleCls
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dotClass}`} />
                        <span>{opt.shortLabel}</span>
                      </button>
                    ))}

                    <label
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border cursor-pointer text-[10px] font-mono ${
                        isCustom ? 'border-amber-500 text-amber-500 font-bold' : swatchIdleCls
                      }`}
                    >
                      <input
                        type="color"
                        value={resolvedHex}
                        onChange={(e) => setItemIconColor(slotId, e.target.value)}
                        className="h-3 w-3 rounded border-0 p-0 bg-transparent cursor-pointer"
                      />
                      <span>Custom Color</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {variant === 'mono-watermark-row' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-neutral-200/60 dark:border-neutral-800/70">
            <SliderControl label="watermark Icon size (watermarkSize)" value={store.watermarkSizePx} min={32} max={120}
              step={2} unit="px" editable allowOutOfBoundsInput colorScheme="amber"
              onChange={(v) => setParam('watermarkSizePx', v)} isLight={isLight} />
            <SliderControl label="Default watermark opacity (opacity)" value={store.watermarkOpacityPct} min={5} max={80}
              step={1} unit="%" editable allowOutOfBoundsInput colorScheme="emerald"
              onChange={(v) => setParam('watermarkOpacityPct', v)} isLight={isLight} />
            <SliderControl label="watermark Hover opacity" value={store.watermarkHoverOpacityPct} min={10} max={95}
              step={1} unit="%" editable allowOutOfBoundsInput colorScheme="emerald"
              onChange={(v) => setParam('watermarkHoverOpacityPct', v)} isLight={isLight} />
            <SliderControl label="Watermark Rotation (rotateDeg)" value={store.watermarkRotateDeg} min={-40} max={40}
              step={1} unit="°" editable allowOutOfBoundsInput colorScheme="sky"
              onChange={(v) => setParam('watermarkRotateDeg', v)} isLight={isLight} />
          </div>
        )}
      </div>
    </>
  );
};
