import React, { useState, useEffect } from 'react';
import {
  Flame,
  Copy,
  Check,
  Download,
  Upload,
  RotateCcw,
} from 'lucide-react';
import {
  getPerformanceBoostConfig,
  subscribePerformanceBoostConfig,
  updatePerformanceBoostConfig,
  resetPerformanceBoostConfig,
} from '../../config/performanceBoostConfig';
import {
  getVehicleTunerRuntimeFlags,
  setVehicleTunerRuntimeFlags,
} from '../../config/vehicleTunerConfig';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { useAppStore } from '../../stores/appStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { quickNotification } from '../../stores/quickNotificationStore';
import { PerformanceBoostModeAndTimingSection } from './performance-boost-tuner/PerformanceBoostModeAndTimingSection';
import { PerformanceBoostColorSection } from './performance-boost-tuner/PerformanceBoostColorSection';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'performance-boost-tuner',
  title: 'Performance Boost Tuner',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  icon: 'Flame',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 820,
    mode: 'adaptive',
  },
};

export interface PerformanceBoostTunerFloatingWindowProps extends StandardSurfaceProps {}

export const PerformanceBoostTunerFloatingWindow: React.FC<
  PerformanceBoostTunerFloatingWindowProps
> = ({ isLight = false }) => {
  const [cfg, setCfg] = useState(() => getPerformanceBoostConfig());
  const [runtimeFlags, setRuntimeFlagsState] = useState(() => getVehicleTunerRuntimeFlags());
  const [copied, setCopied] = useState(false);
  const [imported, setImported] = useState(false);

  const materials = useScopedStore('appStore', useAppStore, (s) => s.materials);
  const updateMaterials = useScopedStore('appStore', useAppStore, (s) => s.updateMaterials);

  useEffect(() => {
    return subscribePerformanceBoostConfig((next) => {
      setCfg(next);
    });
  }, []);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const handleCopyJson = () => {
    try {
      navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[PerformanceBoostTuner] Copy JSON failed:', err);
    }
  };

  const handleDownloadJson = () => {
    try {
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'performance-boost-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[PerformanceBoostTuner] Download JSON failed:', err);
    }
  };

  const handleImportJson = async () => {
    try {
      let text = '';
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          // clipboard permission denied
        }
      }
      if (!text.trim()) {
        quickNotification.warning('Copy Performance Boost JSON to clipboard before clicking Import');
        return;
      }
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        updatePerformanceBoostConfig(parsed);
        setImported(true);
        setTimeout(() => setImported(false), 2000);
      }
    } catch (err) {
      console.warn('[PerformanceBoostTuner] Import JSON failed:', err);
      quickNotification.error('Invalid Performance Boost JSON in clipboard');
    }
  };

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs pb-2 overflow-y-auto pr-0.5">
      <div className={`p-2.5 rounded-xl border flex items-center justify-between shrink-0 ${cardBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs uppercase tracking-wide truncate">
              Performance Boost Tuner
            </span>
            <span className={`text-[10px] truncate ${mutedText}`}>
              Zero-Bloom · Pose-Attached Beam vs Trajectory Tube Ribbon
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleImportJson}
            title="Import Performance Boost JSON from clipboard"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
              imported
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
          >
            {imported ? <Check className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
            <span>{imported ? 'Imported' : 'Import'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            title="Copy Performance Boost JSON to clipboard"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all active:scale-95 ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            title="Export Performance Boost JSON file"
            className={`p-1.5 rounded-lg border cursor-pointer transition-all active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => resetPerformanceBoostConfig()}
            title="Reset Performance Boost to calibrated defaults"
            className={`p-1.5 rounded-lg border cursor-pointer transition-all active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Active Boost Visual Style & Force Boost Preview */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-amber-400">
              Active Boost Trail Effect (Light Beam / Light Wave)
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              Modifying tuner parameters below updates Light Beam (Attach) & Light Wave (Trail)
            </span>
          </div>
        </div>

        <SegmentedSwitch
          value={
            materials?.boostVisual === 'custom'
              ? cfg.mode === 'attach'
                ? 'light-beam'
                : 'light-wave'
              : (materials?.boostVisual ?? 'light-wave')
          }
          onValueChange={(val) => {
            const nextVisual = val as 'cartoon' | 'gold-rush' | 'light-beam' | 'light-wave';
            updateMaterials({ boostVisual: nextVisual });
            if (nextVisual === 'light-beam') {
              updatePerformanceBoostConfig({ mode: 'attach' }, { autoSwitchToCustom: false });
            } else if (nextVisual === 'light-wave') {
              updatePerformanceBoostConfig({ mode: 'trail' }, { autoSwitchToCustom: false });
            }
          }}
          options={[
            { value: 'cartoon', label: 'Cartoon' },
            { value: 'gold-rush', label: 'Gold Rush' },
            { value: 'light-beam', label: 'Light Beam' },
            { value: 'light-wave', label: 'Light Wave' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />

        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-amber-400">
              Force Boost Preview (Continuous Emission)
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              Continuously emits boost on your vehicle for live visual inspection
            </span>
          </div>
          <ToggleSwitch
            checked={Boolean(runtimeFlags.forceBoostPreview)}
            onCheckedChange={(forceBoostPreview) => {
              const next = setVehicleTunerRuntimeFlags({ forceBoostPreview });
              setRuntimeFlagsState(next);
              if (
                materials?.boostVisual !== 'light-beam' &&
                materials?.boostVisual !== 'light-wave'
              ) {
                updateMaterials({
                  boostVisual: cfg.mode === 'attach' ? 'light-beam' : 'light-wave',
                });
              }
            }}
            isLight={isLight}
          />
        </div>
      </div>

      <PerformanceBoostModeAndTimingSection cfg={cfg} isLight={isLight} />
      <PerformanceBoostColorSection cfg={cfg} isLight={isLight} />
    </div>
  );
};
