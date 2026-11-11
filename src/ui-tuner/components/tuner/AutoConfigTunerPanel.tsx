import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCcw,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { quickNotification } from '../../../ui-core/stores/quickNotificationStore';
import {
  exportSurfaceCalibrationOverridesJson,
  getSurfaceCalibrationOverride,
  resetRuntimeSurfaceCalibrationOverrides,
  resolveCalibratedDefaultConfig,
  resolveCalibratedSurfaceSizing,
  setRuntimeSurfaceCalibrationOverride,
  subscribeSurfaceCalibration,
} from '../../../ui-core/manifest/surfaceCalibration';
import type { SurfaceSizingSpec } from '../../../ui-core/manifest/surfaceMetaTypes';
import { AutoConfigFieldControlRow } from './AutoConfigFieldControlRow';

type ImportMetaGlobFn = <T = unknown>(
  pattern: string,
  options?: { eager?: boolean }
) => Record<string, T>;

const importMetaGlob = (import.meta as unknown as { glob?: ImportMetaGlobFn }).glob;

const CONFIG_MODULES: Record<string, Record<string, unknown>> =
  typeof importMetaGlob === 'function'
    ? importMetaGlob<Record<string, unknown>>('../../../ui-core/config/*.ts', {
        eager: true,
      })
    : {};

export interface DiscoveredDefaultConfigEntry {
  exportName: string;
  fileStem: string;
  defaultObject: Record<string, unknown>;
}

function collectDiscoveredDefaultConfigs(): DiscoveredDefaultConfigEntry[] {
  const entries: DiscoveredDefaultConfigEntry[] = [];
  for (const [modPath, mod] of Object.entries(CONFIG_MODULES)) {
    const fileStem = modPath.split('/').pop()?.replace(/\.ts$/, '') || modPath;
    for (const [expName, expVal] of Object.entries(mod ?? {})) {
      if (
        expName.startsWith('DEFAULT_') &&
        expName.endsWith('_CONFIG') &&
        expVal &&
        typeof expVal === 'object' &&
        !Array.isArray(expVal)
      ) {
        const scalarKeys = Object.entries(expVal as Record<string, unknown>).filter(
          ([, v]) =>
            typeof v === 'number' ||
            typeof v === 'boolean' ||
            (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v))
        );
        if (scalarKeys.length > 0) {
          entries.push({
            exportName: expName,
            fileStem,
            defaultObject: expVal as Record<string, unknown>,
          });
        }
      }
    }
  }
  return entries.sort((a, b) => a.exportName.localeCompare(b.exportName));
}

const DISCOVERED_CONFIGS = collectDiscoveredDefaultConfigs();

export interface AutoConfigTunerPanelProps {
  surfaceId: string;
  surfaceLabel?: string;
  defaultSizing?: SurfaceSizingSpec;
  isLight?: boolean;
  defaultCollapsed?: boolean;
}

const FALLBACK_SIZING: SurfaceSizingSpec = {
  width: 480,
  height: 600,
  minWidth: 360,
  minHeight: 240,
  maxHeight: 760,
  mode: 'fixed',
};

export const AutoConfigTunerPanel: React.FC<AutoConfigTunerPanelProps> = React.memo(
  ({
    surfaceId,
    surfaceLabel,
    defaultSizing = FALLBACK_SIZING,
    isLight = false,
    defaultCollapsed = true,
  }) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [copiedJson, setCopiedJson] = useState(false);
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const [, setTick] = useState(0);

    useEffect(() => subscribeSurfaceCalibration(() => setTick((t) => t + 1)), []);

    const defaultMatchedConfigName = useMemo(() => {
      const cleanId = surfaceId
        .replace(/^(floating:|recipe:)/, '')
        .replace(/(FloatingWindow|Recipe)$/, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      const matched = DISCOVERED_CONFIGS.find((c) => {
        const stem = c.fileStem.replace(/Config$/i, '').toLowerCase();
        return cleanId.includes(stem) || stem.includes(cleanId);
      });
      return matched?.exportName ?? DISCOVERED_CONFIGS[0]?.exportName ?? '';
    }, [surfaceId]);

    const [selectedConfigName, setSelectedConfigName] = useState<string>(defaultMatchedConfigName);

    useEffect(() => {
      if (defaultMatchedConfigName) setSelectedConfigName(defaultMatchedConfigName);
    }, [defaultMatchedConfigName]);

    const activeConfigEntry = useMemo(
      () => DISCOVERED_CONFIGS.find((c) => c.exportName === selectedConfigName) ?? DISCOVERED_CONFIGS[0],
      [selectedConfigName]
    );

    const calibratedSizing = resolveCalibratedSurfaceSizing(surfaceId, defaultSizing);
    const calibratedConfig = useMemo(() => {
      if (!activeConfigEntry) return {};
      return resolveCalibratedDefaultConfig(surfaceId, activeConfigEntry.defaultObject);
    }, [surfaceId, activeConfigEntry, getSurfaceCalibrationOverride(surfaceId)]);

    const handleSizingChange = (patch: Partial<SurfaceSizingSpec>) => {
      setRuntimeSurfaceCalibrationOverride(surfaceId, patch);
    };

    const handleConfigFieldChange = (fieldKey: string, nextValue: unknown) => {
      setRuntimeSurfaceCalibrationOverride(surfaceId, {
        defaultConfigOverrides: { [fieldKey]: nextValue },
      });
    };

    const handleCopyOverridesJson = () => {
      const json = exportSurfaceCalibrationOverridesJson();
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json).catch(() => {});
      }
      setCopiedJson(true);
      quickNotification.success('Copied surfaceCalibrationOverrides.json to clipboard!');
      window.setTimeout(() => setCopiedJson(false), 1800);
    };

    const handleResetSurface = () => {
      resetRuntimeSurfaceCalibrationOverrides(surfaceId);
      quickNotification.info(`Reset calibration overrides for ${surfaceId}`);
    };

    const scalarEntries = useMemo(() => {
      if (!activeConfigEntry) return [];
      return Object.entries(activeConfigEntry.defaultObject).filter(
        ([, val]) =>
          typeof val === 'number' ||
          typeof val === 'boolean' ||
          (typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val))
      );
    }, [activeConfigEntry]);

    const hasSurfaceOverride = Boolean(getSurfaceCalibrationOverride(surfaceId));
    const btnSecondaryClass = isLight
      ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
      : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-300';

    return (
      <section
        data-tuner-panel="auto-config-tuner"
        className={`rounded-2xl border p-4 transition-colors font-mono text-xs ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200/90 text-neutral-800 shadow-2xs'
            : 'bg-neutral-900/75 border-neutral-800 text-neutral-200 shadow-md'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-6 w-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <Sliders className="h-3.5 w-3.5" />
            </div>
            <span className="font-bold tracking-tight">
              Non-Intrusive Calibration Overlay (`surfaceCalibrationOverrides.json`)
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px] font-bold">
              {surfaceId}
            </span>
            {surfaceLabel && <span className="text-[11px] opacity-75">· {surfaceLabel}</span>}
            {hasSurfaceOverride && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-bold">
                <Sparkles className="h-3 w-3" />
                <span>Calibrated Override Active</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setShowJsonPreview((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors ${btnSecondaryClass}`}
            >
              {showJsonPreview ? 'Hide Ledger JSON' : 'Preview Ledger JSON'}
            </button>

            <button
              type="button"
              onClick={handleCopyOverridesJson}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                copiedJson
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400'
              }`}
            >
              {copiedJson ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedJson ? 'Copied Overrides JSON!' : 'Export surfaceCalibrationOverrides.json'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetSurface}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors ${btnSecondaryClass}`}
              title="Reset runtime calibration overrides for this surface"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCollapsed((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer ${btnSecondaryClass}`}
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Expand Auto-Tuner ({scalarEntries.length} fields)</span>
                </>
              ) : (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>

        {showJsonPreview && (
          <pre className={`mt-3 p-3 rounded-xl border text-[11px] overflow-x-auto max-h-60 overflow-y-auto select-text ${isLight ? 'bg-neutral-900 text-emerald-300 border-neutral-800' : 'bg-black/85 text-emerald-300 border-neutral-800'}`}>
            {exportSurfaceCalibrationOverridesJson()}
          </pre>
        )}

        {!isCollapsed && (
          <div className="mt-4 pt-3 border-t border-neutral-200/80 dark:border-neutral-800 grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 flex flex-col gap-3 p-3 rounded-xl border bg-white/60 dark:bg-neutral-950/60 border-neutral-200/80 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
                  1. Surface Geometry &amp; Sizing Overlay
                </span>
                <SegmentedSwitch
                  size="sm"
                  isLight={isLight}
                  value={calibratedSizing.mode ?? 'fixed'}
                  onChange={(val) => handleSizingChange({ mode: val as SurfaceSizingSpec['mode'] })}
                  options={[
                    { value: 'fixed', label: 'Fixed' },
                    { value: 'adaptive', label: 'Adaptive' },
                  ]}
                />
              </div>

              <SliderControl
                label="Calibrated Width (px)"
                value={calibratedSizing.width}
                min={280}
                max={1280}
                step={4}
                unit="px"
                isLight={isLight}
                colorScheme="amber"
                onChange={(width) => handleSizingChange({ width })}
              />

              <SliderControl
                label="Calibrated Height (px)"
                value={typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 600}
                min={200}
                max={1080}
                step={4}
                unit="px"
                isLight={isLight}
                colorScheme="amber"
                onChange={(height) => handleSizingChange({ height })}
              />

              <SliderControl
                label="Min Width (px)"
                value={calibratedSizing.minWidth ?? 320}
                min={240}
                max={960}
                step={4}
                unit="px"
                isLight={isLight}
                onChange={(minWidth) => handleSizingChange({ minWidth })}
              />

              <SliderControl
                label="Min Height (px)"
                value={calibratedSizing.minHeight ?? 220}
                min={160}
                max={800}
                step={4}
                unit="px"
                isLight={isLight}
                onChange={(minHeight) => handleSizingChange({ minHeight })}
              />
            </div>

            <div className="lg:col-span-7 flex flex-col gap-3 p-3 rounded-xl border bg-white/60 dark:bg-neutral-950/60 border-neutral-200/80 dark:border-neutral-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-500">
                  2. Auto-Discovered Config Schema ({DISCOVERED_CONFIGS.length} Contracts)
                </span>
                <select
                  aria-label="Select discovered DEFAULT_*_CONFIG object"
                  value={selectedConfigName}
                  onChange={(e) => setSelectedConfigName(e.target.value)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono outline-none cursor-pointer ${
                    isLight ? 'bg-white border-neutral-200 text-neutral-800' : 'bg-neutral-900 border-neutral-700 text-neutral-200'
                  }`}
                >
                  {DISCOVERED_CONFIGS.map((cfg) => (
                    <option key={cfg.exportName} value={cfg.exportName}>
                      {cfg.exportName} ({cfg.fileStem}.ts)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {scalarEntries.map(([fieldKey, rawDefaultVal]) => {
                  const currentVal =
                    (calibratedConfig as Record<string, unknown>)[fieldKey] ?? rawDefaultVal;
                  return (
                    <AutoConfigFieldControlRow
                      key={fieldKey}
                      fieldKey={fieldKey}
                      rawDefaultVal={rawDefaultVal}
                      currentVal={currentVal}
                      onChange={handleConfigFieldChange}
                      isLight={isLight}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }
);

AutoConfigTunerPanel.displayName = 'AutoConfigTunerPanel';
