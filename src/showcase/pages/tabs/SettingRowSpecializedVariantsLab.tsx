import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { TelemetryConfigCard } from '../../../ui-core/compounds/TelemetryConfigCard';
import { useSettingActionRowStore } from '../../../ui-core/stores/settingRowStore';

export interface SettingRowSpecializedVariantsLabProps {
  isLight: boolean;
}

export const SettingRowSpecializedVariantsLab: React.FC<
  SettingRowSpecializedVariantsLabProps
> = React.memo(({ isLight }) => {
  const {
    presetCustomVariation,
    presetCustomSliderWidth,
    presetCustomAnimDuration,
    devStatusAccentColor,
    devStatusInteractiveToggle,
    telemetryVariation,
    telemetryTriggerPosition,
    telemetryDefaultCollapsed,
    floatingOpacityOrder,
    setToken,
  } = useSettingActionRowStore();

  return (
    <div
      className={`p-3.5 rounded-xl border flex flex-col gap-3.5 ${
        isLight
          ? 'bg-neutral-50/70 border-neutral-200/80'
          : 'bg-neutral-950/40 border-neutral-800/80'
      }`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
        4 · Specialized decoupled component variant lab (UI Scaling / Render Scale Component Linkage ·
        Developer Status Badge · Show Telemetry Summary)
      </span>

      {/* Sub-section 1: SettingPresetCustomRow (UI Scaling & Render Scale) */}
      <div id="setting-preset-custom-tuner" className="scroll-mt-24 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-mono font-bold text-[11px]">
              6A.4S-E
            </span>
            <span className="text-xs font-bold">
              E. `SettingPresetCustomRow` (UI Scaling &amp; Render Scale Shared Presets+Custom Slider
              Variant):
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                {
                  id: 'slide-reveal',
                  label:
                    '1. Slide-Reveal (click Custom Shift Left+Background slide-out integration · 0Increase Height)',
                },
                {
                  id: 'morph-pill',
                  label: '2. Morph-Pill (CustomCapsule-embedded slider extension)',
                },
                {
                  id: 'popover-scrub',
                  label: '3. Apple Popover (Adjustment Popover · Do not crowd bottom row)',
                },
                {
                  id: 'below-row',
                  label: '4. Below-Row (Traditional expanded second row Custom Slider)',
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setToken('presetCustomVariation', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  presetCustomVariation === opt.id
                    ? 'bg-amber-500 text-white border-amber-500'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <SliderControl
            label="Custom Slide-out Track Width (presetCustomSliderWidth)"
            value={presetCustomSliderWidth}
            min={96}
            max={280}
            step={4}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('presetCustomSliderWidth', v)}
            isLight={isLight}
          />
          <SliderControl
            label="Left shift and transition duration (presetCustomAnimDuration)"
            value={presetCustomAnimDuration}
            min={120}
            max={600}
            step={20}
            unit="ms"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setToken('presetCustomAnimDuration', v)}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Sub-section 2: SettingDeveloperStatusRow & Floating Window Opacity Order */}
      <div
        id="setting-dev-status-tuner"
        className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 font-mono font-bold text-[11px]">
              6A.4S-F
            </span>
            <span className="text-xs font-bold">
              F. `SettingDeveloperStatusRow` (Advanced First Position · Disabled / Active Color
              Customization):
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { id: 'emerald', label: 'Emerald Active Badge + Green Icon (Emerald)' },
                { id: 'amber', label: 'warm orange Active Badge + Orange Icon (Amber)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setToken('devStatusAccentColor', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  devStatusAccentColor === opt.id
                    ? opt.id === 'emerald'
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-amber-500 text-white border-amber-500'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <ToggleSwitch
              checked={devStatusInteractiveToggle}
              onCheckedChange={(v) => setToken('devStatusInteractiveToggle', v)}
              label="Allow Clicks Badge Toggle Active/Disabled"
              variant="neutral"
              isLight={isLight}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold">
            G. Advanced · Floating Window Opacity Sort Position (`floatingOpacityOrder`):
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'last', label: 'Fix last digit (Last · default)' },
                {
                  id: 'first-when-inactive',
                  label: 'Bring Forward When Inactive / Send to Bottom When Active',
                },
                { id: 'first', label: 'Pin to Front (Follow Developer Settings)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setToken('floatingOpacityOrder', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  floatingOpacityOrder === opt.id
                    ? 'bg-sky-500 text-white border-sky-500'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-section 3: Show Telemetry Summary (TelemetryConfigCard) Variations */}
      <div
        id="setting-telemetry-summary-tuner"
        className="scroll-mt-24 flex flex-col gap-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-800/60"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500 font-mono font-bold text-xs">
              6A.4S-H
            </span>
            <Badge variant="primary" size="sm" isLight={isLight}>
              L3.8 TelemetryConfigCard
            </Badge>
            <span className="text-xs font-bold">
              H. `Show Telemetry Summary` (`TelemetryConfigCard` Collapsed and embedded alignment
              variants + live preview):
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                {
                  id: 'underline-disclosure',
                  label: '1. Underlined Show ▾ + Expand light frame wrap (Collapse by Default)',
                },
                {
                  id: 'apple-grouped-inset',
                  label: '2. Apple System Settings Integrated inline group box (Grouped Inset)',
                },
                {
                  id: 'flush-aligned',
                  label: '3. Flush Horizontal + Left Vertical Guide (Fix left-right misalignment)',
                },
                { id: 'tree-guide', label: '4. Tree indentation guide lines (Tree Guide)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setToken('telemetryVariation', opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  telemetryVariation === opt.id
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-neutral-400">
              Underlined `Show ▾` Position:
            </span>
            {(
              [
                { id: 'left', label: 'Toggle left (Left)' },
                { id: 'right', label: 'Toggle right (Right)' },
              ] as const
            ).map((pos) => (
              <button
                key={pos.id}
                type="button"
                onClick={() => setToken('telemetryTriggerPosition', pos.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                  telemetryTriggerPosition === pos.id
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                    : isLight
                    ? 'bg-white border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>

          <ToggleSwitch
            checked={telemetryDefaultCollapsed}
            onCheckedChange={(v) => setToken('telemetryDefaultCollapsed', v)}
            label="Collapse Below by Default 5 Sub-indicator (click Show ▾ expand)"
            variant="neutral"
            isLight={isLight}
          />
        </div>

        {/* Live Co-located Preview of TelemetryConfigCard right inside 6A.4S-H */}
        <div
          className={`p-3.5 rounded-xl border ${
            isLight
              ? 'bg-white border-emerald-200/80 shadow-2xs'
              : 'bg-neutral-950/90 border-emerald-900/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-emerald-500">
              [6A.4S-H / L3.8] Show Telemetry Summary Real-time interaction preview (click Show ▾ / Hide
              ▴ Test Expand)
            </span>
            <span className="text-[10px] font-mono opacity-60">
              Current Variant: {telemetryVariation} · Trigger: {telemetryTriggerPosition}
            </span>
          </div>
          <TelemetryConfigCard isLight={isLight} />
        </div>
      </div>
    </div>
  );
});

SettingRowSpecializedVariantsLab.displayName = 'SettingRowSpecializedVariantsLab';
