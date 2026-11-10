import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import type { CameraSettingsStyleConfig } from '../../stores/cameraSettingsStyleStore';

export interface CameraResetSectionProps {
  cfg: CameraSettingsStyleConfig;
  isLight: boolean;
  confirmReset: boolean;
  totalSpineWidthPx: number;
  onResetClick: () => void;
  onHoverDesc: (desc: string | null) => void;
}

export const CameraResetSection: React.FC<CameraResetSectionProps> = ({
  cfg,
  isLight,
  confirmReset,
  totalSpineWidthPx,
  onResetClick,
  onHoverDesc,
}) => {
  const resolveBigResetButtonClasses = (): string => {
    if (confirmReset && cfg.resetConfirmMode === 'inline-two-step') {
      return 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 font-bold shadow-[0_0_16px_rgba(244,63,94,0.35)]';
    }
    switch (cfg.resetButtonStyle) {
      case 'danger-solid':
        return 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 font-bold shadow-xs';
      case 'danger-outline':
        return isLight
          ? 'bg-transparent hover:bg-rose-50 text-rose-600 border-rose-400/80 hover:border-rose-500 font-semibold'
          : 'bg-transparent hover:bg-rose-500/15 text-rose-400 border-rose-500/45 hover:border-rose-400 font-semibold';
      case 'neutral-hover-danger':
        return isLight
          ? 'bg-neutral-200/70 hover:bg-rose-500/15 text-neutral-700 hover:text-rose-600 border-neutral-300 hover:border-rose-400 font-semibold'
          : 'bg-white/[0.06] hover:bg-rose-500/20 text-neutral-200 hover:text-rose-300 border-white/[0.10] hover:border-rose-500/45 font-semibold';
      case 'danger-subtle':
      default:
        return isLight
          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border-rose-400/50 hover:border-rose-500/70 font-semibold'
          : 'bg-rose-500/12 hover:bg-rose-500/22 text-rose-400 hover:text-rose-300 border-rose-500/35 hover:border-rose-500/55 font-semibold';
    }
  };

  const resetHoverText =
    cfg.resetConfirmMode === 'dialogue'
      ? 'Open double-check confirmation dialogue to restore default competitive camera profile settings.'
      : 'Restore default competitive camera profile settings (two-step confirmation).';

  if (cfg.resetButtonMode === 'compact-row') {
    return (
      <div style={{ marginTop: `${cfg.resetButtonTopMarginPx}px` }} className="w-full">
        <SettingActionRow
          icon={RotateCcw}
          title={cfg.resetButtonLabel}
          bordered={false}
          showDescription={false}
          hoverDescription={resetHoverText}
          onAction={onResetClick}
          onHover={(desc) => desc && onHoverDesc(desc)}
          onLeave={() => onHoverDesc(null)}
          isLight={isLight}
          rightSlot={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetClick();
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95 ${resolveBigResetButtonClasses()}`}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              <span>
                {confirmReset && cfg.resetConfirmMode === 'inline-two-step'
                  ? 'Confirm Reset'
                  : 'Reset'}
              </span>
            </button>
          }
        />
      </div>
    );
  }

  const widthStyle: React.CSSProperties =
    cfg.resetButtonWidthMode === 'full-width'
      ? { width: '100%' }
      : cfg.resetButtonWidthMode === 'spine-width'
      ? { width: `${totalSpineWidthPx}px`, maxWidth: '100%' }
      : { width: 'auto', paddingLeft: '28px', paddingRight: '28px' };

  return (
    <div
      style={{ marginTop: `${cfg.resetButtonTopMarginPx}px` }}
      className="w-full flex justify-center"
    >
      <button
        type="button"
        data-camera-reset-btn="big"
        onClick={onResetClick}
        onMouseEnter={() => onHoverDesc(resetHoverText)}
        onMouseLeave={() => onHoverDesc(null)}
        style={{
          ...widthStyle,
          height: `${cfg.resetButtonHeightPx}px`,
          fontSize: `${cfg.resetButtonFontSizePx}px`,
          borderRadius: `${cfg.resetButtonRadiusPx}px`,
        }}
        className={`inline-flex items-center justify-center gap-2 border transition-all duration-150 cursor-pointer select-none active:scale-[0.985] ${resolveBigResetButtonClasses()}`}
      >
        {cfg.resetButtonShowIcon && (
          <RotateCcw
            style={{
              width: `${cfg.resetButtonIconSizePx}px`,
              height: `${cfg.resetButtonIconSizePx}px`,
            }}
            className="shrink-0"
          />
        )}
        <span>
          {confirmReset && cfg.resetConfirmMode === 'inline-two-step'
            ? `Confirm ${cfg.resetButtonLabel}?`
            : cfg.resetButtonLabel}
        </span>
      </button>
    </div>
  );
};
