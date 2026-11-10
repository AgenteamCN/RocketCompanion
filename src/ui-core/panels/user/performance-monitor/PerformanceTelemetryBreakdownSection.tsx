import React from 'react';
import { Cpu, HardDrive, ClipboardCopy } from 'lucide-react';
import type { TelemetryPhaseItem } from '../../../charts/TelemetrySparklineChart';
import { quickNotification } from '../../../stores/quickNotificationStore';

export interface LiveSystemTelemetrySnapshot {
  /** Latest frame time in milliseconds (pushed into internal Canvas RingBuffer) */
  frameTimeMs?: number;
  budgetMs?: number;
  refreshHz?: number;
  /** Optional override for P50/P95/P99/Peak/Budget stats */
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  peakMs?: number;
  overBudgetPct?: number;
  /** Optional CPU breakdown phases */
  cpuPhases?: TelemetryPhaseItem[];
  /** Optional WASM Physics & Bot Engine metrics */
  physicsStepHz?: string | number;
  substepsPerTick?: string | number;
  botPolicyLabel?: string;
  wasmHeapMb?: string | number;
  /** Optional WebGL2 / Three.js pipeline metrics */
  pipelineBadge?: string;
  drawCalls?: number;
  trianglesLabel?: string | number;
  geometries?: number;
  shaderPrograms?: number;
}

export interface PerformanceTelemetryBreakdownSectionProps {
  isLight: boolean;
  cpuPhases: TelemetryPhaseItem[];
  snapshot?: LiveSystemTelemetrySnapshot;
  displayP50: number;
  displayP95: number;
  displayP99: number;
  displayPeak: number;
  displayOverBudgetPct: number;
  budgetMs: number;
  refreshHz: number;
}

export const PerformanceTelemetryBreakdownSection: React.FC<
  PerformanceTelemetryBreakdownSectionProps
> = ({
  isLight,
  cpuPhases,
  snapshot,
  displayP50,
  displayP95,
  displayP99,
  displayPeak,
  displayOverBudgetPct,
  budgetMs,
  refreshHz,
}) => {
  const totalCpuMs = cpuPhases.reduce((acc, item) => acc + item.avgMs, 0);

  const handleCopyDiagnosticReport = () => {
    try {
      const w =
        typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
      const customBuilder = w.exportRuntimeDiagnosticReport;
      const payload =
        typeof customBuilder === 'function'
          ? (customBuilder as () => unknown)()
          : {
              capturedAt: new Date().toISOString(),
              telemetry: {
                p50Ms: Number(displayP50.toFixed(3)),
                p95Ms: Number(displayP95.toFixed(3)),
                p99Ms: Number(displayP99.toFixed(3)),
                peakMs: Number(displayPeak.toFixed(3)),
                budgetMs,
                refreshHz,
                overBudgetPct: displayOverBudgetPct,
                totalCpuMs: Number(totalCpuMs.toFixed(3)),
                cpuPhases: cpuPhases.map((p) => ({
                  phase: p.phase,
                  avgMs: Number(p.avgMs.toFixed(3)),
                  sharePct: Math.round(p.share * 100),
                })),
                webgl: {
                  drawCalls: snapshot?.drawCalls ?? 0,
                  triangles: snapshot?.trianglesLabel ?? '0',
                  geometries: snapshot?.geometries ?? 0,
                  shaderPrograms: snapshot?.shaderPrograms ?? 0,
                },
              },
            };
      const jsonText = JSON.stringify(payload, null, 2);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(jsonText);
      }
      quickNotification.success('Copied diagnostic performance report to clipboard.');
    } catch {
      quickNotification.error('Failed to copy diagnostic report.');
    }
  };

  const physicsStepLabel =
    snapshot?.physicsStepHz !== undefined
      ? typeof snapshot.physicsStepHz === 'number'
        ? `${snapshot.physicsStepHz.toFixed(1)} Hz`
        : snapshot.physicsStepHz
      : '120.0 Hz';
  const substepsLabel =
    snapshot?.substepsPerTick !== undefined
      ? typeof snapshot.substepsPerTick === 'number'
        ? `${snapshot.substepsPerTick} / tick`
        : snapshot.substepsPerTick
      : '4 / tick';
  const botPolicyLabel = snapshot?.botPolicyLabel ?? 'Nexto (15Hz)';
  const wasmHeapLabel =
    snapshot?.wasmHeapMb !== undefined
      ? typeof snapshot.wasmHeapMb === 'number'
        ? `${snapshot.wasmHeapMb.toFixed(1)} MB`
        : snapshot.wasmHeapMb
      : '64.0 MB';

  const pipelineBadge = snapshot?.pipelineBadge ?? 'DPR 1.0 · FXAA + Bloom';
  const drawCalls = snapshot?.drawCalls ?? 142;
  const trianglesLabel = snapshot?.trianglesLabel ?? '218.4 K';
  const geometries = snapshot?.geometries ?? 68;
  const shaderPrograms = snapshot?.shaderPrograms ?? 29;

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200'
    : 'bg-neutral-900/60 border-neutral-800';

  return (
    <>
      {/* 3. CPU Breakdown (Vertical Multi-Color Percentage Bars) */}
      <div className={`p-3 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between font-mono gap-2">
          <span className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-sky-500 shrink-0" />
            <span>CPU Breakdown</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tabular-nums text-sky-400">
              Total: {totalCpuMs.toFixed(2)} ms
            </span>
            <button
              type="button"
              onClick={handleCopyDiagnosticReport}
              title="Copy JSON diagnostic performance report to clipboard"
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border transition-colors ${
                isLight
                  ? 'bg-white border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                  : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-200'
              }`}
            >
              <ClipboardCopy className="h-3 w-3 text-amber-500" />
              <span>Copy Report</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 font-mono text-[10px]">
          {cpuPhases.map((item) => {
            const pct = Math.round(item.share * 100);
            const barColor = item.color || '#38bdf8';
            return (
              <div key={item.phase} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: barColor }}
                    />
                    <span className="opacity-90 truncate">{item.phase}</span>
                  </span>
                  <span className="tabular-nums shrink-0">
                    <strong className="mr-1.5">{item.avgMs.toFixed(2)}ms</strong>
                    <span className="opacity-65">({pct}%)</span>
                  </span>
                </div>
                <div
                  className={`w-full h-1.5 rounded-full overflow-hidden ${
                    isLight ? 'bg-neutral-200/90' : 'bg-neutral-800'
                  }`}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(2, Math.min(100, pct))}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Physics & WebGL Pipeline Cards */}
      <div className="grid grid-cols-1 gap-2.5">
        <div className={`p-3 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-amber-500">
              <Cpu className="h-3.5 w-3.5" />
              <span>WASM Physics & Bot Engine</span>
            </span>
            <span className="font-mono text-[10px] opacity-70">Bullet3 + ONNX Runtime</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Physics Step:</span>
              <span className="font-bold text-emerald-500">{physicsStepLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Substeps:</span>
              <span className="font-bold">{substepsLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Bot Policy:</span>
              <span className="font-bold text-sky-400">{botPolicyLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">WASM Heap:</span>
              <span className="font-bold">{wasmHeapLabel}</span>
            </div>
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className="font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-sky-500">
              <HardDrive className="h-3.5 w-3.5" />
              <span>WebGL2 / Three.js Pipeline</span>
            </span>
            <span className="font-mono text-[10px] opacity-70">{pipelineBadge}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Draw Calls:</span>
              <span className="font-bold">{drawCalls}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Triangles:</span>
              <span className="font-bold">{trianglesLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Geometries:</span>
              <span className="font-bold">{geometries}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 whitespace-nowrap px-2 py-1 rounded bg-black/5 dark:bg-white/5">
              <span className="opacity-65">Shader Progs:</span>
              <span className="font-bold">{shaderPrograms}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
