import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { BoostTransientListener } from '../stores/hudTransientTypes';
import { useBoostGaugeStore } from '../stores/boostGaugeStore';
import { type BoostColorScheme, type BoostColorMode, type BoostThemeOverride, type BoostSegmentColorInfo, getBoostSegmentColor, resolveBoostVisualColors } from './boostGaugeConfig';

export type {
  BoostColorScheme,
  BoostColorMode,
  BoostThemeOverride,
  BoostSegmentColorInfo,
};


export interface CircularBoostGaugeHandle {
  /** Imperatively update boost amount (0~100) and unlimited state at 120Hz+ with zero React re-renders */
  setBoost: (amount: number, isUnlimited?: boolean) => void;
}

export interface CircularBoostGaugeProps {
  amount?: number;
  isUnlimited?: boolean;
  subscribeBoost?: (listener: BoostTransientListener) => () => void;
  size?: number;
  isLight?: boolean;
  darkModeOverride?: boolean;
  themeOverride?: BoostThemeOverride;
  ringInnerPct?: number;
  ringOuterPct?: number;
  lineCap?: 'round' | 'butt';
  cutoutAngleDeg?: number;
  rotationDeg?: number;
  colorScheme?: BoostColorScheme;
  colorMode?: BoostColorMode;
  fixedTextColor?: string;
  className?: string;
}

const MONO_FONT_FAMILY =
  "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace";

const DISC_CENTER = 68;
const DISC_MAX_RADIUS = 68;

export const CircularBoostGauge = React.memo(
  forwardRef<CircularBoostGaugeHandle, CircularBoostGaugeProps>(
    (
      {
        amount = 100,
        isUnlimited = false,
        subscribeBoost,
        size: propSize,
        isLight = false,
        darkModeOverride,
        themeOverride: propThemeOverride,
        ringInnerPct: propRingInnerPct,
        ringOuterPct: propRingOuterPct,
        lineCap: propLineCap,
        cutoutAngleDeg: propCutoutAngleDeg,
        rotationDeg: propRotationDeg,
        colorScheme: propColorScheme,
        colorMode: propColorMode,
        fixedTextColor: propFixedTextColor,
        className = '',
      },
      ref
    ) => {
      const storeTokens = useBoostGaugeStore();

      const size = propSize ?? storeTokens.size;
      const themeOverride = propThemeOverride ?? storeTokens.themeOverride;
      const ringInnerPct = propRingInnerPct ?? storeTokens.ringInnerPct;
      const ringOuterPct = propRingOuterPct ?? storeTokens.ringOuterPct;
      const lineCap = propLineCap ?? storeTokens.lineCap;
      const cutoutAngleDeg = propCutoutAngleDeg ?? storeTokens.cutoutAngleDeg;
      const rotationDeg = propRotationDeg ?? storeTokens.rotationDeg;
      const colorScheme = propColorScheme ?? storeTokens.colorScheme;
      const colorMode = propColorMode ?? storeTokens.colorMode;
      const fixedTextColor = propFixedTextColor ?? storeTokens.fixedTextColor;

      const dialPlateRef = useRef<HTMLDivElement | null>(null);
      const innerDiscRef = useRef<SVGCircleElement | null>(null);
      const trackCircleRef = useRef<SVGCircleElement | null>(null);
      const arcCircleRef = useRef<SVGCircleElement | null>(null);
      const readoutSpanRef = useRef<HTMLSpanElement | null>(null);
      const labelSpanRef = useRef<HTMLSpanElement | null>(null);
      const lastBoostRef = useRef<{ amount: number; unlimited: boolean }>({
        amount,
        unlimited: isUnlimited,
      });

      const effectiveIsLight =
        darkModeOverride === true
          ? false
          : themeOverride === 'dark'
          ? false
          : themeOverride === 'light'
          ? true
          : isLight;

      const safeInnerPct = Math.max(
        0,
        Math.min(99, Number.isFinite(ringInnerPct) ? ringInnerPct : 60)
      );
      const safeOuterPct = Math.max(
        safeInnerPct + 1,
        Math.min(100, Number.isFinite(ringOuterPct) ? ringOuterPct : 98)
      );
      const innerR = (safeInnerPct / 100) * DISC_MAX_RADIUS;
      const outerR = (safeOuterPct / 100) * DISC_MAX_RADIUS;
      const radius = (innerR + outerR) / 2;
      const strokeWidth = Math.max(0.5, outerR - innerR);
      const circumference = 2 * Math.PI * radius;

      const safeCutoutDeg = Math.max(
        0,
        Math.min(359.5, Number.isFinite(cutoutAngleDeg) ? cutoutAngleDeg : 90)
      );
      const sweepAngleDeg = 360 - safeCutoutDeg;
      const arcTotal = (sweepAngleDeg / 360) * circumference;

      const safeRotationDeg = Number.isFinite(rotationDeg) ? rotationDeg : -45;
      const svgRotateDeg = 90 + safeRotationDeg + safeCutoutDeg / 2;

      const effectiveLineCap: 'round' | 'butt' =
        safeCutoutDeg <= 1 ? 'butt' : lineCap;

      const applyBoostToDom = useCallback(
        (rawAmount: number, unlimited = false) => {
          lastBoostRef.current = { amount: rawAmount, unlimited };
          const clamped = Math.max(0, Math.min(100, Math.round(rawAmount)));
          const effective = unlimited ? 100 : clamped;
          const seg = getBoostSegmentColor(effective, colorScheme);
          const activeArcLen = (effective / 100) * arcTotal;
          const colors = resolveBoostVisualColors(
            seg,
            colorMode,
            effectiveIsLight,
            fixedTextColor
          );

          if (dialPlateRef.current) {
            dialPlateRef.current.style.backgroundColor = colors.dialBg;
            dialPlateRef.current.style.borderColor = colors.dialBorder;
            dialPlateRef.current.style.animation = colors.flashDial
              ? 'hudBoostRedFlash 0.38s ease-in-out infinite alternate'
              : 'none';
          }
          if (innerDiscRef.current) {
            innerDiscRef.current.setAttribute('fill', colors.innerDiscFill);
            innerDiscRef.current.setAttribute('stroke', colors.innerDiscStroke);
          }
          if (trackCircleRef.current) {
            trackCircleRef.current.setAttribute('stroke', colors.trackStroke);
          }
          if (arcCircleRef.current) {
            arcCircleRef.current.setAttribute(
              'stroke-dasharray',
              `${activeArcLen} ${circumference}`
            );
            arcCircleRef.current.style.strokeDashoffset = '0';
            arcCircleRef.current.style.opacity = effective <= 0 ? '0' : '1';
            arcCircleRef.current.setAttribute('stroke', colors.arcStroke);
            arcCircleRef.current.style.animation = colors.flashArcAndText
              ? 'hudBoostRedFlash 0.38s ease-in-out infinite alternate'
              : 'none';
          }
          if (readoutSpanRef.current) {
            readoutSpanRef.current.textContent = unlimited ? '--' : String(clamped);
            readoutSpanRef.current.style.color = colors.readoutColor;
            readoutSpanRef.current.style.animation =
              colorMode === 'standard' && colors.flashArcAndText
                ? 'hudBoostRedFlash 0.38s ease-in-out infinite alternate'
                : 'none';
          }
          if (labelSpanRef.current) {
            labelSpanRef.current.style.color = colors.labelColor;
          }
        },
        [arcTotal, circumference, colorMode, colorScheme, effectiveIsLight, fixedTextColor]
      );

      useImperativeHandle(
        ref,
        () => ({
          setBoost: (val: number, unlim = isUnlimited) => applyBoostToDom(val, unlim),
        }),
        [applyBoostToDom, isUnlimited]
      );

      useEffect(() => {
        applyBoostToDom(
          lastBoostRef.current.amount ?? amount,
          lastBoostRef.current.unlimited ?? isUnlimited
        );
      }, [amount, isUnlimited, applyBoostToDom]);

      useEffect(() => {
        applyBoostToDom(amount, isUnlimited);
      }, [amount, isUnlimited, applyBoostToDom]);

      useEffect(() => {
        if (!subscribeBoost) return;
        return subscribeBoost(applyBoostToDom);
      }, [subscribeBoost, applyBoostToDom]);

      const clampedAmount = Math.max(0, Math.min(100, Math.round(amount)));
      const effectiveAmount = isUnlimited ? 100 : clampedAmount;
      const initialSeg = getBoostSegmentColor(effectiveAmount, colorScheme);
      const initialColors = resolveBoostVisualColors(
        initialSeg,
        colorMode,
        effectiveIsLight,
        fixedTextColor
      );
      const initialActiveArcLen = (effectiveAmount / 100) * arcTotal;

      return (
        <div
          data-ui-element="hud-circular-boost-gauge"
          data-alpha-id="Alpha:CircularBoostGauge"
          className={`relative select-none pointer-events-auto flex items-center justify-center ${className}`}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            fontFamily: MONO_FONT_FAMILY,
          }}
        >
          <style>{`
            @keyframes hudBoostRedFlash {
              0% { opacity: 1; }
              100% { opacity: 0.28; }
            }
          `}</style>
          <div
            ref={dialPlateRef}
            className={`relative w-full h-full flex flex-col items-center justify-center rounded-full overflow-hidden transition-colors ${
              colorMode === 'inverted' || safeOuterPct >= 99.5 ? 'border-0' : 'border'
            } ${
              colorMode === 'inverted'
                ? 'drop-shadow-md'
                : effectiveIsLight
                ? 'shadow-md'
                : 'shadow-lg'
            }`}
            style={{
              backgroundColor: initialColors.dialBg,
              borderColor: initialColors.dialBorder,
            }}
          >
            <svg
              className="w-full h-full"
              viewBox="0 0 136 136"
              style={{
                transform: `rotate(${svgRotateDeg}deg)`,
              }}
            >
              <circle
                ref={innerDiscRef}
                cx={DISC_CENTER}
                cy={DISC_CENTER}
                r={Math.max(0, innerR)}
                fill={initialColors.innerDiscFill}
                stroke={initialColors.innerDiscStroke}
                strokeWidth={colorMode === 'inverted' && innerR > 0 ? 1.25 : 0}
              />

              <circle
                ref={trackCircleRef}
                cx={DISC_CENTER}
                cy={DISC_CENTER}
                r={radius}
                stroke={initialColors.trackStroke}
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={`${arcTotal} ${circumference}`}
                strokeLinecap={effectiveLineCap}
              />

              <circle
                ref={arcCircleRef}
                cx={DISC_CENTER}
                cy={DISC_CENTER}
                r={radius}
                stroke={initialColors.arcStroke}
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={`${initialActiveArcLen} ${circumference}`}
                strokeDashoffset={0}
                strokeLinecap={effectiveLineCap}
                style={{
                  opacity: effectiveAmount <= 0 ? '0' : '1',
                  transition: 'stroke 80ms ease',
                }}
              />
            </svg>

            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              style={{ fontFamily: MONO_FONT_FAMILY }}
            >
              <span
                ref={readoutSpanRef}
                className="text-4xl font-black tracking-tighter tabular-nums transition-colors leading-none"
                style={{
                  color: initialColors.readoutColor,
                  fontFamily: MONO_FONT_FAMILY,
                  WebkitTextStroke:
                    colorMode === 'inverted' ? '1px rgba(0,0,0,0.35)' : undefined,
                }}
              >
                {isUnlimited ? '--' : clampedAmount}
              </span>

              <span
                ref={labelSpanRef}
                className="text-[10px] font-bold tracking-widest uppercase mt-1"
                style={{
                  color: initialColors.labelColor,
                  fontFamily: MONO_FONT_FAMILY,
                }}
              >
                BOOST
              </span>
            </div>
          </div>
        </div>
      );
    }
  )
);

CircularBoostGauge.displayName = 'CircularBoostGauge';
