import React, { useState, useEffect } from 'react';
import {
  Download,
  Database,
  Activity,
  Pause,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  FileArchive,
} from 'lucide-react';
import {
  networkDiagnosticsStore,
  useNetworkDiagnosticsData,
} from '../../stores/networkDiagnosticsStore';
import { useAppStore } from '../../stores/appStore';
import {
  globalPacingTelemetryRecorder,
} from '../../stores/pacingTelemetryRecorder';
import {
  CAPACITY_PRESETS,
  executeUnifiedDiagnosticDumpExport,
  exportStandaloneTelemetryZip,
} from './diagnostic-dump/diagnosticDumpExporter';
import { DiagnosticBufferGaugesSection } from './diagnostic-dump/DiagnosticBufferGaugesSection';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'diagnostic-dump',
  title: 'Export Diagnostic Dump',
  subtitle: 'DiagnosticDump',
  description:
    'Live Client Replay, Reconcile & Pacing Telemetry, and Server Replay buffer gauges + one-click .zip dump.',
  icon: 'FileArchive',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 480,
    height: 580,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface DiagnosticDumpFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const DiagnosticDumpFloatingWindow: React.FC<DiagnosticDumpFloatingWindowProps> = ({
  isLight = false,
  active = true,
}) => {
  const { metrics } = useNetworkDiagnosticsData();
  const [, setTickRefresh] = useState(0);

  const diag = metrics.diagnosticBuffers;
  const [maxClientFrames, setMaxClientFrames] = useState<number>(diag?.maxClientFrames || 36000);
  const [autoPauseOnOverflow, setAutoPauseOnOverflow] = useState<boolean>(
    diag?.autoPauseOnOverflow ?? true
  );
  const [includeClientReplay, setIncludeClientReplay] = useState<boolean>(true);
  const [includeReconcileTelemetry, setIncludeReconcileTelemetry] = useState<boolean>(true);
  const [includeServerReplay, setIncludeServerReplay] = useState<boolean>(true);
  const [lastExportStatus, setLastExportStatus] = useState<string | null>(null);

  useEffect(() => {
    useAppStore.getState().bridge.onEnsureNetworkDiagnostics?.();
  }, []);

  useEffect(() => {
    if (!active) return;
    return globalPacingTelemetryRecorder.subscribe(() => {
      setTickRefresh((v) => (v + 1) % 100000);
    });
  }, [active]);

  const isOnlineSession = Boolean(diag?.isOnlineSession || metrics.connected);
  const isLobby = Boolean(diag?.isLobby);
  const matchState = String(diag?.matchState || 'FREEPLAY');

  const clientFrames: number = Number(diag?.clientFrames ?? 0);
  const clientRecordingActive: boolean = Boolean(diag?.clientRecordingActive);
  const clientOverflowPaused: boolean = Boolean(diag?.clientOverflowPaused);
  const effectiveMaxFrames = Number(diag?.maxClientFrames) || maxClientFrames || 36000;
  const clientDurationSec = (clientFrames / 120).toFixed(1);

  const recorder = globalPacingTelemetryRecorder;
  const telemetryTicks: number = Number(diag?.telemetryTicks ?? recorder?.count ?? 0);

  const activeCarMask: number = Number(diag?.activeCarMask ?? 1);
  const activeSlots: number[] = [];
  for (let i = 0; i < 8; i++) { if (activeCarMask & (1 << i)) activeSlots.push(i); }

  let sessionStatusLabel = 'IDLE (SINGLEPLAYER — NO RECORDING)';
  let sessionStatusTone = isLight
    ? 'bg-neutral-100 border-neutral-300 text-neutral-700'
    : 'bg-neutral-850 border-neutral-700 text-neutral-300';

  if (isOnlineSession) {
    if (clientOverflowPaused) {
      sessionStatusLabel = 'PAUSED (CLIENT BUFFER OVERFLOW)';
      sessionStatusTone = 'bg-amber-950/40 border-amber-500/40 text-amber-300';
    } else if (!clientRecordingActive) {
      sessionStatusLabel = `PAUSED (${matchState})`;
      sessionStatusTone = 'bg-amber-950/30 border-amber-500/30 text-amber-300';
    } else if (isLobby) {
      sessionStatusLabel = 'RECORDING · LOBBY WARMUP (AUTO-CLEARS ON MATCH START)';
      sessionStatusTone = isLight
        ? 'bg-sky-50 border-sky-200 text-sky-900'
        : 'bg-sky-950/35 border-sky-500/40 text-sky-300';
    } else {
      sessionStatusLabel = `RECORDING · LIVE MATCH (${matchState})`;
      sessionStatusTone = isLight
        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
        : 'bg-emerald-950/35 border-emerald-500/40 text-emerald-300';
    }
  }

  const handleSelectMaxCapacity = (frames: number) => {
    setMaxClientFrames(frames);
    networkDiagnosticsStore.setDiagnosticMaxCapacity(frames);
  };

  const handleToggleAutoPauseOverflow = () => {
    const next = !autoPauseOnOverflow;
    setAutoPauseOnOverflow(next);
    networkDiagnosticsStore.setDiagnosticAutoPauseOverflow(next);
  };

  const handleToggleRecordingPause = () => {
    networkDiagnosticsStore.toggleDiagnosticRecordingPause();
    setTickRefresh((v) => v + 1);
  };

  const handleClearBuffersNow = () => {
    networkDiagnosticsStore.clearDiagnosticBuffers();
    recorder?.setSessionMetadata?.('csts', 'balanced', {});
    recorder?.reset?.();
    setLastExportStatus('All client, telemetry & server diagnostic buffers cleared to 0.');
    setTickRefresh((v) => v + 1);
  };

  const handleExportUnifiedDumpZip = () => {
    const status = executeUnifiedDiagnosticDumpExport({
      includeClientReplay,
      includeReconcileTelemetry,
      includeServerReplay,
    });
    setLastExportStatus(status);
  };

  const handleExportStandaloneClientReplay = () => {
    if (clientFrames <= 0) {
      setLastExportStatus('No client presentation replay frames recorded yet.');
      return;
    }
    const status = networkDiagnosticsStore.getState().bridge.onExportStandaloneClientReplay?.();
    setLastExportStatus(
      typeof status === 'string'
        ? status
        : `Exporting Client Replay (${clientFrames} frames / ${clientDurationSec}s)...`
    );
  };

  const handleExportStandaloneTelemetry = () => {
    setLastExportStatus(exportStandaloneTelemetryZip());
  };

  return (
    <div className="flex flex-col gap-2.5 h-full select-none text-xs overflow-y-auto pr-0.5">
      {/* 1. Live Session Recording State Banner */}
      <div className={`p-2.5 rounded-xl border flex items-center justify-between font-mono ${sessionStatusTone}`}>
        <div className="flex items-center gap-2 min-w-0">
          {clientOverflowPaused ? (
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          ) : isOnlineSession && clientRecordingActive ? (
            <Activity className="h-4 w-4 text-emerald-400 shrink-0 animate-pulse" />
          ) : (
            <Database className="h-4 w-4 text-neutral-400 shrink-0" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[11px] uppercase tracking-wide truncate">
              {sessionStatusLabel}
            </span>
            <span className="text-[10px] opacity-80 truncate">
              Active Slots: [{activeSlots.length > 0 ? activeSlots.join(', ') : 'none'}] (Mask 0x
              {activeCarMask.toString(16).toUpperCase().padStart(2, '0')}) · Local Car:{' '}
              {diag?.localPlayerCarIndex ?? 0}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleRecordingPause}
          disabled={!isOnlineSession}
          className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-colors ${
            !isOnlineSession
              ? 'opacity-40 cursor-not-allowed border-neutral-700 text-neutral-500'
              : clientRecordingActive
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
          }`}
        >
          {clientRecordingActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {clientRecordingActive ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* 2. Live Buffer Gauges (Client Replay, Reconcile Telemetry, Server Replay) */}
      <DiagnosticBufferGaugesSection
        isLight={isLight}
        effectiveMaxFrames={effectiveMaxFrames}
      />

      {/* 3. Debug Parameters & Overflow Configuration */}
      <div
        className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
          isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/70 border-neutral-700/70'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">Diagnostic Buffer & Dump Parameters</span>
          </div>
          <button
            type="button"
            onClick={handleClearBuffersNow}
            className="px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] font-mono flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Clear All to 0
          </button>
        </div>

        {/* Client Buffer Capacity Selector */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-neutral-400">
            <span>Client Replay Buffer Capacity Limit (Auto-Pauses on Overflow)</span>
            <button
              type="button"
              onClick={handleToggleAutoPauseOverflow}
              className={`px-1.5 py-0.5 rounded border font-mono text-[9px] ${
                autoPauseOnOverflow
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-neutral-700/40 border-neutral-600 text-neutral-400'
              }`}
            >
              Overflow Auto-Pause: {autoPauseOnOverflow ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {CAPACITY_PRESETS.map((preset) => {
              const selected = effectiveMaxFrames === preset.frames;
              return (
                <button
                  key={preset.frames}
                  type="button"
                  onClick={() => handleSelectMaxCapacity(preset.frames)}
                  className={`py-1 px-1.5 rounded-lg border font-mono text-[10px] transition-colors ${
                    selected
                      ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-bold'
                      : isLight
                      ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                      : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Included Tracks Toggles */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          {[
            {
              label: 'Client Replay',
              active: includeClientReplay,
              toggle: () => setIncludeClientReplay((v) => !v),
              tone: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
            },
            {
              label: 'Reconcile Log',
              active: includeReconcileTelemetry,
              toggle: () => setIncludeReconcileTelemetry((v) => !v),
              tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
            },
            {
              label: 'Server Replay',
              active: includeServerReplay,
              toggle: () => setIncludeServerReplay((v) => !v),
              tone: 'bg-violet-500/15 border-violet-500/40 text-violet-300',
            },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={t.toggle}
              className={`p-1.5 rounded-lg border text-left font-mono text-[10px] flex items-center justify-between ${
                t.active ? t.tone : 'bg-neutral-900/40 border-neutral-700/50 text-neutral-500'
              }`}
            >
              <span className="truncate">{t.label}</span>
              <span>{t.active ? 'ON' : 'OFF'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Anytime One-Click Export Actions */}
      <div className="flex flex-col gap-1.5 mt-auto">
        <button
          type="button"
          onClick={handleExportUnifiedDumpZip}
          className="w-full py-2.5 px-3 rounded-xl border border-sky-400/50 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <FileArchive className="h-4 w-4 text-sky-300" />
          Export Unified Diagnostic Dump (.zip) Now
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleExportStandaloneClientReplay}
            className={`py-1.5 px-2 rounded-lg border font-mono text-[10px] flex items-center justify-center gap-1.5 transition-colors ${
              isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200'
                : 'bg-neutral-850 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            <Download className="h-3 w-3 text-sky-400" />
            Client .rcreplay.gz ({clientFrames}f)
          </button>
          <button
            type="button"
            onClick={handleExportStandaloneTelemetry}
            className={`py-1.5 px-2 rounded-lg border font-mono text-[10px] flex items-center justify-center gap-1.5 transition-colors ${
              isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200'
                : 'bg-neutral-850 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            <Download className="h-3 w-3 text-emerald-400" />
            Reconcile Telemetry .zip ({telemetryTicks}t)
          </button>
        </div>

        {lastExportStatus && (
          <div className="px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 text-emerald-300 font-mono text-[10px] flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">{lastExportStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
};
