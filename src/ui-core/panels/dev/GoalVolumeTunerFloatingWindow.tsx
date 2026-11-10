import React, { useState, useEffect } from 'react';
import {
  Box,
  Copy,
  Check,
  Download,
  Upload,
  RotateCcw,
} from 'lucide-react';
import {
  getGoalVolumeTunerConfig,
  updateGoalVolumeTunerConfig,
  resetGoalVolumeTunerConfig,
  subscribeGoalVolumeTunerConfig,
} from '../../config/goalVolumeTunerConfig';
import { GoalVolumeHitboxSection } from './goal-volume-tuner/GoalVolumeHitboxSection';
import { GoalVolumeBallRimFxSection } from './goal-volume-tuner/GoalVolumeBallRimFxSection';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { quickNotification } from '../../stores/quickNotificationStore';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'goal-volume-tuner',
  title: 'Goal Volume & Rim FX',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  icon: 'Box',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 820,
    mode: 'adaptive',
  },
  variants: [
    { variantId: 'ball_rim_fx', label: 'Ball Rim FX' },
    { variantId: 'hitbox', label: 'Hitbox Bounds' },
  ],
};

export type TunerSectionTab = 'ball_rim_fx' | 'hitbox';

export interface GoalVolumeTunerFloatingWindowProps extends StandardSurfaceProps {
  activeTab?: TunerSectionTab | string;
}

export const GoalVolumeTunerFloatingWindow: React.FC<GoalVolumeTunerFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<TunerSectionTab>(() =>
    controlledTab && ['ball_rim_fx', 'hitbox'].includes(controlledTab)
      ? (controlledTab as TunerSectionTab)
      : 'ball_rim_fx'
  );
  const activeTab: TunerSectionTab =
    controlledTab && ['ball_rim_fx', 'hitbox'].includes(controlledTab)
      ? (controlledTab as TunerSectionTab)
      : internalTab;
  const setActiveTab = (nextTab: TunerSectionTab) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };
  const [cfg, setCfg] = useState(() => getGoalVolumeTunerConfig());
  const [copied, setCopied] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    return subscribeGoalVolumeTunerConfig((next: ReturnType<typeof getGoalVolumeTunerConfig>) => {
      setCfg(next);
    });
  }, []);

  const handleCopyJson = () => {
    try {
      const payload = {
        standard: cfg.standard,
        throwback: cfg.throwback,
        ballRimFx: cfg.ballRimFx,
      };
      navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[GoalVolumeTuner] Copy JSON failed:', err);
    }
  };

  const handleDownloadJson = () => {
    try {
      const payload = {
        standard: cfg.standard,
        throwback: cfg.throwback,
        ballRimFx: cfg.ballRimFx,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'goal-volume-and-ball-rim-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[GoalVolumeTuner] Download JSON failed:', err);
    }
  };

  const handleImportJson = async () => {
    try {
      let text = '';
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          // clipboard permission denied or unavailable
        }
      }
      if (!text.trim()) {
        quickNotification.warning('Copy configuration JSON to clipboard before clicking Import');
        return;
      }
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        updateGoalVolumeTunerConfig(parsed);
        setImported(true);
        setTimeout(() => setImported(false), 2000);
      }
    } catch (err) {
      console.warn('[GoalVolumeTuner] Import JSON failed:', err);
      quickNotification.error('Invalid Goal Volume JSON in clipboard');
    }
  };

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs pb-2 overflow-y-auto pr-0.5">
      {/* 1. Header Toolbar */}
      <div className={`p-2.5 rounded-xl border flex items-center justify-between shrink-0 ${cardBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs uppercase tracking-wide truncate">
              Goal Volume &amp; Ball Rim FX Tuner
            </span>
            <span className={`text-[10px] truncate ${mutedText}`}>
              In-Goal Outer Rim Glow Curve, Dual Colors &amp; 3D Goal Hitbox AABB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleImportJson}
            title="Import Goal Volume & Ball Rim FX JSON from clipboard"
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
            title="Copy Goal Volume & Ball Rim FX JSON to clipboard"
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
            title="Export Goal Volume & Ball Rim FX JSON file"
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
            onClick={() => resetGoalVolumeTunerConfig()}
            title="Reset Goal Volume & Ball Rim FX to calibrated defaults"
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

      {/* 2. Top-Level Mode Switcher */}
      <div className="shrink-0">
        <SegmentedSwitch
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as TunerSectionTab)}
          options={[
            { value: 'ball_rim_fx', label: 'In-Goal Ball Rim & Dark Core FX' },
            { value: 'hitbox', label: '3D Goal Volume Hitbox (AABB)' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      {activeTab === 'ball_rim_fx' ? (
        <GoalVolumeBallRimFxSection isLight={isLight} />
      ) : (
        <GoalVolumeHitboxSection isLight={isLight} />
      )}
    </div>
  );
};
