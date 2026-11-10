import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  DEFAULT_RL_COUNTDOWN_GLOW,
  DEFAULT_WINNER_BLUE_TEAM_CONFIG,
  DEFAULT_CENTER_UPPER_TYPOGRAPHY,
  DEFAULT_CENTER_UPPER_TIMING,
  hexToRgba,
  buildOuterGlowTextShadow,
  buildCenterUpperKineticKeyframes,
  type CenterUpperInfoVariant,
  type WinnerTeamPreset,
  type CenterUpperBlueTeamConfig,
  type CenterUpperGlowConfig,
  type CenterUpperTypographyConfig,
  type CenterUpperTimingConfig,
  type CenterUpperInfoPayload,
  type CenterUpperInfoListener,
  type CenterUpperInfoHandle,
  type CenterUpperInfoHUDProps,
} from './centerUpperInfoDefaults';

export type {
  CenterUpperInfoVariant,
  WinnerTeamPreset,
  CenterUpperBlueTeamConfig,
  CenterUpperGlowConfig,
  CenterUpperTypographyConfig,
  CenterUpperTimingConfig,
  CenterUpperInfoPayload,
  CenterUpperInfoListener,
  CenterUpperInfoHandle,
  CenterUpperInfoHUDProps,
};

export const CenterUpperInfoHUD = React.memo(
  forwardRef<CenterUpperInfoHandle, CenterUpperInfoHUDProps>(
    (
      {
        info = null,
        glowConfig = DEFAULT_RL_COUNTDOWN_GLOW,
        winnerBlueConfig = DEFAULT_WINNER_BLUE_TEAM_CONFIG,
        typographyConfig = DEFAULT_CENTER_UPPER_TYPOGRAPHY,
        timingConfig = DEFAULT_CENTER_UPPER_TIMING,
        subscribeCenterInfo,
        onExpire,
        className = '',
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      const innerBoxRef = useRef<HTMLDivElement | null>(null);
      const bloomRef = useRef<HTMLDivElement | null>(null);
      const topTextRef = useRef<HTMLDivElement | null>(null);
      const mainTextRef = useRef<HTMLDivElement | null>(null);
      const subTextRef = useRef<HTMLDivElement | null>(null);
      const expireTimerRef = useRef<number | null>(null);
      const activeAnimRef = useRef<Animation | null>(null);
      const onExpireRef = useRef(onExpire);
      onExpireRef.current = onExpire;

      const clearTimers = useCallback(() => {
        if (expireTimerRef.current !== null) {
          window.clearTimeout(expireTimerRef.current);
          expireTimerRef.current = null;
        }
        if (activeAnimRef.current) {
          activeAnimRef.current.cancel();
          activeAnimRef.current = null;
        }
      }, []);

      const applyPayloadToDom = useCallback(
        (payload: CenterUpperInfoPayload | null, animateEntry: boolean) => {
          const rootEl = containerRef.current;
          const innerEl = innerBoxRef.current;
          const bloomEl = bloomRef.current;
          const topEl = topTextRef.current;
          const mainEl = mainTextRef.current;
          const subEl = subTextRef.current;
          if (!rootEl || !innerEl || !mainEl || !topEl || !bloomEl || !subEl) return;

          clearTimers();

          if (!payload || !payload.mainText) {
            rootEl.style.opacity = '0';
            rootEl.style.visibility = 'hidden';
            return;
          }

          const resolvedGlow: CenterUpperGlowConfig = {
            ...glowConfig,
            ...(payload.glow ?? {}),
          };
          const resolvedBlue: CenterUpperBlueTeamConfig = {
            ...DEFAULT_WINNER_BLUE_TEAM_CONFIG,
            ...winnerBlueConfig,
            ...(payload.winnerBlueConfig ?? {}),
          };
          const resolvedTypo: CenterUpperTypographyConfig = {
            ...typographyConfig,
            ...(payload.typography ?? {}),
          };
          const resolvedTiming: CenterUpperTimingConfig = {
            ...timingConfig,
            ...(payload.timing ?? {}),
          };

          const isWinnerBlue =
            payload.variant === 'winner' &&
            payload.winnerTeam === 'blue' &&
            resolvedBlue.enabled !== false;
          const forceUppercase =
            payload.variant === 'announcement' ? true : resolvedTypo.uppercase;

          const activeMainTextColor = isWinnerBlue
            ? resolvedBlue.textColor
            : resolvedGlow.textColor;
          const activeMainGlowColor = isWinnerBlue
            ? resolvedBlue.syncGlowWithText
              ? resolvedBlue.textColor
              : resolvedBlue.glowColor
            : resolvedGlow.glowColor;
          const activeMainInnerBlurPx = isWinnerBlue
            ? resolvedBlue.innerBlurPx
            : resolvedGlow.innerBlurPx;
          const activeMainOuterBlurPx = isWinnerBlue
            ? resolvedBlue.outerBlurPx
            : resolvedGlow.outerBlurPx;
          const activeMainAmbientBlurPx = isWinnerBlue
            ? resolvedBlue.ambientBlurPx
            : resolvedGlow.ambientBlurPx;
          const activeMainIntensityPct = isWinnerBlue
            ? resolvedBlue.intensityPct
            : resolvedGlow.intensityPct;
          const activeMainStrokeW = isWinnerBlue
            ? resolvedBlue.strokeWidthPx
            : (resolvedGlow.strokeWidthPx ?? 0);
          const activeMainStrokeCol = isWinnerBlue
            ? resolvedBlue.strokeColor || activeMainGlowColor || activeMainTextColor
            : resolvedGlow.strokeColor || resolvedGlow.glowColor || resolvedGlow.textColor;

          rootEl.style.visibility = 'visible';
          rootEl.style.opacity = '1';
          innerEl.style.gap = `${resolvedTypo.lineGapPx}px`;

          const bloomPct = resolvedGlow.backdropBloomPct ?? 0;
          if (bloomPct > 0 && activeMainIntensityPct > 0) {
            const bloomAlpha = Math.min(
              0.65,
              (bloomPct / 100) * (activeMainIntensityPct / 100) * 0.45
            );
            bloomEl.style.background = `radial-gradient(ellipse at center, ${hexToRgba(
              activeMainGlowColor,
              bloomAlpha
            )} 0%, ${hexToRgba(activeMainGlowColor, bloomAlpha * 0.35)} 42%, transparent 74%)`;
            bloomEl.style.opacity = '1';
          } else {
            bloomEl.style.opacity = '0';
          }

          const topStrokeW = resolvedGlow.strokeWidthPx ?? 0;

          const hasTopText = Boolean(payload.topText && payload.topText.trim().length > 0);
          if (hasTopText) {
            const topColor = resolvedGlow.topLabelColor || '#FFFFFF';
            const topGlowColor = resolvedGlow.topLabelGlowColor || resolvedGlow.glowColor;
            topEl.style.display = 'block';
            topEl.textContent = forceUppercase
              ? payload.topText!.toUpperCase()
              : payload.topText!;
            topEl.style.fontSize = `${resolvedTypo.topFontSizePx}px`;
            topEl.style.fontWeight = String(resolvedTypo.topFontWeight);
            topEl.style.letterSpacing = `${resolvedTypo.topLetterSpacingEm}em`;
            topEl.style.paddingLeft =
              resolvedTypo.topLetterSpacingEm > 0
                ? `${resolvedTypo.topLetterSpacingEm}em`
                : '0px';
            topEl.style.color = topColor;
            topEl.style.webkitTextStroke =
              topStrokeW > 0
                ? `${Math.max(0.5, topStrokeW * 0.65)}px ${topGlowColor}`
                : '0px transparent';
            topEl.style.textShadow = buildOuterGlowTextShadow(
              topGlowColor,
              resolvedGlow.innerBlurPx > 0 ? Math.max(2, resolvedGlow.innerBlurPx * 0.65) : 0,
              resolvedGlow.outerBlurPx > 0 ? Math.max(4, resolvedGlow.outerBlurPx * 0.7) : 0,
              resolvedGlow.ambientBlurPx > 0
                ? Math.max(8, resolvedGlow.ambientBlurPx * 0.65)
                : 0,
              resolvedGlow.intensityPct * 0.9
            );
          } else {
            topEl.style.display = 'none';
            topEl.textContent = '';
          }

          mainEl.textContent = forceUppercase
            ? payload.mainText.toUpperCase()
            : payload.mainText;
          mainEl.style.fontSize = `${resolvedTypo.mainFontSizePx}px`;
          mainEl.style.fontWeight = String(resolvedTypo.mainFontWeight);
          mainEl.style.letterSpacing = `${resolvedTypo.mainLetterSpacingEm}em`;
          mainEl.style.paddingLeft =
            resolvedTypo.mainLetterSpacingEm > 0
              ? `${resolvedTypo.mainLetterSpacingEm}em`
              : '0px';
          mainEl.style.fontStyle = resolvedTypo.italic ? 'italic' : 'normal';
          mainEl.style.color = activeMainTextColor;
          mainEl.style.textShadow = buildOuterGlowTextShadow(
            activeMainGlowColor,
            activeMainInnerBlurPx,
            activeMainOuterBlurPx,
            activeMainAmbientBlurPx,
            activeMainIntensityPct
          );

          if (activeMainStrokeW > 0) {
            mainEl.style.webkitTextStroke = `${activeMainStrokeW}px ${activeMainStrokeCol}`;
          } else {
            mainEl.style.webkitTextStroke = '0px transparent';
          }

          if (payload.subText && payload.subText.trim().length > 0) {
            subEl.style.display = 'inline-flex';
            subEl.textContent = forceUppercase
              ? payload.subText.toUpperCase()
              : payload.subText;
            subEl.style.color = resolvedGlow.topLabelColor || '#E2E8F0';
            subEl.style.borderColor = hexToRgba(activeMainGlowColor, 0.45);
            subEl.style.boxShadow = `0 0 0 1px ${hexToRgba(activeMainGlowColor, 0.25)}`;
          } else {
            subEl.style.display = 'none';
            subEl.textContent = '';
          }

          if (typeof rootEl.animate === 'function') {
            const entryMs = Math.max(0, resolvedTiming.entryDurationMs);
            const entryScale = resolvedTiming.entryScale;

            if (resolvedTiming.persistentInspect) {
              if (animateEntry && entryMs > 0) {
                activeAnimRef.current = rootEl.animate(
                  [
                    { transform: `scale3d(${entryScale}, ${entryScale}, 1)`, opacity: 1 },
                    { transform: 'scale3d(1, 1, 1)', opacity: 1 },
                  ],
                  {
                    duration: entryMs,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                    fill: 'forwards',
                  }
                );
              } else {
                rootEl.style.transform = 'scale3d(1, 1, 1)';
                rootEl.style.opacity = '1';
              }
            } else {
              const { keyframes, totalTimelineMs } = buildCenterUpperKineticKeyframes(
                resolvedTiming,
                animateEntry
              );
              activeAnimRef.current = rootEl.animate(keyframes, {
                duration: totalTimelineMs,
                easing: 'linear',
                fill: 'forwards',
              });

              expireTimerRef.current = window.setTimeout(() => {
                if (containerRef.current) {
                  containerRef.current.style.opacity = '0';
                  containerRef.current.style.visibility = 'hidden';
                }
                onExpireRef.current?.();
              }, totalTimelineMs);
            }
          }
        },
        [glowConfig, winnerBlueConfig, typographyConfig, timingConfig, clearTimers]
      );

      useImperativeHandle(
        ref,
        () => ({
          triggerInfo: (payload: CenterUpperInfoPayload | null) => {
            applyPayloadToDom(payload, true);
          },
        }),
        [applyPayloadToDom]
      );

      const prevTriggerSignatureRef = useRef<string>('');
      const prevConfigSignatureRef = useRef<string>('');

      useEffect(() => {
        const sig = info
          ? `${info.variant}::${info.winnerTeam ?? ''}::${info.topText ?? ''}::${
              info.mainText
            }::${info.triggerKey ?? ''}`
          : 'null';
        const configSig = JSON.stringify({
          glowConfig,
          winnerBlueConfig,
          typographyConfig,
          timingConfig,
          infoWinnerTeam: info?.winnerTeam,
          infoWinnerBlue: info?.winnerBlueConfig,
          infoGlow: info?.glow,
          infoTypo: info?.typography,
          infoTiming: info?.timing,
        });
        const shouldAnimate = sig !== prevTriggerSignatureRef.current;
        if (!shouldAnimate && configSig === prevConfigSignatureRef.current) {
          return;
        }
        prevTriggerSignatureRef.current = sig;
        prevConfigSignatureRef.current = configSig;
        applyPayloadToDom(info, shouldAnimate);
      }, [
        info,
        glowConfig,
        winnerBlueConfig,
        typographyConfig,
        timingConfig,
        applyPayloadToDom,
      ]);

      useEffect(() => {
        if (!subscribeCenterInfo) return;
        return subscribeCenterInfo((payload) => {
          applyPayloadToDom(payload, true);
        });
      }, [subscribeCenterInfo, applyPayloadToDom]);

      useEffect(() => {
        return () => clearTimers();
      }, [clearTimers]);

      return (
        <div
          ref={containerRef}
          data-ui-element="hud-center-upper-info"
          data-alpha-id="Alpha:CenterUpperInfoHUD"
          data-variant={info?.variant ?? 'none'}
          className={`relative w-[10000px] max-w-none flex flex-col items-center justify-center text-center select-none pointer-events-none will-change-transform py-4 ${className}`}
          style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            transformOrigin: 'center center',
            opacity: info ? 1 : 0,
            visibility: info ? 'visible' : 'hidden',
          }}
        >
          <div
            ref={innerBoxRef}
            className="relative inline-flex flex-col items-center justify-center text-center w-max max-w-none px-8"
          >
            <div
              ref={bloomRef}
              aria-hidden="true"
              className="absolute -inset-x-12 -inset-y-6 rounded-full pointer-events-none -z-10 transition-opacity duration-150"
            />

            <div
              ref={topTextRef}
              data-role="center-upper-top-regular"
              className="leading-none whitespace-nowrap text-center"
              style={{
                fontFamily: 'var(--font-jetbrains), monospace',
                fontWeight: 400,
                display: info?.topText ? 'block' : 'none',
              }}
            >
              {info?.topText ?? ''}
            </div>

            <div
              ref={mainTextRef}
              data-role="center-upper-main-thin"
              className="leading-none whitespace-nowrap tabular-nums text-center"
              style={{
                fontFamily: 'var(--font-jetbrains), monospace',
                fontWeight: 100,
              }}
            >
              {info?.mainText ?? ''}
            </div>

            <div
              ref={subTextRef}
              data-role="center-upper-sub-caption"
              className="mt-2 px-3 py-0.5 rounded-full border bg-neutral-950/92 text-[11px] font-normal tracking-[0.22em] whitespace-nowrap"
              style={{
                fontFamily: 'var(--font-jetbrains), monospace',
                display: info?.subText ? 'inline-flex' : 'none',
              }}
            >
              {info?.subText ?? ''}
            </div>
          </div>
        </div>
      );
    }
  )
);

CenterUpperInfoHUD.displayName = 'CenterUpperInfoHUD';
