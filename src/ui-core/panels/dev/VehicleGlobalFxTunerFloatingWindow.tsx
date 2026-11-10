import React, { useState } from 'react';
import {
  Palette,
  Lightbulb,
  Flame,
  Disc,
  RotateCcw,
  Download,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { UnderlineTabs, type TabItem } from '../../primitives/UnderlineTabs';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { TunerPrecisionContext } from '../../primitives/PrecisionDigitPicker';
import {
  FENNEC_DESCRIPTOR,
  GLOBAL_VEHICLE_SURFACE_MATERIALS,
  GLOBAL_VEHICLE_LAMPS_CONFIG,
  hasVehicleDescriptor,
} from '../../config/vehicleTunerConfig';
import {
  getVehicleTunerRuntimeFlags,
  setVehicleTunerRuntimeFlags,
  getWheelModifierConfig,
  setWheelModifierConfig,
  DEFAULT_WHEEL_MODIFIER_CONFIG,
} from '../../config/vehicleTunerConfig';
import {
  getAnodizedPaintTuning,
  updateAnodizedPaintTuning,
} from '../../config/vehicleTunerConfig';
import {
  getBoostParticleRuntimeConfig,
  setBoostParticleRuntimeConfig,
} from '../../config/vehicleTunerConfig';
import { SurfacesTab } from './vehicle-global-fx-tuner/SurfacesTab';
import { LampsTab } from './vehicle-global-fx-tuner/LampsTab';
import { BoostFxTab } from './vehicle-global-fx-tuner/BoostFxTab';
import { WheelsTab } from './vehicle-global-fx-tuner/WheelsTab';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'vehicle-global-fx-tuner',
  title: 'Vehicle Global FX',
  layer: 'floating-dev',
  menuGroup: 'calibrated-presets',
  icon: 'Palette',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 360,
    minHeight: 220,
    maxHeight: 820,
    mode: 'adaptive',
  },
  variants: [
    { variantId: 'surfaces', label: 'Surfaces & Paint' },
    { variantId: 'lamps', label: 'Lamps & Brake' },
    { variantId: 'wheels', label: 'Wheels' },
    { variantId: 'boost', label: 'Boost & FX' },
  ],
};

export interface VehicleGlobalFxTunerFloatingWindowProps extends StandardSurfaceProps {
  activeTab?: VehicleGlobalFxTab | string;
}

export type VehicleGlobalFxTab = 'surfaces' | 'lamps' | 'wheels' | 'boost';

const INITIAL_GLOBAL_SURFACES_SNAPSHOT = JSON.parse(
  JSON.stringify({
    surfaceMaterials: GLOBAL_VEHICLE_SURFACE_MATERIALS,
    lampsConfig: GLOBAL_VEHICLE_LAMPS_CONFIG,
  })
);

/**
 * Vehicle Global Surfaces & FX Tuner Floating Window (Calibrated Preset)
 * Dedicated to universal vehicle visual systems shared across all vehicle models:
 * 1. Surfaces & Paint (Universal body/window/border/metal PBR/Toon/Standard slots & Anodized paint)
 * 2. Lamps & Brake (Universal Headlights & Rear Brake Light color/intensity/speed threshold)
 * 3. Wheels (Universal 3-Face Solid Cylinder width, radius scale, tread & side cap materials)
 * 4. Boost & FX (Universal Gold Rush / Cartoon boost trail, Dual-Stream particles & Bloom)
 */
export const VehicleGlobalFxTunerFloatingWindow: React.FC<VehicleGlobalFxTunerFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const activeCar = useAppStore((s) => s.activeCar);
  const materials = useAppStore((s) => s.materials);
  const updateMaterials = useAppStore((s) => s.updateMaterials);
  const bridge = useAppStore((s) => s.bridge);
  const precisionStep = useAppStore((s) => s.precisionStep);
  const setPrecisionStep = useAppStore((s) => s.setPrecisionStep);

  const [internalTab, setInternalTab] = useState<VehicleGlobalFxTab>(() =>
    controlledTab && ['surfaces', 'lamps', 'wheels', 'boost'].includes(controlledTab)
      ? (controlledTab as VehicleGlobalFxTab)
      : 'surfaces'
  );
  const activeTab: VehicleGlobalFxTab =
    controlledTab && ['surfaces', 'lamps', 'wheels', 'boost'].includes(controlledTab)
      ? (controlledTab as VehicleGlobalFxTab)
      : internalTab;
  const setActiveTab = (nextTab: VehicleGlobalFxTab) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };
  const [copiedJson, setCopiedJson] = useState(false);
  const [, setRevision] = useState(0);
  const [runtimeFlags, setRuntimeFlagsState] = useState(() =>
    setVehicleTunerRuntimeFlags({ colorOverride: false })
  );
  const [paintConfig, setPaintConfig] = useState(() => getAnodizedPaintTuning());
  const [particleConfig, setParticleConfig] = useState(() => getBoostParticleRuntimeConfig());
  const [wheelConfig, setWheelConfig] = useState(() => getWheelModifierConfig());

  const targetCarId = hasVehicleDescriptor(activeCar) ? activeCar : 'fennec';
  const sharedDescriptorProxy = {
    ...FENNEC_DESCRIPTOR,
    surfaceMaterials: GLOBAL_VEHICLE_SURFACE_MATERIALS,
    lampsConfig: GLOBAL_VEHICLE_LAMPS_CONFIG,
  };

  const notifyAndRefresh = () => {
    setRevision((r) => r + 1);
    bridge.onCustomVehicleTunerChange?.(targetCarId);
  };

  React.useEffect(() => {
    const nextFlags = setVehicleTunerRuntimeFlags({ colorOverride: false });
    setRuntimeFlagsState(nextFlags);
    bridge.onCustomVehicleTunerChange?.(targetCarId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleRuntimeFlag = (patch: Partial<typeof runtimeFlags>) => {
    const next = setVehicleTunerRuntimeFlags(patch);
    setRuntimeFlagsState(next);
    notifyAndRefresh();
  };

  const handleSetAllSurfacesMode = (mode: 'standard' | 'toon' | 'pbr') => {
    for (const key of Object.keys(GLOBAL_VEHICLE_SURFACE_MATERIALS)) {
      GLOBAL_VEHICLE_SURFACE_MATERIALS[key].mode = mode;
    }
    notifyAndRefresh();
  };

  const handleSurfaceSlotChange = (
    slotKey: string,
    patch: Partial<typeof GLOBAL_VEHICLE_SURFACE_MATERIALS.body>
  ) => {
    if (!GLOBAL_VEHICLE_SURFACE_MATERIALS[slotKey]) return;
    Object.assign(GLOBAL_VEHICLE_SURFACE_MATERIALS[slotKey], patch);
    notifyAndRefresh();
  };

  const handleLampsChange = (patch: Partial<typeof GLOBAL_VEHICLE_LAMPS_CONFIG>) => {
    Object.assign(GLOBAL_VEHICLE_LAMPS_CONFIG, patch);
    notifyAndRefresh();
  };

  const applyPaintPatch = (patch: Partial<typeof paintConfig>) => {
    const next = updateAnodizedPaintTuning(patch);
    setPaintConfig({ ...next });
    bridge.onAnodizedPaintChange?.(next);
  };

  const applyParticlePatch = (patch: Partial<typeof particleConfig>) => {
    const next = setBoostParticleRuntimeConfig(patch);
    setParticleConfig({ ...next });
    bridge.onBoostParticleConfigChange?.(next);
  };

  const applyWheelPatch = (patch: Partial<typeof DEFAULT_WHEEL_MODIFIER_CONFIG>) => {
    const next = setWheelModifierConfig(patch);
    setWheelConfig({ ...next });
    notifyAndRefresh();
  };

  const handleResetGlobal = () => {
    const snap = JSON.parse(JSON.stringify(INITIAL_GLOBAL_SURFACES_SNAPSHOT)) as {
      surfaceMaterials: typeof GLOBAL_VEHICLE_SURFACE_MATERIALS;
      lampsConfig: typeof GLOBAL_VEHICLE_LAMPS_CONFIG;
    };
    for (const key of Object.keys(snap.surfaceMaterials)) {
      if (GLOBAL_VEHICLE_SURFACE_MATERIALS[key]) {
        Object.assign(GLOBAL_VEHICLE_SURFACE_MATERIALS[key], snap.surfaceMaterials[key]);
      }
    }
    Object.assign(GLOBAL_VEHICLE_LAMPS_CONFIG, snap.lampsConfig);
    const nextWheel = setWheelModifierConfig({ ...DEFAULT_WHEEL_MODIFIER_CONFIG });
    setWheelConfig({ ...nextWheel });
    const nextFlags = setVehicleTunerRuntimeFlags({
      colorOverride: false,
      forceBoostPreview: false,
      forceBrakeLightPreview: false,
      brakePreviewMode: 'auto',
    });
    setRuntimeFlagsState(nextFlags);
    notifyAndRefresh();
  };

  const buildExportJson = () => ({
    version: 'vehicle-global-fx-tuner-v1',
    exportedAt: new Date().toISOString(),
    colorOverride: runtimeFlags.colorOverride,
    wheelModifier: wheelConfig,
    globalCarPaint: {
      activeMode: materials.carPaint,
      anodizedParameters: paintConfig,
    },
    globalBoostAndBloom: {
      activeBoostVisual: materials.boostVisual,
      particleParameters: particleConfig,
    },
    surfaceMaterials: GLOBAL_VEHICLE_SURFACE_MATERIALS,
    lampsConfig: GLOBAL_VEHICLE_LAMPS_CONFIG,
  });

  const handleCopyJson = async () => {
    try {
      const jsonStr = JSON.stringify(buildExportJson(), null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (err) {
      console.warn('[VehicleGlobalFxTuner] Clipboard copy failed:', err);
    }
  };

  const handleDownloadJson = () => {
    try {
      const jsonStr = JSON.stringify(buildExportJson(), null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vehicle-global-surfaces-fx.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[VehicleGlobalFxTuner] Download JSON failed:', err);
    }
  };

  const tabs: TabItem[] = [
    { id: 'surfaces', label: '1. Surfaces', icon: <Palette className="h-3.5 w-3.5" /> },
    { id: 'lamps', label: '2. Lamps', icon: <Lightbulb className="h-3.5 w-3.5" /> },
    { id: 'wheels', label: '3. Wheels', icon: <Disc className="h-3.5 w-3.5" /> },
    { id: 'boost', label: '4. Boost & FX', icon: <Flame className="h-3.5 w-3.5" /> },
  ];

  const cardClass = `p-2.5 rounded-xl border flex flex-col gap-2 ${
    isLight ? 'bg-neutral-50/90 border-neutral-200' : 'bg-neutral-850/75 border-neutral-700/80'
  }`;

  return (
    <TunerPrecisionContext.Provider value={{ step: precisionStep, setStep: setPrecisionStep }}>
      <div className="flex flex-col gap-2.5 text-xs select-none" data-ui-element="vehicle-global-fx-tuner-window">
        {/* Global Appearance & Debug Switches */}
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Universal Vehicle Surfaces, Lamps, Wheels & Boost FX
            </span>
            <span className="text-[10px] font-mono opacity-75">
              Calibrated Global
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <div className="flex items-center justify-between px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <span className="text-[10px] font-bold text-amber-400">Direct Color Override</span>
              <ToggleSwitch
                checked={Boolean(runtimeFlags.colorOverride)}
                onChange={(checked) => handleToggleRuntimeFlag({ colorOverride: checked })}
                isLight={isLight}
              />
            </div>
            <div className="flex items-center justify-between px-2 py-1 rounded-lg border border-neutral-500/20">
              <span className="text-[10px] font-medium">Force Boost On</span>
              <ToggleSwitch
                checked={runtimeFlags.forceBoostPreview}
                onChange={(checked) => handleToggleRuntimeFlag({ forceBoostPreview: checked })}
                isLight={isLight}
              />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <UnderlineTabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as VehicleGlobalFxTab)}
          isLight={isLight}
        />

        {activeTab === 'surfaces' && (
          <SurfacesTab
            descriptor={sharedDescriptorProxy}
            colorOverride={Boolean(runtimeFlags.colorOverride)}
            handleSetAllSurfacesMode={handleSetAllSurfacesMode}
            handleSurfaceSlotChange={handleSurfaceSlotChange}
            carPaintMode={materials.carPaint}
            onCarPaintModeChange={(carPaint) => updateMaterials({ carPaint })}
            paintConfig={paintConfig}
            applyPaintPatch={applyPaintPatch}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {activeTab === 'lamps' && (
          <LampsTab
            descriptor={sharedDescriptorProxy}
            runtimeFlags={runtimeFlags}
            handleLampsChange={handleLampsChange}
            handleToggleRuntimeFlag={handleToggleRuntimeFlag}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {activeTab === 'wheels' && (
          <WheelsTab
            wheelConfig={wheelConfig}
            applyWheelPatch={applyWheelPatch}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {activeTab === 'boost' && (
          <BoostFxTab
            boostVisual={materials.boostVisual}
            onBoostVisualChange={(boostVisual) => updateMaterials({ boostVisual })}
            particleConfig={particleConfig}
            applyParticlePatch={applyParticlePatch}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {/* Footer Actions: Reset, Copy JSON, Download JSON */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-500/20">
          <button
            type="button"
            onClick={handleResetGlobal}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Global FX</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyJson}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                copiedJson
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : isLight
                  ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-900 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 border-amber-400 text-neutral-950'
              }`}
            >
              {copiedJson ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-100'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>.JSON</span>
            </button>
          </div>
        </div>
      </div>
    </TunerPrecisionContext.Provider>
  );
};
