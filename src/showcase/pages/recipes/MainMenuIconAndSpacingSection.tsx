import React from 'react';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import {
  useMainMenuStyleStore,
  type MainMenuFontFamilyMode,
  type MainMenuRowAlignMode,
  type MainMenuResumeHighlightStyle,
} from '../../../ui-core/stores/mainMenuStyleStore';

export interface MainMenuIconAndSpacingSectionProps {
  isLight: boolean;
}

export const MainMenuIconAndSpacingSection: React.FC<MainMenuIconAndSpacingSectionProps> = ({
  isLight,
}) => {
  const store = useMainMenuStyleStore();
  const { setParam } = store;

  return (
    <>
      {/* Group C: Icon, Icon Box, Alignment & Resume Highlight Mode */}
      <div
        className={`p-4 rounded-xl border flex flex-col gap-4 ${
          isLight
            ? 'bg-neutral-50/70 border-neutral-200/80'
            : 'bg-neutral-950/50 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
          <Sparkles className="h-4 w-4" />
          <span>C. icon size, Icon Border, Alignment and first-line indent Resume Visual Mode</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SliderControl
            label="Left Icon Size (iconSize)"
            value={store.iconSizePx}
            min={12}
            max={36}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('iconSizePx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="icon SVG Line Width (strokeWidth)"
            value={store.iconStrokeWidth}
            min={1.0}
            max={3.0}
            step={0.1}
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('iconStrokeWidth', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Icon and title horizontal spacing (iconTitleGap)"
            value={store.iconTitleGapPx}
            min={4}
            max={28}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="emerald"
            onChange={(v) => setParam('iconTitleGapPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Icon inner box size (iconBoxSize)"
            value={store.iconBoxSizePx}
            min={24}
            max={56}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('iconBoxSizePx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Icon inner frame radius (iconBoxRadius)"
            value={store.iconBoxRadiusPx}
            min={0}
            max={20}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('iconBoxRadiusPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Right navigation arrow size (arrowSize)"
            value={store.rightArrowSizePx}
            min={12}
            max={24}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="emerald"
            onChange={(v) => setParam('rightArrowSizePx', v)}
            isLight={isLight}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/70">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              First Row Resume Visual Mode (resumeHighlightStyle):
            </span>
            {(
              [
                { id: 'solid-primary', label: 'Inverted solid main button (Solid Primary)' },
                { id: 'surface-card', label: 'Monochromatic framed card (Unified Surface)' },
                { id: 'amber-accent', label: 'Warm Orange Highlight Border (Amber Accent)' },
              ] as { id: MainMenuResumeHighlightStyle; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParam('resumeHighlightStyle', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                  store.resumeHighlightStyle === opt.id
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

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
              Row Content Alignment (rowContentAlign):
            </span>
            {(
              [
                { id: 'left', label: 'align left (Left)' },
                { id: 'center', label: 'Center (Center)' },
                { id: 'space-between', label: 'Space Between (Space-Between)' },
              ] as { id: MainMenuRowAlignMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParam('rowContentAlign', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                  store.rowContentAlign === opt.id
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
        </div>
      </div>

      {/* Group D: 3-Stage Panel Shell (Header / Content / Footer) */}
      <div
        className={`p-4 rounded-xl border flex flex-col gap-4 ${
          isLight
            ? 'bg-neutral-50/70 border-neutral-200/80'
            : 'bg-neutral-950/50 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <LayoutTemplate className="h-4 w-4" />
            <span>
              D. MENU Three-stage panel shell parameters (Header Title and Lining · Content padding · Footer Status Bar)
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                Header Font:
              </span>
              {(
                [
                  { id: 'sans', label: 'Apple Sans' },
                  { id: 'mono', label: 'JetBrains Mono' },
                ] as { id: MainMenuFontFamilyMode; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setParam('headerFontFamily', f.id)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                    store.headerFontFamily === f.id
                      ? 'bg-amber-500 text-white border-amber-500 font-bold'
                      : isLight
                      ? 'bg-white border-neutral-200 text-neutral-700'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <ToggleSwitch
              checked={store.showFooter}
              onCheckedChange={(v) => setParam('showFooter', v)}
              label="Show Bottom Footer (Power Saving Status Bar)"
              isLight={isLight}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <SliderControl
            label="Header font size (headerSize)"
            value={store.headerFontSizePx}
            min={13}
            max={32}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('headerFontSizePx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header Letter Spacing (letterSpacing)"
            value={store.headerLetterSpacingEm}
            min={-0.04}
            max={0.3}
            step={0.01}
            unit="em"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('headerLetterSpacingEm', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header horizontal padding (headerPadX)"
            value={store.headerPaddingXPx}
            min={8}
            max={40}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('headerPaddingXPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header Top Lining (headerPadTop)"
            value={store.headerPaddingTopPx}
            min={6}
            max={36}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('headerPaddingTopPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header Bottom Lining (headerPadBottom)"
            value={store.headerPaddingBottomPx}
            min={6}
            max={36}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('headerPaddingBottomPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Content horizontal padding (contentPadX)"
            value={store.contentPaddingXPx}
            min={8}
            max={40}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="emerald"
            onChange={(v) => setParam('contentPaddingXPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Content vertical padding (contentPadY)"
            value={store.contentPaddingYPx}
            min={4}
            max={36}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="emerald"
            onChange={(v) => setParam('contentPaddingYPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer horizontal padding (footerPadX)"
            value={store.footerPaddingXPx}
            min={8}
            max={40}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('footerPaddingXPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer vertical padding (footerPadY)"
            value={store.footerPaddingYPx}
            min={4}
            max={28}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="sky"
            onChange={(v) => setParam('footerPaddingYPx', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer font size (footerFontSize)"
            value={store.footerFontSizePx}
            min={9}
            max={15}
            step={1}
            unit="px"
            editable
            allowOutOfBoundsInput
            colorScheme="amber"
            onChange={(v) => setParam('footerFontSizePx', v)}
            isLight={isLight}
          />
        </div>
      </div>
    </>
  );
};
