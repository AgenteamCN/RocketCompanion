import React, { useEffect, useRef } from 'react';
import { type TakeoverVignetteRenderMode, type TakeoverVignetteCurve, type TakeoverVignetteConfig, type VignetteAxisGeometry, parseHexToRgbTuple, computeVignetteAxisOffsets, VIGNETTE_LUT_SIZE, buildBezierLut } from './takeoverVignetteMath';

export type {
  TakeoverVignetteRenderMode,
  TakeoverVignetteCurve,
  TakeoverVignetteConfig,
  VignetteAxisGeometry,
};


export interface TakeoverVignetteOverlayProps {
  config: TakeoverVignetteConfig;
  /** Whether the vignette is currently active (e.g., during replacing-in 3-2-1 countdown) */
  active: boolean;
  className?: string;
}

/**
 * TakeoverVignetteOverlay
 * Renders a seamless, zero-staircase rounded-rectangle vignette beneath the HUD layer (z-10, below HudAnchorStage z-20).
 * Combines symmetric X and asymmetric Top/Bottom Y outward geometric depth offsets (depthXPct, depthYPct, depthTopPct,
 * depthBottomPct, verticalOffsetPx, blurPx, cornerRadiusPx) with Dual RGBA endpoint interpolation, Cubic-Bezier falloff,
 * and 8-bit anti-banding triangular dithering.
 */
export const TakeoverVignetteOverlay: React.FC<TakeoverVignetteOverlayProps> = React.memo(
  ({ config, active, className = '' }) => {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const stageSizeRef = useRef<{ width: number; height: number }>({
      width: 960,
      height: 540,
    });

    const transitionMs = active ? config.fadeInMs : config.fadeOutMs;
    const innerAlpha = Math.max(0, Math.min(1, (config.innerIntensityPct ?? 0) / 100));
    const outerAlpha = Math.max(0, Math.min(1, config.intensityPct / 100));
    const isShown = active && config.enabled && (outerAlpha > 0 || innerAlpha > 0);
    const renderMode: TakeoverVignetteRenderMode = config.renderMode ?? 'sdf-smooth';

    const innerHex = config.innerColor ?? config.color ?? '#000000';
    const outerHex = config.color ?? '#000000';
    const innerRgb = parseHexToRgbTuple(innerHex);
    const outerRgb = parseHexToRgbTuple(outerHex);

    const { blurPx, offsetX, offsetTop, offsetBottom, cornerRadiusPx } =
      computeVignetteAxisOffsets(config);

    const useCanvasLayer = renderMode === 'sdf-smooth' || renderMode === 'hybrid';
    const useCssInsetLayer = renderMode === 'css-inset' || renderMode === 'hybrid';

    useEffect(() => {
      if (!useCanvasLayer) return;
      const frameEl = frameRef.current;
      const canvasEl = canvasRef.current;
      if (!frameEl || !canvasEl) return;

      const paintSdfCanvas = (stageW: number, stageH: number) => {
        const w = Math.max(64, stageW);
        const h = Math.max(64, stageH);
        const aspect = w / h;
        const texH = 270;
        const texW = Math.max(120, Math.min(640, Math.round(texH * aspect)));

        if (canvasEl.width !== texW || canvasEl.height !== texH) {
          canvasEl.width = texW;
          canvasEl.height = texH;
        }

        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        const imgData = ctx.createImageData(texW, texH);
        const data = imgData.data;
        const lut = buildBezierLut(config.curve);

        const halfW = w * 0.5;
        const halfH = h * 0.5;

        const expHalfW = Math.max(32, halfW + offsetX);
        const expHalfH = Math.max(32, halfH + (offsetTop + offsetBottom) * 0.5);
        const yBoxCenter = (offsetBottom - offsetTop) * 0.5;

        const distPct = Math.max(0, Math.min(95, config.distancePct ?? 40));
        const openScale = (100 - distPct) / 40;
        const featherSpan = Math.max(8, 1.5 * blurPx * openScale);

        const innerHalfW = Math.max(0, expHalfW - featherSpan);
        const innerHalfH = Math.max(0, expHalfH - featherSpan);

        const effCornerRadius = Math.min(
          Math.max(0, Math.min(innerHalfW, innerHalfH)),
          cornerRadiusPx + featherSpan * 0.38
        );

        const boxCoreW = Math.max(0, innerHalfW - effCornerRadius);
        const boxCoreH = Math.max(0, innerHalfH - effCornerRadius);

        const reachScale = Math.max(0.25, (config.outerReachPct ?? 100) / 100);
        const invFeatherReach = 1 / Math.max(1, featherSpan * reachScale);

        const alphaScale = renderMode === 'hybrid' ? 0.68 : 1.0;
        const a0 = innerAlpha * 255 * alphaScale;
        const a1 = outerAlpha * 255 * alphaScale;
        const da = a1 - a0;

        const r0 = innerRgb[0];
        const g0 = innerRgb[1];
        const b0 = innerRgb[2];
        const dr = outerRgb[0] - r0;
        const dg = outerRgb[1] - g0;
        const db = outerRgb[2] - b0;

        const scaleX = w / texW;
        const scaleY = h / texH;
        const lutMax = VIGNETTE_LUT_SIZE - 1;

        let ptr = 0;
        for (let py = 0; py < texH; py++) {
          const y = (py + 0.5) * scaleY - halfH - yBoxCenter;
          const ay = y < 0 ? -y : y;
          const qy = ay - boxCoreH;
          const qyPos = qy > 0 ? qy : 0;
          const qyPosSq = qyPos * qyPos;

          for (let px = 0; px < texW; px++) {
            const x = (px + 0.5) * scaleX - halfW;
            const ax = x < 0 ? -x : x;
            const qx = ax - boxCoreW;
            const qxPos = qx > 0 ? qx : 0;

            const outsideDist = Math.sqrt(qxPos * qxPos + qyPosSq);
            const insideMax = qx > qy ? qx : qy;
            const insideDist = insideMax < 0 ? insideMax : 0;
            const sdf = outsideDist + insideDist - effCornerRadius;

            let rawT = 0;
            if (sdf > 0) {
              rawT = sdf * invFeatherReach;
              if (rawT > 1) rawT = 1;
            }

            const lutPos = rawT * lutMax;
            const lutIdx = lutPos | 0;
            const lutFrac = lutPos - lutIdx;
            const c0 = lut[lutIdx];
            const c1 = lutIdx < lutMax ? lut[lutIdx + 1] : c0;
            const curveVal = c0 + (c1 - c0) * lutFrac;

            const seed = (px * 374761393 + py * 668265263) ^ 0x5bf03635;
            const h1 = ((seed ^ (seed >> 13)) * 1274126177) & 255;
            const h2 = (((seed >> 8) ^ (seed >> 19)) * 1911520717) & 255;
            const dither = ((h1 - h2) / 255) * 0.85;

            const r = r0 + dr * curveVal + dither;
            const g = g0 + dg * curveVal + dither;
            const b = b0 + db * curveVal + dither;
            const a = a0 + da * curveVal + dither;

            data[ptr] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
            data[ptr + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
            data[ptr + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
            data[ptr + 3] = a < 0 ? 0 : a > 255 ? 255 : a | 0;
            ptr += 4;
          }
        }

        ctx.putImageData(imgData, 0, 0);
      };

      const rect = frameEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        stageSizeRef.current = { width: rect.width, height: rect.height };
      }
      paintSdfCanvas(stageSizeRef.current.width, stageSizeRef.current.height);

      if (typeof ResizeObserver === 'undefined') return;
      let rafId = 0;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0) {
            const prev = stageSizeRef.current;
            if (
              Math.abs(cr.width - prev.width) >= 2 ||
              Math.abs(cr.height - prev.height) >= 2
            ) {
              const nextW = cr.width;
              const nextH = cr.height;
              stageSizeRef.current = { width: nextW, height: nextH };
              if (rafId) cancelAnimationFrame(rafId);
              rafId = requestAnimationFrame(() => {
                rafId = 0;
                paintSdfCanvas(nextW, nextH);
              });
            }
          }
        }
      });
      ro.observe(frameEl);
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }, [
      useCanvasLayer,
      renderMode,
      blurPx,
      offsetX,
      offsetTop,
      offsetBottom,
      cornerRadiusPx,
      config.distancePct,
      config.outerReachPct,
      config.curve.p1x,
      config.curve.p1y,
      config.curve.p2x,
      config.curve.p2y,
      innerHex,
      outerHex,
      innerAlpha,
      outerAlpha,
    ]);

    const cssShadowAlpha = renderMode === 'hybrid' ? outerAlpha * 0.55 : outerAlpha;
    const distDelta = 60 - Math.max(0, Math.min(95, config.distancePct ?? 40));
    const cssSpreadPx = Math.round((distDelta / 60) * (blurPx * 0.35));
    const cssInsetBoxShadow =
      cssSpreadPx !== 0
        ? `inset 0 0 ${blurPx}px ${cssSpreadPx}px rgba(${outerRgb[0]}, ${outerRgb[1]}, ${outerRgb[2]}, ${cssShadowAlpha.toFixed(3)})`
        : `inset 0 0 ${blurPx}px rgba(${outerRgb[0]}, ${outerRgb[1]}, ${outerRgb[2]}, ${cssShadowAlpha.toFixed(3)})`;

    return (
      <div
        ref={frameRef}
        data-ui-element="hud-takeover-vignette"
        data-alpha-id="Alpha:TakeoverVignetteOverlay"
        data-vignette-shape="rounded-rect"
        data-vignette-mode={renderMode}
        data-active={isShown ? 'true' : 'false'}
        aria-hidden="true"
        className={`absolute inset-0 overflow-hidden pointer-events-none select-none z-10 transition-opacity ${className}`}
        style={{
          opacity: isShown ? 1 : 0,
          transitionDuration: `${Math.max(0, transitionMs)}ms`,
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          transform: 'translateZ(0)',
        }}
      >
        {useCanvasLayer && (
          <canvas
            ref={canvasRef}
            className="w-full h-full block pointer-events-none"
            style={{
              transform: 'translateZ(0)',
            }}
          />
        )}

        {useCssInsetLayer && (
          <div
            data-role="vignette-inner-box-shadow"
            className="absolute pointer-events-none"
            style={{
              left: `${(-offsetX).toFixed(1)}px`,
              right: `${(-offsetX).toFixed(1)}px`,
              top: `${(-offsetTop).toFixed(1)}px`,
              bottom: `${(-offsetBottom).toFixed(1)}px`,
              width: `calc(100% + ${(offsetX * 2).toFixed(1)}px)`,
              height: `calc(100% + ${(offsetTop + offsetBottom).toFixed(1)}px)`,
              borderRadius: `${cornerRadiusPx}px`,
              backgroundColor:
                renderMode === 'css-inset' && innerAlpha > 0
                  ? `rgba(${innerRgb[0]}, ${innerRgb[1]}, ${innerRgb[2]}, ${innerAlpha.toFixed(3)})`
                  : 'transparent',
              boxShadow: cssInsetBoxShadow,
              willChange: 'transform, box-shadow',
            }}
          />
        )}
      </div>
    );
  }
);

TakeoverVignetteOverlay.displayName = 'TakeoverVignetteOverlay';
