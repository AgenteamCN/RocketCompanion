import React from 'react';
import { Compass, Lock, RotateCcw, Sliders, Sparkles, X } from 'lucide-react';
import { type StaticTrainingVariationConfig, type StaticTrainingQuickVariationToggles, type KevpertPresetKey, DEFAULT_QUICK_VARIATION_TOGGLES, resolveEffectiveRecommendedVariation } from '../../config/staticTrainingVariationTypes';
import { KEVPERT_PRESET_KEYS, KEVPERT_LATEST_PRESETS } from '../../config/kevpertVariationPresets';
import { StaticTrainingQuickTogglesSection } from './StaticTrainingQuickTogglesSection';
import { StaticTrainingVariationSlidersGrid } from './StaticTrainingVariationSlidersGrid';
import { floatingStore } from '../../stores/floatingStore';
import { STATIC_TRAINING_BALL_CAM_TUNER_PRESET } from '../../stores/devFloatingPresets';

export interface StaticTrainingVariationsModalProps {
  isLight: boolean;
  isOpen: boolean;
  onClose: () => void;
  toggles: StaticTrainingQuickVariationToggles;
  onUpdateToggles: (patch: Partial<StaticTrainingQuickVariationToggles>) => void;
  customVariation: StaticTrainingVariationConfig;
  onUpdateCustomVariation: (patch: Partial<StaticTrainingVariationConfig>) => void;
  onSelectKevpertPreset: (key: KevpertPresetKey) => void;
  packRecommendedVariation?: StaticTrainingVariationConfig | null;
  packTitle?: string;
}

export const StaticTrainingVariationsModal: React.FC<StaticTrainingVariationsModalProps> =
  React.memo(
    ({
      isLight,
      isOpen,
      onClose,
      toggles,
      onUpdateToggles,
      customVariation,
      onUpdateCustomVariation,
      onSelectKevpertPreset,
      packRecommendedVariation,
      packTitle,
    }) => {
      const effectivePackRecommended = resolveEffectiveRecommendedVariation(
        packRecommendedVariation,
        Boolean(toggles.applyNewKevpertBind)
      );
      const activeDisplayVar = toggles.enableCustomVariationOverride
        ? customVariation
        : effectivePackRecommended || customVariation;

      const isUsingCustom = toggles.enableCustomVariationOverride;
      const isCustomEditable = isUsingCustom && customVariation.presetKey === 'CUSTOM';

      if (!isOpen) return null;

      const handleSelectCustomMode = () => {
        if (!toggles.enableCustomVariationOverride) {
          onUpdateToggles({ enableCustomVariationOverride: true });
        }
        onUpdateCustomVariation({
          presetKey: 'CUSTOM',
          label: 'Custom User Variation (Editable Sliders)',
        });
      };

      return (
        <div
          role="dialog"
          aria-label="Training Variations Configuration"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[880px] max-h-[88vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isLight
                ? 'bg-white border-neutral-300 text-neutral-900'
                : 'bg-neutral-900 border-neutral-700 text-neutral-100'
            }`}
          >
            {/* Header */}
            <div
              className={`px-5 py-3 border-b flex items-center justify-between shrink-0 ${
                isLight
                  ? 'bg-neutral-100/80 border-neutral-200'
                  : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="h-4 w-4 text-cyan-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold tracking-wider uppercase">
                    Training Variations & Boost Override
                  </span>
                  <span className="text-[10px] opacity-65">
                    {packRecommendedVariation
                      ? `Pack Recommended: ${
                          packRecommendedVariation.label ||
                          packRecommendedVariation.presetKey ||
                          'Active'
                        } (${packTitle || 'Current Pack'})`
                      : `No embedded pack variance • Enable Override to pick Kevpert F3–F12 (Read-Only) or Custom (Editable)`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    floatingStore.spawnWindow(STATIC_TRAINING_BALL_CAM_TUNER_PRESET);
                    onClose();
                  }}
                  title="Open 3D Direction Arrow, Expired Ball Opacity & Ball Cam Floating Tuner"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800'
                      : 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-400/40 text-cyan-300'
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>3D Arrow & Visuals Tuner</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateToggles({ ...DEFAULT_QUICK_VARIATION_TOGGLES });
                  }}
                  title="Reset Quick Toggles to Defaults"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 rounded-lg hover:bg-neutral-500/20 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 overflow-y-auto flex flex-col gap-3.5 text-xs">
              <StaticTrainingQuickTogglesSection
                isLight={isLight}
                toggles={toggles}
                isUsingCustom={isUsingCustom}
                isCustomEditable={isCustomEditable}
                customVariation={customVariation}
                packRecommendedVariation={packRecommendedVariation}
                onUpdateToggles={onUpdateToggles}
              />

              {/* 3. Kevpert BakkesMod F-Key Presets (Read-Only) + Custom Button */}
              <div
                className={`p-3 rounded-xl border flex flex-col gap-2 ${
                  isLight
                    ? 'bg-neutral-50/80 border-neutral-200'
                    : 'bg-neutral-850/60 border-neutral-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-cyan-400" />
                    Kevpert BakkesMod Latest Presets (F3–F12) & Custom Mode
                  </span>
                  <span className="text-[10px] font-mono opacity-65 flex items-center gap-1">
                    {isCustomEditable ? (
                      <span className="text-amber-400 font-bold">
                        Custom Active: Sliders Unlocked
                      </span>
                    ) : (
                      <>
                        <Lock className="h-3 w-3 opacity-70" />
                        <span>Preset Read-Only • Click Custom to Edit Sliders</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
                  {KEVPERT_PRESET_KEYS.map((k) => {
                    const preset = KEVPERT_LATEST_PRESETS[k];
                    const isSelected =
                      isUsingCustom && customVariation.presetKey === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onSelectKevpertPreset(k)}
                        title={`${preset.label || preset.presetLabel} (Read-Only Preset)`}
                        className={`py-1.5 px-1.5 rounded-lg border text-center font-mono text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? isLight
                              ? 'bg-neutral-900 border-neutral-900 text-white shadow-xs'
                              : 'bg-cyan-400 border-cyan-300 text-neutral-950 shadow-xs'
                            : isLight
                            ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                            : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                        }`}
                      >
                        <div>{k}</div>
                        <div className="text-[9px] font-normal opacity-75">
                          B:{preset.boostLimitOverride ?? 100}
                        </div>
                      </button>
                    );
                  })}

                  {/* Explicit Custom Button */}
                  <button
                    type="button"
                    onClick={handleSelectCustomMode}
                    title="Unlock Custom Bidirectional Range Sliders & Direct Numeric Inputs"
                    className={`py-1.5 px-2 rounded-lg border text-center font-mono text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                      isCustomEditable
                        ? isLight
                          ? 'bg-amber-500 border-amber-600 text-white shadow-xs'
                          : 'bg-amber-400 border-amber-300 text-neutral-950 shadow-xs'
                        : isLight
                        ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40 text-amber-300'
                    }`}
                  >
                    <div>Custom</div>
                    <div className="text-[9px] font-normal opacity-80">Sliders</div>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono opacity-75 pt-0.5">
                  <span className="truncate">
                    Active Spec: {activeDisplayVar.label || activeDisplayVar.presetKey || 'Custom'}
                  </span>
                  {!isCustomEditable && (
                    <span className="text-cyan-400 shrink-0 ml-2">
                      Kevpert Presets are locked • Select &ldquo;Custom&rdquo; to adjust sliders
                    </span>
                  )}
                </div>
              </div>

              <StaticTrainingVariationSlidersGrid
                isLight={isLight}
                isCustomEditable={isCustomEditable}
                toggles={toggles}
                activeDisplayVar={activeDisplayVar}
                onUpdateCustomVariation={onUpdateCustomVariation}
              />
            </div>
          </div>
        </div>
      );
    }
  );

StaticTrainingVariationsModal.displayName = 'StaticTrainingVariationsModal';
