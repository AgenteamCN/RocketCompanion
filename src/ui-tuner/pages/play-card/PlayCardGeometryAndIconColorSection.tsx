import React from 'react';
import { Sliders, Box, Palette } from 'lucide-react';
import { PLAY_MODES } from '../../../ui-core/recipes/Layer2PlayRecipe';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import {
  usePlayCardStyleStore,
  type PlayModeCardId,
} from '../../../ui-core/stores/playCardStyleStore';
import {
  PLAY_CARD_ICON_COLOR_OPTIONS,
  isCustomPlayCardColor,
  resolvePlayCardIconHex,
  hexToRgbTuple,
  rgbTupleToHex,
} from '../../../ui-core/tokens/colors';
import { PlayCardWatermarkAndColorTuner } from './PlayCardWatermarkAndColorTuner';

export interface PlayCardGeometryAndIconColorSectionProps {
  isLight: boolean;
}

export const PlayCardGeometryAndIconColorSection: React.FC<
  PlayCardGeometryAndIconColorSectionProps
> = React.memo(({ isLight }) => {
  const store = usePlayCardStyleStore();
  const { variant, setVariant, setParam, setCardIconColor } = store;

  return (
    <section
      id="play-card-2b-2-tuner"
      className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-6 ${
        isLight
          ? 'bg-white border-neutral-200/90 shadow-2xs'
          : 'bg-neutral-900/60 border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            2B.2
          </span>
          <Sliders className="h-4 w-4 text-amber-500" />
          <h2 className="text-base font-bold">
            Full-parameter fine-tuning workbench (All-In Parameter Inspector)
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {(['icon-badge-top', 'icon-title-inline', 'mono-giant-watermark'] as const).map(
            (v, idx) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                  variant === v
                    ? 'bg-amber-500 text-white border-amber-500'
                    : isLight
                    ? 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-900'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                }`}
              >
                Style {idx + 1}: {v}
              </button>
            )
          )}
        </div>
      </div>

      {/* Group A: Shared Card Container Geometry */}
      <div
        className={`p-4 rounded-xl border flex flex-col gap-3.5 ${
          isLight
            ? 'bg-neutral-50/70 border-neutral-200/80'
            : 'bg-neutral-950/50 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
          <Box className="h-4 w-4" />
          <span>
            A. Card container geometry and grid spacing (Card Container &amp; Grid Geometry)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <SliderControl
            label="Card horizontal padding (padX)"
            value={store.cardPaddingXPx}
            min={6}
            max={32}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('cardPaddingXPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Card vertical padding (padY)"
            value={store.cardPaddingYPx}
            min={6}
            max={32}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('cardPaddingYPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Card minimum height (minH)"
            value={store.cardMinHeightPx}
            min={64}
            max={200}
            step={2}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('cardMinHeightPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Card border radius (radius)"
            value={store.cardRadiusPx}
            min={0}
            max={28}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('cardRadiusPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="2×3 Grid spacing (gridGap)"
            value={store.gridGapPx}
            min={4}
            max={28}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="emerald"
            onChange={(v) => setParam('gridGapPx', v)}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Group B: Per-Option Independent Icon Colors */}
      <div
        className={`p-4 rounded-xl border flex flex-col gap-3.5 ${
          isLight
            ? 'bg-neutral-50/70 border-neutral-200/80'
            : 'bg-neutral-950/50 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <Palette className="h-4 w-4" />
            <span>
              B. 6 Options are independent Icon Color configuration (Per-Card Independent Icon
              Color · Host Match Default gray)
            </span>
          </div>
          <span className="text-[11px] font-mono text-neutral-400">
            For each option Icon Color can be adjusted individually, Applies to all three card
            styles and exports with the configuration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PLAY_MODES.map((mode) => {
            const cardId = mode.id as PlayModeCardId;
            const currentColor = store.cardIconColors?.[cardId] || 'amber';
            const isCustom = isCustomPlayCardColor(currentColor);
            const resolvedHex = resolvePlayCardIconHex(currentColor, isLight);
            const rgb = hexToRgbTuple(resolvedHex);
            const presetLabel = PLAY_CARD_ICON_COLOR_OPTIONS.find(
              (c) => c.id === currentColor
            )?.label;

            return (
              <div
                key={mode.id}
                className={`p-3 rounded-xl border flex flex-col gap-2.5 ${
                  isLight ? 'bg-white border-neutral-200/90' : 'bg-neutral-900 border-neutral-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold font-mono">{mode.title}</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {presetLabel || `Custom RGB (${rgb.r}, ${rgb.g}, ${rgb.b})`}
                  </span>
                </div>

                {/* Preset Color Swatches */}
                <div className="flex flex-wrap items-center gap-1">
                  {PLAY_CARD_ICON_COLOR_OPTIONS.map((opt) => {
                    const isSelected = currentColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCardIconColor(cardId, opt.id)}
                        title={opt.label}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono border transition-all cursor-pointer ${
                          isSelected
                            ? isLight
                              ? 'bg-neutral-900 text-white border-neutral-900 font-bold shadow-2xs'
                              : 'bg-white text-neutral-950 border-white font-bold shadow-2xs'
                            : isLight
                            ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-600'
                            : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700/80 text-neutral-300'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dotClass}`} />
                        <span>{opt.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom RGB / Color Picker Row */}
                <div
                  className={`pt-2 border-t flex items-center justify-between gap-1.5 text-[10px] font-mono ${
                    isLight ? 'border-neutral-100' : 'border-neutral-800/80'
                  }`}
                >
                  <label
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer transition-all shrink-0 ${
                      isCustom
                        ? isLight
                          ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                          : 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                        : isLight
                        ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                        : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                    }`}
                    title="Click to open color picker (Custom RGB Picker)"
                  >
                    <input
                      type="color"
                      value={resolvedHex}
                      onChange={(e) => setCardIconColor(cardId, e.target.value)}
                      className="h-3.5 w-3.5 rounded border-0 p-0 bg-transparent cursor-pointer"
                    />
                    <span>Custom RGB</span>
                  </label>

                  <div className="flex items-center gap-1">
                    {(['r', 'g', 'b'] as const).map((ch) => (
                      <label
                        key={ch}
                        className="flex items-center gap-0.5"
                        title={`${ch.toUpperCase()} (0-255)`}
                      >
                        <span className="text-neutral-400 uppercase">{ch}</span>
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={rgb[ch]}
                          onChange={(e) => {
                            const nextVal = Number(e.target.value);
                            const nextRgb = { ...rgb, [ch]: nextVal };
                            setCardIconColor(
                              cardId,
                              rgbTupleToHex(nextRgb.r, nextRgb.g, nextRgb.b)
                            );
                          }}
                          className={`w-10 px-1 py-0.5 rounded border text-center text-[10px] font-mono outline-none ${
                            isLight
                              ? 'bg-neutral-50 border-neutral-200 text-neutral-800 focus:border-amber-500'
                              : 'bg-neutral-950 border-neutral-700 text-neutral-200 focus:border-amber-500'
                          }`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PlayCardWatermarkAndColorTuner isLight={isLight} />
    </section>
  );
});

PlayCardGeometryAndIconColorSection.displayName = 'PlayCardGeometryAndIconColorSection';
