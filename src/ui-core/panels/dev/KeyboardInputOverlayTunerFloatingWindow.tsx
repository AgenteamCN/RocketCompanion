import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  RotateCcw,
  Sliders,
  Upload,
} from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useKeyboardInputOverlayStore } from '../../stores/keyboardInputOverlayStore';
import { quickNotification } from '../../stores/quickNotificationStore';
import { KeyboardOverlayGeometryAndOpacitySection } from './keyboard-input-overlay/KeyboardOverlayGeometryAndOpacitySection';
import { KeyboardOverlayColorsAndArrowsSection } from './keyboard-input-overlay/KeyboardOverlayColorsAndArrowsSection';
import { KeyboardOverlayCarNoseArrowsSection } from './keyboard-input-overlay/KeyboardOverlayCarNoseArrowsSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'keyboard-input-overlay-tuner',
  title: 'Keyboard Input Overlay Tuner',
  subtitle: '3x3 Retro Bevel · 3D Attitude Arrows · Car Nose Arrows',
  description:
    'Developer tuner for the 3x3 Keyboard Input Overlay (opacity superposition, trapezoid bevels, 3D WASD attitude arrows) and 4-way 3D Car Nose Arrows.',
  icon: 'keyboard',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 470,
    height: 640,
    minWidth: 340,
    minHeight: 240,
    mode: 'adaptive',
  },
};

export interface KeyboardInputOverlayTunerFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const KeyboardInputOverlayTunerFloatingWindow: React.FC<
  KeyboardInputOverlayTunerFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const store = useKeyboardInputOverlayStore();
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [imported, setImported] = useState(false);
  const [jsonText, setJsonText] = useState(() => store.exportConfigJson());

  useEffect(() => {
    setJsonText(store.exportConfigJson());
  }, [store]);

  if (!active) return null;

  const copyToClipboardWithFallback = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fallback to textarea execCommand below
      }
    }
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleCopyJson = async () => {
    try {
      const jsonStr = store.exportConfigJson();
      setJsonText(jsonStr);
      await copyToClipboardWithFallback(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.warn('[KeyboardInputOverlayTuner] Copy JSON failed:', err);
    }
  };

  const handleExportJson = () => {
    try {
      const jsonStr = store.exportConfigJson();
      setJsonText(jsonStr);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'keyboard-input-overlay-config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExported(true);
      setTimeout(() => setExported(false), 1800);
    } catch (err) {
      console.warn('[KeyboardInputOverlayTuner] Export JSON failed:', err);
    }
  };

  const handleImportJson = async () => {
    try {
      let text = '';
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          // clipboard permission unavailable; fall back to textarea
        }
      }
      const candidate = text.trim() || jsonText.trim();
      if (!candidate) {
        quickNotification.warning(
          'Paste or copy configuration JSON before clicking Import'
        );
        return;
      }
      if (store.importConfigJson(candidate)) {
        setImported(true);
        setTimeout(() => setImported(false), 1800);
      } else {
        quickNotification.error('Invalid Keyboard Input Overlay JSON');
      }
    } catch {
      quickNotification.error('Invalid Keyboard Input Overlay JSON');
    }
  };

  const cardBg = isLight
    ? 'bg-neutral-100/80 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/70 border-neutral-800 text-neutral-100';

  const btnTone = isLight
    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200';

  return (
    <div
      data-ui-interactive="true"
      className="flex flex-col gap-2.5 text-xs select-none"
    >
      {/* Top JSON Configuration Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sliders className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider truncate">
            Overlay &amp; 3D Car Nose Arrows Calibration
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExportJson}
            title="Export Keyboard Input Overlay & Car Nose Arrow JSON configuration file"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer transition-all active:scale-95 ${
              exported
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isLight
                  ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-700'
                  : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 text-sky-300'
            }`}
          >
            {exported ? <Check className="w-3 h-3" /> : <Download className="w-3 h-3" />}
            <span>{exported ? 'Exported' : 'Export JSON'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            title="Copy Keyboard Input Overlay & Car Nose Arrow JSON configuration to clipboard"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer transition-all active:scale-95 ${
              copied
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : btnTone
            }`}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>

          <button
            type="button"
            onClick={handleImportJson}
            title="Import Keyboard Input Overlay JSON configuration from clipboard or textarea"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer transition-all active:scale-95 ${
              imported
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : btnTone
            }`}
          >
            {imported ? <Check className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
            <span>{imported ? 'Imported' : 'Import'}</span>
          </button>

          <button
            type="button"
            onClick={() => store.resetDefaults()}
            title="Reset Keyboard Input Overlay & Car Nose Arrows to defaults"
            className={`p-1 rounded-lg border cursor-pointer transition-all active:scale-95 ${btnTone}`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 max-h-[540px] overflow-y-auto pr-0.5">
        <KeyboardOverlayGeometryAndOpacitySection isLight={isLight} />
        <KeyboardOverlayCarNoseArrowsSection isLight={isLight} />
        <KeyboardOverlayColorsAndArrowsSection isLight={isLight} />

        {/* Data Export & Import JSON Card */}
        <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-semibold text-[11px] bg-emerald-500 hover:bg-emerald-400 text-neutral-950 transition-colors cursor-pointer"
            >
              {exported ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              <span>{exported ? 'Exported .JSON' : 'Export JSON (.json)'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyJson}
              className={`flex items-center gap-1 py-1.5 px-2.5 rounded-lg font-semibold text-[11px] border transition-colors cursor-pointer ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : btnTone
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
            </button>

            <button
              type="button"
              onClick={handleImportJson}
              title="Import JSON from Clipboard or Textarea"
              className={`flex items-center gap-1 py-1.5 px-2 rounded-lg font-medium text-[11px] border transition-colors cursor-pointer ${
                imported
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : btnTone
              }`}
            >
              {imported ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>{imported ? 'Applied' : 'Import'}</span>
            </button>

            <button
              type="button"
              onClick={() => store.resetDefaults()}
              title="Reset to Default Configuration"
              className={`flex items-center gap-1 py-1.5 px-2 rounded-lg font-medium text-[11px] border transition-colors cursor-pointer ${btnTone}`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full rounded border border-neutral-800 bg-[#070a0e] text-emerald-400 font-mono text-[10px] p-1.5 resize-y"
            placeholder="Live configuration JSON — click Export JSON / Copy JSON, or paste JSON here and click Import"
          />
        </div>
      </div>
    </div>
  );
};

KeyboardInputOverlayTunerFloatingWindow.displayName =
  'KeyboardInputOverlayTunerFloatingWindow';
export default KeyboardInputOverlayTunerFloatingWindow;
