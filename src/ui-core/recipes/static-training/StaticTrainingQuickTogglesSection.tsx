import React from 'react';
import { Zap } from 'lucide-react';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import {
  isVariationMatchingLatestPreset,
  type StaticTrainingVariationConfig,
  type StaticTrainingQuickVariationToggles,
} from '../../config/staticTrainingVariationTypes';

export interface StaticTrainingQuickTogglesSectionProps {
  isLight: boolean;
  toggles: StaticTrainingQuickVariationToggles;
  isUsingCustom: boolean;
  isCustomEditable: boolean;
  customVariation: StaticTrainingVariationConfig;
  packRecommendedVariation?: StaticTrainingVariationConfig | null;
  onUpdateToggles: (patch: Partial<StaticTrainingQuickVariationToggles>) => void;
}

export const StaticTrainingQuickTogglesSection: React.FC<
  StaticTrainingQuickTogglesSectionProps
> = ({
  isLight,
  toggles,
  isUsingCustom,
  isCustomEditable,
  customVariation,
  packRecommendedVariation,
  onUpdateToggles,
}) => {
  const applyNew = Boolean(toggles.applyNewKevpertBind);
  const rawMatchesLatest = isVariationMatchingLatestPreset(packRecommendedVariation);

  return (
    <>
      {/* 1. Master Override Toggle */}
      <div
        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
          isUsingCustom
            ? isLight
              ? 'bg-cyan-50/70 border-cyan-300'
              : 'bg-cyan-950/30 border-cyan-500/40'
            : isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-850/80 border-neutral-800'
        }`}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold">
            Enable Custom Static Training Variance (User Global Override)
          </span>
          <span className="text-[10px] opacity-75">
            {isUsingCustom
              ? isCustomEditable
                ? 'ON (Custom Mode): Adjust dual-grabber sliders or type values directly and press Enter.'
                : `ON (Kevpert Preset ${customVariation.presetKey}): Using read-only Kevpert preset. Click "Custom" below to edit sliders.`
              : packRecommendedVariation
                ? `OFF (Default): Uses pack author's recommended variance (${
                    packRecommendedVariation.presetKey || 'Embedded'
                  }).`
                : 'OFF (Default): Uses pack metadata variance if present, or zero variance if none.'}
          </span>
        </div>
        <ToggleSwitch
          checked={isUsingCustom}
          onCheckedChange={(checked) =>
            onUpdateToggles({ enableCustomVariationOverride: checked })
          }
          isLight={isLight}
        />
      </div>

      {/* 1B. Kevpert Video-Description (Apply Old) vs Latest Keybinding (Apply New) Era Switch */}
      <div
        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
          isLight
            ? 'bg-violet-50/60 border-violet-200'
            : 'bg-violet-950/20 border-violet-500/30'
        }`}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold">
            Kevpert Pack Recommended Keybinding Era (Apply Old vs Apply New)
          </span>
          <span className="text-[10px] opacity-75">
            {packRecommendedVariation
              ? rawMatchesLatest
                ? `Current pack's video description (${packRecommendedVariation.presetKey}) already matches Kevpert's latest keybinding parameters.`
                : applyNew
                  ? `ON (Apply New): Overriding this pack's historical video spec with Kevpert's latest ${packRecommendedVariation.presetKey} parameters.`
                  : `OFF (Apply Old • Default): Using the exact BakkesMod parameters from this pack's original YouTube video description (${packRecommendedVariation.presetLabel || packRecommendedVariation.label || packRecommendedVariation.presetKey}).`
              : 'Default OFF (Apply Old) uses each Kevpert pack’s original YouTube video description parameters; ON (Apply New) upgrades to latest F3–F12 binds.'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              !applyNew
                ? isLight
                  ? 'text-violet-700 font-extrabold'
                  : 'text-violet-300 font-extrabold'
                : 'opacity-45'
            }`}
          >
            Apply Old
          </span>
          <ToggleSwitch
            checked={applyNew}
            onCheckedChange={(checked) =>
              onUpdateToggles({ applyNewKevpertBind: checked })
            }
            isLight={isLight}
          />
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              applyNew
                ? isLight
                  ? 'text-sky-700 font-extrabold'
                  : 'text-cyan-300 font-extrabold'
                : 'opacity-45'
            }`}
          >
            Apply New
          </span>
        </div>
      </div>

      {/* 2. Quick Toggle Switches & Boost / Angular Velocity Controls */}
      <div
        className={`p-3 rounded-xl border flex flex-col gap-2.5 ${
          isLight
            ? 'bg-neutral-50/80 border-neutral-200'
            : 'bg-neutral-850/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
            <Zap className="h-3 w-3 text-amber-400" />
            Quick Difficulty, Boost & Spin Toggles
          </span>
          <span className="text-[10px] font-mono opacity-60">
            Applies to both Recommended & Custom Variance
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Override Unlimited Boost as 100 (Default ON) */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">
                Override Unlimited Boost as 100
              </span>
              <span className="text-[9px] opacity-65">
                Default ON: Top HUD shows INF while arena & bottom-right gauge consume from 100
              </span>
            </div>
            <ToggleSwitch
              checked={toggles.overrideUnlimitedBoostAs100 !== false}
              onCheckedChange={(v) =>
                onUpdateToggles({ overrideUnlimitedBoostAs100: v })
              }
              isLight={isLight}
              variant="neutral"
            />
          </div>

          {/* Enable F to Mirror (Default ON) */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">
                Enable F to Mirror
              </span>
              <span className="text-[9px] opacity-65">
                Default ON: Press [F] in Play Mode to horizontally mirror the active shot
              </span>
            </div>
            <ToggleSwitch
              checked={toggles.enableFToMirror !== false}
              onCheckedChange={(v) =>
                onUpdateToggles({ enableFToMirror: v })
              }
              isLight={isLight}
              variant="neutral"
            />
          </div>

          {/* More Boost (0..100, clamped to 100 in arena) */}
          <div
            className={`p-2.5 rounded-lg border flex flex-col gap-1 ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">More Boost (+0..100)</span>
              <span className="text-[11px] font-mono font-bold text-amber-400">
                +{toggles.moreBoostAmount} (Max 100)
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={toggles.moreBoostAmount}
              onChange={(e) =>
                onUpdateToggles({ moreBoostAmount: Number(e.target.value) || 0 })
              }
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          {/* Disable Ball Variance */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">Disable Ball Variance</span>
              <span className="text-[9px] opacity-65">
                Keep ball trajectory fixed while car varies
              </span>
            </div>
            <ToggleSwitch
              checked={toggles.disableBallVariance}
              onCheckedChange={(v) => onUpdateToggles({ disableBallVariance: v })}
              isLight={isLight}
              variant="neutral"
            />
          </div>

          {/* Disable Vehicle Variance */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">Disable Vehicle Variance</span>
              <span className="text-[9px] opacity-65">
                Keep car spawn & speed fixed while ball varies
              </span>
            </div>
            <ToggleSwitch
              checked={toggles.disableVehicleVariance}
              onCheckedChange={(v) => onUpdateToggles({ disableVehicleVariance: v })}
              isLight={isLight}
              variant="neutral"
            />
          </div>

          {/* Only Disable RLRCSPack Angular Velocity (Default ON) */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">
                Disable RLRCSPack Angular Velocity
              </span>
              <span className="text-[9px] opacity-65">
                Default ON: .Tem shots launch with 0 spin (authentic RL rebound)
              </span>
            </div>
            <ToggleSwitch
              checked={toggles.disableRLRCSPackAngularVelocity}
              onCheckedChange={(v) =>
                onUpdateToggles({ disableRLRCSPackAngularVelocity: v })
              }
              isLight={isLight}
              variant="neutral"
            />
          </div>

          {/* Global Disable Random Angular Velocity */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between ${
              isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/80 border-neutral-800'
            }`}
          >
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">
                Global Disable Random Angular Velocity
              </span>
              <span className="text-[9px] opacity-65">
                Forces 0 initial ball spin across all native & .Tem packs
              </span>
            </div>
            <ToggleSwitch
              checked={toggles.disableAllRandomAngularVelocity}
              onCheckedChange={(v) =>
                onUpdateToggles({ disableAllRandomAngularVelocity: v })
              }
              isLight={isLight}
              variant="neutral"
            />
          </div>
        </div>
      </div>
    </>
  );
};
