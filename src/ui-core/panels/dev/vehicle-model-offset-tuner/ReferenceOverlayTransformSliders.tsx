import React from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import type { ResolutionCalibrationProfile } from '../../../stores/referenceOverlayStore';

export interface ReferenceOverlayTransformSlidersProps {
  activeProfile: ResolutionCalibrationProfile;
  effectiveResKey: string;
  updateProfile: (patch: Partial<ResolutionCalibrationProfile>, resKey?: string) => void;
  isLight: boolean;
}

export const ReferenceOverlayTransformSliders: React.FC<ReferenceOverlayTransformSlidersProps> = ({
  activeProfile,
  effectiveResKey,
  updateProfile,
  isLight,
}) => {
  return (
    <div className="flex flex-col gap-2 pt-0.5">
      <SliderControl
        label="Overlay Opacity"
        value={activeProfile.opacity}
        min={0}
        max={1}
        step={0.01}
        editable={true}
        allowOutOfBoundsInput={false}
        usePrecisionContext={true}
        onChange={(opacity) => updateProfile({ opacity }, effectiveResKey)}
        isLight={isLight}
      />

      <div className="flex items-center justify-between pt-1 border-t border-neutral-500/20">
        <span className="font-semibold text-[11px]">
          Overlay Scale &amp; Offset ({effectiveResKey})
        </span>
        <button
          type="button"
          onClick={() =>
            updateProfile({ scaleLinked: !activeProfile.scaleLinked }, effectiveResKey)
          }
          className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors ${
            activeProfile.scaleLinked
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
              : isLight
              ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400'
          }`}
          title="Toggle proportional linked Scale X & Scale Y vs independent unlinked axes"
        >
          {activeProfile.scaleLinked ? (
            <>
              <Link2 className="h-3 w-3" />
              <span>Scale Linked (X = Y)</span>
            </>
          ) : (
            <>
              <Unlink2 className="h-3 w-3" />
              <span>Unlinked (X / Y)</span>
            </>
          )}
        </button>
      </div>

      {activeProfile.scaleLinked ? (
        <SliderControl
          label="Uniform Image Scale (X & Y Linked)"
          value={activeProfile.scaleX}
          min={0.1}
          max={3.0}
          step={0.001}
          unit="x"
          editable={true}
          allowOutOfBoundsInput={true}
          usePrecisionContext={true}
          onChange={(val) =>
            updateProfile({ scaleX: val, scaleY: val }, effectiveResKey)
          }
          isLight={isLight}
        />
      ) : (
        <>
          <SliderControl
            label="Image Scale X (Horizontal)"
            value={activeProfile.scaleX}
            min={0.1}
            max={3.0}
            step={0.001}
            unit="x"
            editable={true}
            allowOutOfBoundsInput={true}
            usePrecisionContext={true}
            onChange={(scaleX) => updateProfile({ scaleX }, effectiveResKey)}
            isLight={isLight}
          />
          <SliderControl
            label="Image Scale Y (Vertical)"
            value={activeProfile.scaleY}
            min={0.1}
            max={3.0}
            step={0.001}
            unit="x"
            editable={true}
            allowOutOfBoundsInput={true}
            usePrecisionContext={true}
            onChange={(scaleY) => updateProfile({ scaleY }, effectiveResKey)}
            isLight={isLight}
          />
        </>
      )}

      <SliderControl
        label="Image Offset X (Horizontal Shift)"
        value={activeProfile.offsetX}
        min={-1500}
        max={1500}
        step={0.5}
        unit=" px"
        variation="centered"
        origin={0}
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(offsetX) => updateProfile({ offsetX }, effectiveResKey)}
        isLight={isLight}
      />

      <SliderControl
        label="Image Offset Y (Vertical Shift)"
        value={activeProfile.offsetY}
        min={-1500}
        max={1500}
        step={0.5}
        unit=" px"
        variation="centered"
        origin={0}
        editable={true}
        allowOutOfBoundsInput={true}
        usePrecisionContext={true}
        onChange={(offsetY) => updateProfile({ offsetY }, effectiveResKey)}
        isLight={isLight}
      />
    </div>
  );
};
