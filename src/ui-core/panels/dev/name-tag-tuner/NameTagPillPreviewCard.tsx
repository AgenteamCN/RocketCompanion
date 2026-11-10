import React from 'react';
import { Tag } from 'lucide-react';
import { computeAdaptiveNameTagWidthPx, formatNameTagDisplayText, resolveCarSlotCode, resolveNameTagCornerRadiusPx, resolveNameTagFontFamilyCss, resolveNameTagVariantParams, shouldUseSingleCharIndicator } from '../../../config/nameTagConfig';
import { hexToRgba, resolveActiveBoostFillColor, resolveAerialClimbInwardFillFraction, resolveUnfilledBaseHexColor } from '../../../config/nameTagColorAndRoiMath';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { useAppStore } from '../../../stores/appStore';

export interface NameTagPillPreviewCardProps {
  isLight?: boolean;
}

export const NameTagPillPreviewCard: React.FC<NameTagPillPreviewCardProps> = ({
  isLight = false,
}) => {
  const { config } = useNameTagTunerStore();
  const sceneRenderScale = useAppStore((state) => state.graphics?.renderScale ?? 50);

  const cardBackground = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const activeVariant = resolveNameTagVariantParams(config, config.cardDisplayMode === 'single-char');
  const isSingleCharMode = config.cardDisplayMode === 'single-char';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBackground}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-sky-400" />
          <span>
            {isSingleCharMode ? 'Single-Char Indicator' : 'Horizontal Pill'} &amp; Off-Screen Preview (
            {config.boostIndicatorMode})
          </span>
        </span>
        <span className={`text-[10px] font-mono ${mutedText}`}>
          {activeVariant.pillMinWidth}-{activeVariant.pillMaxWidth}x{activeVariant.pillHeight}px · R
          {activeVariant.cornerRadius}px · Font {activeVariant.fontSize}px
        </span>
      </div>

      <div
        className={`grid grid-cols-2 gap-2 py-1 items-center justify-items-center rounded-lg p-2 border ${
          isLight
            ? 'bg-neutral-200/70 border-neutral-300'
            : 'bg-neutral-950/60 border-neutral-800'
        }`}
      >
        {([0, 1] as const).map((team) => {
          const isOrange = team === 1;
          const sampleSlotIndex = isOrange ? 3 : 0;
          const useSingleCharForTeam = shouldUseSingleCharIndicator(config, team, 0);
          const teamVariant = resolveNameTagVariantParams(config, useSingleCharForTeam);

          const backgroundHex = isOrange ? config.orangeBgColor : config.blueBgColor;
          const borderHex = isOrange ? config.orangeBorderColor : config.blueBorderColor;
          const boostBorderHex =
            config.boostBorderColorMode === 'shared'
              ? config.sharedBoostBorderColor
              : isOrange
                ? config.orangeBoostBorderColor
                : config.blueBoostBorderColor;
          const sampleBoostPct = Math.max(
            0,
            Math.min(100, config.previewBoostAmounts[sampleSlotIndex] ?? 100)
          );
          const textHex = isOrange ? config.orangeTextColor : config.blueTextColor;
          const sampleName = formatNameTagDisplayText(
            config.previewNames[sampleSlotIndex] || (isOrange ? 'K' : 'AlphaStriker'),
            teamVariant.maxChars
          );
          const slotCode = resolveCarSlotCode(sampleSlotIndex, team, config.slotCodes);
          const resolvedLabel = useSingleCharForTeam ? slotCode : sampleName;

          const adaptiveWidthPx = computeAdaptiveNameTagWidthPx(resolvedLabel, teamVariant);
          const effectiveRadiusPx = resolveNameTagCornerRadiusPx(
            adaptiveWidthPx,
            teamVariant.pillHeight,
            teamVariant.cornerRadius
          );
          const previewScale = 0.52;
          const scaledWidthPx = Math.max(24, Math.round(adaptiveWidthPx * previewScale));
          const scaledHeightPx = Math.min(64, Math.round(teamVariant.pillHeight * previewScale));
          const scaledBorderPx = Math.max(0, teamVariant.borderWidth * previewScale);
          const scaledRadiusPx = Math.round(effectiveRadiusPx * previewScale);
          const scaledFontPx = Math.max(6, Math.round(teamVariant.fontSize * previewScale));

          const mode = config.boostIndicatorMode;
          const isFillMode =
            config.boostBorderEnabled &&
            (mode === 'bottom-up-fill' || mode === 'left-right-fill');
          const unfilledHex = resolveUnfilledBaseHexColor(
            backgroundHex,
            config.boostUnfilledDarkenRatio
          );
          const activeFillHex = resolveActiveBoostFillColor(
            backgroundHex,
            boostBorderHex,
            config.boostFillColorBlendRatio
          );
          const baseBgCss = isFillMode
            ? hexToRgba(unfilledHex, config.boostUnfilledBgOpacity)
            : hexToRgba(backgroundHex, teamVariant.bgOpacity);
          const circleDiaPx = Math.max(
            10,
            Math.round(Math.min(scaledHeightPx * 0.62, scaledWidthPx * 0.28))
          );

          const isAerialClimbing =
            config.aerialClimbAlertEnabled &&
            config.aerialClimbAlertAudience !== 'none' &&
            Boolean(config.previewAerialClimbingFlags?.[sampleSlotIndex]);
          const inwardFillFraction = resolveAerialClimbInwardFillFraction(
            config.aerialClimbGlowRadiusPx
          );
          const offscreenCircleDiaPx = Math.max(
            8,
            Math.round(config.offscreenCircleRadiusPx * 1.15)
          );
          const offscreenBorderPx = Math.max(
            0,
            (Number(config.offscreenBorderWidthPx) ?? 4) * 0.65
          );
          const offscreenArrowW = Math.max(
            4,
            Math.round(config.offscreenArrowBaseWidthPx * 0.65)
          );
          const offscreenArrowH = Math.max(
            3,
            Math.round(config.offscreenArrowLengthPx * 0.65)
          );
          const inwardRingThicknessPx = Math.round(
            offscreenCircleDiaPx * 0.5 * inwardFillFraction
          );
          const alertRingRgba = hexToRgba(
            config.aerialClimbGlowColor,
            config.aerialClimbGlowOpacity
          );
          const showHorizon =
            config.boostShowHorizonLine && sampleBoostPct > 2 && sampleBoostPct < 98;

          return (
            <div key={team} className="flex items-center gap-2.5">
              <div
                style={{
                  width: `${scaledWidthPx}px`,
                  height: `${scaledHeightPx}px`,
                  backgroundColor: baseBgCss,
                  borderColor: borderHex,
                  borderWidth: `${scaledBorderPx}px`,
                  borderStyle: 'solid',
                  borderRadius: `${scaledRadiusPx}px`,
                  opacity: teamVariant.opacity,
                  color: textHex,
                  fontSize: `${scaledFontPx}px`,
                  fontWeight: teamVariant.fontWeight,
                  fontFamily: resolveNameTagFontFamilyCss(teamVariant.fontFamily),
                }}
                className="relative flex items-center justify-center px-1 shadow-sm transition-all"
              >
                {isFillMode && sampleBoostPct > 0 && (
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{
                      borderRadius: `${Math.max(0, scaledRadiusPx - scaledBorderPx)}px`,
                    }}
                  >
                    {mode === 'bottom-up-fill' ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: `${sampleBoostPct}%`,
                          backgroundColor: hexToRgba(activeFillHex, config.boostFillOpacity),
                          borderTop: showHorizon ? `1.5px solid ${boostBorderHex}` : undefined,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${sampleBoostPct}%`,
                          backgroundColor: hexToRgba(activeFillHex, config.boostFillOpacity),
                          borderRight: showHorizon ? `1.5px solid ${boostBorderHex}` : undefined,
                        }}
                      />
                    )}
                  </div>
                )}

                {config.boostBorderEnabled &&
                  scaledBorderPx > 0 &&
                  sampleBoostPct > 0 &&
                  (mode === 'border-only' || mode === 'left-right-fill') && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: `-${scaledBorderPx}px`,
                        borderRadius: `${scaledRadiusPx}px`,
                        borderWidth: `${scaledBorderPx}px`,
                        borderStyle: 'solid',
                        borderColor: boostBorderHex,
                        clipPath: `inset(0 ${100 - sampleBoostPct}% 0 0)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                <div className="relative z-10 flex items-center justify-center gap-1 min-w-0 w-full">
                  {config.boostBorderEnabled && mode === 'sunset-circle' && (
                    <span
                      style={{
                        width: `${circleDiaPx}px`,
                        height: `${circleDiaPx}px`,
                        borderColor: sampleBoostPct > 2 ? boostBorderHex : borderHex,
                        borderWidth: '1.5px',
                        borderStyle: 'solid',
                      }}
                      className="relative rounded-full overflow-hidden shrink-0 bg-slate-950/75"
                    >
                      {sampleBoostPct > 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: `${sampleBoostPct}%`,
                            background: `linear-gradient(to top, ${activeFillHex}, ${boostBorderHex})`,
                          }}
                        />
                      )}
                    </span>
                  )}
                  <span className="whitespace-nowrap truncate">{resolvedLabel}</span>
                </div>
              </div>

              {config.offscreenIndicatorEnabled && (
                <div
                  title="Off-Screen Edge Indicator Preview"
                  className="flex flex-col items-center justify-center shrink-0"
                  style={{
                    opacity:
                      isOrange && config.offscreenAudience === 'teammates' ? 0.35 : 1,
                  }}
                >
                  {config.offscreenShowArrow && (
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: `${offscreenArrowW * 0.5}px solid transparent`,
                        borderRight: `${offscreenArrowW * 0.5}px solid transparent`,
                        borderBottom: `${offscreenArrowH}px solid ${
                          isAerialClimbing ? alertRingRgba : boostBorderHex
                        }`,
                        marginBottom: `${Math.max(0, Math.round(config.offscreenArrowGapPx * 0.5))}px`,
                      }}
                    />
                  )}
                  {config.offscreenShowBoostCircle && (
                    <div
                      style={{
                        width: `${offscreenCircleDiaPx}px`,
                        height: `${offscreenCircleDiaPx}px`,
                        backgroundColor: baseBgCss,
                        borderColor: isAerialClimbing ? alertRingRgba : borderHex,
                        borderWidth: `${offscreenBorderPx}px`,
                        borderStyle: 'solid',
                      }}
                      className="relative rounded-full"
                    >
                      <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                        {sampleBoostPct > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              bottom: 0,
                              height: `${sampleBoostPct}%`,
                              backgroundColor: hexToRgba(activeFillHex, config.boostFillOpacity),
                              borderTop: showHorizon ? `1.5px solid ${boostBorderHex}` : undefined,
                            }}
                          />
                        )}
                        {isAerialClimbing && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: '9999px',
                              boxShadow: `inset 0 0 0 ${inwardRingThicknessPx}px ${alertRingRgba}`,
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                      </div>
                      {!isAerialClimbing &&
                        config.boostBorderEnabled &&
                        offscreenBorderPx > 0 &&
                        sampleBoostPct > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: `-${offscreenBorderPx}px`,
                              borderRadius: '9999px',
                              borderWidth: `${offscreenBorderPx}px`,
                              borderStyle: 'solid',
                              borderColor: boostBorderHex,
                              clipPath: `inset(${100 - sampleBoostPct}% 0 0 0)`,
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] font-mono px-2 py-1 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
        <span>
          Card Render Scale: <b>{activeVariant.cardRenderScale}%</b> (Native Retina Overlay)
        </span>
        <span className={mutedText}>
          Off-Screen:{' '}
          {config.offscreenIndicatorEnabled
            ? config.offscreenAudience.toUpperCase()
            : 'OFF'}{' '}
          · 3D Scale: {sceneRenderScale}%
        </span>
      </div>
    </div>
  );
};
