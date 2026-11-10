import React, { useEffect, useRef } from 'react';
import { globalPacingTelemetryRecorder } from '../../../stores/pacingTelemetryRecorder';
import { TELEMETRY_EVENT_FLAGS } from '../../../config/pacingControllerEvaluator';

export interface PacingOscilloscopeCanvasProps {
  height?: number;
  windowSamples?: number;
  deadbandOffsets?: [number, number];
  simulatedPreview?: {
    count: number;
    timeMs: ArrayLike<number>;
    rawRttMs: ArrayLike<number>;
    simBuffer: ArrayLike<number>;
    simTarget: ArrayLike<number>;
    simRateHz: ArrayLike<number>;
    simFlags: ArrayLike<number>;
  } | null;
  importedColumns?: {
    timeMs: ArrayLike<number>;
    rawRttMs: ArrayLike<number>;
    smoothRttMs?: ArrayLike<number>;
    serverBuffer: ArrayLike<number>;
    effectiveBuffer?: ArrayLike<number>;
    targetBuffer: ArrayLike<number>;
    physicsRateHz: ArrayLike<number>;
    eventFlags?: ArrayLike<number>;
  } | null;
}

export const PacingOscilloscopeCanvas: React.FC<PacingOscilloscopeCanvasProps> = ({
  height = 220,
  windowSamples = 360,
  deadbandOffsets = [-2, 2],
  simulatedPreview = null,
  importedColumns = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef({ windowSamples, deadbandOffsets, simulatedPreview, importedColumns });
  propsRef.current = { windowSamples, deadbandOffsets, simulatedPreview, importedColumns };

  useEffect(() => {
    let rafId = 0;
    let lastDrawTime = 0;

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      if (now - lastDrawTime < 30) return; // Cap oscilloscope redraw at ~33fps to preserve frame budget
      lastDrawTime = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 420;
      const cssH = canvas.clientHeight || height;
      const targetW = Math.floor(cssW * dpr);
      const targetH = Math.floor(cssH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);

      // Background
      ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
      ctx.fillRect(0, 0, cssW, cssH);

      const {
        windowSamples: maxSamples,
        deadbandOffsets: dbOffsets,
        simulatedPreview: sim,
        importedColumns: imp,
      } = propsRef.current;

      let count = 0;
      let rawRtt: ArrayLike<number> | null = null;
      let smoothRtt: ArrayLike<number> | null = null;
      let srvBuf: ArrayLike<number> | null = null;
      let effBuf: ArrayLike<number> | null = null;
      let tgtBuf: ArrayLike<number> | null = null;
      let rateHz: ArrayLike<number> | null = null;
      let flags: ArrayLike<number> | null = null;

      if (imp && imp.timeMs && imp.timeMs.length > 0) {
        const total = imp.timeMs.length;
        const start = Math.max(0, total - maxSamples);
        count = total - start;
        rawRtt = Array.prototype.slice.call(imp.rawRttMs, start, start + count);
        smoothRtt = imp.smoothRttMs
          ? Array.prototype.slice.call(imp.smoothRttMs, start, start + count)
          : rawRtt;
        srvBuf = Array.prototype.slice.call(imp.serverBuffer, start, start + count);
        effBuf = imp.effectiveBuffer
          ? Array.prototype.slice.call(imp.effectiveBuffer, start, start + count)
          : srvBuf;
        tgtBuf = Array.prototype.slice.call(imp.targetBuffer, start, start + count);
        rateHz = Array.prototype.slice.call(imp.physicsRateHz, start, start + count);
        flags = imp.eventFlags
          ? Array.prototype.slice.call(imp.eventFlags, start, start + count)
          : null;
      } else {
        const win = globalPacingTelemetryRecorder.getRecentWindow(maxSamples);
        count = win.count;
        rawRtt = win.rawRttMs;
        smoothRtt = win.smoothRttMs;
        srvBuf = win.serverBuffer;
        effBuf = win.effectiveBuffer;
        tgtBuf = win.targetBuffer;
        rateHz = win.physicsRateHz;
        flags = win.eventFlags;
      }

      const padX = 6;
      const plotW = Math.max(20, cssW - padX * 2);
      const gapY = 4;
      const h1 = Math.floor((cssH - gapY * 2) * 0.26);
      const h2 = Math.floor((cssH - gapY * 2) * 0.46);
      const h3 = cssH - h1 - h2 - gapY * 2;
      const y1 = 0;
      const y2 = h1 + gapY;
      const y3 = y2 + h2 + gapY;

      // Pane dividers
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y2 - gapY * 0.5);
      ctx.lineTo(cssW, y2 - gapY * 0.5);
      ctx.moveTo(0, y3 - gapY * 0.5);
      ctx.lineTo(cssW, y3 - gapY * 0.5);
      ctx.stroke();

      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';

      if (count < 2 || !rawRtt || !srvBuf || !tgtBuf || !rateHz) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.fillText('Awaiting live 120Hz network telemetry or imported trace...', padX + 6, cssH * 0.5);
        ctx.restore();
        return;
      }

      const xAt = (i: number) => padX + (i / Math.max(1, count - 1)) * plotW;

      // ================= PANE 1: RTT & EWMA =================
      let maxRtt = 40;
      let minRtt = Infinity;
      for (let i = 0; i < count; i++) {
        const v = rawRtt[i];
        if (v > maxRtt) maxRtt = v;
        if (v < minRtt) minRtt = v;
      }
      if (!Number.isFinite(minRtt)) minRtt = 0;
      const rttFloor = Math.max(0, Math.floor(minRtt * 0.8));
      const rttCeil = Math.max(rttFloor + 20, Math.ceil(maxRtt * 1.15));
      const yRtt = (v: number) =>
        y1 + h1 - 4 - ((Math.max(rttFloor, Math.min(rttCeil, v)) - rttFloor) / (rttCeil - rttFloor)) * (h1 - 16);

      // Raw RTT
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = xAt(i);
        const y = yRtt(rawRtt[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Smooth RTT
      if (smoothRtt) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = xAt(i);
          const y = yRtt(smoothRtt[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const latestRtt = rawRtt[count - 1] ?? 0;
      const latestSmoothRtt = smoothRtt ? (smoothRtt[count - 1] ?? latestRtt) : latestRtt;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(
        `RTT: ${latestRtt.toFixed(1)}ms (EWMA ${latestSmoothRtt.toFixed(1)}ms)`,
        padX + 4,
        y1 + 11
      );

      // ================= PANE 2: INPUT BUFFER DEPTH & DEADBAND =================
      const bufMin = -4;
      const bufMax = 10;
      const yBuf = (v: number) =>
        y2 + h2 - 5 - ((Math.max(bufMin, Math.min(bufMax, v)) - bufMin) / (bufMax - bufMin)) * (h2 - 18);

      // Starvation zone (< 0 ticks)
      const yZero = yBuf(0);
      const yBottom2 = y2 + h2 - 2;
      if (yBottom2 > yZero) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
        ctx.fillRect(padX, yZero, plotW, yBottom2 - yZero);
      }
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, yZero);
      ctx.lineTo(padX + plotW, yZero);
      ctx.stroke();
      ctx.setLineDash([]);

      // Deadband corridor around latest target
      const activeTgt = sim && sim.count > 0
        ? (sim.simTarget[sim.count - 1] ?? 3)
        : (tgtBuf[count - 1] ?? 3);
      const dbLow = activeTgt + (dbOffsets?.[0] ?? -2);
      const dbHigh = activeTgt + (dbOffsets?.[1] ?? 2);
      const yDbHigh = yBuf(dbHigh);
      const yDbLow = yBuf(dbLow);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.10)';
      ctx.fillRect(padX, yDbHigh, plotW, Math.max(2, yDbLow - yDbHigh));

      // Target buffer line
      const yTgt = yBuf(activeTgt);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(padX, yTgt);
      ctx.lineTo(padX + plotW, yTgt);
      ctx.stroke();
      ctx.setLineDash([]);

      // Starvation & Resync event markers
      const activeFlags = sim && sim.count > 0 ? sim.simFlags : flags;
      const activeCount = sim && sim.count > 0 ? sim.count : count;
      if (activeFlags) {
        for (let i = 0; i < activeCount; i++) {
          const f = activeFlags[i];
          if (!f) continue;
          const x = padX + (i / Math.max(1, activeCount - 1)) * plotW;
          if (f & TELEMETRY_EVENT_FLAGS.STARVATION) {
            ctx.fillStyle = 'rgba(244, 63, 94, 0.65)';
            ctx.fillRect(x - 0.75, yZero - 6, 1.5, 8);
          }
          if (f & TELEMETRY_EVENT_FLAGS.HARD_RESYNC) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(x - 1.5, y2 + 14, 3, h2 - 18);
          }
        }
      }

      // Recorded Server Buffer (step/line)
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = xAt(i);
        const y = yBuf(srvBuf[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Effective Compensated Buffer
      if (effBuf) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = xAt(i);
          const y = yBuf(effBuf[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Counterfactual What-If Simulated Buffer Overlay (if active in Tuner)
      if (sim && sim.count > 1) {
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        for (let i = 0; i < sim.count; i++) {
          const x = padX + (i / Math.max(1, sim.count - 1)) * plotW;
          const y = yBuf(sim.simBuffer[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const latestBuf = srvBuf[count - 1] ?? 0;
      ctx.fillStyle = latestBuf <= 0 ? '#f43f5e' : '#34d399';
      ctx.fillText(
        `BUFFER: ${latestBuf}t | Tgt ${activeTgt.toFixed(1)}t [${dbLow.toFixed(0)}..${dbHigh.toFixed(0)}]${
          sim ? ' | Violet = Simulated What-If' : ''
        }`,
        padX + 4,
        y2 + 11
      );

      // ================= PANE 3: CLIENT PHYSICS RATE (HZ) =================
      const rateMin = 114;
      const rateMax = 126;
      const yRate = (v: number) =>
        y3 + h3 - 4 - ((Math.max(rateMin, Math.min(rateMax, v)) - rateMin) / (rateMax - rateMin)) * (h3 - 15);

      const y120 = yRate(120);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padX, y120);
      ctx.lineTo(padX + plotW, y120);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = xAt(i);
        const y = yRate(rateHz[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (sim && sim.count > 1) {
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < sim.count; i++) {
          const x = padX + (i / Math.max(1, sim.count - 1)) * plotW;
          const y = yRate(sim.simRateHz[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const latestRate = sim && sim.count > 0
        ? (sim.simRateHz[sim.count - 1] ?? 120)
        : (rateHz[count - 1] ?? 120);
      ctx.fillStyle = '#93c5fd';
      ctx.fillText(`CLOCK RATE: ${latestRate.toFixed(2)} Hz (Nominal 120 Hz)`, padX + 4, y3 + 11);

      ctx.restore();
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [height]);

  return (
    <div
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(8, 12, 20, 0.85)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};
