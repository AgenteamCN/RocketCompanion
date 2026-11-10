import React, { useState, useEffect } from 'react';
import { Router, Wifi, Copy, Check, ShieldAlert, Orbit, Ghost } from 'lucide-react';
import { useNetworkDiagnosticsData, networkDiagnosticsStore, ZERO_G_ANCHOR_MODES } from '../../stores/networkDiagnosticsStore';
import { CONNECTION_HEALTH_STATES } from '../../config/networkStressConfig';
import { NetworkStressControlsSection } from './network-stress-injection/NetworkStressControlsSection';
import { useAppStore } from '../../stores/appStore';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'network-stress-injection',
  title: 'Network Stress Injection',
  subtitle: 'NetworkLab',
  description:
    'Asymmetric uplink/downlink delay, jitter, packet loss & burst drop injection + 2-Car 0G probes.',
  icon: 'Wifi',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 480,
    height: 520,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface NetworkStressInjectionFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

const OBSERVATION_TARGETS = [
  { idx: 0, label: 'Car 0 (Host)' },
  { idx: 6, label: 'Car 7 (Boost Z)' },
  { idx: 7, label: 'Car 8 (QE Roll)' },
];

export const NetworkStressInjectionFloatingWindow: React.FC<NetworkStressInjectionFloatingWindowProps> = ({
  isLight = false,
}) => {
  const { metrics } = useNetworkDiagnosticsData();
  const [copied, setCopied] = useState(false);

  if (metrics.rttMs !== undefined && !Number.isFinite(metrics.rttMs)) {
    throw new Error(`[NetworkStressInjectionFloatingWindow] Non-finite metrics.rttMs encountered: ${metrics.rttMs}`);
  }
  if (metrics.serverTick !== undefined && !Number.isFinite(metrics.serverTick)) {
    throw new Error(`[NetworkStressInjectionFloatingWindow] Non-finite metrics.serverTick encountered: ${metrics.serverTick}`);
  }
  if (metrics.clientTick !== undefined && !Number.isFinite(metrics.clientTick)) {
    throw new Error(`[NetworkStressInjectionFloatingWindow] Non-finite metrics.clientTick encountered: ${metrics.clientTick}`);
  }
  if (metrics.deltaTicks !== undefined && !Number.isFinite(metrics.deltaTicks)) {
    throw new Error(`[NetworkStressInjectionFloatingWindow] Non-finite metrics.deltaTicks encountered: ${metrics.deltaTicks}`);
  }

  useEffect(() => {
    useAppStore.getState().bridge.onEnsureNetworkDiagnostics?.();
  }, []);

  const handleCopyJSON = async () => {
    try {
      const dump = networkDiagnosticsStore.getDiagnosticDump();
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('[NetworkStressInjectionFloatingWindow] Failed to copy to clipboard', e);
    }
  };

  const isStale = metrics.healthState === CONNECTION_HEALTH_STATES.STALE_NEUTRAL;
  const isDisconnected = metrics.healthState === CONNECTION_HEALTH_STATES.DISCONNECTED;

  return (
    <div className="flex flex-col gap-2 h-full select-none text-xs overflow-y-auto pr-0.5">
      {/* 1. Network Status, Quality Grade & Disconnect Health Header */}
      <div
        className={`p-2 rounded-xl border flex items-center justify-between font-mono transition-colors ${
          isDisconnected
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            : isStale
            ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            : metrics.connected
            ? isLight
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
            : isLight
            ? 'bg-neutral-100 border-neutral-300 text-neutral-800'
            : 'bg-neutral-850 border-neutral-700 text-neutral-300'
        }`}
      >
        <div className="flex items-center gap-2">
          {isDisconnected || isStale ? (
            <ShieldAlert className={`h-4 w-4 shrink-0 ${isDisconnected ? 'text-rose-400' : 'text-amber-400'}`} />
          ) : metrics.connected ? (
            <Wifi className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <Router className="h-4 w-4 text-neutral-400 shrink-0" />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[11px] uppercase tracking-wide">
                {isDisconnected
                  ? 'DISCONNECTED (>30S EVICTED)'
                  : isStale
                  ? 'STALE INPUT (>1S NEUTRAL FALLBACK)'
                  : metrics.connected
                  ? 'ACTIVE SESSION HEALTHY'
                  : 'LOCAL LOOPBACK REPLICATION'}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                  metrics.qualityGrade === 'A' || metrics.qualityGrade === 'B'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : metrics.qualityGrade === 'C'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                }`}
              >
                Grade {metrics.qualityGrade} ({metrics.qualityScore})
              </span>
            </div>
            <span className="text-[10px] opacity-75">
              Packet Age: {metrics.packetAgeMs}ms | Jitter: {metrics.jitterMs.toFixed(0)}ms | {metrics.reportRates}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyJSON}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
            copied
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : isLight
              ? 'hover:bg-neutral-200 border-neutral-300 text-neutral-700'
              : 'hover:bg-neutral-800 border-neutral-700 text-neutral-300'
          }`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? 'Copied' : 'Dump JSON'}</span>
        </button>
      </div>

      {/* 2. Key Metrics Grid: RTT + Uplink/Downlink, Lead Ticks, Corrections */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className={`p-1.5 rounded-xl border flex flex-col ${isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'}`}>
          <span className="text-[10px] text-neutral-400 font-mono">RTT (↑Up / ↓Down)</span>
          <span className={`text-xs font-mono font-bold ${metrics.rttMs > 100 ? 'text-rose-400' : metrics.rttMs > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {metrics.rttMs.toFixed(0)}ms (↑{metrics.uplinkMs}/{metrics.downlinkMs}↓)
          </span>
        </div>

        <div className={`p-1.5 rounded-xl border flex flex-col ${isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'}`}>
          <span className="text-[10px] text-neutral-400 font-mono">Lead / Buffer</span>
          <span className="text-xs font-mono font-bold text-sky-400">
            +{metrics.clientLeadTicks}t / {metrics.inputBufferDepth}p
          </span>
        </div>

        <div className={`p-1.5 rounded-xl border flex flex-col ${isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'}`}>
          <span className="text-[10px] text-neutral-400 font-mono">Fixes / Error</span>
          <span className="text-xs font-mono font-bold text-violet-400">
            {metrics.corrections} ({metrics.lastErrorUu.toFixed(1)} UU)
          </span>
        </div>
      </div>

      {/* 3. In-Arena 2-Car Prediction Probe Lab & Lobby Ghost Controls */}
      <div
        className={`p-2 rounded-xl border font-mono text-[11px] flex flex-col gap-1.5 ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-850/80 border-neutral-700/80'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Orbit className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[10px] text-cyan-300 uppercase tracking-wider font-bold">
              In-Arena 2-Car Prediction Probe Lab (X=-2500, Z=500→600)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => networkDiagnosticsStore.toggleTestCarAudio()}
              className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer transition-colors ${
                metrics.testCarAudioEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              <span>Test Audio: {metrics.testCarAudioEnabled ? 'ON' : 'MUTED'}</span>
            </button>
            <button
              type="button"
              onClick={() => networkDiagnosticsStore.setLobbyGhostMode(!metrics.lobbyGhostMode)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer transition-colors ${
                metrics.lobbyGhostMode
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              <Ghost className="h-3 w-3" />
              <span>Ghost Car: {metrics.lobbyGhostMode ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => networkDiagnosticsStore.toggleZeroGFleet()}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition-colors ${
                metrics.zeroGFleetEnabled
                  ? 'bg-cyan-500 text-black border-cyan-400'
                  : 'bg-neutral-800 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/20'
              }`}
            >
              {metrics.zeroGFleetEnabled ? 'Probes: ACTIVE' : 'Spawn 2-Car Probes'}
            </button>
          </div>
        </div>

        {/* Anchor Mode & Camera Observation Target */}
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-neutral-400">Anchor:</span>
            {[
              { id: ZERO_G_ANCHOR_MODES.Z_HOVER, label: 'Gravity Loop (500→600)' },
              { id: ZERO_G_ANCHOR_MODES.ZERO_G_LOCKED, label: '0G Attitude (0,0,0)' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => networkDiagnosticsStore.setZeroGAnchorMode(mode.id)}
                className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                  metrics.zeroGAnchorMode === mode.id
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="text-neutral-400">Observe:</span>
            {OBSERVATION_TARGETS.map((t) => (
              <button
                key={t.idx}
                type="button"
                onClick={() => networkDiagnosticsStore.setObservationTarget(t.idx)}
                className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                  metrics.observationTarget === t.idx
                    ? 'bg-sky-500 text-black font-bold border-sky-400'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                {t.idx === 0 ? 'Player' : `C${t.idx}`}
              </button>
            ))}
          </div>
        </div>

        {/* Live Telemetry Cards for the 2 Externalized Benchmark Probes */}
        {metrics.zeroGFleetEnabled && metrics.probeTelemetry.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            {metrics.probeTelemetry.map((probe) => (
              <div
                key={probe.carIndex}
                className="p-1.5 rounded-lg border border-neutral-700/70 bg-neutral-900/50 flex flex-col gap-0.5 text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-300">
                    C{probe.carIndex}: {probe.profile === 'boost_pulse' ? 'Boost Step (Z)' : 'QE Roll (3s)'}
                  </span>
                  {probe.isBoosting && (
                    <span className="px-1 rounded bg-amber-500/20 text-amber-300 font-bold">BOOST</span>
                  )}
                </div>
                <span className="text-neutral-300">ω: {probe.angSpeedRad.toFixed(2)} rad/s</span>
                <span className="text-neutral-400">Z: {probe.pos[2]} | Δ: {probe.posDriftUu.toFixed(1)} UU</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Authoritative Tick Synchronization */}
      <div
        className={`p-2 rounded-xl border font-mono text-[11px] grid grid-cols-3 gap-x-3 gap-y-1 ${
          isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-850/80 border-neutral-700/80'
        }`}
      >
        <div className="flex justify-between">
          <span className="text-neutral-400">Server:</span>
          <span className="text-sky-300 font-bold">#{metrics.serverTick}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Client:</span>
          <span className="text-emerald-300 font-bold">#{metrics.clientTick}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">Peak Err:</span>
          <span className="text-amber-300 font-bold">{metrics.maxErrorUu.toFixed(1)} UU</span>
        </div>
      </div>

      {/* 5. Network Stress Injection Presets & Controls */}
      <NetworkStressControlsSection isLight={isLight} />
    </div>
  );
};
