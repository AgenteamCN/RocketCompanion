import React from 'react';
import { Check } from 'lucide-react';
import type { SurfaceVariantMeta } from '../../manifest/surfaceMetaTypes';
import { garageSettingsStore } from '../../config/vehiclePresets';
import { Badge } from '../../primitives/Badge';
import { useAppStore } from '../../stores/appStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { CARS } from './garageConstants';

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'car',
  label: '1. Car Body Selection',
  description:
    '10 vehicle chassis presets with Octane / Dominus / Plank / Hybrid / Breakout / Merc hitbox archetype badges.',
};

export interface GarageCarTabProps {
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

export const GarageCarTab: React.FC<GarageCarTabProps> = ({
  onHoverDesc,
  isLight = false,
}) => {
  const activeCar = useScopedStore('appStore', useAppStore, (s) => s.activeCar) || 'fennec';
  const setActiveCar = useScopedStore('appStore', useAppStore, (s) => s.setActiveCar);

  const handleSelectCar = (carId: string) => {
    setActiveCar(carId);
    try {
      garageSettingsStore.save({ vehiclePreset: carId, carVisual: carId });
    } catch {
      // ignore storage error
    }
  };

  return (
    <div
      className="grid grid-cols-4 auto-rows-fr gap-3 w-full h-full flex-1 p-0.5"
      data-ui-element="garage-tab-car"
    >
      {CARS.map((car) => {
        const isSelected = activeCar === car.id;
        return (
          <button
            key={car.id}
            type="button"
            onClick={() => handleSelectCar(car.id)}
            onMouseEnter={() =>
              onHoverDesc?.(`Equip ${car.name} chassis (${car.hitbox} Hitbox geometry).`)
            }
            onMouseLeave={() => onHoverDesc?.(null)}
            className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all cursor-pointer relative min-h-[88px] h-full gap-2 ${
              isSelected
                ? isLight
                  ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/40 text-neutral-900 shadow-xs'
                  : 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/50 text-white shadow-md'
                : isLight
                ? 'bg-neutral-50 hover:bg-white border-neutral-200/90 text-neutral-800'
                : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700/80 text-neutral-200'
            }`}
          >
            {isSelected && (
              <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px]">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            )}
            <span className="font-bold text-xs truncate max-w-full">
              {car.name}
            </span>
            <Badge
              variant={isSelected ? 'amber' : 'neutral'}
              size="sm"
              isLight={isLight}
            >
              {car.hitbox}
            </Badge>
          </button>
        );
      })}
    </div>
  );
};
