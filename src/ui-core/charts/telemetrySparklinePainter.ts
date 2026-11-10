// Pre-allocated static line-dash arrays to eliminate per-frame array allocations
const DASH_4_3 = [4, 3];
const DASH_2_2 = [2, 2];
const DASH_EMPTY: number[] = [];

export interface CanvasRenderCache {
  ctx: CanvasRenderingContext2D | null;
  grad: CanvasGradient | null;
  gradHeight: number;
  gradIsLight: boolean | null;
}

export interface TelemetryCanvasDrawOptions {
  canvasWidth: number;
  height: number;
  budgetMs: number;
  refreshHz: number;
  unit: string;
  isLight: boolean;
  hoverIndex: number | null;
  isFrozen: boolean;
}

/**
 * Pure zero-allocation Canvas 2D renderer:
 * - Reuses cached CanvasRenderingContext2D and cached CanvasGradient (eliminates native Skia shader leaks)
 * - Reads samples directly via O(1) index getter without allocating intermediate arrays or subarrays
 */
export function drawTelemetryCanvas(
  canvas: HTMLCanvasElement,
  cache: CanvasRenderCache,
  sampleCount: number,
  getSampleAt: (idx: number) => number,
  ceiling: number,
  options: TelemetryCanvasDrawOptions
): void {
  let ctx = cache.ctx;
  if (!ctx) {
    ctx = canvas.getContext('2d', { alpha: true });
    cache.ctx = ctx;
  }
  if (!ctx) return;

  const { canvasWidth, height, budgetMs, refreshHz, unit, isLight, hoverIndex, isFrozen } = options;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const targetW = Math.round(canvasWidth * dpr);
  const targetH = Math.round(height * dpr);

  // Only reallocate canvas backing store when pixel dimensions actually change
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    cache.grad = null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padLeft = 36;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 18;
  const plotW = Math.max(10, canvasWidth - padLeft - padRight);
  const plotH = Math.max(10, height - padTop - padBottom);

  // Reuse cached LinearGradient — only recreate if height or theme changes
  if (!cache.grad || cache.gradHeight !== height || cache.gradIsLight !== isLight) {
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, isLight ? 'rgba(14, 165, 233, 0.22)' : 'rgba(56, 189, 248, 0.22)');
    grad.addColorStop(1, 'rgba(14, 165, 233, 0.0)');
    cache.grad = grad;
    cache.gradHeight = height;
    cache.gradIsLight = isLight;
  }

  ctx.clearRect(0, 0, canvasWidth, height);

  const safeCeiling = Math.max(1, ceiling);
  const mapX = (idx: number, total: number) =>
    padLeft + (total > 1 ? (idx / (total - 1)) * plotW : 0);
  const mapY = (ms: number) =>
    padTop + (1 - Math.min(1, Math.max(0, ms / safeCeiling))) * plotH;

  // 1. Horizontal Grid Lines & Y-Axis Labels (0, budgetMs, ceiling)
  ctx.font = '10px "SF Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let g = 0; g < 3; g++) {
    const lvl = g === 0 ? 0 : g === 1 ? budgetMs : safeCeiling;
    const y = Math.round(mapY(lvl)) + 0.5;
    const isBudget = g === 1;
    ctx.beginPath();
    if (isBudget) {
      ctx.setLineDash(DASH_4_3);
      ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.75)' : 'rgba(245, 158, 11, 0.65)';
    } else {
      ctx.setLineDash(DASH_EMPTY);
      ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    }
    ctx.lineWidth = 1;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(canvasWidth - padRight, y);
    ctx.stroke();

    ctx.fillStyle = isBudget
      ? isLight
        ? '#b45309'
        : '#fbbf24'
      : isLight
      ? '#64748b'
      : '#94a3b8';
    ctx.fillText(
      isBudget && budgetMs % 1 !== 0 ? lvl.toFixed(1) : lvl.toFixed(0),
      padLeft - 5,
      y
    );
  }
  ctx.setLineDash(DASH_EMPTY);

  const len = sampleCount;
  if (len > 0) {
    const baseY = mapY(0);
    const spikeThreshold = budgetMs * 1.02;

    // 2. Over-budget red spike vertical bars
    ctx.strokeStyle = isLight ? 'rgba(220, 38, 38, 0.32)' : 'rgba(244, 63, 94, 0.38)';
    ctx.lineWidth = Math.max(1.5, plotW / Math.max(40, len));
    ctx.beginPath();
    let hasSpikes = false;
    for (let i = 0; i < len; i++) {
      const val = getSampleAt(i);
      if (val > spikeThreshold) {
        hasSpikes = true;
        const x = mapX(i, len);
        const y = mapY(val);
        ctx.moveTo(x, baseY);
        ctx.lineTo(x, y);
      }
    }
    if (hasSpikes) {
      ctx.stroke();
    }

    // 3. Area Fill + Crisp Polyline Trace (bevel join avoids expensive 240-arc tessellation)
    ctx.fillStyle = cache.grad;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = mapX(i, len);
      const y = mapY(getSampleAt(i));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(mapX(len - 1, len), baseY);
    ctx.lineTo(mapX(0, len), baseY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'bevel';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = mapX(i, len);
      const y = mapY(getSampleAt(i));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 4. Interactive Crosshair & Locked Sample Dot
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < len) {
      const hx = mapX(hoverIndex, len);
      const hVal = getSampleAt(hoverIndex);
      const hy = mapY(hVal);
      const isSpike = hVal > spikeThreshold;

      ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash(DASH_2_2);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash(DASH_EMPTY);

      ctx.fillStyle = isSpike ? '#f43f5e' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isLight ? '#ffffff' : '#09090b';
      ctx.stroke();
    }
  }

  // 5. X-Axis Footer Labels
  ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
  ctx.font = '9px "SF Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`-${(len / Math.max(1, refreshHz)).toFixed(1)}s`, padLeft, height - 6);
  ctx.textAlign = 'center';
  ctx.fillText(
    `Target ${budgetMs.toFixed(budgetMs % 1 !== 0 ? 2 : 0)}${unit} (${refreshHz}Hz)`,
    padLeft + plotW / 2,
    height - 6
  );
  ctx.textAlign = 'right';
  ctx.fillText(isFrozen ? 'FROZEN' : 'Now', canvasWidth - padRight, height - 6);
}
