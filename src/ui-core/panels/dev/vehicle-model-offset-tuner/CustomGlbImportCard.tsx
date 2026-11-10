import React, { useRef, useState } from 'react';
import { Upload, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { VEHICLE_ALIGN_PRESET_OPTIONS } from '../../../config/vehicleExtendedDescriptorsConfig';
import type { VehicleDescriptor } from '../../../config/vehicleTunerConfig';

export interface ImportedGlbReportSummary {
  vehicleId: string;
  label?: string;
  fileName: string;
  alignPreset: string;
  appliedGeometryScale: number;
  unscaledBounds?: {
    length: number;
    height: number;
    width: number;
  };
  scaledBounds?: {
    length: number;
    height: number;
    width: number;
  };
  bindings?: Array<{
    meshName: string;
    materialName: string;
    boundSlot: string;
    isFallback: boolean;
  }>;
  fallbackMaterials?: string[];
}

export interface CustomGlbImportCardProps {
  selectedCar: string;
  descriptor: VehicleDescriptor;
  onImportGlb: (
    vehicleId: string,
    arrayBuffer: ArrayBuffer,
    fileName: string,
    alignPreset: string
  ) => Promise<ImportedGlbReportSummary | null>;
  onApplyAlignPreset: (vehicleId: string, alignPreset: string) => void;
  isLight: boolean;
  cardClass: string;
}

const SHORT_PRESET_LABELS: Readonly<Record<string, string>> = {
  auto: 'Auto-Fit',
  fennec: 'Tpl: Fennec',
  octane: 'Tpl: Octane',
  insidio: 'Tpl: Insidio',
  ryza: 'Tpl: Ryza',
  dominus: 'Tpl: Dominus',
  'breakout-mini': 'Tpl: Breakout',
  sentinel: 'Tpl: Sentinel',
  merc: 'Tpl: Merc',
  trioctane: 'Tpl: TriOctane4',
  'trioctane-threewheel': 'Tpl: TriOctane3',
};

export const CustomGlbImportCard: React.FC<CustomGlbImportCardProps> = ({
  selectedCar,
  descriptor,
  onImportGlb,
  onApplyAlignPreset,
  isLight,
  cardClass,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [presetByCar, setPresetByCar] = useState<Record<string, string>>({});
  const [reportsByCar, setReportsByCar] = useState<Record<string, ImportedGlbReportSummary>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activePreset = presetByCar[selectedCar] || (selectedCar.startsWith('custom-') ? 'auto' : selectedCar);
  const activeReport = reportsByCar[selectedCar] || null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const defaultPresetOnImport = 'auto';
      const report = await onImportGlb('new', buffer, file.name, defaultPresetOnImport);
      if (report) {
        setPresetByCar((prev) => ({
          ...prev,
          [report.vehicleId]: report.alignPreset || defaultPresetOnImport,
        }));
        setReportsByCar((prev) => ({
          ...prev,
          [report.vehicleId]: report,
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      console.warn('[CustomGlbImportCard] Failed to import custom GLB:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handlePresetChange = (nextPreset: string) => {
    setPresetByCar((prev) => ({
      ...prev,
      [selectedCar]: nextPreset,
    }));
    onApplyAlignPreset(selectedCar, nextPreset);
    if (activeReport) {
      setReportsByCar((prev) => ({
        ...prev,
        [selectedCar]: {
          ...activeReport,
          alignPreset: nextPreset,
        },
      }));
    }
  };

  const activePresetMeta =
    VEHICLE_ALIGN_PRESET_OPTIONS.find((opt) => opt.id === activePreset) ||
    VEHICLE_ALIGN_PRESET_OPTIONS[0];

  const fallbackCount = activeReport?.fallbackMaterials?.length ?? 0;

  return (
    <div className={cardClass} data-ui-element="custom-glb-import-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-[11px] uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>GLB Import & Align Presets</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono opacity-75">
            Active: <strong>{descriptor.name}</strong>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,model/gltf-binary"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className={`px-2.5 py-1 rounded-md border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
              isLight
                ? 'bg-sky-600 hover:bg-sky-500 border-sky-700 text-white'
                : 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-500/50 text-sky-200'
            }`}
          >
            <Upload className="h-3 w-3 shrink-0" />
            <span>{isImporting ? 'Importing...' : '+ Import New .GLB'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold opacity-75">
            Align Preset (Applies to <strong>{descriptor.name}</strong>)
          </span>
          <span className="text-[10px] font-mono opacity-65 truncate">
            {activePresetMeta.label}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="Align Preset"
          className="flex flex-wrap gap-1"
        >
          {VEHICLE_ALIGN_PRESET_OPTIONS.map((opt) => {
            const isSelected = activePreset === opt.id;
            const shortLabel = SHORT_PRESET_LABELS[opt.id] || opt.label;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                title={`${opt.label} — ${opt.description}`}
                onClick={() => handlePresetChange(opt.id)}
                className={`px-2 py-1 rounded-md border text-[10px] font-semibold leading-tight whitespace-nowrap cursor-pointer transition-colors flex-auto text-center ${
                  isSelected
                    ? isLight
                      ? 'bg-sky-600 border-sky-700 text-white shadow-xs'
                      : 'bg-sky-500/25 border-sky-400 text-sky-200 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-700/80 text-neutral-300'
                }`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[10px] opacity-75 leading-snug">
        {activePresetMeta.description}. Imported <code>.glb</code> files are added as new selectable
        vehicle buttons above for instant side-by-side comparison.
      </div>

      {errorMessage && (
        <div className="p-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-[10px] font-mono">
          Import Error: {errorMessage}
        </div>
      )}

      {activeReport && (
        <div
          className={`p-2 rounded-lg border font-mono text-[10px] flex flex-col gap-1 ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="font-bold text-sky-400 truncate max-w-[230px]">
              File: {activeReport.fileName}
            </span>
            <span>
              Preset: <strong>{activeReport.alignPreset}</strong> ({activeReport.appliedGeometryScale}x)
            </span>
          </div>

          {activeReport.unscaledBounds && activeReport.scaledBounds && (
            <div className="opacity-80">
              Raw L/H/W: [{activeReport.unscaledBounds.length}, {activeReport.unscaledBounds.height},{' '}
              {activeReport.unscaledBounds.width}] → UU: [{activeReport.scaledBounds.length.toFixed(1)},{' '}
              {activeReport.scaledBounds.height.toFixed(1)}, {activeReport.scaledBounds.width.toFixed(1)}
              ]
            </div>
          )}

          {fallbackCount > 0 ? (
            <div className="flex items-start gap-1.5 text-amber-400 pt-0.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Fallback to <strong>body</strong> ({fallbackCount} unrecognized material
                {fallbackCount > 1 ? 's' : ''}, logged to console):{' '}
                {activeReport.fallbackMaterials?.join(', ')}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400 pt-0.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>All mesh materials matched standard 7 slots.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
