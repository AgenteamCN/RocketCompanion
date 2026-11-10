import React, { useState } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Palette,
  Compass,
  Hourglass,
  Zap,
  Upload
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { BoostPadShaderTab } from './boost-pad-tuner/BoostPadShaderTab';
import { BoostPadMaterialsTab } from './boost-pad-tuner/BoostPadMaterialsTab';
import { BoostPadRotationsTab } from './boost-pad-tuner/BoostPadRotationsTab';
import { BoostPadRefillTab } from './boost-pad-tuner/BoostPadRefillTab';
import { BoostPadCollectFxTab } from './boost-pad-tuner/BoostPadCollectFxTab';
import { quickNotification } from '../../stores/quickNotificationStore';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'boost-pad-tuner',
  title: 'Boost Pad Tuner',
  layer: 'floating-dev',
  menuGroup: 'calibrated-presets',
  icon: 'Sparkles',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 820,
    mode: 'adaptive',
  },
  variants: [
    { variantId: 'shader', label: 'Shader & Glow' },
    { variantId: 'materials', label: 'Materials' },
    { variantId: 'rotations', label: 'Rotations' },
    { variantId: 'refill', label: 'Refill FX' },
    { variantId: 'collect', label: 'Collect FX' },
  ],
};

export interface BoostPadTunerFloatingWindowProps extends StandardSurfaceProps {
  activeTab?: TabKey | string;
}

export type TabKey = 'shader' | 'materials' | 'rotations' | 'refill' | 'collect';

export const BoostPadTunerFloatingWindow: React.FC<BoostPadTunerFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const tuner = useAppStore((s) => s.boostPadTuner);
  const updateTuner = useAppStore((s) => s.updateBoostPadTuner);
  const resetTuner = useAppStore((s) => s.resetBoostPadTuner);

  const [internalTab, setInternalTab] = useState<TabKey>(() =>
    controlledTab && ['shader', 'materials', 'rotations', 'refill', 'collect'].includes(controlledTab)
      ? (controlledTab as TabKey)
      : 'shader'
  );
  const activeTab: TabKey =
    controlledTab && ['shader', 'materials', 'rotations', 'refill', 'collect'].includes(controlledTab)
      ? (controlledTab as TabKey)
      : internalTab;
  const setActiveTab = (nextTab: TabKey) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };
  const [copied, setCopied] = useState<boolean>(false);
  const [imported, setImported] = useState<boolean>(false);

  const handleCopy = () => {
    try {
      const json = JSON.stringify(tuner, null, 2);
      navigator.clipboard?.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[BoostPadTuner] Failed to copy config to clipboard:', err);
    }
  };

  const handleImport = async () => {
    try {
      let text = '';
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch (err) {
          console.warn('[BoostPadTuner] Clipboard read unavailable:', err);
        }
      }
      if (!text.trim()) {
        quickNotification.warning('Copy Boost Pad configuration JSON to clipboard before clicking Import');
        return;
      }
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (parsed.collectDuration !== undefined && parsed.collectDuration <= 1.0) {
          parsed.collectDuration = Math.round(parsed.collectDuration * 1000);
        }
        if (parsed.orbCollectDuration !== undefined && parsed.orbCollectDuration <= 1.0) {
          parsed.orbCollectDuration = Math.round(parsed.orbCollectDuration * 1000);
        }
        updateTuner(parsed);
        setImported(true);
        setTimeout(() => setImported(false), 2000);
      }
    } catch (err) {
      console.warn('[BoostPadTuner] Failed to import JSON:', err);
      quickNotification.error('Invalid Boost Pad JSON format in clipboard');
    }
  };

  const tabs: Array<{ id: TabKey; label: string; icon: React.ReactNode }> = [
    { id: 'shader', label: 'Shader & Orb', icon: <Sliders className="h-3 w-3" /> },
    { id: 'materials', label: 'Materials', icon: <Palette className="h-3 w-3" /> },
    { id: 'rotations', label: 'Rotations', icon: <Compass className="h-3 w-3" /> },
    { id: 'refill', label: 'Refilling', icon: <Hourglass className="h-3 w-3" /> },
    { id: 'collect', label: 'Collect FX', icon: <Zap className="h-3 w-3" /> },
  ];

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs pb-2">
      {/* 1. Header Toolbar */}
      <div
        className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900/60 border-neutral-700/60'
        }`}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-bold text-xs uppercase tracking-wide">
              Boost Pad Studio
            </span>
            <span className="text-[10px] opacity-75">
              34 RocketSim pads (6 Big + 28 Small) comprehensive visual tuner
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleImport}
            title="Import configuration JSON from clipboard"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
              imported
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
          >
            {imported ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Imported</span>
              </>
            ) : (
              <>
                <Upload className="h-3 w-3" />
                <span>Import</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy current parameters JSON to clipboard"
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
                <span>Copy Config</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetTuner}
            title="Reset parameters to defaults"
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

      {/* 2. Sub-Tabs Segmented Switch */}
      <div
        className={`flex items-center p-1 rounded-xl border gap-1 transition-colors ${
          isLight ? 'bg-neutral-100 border-neutral-200' : 'bg-neutral-900 border-neutral-800'
        }`}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-semibold cursor-pointer transition-all ${
                isActive
                  ? isLight
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                  : isLight
                  ? 'text-neutral-500 hover:text-neutral-800'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Tab Body Container */}
      <div className="flex-1 overflow-y-auto pr-0.5">
        {activeTab === 'shader' && (
          <BoostPadShaderTab tuner={tuner} updateTuner={updateTuner} isLight={isLight} />
        )}
        {activeTab === 'materials' && (
          <BoostPadMaterialsTab tuner={tuner} updateTuner={updateTuner} isLight={isLight} />
        )}
        {activeTab === 'rotations' && (
          <BoostPadRotationsTab tuner={tuner} updateTuner={updateTuner} isLight={isLight} />
        )}
        {activeTab === 'refill' && (
          <BoostPadRefillTab tuner={tuner} updateTuner={updateTuner} isLight={isLight} />
        )}
        {activeTab === 'collect' && (
          <BoostPadCollectFxTab tuner={tuner} updateTuner={updateTuner} isLight={isLight} />
        )}
      </div>

      {/* 4. Footer Note */}
      <div
        className={`p-2 rounded-xl border text-[10px] leading-relaxed transition-colors font-mono shrink-0 ${
          isLight
            ? 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
            : 'bg-neutral-900/40 border-neutral-800 text-neutral-400'
        }`}
      >
        <div>• 34 RocketSim Pads: 6 Big (100-boost) + 28 Small (12-boost)</div>
        <div>• Dual-axis & 180° rotational point symmetry automatic synchronization</div>
        <div>• High-performance 120Hz GPU shaders & zero-allocation state views</div>
      </div>
    </div>
  );
};
