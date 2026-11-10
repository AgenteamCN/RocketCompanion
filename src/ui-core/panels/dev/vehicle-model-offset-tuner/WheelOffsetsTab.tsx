import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import type { VehicleDescriptor } from '../../../config/vehicleTunerConfig';

export interface WheelOffsetsTabProps {
  descriptor: VehicleDescriptor | null | undefined;
  handleWheelPairChange?: (
    pair: 'front' | 'rear',
    field: 'x' | 'z' | 'radius' | 'restY',
    val: number
  ) => void;
  isLight: boolean;
  cardClass: string;
}

export const WheelOffsetsTab: React.FC<WheelOffsetsTabProps> = ({
  descriptor,
  handleWheelPairChange,
  isLight,
  cardClass,
}) => {
  const [copiedWheels, setCopiedWheels] = useState(false);
  if (!descriptor) return null;

  const handleCopyWheels = async () => {
    try {
      const payload = {
        vehicleId: descriptor.id,
        wheelAnchors: descriptor.wheelAnchors,
        suspensionHeights: descriptor.suspensionHeights,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedWheels(true);
      setTimeout(() => setCopiedWheels(false), 1800);
    } catch (err) {
      console.warn('[WheelOffsetsTab] Copy wheels JSON failed:', err);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className={cardClass}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[11px] text-sky-400">
              Wheel Hub Anchors & Suspension Rest Offset ({descriptor.name})
            </span>
            <button
              type="button"
              onClick={handleCopyWheels}
              title="Copy only this vehicle's wheel anchors and suspension heights"
              className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                copiedWheels
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
            >
              {copiedWheels ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedWheels ? 'Copied' : 'Copy Wheels'}</span>
            </button>
          </div>
          <span className="text-[10px] opacity-70">
            Visual wheel hubs are attached to carRoot (not baked in GLB); RocketSim WASM physics raycasts & flip-reset checks stay bound to the Hitbox preset
          </span>
        </div>

        <SliderControl
          label="Front Axle X (Forward)"
          value={descriptor.wheelAnchors[0][0]}
          min={30}
          max={65}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('front', 'x', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Front Track Half-Width Z (Lateral)"
          value={Math.abs(descriptor.wheelAnchors[0][1])}
          min={18}
          max={38}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('front', 'z', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Front Wheel Base Radius"
          value={descriptor.wheelAnchors[0][2]}
          min={8}
          max={20}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('front', 'radius', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Front Suspension Rest Y"
          value={descriptor.suspensionHeights?.[0] ?? -4.5}
          min={-15}
          max={10}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('front', 'restY', v)}
          isLight={isLight}
        />

        <SliderControl
          label="Rear Axle X (Backward)"
          value={descriptor.wheelAnchors[2][0]}
          min={-55}
          max={-20}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('rear', 'x', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Rear Track Half-Width Z (Lateral)"
          value={Math.abs(descriptor.wheelAnchors[2][1])}
          min={18}
          max={38}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('rear', 'z', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Rear Wheel Base Radius"
          value={descriptor.wheelAnchors[2][2]}
          min={8}
          max={20}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('rear', 'radius', v)}
          isLight={isLight}
        />
        <SliderControl
          label="Rear Suspension Rest Y"
          value={descriptor.suspensionHeights?.[2] ?? -2.0}
          min={-15}
          max={10}
          step={0.1}
          unit=" uu"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(v) => handleWheelPairChange?.('rear', 'restY', v)}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
