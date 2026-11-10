import React, { useState } from 'react';
import { Car, Box, Flame, Disc } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { garageSettingsStore, HITBOX_PRESETS } from '../../config/vehiclePresets';
import { UnderlineTabs, type TabItem } from '../../primitives/UnderlineTabs';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { TunerPrecisionContext } from '../../primitives/PrecisionDigitPicker';
import { type HitboxPresetSpec } from '../../config/vehicleConstants';
import {
  FENNEC_DESCRIPTOR,
  getVehicleDescriptor,
  hasVehicleDescriptor,
  getVehicleTunerRuntimeFlags,
  setVehicleTunerRuntimeFlags,
  recomputeDescriptorBoostOutlets,
  type VehicleDescriptor,
} from '../../config/vehicleTunerConfig';
import { HitboxAlignTab } from './vehicle-model-offset-tuner/HitboxAlignTab';
import { BoostNozzlesTab } from './vehicle-model-offset-tuner/BoostNozzlesTab';
import { WheelOffsetsTab } from './vehicle-model-offset-tuner/WheelOffsetsTab';
import {
  CustomGlbImportCard,
  type ImportedGlbReportSummary,
} from './vehicle-model-offset-tuner/CustomGlbImportCard';
import {
  INITIAL_VEHICLE_OFFSET_SNAPSHOT,
  getTunerVehicleOptions,
  isBuiltInTunerVehicleId,
  registerImportedTunerVehicleOption,
  VehicleOffsetFooterActions,
  type CustomVehicleId,
} from './vehicle-model-offset-tuner/VehicleOffsetFooterActions';
import type { SurfaceMeta, StandardSurfaceProps } from '../../manifest/surfaceMetaTypes';

export type { CustomVehicleId };

export const SURFACE_META: SurfaceMeta = {
  id: 'vehicle-model-offset-tuner',
  title: 'Vehicle Offsets & Hitbox',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  icon: 'Car',
  defaultSizing: { width: 540, height: 620, minWidth: 340, minHeight: 220, maxHeight: 820, mode: 'adaptive' },
  variants: [
    { variantId: 'hitbox', label: 'Hitbox & Align' },
    { variantId: 'wheels', label: 'Wheel Offsets' },
    { variantId: 'boost', label: 'Boost Nozzles' },
  ],
};

export interface VehicleModelOffsetTunerFloatingWindowProps extends StandardSurfaceProps {
  activeTab?: VehicleTunerTab | string;
}

export type VehicleTunerTab = 'hitbox' | 'wheels' | 'boost';

export const VehicleModelOffsetTunerFloatingWindow: React.FC<VehicleModelOffsetTunerFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const activeCar = useAppStore((s) => s.activeCar);
  const setActiveCar = useAppStore((s) => s.setActiveCar);
  const gameplay = useAppStore((s) => s.gameplay);
  const updateGameplay = useAppStore((s) => s.updateGameplay);
  const bridge = useAppStore((s) => s.bridge);
  const precisionStep = useAppStore((s) => s.precisionStep);
  const setPrecisionStep = useAppStore((s) => s.setPrecisionStep);

  const [selectedCar, setSelectedCar] = useState<CustomVehicleId>(() =>
    hasVehicleDescriptor(activeCar) ? (activeCar as CustomVehicleId) : 'fennec'
  );
  const [internalTab, setInternalTab] = useState<VehicleTunerTab>(() =>
    controlledTab && ['hitbox', 'wheels', 'boost'].includes(controlledTab)
      ? (controlledTab as VehicleTunerTab)
      : 'hitbox'
  );
  const activeTab: VehicleTunerTab =
    controlledTab && ['hitbox', 'wheels', 'boost'].includes(controlledTab)
      ? (controlledTab as VehicleTunerTab)
      : internalTab;
  const setActiveTab = (nextTab: VehicleTunerTab) => {
    setInternalTab(nextTab);
    onTabChange?.(nextTab);
  };
  const [, setRevision] = useState(0);
  const [runtimeFlags, setRuntimeFlagsState] = useState(() => getVehicleTunerRuntimeFlags());

  const vehicleOptions = getTunerVehicleOptions();
  const descriptor: VehicleDescriptor = getVehicleDescriptor(selectedCar) || FENNEC_DESCRIPTOR;
  const hitboxSpec: HitboxPresetSpec =
    HITBOX_PRESETS[descriptor.hitboxPreset] || HITBOX_PRESETS['hitbox-octane'];

  const notifyAndRefresh = (carId: CustomVehicleId = selectedCar, nextHitboxPreset?: string) => {
    const desc = getVehicleDescriptor(carId);
    if (desc) recomputeDescriptorBoostOutlets(desc);
    setRevision((r) => r + 1);
    bridge.onCustomVehicleTunerChange?.(carId, nextHitboxPreset);
  };

  React.useEffect(() => {
    notifyAndRefresh(selectedCar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (activeCar && hasVehicleDescriptor(activeCar) && activeCar !== selectedCar) {
      setSelectedCar(activeCar as CustomVehicleId);
      setRuntimeFlagsState(setVehicleTunerRuntimeFlags({ activeVehicleId: activeCar }));
    }
  }, [activeCar, selectedCar]);

  const handleSelectVehicle = (carId: CustomVehicleId) => {
    if (!carId) return;
    setSelectedCar(carId);
    setRuntimeFlagsState(setVehicleTunerRuntimeFlags({ activeVehicleId: carId }));
    if (isBuiltInTunerVehicleId(carId)) {
      try {
        garageSettingsStore.save({ vehiclePreset: carId, carVisual: carId });
      } catch {
        // ignore storage error
      }
    }
    setActiveCar(carId);
  };

  const handleImportCustomGlb = async (
    vehicleId: string,
    arrayBuffer: ArrayBuffer,
    fileName: string,
    alignPreset: string
  ): Promise<ImportedGlbReportSummary | null> => {
    const res = (await bridge.onImportCustomVehicleGlb?.(
      vehicleId,
      arrayBuffer,
      fileName,
      alignPreset
    )) as ImportedGlbReportSummary | undefined;
    const importedId = (res?.vehicleId || vehicleId) as CustomVehicleId;
    const desc = getVehicleDescriptor(importedId);
    if (desc) {
      registerImportedTunerVehicleOption(desc, res?.fileName || fileName);
      handleSelectVehicle(desc.id);
      notifyAndRefresh(desc.id, desc.hitboxPreset);
    } else {
      notifyAndRefresh(selectedCar);
    }
    return res || null;
  };

  const handleApplyAlignPreset = (vehicleId: string, alignPreset: string) => {
    bridge.onApplyVehicleAlignPreset?.(vehicleId, alignPreset);
    const desc = getVehicleDescriptor(vehicleId);
    notifyAndRefresh(vehicleId as CustomVehicleId, desc?.hitboxPreset);
  };

  const handleToggleRuntimeFlag = (patch: Partial<typeof runtimeFlags>) => {
    const next = setVehicleTunerRuntimeFlags(patch);
    setRuntimeFlagsState(next);
    notifyAndRefresh(selectedCar);
  };

  const handleAlignmentChange = (patch: Partial<typeof descriptor.alignment>) => {
    Object.assign(descriptor.alignment, patch);
    notifyAndRefresh(selectedCar);
  };

  const handleCenterOffsetAxis = (axisIndex: 0 | 1 | 2, val: number) => {
    const [ox = 0, oy = 0, oz = 0] = descriptor.alignment.centerOffset || [0, 0, 0];
    const nextOffset: [number, number, number] = [ox, oy, oz];
    nextOffset[axisIndex] = Number(val.toFixed(6));
    descriptor.alignment.centerOffset = nextOffset;
    notifyAndRefresh(selectedCar);
  };

  const handleAlignTopToRLHitbox = () => {
    const raw = descriptor.rawBounds;
    if (!raw || !hitboxSpec) return;
    const s = descriptor.alignment.scale ?? 1;
    const sx = s * (descriptor.alignment.scaleX ?? 1);
    const sy = s * (descriptor.alignment.scaleY ?? 1);
    const rlTopY = raw.rlHitboxTopY ?? (hitboxSpec.up + (hitboxSpec.height - 2.5) * 0.5);
    descriptor.alignment.centerOffset = [
      Number((hitboxSpec.forward - raw.center[0] * sx).toFixed(3)),
      Number((rlTopY - raw.roofTopY * sy).toFixed(3)),
      0,
    ];
    notifyAndRefresh(selectedCar);
  };

  const handleAlignToWheelArches = () => {
    descriptor.alignment.centerOffset = selectedCar === 'fennec' ? [0, 1.75, 0] : [0, 0, 0];
    notifyAndRefresh(selectedCar);
  };

  const handleAlignRawOrigin = () => {
    Object.assign(descriptor.alignment, {
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      centerOffset: [0, 0, 0] as [number, number, number],
    });
    notifyAndRefresh(selectedCar);
  };

  const handleWheelPairChange = (
    pair: 'front' | 'rear',
    field: 'x' | 'z' | 'radius' | 'restY',
    val: number
  ) => {
    const [i0, i1] = pair === 'front' ? [0, 1] : [2, 3];
    if (field === 'x') {
      descriptor.wheelAnchors[i0][0] = val;
      descriptor.wheelAnchors[i1][0] = val;
    } else if (field === 'z') {
      descriptor.wheelAnchors[i0][1] = Math.abs(val);
      descriptor.wheelAnchors[i1][1] = -Math.abs(val);
    } else if (field === 'radius') {
      descriptor.wheelAnchors[i0][2] = val;
      descriptor.wheelAnchors[i1][2] = val;
    } else {
      descriptor.suspensionHeights[i0] = val;
      descriptor.suspensionHeights[i1] = val;
    }
    notifyAndRefresh(selectedCar);
  };

  const handleBoostNozzleChange = (patch: Partial<typeof descriptor.boostNozzleParams>) => {
    Object.assign(descriptor.boostNozzleParams, patch);
    notifyAndRefresh(selectedCar);
  };

  const handleResetVehicle = () => {
    const initialSnap = INITIAL_VEHICLE_OFFSET_SNAPSHOT[selectedCar];
    bridge.onApplyVehicleAlignPreset?.(
      selectedCar,
      isBuiltInTunerVehicleId(selectedCar) ? selectedCar : 'auto'
    );
    if (initialSnap) {
      const snap = JSON.parse(JSON.stringify(initialSnap));
      Object.assign(descriptor, snap);
    }
    notifyAndRefresh(selectedCar, descriptor.hitboxPreset);
  };

  const tabs: TabItem[] = [
    { id: 'hitbox', label: '1. Hitbox & Align', icon: <Box className="h-3.5 w-3.5" /> },
    { id: 'wheels', label: '2. Wheel Offsets', icon: <Disc className="h-3.5 w-3.5" /> },
    { id: 'boost', label: '3. Boost Nozzles', icon: <Flame className="h-3.5 w-3.5" /> },
  ];

  const cardClass = `p-2.5 rounded-xl border flex flex-col gap-2 ${
    isLight ? 'bg-neutral-50/90 border-neutral-200' : 'bg-neutral-850/75 border-neutral-700/80'
  }`;

  return (
    <TunerPrecisionContext.Provider value={{ step: precisionStep, setStep: setPrecisionStep }}>
      <div className="flex flex-col gap-2.5 text-xs select-none" data-ui-element="vehicle-tuner-window">
        {/* Top Chassis Selector & Spatial Debug Switches */}
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-[11px] uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 shrink-0" />
              <span>Target Vehicle Model ({vehicleOptions.length})</span>
            </span>
            <span className="text-[10px] font-mono opacity-75">
              Equipped: <strong>{descriptor.name}</strong>
            </span>
          </div>

          <div
            className="flex flex-wrap gap-1"
            role="radiogroup"
            aria-label="Target Vehicle Model"
          >
            {vehicleOptions.map((opt) => {
              const isSelected = selectedCar === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  title={opt.isImported ? `Imported GLB: ${opt.fileName || opt.label}` : opt.label}
                  onClick={() => handleSelectVehicle(opt.value)}
                  className={`px-2 py-1 rounded-md border text-[11px] font-semibold leading-tight whitespace-nowrap cursor-pointer transition-colors flex-auto text-center ${
                    isSelected
                      ? isLight
                        ? 'bg-amber-500 border-amber-600 text-white shadow-xs'
                        : 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-xs'
                      : opt.isImported
                      ? isLight
                        ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                        : 'bg-sky-950/50 hover:bg-sky-900/60 border-sky-500/40 text-sky-200'
                      : isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-700/80 text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[
              {
                label: 'Hitbox Wire',
                checked: Boolean(gameplay.showAllCarHitboxes || gameplay.showCarHitbox),
                onChange: (c: boolean) => updateGameplay({ showCarHitbox: c, showAllCarHitboxes: c }),
              },
              {
                label: 'Wheel Wire',
                checked: Boolean(runtimeFlags.showWheelWire),
                onChange: (c: boolean) => handleToggleRuntimeFlag({ showWheelWire: c }),
              },
              {
                label: 'Nozzle Gizmos',
                checked: Boolean(runtimeFlags.showNozzleGizmos),
                onChange: (c: boolean) => handleToggleRuntimeFlag({ showNozzleGizmos: c }),
              },
              {
                label: 'Force Boost',
                checked: Boolean(runtimeFlags.forceBoostPreview),
                onChange: (c: boolean) => handleToggleRuntimeFlag({ forceBoostPreview: c }),
              },
              {
                label: 'Border #ff40ff',
                checked: Boolean(runtimeFlags.borderColorOverride),
                onChange: (c: boolean) => handleToggleRuntimeFlag({ borderColorOverride: c }),
                accent: true,
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex-1 min-w-[98px] flex items-center justify-between px-2 py-1 rounded-lg border ${
                  item.accent ? 'border-fuchsia-500/30 bg-fuchsia-500/5' : 'border-neutral-500/20'
                }`}
              >
                <span className={`text-[10px] ${item.accent ? 'font-semibold text-fuchsia-400' : 'font-medium'}`}>
                  {item.label}
                </span>
                <ToggleSwitch checked={item.checked} onChange={item.onChange} isLight={isLight} />
              </div>
            ))}
          </div>
        </div>

        {/* Experimental Custom GLB Upload & Align Presets */}
        <CustomGlbImportCard
          selectedCar={selectedCar}
          descriptor={descriptor}
          onImportGlb={handleImportCustomGlb}
          onApplyAlignPreset={handleApplyAlignPreset}
          isLight={isLight}
          cardClass={cardClass}
        />

        {/* Navigation Tabs */}
        <UnderlineTabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as VehicleTunerTab)}
          isLight={isLight}
        />

        {activeTab === 'hitbox' && (
          <HitboxAlignTab
            descriptor={descriptor}
            hitboxSpec={hitboxSpec}
            selectedCar={selectedCar}
            notifyAndRefresh={notifyAndRefresh}
            handleCenterOffsetAxis={handleCenterOffsetAxis}
            handleAlignmentChange={handleAlignmentChange}
            handleAlignTopToRLHitbox={handleAlignTopToRLHitbox}
            handleAlignToWheelArches={handleAlignToWheelArches}
            handleAlignRawOrigin={handleAlignRawOrigin}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {activeTab === 'wheels' && (
          <WheelOffsetsTab
            descriptor={descriptor}
            handleWheelPairChange={handleWheelPairChange}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {activeTab === 'boost' && (
          <BoostNozzlesTab
            descriptor={descriptor}
            handleBoostNozzleChange={handleBoostNozzleChange}
            isLight={isLight}
            cardClass={cardClass}
          />
        )}

        {/* Footer Actions: Reset, Copy JSON, Download JSON */}
        <VehicleOffsetFooterActions
          selectedCar={selectedCar}
          descriptorName={descriptor.name}
          onResetVehicle={handleResetVehicle}
          isLight={isLight}
        />
      </div>
    </TunerPrecisionContext.Provider>
  );
};
