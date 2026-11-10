import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import type {
  BoostNozzleArrangement,
  VehicleDescriptor,
} from '../../../config/vehicleTunerConfig';

export interface BoostNozzlesTabProps {
  descriptor: VehicleDescriptor;
  handleBoostNozzleChange?: (patch: Partial<VehicleDescriptor['boostNozzleParams']>) => void;
  isLight: boolean;
  cardClass: string;
}

export const BoostNozzlesTab: React.FC<BoostNozzlesTabProps> = ({
  descriptor,
  handleBoostNozzleChange,
  isLight,
  cardClass,
}) => {
  const [copiedNozzles, setCopiedNozzles] = useState(false);
  const arrangement: BoostNozzleArrangement =
    descriptor.boostNozzleParams.arrangement === 'vertical' ? 'vertical' : 'horizontal';
  const verticalSpacing = descriptor.boostNozzleParams.verticalSpacing ?? 16.2;

  const handleCopyNozzles = async () => {
    try {
      const payload = {
        vehicleId: descriptor.id,
        boostNozzleParams: descriptor.boostNozzleParams,
        boostOutlets: descriptor.boostOutlets,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedNozzles(true);
      setTimeout(() => setCopiedNozzles(false), 1800);
    } catch (err) {
      console.warn('[BoostNozzlesTab] Copy nozzles JSON failed:', err);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[11px] text-amber-500">
            1. Per-Vehicle Dual Boost Exhaust Nozzle Offset ({descriptor.name})
          </span>
          <button
            type="button"
            onClick={handleCopyNozzles}
            title="Copy only this vehicle's boost nozzle parameters"
            className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
              copiedNozzles
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            {copiedNozzles ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copiedNozzles ? 'Copied' : 'Copy Nozzles'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] font-medium">Dual Nozzle Arrangement</span>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Dual Nozzle Arrangement">
            {(
              [
                { id: 'horizontal', label: 'Horizontal (±Z)' },
                { id: 'vertical', label: 'Vertical (Upper/Lower Y)' },
              ] as const
            ).map((opt) => {
              const active = arrangement === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    handleBoostNozzleChange?.({
                      arrangement: opt.id,
                      ...(opt.id === 'vertical' &&
                      descriptor.boostNozzleParams.verticalSpacing === undefined
                        ? { verticalSpacing: 16.2 }
                        : {}),
                    })
                  }
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer transition-colors ${
                    active
                      ? isLight
                        ? 'bg-amber-500 border-amber-600 text-white'
                        : 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <SliderControl
          label="Nozzle X (Rear Longitudinal)"
          value={descriptor.boostNozzleParams.x}
          min={-80}
          max={-35}
          step={0.1}
          unit=" uu"
          onChange={(x) => handleBoostNozzleChange?.({ x })}
          isLight={isLight}
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
        />
        <SliderControl
          label={
            arrangement === 'vertical'
              ? 'Nozzle Y (Lower Base Height)'
              : 'Nozzle Y (Vertical Height)'
          }
          value={descriptor.boostNozzleParams.y}
          min={-10}
          max={30}
          step={0.1}
          unit=" uu"
          onChange={(y) => handleBoostNozzleChange?.({ y })}
          isLight={isLight}
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
        />
        {arrangement === 'vertical' ? (
          <>
            <SliderControl
              label="Vertical Dual Spacing (ΔY Upper - Lower)"
              value={verticalSpacing}
              min={0}
              max={35}
              step={0.1}
              unit=" uu"
              onChange={(spacing) => handleBoostNozzleChange?.({ verticalSpacing: spacing })}
              isLight={isLight}
              editable={true}
              allowOutOfBoundsInput={true}
              usePrecisionContext={true}
            />
            <SliderControl
              label="Nozzle Z (Center Lateral Offset)"
              value={descriptor.boostNozzleParams.z}
              min={-25}
              max={25}
              step={0.1}
              unit=" uu"
              variation="centered"
              origin={0}
              onChange={(z) => handleBoostNozzleChange?.({ z })}
              isLight={isLight}
              editable={true}
              allowOutOfBoundsInput={true}
              usePrecisionContext={true}
            />
          </>
        ) : (
          <SliderControl
            label="Nozzle Z (Lateral Dual Spread)"
            value={descriptor.boostNozzleParams.z}
            min={0}
            max={35}
            step={0.1}
            unit=" uu"
            onChange={(z) => handleBoostNozzleChange?.({ z })}
            isLight={isLight}
            editable={true}
            allowOutOfBoundsInput={true}
            usePrecisionContext={true}
          />
        )}

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[11px]">Follow Chassis Center Offset</span>
          <ToggleSwitch
            checked={Boolean(descriptor.boostNozzleParams.followChassisOffset)}
            onChange={(followChassisOffset) => handleBoostNozzleChange?.({ followChassisOffset })}
            isLight={isLight}
          />
        </div>

        <div
          className={`p-2 rounded-lg border font-mono text-[10px] ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <div className="opacity-70 mb-0.5">Resolved Emitter World Offsets (uu):</div>
          <div>
            {arrangement === 'vertical' ? 'Lower Nozzle' : 'Left Nozzle'}: [
            {descriptor.boostOutlets[0]?.join(', ')}]
          </div>
          <div>
            {arrangement === 'vertical' ? 'Upper Nozzle' : 'Right Nozzle'}: [
            {descriptor.boostOutlets[1]?.join(', ')}]
          </div>
        </div>
      </div>
    </div>
  );
};
