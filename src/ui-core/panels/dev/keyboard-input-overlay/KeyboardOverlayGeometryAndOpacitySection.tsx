import React from 'react';
import { Eye, Square } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { useFloatingStore } from '../../../stores/floatingStore';
import { useKeyboardInputOverlayStore } from '../../../stores/keyboardInputOverlayStore';

export interface KeyboardOverlayGeometryAndOpacitySectionProps {
  isLight?: boolean;
}

export const KeyboardOverlayGeometryAndOpacitySection: React.FC<
  KeyboardOverlayGeometryAndOpacitySectionProps
> = ({ isLight = false }) => {
  const { opacity: globalFloatingOpacity } = useFloatingStore();
  const {
    keyboardOpacityPct,
    compensateGlobalOpacity,
    keyGapPx,
    keyBorderRadiusPx,
    trapezoidInsetXPct,
    trapezoidInsetYPct,
    pressShrinkXPct,
    pressShrinkYPct,
    bevelContrast,
    updateConfig,
  } = useKeyboardInputOverlayStore();

  const rawMultipliedPct = Math.round(
    (globalFloatingOpacity / 100) * keyboardOpacityPct
  );
  const effectiveResultPct = compensateGlobalOpacity
    ? Math.max(1, Math.min(100, rawMultipliedPct))
    : Math.round((globalFloatingOpacity / 100) * Math.min(100, keyboardOpacityPct));

  const cardBg = isLight
    ? 'bg-neutral-100/80 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/70 border-neutral-800 text-neutral-100';

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. Independent Keyboard Opacity & Multiplicative Superposition */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              1. Independent Keyboard Opacity &amp; Superposition
            </span>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/15 text-sky-400">
            Global {globalFloatingOpacity}% × Key {keyboardOpacityPct}% ={' '}
            {effectiveResultPct}%
          </span>
        </div>

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Keyboard Overlay Opacity (1% - 500%)"
          unit="%"
          value={keyboardOpacityPct}
          min={10}
          max={500}
          step={5}
          isLight={isLight}
          onChange={(v) => updateConfig({ keyboardOpacityPct: v })}
        />

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-col leading-tight min-w-0 pr-2">
            <span className="text-[11px] font-semibold">
              Multiplicative Opacity Superposition (Override Shell Ceiling)
            </span>
            <span className="text-[10px] text-neutral-400">
              Allows e.g. Global 20% × Keyboard 500% = 100% effective result on this window
            </span>
          </div>
          <ToggleSwitch
            checked={compensateGlobalOpacity}
            onCheckedChange={(checked) =>
              updateConfig({ compensateGlobalOpacity: checked })
            }
            isLight={isLight}
          />
        </div>
      </div>

      {/* 2. Retro Trapezoid Bevel, Corner Radius & Pressing Shrink Mechanics */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Square className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              2. Retro Trapezoid Bevel &amp; Press Shrink Mechanics
            </span>
          </div>
          <span className="text-[10px] font-mono opacity-60">1:1 Square Keys</span>
        </div>

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Grid Key Spacing (Gap)"
          unit="px"
          value={keyGapPx}
          min={0}
          max={24}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ keyGapPx: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Key Corner Radius (0px = Retro Sharp Rectangle)"
          unit="px"
          value={keyBorderRadiusPx}
          min={0}
          max={32}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ keyBorderRadiusPx: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Horizontal Trapezoid Bevel Inset (X)"
          unit="%"
          value={trapezoidInsetXPct}
          min={0}
          max={35}
          step={0.5}
          isLight={isLight}
          onChange={(v) => updateConfig({ trapezoidInsetXPct: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Vertical Trapezoid Bevel Inset (Y)"
          unit="%"
          value={trapezoidInsetYPct}
          min={0}
          max={35}
          step={0.5}
          isLight={isLight}
          onChange={(v) => updateConfig({ trapezoidInsetYPct: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Pressed Horizontal Concave Shrink (Delta X)"
          unit="%"
          value={pressShrinkXPct}
          min={-10}
          max={25}
          step={0.5}
          isLight={isLight}
          onChange={(v) => updateConfig({ pressShrinkXPct: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Pressed Vertical Concave Shrink (Delta Y)"
          unit="%"
          value={pressShrinkYPct}
          min={-10}
          max={25}
          step={0.5}
          isLight={isLight}
          onChange={(v) => updateConfig({ pressShrinkYPct: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Convex / Concave Bevel Shadow Contrast"
          unit=""
          value={bevelContrast}
          min={0}
          max={1}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ bevelContrast: v })}
        />
      </div>
    </div>
  );
};

KeyboardOverlayGeometryAndOpacitySection.displayName =
  'KeyboardOverlayGeometryAndOpacitySection';
export default KeyboardOverlayGeometryAndOpacitySection;
