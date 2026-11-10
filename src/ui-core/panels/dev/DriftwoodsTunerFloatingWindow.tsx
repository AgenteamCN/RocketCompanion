import React, { useState } from 'react';
import {
  Palette,
  Copy,
  Check,
  Download,
  RotateCcw,
  Sparkles,
  Layers,
  Zap,
  Grid,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import {
  DRIFTWOODS_PRESETS,
  GROUND_Q1_MANIFEST,
  type DriftwoodsPreset
} from '../../config/driftwoodsConfig';
import { DriftwoodsGroundTab } from './driftwoods-tuner/DriftwoodsGroundTab';
import { DriftwoodsSurfacesTab } from './driftwoods-tuner/DriftwoodsSurfacesTab';
import { DriftwoodsTransparentTab } from './driftwoods-tuner/DriftwoodsTransparentTab';
import { DriftwoodsPerformanceTab } from './driftwoods-tuner/DriftwoodsPerformanceTab';
import { DriftwoodsFreeCamSection } from './driftwoods-tuner/DriftwoodsFreeCamSection';
import { TunerPrecisionContext, PrecisionDigitPicker } from '../../primitives/PrecisionDigitPicker';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'driftwoods-tuner',
  title: 'Driftwoods Stadium Tuner',
  layer: 'floating-dev',
  menuGroup: 'calibrated-presets',
  icon: 'Palette',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 820,
    mode: 'adaptive',
  },
  variants: [
    { variantId: 'ground', label: 'Ground Mask' },
    { variantId: 'surfaces', label: 'Surfaces' },
    { variantId: 'transparent', label: 'Transparent' },
    { variantId: 'performance', label: 'Performance' },
  ],
};

export interface DriftwoodsTunerFloatingWindowProps extends StandardSurfaceProps {
  activeTab?: TunerTab | string;
}

export type TunerTab = 'ground' | 'surfaces' | 'transparent' | 'performance';

export const DriftwoodsTunerFloatingWindow: React.FC<DriftwoodsTunerFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const config = useAppStore((s) => s.driftwoodsTuner);
  const updateConfig = useAppStore((s) => s.updateDriftwoodsTuner);
  const resetConfig = useAppStore((s) => s.resetDriftwoodsTuner);
  const applyPreset = useAppStore((s) => s.applyDriftwoodsPreset);

  const precisionStep = useAppStore((s) => s.precisionStep);
  const setPrecisionStep = useAppStore((s) => s.setPrecisionStep);

  const [internalTab, setInternalTab] = useState<TunerTab>(() =>
    controlledTab && ['ground', 'surfaces', 'transparent', 'performance'].includes(controlledTab)
      ? (controlledTab as TunerTab)
      : 'ground'
  );
  const activeTab: TunerTab =
    controlledTab && ['ground', 'surfaces', 'transparent', 'performance'].includes(controlledTab)
      ? (controlledTab as TunerTab)
      : internalTab;
  const setActiveTab = (nextTab: TunerTab) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };
  const [copied, setCopied] = useState<boolean>(false);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState<boolean>(false);

  const buildExportPayload = () => ({
    ...config,
    q1GroundManifest: GROUND_Q1_MANIFEST,
  });

  const handleCopy = () => {
    try {
      const json = JSON.stringify(buildExportPayload(), null, 2);
      navigator.clipboard?.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[DriftwoodsTuner] Failed to copy config to clipboard:', err);
    }
  };

  const handleExportJson = () => {
    try {
      const json = JSON.stringify(buildExportPayload(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `driftwoods-field-tuner-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[DriftwoodsTuner] Failed to export config JSON:', err);
    }
  };

  const handleSelectPreset = (preset: DriftwoodsPreset) => {
    applyPreset(preset);
    setPresetDropdownOpen(false);
  };

  return (
    <TunerPrecisionContext.Provider value={{ step: precisionStep, setStep: setPrecisionStep }}>
      <div className="flex flex-col gap-2 h-full select-none text-xs pb-2">
        {/* 1. Header Toolbar */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900/60 border-neutral-700/60'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Palette className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs uppercase tracking-wide truncate">
                Driftwoods Stadium Tuner
              </span>
              <span className="text-[10px] opacity-75 truncate">
                Q1 7-layer ground mask (L0-L6), 8-mesh PBR &amp; UV matrix
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Preset Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
                }`}
              >
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span>Presets</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {presetDropdownOpen && (
                <div
                  className={`absolute right-0 mt-1 w-56 rounded-xl border shadow-xl py-1 z-50 flex flex-col backdrop-blur-md ${
                    isLight ? 'bg-white/95 border-neutral-200 text-neutral-800' : 'bg-neutral-900/95 border-neutral-700 text-neutral-100'
                  }`}
                >
                  {DRIFTWOODS_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={`px-3 py-1.5 text-left text-xs transition-colors cursor-pointer flex flex-col ${
                        isLight ? 'hover:bg-neutral-100' : 'hover:bg-neutral-800'
                      }`}
                    >
                      <span className="font-semibold text-emerald-500">{p.name}</span>
                      <span className="text-[10px] opacity-70 truncate">{p.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Copy Config */}
            <button
              type="button"
              onClick={handleCopy}
              title="Copy current stadium configuration JSON to clipboard"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Export Config File */}
            <button
              type="button"
              onClick={handleExportJson}
              title="Export stadium configuration & Q1 manifest as JSON file"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
                isLight
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-400'
              }`}
            >
              <Download className="h-3 w-3" />
              <span>Export</span>
            </button>

            {/* Reset Defaults */}
            <button
              type="button"
              onClick={resetConfig}
              title="Reset stadium parameters to defaults"
              className={`p-1 rounded-lg border cursor-pointer transition-all active:scale-95 ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 2. Step Precision Digit Picker */}
        <PrecisionDigitPicker
          step={precisionStep}
          onStepChange={setPrecisionStep}
          isLight={isLight}
        />

        {/* 3. Free Camera Developer Fly-Cam Switch & Controls */}
        <DriftwoodsFreeCamSection isLight={isLight} />

        {/* 4. Sub-Navigation Tabs */}
        <div
          className={`grid grid-cols-4 p-1 rounded-xl border text-[11px] font-semibold text-center ${
            isLight ? 'bg-neutral-100 border-neutral-200 text-neutral-600' : 'bg-neutral-900 border-neutral-800 text-neutral-400'
          }`}
        >
          {(
            [
              { id: 'ground', label: 'Ground', Icon: Grid, activeLight: 'text-emerald-600', activeDark: 'text-emerald-400' },
              { id: 'surfaces', label: 'Surfaces', Icon: Layers, activeLight: 'text-emerald-600', activeDark: 'text-emerald-400' },
              { id: 'transparent', label: 'Enclosures', Icon: Sparkles, activeLight: 'text-emerald-600', activeDark: 'text-emerald-400' },
              { id: 'performance', label: 'Lite Mode', Icon: Zap, activeLight: 'text-amber-600', activeDark: 'text-amber-400' },
            ] as const
          ).map(({ id, label, Icon, activeLight, activeDark }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`py-1 rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1 ${
                activeTab === id
                  ? isLight
                    ? `bg-white ${activeLight} shadow-xs`
                    : `bg-neutral-800 ${activeDark} shadow-xs`
                  : 'hover:text-neutral-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* 5. Tab Body */}
        <div className="flex-1 overflow-y-auto pr-0.5">
          {activeTab === 'ground' && (
            <DriftwoodsGroundTab
              ground={config.ground}
              onChange={(patch) => updateConfig({ ground: { ...config.ground, ...patch } })}
              isLight={isLight}
            />
          )}

          {activeTab === 'surfaces' && (
            <DriftwoodsSurfacesTab
              config={config}
              onChange={updateConfig}
              isLight={isLight}
            />
          )}

          {activeTab === 'transparent' && (
            <DriftwoodsTransparentTab
              config={config}
              onChange={updateConfig}
              isLight={isLight}
            />
          )}

          {activeTab === 'performance' && (
            <DriftwoodsPerformanceTab
              config={config}
              onChange={updateConfig}
              isLight={isLight}
            />
          )}
        </div>

        {/* 6. Footer Guidelines */}
        <div
          className={`p-2 rounded-xl border text-[10px] leading-relaxed transition-colors font-mono ${
            isLight
              ? 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
              : 'bg-neutral-900/40 border-neutral-800 text-neutral-400'
          }`}
        >
          <div>* Real-time GPU updates: zero CPU re-sampling for ground mask &amp; tinting</div>
          <div>* Precision step: select digit &amp; press Up/Down arrows to step (Left/Right move cursor)</div>
        </div>
      </div>
    </TunerPrecisionContext.Provider>
  );
};
