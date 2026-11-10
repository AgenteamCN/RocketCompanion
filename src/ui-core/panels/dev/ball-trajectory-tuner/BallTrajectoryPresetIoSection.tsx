import React, { useState } from 'react';
import { RotateCcw, Copy, Check, Download, Upload } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { DEFAULT_TRAJECTORY_CONFIG } from '../../../config/trainingDefaults';
import { ballTrajectoryTunerStore } from '../../../stores/ballTrajectoryTunerStore';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { quickNotification } from '../../../stores/quickNotificationStore';

export interface BallTrajectoryPresetIoSectionProps {
  isLight?: boolean;
}

export const BallTrajectoryPresetIoSection: React.FC<
  BallTrajectoryPresetIoSectionProps
> = ({ isLight = false }) => {
  const trajectory = useAppStore((s) => s.trajectory);
  const updateTrajectory = useAppStore((s) => s.updateTrajectory);
  const [copiedJson, setCopiedJson] = useState(false);
  const [importedJson, setImportedJson] = useState(false);

  const cfg = {
    ...DEFAULT_TRAJECTORY_CONFIG,
    ...trajectory,
  };

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const handleCopyJson = async () => {
    const jsonStr = JSON.stringify(cfg, null, 2);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonStr);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = jsonStr;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch (err) {
      console.warn('[BallTrajectoryPredictionLineTuner] Failed to copy JSON config:', err);
    }
  };

  const handleDownloadJson = () => {
    try {
      const jsonStr = JSON.stringify(cfg, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ball-trajectory-prediction-line-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[BallTrajectoryPredictionLineTuner] Failed to export JSON file:', err);
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
        quickNotification.warning('Copy TrajectoryConfig JSON to clipboard before clicking Import');
        return;
      }
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        updateTrajectory(parsed);
        setImportedJson(true);
        setTimeout(() => setImportedJson(false), 1800);
      }
    } catch (err) {
      console.warn('[BallTrajectoryPredictionLineTuner] Failed to import JSON:', err);
      quickNotification.error('Invalid Ball Trajectory JSON in clipboard');
    }
  };

  const handleReset = () => {
    updateTrajectory({ ...DEFAULT_TRAJECTORY_CONFIG });
    ballTrajectoryTunerStore.resetTelemetryCounters();
  };

  return (
    <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardBg}`}>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs truncate">Ball Trajectory Prediction Line Tuner</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold shrink-0 ${
              cfg.enabled
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-neutral-500/15 border-neutral-500/30 text-neutral-400'
            }`}
          >
            {cfg.enabled ? 'ACTIVE' : 'DISABLED'}
          </span>
        </div>
        <span className={`text-[10px] mt-0.5 truncate ${mutedText}`}>
          WASM Incremental Tail (1/600 cost) · 3D Shaded Tube · Export JSON Defaults
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleCopyJson}
          title="Copy current TrajectoryConfig JSON to clipboard"
          className={`px-2 py-1 rounded-lg border text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
            copiedJson
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
              : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-300'
          }`}
        >
          {copiedJson ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copiedJson ? 'Copied' : 'Copy'}</span>
        </button>
        <button
          type="button"
          onClick={handleDownloadJson}
          title="Export parameters as ball-trajectory-prediction-line-config.json"
          className={`px-2 py-1 rounded-lg border text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
            isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-300'
          }`}
        >
          <Download className="h-3 w-3" />
          <span>Export</span>
        </button>
        <button
          type="button"
          onClick={handleImportJson}
          title="Import TrajectoryConfig JSON from clipboard"
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            importedJson
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
              : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-300'
          }`}
        >
          {importedJson ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="Reset trajectory parameters & telemetry counters to defaults"
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-300'
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <ToggleSwitch
          checked={Boolean(cfg.enabled)}
          onChange={(enabled) => updateTrajectory({ enabled })}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
