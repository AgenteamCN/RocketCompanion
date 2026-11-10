import React, { useState, useEffect } from 'react';
import {
  Zap,
  Copy,
  Check,
  Download,
  Upload,
  RotateCcw,
} from 'lucide-react';
import {
  getSupersonicTrailConfig,
  subscribeSupersonicTrailConfig,
  updateSupersonicTrailConfig,
  resetSupersonicTrailConfig,
} from '../../config/supersonicTrailConfig';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { SliderControl } from '../../primitives/SliderControl';
import { quickNotification } from '../../stores/quickNotificationStore';
import { SupersonicTrailThreePointGradientSection } from './supersonic-trail-tuner/SupersonicTrailThreePointGradientSection';
import { SupersonicTrailGeometryAndCameraTiltSection } from './supersonic-trail-tuner/SupersonicTrailGeometryAndCameraTiltSection';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'supersonic-trail-tuner',
  title: 'Supersonic Wheel Trail',
  layer: 'floating-dev',
  menuGroup: 'calibrated-presets',
  icon: 'Zap',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 820,
    mode: 'adaptive',
  },
};

export interface SupersonicTrailTunerFloatingWindowProps extends StandardSurfaceProps {}

export const SupersonicTrailTunerFloatingWindow: React.FC<
  SupersonicTrailTunerFloatingWindowProps
> = ({ isLight = false }) => {
  const [cfg, setCfg] = useState(() => getSupersonicTrailConfig());
  const [copied, setCopied] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    return subscribeSupersonicTrailConfig((next) => {
      setCfg(next);
    });
  }, []);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const startSec = (cfg.startAgeTicks / 120).toFixed(3);
  const endSec = (cfg.endAgeTicks / 120).toFixed(3);
  const visibleSec = (Math.max(1, cfg.endAgeTicks - cfg.startAgeTicks) / 120).toFixed(3);

  const handleCopyJson = () => {
    try {
      navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[SupersonicTrailTuner] Copy JSON failed:', err);
    }
  };

  const handleDownloadJson = () => {
    try {
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'supersonic-wheel-trail-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[SupersonicTrailTuner] Download JSON failed:', err);
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
        quickNotification.warning('Copy Supersonic Trail JSON to clipboard before clicking Import');
        return;
      }
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        updateSupersonicTrailConfig(parsed);
        setImported(true);
        setTimeout(() => setImported(false), 2000);
      }
    } catch (err) {
      console.warn('[SupersonicTrailTuner] Import JSON failed:', err);
      quickNotification.error('Invalid Supersonic Trail JSON in clipboard');
    }
  };

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs pb-2 overflow-y-auto pr-0.5">
      <div className={`p-2.5 rounded-xl border flex items-center justify-between shrink-0 ${cardBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-4 w-4 text-purple-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs uppercase tracking-wide truncate">
              Supersonic Wheel Trail Tuner
            </span>
            <span className={`text-[10px] truncate ${mutedText}`}>
              Dual Rear-Wheel Ribbons · White → Pink → Purple 3-Stop Gradient
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleImportJson}
            title="Import Supersonic Trail JSON from clipboard"
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
            title="Copy Supersonic Trail JSON to clipboard"
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
            title="Export Supersonic Trail JSON file"
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
            onClick={() => resetSupersonicTrailConfig()}
            title="Reset Supersonic Trail to calibrated defaults"
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

      {/* Activation & Contact Controls */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-purple-400">Force Active Trail</span>
              <span className={`text-[9px] ${mutedText}`}>Show without Supersonic</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.forceActive)}
              onCheckedChange={(forceActive) => updateSupersonicTrailConfig({ forceActive })}
              isLight={isLight}
            />
          </div>

          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-neutral-500/20">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold">Enable Wheel Trails</span>
              <span className={`text-[9px] ${mutedText}`}>Global 8-car toggle</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.enabled)}
              onCheckedChange={(enabled) => updateSupersonicTrailConfig({ enabled })}
              isLight={isLight}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between px-2 py-1 rounded-lg border border-neutral-500/20">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium">Require Wheel Contact</span>
              <span className={`text-[9px] ${mutedText}`}>Ground / Ball / Car touch</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.requireWheelContact)}
              onCheckedChange={(requireWheelContact) =>
                updateSupersonicTrailConfig({ requireWheelContact })
              }
              isLight={isLight}
            />
          </div>

          <div className="flex items-center justify-between px-2 py-1 rounded-lg border border-neutral-500/20">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium">Suspension Compression</span>
              <span className={`text-[9px] ${mutedText}`}>Trigger on spring compress</span>
            </div>
            <ToggleSwitch
              checked={Boolean(cfg.useSuspensionCompression)}
              onCheckedChange={(useSuspensionCompression) =>
                updateSupersonicTrailConfig({ useSuspensionCompression })
              }
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* Contact History Window */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1">
          <span className="font-bold text-[11px] text-purple-400">
            1. Contact History Window (120Hz Ticks · Sub-Tick Interpolated)
          </span>
          <span className="font-mono text-[10px] opacity-80">
            -{cfg.startAgeTicks}t ({startSec}s) → -{cfg.endAgeTicks}t ({endSec}s) [{visibleSec}s]
          </span>
        </div>

        <SliderControl
          label="Start Emission Delay (-startAgeTicks)"
          description="Continuous sub-tick interpolated head offset behind tire contact patch"
          value={cfg.startAgeTicks}
          min={0}
          max={60}
          step={1}
          unit="t"
          editable={true}
          onChange={(val) =>
            updateSupersonicTrailConfig({
              startAgeTicks: val,
              endAgeTicks: Math.max(val + 2, cfg.endAgeTicks),
            })
          }
          isLight={isLight}
        />

        <SliderControl
          label="End Trail Cutoff (-endAgeTicks)"
          description="Continuous sub-tick interpolated tail cutoff age (30t = 0.25s, 60t = 0.50s)"
          value={cfg.endAgeTicks}
          min={5}
          max={120}
          step={1}
          unit="t"
          editable={true}
          onChange={(val) =>
            updateSupersonicTrailConfig({
              endAgeTicks: Math.max(cfg.startAgeTicks + 2, val),
            })
          }
          isLight={isLight}
        />
      </div>

      <SupersonicTrailThreePointGradientSection cfg={cfg} isLight={isLight} />
      <SupersonicTrailGeometryAndCameraTiltSection cfg={cfg} isLight={isLight} />
    </div>
  );
};
