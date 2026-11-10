import React, { useState } from 'react';
import { exportAudioSettingsJson } from '../../config/audioConfig';
import { ADVANCED_AUDIO_CATEGORIES } from '../../config/audioDetailCatalog';
import { Card } from '../../layout/Card';

export interface AdvancedAudioScopeOverride {
  detailVolumes?: Record<string, number>;
  onDetailVolumeChange?: (key: string, volumePct: number) => void;
  onResetDetailVolumes?: () => void;
  onPreviewDetail?: (key: string) => void;
  onStopPreview?: () => void;
  onCopyJson?: () => { ok: boolean; bytes: number; count: number } | void;
  onExportJson?: () => { ok: boolean; bytes: number; count: number } | void;
}

export interface AdvancedAudioDynamicsSectionProps {
  isLight: boolean;
  catalogCount: number;
  modifiedCount: number;
  activeCategory: string;
  onSelectCategory: (catId: string) => void;
  categoryCounts: Record<string, number>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onResetAll: () => void;
  scopeOverride?: AdvancedAudioScopeOverride;
  onHoverDesc: (desc: string | null) => void;
}

export const AdvancedAudioDynamicsSection: React.FC<
  AdvancedAudioDynamicsSectionProps
> = ({
  isLight,
  catalogCount,
  modifiedCount,
  activeCategory,
  onSelectCategory,
  categoryCounts,
  searchQuery,
  onSearchQueryChange,
  onResetAll,
  scopeOverride,
  onHoverDesc,
}) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const copyAudioJsonToClipboard = (): { ok: boolean; bytes: number; count: number } => {
    if (scopeOverride?.onCopyJson) {
      const res = scopeOverride.onCopyJson();
      if (res && typeof res === 'object') return res;
    }
    try {
      const json = exportAudioSettingsJson();
      const bytes = typeof Blob !== 'undefined' ? new Blob([json]).size : json.length;
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(json).catch(() => {});
      }
      return { ok: true, bytes, count: catalogCount };
    } catch {
      return { ok: false, bytes: 0, count: catalogCount };
    }
  };

  const downloadAudioJsonFile = (): { ok: boolean; bytes: number; count: number } => {
    if (scopeOverride?.onExportJson) {
      const res = scopeOverride.onExportJson();
      if (res && typeof res === 'object') return res;
    }
    try {
      const json = exportAudioSettingsJson();
      const bytes = typeof Blob !== 'undefined' ? new Blob([json]).size : json.length;
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(json).catch(() => {});
      }
      if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audioConfig.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      return { ok: true, bytes, count: catalogCount };
    } catch {
      return { ok: false, bytes: 0, count: catalogCount };
    }
  };

  const handleCopyClick = () => {
    const res = copyAudioJsonToClipboard();
    const kb = res.bytes ? `${(res.bytes / 1024).toFixed(1)} KB` : 'JSON';
    setCopyFeedback(`Copied (${kb})`);
    window.setTimeout(() => setCopyFeedback(null), 1800);
  };

  const handleExportClick = () => {
    const res = downloadAudioJsonFile();
    const kb = res.bytes ? `${(res.bytes / 1024).toFixed(1)} KB` : 'JSON';
    setExportFeedback(`Exported (${kb})`);
    window.setTimeout(() => setExportFeedback(null), 1800);
  };

  return (
    <Card isLight={isLight} variant="outlined" className="p-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider">
            Per-Trigger Gain Calibration (0% – 500% · Default 100%)
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
              modifiedCount > 0
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-400'
            }`}
          >
            {modifiedCount > 0 ? `${modifiedCount} Tuned` : `${catalogCount} Unity`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyClick}
            onMouseEnter={() =>
              onHoverDesc(
                'Copy full audioConfig JSON (all 44 volume multipliers and parameters) directly to system clipboard.'
              )
            }
            onMouseLeave={() => onHoverDesc(null)}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              copyFeedback
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            {copyFeedback || 'Copy JSON'}
          </button>

          <button
            type="button"
            onClick={handleExportClick}
            onMouseEnter={() =>
              onHoverDesc(
                'Download audioConfig.json file and copy full calibration payload to clipboard.'
              )
            }
            onMouseLeave={() => onHoverDesc(null)}
            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider text-amber-500 cursor-pointer transition-colors"
          >
            {exportFeedback || 'Export JSON'}
          </button>

          <button
            type="button"
            onClick={onResetAll}
            onMouseEnter={() =>
              onHoverDesc('Reset all 44 audio detail volume multipliers back to default 100%.')
            }
            onMouseLeave={() => onHoverDesc(null)}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            Reset 100%
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {(ADVANCED_AUDIO_CATEGORIES as readonly { id: string; label: string }[]).map(
            (cat) => {
              const isSelected = activeCategory === cat.id;
              const count = categoryCounts[cat.id] ?? 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold tracking-wide border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                      : isLight
                      ? 'bg-neutral-100/80 hover:bg-neutral-200/80 border-neutral-300/80 text-neutral-600'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-neutral-400'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            }
          )}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Filter trigger or asset..."
          className={`px-2.5 py-1 rounded-md text-xs border outline-none w-44 transition-colors ${
            isLight
              ? 'bg-white border-neutral-300 text-neutral-800 placeholder:text-neutral-400 focus:border-amber-500'
              : 'bg-neutral-900 border-neutral-700 text-neutral-200 placeholder:text-neutral-500 focus:border-amber-500'
          }`}
        />
      </div>
    </Card>
  );
};
