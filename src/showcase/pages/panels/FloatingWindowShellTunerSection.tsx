import React from 'react';
import { AppWindow, RotateCcw, Sparkles } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { DEFAULT_FLOATING_SHELL_TOKENS } from '../../../ui-core/tokens/menuLayoutTokens';

export interface FloatingWindowShellTunerSectionProps {
  isLight: boolean;
  onTemplateTokenChange?: () => void;
}

export const FloatingWindowShellTunerSection: React.FC<
  FloatingWindowShellTunerSectionProps
> = React.memo(({ isLight, onTemplateTokenChange }) => {
  const {
    floatingOuterRadius,
    floatingHeaderPaddingX,
    floatingHeaderPaddingY,
    floatingHeaderTitleFontSize,
    floatingHeaderMinimizeBtnSize,
    floatingHeaderMinimizeBtnRadius,
    floatingBodyPaddingX,
    floatingBodyPaddingY,
    floatingFooterPaddingX,
    floatingFooterPaddingY,
    floatingFooterCornerReserveRightPx,
    floatingFooterFontSize,
    setToken,
    updateTokens,
  } = useMenuLayoutStore();

  const handleSetFloatingToken = <
    K extends keyof typeof DEFAULT_FLOATING_SHELL_TOKENS
  >(
    key: K,
    val: number
  ) => {
    setToken(key, val);
    onTemplateTokenChange?.();
  };

  const applyFloatingPreset = (preset: 'default-calibrated' | 'compact-hud' | 'spacious-studio') => {
    if (preset === 'default-calibrated') {
      updateTokens(DEFAULT_FLOATING_SHELL_TOKENS);
    } else if (preset === 'compact-hud') {
      updateTokens({
        floatingOuterRadius: 12,
        floatingHeaderPaddingX: 10,
        floatingHeaderPaddingY: 6,
        floatingHeaderTitleFontSize: 13,
        floatingHeaderMinimizeBtnSize: 20,
        floatingHeaderMinimizeBtnRadius: 5,
        floatingBodyPaddingX: 10,
        floatingBodyPaddingY: 10,
        floatingFooterPaddingX: 10,
        floatingFooterPaddingY: 5,
        floatingFooterCornerReserveRightPx: 22,
        floatingFooterFontSize: 10,
      });
    } else if (preset === 'spacious-studio') {
      updateTokens({
        floatingOuterRadius: 18,
        floatingHeaderPaddingX: 16,
        floatingHeaderPaddingY: 10,
        floatingHeaderTitleFontSize: 15,
        floatingHeaderMinimizeBtnSize: 24,
        floatingHeaderMinimizeBtnRadius: 7,
        floatingBodyPaddingX: 18,
        floatingBodyPaddingY: 16,
        floatingFooterPaddingX: 16,
        floatingFooterPaddingY: 8,
        floatingFooterCornerReserveRightPx: 28,
        floatingFooterFontSize: 12,
      });
    }
    onTemplateTokenChange?.();
  };

  return (
    <div
      id="floating-shell-tuner-section"
      className={`p-4 rounded-xl border flex flex-col gap-4 ${
        isLight
          ? 'bg-sky-50/40 border-sky-200/80'
          : 'bg-sky-950/20 border-sky-900/50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-sky-200/60 dark:border-sky-900/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-500 font-mono font-bold text-xs">
            Alpha:3StageFloatingShell
          </span>
          <AppWindow className="h-4 w-4 text-sky-500 shrink-0" />
          <span className="text-xs font-bold">
            Variant B · Floating Window 3-Stage Shell Tokens (`variant="floating"`)
          </span>
          <Badge variant="primary" size="sm" isLight={isLight}>
            29 Floating Windows Shared Contract
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-neutral-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-sky-500" /> Presets:
          </span>
          <button
            type="button"
            onClick={() => applyFloatingPreset('default-calibrated')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            1. Calibrated Default (R=16 · Pad 12×8)
          </button>
          <button
            type="button"
            onClick={() => applyFloatingPreset('compact-hud')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            2. Compact HUD (R=12 · Pad 10×6)
          </button>
          <button
            type="button"
            onClick={() => applyFloatingPreset('spacious-studio')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            3. Spacious Studio (R=18 · Pad 16×10)
          </button>
          <Button
            size="sm"
            variant="ghost"
            isLight={isLight}
            icon={<RotateCcw className="h-3 w-3" />}
            onClick={() => applyFloatingPreset('default-calibrated')}
          >
            Reset Floating
          </Button>
        </div>
      </div>

      {/* Stage 1: Floating Header */}
      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-500">
          Floating Stage 1 · Header Bar, Title Font & Minimize Button Geometry
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SliderControl
            label="Floating Outer Radius (floatingOuterRadius)"
            value={floatingOuterRadius}
            min={0}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => handleSetFloatingToken('floatingOuterRadius', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header Horizontal Padding (floatingHeaderPaddingX)"
            value={floatingHeaderPaddingX}
            min={4}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => handleSetFloatingToken('floatingHeaderPaddingX', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header Vertical Padding (floatingHeaderPaddingY)"
            value={floatingHeaderPaddingY}
            min={2}
            max={20}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => handleSetFloatingToken('floatingHeaderPaddingY', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Header Title Font Size (floatingHeaderTitleFontSize)"
            value={floatingHeaderTitleFontSize}
            min={10}
            max={22}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => handleSetFloatingToken('floatingHeaderTitleFontSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Minimize Button Size (floatingHeaderMinimizeBtnSize)"
            value={floatingHeaderMinimizeBtnSize}
            min={16}
            max={32}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => handleSetFloatingToken('floatingHeaderMinimizeBtnSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Minimize Button Radius (floatingHeaderMinimizeBtnRadius)"
            value={floatingHeaderMinimizeBtnRadius}
            min={0}
            max={16}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => handleSetFloatingToken('floatingHeaderMinimizeBtnRadius', v)}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Stage 2 & Stage 3: Floating Body & Footer */}
      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-sky-200/60 dark:border-sky-900/50">
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
          Floating Stage 2 &amp; Stage 3 · Content Body Fallback &amp; Footer Corner Dragger Reserve
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SliderControl
            label="Body Fallback Padding X (floatingBodyPaddingX)"
            value={floatingBodyPaddingX}
            min={0}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => handleSetFloatingToken('floatingBodyPaddingX', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Body Fallback Padding Y (floatingBodyPaddingY)"
            value={floatingBodyPaddingY}
            min={0}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => handleSetFloatingToken('floatingBodyPaddingY', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer Font Size (floatingFooterFontSize)"
            value={floatingFooterFontSize}
            min={9}
            max={16}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => handleSetFloatingToken('floatingFooterFontSize', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer Padding X (floatingFooterPaddingX)"
            value={floatingFooterPaddingX}
            min={4}
            max={28}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="sky"
            onChange={(v) => handleSetFloatingToken('floatingFooterPaddingX', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Footer Padding Y (floatingFooterPaddingY)"
            value={floatingFooterPaddingY}
            min={2}
            max={18}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="emerald"
            onChange={(v) => handleSetFloatingToken('floatingFooterPaddingY', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Corner Dragger Right Reserve (floatingFooterCornerReserveRightPx)"
            value={floatingFooterCornerReserveRightPx}
            min={12}
            max={44}
            step={1}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) =>
              handleSetFloatingToken('floatingFooterCornerReserveRightPx', v)
            }
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
});

FloatingWindowShellTunerSection.displayName = 'FloatingWindowShellTunerSection';
