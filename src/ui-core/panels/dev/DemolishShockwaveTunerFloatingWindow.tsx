import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Flame,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  advanceDemolishShockwaveSimClock,
  exportDemolishShockwaveJson,
  getDemolishShockwaveConfig,
  getDemolishShockwaveSimState,
  importDemolishShockwaveJson,
  resetDemolishShockwaveConfig,
  setDemolishShockwaveConfig,
  subscribeDemolishShockwaveConfig,
  subscribeDemolishShockwaveSim,
} from '../../config/demolishShockwaveConfig';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { quickNotification } from '../../stores/quickNotificationStore';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { DemolishShockwaveSimAndScrubberSection } from './demolish-shockwave-tuner/DemolishShockwaveSimAndScrubberSection';
import { DemolishShockwaveTracksSection } from './demolish-shockwave-tuner/DemolishShockwaveTracksSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'demolish-shockwave-tuner',
  title: 'Demolish Shockwave Active Tuner',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  icon: 'Sparkles',
  defaultSizing: {
    width: 470,
    height: 640,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 840,
    mode: 'adaptive',
  },
};

export interface DemolishShockwaveTunerFloatingWindowProps extends StandardSurfaceProps {}

export const DemolishShockwaveTunerFloatingWindow: React.FC<
  DemolishShockwaveTunerFloatingWindowProps
> = ({ isLight = false }) => {
  const [config, setConfig] = useState(() => getDemolishShockwaveConfig());
  const [sim, setSim] = useState(() => getDemolishShockwaveSimState());
  const [copied, setCopied] = useState(false);
  const [imported, setImported] = useState(false);
  const [jsonText, setJsonText] = useState(() => exportDemolishShockwaveJson());

  useEffect(() => {
    const unsubCfg = subscribeDemolishShockwaveConfig((next) => {
      setConfig(next);
      setJsonText(exportDemolishShockwaveJson(next));
    });
    const unsubSim = subscribeDemolishShockwaveSim((nextSim) => {
      setSim(nextSim);
    });
    return () => {
      unsubCfg();
      unsubSim();
    };
  }, []);

  useEffect(() => {
    if (!sim.isPlaying) return;
    let rafId = 0;
    const step = (now: number) => {
      advanceDemolishShockwaveSimClock(now);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [sim.isPlaying]);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const handleCopyJson = () => {
    const payload = exportDemolishShockwaveJson(config);
    setJsonText(payload);
    try {
      navigator.clipboard?.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[DemolishShockwaveTuner] Copy JSON failed:', err);
    }
  };

  const handleDownloadJson = () => {
    try {
      const payload = exportDemolishShockwaveJson(config);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'demolish-shockwave-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[DemolishShockwaveTuner] Download JSON failed:', err);
    }
  };

  const handleImportJson = async () => {
    let text = '';
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        // fallback to textarea content if clipboard read is blocked
      }
    }
    const candidate = text.trim() || jsonText.trim();
    if (!candidate) {
      quickNotification.warning('Paste or copy Demolish Shockwave JSON before importing');
      return;
    }
    if (importDemolishShockwaveJson(candidate)) {
      setImported(true);
      setTimeout(() => setImported(false), 2000);
    } else {
      quickNotification.error('Invalid Demolish Shockwave JSON payload');
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full select-none text-xs pb-2 overflow-y-auto pr-0.5">
      <div className={`p-2.5 rounded-xl border flex items-center justify-between shrink-0 ${cardBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-xs truncate">
              Camera-Facing Shockwave Ring FX
            </span>
            <span className={`text-[10px] truncate ${mutedText}`}>
              Outer Radius + Inner Hole % + 6-Stop Thermal Fade + 3D XYZ Sim
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] ${mutedText}`}>Enabled</span>
          <ToggleSwitch
            checked={config.enabled}
            onChange={(val) => setDemolishShockwaveConfig({ enabled: val })}
            isLight={isLight}
          />
        </div>
      </div>

      <DemolishShockwaveSimAndScrubberSection
        config={config}
        sim={sim}
        isLight={isLight}
      />

      <DemolishShockwaveTracksSection
        config={config}
        normT={sim.normT}
        isLight={isLight}
      />

      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 shrink-0 ${cardBg}`}>
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={handleCopyJson}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-semibold text-[11px] bg-amber-500 hover:bg-amber-400 text-neutral-950 transition-colors cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied JSON' : 'Export / Copy JSON'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            title="Download JSON"
            className="flex items-center gap-1 py-1.5 px-2 rounded-lg font-medium text-[11px] border border-neutral-600/60 hover:bg-neutral-700/40 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Save</span>
          </button>
          <button
            type="button"
            onClick={handleImportJson}
            title="Import JSON from Clipboard or Textarea"
            className="flex items-center gap-1 py-1.5 px-2 rounded-lg font-medium text-[11px] border border-neutral-600/60 hover:bg-neutral-700/40 transition-colors cursor-pointer"
          >
            {imported ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Upload className="h-3.5 w-3.5" />}
            <span>{imported ? 'Applied' : 'Import'}</span>
          </button>
          <button
            type="button"
            onClick={() => resetDemolishShockwaveConfig()}
            title="Reset to Default Shockwave Preset"
            className="flex items-center gap-1 py-1.5 px-2 rounded-lg font-medium text-[11px] border border-neutral-600/60 hover:bg-neutral-700/40 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={3}
          spellCheck={false}
          className="w-full rounded border border-neutral-800 bg-[#070a0e] text-emerald-400 font-mono text-[10px] p-1.5 resize-none"
          placeholder="Click Export / Copy JSON or paste JSON here and click Import"
        />
      </div>
    </div>
  );
};
