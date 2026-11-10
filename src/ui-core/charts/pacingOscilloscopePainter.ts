import { PACING_EVENT_FLAGS, type PacingRingBuffer } from './pacingRingBuffer';

const DASH_3_3 = [3, 3];
const DASH_4_3 = [4, 3];
const DASH_2_2 = [2, 2];
const DASH_EMPTY: number[] = [];

export interface OscilloscopeRenderCache {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  cssW: number;
  cssH: number;
  isLight: boolean;
}

export interface PacingOscilloscopeDrawOptions {
  height: number;
  deadbandOffsets: [number, number];
  whatIfOverlay: {
    simBuffer: ArrayLike<number>;
    simRateHz: ArrayLike<number>;
    targetBuffer?: number;
  } | null;
  showPaneLabels: boolean;
  isLight: boolean;
  hoverIndex: number | null;
}

export function drawPacingOscilloscopeCanvas(
  canvas: HTMLCanvasElement,
  cache: OscilloscopeRenderCache,
  activeBuffer: PacingRingBuffer,
  opts: PacingOscilloscopeDrawOptions
): void {
  const { height, deadbandOffsets, whatIfOverlay, showPaneLabels, isLight, hoverIndex } = opts;
  if (cache.canvas !== canvas || !cache.ctx) {
    cache.canvas = canvas;
    cache.ctx = canvas.getContext('2d');
  }
  const ctx = cache.ctx;
  if (!ctx) return;

  const cssW = cache.cssW || 520;
  const cssH = height;
  if (canvas.width !== cssW || canvas.height !== cssH) {
    canvas.width = cssW;
    canvas.height = cssH;
  }
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = isLight ? '#f8fafc' : '#090d16';
  ctx.fillRect(0, 0, cssW, cssH);

  const count = activeBuffer.count;
  const padX = 8;
  const plotW = Math.max(20, cssW - padX * 2);
  const gapY = 4;
  const h1 = Math.floor((cssH - gapY * 2) * 0.27);
  const h2 = Math.floor((cssH - gapY * 2) * 0.45);
  const h3 = cssH - h1 - h2 - gapY * 2;
  const y1 = 0;
  const y2 = h1 + gapY;
  const y3 = y2 + h2 + gapY;

  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y2 - gapY * 0.5);
  ctx.lineTo(cssW, y2 - gapY * 0.5);
  ctx.moveTo(0, y3 - gapY * 0.5);
  ctx.lineTo(cssW, y3 - gapY * 0.5);
  ctx.stroke();

  ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  if (count < 2) return;

  const xAt = (i: number) => padX + (i / Math.max(1, count - 1)) * plotW;

  // ================= PANE 1: RTT & EWMA =================
  let maxRtt = 45;
  let minRtt = Infinity;
  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const v = activeBuffer.rawRttMs[pIdx];
    if (v > maxRtt) maxRtt = v;
    if (v < minRtt) minRtt = v;
  }
  if (!Number.isFinite(minRtt)) minRtt = 0;
  const rttFloor = Math.max(0, Math.floor(minRtt * 0.8));
  const rttCeil = Math.max(rttFloor + 20, Math.ceil(maxRtt * 1.15));
  const yRtt = (v: number) =>
    y1 +
    h1 -
    4 -
    ((Math.max(rttFloor, Math.min(rttCeil, v)) - rttFloor) / (rttCeil - rttFloor)) * (h1 - 16);

  ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const x = xAt(i);
    const y = yRtt(activeBuffer.rawRttMs[pIdx]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const x = xAt(i);
    const y = yRtt(activeBuffer.smoothRttMs[pIdx]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const newestPhysIdx = activeBuffer.physicalIndex(count - 1);
  const inspectIdx =
    hoverIndex !== null && hoverIndex < count
      ? activeBuffer.physicalIndex(hoverIndex)
      : newestPhysIdx;

  const curRtt = activeBuffer.rawRttMs[inspectIdx];
  const curSmoothRtt = activeBuffer.smoothRttMs[inspectIdx];
  if (showPaneLabels) {
    ctx.fillStyle = isLight ? '#0369a1' : '#38bdf8';
    ctx.fillText(
      `PANE 1 · RTT: ${curRtt.toFixed(1)}ms (EWMA ${curSmoothRtt.toFixed(1)}ms)`,
      padX + 4,
      y1 + 11
    );
  }

  // ================= PANE 2: INPUT BUFFER DEPTH & DEADBAND =================
  const bufMin = -4;
  const bufMax = 10;
  const yBuf = (v: number) =>
    y2 +
    h2 -
    5 -
    ((Math.max(bufMin, Math.min(bufMax, v)) - bufMin) / (bufMax - bufMin)) * (h2 - 18);

  const yZero = yBuf(0);
  const yBottom2 = y2 + h2 - 2;
  if (yBottom2 > yZero) {
    ctx.fillStyle = isLight ? 'rgba(244, 63, 94, 0.10)' : 'rgba(244, 63, 94, 0.14)';
    ctx.fillRect(padX, yZero, plotW, yBottom2 - yZero);
  }
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
  ctx.setLineDash(DASH_3_3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, yZero);
  ctx.lineTo(padX + plotW, yZero);
  ctx.stroke();
  ctx.setLineDash(DASH_EMPTY);

  const activeTgt = whatIfOverlay?.targetBuffer ?? activeBuffer.targetBuffer[inspectIdx] ?? 3;
  const dbLow = activeTgt + (deadbandOffsets[0] ?? -2);
  const dbHigh = activeTgt + (deadbandOffsets[1] ?? 2);
  const yDbHigh = yBuf(dbHigh);
  const yDbLow = yBuf(dbLow);
  ctx.fillStyle = isLight ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.11)';
  ctx.fillRect(padX, yDbHigh, plotW, Math.max(2, yDbLow - yDbHigh));

  const yTgt = yBuf(activeTgt);
  ctx.strokeStyle = isLight ? 'rgba(5, 150, 105, 0.7)' : 'rgba(16, 185, 129, 0.7)';
  ctx.setLineDash(DASH_4_3);
  ctx.beginPath();
  ctx.moveTo(padX, yTgt);
  ctx.lineTo(padX + plotW, yTgt);
  ctx.stroke();
  ctx.setLineDash(DASH_EMPTY);

  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const f = activeBuffer.eventFlags[pIdx];
    if (!f) continue;
    const x = xAt(i);
    if (f & PACING_EVENT_FLAGS.STARVATION) {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.75)';
      ctx.fillRect(x - 1, yZero - 6, 2, 8);
    }
    if (f & PACING_EVENT_FLAGS.HARD_RESYNC) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x - 1.5, y2 + 14, 3, h2 - 18);
    }
  }

  ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.8)' : 'rgba(251, 191, 36, 0.8)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const x = xAt(i);
    const y = yBuf(activeBuffer.serverBuffer[pIdx]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = isLight ? '#059669' : '#34d399';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const x = xAt(i);
    const y = yBuf(activeBuffer.effectiveBuffer[pIdx]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (whatIfOverlay && whatIfOverlay.simBuffer.length > 1) {
    const simLen = whatIfOverlay.simBuffer.length;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < simLen; i++) {
      const x = padX + (i / Math.max(1, simLen - 1)) * plotW;
      const y = yBuf(whatIfOverlay.simBuffer[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const curBuf = activeBuffer.serverBuffer[inspectIdx];
  if (showPaneLabels) {
    ctx.fillStyle = curBuf < 0 ? '#f43f5e' : isLight ? '#047857' : '#34d399';
    ctx.fillText(
      `PANE 2 · BUFFER: ${curBuf.toFixed(1)}t | Deadband [${dbLow.toFixed(0)}..${dbHigh.toFixed(
        0
      )}t]`,
      padX + 4,
      y2 + 11
    );
  }

  // ================= PANE 3: CLIENT PHYSICS RATE (HZ) =================
  const rateMin = 114;
  const rateMax = 126;
  const yRate = (v: number) =>
    y3 +
    h3 -
    4 -
    ((Math.max(rateMin, Math.min(rateMax, v)) - rateMin) / (rateMax - rateMin)) * (h3 - 15);

  const y120 = yRate(120);
  ctx.strokeStyle = isLight ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.35)';
  ctx.setLineDash(DASH_3_3);
  ctx.beginPath();
  ctx.moveTo(padX, y120);
  ctx.lineTo(padX + plotW, y120);
  ctx.stroke();
  ctx.setLineDash(DASH_EMPTY);

  ctx.strokeStyle = isLight ? '#d97706' : '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const pIdx = activeBuffer.physicalIndex(i);
    const x = xAt(i);
    const y = yRate(activeBuffer.physicsRateHz[pIdx]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const curRate = activeBuffer.physicsRateHz[inspectIdx];
  if (showPaneLabels) {
    ctx.fillStyle = isLight ? '#b45309' : '#fbbf24';
    ctx.fillText(
      `PANE 3 · CLOCK PACING: ${curRate.toFixed(2)} Hz (Nominal 120.00 Hz)`,
      padX + 4,
      y3 + 11
    );
  }

  if (hoverIndex !== null && hoverIndex < count) {
    const hx = xAt(hoverIndex);
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash(DASH_2_2);
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, cssH);
    ctx.stroke();
    ctx.setLineDash(DASH_EMPTY);
  }
}
