import React from 'react';
import { Link2, Unlink2, RotateCcw } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';

export interface UVTransformState {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  linkScale: boolean;
}

export interface UVTransformControlProps {
  title?: string;
  value: UVTransformState;
  onChange: (patch: Partial<UVTransformState>) => void;
  usePrecisionContext?: boolean;
  isLight?: boolean;
  className?: string;
}

/**
 * UVTransformControl
 * 2D Texture UV Scale (with 1:1 Aspect Ratio Link toggle) and Centered Bipolar Offset X/Y matrix controller.
 */
export const UVTransformControl: React.FC<UVTransformControlProps> = React.memo(({
  title = 'Texture UV Transform (Scale & Offset)',
  value,
  onChange,
  usePrecisionContext = true,
  isLight = false,
  className = '',
}) => {
  const handleScaleXChange = (val: number) => {
    if (value.linkScale) {
      onChange({ scaleX: val, scaleY: val });
    } else {
      onChange({ scaleX: val });
    }
  };

  const handleScaleYChange = (val: number) => {
    if (value.linkScale) {
      onChange({ scaleX: val, scaleY: val });
    } else {
      onChange({ scaleY: val });
    }
  };

  const handleReset = () => {
    onChange({ scaleX: 1.0, scaleY: 1.0, offsetX: 0.0, offsetY: 0.0 });
  };

  return (
    <div
      data-component="uv-transform-control"
      className={`p-3 rounded-xl border flex flex-col gap-2.5 select-none transition-colors ${
        isLight
          ? 'bg-neutral-50/80 border-neutral-200 text-neutral-800'
          : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
          {title}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ linkScale: !value.linkScale })}
            title={
              value.linkScale
                ? 'Scaling linked (1:1). Click to unlock.'
                : 'Scaling unlinked. Click to lock aspect ratio.'
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer transition-colors border ${
              value.linkScale
                ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
                : isLight
                ? 'bg-white text-neutral-600 border-neutral-300'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
          >
            {value.linkScale ? (
              <>
                <Link2 className="h-3 w-3" />
                <span>Linked 1:1</span>
              </>
            ) : (
              <>
                <Unlink2 className="h-3 w-3" />
                <span>Unlinked</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Reset UV repeat (1.0, 1.0) and offset (0.0, 0.0)"
            className={`p-1 rounded border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-600'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div
          className={`p-2.5 rounded-lg border ${
            isLight ? 'bg-white border-neutral-200/80' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <SliderControl
            label="Scale X (Sx)"
            value={value.scaleX}
            min={0.5}
            max={2.0}
            step={0.01}
            origin={1.0}
            variation="centered"
            colorScheme="emerald"
            editable={true}
            showStepper={false}
            usePrecisionContext={usePrecisionContext}
            onChange={handleScaleXChange}
            isLight={isLight}
          />
        </div>

        <div
          className={`p-2.5 rounded-lg border ${
            isLight ? 'bg-white border-neutral-200/80' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <SliderControl
            label="Scale Y (Sy)"
            value={value.scaleY}
            min={0.5}
            max={2.0}
            step={0.01}
            origin={1.0}
            variation="centered"
            colorScheme="emerald"
            editable={true}
            showStepper={false}
            usePrecisionContext={usePrecisionContext}
            onChange={handleScaleYChange}
            isLight={isLight}
          />
        </div>

        <div
          className={`p-2.5 rounded-lg border ${
            isLight ? 'bg-white border-neutral-200/80' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <SliderControl
            label="Offset X (Tx)"
            value={value.offsetX}
            min={-1.0}
            max={1.0}
            step={0.01}
            origin={0.0}
            variation="centered"
            showSign={true}
            colorScheme="amber"
            editable={true}
            showStepper={false}
            usePrecisionContext={usePrecisionContext}
            onChange={(val) => onChange({ offsetX: val })}
            isLight={isLight}
          />
        </div>

        <div
          className={`p-2.5 rounded-lg border ${
            isLight ? 'bg-white border-neutral-200/80' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <SliderControl
            label="Offset Y (Ty)"
            value={value.offsetY}
            min={-1.0}
            max={1.0}
            step={0.01}
            origin={0.0}
            variation="centered"
            showSign={true}
            colorScheme="amber"
            editable={true}
            showStepper={false}
            usePrecisionContext={usePrecisionContext}
            onChange={(val) => onChange({ offsetY: val })}
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
});

UVTransformControl.displayName = 'UVTransformControl';
