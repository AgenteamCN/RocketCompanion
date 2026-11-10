import { DEFAULT_NAME_TAG_CONFIG, type NameTagBoostIndicatorMode, type NameTagConfig } from './nameTagConfig';
import { hexToRgba, resolveActiveBoostFillColor, resolveUnfilledBaseHexColor } from './nameTagColorAndRoiMath';
import { drawOffscreenIndicatorCard2D, type NameTagOffscreenIndicatorCard2D } from './nameTagOffscreenRenderer';

export interface NameTagPillRenderCard2D {
  carIndex: number;
  cameraDistanceSq: number;
  viewZDepthUu: number;
  displayText: string;
  centerX: number;
  centerY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  borderW: number;
  screenUnitScale: number;
  outerLeft: number;
  outerTop: number;
  outerRight: number;
  outerBottom: number;
  outerWidth: number;
  outerHeight: number;
  outerRadius: number;
  fontPx: number;
  fontWeight: number;
  fontFamilyCss: string;
  opacity: number;
  bgOpacity: number;
  bgColor: string;
  borderColor: string;
  textColor: string;
  boostBorderVisible: boolean;
  boostFraction: number;
  boostBorderColor: string;
  aerialClimbGlowVisible?: boolean;
}

export interface NameTagBallOcclusionProjection2D {
  visible: boolean;
  screenX: number;
  screenY: number;
  screenRadiusPx: number;
  viewZDepthUu: number;
  opacity: number;
}

export function drawNameTagPillCard2D(
  ctx: CanvasRenderingContext2D,
  card: NameTagPillRenderCard2D,
  config: Pick<
    NameTagConfig,
    | 'boostIndicatorMode'
    | 'boostFillOpacity'
    | 'boostUnfilledBgOpacity'
    | 'boostShowHorizonLine'
  > &
    Partial<
      Pick<
        NameTagConfig,
        | 'boostFillColorBlendRatio'
        | 'boostUnfilledDarkenRatio'
        | 'aerialClimbGlowColor'
        | 'aerialClimbGlowRadiusPx'
        | 'aerialClimbGlowOpacity'
      >
    >
): void {
  const mode: NameTagBoostIndicatorMode =
    config.boostIndicatorMode || DEFAULT_NAME_TAG_CONFIG.boostIndicatorMode;
  const clampedBoost = Math.max(0, Math.min(1, card.boostFraction));
  const boostFillAlpha = Math.max(
    0,
    Math.min(1, config.boostFillOpacity ?? DEFAULT_NAME_TAG_CONFIG.boostFillOpacity)
  );
  const boostFillBlendRatio =
    config.boostFillColorBlendRatio ??
    DEFAULT_NAME_TAG_CONFIG.boostFillColorBlendRatio;
  const unfilledAlpha = Math.max(
    0,
    Math.min(
      1,
      config.boostUnfilledBgOpacity ?? DEFAULT_NAME_TAG_CONFIG.boostUnfilledBgOpacity
    )
  );
  const unfilledDarkenRatio =
    config.boostUnfilledDarkenRatio ??
    DEFAULT_NAME_TAG_CONFIG.boostUnfilledDarkenRatio;
  const showHorizon =
    config.boostShowHorizonLine ?? DEFAULT_NAME_TAG_CONFIG.boostShowHorizonLine;

  ctx.globalAlpha = card.opacity;

  if (
    card.boostBorderVisible &&
    (mode === 'bottom-up-fill' || mode === 'left-right-fill')
  ) {
    const unfilledHex = resolveUnfilledBaseHexColor(
      card.bgColor,
      unfilledDarkenRatio
    );
    const activeFillHex = resolveActiveBoostFillColor(
      card.bgColor,
      card.boostBorderColor,
      boostFillBlendRatio
    );

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(card.left, card.top, card.width, card.height, card.radius);
    ctx.clip();

    if (mode === 'bottom-up-fill') {
      const fillH = card.height * clampedBoost;
      const unfilledH = Math.max(0, card.height - fillH);
      const fillTop = card.top + unfilledH;

      if (unfilledH > 0.001 && unfilledAlpha > 0.001) {
        ctx.fillStyle = hexToRgba(unfilledHex, unfilledAlpha);
        ctx.fillRect(card.left, card.top, card.width, unfilledH);
      }

      if (fillH > 0.001 && boostFillAlpha > 0.001) {
        ctx.fillStyle = hexToRgba(activeFillHex, boostFillAlpha);
        ctx.fillRect(card.left, fillTop, card.width, fillH);
      }

      if (showHorizon && clampedBoost > 0.02 && clampedBoost < 0.98) {
        ctx.beginPath();
        ctx.moveTo(card.left, fillTop);
        ctx.lineTo(card.left + card.width, fillTop);
        ctx.lineWidth = Math.max(1.25, card.borderW * 0.55);
        ctx.strokeStyle = card.boostBorderColor;
        ctx.stroke();
      }
    } else {
      const fillW = card.width * clampedBoost;
      const unfilledW = Math.max(0, card.width - fillW);
      const edgeX = card.left + fillW;

      if (unfilledW > 0.001 && unfilledAlpha > 0.001) {
        ctx.fillStyle = hexToRgba(unfilledHex, unfilledAlpha);
        ctx.fillRect(edgeX, card.top, unfilledW, card.height);
      }

      if (fillW > 0.001 && boostFillAlpha > 0.001) {
        ctx.fillStyle = hexToRgba(activeFillHex, boostFillAlpha);
        ctx.fillRect(card.left, card.top, fillW, card.height);
      }

      if (showHorizon && clampedBoost > 0.02 && clampedBoost < 0.98) {
        ctx.beginPath();
        ctx.moveTo(edgeX, card.top);
        ctx.lineTo(edgeX, card.top + card.height);
        ctx.lineWidth = Math.max(1.25, card.borderW * 0.55);
        ctx.strokeStyle = card.boostBorderColor;
        ctx.stroke();
      }
    }
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.roundRect(card.left, card.top, card.width, card.height, card.radius);
    ctx.fillStyle = hexToRgba(card.bgColor, card.bgOpacity);
    ctx.fill();
  }

  if (card.borderW > 0) {
    ctx.beginPath();
    ctx.roundRect(card.left, card.top, card.width, card.height, card.radius);
    ctx.lineWidth = card.borderW;
    ctx.strokeStyle = card.borderColor;
    ctx.stroke();

    if (
      card.boostBorderVisible &&
      clampedBoost > 0.001 &&
      (mode === 'border-only' || mode === 'left-right-fill')
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        card.outerLeft,
        card.outerTop,
        card.outerWidth * clampedBoost,
        card.outerHeight
      );
      ctx.clip();

      ctx.beginPath();
      ctx.roundRect(card.left, card.top, card.width, card.height, card.radius);
      ctx.lineWidth = card.borderW;
      ctx.strokeStyle = card.boostBorderColor;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(card.left, card.top, card.width, card.height, card.radius);
  ctx.clip();

  let textCenterX = card.centerX;
  let maxTextWidth = Math.max(
    12,
    card.width - card.borderW * 2 - 10 * (card.screenUnitScale || 1)
  );

  if (card.boostBorderVisible && mode === 'sunset-circle') {
    const unit = card.screenUnitScale || 1;
    const circleDia = Math.max(
      8,
      Math.min(card.height * 0.64, card.width * 0.28)
    );
    const circleRadius = circleDia * 0.5;
    const padLeft = Math.max(4 * unit, card.borderW + 5 * unit);
    const circleCx = card.left + padLeft + circleRadius;
    const circleCy = card.centerY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(5, 10, 20, 0.72)';
    ctx.fill();
    ctx.clip();

    if (clampedBoost > 0.001) {
      const fillH = circleDia * clampedBoost;
      const fillTop = circleCy + circleRadius - fillH;
      const activeFillHex = resolveActiveBoostFillColor(
        card.bgColor,
        card.boostBorderColor
      );
      const grad = ctx.createLinearGradient(
        circleCx,
        circleCy + circleRadius,
        circleCx,
        circleCy - circleRadius
      );
      grad.addColorStop(0, activeFillHex);
      grad.addColorStop(1, card.boostBorderColor);
      ctx.fillStyle = grad;
      ctx.fillRect(circleCx - circleRadius, fillTop, circleDia, fillH);

      if (showHorizon && clampedBoost > 0.03 && clampedBoost < 0.97) {
        ctx.beginPath();
        ctx.moveTo(circleCx - circleRadius, fillTop);
        ctx.lineTo(circleCx + circleRadius, fillTop);
        ctx.lineWidth = Math.max(1, card.borderW * 0.45);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleRadius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, card.borderW * 0.5);
    ctx.strokeStyle =
      clampedBoost > 0.02 ? card.boostBorderColor : card.borderColor;
    ctx.stroke();

    const badgeTotalSpan = padLeft + circleDia + 4 * unit;
    textCenterX = card.left + badgeTotalSpan + (card.width - badgeTotalSpan) * 0.5;
    maxTextWidth = Math.max(
      10,
      card.width - badgeTotalSpan - card.borderW - 6 * unit
    );
  }

  ctx.font = `${card.fontWeight} ${card.fontPx.toFixed(2)}px ${card.fontFamilyCss}`;
  ctx.fillStyle = card.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    card.displayText,
    textCenterX,
    card.centerY + card.fontPx * 0.03,
    maxTextWidth
  );
  ctx.restore();
}

export function renderNameTagOverlayPass2D(
  ctx: CanvasRenderingContext2D,
  visibleCards2D: NameTagPillRenderCard2D[],
  viewportWidthPx: number,
  viewportHeightPx: number,
  config: NameTagConfig,
  ballOcclusion?: NameTagBallOcclusionProjection2D | null,
  offscreenIndicators2D: NameTagOffscreenIndicatorCard2D[] = []
): void {
  if (visibleCards2D.length === 0 && offscreenIndicators2D.length === 0) return;

  if (visibleCards2D.length > 0) {
    visibleCards2D.sort(
      (a, b) =>
        (a.cameraDistanceSq || 0) - (b.cameraDistanceSq || 0) ||
        (a.carIndex ?? 0) - (b.carIndex ?? 0)
    );

    const drawSingleRankWithCloserClips = (rank: number) => {
      const card = visibleCards2D[rank];
      ctx.save();
      for (let closerIdx = 0; closerIdx < rank; closerIdx++) {
        const closer = visibleCards2D[closerIdx];
        if (
          closer.outerRight <= card.outerLeft ||
          closer.outerLeft >= card.outerRight ||
          closer.outerBottom <= card.outerTop ||
          closer.outerTop >= card.outerBottom
        ) {
          continue;
        }
        ctx.beginPath();
        ctx.rect(0, 0, viewportWidthPx, viewportHeightPx);
        ctx.roundRect(
          closer.outerLeft,
          closer.outerTop,
          closer.outerWidth,
          closer.outerHeight,
          closer.outerRadius
        );
        ctx.clip('evenodd');
      }

      drawNameTagPillCard2D(ctx, card, config);
      ctx.restore();
    };

    const applyBallOcclusion =
      Boolean(config.ballOcclusionEnabled) &&
      Boolean(ballOcclusion?.visible) &&
      (ballOcclusion?.screenRadiusPx || 0) > 1 &&
      (ballOcclusion?.opacity || 0) > 0.001;

    if (!applyBallOcclusion || !ballOcclusion) {
      for (let rank = 0; rank < visibleCards2D.length; rank++) {
        drawSingleRankWithCloserClips(rank);
      }
    } else {
      let drewBehindBallCard = false;
      for (let rank = 0; rank < visibleCards2D.length; rank++) {
        if (visibleCards2D[rank].viewZDepthUu > ballOcclusion.viewZDepthUu) {
          drawSingleRankWithCloserClips(rank);
          drewBehindBallCard = true;
        }
      }

      if (drewBehindBallCard) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = Math.max(0, Math.min(1, ballOcclusion.opacity));
        ctx.beginPath();
        ctx.arc(
          ballOcclusion.screenX,
          ballOcclusion.screenY,
          ballOcclusion.screenRadiusPx,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }

      for (let rank = 0; rank < visibleCards2D.length; rank++) {
        if (visibleCards2D[rank].viewZDepthUu <= ballOcclusion.viewZDepthUu) {
          drawSingleRankWithCloserClips(rank);
        }
      }
    }
  }

  if (offscreenIndicators2D.length > 0) {
    offscreenIndicators2D.sort(
      (a, b) => (b.cameraDistanceSq || 0) - (a.cameraDistanceSq || 0)
    );
    for (let i = 0; i < offscreenIndicators2D.length; i++) {
      drawOffscreenIndicatorCard2D(ctx, offscreenIndicators2D[i], config);
    }
  }
}
