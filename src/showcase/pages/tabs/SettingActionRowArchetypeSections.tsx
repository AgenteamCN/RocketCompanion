import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { CodeBlock } from '../../CodeBlock';
import { useSettingActionRowStore } from '../../../ui-core/stores/settingRowStore';
import { SettingRowSpecializedVariantsLab } from './SettingRowSpecializedVariantsLab';
import { SettingActionRowStandalonePreviewCard } from './SettingActionRowStandalonePreviewCard';

export interface SettingActionRowArchetypeSectionsProps {
  isLight: boolean;
  showStandalonePreview: boolean;
  showCode: boolean;
}

export const SettingActionRowArchetypeSections: React.FC<
  SettingActionRowArchetypeSectionsProps
> = ({ isLight, showStandalonePreview, showCode }) => {
  const {
    trajectoryRowLayout,
    sliderLayout,
    sliderTrackWidth,
    sliderShowStepper,
    sliderEditableInUserMode,
    sliderEditableInDevMode,
    sliderValueFontSize,
    segmentedLayout,
    pacingPriorityControl,
    advancedBordered,
    advancedShowBadges,
    setToken,
    exportConfigCode,
  } = useSettingActionRowStore();

  return (
    <>
      {/* Group 3: Archetype-Specific Decoupled Controls (Slider / Composite / Segmented / Advanced) */}
      <div className="flex flex-col gap-3.5 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
            3 · Decoupled layout and interaction strategy for each setting row (Slider Inline Progress Bar
            · User/Dev Number Input · Ballistic Compound Row · Advanced Noise Reduction)
          </span>
        </div>

        {/* 3A: Slider Row Controls */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col gap-3 ${
            isLight
              ? 'bg-neutral-50/70 border-neutral-200/80'
              : 'bg-neutral-950/40 border-neutral-800/80'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold">A. Slider Row (`SettingSliderRow`):</span>
              <div className="flex items-center gap-1">
                {(
                  [
                    {
                      id: 'inline',
                      label: 'Single Row Inline (Title + Progress bar + Value Inline)',
                    },
                    {
                      id: 'stacked',
                      label:
                        'Double Row Stacked (Top Row Title+Value / Full-width bottom progress bar)',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setToken('sliderLayout', opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      sliderLayout === opt.id
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
              <ToggleSwitch
                checked={sliderEditableInUserMode}
                onCheckedChange={(v) => setToken('sliderEditableInUserMode', v)}
                label="User Mode Allow text input for values"
                variant="neutral"
                isLight={isLight}
              />
              <ToggleSwitch
                checked={sliderEditableInDevMode}
                onCheckedChange={(v) => setToken('sliderEditableInDevMode', v)}
                label="Developer Mode Allow text input for values"
                variant="amber"
                isLight={isLight}
              />
              <ToggleSwitch
                checked={sliderShowStepper}
                onCheckedChange={(v) => setToken('sliderShowStepper', v)}
                label="show -/+ Stepper Buttons"
                variant="neutral"
                isLight={isLight}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <SliderControl
              label="Single-line progress bar track width (sliderTrackWidth)"
              value={sliderTrackWidth}
              min={100}
              max={320}
              step={4}
              unit="px"
              editable={true}
              allowOutOfBoundsInput={true}
              colorScheme="emerald"
              onChange={(v) => setToken('sliderTrackWidth', v)}
              isLight={isLight}
            />
            <SliderControl
              label="Slider Value Font Size (sliderValueFontSize)"
              value={sliderValueFontSize}
              min={10}
              max={16}
              step={1}
              unit="px"
              editable={true}
              allowOutOfBoundsInput={true}
              colorScheme="emerald"
              onChange={(v) => setToken('sliderValueFontSize', v)}
              isLight={isLight}
            />
          </div>
        </div>

        {/* 3B: Composite Row + Segmented / Dropdown + Advanced Cleanup */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col gap-3 ${
            isLight
              ? 'bg-neutral-50/70 border-neutral-200/80'
              : 'bg-neutral-950/40 border-neutral-800/80'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Ball Trajectory Predictor Layout */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-300">
                B. Ball Trajectory Predictor (Switch + Configure):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: 'inline', label: 'Inline Compact ([Configure] + [Switch])' },
                    { id: 'stacked', label: 'Split into Two Rows (Top Switch / Down Configure)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setToken('trajectoryRowLayout', opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      trajectoryRowLayout === opt.id
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

            {/* Segmented Control Default Layout */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-300">
                C. Standard segment toggle row (`SettingSegmentedRow`):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: 'inline', label: 'Same Row Right (Title ... Segmented)' },
                    { id: 'stacked', label: 'Double Row (Top Title / Down Segmented)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setToken('segmentedLayout', opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      segmentedLayout === opt.id
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

            {/* Experience Priority Control */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-300">
                D. Experience Priority (Gameplay · 5Level Preference Includes Custom):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: 'segmented-inline', label: 'Same-row right segmentation (default)' },
                    { id: 'segmented-stacked', label: 'Separate segment in row below' },
                    { id: 'dropdown', label: 'Dropdown Dropdown Menu' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setToken('pacingPriorityControl', opt.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      pacingPriorityControl === opt.id
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
          </div>

          {/* Advanced Bordered & Badge Toggles */}
          <div className="flex items-center gap-6 flex-wrap pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <ToggleSwitch
              checked={advancedBordered}
              onCheckedChange={(v) => setToken('advancedBordered', v)}
              label="Advanced Complex block independent stroke (Default Off: Reduce Grid Clutter, Ensure right-side switch alignment)"
              variant="neutral"
              isLight={isLight}
            />
            <ToggleSwitch
              checked={advancedShowBadges}
              onCheckedChange={(v) => setToken('advancedShowBadges', v)}
              label="Advanced Color status next to title Badge (Default Off: Reduce Visual Noise)"
              variant="neutral"
              isLight={isLight}
            />
          </div>
        </div>

        {/* 3C: Specialized Decoupled Component Variations */}
        <SettingRowSpecializedVariantsLab isLight={isLight} />
      </div>

      {/* Optional Standalone Live Preview (shown on L1 TabsPage) */}
      {showStandalonePreview && (
        <SettingActionRowStandalonePreviewCard isLight={isLight} />
      )}

      {showCode && (
        <CodeBlock
          isLight={isLight}
          title="src/ui-core/stores/settingRowStore.ts & Six types of decoupled setting row primitives"
          code={`${exportConfigCode()}

// 1. Nav Button Row (SettingActionRow)
<SettingActionRow icon={NotebookPen} title="Training Mode Configuration" onAction={onNavigateTrainingDetail}
  isLight={isLight} />

// 2. Switch Row (SettingToggleRow - Auto-align Right paddingX)
<SettingToggleRow icon={Crosshair} title="Ball Cam Indicator" checked={ballCamIndicator}
  onCheckedChange={setBallCamIndicator} isLight={isLight} />

// 3. Slider Row (SettingSliderRow - Unified read-only drag value, User/Dev Disable Manual Entry, Dev Handled By Developer Menu Override)
<SettingSliderRow icon={Volume2} label="Master Volume" value={masterVol} min={0} max={100} unit="%"
  developerMode={developerMode} onChange={setMasterVol} isLight={isLight} />`}
        />
      )}
    </>
  );
};
