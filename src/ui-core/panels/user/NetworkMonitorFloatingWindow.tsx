import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Wifi, Download, Pause, Play, User } from 'lucide-react';
import { PacingOscilloscopeChart } from '../../charts/PacingOscilloscopeChart';
import { PacingRingBuffer } from '../../charts/pacingRingBuffer';
import { Button } from '../../primitives/Button';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { useAppStore } from '../../stores/appStore';
import { useNetworkDiagnosticsData } from '../../stores/networkDiagnosticsStore';
import { globalPacingTelemetryRecorder } from '../../stores/pacingTelemetryRecorder';
import { downloadNetworkTelemetryZip } from '../../stores/pacingTelemetryExporter';
import { quickNotification } from '../../stores/quickNotificationStore';

export const SURFACE_META: SurfaceMeta = {
  id: 'network-monitor',
  title: 'Network Monitor',
  description:
    'Real-time RTT & jitter oscilloscope, input buffer queue depth, and 20-minute session telemetry export.',
  icon: 'wifi',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 446,
    height: 501,
    minWidth: 446,
    minHeight: 230,
    mode: 'adaptive',
  },
};

export type NetworkSessionMode = 'online-client' | 'online-host' | 'single-player';

export interface NetworkDiagnosticsSample {
  rawRttMs: number;
  serverBuffer: number;
  effectiveBuffer: number;
  targetBuffer: number;
  physicsRateHz: number;
  eventFlags?: number;
}

export interface NetworkDiagnosticsSnapshot {
  sessionMode?: NetworkSessionMode;
  rttMs?: number;
  jitterMs?: number;
  leadTicks?: number;
  leadMs?: number;
  physicsRateHz?: number;
  physicsScalePct?: number;
  rollbackCount?: number;
  targetBuffer?: number;
  serverBuffer?: number;
  eventFlags?: number;
}

export interface NetworkMonitorFloatingWindowProps extends StandardSurfaceProps {}

function createInitialPacingBuffer(seedSamples?: NetworkDiagnosticsSample[]): PacingRingBuffer {
  const buf = new PacingRingBuffer(360);
  if (seedSamples && seedSamples.length > 0) {
    for (const sample of seedSamples) {
      buf.push({
        rawRttMs: sample.rawRttMs,
        serverBuffer: sample.serverBuffer,
        effectiveBuffer: sample.effectiveBuffer,
        targetBuffer: sample.targetBuffer,
        physicsRateHz: sample.physicsRateHz,
        eventFlags: sample.eventFlags ?? 0,
      });
    }
    return buf;
  }
  let rtt = 18.4;
  let eff = 2.0;
  for (let i = 0; i < 240; i++) {
    rtt = 18.4 + Math.sin(i * 0.08) * 1.4 + (Math.random() - 0.5) * 0.8;
    const tgt = 2.0;
    const srv = 2.0 + Math.sin(i * 0.06) * 0.45;
    eff = eff * 0.85 + srv * 0.15;
    const err = eff - tgt;
    const rate = Math.max(118.8, Math.min(121.2, 120 - err * 0.4));
    buf.push({
      rawRttMs: rtt,
      serverBuffer: srv,
      effectiveBuffer: eff,
      targetBuffer: tgt,
      physicsRateHz: rate,
      eventFlags: 0,
    });
  }
  return buf;
}

/**
 * 4. [User] Network Monitor (`network-monitor`)
 * Standalone L6 Floating Window Panel composing the L5 `<PacingOscilloscopeChart />`:
 * 1. Top Bar:
 *    - Left status badge: Green `Online as Client` / `Online as Host` or Yellow `Single Player Mode` (clickable to cycle preview modes)
 *    - Right buttons: `Pause` and `Export Log`
 * 2. 4 Metric Cards:
 *    - `RTT`: `18.4 ms` / gray subtext `Jitter: 1.2 ms`
 *    - `Lead Ticks`: `+2.0 ticks` / gray subtext `+16.7 ms`
 *    - `Physics Rate`: `120.0 Hz` / gray subtext `Scale: +0.00%`
 *    - `Rollback`: `0` / gray subtext `in last 10s`
 * 3. Embedded `<PacingOscilloscopeChart variant="embedded" />` + `Freeze` and `Clear` (`Reset`) controls (no Inject Starvation).
 */
export const NetworkMonitorFloatingWindow: React.FC<
  NetworkMonitorFloatingWindowProps
> = React.memo(({ isLight = false }) => {
  const { metrics } = useNetworkDiagnosticsData();
  const onlineSession = useScopedStore('appStore', useAppStore, (s) => s.onlineSession);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);

  useEffect(() => {
    bridge?.onEnsureNetworkDiagnostics?.();
  }, [bridge]);

  const hasHostRuntime = Boolean(bridge?.onEnsureNetworkDiagnostics || metrics);
  const storeSessionMode: NetworkSessionMode = onlineSession?.roomId
    ? onlineSession.isHosting
      ? 'online-host'
      : 'online-client'
    : 'single-player';

  const snapshot = useMemo<NetworkDiagnosticsSnapshot | undefined>(() => {
    if (!hasHostRuntime) return undefined;
    return {
      sessionMode: storeSessionMode,
      rttMs: metrics?.rttMs || 0,
      jitterMs: metrics?.jitterMs || 0,
      leadTicks: metrics?.clientLeadTicks ?? 0,
      physicsRateHz: 120,
      rollbackCount: metrics?.corrections ?? 0,
      targetBuffer: metrics?.inputBufferDepth || 0,
      serverBuffer: metrics?.rollbackWindow || 0,
    };
  }, [hasHostRuntime, storeSessionMode, metrics]);

  const controlledSessionMode = hasHostRuntime ? storeSessionMode : undefined;

  const [internalSessionMode, setInternalSessionMode] =
    useState<NetworkSessionMode>('online-client');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);

  const sessionMode = controlledSessionMode ?? snapshot?.sessionMode ?? internalSessionMode;
  const hasExternalFeed = snapshot !== undefined;

  const ringBufferRef = useRef<PacingRingBuffer | null>(null);
  if (!ringBufferRef.current) {
    ringBufferRef.current = createInitialPacingBuffer();
  }
  const activeBuffer = ringBufferRef.current;

  const cycleSessionMode = () => {
    const nextMode: NetworkSessionMode =
      sessionMode === 'online-client'
        ? 'online-host'
        : sessionMode === 'online-host'
        ? 'single-player'
        : 'online-client';
    if (controlledSessionMode === undefined && snapshot?.sessionMode === undefined) {
      setInternalSessionMode(nextMode);
    }
  };

  // Push incoming snapshot into internal PacingRingBuffer
  useEffect(() => {
    if (!snapshot || isPaused || isFrozen) return;
    if (
      snapshot.rttMs !== undefined ||
      snapshot.leadTicks !== undefined ||
      snapshot.physicsRateHz !== undefined
    ) {
      const rtt = snapshot.rttMs ?? 18.4;
      const eff = snapshot.leadTicks ?? 2.0;
      const tgt = snapshot.targetBuffer ?? 2.0;
      const srv = snapshot.serverBuffer ?? eff;
      const rate = snapshot.physicsRateHz ?? 120.0;
      activeBuffer.push({
        rawRttMs: rtt,
        serverBuffer: srv,
        effectiveBuffer: eff,
        targetBuffer: tgt,
        physicsRateHz: rate,
        eventFlags: snapshot.eventFlags ?? 0,
      });
    }
  }, [snapshot, isPaused, isFrozen, activeBuffer]);

  useEffect(() => {
    if (isPaused || isFrozen || sessionMode === 'single-player' || hasExternalFeed) return;
    let phase = 0;
    const timer = window.setInterval(() => {
      phase += 0.12;
      const rawRtt = 18.4 + Math.sin(phase) * 1.4 + (Math.random() - 0.5) * 0.9;
      const tgt = 2.0;
      const srv = 2.0 + Math.cos(phase * 0.7) * 0.45 + (Math.random() - 0.5) * 0.2;
      const eff = srv * 0.9 + 0.2;
      const rate = 120 - (eff - tgt) * 0.35;
      activeBuffer.push({
        rawRttMs: rawRtt,
        serverBuffer: srv,
        effectiveBuffer: eff,
        targetBuffer: tgt,
        physicsRateHz: rate,
        eventFlags: 0,
      });
    }, 60);
    return () => window.clearInterval(timer);
  }, [isPaused, isFrozen, sessionMode, hasExternalFeed, activeBuffer]);

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const handleFreezeChange = (nextFrozen: boolean) => {
    setIsFrozen(nextFrozen);
  };

  const handleExportLog = () => {
    if (hasHostRuntime) {
      try {
        downloadNetworkTelemetryZip();
      } catch (err: unknown) {
        console.error('[NetworkDiagnostics] Export failed:', err);
      }
    }
    quickNotification.success('Exported Network Monitor log.');
  };

  const handleClearOrReset = () => {
    activeBuffer.clear();
    if (!hasExternalFeed) {
      const fresh = createInitialPacingBuffer();
      for (let i = 0; i < fresh.count; i++) {
        const p = fresh.physicalIndex(i);
        activeBuffer.push({
          rawRttMs: fresh.rawRttMs[p],
          serverBuffer: fresh.serverBuffer[p],
          effectiveBuffer: fresh.effectiveBuffer[p],
          targetBuffer: fresh.targetBuffer[p],
          physicsRateHz: fresh.physicsRateHz[p],
          eventFlags: fresh.eventFlags[p],
        });
      }
    }
    if (hasHostRuntime) {
      globalPacingTelemetryRecorder.reset();
    }
    quickNotification.info('Cleared network monitor oscilloscope history.');
  };

  const isSinglePlayer = sessionMode === 'single-player';
  const statusLabel =
    sessionMode === 'online-client'
      ? 'Online as Client'
      : sessionMode === 'online-host'
      ? 'Online as Host'
      : 'Single Player Mode';

  const rttDisplay =
    snapshot?.rttMs !== undefined
      ? `${snapshot.rttMs.toFixed(1)} ms`
      : isSinglePlayer || sessionMode === 'online-host'
      ? '0.0 ms'
      : '18.4 ms';
  const jitterDisplay =
    snapshot?.jitterMs !== undefined
      ? `${snapshot.jitterMs.toFixed(1)} ms`
      : isSinglePlayer || sessionMode === 'online-host'
      ? '0.0 ms'
      : '1.2 ms';
  const leadTicksVal =
    snapshot?.leadTicks !== undefined
      ? snapshot.leadTicks
      : isSinglePlayer || sessionMode === 'online-host'
      ? 0.0
      : 2.0;
  const leadTicksDisplay =
    leadTicksVal > 0
      ? `+${leadTicksVal.toFixed(1)} ticks`
      : `${leadTicksVal.toFixed(1)} ticks`;
  const leadMsVal =
    snapshot?.leadMs !== undefined
      ? snapshot.leadMs
      : isSinglePlayer || sessionMode === 'online-host'
      ? 0.0
      : Number((leadTicksVal * (1000 / 120)).toFixed(1));
  const leadMsDisplay =
    leadMsVal > 0 ? `+${leadMsVal.toFixed(1)} ms` : `${leadMsVal.toFixed(1)} ms`;
  const physicsRateVal = snapshot?.physicsRateHz ?? 120.0;
  const physicsScaleVal =
    snapshot?.physicsScalePct ?? Number((((physicsRateVal - 120) / 120) * 100).toFixed(2));
  const physicsScaleDisplay =
    physicsScaleVal >= 0
      ? `+${physicsScaleVal.toFixed(2)}%`
      : `${physicsScaleVal.toFixed(2)}%`;
  const rollbackDisplay =
    snapshot?.rollbackCount !== undefined
      ? String(snapshot.rollbackCount)
      : isSinglePlayer
      ? '0'
      : '2';

  return (
    <div className="p-3.5 flex flex-col gap-3 text-xs select-none">
      {/* 1. Top Status Bar: Left Mode Badge (Green Online as Host/Client or Yellow Single Player Mode) + Right Pause & Export Log */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={cycleSessionMode}
          title="Click to cycle preview state: Online as Client / Online as Host / Single Player Mode"
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold cursor-pointer transition-colors ${
            isSinglePlayer
              ? isLight
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : isLight
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
          }`}
        >
          {isSinglePlayer ? (
            <User className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          ) : (
            <Wifi className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          )}
          <span>{statusLabel}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTogglePause}
            isLight={isLight}
          >
            {isPaused ? (
              <>
                <Play className="h-3.5 w-3.5 mr-1 inline" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5 mr-1 inline" />
                Pause
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleExportLog}
            isLight={isLight}
          >
            <Download className="h-3.5 w-3.5 mr-1 inline" />
            Export Log
          </Button>
        </div>
      </div>

      {/* 2. Four Telemetry Cards: RTT, Lead Ticks, Physics Rate, Rollback */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* Card 1: RTT + Jitter */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            RTT
          </span>
          <span className="text-sm font-mono font-bold text-emerald-500 tabular-nums">
            {rttDisplay}
          </span>
          <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
            Jitter: {jitterDisplay}
          </span>
        </div>

        {/* Card 2: Lead Ticks + ms subtext */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Lead Ticks
          </span>
          <span className="text-sm font-mono font-bold text-sky-400 tabular-nums">
            {leadTicksDisplay}
          </span>
          <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
            {leadMsDisplay}
          </span>
        </div>

        {/* Card 3: Physics Rate + Scale (+0.00%) */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Physics Rate
          </span>
          <span className="text-sm font-mono font-bold text-amber-500 tabular-nums">
            {physicsRateVal.toFixed(1)} Hz
          </span>
          <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
            Scale: {physicsScaleDisplay}
          </span>
        </div>

        {/* Card 4: Rollback + in last 10s */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Rollback
          </span>
          <span className="text-sm font-mono font-bold text-violet-400 tabular-nums">
            {rollbackDisplay}
          </span>
          <span className="text-[10px] font-mono text-neutral-400">in last 10s</span>
        </div>
      </div>

      {/* 3. L5 PacingOscilloscopeChart (Headerless embedded mode + Freeze & Clear/Reset Controls) */}
      <PacingOscilloscopeChart
        variant="embedded"
        ringBuffer={activeBuffer}
        height={196}
        deadbandOffsets={[-1.5, 1.5]}
        autoSimulate={false}
        showHeader={false}
        showPaneLabels={false}
        showInjectStarvation={false}
        isFrozen={isFrozen}
        onFreezeToggle={handleFreezeChange}
        onClear={handleClearOrReset}
        isLight={isLight}
      />
    </div>
  );
});
NetworkMonitorFloatingWindow.displayName = 'NetworkMonitorFloatingWindow';
export default NetworkMonitorFloatingWindow;
