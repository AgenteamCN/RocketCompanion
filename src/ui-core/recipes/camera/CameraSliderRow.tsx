import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Minus, Plus } from 'lucide-react';
import { getDecimalPlaces } from '../../primitives/PrecisionDigitPicker';
import type { CameraSettingsStyleConfig } from '../../stores/cameraSettingsStyleStore';
import {
  resolveSliderFillClass,
  type CameraSliderSpec,
} from './cameraConfigSpecs';
export interface CameraLabelCellProps {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  cfg: CameraSettingsStyleConfig;
  isLight: boolean;
}

export const CameraLabelCell: React.FC<CameraLabelCellProps> = ({
  label,
  icon: IconComponent,
  iconColor,
  cfg,
  isLight,
}) => (
  <div
    style={{
      width: `${cfg.labelColumnWidthPx}px`,
      marginRight: `${cfg.labelToControlGapPx}px`,
      fontSize: `${cfg.labelFontSizePx}px`,
      fontWeight: cfg.labelFontWeight,
    }}
    className={`shrink-0 flex items-center gap-2 min-w-0 select-none ${
      cfg.labelTextAlign === 'right' ? 'justify-end text-right' : 'justify-start text-left'
    } ${isLight ? 'text-neutral-800' : 'text-neutral-200'}`}
  >
    {cfg.showRowIcon && (
      <IconComponent
        style={{ width: '16px', height: '16px' }}
        className={`shrink-0 ${iconColor}`}
      />
    )}
    <span className="truncate leading-snug" title={label}>
      {label}
    </span>
  </div>
);

export interface CameraSliderRowProps {
  spec: CameraSliderSpec;
  rawValue: number;
  cfg: CameraSettingsStyleConfig;
  isLight: boolean;
  controlColWidthPx: number;
  readoutColWidthPx: number;
  rowHoverClasses: string;
  onUpdate: (key: CameraSliderSpec['key'], value: number) => void;
  onHoverDesc: (desc: string | null) => void;
}

export const CameraSliderRow: React.FC<CameraSliderRowProps> = ({
  spec,
  rawValue,
  cfg,
  isLight,
  controlColWidthPx,
  readoutColWidthPx,
  rowHoverClasses,
  onUpdate,
  onHoverDesc,
}) => {
  const clampedValue = Math.max(
    spec.min,
    Math.min(spec.max, Number.isFinite(rawValue) ? rawValue : spec.min)
  );
  const displayStr = `${rawValue}${spec.unit}`;

  const stepByDelta = (delta: number) => {
    const decimals = Math.min(6, Math.max(getDecimalPlaces(rawValue), getDecimalPlaces(spec.step)));
    const next = Number((rawValue + delta).toFixed(decimals));
    const clamped = Math.max(spec.min, Math.min(spec.max, next));
    onUpdate(spec.key, clamped);
  };

  const textAlignClass =
    cfg.readoutTextAlign === 'left'
      ? 'text-left justify-start'
      : cfg.readoutTextAlign === 'center'
      ? 'text-center justify-center'
      : 'text-right justify-end';

  return (
    <div
      data-camera-row={spec.key}
      onMouseEnter={() => onHoverDesc(spec.hoverDescription)}
      onMouseLeave={() => onHoverDesc(null)}
      style={{
        paddingTop: `${cfg.rowPaddingYPx}px`,
        paddingBottom: `${cfg.rowPaddingYPx}px`,
        paddingLeft: `${cfg.rowPaddingXPx}px`,
        paddingRight: `${cfg.rowPaddingXPx}px`,
        borderRadius: `${cfg.rowBorderRadiusPx}px`,
      }}
      className={`group flex items-center transition-colors ${rowHoverClasses}`}
    >
      <CameraLabelCell
        label={spec.label}
        icon={spec.icon}
        iconColor={spec.iconColor}
        cfg={cfg}
        isLight={isLight}
      />

      <div
        style={{ width: `${controlColWidthPx}px` }}
        className="relative shrink-0 flex items-center gap-2"
      >
        {cfg.showSpineGuideLine && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 -bottom-2 left-0 w-px bg-amber-500/45 z-20"
          />
        )}

        {cfg.sliderShowStepper && (
          <button
            type="button"
            aria-label={`Decrease ${spec.label}`}
            onClick={() => stepByDelta(-spec.step)}
            className={`inline-flex items-center justify-center h-6 w-6 rounded-md border transition-all active:scale-95 cursor-pointer shrink-0 ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <Minus className="h-3 w-3" />
          </button>
        )}

        <SliderPrimitive.Root
          value={[clampedValue]}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onValueChange={(vals) => {
            const rawVal = vals[0];
            const decimals = getDecimalPlaces(spec.step);
            const rounded =
              decimals > 0 ? parseFloat(rawVal.toFixed(Math.min(6, decimals))) : rawVal;
            onUpdate(spec.key, rounded);
          }}
          style={{ width: `${cfg.sliderTrackWidthPx}px` }}
          className="relative flex items-center select-none touch-none h-5 cursor-pointer shrink-0"
        >
          <SliderPrimitive.Track
            style={{ height: `${cfg.sliderTrackHeightPx}px` }}
            className={`relative grow rounded-full overflow-hidden transition-colors ${
              isLight ? 'bg-neutral-200/95' : 'bg-neutral-800'
            }`}
          >
            <SliderPrimitive.Range
              className={`absolute h-full rounded-full transition-colors ${resolveSliderFillClass(
                cfg.sliderColorScheme,
                isLight
              )}`}
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            style={{
              width: `${cfg.sliderThumbSizePx}px`,
              height: `${cfg.sliderThumbSizePx}px`,
            }}
            className={`block rounded-full border shadow-xs transition-transform hover:scale-110 focus:outline-none ${
              isLight
                ? 'bg-white border-neutral-400'
                : 'bg-neutral-100 border-neutral-300'
            }`}
          />
        </SliderPrimitive.Root>

        {cfg.sliderShowStepper && (
          <button
            type="button"
            aria-label={`Increase ${spec.label}`}
            onClick={() => stepByDelta(spec.step)}
            className={`inline-flex items-center justify-center h-6 w-6 rounded-md border transition-all active:scale-95 cursor-pointer shrink-0 ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      <div
        style={{
          width: `${readoutColWidthPx}px`,
          marginLeft: `${cfg.controlToReadoutGapPx}px`,
        }}
        className="shrink-0 flex items-center justify-start"
      >
        {cfg.readoutContainerMode === 'plain-text' ? (
          <span
            data-camera-readout-measure="true"
            style={{ fontSize: `${cfg.readoutFontSizePx}px` }}
            className={`inline-flex items-center font-mono font-semibold whitespace-nowrap w-full ${textAlignClass} ${
              isLight ? 'text-neutral-800' : 'text-neutral-200'
            }`}
          >
            {displayStr}
          </span>
        ) : (
          <span
            style={{
              fontSize: `${cfg.readoutFontSizePx}px`,
              paddingLeft: `${cfg.readoutPaddingXPx}px`,
              paddingRight: `${cfg.readoutPaddingXPx}px`,
              paddingTop: `${cfg.readoutPaddingYPx}px`,
              paddingBottom: `${cfg.readoutPaddingYPx}px`,
              borderRadius: `${cfg.readoutBorderRadiusPx}px`,
              width: cfg.readoutContainerMode === 'uniform-longest' ? '100%' : 'auto',
            }}
            className={`inline-flex items-center font-mono font-semibold border whitespace-nowrap transition-colors ${textAlignClass} ${
              isLight
                ? 'bg-neutral-100/90 text-neutral-800 border-neutral-300/85'
                : 'bg-white/[0.06] text-neutral-200 border-white/[0.10]'
            }`}
          >
            <span data-camera-readout-measure="true" className="whitespace-nowrap">
              {displayStr}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
