import React from 'react';
import {
  Database,
  Activity,
  Server,
} from 'lucide-react';
import { useNetworkDiagnosticsData } from '../../../stores/networkDiagnosticsStore';
import {
  globalPacingTelemetryRecorder,
  MAX_TELEMETRY_TICKS,
} from '../../../stores/pacingTelemetryRecorder';
import { RC_REPLAY_STATE_INPUT_STRIDE } from './diagnosticDumpExporter';

export interface DiagnosticBufferGaugesSectionProps {
  isLight?: boolean;
  effectiveMaxFrames: number;
}

export const DiagnosticBufferGaugesSection: React.FC<DiagnosticBufferGaugesSectionProps> = ({
  isLight = false,
  effectiveMaxFrames,
}) => {
  const { metrics } = useNetworkDiagnosticsData();
  const diag = metrics.diagnosticBuffers;
  const isHosting = Boolean(diag?.isHosting);

  const clientFrames: number = Number(diag?.clientFrames ?? 0);
  const clientOverflowPaused: boolean = Boolean(diag?.clientOverflowPaused);
  const clientCapacityPct = Math.min(100, (clientFrames / Math.max(1, effectiveMaxFrames)) * 100);
  const clientBytes = clientFrames * RC_REPLAY_STATE_INPUT_STRIDE;
  const clientMb = (clientBytes / (1024 * 1024)).toFixed(2);
  const clientDurationSec = (clientFrames / 120).toFixed(1);

  const recorder = globalPacingTelemetryRecorder;
  const telemetryTicks: number = Number(diag?.telemetryTicks ?? recorder?.count ?? 0);
  const telemetryCapacityPct = Math.min(100, (telemetryTicks / MAX_TELEMETRY_TICKS) * 100);
  const telemetrySummary = recorder?.getSummaryStats?.() || {};
  const telemetryDurationSec = (telemetryTicks / 120).toFixed(1);
  const telemetryApproxKb = ((telemetryTicks * 60) / 1024).toFixed(1);

  const serverFrames: number = Number(diag?.serverFrames ?? 0);
  const serverDurationSec = (serverFrames / 120).toFixed(1);

  return (
    <div className="flex flex-col gap-2">
      {/* 2A. Client Presentation Replay Buffer */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
          isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/70 border-neutral-700/70'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-semibold text-[11px]">Client Presentation Replay Buffer</span>
          </div>
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
              clientOverflowPaused
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
            }`}
          >
            {clientFrames.toLocaleString()} / {effectiveMaxFrames.toLocaleString()} frames ({clientDurationSec}s · {clientMb} MB)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-700/50 overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${
              clientOverflowPaused || clientCapacityPct >= 95
                ? 'bg-amber-400'
                : 'bg-sky-400'
            }`}
            style={{ width: `${clientCapacityPct.toFixed(1)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
          <span>Stride: 1,856 B/frame (State + 8-Car Controls + Incidents + Signals)</span>
          <span>{clientCapacityPct.toFixed(1)}% used</span>
        </div>
      </div>

      {/* 2B. Reconcile & Clock Pacing Telemetry Buffer */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${
          isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/70 border-neutral-700/70'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-[11px]">Reconcile & Pacing Telemetry</span>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
            {telemetryTicks.toLocaleString()} / {MAX_TELEMETRY_TICKS.toLocaleString()} ticks ({telemetryDurationSec}s · ~{telemetryApproxKb} KB)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-700/50 overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all duration-150"
            style={{ width: `${telemetryCapacityPct.toFixed(1)}%` }}
          />
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-0.5 font-mono text-[10px]">
          <div className="p-1 rounded bg-neutral-900/50 border border-neutral-700/40 flex flex-col">
            <span className="text-neutral-400 text-[9px]">Reconcile Count</span>
            <span className="font-bold text-amber-300">{metrics.corrections}</span>
          </div>
          <div className="p-1 rounded bg-neutral-900/50 border border-neutral-700/40 flex flex-col">
            <span className="text-neutral-400 text-[9px]">Last / Max Err</span>
            <span className="font-bold text-rose-300">
              {metrics.lastErrorUu.toFixed(1)} / {metrics.maxErrorUu.toFixed(1)} UU
            </span>
          </div>
          <div className="p-1 rounded bg-neutral-900/50 border border-neutral-700/40 flex flex-col">
            <span className="text-neutral-400 text-[9px]">Starvations</span>
            <span className="font-bold text-sky-300">{telemetrySummary.starvationCount ?? 0}</span>
          </div>
          <div className="p-1 rounded bg-neutral-900/50 border border-neutral-700/40 flex flex-col">
            <span className="text-neutral-400 text-[9px]">Input Buf / RTT</span>
            <span className="font-bold text-emerald-300">
              {metrics.inputBufferDepth}t / {Math.round(metrics.rttMs)}ms
            </span>
          </div>
        </div>
      </div>

      {/* 2C. Server Authoritative Replay Buffer */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-1 ${
          isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/70 border-neutral-700/70'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-violet-400" />
            <span className="font-semibold text-[11px]">Server Authoritative Replay (Host Worker)</span>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-violet-500/15 border-violet-500/30 text-violet-300">
            {isHosting
              ? `${serverFrames.toLocaleString()} frames (${serverDurationSec}s)`
              : 'Client Mode (N/A)'}
          </span>
        </div>
        <span className="text-[10px] text-neutral-400 font-mono">
          {isHosting
            ? 'Records pure authoritative physics + lifecycle signals (zero client prediction garbage)'
            : 'Connected as remote client — Server Authoritative buffer resides on Host'}
        </span>
      </div>
    </div>
  );
};
