import React from 'react';
import { Checkbox } from '../../primitives/Checkbox';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import type { CameraSettingsStyleConfig } from '../../stores/cameraSettingsStyleStore';
import {
  CAMERA_BOOLEAN_SPECS,
  type CameraBooleanSpec,
  type CameraProfileSettings,
} from './cameraConfigSpecs';
import { CameraLabelCell } from './CameraSliderRow';

export interface CameraBooleanSectionProps {
  settings: CameraProfileSettings;
  cfg: CameraSettingsStyleConfig;
  isLight: boolean;
  controlColWidthPx: number;
  readoutColWidthPx: number;
  rowHoverClasses: string;
  onUpdate: (key: CameraBooleanSpec['key'], value: boolean) => void;
  onHoverDesc: (desc: string | null) => void;
}

export const CameraBooleanSection: React.FC<CameraBooleanSectionProps> = ({
  settings,
  cfg,
  isLight,
  controlColWidthPx,
  readoutColWidthPx,
  rowHoverClasses,
  onUpdate,
  onHoverDesc,
}) => {
  const renderBooleanControl = (spec: CameraBooleanSpec) => {
    const checked = settings[spec.key];
    const statusLabel = cfg.checkboxShowStatusText ? (checked ? 'On' : 'Off') : undefined;

    if (cfg.booleanControlType === 'toggle-switch') {
      return (
        <ToggleSwitch
          checked={checked}
          onCheckedChange={(v) => onUpdate(spec.key, v)}
          isLight={isLight}
          variant="neutral"
        />
      );
    }

    return (
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onUpdate(spec.key, v)}
        isLight={isLight}
        variant={cfg.checkboxVariant}
        size={cfg.checkboxSizePx}
        radiusPx={cfg.checkboxRadiusPx}
        strokeWidth={cfg.checkboxStrokeWidth}
        iconStyle={cfg.checkboxIconStyle}
        animationStyle={cfg.checkboxAnimationStyle}
        highContrastUnchecked={cfg.checkboxHighContrastUnchecked}
        statusText={statusLabel}
      />
    );
  };

  const renderSpineBooleanRow = (spec: CameraBooleanSpec) => {
    const checked = settings[spec.key];
    return (
      <div
        key={spec.key}
        data-camera-row={spec.key}
        onClick={() => onUpdate(spec.key, !checked)}
        onMouseEnter={() => onHoverDesc(spec.hoverDescription)}
        onMouseLeave={() => onHoverDesc(null)}
        style={{
          paddingTop: `${cfg.rowPaddingYPx}px`,
          paddingBottom: `${cfg.rowPaddingYPx}px`,
          paddingLeft: `${cfg.rowPaddingXPx}px`,
          paddingRight: `${cfg.rowPaddingXPx}px`,
          borderRadius: `${cfg.rowBorderRadiusPx}px`,
        }}
        className={`group flex items-center cursor-pointer transition-colors ${rowHoverClasses}`}
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
          className={`relative shrink-0 flex items-center ${
            cfg.checkboxPlacement === 'spine-center' ? 'justify-center' : 'justify-start'
          }`}
        >
          {cfg.showSpineGuideLine && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 -bottom-2 left-0 w-px bg-amber-500/45 z-20"
            />
          )}
          <div onClick={(e) => e.stopPropagation()}>{renderBooleanControl(spec)}</div>
        </div>

        <div
          style={{
            width: `${readoutColWidthPx}px`,
            marginLeft: `${cfg.controlToReadoutGapPx}px`,
          }}
          className="shrink-0"
        />
      </div>
    );
  };

  if (cfg.checkboxPlacement === 'centered-cluster') {
    return (
      <div
        style={{ marginTop: `${cfg.checkboxSectionTopGapPx}px` }}
        className="w-full flex flex-wrap items-center justify-center gap-6 py-2 px-3"
      >
        {CAMERA_BOOLEAN_SPECS.map((spec) => {
          const checked = settings[spec.key];
          return (
            <div
              key={spec.key}
              onClick={() => onUpdate(spec.key, !checked)}
              onMouseEnter={() => onHoverDesc(spec.hoverDescription)}
              onMouseLeave={() => onHoverDesc(null)}
              style={{
                paddingTop: `${cfg.rowPaddingYPx}px`,
                paddingBottom: `${cfg.rowPaddingYPx}px`,
                paddingLeft: `${cfg.rowPaddingXPx + 2}px`,
                paddingRight: `${cfg.rowPaddingXPx + 2}px`,
                borderRadius: `${cfg.rowBorderRadiusPx}px`,
              }}
              className={`inline-flex items-center gap-3 cursor-pointer transition-colors ${rowHoverClasses}`}
            >
              <span
                style={{
                  fontSize: `${cfg.labelFontSizePx}px`,
                  fontWeight: cfg.labelFontWeight,
                }}
                className={isLight ? 'text-neutral-800' : 'text-neutral-200'}
              >
                {spec.label}
              </span>
              <div onClick={(e) => e.stopPropagation()}>{renderBooleanControl(spec)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (cfg.checkboxPlacement === 'detached-card') {
    return (
      <div
        style={{
          marginTop: `${cfg.checkboxSectionTopGapPx}px`,
          gap: `${cfg.rowGapPx}px`,
        }}
        className={`flex flex-col p-1.5 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/60 border-neutral-200/80'
            : 'bg-white/[0.025] border-white/[0.07]'
        }`}
      >
        {CAMERA_BOOLEAN_SPECS.map((spec) => renderSpineBooleanRow(spec))}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: `${cfg.checkboxSectionTopGapPx}px`,
        gap: `${cfg.rowGapPx}px`,
      }}
      className="flex flex-col"
    >
      {CAMERA_BOOLEAN_SPECS.map((spec) => renderSpineBooleanRow(spec))}
    </div>
  );
};
